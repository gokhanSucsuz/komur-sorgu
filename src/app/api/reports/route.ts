import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const {
      beneficiaries: benCol,
      deliveryHistory: histCol,
      truckDeliveries: trucksCol,
      systemSettings: settingsCol,
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

    const filteredBeneficiaries = await benCol.find(benFilter).toArray();
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
    const allBeneficiaries = await benCol.find({}).toArray();
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
        dagitilanTonaj: parseFloat(((m.dagitilanTorba || 0) * 0.025).toFixed(2)),
        hedefTonaj: parseFloat(((m.hedefTorba || 0) * 0.025).toFixed(2)),
        yuzde: m.hedefTorba > 0 ? parseFloat(((m.dagitilanTorba / m.hedefTorba) * 100).toFixed(1)) : 0,
      }));

    // 6. Truck Arrivals in Date Range
    const truckFilter: any = {};
    if (startDate) truckFilter.tarih = { ...(truckFilter.tarih || {}), $gte: startDate };
    if (endDate) truckFilter.tarih = { ...(truckFilter.tarih || {}), $lte: endDate };

    const rawTrucks = await trucksCol
      .find(truckFilter)
      .sort({ tarih: -1, tir_sirasi: -1 })
      .toArray();

    const trucks = mapDocs(rawTrucks);

    const toplamTirSayisi = trucks.length;
    const gelenNetTonaj = parseFloat(trucks.reduce((acc, t) => acc + (t.net_tonaj || 0), 0).toFixed(3));
    const gelenBrutTonaj = parseFloat(trucks.reduce((acc, t) => acc + (t.brut_tonaj || 0), 0).toFixed(3));

    // Overall Remaining Stock (All trucks vs All deliveries)
    const allAllTrucks = await trucksCol.find({}).toArray();
    const sahadakiToplamGelenTon = allAllTrucks.reduce((acc: number, t: any) => acc + Number(t.net_tonaj || 0), 0);
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
        deliveries,
        trucks,
      },
    });
  } catch (error: any) {
    console.error('Error generating report:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
