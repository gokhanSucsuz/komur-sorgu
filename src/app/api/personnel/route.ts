import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, buildIdFilter, recordActivityLog } from '@/lib/mongodb';
import { encryptUser, encryptField, hashPassword, getIstanbulDate } from '@/lib/crypto';
import { verifySession, sanitizeUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!auth.valid) return auth.response!;

    const { users: usersCol } = await getDbCollections();
    const rawUsers = await usersCol
      .find({})
      .sort({ rol: 1, ad_soyad: 1 })
      .toArray();

    // Security: Sanitize all users, never expose raw/decrypted password or token
    const users = mapDocs(rawUsers).map(sanitizeUser);

    return NextResponse.json({
      success: true,
      users,
      total: users.length,
    });
  } catch (error: any) {
    console.error('Error fetching personnel:', error);
    return NextResponse.json({ success: false, error: 'Personel listesi alınırken hata oluştu.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!auth.valid) return auth.response!;

    const { users: usersCol } = await getDbCollections();
    const body = await request.json();
    const { username, ad_soyad, rol, sifre, telefon } = body;

    const trimmedUser = (username || '').trim().toLowerCase();
    const trimmedName = (ad_soyad || '').trim();
    const trimmedPass = (sifre || '').trim();
    const trimmedRole = rol === 'ADMIN' ? 'ADMIN' : 'PERSONEL';

    if (!trimmedUser || !trimmedName || !trimmedPass) {
      return NextResponse.json(
        {
          success: false,
          error: 'Kullanıcı adı, Ad Soyad ve Şifre/PIN zorunludur',
        },
        { status: 400 }
      );
    }

    if (trimmedPass.length < 4) {
      return NextResponse.json(
        {
          success: false,
          error: 'Şifre / PIN en az 4 karakterden oluşmalıdır.',
        },
        { status: 400 }
      );
    }

    // Check unique username
    const existing = await usersCol.findOne({ username: trimmedUser });
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `Bu kullanıcı adı ("${trimmedUser}") zaten kullanımda!`,
        },
        { status: 400 }
      );
    }

    const newDoc = {
      username: trimmedUser,
      ad_soyad: trimmedName,
      rol: trimmedRole,
      sifre: trimmedPass,
      sifre_hash: hashPassword(trimmedPass),
      telefon: (telefon || '').trim(),
      aktif: 1,
      created_at: getIstanbulDate().fullStr,
    };

    // Encrypt sensitive personnel info with AES-256-GCM
    const encryptedDoc = encryptUser(newDoc);
    const result = await usersCol.insertOne(encryptedDoc);
    const newId = result.insertedId ? result.insertedId.toString() : '';

    await recordActivityLog({
      kullanici_adi: auth.user.ad_soyad || auth.user.username,
      kullanici_rolu: 'ADMIN',
      islem_tipi: 'PERSONEL_ISLEM',
      baslik: 'Yeni Personel Tanımlandı',
      detay: `"${trimmedName}" (${trimmedUser}) sisteme ${trimmedRole === 'ADMIN' ? 'Yönetici' : 'Saha Personeli'} olarak eklendi.`,
      ek_bilgi: { username: trimmedUser, rol: trimmedRole },
    });

    return NextResponse.json({
      success: true,
      message: 'Personel başarıyla eklendi',
      id: newId,
    });
  } catch (error: any) {
    console.error('Error adding personnel:', error);
    return NextResponse.json({ success: false, error: 'Personel eklenirken hata oluştu.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!auth.valid) return auth.response!;

    const { users: usersCol } = await getDbCollections();
    const body = await request.json();
    const { id, username, ad_soyad, rol, sifre, telefon, aktif } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Personel ID zorunludur' }, { status: 400 });
    }

    const trimmedUser = (username || '').trim().toLowerCase();
    const trimmedName = (ad_soyad || '').trim();
    const trimmedPass = (sifre || '').trim();
    const trimmedRole = rol === 'ADMIN' ? 'ADMIN' : 'PERSONEL';
    const isActive = aktif === 0 ? 0 : 1;

    // Prevent demoting OR deactivating the last active Admin account
    const targetUser = await usersCol.findOne(buildIdFilter(id));
    if (targetUser && targetUser.rol === 'ADMIN' && (trimmedRole === 'PERSONEL' || isActive === 0)) {
      const otherAdminCount = await usersCol.countDocuments({
        rol: 'ADMIN',
        aktif: 1,
        _id: { $ne: targetUser._id },
      });
      if (otherAdminCount < 1) {
        return NextResponse.json(
          {
            success: false,
            error: 'Güvenlik kuralı: Sistemdeki tek aktif Yönetici (Admin) hesabı pasife alınamaz veya rolü düşürülemez!',
          },
          { status: 400 }
        );
      }
    }

    // Check unique username excluding current
    if (trimmedUser) {
      const existing = await usersCol.findOne({
        username: trimmedUser,
        $nor: [buildIdFilter(id)],
      });
      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: `Bu kullanıcı adı ("${trimmedUser}") başka bir personele ait!`,
          },
          { status: 400 }
        );
      }
    }

    const updateFields: any = {
      rol: trimmedRole,
      aktif: isActive,
      updated_at: getIstanbulDate().fullStr,
    };

    if (trimmedUser) updateFields.username = trimmedUser;
    if (trimmedName) updateFields.ad_soyad = encryptField(trimmedName);
    if (trimmedPass) {
      if (trimmedPass.length < 4) {
        return NextResponse.json({ success: false, error: 'Şifre / PIN en az 4 karakter olmalıdır.' }, { status: 400 });
      }
      updateFields.sifre_hash = hashPassword(trimmedPass);
      updateFields.sifre = encryptField(trimmedPass);
    }
    if (telefon !== undefined) updateFields.telefon = encryptField((telefon || '').trim());

    // If deactivated, terminate active session immediately
    if (isActive === 0) {
      updateFields.active_session_token = null;
    }

    await usersCol.updateOne(buildIdFilter(id), { $set: updateFields });

    await recordActivityLog({
      kullanici_adi: auth.user.ad_soyad || auth.user.username,
      kullanici_rolu: 'ADMIN',
      islem_tipi: 'PERSONEL_ISLEM',
      baslik: 'Personel Bilgileri Güncellendi',
      detay: `Personel "${trimmedName || id}" bilgileri güncellendi.${trimmedPass ? ' (Şifre yenilendi)' : ''}`,
      ek_bilgi: { id, username: trimmedUser, rol: trimmedRole },
    });

    return NextResponse.json({
      success: true,
      message: 'Personel bilgileri ve şifresi başarıyla güncellendi',
    });
  } catch (error: any) {
    console.error('Error updating personnel:', error);
    return NextResponse.json({ success: false, error: 'Personel güncellenirken hata oluştu.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!auth.valid) return auth.response!;

    const { users: usersCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Personel ID zorunludur' }, { status: 400 });
    }

    // Prevent deleting the last Admin
    const target = await usersCol.findOne(buildIdFilter(id));
    if (target && target.rol === 'ADMIN') {
      const adminCount = await usersCol.countDocuments({ rol: 'ADMIN', aktif: 1 });
      if (adminCount <= 1) {
        return NextResponse.json(
          {
            success: false,
            error: 'Sistemdeki tek aktif yönetici silinemez!',
          },
          { status: 400 }
        );
      }
    }

    await usersCol.deleteOne(buildIdFilter(id));

    await recordActivityLog({
      kullanici_adi: auth.user.ad_soyad || auth.user.username,
      kullanici_rolu: 'ADMIN',
      islem_tipi: 'PERSONEL_ISLEM',
      baslik: 'Personel Kaydı Silindi',
      detay: `"${target?.username || id}" kullanıcısı sistemden kalıcı olarak silindi.`,
    });

    return NextResponse.json({
      success: true,
      message: 'Personel kaydı silindi',
    });
  } catch (error: any) {
    console.error('Error deleting personnel:', error);
    return NextResponse.json({ success: false, error: 'Personel silinirken hata oluştu.' }, { status: 500 });
  }
}
