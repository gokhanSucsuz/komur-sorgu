import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, buildIdFilter } from '@/lib/mongodb';
import { encryptTruck, normalizeIrsaliyeNo, hashIrsaliye } from '@/lib/crypto';
import { getIstanbulDate } from '@/lib/dateUtils';
import { cleanTurkishText, turkishIncludes } from '@/lib/normalizer';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

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
        (t.dorse_plaka && turkishIncludes(t.dorse_plaka, qClean)) ||
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

    // Calculate distributed coal tonnage (1 bag = 25 kg = 0.025 tons)
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
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return session.response || NextResponse.json(
        { success: false, error: 'Yetkisiz erişim! Tır kaydı ekleme yetkisi sadece Yöneticilere aittir.' },
        { status: 401 }
      );
    }

    const { truckDeliveries: trucksCol } = await getDbCollections();
    const body = await request.json();
    const {
      tir_sirasi,
      plaka,
      dorse_plaka,
      irsaliye_no,
      ocak_cikis_tarihi,
      tarih,
      net_tonaj,
      brut_tonaj,
      sofor_adi,
      notlar,
    } = body;

    if (!plaka || !irsaliye_no || !tarih) {
      return NextResponse.json({ success: false, error: 'Tır Plakası, İrsaliye No ve Geliş Tarihi zorunludur' }, { status: 400 });
    }

    const cleanIrsaliye = String(irsaliye_no).trim().toLocaleUpperCase('tr-TR');
    const targetIrsaliyeNorm = normalizeIrsaliyeNo(cleanIrsaliye);
    const targetIrsaliyeHash = hashIrsaliye(cleanIrsaliye);

    if (!targetIrsaliyeNorm) {
      return NextResponse.json({ success: false, error: 'Geçerli bir İrsaliye / Teslimat Numarası giriniz' }, { status: 400 });
    }

    if (ocak_cikis_tarihi && tarih && ocak_cikis_tarihi > tarih) {
      return NextResponse.json(
        { success: false, error: 'Kömür ocağından çıkış tarihi, dağıtım sahasına geliş tarihinden ileri bir tarih olamaz!' },
        { status: 400 }
      );
    }

    const netVal = parseFloat(net_tonaj || '0');
    const brutVal = parseFloat(brut_tonaj || '0');

    if (isNaN(netVal) || isNaN(brutVal) || netVal <= 0 || brutVal <= 0) {
      return NextResponse.json({ success: false, error: 'Geçerli bir net ve brüt tonaj miktarı giriniz' }, { status: 400 });
    }

    if (brutVal < netVal) {
      return NextResponse.json({ success: false, error: 'Brüt tonaj, net tonajdan küçük olamaz!' }, { status: 400 });
    }

    // Birincil Anahtar Kontrolü: Aynı İrsaliye / Teslimat No ile birden fazla kayıt açılamaz
    const existingRawTrucks = await trucksCol.find({}).toArray();
    const existingTrucks = mapDocs(existingRawTrucks);

    const duplicateTruck = existingTrucks.find(
      (t: any) =>
        (targetIrsaliyeHash && t.irsaliye_hash === targetIrsaliyeHash) ||
        normalizeIrsaliyeNo(t.irsaliye_no) === targetIrsaliyeNorm
    );

    if (duplicateTruck) {
      return NextResponse.json(
        {
          success: false,
          error: `"${cleanIrsaliye}" İrsaliye / Teslimat Numarası sistemde zaten kayıtlı (#${duplicateTruck.tir_sirasi} - Plaka: ${duplicateTruck.plaka} - Tarih: ${duplicateTruck.tarih}). İrsaliye No birincil anahtardır; aynı irsaliye numarasıyla birden fazla kayıt açılamaz!`,
        },
        { status: 409 }
      );
    }

    const taraVal = parseFloat((brutVal - netVal).toFixed(3));

    // Determine truck order if not provided
    let orderNum = parseInt(tir_sirasi, 10);
    if (isNaN(orderNum) || orderNum <= 0) {
      let maxSira = 0;
      for (const t of existingRawTrucks) {
        if (Number(t.tir_sirasi) > maxSira) maxSira = Number(t.tir_sirasi);
      }
      orderNum = maxSira + 1;
    }

    const { nowLocaleTr } = getIstanbulDate();
    const newDoc = {
      tir_sirasi: orderNum,
      plaka: plaka.toUpperCase().trim(),
      dorse_plaka: dorse_plaka ? dorse_plaka.toUpperCase().trim() : null,
      irsaliye_no: cleanIrsaliye,
      ocak_cikis_tarihi: ocak_cikis_tarihi ? ocak_cikis_tarihi.trim() : tarih,
      tarih,
      net_tonaj: netVal,
      brut_tonaj: brutVal,
      tara_tonaj: taraVal,
      sofor_adi: sofor_adi ? sofor_adi.trim() : null,
      notlar: notlar ? notlar.trim() : null,
      created_at: nowLocaleTr,
    };

    // Encrypt driver name, plate, waybill, and notes with AES-256-GCM + compute irsaliye_hash
    const encryptedDoc = encryptTruck(newDoc);
    const result = await trucksCol.insertOne(encryptedDoc);
    const newId = result.insertedId ? result.insertedId.toString() : '';

    return NextResponse.json({
      success: true,
      message: 'Tır teslimatı ve tonaj kaydı başarıyla oluşturuldu',
      id: newId,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          error: 'Bu İrsaliye / Teslimat Numarası sistemde zaten kayıtlı. Aynı irsaliye numarasıyla birden fazla kayıt açılamaz!',
        },
        { status: 409 }
      );
    }
    console.error('Error adding truck delivery:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return session.response || NextResponse.json(
        { success: false, error: 'Yetkisiz erişim! Tır kaydı silme yetkisi sadece Yöneticilere aittir.' },
        { status: 401 }
      );
    }

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
