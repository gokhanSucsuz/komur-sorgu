import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDbCollections, mapDoc } from './mongodb';
import { timingSafeTokenEqual } from './crypto';
import { isSameOriginRequest, checkRateLimit, rateLimitExceededResponse } from './security';
import type { AppRole, UserRecord } from '@/types';

/**
 * Kurumsal Mutlak Oturum Süresi: 6 Saat (Milisaniye ve Saniye)
 * Hareketsizlik (Idle) Zaman Aşımı: 60 Dakika
 */
export const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const SESSION_MAX_AGE_SECONDS = 6 * 60 * 60;
export const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;

export function isSessionExpired(lastLoginAt: string | null | undefined): boolean {
  if (!lastLoginAt) return false;
  const loginTimeMs = new Date(lastLoginAt).getTime();
  if (isNaN(loginTimeMs)) return false;
  return Date.now() - loginTimeMs > SESSION_MAX_AGE_MS;
}

export function isSessionIdleExpired(lastActivityAt: string | null | undefined): boolean {
  if (!lastActivityAt) return false;
  const activityTimeMs = new Date(lastActivityAt).getTime();
  if (isNaN(activityTimeMs)) return false;
  return Date.now() - activityTimeMs > SESSION_IDLE_TIMEOUT_MS;
}

/**
 * Oturum çalınmasına (Session Hijacking / Cookie Replay) karşı istemci User-Agent bağlam özeti üretir.
 */
export function computeSessionContextHash(request: NextRequest | { headers: { get(name: string): string | null } }): string {
  const ua = (request.headers.get('user-agent') || '').trim().slice(0, 300);
  return crypto.createHash('sha256').update('komur-session-ua-v1:' + ua).digest('hex');
}

/** requiredRole verilmemişse her oturum açmış rol geçer; verilmişse rol listede olmalıdır. */
export function roleAllowed(userRole: string | undefined, required?: AppRole | AppRole[]): boolean {
  if (!required) return true;
  const list = Array.isArray(required) ? required : [required];
  return list.includes(userRole as AppRole);
}

/**
 * REQUIRE_PRIVILEGED_2FA=true iken 2FA'sı olmayan ADMIN/MUDUR oturumları yalnızca /api/auth
 * (2FA kurulumu) uç noktasını kullanabilir; diğer tüm API'ler 403 döner.
 */
function twoFactorBlock(user: UserRecord, request: NextRequest): NextResponse | null {
  if (process.env.REQUIRE_PRIVILEGED_2FA !== 'true') return null;
  if (user.rol !== 'ADMIN' && user.rol !== 'MUDUR') return null;
  if (user.totp_enabled) return null;
  if (request.nextUrl.pathname.startsWith('/api/auth')) return null;
  return NextResponse.json(
    {
      success: false,
      code: 'TWO_FACTOR_SETUP_REQUIRED',
      error: 'Güvenlik politikası gereği yönetici ve müdür hesapları için Google Authenticator (2FA) kurulumu zorunludur.',
    },
    { status: 403 }
  );
}

/**
 * MUDUR rolü kurumsal olarak salt okunur (izleme ve raporlama) yetkisine sahiptir.
 * Kendi oturum/şifre/2FA işlemleri (/api/auth) dışında hiçbir veri değiştirme (POST/PUT/PATCH/DELETE) işlemi yapamaz.
 */
function mudurWriteBlock(user: UserRecord, request: NextRequest, method: string): NextResponse | null {
  if (user.rol !== 'MUDUR') return null;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
  if (request.nextUrl.pathname.startsWith('/api/auth')) return null;
  return NextResponse.json(
    {
      success: false,
      code: 'READ_ONLY_ROLE',
      error: 'Müdür yetkilisi hesabı salt okunur (izleme ve raporlama) yetkisine sahiptir; veri ekleme, güncelleme veya silme işlemi yapamaz.',
    },
    { status: 403 }
  );
}

export type AuthSessionResult =
  | {
      valid: true;
      user: UserRecord;
      response?: undefined;
      id: string;
      username: string;
      ad_soyad?: string;
      rol: AppRole;
    }
  | {
      valid: false;
      user?: undefined;
      response: NextResponse;
      id?: undefined;
      username?: undefined;
      ad_soyad?: undefined;
      rol?: undefined;
    };

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

const SESSION_MICRO_CACHE_TTL_MS = 4000;
const sessionMicroCache = new Map<string, { expiresAt: number; user: UserRecord }>();

export function clearSessionMicroCache(token?: string) {
  if (token) {
    sessionMicroCache.delete(token);
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    sessionMicroCache.delete(hash);
  } else {
    sessionMicroCache.clear();
  }
}

/**
 * Verifies active single-device session, 6h absolute session TTL, and role against MongoDB
 */
export async function verifySession(
  request: NextRequest,
  options: { requiredRole?: AppRole | AppRole[] } = {}
): Promise<AuthSessionResult> {
  // Enforce Same-Origin (CSRF) protection on state-changing HTTP methods
  const method = (request.method || 'GET').toUpperCase();
  if (
    (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') &&
    !isSameOriginRequest(request)
  ) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          success: false,
          code: 'CSRF_REJECTED',
          error: 'Güvenlik doğrulaması başarısız: Farklı kaynaktan (Cross-Origin) gelen işlem isteği reddedildi.',
        },
        { status: 403 }
      ),
    };
  }

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

  // Check 4-second micro-cache to prevent 6x redundant MongoDB user queries on parallel API bursts
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const nowMs = Date.now();

  // Oturum basina genel API hiz siniri (yazma islemleri daha siki). Tum rotalari kapsar.
  const isWrite = method !== 'GET' && method !== 'HEAD';
  const apiLimit = checkRateLimit('api:' + (isWrite ? 'w' : 'r') + ':' + tokenHash, isWrite ? 120 : 600, 60);
  if (!apiLimit.allowed) {
    return { valid: false, response: rateLimitExceededResponse(apiLimit) };
  }

  const cached = sessionMicroCache.get(tokenHash);
  if (cached && cached.expiresAt > nowMs) {
    const user = cached.user;
    if (user.session_ua_hash && !timingSafeTokenEqual(user.session_ua_hash, computeSessionContextHash(request))) {
      sessionMicroCache.delete(tokenHash);
      return {
        valid: false,
        response: NextResponse.json(
          {
            success: false,
            code: 'SESSION_TERMINATED',
            error: 'Güvenlik ihlali tespiti: Oturum bağlamı değiştiği için oturumunuz sonlandırıldı.',
          },
          { status: 401 }
        ),
      };
    }
    const tfBlock = twoFactorBlock(user, request);
    if (tfBlock) return { valid: false, response: tfBlock };
    const mwBlock = mudurWriteBlock(user, request, method);
    if (mwBlock) return { valid: false, response: mwBlock };
    if (!roleAllowed(user.rol, options.requiredRole)) {
      return {
        valid: false,
        response: NextResponse.json(
          {
            success: false,
            code: 'FORBIDDEN',
            error: 'Bu işlem için gerekli yetkiye sahip değilsiniz.',
          },
          { status: 403 }
        ),
      };
    }
    return {
      valid: true,
      user,
      id: user.id || (user._id ? String(user._id) : ''),
      username: user.username,
      ad_soyad: user.ad_soyad || undefined,
      rol: user.rol,
    };
  }

  try {
    const { users: usersCol } = await getDbCollections();
    const rawUser = await usersCol.findOne({
      active_session_token: tokenHash,
      aktif: 1,
    });

    const isTokenMatch =
      Boolean(rawUser?.active_session_token) &&
      timingSafeTokenEqual(rawUser.active_session_token, tokenHash);

    if (!rawUser || !isTokenMatch) {
      sessionMicroCache.delete(tokenHash);
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

    // Enforce 6-hour institutional absolute session TTL & 60-minute idle timeout
    if (isSessionExpired(rawUser.last_login_at) || isSessionIdleExpired(rawUser.last_activity_at)) {
      sessionMicroCache.delete(tokenHash);
      await usersCol.updateOne(
        { _id: rawUser._id },
        { $set: { active_session_token: null, session_ua_hash: null } }
      );
      return {
        valid: false,
        response: NextResponse.json(
          {
            success: false,
            code: 'SESSION_TERMINATED',
            error: 'Kurumsal güvenlik politikası gereği oturum süreniz (6 saat mutlak / 60 dk hareketsizlik) dolmuştur. Lütfen tekrar giriş yapınız.',
          },
          { status: 401 }
        ),
      };
    }

    // Zero-Trust Session Context Binding: prevent stolen cookie replay across different browsers/OS/CLI tools
    const currentUaHash = computeSessionContextHash(request);
    if (rawUser.session_ua_hash && !timingSafeTokenEqual(rawUser.session_ua_hash, currentUaHash)) {
      sessionMicroCache.delete(tokenHash);
      await usersCol.updateOne(
        { _id: rawUser._id },
        { $set: { active_session_token: null, session_ua_hash: null } }
      );
      return {
        valid: false,
        response: NextResponse.json(
          {
            success: false,
            code: 'SESSION_TERMINATED',
            error: 'Güvenlik ihlali tespiti: Oturum bağlamı (tarayıcı/cihaz imzası) değiştiği için oturumunuz sonlandırıldı.',
          },
          { status: 401 }
        ),
      };
    }

    // Throttled sliding activity timestamp update (at most once every 2 minutes)
    const lastActMs = rawUser.last_activity_at ? new Date(rawUser.last_activity_at).getTime() : 0;
    if (!lastActMs || isNaN(lastActMs) || nowMs - lastActMs > 2 * 60 * 1000) {
      const nowIsoStr = new Date(nowMs).toISOString();
      rawUser.last_activity_at = nowIsoStr;
      usersCol.updateOne({ _id: rawUser._id }, { $set: { last_activity_at: nowIsoStr } }).catch(() => {});
    }

    const user = mapDoc<UserRecord>(rawUser);
    sessionMicroCache.set(tokenHash, { expiresAt: Date.now() + SESSION_MICRO_CACHE_TTL_MS, user });

    const tfBlock = twoFactorBlock(user, request);
    if (tfBlock) return { valid: false, response: tfBlock };
    const mwBlock = mudurWriteBlock(user, request, method);
    if (mwBlock) return { valid: false, response: mwBlock };
    if (!roleAllowed(user.rol, options.requiredRole)) {
      return {
        valid: false,
        response: NextResponse.json(
          {
            success: false,
            code: 'FORBIDDEN',
            error: 'Bu işlem için gerekli yetkiye sahip değilsiniz.',
          },
          { status: 403 }
        ),
      };
    }

    return {
      valid: true,
      user,
      id: user.id || (user._id ? String(user._id) : ''),
      username: user.username,
      ad_soyad: user.ad_soyad || undefined,
      rol: user.rol,
    };
  } catch (err: unknown) {
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
export function sanitizeUser<T extends Record<string, unknown> | null | undefined>(user: T): T {
  if (!user) return user;
  const safe: Record<string, unknown> = { ...user };
  safe.totp_enabled = Boolean(user.totp_enabled);
  delete safe.sifre;
  delete safe.sifre_hash;
  delete safe.active_session_token;
  delete safe.session_ua_hash;
  delete safe.last_activity_at;
  delete safe.last_ip;
  delete safe.last_device;
  delete safe.totp_secret;
  delete safe.totp_pending_secret;
  delete safe.totp_recovery_codes;
  delete safe.totp_device_graces;
  return safe as T;
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
    // Fail-closed: hiz siniri deposuna ulasilamiyorsa brute-force korumasi devre disi kalmamali.
    console.error('[Auth] Rate-limit store unavailable; failing closed.');
    return { locked: true, waitSeconds: 30 };
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
