import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDbCollections, buildIdFilter, mapDoc, mapDocs, recordActivityLog, touchSyncPulse } from '@/lib/mongodb';
import { compareByAddressAsc, getRecordStreetInfo } from '@/lib/normalizer';
import { verifySession } from '@/lib/auth';
import { getIstanbulDate } from '@/lib/dateUtils';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { deliveryRoutes: routeCol, beneficiaries: benCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'all';

    // 1. Fetch All Active Routes (Simultaneous multi-team & multi-vehicle support)
    const activeRouteDocs = await routeCol
      .find({ durum: 'AKTIF' })
      .sort({ created_at: -1 })
      .toArray();
    const activeRoutes = mapDocs(activeRouteDocs);
    const activeRoute = activeRoutes[0] || null;

    // 2. Fetch Archived / Completed Routes (sorted descending by date)
    const archivedDocs = await routeCol
      .find({ durum: { $in: ['TAMAMLANDI', 'ARSIVLENDI'] } })
      .toArray();
    const archivedRoutes = mapDocs(archivedDocs).sort((a: any, b: any) => {
      const dateA = new Date(b.created_at || b.completed_at || 0).getTime();
      const dateB = new Date(a.created_at || a.completed_at || 0).getTime();
      return dateA - dateB;
    });

    // 3. Fetch beneficiaries with signed status (ready for route)
    // Citizens whose signature is taken today or pending delivery
    const pendingSignedDocs = await benCol
      .find({
        imza_durumu: 'IMZALANDI',
        teslimat_durumu: { $ne: 'TAMAMLANDI' }
      })
      .toArray();
    const signedBeneficiaries = mapDocs(pendingSignedDocs).sort(compareByAddressAsc);

    return NextResponse.json({
      success: true,
      activeRoutes,
      activeRoute,
      activeCount: activeRoutes.length,
      archivedRoutes,
      signedBeneficiaries,
      signedCount: signedBeneficiaries.length
    });
  } catch (error: any) {
    console.error('Error fetching delivery routes:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { deliveryRoutes: routeCol, beneficiaries: benCol, deliveryHistory: histCol } = await getDbCollections();
    const body = await request.json();
    const { action } = body;

    const { nowIso, nowLocaleTr, nowEnCa } = getIstanbulDate();
    const localToday = nowEnCa; // YYYY-MM-DD
    const localTimeStr = nowLocaleTr;

    // ==========================================
    // ACTION 1: CREATE_ROUTE
    // ==========================================
    if (action === 'CREATE_ROUTE') {
      const {
        rota_adi,
        beneficiary_ids = [],
        arac_plaka = '',
        olusturan_personel = 'Personel',
        dagitim_personeli = '',
        notlar = ''
      } = body;

      if (!beneficiary_ids || beneficiary_ids.length === 0) {
        return NextResponse.json({ success: false, error: 'Rotaya eklenecek en az bir hane seçilmelidir' }, { status: 400 });
      }

      // Multi-Route Support: Check if all selected beneficiaries are already assigned to an ongoing active route
      const otherActiveRoutes = await routeCol.find({ durum: 'AKTIF' }).toArray();
      const activeAssignedMap = new Map<string, string>();
      otherActiveRoutes.forEach((r: any) => {
        (r.duraklar || []).forEach((d: any) => {
          if (d.durum === 'BEKLIYOR') {
            activeAssignedMap.set(String(d.beneficiary_id), r.rota_adi || 'Aktif Rota');
          }
        });
      });

      const conflicting = beneficiary_ids.filter((id: string) => activeAssignedMap.has(String(id)));
      if (conflicting.length > 0 && conflicting.length === beneficiary_ids.length) {
        return NextResponse.json({
          success: false,
          error: `Seçtiğiniz hanelerin tamamı halen devam eden "${activeAssignedMap.get(String(conflicting[0]))}" rotasında yer almaktadır. Lütfen henüz rotaya atanmamış haneleri seçiniz.`
        }, { status: 400 });
      }

      // Fetch all selected beneficiaries
      const objectIds: ObjectId[] = [];
      const stringIds: string[] = [];
      const numberIds: number[] = [];

      beneficiary_ids.forEach((id: string) => {
        const s = String(id).trim();
        if (ObjectId.isValid(s) && s.length === 24) {
          objectIds.push(new ObjectId(s));
        }
        stringIds.push(s);
        const num = Number(s);
        if (!isNaN(num) && num > 0) numberIds.push(num);
      });

      const orClauses: any[] = [{ id: { $in: stringIds } }];
      if (objectIds.length > 0) orClauses.push({ _id: { $in: objectIds } });
      if (numberIds.length > 0) orClauses.push({ id: { $in: numberIds } });

      const rawBeneficiaries = await benCol.find({ $or: orClauses }).toArray();
      const fetchedBeneficiaries = mapDocs(rawBeneficiaries);

      // Map fetched beneficiaries to quickly lookup by ID
      const benMap = new Map<string, any>();
      fetchedBeneficiaries.forEach((b: any) => {
        if (b.id) benMap.set(String(b.id), b);
        if (b._id) benMap.set(String(b._id), b);
      });

      // Personelin belirlediği durak sırasını (beneficiary_ids sırasını) BİREBİR KORU
      const beneficiaries: any[] = [];
      const seenIds = new Set<string>();

      beneficiary_ids.forEach((id: string) => {
        const sId = String(id).trim();
        if (!seenIds.has(sId)) {
          const item = benMap.get(sId);
          if (item) {
            seenIds.add(sId);
            beneficiaries.push(item);
          }
        }
      });

      // Eksik kalan varsa sonuna ekle
      fetchedBeneficiaries.forEach((b: any) => {
        const sId = String(b.id || b._id);
        if (!seenIds.has(sId)) {
          seenIds.add(sId);
          beneficiaries.push(b);
        }
      });

      // Extract unique neighborhoods in this route
      const mahalleler = Array.from(new Set(beneficiaries.map((b: any) => b.mahalle).filter(Boolean)));

      // Construct ordered stops
      let hedefToplam = 0;
      const duraklar = beneficiaries.map((b: any, index: number) => {
        const stInfo = getRecordStreetInfo(b);
        const hedef = b.hedef_torba || 34;
        hedefToplam += hedef;

        return {
          sira: index + 1,
          beneficiary_id: String(b.id),
          tc_no: b.tc_no,
          ad_soyad: b.ad_soyad,
          telefon: b.telefon || '',
          telefon2: b.telefon2 || '',
          mahalle: b.mahalle || '',
          sokak: stInfo.sokak || '',
          kapi_no: stInfo.kapiNo || '',
          daire_no: stInfo.daireNo || '',
          acik_adres: b.acik_adres || '',
          hedef_torba: hedef,
          imza_durumu: b.imza_durumu === 'IMZALANDI' ? 'IMZALANDI' : 'BEKLIYOR',
          imza_tarihi: b.imza_tarihi || null,
          imza_alan_personel: b.imza_alan_personel || null,
          durum: 'BEKLIYOR', // 'BEKLIYOR' | 'TAMAMLANDI' | 'EKSIK' | 'TESLIM_EDILEMEDI'
          teslim_edilen_torba: 0,
          teslim_tarihi: null,
          teslim_eden_personel: null,
          teslimat_notu: ''
        };
      });

      const routeName = (rota_adi || `${localToday} ${mahalleler[0] || 'Genel'} Dağıtım Rotası`).trim();

      const routeObjectId = new ObjectId();
      const routeIdStr = routeObjectId.toString();

      const newRoute = {
        _id: routeObjectId,
        id: routeIdStr,
        rota_adi: routeName,
        tarih: localToday,
        durum: 'AKTIF',
        olusturan_personel: olusturan_personel.trim(),
        dagitim_personeli: (dagitim_personeli || olusturan_personel).trim(),
        arac_plaka: arac_plaka.trim(),
        mahalleler,
        duraklar,
        toplam_hane: duraklar.length,
        tamamlanan_hane: 0,
        eksik_hane: 0,
        teslim_edilemeyen_hane: 0,
        toplam_dagitilan_torba: 0,
        hedef_toplam_torba: hedefToplam,
        notlar: notlar.trim(),
        created_at: localTimeStr,
        completed_at: null
      };

      await routeCol.insertOne(newRoute);

      await recordActivityLog({
        kullanici_adi: olusturan_personel.trim(),
        kullanici_rolu: 'PERSONEL',
        islem_tipi: 'ROTA_OLUSTURMA',
        baslik: 'Yeni Dağıtım Rotası Oluşturuldu',
        detay: `"${routeName}" oluşturuldu. Toplam ${duraklar.length} durak, ${hedefToplam} torba hedef. Araç: ${arac_plaka || 'Belirtilmedi'}. Mahalleler: ${mahalleler.join(', ')}`,
        ek_bilgi: { routeId: routeIdStr, totalStops: duraklar.length, hedefToplam }
      });

      return NextResponse.json({
        success: true,
        message: `Yeni dağıtım rotası başarıyla oluşturuldu (${duraklar.length} Hane).`,
        route: newRoute
      });
    }

    // ==========================================
    // ACTION 2: UPDATE_STOP (Deliver / Missing / Undelivered)
    // ==========================================
    if (action === 'UPDATE_STOP') {
      const {
        route_id,
        stop_index,
        durum, // 'TAMAMLANDI' | 'EKSIK' | 'TESLIM_EDILEMEDI' | 'BEKLIYOR'
        torba_sayisi,
        teslim_alan,
        notlar = '',
        personel = 'Dağıtım Ekibi'
      } = body;

      if (!route_id || stop_index === undefined) {
        return NextResponse.json({ success: false, error: 'Rota ID ve durak sırası zorunludur' }, { status: 400 });
      }

      const rawRoute = await routeCol.findOne(buildIdFilter(route_id));
      if (!rawRoute) {
        return NextResponse.json({ success: false, error: 'Rota bulunamadı' }, { status: 404 });
      }

      const route = mapDoc(rawRoute);
      const stops = route.duraklar || [];
      const targetStop = stops[stop_index];

      if (!targetStop) {
        return NextResponse.json({ success: false, error: 'Belirtilen durak rotada bulunamadı' }, { status: 404 });
      }

      const hedef = targetStop.hedef_torba || 34;
      let deliveredBags = 0;

      if (durum === 'TAMAMLANDI') {
        deliveredBags = parseInt(torba_sayisi || String(hedef), 10);
      } else if (durum === 'EKSIK') {
        deliveredBags = parseInt(torba_sayisi || '0', 10);
      } else {
        deliveredBags = 0;
      }

      const recipient = (teslim_alan || targetStop.ad_soyad).trim();
      const staffName = (personel || 'Personel').trim();
      const note = notlar.trim();

      // Update stop data
      targetStop.durum = durum;
      targetStop.teslim_edilen_torba = deliveredBags;
      targetStop.teslim_tarihi = durum !== 'BEKLIYOR' ? localTimeStr : null;
      targetStop.teslim_eden_personel = durum !== 'BEKLIYOR' ? staffName : null;
      targetStop.teslimat_notu = note;
      targetStop.teslim_alan = recipient;

      // Recalculate route stats
      let completedCount = 0;
      let eksikCount = 0;
      let undeliveredCount = 0;
      let totalDeliveredBags = 0;

      stops.forEach((s: any) => {
        if (s.durum === 'TAMAMLANDI') {
          completedCount++;
          totalDeliveredBags += s.teslim_edilen_torba || s.hedef_torba || 34;
        } else if (s.durum === 'EKSIK') {
          eksikCount++;
          totalDeliveredBags += s.teslim_edilen_torba || 0;
        } else if (s.durum === 'TESLIM_EDILEMEDI') {
          undeliveredCount++;
        }
      });

      // Update route in DB
      await routeCol.updateOne(buildIdFilter(route_id), {
        $set: {
          duraklar: stops,
          tamamlanan_hane: completedCount,
          eksik_hane: eksikCount,
          teslim_edilemeyen_hane: undeliveredCount,
          toplam_dagitilan_torba: totalDeliveredBags,
          updated_at: localTimeStr
        }
      });

      // Synchronize with beneficiary & delivery history
      const benIdFilter = buildIdFilter(targetStop.beneficiary_id);

      if (durum === 'TAMAMLANDI') {
        await benCol.updateOne(benIdFilter, {
          $set: {
            teslimat_durumu: 'TAMAMLANDI',
            teslimat_tarihi: localTimeStr,
            torba_sayisi: deliveredBags,
            teslim_alan: recipient,
            teslim_eden_personel: staffName,
            teslimat_notu: note,
            updated_at: localTimeStr
          }
        });

        await histCol.insertOne({
          beneficiary_id: targetStop.beneficiary_id,
          tc_no: targetStop.tc_no,
          ad_soyad: targetStop.ad_soyad,
          mahalle: targetStop.mahalle,
          acik_adres: targetStop.acik_adres,
          islem_tipi: 'TESLIMAT',
          torba_sayisi: deliveredBags,
          teslim_alan: recipient,
          personel: staffName,
          notlar: `[Rota: ${route.rota_adi}] ${note}`.trim(),
          tarih: localTimeStr,
          gun_tarihi: localToday
        });
      } else if (durum === 'EKSIK') {
        await benCol.updateOne(benIdFilter, {
          $set: {
            teslimat_durumu: 'EKSIK',
            teslimat_tarihi: localTimeStr,
            torba_sayisi: deliveredBags,
            teslim_alan: recipient,
            teslim_eden_personel: staffName,
            teslimat_notu: note || 'Kısmi teslimat yapıldı, eksik torba var',
            updated_at: localTimeStr
          }
        });

        await histCol.insertOne({
          beneficiary_id: targetStop.beneficiary_id,
          tc_no: targetStop.tc_no,
          ad_soyad: targetStop.ad_soyad,
          mahalle: targetStop.mahalle,
          acik_adres: targetStop.acik_adres,
          islem_tipi: 'EKSIK_TESLIMAT',
          torba_sayisi: deliveredBags,
          teslim_alan: recipient,
          personel: staffName,
          notlar: `[Rota: ${route.rota_adi}] Eksik Kalan: ${Math.max(0, hedef - deliveredBags)} torba. ${note}`.trim(),
          tarih: localTimeStr,
          gun_tarihi: localToday
        });
      } else if (durum === 'TESLIM_EDILEMEDI') {
        await benCol.updateOne(benIdFilter, {
          $set: {
            teslimat_durumu: 'BEKLIYOR',
            teslimat_notu: `[${localToday} Teslim Edilemedi]: ${note || 'Kapı açılmadı / evde yok'}`,
            updated_at: localTimeStr
          }
        });

        await histCol.insertOne({
          beneficiary_id: targetStop.beneficiary_id,
          tc_no: targetStop.tc_no,
          ad_soyad: targetStop.ad_soyad,
          mahalle: targetStop.mahalle,
          acik_adres: targetStop.acik_adres,
          islem_tipi: 'TESLIM_EDILEMEDI',
          torba_sayisi: 0,
          teslim_alan: null,
          personel: staffName,
          notlar: `[Rota: ${route.rota_adi}] Teslim Edilemedi Nedeni: ${note || 'Evde yok / ulaşılamadı'}`.trim(),
          tarih: localTimeStr,
          gun_tarihi: localToday
        });
      }

      return NextResponse.json({
        success: true,
        message: `${targetStop.sira}. Durak (${targetStop.ad_soyad}) işlemi güncellendi: ${durum}`,
        stop: targetStop,
        stats: {
          tamamlanan_hane: completedCount,
          eksik_hane: eksikCount,
          teslim_edilemeyen_hane: undeliveredCount,
          toplam_dagitilan_torba: totalDeliveredBags
        }
      });
    }

    // ==========================================
    // ACTION 3: REORDER_STOPS
    // ==========================================
    if (action === 'REORDER_STOPS') {
      const { route_id, duraklar } = body;
      if (!route_id || !Array.isArray(duraklar)) {
        return NextResponse.json({ success: false, error: 'Geçersiz durak listesi' }, { status: 400 });
      }

      const reindexedStops = duraklar.map((s: any, idx: number) => ({
        ...s,
        sira: idx + 1
      }));

      await routeCol.updateOne(buildIdFilter(route_id), {
        $set: {
          duraklar: reindexedStops,
          updated_at: localTimeStr
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Rota durak sıralaması güncellendi',
        duraklar: reindexedStops
      });
    }

    // ==========================================
    // ACTION 4: FINALIZE_ROUTE (Complete & Archive)
    // ==========================================
    if (action === 'FINALIZE_ROUTE') {
      const { route_id, notlar = '', personel = 'Personel' } = body;
      if (!route_id) {
        return NextResponse.json({ success: false, error: 'Rota ID zorunludur' }, { status: 400 });
      }

      const rawRoute = await routeCol.findOne(buildIdFilter(route_id));
      if (!rawRoute) {
        return NextResponse.json({ success: false, error: 'Rota bulunamadı' }, { status: 404 });
      }

      const route = mapDoc(rawRoute);
      const stops = route.duraklar || [];

      // Calculate final counts
      let completedCount = 0;
      let eksikCount = 0;
      let undeliveredCount = 0;
      let pendingCount = 0;
      let totalDeliveredBags = 0;

      stops.forEach((s: any) => {
        if (s.durum === 'TAMAMLANDI') {
          completedCount++;
          totalDeliveredBags += s.teslim_edilen_torba || s.hedef_torba || 34;
        } else if (s.durum === 'EKSIK') {
          eksikCount++;
          totalDeliveredBags += s.teslim_edilen_torba || 0;
        } else if (s.durum === 'TESLIM_EDILEMEDI') {
          undeliveredCount++;
        } else {
          pendingCount++;
        }
      });

      await routeCol.updateOne(buildIdFilter(route_id), {
        $set: {
          durum: 'TAMAMLANDI',
          completed_at: localTimeStr,
          tamamlanan_hane: completedCount,
          eksik_hane: eksikCount,
          teslim_edilemeyen_hane: undeliveredCount,
          toplam_dagitilan_torba: totalDeliveredBags,
          kapanis_notu: notlar.trim(),
          kapatan_personel: personel.trim(),
          updated_at: localTimeStr
        }
      });

      await recordActivityLog({
        kullanici_adi: personel.trim(),
        kullanici_rolu: 'PERSONEL',
        islem_tipi: 'ROTA_KAPATMA',
        baslik: 'Dağıtım Rotası Tamamlandı & Kapatıldı',
        detay: `"${route.rota_adi}" rotası tamamlandı ve arşivlendi. ${completedCount} hane tamamlandı, ${eksikCount} eksik, ${totalDeliveredBags} torba kömür dağıtıldı.`,
        ek_bilgi: { route_id, completedCount, eksikCount, totalDeliveredBags }
      });

      return NextResponse.json({
        success: true,
        message: `Günlük dağıtım rotası başarıyla tamamlandı ve arşivlendi. (${completedCount} Tamamlandı, ${eksikCount} Eksik, ${undeliveredCount} Teslim Edilemedi)`
      });
    }

    // ==========================================
    // ACTION 5: DELETE_ROUTE
    // ==========================================
    if (action === 'DELETE_ROUTE') {
      const { route_id } = body;
      if (!route_id) {
        return NextResponse.json({ success: false, error: 'Rota ID zorunludur' }, { status: 400 });
      }

      await routeCol.deleteOne(buildIdFilter(route_id));

      return NextResponse.json({
        success: true,
        message: 'Rota sistemden başarıyla silindi.'
      });
    }

    // ==========================================
    // ACTION 6: SIGN_BENEFICIARY (İmza Al / Hazırla)
    // ==========================================
    if (action === 'SIGN_BENEFICIARY') {
      const {
        beneficiary_id,
        imza_durumu = 'IMZALANDI', // 'IMZALANDI' | 'BEKLIYOR'
        imza_alan_personel = 'İmza Ekibi',
        notlar = ''
      } = body;

      if (!beneficiary_id) {
        return NextResponse.json({ success: false, error: 'Vatandaş ID zorunludur' }, { status: 400 });
      }

      const benFilter = buildIdFilter(beneficiary_id);
      const isSigned = imza_durumu === 'IMZALANDI';

      await benCol.updateOne(benFilter, {
        $set: {
          imza_durumu: isSigned ? 'IMZALANDI' : 'BEKLIYOR',
          imza_tarihi: isSigned ? localTimeStr : null,
          imza_alan_personel: isSigned ? (imza_alan_personel || 'Personel').trim() : null,
          imza_notu: notlar.trim(),
          updated_at: localTimeStr
        }
      });

      // If there are active routes with this beneficiary, sync the stop across all active routes
      const activeRouteDocs = await routeCol.find({ durum: 'AKTIF' }).toArray();
      for (const activeDoc of activeRouteDocs) {
        const stops = activeDoc.duraklar || [];
        let modified = false;
        stops.forEach((s: any) => {
          if (String(s.beneficiary_id) === String(beneficiary_id)) {
            s.imza_durumu = isSigned ? 'IMZALANDI' : 'BEKLIYOR';
            s.imza_tarihi = isSigned ? localTimeStr : null;
            s.imza_alan_personel = isSigned ? (imza_alan_personel || 'Personel').trim() : null;
            modified = true;
          }
        });
        if (modified) {
          await routeCol.updateOne(buildIdFilter(activeDoc.id || activeDoc._id), {
            $set: { duraklar: stops, updated_at: localTimeStr }
          });
        }
      }

      // Invalidate cache & pulse sync across devices
      const pulseTime = await touchSyncPulse('İmza Güncellendi');

      return NextResponse.json({
        success: true,
        message: isSigned
          ? 'Kapıda imza başarıyla alındı ve hane dağıtıma hazırlandı.'
          : 'İmza durumu sıfırlandı.',
        imza_durumu: isSigned ? 'IMZALANDI' : 'BEKLIYOR',
        imza_tarihi: isSigned ? localTimeStr : null,
        syncTime: pulseTime
      });
    }

    // ==========================================
    // ACTION 7: BULK_SIGN (Toplu İmza Al)
    // ==========================================
    if (action === 'BULK_SIGN') {
      const { 
        beneficiary_ids = [], 
        imza_durumu = 'IMZALANDI',
        imza_alan_personel = 'İmza Ekibi' 
      } = body;
      if (!Array.isArray(beneficiary_ids) || beneficiary_ids.length === 0) {
        return NextResponse.json({ success: false, error: 'En az bir hane seçilmelidir' }, { status: 400 });
      }

      const isSigned = imza_durumu === 'IMZALANDI';
      const idFilters = beneficiary_ids.map((id: string) => buildIdFilter(id));
      await benCol.updateMany({ $or: idFilters }, {
        $set: {
          imza_durumu: isSigned ? 'IMZALANDI' : 'BEKLIYOR',
          imza_tarihi: isSigned ? localTimeStr : null,
          imza_alan_personel: isSigned ? (imza_alan_personel || 'İmza Ekibi').trim() : null,
          updated_at: localTimeStr
        }
      });

      // Aktif rotalardaki durakları senkronize et
      const activeRouteDocs = await routeCol.find({ durum: 'AKTIF' }).toArray();
      const idSet = new Set(beneficiary_ids.map(String));
      for (const activeDoc of activeRouteDocs) {
        const stops = activeDoc.duraklar || [];
        let modified = false;
        stops.forEach((s: any) => {
          if (idSet.has(String(s.beneficiary_id))) {
            s.imza_durumu = isSigned ? 'IMZALANDI' : 'BEKLIYOR';
            s.imza_tarihi = isSigned ? localTimeStr : null;
            s.imza_alan_personel = isSigned ? (imza_alan_personel || 'İmza Ekibi').trim() : null;
            modified = true;
          }
        });
        if (modified) {
          await routeCol.updateOne(buildIdFilter(activeDoc.id || activeDoc._id), {
            $set: { duraklar: stops, updated_at: localTimeStr }
          });
        }
      }

      // Invalidate cache & pulse sync across devices
      const pulseTime = await touchSyncPulse('Toplu İmza');

      return NextResponse.json({
        success: true,
        message: `${beneficiary_ids.length} hane için kapıda imza başarıyla kaydedildi.`,
        syncTime: pulseTime
      });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz işlem (action)' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in routes POST API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
