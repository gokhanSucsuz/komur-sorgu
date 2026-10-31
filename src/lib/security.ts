import crypto from 'crypto';
import { NextResponse } from 'next/server';

/**
 * Ortak güvenlik yardımcıları (KVKK / kurumsal güvenlik politikası).
 *
 * - İstemci IP adresi tespiti (yalnızca güvenilir proxy sayısı belirtilmişse X-Forwarded-For'a güvenilir)
 * - Girdi doğrulama (NoSQL operatör enjeksiyonu ve ReDoS'a karşı)
 * - Sunucu hatalarının istemciye SIZDIRILMADAN güvenli şekilde raporlanması
 */

// ============================================================================
// İstemci IP Adresi
// ============================================================================

/**
 * Kaç adet güvenilir ters proxy (Nginx, Cloudflare, Vercel vb.) uygulamanın önünde çalışıyor.
 * 0 (varsayılan): X-Forwarded-For başlığı İSTEMCİ TARAFINDAN SAHTELENEBİLİR kabul edilir ve kullanılmaz.
 * 1: Tek bir güvenilir proxy var; X-Forwarded-For listesinin SAĞDAN 1. değeri gerçek istemci IP'sidir.
 */
function getTrustedProxyHops(): number {
  const raw = Number.parseInt(process.env.TRUSTED_PROXY_HOPS || '0', 10);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(raw, 5);
}

function isPlausibleIp(value: string): boolean {
  if (!value || value.length > 45) return false;
  return /^[0-9a-fA-F:.]+$/.test(value);
}

/**
 * Güvenilir istemci IP adresini döndürür. Güvenilir proxy yapılandırılmamışsa 'bilinmiyor' döner
 * (böylece saldırgan sahte X-Forwarded-For ile hız sınırlamasını atlatamaz).
 */
export function getClientIp(request: { headers: Headers }): string {
  const hops = getTrustedProxyHops();
  if (hops === 0) return 'bilinmiyor';

  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
    const candidate = parts[parts.length - hops];
    if (candidate && isPlausibleIp(candidate)) return candidate;
  }

  const realIp = (request.headers.get('x-real-ip') || '').trim();
  if (realIp && isPlausibleIp(realIp)) return realIp;

  return 'bilinmiyor';
}

// ============================================================================
// Girdi Doğrulama
// ============================================================================

/** Düzenli ifadelerde kullanılacak kullanıcı girdisini kaçışlar (regex enjeksiyonu / ReDoS önlemi). */
export function escapeRegex(input: string): string {
  return String(input).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Değer string DEĞİLSE (ör. {"$ne": ""} gibi NoSQL operatör nesnesi) boş string döndürür.
 * Sonuç kırpılır ve maxLen ile sınırlandırılır.
 */
export function asString(value: unknown, maxLen: number = 200): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

/** Sayıyı [min, max] aralığına sıkıştırır; geçersizse varsayılanı döndürür. */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** MongoDB ObjectId (24 hex) / UUID / sayısal id biçimlerini kabul eden güvenli kimlik doğrulaması. */
export function isSafeId(value: unknown): value is string {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

// ============================================================================
// Güvenli Hata Yanıtı
// ============================================================================

/**
 * Sunucu hatasını yalnızca sunucu günlüğüne (referans kodu ile) yazar, istemciye ise
 * iç detay (MongoDB bağlantı bilgisi, yığın izi, kişisel veri parçası vb.) SIZDIRMADAN genel mesaj döner.
 */
export function serverError(context: string, err: unknown, status: number = 500): NextResponse {
  const ref = crypto.randomBytes(4).toString('hex').toUpperCase();
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${context}] ref=${ref}:`, message);
  return NextResponse.json(
    {
      success: false,
      code: 'SERVER_ERROR',
      error: `İşlem sırasında bir sunucu hatası oluştu. Sorun devam ederse sistem yöneticisine şu referans kodunu iletiniz: ${ref}`,
    },
    { status }
  );
}

/** Şablon JSON hata yanıtı. */
export function jsonError(error: string, status: number = 400, code?: string): NextResponse {
  return NextResponse.json({ success: false, ...(code ? { code } : {}), error }, { status });
}

// ============================================================================
// Parola Politikası
// ============================================================================

const WEAK_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '11111111', '00000000', 'password', 'parola123',
  'qwerty123', 'admin123', 'admin1234', 'sifre123', '87654321', 'abcd1234', 'edirne123', 'edirne1234',
  'edirne2026', 'edirne1960', 'sydv1234', 'komur123', 'komur1234',
]);

/**
 * Yeni belirlenen parola için kurumsal politika: en az 8 karakter, en fazla 128,
 * harf VE rakam içermeli, tek karakterin tekrarı / sık kullanılan zayıf parolalar olamaz.
 * Geçerliyse null, değilse Türkçe hata metni döndürür.
 */
export function validatePasswordPolicy(password: string, username?: string): string | null {
  if (typeof password !== 'string') return 'Geçersiz şifre.';
  const p = password.trim();
  if (p.length < 8) return 'Yeni şifre en az 8 karakter olmalıdır.';
  if (p.length > 128) return 'Yeni şifre en fazla 128 karakter olabilir.';
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(p) || !/\d/.test(p)) {
    return 'Yeni şifre en az bir harf ve en az bir rakam içermelidir.';
  }
  if (/^(.)\1+$/.test(p)) return 'Şifre tek bir karakterin tekrarından oluşamaz.';
  if (WEAK_PASSWORDS.has(p.toLowerCase())) return 'Seçtiğiniz şifre çok yaygın kullanılıyor; lütfen daha güçlü bir şifre belirleyiniz.';
  if (username && p.toLowerCase().includes(username.trim().toLowerCase()) && username.trim().length >= 3) {
    return 'Şifre kullanıcı adınızı içeremez.';
  }
  return null;
}

// ============================================================================
// Aynı Kaynak (CSRF) Doğrulaması
// ============================================================================

/**
 * Durum değiştiren (POST/PUT/PATCH/DELETE) isteklerde Origin / Sec-Fetch-Site başlıklarını doğrular.
 * Tarayıcılar bu başlıkları JS tarafından değiştirilemez şekilde ekler; farklı bir siteden
 * gelen (CSRF) istekler reddedilir. Başlık hiç yoksa (sunucu-sunucu / curl) çerezli tarayıcı isteği olmadığından izin verilir.
 */
export function isSameOriginRequest(request: { headers: Headers; nextUrl?: { host: string } }): boolean {
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite) {
    return secFetchSite === 'same-origin' || secFetchSite === 'none';
  }

  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl?.host || '';
      return originHost === host;
    } catch {
      return false;
    }
  }

  return true;
}

// ============================================================================
// KVKK Kör İndeks (Blind Index Hash) Temizleyici
// ============================================================================

const BLIND_HASH_KEYS = new Set([
  'tc_hash',
  'hane_hash',
  'adres_hash',
  'irsaliye_hash',
  'cakisan_tc_hash',
  'hedef_tc_hash',
]);

/**
 * API yanıtlarından deterministik HMAC-SHA256 kör indeks özetlerini (tc_hash, hane_hash, adres_hash vb.)
 * temizler; böylece istemciye yalnızca yetkili olduğu açık alanlar gider, veritabanı indeks özetleri dışarı sızmaz.
 */
export function stripBlindHashes<T>(input: T): T {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) {
    return input.map((item) => stripBlindHashes(item)) as unknown as T;
  }
  const cloned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (BLIND_HASH_KEYS.has(k)) continue;
    if (k === 'duraklar' && Array.isArray(v)) {
      cloned[k] = v.map((stop) => stripBlindHashes(stop));
    } else {
      cloned[k] = v;
    }
  }
  return cloned as T;
}

// ============================================================================
// Kayan Pencereli İstek Sınırlayıcı (Sliding-Window Rate Limiter)
// ============================================================================

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitEntry>();
let lastPurgeTime = Date.now();

/**
 * 60 saniyede bir eskiyen kayıtları temizleyerek bellek sızıntısını önler.
 */
function purgeExpiredRateLimits(windowMs: number) {
  const now = Date.now();
  if (now - lastPurgeTime < 60000) return;
  lastPurgeTime = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    const valid = entry.timestamps.filter((t) => now - t < windowMs);
    if (valid.length === 0) {
      rateLimitStore.delete(key);
    } else {
      entry.timestamps = valid;
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  clientKey: string;
}

/**
 * IP veya anahtar bazlı kayan pencere (sliding-window) hız sınırlaması.
 * @param key İstemci IP'si veya özel anahtar (örn: `auth:ip`, `export:ip`)
 * @param limit İzin verilen maksimum istek sayısı
 * @param windowSeconds Pencere süresi (saniye cinsinden)
 */
export function checkRateLimit(key: string, limit: number = 60, windowSeconds: number = 60): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  purgeExpiredRateLimits(windowMs);

  let entry = rateLimitStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(key, entry);
  }

  // Pencere dışındaki eski zaman damgalarını filtrele
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  const resetSeconds = entry.timestamps.length > 0
    ? Math.max(1, Math.ceil((entry.timestamps[0] + windowMs - now) / 1000))
    : windowSeconds;

  if (entry.timestamps.length >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetSeconds,
      clientKey: key,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - entry.timestamps.length),
    resetSeconds,
    clientKey: key,
  };
}

/**
 * Rate limit aşıldığında standart 429 Too Many Requests yanıtı döndürür.
 */
export function rateLimitExceededResponse(result: RateLimitResult, customMessage?: string): NextResponse {
  const message = customMessage || `Çok fazla istek gönderildi. Lütfen ${result.resetSeconds} saniye sonra tekrar deneyiniz.`;
  return NextResponse.json(
    {
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      error: message,
      retryAfter: result.resetSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.resetSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(result.resetSeconds),
      },
    }
  );
}


// ============================================================================
// KVKK Veri Maskeleme, Anonimleştirme ve Saklama Süresi Politikası (Madde 7)
// ============================================================================

/** Kurumsal sosyal yardım ve teslimat tutanakları için yasal saklama süresi (yıl). */
export const KVKK_RETENTION_YEARS = 10;

/** T.C. Kimlik Numarasını KVKK uyumlu maskeler (örn: 123*****901). */
export function maskTcNo(tc: string | null | undefined): string {
  const digits = String(tc ?? '').replace(/\D/g, '');
  if (digits.length < 5) return '***';
  return `${digits.slice(0, 3)}*****${digits.slice(-3)}`;
}

/** Telefon numarasını KVKK uyumlu maskeler (örn: 0555***4567). */
export function maskPhone(phone: string | null | undefined): string {
  const clean = String(phone ?? '').replace(/\s+/g, '');
  if (clean.length < 7) return '***';
  return `${clean.slice(0, 4)}***${clean.slice(-4)}`;
}

/** Ad ve soyadı KVKK uyumlu maskeler (örn: AH*** YI****). */
export function maskName(fullName: string | null | undefined): string {
  const parts = String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '***';
  return parts
    .map((p) => (p.length <= 2 ? `${p[0]}*` : `${p.slice(0, 2)}${'*'.repeat(Math.min(4, p.length - 2))}`))
    .join(' ');
}

/**
 * Kaydın oluşturulma/kapanış tarihinin yasal KVKK saklama süresini doldurup doldurmadığını kontrol eder.
 */
export function isRetentionExpired(dateInput: string | Date | null | undefined, retentionYears: number = KVKK_RETENTION_YEARS): boolean {
  if (!dateInput) return false;
  const ts = dateInput instanceof Date ? dateInput.getTime() : new Date(dateInput).getTime();
  if (!Number.isFinite(ts)) return false;
  const maxAgeMs = retentionYears * 365.25 * 24 * 60 * 60 * 1000;
  return Date.now() - ts > maxAgeMs;
}

/**
 * KVKK Madde 7 kapsamında hak sahibi kaydını geri döndürülemez biçimde anonimleştirir.
 * İstatistiksel bütünlük (mahalle, torba_sayisi, teslimat_durumu, donem_kodu) korunur;
 * tüm kişisel veriler ve kör indeks özetleri temizlenir.
 */
export function anonymizeBeneficiaryRecord<T extends Record<string, unknown>>(record: T): T {
  const cloned: Record<string, unknown> = { ...record };
  cloned.tc_no = 'ANONIM';
  cloned.tc_hash = null;
  cloned.ad_soyad = 'ANONİM HANE KAYDI (KVKK)';
  cloned.telefon = null;
  cloned.telefon2 = null;
  cloned.acik_adres = cloned.mahalle ? `${String(cloned.mahalle)} (KVKK Anonim)` : 'KVKK Anonim';
  cloned.hane_no = null;
  cloned.hane_hash = null;
  cloned.norm_adres = null;
  cloned.adres_hash = null;
  cloned.teslim_alan = cloned.teslim_alan ? 'ANONİM TESLİM ALAN' : null;
  cloned.teslimat_notu = null;
  cloned.uyari_notu = null;
  cloned.uyarilar = [];
  cloned.adres_guncelleme_notu = null;
  cloned.onceki_acik_adres = null;
  cloned.imza_listesi_acik_adres = null;
  cloned.kvkk_anonymized_at = new Date().toISOString();
  return cloned as T;
}


// ============================================================================
// Derin JSON Yükü Temizleyici (Prototype Pollution & NoSQL Operatör Güvenlik Duvarı)
// ============================================================================

const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Gelen JSON gövdelerini özyinelemeli (recursive) olarak temizler:
 * - `__proto__`, `constructor`, `prototype` anahtarlarını (Prototype Pollution) engeller.
 * - `$` ile başlayan veya `.` içeren anahtarları (NoSQL Operator Injection) temizler.
 * - Metinlerdeki null-byte (`\u0000`) karakterlerini siler ve derinlik sınırı (`maxDepth`) uygular.
 */
export function sanitizeJsonPayload<T>(payload: T, maxDepth: number = 8): T {
  function walk(val: unknown, depth: number): unknown {
    if (val === null || val === undefined) return val;
    if (typeof val === 'string') {
      return val.replace(/\0/g, '');
    }
    if (typeof val !== 'object') return val;
    if (depth > maxDepth) {
      throw new Error('Güvenlik duvarı: JSON nesne derinliği izin verilen sınırı aşıyor.');
    }
    if (Array.isArray(val)) {
      return val.map((item) => walk(item, depth + 1));
    }
    const cleanObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (FORBIDDEN_OBJECT_KEYS.has(k) || k.startsWith('$') || k.includes('.')) {
        continue;
      }
      cleanObj[k] = walk(v, depth + 1);
    }
    return cleanObj;
  }

  return walk(payload, 0) as T;
}

// ============================================================================
// Excel / CSV Formül Enjeksiyonu (DDE / Formula Injection) Koruması
// ============================================================================

/**
 * Excel veya CSV dışa/içe aktarımlarında `=`, `+`, `-`, `@`, `\t`, `\r` ile başlayan
 * metin hücrelerini (örn. `=cmd|...` veya `=HYPERLINK(...)`) etkisizleştirir.
 * Salt negatif sayılara dokunmaz.
 */
export function sanitizeSpreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/\0/g, '');
  if (str.length === 0) return '';
  if (/^[=+\-@]/.test(str) && !/^-[0-9]+(?:[.,][0-9]+)?$/.test(str)) {
    return `'${str}`;
  }
  if (/^[\t\r]/.test(str)) {
    return `'${str.trimStart()}`;
  }
  return str;
}
