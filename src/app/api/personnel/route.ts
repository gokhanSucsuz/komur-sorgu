import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, buildIdFilter, recordActivityLog } from '@/lib/mongodb';
import { encryptUser, encryptField } from '@/lib/crypto';

export async function GET(request: NextRequest) {
  try {
    const { users: usersCol } = await getDbCollections();
    const rawUsers = await usersCol
      .find({})
      .sort({ rol: 1, ad_soyad: 1 })
      .toArray();

    const users = mapDocs(rawUsers);

    return NextResponse.json({
      success: true,
      users,
      total: users.length,
    });
  } catch (error: any) {
    console.error('Error fetching personnel:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { users: usersCol } = await getDbCollections();
    const body = await request.json();
    const { username, ad_soyad, rol, sifre, telefon, callerRole } = body;
    const reqRole = request.headers.get('x-user-role') || callerRole;
    if (reqRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Yetkisiz erişim! Personel kayıt işlemlerini sadece Yönetici yapabilir.' }, { status: 403 });
    }

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
      telefon: (telefon || '').trim(),
      aktif: 1,
      created_at: new Date().toLocaleString('tr-TR'),
    };

    // Encrypt sensitive personnel info with AES-256-GCM
    const encryptedDoc = encryptUser(newDoc);
    const result = await usersCol.insertOne(encryptedDoc);
    const newId = result.insertedId ? result.insertedId.toString() : '';

    await recordActivityLog({
      kullanici_adi: 'Sistem Yöneticisi',
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
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { users: usersCol } = await getDbCollections();
    const body = await request.json();
    const { id, username, ad_soyad, rol, sifre, telefon, aktif, callerRole } = body;
    const reqRole = request.headers.get('x-user-role') || callerRole;
    if (reqRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Yetkisiz erişim! Personel düzenleme işlemlerini sadece Yönetici yapabilir.' }, { status: 403 });
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'Personel ID zorunludur' }, { status: 400 });
    }

    const trimmedUser = (username || '').trim().toLowerCase();
    const trimmedName = (ad_soyad || '').trim();
    const trimmedPass = (sifre || '').trim();
    const trimmedRole = rol === 'ADMIN' ? 'ADMIN' : 'PERSONEL';

    // Prevent demoting an admin account to personnel: "yönetici de kendini normal personel olarak kaydedemez"
    const targetUser = await usersCol.findOne(buildIdFilter(id));
    if (targetUser && targetUser.rol === 'ADMIN' && trimmedRole === 'PERSONEL') {
      return NextResponse.json(
        {
          success: false,
          error: 'Güvenlik kuralı: Bir Yönetici (Admin) hesabı normal personele düşürülemez!',
        },
        { status: 400 }
      );
    }

    const isActive = aktif === 0 ? 0 : 1;

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
      updated_at: new Date().toLocaleString('tr-TR'),
    };

    if (trimmedUser) updateFields.username = trimmedUser;
    if (trimmedName) updateFields.ad_soyad = encryptField(trimmedName);
    if (trimmedPass) updateFields.sifre = encryptField(trimmedPass);
    if (telefon !== undefined) updateFields.telefon = encryptField((telefon || '').trim());

    await usersCol.updateOne(buildIdFilter(id), { $set: updateFields });

    await recordActivityLog({
      kullanici_adi: 'Sistem Yöneticisi',
      kullanici_rolu: 'ADMIN',
      islem_tipi: 'PERSONEL_ISLEM',
      baslik: 'Personel Bilgileri Güncellendi',
      detay: `Personel "${trimmedName || id}" bilgileri güncellendi.`,
      ek_bilgi: { id, username: trimmedUser, rol: trimmedRole },
    });

    return NextResponse.json({
      success: true,
      message: 'Personel bilgileri ve şifresi başarıyla güncellendi',
    });
  } catch (error: any) {
    console.error('Error updating personnel:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { users: usersCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const reqRole = request.headers.get('x-user-role') || searchParams.get('callerRole');
    if (reqRole && reqRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Yetkisiz erişim! Personel silme işlemlerini sadece Yönetici yapabilir.' }, { status: 403 });
    }

    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Personel ID zorunludur' }, { status: 400 });
    }

    // Prevent deleting the last Admin
    const target = await usersCol.findOne(buildIdFilter(id));
    if (target && target.rol === 'ADMIN') {
      const adminCount = await usersCol.countDocuments({ rol: 'ADMIN' });
      if (adminCount <= 1) {
        return NextResponse.json(
          {
            success: false,
            error: 'Sistemdeki tek yönetici silinemez!',
          },
          { status: 400 }
        );
      }
    }

    await usersCol.deleteOne(buildIdFilter(id));

    return NextResponse.json({
      success: true,
      message: 'Personel kaydı silindi',
    });
  } catch (error: any) {
    console.error('Error deleting personnel:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
