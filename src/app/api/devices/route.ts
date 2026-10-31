import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDbCollections, recordActivityLog } from '@/lib/mongodb';
import { verifySession, checkDistributedRateLimit, recordDistributedFailedAttempt, clearDistributedRateLimit } from '@/lib/auth';
import { generateQrCodeSvgDataUrl } from '@/lib/totp';
import { encryptField, decryptField, isEncrypted } from '@/lib/crypto';
import { getIstanbulDate } from '@/lib/dateUtils';
import { getClientIp, serverError } from '@/lib/security';

function hashDeviceToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

export async function GET(request: NextRequest) {
  try {
    const { authorizedDevices: devCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');

    // 1. Client Status Check (Phone verifying if its stored device_token is authorized)
    if (action === 'check_status') {
      const token = (
        request.headers.get('x-device-token') ||
        request.cookies.get('komur_device_token')?.value ||
        ''
      ).trim();
      if (!token || token.length < 16 || token.length > 256) {
        return NextResponse.json({ success: true, is_authorized: false, authorized: false });
      }

      const tokenHash = hashDeviceToken(token);
      const slot = await devCol.findOne({ device_token_hash: tokenHash, durum: 'AKTIF' });

      if (slot) {
        const okRes = NextResponse.json({
          success: true,
          is_authorized: true,
          authorized: true,
          slot_no: slot.slot_no,
          slot_name: slot.slot_name,
          device_model: slot.device_model,
        });
        // Eski surumlerde localStorage'da tutulan token'i HttpOnly cereze tasi (tek seferlik gecis).
        if (!request.cookies.get('komur_device_token')?.value) {
          okRes.cookies.set('komur_device_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 365 * 24 * 60 * 60,
          });
        }
        return okRes;
      }

      return NextResponse.json({ success: true, is_authorized: false, authorized: false });
    }

    // 2. Admin Slot Listing
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Yönetici oturumu gerekli.' }, { status: 401 });
    }

    const rawSlots = await devCol.find({}).sort({ slot_no: 1 }).toArray();

    // Ensure all 4 slots exist and upgrade legacy names to 1 Admin + 3 Personel
    const defaultNames: Record<number, string> = {
      1: '1. Yönetici Telefonu (Admin - Gökhan SUÇSUZ)',
      2: '2. Saha Personeli Telefonu',
      3: '3. Saha Personeli Telefonu',
      4: '4. Saha Personeli Telefonu',
    };

    const nowStr = getIstanbulDate().fullStr;
    for (let i = 1; i <= 4; i++) {
      const found = rawSlots.find((s: any) => s.slot_no === i);
      if (!found) {
        const newSlot = {
          slot_no: i,
          slot_name: defaultNames[i],
          durum: 'BEKLIYOR',
          device_token_hash: null,
          device_model: null,
          paired_at: null,
          last_used_at: null,
          created_at: nowStr,
        };
        await devCol.insertOne(newSlot);
        rawSlots.push(newSlot);
      } else if (found.slot_name.includes('Saha Dağıtım Telefonu') || found.slot_name.includes('Saha Ekip Telefonu')) {
        await devCol.updateOne({ _id: found._id }, { $set: { slot_name: defaultNames[i] } });
        found.slot_name = defaultNames[i];
      }
    }
    rawSlots.sort((a: any, b: any) => a.slot_no - b.slot_no);

    const now = Date.now();
    const sanitizedSlots = rawSlots.map((s: any) => {
      const isCodeActive = s.activation_code && s.activation_code_expires_at && new Date(s.activation_code_expires_at).getTime() > now;
      let lastIpPlain = '-';
      if (s.last_ip) {
        lastIpPlain = isEncrypted(s.last_ip) ? decryptField(s.last_ip) : s.last_ip;
      }

      return {
        id: s.id || s._id,
        slot_no: s.slot_no,
        slot_name: s.slot_name,
        is_admin_slot: s.slot_no === 1,
        durum: s.durum || 'BEKLIYOR',
        device_model: s.device_model || null,
        paired_at: s.paired_at || null,
        last_used_at: s.last_used_at || null,
        last_ip: lastIpPlain,
        has_active_code: Boolean(isCodeActive),
        activation_code: isCodeActive ? s.activation_code : null,
        activation_code_expires_at: isCodeActive ? s.activation_code_expires_at : null,
      };
    });

    return NextResponse.json({
      success: true,
      slots: sanitizedSlots,
      active_count: sanitizedSlots.filter((s: any) => s.durum === 'AKTIF').length,
      max_slots: 4,
    });
  } catch (error: any) {
    console.error('Error in devices GET API:', error);
    return serverError('devices:GET', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { authorizedDevices: devCol } = await getDbCollections();
    const body = await request.json().catch(() => ({}));
    const { action } = body;
    const clientIp = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || 'Bilinmeyen Cihaz';

    // =========================================================================
    // ACTION 1: ACTIVATE_DEVICE (Phone side pairing with 6-digit code)
    // =========================================================================
    if (action === 'ACTIVATE_DEVICE') {
      const rlKey = `device_activate::${clientIp}`;
      const rl = await checkDistributedRateLimit(rlKey);
      if (rl.locked) {
        return NextResponse.json(
          { success: false, error: `Çok fazla hatalı kod denemesi yapıldı! Lütfen ${rl.waitSeconds} saniye bekleyiniz.` },
          { status: 429 }
        );
      }

      const rawCode = typeof body.code === 'string' ? body.code.replace(/\s+/g, '').trim() : '';
      const deviceModel = (typeof body.device_model === 'string' ? body.device_model : userAgent).substring(0, 100).trim();

      if (!/^\d{6}$/.test(rawCode)) {
        return NextResponse.json(
          { success: false, error: 'Lütfen yöneticinizden aldığınız 6 haneli aktivasyon kodunu giriniz.' },
          { status: 400 }
        );
      }

      const now = Date.now();
      const slot = await devCol.findOne({
        activation_code: rawCode,
      });

      if (!slot) {
        await recordDistributedFailedAttempt(rlKey, 5, 10 * 60 * 1000, 15 * 60 * 1000);
        return NextResponse.json(
          { success: false, error: 'Girdiğiniz aktivasyon kodu hatalı veya süresi dolmuş! Lütfen Sistem Yöneticisinden (Admin) yeni kod alınız.' },
          { status: 400 }
        );
      }

      if (slot.activation_code_expires_at && new Date(slot.activation_code_expires_at).getTime() < now) {
        await recordDistributedFailedAttempt(rlKey, 5, 10 * 60 * 1000, 15 * 60 * 1000);
        return NextResponse.json(
          { success: false, error: 'Bu aktivasyon kodunun 15 dakikalık geçerlilik süresi dolmuştur. Lütfen yöneticinizden yeni kod üretmesini isteyiniz.' },
          { status: 400 }
        );
      }

      await clearDistributedRateLimit(rlKey);

      // Generate cryptographically strong unique device token
      const newDeviceToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashDeviceToken(newDeviceToken);
      const { fullStr: nowStr } = getIstanbulDate();

      await devCol.updateOne(
        { _id: slot._id },
        {
          $set: {
            durum: 'AKTIF',
            device_token_hash: tokenHash,
            device_model: deviceModel,
            paired_at: nowStr,
            last_used_at: nowStr,
            last_ip: encryptField(clientIp),
            activation_code: null,
            activation_code_expires_at: null,
          },
        }
      );

      await recordActivityLog({
        kullanici_adi: 'Sistem Yöneticisi Onayıyla',
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'CIHAZ_YETKILENDIRME',
        baslik: 'Yeni Saha Telefonu Yetkilendirildi',
        detay: `"${slot.slot_name}" (Slot ${slot.slot_no}) için yeni telefon (${deviceModel}) başarıyla sisteme bağlandı.`,
        ek_bilgi: { slot_no: slot.slot_no, model: deviceModel },
      });

      const res = NextResponse.json({
        success: true,
        message: `Tebrikler! Bu telefon "${slot.slot_name}" olarak başarıyla yetkilendirildi.`,
        slot_no: slot.slot_no,
        slot_name: slot.slot_name,
      });

      // Set device token cookie as well for redundancy
      res.cookies.set('komur_device_token', newDeviceToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 365 * 24 * 60 * 60, // 1 year
      });

      return res;
    }

    // =========================================================================
    // ADMIN ONLY ACTIONS: GENERATE CODE, REVOKE, RENAME
    // =========================================================================
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Yönetici oturumu gerekli.' }, { status: 403 });
    }

    // 2. Generate Activation Code & SVG QR (Method A)
    if (action === 'GENERATE_ACTIVATION_CODE') {
      const slotNo = parseInt(String(body.slot_no), 10);
      if (isNaN(slotNo) || slotNo < 1 || slotNo > 4) {
        return NextResponse.json({ success: false, error: 'Geçersiz slot numarası (1-4 arası olmalı).' }, { status: 400 });
      }

      const existingSlot = await devCol.findOne({ slot_no: slotNo });
      const slotName = existingSlot?.slot_name || `${slotNo}. Saha Dağıtım Telefonu`;

      // Generate cryptographically secure 6-digit random code
      const code = crypto.randomInt(100000, 1000000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min TTL

      // Build QR SVG: If origin is available, link directly with pair_code so phone camera can open and activate
      let qrSvg = '';
      try {
        const origin = request.headers.get('origin') || request.nextUrl.origin || '';
        const qrPayload = origin ? `${origin}/?pair_code=${code}&slot=${slotNo}` : code;
        qrSvg = generateQrCodeSvgDataUrl(qrPayload);
      } catch (qrErr) {
        console.warn('QR code generation fallback to simple code:', qrErr);
        try {
          qrSvg = generateQrCodeSvgDataUrl(code);
        } catch (e) {
          qrSvg = '';
        }
      }

      await devCol.updateOne(
        { slot_no: slotNo },
        {
          $set: {
            activation_code: code,
            activation_code_expires_at: expiresAt,
          },
        },
        { upsert: true }
      );

      await recordActivityLog({
        kullanici_adi: session.username || 'ADMIN',
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'CIHAZ_KOD_URETIMI',
        baslik: 'Cihaz Eşleme Kodu Üretildi',
        detay: `Slot ${slotNo} ("${slotName}") için 15 dakika geçerli tek kullanımlık aktivasyon kodu (${code}) üretildi.`,
      });

      return NextResponse.json({
        success: true,
        code,
        activation_code: code,
        slot_no: slotNo,
        slot_name: slotName,
        expires_at: expiresAt,
        qr_svg: qrSvg,
        qr_code_svg: qrSvg,
      });
    }

    // 3. Revoke / Unpair Device
    if (action === 'REVOKE_DEVICE') {
      const slotNo = parseInt(String(body.slot_no), 10);
      if (isNaN(slotNo) || slotNo < 1 || slotNo > 4) {
        return NextResponse.json({ success: false, error: 'Geçersiz slot numarası.' }, { status: 400 });
      }

      const existingSlot = await devCol.findOne({ slot_no: slotNo });
      const previousModel = existingSlot?.device_model || 'Cihaz';

      await devCol.updateOne(
        { slot_no: slotNo },
        {
          $set: {
            durum: 'BEKLIYOR',
            device_token_hash: null,
            device_model: null,
            paired_at: null,
            activation_code: null,
            activation_code_expires_at: null,
          },
        }
      );

      await recordActivityLog({
        kullanici_adi: session.username || 'ADMIN',
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'CIHAZ_YETKI_IPTAL',
        baslik: 'Saha Telefonu Yetkisi İptal Edildi',
        detay: `Slot ${slotNo} ("${existingSlot?.slot_name || ''}") üzerindeki "${previousModel}" telefonunun yetkisi iptal edildi. Slot boşaltıldı.`,
      });

      return NextResponse.json({
        success: true,
        message: `Slot ${slotNo} yetkisi başarıyla iptal edildi. Yeni bir telefon eşlenebilir.`,
      });
    }

    // 4. Rename Slot
    if (action === 'RENAME_SLOT') {
      const slotNo = parseInt(String(body.slot_no), 10);
      const newName = String(body.slot_name || '').trim();
      if (!newName || isNaN(slotNo) || slotNo < 1 || slotNo > 4) {
        return NextResponse.json({ success: false, error: 'Geçerli bir slot adı giriniz.' }, { status: 400 });
      }

      await devCol.updateOne(
        { slot_no: slotNo },
        { $set: { slot_name: newName } }
      );

      return NextResponse.json({ success: true, message: 'Slot adı güncellendi.' });
    }

    // 5. Pair Admin's Current Mobile Device to Slot 1 (1-Click Self-Pairing for Admin)
    if (action === 'PAIR_ADMIN_CURRENT_DEVICE') {
      const { iso: nowIso } = getIstanbulDate();
      const adminDeviceToken = crypto.randomBytes(32).toString('hex');
      const adminTokenHash = hashDeviceToken(adminDeviceToken);
      const deviceModel = (body.device_model || userAgent.substring(0, 100)).trim();

      await devCol.updateOne(
        { slot_no: 1 },
        {
          $set: {
            slot_name: '1. Yönetici Telefonu (Admin - Gökhan SUÇSUZ)',
            durum: 'AKTIF',
            device_token_hash: adminTokenHash,
            device_model: deviceModel,
            paired_at: nowIso,
            last_used_at: nowIso,
            last_personel: session.username || 'Gökhan SUÇSUZ',
            last_ip: encryptField(clientIp),
            activation_code: null,
            activation_code_expires_at: null,
          },
        },
        { upsert: true }
      );

      await recordActivityLog({
        kullanici_adi: session.username || 'ADMIN',
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'CIHAZ_YONETICI_ESLEME',
        baslik: 'Yönetici Telefonu Eşlendi',
        detay: `Sistem Yöneticisi kendi telefonunu Slot 1 (Yönetici Telefonu) olarak başarıyla eşledi.`,
      });

      const res = NextResponse.json({
        success: true,
        message: 'Telefonunuz "1. Yönetici Telefonu (Admin)" olarak başarıyla eşlendi.',
        slot_no: 1,
        slot_name: '1. Yönetici Telefonu (Admin - Gökhan SUÇSUZ)',
      });

      res.cookies.set('komur_device_token', adminDeviceToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 365 * 24 * 60 * 60,
      });

      return res;
    }

    return NextResponse.json({ success: false, error: 'Bilinmeyen işlem.' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in devices POST API:', error);
    return serverError('devices:POST', error);
  }
}
