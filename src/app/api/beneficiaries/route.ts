import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, mapDoc, recordActivityLog } from '@/lib/mongodb';
import {
  cleanTcNo,
  normalizeAddress,
  cleanPhone,
  cleanTurkishText,
  turkishIncludes,
  extractPhoneNumbers,
  detectSettlement,
  extractStreetAndDoor,
  cleanHaneKey,
} from '@/lib/normalizer';
import {
  hashTc,
  hashHane,
  hashAddress,
  encryptBeneficiary,
} from '@/lib/crypto';

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
      const tcHash = hashTc(cleanedTargetTc);

      // Search by blind index hash or plaintext fallback
      const rawPerson = await benCol.findOne({
        $or: [
          ...(tcHash ? [{ tc_hash: tcHash }] : []),
          { tc_no: cleanedTargetTc },
        ],
      });

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
      const normHash = hashAddress(person.norm_adres);
      const haneHash = person.hane_no ? hashHane(person.hane_no) : null;

      const householdOrList: any[] = [];
      if (normHash) householdOrList.push({ adres_hash: normHash });
      if (person.norm_adres) householdOrList.push({ norm_adres: person.norm_adres });
      if (haneHash) householdOrList.push({ hane_hash: haneHash });
      if (person.hane_no) householdOrList.push({ hane_no: person.hane_no });

      const householdFilter: any = {
        $and: [
          { _id: { $ne: rawPerson._id } },
          ...(tcHash ? [{ tc_hash: { $ne: tcHash } }] : []),
          { $or: householdOrList },
        ],
      };

      const rawMembers = await benCol
        .find(householdFilter)
        .toArray();

      const householdMembers = mapDocs(rawMembers)
        .filter((m: any) => m.id !== person.id && m.tc_no !== person.tc_no)
        .sort((a: any, b: any) => (a.ad_soyad || '').localeCompare(b.ad_soyad || '', 'tr'))
        .map((m: any) => {
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

    let records: any[] = [];
    let total = 0;

    if (!q) {
      // Direct fast MongoDB query with sorting and pagination
      total = await benCol.countDocuments(filter);
      const rawRecords = await benCol
        .find(filter)
        .sort({ mahalle: 1, ek_liste_no: 1, mahalle_sira: 1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      records = mapDocs(rawRecords).map((r: any) => {
        r.hedef_torba = r.hedef_torba || 34;
        r.kalan_torba = Math.max(0, r.hedef_torba - (r.torba_sayisi || 0));
        return r;
      });
    } else {
      // Encrypted field search:
      // If q is an 11-digit TC, we can directly blind-index query in MongoDB
      const cleanedTcQuery = cleanTcNo(q);
      if (cleanedTcQuery && cleanedTcQuery.length === 11) {
        const tcHash = hashTc(cleanedTcQuery);
        filter.$or = [
          ...(tcHash ? [{ tc_hash: tcHash }] : []),
          { tc_no: cleanedTcQuery },
        ];
        total = await benCol.countDocuments(filter);
        const rawRecords = await benCol.find(filter).toArray();
        records = mapDocs(rawRecords).map((r: any) => {
          r.hedef_torba = r.hedef_torba || 34;
          r.kalan_torba = Math.max(0, r.hedef_torba - (r.torba_sayisi || 0));
          return r;
        });
      } else {
        // Text / partial search (names, streets, partial TCs, phones):
        // Query candidates by non-PII filters (mahalle, durum) from MongoDB,
        // transparently decrypt, and apply Turkish-aware memory search.
        const rawCandidates = await benCol.find(filter).toArray();
        const decryptedCandidates = mapDocs(rawCandidates);

        const qClean = cleanTurkishText(q);
        const qDigits = q.replace(/\D/g, '');

        const filtered = decryptedCandidates.filter((r: any) => {
          if (qClean && turkishIncludes(r.ad_soyad || '', qClean)) return true;
          if (qClean && turkishIncludes(r.acik_adres || '', qClean)) return true;
          if (qClean && turkishIncludes(r.mahalle || '', qClean)) return true;
          if (qClean && turkishIncludes(r.sokak || '', qClean)) return true;
          if (qClean && r.hane_no && turkishIncludes(String(r.hane_no), qClean)) return true;
          if (qDigits && qDigits.length >= 3) {
            if (r.tc_no && String(r.tc_no).includes(qDigits)) return true;
            if (r.telefon && String(r.telefon).includes(qDigits)) return true;
            if (r.telefon2 && String(r.telefon2).includes(qDigits)) return true;
          }
          return false;
        });

        total = filtered.length;
        records = filtered.slice(skip, skip + limit).map((r: any) => {
          r.hedef_torba = r.hedef_torba || 34;
          r.kalan_torba = Math.max(0, r.hedef_torba - (r.torba_sayisi || 0));
          return r;
        });
      }
    }

    // Aggregated list of neighborhoods/villages with distribution metrics
    const allBeneficiariesRaw = await benCol.find({}).toArray();
    const allBeneficiaries = mapDocs(allBeneficiariesRaw);

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
      .sort({ mahalle: 1 })
      .toArray();

    const mappedEksik = mapDocs(rawEksik).map((m: any) => {
      m.hedef_torba = m.hedef_torba || 34;
      m.kalan_torba = Math.max(0, m.hedef_torba - (m.torba_sayisi || 0));
      m.uyari_tipi = 'EKSIK_TESLIMAT';
      return m;
    });

    // İmzası alınmış fakat kömürü henüz teslim edilmemiş haneler
    const rawImzali = await benCol
      .find({
        imza_durumu: 'IMZALANDI',
        teslimat_durumu: { $nin: ['TAMAMLANDI', 'TESLIM_EDILDI', 'EKSIK'] },
      })
      .sort({ mahalle: 1 })
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

    // Check duplicate TC with blind index
    const tcHash = hashTc(cleanedTc);
    const existingTc = await benCol.findOne({
      $or: [
        ...(tcHash ? [{ tc_hash: tcHash }] : []),
        { tc_no: cleanedTc },
      ],
    });
    if (existingTc) {
      const decTc = mapDoc(existingTc);
      return NextResponse.json(
        {
          success: false,
          error: `Bu TC Kimlik Numarası zaten kayıtlı: ${decTc.ad_soyad}`,
        },
        { status: 400 }
      );
    }

    const normAdres = normalizeAddress(mahalle, acik_adres, hane_no);
    const normHash = hashAddress(normAdres);
    const haneHash = hane_no ? hashHane(hane_no) : null;

    // Check duplicate household with blind index
    const haneOrList: any[] = [];
    if (normHash) haneOrList.push({ adres_hash: normHash });
    if (normAdres) haneOrList.push({ norm_adres: normAdres });
    if (haneHash) haneOrList.push({ hane_hash: haneHash });
    if (hane_no) haneOrList.push({ hane_no: hane_no.trim() });

    const existingHane = await benCol.findOne({ $or: haneOrList });
    if (existingHane) {
      const decHane = mapDoc(existingHane);
      return NextResponse.json(
        {
          success: false,
          error: `Bu adreste/hanede zaten kayıt bulunmaktadır! Kayıtlı Kişi: ${decHane.ad_soyad} (TC: ${decHane.tc_no})`,
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

    // Encrypt with AES-256-GCM and generate blind indexes
    const encryptedDoc = encryptBeneficiary(newDoc);
    const res = await benCol.insertOne(encryptedDoc);
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
        adres: newDoc.acik_adres,
      },
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
