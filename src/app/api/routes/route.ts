import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDbCollections, buildIdFilter, mapDoc, mapDocs, recordActivityLog, touchSyncPulse } from '@/lib/mongodb';
import { encryptField, encryptDeliveryHistory, encryptRoute, encryptRouteStop } from '@/lib/crypto';
import { compareByAddressAsc, getRecordStreetInfo, normalizeStaffName } from '@/lib/normalizer';
import { verifySession } from '@/lib/auth';
import { getIstanbulDate } from '@/lib/dateUtils';

const LOCK_TIMEOUT_MS = 25 * 60 * 1000; // 25 dakika hareketsizlik aşımı

export function checkRouteLock(
  route: any,
  staffName: string,
  clientId?: string
): { isLocked: boolean; lockedBy?: string } {
  if (!route || !route.kilitli_personel) return { isLocked: false };

  // Eğer rota geçici durdurulduysa (DURAKLATILDI) veya aktif rota modunda değilse kilit serbesttir
  if (route.durum === 'DURAKLATILDI' || !route.aktif_rota_modu) {
    return { isLocked: false };
  }

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

/**
 * Bir rotanın işletim ve teslimat yetkisini kontrol eder.
 * Rota aktif veya duraklatılmış ise:
 * - Admin her zaman yetkilidir.
/**
 * Ekip ve Personel Yetkilendirme Kontrolü:
 * - Admin her zaman yetkilidir.
 * - Rotayı oluşturan / işleten personel yetkilidir.
 * - Rotayı işleten personelin takım/ekip arkadaşları yetkilidir.
 * - Ekip dışındaki diğer personeller İŞLEM YAPAMAZ.
 */
const GENERIC_NAMES = new Set([
  'personel',
  'saha personeli',
  'dağıtım personeli',
  'dagitim personeli',
  'dağıtım ekibi',
  'dagitim ekibi',
  'ekip',
  'admin',
  'kullanıcı',
  'kullanici',
  'user'
]);

function isGenericStaffName(name: string): boolean {
  if (!name) return true;
  const clean = name.trim().toLowerCase();
  return clean.length < 3 || GENERIC_NAMES.has(clean);
}

export async function checkRouteTeamAuthorization(
  route: any,
  session: any,
  usersCol?: any
): Promise<{
  authorized: boolean;
  isOwner: boolean;
  isPartner: boolean;
  ownerName: string;
  error?: string;
}> {
  if (!route) {
    return { authorized: false, isOwner: false, isPartner: false, ownerName: '', error: 'Rota bulunamadı.' };
  }

  const routeOperatorName = String(route.isleten_personel || route.dagitim_personeli || route.olusturan_personel || '').trim();

  // Admin kullanıcılar her rotaya tam yetkilidir
  if (session.rol === 'ADMIN') {
    return { authorized: true, isOwner: true, isPartner: false, ownerName: routeOperatorName || 'Yönetici' };
  }

  const currentUsername = String(session.username || '').trim().toLowerCase();
  const currentFullName = String(session.ad_soyad || '').trim().toLowerCase();

  // Rotanın sahibi/işleteni:
  const routeOperatorUsername = String(route.isleten_username || route.olusturan_username || '').trim().toLowerCase();
  const routeOperatorNameLower = routeOperatorName.toLowerCase();

  // Eğer rotanın henüz hiçbir sahibi atanmamışsa ve adı da boş/jenerik ise, ilk işleten kişi sahip olur
  if (!routeOperatorUsername && (!routeOperatorName || isGenericStaffName(routeOperatorName))) {
    return { authorized: true, isOwner: true, isPartner: false, ownerName: session.ad_soyad || session.username || 'Personel' };
  }

  // 1. Doğrudan kullanıcı adı kontrolü (En kesin ve güvenilir eşleşme):
  if (currentUsername && routeOperatorUsername && currentUsername === routeOperatorUsername) {
    return { authorized: true, isOwner: true, isPartner: false, ownerName: routeOperatorName };
  }

  // 1b. Eğer kullanıcı adı boşsa ama ad-soyad jenerik değilse ve birebir aynıysa:
  if (!isGenericStaffName(currentFullName) && !isGenericStaffName(routeOperatorNameLower)) {
    if (currentFullName === routeOperatorNameLower) {
      return { authorized: true, isOwner: true, isPartner: false, ownerName: routeOperatorName };
    }
  }

  // 1c. Rota dağıtım personeli alanında birden fazla isim virgül veya / ile listelenmişse
  if (route.dagitim_personeli) {
    const splitStaff = String(route.dagitim_personeli)
      .split(/[,/&+]/)
      .map((s: string) => s.trim().toLowerCase())
      .filter((s: string) => !isGenericStaffName(s));

    if (currentUsername && splitStaff.includes(currentUsername)) {
      return { authorized: true, isOwner: true, isPartner: false, ownerName: routeOperatorName };
    }
    if (!isGenericStaffName(currentFullName) && splitStaff.includes(currentFullName)) {
      return { authorized: true, isOwner: true, isPartner: false, ownerName: routeOperatorName };
    }
  }

  // 2. Ekip Arkadaşı Kontrolleri:
  // Veritabanından güncel kullanıcı ve operatör dokümanlarını çek
  let currentUserDbDoc: any = null;
  let operatorDbDoc: any = null;
  if (!usersCol) {
    try {
      const db = await getDbCollections();
      usersCol = db.users;
    } catch {
      // ignore
    }
  }

  if (usersCol) {
    try {
      if (currentUsername) {
        currentUserDbDoc = await usersCol.findOne({ username: currentUsername });
      }
      if (routeOperatorUsername) {
        operatorDbDoc = await usersCol.findOne({ username: routeOperatorUsername });
      }
    } catch {
      // ignore db error
    }
  }

  // Kullanıcının ve operatörün ekip adı
  const routeEkipAdi = String(route.ekip_adi || operatorDbDoc?.ekip_adi || '').trim().toLowerCase();
  const userEkipAdi = String(currentUserDbDoc?.ekip_adi || session.user?.ekip_adi || '').trim().toLowerCase();

  if (routeEkipAdi && userEkipAdi && routeEkipAdi === userEkipAdi) {
    return { authorized: true, isOwner: false, isPartner: true, ownerName: routeOperatorName };
  }

  // Rota üzerindeki ve operatörün ekip arkadaşları listesi
  const routePartners = [
    ...(Array.isArray(route.ekip_arkadaslari) ? route.ekip_arkadaslari : []),
    ...(Array.isArray(operatorDbDoc?.ekip_arkadaslari) ? operatorDbDoc.ekip_arkadaslari : []),
    ...(route.ekip_arkadasi ? [route.ekip_arkadasi] : []),
    ...(operatorDbDoc?.ekip_arkadasi ? [operatorDbDoc.ekip_arkadasi] : [])
  ].map((p: any) => String(p).trim().toLowerCase()).filter(Boolean);

  // Kullanıcının kendi profilindeki ekip arkadaşları listesi
  const userPartners = [
    ...(Array.isArray(currentUserDbDoc?.ekip_arkadaslari) ? currentUserDbDoc.ekip_arkadaslari : []),
    ...(Array.isArray(session.user?.ekip_arkadaslari) ? session.user.ekip_arkadaslari : []),
    ...(currentUserDbDoc?.ekip_arkadasi ? [currentUserDbDoc.ekip_arkadasi] : []),
    ...(session.user?.ekip_arkadasi ? [session.user.ekip_arkadasi] : [])
  ].map((p: any) => String(p).trim().toLowerCase()).filter(Boolean);

  // Bu kullanıcı rotanın veya operatörün ekip arkadaşları listesinde var mı?
  if (currentUsername && routePartners.includes(currentUsername)) {
    return { authorized: true, isOwner: false, isPartner: true, ownerName: routeOperatorName };
  }
  if (!isGenericStaffName(currentFullName) && routePartners.includes(currentFullName)) {
    return { authorized: true, isOwner: false, isPartner: true, ownerName: routeOperatorName };
  }

  // Operatör bu kullanıcının ekip arkadaşları listesinde var mı?
  if (routeOperatorUsername && userPartners.includes(routeOperatorUsername)) {
    return { authorized: true, isOwner: false, isPartner: true, ownerName: routeOperatorName };
  }
  if (!isGenericStaffName(routeOperatorNameLower) && userPartners.includes(routeOperatorNameLower)) {
    return { authorized: true, isOwner: false, isPartner: true, ownerName: routeOperatorName };
  }

  // Yetkisiz: Başka personele ve ekibine ait rota!
  return {
    authorized: false,
    isOwner: false,
    isPartner: false,
    ownerName: routeOperatorName,
    error: `Bu rota "${routeOperatorName || 'başka bir personel'}" personeline ve ekibine aittir. Yalnızca ilgili personel veya tanımlı ekip arkadaşı işlem yapabilir.`
  };
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
    const rawActiveRoutes = mapDocs(activeRouteDocs);

    const localNow = new Date().toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(/\./g, '.');

    // Auto-heal / Auto-archive: If any active/paused route has all stops completed, update DB and move to archived
    const activeRoutes: any[] = [];
    const autoArchivedRoutes: any[] = [];

    for (const route of rawActiveRoutes) {
      const stops = Array.isArray(route.duraklar) ? route.duraklar : [];
      const isCompleteStop = (s: any) =>
        s.durum === 'TAMAMLANDI' ||
        s.durum === 'TESLIM_EDILDI' ||
        (Number(s.teslim_edilen_torba) > 0 && Number(s.teslim_edilen_torba) >= Number(s.hedef_torba || 34));

      const isAllComplete = stops.length > 0 && stops.every(isCompleteStop);

      if (isAllComplete) {
        // Auto-heal in MongoDB
        try {
          let totalBags = 0;
          stops.forEach((s: any) => {
            totalBags += Number(s.teslim_edilen_torba) || Number(s.hedef_torba) || 34;
          });
          await routeCol.updateOne(buildIdFilter(route.id || route._id), {
            $set: {
              durum: 'TAMAMLANDI',
              tamamlanan_hane: stops.length,
              eksik_hane: 0,
              teslim_edilemeyen_hane: 0,
              toplam_dagitilan_torba: totalBags,
              completed_at: route.completed_at || localNow,
              kapatan_personel: route.kapatan_personel || route.isleten_personel || route.dagitim_personeli || 'Sistem',
              kapanis_notu: encryptField('Tüm duraklar eksiksiz tamamlandığı için rota otomatik kapatıldı ve arşivlendi.'),
              kilitli_personel: null,
              kilitli_personel_username: null,
              kilitli_client_id: null,
              kilit_tarihi: null,
              kilit_timestamp: null,
              aktif_rota_modu: false,
              updated_at: localNow
            }
          });
          autoArchivedRoutes.push({
            ...route,
            durum: 'TAMAMLANDI',
            tamamlanan_hane: stops.length,
            eksik_hane: 0,
            teslim_edilemeyen_hane: 0,
            toplam_dagitilan_torba: totalBags,
            completed_at: route.completed_at || localNow,
            aktif_rota_modu: false
          });
        } catch (e) {
          console.error('Error auto-healing completed route:', e);
          activeRoutes.push(route);
        }
      } else {
        activeRoutes.push(route);
      }
    }

    const activeRoute = activeRoutes[0] || null;

    // 2. Fetch Archived / Completed Routes (sorted descending by date)
    const archivedDocs = await routeCol
      .find({ durum: { $in: ['TAMAMLANDI', 'ARSIVLENDI'] } })
      .toArray();
    const fetchedArchived = mapDocs(archivedDocs);
    const combinedArchived = [...autoArchivedRoutes, ...fetchedArchived];
    
    // Deduplicate by ID
    const seenArchivedIds = new Set<string>();
    const uniqueArchived = combinedArchived.filter((r) => {
      const idStr = String(r.id || r._id);
      if (seenArchivedIds.has(idStr)) return false;
      seenArchivedIds.add(idStr);
      return true;
    });

    const archivedRoutes = uniqueArchived.sort((a: any, b: any) => {
      const dateA = new Date(b.created_at || b.completed_at || 0).getTime();
      const dateB = new Date(a.created_at || a.completed_at || 0).getTime();
      return dateA - dateB;
    });

    // 3. Fetch beneficiaries with signed status (ready for route)
    // Citizens whose signature is taken and coal is not yet delivered
    const pendingSignedDocs = await benCol
      .find({
        imza_durumu: 'IMZALANDI',
        teslimat_durumu: { $nin: ['TAMAMLANDI', 'TESLIM_EDILDI'] },
        komur_verilmeyecek: { $ne: true }
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

    const { deliveryRoutes: routeCol, beneficiaries: benCol, deliveryHistory: histCol, users: usersCol } = await getDbCollections();
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

      // Multi-Route & Transfer Support:
      // If any selected beneficiaries are currently pending (BEKLIYOR) in another active route,
      // seamlessly transfer them to the new route so teams can split or reallocate work.
      const otherActiveRoutes = await routeCol.find({ durum: { $in: ['AKTIF', 'DURAKLATILDI'] } }).toArray();
      const selectedIdSet = new Set(beneficiary_ids.map((id: any) => String(id)));

      for (const otherRoute of otherActiveRoutes) {
        const stops = otherRoute.duraklar || [];
        const stopsToKeep: any[] = [];
        const stopsToTransfer: any[] = [];

        for (const s of stops) {
          const sId = String(s.beneficiary_id);
          // If this stop is in the new route's selection and hasn't been delivered yet (BEKLIYOR or TESLIM_EDILEMEDI)
          if (selectedIdSet.has(sId) && (!s.durum || s.durum === 'BEKLIYOR' || s.durum === 'TESLIM_EDILEMEDI')) {
            stopsToTransfer.push(s);
          } else {
            stopsToKeep.push(s);
          }
        }

        if (stopsToTransfer.length > 0) {
          // Re-index remaining stops in previous route
          const reindexedRemaining = stopsToKeep.map((s: any, idx: number) => ({
            ...s,
            sira: idx + 1
          }));

          // Recalculate stats for the previous route
          let compCount = 0;
          let eksCount = 0;
          let undelivCount = 0;
          let totalDelivBags = 0;
          let targetTotalBags = 0;

          reindexedRemaining.forEach((s: any) => {
            const h = Number(s.hedef_torba) || 34;
            targetTotalBags += h;
            if (s.durum === 'TAMAMLANDI') {
              compCount++;
              totalDelivBags += s.teslim_edilen_torba || h;
            } else if (s.durum === 'EKSIK') {
              eksCount++;
              totalDelivBags += s.teslim_edilen_torba || 0;
            } else if (s.durum === 'TESLIM_EDILEMEDI') {
              undelivCount++;
            }
          });

          const updateFields: any = {
            duraklar: reindexedRemaining,
            toplam_hane: reindexedRemaining.length,
            tamamlanan_hane: compCount,
            eksik_hane: eksCount,
            teslim_edilemeyen_hane: undelivCount,
            toplam_dagitilan_torba: totalDelivBags,
            hedef_toplam_torba: targetTotalBags,
            updated_at: localTimeStr
          };

          // If all stops were transferred out and route is empty, mark as TAMAMLANDI to prevent ghost empty active routes
          if (reindexedRemaining.length === 0) {
            updateFields.durum = 'TAMAMLANDI';
            updateFields.completed_at = localTimeStr;
            updateFields.kapanis_notu = `Tüm duraklar (${stopsToTransfer.length} hane) yeni oluşturulan "${(rota_adi || 'Yeni Rota').trim()}" rotasına aktarıldığı için kapatıldı.`;
          }

          await routeCol.updateOne(buildIdFilter(otherRoute.id || otherRoute._id), {
            $set: updateFields
          });

          await recordActivityLog({
            kullanici_adi: olusturan_personel.trim(),
            kullanici_rolu: 'PERSONEL',
            islem_tipi: 'ROTA_GUNCELLEME',
            baslik: 'Duraklar Yeni Rotaya Aktarıldı',
            detay: `"${otherRoute.rota_adi}" rotasındaki ${stopsToTransfer.length} durak yeni rotaya aktarıldı. Kalan durak sayısı: ${reindexedRemaining.length}.`,
            ek_bilgi: {
              sourceRouteId: otherRoute.id || otherRoute._id,
              transferredCount: stopsToTransfer.length,
              transferredBeneficiaryIds: stopsToTransfer.map((s: any) => s.beneficiary_id)
            }
          });
        }
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
          b.teslimat_durumu !== 'TESLIM_EDILDI' &&
          !b.komur_verilmeyecek
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
          sira_no: b.sira_no || b.mahalle_sira || '',
          liste_turu: b.liste_turu || '',
          ek_liste_no: b.ek_liste_no ?? null,
          ek_liste_adi: b.ek_liste_adi || '',
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
        olusturan_username: session.username || '',
        dagitim_personeli: (dagitim_personeli || olusturan_personel).trim(),
        isleten_personel: (dagitim_personeli || olusturan_personel).trim(),
        isleten_username: session.username || '',
        ekip_adi: session.user?.ekip_adi || '',
        ekip_arkadaslari: Array.isArray(session.user?.ekip_arkadaslari) ? session.user.ekip_arkadaslari : [],
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
    // ACTION: ADD_STOPS_TO_ROUTE (VAR OLAN ROTAYA YENİ HANE / DURAK EKLEME)
    // ==========================================
    if (action === 'ADD_STOPS_TO_ROUTE') {
      const {
        route_id,
        beneficiary_ids = [],
        personel = 'Personel',
        client_id
      } = body;

      if (!route_id) {
        return NextResponse.json({ success: false, error: 'Hedef Rota ID zorunludur' }, { status: 400 });
      }

      if (!beneficiary_ids || beneficiary_ids.length === 0) {
        return NextResponse.json({ success: false, error: 'Rotaya eklenecek en az bir hane seçilmelidir' }, { status: 400 });
      }

      const targetRouteDoc = await routeCol.findOne(buildIdFilter(route_id));
      if (!targetRouteDoc) {
        return NextResponse.json({ success: false, error: 'Hedef rota bulunamadı' }, { status: 404 });
      }

      // Ekip yetki kontrolü
      const { users: usersCol } = await getDbCollections();
      const authCheck = await checkRouteTeamAuthorization(targetRouteDoc, session, usersCol);
      if (!authCheck.authorized) {
        return NextResponse.json({ success: false, error: authCheck.error }, { status: 403 });
      }

      // Kilit kontrolü
      const headerClientId = request.headers.get('x-client-id') || '';
      const effectiveClientId = (client_id || headerClientId || '').trim();
      const lockCheck = checkRouteLock(targetRouteDoc, personel, effectiveClientId);
      if (lockCheck.isLocked) {
        return NextResponse.json(
          {
            success: false,
            error: `Bu rota şu anda "${lockCheck.lockedBy}" personeli tarafından kullanımda ve kilitlidir.`
          },
          { status: 423 }
        );
      }

      // Haneleri çek
      const objectIds: ObjectId[] = [];
      const stringIds: string[] = [];
      const numberIds: number[] = [];

      beneficiary_ids.forEach((id: string) => {
        const s = String(id).trim();
        if (ObjectId.isValid(s) && s.length === 24) objectIds.push(new ObjectId(s));
        stringIds.push(s);
        const num = Number(s);
        if (!isNaN(num) && num > 0) numberIds.push(num);
      });

      const orClauses: any[] = [{ id: { $in: stringIds } }];
      if (objectIds.length > 0) orClauses.push({ _id: { $in: objectIds } });
      if (numberIds.length > 0) orClauses.push({ id: { $in: numberIds } });

      const rawBeneficiaries = await benCol.find({ $or: orClauses }).toArray();
      const fetchedBeneficiaries = mapDocs(rawBeneficiaries).filter(
        (b: any) =>
          b.imza_durumu === 'IMZALANDI' &&
          b.teslimat_durumu !== 'TAMAMLANDI' &&
          b.teslimat_durumu !== 'TESLIM_EDILDI' &&
          !b.komur_verilmeyecek
      );

      if (fetchedBeneficiaries.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Seçilen hanelerin imzası alınmamış veya teslimatları zaten yapılmış.' },
          { status: 400 }
        );
      }

      const existingStops = Array.isArray(targetRouteDoc.duraklar) ? targetRouteDoc.duraklar : [];
      const existingBenIdSet = new Set(existingStops.map((s: any) => String(s.beneficiary_id)));

      // Sadece henüz bu rotada olmayanları ekle
      const toAdd = fetchedBeneficiaries.filter((b: any) => !existingBenIdSet.has(String(b.id || b._id)));

      if (toAdd.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Seçilen haneler zaten bu rotada mevcut.' },
          { status: 400 }
        );
      }

      // Adrese göre sırala
      toAdd.sort(compareByAddressAsc);

      let eklenenHedefTorba = 0;
      const newStops = toAdd.map((b: any, index: number) => {
        const stInfo = getRecordStreetInfo(b);
        const hedef = Number(b.hedef_torba) || 34;
        eklenenHedefTorba += hedef;

        return encryptRouteStop({
          sira: existingStops.length + index + 1,
          beneficiary_id: b.id || b._id,
          ad_soyad: b.ad_soyad || '',
          tc_no: b.tc_no || '',
          mahalle: b.mahalle || '',
          cadde_sokak: stInfo.sokak || b.cadde_sokak || '',
          kapi_no: String(stInfo.kapiNo || b.kapi_no || ''),
          daire_no: String(stInfo.daireNo || b.daire_no || ''),
          adres: b.adres || '',
          telefon: b.telefon || '',
          hedef_torba: hedef,
          teslim_edilen_torba: 0,
          durum: 'BEKLIYOR',
          teslim_edildi_mi: false,
          teslim_tarihi: null,
          teslim_saati: null,
          teslim_personeli: null,
          imza_alindi_mi: true,
          imza_tarihi: b.imza_tarihi || new Date().toISOString(),
          notlar: ''
        });
      });

      const updatedStops = [...existingStops, ...newStops];
      const newTotalHane = updatedStops.length;
      const newBekleyenHane = updatedStops.filter((s: any) => !s.durum || s.durum === 'BEKLIYOR').length;
      const currentHedefTorba = Number(targetRouteDoc.toplam_hedef_torba) || 0;
      const newTotalHedefTorba = currentHedefTorba + eklenenHedefTorba;

      // Mahalle listesini genişlet
      const newNeighborhoods = toAdd.map((b: any) => b.mahalle).filter(Boolean);
      const existingNeighborhoods = Array.isArray(targetRouteDoc.mahalleler) ? targetRouteDoc.mahalleler : [];
      const updatedNeighborhoods = Array.from(new Set([...existingNeighborhoods, ...newNeighborhoods]));

      // Rotayı güncelle
      await routeCol.updateOne(buildIdFilter(route_id), {
        $set: {
          duraklar: updatedStops,
          toplam_hane: newTotalHane,
          bekleyen_hane: newBekleyenHane,
          toplam_hedef_torba: newTotalHedefTorba,
          mahalleler: updatedNeighborhoods,
          updated_at: new Date().toISOString()
        }
      });

      // Hak sahiplerinin durumunu güncelle
      const toAddIdClauses: any[] = [];
      toAdd.forEach((b: any) => {
        if (b.id) toAddIdClauses.push({ id: b.id });
        if (b._id) toAddIdClauses.push({ _id: b._id });
        if (ObjectId.isValid(String(b.id || b._id)) && String(b.id || b._id).length === 24) {
          toAddIdClauses.push({ _id: new ObjectId(String(b.id || b._id)) });
        }
      });

      if (toAddIdClauses.length > 0) {
        await benCol.updateMany(
          { $or: toAddIdClauses },
          {
            $set: {
              durum_aciklama: `Rotaya Eklendi: ${targetRouteDoc.rota_adi}`,
              updated_at: new Date().toISOString(),
              guncelleyen_personel: personel
            }
          }
        );
      }

      await touchSyncPulse(personel.trim());

      await recordActivityLog({
        kullanici_adi: session.username || personel,
        kullanici_rolu: session.rol || 'PERSONEL',
        islem_tipi: 'ROTA_GUNCELLEME',
        baslik: 'Rotaya Hane Eklendi',
        detay: `"${targetRouteDoc.rota_adi}" rotasına ${toAdd.length} yeni hane eklendi (+${eklenenHedefTorba} Torba).`,
        torba_sayisi: eklenenHedefTorba,
        ek_bilgi: { route_id, added_count: toAdd.length, eklenen_torba: eklenenHedefTorba }
      });

      const refreshedDoc = await routeCol.findOne(buildIdFilter(route_id));
      const updatedRoute = mapDoc(refreshedDoc);

      return NextResponse.json({
        success: true,
        message: `${toAdd.length} hane "${targetRouteDoc.rota_adi}" rotasına başarıyla eklendi.`,
        route: updatedRoute,
        addedCount: toAdd.length
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

      // Takım / Ekip arkadaşı yetki kontrolü
      const authCheck = await checkRouteTeamAuthorization(route, session, usersCol);
      if (!authCheck.authorized) {
        return NextResponse.json({
          success: false,
          unauthorized_team: true,
          locked: true,
          lockedBy: authCheck.ownerName,
          error: authCheck.error
        }, { status: 403 });
      }

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
          isleten_personel: staffName,
          isleten_username: session.username || '',
          ekip_adi: session.user?.ekip_adi || route.ekip_adi || '',
          ekip_arkadaslari: session.user?.ekip_arkadaslari || route.ekip_arkadaslari || [],
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
      const rawStaff = (
        (body.personel && body.personel !== 'Personel' && body.personel !== 'Dağıtım Personeli')
          ? body.personel
          : (session.ad_soyad || session.username || body.personel || 'Personel')
      ).trim();
      const staffName = normalizeStaffName(rawStaff) || rawStaff || 'Personel';
      const route = mapDoc(rawRoute);

      // Takım / Ekip arkadaşı yetki kontrolü
      const authCheck = await checkRouteTeamAuthorization(route, session, usersCol);
      if (!authCheck.authorized) {
        return NextResponse.json({
          success: false,
          unauthorized_team: true,
          locked: true,
          lockedBy: authCheck.ownerName,
          error: authCheck.error
        }, { status: 403 });
      }

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
        const parsed = parseInt(torba_sayisi || String(hedef), 10);
        deliveredBags = !isNaN(parsed) && parsed > 0 ? parsed : hedef;
        if (deliveredBags < hedef && previousDelivered > 0) {
          deliveredBags = Math.min(hedef, previousDelivered + deliveredBags);
        }
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
      if (durum === 'TAMAMLANDI' || durum === 'EKSIK') {
        targetStop.imza_durumu = 'IMZALANDI';
        targetStop.imza_tarihi = localTimeStr;
        targetStop.imza_alan_personel = staffName;
      }
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
        const isComplete =
          s.durum === 'TAMAMLANDI' ||
          s.durum === 'TESLIM_EDILDI' ||
          (Number(s.teslim_edilen_torba) > 0 && Number(s.teslim_edilen_torba) >= Number(s.hedef_torba || 34));

        if (isComplete) {
          s.durum = 'TAMAMLANDI';
          completedCount++;
          totalDeliveredBags += Number(s.teslim_edilen_torba) || Number(s.hedef_torba) || 34;
        } else if (s.durum === 'EKSIK') {
          eksikCount++;
          totalDeliveredBags += Number(s.teslim_edilen_torba) || 0;
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
        isleten_personel: staffName,
        isleten_username: session.username || '',
        ekip_adi: session.user?.ekip_adi || route.ekip_adi || '',
        ekip_arkadaslari: session.user?.ekip_arkadaslari || route.ekip_arkadaslari || [],
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
            imza_durumu: 'IMZALANDI',
            imza_tarihi: localTimeStr,
            imza_alan_personel: staffName,
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
            imza_durumu: 'IMZALANDI',
            imza_tarihi: localTimeStr,
            imza_alan_personel: staffName,
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

      // Takım / Ekip arkadaşı yetki kontrolü
      const authCheck = await checkRouteTeamAuthorization(route, session, usersCol);
      if (!authCheck.authorized) {
        return NextResponse.json({
          success: false,
          unauthorized_team: true,
          locked: true,
          lockedBy: authCheck.ownerName,
          error: authCheck.error
        }, { status: 403 });
      }

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
        isleten_personel: staffName,
        isleten_username: session.username || '',
        ekip_adi: session.user?.ekip_adi || route.ekip_adi || '',
        ekip_arkadaslari: session.user?.ekip_arkadaslari || route.ekip_arkadaslari || [],
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

      // Takım / Ekip arkadaşı yetki kontrolü
      const authCheckReorder = await checkRouteTeamAuthorization(route, session, usersCol);
      if (!authCheckReorder.authorized) {
        return NextResponse.json({
          success: false,
          unauthorized_team: true,
          locked: true,
          lockedBy: authCheckReorder.ownerName,
          error: authCheckReorder.error
        }, { status: 403 });
      }

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

      // Takım / Ekip arkadaşı yetki kontrolü
      const authCheckFinalize = await checkRouteTeamAuthorization(route, session, usersCol);
      if (!authCheckFinalize.authorized) {
        return NextResponse.json({
          success: false,
          unauthorized_team: true,
          locked: true,
          lockedBy: authCheckFinalize.ownerName,
          error: authCheckFinalize.error
        }, { status: 403 });
      }

      const rawFinalStaff = (session.ad_soyad || session.username || personel || 'Personel').trim();
      const staffName = normalizeStaffName(rawFinalStaff) || rawFinalStaff || 'Personel';
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

      if (removed && removed.beneficiary_id) {
        await benCol.updateOne(
          {
            ...buildIdFilter(removed.beneficiary_id),
            teslimat_durumu: 'TESLIM_EDILEMEDI'
          },
          {
            $set: { teslimat_durumu: 'BEKLIYOR', updated_at: localTimeStr }
          }
        );
      }

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
