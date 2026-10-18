import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs } from '@/lib/mongodb';
import { getRecordStreetInfo, normalizeToTon } from '@/lib/normalizer';
import { verifySession } from '@/lib/auth';
import { decryptField, isEncrypted } from '@/lib/crypto';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const {
      beneficiaries: benCol,
      deliveryHistory: histCol,
      truckDeliveries: trucksCol,
      systemSettings: settingsCol,
      importBatches: batchesCol,
    } = await getDbCollections();

    const searchParams = request.nextUrl.searchParams;
    const startDate = (searchParams.get('startDate') || '').trim(); // YYYY-MM-DD
    const endDate = (searchParams.get('endDate') || '').trim(); // YYYY-MM-DD
    const mahalle = (searchParams.get('mahalle') || '').trim();

    // 1. Target quota setting
    const settingDoc = await settingsCol.findOne({ key: 'varsayilan_hedef_torba' });
    const varsayilanHedefTorba = settingDoc ? parseInt(settingDoc.value, 10) : 34;

    // 2. Beneficiaries Overview
    const benFilter: any = {};
    if (mahalle && mahalle !== 'HEPSI') {
      benFilter.mahalle = mahalle;
    }

    const rawFiltered = await benCol.find(benFilter).toArray();
    const filteredBeneficiaries = mapDocs(rawFiltered);
    let toplamHane = filteredBeneficiaries.length;
    let tamHane = 0;
    let eksikHane = 0;
    let bekleyenHane = 0;
    let dagitilanTorba = 0;
    let hedefTorba = 0;

    for (const b of filteredBeneficiaries) {
      const d = b.teslimat_durumu;
      if (d === 'TAMAMLANDI' || d === 'TESLIM_EDILDI') {
        tamHane += 1;
      } else if (d === 'EKSIK') {
        eksikHane += 1;
      } else {
        bekleyenHane += 1;
      }

      dagitilanTorba += Number(b.torba_sayisi || 0);
      hedefTorba += Number(b.hedef_torba || varsayilanHedefTorba);
    }

    const eksikTorba = Math.max(0, hedefTorba - dagitilanTorba);
    const dagitilanTonaj = parseFloat((dagitilanTorba * 0.025).toFixed(3));
    const hedefTonaj = parseFloat((hedefTorba * 0.025).toFixed(3));
    const eksikTonaj = parseFloat((eksikTorba * 0.025).toFixed(3));
    const tamamlamaYuzdesi =
      hedefTorba > 0 ? parseFloat(((dagitilanTorba / hedefTorba) * 100).toFixed(1)) : 0;

    // 3. Deliveries within Date Range
    const histFilter: any = {};
    if (startDate) histFilter.gun_tarihi = { ...(histFilter.gun_tarihi || {}), $gte: startDate };
    if (endDate) histFilter.gun_tarihi = { ...(histFilter.gun_tarihi || {}), $lte: endDate };
    if (mahalle && mahalle !== 'HEPSI') histFilter.mahalle = mahalle;

    const rawDeliveries = await histCol
      .find(histFilter)
      .sort({ tarih: -1 })
      .toArray();

    const deliveries = mapDocs(rawDeliveries);

    // Date range stats
    const donemTeslimatSayisi = deliveries.filter((d) => d.islem_tipi === 'TESLIMAT').length;
    const donemTorbaSayisi = deliveries
      .filter((d) => d.islem_tipi === 'TESLIMAT')
      .reduce((acc, curr) => acc + (curr.torba_sayisi || 0), 0);
    const donemTonaj = parseFloat((donemTorbaSayisi * 0.025).toFixed(3));
    const donemIptalSayisi = deliveries.filter((d) => d.islem_tipi === 'IPTAL').length;

    // Daily breakdown for date range
    const dailyMap = new Map<string, { gun: string; torba: number; teslimat: number; iptal: number }>();
    for (const d of deliveries) {
      const g = d.gun_tarihi || 'Tarihsiz';
      if (!dailyMap.has(g)) {
        dailyMap.set(g, { gun: g, torba: 0, teslimat: 0, iptal: 0 });
      }
      const entry = dailyMap.get(g)!;
      if (d.islem_tipi === 'TESLIMAT') {
        entry.torba += d.torba_sayisi || 0;
        entry.teslimat += 1;
      } else if (d.islem_tipi === 'IPTAL') {
        entry.iptal += 1;
      }
    }
    const dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) => b.gun.localeCompare(a.gun));

    // 4. Incomplete Households Detailed List
    const eksikFilter: any = { teslimat_durumu: 'EKSIK' };
    if (mahalle && mahalle !== 'HEPSI') {
      eksikFilter.mahalle = mahalle;
    }
    const rawEksik = await benCol
      .find(eksikFilter)
      .sort({ mahalle: 1, ad_soyad: 1 })
      .toArray();

    const eksikHaneler = mapDocs(rawEksik).map((m: any) => ({
      ...m,
      eksik_torba: Math.max(0, (m.hedef_torba || 34) - (m.torba_sayisi || 0)),
    }));

    // 5. Neighborhood Completion Comparison
    const rawAllBeneficiaries = await benCol.find({}).toArray();
    const allBeneficiaries = mapDocs(rawAllBeneficiaries);
    const mahMap = new Map<string, any>();

    for (const b of allBeneficiaries) {
      const m = b.mahalle || 'Diğer';
      if (!mahMap.has(m)) {
        mahMap.set(m, {
          mahalle: m,
          toplamHane: 0,
          tamHane: 0,
          eksikHane: 0,
          bekleyenHane: 0,
          dagitilanTorba: 0,
          hedefTorba: 0,
        });
      }
      const item = mahMap.get(m)!;
      item.toplamHane += 1;
      const d = b.teslimat_durumu;
      if (d === 'TAMAMLANDI' || d === 'TESLIM_EDILDI') {
        item.tamHane += 1;
      } else if (d === 'EKSIK') {
        item.eksikHane += 1;
      } else {
        item.bekleyenHane += 1;
      }

      item.dagitilanTorba += Number(b.torba_sayisi || 0);
      item.hedefTorba += Number(b.hedef_torba || varsayilanHedefTorba);
    }

    const mahalleStats = Array.from(mahMap.values())
      .sort((a, b) => a.mahalle.localeCompare(b.mahalle, 'tr', { sensitivity: 'base' }))
      .map((m: any) => ({
        ...m,
        toplamKayit: m.toplamHane,
        teslimEdilen: m.tamHane,
        teslimEdilmeyen: m.bekleyenHane + m.eksikHane,
        kalanTorba: Math.max(0, m.hedefTorba - m.dagitilanTorba),
        tip: (/(?:Köyü|Koy|Koyu)$/i.test(m.mahalle) ? 'KOY' : 'MAHALLE'),
        dagitilanTonaj: parseFloat(((m.dagitilanTorba || 0) * 0.025).toFixed(2)),
        hedefTonaj: parseFloat(((m.hedefTorba || 0) * 0.025).toFixed(2)),
        yuzde: m.hedefTorba > 0 ? parseFloat(((m.dagitilanTorba / m.hedefTorba) * 100).toFixed(1)) : 0,
      }));

    // 6. Street and Cadde Level Breakdown (Sokak sokak, cadde cadde döküm)
    const sokakMap = new Map<string, {
      mahalle: string;
      sokak: string;
      toplamKayit: number;
      teslimEdilen: number;
      teslimEdilmeyen: number;
      eksik: number;
      dagitilanTorba: number;
    }>();

    for (const b of allBeneficiaries) {
      const m = b.mahalle || 'Belirtilmemiş';
      const stInfo = getRecordStreetInfo(b);
      let sName = stInfo.sokak || 'Sokak Belirtilmemiş';
      if (typeof sName === 'string' && isEncrypted(sName)) {
        try {
          sName = decryptField(sName) || 'Sokak Belirtilmemiş';
        } catch {
          sName = 'Sokak Belirtilmemiş';
        }
      }
      if (typeof sName === 'string' && (sName.startsWith('ENC:GCM:v1:') || sName.startsWith('ENC:'))) {
        sName = 'Sokak Belirtilmemiş';
      }
      const key = `${m}:::${sName}`;

      if (!sokakMap.has(key)) {
        sokakMap.set(key, {
          mahalle: m,
          sokak: sName,
          toplamKayit: 0,
          teslimEdilen: 0,
          teslimEdilmeyen: 0,
          eksik: 0,
          dagitilanTorba: 0,
        });
      }

      const sItem = sokakMap.get(key)!;
      sItem.toplamKayit += 1;
      const d = b.teslimat_durumu;
      if (d === 'TAMAMLANDI' || d === 'TESLIM_EDILDI') {
        sItem.teslimEdilen += 1;
      } else if (d === 'EKSIK') {
        sItem.eksik += 1;
        sItem.teslimEdilmeyen += 1;
      } else {
        sItem.teslimEdilmeyen += 1;
      }
      sItem.dagitilanTorba += Number(b.torba_sayisi || 0);
    }

    const sokakStats = Array.from(sokakMap.values())
      .sort((a, b) => {
        const mComp = a.mahalle.localeCompare(b.mahalle, 'tr');
        if (mComp !== 0) return mComp;
        return a.sokak.localeCompare(b.sokak, 'tr');
      })
      .map((item) => ({
        ...item,
        yuzde: item.toplamKayit > 0 ? parseFloat(((item.teslimEdilen / item.toplamKayit) * 100).toFixed(1)) : 0,
      }));

    // 7. Uploaded Excel Batches Breakdown (Her dosya yükleme ve ek liste işlemi ayrı ayrı)
    const rawBatches = await batchesCol.find({}).sort({ _id: -1 }).toArray();
    const batches = mapDocs(rawBatches);

    // Group beneficiaries by batch_id
    const beneficiariesByBatch = new Map<string, any[]>();
    for (const b of allBeneficiaries) {
      const bId = b.batch_id || 'ONCEKI_KAYITLAR';
      if (!beneficiariesByBatch.has(bId)) {
        beneficiariesByBatch.set(bId, []);
      }
      beneficiariesByBatch.get(bId)!.push(b);
    }

    const batchStats: any[] = [];

    for (const batch of batches) {
      const bId = batch.batch_id || batch.id;
      const list = beneficiariesByBatch.get(bId) || [];

      // Mahalle breakdown within this batch
      const mBatchMap = new Map<string, {
        mahalle: string;
        ekListeAdi: string;
        ekListeNo: number;
        siraNoList: string[];
        toplamKayit: number;
        teslimEdilen: number;
        bekleyen: number;
        eksik: number;
      }>();

      let batchDelivered = 0;
      let batchPending = 0;

      for (const b of list) {
        const m = b.mahalle || 'Belirtilmemiş';
        if (!mBatchMap.has(m)) {
          mBatchMap.set(m, {
            mahalle: m,
            ekListeAdi: b.ek_liste_adi || (b.sira_no && b.sira_no.startsWith('Ek') ? `Ek ${b.sira_no.replace(/^Ek\s*(\d+).*/i, '$1')}` : 'Ana Liste'),
            ekListeNo: typeof b.ek_liste_no === 'number' ? b.ek_liste_no : (b.sira_no && b.sira_no.startsWith('Ek') ? parseInt(b.sira_no.replace(/^Ek\s*(\d+).*/i, '$1'), 10) || 0 : 0),
            siraNoList: [],
            toplamKayit: 0,
            teslimEdilen: 0,
            bekleyen: 0,
            eksik: 0,
          });
        }

        const mItem = mBatchMap.get(m)!;
        mItem.toplamKayit += 1;
        if (b.sira_no) mItem.siraNoList.push(b.sira_no);

        const d = b.teslimat_durumu;
        if (d === 'TAMAMLANDI' || d === 'TESLIM_EDILDI') {
          mItem.teslimEdilen += 1;
          batchDelivered += 1;
        } else if (d === 'EKSIK') {
          mItem.eksik += 1;
          mItem.bekleyen += 1;
          batchPending += 1;
        } else {
          mItem.bekleyen += 1;
          batchPending += 1;
        }
      }

      const mahalleler = Array.from(mBatchMap.values()).map((m) => {
        let siraAraligi = '';
        if (m.siraNoList.length > 0) {
          const first = m.siraNoList[0];
          const last = m.siraNoList[m.siraNoList.length - 1];
          siraAraligi = first === last ? first : `${first} - ${last}`;
        } else {
          siraAraligi = m.ekListeNo === 0 ? `1 - ${m.toplamKayit}` : `Ek${m.ekListeNo} - 1'den Ek${m.ekListeNo} - ${m.toplamKayit}'e`;
        }
        return {
          mahalle: m.mahalle,
          ekListeAdi: m.ekListeAdi,
          ekListeNo: m.ekListeNo,
          siraAraligi,
          toplamKayit: m.toplamKayit,
          teslimEdilen: m.teslimEdilen,
          bekleyen: m.bekleyen,
          eksik: m.eksik,
          yuzde: m.toplamKayit > 0 ? parseFloat(((m.teslimEdilen / m.toplamKayit) * 100).toFixed(1)) : 0,
        };
      });

      batchStats.push({
        batchId: bId,
        dosyaAdi: batch.dosya_adi || 'Excel Dosyası',
        yuklemeTarihi: batch.created_at || 'Tarih Belirtilmedi',
        toplamSatir: batch.toplam_satir || list.length,
        eklenenKisi: list.length,
        teslimEdilen: batchDelivered,
        bekleyen: batchPending,
        yuzde: list.length > 0 ? parseFloat(((batchDelivered / list.length) * 100).toFixed(1)) : 0,
        mahalleler,
      });
    }

    // Also check unbatched or initial seed records if any
    const unbatchedList = beneficiariesByBatch.get('ONCEKI_KAYITLAR') || [];
    if (unbatchedList.length > 0) {
      const mBatchMap = new Map<string, any>();
      let del = 0;
      let pend = 0;
      for (const b of unbatchedList) {
        const m = b.mahalle || 'Merkez';
        if (!mBatchMap.has(m)) {
          mBatchMap.set(m, { mahalle: m, ekListeAdi: 'Ana Liste', siraNoList: [], toplamKayit: 0, teslimEdilen: 0, bekleyen: 0 });
        }
        const mi = mBatchMap.get(m)!;
        mi.toplamKayit += 1;
        if (b.sira_no) mi.siraNoList.push(b.sira_no);
        if (b.teslimat_durumu === 'TAMAMLANDI' || b.teslimat_durumu === 'TESLIM_EDILDI') {
          mi.teslimEdilen += 1;
          del += 1;
        } else {
          mi.bekleyen += 1;
          pend += 1;
        }
      }

      batchStats.unshift({
        batchId: 'ONCEKI_KAYITLAR',
        dosyaAdi: 'İlk Kayıtlar / Sistem Başlangıç Verileri',
        yuklemeTarihi: 'Sistem Başlangıcı',
        toplamSatir: unbatchedList.length,
        eklenenKisi: unbatchedList.length,
        teslimEdilen: del,
        bekleyen: pend,
        yuzde: unbatchedList.length > 0 ? parseFloat(((del / unbatchedList.length) * 100).toFixed(1)) : 0,
        mahalleler: Array.from(mBatchMap.values()).map((m) => ({
          mahalle: m.mahalle,
          ekListeAdi: m.ekListeAdi,
          ekListeNo: 0,
          siraAraligi: `1 - ${m.toplamKayit}`,
          toplamKayit: m.toplamKayit,
          teslimEdilen: m.teslimEdilen,
          bekleyen: m.bekleyen,
          yuzde: m.toplamKayit > 0 ? parseFloat(((m.teslimEdilen / m.toplamKayit) * 100).toFixed(1)) : 0,
        })),
      });
    }

    // 8. Truck Arrivals in Date Range
    const truckFilter: any = {};
    if (startDate) truckFilter.tarih = { ...(truckFilter.tarih || {}), $gte: startDate };
    if (endDate) truckFilter.tarih = { ...(truckFilter.tarih || {}), $lte: endDate };

    const rawTrucks = await trucksCol
      .find(truckFilter)
      .sort({ tarih: -1, tir_sirasi: -1 })
      .toArray();

    const trucks = mapDocs(rawTrucks);

    const toplamTirSayisi = trucks.length;
    const gelenNetTonaj = parseFloat(trucks.reduce((acc, t) => acc + normalizeToTon(t.net_tonaj), 0).toFixed(3));
    const gelenBrutTonaj = parseFloat(trucks.reduce((acc, t) => acc + normalizeToTon(t.brut_tonaj), 0).toFixed(3));

    // Overall Remaining Stock (All trucks vs All deliveries)
    const allAllTrucks = await trucksCol.find({}).toArray();
    const sahadakiToplamGelenTon = allAllTrucks.reduce((acc: number, t: any) => acc + normalizeToTon(t.net_tonaj), 0);
    const sahadakiToplamDagitilanBags = allBeneficiaries.reduce((acc: number, b: any) => acc + Number(b.torba_sayisi || 0), 0);
    const sahadakiToplamDagitilanTon = parseFloat((sahadakiToplamDagitilanBags * 0.025).toFixed(3));
    const kalanStokTonaj = parseFloat((sahadakiToplamGelenTon - sahadakiToplamDagitilanTon).toFixed(3));

    return NextResponse.json({
      success: true,
      reportData: {
        filters: { startDate, endDate, mahalle },
        varsayilanHedefTorba,
        summary: {
          toplamHane,
          tamHane,
          eksikHane,
          bekleyenHane,
          dagitilanTorba,
          hedefTorba,
          eksikTorba,
          dagitilanTonaj,
          hedefTonaj,
          eksikTonaj,
          tamamlamaYuzdesi,
          kalanStokTonaj,
        },
        donemStats: {
          donemTeslimatSayisi,
          donemTorbaSayisi,
          donemTonaj,
          donemIptalSayisi,
          toplamTirSayisi,
          gelenNetTonaj,
          gelenBrutTonaj,
        },
        dailyBreakdown,
        eksikHaneler,
        mahalleStats,
        sokakStats,
        batchStats,
        deliveries,
        trucks,
      },
    });
  } catch (error: any) {
    if (error?.digest === 'NEXT_PRERENDER_INTERRUPTED') throw error;
    console.error('Error generating report:', error);
    return NextResponse.json({ success: false, error: 'Rapor verileri oluşturulurken sunucu hatası oluştu.' }, { status: 500 });
  }
}
