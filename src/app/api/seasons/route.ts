import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { 
  getDbCollections, 
  buildIdFilter, 
  mapDoc, 
  mapDocs, 
  recordActivityLog, 
  touchSyncPulse,
  reconcileArchivedSeasonImports
} from '@/lib/mongodb';
import { normalizeMahalleName, normalizeToTon } from '@/lib/normalizer';
import { verifySession } from '@/lib/auth';
import { getIstanbulDate } from '@/lib/dateUtils';
import { serverError, asString } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    await reconcileArchivedSeasonImports();

    const { 
      systemSettings, 
      seasonArchives, 
      beneficiaries: benCol, 
      truckDeliveries: truckCol 
    } = await getDbCollections();
    
    const searchParams = request.nextUrl.searchParams;
    const requestedCode = searchParams.get('donem_kodu');

    // 1. Fetch Active Season info
    const seasonDoc = await systemSettings.findOne({ key: 'aktif_donem' });
    let activeSeason: any = {
      kod: '2026-2027',
      baslik: '2026-2027 Kömür Dağıtım Dönemi',
      baslangic_tarihi: '2026-10-01',
      durum: 'AKTIF',
    };

    if (seasonDoc && seasonDoc.value) {
      try {
        activeSeason = typeof seasonDoc.value === 'string' ? JSON.parse(seasonDoc.value) : seasonDoc.value;
      } catch (e) {
        activeSeason.kod = String(seasonDoc.value);
      }
    }

    // Default Quota
    const quotaDoc = await systemSettings.findOne({ key: 'varsayilan_hedef_torba' });
    const defaultQuota = quotaDoc ? parseInt(quotaDoc.value, 10) : 34;

    // 2. Fetch Single Archived Season Details
    if (requestedCode) {
      const archive = await seasonArchives.findOne({ donem_kodu: requestedCode });
      if (!archive) {
        return NextResponse.json({ success: false, error: 'Arşivlenen dönem bulunamadı' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        archive: mapDoc(archive),
      });
    }

    // 3. Fetch All Past Season Archives
    const rawArchives = await seasonArchives
      .find({})
      .sort({ kapanis_tarihi_iso: -1, _id: -1 })
      .toArray();
    const archives = mapDocs(rawArchives);

    // 4. Live metrics for CURRENT active season
    const totalBeneficiaries = await benCol.countDocuments({});
    const completedCount = await benCol.countDocuments({ teslimat_durumu: 'TAMAMLANDI' });
    const eksikCount = await benCol.countDocuments({ teslimat_durumu: 'EKSIK' });
    const bekleyenCount = Math.max(0, totalBeneficiaries - completedCount - eksikCount);

    return NextResponse.json({
      success: true,
      activeSeason,
      defaultQuota,
      archives,
      archivesCount: archives.length,
      currentLiveStats: {
        totalBeneficiaries,
        completedCount,
        eksikCount,
        bekleyenCount,
        completionRate: totalBeneficiaries > 0 ? Math.round((completedCount / totalBeneficiaries) * 100) : 0,
      },
    });
  } catch (error: any) {
    return serverError('seasons:GET', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return session.response || NextResponse.json(
        { success: false, error: 'Yetkisiz erişim! Kömür dönemi ve arşiv işlemlerini sadece Sistem Yöneticisi yapabilir.' },
        { status: 401 }
      );
    }

    const { 
      isSandboxMode,
      systemSettings, 
      seasonArchives, 
      archivedBeneficiaries, 
      archivedTruckDeliveries,
      archivedDeliveryHistory,
      archivedImportBatches,
      archivedImportLogs,
      beneficiaries: benCol, 
      truckDeliveries: truckCol,
      deliveryRoutes: routeCol,
      deliveryHistory: histCol,
      importBatches: batchesCol,
      importLogs: logsCol,
    } = await getDbCollections();

    const body = await request.json();
    const { action } = body;

    if (isSandboxMode && (action === 'CLOSE_AND_ARCHIVE_SEASON' || action === 'SET_ACTIVE_SEASON')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Deneme (Test) Modundayken resmi kömür dağıtım dönemi değiştirilemez veya arşivlenemez! Resmi dönem işlemleri için lütfen önce Deneme Modunu kapatıp "Gerçek (Resmi) Mod"a geçiş yapınız.',
        },
        { status: 400 }
      );
    }

    const { nowIso, nowLocaleTr, nowEnCa } = getIstanbulDate();
    const localToday = nowEnCa;
    const localTimeStr = nowLocaleTr;

    // =========================================================================
    // ACTION 1: SET_ACTIVE_SEASON (Dönem Bilgilerini Güncelle / Belirle)
    // =========================================================================
    if (action === 'SET_ACTIVE_SEASON') {
      const { kod, baslik, baslangic_tarihi, varsayilan_hedef_torba } = body;
      const cleanCode = (kod || '').trim();
      const cleanTitle = (baslik || `${cleanCode} Kömür Dağıtım Dönemi`).trim();

      if (!cleanCode) {
        return NextResponse.json({ success: false, error: 'Dönem kodu (örn: 2026-2027) zorunludur' }, { status: 400 });
      }

      const seasonObj = {
        kod: cleanCode,
        baslik: cleanTitle,
        baslangic_tarihi: baslangic_tarihi || localToday,
        durum: 'AKTIF',
        updated_at: localTimeStr,
      };

      await systemSettings.updateOne(
        { key: 'aktif_donem' },
        { $set: { key: 'aktif_donem', value: JSON.stringify(seasonObj) } },
        { upsert: true }
      );

      if (varsayilan_hedef_torba && Number(varsayilan_hedef_torba) > 0) {
        await systemSettings.updateOne(
          { key: 'varsayilan_hedef_torba' },
          { $set: { key: 'varsayilan_hedef_torba', value: String(varsayilan_hedef_torba) } },
          { upsert: true }
        );
      }

      await recordActivityLog({
        kullanici_adi: session.ad_soyad || session.username || 'Sistem Yöneticisi',
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'DONEM_GUNCELLEME',
        baslik: 'Aktif Kömür Dağıtım Dönemi Güncellendi',
        detay: `Aktif dönem "${cleanTitle}" (${cleanCode}) olarak belirlendi.`,
      });

      return NextResponse.json({
        success: true,
        message: `Aktif kömür dönemi "${cleanTitle}" olarak güncellendi.`,
        activeSeason: seasonObj,
      });
    }

    // =========================================================================
    // ACTION 2: CLOSE_AND_ARCHIVE_SEASON (Dönemi Bitir, Tüm Verileri Arşivle & Yeni Dönem Aç)
    // =========================================================================
    if (action === 'CLOSE_AND_ARCHIVE_SEASON') {
      const {
        closing_season_kod,
        closing_season_baslik,
        new_season_kod,
        new_season_baslik,
        notlar = '',
      } = body;

      const closingCode = (closing_season_kod || '').trim();
      const newCode = (new_season_kod || '').trim();
      const kapatanKullanici = session.ad_soyad || session.username || 'Sistem Yöneticisi';

      if (!closingCode || !newCode) {
        return NextResponse.json(
          { success: false, error: 'Kapatılacak dönem kodu ve yeni başlatılacak dönem kodu zorunludur.' },
          { status: 400 }
        );
      }

      if (closingCode.toLowerCase() === newCode.toLowerCase()) {
        return NextResponse.json(
          { success: false, error: 'Yeni dönem kodu mevcut kapatılan dönem kodundan farklı olmalıdır!' },
          { status: 400 }
        );
      }

      // Check if closingCode was already archived previously
      const alreadyArchived = await seasonArchives.findOne({ donem_kodu: closingCode });
      if (alreadyArchived) {
        return NextResponse.json(
          { success: false, error: `"${closingCode}" dönemi daha önce arşivlenmiştir!` },
          { status: 400 }
        );
      }

      // 1. Fetch all beneficiaries of the closing period
      const allActiveDocs = await benCol.find({}).toArray();
      const totalHanes = allActiveDocs.length;

      let completedHanes = 0;
      let eksikHanes = 0;
      let totalDeliveredBags = 0;
      let totalTargetBags = 0;

      // Group by neighborhood for detailed breakdown report
      const mahalleMap = new Map<string, {
        mahalle: string;
        tip: 'MAHALLE' | 'KOY';
        toplam_hane: number;
        tamamlanan_hane: number;
        eksik_hane: number;
        bekleyen_hane: number;
        dagitilan_torba: number;
        hedef_torba: number;
      }>();

      for (const b of allActiveDocs) {
        const m = normalizeMahalleName(b.mahalle) || b.mahalle || 'Genel';
        const isKoy = m.toLowerCase().includes('köy') || m.toLowerCase().includes('koyu');
        
        if (!mahalleMap.has(m)) {
          mahalleMap.set(m, {
            mahalle: m,
            tip: isKoy ? 'KOY' : 'MAHALLE',
            toplam_hane: 0,
            tamamlanan_hane: 0,
            eksik_hane: 0,
            bekleyen_hane: 0,
            dagitilan_torba: 0,
            hedef_torba: 0,
          });
        }

        const mStat = mahalleMap.get(m)!;
        mStat.toplam_hane++;

        const target = Number(b.hedef_torba || 34);
        const delivered = Number(b.torba_sayisi || 0);

        totalTargetBags += target;
        totalDeliveredBags += delivered;
        mStat.hedef_torba += target;
        mStat.dagitilan_torba += delivered;

        if (b.teslimat_durumu === 'TAMAMLANDI') {
          completedHanes++;
          mStat.tamamlanan_hane++;
        } else if (b.teslimat_durumu === 'EKSIK') {
          eksikHanes++;
          mStat.eksik_hane++;
        } else {
          mStat.bekleyen_hane++;
        }
      }

      const bekleyenHanes = Math.max(0, totalHanes - completedHanes - eksikHanes);
      const overallCompletionRate = totalHanes > 0 ? Math.round((completedHanes / totalHanes) * 100) : 0;

      const mahalleOzetleri = Array.from(mahalleMap.values())
        .sort((a, b) => a.mahalle.localeCompare(b.mahalle, 'tr', { sensitivity: 'base' }))
        .map((item) => ({
          ...item,
          dagitilan_ton: (item.dagitilan_torba * 0.025).toFixed(2),
          hedef_ton: (item.hedef_torba * 0.025).toFixed(2),
          tamamlanma_orani: item.toplam_hane > 0 ? Math.round((item.tamamlanan_hane / item.toplam_hane) * 100) : 0,
        }));

      // 2. Tonnage & Trucks stats
      const trucks = await truckCol.find({}).toArray();
      let totalGelenTon = 0;
      trucks.forEach((t: any) => {
        totalGelenTon += normalizeToTon(t.net_tonaj || 0);
      });

      // 3. Quota setting
      const quotaDoc = await systemSettings.findOne({ key: 'varsayilan_hedef_torba' });
      const currentQuota = quotaDoc ? parseInt(quotaDoc.value, 10) : 34;

      // 4. Construct compact, highly-efficient season archive document
      const archiveObjectId = new ObjectId();
      const archiveDoc = {
        _id: archiveObjectId,
        id: archiveObjectId.toString(),
        donem_kodu: closingCode,
        baslik: closing_season_baslik || `${closingCode} Kömür Dağıtım Dönemi`,
        kapanis_tarihi: localToday,
        kapanis_tarihi_iso: nowIso,
        kapatan_kullanici: kapatanKullanici,
        varsayilan_hedef_torba: currentQuota,
        notlar: notlar.trim(),
        istatistikler: {
          toplam_hane: totalHanes,
          tamamlanan_hane: completedHanes,
          eksik_hane: eksikHanes,
          bekleyen_hane: bekleyenHanes,
          tamamlanma_orani: overallCompletionRate,
          toplam_dagitilan_torba: totalDeliveredBags,
          toplam_dagitilan_ton: parseFloat((totalDeliveredBags * 0.025).toFixed(2)),
          hedef_toplam_torba: totalTargetBags,
          hedef_toplam_ton: parseFloat((totalTargetBags * 0.025).toFixed(2)),
          toplam_tir: trucks.length,
          toplam_gelen_ton: parseFloat(totalGelenTon.toFixed(2)),
          mahalle_sayisi: mahalleMap.size,
        },
        mahalle_ozetleri: mahalleOzetleri,
        arsivlenme_zamani: localTimeStr,
        arsivlenme_zamani_iso: nowIso,
      };

      // Save season archive snapshot
      await seasonArchives.insertOne(archiveDoc);

      // 5. Transfer active beneficiaries to archived_beneficiaries collection in safe 500-doc chunks
      if (allActiveDocs.length > 0) {
        const CHUNK_SIZE = 500;
        for (let i = 0; i < allActiveDocs.length; i += CHUNK_SIZE) {
          const chunk = allActiveDocs.slice(i, i + CHUNK_SIZE).map((doc: any) => ({
            ...doc,
            _id: new ObjectId(), // new unique ID in archive
            original_id: doc.id || (doc._id ? doc._id.toString() : ''),
            donem_kodu: closingCode,
            arsivlenme_tarihi: localToday,
          }));

          try {
            await archivedBeneficiaries.insertMany(chunk, { ordered: false });
          } catch (chunkErr) {
            console.warn(`[Archive Batch ${i}] Notice:`, chunkErr);
          }
        }

        // Verification before deleting active beneficiaries (Fixes K6)
        const archivedBenCount = await archivedBeneficiaries.countDocuments({ donem_kodu: closingCode });
        if (archivedBenCount < allActiveDocs.length) {
          throw new Error(`Arşivleme doğrulama hatası: Beklenen ${allActiveDocs.length} hak sahibinden yalnızca ${archivedBenCount} tanesi arşivlendi. Aktif liste silinmedi!`);
        }
      }

      // Reset active beneficiaries table for the brand new season!
      await benCol.deleteMany({});

      // 6. User Rule H: Stok yeni döneme devretmeyecek, tüm tırlar ve sevkiyatlar arşivlenip sıfırlanacak
      if (trucks.length > 0) {
        const archivedTrucksList = trucks.map((t: any) => ({
          ...t,
          _id: new ObjectId(),
          original_id: t.id || (t._id ? t._id.toString() : ''),
          donem_kodu: closingCode,
          arsivlenme_tarihi: localToday,
        }));
        await archivedTruckDeliveries.insertMany(archivedTrucksList, { ordered: false });

        const archivedTruckCount = await archivedTruckDeliveries.countDocuments({ donem_kodu: closingCode });
        if (archivedTruckCount < trucks.length) {
          throw new Error(`Arşivleme doğrulama hatası: Tır sevkiyatları eksik arşivlendi. Aktif tır kayıtları silinmedi!`);
        }
        // Reset trucks so coal stock resets to 0 for the brand new season
        await truckCol.deleteMany({});
      }

      // 7. Teslimat geçmişini de kapanan dönem koduyla arşivle ve yeni dönem için sıfırla
      const activeHist = await histCol.find({}).toArray();
      if (activeHist.length > 0) {
        const archivedHistList = activeHist.map((h: any) => ({
          ...h,
          _id: new ObjectId(),
          original_id: h.id || (h._id ? h._id.toString() : ''),
          donem_kodu: closingCode,
          arsivlenme_tarihi: localToday,
        }));
        await archivedDeliveryHistory.insertMany(archivedHistList, { ordered: false });

        const archivedHistCount = await archivedDeliveryHistory.countDocuments({ donem_kodu: closingCode });
        if (archivedHistCount < activeHist.length) {
          throw new Error(`Arşivleme doğrulama hatası: Teslimat geçmişi eksik arşivlendi. Aktif geçmiş silinmedi!`);
        }
        await histCol.deleteMany({});
      }

      // 7.5. Yüklenen Excel Listeleri (import_batches) ve Hatalı/Mükerrer Kayıtların (import_logs) tamamını da kapanan dönem koduyla arşivle ve yeni dönem için sıfırla!
      const activeImportBatches = await batchesCol.find({}).toArray();
      if (activeImportBatches.length > 0) {
        const archivedBatchesList = activeImportBatches.map((b: any) => ({
          ...b,
          _id: new ObjectId(),
          original_id: b.id || (b._id ? b._id.toString() : ''),
          batch_id: b.batch_id || b.id || (b._id ? b._id.toString() : ''),
          donem_kodu: closingCode,
          arsivlenme_tarihi: localToday,
        }));
        await archivedImportBatches.insertMany(archivedBatchesList, { ordered: false });

        const archivedBatchCount = await archivedImportBatches.countDocuments({ donem_kodu: closingCode });
        if (archivedBatchCount < activeImportBatches.length) {
          throw new Error(`Arşivleme doğrulama hatası: Yüklenen Excel listeleri eksik arşivlendi. Aktif Excel listeleri silinmedi!`);
        }
        await batchesCol.deleteMany({});
      }

      const activeImportLogs = await logsCol.find({}).toArray();
      if (activeImportLogs.length > 0) {
        const CHUNK_SIZE = 500;
        for (let i = 0; i < activeImportLogs.length; i += CHUNK_SIZE) {
          const chunk = activeImportLogs.slice(i, i + CHUNK_SIZE).map((l: any) => ({
            ...l,
            _id: new ObjectId(),
            original_id: l.id || (l._id ? l._id.toString() : ''),
            donem_kodu: closingCode,
            arsivlenme_tarihi: localToday,
          }));
          try {
            await archivedImportLogs.insertMany(chunk, { ordered: false });
          } catch (chunkErr) {
            console.warn(`[Archive ImportLogs Batch ${i}] Notice:`, chunkErr);
          }
        }

        const archivedLogCount = await archivedImportLogs.countDocuments({ donem_kodu: closingCode });
        if (archivedLogCount < activeImportLogs.length) {
          throw new Error(`Arşivleme doğrulama hatası: Excel hata/mükerrer kayıtları eksik arşivlendi. Aktif hata kayıtları silinmedi!`);
        }
        await logsCol.deleteMany({});
      }

      // 8. Complete and archive all remaining active routes
      await routeCol.updateMany(
        { durum: 'AKTIF' },
        { 
          $set: 
          { 
            durum: 'ARSIVLENDI', 
            donem_kodu: closingCode,
            completed_at: localTimeStr,
            kapanis_notu: `[Dönem Kapanışı: ${closingCode}] Otomatik Arşivlendi.`
          } 
        }
      );

      // 9. Start the Brand New Season
      const newSeasonObj = {
        kod: newCode,
        baslik: new_season_baslik || `${newCode} Kömür Dağıtım Dönemi`,
        baslangic_tarihi: localToday,
        durum: 'AKTIF',
        created_at: localTimeStr,
      };

      await systemSettings.updateOne(
        { key: 'aktif_donem' },
        { $set: { key: 'aktif_donem', value: JSON.stringify(newSeasonObj) } },
        { upsert: true }
      );

      // Invalidate sync pulse across all connected devices
      await touchSyncPulse(`Dönem Arşivlendi: ${closingCode} -> ${newCode}`);

      // 10. Record comprehensive audit activity log
      await recordActivityLog({
        kullanici_adi: kapatanKullanici,
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'DONEM_ARSIVLEME',
        baslik: 'Kömür Dağıtım Dönemi Arşivlendi & Yeni Dönem Başlatıldı',
        detay: `"${closingCode}" dönemi (${totalHanes} hane, ${totalDeliveredBags} torba, ${trucks.length} tır) başarıyla arşivlendi. Yeni dağıtım dönemi "${newCode}" başlatıldı; kömür stoğu ve listeler yeni dönem için sıfırlandı.`,
        ek_bilgi: { closingCode, newCode, totalHanes, totalDeliveredBags, trucksCount: trucks.length, overallCompletionRate },
      });

      return NextResponse.json({
        success: true,
        message: `"${closingCode}" dönemi tüm verileri, tır sevkiyatları ve mahalle raporlarıyla başarıyla arşivlendi. Yeni dönem ("${newCode}") başlatıldı ve kömür stoğu sıfırlandı.`,
        archivedSeason: archiveDoc,
        newActiveSeason: newSeasonObj,
      });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz işlem (action)' }, { status: 400 });
  } catch (error: any) {
    return serverError('seasons:POST', error);
  }
}
