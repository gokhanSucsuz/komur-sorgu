import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, buildIdFilter, mapDoc, recordActivityLog, touchSyncPulse } from '@/lib/mongodb';
import { encryptField, encryptDeliveryHistory, encryptRouteStop, hashTc } from '@/lib/crypto';
import { cleanTcNo } from '@/lib/normalizer';
import { getIstanbulDate } from '@/lib/dateUtils';
import { verifySession } from '@/lib/auth';
import { checkRouteTeamAuthorization } from '@/app/api/routes/route';

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json(
        { success: false, error: 'Oturum süresi dolmuş veya yetkisiz istek. Lütfen tekrar giriş yapınız.' },
        { status: 401 }
      );
    }

    const { beneficiaries: benCol, deliveryHistory: histCol, deliveryRoutes: routeCol, users: usersCol } = await getDbCollections();
    const body = await request.json();
    const { action, beneficiary_id, tc_no, torba_sayisi, eklenen_torba, teslim_alan, notlar, iptal_nedeni } = body;

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

    for (const rawRoute of activeOrPausedRoutes) {
      const decRoute = mapDoc(rawRoute);
      const stops = Array.isArray(decRoute.duraklar) ? decRoute.duraklar : [];
      const isInRoute = stops.some((s: any) =>
        String(s.beneficiary_id) === String(beneficiary.id) ||
        String(s.beneficiary_id) === String(beneficiary._id) ||
        (beneficiary.tc_no && s.tc_no === beneficiary.tc_no)
      );

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
              error: `Bu hane "${decRoute.rota_adi || 'Aktif Rota'}" kapsamında ${owner} personeline ve ekibine aittir. Yalnızca rotayı işleten personel veya ekip arkadaşı teslimat yapabilir.`,
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
        deliveredThisTime = parseInt(eklenen_torba, 10);
        if (isNaN(deliveredThisTime) || deliveredThisTime <= 0 || deliveredThisTime > 150) {
          return NextResponse.json({ success: false, error: 'Geçersiz teslim edilecek torba miktarı (1-150 arası olmalıdır)' }, { status: 400 });
        }
        newTotalBags = currentBags + deliveredThisTime;
      } else {
        newTotalBags = parseInt(torba_sayisi || String(hedef), 10);
        if (isNaN(newTotalBags) || newTotalBags <= 0 || newTotalBags > 200) {
          return NextResponse.json({ success: false, error: 'Geçersiz toplam torba miktarı' }, { status: 400 });
        }
        deliveredThisTime = newTotalBags - currentBags;
        if (deliveredThisTime <= 0) deliveredThisTime = newTotalBags;
      }

      const recipient = (teslim_alan || beneficiary.ad_soyad).trim();
      const staff = (
        (body.personel && body.personel !== 'Personel' && body.personel !== 'Dağıtım Personeli')
          ? body.personel
          : (session.ad_soyad || session.username || body.personel || 'Personel')
      ).trim();
      const note = (notlar || '').trim();

      // Determine status: TAMAMLANDI vs EKSIK
      let newStatus = 'TAMAMLANDI';
      if (newTotalBags < hedef) {
        newStatus = 'EKSIK';
      }

      // Optimistic Concurrency Update
      const updateResult = await benCol.updateOne(
        {
          ...buildIdFilter(beneficiary.id),
          teslimat_durumu: { $ne: 'TAMAMLANDI' }
        },
        {
          $set: {
            teslimat_durumu: newStatus,
            teslimat_tarihi: localTimeStr,
            torba_sayisi: newTotalBags,
            teslim_alan: encryptField(recipient),
            teslim_eden_personel: staff,
            teslimat_notu: encryptField(note),
            imza_durumu: 'IMZALANDI',
            imza_tarihi: localTimeStr,
            imza_alan_personel: staff,
            updated_at: localTimeStr,
          },
        }
      );

      if (updateResult.matchedCount === 0) {
        const freshRaw = await benCol.findOne(buildIdFilter(beneficiary.id));
        const freshBen = mapDoc(freshRaw);
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
            s.durum = newStatus;
            s.teslim_edilen_torba = newTotalBags;
            s.teslim_tarihi = localTimeStr;
            s.teslim_eden_personel = staff;
            s.teslim_alan = recipient;
            s.teslimat_notu = note;
            s.imza_durumu = 'IMZALANDI';
            s.daha_sonra_tamamlanacak = false;
            modified = true;
          }
        });
        if (modified) {
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
          await routeCol.updateOne(buildIdFilter(decR.id || decR._id), {
            $set: {
              duraklar: stops.map(encryptRouteStop),
              tamamlanan_hane: completedCount,
              eksik_hane: eksikCount,
              teslim_edilemeyen_hane: undeliveredCount,
              toplam_dagitilan_torba: totalDeliveredBags,
              updated_at: localTimeStr,
            },
          });
        }
      }

      // Update sync pulse in systemSettings so other clients auto-refresh & invalidate cache
      await touchSyncPulse(staff);

      // Add to delivery history (AES-256-GCM Şifreli)
      await histCol.insertOne(encryptDeliveryHistory({
        beneficiary_id: beneficiary.id,
        tc_no: beneficiary.tc_no,
        ad_soyad: beneficiary.ad_soyad,
        mahalle: beneficiary.mahalle,
        acik_adres: beneficiary.acik_adres,
        islem_tipi: 'TESLIMAT',
        torba_sayisi: deliveredThisTime,
        teslim_alan: recipient,
        personel: staff,
        notlar: note,
        iptal_nedeni: null,
        tarih: localTimeStr,
        gun_tarihi: localToday,
      }));

      const eksikKalan = Math.max(0, hedef - newTotalBags);

      // Record Activity Log for Admin Audit
      await recordActivityLog({
        kullanici_adi: staff,
        kullanici_rolu: session.rol || 'PERSONEL',
        islem_tipi: newStatus === 'TAMAMLANDI' ? 'TESLIMAT' : 'EKSIK_TESLIMAT',
        baslik: newStatus === 'TAMAMLANDI' ? 'Kömür Teslimatı Tamamlandı' : 'Eksik Kömür Teslimatı Yapıldı',
        detay: `${recipient} (${beneficiary.tc_no}) hanesine ${deliveredThisTime} torba kömür teslim edildi. Toplam: ${newTotalBags}/${hedef} torba.${newStatus === 'EKSIK' ? ` Kalan ${eksikKalan} torba tamamlanmayı bekliyor.` : ''} ${note ? 'Not: ' + note : ''}`,
        hedef_kisi: recipient,
        hedef_tc: beneficiary.tc_no,
        mahalle: beneficiary.mahalle,
        torba_sayisi: deliveredThisTime,
      });

      return NextResponse.json({
        success: true,
        message:
          newStatus === 'TAMAMLANDI'
            ? `Kömür teslimatı tamamlandı! (${newTotalBags} Torba / Tam Hane)`
            : `Kısmi teslimat kaydedildi! (${newTotalBags}/${hedef} Torba, ${eksikKalan} torba eksik kaldı)`,
        beneficiary: {
          ...beneficiary,
          teslimat_durumu: newStatus,
          torba_sayisi: newTotalBags,
          hedef_torba: hedef,
          kalan_torba: eksikKalan,
          teslim_alan: recipient,
        },
      });
    } else if (action === 'IPTAL') {
      const cancelReason = (iptal_nedeni || 'Hatalı teslimat kaydı').trim();
      const staff = callerStaff;
      const userRole = session.rol || 'PERSONEL';

      // Revert beneficiary status to BEKLIYOR
      await benCol.updateOne(buildIdFilter(beneficiary.id), {
        $set: {
          teslimat_durumu: 'BEKLIYOR',
          teslimat_tarihi: null,
          torba_sayisi: 0,
          teslim_alan: null,
          teslim_eden_personel: null,
          teslimat_notu: null,
          updated_at: localTimeStr,
        },
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
            s.daha_sonra_tamamlanacak = false;
            modified = true;
          }
        });
        if (modified) {
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

          let nextRouteDurum = decR.durum;
          // If the route was TAMAMLANDI, but now has pending or incomplete stops, revert it to AKTIF!
          if (decR.durum === 'TAMAMLANDI' && completedCount < stops.length) {
            nextRouteDurum = 'AKTIF';
          }

          const routeSetFields: Record<string, any> = {
            durum: nextRouteDurum,
            duraklar: stops.map(encryptRouteStop),
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
        },
      });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz işlem tipi' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in delivery handler:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
