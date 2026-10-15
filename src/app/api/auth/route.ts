import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDbCollections, mapDocs, mapDoc, recordActivityLog } from '@/lib/mongodb';
import { encryptField, hashPassword, verifyPassword } from '@/lib/crypto';
import { getIstanbulDate } from '@/lib/dateUtils';
import { sanitizeUser } from '@/lib/auth';

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

      const escapedUser = username.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const userRegex = new RegExp(`^${escapedUser}$`, 'i');

      const rawUser = await usersCol.findOne({
        $or: [{ username: userRegex }, { ad_soyad: userRegex }],
        aktif: 1,
      });

      if (!rawUser) {
        return NextResponse.json(
          { success: false, valid: false, code: 'USER_NOT_FOUND', error: 'Kullanıcı hesabı bulunamadı veya pasife alınmış.' },
          { status: 404 }
        );
      }

      // Check if another device has logged in with this username
      if (rawUser.active_session_token && rawUser.active_session_token !== sessionToken) {
        return NextResponse.json(
          {
            success: false,
            valid: false,
            code: 'SESSION_TERMINATED',
            error: 'Bu kullanıcı hesabı ile başka bir cihazdan oturum açıldı! Güvenlik gereği aynı anda yalnızca tek bir cihaz sisteme girebilir.',
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

    // 2. Return active staff members for login screen (SECURITY: Strip passwords and session tokens!)
    const rawUsers = await usersCol
      .find({ aktif: 1 })
      .sort({ rol: 1, ad_soyad: 1 })
      .toArray();

    const users = mapDocs(rawUsers).map(sanitizeUser);

    return NextResponse.json({
      success: true,
      users,
      personnel: users.filter((u: any) => u.rol === 'PERSONEL'),
      admins: users.filter((u: any) => u.rol === 'ADMIN'),
    });
  } catch (error: any) {
    console.error('Error fetching auth users:', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Kullanıcı listesi alınamadı.'
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

      const escapedUser = trimmedUser.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const userRegex = new RegExp(`^${escapedUser}$`, 'i');

      const rawUser = await usersCol.findOne({
        $or: [{ username: userRegex }, { ad_soyad: userRegex }],
        aktif: 1,
      });

      if (!rawUser) {
        return NextResponse.json(
          { success: false, valid: false, code: 'USER_NOT_FOUND', error: 'Kullanıcı hesabı bulunamadı veya pasif.' },
          { status: 404 }
        );
      }

      // Check if active session token matches
      if (rawUser.active_session_token && rawUser.active_session_token !== targetToken) {
        return NextResponse.json(
          {
            success: false,
            valid: false,
            code: 'SESSION_TERMINATED',
            error: 'Bu kullanıcı hesabı ile başka bir cihazdan giriş yapıldı! Güvenlik kuralı gereğince aynı kullanıcı hesabıyla aynı anda yalnızca tek bir cihaz sisteme girebilir.',
          },
          { status: 401 }
        );
      }

      return NextResponse.json({
        success: true,
        valid: true,
      });
    }

    // 2. Explicit Logout: Clean up active session
    if (action === 'logout') {
      const targetToken = (session_token || '').trim();
      const escapedUser = trimmedUser.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const userRegex = new RegExp(`^${escapedUser}$`, 'i');

      if (trimmedUser && targetToken) {
        await usersCol.updateOne(
          {
            $or: [{ username: userRegex }, { ad_soyad: userRegex }],
            active_session_token: targetToken,
          },
          {
            $set: { active_session_token: null, last_logout_at: getIstanbulDate().iso },
          }
        );

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

    // 3. User Login Process (Single Device Enforcement & scrypt Hash Verification)
    const trimmedPass = (password || '').trim();
    if (!trimmedPass) {
      return NextResponse.json({ success: false, error: 'Lütfen şifre / PIN giriniz' }, { status: 400 });
    }

    const escapedUser = trimmedUser.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const userRegex = new RegExp(`^${escapedUser}$`, 'i');

    const rawUser = await usersCol.findOne({
      $or: [{ username: userRegex }, { ad_soyad: userRegex }],
      aktif: 1,
    });

    let isPasswordCorrect = false;

    if (rawUser) {
      if (rawUser.sifre_hash) {
        isPasswordCorrect = verifyPassword(trimmedPass, rawUser.sifre_hash);
      }
      // Transparent fallback: if hash was false/not present, check decrypted/plaintext password
      if (!isPasswordCorrect) {
        const decUser = mapDoc(rawUser);
        if (decUser.sifre === trimmedPass || rawUser.sifre === trimmedPass) {
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
      return NextResponse.json(
        {
          success: false,
          error: 'Hatalı kullanıcı adı veya şifre / PIN! Lütfen tekrar deneyiniz.',
        },
        { status: 401 }
      );
    }

    const user = sanitizeUser(mapDoc(rawUser));

    // If it's a temporary admin elevation dialog (e.g. AdminAuthModal), verify credentials without overriding active device session
    if (is_elevation) {
      return NextResponse.json({
        success: true,
        message: 'Yetkilendirme doğrulandı',
        user: {
          id: user.id,
          username: user.username,
          ad_soyad: user.ad_soyad,
          rol: user.rol,
          telefon: user.telefon,
        },
      });
    }

    // Generate a fresh unique session token for this device
    const newSessionToken = crypto.randomUUID();
    const userAgent = request.headers.get('user-agent') || 'Bilinmeyen Cihaz / Tarayıcı';
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Yerel IP';
    const { iso: nowIso } = getIstanbulDate();

    // Store new session token on user document (immediately invalidates any previous device session)
    await usersCol.updateOne(
      { _id: rawUser._id },
      {
        $set: {
          active_session_token: newSessionToken,
          last_login_at: nowIso,
          last_device: userAgent.substring(0, 150),
          last_ip: clientIp.split(',')[0].trim(),
        },
      }
    );

    // Record audit log
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
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return res;
  } catch (error: any) {
    console.error('Error during login:', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Giriş yapılırken sunucu hatası oluştu.'
    }, { status: 500 });
  }
}

// 4. Self-Profile & Password Update for Logged-In Users and Administrators
export async function PUT(request: NextRequest) {
  try {
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

    const trimmedUser = (username || '').trim();
    const trimmedCurrentPass = (current_password || '').trim();

    if (!trimmedUser) {
      return NextResponse.json({ success: false, error: 'Mevcut kullanıcı adı belirtilmedi.' }, { status: 400 });
    }

    if (!trimmedCurrentPass) {
      return NextResponse.json({ success: false, error: 'İşlemi onaylamak için lütfen mevcut şifrenizi / PIN kodunuzu giriniz.' }, { status: 400 });
    }

    const escapedUser = trimmedUser.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const userRegex = new RegExp(`^${escapedUser}$`, 'i');

    const rawUser = await usersCol.findOne({
      $or: [{ username: userRegex }, { ad_soyad: userRegex }],
      aktif: 1,
    });

    if (!rawUser) {
      return NextResponse.json({ success: false, error: 'Kullanıcı hesabı bulunamadı.' }, { status: 404 });
    }

    const decUser = mapDoc(rawUser);

    // Verify current password with scrypt or legacy fallback
    let isCurrentPassValid = false;
    if (rawUser.sifre_hash) {
      isCurrentPassValid = verifyPassword(trimmedCurrentPass, rawUser.sifre_hash);
    }
    if (!isCurrentPassValid) {
      isCurrentPassValid = decUser.sifre === trimmedCurrentPass || rawUser.sifre === trimmedCurrentPass;
    }

    if (!isCurrentPassValid) {
      return NextResponse.json(
        { success: false, error: 'Mevcut şifrenizi / PIN kodunuzu hatalı girdiniz! Değişiklik kaydedilemedi.' },
        { status: 400 }
      );
    }

    const updateFields: any = {
      updated_at: getIstanbulDate().fullStr,
    };

    let usernameChanged = false;
    let oldUsername = rawUser.username;

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
