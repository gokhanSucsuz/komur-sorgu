import crypto from 'crypto';
import { cleanTcNo, cleanHaneKey, normalizeAddress } from './normalizer';

/**
 * ASKERİ / BANKACILIK DÜZEYİ ALAN BAZLI ŞİFRELEME (FIELD-LEVEL ENCRYPTION)
 * Algoritma: AES-256-GCM (Authenticated Encryption with Associated Data - AEAD)
 * - 256-bit Kriptografik Anahtar
 * - Her işlem için 96-bit (12 byte) Kriptografik Rastgele IV (Initialization Vector)
 * - 128-bit (16 byte) Kimlik Doğrulama Etiketi (Authentication Tag)
 * - Arama ve Tekillik Kontrolleri için Deterministik Kör Dizin (Blind Index - HMAC-SHA256)
 *
 * Veritabanı (MongoDB Atlas) çalınsa, sızdırılsa veya dump edilse dahi
 * saldırgan sadece anlamsız rastgele hex dizileri (ENC:GCM:v1:...) görür.
 * Çalan kişinin elinde anahtar olmadan kişisel verilere (TC, İsim, Adres, Telefon vb.)
 * erişmesi matematiksel olarak imkansızdır.
 */

/**
 * ANAHTAR YÖNETİMİ (Fail-Closed)
 *
 * Şifreleme anahtarları ASLA kaynak kodda bulunmaz; yalnızca ortam değişkenlerinden okunur:
 *  - ENCRYPTION_MASTER_KEY : 64 karakter hex (256-bit) AES-GCM anahtarı
 *  - BLIND_INDEX_KEY       : 64 karakter hex (256-bit) HMAC-SHA256 kör dizin anahtarı
 *  - ENCRYPTION_MASTER_KEY_PREVIOUS (opsiyonel): anahtar rotasyonu sırasında eski anahtar (yalnızca çözme için)
 *
 * Anahtar tanımlı değilse uygulama sessizce varsayılan bir anahtara DÖNMEZ; işlem hata ile durdurulur.
 * Tek istisna: geliştirme ortamında (NODE_ENV!=='production') VE gerçek veritabanı bağlantısı yokken
 * (bellek içi geçici mod) süreç ömürlü rastgele anahtar üretilir.
 *
 * Anahtar üretmek için:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

/**
 * Daha önce kaynak kodda yayımlanmış (dolayısıyla ele geçirilmiş kabul edilen) anahtarların parmak izleri.
 * Anahtarların kendisi tutulmaz; yalnızca SHA-256 parmak izi saklanır.
 */
const COMPROMISED_KEY_FINGERPRINTS = new Set<string>([
  'eec7d445b75b1389a623a4309f693d8b749541b684e5af228f1e4dd46f5e0e7c',
  'a360aac9bdffa1cf89ad96b8f0d07c364d36ce918dcb68ad7afde93874c421eb',
]);

const ephemeralKeys = new Map<string, Buffer>();
const warnedCompromised = new Set<string>();

function keyFingerprint(rawKey: string): string {
  return crypto.createHash('sha256').update('komur-key-fingerprint:' + rawKey).digest('hex');
}

function parseKeyMaterial(name: string, rawValue: string): Buffer {
  const value = rawValue.trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, 'hex');
  }
  if (value.length >= 32) {
    // Geriye dönük uyumluluk: uzun parola benzeri değer SHA-256 ile 256-bit anahtara türetilir.
    return crypto.createHash('sha256').update(value).digest();
  }
  throw new Error(
    `[Güvenlik] ${name} geçersiz: 64 karakterlik hex (256-bit) bir anahtar olmalıdır. ` +
      `Üretmek için: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  );
}

function resolveRequiredKey(name: 'ENCRYPTION_MASTER_KEY' | 'BLIND_INDEX_KEY'): Buffer {
  const raw = process.env[name];

  if (!raw || !raw.trim()) {
    const isEphemeralDevMode = process.env.NODE_ENV !== 'production' && !(process.env.MONGODB_URI || '').trim();
    if (isEphemeralDevMode) {
      let eph = ephemeralKeys.get(name);
      if (!eph) {
        eph = crypto.randomBytes(32);
        ephemeralKeys.set(name, eph);
        console.warn(`[Güvenlik] ${name} tanımlı değil; geçici bellek içi geliştirme modu için rastgele anahtar üretildi.`);
      }
      return eph;
    }
    throw new Error(
      `[Güvenlik] ${name} ortam değişkeni tanımlı değil. Kişisel verilerin korunması için sistem varsayılan anahtarla ÇALIŞTIRILMAZ.`
    );
  }

  const fp = keyFingerprint(raw.trim());
  if (COMPROMISED_KEY_FINGERPRINTS.has(fp)) {
    if (process.env.ALLOW_COMPROMISED_KEYS !== 'true') {
      throw new Error(
        `[GÜVENLİK - KRİTİK] ${name} değeri daha önce ifşa olmuş (compromised) bir anahtardır! ` +
          'Sistem güvenliği gereği bu anahtarla çalışılması engellenmiştir. Yeni 256-bit anahtar kullanınız.'
      );
    }
    if (!warnedCompromised.has(name)) {
      warnedCompromised.add(name);
      console.error(`[GÜVENLİK - UYARI] ${name} geçici rotasyon modunda çalışıyor.`);
    }
  }

  return parseKeyMaterial(name, raw);
}

function getMasterKeyBuffer(): Buffer {
  return resolveRequiredKey('ENCRYPTION_MASTER_KEY');
}

/** Rotasyon sırasında yalnızca ÇÖZME için kullanılan eski ana anahtar (varsa). */
function getPreviousMasterKeyBuffer(): Buffer | null {
  const raw = process.env.ENCRYPTION_MASTER_KEY_PREVIOUS;
  if (!raw || !raw.trim()) return null;
  return parseKeyMaterial('ENCRYPTION_MASTER_KEY_PREVIOUS', raw);
}

function getBlindIndexKeyBuffer(): Buffer {
  return resolveRequiredKey('BLIND_INDEX_KEY');
}

const PREFIX = 'ENC:GCM:v1:';

/**
 * Checks if a string is already encrypted with AES-256-GCM
 */
export function isEncrypted(val: any): boolean {
  return typeof val === 'string' && val.startsWith(PREFIX);
}

/**
 * Encrypt a single text field using AES-256-GCM.
 * Each encryption uses a unique, cryptographically random 12-byte IV.
 * Format: ENC:GCM:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
export function encryptField(plaintext: string | null | undefined): string | null | undefined {
  if (plaintext === null || plaintext === undefined) return plaintext;
  const str = String(plaintext);
  if (str.length === 0) return '';
  if (isEncrypted(str)) return str;

  try {
    const key = getMasterKeyBuffer();
    const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let ciphertext = cipher.update(str, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex'); // 128-bit authentication tag

    return `${PREFIX}${iv.toString('hex')}:${authTag}:${ciphertext}`;
  } catch (err) {
    console.error('[Crypto] Encryption error:', err);
    throw new Error('Veri şifreleme hatası');
  }
}

/**
 * Decrypt a single AES-256-GCM ciphertext.
 * Backward compatible: if the value is not encrypted, returns it as-is.
 */
const DECRYPT_CACHE_MAX_SIZE = 6000;
const decryptionCache = new Map<string, string>();
let lastCacheKeyFingerprint = '';

export function clearDecryptionCache(): void {
  decryptionCache.clear();
}

const MAX_ENCRYPTED_FIELD_LENGTH = 65536;

export function decryptField(ciphertext: string | null | undefined): string | null | undefined {
  if (ciphertext === null || ciphertext === undefined) return ciphertext;
  const str = String(ciphertext);
  if (str.length === 0) return '';
  if (!isEncrypted(str)) return str; // Legacy unencrypted string, return as-is
  if (str.length > MAX_ENCRYPTED_FIELD_LENGTH) {
    console.warn('[Crypto] Ciphertext exceeds maximum allowed length');
    return '***[ŞİFRELİ VERİ DEŞİFRE EDİLEMEDİ]***';
  }

  try {
    const primaryKey = getMasterKeyBuffer();
    const previousKey = getPreviousMasterKeyBuffer();
    const keyTag =
      primaryKey.subarray(0, 8).toString('hex') +
      (previousKey ? ':' + previousKey.subarray(0, 4).toString('hex') : '');
    if (keyTag !== lastCacheKeyFingerprint) {
      decryptionCache.clear();
      lastCacheKeyFingerprint = keyTag;
    }

    const cached = decryptionCache.get(str);
    if (cached !== undefined) {
      return cached;
    }

    const parts = str.slice(PREFIX.length).split(':');
    if (parts.length !== 3) {
      console.warn('[Crypto] Invalid ciphertext format');
      return '***[ŞİFRELİ VERİ DEŞİFRE EDİLEMEDİ]***';
    }

    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    if (iv.length !== 12 || authTag.length !== 16) {
      console.warn('[Crypto] Invalid IV/tag length');
      return '***[ŞİFRELİ VERİ DEŞİFRE EDİLEMEDİ]***';
    }

    const candidateKeys: Buffer[] = [primaryKey];
    if (previousKey) candidateKeys.push(previousKey);

    let lastErr: unknown = null;
    for (const key of candidateKeys) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        if (decryptionCache.size >= DECRYPT_CACHE_MAX_SIZE) {
          const oldestKey = decryptionCache.keys().next().value;
          if (oldestKey !== undefined) decryptionCache.delete(oldestKey);
        }
        decryptionCache.set(str, decrypted);
        return decrypted;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  } catch (err) {
    console.error('[Crypto] Decryption error (possible tampering or invalid key):', err instanceof Error ? err.message : 'unknown');
    return '***[ŞİFRELİ VERİ DEŞİFRE EDİLEMEDİ]***';
  }
}

/**
 * Compute a deterministic HMAC-SHA256 blind index hash for exact equality searches
 * (e.g., finding by TC, checking duplicate household, checking normalized address).
 */
export function hashBlindIndex(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str.length === 0) return null;

  const key = getBlindIndexKeyBuffer();
  return crypto.createHmac('sha256', key).update(str).digest('hex');
}

/**
 * Compute Blind Index for TC Kimlik No
 */
export function hashTc(tc: string | null | undefined): string | null {
  if (!tc) return null;
  const clean = cleanTcNo(tc);
  if (!clean) return null;
  return hashBlindIndex(clean);
}

/**
 * Compute Blind Index for Hane No
 */
export function hashHane(hane: string | null | undefined): string | null {
  if (!hane) return null;
  const clean = cleanHaneKey(hane);
  if (!clean) return null;
  return hashBlindIndex(clean);
}

/**
 * Compute Blind Index for Normalized Address
 */
export function hashAddress(normAdres: string | null | undefined): string | null {
  if (!normAdres) return null;
  const trimmed = normAdres.trim();
  if (!trimmed) return null;
  return hashBlindIndex(trimmed);
}

// ============================================================
// Beneficiary Document Encrypt & Decrypt
// ============================================================

const BENEFICIARY_ENCRYPTED_FIELDS = [
  'tc_no',
  'ad_soyad',
  'telefon',
  'telefon2',
  'acik_adres',
  'hane_no',
  'norm_adres',
  'sokak',
  'teslim_alan',
  'teslimat_notu',
  'uyari_notu',
  'adres_guncelleme_notu',
  'ek_liste_imza_notu',
  'komur_iptal_nedeni',
  'komur_iptal_aciklama',
  'onceki_acik_adres',
  'onceki_sokak',
  'imza_listesi_acik_adres',
  'imza_listesi_sokak',
];

/**
 * Encrypt a beneficiary document before saving to MongoDB
 */
export function encryptBeneficiary(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };

  // Generate Blind Index hashes before encrypting the fields
  const rawTc = cleanTcNo(cloned.tc_no || '');
  if (rawTc) {
    cloned.tc_hash = hashBlindIndex(rawTc);
  }

  const rawHane = cleanHaneKey(cloned.hane_no || '');
  if (rawHane) {
    cloned.hane_hash = hashBlindIndex(rawHane);
  }

  const rawNormAdres = (cloned.norm_adres || '').trim();
  if (rawNormAdres) {
    cloned.adres_hash = hashBlindIndex(rawNormAdres);
  }

  // Encrypt all sensitive fields with AES-256-GCM
  for (const field of BENEFICIARY_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = encryptField(String(cloned[field]));
    }
  }

  // Encrypt each warning string inside uyarilar array (may contain household member name & TC)
  if (Array.isArray(cloned.uyarilar)) {
    cloned.uyarilar = cloned.uyarilar.map((u: any) =>
      u !== undefined && u !== null ? encryptField(String(u)) : u
    );
  }

  return cloned;
}

/**
 * Decrypt a beneficiary document after reading from MongoDB
 */
export function decryptBeneficiary(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };

  for (const field of BENEFICIARY_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = decryptField(cloned[field]);
    }
  }

  if (Array.isArray(cloned.uyarilar)) {
    cloned.uyarilar = cloned.uyarilar
      .map((u: any) => (typeof u === 'string' && isEncrypted(u) ? decryptField(u) : u))
      .filter((u: any) => typeof u !== 'string' || !u.startsWith('Aynı Adreste'));
  }

  if (typeof cloned.uyari_notu === 'string' && cloned.uyari_notu.startsWith('Aynı Adreste')) {
    cloned.uyari_notu = null;
  }

  return cloned;
}

// ============================================================
// Delivery History Document Encrypt & Decrypt
// ============================================================

const HISTORY_ENCRYPTED_FIELDS = [
  'tc_no',
  'ad_soyad',
  'acik_adres',
  'teslim_alan',
  'notlar',
  'iptal_nedeni',
];

export function encryptDeliveryHistory(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };

  const rawTc = cleanTcNo(cloned.tc_no || '');
  if (rawTc) {
    cloned.tc_hash = hashBlindIndex(rawTc);
  }

  for (const field of HISTORY_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = encryptField(String(cloned[field]));
    }
  }

  return cloned;
}

export function decryptDeliveryHistory(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };

  for (const field of HISTORY_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = decryptField(cloned[field]);
    }
  }

  return cloned;
}

// ============================================================
// Import Logs Document Encrypt & Decrypt
// ============================================================

const IMPORT_LOG_ENCRYPTED_FIELDS = [
  'tc_no',
  'ad_soyad',
  'telefon',
  'acik_adres',
  'hane_no',
  'hata_nedeni',
  'cakisan_ad_soyad',
  'cakisan_tc',
  'cakisan_hane_no',
  'teslim_alan',
];

export function encryptImportLog(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };

  const rawTc = cleanTcNo(cloned.tc_no || '');
  if (rawTc) {
    cloned.tc_hash = hashBlindIndex(rawTc);
  }

  const rawCakisanTc = cleanTcNo(cloned.cakisan_tc || '');
  if (rawCakisanTc) {
    cloned.cakisan_tc_hash = hashBlindIndex(rawCakisanTc);
  }

  for (const field of IMPORT_LOG_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = encryptField(String(cloned[field]));
    }
  }

  return cloned;
}

export function decryptImportLog(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };

  for (const field of IMPORT_LOG_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = decryptField(cloned[field]);
    }
  }

  return cloned;
}

// ============================================================
// Activity Logs Document Encrypt & Decrypt
// ============================================================

const ACTIVITY_LOG_ENCRYPTED_FIELDS = [
  'detay',
  'hedef_kisi',
  'hedef_tc',
];

export function encryptActivityLog(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };

  const rawTc = cleanTcNo(cloned.hedef_tc || '');
  if (rawTc) {
    cloned.hedef_tc_hash = hashBlindIndex(rawTc);
  }

  for (const field of ACTIVITY_LOG_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = encryptField(String(cloned[field]));
    }
  }

  // Encrypt ek_bilgi (which may contain old/new address, phone, or conflict details)
  if (cloned.ek_bilgi !== undefined && cloned.ek_bilgi !== null) {
    const serialized = typeof cloned.ek_bilgi === 'string'
      ? cloned.ek_bilgi
      : JSON.stringify(cloned.ek_bilgi);
    cloned.ek_bilgi = encryptField(serialized);
  }

  return cloned;
}

export function decryptActivityLog(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };

  for (const field of ACTIVITY_LOG_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = decryptField(cloned[field]);
    }
  }

  if (typeof cloned.ek_bilgi === 'string' && isEncrypted(cloned.ek_bilgi)) {
    const dec = decryptField(cloned.ek_bilgi);
    if (dec) {
      try {
        cloned.ek_bilgi = JSON.parse(dec);
      } catch {
        cloned.ek_bilgi = dec;
      }
    }
  }

  return cloned;
}

// ============================================================
// Users Document Encrypt & Decrypt (Kullanıcılar / Personel)
// ============================================================

export const USER_ENCRYPTED_FIELDS = [
  'ad_soyad',
  'telefon',
  'sifre',
  'last_ip',
  'last_device',
  'totp_secret',
  'totp_pending_secret',
];

export function encryptUser(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };

  for (const field of USER_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = encryptField(String(cloned[field]));
    }
  }

  if (Array.isArray(cloned.totp_recovery_codes)) {
    cloned.totp_recovery_codes = cloned.totp_recovery_codes.map((c: any) =>
      c !== undefined && c !== null ? encryptField(String(c)) : c
    );
  }

  return cloned;
}

export function decryptUser(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };

  for (const field of USER_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = decryptField(cloned[field]);
    }
  }

  if (Array.isArray(cloned.totp_recovery_codes)) {
    cloned.totp_recovery_codes = cloned.totp_recovery_codes.map((c: any) =>
      typeof c === 'string' && isEncrypted(c) ? decryptField(c) : c
    );
  }

  return cloned;
}

// ============================================================
// Truck Deliveries Encrypt & Decrypt (Şoförler ve Sevkiyatlar)
// ============================================================

export const TRUCK_ENCRYPTED_FIELDS = [
  'sofor_adi',
  'plaka',
  'dorse_plaka',
  'irsaliye_no',
  'tutanak_no',
  'notlar',
];

/**
 * Normalize Waybill / Delivery Note Number (İrsaliye / Teslimat No)
 * for primary/unique key comparison (case-insensitive Turkish uppercase, stripped spaces).
 */
export function normalizeIrsaliyeNo(val: string | null | undefined): string {
  if (!val) return '';
  return String(val)
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/\s+/g, '');
}

/**
 * Compute deterministic HMAC-SHA256 blind index hash for İrsaliye / Teslimat No
 */
export function hashIrsaliye(val: string | null | undefined): string | null {
  const norm = normalizeIrsaliyeNo(val);
  if (!norm) return null;
  return hashBlindIndex(norm);
}

export function encryptTruck(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };

  // Compute primary/unique blind index for irsaliye_no before encrypting
  const rawIrsaliye = isEncrypted(cloned.irsaliye_no)
    ? decryptField(cloned.irsaliye_no)
    : cloned.irsaliye_no;
  const irsHash = hashIrsaliye(rawIrsaliye);
  if (irsHash) {
    cloned.irsaliye_hash = irsHash;
  }

  for (const field of TRUCK_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = encryptField(String(cloned[field]));
    }
  }

  return cloned;
}

export function decryptTruck(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };

  for (const field of TRUCK_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = decryptField(cloned[field]);
    }
  }

  return cloned;
}

// ============================================================
// Work Shifts Encrypt & Decrypt (Personel Mesaileri)
// ============================================================

export const SHIFT_ENCRYPTED_FIELDS = [
  'personel_adi',
  'notlar',
];

export function encryptShift(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };

  for (const field of SHIFT_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = encryptField(String(cloned[field]));
    }
  }

  return cloned;
}

export function decryptShift(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };

  for (const field of SHIFT_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = decryptField(cloned[field]);
    }
  }

  return cloned;
}

// ============================================================
// Delivery Routes & Stops Encrypt & Decrypt (Saha Rotaları)
// ============================================================

export const ROUTE_STOP_ENCRYPTED_FIELDS = [
  'tc_no',
  'ad_soyad',
  'telefon',
  'telefon2',
  'acik_adres',
  'sokak',
  'teslim_alan',
  'teslimat_notu',
];

export const ROUTE_ENCRYPTED_FIELDS = [
  'notlar',
  'kapanis_notu',
];

export function encryptRouteStop(stop: any): any {
  if (!stop) return stop;
  const cloned = { ...stop };
  for (const field of ROUTE_STOP_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null && String(cloned[field]).length > 0) {
      cloned[field] = encryptField(String(cloned[field]));
    }
  }
  return cloned;
}

export function decryptRouteStop(stop: any): any {
  if (!stop) return stop;
  const cloned = { ...stop };
  for (const field of ROUTE_STOP_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = decryptField(cloned[field]);
    }
  }
  return cloned;
}

export function encryptRoute(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };
  for (const field of ROUTE_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null && String(cloned[field]).length > 0) {
      cloned[field] = encryptField(String(cloned[field]));
    }
  }
  if (Array.isArray(cloned.duraklar)) {
    cloned.duraklar = cloned.duraklar.map(encryptRouteStop);
  }
  return cloned;
}

export function decryptRoute(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };
  for (const field of ROUTE_ENCRYPTED_FIELDS) {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = decryptField(cloned[field]);
    }
  }
  if (Array.isArray(cloned.duraklar)) {
    cloned.duraklar = cloned.duraklar.map(decryptRouteStop);
  }
  return cloned;
}

// ============================================================
// Secure Password Hashing (scrypt + timing-safe comparison)
// ============================================================

/**
 * Parola / PIN özeti: scrypt (N=2^15, r=8, p=1) + 16 bayt rastgele tuz.
 * Biçim: SCRYPT2:<N>:<r>:<p>:<salt_hex>:<hash_hex>
 * (Eski biçim SCRYPT:<salt>:<hash> doğrulanır; başarılı girişte needsPasswordRehash() ile yükseltilir.)
 */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 128 * 1024 * 1024;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password.trim(), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `SCRYPT2:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt}:${derivedKey.toString('hex')}`;
}

/** Saklı özet eski (zayıf maliyetli) biçimdeyse true döner; başarılı girişte yeniden özetlenmelidir. */
export function needsPasswordRehash(storedHash: string | null | undefined): boolean {
  return !storedHash || !storedHash.startsWith('SCRYPT2:');
}

/**
 * Timing-safe password verification against stored scrypt hash.
 */
export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !password) return false;
  try {
    const cleanPass = password.trim();
    if (storedHash.startsWith('SCRYPT2:')) {
      const parts = storedHash.split(':');
      if (parts.length !== 6) return false;
      const [, nStr, rStr, pStr, salt, expectedHashHex] = parts;
      const N = Number.parseInt(nStr, 10);
      const r = Number.parseInt(rStr, 10);
      const p = Number.parseInt(pStr, 10);
      if (!Number.isFinite(N) || N < 16384 || N > 1 << 20 || r < 1 || r > 16 || p < 1 || p > 4) return false;
      const expectedBuf = Buffer.from(expectedHashHex, 'hex');
      if (expectedBuf.length < 32) return false;
      const derivedKey = crypto.scryptSync(cleanPass, salt, expectedBuf.length, { N, r, p, maxmem: SCRYPT_MAXMEM });
      return crypto.timingSafeEqual(derivedKey, expectedBuf);
    }
    if (storedHash.startsWith('SCRYPT:') || storedHash.startsWith('SCRYPT1:')) {
      const parts = storedHash.split(':');
      if (parts.length !== 3) return false;
      const [, salt, expectedHashHex] = parts;
      const derivedKey = crypto.scryptSync(cleanPass, salt, 64);
      const expectedBuf = Buffer.from(expectedHashHex, 'hex');
      if (derivedKey.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(derivedKey, expectedBuf);
    }
    return false;
  } catch (err) {
    console.error('[Crypto] verifyPassword error:', err instanceof Error ? err.message : 'unknown');
    return false;
  }
}

let dummyPasswordHash: string | null = null;

/**
 * Kullanıcı bulunamadığında da aynı maliyetli scrypt işlemini yaparak yanıt süresi farkından
 * kullanıcı adı varlığının tespit edilmesini (user enumeration - timing attack) engeller.
 */
export function burnPasswordCheck(password: string): void {
  if (!dummyPasswordHash) {
    dummyPasswordHash = hashPassword(crypto.randomBytes(16).toString('hex'));
  }
  verifyPassword(password || 'x', dummyPasswordHash);
}

/**
 * Constant-time token/string comparison to prevent timing side-channel attacks.
 */
export function timingSafeTokenEqual(
  tokenA: string | null | undefined,
  tokenB: string | null | undefined
): boolean {
  if (!tokenA || !tokenB) return false;
  try {
    const bufA = Buffer.from(String(tokenA).trim(), 'utf8');
    const bufB = Buffer.from(String(tokenB).trim(), 'utf8');
    if (bufA.length === 0 || bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// Re-export Istanbul date utilities from decoupled dateUtils module
export { getIstanbulDate, type IstanbulDateResult } from './dateUtils';

// ============================================================
// Denetim Günlüğü (Audit Log) Kriptografik Bütünlük Zinciri (HMAC-SHA256)
// ============================================================

export interface AuditIntegrityInput {
  prev_hash?: string | null;
  kullanici_adi?: string | null;
  kullanici_rolu?: string | null;
  islem_tipi?: string | null;
  baslik?: string | null;
  tarih_iso?: string | null;
  hedef_tc_hash?: string | null;
}

/**
 * Her denetim günlüğü kaydı için önceki kaydın özetine (prev_hash) bağlı
 * HMAC-SHA256 bütünlük imzası üretir (Tamper-Evident Audit Log Chain).
 */
export function computeActivityLogIntegrityHash(entry: AuditIntegrityInput): string {
  const prev = String(entry.prev_hash || 'GENESIS').trim();
  const payload = [
    prev,
    String(entry.kullanici_adi || '').trim(),
    String(entry.kullanici_rolu || '').trim(),
    String(entry.islem_tipi || '').trim(),
    String(entry.baslik || '').trim(),
    String(entry.tarih_iso || '').trim(),
    String(entry.hedef_tc_hash || '').trim(),
  ].join('|');
  const key = getBlindIndexKeyBuffer();
  return crypto.createHmac('sha256', key).update('audit-chain-v1:' + payload).digest('hex');
}

/**
 * Verilen denetim günlüğü kayıtlarının HMAC imzalarını doğrular.
 */
export function verifyActivityLogChain(
  logs: Array<AuditIntegrityInput & { integrity_hash?: string | null }>
): { valid: boolean; checkedCount: number; chainedCount: number; tamperedCount: number } {
  let checkedCount = 0;
  let chainedCount = 0;
  let tamperedCount = 0;

  for (const log of logs) {
    checkedCount++;
    if (!log.integrity_hash) continue;
    chainedCount++;
    const expected = computeActivityLogIntegrityHash(log);
    if (!timingSafeTokenEqual(log.integrity_hash, expected)) {
      tamperedCount++;
    }
  }

  return {
    valid: tamperedCount === 0,
    checkedCount,
    chainedCount,
    tamperedCount,
  };
}

/**
 * Kriptografik motor ve anahtar sağlığını kontrol eder (/api/health ve güvenlik paneli için).
 */
export function checkCryptoEngineHealth(): {
  healthy: boolean;
  masterKeyConfigured: boolean;
  blindKeyConfigured: boolean;
  compromisedKeyDetected: boolean;
  rotationKeyActive: boolean;
} {
  try {
    const rawMaster = (process.env.ENCRYPTION_MASTER_KEY || '').trim();
    const rawBlind = (process.env.BLIND_INDEX_KEY || '').trim();
    const rawPrev = (process.env.ENCRYPTION_MASTER_KEY_PREVIOUS || '').trim();

    const compromised =
      (rawMaster.length > 0 && COMPROMISED_KEY_FINGERPRINTS.has(keyFingerprint(rawMaster))) ||
      (rawBlind.length > 0 && COMPROMISED_KEY_FINGERPRINTS.has(keyFingerprint(rawBlind)));

    const probe = 'health-check-probe';
    const enc = encryptField(probe);
    const dec = decryptField(enc);
    const h = hashBlindIndex(probe);

    return {
      healthy: dec === probe && Boolean(h) && !compromised,
      masterKeyConfigured: rawMaster.length >= 32,
      blindKeyConfigured: rawBlind.length >= 32,
      compromisedKeyDetected: compromised,
      rotationKeyActive: rawPrev.length >= 32,
    };
  } catch {
    return {
      healthy: false,
      masterKeyConfigured: false,
      blindKeyConfigured: false,
      compromisedKeyDetected: false,
      rotationKeyActive: false,
    };
  }
}