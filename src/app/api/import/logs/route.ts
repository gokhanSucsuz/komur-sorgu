import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const { importLogs: logsCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const batchId = (searchParams.get('batchId') || '').trim();
    const durum = (searchParams.get('durum') || '').trim();
    const q = (searchParams.get('q') || '').trim();

    const filter: any = {};

    if (batchId) {
      filter.batch_id = batchId;
    }

    if (durum && durum !== 'HEPSI') {
      filter.durum = durum;
    }

    if (q) {
      const wild = new RegExp(q.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
      filter.$or = [{ tc_no: wild }, { ad_soyad: wild }, { hata_nedeni: wild }];
    }

    const rawLogs = await logsCol
      .find(filter)
      .sort({ _id: -1 })
      .limit(500)
      .toArray();

    const logs = mapDocs(rawLogs);

    // Get list of batches
    const allLogs = await logsCol.find({}).toArray();
    const batchMap = new Map<string, { batch_id: string; tarih: string; hata_sayisi: number }>();

    for (const log of allLogs) {
      const bId = log.batch_id || 'Bilinmeyen Batch';
      if (!batchMap.has(bId)) {
        batchMap.set(bId, { batch_id: bId, tarih: log.tarih || '', hata_sayisi: 0 });
      }
      batchMap.get(bId)!.hata_sayisi += 1;
    }

    const batches = Array.from(batchMap.values()).reverse();

    // Stats
    let mukerrerTc = 0;
    let mukerrerHane = 0;
    let eksikHatali = 0;

    for (const log of allLogs) {
      if (log.durum === 'MUKERRER_TC') mukerrerTc++;
      else if (log.durum === 'MUKERRER_HANE') mukerrerHane++;
      else if (log.durum === 'HATALI') eksikHatali++;
    }

    return NextResponse.json({
      success: true,
      logs,
      batches,
      stats: {
        toplamHata: allLogs.length,
        mukerrerTc,
        mukerrerHane,
        eksikHatali,
      },
    });
  } catch (error: any) {
    console.error('Error fetching import logs:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { importLogs: logsCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const batchId = searchParams.get('batchId');

    if (batchId) {
      await logsCol.deleteMany({ batch_id: batchId });
    } else {
      await logsCol.deleteMany({});
    }

    return NextResponse.json({ success: true, message: 'Yükleme kayıtları temizlendi' });
  } catch (error: any) {
    console.error('Error clearing import logs:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
