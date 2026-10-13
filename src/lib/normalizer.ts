/**
 * Address & Data Normalization Utilities for Turkish Coal Distribution System
 */

export function cleanTurkishText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toString()
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');
}

/**
 * Normalizes address for household duplicate matching
 * e.g. "Cumhuriyet Mah. Karanfil Sokak No: 14/2" -> "cumhuriyet karanfil 14 2"
 */
export function normalizeAddress(mahalle: string, acikAdres: string, haneNo?: string): string {
  if (haneNo && haneNo.trim().length > 0) {
    return `hane_${cleanTurkishText(haneNo).replace(/[^a-z0-9]/g, '')}`;
  }

  const combined = `${mahalle || ''} ${acikAdres || ''}`;
  const cleaned = cleanTurkishText(combined);

  // Remove common filler words that differ by data entry
  const stripped = cleaned
    .replace(/\b(mahallesi|mah|mh|caddesi|cad|cd|sokagi|sokak|sok|sk|bulvari|bulvar|blv|koyu|koy|sitesi|site|apartmani|apt|blok|bloklari|kume|evleri|kapi|no|numara|daire|kat|ic|dis)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return stripped;
}

/**
 * Validates and cleans 11-digit Turkish National ID (TC Kimlik No)
 */
export function cleanTcNo(tc: string | number | null | undefined): string {
  if (!tc) return '';
  const cleaned = tc.toString().replace(/[^0-9]/g, '');
  return cleaned;
}

export function isValidTcNo(tc: string): boolean {
  if (!/^[1-9]\d{10}$/.test(tc)) return false;
  
  const digits = tc.split('').map(Number);
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  
  const tenth = ((oddSum * 7) - evenSum) % 10;
  if (tenth < 0 ? tenth + 10 !== digits[9] : tenth !== digits[9]) {
    return false;
  }
  
  const firstTenSum = digits.slice(0, 10).reduce((a, b) => a + b, 0);
  if (firstTenSum % 10 !== digits[10]) {
    return false;
  }
  
  return true;
}

/**
 * Clean phone number e.g. "0555 123 45 67" -> "05551234567"
 */
export function cleanPhone(phone: string | number | null | undefined): string {
  if (!phone) return '';
  const digits = phone.toString().replace(/[^0-9]/g, '');
  if (digits.length === 10 && digits.startsWith('5')) {
    return '0' + digits;
  }
  return digits;
}
