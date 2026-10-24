import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, reconcileArchivedSeasonImports } from '@/lib/mongodb';
import { verifySession } from '@/lib/auth';
import { normalizeToTon } from '@/lib/normalizer';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    await reconcileArchivedSeasonImports();

    const {
      isFallback,
      beneficiaries: benCol,
      deliveryHistory: histCol,
      truckDeliveries: trucksCol,
      importLogs: logsCol,
      systemSettings: settingsCol,
    } = await getDbCollections();

    // Target quota setting
    const settingDoc = await settingsCol.findOne({ key: 'varsayilan_hedef_torba' });
    const varsayilanHedefTorba = settingDoc ? parseInt(settingDoc.value, 10) : 34;

    let toplamVatandas = 0;
    let tamHane = 0;
    let eksikHane = 0;
    let bekleyenHane = 0;
    let toplamDagitilanTorba = 0;
    let toplamHedefTorba = 0;
    let iptalSayisi = 0;
    let komurVerilmeyecekHane = 0;
    let toplamTirSayisi = 0;
    let gelenNetTonaj = 0;
    let gelenBrutTonaj = 0;
    let toplamHataSayisi = 0;

    if (!isFallback && typeof benCol.aggregate === 'function') {
      // High-performance MongoDB Atlas native aggregation pipelines
      const [benAggResult, truckAggResult, iptalCount, hataCount] = await Promise.all([
        benCol.aggregate([
          {
            $group: {
              _id: null,
              toplamVatandas: { $sum: 1 },
              komurVerilmeyecekHane: {
                $sum: {
                  $cond: [{ $eq: ['$komur_verilmeyecek', true] }, 1, 0]
                }
              },
              tamHane: {
                $sum: {
                  $cond: [{ $in: ['$teslimat_durumu', ['TAMAMLANDI', 'TESLIM_EDILDI']] }, 1, 0]
                }
              },
              eksikHane: {
                $sum: {
                  $cond: [{ $eq: ['$teslimat_durumu', 'EKSIK'] }, 1, 0]
                }
              },
              bekleyenHane: {
                $sum: {
                  $cond: [
                    {
                      $not: [{ $in: ['$teslimat_durumu', ['TAMAMLANDI', 'TESLIM_EDILDI', 'EKSIK']] }]
                    },
                    1,
                    0
                  ]
                }
              },
              toplamDagitilanTorba: { $sum: { $ifNull: ['$torba_sayisi', 0] } },
              toplamHedefTorba: { $sum: { $ifNull: ['$hedef_torba', varsayilanHedefTorba] } },
            }
          }
        ]).toArray(),
        trucksCol.aggregate([
          {
            $group: {
              _id: null,
              toplamTirSayisi: { $sum: 1 },
              gelenNetTonaj: {
                $sum: {
                  $cond: [
                    { $gte: [{ $ifNull: ['$net_tonaj', 0] }, 1000] },
                    { $divide: [{ $ifNull: ['$net_tonaj', 0] }, 1000] },
                    { $ifNull: ['$net_tonaj', 0] }
                  ]
                }
              },
              gelenBrutTonaj: {
                $sum: {
                  $cond: [
                    { $gte: [{ $ifNull: ['$brut_tonaj', 0] }, 1000] },
                    { $divide: [{ $ifNull: ['$brut_tonaj', 0] }, 1000] },
                    { $ifNull: ['$brut_tonaj', 0] }
                  ]
                }
              },
            }
          }
        ]).toArray(),
        histCol.countDocuments({ islem_tipi: 'IPTAL' }),
        logsCol.countDocuments({ durum: { $ne: 'BILGI' } }),
      ]);

      if (benAggResult.length > 0) {
        const b = benAggResult[0];
        toplamVatandas = b.toplamVatandas || 0;
        komurVerilmeyecekHane = b.komurVerilmeyecekHane || 0;
        tamHane = b.tamHane || 0;
        eksikHane = b.eksikHane || 0;
        bekleyenHane = b.bekleyenHane || 0;
        toplamDagitilanTorba = b.toplamDagitilanTorba || 0;
        toplamHedefTorba = b.toplamHedefTorba || 0;
      }

      if (truckAggResult.length > 0) {
        const t = truckAggResult[0];
        toplamTirSayisi = t.toplamTirSayisi || 0;
        gelenNetTonaj = t.gelenNetTonaj || 0;
        gelenBrutTonaj = t.gelenBrutTonaj || 0;
      }

      iptalSayisi = iptalCount;
      toplamHataSayisi = hataCount;
    } else {
      // In-Memory Fallback
      const allBeneficiaries = await benCol.find({}).toArray();
      for (const b of allBeneficiaries) {
        if (b.komur_verilmeyecek) {
          komurVerilmeyecekHane += 1;
        }
        const d = b.teslimat_durumu;
        if (d === 'TAMAMLANDI' || d === 'TESLIM_EDILDI') {
          tamHane += 1;
        } else if (d === 'EKSIK') {
          eksikHane += 1;
        } else {
          bekleyenHane += 1;
        }
        toplamDagitilanTorba += Number(b.torba_sayisi || 0);
        toplamHedefTorba += Number(b.hedef_torba || varsayilanHedefTorba);
      }
      toplamVatandas = allBeneficiaries.length;

      iptalSayisi = await histCol.countDocuments({ islem_tipi: 'IPTAL' });

      const allTrucks = await trucksCol.find({}).toArray();
      toplamTirSayisi = allTrucks.length;
      for (const t of allTrucks) {
        gelenNetTonaj += normalizeToTon(t.net_tonaj || 0);
        gelenBrutTonaj += normalizeToTon(t.brut_tonaj || 0);
      }

      toplamHataSayisi = await logsCol.countDocuments({ durum: { $ne: 'BILGI' } });
    }

    const eksikKalanTorba = Math.max(0, toplamHedefTorba - toplamDagitilanTorba);
    const dagitilanTonaj = parseFloat((toplamDagitilanTorba * 0.025).toFixed(3));
    const hedefTonaj = parseFloat((toplamHedefTorba * 0.025).toFixed(3));
    const eksikTonaj = parseFloat((eksikKalanTorba * 0.025).toFixed(3));
    const netTonajFixed = parseFloat(gelenNetTonaj.toFixed(3));
    const kalanStokTonaj = parseFloat((netTonajFixed - dagitilanTonaj).toFixed(3));
    const tamamlamaYuzdesi =
      toplamHedefTorba > 0
        ? parseFloat(((toplamDagitilanTorba / toplamHedefTorba) * 100).toFixed(1))
        : 0;

    return NextResponse.json({
      success: true,
      stats: {
        varsayilanHedefTorba,
        toplamVatandas,
        komurVerilmeyecekHane,
        tamHane,
        eksikHane,
        bekleyenHane,
        teslimEdilen: tamHane,
        bekleyen: bekleyenHane,
        iptalSayisi,
        toplamDagitilanTorba,
        toplamHedefTorba,
        eksikKalanTorba,
        dagitilanTonaj,
        hedefTonaj,
        eksikTonaj,
        tamamlamaYuzdesi,
        toplamTirSayisi,
        gelenNetTonaj: netTonajFixed,
        gelenBrutTonaj: parseFloat(gelenBrutTonaj.toFixed(3)),
        kalanStokTonaj,
        toplamHataSayisi,
      },
    });
  } catch (error: any) {
    if (error?.digest === 'NEXT_PRERENDER_INTERRUPTED') throw error;
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json({ success: false, error: 'İstatistik verileri alınırken sunucu hatası oluştu.' }, { status: 500 });
  }
}
