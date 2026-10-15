import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDoc } from './mongodb';

export interface AuthSessionResult {
  valid: boolean;
  user?: any;
  response?: NextResponse;
  id?: string;
  username?: string;
  ad_soyad?: string;
  rol?: 'ADMIN' | 'PERSONEL';
}

/**
 * Extracts session token from incoming request (Header, Bearer, or Cookie)
 */
export function extractSessionToken(request: NextRequest): string {
  const headerToken = request.headers.get('x-session-token');
  if (headerToken && headerToken.trim()) return headerToken.trim();

  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  const cookieToken = request.cookies.get('komur_session_token')?.value;
  if (cookieToken && cookieToken.trim()) return cookieToken.trim();

  return '';
}

/**
 * Verifies active single-device session and role against MongoDB
 */
export async function verifySession(
  request: NextRequest,
  options: { requiredRole?: 'ADMIN' | 'PERSONEL' } = {}
): Promise<AuthSessionResult> {
  const token = extractSessionToken(request);

  if (!token) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          success: false,
          code: 'UNAUTHORIZED',
          error: 'Oturum bilgisi bulunamadı. Lütfen sisteme giriş yapınız.',
        },
        { status: 401 }
      ),
    };
  }

  try {
    const { users: usersCol } = await getDbCollections();
    const rawUser = await usersCol.findOne({
      active_session_token: token,
      aktif: 1,
    });

    if (!rawUser) {
      return {
        valid: false,
        response: NextResponse.json(
          {
            success: false,
            code: 'SESSION_TERMINATED',
            error: 'Oturumunuz sonlandırılmış veya başka bir cihazdan giriş yapılmıştır.',
          },
          { status: 401 }
        ),
      };
    }

    const user = mapDoc(rawUser);

    if (options.requiredRole && options.requiredRole === 'ADMIN' && user.rol !== 'ADMIN') {
      return {
        valid: false,
        response: NextResponse.json(
          {
            success: false,
            code: 'FORBIDDEN',
            error: 'Bu işlem için Sistem Yöneticisi (ADMIN) yetkisi gereklidir.',
          },
          { status: 403 }
        ),
      };
    }

    return {
      valid: true,
      user,
      id: user.id || (user._id ? user._id.toString() : ''),
      username: user.username,
      ad_soyad: user.ad_soyad,
      rol: user.rol,
    };
  } catch (err: any) {
    console.error('[Auth] verifySession error:', err);
    return {
      valid: false,
      response: NextResponse.json(
        {
          success: false,
          code: 'AUTH_ERROR',
          error: 'Yetkilendirme doğrulanırken sunucu hatası oluştu.',
        },
        { status: 500 }
      ),
    };
  }
}

/**
 * Strip sensitive credentials and tokens before sending user object to client
 */
export function sanitizeUser(user: any): any {
  if (!user) return user;
  const safe = { ...user };
  delete safe.sifre;
  delete safe.sifre_hash;
  delete safe.active_session_token;
  delete safe.last_ip;
  delete safe.last_device;
  return safe;
}
