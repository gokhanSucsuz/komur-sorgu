import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDbCollections, mapDocs, mapDoc, recordActivityLog } from '@/lib/mongodb';
import { encryptField, decryptField, hashPassword, verifyPassword, timingSafeTokenEqual } from '@/lib/crypto';
import { getIstanbulDate } from '@/lib/dateUtils';
import {
  sanitizeUser,
  verifySession,
  clearSessionMicroCache,
  isSessionExpired,
  SESSION_MAX_AGE_SECONDS,
  checkDistributedRateLimit,
  recordDistributedFailedAttempt,
  clearDistributedRateLimit,
} from '@/lib/auth';
import {
  generateTotpSecret,
  verifyTotpCode,
  buildOtpAuthUri,
  generateRecoveryCodes,
  generateQrCodeSvgDataUrl,
} from '@/lib/totp';

/**
 * Finds an active user by username (indexed) or decrypted ad_soyad (AES-256-GCM fallback).
 */
async function findActiveUserByIdentifier(usersCol: any, identifier: string) {
  const trimmed = (identifier || '').trim();
  if (!trimmed) return null;

  const escaped = trimmed.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const userRegex = new RegExp(`^${escaped}$`, 'i');

  // 1. Fast lookup by unencrypted username index
  const byUsername = await usersCol.findOne({
    username: userRegex,
    aktif: 1,
  });
  if (byUsername) return byUsername;

  // 2. Fallback: decrypt active users and match by ad_soyad or username (case-insensitive Turkish)
  const allActiveRaw = await usersCol.find({ aktif: 1 }).toArray();
  const targetLower = trimmed.toLocaleLowerCase('tr-TR');
  for (const raw of allActiveRaw) {
    const dec = mapDoc(raw);
    if (
      (dec.username && String(dec.username).trim().toLocaleLowerCase('tr-TR') === targetLower) ||
      (dec.ad_soyad && String(dec.ad_soyad).trim().toLocaleLowerCase('tr-TR') === targetLower)
    ) {
      return raw;
    }
  }
  return null;
}

/**
 * Verifies user password against scrypt hash or constant-time decrypted fallback.
 */
async function verifyUserPassword(usersCol: any, rawUser: any, plainPassword: string): Promise<boolean> {
  if (!rawUser || !plainPassword) return false;
  let isValid = false;
  if (rawUser.sifre_hash) {
    isValid = verifyPassword(plainPassword, rawUser.sifre_hash);
  }
  if (!isValid) {
    const decUser = mapDoc(rawUser);
    if (
      timingSafeTokenEqual(decUser.sifre, plainPassword) ||
      timingSafeTokenEqual(rawUser.sifre, plainPassword)
    ) {
      isValid = true;
      try {
        const newHash = hashPassword(plainPassword);
        await usersCol.updateOne({ _id: rawUser._id }, { $set: { sifre_hash: newHash } });
      } catch (e) {
        console.error('Notice: Could not upgrade password hash:', e);
      }
    }
  }
  return isValid;
}

export async function GET(request: NextRequest) {
  try {
    const { users: usersCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');

    // 1. Session Verification for Single Device Checking & 24h TTL (GET)
    if (action === 'verify') {
      const username = (searchParams.get('username') || '').trim();
      const sessionToken = (searchParams.get('session_token') || '').trim();

      if (!username || !sessionToken) {
        return NextResponse.json(
          { success: false, valid: false, code: 'INVALID_PARAMS', error: 'Kullanıcı adı ve oturum anahtarı gereklidir.' },
          { status: 400 }
        );
      }

      const rawUser = await findActiveUserByIdentifier(usersCol, username);

      if (!rawUser) {
        return NextResponse.json(
          { success: false, valid: false, code: 'USER_NOT_FOUND', error: 'Kullanıcı hesabı bulunamadı veya pasife alınmış.' },
          { status: 404 }
        );
      }

      // Strictly require an active session token and verify in constant time
      if (!rawUser.active_session_token || !timingSafeTokenEqual(rawUser.active_session_token, sessionToken)) {
        return NextResponse.json(
          {
            success: false,
            valid: false,
            code: 'SESSION_TERMINATED',
            error: 'Bu kullanıcı hesabı ile başka bir cihazdan oturum açıldı veya oturumunuz sonlandırıldı! Güvenlik gereği aynı anda yalnızca tek bir cihaz sisteme girebilir.',
          },
          { status: 401 }
        );
      }

      // Enforce 24-hour absolute server-side session expiration
      if (isSessionExpired(rawUser.last_login_at)) {
        return NextResponse.json(
          {
            success: false,
            valid: false,
            code: 'SESSION_EXPIRED',
            error: 'Güvenlik politikası gereği 24 saatlik oturum süreniz dolmuştur. Lütfen tekrar giriş yapınız.',
          },
          { status: 401 }
        );
      }

      const decAdSoyad = rawUser.ad_soyad ? decryptField(rawUser.ad_soyad) : (rawUser.rol === 'ADMIN' ? 'Gökhan SUÇSUZ' : rawUser.username);
      return NextResponse.json({
        success: true,
        valid: true,
        username: rawUser.username,
        role: rawUser.rol,
        ad_soyad: decAdSoyad,
        name: decAdSoyad,
        totp_enabled: Boolean(rawUser.totp_enabled),
      });
    }

    // 2. Check 2FA (Google Authenticator) Status for Authenticated User
    if (action === '2fa_status') {
      const session = await verifySession(request);
      if (!session.valid) {
        return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
      }

      const rawUser = await findActiveUserByIdentifier(usersCol, session.username || '');
      if (!rawUser) {
        return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı.' }, { status: 404 });
      }
      const decUser = mapDoc(rawUser);
      const recoveryCount = Array.isArray(decUser.totp_recovery_codes) ? decUser.totp_recovery_codes.length : 0;

      return NextResponse.json({
        success: true,
        totp_enabled: Boolean(rawUser.totp_enabled),
        totp_enabled_at: rawUser.totp_enabled_at || null,
        recovery_codes_count: recoveryCount,
      });
    }

    // 3. Return active staff members for login screen
    // KVKK & Security: Only expose minimal public personnel fields when unauthenticated; hide admin accounts from unauthenticated callers
    const session = await verifySession(request);
    const rawUsers = await usersCol
      .find({ aktif: 1 })
      .sort({ rol: 1 })
      .toArray();

    const allMapped = mapDocs(rawUsers)
      .map(sanitizeUser)
      .sort((a: any, b: any) => (a.ad_soyad || '').localeCompare(b.ad_soyad || '', 'tr'));

    if (!session.valid) {
      const publicPersonnel = allMapped
        .filter((u: any) => u.rol === 'PERSONEL')
        .map((u: any) => ({
          id: u.id,
          username: u.username,
          ad_soyad: u.ad_soyad,
          rol: u.rol,
          aktif: u.aktif,
        }));

      return NextResponse.json({
        success: true,
        users: publicPersonnel,
        personnel: publicPersonnel,
        admins: [],
      });
    }

    return NextResponse.json({
      success: true,
      users: allMapped,
      personnel: allMapped.filter((u: any) => u.rol === 'PERSONEL'),
      admins: allMapped.filter((u: any) => u.rol === 'ADMIN'),
    });
  } catch (error: any) {
    console.error('Error fetching auth users:', error);
    return NextResponse.json({
      success: false,
      error: 'Kullanıcı listesi alınamadı.'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { users: usersCol } = await getDbCollections();
    const body = await request.json();
    const {
      username,
      password,
      role,
      action,
      session_token,
      is_elevation,
      totp_code,
      current_password,
    } = body;

    const trimmedUser = (username || '').trim();
    const clientIpRaw = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Yerel IP';
    const clientIp = clientIpRaw.split(',')[0].trim();

    // 1. Session Verification check (POST)
    if (action === 'verify') {
      const targetToken = (session_token || '').trim();
      if (!trimmedUser || !targetToken) {
        return NextResponse.json(
          { success: false, valid: false, code: 'INVALID_PARAMS', error: 'Kullanıcı adı ve oturum kodu eksik.' },
          { status: 400 }
        );
      }

      const rawUser = await findActiveUserByIdentifier(usersCol, trimmedUser);

      if (!rawUser) {
        return NextResponse.json(
          { success: false, valid: false, code: 'USER_NOT_FOUND', error: 'Kullanıcı hesabı bulunamadı veya pasif.' },
          { status: 404 }
        );
      }

      // Strictly require an active session token and verify in constant time
      if (!rawUser.active_session_token || !timingSafeTokenEqual(rawUser.active_session_token, targetToken)) {
        return NextResponse.json(
          {
            success: false,
            valid: false,
            code: 'SESSION_TERMINATED',
            error: 'Bu kullanıcı hesabı ile başka bir cihazdan giriş yapıldı veya oturumunuz sonlandırıldı! Güvenlik kuralı gereğince aynı kullanıcı hesabıyla aynı anda yalnızca tek bir cihaz sisteme girebilir.',
          },
          { status: 401 }
        );
      }

      // Enforce 24-hour absolute session TTL
      if (isSessionExpired(rawUser.last_login_at)) {
        return NextResponse.json(
          {
            success: false,
            valid: false,
            code: 'SESSION_EXPIRED',
            error: 'Güvenlik politikası gereği 24 saatlik oturum süreniz dolmuştur. Lütfen tekrar giriş yapınız.',
          },
          { status: 401 }
        );
      }

      const decAdSoyad = rawUser.ad_soyad ? decryptField(rawUser.ad_soyad) : (rawUser.rol === 'ADMIN' ? 'Gökhan SUÇSUZ' : rawUser.username);
      const res = NextResponse.json({
        success: true,
        valid: true,
        totp_enabled: Boolean(rawUser.totp_enabled),
        user: {
          id: rawUser.id || rawUser._id,
          username: rawUser.username,
          ad_soyad: decAdSoyad,
          name: decAdSoyad,
          rol: rawUser.rol,
          ekip_adi: rawUser.ekip_adi || '',
          ekip_arkadaslari: Array.isArray(rawUser.ekip_arkadaslari) ? rawUser.ekip_arkadaslari : [],
          ekip_arkadasi: rawUser.ekip_arkadasi || '',
        },
      });

      // Ensure HttpOnly Secure cookie stays synchronized with valid active session token (24h maxAge)
      res.cookies.set('komur_session_token', targetToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS,
      });

      return res;
    }

    // 2. Explicit Logout: Clean up active session
    if (action === 'logout') {
      const targetToken = (session_token || '').trim();
      if (targetToken) {
        clearSessionMicroCache(targetToken);
      }

      if (trimmedUser && targetToken) {
        const rawUser = await findActiveUserByIdentifier(usersCol, trimmedUser);
        if (rawUser && rawUser.active_session_token && timingSafeTokenEqual(rawUser.active_session_token, targetToken)) {
          await usersCol.updateOne(
            { _id: rawUser._id },
            {
              $set: { active_session_token: null, last_logout_at: getIstanbulDate().iso },
            }
          );
        }

        await recordActivityLog({
          kullanici_adi: trimmedUser,
          islem_tipi: 'CIKIS',
          baslik: 'Kullanıcı Oturumu Kapatıldı',
          detay: `"${trimmedUser}" kullanıcısı güvenli oturumunu sonlandırdı.`,
        });
      }

      const res = NextResponse.json({ success: true, message: 'Oturum başarıyla sonlandırıldı' });
      res.cookies.set('komur_session_token', '', {
        httpOnly: true,
        path: '/',
        expires: new Date(0),
      });
      return res;
    }

    // =========================================================================
    // 3. GOOGLE AUTHENTICATOR (TOTP) 2FA SETUP & MANAGEMENT FOR ADMINISTRATORS
    // =========================================================================

    // 3A. Initialize 2FA Setup (Generate Secret + Offline SVG QR Code)
    if (action === '2fa_setup_init') {
      const session = await verifySession(request, { requiredRole: 'ADMIN' });
      if (!session.valid) {
        return session.response || NextResponse.json({ success: false, error: 'Yönetici oturumu gerekli.' }, { status: 403 });
      }

      const rawUser = await findActiveUserByIdentifier(usersCol, session.username || '');
      if (!rawUser) {
        return NextResponse.json({ success: false, error: 'Yönetici hesabı bulunamadı.' }, { status: 404 });
      }

      const secret = generateTotpSecret(20); // 160-bit Base32 secret (32 chars)
      const accountLabel = `${rawUser.username} (Yönetici)`;
      const otpauthUri = buildOtpAuthUri(accountLabel, secret, 'Edirne SYDV Kömür Sistemi');
      const qrSvgDataUrl = generateQrCodeSvgDataUrl(otpauthUri);

      await usersCol.updateOne(
        { _id: rawUser._id },
        {
          $set: {
            totp_pending_secret: encryptField(secret),
            updated_at: getIstanbulDate().fullStr,
          },
        }
      );

      return NextResponse.json({
        success: true,
        secret,
        otpauth_uri: otpauthUri,
        qr_svg_data_url: qrSvgDataUrl,
      });
    }

    // 3B. Verify 6-Digit Google Authenticator Code & Activate 2FA
    if (action === '2fa_setup_verify') {
      const session = await verifySession(request, { requiredRole: 'ADMIN' });
      if (!session.valid) {
        return session.response || NextResponse.json({ success: false, error: 'Yönetici oturumu gerekli.' }, { status: 403 });
      }

      const trimmedCurPass = (current_password || '').trim();
      const trimmedCode = (totp_code || '').trim();

      if (!trimmedCurPass) {
        return NextResponse.json({ success: false, error: 'Lütfen mevcut yönetici şifrenizi giriniz.' }, { status: 400 });
      }
      if (!trimmedCode) {
        return NextResponse.json({ success: false, error: 'Lütfen Google Authenticator uygulamasındaki 6 haneli kodu giriniz.' }, { status: 400 });
      }

      const rlKey = `2fa_verify::${clientIp}::${session.username}`;
      const rl = await checkDistributedRateLimit(rlKey);
      if (rl.locked) {
        return NextResponse.json(
          { success: false, error: `Çok fazla hatalı deneme! Lütfen ${rl.waitSeconds} saniye bekleyiniz.` },
          { status: 429 }
        );
      }

      const rawUser = await findActiveUserByIdentifier(usersCol, session.username || '');
      if (!rawUser) {
        return NextResponse.json({ success: false, error: 'Yönetici hesabı bulunamadı.' }, { status: 404 });
      }

      const isPassValid = await verifyUserPassword(usersCol, rawUser, trimmedCurPass);
      if (!isPassValid) {
        await recordDistributedFailedAttempt(rlKey);
        return NextResponse.json({ success: false, error: 'Mevcut yönetici şifrenizi hatalı girdiniz!' }, { status: 400 });
      }

      const decUser = mapDoc(rawUser);
      const pendingSecret = decUser.totp_pending_secret;
      if (!pendingSecret) {
        return NextResponse.json(
          { success: false, error: 'Aktif bir 2FA kurulum anahtarı bulunamadı. Lütfen QR kodu yeniden oluşturun.' },
          { status: 400 }
        );
      }

      const isCodeValid = verifyTotpCode(pendingSecret, trimmedCode);
      if (!isCodeValid) {
        await recordDistributedFailedAttempt(rlKey);
        return NextResponse.json(
          {
            success: false,
            error: 'Girdiğiniz 6 haneli doğrulama kodu eşleşmedi! Telefonunuzun saat ayarının otomatik olduğundan emin olup güncel kodu giriniz.',
          },
          { status: 400 }
        );
      }

      await clearDistributedRateLimit(rlKey);

      const recoveryCodes = generateRecoveryCodes(6);
      const encryptedRecoveryCodes = recoveryCodes.map((c) => encryptField(c));
      const { fullStr: nowFullStr } = getIstanbulDate();

      await usersCol.updateOne(
        { _id: rawUser._id },
        {
          $set: {
            totp_enabled: true,
            totp_secret: encryptField(pendingSecret),
            totp_pending_secret: null,
            totp_recovery_codes: encryptedRecoveryCodes,
            totp_enabled_at: nowFullStr,
            updated_at: nowFullStr,
          },
        }
      );

      await recordActivityLog({
        kullanici_adi: decUser.ad_soyad || decUser.username,
        kullanici_rolu: 'ADMIN',
        islem_tipi: '2FA_AKTIF',
        baslik: 'İki Faktörlü Doğrulama (Google Authenticator) Etkinleştirildi',
        detay: `"${decUser.ad_soyad}" (@${decUser.username}) yönetici hesabı için Google Authenticator (TOTP) 2FA korumasını aktif etti.`,
      });

      return NextResponse.json({
        success: true,
        totp_enabled: true,
        totp_enabled_at: nowFullStr,
        recovery_codes: recoveryCodes,
        message: 'İki Faktörlü Doğrulama (Google Authenticator) başarıyla etkinleştirildi!',
      });
    }

    // 3C. Disable 2FA (Requires Current Password + Current 6-Digit Code or Recovery Code)
    if (action === '2fa_disable') {
      const session = await verifySession(request, { requiredRole: 'ADMIN' });
      if (!session.valid) {
        return session.response || NextResponse.json({ success: false, error: 'Yönetici oturumu gerekli.' }, { status: 403 });
      }

      const trimmedCurPass = (current_password || '').trim();
      const trimmedCode = (totp_code || '').trim();

      if (!trimmedCurPass || !trimmedCode) {
        return NextResponse.json(
          { success: false, error: '2FA korumasını kapatmak için mevcut şifrenizi ve 6 haneli doğrulama (veya kurtarma) kodunuzu girmelisiniz.' },
          { status: 400 }
        );
      }

      const rlKey = `2fa_disable::${clientIp}::${session.username}`;
      const rl = await checkDistributedRateLimit(rlKey);
      if (rl.locked) {
        return NextResponse.json(
          { success: false, error: `Çok fazla hatalı deneme! Lütfen ${rl.waitSeconds} saniye bekleyiniz.` },
          { status: 429 }
        );
      }

      const rawUser = await findActiveUserByIdentifier(usersCol, session.username || '');
      if (!rawUser) {
        return NextResponse.json({ success: false, error: 'Yönetici hesabı bulunamadı.' }, { status: 404 });
      }

      const isPassValid = await verifyUserPassword(usersCol, rawUser, trimmedCurPass);
      if (!isPassValid) {
        await recordDistributedFailedAttempt(rlKey);
        return NextResponse.json({ success: false, error: 'Mevcut yönetici şifrenizi hatalı girdiniz!' }, { status: 400 });
      }

      const decUser = mapDoc(rawUser);
      const activeSecret = decUser.totp_secret;
      const recoveryCodes: string[] = Array.isArray(decUser.totp_recovery_codes) ? decUser.totp_recovery_codes : [];

      const normalizedInput = trimmedCode.toUpperCase().replace(/\s+/g, '');
      const isTotpOk = activeSecret ? verifyTotpCode(activeSecret, normalizedInput) : false;
      const isRecoveryOk = recoveryCodes.some((rc) => timingSafeTokenEqual(rc.toUpperCase(), normalizedInput));

      if (!isTotpOk && !isRecoveryOk) {
        await recordDistributedFailedAttempt(rlKey);
        return NextResponse.json(
          { success: false, error: 'Girdiğiniz Google Authenticator kodu veya yedek kurtarma kodu hatalı!' },
          { status: 400 }
        );
      }

      await clearDistributedRateLimit(rlKey);
      const { fullStr: nowFullStr } = getIstanbulDate();

      await usersCol.updateOne(
        { _id: rawUser._id },
        {
          $set: {
            totp_enabled: false,
            totp_secret: null,
            totp_pending_secret: null,
            totp_recovery_codes: [],
            totp_enabled_at: null,
            updated_at: nowFullStr,
          },
        }
      );

      await recordActivityLog({
        kullanici_adi: decUser.ad_soyad || decUser.username,
        kullanici_rolu: 'ADMIN',
        islem_tipi: '2FA_DEVRE_DISI',
        baslik: 'İki Faktörlü Doğrulama (2FA) Devre Dışı Bırakıldı',
        detay: `"${decUser.ad_soyad}" (@${decUser.username}) yönetici hesabı için 2FA korumasını devre dışı bıraktı.`,
      });

      return NextResponse.json({
        success: true,
        totp_enabled: false,
        message: 'İki Faktörlü Doğrulama (2FA) devre dışı bırakıldı.',
      });
    }

    // 3D. ADMIN OVERRIDE FOR PERSONNEL (Reset 2FA, Force Logout)
    if (action === 'admin_reset_user_2fa') {
      const session = await verifySession(request, { requiredRole: 'ADMIN' });
      if (!session.valid) {
        return session.response || NextResponse.json({ success: false, error: 'Yönetici oturumu gerekli.' }, { status: 403 });
      }

      const targetUsername = String(body.target_username || '').trim().toLowerCase();
      if (!targetUsername) {
        return NextResponse.json({ success: false, error: 'Hedef personel kullanıcı adı belirtilmedi.' }, { status: 400 });
      }

      const targetRaw = await findActiveUserByIdentifier(usersCol, targetUsername);
      if (!targetRaw) {
        return NextResponse.json({ success: false, error: 'Personel hesabı bulunamadı.' }, { status: 404 });
      }

      const { fullStr: nowFullStr } = getIstanbulDate();
      await usersCol.updateOne(
        { _id: targetRaw._id },
        {
          $set: {
            totp_enabled: false,
            totp_secret: null,
            totp_pending_secret: null,
            totp_recovery_codes: [],
            totp_enabled_at: null,
            updated_at: nowFullStr,
          },
        }
      );

      const targetDec = mapDoc(targetRaw);
      await recordActivityLog({
        kullanici_adi: session.username || 'ADMIN',
        kullanici_rolu: 'ADMIN',
        islem_tipi: '2FA_DEVRE_DISI',
        baslik: 'Personel 2FA Sıfırlandı (Admin Yetkisiyle)',
        detay: `Sistem Yöneticisi, "${targetDec.ad_soyad || targetDec.username}" personeli için Google Authenticator 2FA korumasını sıfırladı.`,
      });

      return NextResponse.json({
        success: true,
        message: `"${targetDec.ad_soyad || targetDec.username}" personelinin 2FA doğrulaması başarıyla sıfırlandı. Personel artık doğrudan şifresiyle giriş yapabilir.`,
      });
    }

    if (action === 'admin_force_logout_user') {
      const session = await verifySession(request, { requiredRole: 'ADMIN' });
      if (!session.valid) {
        return session.response || NextResponse.json({ success: false, error: 'Yönetici oturumu gerekli.' }, { status: 403 });
      }

      const targetUsername = String(body.target_username || '').trim().toLowerCase();
      const targetRaw = await findActiveUserByIdentifier(usersCol, targetUsername);
      if (!targetRaw) {
        return NextResponse.json({ success: false, error: 'Personel hesabı bulunamadı.' }, { status: 404 });
      }

      if (targetRaw.active_session_token) {
        clearSessionMicroCache(targetRaw.active_session_token);
      }

      await usersCol.updateOne(
        { _id: targetRaw._id },
        {
          $set: {
            active_session_token: null,
            last_logout_at: getIstanbulDate().iso,
          },
        }
      );

      const targetDec = mapDoc(targetRaw);
      return NextResponse.json({
        success: true,
        message: `"${targetDec.ad_soyad || targetDec.username}" personelinin açık oturumu sonlandırıldı.`,
      });
    }

    // =========================================================================
    // 4. USER LOGIN & ADMIN ELEVATION PROCESS
    // (Distributed Brute-Force Rate Limiting + Scrypt + TOTP 2FA + Single Device)
    // =========================================================================
    const trimmedPass = (password || '').trim();
    if (!trimmedPass) {
      return NextResponse.json({ success: false, error: 'Lütfen şifre / PIN giriniz' }, { status: 400 });
    }

    const rateLimitKey = `login::${clientIp}::${trimmedUser.toLocaleLowerCase('tr-TR')}`;
    const rateLimitStatus = await checkDistributedRateLimit(rateLimitKey);

    if (rateLimitStatus.locked) {
      return NextResponse.json(
        {
          success: false,
          error: `Çok fazla hatalı giriş denemesi tespit edildi! Güvenliğiniz için lütfen ${rateLimitStatus.waitSeconds} saniye bekleyip tekrar deneyiniz.`,
        },
        { status: 429 }
      );
    }

    const rawUser = await findActiveUserByIdentifier(usersCol, trimmedUser);
    const isPasswordCorrect = await verifyUserPassword(usersCol, rawUser, trimmedPass);

    if (!rawUser || !isPasswordCorrect) {
      const failResult = await recordDistributedFailedAttempt(rateLimitKey);

      if (failResult.count >= 5) {
        await recordActivityLog({
          kullanici_adi: trimmedUser || 'Bilinmeyen',
          kullanici_rolu: role === 'ADMIN' ? 'ADMIN' : 'PERSONEL',
          islem_tipi: 'GUVENLIK_ENGEL',
          baslik: 'Çoklu Hatalı Şifre Denemesi Engellendi',
          detay: `"${trimmedUser}" hesabı için (${clientIp}) arka arkaya ${failResult.count} hatalı şifre denemesi yapıldığı için hesap 5 dakika süreyle korumaya alındı.`,
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Hatalı kullanıcı adı veya şifre / PIN! Lütfen tekrar deneyiniz.',
        },
        { status: 401 }
      );
    }

    const decUser = mapDoc(rawUser);
    const user = sanitizeUser(decUser);

    // SECURITY ENFORCEMENT: Prevent non-ADMIN accounts from logging in as ADMIN or elevating privileges
    if ((is_elevation || role === 'ADMIN') && user.rol !== 'ADMIN') {
      return NextResponse.json(
        {
          success: false,
          error: 'Yetkisiz Erişim: Girilen kullanıcı hesabı Sistem Yöneticisi (ADMIN) yetkisine sahip değildir!',
        },
        { status: 403 }
      );
    }

    const userAgent = request.headers.get('user-agent') || 'Bilinmeyen Cihaz / Tarayıcı';

    // =========================================================================
    // 4A. DEVICE & HARDWARE RESTRICTION ENFORCEMENT
    // (Desktop: STRICTLY ADMIN only. Mobile: STRICTLY 4 Whitelisted Phones for Personel)
    // =========================================================================
    const isMobileClient = /android|iphone|ipad|ipod|mobile/i.test(userAgent);

    // KURAL 1: Bilgisayardan (Desktop/Laptop) SADECE ADMIN giriş yapabilir. Personel bilgisayardan erişemez.
    if (!isMobileClient && user.rol !== 'ADMIN') {
      return NextResponse.json(
        {
          success: false,
          code: 'DESKTOP_ACCESS_DENIED',
          error: 'Yetkisiz Cihaz Türü: Saha personelleri bilgisayardan sisteme giriş yapamaz. Bilgisayar erişimi yalnızca Sistem Yöneticisine (Admin) aittir. Lütfen kurumca yetkilendirilmiş 4 saha telefonundan giriş yapınız.',
        },
        { status: 403 }
      );
    }

    // KURAL 2: Personel girişi SADECE Admin tarafından eşlenmiş 4 yetkili telefondan yapılabilir.
    let matchedDeviceSlot: any = null;
    if (user.rol !== 'ADMIN') {
      const { authorizedDevices: devCol } = await getDbCollections();
      const providedDeviceToken = (
        request.headers.get('x-device-token') ||
        body.device_token ||
        request.cookies.get('komur_device_token')?.value ||
        ''
      ).trim();

      if (!providedDeviceToken) {
        return NextResponse.json(
          {
            success: false,
            code: 'DEVICE_NOT_AUTHORIZED',
            error: 'Bu telefon kurumun yetkili 4 saha cihazı arasında kayıtlı değildir! Giriş yapabilmek için lütfen Sistem Yöneticisinden (Admin) aktivasyon kodu alarak cihazınızı eşleyiniz.',
          },
          { status: 403 }
        );
      }

      const tokenHash = crypto.createHash('sha256').update(providedDeviceToken).digest('hex');
      matchedDeviceSlot = await devCol.findOne({ device_token_hash: tokenHash, durum: 'AKTIF' });

      if (!matchedDeviceSlot) {
        return NextResponse.json(
          {
            success: false,
            code: 'DEVICE_NOT_AUTHORIZED',
            error: 'Bu telefonun cihaz yetkilendirmesi bulunamadı veya yöneticiniz tarafından iptal edilmiş! Lütfen Sistem Yöneticisiyle iletişime geçiniz.',
          },
          { status: 403 }
        );
      }

      // KURAL 3: Slot 1 SADECE Admin'e aittir. Saha personeli Slot 1 üzerinden giriş yapamaz!
      if (matchedDeviceSlot.slot_no === 1) {
        return NextResponse.json(
          {
            success: false,
            code: 'ADMIN_DEVICE_RESTRICTED',
            error: 'Bu telefon "1. Yönetici Telefonu" olarak sisteme kayıtlıdır. Saha personelleri yalnızca kendilerine tahsis edilen 3 saha telefonundan (Slot 2, 3 veya 4) giriş yapabilir.',
          },
          { status: 403 }
        );
      }
    }

    // 2FA (Google Authenticator) Challenge for Accounts with totp_enabled
    let usedRecoveryCode = false;
    let remainingRecoveryCodes: string[] = Array.isArray(decUser.totp_recovery_codes) ? decUser.totp_recovery_codes : [];

    if (rawUser.totp_enabled && decUser.totp_secret) {
      const providedCode = (totp_code || '').trim();
      if (!providedCode) {
        return NextResponse.json({
          success: false,
          requires_2fa: true,
          message: 'Lütfen telefonunuzdaki Google Authenticator uygulamasında görünen 6 haneli doğrulama kodunu giriniz.',
        });
      }

      const normalizedCode = providedCode.toUpperCase().replace(/\s+/g, '');
      const isTotpValid = verifyTotpCode(decUser.totp_secret, normalizedCode);

      let matchedRecoveryIdx = -1;
      if (!isTotpValid) {
        matchedRecoveryIdx = remainingRecoveryCodes.findIndex((rc) =>
          timingSafeTokenEqual(rc.toUpperCase(), normalizedCode)
        );
      }

      if (!isTotpValid && matchedRecoveryIdx === -1) {
        const failResult = await recordDistributedFailedAttempt(rateLimitKey);
        if (failResult.count >= 5) {
          await recordActivityLog({
            kullanici_adi: user.ad_soyad || user.username,
            kullanici_rolu: user.rol,
            islem_tipi: 'GUVENLIK_ENGEL',
            baslik: 'Çoklu Hatalı 2FA Kodu Denemesi Engellendi',
            detay: `"${user.username}" hesabı için (${clientIp}) arka arkaya hatalı 2FA doğrulama kodu girildiği için hesap 5 dakika süreyle korumaya alındı.`,
          });
        }
        return NextResponse.json(
          {
            success: false,
            requires_2fa: true,
            error: 'Girdiğiniz 6 haneli Google Authenticator kodu veya kurtarma kodu hatalı ya da süresi dolmuş!',
          },
          { status: 401 }
        );
      }

      if (matchedRecoveryIdx !== -1) {
        usedRecoveryCode = true;
        remainingRecoveryCodes = remainingRecoveryCodes.filter((_, idx) => idx !== matchedRecoveryIdx);
      }
    }

    // Reset failed attempts on full authentication (password + 2FA if enabled)
    await clearDistributedRateLimit(rateLimitKey);

    // Generate or reuse session token and bind cookie so server-side verifySession(req, { requiredRole: 'ADMIN' }) succeeds
    const newSessionToken = (is_elevation && rawUser.active_session_token)
      ? rawUser.active_session_token
      : crypto.randomUUID();
    const { iso: nowIso } = getIstanbulDate();

    const loginUpdateDoc: any = {
      active_session_token: newSessionToken,
      last_login_at: nowIso,
      last_device: encryptField(userAgent.substring(0, 150)),
      last_ip: encryptField(clientIp),
    };

    if (usedRecoveryCode) {
      loginUpdateDoc.totp_recovery_codes = remainingRecoveryCodes.map((c) => encryptField(c));
    }

    if (rawUser.active_session_token && rawUser.active_session_token !== newSessionToken) {
      clearSessionMicroCache(rawUser.active_session_token);
    }

    await usersCol.updateOne(
      { _id: rawUser._id },
      { $set: loginUpdateDoc }
    );

    if (matchedDeviceSlot) {
      const { authorizedDevices: devCol } = await getDbCollections();
      await devCol.updateOne(
        { _id: matchedDeviceSlot._id },
        {
          $set: {
            last_used_at: nowIso,
            last_personel: user.ad_soyad || user.username,
            last_ip: encryptField(clientIp),
          },
        }
      );
    }

    if (is_elevation) {
      await recordActivityLog({
        kullanici_adi: user.ad_soyad || user.username,
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'YETKI_DOGRULAMA',
        baslik: 'Yönetici Moduna Geçiş Doğrulandı',
        detay: `"${user.ad_soyad}" (@${user.username}) ${rawUser.totp_enabled ? 'şifre + 2FA doğrulaması' : 'şifreli doğrulama'} ile Yönetici moduna geçiş yaptı.`,
      });

      const elevRes = NextResponse.json({
        success: true,
        message: 'Yönetici yetkilendirmesi doğrulandı',
        session_token: newSessionToken,
        user: {
          id: user.id,
          username: user.username,
          ad_soyad: user.ad_soyad,
          rol: user.rol,
          telefon: user.telefon,
          totp_enabled: Boolean(rawUser.totp_enabled),
        },
      });

      elevRes.cookies.set('komur_session_token', newSessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS,
      });

      return elevRes;
    }

    // Auto-pair Admin's phone to Slot 1 if Admin logs in from mobile
    let adminDeviceTokenIssued: string | null = null;
    if (user.rol === 'ADMIN' && isMobileClient) {
      const { authorizedDevices: devCol } = await getDbCollections();
      const existingProvidedToken = (
        request.headers.get('x-device-token') ||
        body.device_token ||
        request.cookies.get('komur_device_token')?.value ||
        ''
      ).trim();

      let isCurrentTokenValidForSlot1 = false;
      if (existingProvidedToken) {
        const tokenHash = crypto.createHash('sha256').update(existingProvidedToken).digest('hex');
        const found = await devCol.findOne({ slot_no: 1, device_token_hash: tokenHash, durum: 'AKTIF' });
        if (found) {
          isCurrentTokenValidForSlot1 = true;
          await devCol.updateOne(
            { _id: found._id },
            {
              $set: {
                last_used_at: nowIso,
                last_personel: user.ad_soyad || user.username,
                last_ip: encryptField(clientIp),
              },
            }
          );
        }
      }

      if (!isCurrentTokenValidForSlot1) {
        adminDeviceTokenIssued = crypto.randomBytes(32).toString('hex');
        const adminTokenHash = crypto.createHash('sha256').update(adminDeviceTokenIssued).digest('hex');

        await devCol.updateOne(
          { slot_no: 1 },
          {
            $set: {
              slot_name: '1. Yönetici Telefonu (Admin - Gökhan SUÇSUZ)',
              durum: 'AKTIF',
              device_token_hash: adminTokenHash,
              device_model: userAgent.substring(0, 100),
              paired_at: nowIso,
              last_used_at: nowIso,
              last_personel: user.ad_soyad || user.username,
              last_ip: encryptField(clientIp),
              activation_code: null,
              activation_code_expires_at: null,
            },
          },
          { upsert: true }
        );

        await recordActivityLog({
          kullanici_adi: user.ad_soyad || user.username,
          kullanici_rolu: 'ADMIN',
          islem_tipi: 'CIHAZ_YONETICI_ESLEME',
          baslik: 'Yönetici Telefonu Sisteme Eşlendi',
          detay: `Sistem Yöneticisi (${user.ad_soyad}) kendi mobil cihazını Slot 1 (Yönetici Telefonu) olarak sisteme kaydetti.`,
        });
      }
    }

    // Record audit log for standard login
    await recordActivityLog({
      kullanici_adi: user.ad_soyad || user.username,
      kullanici_rolu: user.rol,
      islem_tipi: 'GIRIS',
      baslik: 'Kullanıcı Girişi (Tek Cihaz Oturumu Başlatıldı)',
      detay: `"${user.ad_soyad}" (${user.username}) ${rawUser.totp_enabled ? '2FA (Google Authenticator) doğrulamasıyla ' : ''}sisteme giriş yaptı. Bu cihaz tek yetkili aktif oturum olarak kaydedildi.`,
    });

    const loginResponsePayload: any = {
      success: true,
      message: 'Giriş başarılı',
      session_token: newSessionToken,
      user: {
        id: user.id,
        username: user.username,
        ad_soyad: user.ad_soyad,
        rol: user.rol,
        telefon: user.telefon,
        ekip_adi: rawUser.ekip_adi || '',
        ekip_arkadaslari: Array.isArray(rawUser.ekip_arkadaslari) ? rawUser.ekip_arkadaslari : [],
        ekip_arkadasi: rawUser.ekip_arkadasi || '',
        totp_enabled: Boolean(rawUser.totp_enabled),
      },
    };

    if (adminDeviceTokenIssued) {
      loginResponsePayload.device_token = adminDeviceTokenIssued;
      loginResponsePayload.device_slot_name = '1. Yönetici Telefonu (Admin - Gökhan SUÇSUZ)';
    }

    const res = NextResponse.json(loginResponsePayload);

    if (adminDeviceTokenIssued) {
      res.cookies.set('komur_device_token', adminDeviceTokenIssued, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 365 * 24 * 60 * 60,
      });
    }

    // Set HttpOnly Secure session cookie (24-hour TTL matching server enforcement)
    res.cookies.set('komur_session_token', newSessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return res;
  } catch (error: any) {
    console.error('Error during login:', error);
    return NextResponse.json({
      success: false,
      error: 'Giriş yapılırken sunucu hatası oluştu.'
    }, { status: 500 });
  }
}

// 5. Self-Profile & Password Update for Logged-In Users and Administrators
export async function PUT(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { users: usersCol } = await getDbCollections();
    const body = await request.json();
    const {
      username,
      current_password,
      new_username,
      new_ad_soyad,
      new_password,
      telefon,
    } = body;

    const trimmedUser = (username || session.username || '').trim();
    const trimmedCurrentPass = (current_password || '').trim();

    if (!trimmedUser) {
      return NextResponse.json({ success: false, error: 'Mevcut kullanıcı adı belirtilmedi.' }, { status: 400 });
    }

    if (!trimmedCurrentPass) {
      return NextResponse.json({ success: false, error: 'İşlemi onaylamak için lütfen mevcut şifrenizi / PIN kodunuzu giriniz.' }, { status: 400 });
    }

    // Distributed Brute-force protection on profile/password change endpoint
    const clientIpRaw = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Yerel IP';
    const clientIp = clientIpRaw.split(',')[0].trim();
    const rateLimitKey = `put_auth::${clientIp}::${trimmedUser.toLocaleLowerCase('tr-TR')}`;
    const rlStatus = await checkDistributedRateLimit(rateLimitKey);

    if (rlStatus.locked) {
      return NextResponse.json(
        {
          success: false,
          error: `Çok fazla hatalı şifre doğrulama denemesi! Güvenliğiniz için lütfen ${rlStatus.waitSeconds} saniye bekleyiniz.`,
        },
        { status: 429 }
      );
    }

    const rawUser = await findActiveUserByIdentifier(usersCol, trimmedUser);

    if (!rawUser) {
      return NextResponse.json({ success: false, error: 'Kullanıcı hesabı bulunamadı.' }, { status: 404 });
    }

    const decUser = mapDoc(rawUser);

    // Non-admin users can only update their own account
    if (session.rol !== 'ADMIN' && String(decUser.id) !== String(session.id)) {
      return NextResponse.json(
        { success: false, error: 'Yetkisiz işlem! Yalnızca kendi profil bilgilerinizi güncelleyebilirsiniz.' },
        { status: 403 }
      );
    }

    const isCurrentPassValid = await verifyUserPassword(usersCol, rawUser, trimmedCurrentPass);

    if (!isCurrentPassValid) {
      await recordDistributedFailedAttempt(rateLimitKey);
      return NextResponse.json(
        { success: false, error: 'Mevcut şifrenizi / PIN kodunuzu hatalı girdiniz! Değişiklik kaydedilemedi.' },
        { status: 400 }
      );
    }

    await clearDistributedRateLimit(rateLimitKey);

    const updateFields: any = {
      updated_at: getIstanbulDate().fullStr,
    };

    let usernameChanged = false;

    // Check & update username
    if (new_username && new_username.trim()) {
      const trimmedNewUser = new_username.trim().toLowerCase();
      if (trimmedNewUser.length < 3) {
        return NextResponse.json({ success: false, error: 'Kullanıcı adı en az 3 karakterden oluşmalıdır.' }, { status: 400 });
      }

      if (trimmedNewUser !== rawUser.username?.toLowerCase()) {
        const escapedNewUser = trimmedNewUser.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const conflict = await usersCol.findOne({
          username: new RegExp(`^${escapedNewUser}$`, 'i'),
          _id: { $ne: rawUser._id },
        });

        if (conflict) {
          return NextResponse.json(
            { success: false, error: `"${trimmedNewUser}" kullanıcı adı sistemde başka bir kullanıcı tarafından kullanılmaktadır!` },
            { status: 400 }
          );
        }

        updateFields.username = trimmedNewUser;
        usernameChanged = true;
      }
    }

    // Check & update display name (Ad Soyad)
    if (new_ad_soyad && new_ad_soyad.trim()) {
      const trimmedName = new_ad_soyad.trim();
      if (trimmedName.length < 2) {
        return NextResponse.json({ success: false, error: 'Ad Soyad en az 2 karakter olmalıdır.' }, { status: 400 });
      }
      updateFields.ad_soyad = encryptField(trimmedName);
    }

    // Check & update password
    let passwordChanged = false;
    if (new_password && new_password.trim()) {
      const trimmedNewPass = new_password.trim();
      if (trimmedNewPass.length < 4) {
        return NextResponse.json({ success: false, error: 'Yeni şifre / PIN en az 4 karakter veya rakamdan oluşmalıdır.' }, { status: 400 });
      }
      updateFields.sifre_hash = hashPassword(trimmedNewPass);
      updateFields.sifre = encryptField(trimmedNewPass);
      passwordChanged = true;
    }

    // Update phone if provided
    if (telefon !== undefined) {
      updateFields.telefon = encryptField((telefon || '').trim());
    }

    await usersCol.updateOne({ _id: rawUser._id }, { $set: updateFields });

    const finalUsername = updateFields.username || rawUser.username;
    const finalName = new_ad_soyad ? new_ad_soyad.trim() : decUser.ad_soyad;

    // Record activity log
    await recordActivityLog({
      kullanici_adi: finalName || finalUsername,
      kullanici_rolu: decUser.rol,
      islem_tipi: 'PROFIL_GUNCELLEME',
      baslik: 'Kullanıcı Profil / Şifre Bilgilerini Güncelledi',
      detay: `"${decUser.username}" kullanıcısı profil bilgilerini güncelledi. (${usernameChanged ? 'Kullanıcı adı değişti, ' : ''}${passwordChanged ? 'Şifre güncellendi' : 'Bilgiler güncellendi'}).`,
    });

    return NextResponse.json({
      success: true,
      message: 'Profil ve giriş bilgileriniz başarıyla güncellendi.',
      user: {
        id: decUser.id,
        username: finalUsername,
        ad_soyad: finalName,
        rol: decUser.rol,
        telefon: telefon !== undefined ? telefon.trim() : decUser.telefon,
        totp_enabled: Boolean(rawUser.totp_enabled),
      },
    });
  } catch (error: any) {
    console.error('Error updating user profile:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

