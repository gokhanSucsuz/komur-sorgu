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
  isBirebirBeneficiaryMatch,
  normalizeMahalleName,
  normalizeStreetForCompare,
  getRecordStreetInfo
} from '@/lib/normalizer';
import {
  hashTc,
  hashHane,
  hashAddress,
  encryptField,
  encryptBeneficiary,
  encryptRouteStop,
} from '@/lib/crypto';
import { getIstanbulDate } from '@/lib/dateUtils';
import { verifySession } from '@/lib/auth';
import { serverError, asString, clampInt, isSafeId, getClientIp, checkRateLimit, rateLimitExceededResponse } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    // Rate limit: 180 requests per minute per user/IP
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`beneficiaries:${session.id || clientIp}`, 180, 60);
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit, 'Çok fazla hak sahibi sorgulama isteği gönderildi. Lütfen birkaç saniye bekleyiniz.');
    }

    const {
      beneficiaries: benCol,
      officialBeneficiaries,
      archivedBeneficiaries,
      systemSettings,
      calismaModu,
      isSandboxMode,
    } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const q = asString(searchParams.get('q'), 100);
    const mahalle = asString(searchParams.get('mahalle'), 100);
    const durum = asString(searchParams.get('durum'), 50);
    const targetTc = asString(searchParams.get('targetTc'), 32);
    const streetTagsMode = searchParams.get('streetTags') === '1';
    const page = clampInt(searchParams.get('page'), 1, 10000, 1);
    const rawLimit = searchParams.get('limit');
    const limit = (rawLimit === '0' || rawLimit === 'ALL' || rawLimit === 'all' || !rawLimit)
      ? 0
      : clampInt(rawLimit, 1, 50000, 50);
    const skip = limit > 0 ? (page - 1) * limit : 0;

    // Fast lookup for mobile field household addition: existing neighborhoods & street tags in the system
    if (streetTagsMode) {
      const targetMah = mahalle ? (normalizeMahalleName(mahalle) || mahalle.trim()) : '';
      const mahVariants: string[] = [];
      if (targetMah) {
        mahVariants.push(targetMah, mahalle.trim());
        const cleanBase = targetMah.replace(/\s+(?:Mahallesi|Mah\.?|Mh\.?|Köyü|Koy|Koyu)$/i, '').trim();
        if (cleanBase) {
          mahVariants.push(cleanBase, `${cleanBase} Mah.`, `${cleanBase} Mahallesi`, `${cleanBase} Köyü`);
        }
      }
      const mahFilter = mahVariants.length > 0 ? { mahalle: { $in: Array.from(new Set(mahVariants)) } } : {};
      const proj = { projection: { mahalle: 1, sokak: 1, acik_adres: 1, kapi_no: 1, yerlesim_tipi: 1 } };

      const [activeDocs, officialDocs, archivedDocs] = await Promise.all([
        benCol.find(mahFilter, proj).limit(2500).toArray(),
        isSandboxMode ? officialBeneficiaries.find(mahFilter, proj).limit(2500).toArray() : Promise.resolve([]),
        archivedBeneficiaries.find(mahFilter, proj).limit(2500).toArray(),
      ]);

      const combinedRaw = [...activeDocs, ...officialDocs, ...archivedDocs];
      const decryptedList = mapDocs(combinedRaw);

      const streetCountMap = new Map<string, { sokak: string; count: number }>();
      const mahalleSet = new Set<string>();

      for (const rec of decryptedList) {
        const mNorm = normalizeMahalleName(rec.mahalle || '') || (rec.mahalle || '').trim();
        if (mNorm && mNorm !== 'Belirtilmemiş') {
          mahalleSet.add(mNorm);
        }
        if (targetMah && mNorm.toLocaleLowerCase('tr-TR') !== targetMah.toLocaleLowerCase('tr-TR')) {
          continue;
        }
        const stInfo = getRecordStreetInfo(rec);
        const stName = (stInfo.sokak || '').trim();
        if (stName && stName !== 'Belirtilmemiş') {
          const normKey = stName.toLocaleLowerCase('tr-TR');
          const prev = streetCountMap.get(normKey);
          if (prev) {
            prev.count += 1;
          } else {
            streetCountMap.set(normKey, { sokak: stName, count: 1 });
          }
        }
      }

      const streets = Array.from(streetCountMap.values())
        .sort((a, b) => a.sokak.localeCompare(b.sokak, 'tr'))
        .map((x) => ({ sokak: x.sokak, hane_sayisi: x.count }));

      return NextResponse.json({
        success: true,
        mahalle: targetMah,
        streets,
        streetNames: streets.map((s) => s.sokak),
        mahalleler: Array.from(mahalleSet).sort((a, b) => a.localeCompare(b, 'tr')),
      });
    }

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
        expandedMahalleList.push(m);
        const norm = normalizeMahalleName(m);
        if (norm) expandedMahalleList.push(norm);

        const cleanBase = m.replace(/\s+(?:Mahallesi|Mah\.?|Mh\.?|Köyü|Koy|Koyu)$/i, '').trim();
        if (cleanBase) {
          expandedMahalleList.push(cleanBase);
          expandedMahalleList.push(`${cleanBase} Mah.`);
          expandedMahalleList.push(`${cleanBase} Mahallesi`);
          expandedMahalleList.push(`${cleanBase} Köyü`);
        }
        if (/100\.\s*Yıl/i.test(m) || /Yıl\s+Mah/i.test(m) || m.toLowerCase() === 'yıl') {
          expandedMahalleList.push('100. Yıl Mah.', '100. Yıl Mahallesi', 'Yıl Mah.', 'Yıl Mahallesi', '100.Yıl Mah.', '100 Yıl Mah.', 'Yıl');
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
      if (durum === 'KOMUR_VERILMEYECEK' || durum === 'EXCLUDED') {
        filter.komur_verilmeyecek = true;
      } else if (durum === 'DAGITILACAK') {
        filter.teslimat_durumu = { $in: ['BEKLIYOR', 'EKSIK', null] };
        filter.komur_verilmeyecek = { $ne: true };
      } else if (durum === 'TAMAMLANDI') {
        filter.teslimat_durumu = { $in: ['TAMAMLANDI', 'TESLIM_EDILDI'] };
        filter.komur_verilmeyecek = { $ne: true };
      } else if (durum === 'EKSIK') {
        filter.teslimat_durumu = 'EKSIK';
        filter.komur_verilmeyecek = { $ne: true };
      } else if (durum === 'BEKLIYOR') {
        filter.teslimat_durumu = { $in: ['BEKLIYOR', null] };
        filter.komur_verilmeyecek = { $ne: true };
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
        r.mahalle = normalizeMahalleName(r.mahalle) || r.mahalle || 'Adres Belirtilmemiş';
        if (r.ek_liste_adi === 'Saha Tekil Ekleme') r.ek_liste_adi = 'Ek Liste';
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
          r.mahalle = normalizeMahalleName(r.mahalle) || r.mahalle || 'Adres Belirtilmemiş';
          if (r.ek_liste_adi === 'Saha Tekil Ekleme') r.ek_liste_adi = 'Ek Liste';
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
          r.mahalle = normalizeMahalleName(r.mahalle) || r.mahalle || 'Adres Belirtilmemiş';
          if (r.ek_liste_adi === 'Saha Tekil Ekleme') r.ek_liste_adi = 'Ek Liste';
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
      const rawM = b.mahalle ? b.mahalle.trim() : '';
      const m = normalizeMahalleName(rawM) || rawM || 'Belirtilmemiş';
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
        .filter((r: any) => r.teslimat_durumu === 'EKSIK' && !r.komur_verilmeyecek)
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
            !r.komur_verilmeyecek &&
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
          komur_verilmeyecek: { $ne: true },
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
      calismaModu,
      isSandboxMode,
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
    return serverError('beneficiaries:GET', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Hem Saha Personeli (PERSONEL) hem de Sistem Yöneticisi (ADMIN) durumu uygun tek haneleri ekleyebilir
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json(
        { success: false, error: 'Oturum gerekli! Lütfen tekrar giriş yapınız.' },
        { status: 401 }
      );
    }

    if (session.rol === 'MUDUR') {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', error: 'Yetki Sınırı: Müdür yetkilisi salt okunur izleme modundadır, hane ekleyemez.' },
        { status: 403 }
      );
    }

    const {
      beneficiaries: benCol,
      systemSettings,
      importBatches: batchesCol,
      archivedImportBatches,
      signatureLists,
    } = await getDbCollections();
    const body = await request.json();
    const {
      tc_no,
      ad_soyad,
      telefon,
      telefon2,
      mahalle,
      acik_adres,
      sokak,
      kapi_no,
      daire_no,
      hane_no,
      hedef_torba,
      liste_turu,
      batch_id,
      donem_kodu,
      imza_alindi,
      ekleme_notu,
      check_only,
      confirm_same_address,
    } = body;

    const cleanedTc = cleanTcNo(tc_no);

    // 1. T.C. KİMLİK NO MÜKERRERLİK KONTROLÜ (KESİN ENGEL - HARD BLOCK)
    // Sistemde kaydı olan TC Kimlik No varsa kesinlikle eklemez ve personele detaylı uyarı verir
    if (cleanedTc && cleanedTc.length === 11) {
      const tcHash = hashTc(cleanedTc);
      const existingTc = await benCol.findOne({
        $or: [
          ...(tcHash ? [{ tc_hash: tcHash }] : []),
          { tc_no: cleanedTc },
        ],
      });

      if (existingTc) {
        const decTc = mapDoc(existingTc);
        const statusSummary = formatDeliveryStatusSummary(decTc);
        const existingRecordSummary = {
          id: decTc.id || String(decTc._id || ''),
          tc_no: decTc.tc_no || cleanedTc,
          ad_soyad: decTc.ad_soyad || 'Bilinmiyor',
          mahalle: decTc.mahalle || '-',
          acik_adres: decTc.acik_adres || '-',
          sokak: decTc.sokak || '',
          kapi_no: decTc.kapi_no || null,
          daire_no: decTc.daire_no || null,
          telefon: decTc.telefon || '',
          hane_no: decTc.hane_no || null,
          teslimat_durumu: decTc.teslimat_durumu || 'BEKLIYOR',
          torba_sayisi: Number(decTc.torba_sayisi || 0),
          hedef_torba: Number(decTc.hedef_torba || 34),
          teslimat_tarihi: decTc.teslimat_tarihi || null,
          teslim_alan: decTc.teslim_alan || null,
          teslim_eden_personel: decTc.teslim_eden_personel || null,
          komur_verilmeyecek: Boolean(decTc.komur_verilmeyecek),
          komur_iptal_nedeni: decTc.komur_iptal_nedeni || null,
          durum_ozeti: statusSummary,
        };

        return NextResponse.json(
          {
            success: false,
            duplicate_tc: true,
            existing_record: existingRecordSummary,
            error: `Bu T.C. Kimlik Numarası (${cleanedTc}) sistemde zaten kayıtlıdır! Mevcut Hak Sahibi: ${decTc.ad_soyad} | Mahalle: ${decTc.mahalle || '-'} | Adres: ${decTc.acik_adres || '-'} | Kömür Durumu: ${statusSummary}. Mükerrer kayıt oluşmaması için bu TC tekrar eklenemez.`,
          },
          { status: check_only ? 200 : 409 }
        );
      }
    } else if (!check_only) {
      return NextResponse.json(
        { success: false, error: 'Geçersiz T.C. Kimlik Numarası (11 haneli rakam olmalıdır)' },
        { status: 400 }
      );
    }

    // 2. HANE NUMARASI MÜKERRERLİK KONTROLÜ (Eğer Hane No girilmişse)
    const cleanedHaneNo = cleanHaneNo(hane_no);
    const cleanHane = cleanHaneKey(cleanedHaneNo);

    if (cleanHane) {
      const haneHash = hashHane(cleanHane);
      const existingHaneDoc = await benCol.findOne({
        $or: [
          ...(haneHash ? [{ hane_hash: haneHash }] : []),
          { hane_no: cleanedHaneNo },
          ...(hane_no ? [{ hane_no: String(hane_no).trim() }] : []),
        ],
      });

      if (existingHaneDoc) {
        const decHane = mapDoc(existingHaneDoc);
        const statusSummary = formatDeliveryStatusSummary(decHane);
        return NextResponse.json(
          {
            success: false,
            duplicate_hane: true,
            existing_record: {
              id: decHane.id || String(decHane._id || ''),
              tc_no: decHane.tc_no || '',
              ad_soyad: decHane.ad_soyad || 'Bilinmiyor',
              mahalle: decHane.mahalle || '-',
              acik_adres: decHane.acik_adres || '-',
              hane_no: decHane.hane_no || cleanedHaneNo,
              teslimat_durumu: decHane.teslimat_durumu || 'BEKLIYOR',
              torba_sayisi: Number(decHane.torba_sayisi || 0),
              hedef_torba: Number(decHane.hedef_torba || 34),
              durum_ozeti: statusSummary,
            },
            error: `Bu Hane Numarası (${cleanedHaneNo}) sistemde zaten kayıtlıdır! Mevcut Hak Sahibi: ${decHane.ad_soyad} (TC: ${decHane.tc_no || 'Belirtilmemiş'}) | Mahalle: ${decHane.mahalle || '-'} | Kömür Durumu: ${statusSummary}.`,
          },
          { status: check_only ? 200 : 400 }
        );
      }
    }

    // 3. ADRES NORMALİZASYONU VE AYNI ADRESTE BAŞKA HANE KONTROLÜ (UYARI VERİR, ONAYLA EKLENEBİLİR)
    const rawMahalleStr = mahalle ? String(mahalle).trim() : '';
    const rawAcikAdresStr = acik_adres ? String(acik_adres).trim() : '';
    const rawSokakStr = sokak ? String(sokak).trim() : '';
    const rawKapiNoStr = kapi_no !== undefined && kapi_no !== null ? String(kapi_no).trim() : '';

    // Eğer sokak/kapı no ayrı girilmiş veya sadece mahalle/sokak etiketi seçilmişse açık adresi otomatik oluştur (sahada personel detay yazmak zorunda kalmaz)
    let compositeAddress = rawAcikAdresStr;
    if (!compositeAddress && (rawSokakStr || rawKapiNoStr)) {
      compositeAddress = [
        rawMahalleStr,
        rawSokakStr,
        rawKapiNoStr ? `No: ${rawKapiNoStr}` : '',
        daire_no ? `Daire: ${daire_no}` : '',
      ]
        .filter(Boolean)
        .join(' ');
    }
    if (!compositeAddress && rawMahalleStr) {
      const autoStreet = /(?:Köyü|Koy|Koyu)$/i.test(rawMahalleStr) ? 'Köy İçi' : 'Merkez';
      compositeAddress = [
        rawMahalleStr,
        autoStreet,
        rawKapiNoStr ? `No: ${rawKapiNoStr}` : '',
        daire_no ? `Daire: ${daire_no}` : '',
      ]
        .filter(Boolean)
        .join(' ');
    }

    const sameAddressRecords: any[] = [];
    let settlement = {
      name: rawMahalleStr ? (normalizeMahalleName(rawMahalleStr) || rawMahalleStr) : 'Adres Belirtilmemiş',
      type: 'MAHALLE' as 'MAHALLE' | 'KOY',
    };
    let streetInfo: { sokak: string; kapiNo: string | number; daireNo: number } = {
      sokak: rawSokakStr || (rawMahalleStr ? 'Mahalle İçi / Cadde-Sokak Belirtilmemiş' : 'Adres Belirtilmemiş'),
      kapiNo: 999999,
      daireNo: 0,
    };
    let normAdres = '';
    const hasSpecificHouseAddress = Boolean(rawKapiNoStr || rawAcikAdresStr.length >= 5);

    if (rawMahalleStr || compositeAddress) {
      settlement = detectSettlement(rawMahalleStr, body.koy, compositeAddress);
      streetInfo = extractStreetAndDoor(compositeAddress, rawSokakStr, rawKapiNoStr, settlement.name);
      if (daire_no !== undefined && daire_no !== null && String(daire_no).trim() !== '') {
        const parsedDaire = parseInt(String(daire_no).replace(/[^0-9]/g, ''), 10);
        if (!isNaN(parsedDaire) && parsedDaire > 0) {
          streetInfo.daireNo = parsedDaire;
        }
      }
      normAdres = hasSpecificHouseAddress ? normalizeAddress(settlement.name, compositeAddress) : '';
      const adresHash = normAdres ? hashAddress(normAdres) : null;

      // Aynı mahalledeki veya aynı adres özetindeki aday kayıtları çek (Yalnızca spesifik kapı no veya açık adres girildiyse kontrol et)
      const normMahalleTarget = normalizeMahalleName(settlement.name) || settlement.name;
      const mahalleOrConditions: any[] = [];
      if (hasSpecificHouseAddress) {
        if (adresHash) mahalleOrConditions.push({ adres_hash: adresHash });
        if (normAdres) mahalleOrConditions.push({ norm_adres: normAdres });
        if (settlement.name) mahalleOrConditions.push({ mahalle: settlement.name });
        if (rawMahalleStr && rawMahalleStr !== settlement.name) {
          mahalleOrConditions.push({ mahalle: rawMahalleStr });
        }
      }

      if (mahalleOrConditions.length > 0) {
        const candidateDocs = await benCol.find({ $or: mahalleOrConditions }).toArray();
        const decryptedCandidates = mapDocs(candidateDocs);

        const targetStreetNorm =
          streetInfo.sokak && streetInfo.sokak !== 'Belirtilmemiş'
            ? normalizeStreetForCompare(streetInfo.sokak)
            : '';
        const targetDoorNum =
          streetInfo.kapiNo && streetInfo.kapiNo !== 999999 ? Number(streetInfo.kapiNo) : null;

        for (const cand of decryptedCandidates) {
          if (cleanedTc && cand.tc_no === cleanedTc) continue;

          // Eşleşme 1: Normalize edilmiş açık adres birebir aynıysa
          const candPhysicalNorm = normalizeAddress(cand.mahalle || '', cand.acik_adres || '');
          const isExactNormMatch =
            normAdres.length >= 5 &&
            (cand.norm_adres === normAdres ||
              (candPhysicalNorm.length >= 5 && candPhysicalNorm === normAdres));

          // Eşleşme 2: Aynı Mahalle + Aynı Sokak/Cadde + Aynı Kapı/Bina Numarası
          let isSameStreetAndDoor = false;
          if (targetStreetNorm && targetDoorNum !== null) {
            const candMahalleNorm = normalizeMahalleName(cand.mahalle || '') || cand.mahalle || '';
            if (candMahalleNorm.toLocaleLowerCase('tr-TR') === normMahalleTarget.toLocaleLowerCase('tr-TR')) {
              const candSt = getRecordStreetInfo(cand);
              const candStreetNorm =
                candSt.sokak && candSt.sokak !== 'Belirtilmemiş'
                  ? normalizeStreetForCompare(candSt.sokak)
                  : '';
              const candDoorNum =
                candSt.kapiNo && candSt.kapiNo !== 999999 ? Number(candSt.kapiNo) : null;

              if (
                candStreetNorm &&
                candStreetNorm === targetStreetNorm &&
                candDoorNum !== null &&
                candDoorNum === targetDoorNum
              ) {
                isSameStreetAndDoor = true;
              }
            }
          }

          if (isExactNormMatch || isSameStreetAndDoor) {
            const statusSummary = formatDeliveryStatusSummary(cand);
            sameAddressRecords.push({
              id: cand.id || String(cand._id || ''),
              tc_no: cand.tc_no || '',
              ad_soyad: cand.ad_soyad || 'Bilinmiyor',
              mahalle: cand.mahalle || settlement.name,
              acik_adres: cand.acik_adres || '-',
              sokak: cand.sokak || '',
              kapi_no: cand.kapi_no && cand.kapi_no !== 999999 ? cand.kapi_no : null,
              daire_no: cand.daire_no && cand.daire_no > 0 ? cand.daire_no : null,
              telefon: cand.telefon || '',
              hane_no: cand.hane_no || null,
              teslimat_durumu: cand.teslimat_durumu || 'BEKLIYOR',
              torba_sayisi: Number(cand.torba_sayisi || 0),
              hedef_torba: Number(cand.hedef_torba || 34),
              teslimat_tarihi: cand.teslimat_tarihi || null,
              teslim_alan: cand.teslim_alan || null,
              teslim_eden_personel: cand.teslim_eden_personel || null,
              komur_verilmeyecek: Boolean(cand.komur_verilmeyecek),
              komur_iptal_nedeni: cand.komur_iptal_nedeni || null,
              durum_ozeti: statusSummary,
              eslesme_tipi: isExactNormMatch ? 'TAM_ADRES' : 'AYNI_BINA_KAPI_NO',
            });
          }
        }
      }
    }

    // Sadece canlı ön kontrol (check_only) istenmişse sonuçları döndür
    if (check_only) {
      return NextResponse.json({
        success: true,
        check_only: true,
        duplicate_tc: false,
        duplicate_hane: false,
        address_warning: sameAddressRecords.length > 0,
        same_address_records: sameAddressRecords,
      });
    }

    if (!ad_soyad || !String(ad_soyad).trim()) {
      return NextResponse.json(
        { success: false, error: 'Ad Soyad ve T.C. Kimlik Numarası alanları zorunludur (Adres ve telefon isteğe bağlıdır)' },
        { status: 400 }
      );
    }

    if (!compositeAddress) {
      compositeAddress = rawMahalleStr ? `${settlement.name}` : 'Adres Belirtilmemiş';
    }

    // Eğer aynı adreste başka hane(ler) varsa ve personel henüz onaylamadıysa uyarı döndür (onaylarsa eklenebilir!)
    if (sameAddressRecords.length > 0 && !confirm_same_address) {
      return NextResponse.json({
        success: false,
        requires_address_confirmation: true,
        address_warning: true,
        same_address_records: sameAddressRecords,
        warning: `Bu adreste kayıtlı ${sameAddressRecords.length} başka hane bulundu (${sameAddressRecords.map((r) => r.ad_soyad).join(', ')}). Hane durumu uygun ise onaylayarak kaydı tamamlayabilirsiniz.`,
      });
    }

    const phones = extractPhoneNumbers(telefon, telefon2);

    // Aktif kömür dağıtım dönemini al (Sıfırlanmış / yeni dönem kontrolü)
    const seasonDoc = await systemSettings.findOne({ key: 'aktif_donem' });
    let activeSeasonCode = '2026-2027';
    if (seasonDoc && seasonDoc.value) {
      try {
        const parsed = typeof seasonDoc.value === 'string' ? JSON.parse(seasonDoc.value) : seasonDoc.value;
        if (parsed?.kod) activeSeasonCode = String(parsed.kod).trim();
      } catch {
        activeSeasonCode = String(seasonDoc.value).trim() || '2026-2027';
      }
    }

    // KURAL: Eğer eski/arşivlenmiş bir dönem kodu seçilmeye çalışıldıysa reddet
    if (donem_kodu && String(donem_kodu).trim() !== activeSeasonCode) {
      return NextResponse.json(
        {
          success: false,
          error: `Eski dönem listeleri arşivlenmiştir (${donem_kodu}). Yeni hane yalnızca sıfırlanmış aktif döneme (${activeSeasonCode}) ait listelere eklenebilir.`,
        },
        { status: 400 }
      );
    }

    // KURAL: Eğer belirli bir batch_id seçilmişse, bu listenin arşivde mi aktifte mi olduğunu doğrula
    let attachedBatch: any = null;
    if (batch_id && String(batch_id).trim()) {
      const cleanBatchId = String(batch_id).trim();

      // 1. Arşivlenmiş listeler arasında mı?
      const archivedBatch = await archivedImportBatches.findOne({
        $or: [{ batch_id: cleanBatchId }, { id: cleanBatchId }],
      });
      if (archivedBatch) {
        return NextResponse.json(
          {
            success: false,
            error: `Seçilen liste (${archivedBatch.dosya_adi || cleanBatchId}) geçmiş döneme (${archivedBatch.donem_kodu || 'Arşiv'}) aittir ve arşivlenmiştir. Arşivlenmiş listelere yeni hane eklenemez. Lütfen güncel aktif döneme ait bir liste seçiniz.`,
          },
          { status: 400 }
        );
      }

      // 2. Aktif listeler tablosunda mı?
      attachedBatch = await batchesCol.findOne({
        $or: [{ batch_id: cleanBatchId }, { id: cleanBatchId }],
      });
      if (attachedBatch && attachedBatch.donem_kodu && attachedBatch.donem_kodu !== activeSeasonCode) {
        return NextResponse.json(
          {
            success: false,
            error: `Seçilen liste aktif döneme (${activeSeasonCode}) ait değildir ve arşivlenmiştir. Yalnızca aktif döneme ait listelere hane eklenebilir.`,
          },
          { status: 400 }
        );
      }
    }

    // Varsayılan hane kömür kotasını sistem ayarlarından al
    const settingDoc = await systemSettings.findOne({ key: 'varsayilan_hedef_torba' });
    const targetQuota = parseInt(hedef_torba || settingDoc?.value || '34', 10);
    const { nowLocaleTr } = getIstanbulDate();
    const nowStr = nowLocaleTr;
    const creatorName = (body.personel || session.ad_soyad || session.username || 'Saha Personeli').trim();

    // Mahalle içindeki sıra numarasını hesapla (Yalnızca aktif dönem hanelerini sayar)
    const existingMahalleCount = await benCol.countDocuments({ mahalle: settlement.name });
    const mahalleSira = existingMahalleCount + 1;

    const selectedListType =
      liste_turu === 'ANA_LISTE' || liste_turu === 'SIGORTALI' || liste_turu === 'EK_LISTE'
        ? liste_turu
        : 'EK_LISTE';

    // Eğer Ek Liste olarak ekleniyorsa ve özel bir batch seçilmediyse, otomatik "Ek Liste" grubunu (batch) bul veya oluştur
    const defaultEkBatchId = `BATCH_EK_LISTE_${activeSeasonCode}`;
    if (selectedListType === 'EK_LISTE' && !attachedBatch) {
      attachedBatch = await batchesCol.findOne({
        $or: [
          { batch_id: defaultEkBatchId },
          { dosya_adi: 'Ek Liste', donem_kodu: activeSeasonCode },
          { ek_liste_adi: 'Ek Liste', donem_kodu: activeSeasonCode },
        ],
      });
      if (!attachedBatch) {
        const newEkBatch: any = {
          batch_id: defaultEkBatchId,
          dosya_adi: 'Ek Liste',
          ek_liste_adi: 'Ek Liste',
          ek_liste_no: 1,
          liste_turu: 'EK_LISTE',
          donem_kodu: activeSeasonCode,
          toplam_satir: 0,
          eklenen_kisi: 0,
          mevcut_kisi: 0,
          mukerrer_tc: 0,
          mukerrer_hane: 0,
          hatali_kayit: 0,
          yukleyen: creatorName,
          created_at: nowStr,
          updated_at: nowStr,
        };
        const insBatch = await batchesCol.insertOne(newEkBatch);
        attachedBatch = { ...newEkBatch, _id: insBatch.insertedId };
      }
    }

    let siraNo = `Ek1 - ${mahalleSira}`;
    let ekListeNo = 1;
    let ekListeAdi = attachedBatch?.ek_liste_adi || 'Ek Liste';
    if (ekListeAdi === 'Saha Tekil Ekleme') {
      ekListeAdi = 'Ek Liste';
    }

    if (selectedListType === 'ANA_LISTE') {
      siraNo = String(mahalleSira);
      ekListeNo = 0;
      ekListeAdi = attachedBatch?.ek_liste_adi || 'Ana Liste';
    } else if (selectedListType === 'SIGORTALI') {
      siraNo = `Sigortalı - ${mahalleSira}`;
      ekListeNo = 1000;
      ekListeAdi = attachedBatch?.ek_liste_adi || 'Sigortalılar Listesi';
    }

    const uyarilarList: string[] = [];
    if (sameAddressRecords.length > 0) {
      uyarilarList.push(
        `Aynı adreste ${sameAddressRecords.length} hane daha mevcut (${sameAddressRecords
          .map((r) => `${r.ad_soyad}`)
          .join(', ')}) — Saha personeli (${creatorName}) kontrolüyle eklendi`
      );
    }
    if (ekleme_notu && String(ekleme_notu).trim()) {
      uyarilarList.push(`Saha Ekleme Notu: ${String(ekleme_notu).trim()}`);
    }

    const existingSigListCount = signatureLists ? await signatureLists.countDocuments({}) : 0;
    const isAddedAfterSignatureLists = existingSigListCount > 0;
    const isSignedAtDoor = Boolean(imza_alindi);
    const dateFormatted = nowStr.split(' ')[0] || '';
    const ekListeImzaNotuAtAdd = (isSignedAtDoor && isAddedAfterSignatureLists)
      ? `${dateFormatted} tarihinde ek listeye imzası alındı`
      : null;
    const resolvedBatchId = attachedBatch
      ? attachedBatch.batch_id || attachedBatch.id || String(attachedBatch._id)
      : batch_id
      ? String(batch_id).trim()
      : selectedListType === 'EK_LISTE'
      ? defaultEkBatchId
      : null;

    const newDoc: any = {
      tc_no: cleanedTc,
      ad_soyad: String(ad_soyad).trim(),
      telefon: phones[0] || '',
      telefon2: phones[1] || '',
      mahalle: settlement.name,
      yerlesim_tipi: settlement.type,
      sokak: streetInfo.sokak,
      kapi_no: streetInfo.kapiNo,
      daire_no: streetInfo.daireNo,
      acik_adres: compositeAddress,
      hane_no: cleanedHaneNo || null,
      norm_adres: normAdres,
      hedef_torba: targetQuota,
      teslimat_durumu: 'BEKLIYOR',
      torba_sayisi: 0,
      teslimat_tarihi: null,
      teslim_alan: null,
      teslim_eden_personel: null,
      teslimat_notu: ekleme_notu ? String(ekleme_notu).trim() : null,
      imza_durumu: isSignedAtDoor ? 'IMZALANDI' : 'BEKLIYOR',
      imza_tarihi: isSignedAtDoor ? nowStr : null,
      imza_alan_personel: isSignedAtDoor ? creatorName : null,
      tekil_hane_ekleme: true,
      sonradan_eklenen_hane: isAddedAfterSignatureLists,
      manuel_ek_liste_imzasi: isSignedAtDoor && isAddedAfterSignatureLists,
      ek_komur_verildi: false,
      ek_liste_imza_tarihi: isSignedAtDoor ? nowStr : null,
      ek_liste_imza_notu: ekListeImzaNotuAtAdd,
      sira_no: siraNo,
      mahalle_sira: mahalleSira,
      liste_turu: selectedListType,
      liste_kategorisi: selectedListType === 'EK_LISTE' ? 'EK_KAYIT' : selectedListType,
      ek_liste_no: ekListeNo,
      ek_liste_adi: ekListeAdi,
      kaynak_dosya: attachedBatch?.dosya_adi || ekListeAdi,
      batch_id: resolvedBatchId,
      import_batch_id: resolvedBatchId,
      donem_kodu: activeSeasonCode,
      ekleyen_personel: creatorName,
      ekleyen_rol: session.rol || 'PERSONEL',
      uyarilar: uyarilarList,
      uyari_notu: uyarilarList.length > 0 ? uyarilarList.join(' | ') : null,
      created_at: nowStr,
      updated_at: nowStr,
    };

    // AES-256-GCM ile şifrele ve blind index'leri oluştur
    const encryptedDoc = encryptBeneficiary(newDoc);
    const res = await benCol.insertOne(encryptedDoc);
    const newId = res.insertedId ? res.insertedId.toString() : '';

    // Eğer aktif bir Excel listesine veya otomatik "Ek Liste" grubuna bağlandıysa sayaçlarını güncelle
    if (attachedBatch && attachedBatch._id) {
      try {
        await batchesCol.updateOne(
          { _id: attachedBatch._id },
          {
            $inc: { mevcut_kisi: 1, eklenen_kisi: 1, toplam_satir: 1 },
            $set: { updated_at: nowStr },
          }
        );
      } catch (e) {
        console.warn('Batch count increment warning:', e);
      }
    }

    // Tüm saha cihazlarının anında senkronize olması için sync pulse tetikle
    await touchSyncPulse(creatorName);

    await recordActivityLog({
      islem_tipi: 'HANE_EKLEME',
      kullanici_adi: creatorName,
      kullanici_rolu: session.rol || 'PERSONEL',
      baslik: `Tek Hane Eklendi (${newDoc.ad_soyad})`,
      detay: `Saha/Tekil hane eklendi: ${newDoc.ad_soyad} (${newDoc.mahalle}) - TC: ${newDoc.tc_no}, Hedef: ${targetQuota} Torba${
        sameAddressRecords.length > 0
          ? ` [Aynı adreste mevcut ${sameAddressRecords.length} hane uyarısı görülerek onaylandı]`
          : ''
      }`,
      hedef_kisi: newDoc.ad_soyad,
      hedef_tc: newDoc.tc_no,
      mahalle: newDoc.mahalle,
      torba_sayisi: targetQuota,
      ek_bilgi: {
        id: newId,
        adres: newDoc.acik_adres,
        ayni_adres_hane_sayisi: sameAddressRecords.length,
        ekleyen: creatorName,
      },
    });

    const createdBeneficiary = {
      ...newDoc,
      id: newId,
      _id: newId,
      kalan_torba: targetQuota,
    };

    return NextResponse.json({
      success: true,
      message: 'Yeni hane başarıyla sisteme eklendi',
      id: newId,
      beneficiary: createdBeneficiary,
      same_address_records: sameAddressRecords,
    });
  } catch (error: any) {
    return serverError('beneficiaries:POST', error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    // Rate limit: 180 requests per minute per user/IP
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`beneficiaries:${session.id || clientIp}`, 180, 60);
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit, 'Çok fazla hak sahibi sorgulama isteği gönderildi. Lütfen birkaç saniye bekleyiniz.');
    }

    if (session.rol === 'MUDUR') {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', error: 'Yetki Sınırı: Müdür yetkilisi salt okunur izleme modundadır, hane bilgilerini güncelleyemez.' },
        { status: 403 }
      );
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

    if (!id || !isSafeId(id)) {
      return NextResponse.json(
        { success: false, error: 'Güncellenecek hak sahibi ID bilgisi zorunludur veya geçersiz' },
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
      kapi_no !== undefined ? kapi_no : existing.kapi_no,
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

    const updaterName = session.ad_soyad || session.username || updated_by || 'Sistem Kullanıcısı';

    const hasSignatureList = Boolean(
      existing.imza_listesi_id && String(existing.imza_listesi_id).trim().length > 0
    );

    const origListMahalle = existing.imza_listesi_mahalle || existing.mahalle;
    const origListAdres = existing.imza_listesi_acik_adres || existing.acik_adres;
    const origListSokak = existing.imza_listesi_sokak || existing.sokak;
    const origListKapiNo = existing.imza_listesi_kapi_no !== undefined ? existing.imza_listesi_kapi_no : existing.kapi_no;
    const origListDaireNo = existing.imza_listesi_daire_no !== undefined ? existing.imza_listesi_daire_no : existing.daire_no;

    const isDifferentFromList =
      hasSignatureList &&
      (settlement.name !== origListMahalle || newAcikAdres !== origListAdres);

    if (hasSignatureList && isDifferentFromList) {
      changeSummaryParts.push(
        `İmza Listesi Çıktısı Sonrası Adres Değiştirildi [Basılı Liste: ${origListMahalle} - ${origListAdres}] -> [Yeni: ${settlement.name} - ${newAcikAdres}]`
      );
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
      son_guncelleyen_personel: updaterName,
      uyarilar: updatedWarnings.map((u: any) => (u !== undefined && u !== null ? encryptField(String(u)) : u)),
      updated_at: nowStr,
    };

    if (hasSignatureList) {
      if (isDifferentFromList) {
        updateSet.imza_sonrasi_adres_degisti = true;
        updateSet.imza_listesi_mahalle = origListMahalle;
        updateSet.imza_listesi_acik_adres = encryptField(origListAdres || '');
        updateSet.imza_listesi_sokak = encryptField(origListSokak || '');
        updateSet.imza_listesi_kapi_no = origListKapiNo;
        updateSet.imza_listesi_daire_no = origListDaireNo;
        updateSet.onceki_mahalle = existing.mahalle;
        updateSet.onceki_acik_adres = encryptField(existing.acik_adres || '');
        updateSet.onceki_sokak = encryptField(existing.sokak || '');
        updateSet.onceki_kapi_no = existing.kapi_no;
        updateSet.onceki_daire_no = existing.daire_no;
      } else {
        updateSet.imza_sonrasi_adres_degisti = false;
      }
    }

    if (guncelleme_notu) {
      updateSet.adres_guncelleme_notu = encryptField(guncelleme_notu);
      updateSet.uyari_notu = encryptField(guncelleme_notu);
    }

    // Veritabanı güncellemesi
    await benCol.updateOne(buildIdFilter(id), { $set: updateSet });

    // Invalidate client cache and trigger sync pulse across all devices
    await touchSyncPulse(updaterName);

    // 6. Denetim ve Faaliyet Kaydı (Audit Log)
    await recordActivityLog({
      islem_tipi: 'ADRES_VE_ILETISIM_GUNCELLEME',
      kullanici_adi: updaterName,
      kullanici_rolu: session.rol || 'PERSONEL',
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
        imza_sonrasi_adres_degisti: Boolean(hasSignatureList && isDifferentFromList),
        imza_listesi_mahalle: hasSignatureList && isDifferentFromList ? origListMahalle : undefined,
        imza_listesi_acik_adres: hasSignatureList && isDifferentFromList ? origListAdres : undefined,
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
    return serverError('beneficiaries:PUT', error);
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
    const id = asString(searchParams.get('id'), 64);
    if (!id || !isSafeId(id)) {
      return NextResponse.json({ success: false, error: 'Kayıt ID belirtilmedi veya geçersiz' }, { status: 400 });
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
    return serverError('beneficiaries:DELETE', error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    // Rate limit: 180 requests per minute per user/IP
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`beneficiaries:${session.id || clientIp}`, 180, 60);
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit, 'Çok fazla hak sahibi sorgulama isteği gönderildi. Lütfen birkaç saniye bekleyiniz.');
    }

    const { beneficiaries: benCol, deliveryRoutes: routeCol } = await getDbCollections();
    const body = await request.json();
    const { action, id, neden, aciklama, personel } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Hak sahibi ID bilgisi zorunludur' }, { status: 400 });
    }

    const rawBeneficiary = await benCol.findOne(buildIdFilter(id));
    if (!rawBeneficiary) {
      return NextResponse.json({ success: false, error: 'Hak sahibi sistemde bulunamadı' }, { status: 404 });
    }

    const existing = mapDoc(rawBeneficiary);
    const { nowLocaleTr } = getIstanbulDate();
    const nowStr = nowLocaleTr;
    const staff = (personel || session.ad_soyad || session.username || 'Yetkili').trim();

    if (action === 'KOMUR_IPTAL') {
      if (!neden || !String(neden).trim()) {
        return NextResponse.json({ success: false, error: 'Lütfen kömür iptal gerekçesini seçiniz veya belirtiniz' }, { status: 400 });
      }

      const updateSet: any = {
        komur_verilmeyecek: true,
        komur_iptal_nedeni: encryptField(String(neden).trim()),
        komur_iptal_aciklama: encryptField(aciklama ? String(aciklama).trim() : ''),
        komur_iptal_tarihi: nowStr,
        komur_iptal_eden: staff,
        updated_at: nowStr,
      };

      await benCol.updateOne(buildIdFilter(id), { $set: updateSet });

      // Aktif rota içerisinde bu vatandaş varsa durağı iptal olarak güncelle
      const activeRoutes = await routeCol.find({
        durum: { $in: ['AKTIF', 'DURAKLATILDI'] },
      }).toArray();

      for (const rawR of activeRoutes) {
        const decR = mapDoc(rawR);
        const stops = decR.duraklar || [];
        let modified = false;
        stops.forEach((s: any) => {
          if (
            String(s.beneficiary_id) === String(existing.id) ||
            String(s.beneficiary_id) === String(existing._id) ||
            (existing.tc_no && s.tc_no === existing.tc_no)
          ) {
            s.komur_verilmeyecek = true;
            s.durum = 'IPTAL';
            s.teslimat_notu = `Kömür İptal Edildi: ${String(neden).trim()}`;
            modified = true;
          }
        });
        if (modified) {
          await routeCol.updateOne(buildIdFilter(decR.id || decR._id), {
            $set: {
              duraklar: stops.map(encryptRouteStop),
              updated_at: nowStr,
            },
          });
        }
      }

      await touchSyncPulse(staff);

      await recordActivityLog({
        islem_tipi: 'KOMUR_HAK_SAHIPLIGI_IPTAL',
        kullanici_adi: staff,
        kullanici_rolu: session.rol || 'PERSONEL',
        baslik: `Kömür Yardımı İptal Edildi (${existing.ad_soyad})`,
        detay: `${existing.ad_soyad} (TC: ${existing.tc_no || '-'}) adlı hak sahibine kömür verilmeyecek olarak işaretlendi. Neden: ${neden}${aciklama ? ` | Açıklama: ${aciklama}` : ''}`,
        hedef_kisi: existing.ad_soyad,
        hedef_tc: existing.tc_no,
        mahalle: existing.mahalle,
        ek_bilgi: {
          beneficiary_id: id,
          neden,
          aciklama: aciklama || null,
          tarih: nowStr,
          personel: staff,
        },
      });

      const updatedRaw = await benCol.findOne(buildIdFilter(id));
      const updatedDoc = mapDoc(updatedRaw);

      return NextResponse.json({
        success: true,
        message: 'Kömür yardımı iptal edildi ve Kömür Verilmeyecekler listesine taşındı',
        beneficiary: updatedDoc,
      });
    } else if (action === 'KOMUR_IPTAL_GERI_AL') {
      await benCol.updateOne(buildIdFilter(id), {
        $set: {
          komur_verilmeyecek: false,
          updated_at: nowStr,
        },
        $unset: {
          komur_iptal_nedeni: '',
          komur_iptal_aciklama: '',
          komur_iptal_tarihi: '',
          komur_iptal_eden: '',
        },
      });

      // Aktif rotalardaki durağı da normale çevir
      const activeRoutes = await routeCol.find({
        durum: { $in: ['AKTIF', 'DURAKLATILDI'] },
      }).toArray();

      for (const rawR of activeRoutes) {
        const decR = mapDoc(rawR);
        const stops = decR.duraklar || [];
        let modified = false;
        stops.forEach((s: any) => {
          if (
            String(s.beneficiary_id) === String(existing.id) ||
            String(s.beneficiary_id) === String(existing._id) ||
            (existing.tc_no && s.tc_no === existing.tc_no)
          ) {
            s.komur_verilmeyecek = false;
            if (s.durum === 'IPTAL') {
              s.durum = 'BEKLIYOR';
              s.teslimat_notu = null;
            }
            modified = true;
          }
        });
        if (modified) {
          await routeCol.updateOne(buildIdFilter(decR.id || decR._id), {
            $set: {
              duraklar: stops.map(encryptRouteStop),
              updated_at: nowStr,
            },
          });
        }
      }

      await touchSyncPulse(staff);

      await recordActivityLog({
        islem_tipi: 'KOMUR_HAK_SAHIPLIGI_AKTIF_EDILDI',
        kullanici_adi: staff,
        kullanici_rolu: session.rol || 'PERSONEL',
        baslik: `Kömür Yardımı Yeniden Aktif Edildi (${existing.ad_soyad})`,
        detay: `${existing.ad_soyad} (TC: ${existing.tc_no || '-'}) adlı vatandaşın kömür yardım iptali kaldırıldı ve hak sahipliği yeniden aktif edildi.`,
        hedef_kisi: existing.ad_soyad,
        hedef_tc: existing.tc_no,
        mahalle: existing.mahalle,
        ek_bilgi: {
          beneficiary_id: id,
          tarih: nowStr,
          personel: staff,
        },
      });

      const updatedRaw = await benCol.findOne(buildIdFilter(id));
      const updatedDoc = mapDoc(updatedRaw);

      return NextResponse.json({
        success: true,
        message: 'Kömür iptali kaldırıldı, hak sahibi yeniden aktif dağıtım listesine eklendi',
        beneficiary: updatedDoc,
      });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz işlem parametresi' }, { status: 400 });
  } catch (error: any) {
    return serverError('beneficiaries:PATCH', error);
  }
}


