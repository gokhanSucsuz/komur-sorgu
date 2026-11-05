import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, recordActivityLog, touchSyncPulse } from '@/lib/mongodb';
import { getIstanbulDate } from '@/lib/dateUtils';
import { verifySession } from '@/lib/auth';
import { normalizeMahalleName, isBeneficiaryAddressMissing, getBeneficiaryEffectiveListMahalle, isBeneficiaryCancelled } from '@/lib/normalizer';
import { decryptBeneficiary } from '@/lib/crypto';
import { serverError, asString } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const donemKoduParam = asString(searchParams.get('donem_kodu'), 32);

    const {
      beneficiaries: benCol,
      signatureLists,
      systemSettings,
      calismaModu,
      isSandboxMode,
    } = await getDbCollections();

    // Aktif sezon kodunu belirle
    let activeSeason = donemKoduParam;
    if (!activeSeason || activeSeason === 'AKTIF') {
      try {
        const seasonDoc = await systemSettings.findOne({ key: 'aktif_donem' });
        activeSeason = seasonDoc?.value || '2026-2027';
      } catch {
        activeSeason = '2026-2027';
      }
    }

    // Aktif dönem hak sahiplerini çek
    const rawBeneficiaries = await benCol
      .find({})
      .project({
        _id: 1,
        id: 1,
        mahalle: 1,
        acik_adres: 1,
        ad_soyad: 1,
        tc_no: 1,
        telefon: 1,
        imza_listesi_id: 1,
        imza_sonrasi_adres_degisti: 1,
        imza_listesi_mahalle: 1,
        onceki_mahalle: 1,
        ek_komur_verildi: 1,
        manuel_ek_liste_imzasi: 1,
        ek_liste_imza_notu: 1,
        teslimat_durumu: 1,
        torba_sayisi: 1,
        teslimat_tarihi: 1,
        komur_verilmeyecek: 1,
        komur_iptal_nedeni: 1,
      })
      .toArray();

    let pendingCount = 0;
    let assignedCount = 0;
    const pendingMahalleMap = new Map<string, number>();
    const missingAddressBeneficiaries: any[] = [];
    let ekKomurVerilenCount = 0;
    let ekKomurVerilenTorba = 0;
    const ekKomurVerilenBeneficiaries: any[] = [];

    for (const rawB of rawBeneficiaries) {
      const isEkKomur = Boolean(
        rawB.ek_komur_verildi ||
        rawB.manuel_ek_liste_imzasi ||
        (rawB.ek_liste_imza_notu && String(rawB.ek_liste_imza_notu).trim().length > 0)
      );
      if (isEkKomur) {
        ekKomurVerilenCount++;
        ekKomurVerilenTorba += Number(rawB.torba_sayisi || 0);
        const decEk = decryptBeneficiary(rawB);
        ekKomurVerilenBeneficiaries.push({
          id: decEk.id || decEk._id.toString(),
          tc_no: decEk.tc_no || '',
          ad_soyad: decEk.ad_soyad || '',
          mahalle: decEk.mahalle || '',
          acik_adres: decEk.acik_adres || '',
          torba_sayisi: Number(decEk.torba_sayisi || 0),
          teslimat_durumu: decEk.teslimat_durumu || 'TAMAMLANDI',
          teslimat_tarihi: decEk.teslimat_tarihi || decEk.ek_liste_imza_tarihi || '',
          ek_liste_imza_notu: decEk.ek_liste_imza_notu || (decEk.teslimat_tarihi ? `${decEk.teslimat_tarihi} tarihinde ek listeye imzası alındı` : 'Ek listeye imzası alındı'),
        });
      }

      const isAssigned = Boolean(rawB.imza_listesi_id && String(rawB.imza_listesi_id).trim().length > 0);
      if (isAssigned) {
        assignedCount++;
      } else {
        // KÖMÜR İPTAL KONTROLÜ:
        // İmza listesi yazdırılmamış kayıtlardan kömür verilmeyecek / iptal edilmiş olanlar
        // imza listesi bekleyen havuzuna dahil edilmez!
        if (isBeneficiaryCancelled(rawB)) {
          continue;
        }

        pendingCount++;
        const b = decryptBeneficiary(rawB);
        const isMissing = isBeneficiaryAddressMissing(b);
        if (isMissing) {
          missingAddressBeneficiaries.push({
            id: b.id || b._id.toString(),
            tc_no: b.tc_no || '',
            ad_soyad: b.ad_soyad || '',
            mahalle: b.mahalle || '',
            acik_adres: b.acik_adres || '',
            telefon: b.telefon || ''
          });
        }
        const m = getBeneficiaryEffectiveListMahalle(b);
        pendingMahalleMap.set(m, (pendingMahalleMap.get(m) || 0) + 1);
      }
    }

    // Kayıtlı imza listelerini çek
    const rawLists = await signatureLists.find({}).sort({ liste_no: -1 }).toArray();
    const lists = mapDocs(rawLists);

    // KURAL: Bir mahalle veya köyün ıslak imza listesi sadece 1 kez çıkarılabilir.
    // Daha önce herhangi bir imza listesi çıkarılmış olan mahalleleri topla:
    const generatedMahalleSet = new Set<string>();

    for (const l of lists) {
      if (l.mahalle) {
        const norm = normalizeMahalleName(l.mahalle);
        if (norm) generatedMahalleSet.add(norm);
        generatedMahalleSet.add(l.mahalle);
      }
      if (l.mahalle_dagilimi && typeof l.mahalle_dagilimi === 'object') {
        for (const m of Object.keys(l.mahalle_dagilimi)) {
          const norm = normalizeMahalleName(m);
          if (norm) generatedMahalleSet.add(norm);
          generatedMahalleSet.add(m);
        }
      }
    }

    for (const rawB of rawBeneficiaries) {
      const isAssigned = Boolean(rawB.imza_listesi_id && String(rawB.imza_listesi_id).trim().length > 0);
      if (isAssigned) {
        const m = rawB.imza_listesi_mahalle || rawB.mahalle;
        if (m) {
          const norm = normalizeMahalleName(m);
          if (norm) generatedMahalleSet.add(norm);
          generatedMahalleSet.add(m);
        }
      }
    }

    const pendingMahalleler = Array.from(pendingMahalleMap.entries())
      .map(([mahalle, count]) => {
        const norm = normalizeMahalleName(mahalle);
        const alreadyGenerated = generatedMahalleSet.has(norm) || generatedMahalleSet.has(mahalle);
        return {
          mahalle,
          count,
          alreadyGenerated,
        };
      })
      .sort((a, b) => a.mahalle.localeCompare(b.mahalle, 'tr', { sensitivity: 'base' }));

    const maxNo = lists.reduce((max: number, l: any) => Math.max(max, Number(l.liste_no || 0)), 0);
    const nextListNo = maxNo + 1;

    return NextResponse.json({
      success: true,
      donemKodu: activeSeason,
      calismaModu,
      isSandbox: isSandboxMode,
      totalCount: rawBeneficiaries.length,
      pendingCount,
      assignedCount,
      ekKomurVerilenCount,
      ekKomurVerilenTorba,
      ekKomurVerilenBeneficiaries,
      pendingMahalleCount: pendingMahalleMap.size,
      pendingMahalleler,
      generatedMahalleler: Array.from(generatedMahalleSet),
      missingAddressCount: missingAddressBeneficiaries.length,
      missingAddressBeneficiaries,
      nextListNo,
      lists,
    });
  } catch (error: any) {
    return serverError('signature-lists:GET', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return (
        session.response ||
        NextResponse.json(
          {
            success: false,
            error: 'Yetkisiz erişim! Islak imza listesi oluşturma ve yönetme yetkisi sadece Yöneticilere aittir.',
          },
          { status: 403 }
        )
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = asString(body.action, 64) || 'GENERATE_NEW_LIST';
    const adminName = session.ad_soyad || session.username || 'Sistem Yöneticisi';
    const { nowLocaleTr: nowStr, nowIso } = getIstanbulDate();

    const {
      beneficiaries: benCol,
      signatureLists,
      systemSettings,
      calismaModu,
      isSandboxMode,
    } = await getDbCollections();

    // 1. YENİ İMZA LİSTESİ OLUŞTURMA
    if (action === 'GENERATE_NEW_LIST') {
      let activeSeason = asString(body.donem_kodu, 32);
      if (!activeSeason || activeSeason === 'AKTIF') {
        try {
          const seasonDoc = await systemSettings.findOne({ key: 'aktif_donem' });
          activeSeason = seasonDoc?.value || '2026-2027';
        } catch {
          activeSeason = '2026-2027';
        }
      }

      // Henüz bir imza listesine atanmamış tüm hak sahiplerini bul
      // KURAL 1: Bir kayıt sadece tek bir imza listesinde olabilir!
      // Sadece imza_listesi_id'si boş/tanımsız olan kayıtlar yeni listeye dahil edilir.
      // KURAL 2: Kömür yardımı iptal edilmiş (kömür verilmeyecek) kayıtlar imza listesine DAHİL EDİLMEZ!
      const unassignedFilter: any = {
        $and: [
          {
            $or: [
              { imza_listesi_id: null },
              { imza_listesi_id: '' },
              { imza_listesi_id: { $exists: false } },
            ],
          },
          {
            komur_verilmeyecek: { $ne: true },
            teslimat_durumu: { $ne: 'IPTAL' },
          },
        ],
      };

      const unassignedDocs = await benCol
        .find(unassignedFilter)
        .project({
          _id: 1,
          id: 1,
          mahalle: 1,
          acik_adres: 1,
          ad_soyad: 1,
          tc_no: 1,
          telefon: 1,
          komur_verilmeyecek: 1,
          komur_iptal_nedeni: 1,
          teslimat_durumu: 1,
        })
        .toArray();

      // Ek güvence: Şifresi çözülmüş veya JavaScript seviyesinde iptal edilmiş olanları ele
      const eligibleDocs = unassignedDocs.filter((doc: any) => !isBeneficiaryCancelled(doc));

      if (eligibleDocs.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'İmza listesi çıkarılacak bekleyen YENİ kayıt bulunamadı. Tüm hak sahipleri zaten mevcut bir imza listesine atanmış veya kömür yardımı iptal edilmiş durumda.',
          },
          { status: 400 }
        );
      }

      // KURAL: Bir mahalle veya köyün ıslak imza listesi sadece 1 kez çıkarılabilir!
      const targetMahalle = asString(body.mahalle, 128)?.trim();
      const isSingleMahalle = Boolean(targetMahalle && targetMahalle !== 'ALL');

      // Daha önce imza listesi çıkarılmış olan mahalleleri topla
      const existingLists = await signatureLists.find({}).toArray();
      const generatedMahalleSet = new Set<string>();

      for (const l of existingLists) {
        if (l.mahalle) {
          const norm = normalizeMahalleName(l.mahalle);
          if (norm) generatedMahalleSet.add(norm);
          generatedMahalleSet.add(l.mahalle);
        }
        if (l.mahalle_dagilimi && typeof l.mahalle_dagilimi === 'object') {
          for (const m of Object.keys(l.mahalle_dagilimi)) {
            const norm = normalizeMahalleName(m);
            if (norm) generatedMahalleSet.add(norm);
            generatedMahalleSet.add(m);
          }
        }
      }

      const assignedMahalles = await benCol
        .find({
          imza_listesi_id: { $ne: null, $exists: true },
        })
        .project({ mahalle: 1, imza_listesi_mahalle: 1, imza_listesi_id: 1 })
        .toArray();

      for (const ab of assignedMahalles) {
        if (ab.imza_listesi_id && String(ab.imza_listesi_id).trim().length > 0) {
          const m = ab.imza_listesi_mahalle || ab.mahalle;
          if (m) {
            const norm = normalizeMahalleName(m);
            if (norm) generatedMahalleSet.add(norm);
            generatedMahalleSet.add(m);
          }
        }
      }

      // 1 KEZ ÇIKARILABİLİR KONTROLÜ:
      if (isSingleMahalle) {
        const normTarget = normalizeMahalleName(targetMahalle);
        if (generatedMahalleSet.has(normTarget) || generatedMahalleSet.has(targetMahalle)) {
          return NextResponse.json(
            {
              success: false,
              error: `"${targetMahalle}" için daha önce ıslak imza listesi çıkarılmıştır! Sistem kuralı gereğince bir mahalle veya köyün ıslak imza listesi sadece 1 kez çıkarılabilir.`,
              code: 'MAHALLE_ALREADY_GENERATED',
            },
            { status: 400 }
          );
        }
      }

      let docsToAssign: any[] = [];
      if (isSingleMahalle) {
        const normTarget = normalizeMahalleName(targetMahalle);
        docsToAssign = eligibleDocs.filter((doc: any) => {
          const docMah = normalizeMahalleName(doc.mahalle) || doc.mahalle;
          return docMah === normTarget || doc.mahalle === targetMahalle;
        });

        if (docsToAssign.length === 0) {
          return NextResponse.json(
            {
              success: false,
              error: `"${targetMahalle}" mahallesi/köyü için bekleyen yeni kayıt bulunamadı.`,
            },
            { status: 400 }
          );
        }
      } else {
        // Toplu oluşturmada daha önce imza listesi çıkarılmış mahalleler elenir
        docsToAssign = eligibleDocs.filter((doc: any) => {
          const norm = normalizeMahalleName(doc.mahalle) || doc.mahalle;
          return !generatedMahalleSet.has(norm) && !generatedMahalleSet.has(doc.mahalle);
        });

        if (docsToAssign.length === 0) {
          return NextResponse.json(
            {
              success: false,
              error: 'İmza listesi çıkarılacak yeni mahalle bulunamadı. Bekleyen tüm kayıtların mahalleleri için daha önce ıslak imza listesi çıkarılmıştır. Sistem kuralı gereği bir mahalle veya köy için imza listesi sadece 1 kez çıkarılabilir.',
              code: 'ALL_MAHALLELER_ALREADY_GENERATED',
            },
            { status: 400 }
          );
        }
      }

      // KURAL: Islak imza listesi çıkarılmadan önce atanacak kayıtların adresi ve mahallesi tam olmalıdır!
      const missingRecords: any[] = [];
      for (const doc of docsToAssign) {
        const decrypted = decryptBeneficiary(doc);
        if (isBeneficiaryAddressMissing(decrypted)) {
          missingRecords.push({
            id: decrypted.id || decrypted._id.toString(),
            tc_no: decrypted.tc_no || '',
            ad_soyad: decrypted.ad_soyad || '',
            mahalle: decrypted.mahalle || '',
            acik_adres: decrypted.acik_adres || '',
            telefon: decrypted.telefon || '',
          });
        }
      }

      if (missingRecords.length > 0) {
        const prefix = isSingleMahalle ? `"${targetMahalle}" için` : 'Islak imza listesi oluşturulamaz!';
        return NextResponse.json(
          {
            success: false,
            error: `${prefix} Mahallesi veya açık adresi eksik olan ${missingRecords.length} hane bulunmaktadır. Islak imza listesi çıkarılmadan önce tüm kayıtların mahalle ve adres bilgilerinin sisteme girilmesi ZORUNLUDUR.`,
            code: 'MISSING_ADDRESSES_MANDATORY_UPDATE',
            missingAddressCount: missingRecords.length,
            missingAddressBeneficiaries: missingRecords,
          },
          { status: 400 }
        );
      }

      // Sıradaki Liste No hesapla
      const maxNo = existingLists.reduce((max: number, l: any) => Math.max(max, Number(l.liste_no || 0)), 0);
      const nextNo = maxNo + 1;

      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const listId = `IMZA-${Date.now().toString(36).toUpperCase()}-${String(nextNo).padStart(3, '0')}-${randomSuffix}`;
      const listName = isSingleMahalle
        ? `${nextNo}. Dağıtım Islak İmza Listesi (${targetMahalle})`
        : nextNo === 1
        ? '1. Dağıtım Islak İmza Listesi (Genel)'
        : `${nextNo}. Dağıtım Islak İmza Listesi (Yeni Eklenen Kayıtlar)`;

      // Mahalle bazında dağılımı ve güncellenecek ID'leri topla
      const unassignedRawIds: any[] = [];
      const unassignedStringIds: string[] = [];
      const mahalleCounts: Record<string, number> = {};

      for (const item of docsToAssign) {
        if (item._id) unassignedRawIds.push(item._id);
        if (item.id) unassignedStringIds.push(String(item.id));
        const m = normalizeMahalleName(item.mahalle) || item.mahalle || 'Genel';
        mahalleCounts[m] = (mahalleCounts[m] || 0) + 1;
      }
      const mahalleSayisi = Object.keys(mahalleCounts).length;

      // TÜM ATANACAK KAYITLARI ATOMİK TOPLU GÜNCELLEME İLE KİLİTLE (updateMany):
      const updateFilter: any = {};
      if (unassignedRawIds.length > 0 && unassignedStringIds.length > 0) {
        updateFilter.$or = [
          { _id: { $in: unassignedRawIds } },
          { id: { $in: unassignedStringIds } },
        ];
      } else if (unassignedRawIds.length > 0) {
        updateFilter._id = { $in: unassignedRawIds };
      } else {
        updateFilter.id = { $in: unassignedStringIds };
      }

      await benCol.updateMany(updateFilter, {
        $set: {
          imza_listesi_id: listId,
          imza_listesi_no: nextNo,
          imza_listesi_adi: listName,
          imza_listesi_tarihi: nowStr,
          updated_at: nowStr,
        },
      });

      // İmza listesi meta-belgesini kaydet
      const newListDoc = {
        id: listId,
        liste_no: nextNo,
        liste_adi: listName,
        donem_kodu: activeSeason,
        calisma_modu: calismaModu,
        is_sandbox: isSandboxMode,
        toplam_kayit: docsToAssign.length,
        mahalle_sayisi: mahalleSayisi,
        mahalle_dagilimi: mahalleCounts,
        mahalle: isSingleMahalle ? targetMahalle : null,
        is_single_mahalle: isSingleMahalle,
        olusturan_personel: adminName,
        created_at: nowStr,
        tarih_iso: nowIso,
      };

      await signatureLists.insertOne(newListDoc);

      // Denetim Günlüğü Kaydı
      await recordActivityLog({
        kullanici_adi: adminName,
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'IMZA_LISTESI_OLUSTURMA',
        baslik: `${isSandboxMode ? '[DENEME MODU] ' : ''}Resmi Islak İmza Listesi Oluşturuldu (${listName})`,
        detay: `${isSandboxMode ? '[DENEME / TEST ALANI] ' : ''}"${listName}" kapsamında ${docsToAssign.length} hak sahibi (${isSingleMahalle ? `Tek Mahalle: ${targetMahalle}` : `${mahalleSayisi} Mahalle`}) için ıslak imza listesi oluşturuldu ve kayıtlara kilitlendi. Bir mahalle veya köyün ıslak imza listesi sadece 1 kez çıkarılabilir kuralı uygulandı.`,
        ek_bilgi: {
          listId,
          listName,
          listeNo: nextNo,
          toplamKayit: docsToAssign.length,
          mahalleSayisi,
          isSingleMahalle,
          mahalle: isSingleMahalle ? targetMahalle : null,
          calisma_modu: calismaModu,
        },
      });

      await touchSyncPulse(adminName);

      return NextResponse.json({
        success: true,
        message: `"${listName}" başarıyla oluşturuldu! ${docsToAssign.length} hane listeye kilitlendi.`,
        listId,
        listName,
        listeNo: nextNo,
        count: docsToAssign.length,
        mahalleSayisi,
        isSingleMahalle,
        mahalle: isSingleMahalle ? targetMahalle : null,
      });
    }

    // 2. İMZA LİSTESİNİ GERİ ALMA (İPTAL ETME - KAYITLARI TEKRAR BEKLEYENE DÖNDÜRME)
    if (action === 'ROLLBACK_LIST') {
      const listId = asString(body.listId, 128);
      if (!listId) {
        return NextResponse.json({ success: false, error: 'Geri alınacak liste ID belirtilmedi' }, { status: 400 });
      }

      const targetList = await signatureLists.findOne({
        $or: [{ id: listId }, { _id: listId }],
      });

      if (!targetList) {
        return NextResponse.json({ success: false, error: 'İptal edilecek imza listesi bulunamadı' }, { status: 404 });
      }

      // Bu listedeki kayıtların imza_listesi alanlarını temizle
      const updateResult = await benCol.updateMany(
        { imza_listesi_id: listId },
        {
          $set: {
            imza_listesi_id: null,
            imza_listesi_no: null,
            imza_listesi_adi: null,
            imza_listesi_tarihi: null,
            imza_sonrasi_adres_degisti: false,
            imza_listesi_mahalle: null,
            imza_listesi_acik_adres: null,
            imza_listesi_sokak: null,
            imza_listesi_kapi_no: null,
            imza_listesi_daire_no: null,
            onceki_mahalle: null,
            onceki_acik_adres: null,
            updated_at: nowStr,
          },
        }
      );

      // İmza listesini veritabanından sil
      await signatureLists.deleteOne({
        $or: [{ id: listId }, { _id: targetList._id }],
      });

      await recordActivityLog({
        kullanici_adi: adminName,
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'IMZA_LISTESI_IPTAL',
        baslik: `${isSandboxMode ? '[DENEME MODU] ' : ''}İmza Listesi İptal Edildi (${targetList.liste_adi})`,
        detay: `"${targetList.liste_adi}" iptal edildi. Bu listedeki ${updateResult.modifiedCount || 0} hane tekrar imza listesi bekleyen kayıtlar havuzuna aktarıldı.`,
        ek_bilgi: { listId, listName: targetList.liste_adi, modifiedCount: updateResult.modifiedCount },
      });

      await touchSyncPulse(adminName);

      return NextResponse.json({
        success: true,
        message: `"${targetList.liste_adi}" başarıyla iptal edildi / geri alındı. ${updateResult.modifiedCount || targetList.toplam_kayit || 0} hane tekrar bekleyen listesine aktarıldı.`,
        count: updateResult.modifiedCount || targetList.toplam_kayit || 0,
        listName: targetList.liste_adi,
      });
    }

    // 3. TÜM İMZA LİSTELERİNİ TOPLU SIFIRLAMA / GERİ ALMA
    if (action === 'RESET_ALL_LISTS') {
      const allLists = await signatureLists.find({}).toArray();
      if (allLists.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Sıfırlanacak aktif bir imza listesi bulunamadı.' },
          { status: 400 }
        );
      }

      const updateResult = await benCol.updateMany(
        {
          $or: [
            { imza_listesi_id: { $ne: null } },
            { imza_listesi_id: { $exists: true } },
          ],
        },
        {
          $set: {
            imza_listesi_id: null,
            imza_listesi_no: null,
            imza_listesi_adi: null,
            imza_listesi_tarihi: null,
            imza_sonrasi_adres_degisti: false,
            imza_listesi_mahalle: null,
            imza_listesi_acik_adres: null,
            imza_listesi_sokak: null,
            imza_listesi_kapi_no: null,
            imza_listesi_daire_no: null,
            onceki_mahalle: null,
            onceki_acik_adres: null,
            updated_at: nowStr,
          },
        }
      );

      await signatureLists.deleteMany({});

      await recordActivityLog({
        kullanici_adi: adminName,
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'IMZA_LISTESI_TOPLU_SIFIRLAMA',
        baslik: `${isSandboxMode ? '[DENEME MODU] ' : ''}Tüm İmza Listeleri İptal Edildi ve Sıfırlandı`,
        detay: `${allLists.length} adet imza listesi iptal edildi. Toplam ${updateResult.modifiedCount || 0} hane tekrar imza listesi bekleyen havuzuna aktarıldı.`,
        ek_bilgi: { listCount: allLists.length, modifiedCount: updateResult.modifiedCount },
      });

      await touchSyncPulse(adminName);

      return NextResponse.json({
        success: true,
        message: `Toplam ${allLists.length} imza listesi başarıyla iptal edildi. ${updateResult.modifiedCount || 0} hane bekleyen listeye geri alındı.`,
        count: updateResult.modifiedCount || 0,
      });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz işlem parametresi' }, { status: 400 });
  } catch (error: any) {
    return serverError('signature-lists:POST', error);
  }
}
