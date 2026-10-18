import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDbCollections, buildIdFilter, mapDoc, mapDocs, recordActivityLog, touchSyncPulse } from '@/lib/mongodb';
import { encryptField, encryptDeliveryHistory, encryptRoute, encryptRouteStop } from '@/lib/crypto';
import { compareByAddressAsc, getRecordStreetInfo } from '@/lib/normalizer';
import { verifySession } from '@/lib/auth';
import { getIstanbulDate } from '@/lib/dateUtils';

const LOCK_TIMEOUT_MS = 25 * 60 * 1000; // 25 dakika hareketsizlik aşımı

export function checkRouteLock(
  route: any,
  staffName: string,
  clientId?: string
): { isLocked: boolean; lockedBy?: string } {
  if (!route || !route.kilitli_personel) return { isLocked: false };

  const now = Date.now();
  const lockTime = Number(route.kilit_timestamp) || 0;
  // Kilit 25 dakikadan eski ise zaman aşımına uğramış kabul edilir
  if (lockTime > 0 && now - lockTime > LOCK_TIMEOUT_MS) {
    return { isLocked: false };
  }

  const lockedBy = String(route.kilitli_personel).trim();
  const lockedClient = route.kilitli_client_id ? String(route.kilitli_client_id).trim() : '';
  const currentClient = clientId ? String(clientId).trim() : '';

  // Eğer istemci kimlikleri mevcutsa doğrudan cihaz/sekme bazlı doğrula
  if (lockedClient && currentClient) {
    if (lockedClient === currentClient) {
      return { isLocked: false };
    }
    return { isLocked: true, lockedBy };
  }

  const currentStaff = String(staffName || '').trim();
  // Aynı personel ise kilit kendisinde demektir
  if (lockedBy.toLowerCase() === currentStaff.toLowerCase()) {
    return { isLocked: false };
  }

  return { isLocked: true, lockedBy };
}

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { deliveryRoutes: routeCol, beneficiaries: benCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'all';

    // 1. Fetch All Active & Paused Routes (Simultaneous multi-team & multi-vehicle support)
    const activeRouteDocs = await routeCol
      .find({ durum: { $in: ['AKTIF', 'DURAKLATILDI'] } })
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
    // Citizens whose signature is taken and coal is not yet delivered
    const pendingSignedDocs = await benCol
      .find({
        imza_durumu: 'IMZALANDI',
        teslimat_durumu: { $nin: ['TAMAMLANDI', 'TESLIM_EDILDI'] }
      })
      .toArray();
    const signedBeneficiaries = mapDocs(pendingSignedDocs).sort(compareByAddressAsc);

    return NextResponse.json(
      {
        success: true,
        activeRoutes,
        activeRoute,
        activeCount: activeRoutes.length,
        archivedRoutes,
        signedBeneficiaries,
        signedCount: signedBeneficiaries.length
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
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

    const { nowLocaleTr, nowEnCa } = getIstanbulDate();
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
        return NextResponse.json({ success: false, error: 'Rotaya eklenecek en az bir imzalı hane seçilmelidir' }, { status: 400 });
      }

      // Multi-Route Support: Check if all selected beneficiaries are already assigned to an ongoing active route
      const otherActiveRoutes = await routeCol.find({ durum: { $in: ['AKTIF', 'DURAKLATILDI'] } }).toArray();
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
      // KURAL: Yalnızca imzası alınmış (IMZALANDI) ve kömürü teslim edilmemiş haneler rotaya dahil edilebilir
      const fetchedBeneficiaries = mapDocs(rawBeneficiaries).filter(
        (b: any) =>
          b.imza_durumu === 'IMZALANDI' &&
          b.teslimat_durumu !== 'TAMAMLANDI' &&
          b.teslimat_durumu !== 'TESLIM_EDILDI'
      );

      if (fetchedBeneficiaries.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              'İmzası alınmış ve kömürü teslim edilmemiş hane bulunmadığı için yeni dağıtım rotası başlatılamaz. Lütfen önce kapıda imza alınız.'
          },
          { status: 400 }
        );
      }

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
          kapi_no: stInfo.kapiNo && stInfo.kapiNo !== 999999 && stInfo.kapiNo !== '999999' ? stInfo.kapiNo : '',
          daire_no: stInfo.daireNo && stInfo.daireNo > 0 ? stInfo.daireNo : '',
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

      // Encrypt all PII fields in stops & notes with AES-256-GCM before storing in MongoDB
      await routeCol.insertOne(encryptRoute(newRoute));

      await recordActivityLog({
        kullanici_adi: olusturan_personel.trim(),
        kullanici_rolu: session.rol || 'PERSONEL',
        islem_tipi: 'ROTA_OLUSTURMA',
        baslik: 'Yeni Dağıtım Rotası Oluşturuldu',
        detay: `"${routeName}" oluşturuldu. Toplam ${duraklar.length} durak, ${hedefToplam} torba hedef. Araç: ${arac_plaka || 'Belirtilmedi'}. Mahalleler: ${mahalleler.join(', ')}`,
        ek_bilgi: { routeId: routeIdStr, totalStops: duraklar.length, hedefToplam }
      });

      await touchSyncPulse(olusturan_personel.trim());

      return NextResponse.json({
        success: true,
        message: `Yeni dağıtım rotası başarıyla oluşturuldu (${duraklar.length} Hane).`,
        route: newRoute
      });
    }

    // ==========================================
    // ACTION 1.5: ROUTE LOCKING (ACQUIRE / RELEASE / HEARTBEAT)
    // Sadece bir personel rotayı aynı anda aktif kullanabilir
    // ==========================================
    if (action === 'ACQUIRE_ROUTE_LOCK') {
      const { route_id, force = false, personel, client_id, stop_index = 0 } = body;
      const headerClientId = request.headers.get('x-client-id') || '';
      const effectiveClientId = (client_id || headerClientId || '').trim();

      if (!route_id) {
        return NextResponse.json({ success: false, error: 'Rota ID zorunludur' }, { status: 400 });
      }

      const rawRoute = await routeCol.findOne(buildIdFilter(route_id));
      if (!rawRoute) {
        return NextResponse.json({ success: false, error: 'Rota bulunamadı' }, { status: 404 });
      }

      const staffName = (session.ad_soyad || session.username || personel || 'Personel').trim();
      const route = mapDoc(rawRoute);
      const lockCheck = checkRouteLock(route, staffName, effectiveClientId);

      if (lockCheck.isLocked && !(force && session.rol === 'ADMIN')) {
        return NextResponse.json({
          success: false,
          locked: true,
          lockedBy: lockCheck.lockedBy,
          error: `Bu rota şu anda "${lockCheck.lockedBy}" tarafından Rota Modunda aktif olarak kullanılmaktadır. Aynı anda yalnızca bir personel bir rotayı kullanabilir.`
        }, { status: 409 });
      }

      const nowTimestamp = Date.now();
      await routeCol.updateOne(buildIdFilter(route_id), {
        $set: {
          kilitli_personel: staffName,
          kilitli_personel_username: session.username || '',
          kilitli_client_id: effectiveClientId,
          kilit_tarihi: localTimeStr,
          kilit_timestamp: nowTimestamp,
          aktif_rota_modu: true,
          aktif_durak_index: Number(stop_index) || 0,
          updated_at: localTimeStr
        }
      });

      await touchSyncPulse(staffName);

      return NextResponse.json({
        success: true,
        message: `Rota kilitlendi (${staffName}).`,
        kilitli_personel: staffName,
        kilitli_client_id: effectiveClientId,
        kilit_timestamp: nowTimestamp,
        aktif_durak_index: Number(stop_index) || 0
      });
    }

    if (action === 'RELEASE_ROUTE_LOCK') {
      const { route_id, force = false, personel, client_id } = body;
      const headerClientId = request.headers.get('x-client-id') || '';
      const effectiveClientId = (client_id || headerClientId || '').trim();

      if (!route_id) {
        return NextResponse.json({ success: false, error: 'Rota ID zorunludur' }, { status: 400 });
      }

      const rawRoute = await routeCol.findOne(buildIdFilter(route_id));
      if (!rawRoute) {
        return NextResponse.json({ success: false, error: 'Rota bulunamadı' }, { status: 404 });
      }

      const staffName = (session.ad_soyad || session.username || personel || 'Personel').trim();
      const route = mapDoc(rawRoute);
      const lockCheck = checkRouteLock(route, staffName, effectiveClientId);

      if (lockCheck.isLocked && !(force && session.rol === 'ADMIN')) {
        return NextResponse.json({
          success: false,
          locked: true,
          lockedBy: lockCheck.lockedBy,
          error: `Bu rota "${lockCheck.lockedBy}" tarafından kilitlenmiştir. Kilidi yalnızca ilgili personel veya Admin kaldırabilir.`
        }, { status: 403 });
      }

      await routeCol.updateOne(buildIdFilter(route_id), {
        $set: {
          kilitli_personel: null,
          kilitli_personel_username: null,
          kilitli_client_id: null,
          kilit_tarihi: null,
          kilit_timestamp: null,
          aktif_rota_modu: false,
          updated_at: localTimeStr
        }
      });

      await touchSyncPulse(staffName);

      return NextResponse.json({
        success: true,
        message: 'Rota kilidi başarıyla kaldırıldı.'
      });
    }

    if (action === 'HEARTBEAT_ROUTE_LOCK') {
      const { route_id, personel, client_id, stop_index } = body;
      const headerClientId = request.headers.get('x-client-id') || '';
      const effectiveClientId = (client_id || headerClientId || '').trim();

      if (!route_id) {
        return NextResponse.json({ success: false, error: 'Rota ID zorunludur' }, { status: 400 });
      }

      const rawRoute = await routeCol.findOne(buildIdFilter(route_id));
      if (!rawRoute) {
        return NextResponse.json({ success: false, error: 'Rota bulunamadı' }, { status: 404 });
      }

      const staffName = (session.ad_soyad || session.username || personel || 'Personel').trim();
      const route = mapDoc(rawRoute);
      const lockCheck = checkRouteLock(route, staffName, effectiveClientId);

      if (lockCheck.isLocked) {
        return NextResponse.json({
          success: false,
          locked: true,
          lockedBy: lockCheck.lockedBy,
          error: `Kilit zaman aşımı yenilenemedi, rota "${lockCheck.lockedBy}" personeline kilitli.`
        }, { status: 409 });
      }

      const nowTimestamp = Date.now();
      const updateFields: any = {
        kilitli_personel: staffName,
        kilit_timestamp: nowTimestamp,
        aktif_rota_modu: true,
        updated_at: localTimeStr
      };
      if (effectiveClientId) updateFields.kilitli_client_id = effectiveClientId;
      if (stop_index !== undefined) updateFields.aktif_durak_index = Number(stop_index);

      await routeCol.updateOne(buildIdFilter(route_id), { $set: updateFields });

      return NextResponse.json({ success: true, kilit_timestamp: nowTimestamp });
    }

    // ==========================================
    // ACTION 2: UPDATE_STOP (Deliver / Missing / Undelivered / Deferred)
    // ==========================================
    if (action === 'UPDATE_STOP') {
      const {
        route_id,
        stop_index,
        durum, // 'TAMAMLANDI' | 'EKSIK' | 'TESLIM_EDILEMEDI' | 'BEKLIYOR'
        torba_sayisi,
        teslim_alan,
        notlar = '',
        personel = 'Dağıtım Ekibi',
        daha_sonra_tamamlanacak = false
      } = body;

      if (!route_id || stop_index === undefined) {
        return NextResponse.json({ success: false, error: 'Rota ID ve durak sırası zorunludur' }, { status: 400 });
      }

      const rawRoute = await routeCol.findOne(buildIdFilter(route_id));
      if (!rawRoute) {
        return NextResponse.json({ success: false, error: 'Rota bulunamadı' }, { status: 404 });
      }

      const headerClientId = request.headers.get('x-client-id') || '';
      const effectiveClientId = (body.client_id || headerClientId || '').trim();
      const staffName = (
        (body.personel && body.personel !== 'Personel' && body.personel !== 'Dağıtım Personeli')
          ? body.personel
          : (session.ad_soyad || session.username || body.personel || 'Personel')
      ).trim();
      const route = mapDoc(rawRoute);
      const lockCheck = checkRouteLock(route, staffName, effectiveClientId);

      if (lockCheck.isLocked) {
        return NextResponse.json({
          success: false,
          locked: true,
          lockedBy: lockCheck.lockedBy,
          error: `Bu rota şu anda "${lockCheck.lockedBy}" tarafından Rota Modunda aktif olarak kullanılmaktadır. Aynı anda yalnızca bir personel bir rotayı kullanabilir.`
        }, { status: 409 });
      }

      const stops = route.duraklar || [];
      const targetStop = stops[stop_index];

      if (!targetStop) {
        return NextResponse.json({ success: false, error: 'Belirtilen durak rotada bulunamadı' }, { status: 404 });
      }

      const hedef = targetStop.hedef_torba || 34;
      const previousDelivered = Number(targetStop.teslim_edilen_torba || 0);
      let deliveredBags = 0;

      if (durum === 'TAMAMLANDI') {
        deliveredBags = parseInt(torba_sayisi || String(hedef), 10);
      } else if (durum === 'EKSIK') {
        deliveredBags = parseInt(torba_sayisi || '0', 10);
        if (isNaN(deliveredBags) || deliveredBags <= 0) {
          return NextResponse.json({
            success: false,
            error: 'Eksik teslimat için teslim edilen torba miktarı en az 1 olmalıdır. Hiç kömür teslim edilemediyse "Daha Sonra Tamamlanacak (0 Torba)" veya "Teslim Edilemedi" seçeneğini kullanınız.'
          }, { status: 400 });
        }
      } else {
        deliveredBags = 0;
      }

      const recipient = (teslim_alan || targetStop.ad_soyad).trim();
      const note = notlar.trim();

      // Update stop data
      targetStop.durum = durum;
      targetStop.teslim_edilen_torba = deliveredBags;
      targetStop.teslim_tarihi = durum !== 'BEKLIYOR' ? localTimeStr : null;
      targetStop.teslim_eden_personel = durum !== 'BEKLIYOR' ? staffName : null;
      targetStop.teslimat_notu = note;
      targetStop.teslim_alan = recipient;
      targetStop.daha_sonra_tamamlanacak =
        durum === 'TAMAMLANDI'
          ? false
          : Boolean(daha_sonra_tamamlanacak || durum === 'EKSIK' || durum === 'TESLIM_EDILEMEDI');

      // Recalculate route stats
      let completedCount = 0;
      let eksikCount = 0;
      let undeliveredCount = 0;
      let waitingCount = 0;
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
          waitingCount++;
        }
      });

      const isAllStopsCompleted = stops.length > 0 && completedCount === stops.length;
      const hasRemainingStopsAfterCurrent = stops.some(
        (s: any, idx: number) => idx > Number(stop_index) && s.durum !== 'TAMAMLANDI'
      );
      const isLastStopOrAllVisitedWithIncomplete =
        !isAllStopsCompleted && !hasRemainingStopsAfterCurrent;

      let nextRouteDurum = route.durum || 'AKTIF';
      if (isAllStopsCompleted) {
        nextRouteDurum = 'TAMAMLANDI';
      } else if (isLastStopOrAllVisitedWithIncomplete) {
        nextRouteDurum = 'DURAKLATILDI';
      } else {
        nextRouteDurum = 'AKTIF';
      }

      const routeSetFields: Record<string, any> = {
        durum: nextRouteDurum,
        duraklar: stops.map(encryptRouteStop),
        tamamlanan_hane: completedCount,
        eksik_hane: eksikCount,
        teslim_edilemeyen_hane: undeliveredCount,
        toplam_dagitilan_torba: totalDeliveredBags,
        updated_at: localTimeStr
      };

      if (isAllStopsCompleted) {
        routeSetFields.completed_at = localTimeStr;
        routeSetFields.kapatan_personel = staffName;
        routeSetFields.kapanis_notu = encryptField(
          note || 'Saha Teslimat (Rota) Modu üzerinden tüm duraklar eksiksiz tamamlanarak otomatik kapatıldı.'
        );
        routeSetFields.kilitli_personel = null;
        routeSetFields.kilitli_personel_username = null;
        routeSetFields.kilitli_client_id = null;
        routeSetFields.kilit_tarihi = null;
        routeSetFields.kilit_timestamp = null;
        routeSetFields.aktif_rota_modu = false;
      } else {
        routeSetFields.kilitli_personel = staffName;
        routeSetFields.kilitli_personel_username = session.username || '';
        if (effectiveClientId) routeSetFields.kilitli_client_id = effectiveClientId;
        routeSetFields.kilit_tarihi = localTimeStr;
        routeSetFields.kilit_timestamp = Date.now();
        routeSetFields.aktif_rota_modu = true;
        if (body.next_stop_index !== undefined) {
          routeSetFields.aktif_durak_index = Number(body.next_stop_index);
        } else {
          routeSetFields.aktif_durak_index = Number(stop_index);
        }
        if (nextRouteDurum === 'AKTIF' && route.durum === 'TAMAMLANDI') {
          routeSetFields.completed_at = null;
          routeSetFields.kapatan_personel = null;
          routeSetFields.kapanis_notu = null;
        }
      }

      // Update route in DB with AES-256-GCM encrypted stops
      await routeCol.updateOne(buildIdFilter(route_id), {
        $set: routeSetFields
      });

      // Synchronize with beneficiary & delivery history (AES-256-GCM encrypted)
      const benIdFilter = buildIdFilter(targetStop.beneficiary_id);
      const deltaBags =
        previousDelivered > 0 && deliveredBags > previousDelivered
          ? deliveredBags - previousDelivered
          : deliveredBags;

      if (durum === 'TAMAMLANDI') {
        await benCol.updateOne(benIdFilter, {
          $set: {
            teslimat_durumu: 'TAMAMLANDI',
            teslimat_tarihi: localTimeStr,
            torba_sayisi: deliveredBags,
            teslim_alan: encryptField(recipient),
            teslim_eden_personel: staffName,
            teslimat_notu: encryptField(note),
            updated_at: localTimeStr
          }
        });

        await histCol.insertOne(encryptDeliveryHistory({
          beneficiary_id: targetStop.beneficiary_id,
          tc_no: targetStop.tc_no,
          ad_soyad: targetStop.ad_soyad,
          mahalle: targetStop.mahalle,
          acik_adres: targetStop.acik_adres,
          islem_tipi: 'TESLIMAT',
          torba_sayisi: deltaBags,
          teslim_alan: recipient,
          personel: staffName,
          notlar: `[Rota: ${route.rota_adi}] ${previousDelivered > 0 ? `(Eksik Tamamlama +${deltaBags} Torba) ` : ''}${note}`.trim(),
          iptal_nedeni: null,
          tarih: localTimeStr,
          gun_tarihi: localToday
        }));

        await recordActivityLog({
          kullanici_adi: staffName,
          kullanici_rolu: session.rol || 'PERSONEL',
          islem_tipi: 'TESLIMAT',
          baslik: 'Rota Üzerinden Kömür Teslimatı Tamamlandı',
          detay: `[Rota: ${route.rota_adi}] ${recipient} (${targetStop.tc_no}) hanesine ${deltaBags} torba kömür teslim edildi (Toplam: ${deliveredBags}/${hedef}).`,
          hedef_kisi: recipient,
          hedef_tc: targetStop.tc_no,
          mahalle: targetStop.mahalle,
          torba_sayisi: deltaBags,
        });
      } else if (durum === 'EKSIK') {
        const eksikNote = note || 'Kısmi teslimat yapıldı, daha sonra tamamlanacak';
        await benCol.updateOne(benIdFilter, {
          $set: {
            teslimat_durumu: 'EKSIK',
            teslimat_tarihi: localTimeStr,
            torba_sayisi: deliveredBags,
            teslim_alan: encryptField(recipient),
            teslim_eden_personel: staffName,
            teslimat_notu: encryptField(eksikNote),
            updated_at: localTimeStr
          }
        });

        await histCol.insertOne(encryptDeliveryHistory({
          beneficiary_id: targetStop.beneficiary_id,
          tc_no: targetStop.tc_no,
          ad_soyad: targetStop.ad_soyad,
          mahalle: targetStop.mahalle,
          acik_adres: targetStop.acik_adres,
          islem_tipi: 'EKSIK_TESLIMAT',
          torba_sayisi: deltaBags,
          teslim_alan: recipient,
          personel: staffName,
          notlar: `[Rota: ${route.rota_adi}] Eksik Kalan: ${Math.max(0, hedef - deliveredBags)} torba (Daha sonra tamamlanacak). ${note}`.trim(),
          iptal_nedeni: null,
          tarih: localTimeStr,
          gun_tarihi: localToday
        }));

        await recordActivityLog({
          kullanici_adi: staffName,
          kullanici_rolu: session.rol || 'PERSONEL',
          islem_tipi: 'EKSIK_TESLIMAT',
          baslik: 'Rota Üzerinden Eksik Kömür Teslimatı Yapıldı',
          detay: `[Rota: ${route.rota_adi}] ${recipient} (${targetStop.tc_no}) hanesine ${deliveredBags}/${hedef} torba teslim edildi (Daha sonra tamamlanacak).`,
          hedef_kisi: recipient,
          hedef_tc: targetStop.tc_no,
          mahalle: targetStop.mahalle,
          torba_sayisi: deltaBags,
        });
      } else if (durum === 'TESLIM_EDILEMEDI') {
        const undeliveredNote = `[${localToday} ${daha_sonra_tamamlanacak ? 'Daha Sonra Tamamlanacak' : 'Teslim Edilemedi'}]: ${note || 'Daha sonra tamamlanacak / adreste bulunamadı'}`;
        await benCol.updateOne(benIdFilter, {
          $set: {
            teslimat_durumu: 'BEKLIYOR',
            teslimat_notu: encryptField(undeliveredNote),
            updated_at: localTimeStr
          }
        });

        await histCol.insertOne(encryptDeliveryHistory({
          beneficiary_id: targetStop.beneficiary_id,
          tc_no: targetStop.tc_no,
          ad_soyad: targetStop.ad_soyad,
          mahalle: targetStop.mahalle,
          acik_adres: targetStop.acik_adres,
          islem_tipi: 'TESLIM_EDILEMEDI',
          torba_sayisi: 0,
          teslim_alan: null,
          personel: staffName,
          notlar: `[Rota: ${route.rota_adi}] ${daha_sonra_tamamlanacak ? 'Daha Sonra Tamamlanacak' : 'Teslim Edilemedi'}: ${note || 'Daha sonra uğranacak'}`.trim(),
          iptal_nedeni: null,
          tarih: localTimeStr,
          gun_tarihi: localToday
        }));
      } else if (durum === 'BEKLIYOR') {
        await benCol.updateOne(benIdFilter, {
          $set: {
            teslimat_durumu: 'BEKLIYOR',
            teslimat_tarihi: null,
            torba_sayisi: 0,
            teslim_alan: null,
            teslim_eden_personel: null,
            teslimat_notu: null,
            updated_at: localTimeStr
          }
        });

        await histCol.insertOne(encryptDeliveryHistory({
          beneficiary_id: targetStop.beneficiary_id,
          tc_no: targetStop.tc_no,
          ad_soyad: targetStop.ad_soyad,
          mahalle: targetStop.mahalle,
          acik_adres: targetStop.acik_adres,
          islem_tipi: 'IPTAL',
          torba_sayisi: previousDelivered,
          teslim_alan: targetStop.teslim_alan || '',
          personel: staffName,
          notlar: `[Rota: ${route.rota_adi}] Teslimat geri alındı / iptal edildi.${note ? ' ' + note : ''}`.trim(),
          iptal_nedeni: note || 'Hatalı teslimat geri alma',
          tarih: localTimeStr,
          gun_tarihi: localToday
        }));

        await recordActivityLog({
          kullanici_adi: staffName,
          kullanici_rolu: session.rol || 'PERSONEL',
          islem_tipi: 'IPTAL',
          baslik: 'Rota Üzerinden Teslimat Geri Alındı / İptal Edildi',
          detay: `[Rota: ${route.rota_adi}] ${targetStop.ad_soyad} (${targetStop.tc_no}) hanesine yapılan teslimat geri alındı ve kayıt tekrar BEKLİYOR durumuna getirildi.${note ? ' Gerekçe: ' + note : ''}`,
          hedef_kisi: targetStop.ad_soyad,
          hedef_tc: targetStop.tc_no,
          mahalle: targetStop.mahalle,
          torba_sayisi: 0,
        });
      }

      if (isAllStopsCompleted) {
        await recordActivityLog({
          kullanici_adi: staffName,
          kullanici_rolu: session.rol || 'PERSONEL',
          islem_tipi: 'ROTA_KAPATMA',
          baslik: 'Dağıtım Rotası Otomatik Tamamlandı & Arşivlendi',
          detay: `"${route.rota_adi}" rotasındaki tüm duraklar (${completedCount} hane, ${totalDeliveredBags} torba) eksiksiz tamamlandığı için rota otomatik olarak TAMAMLANDI durumuna alındı.`,
          ek_bilgi: { route_id, completedCount, totalDeliveredBags }
        });
      }

      await touchSyncPulse(staffName);

      const updatedRouteResponse = {
        ...route,
        durum: nextRouteDurum,
        duraklar: stops,
        tamamlanan_hane: completedCount,
        eksik_hane: eksikCount,
        teslim_edilemeyen_hane: undeliveredCount,
        toplam_dagitilan_torba: totalDeliveredBags,
        updated_at: localTimeStr
      };

      return NextResponse.json({
        success: true,
        message: isAllStopsCompleted
          ? `Tüm duraklar eksiksiz tamamlandı! "${route.rota_adi}" rotası otomatik olarak TAMAMLANDI durumuna alındı.`
          : isLastStopOrAllVisitedWithIncomplete
          ? `Son durağa ulaşıldı. Eksik / daha sonra tamamlanacak kayıtlar bulunduğu için rota GEÇİCİ OLARAK DURDURULDU.`
          : `${targetStop.sira}. Durak (${targetStop.ad_soyad}) işlemi güncellendi: ${durum}`,
        stop: targetStop,
        duraklar: stops,
        route: updatedRouteResponse,
        routeStatus: nextRouteDurum,
        routeAutoCompleted: isAllStopsCompleted,
        routeAutoPaused: isLastStopOrAllVisitedWithIncomplete,
        stats: {
          tamamlanan_hane: completedCount,
          eksik_hane: eksikCount,
          teslim_edilemeyen_hane: undeliveredCount,
          bekleyen_hane: waitingCount,
          toplam_dagitilan_torba: totalDeliveredBags
        }
      });
    }

    // ==========================================
    // ACTION 2.5: PAUSE_ROUTE / RESUME_ROUTE
    // ==========================================
    if (action === 'PAUSE_ROUTE' || action === 'RESUME_ROUTE') {
      const { route_id, notlar = '', personel, client_id } = body;
      const headerClientId = request.headers.get('x-client-id') || '';
      const effectiveClientId = (client_id || headerClientId || '').trim();

      if (!route_id) {
        return NextResponse.json({ success: false, error: 'Rota ID zorunludur' }, { status: 400 });
      }

      const rawRoute = await routeCol.findOne(buildIdFilter(route_id));
      if (!rawRoute) {
        return NextResponse.json({ success: false, error: 'Rota bulunamadı' }, { status: 404 });
      }

      const staffName = (session.ad_soyad || session.username || personel || 'Personel').trim();
      const route = mapDoc(rawRoute);
      const lockCheck = checkRouteLock(route, staffName, effectiveClientId);

      if (lockCheck.isLocked && session.rol !== 'ADMIN') {
        return NextResponse.json({
          success: false,
          locked: true,
          lockedBy: lockCheck.lockedBy,
          error: `Bu rota şu anda "${lockCheck.lockedBy}" tarafından Rota Modunda kullanılmaktadır.`
        }, { status: 409 });
      }

      const nextState = action === 'PAUSE_ROUTE' ? 'DURAKLATILDI' : 'AKTIF';
      const setObj: Record<string, any> = {
        durum: nextState,
        updated_at: localTimeStr
      };
      if (notlar && notlar.trim()) {
        setObj.notlar = encryptField(notlar.trim());
      }

      if (action === 'PAUSE_ROUTE') {
        // Rotayı geçici durdururken kilidi serbest bırak
        setObj.kilitli_personel = null;
        setObj.kilitli_personel_username = null;
        setObj.kilitli_client_id = null;
        setObj.kilit_tarihi = null;
        setObj.kilit_timestamp = null;
        setObj.aktif_rota_modu = false;
      } else {
        // Rotayı tekrar aktif ederken bu personele ve istemciye kilitle
        setObj.kilitli_personel = staffName;
        setObj.kilitli_personel_username = session.username || '';
        if (effectiveClientId) setObj.kilitli_client_id = effectiveClientId;
        setObj.kilit_tarihi = localTimeStr;
        setObj.kilit_timestamp = Date.now();
        setObj.aktif_rota_modu = true;
      }

      await routeCol.updateOne(buildIdFilter(route_id), { $set: setObj });
      await touchSyncPulse(staffName);

      return NextResponse.json({
        success: true,
        routeStatus: nextState,
        message: nextState === 'DURAKLATILDI'
          ? 'Rota geçici olarak duraklatıldı. Eksik kalan duraklara daha sonra kaldığınız yerden devam edebilirsiniz.'
          : 'Rota tekrar aktif duruma alındı.'
      });
    }

    // ==========================================
    // ACTION 3: REORDER_STOPS
    // ==========================================
    if (action === 'REORDER_STOPS') {
      const { route_id, duraklar, personel } = body;
      if (!route_id || !Array.isArray(duraklar)) {
        return NextResponse.json({ success: false, error: 'Geçersiz durak listesi' }, { status: 400 });
      }

      const rawRoute = await routeCol.findOne(buildIdFilter(route_id));
      if (!rawRoute) {
        return NextResponse.json({ success: false, error: 'Rota bulunamadı' }, { status: 404 });
      }

      const headerClientId = request.headers.get('x-client-id') || '';
      const effectiveClientId = (body.client_id || headerClientId || '').trim();
      const staffName = (session.ad_soyad || session.username || personel || 'Personel').trim();
      const route = mapDoc(rawRoute);
      const lockCheck = checkRouteLock(route, staffName, effectiveClientId);

      if (lockCheck.isLocked && session.rol !== 'ADMIN') {
        return NextResponse.json({
          success: false,
          locked: true,
          lockedBy: lockCheck.lockedBy,
          error: `Bu rota şu anda "${lockCheck.lockedBy}" personeline aittir ve sıralama değiştirilemez.`
        }, { status: 409 });
      }

      const reindexedStops = duraklar.map((s: any, idx: number) => ({
        ...s,
        sira: idx + 1
      }));

      await routeCol.updateOne(buildIdFilter(route_id), {
        $set: {
          duraklar: reindexedStops.map(encryptRouteStop),
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

      const headerClientId = request.headers.get('x-client-id') || '';
      const effectiveClientId = (body.client_id || headerClientId || '').trim();
      const route = mapDoc(rawRoute);
      const staffName = (session.ad_soyad || session.username || personel || 'Personel').trim();
      const lockCheck = checkRouteLock(route, staffName, effectiveClientId);

      if (lockCheck.isLocked && session.rol !== 'ADMIN') {
        return NextResponse.json({
          success: false,
          locked: true,
          lockedBy: lockCheck.lockedBy,
          error: `Bu rota şu anda "${lockCheck.lockedBy}" personeli tarafından Rota Modunda kullanılmaktadır ve sonlandırılamaz.`
        }, { status: 409 });
      }

      const stops = route.duraklar || [];

      if (!stops || stops.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'Rotada teslimat yapılacak hane bulunamadı.'
        }, { status: 400 });
      }

      // KURAL: Rotayı tamamlayabilmek için rotadaki TÜM hanelere kömür teslim edilmiş olması gerekir.
      // İstisna olarak eksik kömür verilen olsa bile tamamlama işlemi yapılabilir;
      // ancak hiç kömür verilmeyen hane var ise tamamlanamaz!
      const getStopDeliveredBags = (s: any) => {
        if (s.durum === 'TAMAMLANDI') {
          return Number(s.teslim_edilen_torba) || Number(s.hedef_torba) || 34;
        }
        if (s.durum === 'EKSIK') {
          return Number(s.teslim_edilen_torba) || 0;
        }
        return 0;
      };

      const noCoalStops = stops.filter((s: any) => {
        const bags = getStopDeliveredBags(s);
        const hasDeliveredCoal = (s.durum === 'TAMAMLANDI' || s.durum === 'EKSIK') && bags > 0;
        return !hasDeliveredCoal;
      });

      if (noCoalStops.length > 0) {
        const sampleStops = noCoalStops
          .slice(0, 3)
          .map((s: any) => `#${s.sira || '?'} ${s.ad_soyad} (${s.durum === 'TESLIM_EDILEMEDI' ? 'Teslim Edilemedi' : 'Kömür Verilmedi'})`)
          .join(', ');
        const extraCount = noCoalStops.length > 3 ? ` ve ${noCoalStops.length - 3} hane daha` : '';

        return NextResponse.json(
          {
            success: false,
            error: `Rotayı tamamlayabilmek için rotadaki tüm hanelere kömür teslim edilmesi gerekmektedir. Hiç kömür teslim edilmeyen ${noCoalStops.length} hane bulunmaktadır (${sampleStops}${extraCount}). İstisna olarak eksik kömür verilen olsa bile tamamlama işlemi yapılabilir; ancak hiç kömür verilmeyen hane var ise rota tamamlanamaz.`,
            noCoalCount: noCoalStops.length,
            noCoalStops: noCoalStops.map((s: any) => ({
              sira: s.sira,
              ad_soyad: s.ad_soyad,
              durum: s.durum || 'BEKLIYOR',
              teslim_edilen_torba: s.teslim_edilen_torba || 0
            }))
          },
          { status: 400 }
        );
      }

      // Calculate final counts
      let completedCount = 0;
      let eksikCount = 0;
      let undeliveredCount = 0;
      let totalDeliveredBags = 0;

      stops.forEach((s: any) => {
        if (s.durum === 'TAMAMLANDI') {
          completedCount++;
          totalDeliveredBags += s.teslim_edilen_torba || s.hedef_torba || 34;
          if (!s.teslim_eden_personel) {
            s.teslim_eden_personel = staffName || route.dagitim_personeli || 'Personel';
          }
        } else if (s.durum === 'EKSIK') {
          eksikCount++;
          totalDeliveredBags += s.teslim_edilen_torba || 0;
          if (!s.teslim_eden_personel) {
            s.teslim_eden_personel = staffName || route.dagitim_personeli || 'Personel';
          }
        } else if (s.durum === 'TESLIM_EDILEMEDI') {
          undeliveredCount++;
        }
      });

      await routeCol.updateOne(buildIdFilter(route_id), {
        $set: {
          durum: 'TAMAMLANDI',
          completed_at: localTimeStr,
          duraklar: stops.map(encryptRouteStop),
          tamamlanan_hane: completedCount,
          eksik_hane: eksikCount,
          teslim_edilemeyen_hane: undeliveredCount,
          toplam_dagitilan_torba: totalDeliveredBags,
          kapanis_notu: encryptField(notlar.trim()),
          kapatan_personel: staffName,
          kilitli_personel: null,
          kilitli_personel_username: null,
          kilit_tarihi: null,
          kilit_timestamp: null,
          aktif_rota_modu: false,
          updated_at: localTimeStr
        }
      });

      // Synchronize delivering personnel to any beneficiaries in this route missing it
      for (const s of stops) {
        if (s.durum === 'TAMAMLANDI' || s.durum === 'EKSIK') {
          const finalStaff = s.teslim_eden_personel || staffName || route.dagitim_personeli;
          if (finalStaff && s.beneficiary_id) {
            await benCol.updateOne(
              {
                ...buildIdFilter(s.beneficiary_id),
                $or: [
                  { teslim_eden_personel: null },
                  { teslim_eden_personel: '' },
                  { teslim_eden_personel: { $exists: false } }
                ]
              },
              {
                $set: {
                  teslim_eden_personel: finalStaff,
                  updated_at: localTimeStr
                }
              }
            );
          }
        }
      }

      await recordActivityLog({
        kullanici_adi: staffName,
        kullanici_rolu: session.rol || 'PERSONEL',
        islem_tipi: 'ROTA_KAPATMA',
        baslik: 'Dağıtım Rotası Tamamlandı & Kapatıldı',
        detay: `"${route.rota_adi}" rotası başarıyla tamamlandı ve arşivlendi. ${completedCount} tam hane, ${eksikCount} eksik hane, toplam ${totalDeliveredBags} torba kömür dağıtıldı.`,
        ek_bilgi: { route_id, completedCount, eksikCount, totalDeliveredBags }
      });

      await touchSyncPulse(personel.trim());

      return NextResponse.json({
        success: true,
        message: `Günlük dağıtım rotası başarıyla tamamlandı ve arşivlendi. (${completedCount} Tamamlandı, ${eksikCount} Eksik Teslimat, Toplam ${totalDeliveredBags} Torba)`
      });
    }

    // ==========================================
    // ACTION 4.5: REMOVE_STOP (Durak Rotadan Çıkar)
    // ==========================================
    if (action === 'REMOVE_STOP') {
      const { route_id, stop_index, personel = 'Personel' } = body;
      if (!route_id || stop_index === undefined) {
        return NextResponse.json({ success: false, error: 'Rota ID ve durak sırası zorunludur' }, { status: 400 });
      }

      const rawRoute = await routeCol.findOne(buildIdFilter(route_id));
      if (!rawRoute) {
        return NextResponse.json({ success: false, error: 'Rota bulunamadı' }, { status: 404 });
      }

      const headerClientId = request.headers.get('x-client-id') || '';
      const effectiveClientId = (body.client_id || headerClientId || '').trim();
      const route = mapDoc(rawRoute);
      const staffName = (session.ad_soyad || session.username || personel || 'Personel').trim();
      const lockCheck = checkRouteLock(route, staffName, effectiveClientId);

      if (lockCheck.isLocked && session.rol !== 'ADMIN') {
        return NextResponse.json({
          success: false,
          locked: true,
          lockedBy: lockCheck.lockedBy,
          error: `Bu rota şu anda "${lockCheck.lockedBy}" personeli tarafından Rota Modunda kullanılmaktadır.`
        }, { status: 409 });
      }

      const stops = [...(route.duraklar || [])];
      const idx = parseInt(String(stop_index), 10);
      if (isNaN(idx) || idx < 0 || idx >= stops.length) {
        return NextResponse.json({ success: false, error: 'Geçersiz durak indeksi' }, { status: 400 });
      }

      const [removed] = stops.splice(idx, 1);

      // Kalan durakları yeniden numaralandır
      const reindexedStops = stops.map((s: any, i: number) => ({
        ...s,
        sira: i + 1
      }));

      // İstatistikleri yeniden hesapla
      let completedCount = 0;
      let eksikCount = 0;
      let undeliveredCount = 0;
      let totalDeliveredBags = 0;
      let hedefToplam = 0;

      reindexedStops.forEach((s: any) => {
        const h = Number(s.hedef_torba) || 34;
        hedefToplam += h;
        if (s.durum === 'TAMAMLANDI') {
          completedCount++;
          totalDeliveredBags += s.teslim_edilen_torba || h;
        } else if (s.durum === 'EKSIK') {
          eksikCount++;
          totalDeliveredBags += s.teslim_edilen_torba || 0;
        } else if (s.durum === 'TESLIM_EDILEMEDI') {
          undeliveredCount++;
        }
      });

      await routeCol.updateOne(buildIdFilter(route_id), {
        $set: {
          duraklar: reindexedStops.map(encryptRouteStop),
          toplam_hane: reindexedStops.length,
          tamamlanan_hane: completedCount,
          eksik_hane: eksikCount,
          teslim_edilemeyen_hane: undeliveredCount,
          toplam_dagitilan_torba: totalDeliveredBags,
          hedef_toplam_torba: hedefToplam,
          updated_at: localTimeStr
        }
      });

      await recordActivityLog({
        kullanici_adi: personel.trim(),
        kullanici_rolu: session.rol || 'PERSONEL',
        islem_tipi: 'ROTA_GUNCELLEME',
        baslik: 'Durak Rotadan Çıkarıldı',
        detay: `"${removed.ad_soyad}" hanesi "${route.rota_adi}" rotasından çıkarıldı. Kalan durak sayısı: ${reindexedStops.length}.`,
        ek_bilgi: { route_id, removedBeneficiaryId: removed.beneficiary_id, remainingCount: reindexedStops.length }
      });

      await touchSyncPulse(personel.trim());

      return NextResponse.json({
        success: true,
        message: `"${removed.ad_soyad}" rotadan başarıyla çıkarıldı. Kalan: ${reindexedStops.length} durak.`,
        duraklar: reindexedStops
      });
    }

    // ==========================================
    // ACTION 5: DELETE_ROUTE
    // ==========================================
    if (action === 'DELETE_ROUTE') {
      const { route_id, personel = 'Personel' } = body;
      if (!route_id) {
        return NextResponse.json({ success: false, error: 'Rota ID zorunludur' }, { status: 400 });
      }

      const rawRoute = await routeCol.findOne(buildIdFilter(route_id));
      if (rawRoute) {
        const headerClientId = request.headers.get('x-client-id') || '';
        const effectiveClientId = (body.client_id || headerClientId || '').trim();
        const route = mapDoc(rawRoute);
        const staffName = (session.ad_soyad || session.username || personel || 'Personel').trim();
        const lockCheck = checkRouteLock(route, staffName, effectiveClientId);
        if (lockCheck.isLocked && session.rol !== 'ADMIN') {
          return NextResponse.json({
            success: false,
            locked: true,
            lockedBy: lockCheck.lockedBy,
            error: `Bu rota şu anda "${lockCheck.lockedBy}" personeli tarafından kullanımda olduğundan silinemez.`
          }, { status: 409 });
        }
      }

      await routeCol.deleteOne(buildIdFilter(route_id));
      await touchSyncPulse(session.ad_soyad || session.username || 'Personel');

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
          imza_notu: notlar ? encryptField(notlar.trim()) : '',
          updated_at: localTimeStr
        }
      });

      // If there are active routes with this beneficiary, sync the stop across all active routes
      const activeRouteDocs = await routeCol.find({ durum: 'AKTIF' }).toArray();
      for (const rawActiveDoc of activeRouteDocs) {
        const activeDoc = mapDoc(rawActiveDoc);
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
            $set: { duraklar: stops.map(encryptRouteStop), updated_at: localTimeStr }
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
      for (const rawActiveDoc of activeRouteDocs) {
        const activeDoc = mapDoc(rawActiveDoc);
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
            $set: { duraklar: stops.map(encryptRouteStop), updated_at: localTimeStr }
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
