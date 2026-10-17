import crypto from 'crypto';
import { timingSafeTokenEqual } from './crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generates a cryptographically strong 160-bit (32 Base32 chars) TOTP secret
 * compatible with Google Authenticator, Microsoft Authenticator, and Apple Passwords.
 */
export function generateTotpSecret(byteLength: number = 20): string {
  const bytes = crypto.randomBytes(byteLength);
  return base32Encode(bytes);
}

/**
 * Generates 6 single-use emergency backup recovery codes (e.g. "K8M2-9P4X")
 */
export function generateRecoveryCodes(count: number = 6): string[] {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(8);
    let part1 = '';
    let part2 = '';
    for (let j = 0; j < 4; j++) {
      part1 += chars[bytes[j] % chars.length];
      part2 += chars[bytes[j + 4] % chars.length];
    }
    codes.push(`${part1}-${part2}`);
  }
  return codes;
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(base32Str: string): Buffer {
  const cleaned = (base32Str || '')
    .toUpperCase()
    .replace(/=+$/, '')
    .replace(/[\s-]/g, '');

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Computes RFC 6238 6-digit TOTP code for a given 30-second time counter
 */
export function generateTotpCode(secretBase32: string, counter?: number): string {
  const key = base32Decode(secretBase32);
  const timeStep = counter !== undefined ? counter : Math.floor(Date.now() / 1000 / 30);

  const counterBuf = Buffer.alloc(8);
  let temp = timeStep;
  for (let i = 7; i >= 0; i--) {
    counterBuf[i] = temp & 0xff;
    temp = Math.floor(temp / 256);
  }

  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return String(otp).padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP token against a Base32 secret with +-1 time step (30s) drift tolerance.
 */
export function verifyTotpCode(secretBase32: string, token: string, windowSteps: number = 1): boolean {
  if (!secretBase32 || !token) return false;
  const cleanToken = String(token).replace(/\s+/g, '').trim();
  if (!/^\d{6}$/.test(cleanToken)) return false;

  const currentCounter = Math.floor(Date.now() / 1000 / 30);
  for (let errorWindow = -windowSteps; errorWindow <= windowSteps; errorWindow++) {
    const expected = generateTotpCode(secretBase32, currentCounter + errorWindow);
    if (timingSafeTokenEqual(expected, cleanToken)) {
      return true;
    }
  }
  return false;
}

/**
 * Builds standard otpauth:// URI for Google Authenticator / Microsoft Authenticator
 */
export function buildOtpAuthUri(username: string, secretBase32: string, issuer: string = 'Edirne SYDV'): string {
  const cleanUser = encodeURIComponent(username.trim());
  const cleanIssuer = encodeURIComponent(issuer.trim());
  return `otpauth://totp/${cleanIssuer}:${cleanUser}?secret=${secretBase32}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=30`;
}

// ============================================================================
// Pure Offline ISO/IEC 18004 QR Code SVG Generator (Zero External Dependencies)
// Supports Byte Mode, EC Level L, Versions 1..10
// ============================================================================

interface QrVersionInfo {
  version: number;
  totalDataBytes: number;
  ecBytesPerBlock: number;
  numBlocks1: number;
  dataBytesPerBlock1: number;
  numBlocks2: number;
  dataBytesPerBlock2: number;
  alignmentCenters: number[];
}

const QR_VERSIONS_L: QrVersionInfo[] = [
  { version: 1, totalDataBytes: 19, ecBytesPerBlock: 7, numBlocks1: 1, dataBytesPerBlock1: 19, numBlocks2: 0, dataBytesPerBlock2: 0, alignmentCenters: [] },
  { version: 2, totalDataBytes: 34, ecBytesPerBlock: 10, numBlocks1: 1, dataBytesPerBlock1: 34, numBlocks2: 0, dataBytesPerBlock2: 0, alignmentCenters: [6, 18] },
  { version: 3, totalDataBytes: 55, ecBytesPerBlock: 15, numBlocks1: 1, dataBytesPerBlock1: 55, numBlocks2: 0, dataBytesPerBlock2: 0, alignmentCenters: [6, 22] },
  { version: 4, totalDataBytes: 80, ecBytesPerBlock: 20, numBlocks1: 1, dataBytesPerBlock1: 80, numBlocks2: 0, dataBytesPerBlock2: 0, alignmentCenters: [6, 26] },
  { version: 5, totalDataBytes: 108, ecBytesPerBlock: 26, numBlocks1: 1, dataBytesPerBlock1: 108, numBlocks2: 0, dataBytesPerBlock2: 0, alignmentCenters: [6, 30] },
  { version: 6, totalDataBytes: 136, ecBytesPerBlock: 18, numBlocks1: 2, dataBytesPerBlock1: 68, numBlocks2: 0, dataBytesPerBlock2: 0, alignmentCenters: [6, 34] },
  { version: 7, totalDataBytes: 156, ecBytesPerBlock: 20, numBlocks1: 2, dataBytesPerBlock1: 78, numBlocks2: 0, dataBytesPerBlock2: 0, alignmentCenters: [6, 22, 38] },
  { version: 8, totalDataBytes: 194, ecBytesPerBlock: 24, numBlocks1: 2, dataBytesPerBlock1: 97, numBlocks2: 0, dataBytesPerBlock2: 0, alignmentCenters: [6, 24, 42] },
  { version: 9, totalDataBytes: 232, ecBytesPerBlock: 30, numBlocks1: 2, dataBytesPerBlock1: 116, numBlocks2: 0, dataBytesPerBlock2: 0, alignmentCenters: [6, 26, 46] },
  { version: 10, totalDataBytes: 274, ecBytesPerBlock: 18, numBlocks1: 2, dataBytesPerBlock1: 68, numBlocks2: 2, dataBytesPerBlock2: 69, alignmentCenters: [6, 28, 50] },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    for (let j = 0; j < ecLen; j++) {
      rem[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return rem;
}

function computeFormatBits(ecLevelBits: number, maskPattern: number): number {
  const data = (ecLevelBits << 3) | maskPattern;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) {
      rem ^= 0x537 << (i - 10);
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function computeVersionBits(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) {
    if ((rem >>> i) & 1) {
      rem ^= 0x1f25 << (i - 12);
    }
  }
  return (version << 12) | rem;
}

export function generateQrCodeSvgDataUrl(text: string): string {
  const utf8Bytes = Buffer.from(text, 'utf8');
  const byteLen = utf8Bytes.length;

  // Choose smallest version that fits byte mode: 4 bits mode + (8 or 16 bits count) + 8*N bits
  const spec = QR_VERSIONS_L.find((v) => {
    const headerBits = v.version <= 9 ? 12 : 20;
    return Math.floor((v.totalDataBytes * 8 - headerBits) / 8) >= byteLen;
  });

  if (!spec) {
    throw new Error('QR verisi çok uzun');
  }

  // Build bit stream
  const bitBuf: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bitBuf.push((val >>> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(byteLen, spec.version <= 9 ? 8 : 16);
  for (let i = 0; i < byteLen; i++) {
    pushBits(utf8Bytes[i], 8);
  }

  const maxDataBits = spec.totalDataBytes * 8;
  const terminatorLen = Math.min(4, maxDataBits - bitBuf.length);
  pushBits(0, terminatorLen);
  while (bitBuf.length % 8 !== 0) {
    bitBuf.push(0);
  }

  const dataBytes = new Uint8Array(spec.totalDataBytes);
  for (let i = 0; i < bitBuf.length / 8; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bitBuf[i * 8 + j];
    }
    dataBytes[i] = b;
  }

  let padToggle = true;
  for (let i = bitBuf.length / 8; i < spec.totalDataBytes; i++) {
    dataBytes[i] = padToggle ? 0xec : 0x11;
    padToggle = !padToggle;
  }

  // Split into blocks and compute Reed-Solomon EC bytes
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < spec.numBlocks1; i++) {
    const blk = dataBytes.slice(offset, offset + spec.dataBytesPerBlock1);
    offset += spec.dataBytesPerBlock1;
    dataBlocks.push(blk);
    ecBlocks.push(rsEncode(blk, spec.ecBytesPerBlock));
  }
  for (let i = 0; i < spec.numBlocks2; i++) {
    const blk = dataBytes.slice(offset, offset + spec.dataBytesPerBlock2);
    offset += spec.dataBytesPerBlock2;
    dataBlocks.push(blk);
    ecBlocks.push(rsEncode(blk, spec.ecBytesPerBlock));
  }

  // Interleave data and EC codewords
  const interleaved: number[] = [];
  const maxDataBlockLen = Math.max(spec.dataBytesPerBlock1, spec.dataBytesPerBlock2);
  for (let i = 0; i < maxDataBlockLen; i++) {
    for (const blk of dataBlocks) {
      if (i < blk.length) interleaved.push(blk[i]);
    }
  }
  for (let i = 0; i < spec.ecBytesPerBlock; i++) {
    for (const blk of ecBlocks) {
      if (i < blk.length) interleaved.push(blk[i]);
    }
  }

  const size = spec.version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setFunctionModule = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r][c] = dark;
      isFunction[r][c] = true;
    }
  };

  // Finder patterns + separators
  const drawFinder = (topR: number, leftC: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = topR + dr;
        const c = leftC + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunctionModule(r, c, inOuter && (onBorder || inInner));
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const centers = spec.alignmentCenters;
  for (const cr of centers) {
    for (const cc of centers) {
      if (
        (cr === 6 && cc === 6) ||
        (cr === 6 && cc === size - 7) ||
        (cr === size - 7 && cc === 6)
      ) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFunctionModule(cr + dr, cc + dc, dark);
        }
      }
    }
  }

  // Reserve format info areas & dark module
  for (let i = 0; i <= 8; i++) {
    if (!isFunction[8][i]) setFunctionModule(8, i, false);
    if (!isFunction[i][8]) setFunctionModule(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunction[8][size - 1 - i]) setFunctionModule(8, size - 1 - i, false);
    if (!isFunction[size - 1 - i][8]) setFunctionModule(size - 1 - i, 8, false);
  }
  setFunctionModule(size - 8, 8, true); // Dark module

  // Version info for version >= 7
  if (spec.version >= 7) {
    const vBits = computeVersionBits(spec.version);
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunctionModule(b, a, bit);
      setFunctionModule(a, b, bit);
    }
  }

  // Place data bits in upward/downward 2-column zig-zag
  let bitIdx = 0;
  const totalBits = interleaved.length * 8;
  let upward = true;
  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol = 5;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = rightCol - dc;
        if (!isFunction[r][c]) {
          let dark = false;
          if (bitIdx < totalBits) {
            const byteVal = interleaved[Math.floor(bitIdx / 8)];
            dark = ((byteVal >>> (7 - (bitIdx % 8))) & 1) === 1;
            bitIdx++;
          }
          // Apply Mask Pattern 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) {
            dark = !dark;
          }
          modules[r][c] = dark;
        }
      }
    }
    upward = !upward;
  }

  // Write format information for EC Level L (01) and Mask 0 (000)
  const formatBits = computeFormatBits(0b01, 0);
  for (let i = 0; i <= 5; i++) setFunctionModule(8, i, ((formatBits >>> i) & 1) === 1);
  setFunctionModule(8, 7, ((formatBits >>> 6) & 1) === 1);
  setFunctionModule(8, 8, ((formatBits >>> 7) & 1) === 1);
  setFunctionModule(7, 8, ((formatBits >>> 8) & 1) === 1);
  for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, ((formatBits >>> i) & 1) === 1);

  for (let i = 0; i < 8; i++) setFunctionModule(8, size - 1 - i, ((formatBits >>> i) & 1) === 1);
  for (let i = 8; i < 15; i++) setFunctionModule(size - 15 + i, 8, ((formatBits >>> i) & 1) === 1);

  // Render SVG with 4-module quiet zone
  const margin = 4;
  const viewSize = size + margin * 2;
  let pathData = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        pathData += `M${c + margin},${r + margin}h1v1h-1z`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#ffffff"/><path d="${pathData}" fill="#0f172a"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
