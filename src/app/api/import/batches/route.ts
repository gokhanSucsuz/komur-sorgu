import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, buildIdFilter, recordActivityLog } from '@/lib/mongodb';

// GET /api/import/batches - List all uploaded Excel batches with live delivery stats
export async function GET() {
  try {
    const { importBatches: batchesCol, beneficiaries: benCol, importLogs: logsCol } = await getDbCollections();

    const rawBatches = await batchesCol.find({}).sort({ _id: -1 }).toArray();
    const batches = mapDocs(rawBatches);

    // Calculate live status for each batch
    const enrichedBatches = await Promise.all(
      batches.map(async (b: any) => {
        const batchId = b.batch_id || b.id;
        const matchingBeneficiaries = await benCol.find({ batch_id: batchId }).toArray();
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

        const hataliKayitSayisi = await logsCol.countDocuments({ batch_id: batchId });

        return {
          ...b,
          mevcut_kisi: mevcutKisi,
          teslim_edilen: teslimEdilen,
          bekleyen: bekleyen,
          dagitilan_torba: dagitilanTorba,
          hata_kayit_sayisi: hataliKayitSayisi || b.hatali_kisi || 0,
        };
      })
    );

    // Also check if there are orphan/seed beneficiaries without a batch_id
    const unbatchedCount = await benCol.countDocuments({
      $or: [{ batch_id: { $exists: false } }, { batch_id: null }, { batch_id: '' }],
    });

    return NextResponse.json({
      success: true,
      batches: enrichedBatches,
      unbatchedCount,
    });
  } catch (error: any) {
    console.error('Error fetching import batches:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/import/batches - Delete an imported Excel batch and rollback its beneficiaries
export async function DELETE(request: NextRequest) {
  try {
    const { importBatches: batchesCol, beneficiaries: benCol, importLogs: logsCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    let batchId = searchParams.get('batchId');
    let forceDelivered = searchParams.get('force') === 'true';

    // Also support JSON body
    if (!batchId) {
      try {
        const body = await request.json();
        batchId = body.batchId;
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
      kullanici_adi: 'Sistem Yöneticisi',
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
    console.error('Error deleting import batch:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
