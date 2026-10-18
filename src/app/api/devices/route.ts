import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDbCollections, recordActivityLog } from '@/lib/mongodb';
import { verifySession } from '@/lib/auth';
import { generateQrCodeSvgDataUrl } from '@/lib/totp';
import { encryptField, decryptField, isEncrypted } from '@/lib/crypto';
import { getIstanbulDate } from '@/lib/dateUtils';

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
      const token = (searchParams.get('token') || '').trim();
      if (!token) {
        return NextResponse.json({ success: true, is_authorized: false });
      }

      const tokenHash = hashDeviceToken(token);
      const slot = await devCol.findOne({ device_token_hash: tokenHash, durum: 'AKTIF' });

      if (slot) {
        return NextResponse.json({
          success: true,
          is_authorized: true,
          slot_no: slot.slot_no,
          slot_name: slot.slot_name,
          device_model: slot.device_model,
        });
      }

      return NextResponse.json({ success: true, is_authorized: false });
    }

    // 2. Admin Slot Listing
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Yönetici oturumu gerekli.' }, { status: 401 });
    }

    const rawSlots = await devCol.find({}).sort({ slot_no: 1 }).toArray();

    // Ensure all 4 slots exist
    if (rawSlots.length < 4) {
      const nowStr = getIstanbulDate().fullStr;
      for (let i = 1; i <= 4; i++) {
        const found = rawSlots.find((s: any) => s.slot_no === i);
        if (!found) {
          const newSlot = {
            slot_no: i,
            slot_name: `${i}. Saha Dağıtım Telefonu`,
            durum: 'BEKLIYOR',
            device_token_hash: null,
            device_model: null,
            paired_at: null,
            last_used_at: null,
            created_at: nowStr,
          };
          await devCol.insertOne(newSlot);
          rawSlots.push(newSlot);
        }
      }
      rawSlots.sort((a: any, b: any) => a.slot_no - b.slot_no);
    }

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
    return NextResponse.json({ success: false, error: 'Cihaz bilgileri alınamadı.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { authorizedDevices: devCol } = await getDbCollections();
    const body = await request.json().catch(() => ({}));
    const { action } = body;
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Bilinmeyen Cihaz';

    // =========================================================================
    // ACTION 1: ACTIVATE_DEVICE (Phone side pairing with 6-digit code)
    // =========================================================================
    if (action === 'ACTIVATE_DEVICE') {
      const rawCode = String(body.code || '').replace(/\s+/g, '').trim();
      const deviceModel = (body.device_model || userAgent.substring(0, 100)).trim();

      if (!rawCode || rawCode.length < 6) {
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
        return NextResponse.json(
          { success: false, error: 'Girdiğiniz aktivasyon kodu hatalı veya süresi dolmuş! Lütfen Sistem Yöneticisinden (Admin) yeni kod alınız.' },
          { status: 400 }
        );
      }

      if (slot.activation_code_expires_at && new Date(slot.activation_code_expires_at).getTime() < now) {
        return NextResponse.json(
          { success: false, error: 'Bu aktivasyon kodunun 15 dakikalık geçerlilik süresi dolmuştur. Lütfen yöneticinizden yeni kod üretmesini isteyiniz.' },
          { status: 400 }
        );
      }

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
        device_token: newDeviceToken,
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

      // Generate 6-digit random code e.g. "739215"
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min TTL

      // Build QR SVG
      const qrPayload = JSON.stringify({ type: 'KOMUR_PAIR', code, slot: slotNo });
      const qrSvg = generateQrCodeSvgDataUrl(qrPayload);

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
        detay: `Slot ${slotNo} için 15 dakika geçerli tek kullanımlık aktivasyon kodu (${code}) üretildi.`,
      });

      return NextResponse.json({
        success: true,
        code,
        slot_no: slotNo,
        expires_at: expiresAt,
        qr_svg: qrSvg,
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

    return NextResponse.json({ success: false, error: 'Bilinmeyen işlem.' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in devices POST API:', error);
    return NextResponse.json({ success: false, error: 'Cihaz işlemi sırasında hata oluştu.' }, { status: 500 });
  }
}
