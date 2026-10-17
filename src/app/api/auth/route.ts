import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDbCollections, mapDocs, mapDoc, recordActivityLog } from '@/lib/mongodb';
import { encryptField, hashPassword, verifyPassword, timingSafeTokenEqual } from '@/lib/crypto';
import { getIstanbulDate } from '@/lib/dateUtils';
import { sanitizeUser, verifySession } from '@/lib/auth';

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

export async function GET(request: NextRequest) {
  try {
    const { users: usersCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');

    // 1. Session Verification for Single Device Checking (GET)
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

      return NextResponse.json({
        success: true,
        valid: true,
        username: rawUser.username,
        role: rawUser.rol,
      });
    }

    // 2. Return active staff members for login screen
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
    const { username, password, role, action, session_token, is_elevation } = body;

    const trimmedUser = (username || '').trim();

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

      const res = NextResponse.json({
        success: true,
        valid: true,
      });

      // Ensure HttpOnly Secure cookie stays synchronized with valid active session token
      res.cookies.set('komur_session_token', targetToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });

      return res;
    }

    // 2. Explicit Logout: Clean up active session
    if (action === 'logout') {
      const targetToken = (session_token || '').trim();

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

    // 3. User Login Process (Brute-Force Protection, Single Device Enforcement & scrypt Hash Verification)
    const trimmedPass = (password || '').trim();
    if (!trimmedPass) {
      return NextResponse.json({ success: false, error: 'Lütfen şifre / PIN giriniz' }, { status: 400 });
    }

    const clientIpRaw = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Yerel IP';
    const clientIp = clientIpRaw.split(',')[0].trim();
    const rateLimitKey = `${clientIp}::${trimmedUser.toLocaleLowerCase('tr-TR')}`;

    const globalForAuth = globalThis as unknown as {
      __loginAttempts?: Map<string, { count: number; firstAttemptAt: number; lockedUntil: number }>;
    };
    if (!globalForAuth.__loginAttempts) {
      globalForAuth.__loginAttempts = new Map();
    }
    const attemptsMap = globalForAuth.__loginAttempts;
    const nowMs = Date.now();
    const attemptRecord = attemptsMap.get(rateLimitKey);

    if (attemptRecord && attemptRecord.lockedUntil > nowMs) {
      const waitSec = Math.ceil((attemptRecord.lockedUntil - nowMs) / 1000);
      return NextResponse.json(
        {
          success: false,
          error: `Çok fazla hatalı giriş denemesi tespit edildi! Güvenliğiniz için lütfen ${waitSec} saniye bekleyip tekrar deneyiniz.`,
        },
        { status: 429 }
      );
    }

    const rawUser = await findActiveUserByIdentifier(usersCol, trimmedUser);

    let isPasswordCorrect = false;

    if (rawUser) {
      if (rawUser.sifre_hash) {
        isPasswordCorrect = verifyPassword(trimmedPass, rawUser.sifre_hash);
      }
      // Transparent fallback: if hash was false/not present, check decrypted/plaintext password in constant time
      if (!isPasswordCorrect) {
        const decUser = mapDoc(rawUser);
        if (
          timingSafeTokenEqual(decUser.sifre, trimmedPass) ||
          timingSafeTokenEqual(rawUser.sifre, trimmedPass)
        ) {
          isPasswordCorrect = true;
          try {
            const newHash = hashPassword(trimmedPass);
            await usersCol.updateOne({ _id: rawUser._id }, { $set: { sifre_hash: newHash } });
          } catch (e) {
            console.error('Notice: Could not upgrade password hash:', e);
          }
        }
      }
    }

    if (!rawUser || !isPasswordCorrect) {
      const windowMs = 10 * 60 * 1000; // 10 minutes
      const lockDurationMs = 5 * 60 * 1000; // 5 minutes lockout after 5 failed attempts
      const prevCount =
        attemptRecord && nowMs - attemptRecord.firstAttemptAt < windowMs
          ? attemptRecord.count
          : 0;
      const nextCount = prevCount + 1;
      const lockedUntil = nextCount >= 5 ? nowMs + lockDurationMs : 0;

      attemptsMap.set(rateLimitKey, {
        count: nextCount,
        firstAttemptAt: prevCount === 0 ? nowMs : attemptRecord!.firstAttemptAt,
        lockedUntil,
      });

      if (nextCount >= 5) {
        await recordActivityLog({
          kullanici_adi: trimmedUser || 'Bilinmeyen',
          kullanici_rolu: role === 'ADMIN' ? 'ADMIN' : 'PERSONEL',
          islem_tipi: 'GUVENLIK_ENGEL',
          baslik: 'Çoklu Hatalı Şifre Denemesi Engellendi',
          detay: `"${trimmedUser}" hesabı için (${clientIp}) arka arkaya ${nextCount} hatalı şifre denemesi yapıldığı için hesap 5 dakika süreyle korumaya alındı.`,
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

    // Reset failed attempts on successful authentication
    attemptsMap.delete(rateLimitKey);

    const user = sanitizeUser(mapDoc(rawUser));

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

    // Generate or reuse session token and bind cookie so server-side verifySession(req, { requiredRole: 'ADMIN' }) succeeds
    const newSessionToken = (is_elevation && rawUser.active_session_token)
      ? rawUser.active_session_token
      : crypto.randomUUID();
    const userAgent = request.headers.get('user-agent') || 'Bilinmeyen Cihaz / Tarayıcı';
    const { iso: nowIso } = getIstanbulDate();

    await usersCol.updateOne(
      { _id: rawUser._id },
      {
        $set: {
          active_session_token: newSessionToken,
          last_login_at: nowIso,
          last_device: encryptField(userAgent.substring(0, 150)),
          last_ip: encryptField(clientIp),
        },
      }
    );

    if (is_elevation) {
      await recordActivityLog({
        kullanici_adi: user.ad_soyad || user.username,
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'YETKI_DOGRULAMA',
        baslik: 'Yönetici Moduna Geçiş Doğrulandı',
        detay: `"${user.ad_soyad}" (@${user.username}) şifreli doğrulama ile Yönetici moduna geçiş yaptı.`,
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
        },
      });

      elevRes.cookies.set('komur_session_token', newSessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });

      return elevRes;
    }

    // Record audit log for standard login
    await recordActivityLog({
      kullanici_adi: user.ad_soyad || user.username,
      kullanici_rolu: user.rol,
      islem_tipi: 'GIRIS',
      baslik: 'Kullanıcı Girişi (Tek Cihaz Oturumu Başlatıldı)',
      detay: `"${user.ad_soyad}" (${user.username}) sisteme giriş yaptı. Bu cihaz tek yetkili aktif oturum olarak kaydedildi.`,
    });

    const res = NextResponse.json({
      success: true,
      message: 'Giriş başarılı',
      session_token: newSessionToken,
      user: {
        id: user.id,
        username: user.username,
        ad_soyad: user.ad_soyad,
        rol: user.rol,
        telefon: user.telefon,
      },
    });

    // Set HttpOnly Secure session cookie
    res.cookies.set('komur_session_token', newSessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
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

// 4. Self-Profile & Password Update for Logged-In Users and Administrators
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

    // Brute-force protection on profile/password change endpoint
    const clientIpRaw = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Yerel IP';
    const clientIp = clientIpRaw.split(',')[0].trim();
    const rateLimitKey = `put_auth::${clientIp}::${trimmedUser.toLocaleLowerCase('tr-TR')}`;
    const globalForAuth = globalThis as unknown as {
      __loginAttempts?: Map<string, { count: number; firstAttemptAt: number; lockedUntil: number }>;
    };
    if (!globalForAuth.__loginAttempts) {
      globalForAuth.__loginAttempts = new Map();
    }
    const attemptsMap = globalForAuth.__loginAttempts;
    const nowMs = Date.now();
    const attemptRecord = attemptsMap.get(rateLimitKey);

    if (attemptRecord && attemptRecord.lockedUntil > nowMs) {
      const waitSec = Math.ceil((attemptRecord.lockedUntil - nowMs) / 1000);
      return NextResponse.json(
        {
          success: false,
          error: `Çok fazla hatalı şifre doğrulama denemesi! Güvenliğiniz için lütfen ${waitSec} saniye bekleyiniz.`,
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

    // Verify current password with scrypt or constant-time legacy fallback
    let isCurrentPassValid = false;
    if (rawUser.sifre_hash) {
      isCurrentPassValid = verifyPassword(trimmedCurrentPass, rawUser.sifre_hash);
    }
    if (!isCurrentPassValid) {
      isCurrentPassValid =
        timingSafeTokenEqual(decUser.sifre, trimmedCurrentPass) ||
        timingSafeTokenEqual(rawUser.sifre, trimmedCurrentPass);
    }

    if (!isCurrentPassValid) {
      const windowMs = 10 * 60 * 1000;
      const lockDurationMs = 5 * 60 * 1000;
      const prevCount =
        attemptRecord && nowMs - attemptRecord.firstAttemptAt < windowMs
          ? attemptRecord.count
          : 0;
      const nextCount = prevCount + 1;
      attemptsMap.set(rateLimitKey, {
        count: nextCount,
        firstAttemptAt: prevCount === 0 ? nowMs : attemptRecord!.firstAttemptAt,
        lockedUntil: nextCount >= 5 ? nowMs + lockDurationMs : 0,
      });

      return NextResponse.json(
        { success: false, error: 'Mevcut şifrenizi / PIN kodunuzu hatalı girdiniz! Değişiklik kaydedilemedi.' },
        { status: 400 }
      );
    }

    attemptsMap.delete(rateLimitKey);

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
      },
    });
  } catch (error: any) {
    console.error('Error updating user profile:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
