import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, mapDoc } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const { users: usersCol } = await getDbCollections();
    
    // Return all active staff members for login screen
    const rawUsers = await usersCol
      .find({ aktif: 1 })
      .sort({ rol: 1, ad_soyad: 1 })
      .toArray();

    const users = mapDocs(rawUsers);

    return NextResponse.json({
      success: true,
      users,
      personnel: users.filter((u: any) => u.rol === 'PERSONEL'),
      admins: users.filter((u: any) => u.rol === 'ADMIN'),
    });
  } catch (error: any) {
    console.error('Error fetching auth users:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { users: usersCol } = await getDbCollections();
    const body = await request.json();
    const { username, password, role } = body;

    const trimmedUser = (username || '').trim();
    const trimmedPass = (password || '').trim();

    if (!trimmedPass) {
      return NextResponse.json({ success: false, error: 'Lütfen şifre / PIN giriniz' }, { status: 400 });
    }

    // 1. Direct query in MongoDB (case-insensitive username or ad_soyad)
    const escapedUser = trimmedUser.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const userRegex = new RegExp(`^${escapedUser}$`, 'i');

    let rawUser = await usersCol.findOne({
      $or: [{ username: userRegex }, { ad_soyad: userRegex }],
      aktif: 1,
    });

    if (rawUser) {
      const decUser = mapDoc(rawUser);
      if (decUser.sifre !== trimmedPass && rawUser.sifre !== trimmedPass) {
        rawUser = null;
      }
    }

    if (!rawUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'Hatalı kullanıcı adı veya şifre / PIN! Lütfen tekrar deneyiniz.',
        },
        { status: 401 }
      );
    }

    const user = mapDoc(rawUser);

    return NextResponse.json({
      success: true,
      message: 'Giriş başarılı',
      user: {
        id: user.id,
        username: user.username,
        ad_soyad: user.ad_soyad,
        rol: user.rol,
        telefon: user.telefon,
      },
    });
  } catch (error: any) {
    console.error('Error during login:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
