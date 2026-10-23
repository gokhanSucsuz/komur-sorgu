import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, mapDoc, buildIdFilter, recordActivityLog, touchSyncPulse } from '@/lib/mongodb';
import { encryptTruck, normalizeIrsaliyeNo, hashIrsaliye } from '@/lib/crypto';
import { getIstanbulDate } from '@/lib/dateUtils';
import { turkishIncludes, normalizeToTon, formatTonnage } from '@/lib/normalizer';
import { verifySession } from '@/lib/auth';
import { serverError, asString, isSafeId } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { truckDeliveries: trucksCol, beneficiaries: benCol, systemSettings: settingsCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const q = asString(searchParams.get('q'), 100);

    const rawTrucks = await trucksCol
      .find({})
      .sort({ tarih: -1, tir_sirasi: -1 })
      .toArray();

    let trucks = mapDocs(rawTrucks);

    if (q) {
      trucks = trucks.filter((t: any) =>
        (t.plaka && turkishIncludes(t.plaka, q)) ||
        (t.dorse_plaka && turkishIncludes(t.dorse_plaka, q)) ||
        (t.sofor_adi && turkishIncludes(t.sofor_adi, q)) ||
        (t.irsaliye_no && turkishIncludes(t.irsaliye_no, q)) ||
        (t.notlar && turkishIncludes(t.notlar, q))
      );
    }

    // Calculate aggregated truck metrics
    const allTrucks = await trucksCol.find({}).toArray();
    let toplamNetTonaj = 0;
    let toplamBrutTonaj = 0;
    let toplamTaraTonaj = 0;
    let maxSira = 0;

    for (const t of allTrucks) {
      const netT = normalizeToTon(t.net_tonaj);
      const brutT = normalizeToTon(t.brut_tonaj);
      const taraT = t.tara_tonaj ? normalizeToTon(t.tara_tonaj) : (brutT > netT ? brutT - netT : 0);
      toplamNetTonaj += netT;
      toplamBrutTonaj += brutT;
      toplamTaraTonaj += taraT;
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

    // Kuruma Gelecek Toplam Kömür Tahsisi ve Geriye Kalan Sevkiyat Miktarı
    const tahsisDoc = await settingsCol.findOne({ key: 'toplam_tahsis_tonaj' });
    const toplamTahsisTonaj = tahsisDoc && tahsisDoc.value ? parseFloat(tahsisDoc.value) : 0;
    const kalanTahsisTonaj = toplamTahsisTonaj > 0 ? parseFloat(Math.max(0, toplamTahsisTonaj - toplamNetTonaj).toFixed(3)) : 0;
    const tahsisTamamlanmaYuzdesi = toplamTahsisTonaj > 0 ? parseFloat(((toplamNetTonaj / toplamTahsisTonaj) * 100).toFixed(1)) : 0;

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
        toplamTahsisTonaj,
        kalanTahsisTonaj,
        tahsisTamamlanmaYuzdesi,
      },
    });
  } catch (error: any) {
    return serverError('trucks:GET', error);
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

    const netVal = normalizeToTon(net_tonaj, true);
    const brutVal = normalizeToTon(brut_tonaj, true);

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

    const actorName = session.ad_soyad || session.username || 'Sistem Yöneticisi';
    await recordActivityLog({
      kullanici_adi: actorName,
      kullanici_rolu: session.rol || 'ADMIN',
      islem_tipi: 'TIR_GIRIS',
      baslik: `Yeni Kömür Tırı Kaydedildi (#${orderNum} - ${newDoc.plaka})`,
      detay: `#${orderNum} Sıra No | Tır Plakası: ${newDoc.plaka}${newDoc.dorse_plaka ? ` (Dorse: ${newDoc.dorse_plaka})` : ''} | İrsaliye No: ${cleanIrsaliye} | Ocak Çıkış: ${newDoc.ocak_cikis_tarihi} → Saha Geliş: ${tarih} | Net Tonaj: ${formatTonnage(netVal).combined} (Brüt: ${formatTonnage(brutVal).combined}, Dara: ${formatTonnage(taraVal).combined})${newDoc.sofor_adi ? ` | Şoför: ${newDoc.sofor_adi}` : ''}`,
      ek_bilgi: {
        id: newId,
        tir_sirasi: orderNum,
        irsaliye_no: cleanIrsaliye,
        net_tonaj: netVal,
      },
    });
    await touchSyncPulse('TRUCK_ADD');

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
    return serverError('trucks:POST', error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return session.response || NextResponse.json(
        { success: false, error: 'Yetkisiz erişim! Tır kaydı düzenleme yetkisi sadece Yöneticilere aittir.' },
        { status: 401 }
      );
    }

    const { truckDeliveries: trucksCol } = await getDbCollections();
    const body = await request.json();
    const {
      id,
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

    if (!id) {
      return NextResponse.json({ success: false, error: 'Güncellenecek tır ID belirtilmedi' }, { status: 400 });
    }

    if (!plaka || !irsaliye_no || !tarih) {
      return NextResponse.json({ success: false, error: 'Tır Plakası, İrsaliye No ve Geliş Tarihi zorunludur' }, { status: 400 });
    }

    const existingTargetRaw = await trucksCol.findOne(buildIdFilter(String(id)));
    if (!existingTargetRaw) {
      return NextResponse.json({ success: false, error: 'Güncellenecek tır kaydı bulunamadı' }, { status: 404 });
    }
    const existingTarget = mapDoc(existingTargetRaw);

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

    const netVal = normalizeToTon(net_tonaj, true);
    const brutVal = normalizeToTon(brut_tonaj, true);

    if (isNaN(netVal) || isNaN(brutVal) || netVal <= 0 || brutVal <= 0) {
      return NextResponse.json({ success: false, error: 'Geçerli bir net ve brüt tonaj miktarı giriniz' }, { status: 400 });
    }

    if (brutVal < netVal) {
      return NextResponse.json({ success: false, error: 'Brüt tonaj, net tonajdan küçük olamaz!' }, { status: 400 });
    }

    // Birincil Anahtar Kontrolü: Düzenlenen kayıt hariç başka bir kayıtta aynı İrsaliye No var mı?
    const existingRawTrucks = await trucksCol.find({}).toArray();
    const existingTrucks = mapDocs(existingRawTrucks);

    const duplicateTruck = existingTrucks.find(
      (t: any) =>
        String(t.id) !== String(existingTarget.id) &&
        ((targetIrsaliyeHash && t.irsaliye_hash === targetIrsaliyeHash) ||
          normalizeIrsaliyeNo(t.irsaliye_no) === targetIrsaliyeNorm)
    );

    if (duplicateTruck) {
      return NextResponse.json(
        {
          success: false,
          error: `"${cleanIrsaliye}" İrsaliye / Teslimat Numarası başka bir tır kaydında (#${duplicateTruck.tir_sirasi} - Plaka: ${duplicateTruck.plaka} - Tarih: ${duplicateTruck.tarih}) zaten kullanılıyor! İrsaliye No birincil anahtardır.`,
        },
        { status: 409 }
      );
    }

    const taraVal = parseFloat((brutVal - netVal).toFixed(3));
    const orderNum = parseInt(tir_sirasi, 10) || Number(existingTarget.tir_sirasi) || 1;
    const { nowLocaleTr } = getIstanbulDate();

    const updatedFields = {
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
      updated_at: nowLocaleTr,
    };

    const encryptedUpdate = encryptTruck(updatedFields);
    await trucksCol.updateOne(buildIdFilter(String(id)), { $set: encryptedUpdate });

    const actorName = session.ad_soyad || session.username || 'Sistem Yöneticisi';
    await recordActivityLog({
      kullanici_adi: actorName,
      kullanici_rolu: session.rol || 'ADMIN',
      islem_tipi: 'TIR_GUNCELLEME',
      baslik: `Kömür Tırı Kaydı Güncellendi (#${orderNum} - ${updatedFields.plaka})`,
      detay: `#${orderNum} Sıra No | Tır Plakası: ${updatedFields.plaka}${updatedFields.dorse_plaka ? ` (Dorse: ${updatedFields.dorse_plaka})` : ''} | İrsaliye No: ${cleanIrsaliye} | Ocak Çıkış: ${updatedFields.ocak_cikis_tarihi} → Saha Geliş: ${tarih} | Net Tonaj: ${formatTonnage(netVal).combined} (Brüt: ${formatTonnage(brutVal).combined}, Dara: ${formatTonnage(taraVal).combined})`,
      ek_bilgi: {
        id: String(id),
        eski_plaka: existingTarget.plaka,
        eski_irsaliye: existingTarget.irsaliye_no,
        eski_net_tonaj: existingTarget.net_tonaj,
        yeni_net_tonaj: netVal,
      },
    });
    await touchSyncPulse('TRUCK_UPDATE');

    return NextResponse.json({
      success: true,
      message: 'Tır kaydı başarıyla güncellendi',
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
    return serverError('trucks:PUT', error);
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
    const id = asString(searchParams.get('id'), 64);

    if (!id || !isSafeId(id)) {
      return NextResponse.json({ success: false, error: 'Tır ID belirtilmedi veya geçersiz' }, { status: 400 });
    }

    const existingRaw = await trucksCol.findOne(buildIdFilter(id));
    const existing = existingRaw ? mapDoc(existingRaw) : null;

    await trucksCol.deleteOne(buildIdFilter(id));

    const actorName = session.ad_soyad || session.username || 'Sistem Yöneticisi';
    await recordActivityLog({
      kullanici_adi: actorName,
      kullanici_rolu: session.rol || 'ADMIN',
      islem_tipi: 'TIR_SILME',
      baslik: existing
        ? `Kömür Tırı Kaydı Silindi (#${existing.tir_sirasi} - ${existing.plaka})`
        : 'Kömür Tırı Kaydı Silindi',
      detay: existing
        ? `Silinen Tır: #${existing.tir_sirasi} | Plaka: ${existing.plaka}${existing.dorse_plaka ? ` (Dorse: ${existing.dorse_plaka})` : ''} | İrsaliye No: ${existing.irsaliye_no} | Tarih: ${existing.tarih} | Net Tonaj: ${existing.net_tonaj} Ton`
        : `Tır ID (${id}) sistemden silindi.`,
    });
    await touchSyncPulse('TRUCK_DELETE');

    return NextResponse.json({ success: true, message: 'Tır kaydı silindi' });
  } catch (error: any) {
    return serverError('trucks:DELETE', error);
  }
}
