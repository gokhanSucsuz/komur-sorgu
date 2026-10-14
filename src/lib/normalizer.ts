/**
 * Address & Data Normalization Utilities for Turkish Coal Distribution System
 */

export function cleanTurkishText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toString()
    .trim()
    .replace(/[İîÎ]/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıİiîÎ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[şŞ]/g, 's')
    .replace(/[üÜûÛ]/g, 'u')
    .replace(/[âÂ]/g, 'a');
}

/**
 * Normalizes text specifically for Turkish search matching.
 * Converts uppercase/lowercase Turkish characters and accented characters
 * to standard normalized forms (e.g. 'İ' -> 'i', 'I' -> 'i', 'ö' -> 'o', 'ş' -> 's').
 */
export function normalizeTurkishForSearch(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toString()
    .replace(/[İîÎ]/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıİiîÎ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[şŞ]/g, 's')
    .replace(/[üÜûÛ]/g, 'u')
    .replace(/[âÂ]/g, 'a')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Builds a regex pattern that matches Turkish characters interchangeably with their Latin/English counterparts,
 * completely case-insensitively.
 *
 * Example:
 * 'yilmaz' -> '[yY][iıİIîÎ][lL][mM][aâÂA][zZ]'
 * 'öztürk' -> '[oöÖO][zZ][tT][uüÜUûÛ][rR][kK]'
 */
export function buildTurkishRegexPattern(text: string): string {
  if (!text) return '';
  return text
    .split('')
    .map((ch) => {
      if (/\s/.test(ch)) return '\\s+';
      const lower = ch.toLocaleLowerCase('tr-TR');
      switch (lower) {
        case 'a':
        case 'â':
          return '[aâÂA]';
        case 'c':
        case 'ç':
          return '[cçÇC]';
        case 'g':
        case 'ğ':
          return '[gğĞG]';
        case 'ı':
        case 'i':
        case 'î':
          return '[iıİIîÎ]';
        case 'o':
        case 'ö':
          return '[oöÖO]';
        case 's':
        case 'ş':
          return '[sşŞS]';
        case 'u':
        case 'ü':
        case 'û':
          return '[uüÜUûÛ]';
        default:
          return ch.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&');
      }
    })
    .join('');
}

/**
 * Builds a multi-field, multi-word MongoDB query filter for Turkish search.
 * Splits the query into words, ensuring every word matches across at least one of the target fields.
 */
export function buildTurkishSearchFilter(
  query: string,
  fields: string[] = ['tc_no', 'ad_soyad', 'telefon', 'acik_adres', 'mahalle', 'hane_no']
): any {
  const terms = (query || '').trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return {};

  const andClauses = terms.map((term) => {
    const pattern = buildTurkishRegexPattern(term);
    const reg = new RegExp(pattern, 'i');
    return {
      $or: fields.map((field) => ({ [field]: reg })),
    };
  });

  if (andClauses.length === 1) {
    return andClauses[0];
  }
  return { $and: andClauses };
}

/**
 * Checks whether a single target text contains all words in a query,
 * case-insensitively and respecting Turkish characters.
 */
export function turkishIncludes(target: string | null | undefined, query: string | null | undefined): boolean {
  if (!query || !query.trim()) return true;
  if (!target) return false;

  const normTarget = normalizeTurkishForSearch(target);
  const terms = normalizeTurkishForSearch(query).split(' ').filter(Boolean);
  if (terms.length === 0) return true;

  return terms.every((term) => normTarget.includes(term));
}

/**
 * Checks whether an object record matches a search query across any of the specified fields.
 * Every word in the query must be found in at least one of the fields.
 */
export function turkishRecordMatches(
  record: Record<string, any>,
  fields: string[],
  query: string | null | undefined
): boolean {
  if (!query || !query.trim()) return true;
  if (!record) return false;

  const terms = normalizeTurkishForSearch(query).split(' ').filter(Boolean);
  if (terms.length === 0) return true;

  const combinedNormalized = fields
    .map((field) => normalizeTurkishForSearch(record[field]))
    .filter(Boolean)
    .join(' ');

  return terms.every((term) => combinedNormalized.includes(term));
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
