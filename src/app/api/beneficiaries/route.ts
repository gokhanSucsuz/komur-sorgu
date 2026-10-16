import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, buildIdFilter, mapDocs, mapDoc, recordActivityLog, touchSyncPulse } from '@/lib/mongodb';
import {
  cleanTcNo,
  normalizeAddress,
  cleanPhone,
  cleanTurkishText,
  turkishIncludes,
  extractPhoneNumbers,
  detectSettlement,
  extractStreetAndDoor,
  cleanHaneNo,
  cleanHaneKey,
  formatDeliveryStatusSummary,
  isBirebirBeneficiaryMatch
} from '@/lib/normalizer';
import {
  hashTc,
  hashHane,
  hashAddress,
  encryptField,
  encryptBeneficiary,
} from '@/lib/crypto';
import { getIstanbulDate } from '@/lib/dateUtils';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { beneficiaries: benCol, systemSettings } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const q = (searchParams.get('q') || '').trim();
    const mahalle = (searchParams.get('mahalle') || '').trim();
    const durum = (searchParams.get('durum') || '').trim();
    const targetTc = (searchParams.get('targetTc') || '').trim();
    const page = parseInt(searchParams.get('page') || '1', 10);
    const rawLimit = searchParams.get('limit');
    const limit = (rawLimit === '0' || rawLimit === 'ALL' || rawLimit === 'all' || !rawLimit)
      ? 0
      : parseInt(rawLimit, 10);
    const skip = limit > 0 ? (page - 1) * limit : 0;

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
      
      const expandedMahalleList: string[] = [];
      for (const m of mahalleList) {
        if (/100\.\s*Yıl/i.test(m) || /Yıl\s+Mah/i.test(m) || m.toLowerCase() === 'yıl') {
          expandedMahalleList.push('100. Yıl Mah.', '100. Yıl Mahallesi', 'Yıl Mah.', 'Yıl Mahallesi', '100.Yıl Mah.', '100 Yıl Mah.', 'Yıl');
        } else {
          expandedMahalleList.push(m);
        }
      }
      const uniqueMahalleList = Array.from(new Set(expandedMahalleList));
      if (uniqueMahalleList.length === 1) {
        filter.mahalle = uniqueMahalleList[0];
      } else if (uniqueMahalleList.length > 1) {
        filter.mahalle = { $in: uniqueMahalleList };
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
      let query = benCol
        .find(filter)
        .sort({ mahalle: 1, ek_liste_no: 1, mahalle_sira: 1 });
      if (skip > 0) query = query.skip(skip);
      if (limit > 0) query = query.limit(limit);
      const rawRecords = await query.toArray();

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
        // Query candidates by non-PII filters (mahalle, durum) from MongoDB,
        // transparently decrypt, and apply Birebir TC Kimlik No veya Ad Soyad matching.
        // Addresses and phone numbers are excluded from search as requested.
        const rawCandidates = await benCol.find(filter).toArray();
        const decryptedCandidates = mapDocs(rawCandidates);

        const filtered = decryptedCandidates.filter((r: any) => isBirebirBeneficiaryMatch(r, q));

        total = filtered.length;
        const sliced = (limit > 0) ? filtered.slice(skip, skip + limit) : (skip > 0 ? filtered.slice(skip) : filtered);
        records = sliced.map((r: any) => {
          r.hedef_torba = r.hedef_torba || 34;
          r.kalan_torba = Math.max(0, r.hedef_torba - (r.torba_sayisi || 0));
          return r;
        });
      }
    }

    // Aggregated list of neighborhoods/villages with distribution metrics
    const isUnfilteredFullLoad = !q && Object.keys(filter).length === 0 && skip === 0 && limit === 0;
    const sourceForMahalleStats = isUnfilteredFullLoad
      ? records
      : await benCol
          .find({}, { projection: { mahalle: 1, yerlesim_tipi: 1, teslimat_durumu: 1 } })
          .toArray();

    const mahalleMap = new Map<string, {
      mahalle: string;
      kisi_sayisi: number;
      tamamlanan: number;
      eksik: number;
      bekleyen: number;
      tip: 'MAHALLE' | 'KOY';
    }>();

    for (const b of sourceForMahalleStats) {
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
    let mappedEksik: any[] = [];
    let mappedImzali: any[] = [];
    if (isUnfilteredFullLoad) {
      mappedEksik = records
        .filter((r: any) => r.teslimat_durumu === 'EKSIK')
        .map((m: any) => ({
          ...m,
          hedef_torba: m.hedef_torba || 34,
          kalan_torba: Math.max(0, (m.hedef_torba || 34) - (m.torba_sayisi || 0)),
          uyari_tipi: 'EKSIK_TESLIMAT',
        }));

      mappedImzali = records
        .filter(
          (r: any) =>
            r.imza_durumu === 'IMZALANDI' &&
            !['TAMAMLANDI', 'TESLIM_EDILDI', 'EKSIK'].includes(r.teslimat_durumu)
        )
        .map((m: any) => ({
          ...m,
          hedef_torba: m.hedef_torba || 34,
          kalan_torba: m.hedef_torba || 34,
          uyari_tipi: 'IMZALI_TESLIM_BEKLIYOR',
        }));
    } else {
      const rawAlertDocs = await benCol
        .find({
          $or: [
            { teslimat_durumu: 'EKSIK' },
            {
              imza_durumu: 'IMZALANDI',
              teslimat_durumu: { $nin: ['TAMAMLANDI', 'TESLIM_EDILDI', 'EKSIK'] },
            },
          ],
        })
        .sort({ mahalle: 1 })
        .toArray();

      const decryptedAlertDocs = mapDocs(rawAlertDocs);

      for (const m of decryptedAlertDocs) {
        m.hedef_torba = m.hedef_torba || 34;
        if (m.teslimat_durumu === 'EKSIK') {
          m.kalan_torba = Math.max(0, m.hedef_torba - (m.torba_sayisi || 0));
          m.uyari_tipi = 'EKSIK_TESLIMAT';
          mappedEksik.push(m);
        } else {
          m.kalan_torba = m.hedef_torba;
          m.uyari_tipi = 'IMZALI_TESLIM_BEKLIYOR';
          mappedImzali.push(m);
        }
      }
    }
    const eksikHaneler = [...mappedEksik, ...mappedImzali];

    return NextResponse.json({
      success: true,
      data: records,
      total,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 1,
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
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

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

    const cleanedHaneNo = cleanHaneNo(hane_no);
    const cleanHane = cleanHaneKey(cleanedHaneNo);

    // Hane numarası kontrolü: Sistemde TC kimlik gibi yalnızca 1 adet olabilir.
    // İkinci kez girilirse sisteme eklenmez ve detaylı hata gösterilir.
    if (cleanHane) {
      const haneHash = hashHane(cleanHane);
      const existingHaneDoc = await benCol.findOne({
        $or: [
          ...(haneHash ? [{ hane_hash: haneHash }] : []),
          { hane_no: cleanedHaneNo },
          { hane_no: hane_no.trim() },
        ],
      });

      if (existingHaneDoc) {
        const decHane = mapDoc(existingHaneDoc);
        const statusSummary = formatDeliveryStatusSummary(decHane);
        return NextResponse.json(
          {
            success: false,
            error: `Bu Hane Numarası (${cleanedHaneNo}) sistemde zaten kayıtlıdır! Sistemde her hane numarası TC kimlik gibi yalnızca 1 adet bulunabilir. Mevcut Hak Sahibi: ${decHane.ad_soyad} (TC: ${decHane.tc_no || 'Belirtilmemiş'}) | Mahalle: ${decHane.mahalle || '-'}, Adres: ${decHane.acik_adres || '-'} | Kömür Teslim Durumu: ${statusSummary}. Mükerrer kömür yardımı tahsis edilmemesi için bu kayıt sisteme eklenemez.`,
          },
          { status: 400 }
        );
      }
    }

    const settlement = detectSettlement(mahalle, body.koy, acik_adres);
    const streetInfo = extractStreetAndDoor(acik_adres, body.sokak, cleanedHaneNo, settlement.name);
    const normAdres = normalizeAddress(settlement.name, acik_adres);
    const normHash = hashAddress(normAdres);

    let householdWarning: string | null = null;
    if (normHash || normAdres) {
      const addressOrList: any[] = [];
      if (normHash) addressOrList.push({ adres_hash: normHash });
      if (normAdres) addressOrList.push({ norm_adres: normAdres });

      const existingAddressDoc = await benCol.findOne({ $or: addressOrList });
      if (existingAddressDoc) {
        const decAddress = mapDoc(existingAddressDoc);
        const cleanExistingName = cleanTurkishText(decAddress.ad_soyad).replace(/[^a-z0-9]/g, '');
        const cleanNewName = cleanTurkishText(ad_soyad).replace(/[^a-z0-9]/g, '');
        const isSameName = cleanExistingName && cleanNewName && cleanExistingName === cleanNewName;

        householdWarning = isSameName
          ? `Aynı Adreste Aynı İsimli Birey: ${decAddress.ad_soyad} (TC: ${decAddress.tc_no})`
          : `Aynı Adreste Diğer Birey: ${decAddress.ad_soyad} (TC: ${decAddress.tc_no})`;
      }
    }

    const phones = extractPhoneNumbers(telefon, telefon2);

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
      hane_no: cleanedHaneNo || null,
      norm_adres: normAdres,
      hedef_torba: targetQuota,
      teslimat_durumu: 'BEKLIYOR',
      torba_sayisi: 0,
      teslimat_tarihi: null,
      teslim_alan: null,
      teslim_eden_personel: null,
      teslimat_notu: null,
      uyarilar: householdWarning ? [householdWarning] : [],
      uyari_notu: householdWarning,
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

export async function PUT(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { beneficiaries: benCol } = await getDbCollections();
    const body = await request.json();
    const {
      id,
      mahalle,
      acik_adres,
      sokak,
      kapi_no,
      daire_no,
      telefon,
      telefon2,
      hane_no,
      guncelleme_notu,
      updated_by,
    } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Güncellenecek hak sahibi ID bilgisi zorunludur' },
        { status: 400 }
      );
    }

    const rawBeneficiary = await benCol.findOne(buildIdFilter(id));
    if (!rawBeneficiary) {
      return NextResponse.json(
        { success: false, error: 'Hak sahibi sistemde bulunamadı' },
        { status: 404 }
      );
    }

    const existing = mapDoc(rawBeneficiary);
    const { nowLocaleTr } = getIstanbulDate();
    const nowStr = nowLocaleTr;

    // 1. Hane Numarası Kontrolü
    let newCleanHane: string | null = existing.hane_no || null;
    if (hane_no !== undefined) {
      const inputHane = cleanHaneNo(hane_no);
      const cleanHaneKeyVal = cleanHaneKey(inputHane);

      // Eğer mevcut hane numarasından farklı bir hane numarası verilmişse, mükerrerlik kontrolü yap
      const existingCleanKey = cleanHaneKey(existing.hane_no);
      if (cleanHaneKeyVal && cleanHaneKeyVal !== existingCleanKey) {
        const haneHash = hashHane(cleanHaneKeyVal);
        const duplicateHaneDoc = await benCol.findOne({
          $and: [
            {
              $or: [
                ...(haneHash ? [{ hane_hash: haneHash }] : []),
                { hane_no: inputHane },
                { hane_no: String(hane_no).trim() },
              ],
            },
            {
              _id: { $ne: rawBeneficiary._id },
            },
          ],
        });

        if (duplicateHaneDoc) {
          const decDup = mapDoc(duplicateHaneDoc);
          return NextResponse.json(
            {
              success: false,
              error: `Bu Hane Numarası (${inputHane}) sistemde başka bir vatandaşa (${decDup.ad_soyad} - TC: ${decDup.tc_no || 'Belirtilmemiş'}) aittir! Her hane numarası sistemde yalnızca 1 adet olabilir.`,
            },
            { status: 400 }
          );
        }
      }
      newCleanHane = inputHane || null;
    }

    // 2. Adres & Yerleşim Tespiti ve Normalizasyonu
    const newMahalle = mahalle ? mahalle.trim() : existing.mahalle;
    const newAcikAdres = acik_adres ? acik_adres.trim() : existing.acik_adres;
    const settlement = detectSettlement(newMahalle, body.koy, newAcikAdres);
    const streetInfo = extractStreetAndDoor(
      newAcikAdres,
      sokak !== undefined ? sokak : existing.sokak,
      kapi_no !== undefined ? kapi_no : (existing.kapi_no || newCleanHane),
      settlement.name
    );
    const normAdres = normalizeAddress(settlement.name, newAcikAdres);
    const normHash = hashAddress(normAdres);

    // 3. Telefon Numaraları Ayıklama
    const phones = extractPhoneNumbers(
      telefon !== undefined ? telefon : existing.telefon,
      telefon2 !== undefined ? telefon2 : existing.telefon2
    );
    const newPhone1 = phones[0] || '';
    const newPhone2 = phones[1] || '';

    // 4. Değişiklik Tespiti ve Raporlama
    const isAddressChanged =
      existing.mahalle !== settlement.name ||
      existing.acik_adres !== newAcikAdres ||
      (sokak !== undefined && existing.sokak !== streetInfo.sokak) ||
      (kapi_no !== undefined && existing.kapi_no !== streetInfo.kapiNo);

    const isPhoneChanged =
      (existing.telefon || '') !== newPhone1 ||
      (existing.telefon2 || '') !== newPhone2;

    const isHaneChanged = (existing.hane_no || '') !== (newCleanHane || '');

    const changeSummaryParts: string[] = [];
    if (isAddressChanged) {
      changeSummaryParts.push(
        `Adres: [${existing.mahalle || '-'} - ${existing.acik_adres || '-'}] -> [${settlement.name} - ${newAcikAdres}]`
      );
    }
    if (isPhoneChanged) {
      changeSummaryParts.push(
        `Tel: [${existing.telefon || 'Yok'} / ${existing.telefon2 || 'Yok'}] -> [${newPhone1 || 'Yok'} / ${newPhone2 || 'Yok'}]`
      );
    }
    if (isHaneChanged) {
      changeSummaryParts.push(`Hane No: [${existing.hane_no || '-'}] -> [${newCleanHane || '-'}]`);
    }
    if (guncelleme_notu) {
      changeSummaryParts.push(`Gerekçe: ${guncelleme_notu}`);
    }

    // 5. Uyarılar & Fiili İkamet Notu
    const updatedWarnings = Array.isArray(existing.uyarilar) ? [...existing.uyarilar] : [];
    if (isAddressChanged) {
      const fiiliTag = `Fiili İkamet Güncellendi (${nowStr.split(' ')[0]})`;
      if (!updatedWarnings.includes(fiiliTag)) {
        updatedWarnings.unshift(fiiliTag);
      }
    }

    const updateSet: any = {
      mahalle: settlement.name,
      yerlesim_tipi: settlement.type,
      acik_adres: encryptField(newAcikAdres),
      norm_adres: encryptField(normAdres),
      adres_hash: normHash,
      sokak: encryptField(streetInfo.sokak || ''),
      kapi_no: streetInfo.kapiNo,
      daire_no: daire_no !== undefined ? (Number(daire_no) || 0) : streetInfo.daireNo,
      telefon: encryptField(newPhone1),
      telefon2: encryptField(newPhone2),
      hane_no: encryptField(newCleanHane || ''),
      hane_hash: newCleanHane ? hashHane(newCleanHane) : null,
      fiili_adres_guncellendi: isAddressChanged || Boolean(existing.fiili_adres_guncellendi),
      son_adres_guncelleme_tarihi: isAddressChanged || isPhoneChanged ? nowStr : existing.son_adres_guncelleme_tarihi,
      son_guncelleyen_personel: updated_by || 'Sistem Kullanıcısı',
      uyarilar: updatedWarnings,
      updated_at: nowStr,
    };

    if (guncelleme_notu) {
      updateSet.adres_guncelleme_notu = encryptField(guncelleme_notu);
      updateSet.uyari_notu = guncelleme_notu;
    }

    // Veritabanı güncellemesi
    await benCol.updateOne(buildIdFilter(id), { $set: updateSet });

    // Invalidate client cache and trigger sync pulse across all devices
    await touchSyncPulse(updated_by || 'Adres Güncelleme');

    // 6. Denetim ve Faaliyet Kaydı (Audit Log)
    await recordActivityLog({
      islem_tipi: 'ADRES_VE_ILETISIM_GUNCELLEME',
      kullanici_adi: updated_by || 'Sistem Kullanıcısı',
      baslik: `İkamet / Telefon Güncellendi (${existing.ad_soyad})`,
      detay: `${existing.ad_soyad} (TC: ${existing.tc_no}) adlı hak sahibinin ikamet/iletişim bilgileri güncellendi. ${changeSummaryParts.join(' | ')}`,
      hedef_kisi: existing.ad_soyad,
      hedef_tc: existing.tc_no,
      mahalle: settlement.name,
      ek_bilgi: {
        beneficiary_id: id,
        eski_mahalle: existing.mahalle,
        yeni_mahalle: settlement.name,
        eski_adres: existing.acik_adres,
        yeni_adres: newAcikAdres,
        eski_telefon: existing.telefon,
        yeni_telefon: newPhone1,
        yeni_telefon2: newPhone2,
        degisen_alanlar: changeSummaryParts,
        guncelleme_notu: guncelleme_notu || null,
      },
    });

    const updatedRaw = await benCol.findOne(buildIdFilter(id));
    const updatedDoc = mapDoc(updatedRaw);

    return NextResponse.json({
      success: true,
      message: 'Adres ve iletişim bilgileri başarıyla güncellendi',
      data: updatedDoc,
    });
  } catch (error: any) {
    console.error('Error updating beneficiary:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return session.response || NextResponse.json(
        { success: false, error: 'Yetkisiz erişim! Hak sahibi silme yetkisi sadece Yöneticilere aittir.' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'Kayıt ID belirtilmedi' }, { status: 400 });
    }

    const { beneficiaries: benCol } = await getDbCollections();
    const rawBen = await benCol.findOne(buildIdFilter(id));
    if (!rawBen) {
      return NextResponse.json({ success: false, error: 'Kayıt bulunamadı' }, { status: 404 });
    }

    const ben = mapDoc(rawBen);
    await benCol.deleteOne(buildIdFilter(id));

    const adminName = session.ad_soyad || session.username || 'Sistem Yöneticisi';
    await touchSyncPulse(adminName);

    await recordActivityLog({
      kullanici_adi: adminName,
      kullanici_rolu: 'ADMIN',
      islem_tipi: 'HAK_SAHIBI_SILME',
      baslik: 'Hak Sahibi Kaydı Silindi',
      detay: `${ben.ad_soyad} (TC: ${ben.tc_no || 'Belirtilmemiş'}, Mahalle: ${ben.mahalle}) kaydı sistemden silindi.`,
      hedef_kisi: ben.ad_soyad,
      hedef_tc: ben.tc_no,
      mahalle: ben.mahalle,
    });

    return NextResponse.json({ success: true, message: 'Hak sahibi kaydı başarıyla silindi' });
  } catch (error: any) {
    console.error('Error deleting beneficiary:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}


