import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, recordActivityLog, reconcileArchivedSeasonImports } from '@/lib/mongodb';
import { verifySession } from '@/lib/auth';
import { serverError, asString } from '@/lib/security';

// GET /api/import/batches - List all uploaded Excel batches with live delivery stats
export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    // Bir önceki dönem arşivlendiyse geçmiş dönem Excel listelerini ve hata kayıtlarını arşiv koleksiyonuna taşı ve aktif dönemi sıfırla
    await reconcileArchivedSeasonImports();

    const {
      importBatches: batchesCol,
      beneficiaries: benCol,
      importLogs: logsCol,
      seasonArchives,
      archivedImportBatches,
      archivedBeneficiaries,
      archivedImportLogs,
    } = await getDbCollections();

    const searchParams = request.nextUrl.searchParams;
    const requestedDonem = asString(searchParams.get('donem_kodu'), 64);
    const isArchivedQuery = Boolean(requestedDonem && requestedDonem !== 'AKTIF');

    const targetBatchesCol = isArchivedQuery ? archivedImportBatches : batchesCol;
    const targetBenCol = isArchivedQuery ? archivedBeneficiaries : benCol;
    const targetLogsCol = isArchivedQuery ? archivedImportLogs : logsCol;
    const batchQueryFilter = isArchivedQuery ? { donem_kodu: requestedDonem } : {};

    const rawBatches = await targetBatchesCol.find(batchQueryFilter).sort({ _id: -1 }).toArray();
    const batches = mapDocs(rawBatches);

    // Calculate live status for each batch
    const enrichedBatches = await Promise.all(
      batches.map(async (b: any) => {
        const batchId = b.batch_id || b.id;
        const benFilter: any = { batch_id: batchId };
        if (isArchivedQuery) benFilter.donem_kodu = requestedDonem;
        const matchingBeneficiaries = await targetBenCol.find(benFilter).toArray();
        const mevcutKisi = matchingBeneficiaries.length;

        let teslimEdilen = 0;
        let bekleyen = 0;
        let dagitilanTorba = 0;

        for (const item of matchingBeneficiaries) {
          if (item.teslimat_durumu === 'TAMAMLANDI' || item.teslimat_durumu === 'EKSIK') {
            teslimEdilen += 1;
            dagitilanTorba += Number(item.torba_sayisi || 0);
          } else {
            bekleyen += 1;
          }
        }

        const logFilter: any = { batch_id: batchId };
        if (isArchivedQuery) logFilter.donem_kodu = requestedDonem;
        const rawBatchLogs = await targetLogsCol.find(logFilter).toArray();
        const batchLogs = mapDocs(rawBatchLogs);
        const elenenSayisi = batchLogs.filter(
          (l: any) => l.islem_sonucu === 'EKLENMEDİ' || (l.islem_sonucu !== 'EKLENDİ_UYARILI' && (l.durum === 'MUKERRER_TC' || l.durum === 'MUKERRER_HANE'))
        ).length;
        const uyariliSayisi = batchLogs.filter(
          (l: any) => l.islem_sonucu === 'EKLENDİ_UYARILI'
        ).length;

        let mahalleOzet: any[] = [];
        if (matchingBeneficiaries.length > 0) {
          const mGroupMap = new Map<string, {
            mahalle: string;
            kayit_sayisi: number;
            ek_liste_no: number;
            ek_liste_adi: string;
            liste_turu: string;
            tip: 'KOY' | 'MAHALLE';
          }>();

          for (const item of matchingBeneficiaries) {
            const m = item.mahalle || 'Genel';
            const isKoy = m.endsWith('Köyü') || item.yerlesim_tipi === 'KOY';
            if (!mGroupMap.has(m)) {
              mGroupMap.set(m, {
                mahalle: m,
                kayit_sayisi: 0,
                ek_liste_no: item.ek_liste_no ?? 0,
                ek_liste_adi: item.ek_liste_adi || 'Ana Liste',
                liste_turu: item.liste_turu || 'ANA_LISTE',
                tip: isKoy ? 'KOY' : 'MAHALLE',
              });
            }
            const group = mGroupMap.get(m)!;
            group.kayit_sayisi += 1;
          }

          mahalleOzet = Array.from(mGroupMap.values()).map(g => {
            let siraAraligi = `1 - ${g.kayit_sayisi}`;
            if (g.liste_turu === 'SIGORTALI') {
              siraAraligi = g.kayit_sayisi === 1 ? `Sigortalı - 1` : `Sigortalı - 1'den Sigortalı - ${g.kayit_sayisi}'ye`;
            } else if (g.ek_liste_no > 0) {
              siraAraligi = `Ek${g.ek_liste_no} - 1'den Ek${g.ek_liste_no} - ${g.kayit_sayisi}'e`;
            }
            return {
              mahalle: g.mahalle,
              kayit_sayisi: g.kayit_sayisi,
              ek_liste_no: g.ek_liste_no,
              ek_liste_adi: g.ek_liste_adi,
              liste_turu: g.liste_turu,
              sira_araligi: siraAraligi,
              tip: g.tip,
            };
          });

          mahalleOzet.sort((a, b) => {
            if (a.tip !== b.tip) return a.tip === 'MAHALLE' ? -1 : 1;
            return a.mahalle.localeCompare(b.mahalle, 'tr');
          });
        } else if (b.mahalle_ozet && b.mahalle_ozet.length > 0) {
          mahalleOzet = b.mahalle_ozet;
        }

        return {
          ...b,
          mevcut_kisi: mevcutKisi,
          eklenen_kisi: b.eklenen_kisi ?? mevcutKisi,
          elenen_kisi: elenenSayisi,
          uyarili_kisi: uyariliSayisi,
          teslim_edilen: teslimEdilen,
          bekleyen: bekleyen,
          dagitilan_torba: dagitilanTorba,
          hata_kayit_sayisi: elenenSayisi,
          mahalle_ozet: mahalleOzet || [],
        };
      })
    );

    // Also check if there are orphan/seed beneficiaries without a batch_id
    const unbatchedCount = isArchivedQuery
      ? 0
      : await benCol.countDocuments({
          $or: [{ batch_id: { $exists: false } }, { batch_id: null }, { batch_id: '' }],
        });

    // Arşivlenmiş geçmiş dönemlerin özet bilgilerini de getir
    const rawSeasonArchives = await seasonArchives.find({}).sort({ kapanis_tarihi_iso: -1, _id: -1 }).toArray();
    const archivedSeasons = await Promise.all(
      rawSeasonArchives.map(async (sa: any) => {
        const dKod = sa.donem_kodu;
        const bCount = await archivedImportBatches.countDocuments({ donem_kodu: dKod });
        const lCount = await archivedImportLogs.countDocuments({ donem_kodu: dKod });
        return {
          donem_kodu: dKod,
          baslik: sa.baslik || `${dKod} Kömür Dağıtım Dönemi`,
          kapanis_tarihi: sa.kapanis_tarihi,
          batch_count: bCount,
          log_count: lCount,
        };
      })
    );

    return NextResponse.json({
      success: true,
      batches: enrichedBatches,
      unbatchedCount,
      isArchived: isArchivedQuery,
      donemKodu: isArchivedQuery ? requestedDonem : 'AKTIF',
      archivedSeasons,
    });
  } catch (error: any) {
    return serverError('import/batches:GET', error);
  }
}

// DELETE /api/import/batches - Delete an imported Excel batch and rollback its beneficiaries
export async function DELETE(request: NextRequest) {
  try {
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return session.response || NextResponse.json(
        { success: false, error: 'Yetkisiz erişim! Excel dosyası ve hak sahiplerini silme yetkisi sadece Yöneticilere aittir.' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const { importBatches: batchesCol, beneficiaries: benCol, importLogs: logsCol } = await getDbCollections();
    let batchId = asString(searchParams.get('batchId'), 128);
    let forceDelivered = searchParams.get('force') === 'true';

    // Also support JSON body
    if (!batchId) {
      try {
        const body = await request.json();
        batchId = asString(body.batchId, 128);
        if (body.force !== undefined) forceDelivered = Boolean(body.force);
      } catch {
        // no body
      }
    }

    if (!batchId) {
      return NextResponse.json({ success: false, error: 'Silinecek dosya (batchId) belirtilmedi' }, { status: 400 });
    }

    // Find all matching beneficiaries
    const beneficiaries = await benCol.find({ batch_id: batchId }).toArray();
    const totalBeneficiaries = beneficiaries.length;

    const delivered = beneficiaries.filter(
      (b: any) => b.teslimat_durumu === 'TAMAMLANDI' || b.teslimat_durumu === 'EKSIK'
    );
    const deliveredCount = delivered.length;

    let deletedBeneficiariesCount = 0;
    let isPartial = false;

    if (deliveredCount > 0 && !forceDelivered) {
      // Delete only the pending ones, keep delivered ones safe
      const result = await benCol.deleteMany({
        batch_id: batchId,
        teslimat_durumu: 'BEKLIYOR',
      });
      deletedBeneficiariesCount = result.deletedCount || (totalBeneficiaries - deliveredCount);
      isPartial = true;
    } else {
      // Delete all beneficiaries from this batch
      const result = await benCol.deleteMany({ batch_id: batchId });
      deletedBeneficiariesCount = result.deletedCount || totalBeneficiaries;

      // Clean up logs and batch metadata
      await logsCol.deleteMany({ batch_id: batchId });
      await batchesCol.deleteOne({
        $or: [{ batch_id: batchId }, { id: batchId }],
      });
    }

    await recordActivityLog({
      kullanici_adi: session.ad_soyad || session.username || 'Sistem Yöneticisi',
      kullanici_rolu: 'ADMIN',
      islem_tipi: 'EXCEL_SILME',
      baslik: 'Excel Dosyası Geri Alındı / Silindi',
      detay: `"${batchId}" kodlu Excel dosyasına ait ${deletedBeneficiariesCount} hak sahibi veritabanından silindi.${isPartial ? ` Teslimat yapılmış ${deliveredCount} hane korundu.` : ''}`,
      ek_bilgi: { batchId, deletedCount: deletedBeneficiariesCount, protectedCount: isPartial ? deliveredCount : 0 },
    });

    return NextResponse.json({
      success: true,
      batchId,
      deletedCount: deletedBeneficiariesCount,
      protectedCount: isPartial ? deliveredCount : 0,
      isPartial,
      message: isPartial
        ? `Bu Excel dosyasından ${deletedBeneficiariesCount} adet henüz kömür teslim edilmemiş hane başarıyla silindi. Teslimat yapılmış olan ${deliveredCount} hane korundu.`
        : `Excel dosyasına ait ${deletedBeneficiariesCount} hak sahibi kaydı ve yükleme kayıtları sistemden tamamen temizlendi.`,
    });
  } catch (error: any) {
    return serverError('import/batches:DELETE', error);
  }
}
