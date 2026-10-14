import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, mapDoc } from '@/lib/mongodb';
import { cleanTcNo, normalizeAddress, cleanPhone, cleanTurkishText, buildTurkishSearchFilter } from '@/lib/normalizer';

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
        'acik_adres',
        'mahalle',
        'hane_no',
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
      .sort({ mahalle: 1, ad_soyad: 1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const records = mapDocs(rawRecords).map((r: any) => {
      r.hedef_torba = r.hedef_torba || 34;
      r.kalan_torba = Math.max(0, r.hedef_torba - (r.torba_sayisi || 0));
      return r;
    });

    // Aggregated list of neighborhoods with distribution metrics
    const allBeneficiaries = await benCol.find({}).toArray();
    const mahalleMap = new Map<string, { mahalle: string; kisi_sayisi: number; tamamlanan: number; eksik: number; bekleyen: number }>();

    for (const b of allBeneficiaries) {
      const m = b.mahalle || 'Belirtilmemiş';
      if (!mahalleMap.has(m)) {
        mahalleMap.set(m, { mahalle: m, kisi_sayisi: 0, tamamlanan: 0, eksik: 0, bekleyen: 0 });
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

    // Incomplete Households (Eksik Kalanlar) for Morning Alert Banner
    const rawEksik = await benCol
      .find({ teslimat_durumu: 'EKSIK' })
      .sort({ mahalle: 1, ad_soyad: 1 })
      .toArray();

    const eksikHaneler = mapDocs(rawEksik).map((m: any) => {
      m.hedef_torba = m.hedef_torba || 34;
      m.kalan_torba = Math.max(0, m.hedef_torba - (m.torba_sayisi || 0));
      return m;
    });

    return NextResponse.json({
      success: true,
      data: records,
      total,
      page,
      limit,
      mahalleler,
      eksikHaneler,
      eksikSayisi: eksikHaneler.length,
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
    const { tc_no, ad_soyad, telefon, mahalle, acik_adres, hane_no, hedef_torba } = body;

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

    // Default target quota from settings
    const settingDoc = await systemSettings.findOne({ key: 'varsayilan_hedef_torba' });
    const targetQuota = parseInt(hedef_torba || settingDoc?.value || '34', 10);
    const nowStr = new Date().toLocaleString('tr-TR');

    const newDoc = {
      tc_no: cleanedTc,
      ad_soyad: ad_soyad.trim(),
      telefon: cleanPhone(telefon),
      mahalle: mahalle.trim(),
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
