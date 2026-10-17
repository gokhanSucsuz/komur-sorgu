import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs } from '@/lib/mongodb';
import { isBirebirBeneficiaryMatch } from '@/lib/normalizer';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { importLogs: logsCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const batchId = (searchParams.get('batchId') || '').trim();
    const durum = (searchParams.get('durum') || '').trim();
    const islemSonucu = (searchParams.get('islemSonucu') || '').trim();
    const q = (searchParams.get('q') || '').trim();

    const filter: any = {};

    if (batchId && batchId !== 'ALL') {
      filter.batch_id = batchId;
    }

    if (durum && durum !== 'HEPSI') {
      filter.durum = durum;
    }

    const rawLogs = await logsCol
      .find(filter)
      .sort({ satir_no: 1, _id: -1 })
      .toArray();

    let logs = mapDocs(rawLogs);

    if (islemSonucu === 'EKLENMEDI') {
      logs = logs.filter(
        (l: any) => l.islem_sonucu === 'EKLENMEDİ' || l.durum === 'MUKERRER_TC' || l.durum === 'MUKERRER_HANE'
      );
    } else if (islemSonucu === 'EKLENDI_UYARILI') {
      logs = logs.filter((l: any) => l.islem_sonucu === 'EKLENDİ_UYARILI');
    }

    if (q) {
      logs = logs.filter((r: any) => {
        if (isBirebirBeneficiaryMatch(r, q)) return true;
        if (
          (r.cakisan_tc || r.cakisan_ad_soyad) &&
          isBirebirBeneficiaryMatch({ tc_no: r.cakisan_tc, ad_soyad: r.cakisan_ad_soyad }, q)
        ) {
          return true;
        }
        return false;
      });
    }

    // Get list of batches & stats using lightweight projection on unencrypted fields
    const allLogs = await logsCol
      .find({}, { projection: { batch_id: 1, tarih: 1, durum: 1, islem_sonucu: 1 } })
      .toArray();
    const batchMap = new Map<string, { batch_id: string; tarih: string; hata_sayisi: number; elenen_sayisi: number }>();

    for (const log of allLogs) {
      const bId = log.batch_id || 'Bilinmeyen Batch';
      if (!batchMap.has(bId)) {
        batchMap.set(bId, { batch_id: bId, tarih: log.tarih || '', hata_sayisi: 0, elenen_sayisi: 0 });
      }
      const b = batchMap.get(bId)!;
      b.hata_sayisi += 1;
      if (log.islem_sonucu === 'EKLENMEDİ' || log.durum === 'MUKERRER_TC' || log.durum === 'MUKERRER_HANE') {
        b.elenen_sayisi += 1;
      }
    }

    const batches = Array.from(batchMap.values()).reverse();

    // Stats
    let mukerrerTc = 0;
    let mukerrerHane = 0;
    let eksikHatali = 0;
    let elenenToplam = 0;

    const targetListForStats = batchId && batchId !== 'ALL' 
      ? allLogs.filter((l: any) => l.batch_id === batchId) 
      : allLogs;

    for (const log of targetListForStats) {
      if (log.durum === 'MUKERRER_TC') {
        mukerrerTc++;
        elenenToplam++;
      } else if (log.durum === 'MUKERRER_HANE') {
        mukerrerHane++;
        elenenToplam++;
      } else if (log.durum === 'HATALI') {
        eksikHatali++;
        if (log.islem_sonucu === 'EKLENMEDİ') {
          elenenToplam++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      logs,
      batches,
      stats: {
        toplamHata: targetListForStats.length,
        elenenToplam,
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
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return session.response || NextResponse.json(
        { success: false, error: 'Yetkisiz erişim! Excel yükleme hata kayıtlarını sadece Sistem Yöneticisi temizleyebilir.' },
        { status: 401 }
      );
    }

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
