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

const DEFAULT_FALLBACK_KEY = 'acb6847010f6d2060e9fc8d875300e51d549e8732c4be718123746c231789ad9';
const DEFAULT_FALLBACK_BLIND_KEY = 'aa1f4c899c6f92db4dba712e678e3a908ff06aaadb57a7a578d2d958c0440782';

function getMasterKeyBuffer(): Buffer {
  const hexKey = (process.env.ENCRYPTION_MASTER_KEY || DEFAULT_FALLBACK_KEY).trim();
  if (hexKey.length === 64) {
    return Buffer.from(hexKey, 'hex');
  }
  return crypto.createHash('sha256').update(hexKey).digest();
}

function getBlindIndexKeyBuffer(): Buffer {
  const hexKey = (process.env.BLIND_INDEX_KEY || DEFAULT_FALLBACK_BLIND_KEY).trim();
  if (hexKey.length === 64) {
    return Buffer.from(hexKey, 'hex');
  }
  return crypto.createHash('sha256').update(hexKey).digest();
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
export function decryptField(ciphertext: string | null | undefined): string | null | undefined {
  if (ciphertext === null || ciphertext === undefined) return ciphertext;
  const str = String(ciphertext);
  if (str.length === 0) return '';
  if (!isEncrypted(str)) return str; // Legacy unencrypted string, return as-is

  try {
    const parts = str.slice(PREFIX.length).split(':');
    if (parts.length !== 3) {
      console.warn('[Crypto] Invalid ciphertext format, returning original');
      return str;
    }

    const [ivHex, tagHex, encryptedHex] = parts;
    const key = getMasterKeyBuffer();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.error('[Crypto] Decryption error (possible tampering or invalid key):', err);
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
    cloned.uyarilar = cloned.uyarilar.map((u: any) =>
      typeof u === 'string' && isEncrypted(u) ? decryptField(u) : u
    );
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
  'notlar',
];

export function encryptTruck(doc: any): any {
  if (!doc) return doc;
  const cloned = { ...doc };

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
 * Hashes a user password / PIN using scrypt with a unique cryptographically random salt.
 * Format: SCRYPT:<salt_hex>:<hash_hex>
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password.trim(), salt, 64);
  return `SCRYPT:${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Timing-safe password verification against stored scrypt hash.
 */
export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !password) return false;
  try {
    const cleanPass = password.trim();
    if (storedHash.startsWith('SCRYPT:')) {
      const parts = storedHash.split(':');
      if (parts.length !== 3) return false;
      const [, salt, expectedHashHex] = parts;
      const derivedKey = crypto.scryptSync(cleanPass, salt, 64);
      const keyBuf = Buffer.from(derivedKey.toString('hex'), 'hex');
      const expectedBuf = Buffer.from(expectedHashHex, 'hex');
      if (keyBuf.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(keyBuf, expectedBuf);
    }
    return false;
  } catch (err) {
    console.error('[Crypto] verifyPassword error:', err);
    return false;
  }
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
