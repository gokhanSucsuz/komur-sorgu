import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, buildIdFilter } from '@/lib/mongodb';
import { encryptTruck } from '@/lib/crypto';
import { cleanTurkishText, turkishIncludes } from '@/lib/normalizer';

export async function GET(request: NextRequest) {
  try {
    const { truckDeliveries: trucksCol, beneficiaries: benCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const q = (searchParams.get('q') || '').trim();

    const rawTrucks = await trucksCol
      .find({})
      .sort({ tarih: -1, tir_sirasi: -1 })
      .toArray();

    let trucks = mapDocs(rawTrucks);

    if (q) {
      const qClean = cleanTurkishText(q);
      trucks = trucks.filter((t: any) =>
        (t.plaka && turkishIncludes(t.plaka, qClean)) ||
        (t.sofor_adi && turkishIncludes(t.sofor_adi, qClean)) ||
        (t.irsaliye_no && turkishIncludes(t.irsaliye_no, qClean)) ||
        (t.notlar && turkishIncludes(t.notlar, qClean))
      );
    }

    // Calculate aggregated truck metrics
    const allTrucks = await trucksCol.find({}).toArray();
    let toplamNetTonaj = 0;
    let toplamBrutTonaj = 0;
    let toplamTaraTonaj = 0;
    let maxSira = 0;

    for (const t of allTrucks) {
      toplamNetTonaj += Number(t.net_tonaj || 0);
      toplamBrutTonaj += Number(t.brut_tonaj || 0);
      toplamTaraTonaj += Number(t.tara_tonaj || 0);
      if (Number(t.tir_sirasi) > maxSira) {
        maxSira = Number(t.tir_sirasi);
      }
    }

    // Calculate distributed coal tonnage
    // 1 bag = 25 kg = 0.025 tons
    const allBeneficiaries = await benCol.find({}).toArray();
    let toplamDagitilanTorba = 0;
    for (const b of allBeneficiaries) {
      toplamDagitilanTorba += Number(b.torba_sayisi || 0);
    }

    const dagitilanNetTonaj = parseFloat((toplamDagitilanTorba * 0.025).toFixed(3));
    const kalanStokTonaj = parseFloat((toplamNetTonaj - dagitilanNetTonaj).toFixed(3));
    const sonrakiTirSirasi = maxSira + 1;

    return NextResponse.json({
      success: true,
      trucks,
      stats: {
        toplamTirSayisi: allTrucks.length,
        toplamNetTonaj: parseFloat(toplamNetTonaj.toFixed(3)),
        toplamBrutTonaj: parseFloat(toplamBrutTonaj.toFixed(3)),
        toplamTaraTonaj: parseFloat(toplamTaraTonaj.toFixed(3)),
        toplamDagitilanTorba,
        dagitilanNetTonaj,
        kalanStokTonaj,
        sonrakiTirSirasi,
      },
    });
  } catch (error: any) {
    console.error('Error fetching truck deliveries:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { truckDeliveries: trucksCol } = await getDbCollections();
    const body = await request.json();
    const { tir_sirasi, plaka, irsaliye_no, tarih, net_tonaj, brut_tonaj, sofor_adi, notlar } = body;

    if (!plaka || !irsaliye_no || !tarih) {
      return NextResponse.json({ success: false, error: 'Plaka, İrsaliye No ve Tarih zorunludur' }, { status: 400 });
    }

    const netVal = parseFloat(net_tonaj || '0');
    const brutVal = parseFloat(brut_tonaj || '0');

    if (isNaN(netVal) || isNaN(brutVal) || netVal <= 0 || brutVal <= 0) {
      return NextResponse.json({ success: false, error: 'Geçerli bir net ve brüt tonaj miktarı giriniz' }, { status: 400 });
    }

    if (brutVal < netVal) {
      return NextResponse.json({ success: false, error: 'Brüt tonaj, net tonajdan küçük olamaz!' }, { status: 400 });
    }

    const taraVal = parseFloat((brutVal - netVal).toFixed(3));

    // Determine truck order if not provided
    let orderNum = parseInt(tir_sirasi, 10);
    if (isNaN(orderNum) || orderNum <= 0) {
      const allTrucks = await trucksCol.find({}).toArray();
      let maxSira = 0;
      for (const t of allTrucks) {
        if (Number(t.tir_sirasi) > maxSira) maxSira = Number(t.tir_sirasi);
      }
      orderNum = maxSira + 1;
    }

    const nowStr = new Date().toLocaleString('tr-TR');
    const newDoc = {
      tir_sirasi: orderNum,
      plaka: plaka.toUpperCase().trim(),
      irsaliye_no: irsaliye_no.trim(),
      tarih,
      net_tonaj: netVal,
      brut_tonaj: brutVal,
      tara_tonaj: taraVal,
      sofor_adi: sofor_adi ? sofor_adi.trim() : null,
      notlar: notlar ? notlar.trim() : null,
      created_at: nowStr,
    };

    // Encrypt driver name, plate, waybill, and notes with AES-256-GCM
    const encryptedDoc = encryptTruck(newDoc);
    const result = await trucksCol.insertOne(encryptedDoc);
    const newId = result.insertedId ? result.insertedId.toString() : '';

    return NextResponse.json({
      success: true,
      message: 'Tır teslimatı ve tonaj kaydı başarıyla oluşturuldu',
      id: newId,
    });
  } catch (error: any) {
    console.error('Error adding truck delivery:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { truckDeliveries: trucksCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Tır ID belirtilmedi' }, { status: 400 });
    }

    await trucksCol.deleteOne(buildIdFilter(id));

    return NextResponse.json({ success: true, message: 'Tır kaydı silindi' });
  } catch (error: any) {
    console.error('Error deleting truck record:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
