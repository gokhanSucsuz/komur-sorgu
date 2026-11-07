import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, reconcileArchivedSeasonImports } from '@/lib/mongodb';
import { verifySession } from '@/lib/auth';
import { normalizeToTon, calculateCoalStockMetrics, isBeneficiaryCancelled } from '@/lib/normalizer';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    await reconcileArchivedSeasonImports();

    const {
      isFallback,
      isSandboxMode,
      beneficiaries: benCol,
      deliveryHistory: histCol,
      truckDeliveries: trucksCol,
      importLogs: logsCol,
      systemSettings: settingsCol,
    } = await getDbCollections();

    // Target quota setting (isolated in sandbox mode if overridden)
    const sandboxQuotaDoc = isSandboxMode
      ? await settingsCol.findOne({ key: 'sandbox_varsayilan_hedef_torba' })
      : null;
    const settingDoc = sandboxQuotaDoc || (await settingsCol.findOne({ key: 'varsayilan_hedef_torba' }));
    const varsayilanHedefTorba = settingDoc ? parseInt(settingDoc.value, 10) : 34;

    let toplamVatandas = 0; // Kayıtlı Toplam Hane
    let dagitimYapilacakHane = 0; // Kömür Dağıtımı Yapılacak Hane (İptaller Hariç)
    let komurVerilmeyecekHane = 0; // Kömür Dağıtımı İptal Edilen Hane
    let tamHane = 0;
    let eksikHane = 0;
    let bekleyenHane = 0;
    let toplamDagitilanTorba = 0;
    let toplamHedefTorba = 0; // Sadece dağıtım yapılacak hanelerin hedef torbaları
    let iptalSayisi = 0;
    let toplamTirSayisi = 0;
    let gelenNetTonaj = 0;
    let gelenBrutTonaj = 0;
    let toplamHataSayisi = 0;
    let ekKomurVerilenHane = 0;
    let ekKomurVerilenTorba = 0;

    if (!isFallback && typeof benCol.aggregate === 'function') {
      const cancelledCond = {
        $or: [
          { $eq: ['$komur_verilmeyecek', true] },
          { $eq: ['$komur_verilmeyecek', 'true'] },
          { $eq: ['$teslimat_durumu', 'IPTAL'] },
          {
            $and: [
              { $ne: ['$komur_iptal_nedeni', null] },
              { $ne: ['$komur_iptal_nedeni', ''] }
            ]
          }
        ]
      };
      const activeEligibleCond = { $not: [cancelledCond] };

      // High-performance MongoDB Atlas native aggregation pipelines
      const [benAggResult, truckAggResult, iptalCount, hataCount] = await Promise.all([
        benCol.aggregate([
          {
            $group: {
              _id: null,
              toplamVatandas: { $sum: 1 },
              komurVerilmeyecekHane: {
                $sum: {
                  $cond: [cancelledCond, 1, 0]
                }
              },
              dagitimYapilacakHane: {
                $sum: {
                  $cond: [activeEligibleCond, 1, 0]
                }
              },
              tamHane: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        activeEligibleCond,
                        { $in: ['$teslimat_durumu', ['TAMAMLANDI', 'TESLIM_EDILDI']] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              eksikHane: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        activeEligibleCond,
                        { $eq: ['$teslimat_durumu', 'EKSIK'] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              bekleyenHane: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        activeEligibleCond,
                        {
                          $not: [{ $in: ['$teslimat_durumu', ['TAMAMLANDI', 'TESLIM_EDILDI', 'EKSIK']] }]
                        }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              toplamDagitilanTorba: {
                $sum: {
                  $cond: [cancelledCond, 0, { $ifNull: ['$torba_sayisi', 0] }]
                }
              },
              toplamHedefTorba: {
                $sum: {
                  $cond: [cancelledCond, 0, { $ifNull: ['$hedef_torba', varsayilanHedefTorba] }]
                }
              },
              ekKomurVerilenHane: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        activeEligibleCond,
                        { $or: [{ $eq: ['$ek_komur_verildi', true] }, { $eq: ['$manuel_ek_liste_imzasi', true] }] },
                        { $in: ['$teslimat_durumu', ['TAMAMLANDI', 'TESLIM_EDILDI', 'EKSIK']] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              ekKomurVerilenTorba: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        activeEligibleCond,
                        { $or: [{ $eq: ['$ek_komur_verildi', true] }, { $eq: ['$manuel_ek_liste_imzasi', true] }] },
                        { $in: ['$teslimat_durumu', ['TAMAMLANDI', 'TESLIM_EDILDI', 'EKSIK']] }
                      ]
                    },
                    { $ifNull: ['$torba_sayisi', 0] },
                    0
                  ]
                }
              },
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
        dagitimYapilacakHane = b.dagitimYapilacakHane || Math.max(0, toplamVatandas - komurVerilmeyecekHane);
        tamHane = b.tamHane || 0;
        eksikHane = b.eksikHane || 0;
        bekleyenHane = b.bekleyenHane || 0;
        toplamDagitilanTorba = b.toplamDagitilanTorba || 0;
        toplamHedefTorba = b.toplamHedefTorba || 0;
        ekKomurVerilenHane = b.ekKomurVerilenHane || 0;
        ekKomurVerilenTorba = b.ekKomurVerilenTorba || 0;
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
      toplamVatandas = allBeneficiaries.length;
      for (const b of allBeneficiaries) {
        if (isBeneficiaryCancelled(b)) {
          komurVerilmeyecekHane += 1;
          continue; // Kömür iptal edilmiş kayıtlar dağıtım yapılacak hedef, bekleyen hane ve torba toplamına dahil edilmez!
        }
        dagitimYapilacakHane += 1;
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
        if (
          (b.ek_komur_verildi || b.manuel_ek_liste_imzasi) &&
          (d === 'TAMAMLANDI' || d === 'TESLIM_EDILDI' || d === 'EKSIK')
        ) {
          ekKomurVerilenHane += 1;
          ekKomurVerilenTorba += Number(b.torba_sayisi || 0);
        }
      }

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
    const hedefTonaj = parseFloat((toplamHedefTorba * 0.025).toFixed(3));
    const eksikTonaj = parseFloat((eksikKalanTorba * 0.025).toFixed(3));
    const netTonajFixed = parseFloat(gelenNetTonaj.toFixed(3));

    // Kömür torbaları standart ağırlıkta (25 kg) olmadığında stok eksiye düşürülmez;
    // eksiye düşecek fark "fazladan kömür verilmiş" olarak kayıtlara işlenir.
    const stockMetrics = calculateCoalStockMetrics(
      netTonajFixed,
      toplamDagitilanTorba,
      0.025,
      varsayilanHedefTorba
    );
    const dagitilanTonaj = stockMetrics.dagitilanNetTonaj;
    const kalanStokTonaj = stockMetrics.kalanStokTonaj;
    const fazlaDagitilanTonaj = stockMetrics.fazlaDagitilanTonaj;
    const fazlaDagitilanKg = stockMetrics.fazlaDagitilanKg;
    const fazlaDagitilanTorba = stockMetrics.fazlaDagitilanTorba;
    const fazlaDagitilanHane = stockMetrics.fazlaDagitilanHane;

    const ekKomurVerilenTonaj = parseFloat((ekKomurVerilenTorba * 0.025).toFixed(3));

    const tamamlamaYuzdesi =
      toplamHedefTorba > 0
        ? parseFloat(((toplamDagitilanTorba / toplamHedefTorba) * 100).toFixed(1))
        : 0;

    return NextResponse.json({
      success: true,
      stats: {
        varsayilanHedefTorba,
        toplamKayitliHane: toplamVatandas,
        toplamVatandas,
        dagitimYapilacakHane,
        komurVerilmeyecekHane,
        iptalHane: komurVerilmeyecekHane,
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
        resmiKabulTonaj: stockMetrics.resmiKabulTonaj,
        hedefTonaj,
        eksikTonaj,
        tamamlamaYuzdesi,
        toplamTirSayisi,
        gelenNetTonaj: netTonajFixed,
        gelenBrutTonaj: parseFloat(gelenBrutTonaj.toFixed(3)),
        kalanStokTonaj,
        beklenenStandartTorba: stockMetrics.beklenenStandartTorba,
        beklenenStandartHane: stockMetrics.beklenenStandartHane,
        beklenenTamHane: stockMetrics.beklenenTamHane,
        artanTorba: stockMetrics.artanTorba,
        artanHane: stockMetrics.artanHane,
        artanKalanTorba: stockMetrics.artanKalanTorba,
        artanHaneKesirli: stockMetrics.artanHaneKesirli,
        acikTorba: stockMetrics.acikTorba,
        acikHane: stockMetrics.acikHane,
        acikKalanTorba: stockMetrics.acikKalanTorba,
        acikHaneKesirli: stockMetrics.acikHaneKesirli,
        ortalamaTorbaKg: stockMetrics.ortalamaTorbaKg,
        ortalamaHaneKg: stockMetrics.ortalamaHaneKg,
        fazlaDagitilanTonaj,
        fazlaDagitilanKg,
        fazlaDagitilanTorba,
        fazlaDagitilanHane,
        hasFazlaDagitim: stockMetrics.hasFazlaDagitim,
        hasAcikDagitim: stockMetrics.hasAcikDagitim,
        toplamHataSayisi,
        ekKomurVerilenHane,
        ekKomurVerilenTorba,
        ekKomurVerilenTonaj,
      },
    });
  } catch (error: any) {
    if (error?.digest === 'NEXT_PRERENDER_INTERRUPTED') throw error;
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json({ success: false, error: 'İstatistik verileri alınırken sunucu hatası oluştu.' }, { status: 500 });
  }
}
