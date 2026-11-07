import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, buildIdFilter, mapDoc, recordActivityLog, touchSyncPulse } from '@/lib/mongodb';
import { encryptField, encryptDeliveryHistory, encryptRouteStop, hashTc } from '@/lib/crypto';
import { cleanTcNo, normalizeStaffName } from '@/lib/normalizer';
import { getIstanbulDate, isPastDeliveryDate } from '@/lib/dateUtils';
import { verifySession } from '@/lib/auth';
import { checkRouteTeamAuthorization, ensureTeamDailyRoute, addBeneficiariesToTeamRoute } from '@/app/api/routes/route';
import { serverError } from '@/lib/security';

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json(
        { success: false, error: 'Oturum süresi dolmuş veya yetkisiz istek. Lütfen tekrar giriş yapınız.' },
        { status: 401 }
      );
    }

    // Security & Role Enforcement: MUDUR role is strictly read-only monitoring and cannot deliver coal or cancel
    if (session.rol === 'MUDUR') {
      return NextResponse.json(
        {
          success: false,
          code: 'FORBIDDEN',
          error: 'Yetki Sınırı: Müdür yetkilisi salt okunur izleme modundadır. Dağıtım veya iptal işlemi yapamaz.',
        },
        { status: 403 }
      );
    }

    const { beneficiaries: benCol, deliveryHistory: histCol, deliveryRoutes: routeCol, users: usersCol, signatureLists: sigCol } = await getDbCollections();
    const body = await request.json();
    const { action, beneficiary_id, tc_no, torba_sayisi, eklenen_torba, teslim_alan, notlar, iptal_nedeni, revoke_signature } = body;

    if (!beneficiary_id && !tc_no) {
      return NextResponse.json({ success: false, error: 'Kayıt ID veya TC Kimlik No zorunludur' }, { status: 400 });
    }

    let rawBeneficiary = beneficiary_id ? await benCol.findOne(buildIdFilter(beneficiary_id)) : null;

    // Fallback lookup by TC blind index hash if beneficiary_id was a history ID or changed
    if (!rawBeneficiary && tc_no) {
      const cleanedTc = cleanTcNo(tc_no);
      const tcHash = hashTc(cleanedTc);
      if (cleanedTc) {
        rawBeneficiary = await benCol.findOne({
          $or: [
            ...(tcHash ? [{ tc_hash: tcHash }] : []),
            { tc_no: cleanedTc },
          ],
        });
      }
    }

    if (!rawBeneficiary) {
      return NextResponse.json({ success: false, error: 'Hak sahibi bulunamadı' }, { status: 404 });
    }

    const beneficiary = mapDoc(rawBeneficiary);
    const { nowLocaleTr, nowEnCa } = getIstanbulDate();
    const localToday = nowEnCa;
    const localTimeStr = nowLocaleTr;
    const callerStaff = (session.ad_soyad || session.username || 'Personel').trim();

    // Server-side Route & Team Ownership Check:
    // Eğer hane aktif veya duraklatılmış bir rotadaysa, yalnızca rotayı işleten personel veya ekip arkadaşı işlem yapabilir.
    const activeOrPausedRoutes = await routeCol.find({
      durum: { $in: ['AKTIF', 'DURAKLATILDI'] }
    }).toArray();

    const benIdStr = String(beneficiary.id || beneficiary._id || '');
    const benTcStr = String(beneficiary.tc_no || '').trim();
    const benTcHash = beneficiary.tc_hash || '';

    for (const rawRoute of activeOrPausedRoutes) {
      const decRoute = mapDoc(rawRoute);
      const stops = Array.isArray(decRoute.duraklar) ? decRoute.duraklar : [];
      const isInRoute = stops.some((s: any) => {
        const sBenId = String(s.beneficiary_id || s.id || '');
        const sTc = String(s.tc_no || '').trim();
        const sTcHash = s.tc_hash || '';
        return (
          (benIdStr && sBenId && benIdStr === sBenId) ||
          (benTcStr && sTc && benTcStr === sTc) ||
          (benTcHash && sTcHash && benTcHash === sTcHash)
        );
      });

      if (isInRoute) {
        // Ekip arkadaşı / yetki kontrolü
        const teamCheck = await checkRouteTeamAuthorization(decRoute, session, usersCol);
        if (!teamCheck.authorized) {
          const owner = teamCheck.ownerName || decRoute.isleten_personel || decRoute.dagitim_personeli || 'başka bir personel';
          return NextResponse.json(
            {
              success: false,
              rota_kilitli: true,
              unauthorized_team: true,
              aktif_rota_modu_personel: owner,
              error: `Bu hane "${decRoute.rota_adi || 'Aktif Rota'}" kapsamında ${owner} personeline ve ekibine aittir. Yalnızca rotayı işleten personel veya tanımlı ekip arkadaşı teslimat yapabilir.`,
            },
            { status: 423 }
          );
        }
      }
    }

    if (action === 'TESLIMAT') {
      const hedef = beneficiary.hedef_torba || 34;
      const currentStatus = beneficiary.teslimat_durumu;
      const currentBags = beneficiary.torba_sayisi || 0;

      // 1. Conflict Check: Is it already completed or cancelled?
      if (currentStatus === 'TAMAMLANDI') {
        const staffName = beneficiary.teslim_eden_personel || 'başka bir personel';
        const dateStr = beneficiary.teslimat_tarihi || '';
        const isOfflineSync = Boolean(body.is_offline_sync || request.headers.get('x-offline-sync') === 'true');
        if (isOfflineSync) {
          return NextResponse.json(
            {
              success: true,
              alreadyCompletedByPartner: true,
              already_completed: true,
              completedBy: staffName,
              message: `Bu hak sahibine (${beneficiary.ad_soyad}) ekip arkadaşınız (${staffName}) tarafından daha önce teslimat yapılmıştır. Mükerrer teslimat engellendi ve yerel kuyruk eşitlendi.`,
              beneficiary,
            },
            { status: 200 }
          );
        }
        return NextResponse.json(
          {
            success: false,
            conflict: true,
            error: `UYARI: Bu hak sahibine (${beneficiary.ad_soyad}) zaten ${staffName} tarafından ${dateStr ? dateStr + ' tarihinde ' : ''}tam teslimat yapılmıştır! Mükerrer teslimat engellendi.`,
            beneficiary,
          },
          { status: 409 }
        );
      }

      if (beneficiary.komur_verilmeyecek) {
        return NextResponse.json(
          {
            success: false,
            conflict: true,
            error: `UYARI: Bu hak sahibine kömür yardımı iptal edilmiştir (Kömür Verilmeyecek)! Kömür teslimatı yapılamaz. İptal Nedeni: ${beneficiary.komur_iptal_nedeni || 'Belirtilmemiş'}${beneficiary.komur_iptal_aciklama ? ` (${beneficiary.komur_iptal_aciklama})` : ''}`,
            beneficiary,
          },
          { status: 409 }
        );
      }

      if (currentStatus === 'IPTAL') {
        return NextResponse.json(
          {
            success: false,
            conflict: true,
            error: `UYARI: Bu hak sahibinin kaydı iptal edilmiştir! Teslimat yapılamaz. İptal Gerekçesi: ${beneficiary.iptal_nedeni || 'Belirtilmemiş'}`,
            beneficiary,
          },
          { status: 409 }
        );
      }

      let newTotalBags = 0;
      let deliveredThisTime = 0;

      if (eklenen_torba !== undefined && eklenen_torba !== null) {
        const addAmount = parseInt(eklenen_torba, 10);
        if (isNaN(addAmount) || addAmount <= 0 || addAmount > 150) {
          return NextResponse.json({ success: false, error: 'Geçersiz teslim edilecek torba miktarı (1-150 arası olmalıdır)' }, { status: 400 });
        }
        // Hane hedef kotasını (varsayılan 34) asla aşamaz
        newTotalBags = Math.min(hedef, currentBags + addAmount);
        deliveredThisTime = Math.max(0, newTotalBags - currentBags);
      } else {
        const requestedVal = parseInt(torba_sayisi || String(hedef), 10);
        if (isNaN(requestedVal) || requestedVal <= 0 || requestedVal > 200) {
          return NextResponse.json({ success: false, error: 'Geçersiz toplam torba miktarı' }, { status: 400 });
        }
        // Mevcut torba varsa ve kullanıcı kalan miktarı girdiyse (örn: 20 varken 14 girdiyse)
        if (currentBags > 0 && requestedVal < hedef && currentBags + requestedVal <= hedef) {
          newTotalBags = Math.min(hedef, currentBags + requestedVal);
          deliveredThisTime = Math.max(0, newTotalBags - currentBags);
        } else {
          newTotalBags = Math.min(hedef, requestedVal);
          deliveredThisTime = Math.max(0, newTotalBags - currentBags);
          if (deliveredThisTime <= 0 && currentBags < hedef) {
            deliveredThisTime = Math.max(0, hedef - currentBags);
            newTotalBags = hedef;
          }
        }
      }

      const recipient = (teslim_alan || beneficiary.ad_soyad).trim();
      const rawStaff = (
        (body.personel && body.personel !== 'Personel' && body.personel !== 'Dağıtım Personeli')
          ? body.personel
          : (session.ad_soyad || session.username || body.personel || 'Personel')
      ).trim();
      const staff = normalizeStaffName(rawStaff) || rawStaff || 'Saha Personeli';
      const note = (notlar || '').trim();

      // Islak imza listeleri çıktıktan sonra tek hane kaydı eklenip kömür teslimatı yapılırsa:
      // Listesi çıkmadığı halde kömür verilmiş olacağından manuel ek listeye imza alınmış kabul edilir.
      // Ek kömür verilenler listesi olarak sistemde tutulur ve istatistiklere/teslimatlara eklenir.
      const hasSignatureLists = sigCol ? (await sigCol.countDocuments({})) > 0 : false;
      const isWithoutSignatureList = !beneficiary.imza_listesi_id || String(beneficiary.imza_listesi_id).trim() === '';
      const isSingleOrEkRecord = Boolean(beneficiary.tekil_hane_ekleme || beneficiary.sonradan_eklenen_hane || beneficiary.liste_turu === 'EK_LISTE');
      const isManuelEkListeImza = (hasSignatureLists && isWithoutSignatureList) || isSingleOrEkRecord || Boolean(beneficiary.manuel_ek_liste_imzasi);

      const datePart = (localTimeStr ? localTimeStr.split(' ')[0] : '') || localToday.split('-').reverse().join('.');
      const ekListeImzaNotu = beneficiary.ek_liste_imza_notu || (isManuelEkListeImza ? `${datePart} tarihinde ek listeye imzası alındı` : null);

      // Determine status: TAMAMLANDI vs EKSIK
      let newStatus = 'TAMAMLANDI';
      if (newTotalBags < hedef) {
        newStatus = 'EKSIK';
      }

      // Kural: Vatandaşa eksik kömür verildiği gün esas kömür teslimat tarihidir!
      // Sonraki günlerde kalan eksik kömür tamamlandığında ilk teslimat tarihi ASLA ezilmez;
      // tamamlanma zamanı ayrı olarak eksik_tamamlanma_tarihi alanına kaydedilir.
      const isCompletingPartial = currentBags > 0 || currentStatus === 'EKSIK';
      const primaryDeliveryDate = isCompletingPartial
        ? (beneficiary.ilk_teslimat_tarihi || beneficiary.teslimat_tarihi || localTimeStr)
        : localTimeStr;
      const ilkTeslimEdilenTorba = isCompletingPartial
        ? (Number(beneficiary.ilk_teslim_edilen_torba) || currentBags)
        : newTotalBags;
      const eksikKalan = Math.max(0, hedef - newTotalBags);
      const sonradanTamamlananTorba = isCompletingPartial
        ? (Number(beneficiary.sonradan_tamamlanan_torba) || 0) + deliveredThisTime
        : 0;
      const eksikSonradanTamamlandi = isCompletingPartial && newStatus === 'TAMAMLANDI';
      const eksikTamamlanmaTarihi = eksikSonradanTamamlandi
        ? localTimeStr
        : (beneficiary.eksik_tamamlanma_tarihi || null);
      const eksikTamamlayanPersonel = eksikSonradanTamamlandi
        ? staff
        : (beneficiary.eksik_tamamlayan_personel || null);

      // Optimistic Concurrency Update
      const updateResult = await benCol.updateOne(
        {
          ...buildIdFilter(beneficiary.id),
          teslimat_durumu: { $ne: 'TAMAMLANDI' }
        },
        {
          $set: {
            teslimat_durumu: newStatus,
            teslimat_tarihi: primaryDeliveryDate,
            ilk_teslimat_tarihi: primaryDeliveryDate,
            ilk_teslim_edilen_torba: ilkTeslimEdilenTorba,
            eksik_kalan_torba: eksikKalan,
            sonradan_tamamlanan_torba: sonradanTamamlananTorba,
            eksik_sonradan_tamamlandi: eksikSonradanTamamlandi,
            eksik_tamamlanma_tarihi: eksikTamamlanmaTarihi,
            eksik_tamamlayan_personel: eksikTamamlayanPersonel,
            torba_sayisi: newTotalBags,
            teslim_alan: encryptField(recipient),
            teslim_eden_personel: isCompletingPartial ? (beneficiary.teslim_eden_personel || staff) : staff,
            teslimat_notu: encryptField(note),
            imza_durumu: 'IMZALANDI',
            imza_tarihi: beneficiary.imza_tarihi || localTimeStr,
            imza_alan_personel: beneficiary.imza_alan_personel || staff,
            manuel_ek_liste_imzasi: isManuelEkListeImza,
            ek_komur_verildi: isManuelEkListeImza,
            ek_liste_imza_tarihi: isManuelEkListeImza ? (beneficiary.ek_liste_imza_tarihi || localTimeStr) : null,
            ek_liste_imza_notu: isManuelEkListeImza ? ekListeImzaNotu : null,
            updated_at: localTimeStr,
          },
        }
      );

      if (updateResult.matchedCount === 0) {
        const freshRaw = await benCol.findOne(buildIdFilter(beneficiary.id));
        const freshBen = mapDoc(freshRaw);
        const isOfflineSync = Boolean(body.is_offline_sync || request.headers.get('x-offline-sync') === 'true');
        if (isOfflineSync && freshBen && (freshBen.teslimat_durumu === 'TAMAMLANDI' || (freshBen.torba_sayisi && freshBen.torba_sayisi >= hedef))) {
          return NextResponse.json(
            {
              success: true,
              alreadyCompletedByPartner: true,
              already_completed: true,
              completedBy: freshBen.teslim_eden_personel || 'Ekip Arkadaşı',
              message: `Bu hak sahibine (${freshBen.ad_soyad}) ekip arkadaşınız (${freshBen.teslim_eden_personel || 'ekip arkadaşı'}) tarafından az önce teslimat tamamlanmıştır. Mükerrer işlem engellendi.`,
              beneficiary: freshBen,
            },
            { status: 200 }
          );
        }
        return NextResponse.json(
          {
            success: false,
            conflict: true,
            error: `UYARI: Bu kayıt siz işlemi tamamlarken ${freshBen.teslim_eden_personel || 'başka bir personel'} tarafından güncellendi! Mükerrer teslimat engellendi.`,
            beneficiary: freshBen,
          },
          { status: 409 }
        );
      }

      // Sync any active routes containing this beneficiary
      const activeRoutes = await routeCol.find({ durum: { $in: ['AKTIF', 'DURAKLATILDI'] } }).toArray();
      let matchedInAnyActiveRoute = false;
      for (const rawR of activeRoutes) {
        const decR = mapDoc(rawR);
        const stops = decR.duraklar || [];
        let modified = false;
        stops.forEach((s: any) => {
          const sBenId = String(s.beneficiary_id || s.id || '');
          const sTc = String(s.tc_no || '').trim();
          const sTcHash = s.tc_hash || '';
          const isMatch =
            (benIdStr && sBenId && benIdStr === sBenId) ||
            (benTcStr && sTc && benTcStr === sTc) ||
            (benTcHash && sTcHash && benTcHash === sTcHash);

          if (isMatch) {
            matchedInAnyActiveRoute = true;
            if (s.onceki_gunden_devir) {
              s.durum = newStatus;
              s.teslim_edilen_torba = newStatus === 'TAMAMLANDI'
                ? (Number(s.hedef_torba) || deliveredThisTime)
                : deliveredThisTime;
              s.eksik_tamamlanma_tarihi = localTimeStr;
            } else {
              s.durum = newStatus;
              s.teslim_edilen_torba = newTotalBags;
            }
            s.teslim_tarihi = localTimeStr;
            s.teslim_eden_personel = staff;
            s.teslim_alan = recipient;
            s.teslimat_notu = note;
            s.imza_durumu = 'IMZALANDI';
            s.manuel_ek_liste_imzasi = isManuelEkListeImza;
            s.ek_komur_verildi = isManuelEkListeImza;
            s.ek_liste_imza_notu = isManuelEkListeImza ? ekListeImzaNotu : null;
            s.daha_sonra_tamamlanacak = false;
            modified = true;
          }
        });
        if (modified) {
          let completedCount = 0;
          let eksikCount = 0;
          let undeliveredCount = 0;
          let totalDeliveredBags = 0;
          let allStopsDoneCount = 0;
          stops.forEach((s: any) => {
            const isDevir = Boolean(s.onceki_gunden_devir);
            const isComplete =
              s.durum === 'TAMAMLANDI' ||
              s.durum === 'TESLIM_EDILDI' ||
              (Number(s.teslim_edilen_torba) > 0 && Number(s.teslim_edilen_torba) >= Number(s.hedef_torba || 34));

            if (isComplete) {
              s.durum = 'TAMAMLANDI';
              allStopsDoneCount++;
              if (!isDevir) completedCount++;
              totalDeliveredBags += Number(s.teslim_edilen_torba) || Number(s.hedef_torba) || 34;
            } else if (s.durum === 'EKSIK') {
              if (!isDevir) eksikCount++;
              totalDeliveredBags += Number(s.teslim_edilen_torba) || 0;
            } else if (s.durum === 'TESLIM_EDILEMEDI') {
              if (!isDevir) undeliveredCount++;
            }
          });

          const normalStopCount = stops.filter((s: any) => !s.onceki_gunden_devir).length;
          const isAllStopsCompleted = stops.length > 0 && allStopsDoneCount === stops.length;

          const routeUpdateFields: any = {
            duraklar: stops.map(encryptRouteStop),
            toplam_hane: normalStopCount,
            tamamlanan_hane: completedCount,
            eksik_hane: eksikCount,
            teslim_edilemeyen_hane: undeliveredCount,
            toplam_dagitilan_torba: totalDeliveredBags,
            updated_at: localTimeStr,
          };

          if (isAllStopsCompleted) {
            routeUpdateFields.durum = 'TAMAMLANDI';
            routeUpdateFields.completed_at = localTimeStr;
            routeUpdateFields.kapatan_personel = staff;
            routeUpdateFields.kapanis_notu = encryptField(
              'Saha teslimatı sırasında tüm duraklar eksiksiz tamamlanarak rota otomatik kapatıldı ve arşivlendi.'
            );
            routeUpdateFields.kilitli_personel = null;
            routeUpdateFields.kilitli_personel_username = null;
            routeUpdateFields.kilitli_client_id = null;
            routeUpdateFields.kilit_tarihi = null;
            routeUpdateFields.kilit_timestamp = null;
            routeUpdateFields.aktif_rota_modu = false;
          }

          await routeCol.updateOne(buildIdFilter(decR.id || decR._id), {
            $set: routeUpdateFields,
          });

          if (isAllStopsCompleted) {
            await recordActivityLog({
              kullanici_adi: staff,
              kullanici_rolu: session.rol || 'PERSONEL',
              islem_tipi: 'ROTA_KAPATMA',
              baslik: 'Dağıtım Rotası Otomatik Tamamlandı & Arşivlendi',
              detay: `"${decR.rota_adi}" rotasındaki tüm duraklar (${completedCount} hane, ${totalDeliveredBags} torba) eksiksiz tamamlandığı için rota otomatik olarak TAMAMLANDI durumuna alındı.`,
              ek_bilgi: { route_id: decR.id || decR._id, completedCount, totalDeliveredBags }
            });
          }
        }
      }

      // Ekibin günlük rotasını temin et ve teslimatı rotaya ekle (yalnızca ilk teslimat bugün yapıldıysa ve rotada yoksa)
      const isPastInitialDelivery = isCompletingPartial && isPastDeliveryDate(primaryDeliveryDate, localToday);
      if (!matchedInAnyActiveRoute && !isPastInitialDelivery) {
        try {
          const { route: teamRoute } = await ensureTeamDailyRoute({
            session,
            usersCol,
            routeCol,
            localToday,
            localTimeStr,
            preferredNeighborhood: beneficiary.mahalle
          });
          await addBeneficiariesToTeamRoute({
            route: teamRoute,
            beneficiaries: [
              {
                ...beneficiary,
                teslimat_durumu: newStatus,
                torba_sayisi: newTotalBags,
                teslim_alan: recipient,
                teslim_eden_personel: staff,
                teslimat_tarihi: primaryDeliveryDate,
                ilk_teslimat_tarihi: primaryDeliveryDate,
                imza_durumu: 'IMZALANDI',
                imza_tarihi: beneficiary.imza_tarihi || localTimeStr,
                imza_alan_personel: beneficiary.imza_alan_personel || staff,
              },
            ],
            session,
            routeCol,
            localTimeStr,
          });
        } catch (teamRouteErr) {
          console.error('Error auto-syncing delivery to team daily route:', teamRouteErr);
        }
      }

      // Update sync pulse in systemSettings so other clients auto-refresh & invalidate cache
      await touchSyncPulse(staff);

      // Add to delivery history (AES-256-GCM Şifreli)
      // Kural: İlk teslimat kaydı esas teslimat gününde (TESLIMAT veya EKSIK_TESLIMAT) tutulur;
      // Sonraki günlerde yapılan tamamlama EKSIK_TAMAMLAMA olarak kaydedilir ve ilk teslimat kaydını iptal etmez!
      if (isCompletingPartial) {
        await histCol.updateMany(
          {
            beneficiary_id: beneficiary.id,
            islem_tipi: { $in: ['TESLIMAT', 'EKSIK_TESLIMAT'] },
            iptal_edildi: { $ne: true },
          },
          {
            $set: {
              eksik_tamamlandi: newStatus === 'TAMAMLANDI',
              eksik_tamamlanma_tarihi: newStatus === 'TAMAMLANDI' ? localTimeStr : null,
              eksik_tamamlayan_personel: staff,
              toplam_teslim_torba: newTotalBags,
            },
          }
        );

        await histCol.insertOne(encryptDeliveryHistory({
          beneficiary_id: beneficiary.id,
          tc_no: beneficiary.tc_no,
          ad_soyad: beneficiary.ad_soyad,
          mahalle: beneficiary.mahalle,
          acik_adres: beneficiary.acik_adres,
          islem_tipi: 'EKSIK_TAMAMLAMA',
          torba_sayisi: deliveredThisTime,
          hedef_torba: hedef,
          toplam_teslim_torba: newTotalBags,
          ilk_teslimat_tarihi: primaryDeliveryDate,
          teslim_alan: recipient,
          personel: staff,
          notlar: note || `Eksik kalan ${deliveredThisTime} torba kömür tamamlandı (İlk teslimat: ${primaryDeliveryDate})`,
          iptal_nedeni: null,
          manuel_ek_liste_imzasi: isManuelEkListeImza,
          ek_komur_verildi: isManuelEkListeImza,
          ek_liste_imza_notu: isManuelEkListeImza ? ekListeImzaNotu : null,
          tarih: localTimeStr,
          gun_tarihi: localToday,
        }));
      } else {
        await histCol.insertOne(encryptDeliveryHistory({
          beneficiary_id: beneficiary.id,
          tc_no: beneficiary.tc_no,
          ad_soyad: beneficiary.ad_soyad,
          mahalle: beneficiary.mahalle,
          acik_adres: beneficiary.acik_adres,
          islem_tipi: newStatus === 'EKSIK' ? 'EKSIK_TESLIMAT' : 'TESLIMAT',
          torba_sayisi: deliveredThisTime,
          hedef_torba: hedef,
          ilk_teslim_edilen_torba: deliveredThisTime,
          ilk_teslimat_tarihi: primaryDeliveryDate,
          teslim_alan: recipient,
          personel: staff,
          notlar: note,
          iptal_nedeni: null,
          manuel_ek_liste_imzasi: isManuelEkListeImza,
          ek_komur_verildi: isManuelEkListeImza,
          ek_liste_imza_notu: isManuelEkListeImza ? ekListeImzaNotu : null,
          tarih: localTimeStr,
          gun_tarihi: localToday,
        }));
      }

      // Record Activity Log for Admin Audit
      await recordActivityLog({
        kullanici_adi: staff,
        kullanici_rolu: session.rol || 'PERSONEL',
        islem_tipi: isCompletingPartial ? 'EKSIK_TAMAMLAMA' : (newStatus === 'TAMAMLANDI' ? 'TESLIMAT' : 'EKSIK_TESLIMAT'),
        baslik: isCompletingPartial
          ? 'Eksik Kömür Teslimatı Tamamlandı'
          : (newStatus === 'TAMAMLANDI' ? 'Kömür Teslimatı Tamamlandı' : 'Eksik Kömür Teslimatı Yapıldı'),
        detay: `${recipient} (${beneficiary.tc_no}) hanesine ${deliveredThisTime} torba kömür teslim edildi. Toplam: ${newTotalBags}/${hedef} torba.${newStatus === 'EKSIK' ? ` Kalan ${eksikKalan} torba tamamlanmayı bekliyor.` : ''}${isCompletingPartial ? ` (Esas Teslim Tarihi: ${primaryDeliveryDate})` : ''} ${note ? 'Not: ' + note : ''}`,
        hedef_kisi: recipient,
        hedef_tc: beneficiary.tc_no,
        mahalle: beneficiary.mahalle,
        torba_sayisi: deliveredThisTime,
      });

      return NextResponse.json({
        success: true,
        message:
          newStatus === 'TAMAMLANDI'
            ? (isCompletingPartial
                ? `Eksik kömür tamamlandı! (${newTotalBags}/${hedef} Torba — Esas Teslimat Tarihi: ${primaryDeliveryDate.split(' ')[0]})`
                : `Kömür teslimatı tamamlandı! (${newTotalBags} Torba / Tam Hane)`)
            : `Kısmi teslimat kaydedildi! (${newTotalBags}/${hedef} Torba, ${eksikKalan} torba eksik kaldı)`,
        beneficiary: {
          ...beneficiary,
          teslimat_durumu: newStatus,
          teslimat_tarihi: primaryDeliveryDate,
          ilk_teslimat_tarihi: primaryDeliveryDate,
          ilk_teslim_edilen_torba: ilkTeslimEdilenTorba,
          eksik_kalan_torba: eksikKalan,
          sonradan_tamamlanan_torba: sonradanTamamlananTorba,
          eksik_sonradan_tamamlandi: eksikSonradanTamamlandi,
          eksik_tamamlanma_tarihi: eksikTamamlanmaTarihi,
          eksik_tamamlayan_personel: eksikTamamlayanPersonel,
          torba_sayisi: newTotalBags,
          hedef_torba: hedef,
          kalan_torba: eksikKalan,
          teslim_alan: recipient,
          imza_durumu: 'IMZALANDI',
          manuel_ek_liste_imzasi: isManuelEkListeImza,
          ek_komur_verildi: isManuelEkListeImza,
          ek_liste_imza_notu: isManuelEkListeImza ? ekListeImzaNotu : null,
        },
      });
    } else if (action === 'IPTAL') {
      const cancelReason = (iptal_nedeni || 'Hatalı teslimat kaydı').trim();
      const staff = callerStaff;
      const userRole = session.rol || 'PERSONEL';

      // Past delivery date check:
      // Kömür teslimi tamamlandıktan sonraki tarihe geçildiğinde (önceki gün yapılan teslimatlar)
      // iptal işlemini yalnızca ADMIN yapabilir. Saha personelleri sadece aynı gün teslimatlarını iptal edebilir.
      let effectiveDeliveryDate: any = beneficiary.teslimat_tarihi;
      if (!effectiveDeliveryDate) {
        const lastHist = await histCol.findOne(
          {
            beneficiary_id: beneficiary.id,
            islem_tipi: { $in: ['TESLIMAT', 'EKSIK_TESLIMAT'] },
          },
          { sort: { _id: -1 } }
        );
        if (lastHist) {
          effectiveDeliveryDate = lastHist.gun_tarihi || lastHist.tarih;
        }
      }
      if (!effectiveDeliveryDate && (beneficiary.teslimat_durumu === 'TAMAMLANDI' || beneficiary.teslimat_durumu === 'EKSIK')) {
        effectiveDeliveryDate = beneficiary.updated_at;
      }

      if (effectiveDeliveryDate && isPastDeliveryDate(effectiveDeliveryDate, localToday)) {
        if (userRole !== 'ADMIN') {
          return NextResponse.json(
            {
              success: false,
              code: 'PAST_DELIVERY_ADMIN_ONLY',
              error: 'Geçmiş günlere ait kömür teslimatlarının iptal ve geri alma işlemleri yalnızca Sistem Yöneticisi (ADMIN) yetkisindedir. Personel hesapları sadece aynı gün yapılan teslimatları iptal edebilir.',
            },
            { status: 403 }
          );
        }
      }

      // Revert beneficiary status to BEKLIYOR
      const benUpdateFields: Record<string, any> = {
        teslimat_durumu: 'BEKLIYOR',
        teslimat_tarihi: null,
        ilk_teslimat_tarihi: null,
        ilk_teslim_edilen_torba: 0,
        eksik_kalan_torba: 0,
        eksik_tamamlanma_tarihi: null,
        eksik_tamamlayan_personel: null,
        eksik_sonradan_tamamlandi: false,
        sonradan_tamamlanan_torba: 0,
        torba_sayisi: 0,
        teslim_alan: null,
        teslim_eden_personel: null,
        teslimat_notu: null,
        manuel_ek_liste_imzasi: false,
        ek_komur_verildi: false,
        ek_liste_imza_tarihi: null,
        ek_liste_imza_notu: null,
        updated_at: localTimeStr,
      };

      if (revoke_signature === true) {
        benUpdateFields.imza_durumu = 'BEKLIYOR';
        benUpdateFields.imza_tarihi = null;
        benUpdateFields.imza_alan_personel = null;
        benUpdateFields.imza_notu = null;
      }

      await benCol.updateOne(buildIdFilter(beneficiary.id), {
        $set: benUpdateFields,
      });

      // Sync any active/completed/paused routes containing this beneficiary
      const activeRoutes = await routeCol.find({
        durum: { $in: ['AKTIF', 'DURAKLATILDI', 'TAMAMLANDI'] }
      }).toArray();
      for (const rawR of activeRoutes) {
        const decR = mapDoc(rawR);
        const stops = decR.duraklar || [];
        let modified = false;
        stops.forEach((s: any) => {
          if (
            String(s.beneficiary_id) === String(beneficiary.id) ||
            String(s.beneficiary_id) === String(beneficiary._id) ||
            (beneficiary.tc_no && s.tc_no === beneficiary.tc_no)
          ) {
            s.durum = 'BEKLIYOR';
            s.teslim_edilen_torba = 0;
            s.teslim_tarihi = null;
            s.teslim_eden_personel = null;
            s.teslim_alan = '';
            s.teslimat_notu = '';
            s.manuel_ek_liste_imzasi = false;
            s.ek_komur_verildi = false;
            s.ek_liste_imza_notu = null;
            s.daha_sonra_tamamlanacak = false;
            if (revoke_signature === true) {
              s.imza_durumu = 'BEKLIYOR';
              s.imza_tarihi = null;
              s.imza_alan_personel = null;
            }
            modified = true;
          }
        });
        if (modified) {
          let completedCount = 0;
          let eksikCount = 0;
          let undeliveredCount = 0;
          let totalDeliveredBags = 0;
          const normalStops = stops.filter((s: any) => !s.onceki_gunden_devir);
          stops.forEach((s: any) => {
            if (s.durum === 'TAMAMLANDI') {
              if (!s.onceki_gunden_devir) completedCount++;
              totalDeliveredBags += s.teslim_edilen_torba || s.hedef_torba || 34;
            } else if (s.durum === 'EKSIK') {
              if (!s.onceki_gunden_devir) eksikCount++;
              totalDeliveredBags += s.teslim_edilen_torba || 0;
            } else if (s.durum === 'TESLIM_EDILEMEDI') {
              if (!s.onceki_gunden_devir) undeliveredCount++;
            }
          });

          let nextRouteDurum = decR.durum;
          // If the route was TAMAMLANDI, but now has pending or incomplete stops, revert it to AKTIF!
          if (decR.durum === 'TAMAMLANDI' && completedCount < normalStops.length) {
            nextRouteDurum = 'AKTIF';
          }

          const routeSetFields: Record<string, any> = {
            durum: nextRouteDurum,
            duraklar: stops.map(encryptRouteStop),
            toplam_hane: normalStops.length,
            tamamlanan_hane: completedCount,
            eksik_hane: eksikCount,
            teslim_edilemeyen_hane: undeliveredCount,
            toplam_dagitilan_torba: totalDeliveredBags,
            updated_at: localTimeStr,
          };

          if (nextRouteDurum === 'AKTIF' && decR.durum === 'TAMAMLANDI') {
            routeSetFields.completed_at = null;
            routeSetFields.kapatan_personel = null;
            routeSetFields.kapanis_notu = null;
          }

          await routeCol.updateOne(buildIdFilter(decR.id || decR._id), {
            $set: routeSetFields,
          });
        }
      }

      // Flag existing TESLIMAT records as cancelled in delivery history
      await histCol.updateMany(
        {
          beneficiary_id: beneficiary.id,
          islem_tipi: { $in: ['TESLIMAT', 'EKSIK_TESLIMAT', 'EKSIK_TAMAMLAMA'] },
          iptal_edildi: { $ne: true }
        },
        {
          $set: {
            iptal_edildi: true,
            iptal_nedeni: cancelReason,
            iptal_tarihi: localTimeStr
          }
        }
      );

      // Record cancellation in history (AES-256-GCM Şifreli)
      await histCol.insertOne(encryptDeliveryHistory({
        beneficiary_id: beneficiary.id,
        tc_no: beneficiary.tc_no,
        ad_soyad: beneficiary.ad_soyad,
        mahalle: beneficiary.mahalle,
        acik_adres: beneficiary.acik_adres,
        islem_tipi: 'IPTAL',
        torba_sayisi: beneficiary.torba_sayisi || 0,
        teslim_alan: beneficiary.teslim_alan || '',
        personel: staff,
        iptal_nedeni: cancelReason,
        tarih: localTimeStr,
        gun_tarihi: localToday,
      }));

      // Record Activity Log for Audit
      await recordActivityLog({
        kullanici_adi: staff,
        kullanici_rolu: userRole,
        islem_tipi: 'IPTAL',
        baslik: 'Teslimat İptal Edildi',
        detay: `${beneficiary.ad_soyad} (${beneficiary.tc_no}) hanesine yapılan teslimat kaydı ${staff} (${userRole === 'ADMIN' ? 'Yönetici' : 'Saha Personeli'}) tarafından geri alındı ve hane beklemeye döndürüldü. İptal Gerekçesi: ${cancelReason}`,
        hedef_kisi: beneficiary.ad_soyad,
        hedef_tc: beneficiary.tc_no,
        mahalle: beneficiary.mahalle,
      });

      // Update sync pulse in systemSettings so other clients auto-refresh & invalidate cache
      await touchSyncPulse(staff);

      return NextResponse.json({
        success: true,
        message: 'Kömür teslimatı iptal edildi ve iptal kayıtlarına işlendi.',
        beneficiary: {
          ...beneficiary,
          teslimat_durumu: 'BEKLIYOR',
          torba_sayisi: 0,
          kalan_torba: beneficiary.hedef_torba || 34,
          imza_durumu: revoke_signature === true ? 'BEKLIYOR' : (beneficiary.imza_durumu || 'BEKLIYOR'),
          imza_tarihi: revoke_signature === true ? null : beneficiary.imza_tarihi,
          imza_alan_personel: revoke_signature === true ? null : beneficiary.imza_alan_personel,
        },
      });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz işlem tipi' }, { status: 400 });
  } catch (error: any) {
    return serverError('delivery:POST', error);
  }
}
