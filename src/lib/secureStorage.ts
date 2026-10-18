/**
 * Client-Side Secure Storage & Field Obfuscation
 *
 * DevTools / Application / LocalStorage içerisindeki kişisel verileri
 * (Yönetici adı-soyadı, personel isimleri, kullanıcı adları, roller, ekip bilgileri)
 * açık metin (plaintext) olarak saklamak yerine, rastgele IV ile şifrelenmiş
 * (ENC:SEC:v1:...) formatta saklar.
 *
 * Özellikler:
 * - Tamamen senkronize çalışır (React state ve render döngüsünü aksatmaz).
 * - Her kayıt için rastgele IV üretir (aynı isim her seferinde farklı şifreli çıktı üretir).
 * - Türkçe karakterleri (ğ, ü, ş, ı, ö, ç, İ, Ğ vb.) UTF-8 ile kayıpsız işler.
 * - Geriye dönük uyumludur (daha önceden düz metin saklanmış verileri otomatik şifreler).
 */

const CIPHER_PREFIX = 'ENC:SEC:v1:';
const VAULT_SALT = 'edirne_sydv_komur_secure_storage_vault_2026_salt_9f2c';

// --- Pure Synchronous SHA-256 Implementation for Client-Side Stream Cipher ---
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function rotr(n: number, b: number): number {
  return (n >>> b) | (n << (32 - b));
}

function sha256(bytes: Uint8Array): Uint8Array {
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const len = bytes.length;
  const bitLenHi = Math.floor(len / 0x20000000);
  const bitLenLo = (len * 8) >>> 0;

  const padLen = (len % 64 < 56) ? (56 - (len % 64)) : (120 - (len % 64));
  const totalLen = len + padLen + 8;
  const padded = new Uint8Array(totalLen);
  padded.set(bytes, 0);
  padded[len] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, bitLenHi, false);
  view.setUint32(totalLen - 4, bitLenLo, false);

  const w = new Uint32Array(64);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (((w[i - 16] + s0) >>> 0) + ((w[i - 7] + s1) >>> 0)) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (((h + s1) >>> 0) + ((ch + K[i]) >>> 0) + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Encrypts a plaintext string synchronously with a randomized IV and keystream
 */
export function encryptClientString(plaintext: string): string {
  if (!plaintext && plaintext !== '') return '';
  const encoder = new TextEncoder();
  const plainBytes = encoder.encode(plaintext);

  // 1. Generate 12-byte random IV
  const iv = new Uint8Array(12);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(iv);
  } else {
    for (let i = 0; i < 12; i++) {
      iv[i] = Math.floor(Math.random() * 256);
    }
  }

  const saltBytes = encoder.encode(VAULT_SALT);
  const cipherBytes = new Uint8Array(plainBytes.length);

  // 2. Generate keystream in 32-byte blocks
  const blockCount = Math.ceil(plainBytes.length / 32) || 1;
  let byteIndex = 0;

  for (let block = 0; block < blockCount; block++) {
    // Input: Salt (N bytes) + IV (12 bytes) + Block Counter (4 bytes)
    const blockInput = new Uint8Array(saltBytes.length + iv.length + 4);
    blockInput.set(saltBytes, 0);
    blockInput.set(iv, saltBytes.length);
    const counterView = new DataView(blockInput.buffer, saltBytes.length + iv.length, 4);
    counterView.setUint32(0, block, false);

    const keyBlock = sha256(blockInput);
    for (let i = 0; i < 32 && byteIndex < plainBytes.length; i++) {
      cipherBytes[byteIndex] = plainBytes[byteIndex] ^ keyBlock[i];
      byteIndex++;
    }
  }

  // 3. Generate 6-byte integrity tag
  const tagInput = new Uint8Array(saltBytes.length + iv.length + cipherBytes.length);
  tagInput.set(saltBytes, 0);
  tagInput.set(iv, saltBytes.length);
  tagInput.set(cipherBytes, saltBytes.length + iv.length);
  const tagFull = sha256(tagInput);
  const tagHex = bytesToHex(tagFull.subarray(0, 6));

  return `${CIPHER_PREFIX}${bytesToHex(iv)}:${bytesToHex(cipherBytes)}:${tagHex}`;
}

/**
 * Decrypts a secure ciphertext back to original plaintext string
 */
export function decryptClientString(ciphertext: string): string {
  if (!ciphertext) return '';
  if (!ciphertext.startsWith(CIPHER_PREFIX)) {
    // Legacy plaintext backward compatibility
    return ciphertext;
  }

  try {
    const raw = ciphertext.slice(CIPHER_PREFIX.length);
    const parts = raw.split(':');
    if (parts.length !== 3) return '';

    const iv = hexToBytes(parts[0]);
    const cipherBytes = hexToBytes(parts[1]);
    const expectedTagHex = parts[2];

    const encoder = new TextEncoder();
    const saltBytes = encoder.encode(VAULT_SALT);

    // Verify integrity tag
    const tagInput = new Uint8Array(saltBytes.length + iv.length + cipherBytes.length);
    tagInput.set(saltBytes, 0);
    tagInput.set(iv, saltBytes.length);
    tagInput.set(cipherBytes, saltBytes.length + iv.length);
    const tagFull = sha256(tagInput);
    const calculatedTagHex = bytesToHex(tagFull.subarray(0, 6));

    if (calculatedTagHex !== expectedTagHex) {
      console.warn('[SecureStorage] Veri bütünlük doğrulaması eşleşmedi.');
      return '';
    }

    const plainBytes = new Uint8Array(cipherBytes.length);
    const blockCount = Math.ceil(cipherBytes.length / 32) || 1;
    let byteIndex = 0;

    for (let block = 0; block < blockCount; block++) {
      const blockInput = new Uint8Array(saltBytes.length + iv.length + 4);
      blockInput.set(saltBytes, 0);
      blockInput.set(iv, saltBytes.length);
      const counterView = new DataView(blockInput.buffer, saltBytes.length + iv.length, 4);
      counterView.setUint32(0, block, false);

      const keyBlock = sha256(blockInput);
      for (let i = 0; i < 32 && byteIndex < cipherBytes.length; i++) {
        plainBytes[byteIndex] = cipherBytes[byteIndex] ^ keyBlock[i];
        byteIndex++;
      }
    }

    const decoder = new TextDecoder();
    return decoder.decode(plainBytes);
  } catch (err) {
    console.error('[SecureStorage] Çözme hatası:', err);
    return '';
  }
}

/**
 * Synchronous get with transparent decryption & legacy migration
 */
export function getSecureItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const rawVal = localStorage.getItem(key);
    if (rawVal === null) return null;
    if (rawVal.startsWith(CIPHER_PREFIX)) {
      return decryptClientString(rawVal);
    }
    // Auto-migrate unencrypted value to encrypted form immediately
    setSecureItem(key, rawVal);
    return rawVal;
  } catch (e) {
    console.error(`[SecureStorage] Error getting ${key}:`, e);
    return null;
  }
}

/**
 * Synchronous set with encryption
 */
export function setSecureItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    const encrypted = encryptClientString(value);
    localStorage.setItem(key, encrypted);
  } catch (e) {
    console.error(`[SecureStorage] Error setting ${key}:`, e);
  }
}

/**
 * Remove item
 */
export function removeSecureItem(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.error(`[SecureStorage] Error removing ${key}:`, e);
  }
}

/**
 * Scans all sensitive keys in localStorage and ensures none remain unencrypted.
 * Should be called once during app boot.
 */
export function migrateSensitiveStorageKeys(): void {
  if (typeof window === 'undefined') return;
  const sensitiveKeys = [
    'komur_user_name',
    'komur_username',
    'komur_user_role',
    'komur_user_team',
    'komur_user_partners',
    'komur_session_token',
    'komur_logged_in',
  ];

  for (const key of sensitiveKeys) {
    try {
      const val = localStorage.getItem(key);
      if (val && !val.startsWith(CIPHER_PREFIX)) {
        setSecureItem(key, val);
      }
    } catch (e) {}
  }
}
