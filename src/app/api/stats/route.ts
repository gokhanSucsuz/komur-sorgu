import { NextResponse } from 'next/server';
import { getDbCollections } from '@/lib/mongodb';

export async function GET() {
  try {
    const {
      beneficiaries: benCol,
      deliveryHistory: histCol,
      truckDeliveries: trucksCol,
      importLogs: logsCol,
      systemSettings: settingsCol,
    } = await getDbCollections();

    // Target quota setting
    const settingDoc = await settingsCol.findOne({ key: 'varsayilan_hedef_torba' });
    const varsayilanHedefTorba = settingDoc ? parseInt(settingDoc.value, 10) : 34;

    // Beneficiaries Stats
    const allBeneficiaries = await benCol.find({}).toArray();
    let tamHane = 0;
    let eksikHane = 0;
    let bekleyenHane = 0;
    let toplamDagitilanTorba = 0;
    let toplamHedefTorba = 0;

    for (const b of allBeneficiaries) {
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

    const toplamVatandas = allBeneficiaries.length;
    const eksikKalanTorba = Math.max(0, toplamHedefTorba - toplamDagitilanTorba);

    // Cancellations count
    const iptalSayisi = await histCol.countDocuments({ islem_tipi: 'IPTAL' });

    // Trucks Stats
    const allTrucks = await trucksCol.find({}).toArray();
    let gelenNetTonaj = 0;
    let gelenBrutTonaj = 0;

    for (const t of allTrucks) {
      gelenNetTonaj += Number(t.net_tonaj || 0);
      gelenBrutTonaj += Number(t.brut_tonaj || 0);
    }

    // Import errors count
    const toplamHataSayisi = await logsCol.countDocuments({});

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
        toplamTirSayisi: allTrucks.length,
        gelenNetTonaj: netTonajFixed,
        gelenBrutTonaj: parseFloat(gelenBrutTonaj.toFixed(3)),
        kalanStokTonaj,
        toplamHataSayisi,
      },
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
