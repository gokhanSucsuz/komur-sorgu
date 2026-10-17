import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDoc } from './mongodb';
import { timingSafeTokenEqual } from './crypto';

/**
 * Kurumsal Mutlak Oturum Süresi: 24 Saat (Milisaniye ve Saniye)
 */
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

export function isSessionExpired(lastLoginAt: string | null | undefined): boolean {
  if (!lastLoginAt) return false;
  const loginTimeMs = new Date(lastLoginAt).getTime();
  if (isNaN(loginTimeMs)) return false;
  return Date.now() - loginTimeMs > SESSION_MAX_AGE_MS;
}

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
 * Verifies active single-device session, 24h absolute session TTL, and role against MongoDB
 */
export async function verifySession(
  request: NextRequest,
  options: { requiredRole?: 'ADMIN' | 'PERSONEL' } = {}
): Promise<AuthSessionResult> {
  const token = extractSessionToken(request);

  if (!token || typeof token !== 'string' || token.length < 32 || !/^[a-f0-9-]+$/i.test(token)) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          success: false,
          code: 'UNAUTHORIZED',
          error: 'Oturum bilgisi bulunamadı veya geçersiz. Lütfen sisteme giriş yapınız.',
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

    if (!rawUser || !rawUser.active_session_token || !timingSafeTokenEqual(rawUser.active_session_token, token)) {
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

    // Enforce 24-hour institutional absolute session TTL
    if (isSessionExpired(rawUser.last_login_at)) {
      await usersCol.updateOne(
        { _id: rawUser._id },
        { $set: { active_session_token: null } }
      );
      return {
        valid: false,
        response: NextResponse.json(
          {
            success: false,
            code: 'SESSION_TERMINATED',
            error: 'Kurumsal güvenlik politikası gereği 24 saatlik oturum süreniz dolmuştur. Lütfen tekrar giriş yapınız.',
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
 * Strip sensitive credentials, TOTP secrets, and tokens before sending user object to client
 */
export function sanitizeUser(user: any): any {
  if (!user) return user;
  const safe = { ...user };
  safe.totp_enabled = Boolean(user.totp_enabled);
  delete safe.sifre;
  delete safe.sifre_hash;
  delete safe.active_session_token;
  delete safe.last_ip;
  delete safe.last_device;
  delete safe.totp_secret;
  delete safe.totp_pending_secret;
  delete safe.totp_recovery_codes;
  return safe;
}

// ============================================================================
// MongoDB-Backed Distributed Brute-Force Rate Limiter (Multi-Instance Safe)
// ============================================================================

export async function checkDistributedRateLimit(rateKey: string): Promise<{ locked: boolean; waitSeconds: number }> {
  try {
    const { securityRateLimits } = await getDbCollections();
    const record = await securityRateLimits.findOne({ key: rateKey });
    const nowMs = Date.now();
    if (record && record.locked_until && record.locked_until > nowMs) {
      return {
        locked: true,
        waitSeconds: Math.ceil((record.locked_until - nowMs) / 1000),
      };
    }
    return { locked: false, waitSeconds: 0 };
  } catch {
    return { locked: false, waitSeconds: 0 };
  }
}

export async function recordDistributedFailedAttempt(
  rateKey: string,
  maxAttempts: number = 5,
  windowMs: number = 10 * 60 * 1000,
  lockDurationMs: number = 5 * 60 * 1000
): Promise<{ count: number; locked: boolean; waitSeconds: number }> {
  try {
    const { securityRateLimits } = await getDbCollections();
    const nowMs = Date.now();
    const existing = await securityRateLimits.findOne({ key: rateKey });

    const prevCount =
      existing && existing.first_attempt_at && nowMs - existing.first_attempt_at < windowMs
        ? Number(existing.count || 0)
        : 0;
    const nextCount = prevCount + 1;
    const firstAttemptAt = prevCount === 0 ? nowMs : existing.first_attempt_at;
    const lockedUntil = nextCount >= maxAttempts ? nowMs + lockDurationMs : 0;
    const expiresAt = new Date(nowMs + Math.max(windowMs, lockDurationMs) + 60 * 1000);

    await securityRateLimits.updateOne(
      { key: rateKey },
      {
        $set: {
          key: rateKey,
          count: nextCount,
          first_attempt_at: firstAttemptAt,
          locked_until: lockedUntil,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    return {
      count: nextCount,
      locked: lockedUntil > nowMs,
      waitSeconds: lockedUntil > nowMs ? Math.ceil((lockedUntil - nowMs) / 1000) : 0,
    };
  } catch {
    return { count: 1, locked: false, waitSeconds: 0 };
  }
}

export async function clearDistributedRateLimit(rateKey: string): Promise<void> {
  try {
    const { securityRateLimits } = await getDbCollections();
    await securityRateLimits.deleteOne({ key: rateKey });
  } catch {
    // ignore
  }
}

