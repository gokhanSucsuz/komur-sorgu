import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, mapDoc, recordActivityLog } from '@/lib/mongodb';
import { cleanTcNo, normalizeAddress, cleanPhone, cleanTurkishText, buildTurkishSearchFilter, extractPhoneNumbers, detectSettlement, extractStreetAndDoor } from '@/lib/normalizer';

export async function GET(request: NextRequest) {
  try {
    const { beneficiaries: benCol, systemSettings } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const q = (searchParams.get('q') || '').trim();
    const mahalle = (searchParams.get('mahalle') || '').trim();
    const durum = (searchParams.get('durum') || '').trim();
    const targetTc = (searchParams.get('targetTc') || '').trim();
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '500', 10);
    const skip = (page - 1) * limit;

    // Special Query: If looking up a specific TC to show person AND household relatives
    if (targetTc) {
      const cleanedTargetTc = cleanTcNo(targetTc);
      const rawPerson = await benCol.findOne({ tc_no: cleanedTargetTc });

      if (!rawPerson) {
        return NextResponse.json({
          success: true,
          found: false,
          person: null,
          householdMembers: [],
        });
      }

      const person = mapDoc(rawPerson);
      person.hedef_torba = person.hedef_torba || 34;
      person.kalan_torba = Math.max(0, person.hedef_torba - (person.torba_sayisi || 0));

      // Find other people at the exact same normalized address or household
      const householdFilter: any = {
        tc_no: { $ne: person.tc_no },
        $or: [
          { norm_adres: person.norm_adres },
          ...(person.hane_no ? [{ hane_no: person.hane_no }] : []),
        ],
      };

      const rawMembers = await benCol
        .find(householdFilter)
        .sort({ ad_soyad: 1 })
        .toArray();

      const householdMembers = mapDocs(rawMembers).map((m: any) => {
        m.hedef_torba = m.hedef_torba || 34;
        m.kalan_torba = Math.max(0, m.hedef_torba - (m.torba_sayisi || 0));
        return m;
      });

      return NextResponse.json({
        success: true,
        found: true,
        person,
        householdMembers,
      });
    }

    // General List & Search
    const filter: any = {};

    if (q) {
      const searchFilter = buildTurkishSearchFilter(q, [
        'tc_no',
        'ad_soyad',
        'telefon',
        'telefon2',
        'acik_adres',
        'mahalle',
        'hane_no',
        'sokak',
      ]);
      if (searchFilter.$and) {
        filter.$and = searchFilter.$and;
      } else if (searchFilter.$or) {
        filter.$or = searchFilter.$or;
      }
    }

    // Support multiple neighborhoods e.g. "mahalleler=Cumhuriyet Mah.,İstiklal Mah." or single "mahalle"
    const rawMahalleler = searchParams.get('mahalleler') || mahalle;
    if (rawMahalleler && rawMahalleler !== 'HEPSI') {
      const mahalleList = rawMahalleler
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
      if (mahalleList.length === 1) {
        filter.mahalle = mahalleList[0];
      } else if (mahalleList.length > 1) {
        filter.mahalle = { $in: mahalleList };
      }
    }

    if (durum && durum !== 'HEPSI') {
      if (durum === 'DAGITILACAK') {
        // Pending or Incomplete only (NOT completed)
        filter.teslimat_durumu = { $in: ['BEKLIYOR', 'EKSIK', null] };
      } else if (durum === 'TAMAMLANDI') {
        filter.teslimat_durumu = { $in: ['TAMAMLANDI', 'TESLIM_EDILDI'] };
      } else if (durum === 'EKSIK') {
        filter.teslimat_durumu = 'EKSIK';
      } else if (durum === 'BEKLIYOR') {
        filter.teslimat_durumu = { $in: ['BEKLIYOR', null] };
      } else {
        filter.teslimat_durumu = durum;
      }
    }

    const total = await benCol.countDocuments(filter);

    const rawRecords = await benCol
      .find(filter)
      .sort({ mahalle: 1, ek_liste_no: 1, mahalle_sira: 1, ad_soyad: 1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const records = mapDocs(rawRecords).map((r: any) => {
      r.hedef_torba = r.hedef_torba || 34;
      r.kalan_torba = Math.max(0, r.hedef_torba - (r.torba_sayisi || 0));
      return r;
    });

    // Aggregated list of neighborhoods/villages with distribution metrics
    const allBeneficiaries = await benCol.find({}).toArray();
    const mahalleMap = new Map<string, {
      mahalle: string;
      kisi_sayisi: number;
      tamamlanan: number;
      eksik: number;
      bekleyen: number;
      tip: 'MAHALLE' | 'KOY';
    }>();

    for (const b of allBeneficiaries) {
      const m = b.mahalle || 'Belirtilmemiş';
      const tip = b.yerlesim_tipi || (/(?:Köyü|Koy|Koyu)$/i.test(m) ? 'KOY' : 'MAHALLE');
      if (!mahalleMap.has(m)) {
        mahalleMap.set(m, { mahalle: m, kisi_sayisi: 0, tamamlanan: 0, eksik: 0, bekleyen: 0, tip });
      }
      const item = mahalleMap.get(m)!;
      item.kisi_sayisi += 1;
      const d = b.teslimat_durumu;
      if (d === 'TAMAMLANDI' || d === 'TESLIM_EDILDI') {
        item.tamamlanan += 1;
      } else if (d === 'EKSIK') {
        item.eksik += 1;
      } else {
        item.bekleyen += 1;
      }
    }

    const mahalleler = Array.from(mahalleMap.values()).sort((a, b) =>
      a.mahalle.localeCompare(b.mahalle, 'tr', { sensitivity: 'base' })
    );

    // Incomplete & Signed-Undelivered Households for Morning Alert Banner
    const rawEksik = await benCol
      .find({ teslimat_durumu: 'EKSIK' })
      .sort({ mahalle: 1, ad_soyad: 1 })
      .toArray();

    const mappedEksik = mapDocs(rawEksik).map((m: any) => {
      m.hedef_torba = m.hedef_torba || 34;
      m.kalan_torba = Math.max(0, m.hedef_torba - (m.torba_sayisi || 0));
      m.uyari_tipi = 'EKSIK_TESLIMAT';
      return m;
    });

    // İmzası alınmış fakat kömürü henüz teslim edilmemiş (veya aynı gün teslim edilememiş) haneler
    const rawImzali = await benCol
      .find({
        imza_durumu: 'IMZALANDI',
        teslimat_durumu: { $nin: ['TAMAMLANDI', 'TESLIM_EDILDI', 'EKSIK'] }
      })
      .sort({ mahalle: 1, ad_soyad: 1 })
      .toArray();

    const mappedImzali = mapDocs(rawImzali).map((m: any) => {
      m.hedef_torba = m.hedef_torba || 34;
      m.kalan_torba = m.hedef_torba;
      m.uyari_tipi = 'IMZALI_TESLIM_BEKLIYOR';
      return m;
    });

    const eksikHaneler = [...mappedEksik, ...mappedImzali];

    return NextResponse.json({
      success: true,
      data: records,
      total,
      page,
      limit,
      mahalleler,
      eksikHaneler,
      eksikSayisi: mappedEksik.length,
      imzaliBekleyenSayisi: mappedImzali.length,
      toplamUyariSayisi: eksikHaneler.length,
    });
  } catch (error: any) {
    console.error('Error fetching beneficiaries:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { beneficiaries: benCol, systemSettings } = await getDbCollections();
    const body = await request.json();
    const { tc_no, ad_soyad, telefon, telefon2, mahalle, acik_adres, hane_no, hedef_torba } = body;

    const cleanedTc = cleanTcNo(tc_no);
    if (!cleanedTc || cleanedTc.length !== 11) {
      return NextResponse.json({ success: false, error: 'Geçersiz TC Kimlik Numarası (11 hane olmalı)' }, { status: 400 });
    }

    if (!ad_soyad || !mahalle || !acik_adres) {
      return NextResponse.json({ success: false, error: 'Ad Soyad, Mahalle ve Açık Adres zorunludur' }, { status: 400 });
    }

    // Check duplicate TC
    const existingTc = await benCol.findOne({ tc_no: cleanedTc });
    if (existingTc) {
      return NextResponse.json(
        {
          success: false,
          error: `Bu TC Kimlik Numarası zaten kayıtlı: ${existingTc.ad_soyad}`,
        },
        { status: 400 }
      );
    }

    const normAdres = normalizeAddress(mahalle, acik_adres, hane_no);

    // Check duplicate household
    const haneFilter: any = {
      $or: [
        { norm_adres: normAdres },
        ...(hane_no ? [{ hane_no: hane_no.trim() }] : []),
      ],
    };
    const existingHane = await benCol.findOne(haneFilter);
    if (existingHane) {
      return NextResponse.json(
        {
          success: false,
          error: `Bu adreste/hanede zaten kayıt bulunmaktadır! Kayıtlı Kişi: ${existingHane.ad_soyad} (TC: ${existingHane.tc_no})`,
        },
        { status: 400 }
      );
    }

    const phones = extractPhoneNumbers(telefon, telefon2);
    const settlement = detectSettlement(mahalle, body.koy, acik_adres);
    const streetInfo = extractStreetAndDoor(acik_adres, body.sokak, hane_no, settlement.name);

    // Default target quota from settings
    const settingDoc = await systemSettings.findOne({ key: 'varsayilan_hedef_torba' });
    const targetQuota = parseInt(hedef_torba || settingDoc?.value || '34', 10);
    const nowStr = new Date().toLocaleString('tr-TR');

    const newDoc = {
      tc_no: cleanedTc,
      ad_soyad: ad_soyad.trim(),
      telefon: phones[0] || '',
      telefon2: phones[1] || '',
      mahalle: settlement.name,
      yerlesim_tipi: settlement.type,
      sokak: streetInfo.sokak,
      kapi_no: streetInfo.kapiNo,
      daire_no: streetInfo.daireNo,
      acik_adres: acik_adres.trim(),
      hane_no: hane_no ? hane_no.trim() : null,
      norm_adres: normAdres,
      hedef_torba: targetQuota,
      teslimat_durumu: 'BEKLIYOR',
      torba_sayisi: 0,
      teslimat_tarihi: null,
      teslim_alan: null,
      teslim_eden_personel: null,
      teslimat_notu: null,
      created_at: nowStr,
      updated_at: nowStr,
    };

    const res = await benCol.insertOne(newDoc);
    const newId = res.insertedId ? res.insertedId.toString() : '';

    await recordActivityLog({
      islem_tipi: 'HANE_EKLEME',
      kullanici_adi: body.created_by || 'Sistem Yöneticisi',
      baslik: `Yeni Hane Eklendi (${newDoc.ad_soyad})`,
      detay: `Yeni vatandaş/hane sisteme kaydedildi: ${newDoc.ad_soyad} (${newDoc.mahalle}) - TC: ${newDoc.tc_no}, Hedef: ${targetQuota} Torba`,
      hedef_kisi: newDoc.ad_soyad,
      hedef_tc: newDoc.tc_no,
      mahalle: newDoc.mahalle,
      torba_sayisi: targetQuota,
      ek_bilgi: {
        id: newId,
        adres: newDoc.acik_adres
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Kayıt başarıyla eklendi',
      id: newId,
    });
  } catch (error: any) {
    console.error('Error creating beneficiary:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
