import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDbCollections, mapDocs, mapDoc, recordActivityLog } from '@/lib/mongodb';
import { encryptField, decryptField, hashPassword, verifyPassword, timingSafeTokenEqual, burnPasswordCheck, needsPasswordRehash, checkCryptoEngineHealth } from '@/lib/crypto';
import { getIstanbulDate } from '@/lib/dateUtils';
import { getClientIp, serverError, validatePasswordPolicy } from '@/lib/security';
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

  // 1b. Transliteration fallback: 'müdür' <-> 'mudur'
  if (/^m[üu]d[üu]r$/i.test(trimmed)) {
    const byMudur = await usersCol.findOne({
      username: { $in: ['müdür', 'mudur', 'Müdür', 'MUDUR'] },
      aktif: 1,
    });
    if (byMudur) return byMudur;
  }

  // 2. Fallback: decrypt active users and match by ad_soyad or username (case-insensitive Turkish)
  const allActiveRaw = await usersCol.find({ aktif: 1 }).limit(300).toArray();
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
        await usersCol.updateOne({ _id: rawUser._id }, { $set: { sifre_hash: newHash }, $unset: { sifre: "" } });
      } catch (e) {
        console.error('Notice: Could not upgrade password hash:', e);
      }
    }
  } else if (rawUser.sifre_hash && needsPasswordRehash(rawUser.sifre_hash)) {
    try {
      const newHash = hashPassword(plainPassword);
      await usersCol.updateOne({ _id: rawUser._id }, { $set: { sifre_hash: newHash }, $unset: { sifre: "" } });
    } catch (e) {}
  }
  return isValid;
}

export async function GET(request: NextRequest) {
  try {
    const { users: usersCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');

    // 1. Session Verification for Single Device Checking & 6h TTL (GET)
    if (action === 'verify') {
      const sessionToken = (
        request.cookies.get('komur_session_token')?.value ||
        request.headers.get('x-session-token') ||
        ''
      ).trim();

      if (!sessionToken) {
        return NextResponse.json(
          { success: false, valid: false, code: 'INVALID_PARAMS', error: 'Kullanıcı adı ve oturum anahtarı gereklidir.' },
          { status: 400 }
        );
      }

      const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
      const rawUser: any = await usersCol.findOne({ active_session_token: tokenHash, aktif: 1 });

      if (!rawUser) {
        return NextResponse.json(
          { success: false, valid: false, code: 'SESSION_TERMINATED', error: 'Oturum geçersiz veya sonlandırılmış. Lütfen tekrar giriş yapınız.' },
          { status: 401 }
        );
      }

      // Strictly require an active session token and verify in constant time (supports raw or SHA-256 hashed DB token)
      const isTokenMatch = rawUser.active_session_token && timingSafeTokenEqual(rawUser.active_session_token, tokenHash);
      if (!isTokenMatch) {
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

      // Enforce 6-hour absolute server-side session expiration
      if (isSessionExpired(rawUser.last_login_at)) {
        return NextResponse.json(
          {
            success: false,
            valid: false,
            code: 'SESSION_EXPIRED',
            error: 'Güvenlik politikası gereği 6 saatlik oturum süreniz dolmuştur. Lütfen tekrar giriş yapınız.',
          },
          { status: 401 }
        );
      }

      const decAdSoyad = rawUser.ad_soyad
        ? decryptField(rawUser.ad_soyad)
        : (rawUser.rol === 'ADMIN' ? 'Gökhan SUÇSUZ' : (rawUser.rol === 'MUDUR' ? 'Müdür Yetkilisi' : rawUser.username));
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

    // 2B. Admin Security Overview (Active Sessions, Rate-Limit Lockouts, 2FA Coverage, Crypto Health)
    if (action === 'security_overview') {
      const session = await verifySession(request, { requiredRole: 'ADMIN' });
      if (!session.valid) {
        return session.response || NextResponse.json({ success: false, error: 'Yönetici yetkisi gerekli.' }, { status: 403 });
      }

      const { securityRateLimits } = await getDbCollections();
      const [rawUsersList, rawRateLimits] = await Promise.all([
        usersCol.find({ aktif: 1 }).sort({ rol: 1 }).toArray(),
        securityRateLimits.find({}).toArray(),
      ]);

      const nowMs = Date.now();
      const activeSessions: Array<Record<string, unknown>> = [];
      const accounts2fa: Array<Record<string, unknown>> = [];

      for (const ru of rawUsersList) {
        const dec = mapDoc(ru);
        const hasValidSession = Boolean(ru.active_session_token) && !isSessionExpired(ru.last_login_at);
        accounts2fa.push({
          username: dec.username,
          ad_soyad: dec.ad_soyad || dec.username,
          rol: dec.rol,
          totp_enabled: Boolean(ru.totp_enabled),
          has_active_session: hasValidSession,
          last_login_at: ru.last_login_at || null,
        });
        if (hasValidSession) {
          activeSessions.push({
            username: dec.username,
            ad_soyad: dec.ad_soyad || dec.username,
            rol: dec.rol,
            last_login_at: ru.last_login_at || null,
            last_device: dec.last_device || null,
            totp_enabled: Boolean(ru.totp_enabled),
          });
        }
      }

      const rateLimits = rawRateLimits.map((r: any) => ({
        key: r.key,
        count: Number(r.count || 0),
        locked: Boolean(r.locked_until && r.locked_until > nowMs),
        waitSeconds: r.locked_until && r.locked_until > nowMs ? Math.ceil((r.locked_until - nowMs) / 1000) : 0,
        updated_at: r.updated_at || null,
      }));

      return NextResponse.json({
        success: true,
        activeSessions,
        accounts: accounts2fa,
        rateLimits,
        cryptoHealth: checkCryptoEngineHealth(),
        requirePrivileged2fa: process.env.REQUIRE_PRIVILEGED_2FA === 'true',
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
      // Check if caller is an authorized field device (prevent unauthorized scraping of personnel)
      const providedDeviceToken = (
        request.headers.get('x-device-token') ||
        request.cookies.get('komur_device_token')?.value ||
        ''
      ).trim();

      let isAuthorizedDevice = false;
      if (providedDeviceToken) {
        const { authorizedDevices: devCol } = await getDbCollections();
        const tokenHash = crypto.createHash('sha256').update(providedDeviceToken).digest('hex');
        const found = await devCol.findOne({ device_token_hash: tokenHash, durum: 'AKTIF' });
        if (found) isAuthorizedDevice = true;
      }

      if (!isAuthorizedDevice) {
        return NextResponse.json({
          success: true,
          users: [],
          personnel: [],
          admins: [],
          device_unauthorized: true,
        });
      }

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
    const clientIp = getClientIp(request);

    // 1. Session Verification check (POST)
    if (action === 'verify') {
      let targetToken = (session_token || '').trim();
      if (!targetToken) {
        targetToken = request.cookies.get('komur_session_token')?.value?.trim() || request.headers.get('x-session-token')?.trim() || '';
      }
      if (!targetToken) {
        return NextResponse.json(
          { success: false, valid: false, code: 'INVALID_PARAMS', error: 'Oturum kodu eksik.' },
          { status: 400 }
        );
      }

      const tokenHash = crypto.createHash('sha256').update(targetToken).digest('hex');
      const rawUser: any = await usersCol.findOne({ active_session_token: tokenHash, aktif: 1 });

      if (!rawUser) {
        return NextResponse.json(
          { success: false, valid: false, code: 'SESSION_TERMINATED', error: 'Oturum geçersiz veya sonlandırılmış. Lütfen tekrar giriş yapınız.' },
          { status: 401 }
        );
      }

      // Strictly require an active session token and verify in constant time
      const isTokenMatch = rawUser.active_session_token && timingSafeTokenEqual(rawUser.active_session_token, tokenHash);

      if (!isTokenMatch) {
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

      // Enforce 6-hour absolute session TTL
      if (isSessionExpired(rawUser.last_login_at)) {
        return NextResponse.json(
          {
            success: false,
            valid: false,
            code: 'SESSION_EXPIRED',
            error: 'Güvenlik politikası gereği 6 saatlik oturum süreniz dolmuştur. Lütfen tekrar giriş yapınız.',
          },
          { status: 401 }
        );
      }

      const decAdSoyad = rawUser.ad_soyad
        ? decryptField(rawUser.ad_soyad)
        : (rawUser.rol === 'ADMIN' ? 'Gökhan SUÇSUZ' : (rawUser.rol === 'MUDUR' ? 'Müdür Yetkilisi' : rawUser.username));
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

      // Ensure HttpOnly Secure cookie stays synchronized with valid active session token (6h maxAge)
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
      let targetToken = (session_token || '').trim();
      if (!targetToken) {
        targetToken = request.cookies.get('komur_session_token')?.value?.trim() || request.headers.get('x-session-token')?.trim() || '';
      }
      if (targetToken) {
        clearSessionMicroCache(targetToken);
      }

      let rawUser = trimmedUser ? await findActiveUserByIdentifier(usersCol, trimmedUser) : null;
      if (!rawUser && targetToken) {
        const tokenHash = crypto.createHash('sha256').update(targetToken).digest('hex');
        rawUser = await usersCol.findOne({
          active_session_token: tokenHash,
        });
      }

      if (rawUser) {
        await usersCol.updateOne(
          { _id: rawUser._id },
          {
            $set: { active_session_token: null, last_logout_at: getIstanbulDate().iso },
          }
        );

        await recordActivityLog({
          kullanici_adi: rawUser.username || trimmedUser || 'Kullanıcı',
          islem_tipi: 'CIKIS',
          baslik: 'Kullanıcı Oturumu Kapatıldı',
          detay: `"${rawUser.username || trimmedUser}" kullanıcısı güvenli oturumunu sonlandırdı.`,
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
    // =========================================================================
    // 3. GOOGLE AUTHENTICATOR (TOTP) 2FA SETUP & MANAGEMENT
    // =========================================================================

    // 3A. Initialize 2FA Setup (Generate Secret + Offline SVG QR Code)
    if (action === '2fa_setup_init') {
      const session = await verifySession(request);
      if (!session.valid) {
        return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
      }

      // If Admin provided target_username, initialize for that personnel; otherwise initialize for own account
      let targetUsername = (session.username || '').toLowerCase();
      if (session.rol === 'ADMIN' && body.target_username) {
        targetUsername = String(body.target_username).trim().toLowerCase();
      }

      const rawUser = await findActiveUserByIdentifier(usersCol, targetUsername);
      if (!rawUser) {
        return NextResponse.json({ success: false, error: 'Kullanıcı hesabı bulunamadı.' }, { status: 404 });
      }

      const secret = generateTotpSecret(20); // 160-bit Base32 secret (32 chars)
      const userRoleLabel = rawUser.rol === 'ADMIN' ? 'Yönetici' : (rawUser.rol === 'MUDUR' ? 'Müdür Yetkilisi' : 'Saha Personeli');
      const decUser = mapDoc(rawUser);
      const decAd = decUser.ad_soyad || decUser.username;
      const accountLabel = `${decAd} (${userRoleLabel})`;
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
        target_username: rawUser.username,
        target_name: decAd,
      });
    }

    // 3B. Verify 6-Digit Google Authenticator Code & Activate 2FA
    if (action === '2fa_setup_verify') {
      const session = await verifySession(request);
      if (!session.valid) {
        return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
      }

      const trimmedCurPass = (current_password || '').trim();
      const trimmedCode = (totp_code || '').trim();
      const isAdminAssisted = session.rol === 'ADMIN' && body.target_username;
      const targetUsername = isAdminAssisted
        ? String(body.target_username).trim().toLowerCase()
        : (session.username || '').toLowerCase();

      if (!trimmedCurPass) {
        return NextResponse.json({ success: false, error: 'Lütfen doğrulama için geçerli şifrenizi giriniz.' }, { status: 400 });
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

      const rawUser = await findActiveUserByIdentifier(usersCol, targetUsername);
      if (!rawUser) {
        return NextResponse.json({ success: false, error: 'Kullanıcı hesabı bulunamadı.' }, { status: 404 });
      }

      // Password check: if Admin is assisting a personnel, verify Admin's password; else verify user's own password
      const actingUser = isAdminAssisted
        ? await findActiveUserByIdentifier(usersCol, session.username || '')
        : rawUser;

      if (!actingUser) {
        return NextResponse.json({ success: false, error: 'Doğrulama yapan kullanıcı hesabı bulunamadı.' }, { status: 404 });
      }

      const isPassValid = await verifyUserPassword(usersCol, actingUser, trimmedCurPass);
      if (!isPassValid) {
        await recordDistributedFailedAttempt(rlKey);
        return NextResponse.json({ success: false, error: 'Girdiğiniz şifre hatalı!' }, { status: 400 });
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
            error: 'Girdiğiniz 6 haneli doğrulama kodu eşleşmedi! Telefon saatinin otomatik olduğundan emin olup güncel kodu giriniz.',
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
            totp_device_graces: [],
            totp_enabled_at: nowFullStr,
            updated_at: nowFullStr,
          },
        }
      );

      await recordActivityLog({
        kullanici_adi: session.username || rawUser.username,
        kullanici_rolu: session.rol || rawUser.rol,
        islem_tipi: '2FA_AKTIF',
        baslik: 'İki Faktörlü Doğrulama (Google Authenticator) Etkinleştirildi',
        detay: `"${rawUser.username}" hesabı için Google Authenticator (TOTP) 2FA koruması başarıyla aktif edildi.`,
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
      const session = await verifySession(request);
      if (!session.valid) {
        return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
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
        return NextResponse.json({ success: false, error: 'Kullanıcı hesabı bulunamadı.' }, { status: 404 });
      }

      const isPassValid = await verifyUserPassword(usersCol, rawUser, trimmedCurPass);
      if (!isPassValid) {
        await recordDistributedFailedAttempt(rlKey);
        return NextResponse.json({ success: false, error: 'Mevcut şifrenizi hatalı girdiniz!' }, { status: 400 });
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
            totp_device_graces: [],
            totp_enabled_at: null,
            updated_at: nowFullStr,
          },
        }
      );

      await recordActivityLog({
        kullanici_adi: decUser.ad_soyad || decUser.username,
        kullanici_rolu: decUser.rol || 'PERSONEL',
        islem_tipi: '2FA_DEVRE_DISI',
        baslik: 'İki Faktörlü Doğrulama (2FA) Devre Dışı Bırakıldı',
        detay: `"${decUser.ad_soyad || decUser.username}" (@${decUser.username}) hesabı için 2FA korumasını devre dışı bıraktı.`,
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
            totp_device_graces: [],
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

    if (action === 'admin_unlock_rate_limit') {
      const session = await verifySession(request, { requiredRole: 'ADMIN' });
      if (!session.valid) {
        return session.response || NextResponse.json({ success: false, error: 'Yönetici oturumu gerekli.' }, { status: 403 });
      }

      const { securityRateLimits } = await getDbCollections();
      const rateKey = String(body.rate_key || '').trim();
      const targetUser = String(body.target_username || '').trim().toLowerCase();

      if (body.clear_all === true) {
        await securityRateLimits.deleteMany({});
      } else if (rateKey) {
        await securityRateLimits.deleteOne({ key: rateKey });
      } else if (targetUser) {
        const escaped = targetUser.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        await securityRateLimits.deleteMany({ key: new RegExp(escaped, 'i') });
      } else {
        return NextResponse.json({ success: false, error: 'Kilit anahtarı veya kullanıcı adı belirtilmedi.' }, { status: 400 });
      }

      await recordActivityLog({
        kullanici_adi: session.username || 'ADMIN',
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'GUVENLIK_KILIT_ACMA',
        baslik: 'Giriş Hız Sınırı / Hesap Kilidi Açıldı',
        detay: `Sistem Yöneticisi tarafından güvenlik hız sınırı kilidi (${rateKey || targetUser || 'TÜMÜ'}) kaldırıldı.`,
      });

      return NextResponse.json({
        success: true,
        message: 'Güvenlik hız sınırı / hesap kilidi başarıyla kaldırıldı.',
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

    // IP güvenilir değilse (TRUSTED_PROXY_HOPS=0) kilit anahtarı istemci parmak iziyle ayrıştırılır;
    // böylece bir saldırgan gerçek kullanıcıyı kendi hesabından kilitleyemez.
    const uaFingerprint = crypto
      .createHash('sha256')
      .update((request.headers.get('user-agent') || '') + '|' + (request.headers.get('accept-language') || ''))
      .digest('hex')
      .slice(0, 16);
    const clientKeyPart = clientIp !== 'bilinmiyor' ? clientIp : 'ua:' + uaFingerprint;
    const userLower = trimmedUser.toLocaleLowerCase('tr-TR');
    const rateLimitKey = `login::${clientKeyPart}::${userLower}`;
    const userWideKey = `login-user::${userLower}`;
    const ipWideKey = clientIp !== 'bilinmiyor' ? `login-ip::${clientIp}` : '';
    const rateLimitChecks = await Promise.all([
      checkDistributedRateLimit(rateLimitKey),
      checkDistributedRateLimit(userWideKey),
      ipWideKey ? checkDistributedRateLimit(ipWideKey) : Promise.resolve({ locked: false, waitSeconds: 0 }),
    ]);
    const rateLimitStatus = rateLimitChecks.find((r) => r.locked) || rateLimitChecks[0];
    const recordLoginFailure = async () => {
      const [primary] = await Promise.all([
        recordDistributedFailedAttempt(rateLimitKey),
        recordDistributedFailedAttempt(userWideKey, 20, 15 * 60 * 1000, 10 * 60 * 1000),
        ipWideKey ? recordDistributedFailedAttempt(ipWideKey, 40, 10 * 60 * 1000, 10 * 60 * 1000) : Promise.resolve(null),
      ]);
      return primary;
    };

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
    if (!rawUser) {
      burnPasswordCheck(trimmedPass);
    }
    const isPasswordCorrect = rawUser ? await verifyUserPassword(usersCol, rawUser, trimmedPass) : false;

    if (!rawUser || !isPasswordCorrect) {
      const failResult = await recordLoginFailure();

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
    // (Desktop: ADMIN & MUDUR only. Mobile: Strictly 4 Whitelisted Phones for Personel/Admin)
    // =========================================================================
    const isMobileClient = /android|iphone|ipad|ipod|mobile/i.test(userAgent);

    // KURAL 1: MÜDÜR YETKİLİSİ KISITLAMASI: Yalnızca bilgisayardan (Desktop/Laptop) giriş yapabilir.
    if (user.rol === 'MUDUR') {
      if (isMobileClient) {
        return NextResponse.json(
          {
            success: false,
            code: 'MOBILE_ACCESS_DENIED',
            error: 'Yetkisiz Cihaz Türü: Müdür yetkilisi hesabı yalnızca bilgisayardan (Masaüstü/Dizüstü) erişime açıktır. Mobil cihazlardan giriş yapılamaz.',
          },
          { status: 403 }
        );
      }
    }

    // KURAL 2: SAHA PERSONELİ KISITLAMASI: Bilgisayardan sisteme giriş yapamaz. Bilgisayar erişimi Yönetici ve Müdür yetkililerine aittir.
    if (user.rol === 'PERSONEL' && !isMobileClient) {
      return NextResponse.json(
        {
          success: false,
          code: 'DESKTOP_ACCESS_DENIED',
          error: 'Yetkisiz Cihaz Türü: Saha personelleri bilgisayardan sisteme giriş yapamaz. Bilgisayar erişimi yalnızca Sistem Yöneticisi ve Müdür Yetkilisine aittir. Lütfen kurumca yetkilendirilmiş saha telefonundan giriş yapınız.',
        },
        { status: 403 }
      );
    }

    // KURAL 3: Personel girişi SADECE Admin tarafından eşlenmiş 4 yetkili telefondan yapılabilir.
    let matchedDeviceSlot: any = null;
    if (user.rol === 'PERSONEL') {
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

      // KURAL 4: Slot 1 SADECE Admin'e aittir. Saha personeli Slot 1 üzerinden giriş yapamaz!
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
    let skip2faDueToGrace = false;

    // 6 Saatlik 2FA Muafiyet Süresi (Eşleşmiş Yetkili Cihazlar İçin)
    // Personel eşleşmiş telefonu ile 6 saat içinde 1 kez 2FA girer, 6 saat dolmadan tekrar 2FA kodu istenmez
    const TWO_FACTOR_GRACE_MS = 6 * 60 * 60 * 1000; // 6 saat
    const nowMs = Date.now();
    const existingGraces: any[] = Array.isArray(rawUser.totp_device_graces) ? rawUser.totp_device_graces : [];

    if (rawUser.totp_enabled && decUser.totp_secret) {
      if (user.rol === 'PERSONEL' && matchedDeviceSlot && matchedDeviceSlot.slot_no) {
        const activeGrace = existingGraces.find((g: any) =>
          Number(g.slot_no) === Number(matchedDeviceSlot.slot_no) &&
          g.expires_at &&
          new Date(g.expires_at).getTime() > nowMs
        );
        if (activeGrace) {
          skip2faDueToGrace = true;
        }
      }

      if (!skip2faDueToGrace) {
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
          const failResult = await recordLoginFailure();
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
    }

    // Reset failed attempts on full authentication (password + 2FA if enabled)
    await clearDistributedRateLimit(rateLimitKey);
    await clearDistributedRateLimit(userWideKey);

    // Generate fresh session token and store only its SHA-256 hash in MongoDB (prevents session hijacking on DB leak)
    const newSessionToken = crypto.randomUUID();
    const newSessionTokenHash = crypto.createHash('sha256').update(newSessionToken).digest('hex');
    const { iso: nowIso } = getIstanbulDate();

    const loginUpdateDoc: any = {
      active_session_token: newSessionTokenHash,
      last_login_at: nowIso,
      last_device: encryptField(userAgent.substring(0, 150)),
      last_ip: encryptField(clientIp),
    };

    if (usedRecoveryCode) {
      loginUpdateDoc.totp_recovery_codes = remainingRecoveryCodes.map((c) => encryptField(c));
    }

    // Eşleşmiş yetkili cihazda yeni 2FA doğrulaması yapıldıysa 6 saatlik muafiyeti kaydet
    if (user.rol === 'PERSONEL' && matchedDeviceSlot && rawUser.totp_enabled && !skip2faDueToGrace) {
      const updatedGraces = existingGraces.filter(
        (g: any) => Number(g.slot_no) !== Number(matchedDeviceSlot.slot_no)
      );
      updatedGraces.push({
        slot_no: matchedDeviceSlot.slot_no,
        slot_name: matchedDeviceSlot.slot_name || `Slot ${matchedDeviceSlot.slot_no}`,
        verified_at: new Date(nowMs).toISOString(),
        expires_at: new Date(nowMs + TWO_FACTOR_GRACE_MS).toISOString(),
      });
      loginUpdateDoc.totp_device_graces = updatedGraces;
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

    const graceNote = skip2faDueToGrace
      ? ' (6 saatlik cihaz 2FA muafiyeti aktif - kodsuz hızlı giriş)'
      : (rawUser.totp_enabled ? ' (2FA Google Authenticator doğrulandı)' : '');

    // Record audit log for standard login
    await recordActivityLog({
      kullanici_adi: user.ad_soyad || user.username,
      kullanici_rolu: user.rol,
      islem_tipi: 'GIRIS',
      baslik: 'Kullanıcı Girişi (Tek Cihaz Oturumu Başlatıldı)',
      detay: `"${user.ad_soyad}" (${user.username}) sisteme giriş yaptı.${graceNote} Bu cihaz tek yetkili aktif oturum olarak kaydedildi.`,
    });

    const loginResponsePayload: any = {
      success: true,
      message: 'Giriş başarılı',
      session_token: newSessionToken,
      two_factor_grace_active: skip2faDueToGrace,
      must_setup_2fa: (user.rol === 'ADMIN' || user.rol === 'MUDUR') && !rawUser.totp_enabled,
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

    // Set HttpOnly Secure session cookie (6-hour TTL matching server enforcement)
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
    const clientIp = getClientIp(request);
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
      const policyErr = validatePasswordPolicy(trimmedNewPass, trimmedUser);
      if (policyErr) {
        return NextResponse.json({ success: false, error: policyErr }, { status: 400 });
      }
      updateFields.sifre_hash = hashPassword(trimmedNewPass);
      passwordChanged = true;
    }

    // Update phone if provided
    if (telefon !== undefined) {
      updateFields.telefon = encryptField((telefon || '').trim());
    }

    let rotatedSessionToken: string | null = null;
    const isSelfUpdate = String(decUser.id) === String(session.id);
    if (passwordChanged || usernameChanged) {
      if (rawUser.active_session_token) {
        clearSessionMicroCache(rawUser.active_session_token);
      }
      if (isSelfUpdate) {
        rotatedSessionToken = crypto.randomUUID();
        updateFields.active_session_token = crypto.createHash('sha256').update(rotatedSessionToken).digest('hex');
        updateFields.last_login_at = getIstanbulDate().iso;
      } else {
        updateFields.active_session_token = null;
      }
    }

    const updateOp: any = { $set: updateFields };
    if (passwordChanged) {
      updateOp.$unset = { sifre: '' };
    }
    await usersCol.updateOne({ _id: rawUser._id }, updateOp);

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

    const putRes = NextResponse.json({
      success: true,
      message: 'Profil ve giriş bilgileriniz başarıyla güncellendi.',
      ...(rotatedSessionToken ? { session_token: rotatedSessionToken } : {}),
      user: {
        id: decUser.id,
        username: finalUsername,
        ad_soyad: finalName,
        rol: decUser.rol,
        telefon: telefon !== undefined ? telefon.trim() : decUser.telefon,
        totp_enabled: Boolean(rawUser.totp_enabled),
      },
    });

    if (rotatedSessionToken) {
      putRes.cookies.set('komur_session_token', rotatedSessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS,
      });
    }

    return putRes;
  } catch (error: any) {
    console.error('Error updating user profile:', error);
    return serverError('auth:PUT', error);
  }
}

