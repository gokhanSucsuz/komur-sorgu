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
 * Normalizes a name string specifically for exact ("birebir") Turkish matching.
 * Converts Turkish characters (İ->i, I->ı, etc.), removes punctuation,
 * collapses multiple spaces, and trims.
 */
export function normalizeTurkishNameForExactMatch(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toString()
    .replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜâÂ\s]/g, ' ')
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
 * Checks whether a beneficiary record matches a search query "birebir" (exact match):
 * - Matches if TC Kimlik No matches exactly (cleanTcNo digits equality).
 * - Matches if Ad Soyad matches exactly (case-insensitive, Turkish-normalized, punctuation-stripped, word-order independent).
 * - Strictly DOES NOT search in addresses (acik_adres, mahalle, sokak, hane_no) or phone numbers.
 */
export function isBirebirBeneficiaryMatch(
  record: { tc_no?: any; ad_soyad?: any } | null | undefined,
  query: string | null | undefined
): boolean {
  if (!query || !query.trim() || !record) return false;
  const rawQ = query.trim();

  // 1. TC Kimlik No Birebir Eşleşme (Sadece rakamlar karşılaştırılır)
  const qDigits = rawQ.replace(/\D/g, '');
  if (qDigits.length > 0) {
    const recordTcDigits = record.tc_no ? String(record.tc_no).replace(/\D/g, '') : '';
    if (recordTcDigits && recordTcDigits === qDigits) {
      return true;
    }
  }

  // 2. Ad Soyad Birebir Eşleşme (Türkçe karakter ve kelime sırası esnekliği ile)
  const normQuery = normalizeTurkishNameForExactMatch(rawQ);
  if (normQuery && record.ad_soyad) {
    const normTarget = normalizeTurkishNameForExactMatch(record.ad_soyad);
    if (normTarget) {
      // Birebir eşitlik (örn: "ahmet yilmaz" === "ahmet yilmaz")
      if (normTarget === normQuery) {
        return true;
      }
      // Kelime sırası bağımsız birebir eşitlik (örn: "yilmaz ahmet" === "ahmet yilmaz")
      const targetWordsSorted = normTarget.split(' ').sort().join(' ');
      const queryWordsSorted = normQuery.split(' ').sort().join(' ');
      if (targetWordsSorted === queryWordsSorted) {
        return true;
      }
    }
  }

  return false;
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
  fields: string[] = ['tc_no', 'ad_soyad', 'telefon', 'telefon2', 'acik_adres', 'mahalle', 'hane_no', 'sokak']
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

  // Include telefon2 if present in record even if not explicitly passed
  const targetFields = fields.includes('telefon') && !fields.includes('telefon2')
    ? [...fields, 'telefon2']
    : fields;

  const combinedNormalized = targetFields
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

  // Canonicalize neighborhood name if it refers to 100. Yıl or legacy "Yıl"
  let normMahalle = mahalle || '';
  if (
    normMahalle.toLocaleLowerCase('tr-TR').includes('yıl') ||
    normMahalle.toLocaleLowerCase('tr-TR').includes('yil')
  ) {
    normMahalle = normalizeMahalleName(normMahalle);
  }

  const combined = `${normMahalle} ${acikAdres || ''}`;
  let cleaned = cleanTurkishText(combined);

  // Unify 100. Yıl / Yıl variants to '100 yil' in normalized address
  cleaned = cleaned
    .replace(/(?:100\s*\.?\s*yil|yuzuncu\s*yil|\byil\b)/g, '100 yil')
    .replace(/\s+/g, ' ');

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
 * Clean a single phone number candidate into standard Turkish format:
 * - 10-digit mobile "5xxxxxxxxx" -> "05xxxxxxxxx"
 * - 11-digit mobile "05xxxxxxxxx" -> "05xxxxxxxxx"
 * - 12-digit international "905xxxxxxxxx" or "+905xxxxxxxxx" -> "05xxxxxxxxx"
 * - Landline "02xxxxxxxxx" / "03xxxxxxxxx" / "04xxxxxxxxx" -> kept formatted with leading 0
 */
export function formatSinglePhone(raw: string | number | null | undefined): string {
  if (!raw) return '';
  let str = raw.toString().trim();
  let digits = str.replace(/[^0-9]/g, '');

  if (digits.startsWith('90') && digits.length >= 12) {
    digits = digits.substring(2);
  }
  if (digits.length === 10 && (digits.startsWith('5') || digits.startsWith('2') || digits.startsWith('3') || digits.startsWith('4'))) {
    return '0' + digits;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits;
  }
  return digits;
}

/**
 * Formats a clean 10/11 digit Turkish phone into standard visual display:
 * "0532 123 45 67" or "0212 123 45 67"
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.toString().replace(/[^0-9]/g, '');
  const tenDigits = digits.length === 11 && digits.startsWith('0')
    ? digits.substring(1)
    : digits.length === 10
    ? digits
    : digits.length === 12 && digits.startsWith('90')
    ? digits.substring(2)
    : '';

  if (tenDigits.length === 10) {
    return `0${tenDigits.substring(0, 3)} ${tenDigits.substring(3, 6)} ${tenDigits.substring(6, 8)} ${tenDigits.substring(8, 10)}`;
  }
  return phone.toString().trim();
}

/**
 * Extracts all unique phone numbers from input strings or Excel cells.
 * Robustly parses multiple numbers separated by slashes (/), dashes (-), commas (,),
 * semicolons (;), 've', 'veya', parentheses, or raw concatenated digit sequences.
 */
export function extractPhoneNumbers(...inputs: (string | number | null | undefined)[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const addPhone = (candidate: string) => {
    const formatted = formatSinglePhone(candidate);
    if (formatted && formatted.length >= 10 && formatted.length <= 11 && !seen.has(formatted)) {
      seen.add(formatted);
      result.push(formatted);
    }
  };

  for (const input of inputs) {
    if (!input) continue;
    const str = input.toString().trim();
    if (!str) continue;

    // First, try matching distinct phone regex patterns (e.g. (+90)? 0?5xx xxx xx xx or landline)
    const phoneRegex = /(?:(?:\+?90[\s.-]*)?0?[2-5]\d{2}[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2})/g;
    const matches = str.match(phoneRegex);
    if (matches && matches.length > 0) {
      for (const m of matches) {
        addPhone(m);
      }
    }

    // Split by common delimiters
    const parts = str.split(/[\/\-;,|\\&+\n\r]|\s+ve\s+|\s+veya\s+|\s+-\s+/i);
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      addPhone(trimmed);
    }

    // Check if raw string without delimiters is 20-22 digits of two concatenated 10-11 digit numbers
    const onlyDigits = str.replace(/[^0-9]/g, '');
    if (result.length < 2 && onlyDigits.length >= 20 && onlyDigits.length <= 22) {
      let part1 = '';
      let part2 = '';
      if (onlyDigits.length === 22 && onlyDigits.startsWith('0') && onlyDigits.substring(11).startsWith('0')) {
        part1 = onlyDigits.substring(0, 11);
        part2 = onlyDigits.substring(11, 22);
      } else if (onlyDigits.length === 20 && onlyDigits.startsWith('5') && onlyDigits.substring(10).startsWith('5')) {
        part1 = '0' + onlyDigits.substring(0, 10);
        part2 = '0' + onlyDigits.substring(10, 20);
      } else if (onlyDigits.length === 21) {
        if (onlyDigits.startsWith('0') && onlyDigits.substring(11).startsWith('5')) {
          part1 = onlyDigits.substring(0, 11);
          part2 = '0' + onlyDigits.substring(11, 21);
        } else if (onlyDigits.startsWith('5') && onlyDigits.substring(10).startsWith('0')) {
          part1 = '0' + onlyDigits.substring(0, 10);
          part2 = onlyDigits.substring(10, 21);
        }
      }
      if (part1) addPhone(part1);
      if (part2) addPhone(part2);
    }
  }

  return result;
}

/**
 * Safely returns up to 2 distinct phone numbers for any beneficiary record.
 * Works with both legacy records (where both numbers might be in `telefon`) and new records (`telefon` + `telefon2`).
 */
export function getRecordPhones(record: Record<string, any> | null | undefined): string[] {
  if (!record) return [];
  return extractPhoneNumbers(record.telefon, record.telefon2);
}

/**
 * Clean phone number e.g. "0555 123 45 67" -> "05551234567"
 * Returns the primary phone number if multiple exist.
 */
export function cleanPhone(phone: string | number | null | undefined): string {
  if (!phone) return '';
  const phones = extractPhoneNumbers(phone);
  return phones[0] || '';
}

/**
 * Converts text into clean Turkish title-case (e.g. "CUMHURİYET" -> "Cumhuriyet", "100. YIL" -> "100. Yıl")
 */
export function toTitleCaseTurkish(str: string): string {
  return str
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (word.length === 0) return '';
      if (/^\d+\.?$/.test(word)) return word;
      return word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1).toLocaleLowerCase('tr-TR');
    })
    .join(' ');
}

/**
 * Normalizes neighborhood name ensuring standard canonical format:
 * - "100. Yıl Mahallesi", "100.Yıl Mah.", "100 Yıl", "Yıl Mahallesi", "Yıl Mah.", "Yıl" -> "100. Yıl Mah."
 * - "Cumhuriyet Mahallesi", "Cumhuriyet" -> "Cumhuriyet Mah."
 * - "Dereköy Köyü", "Dereköy" (if village) -> "Dereköy Köyü"
 */
export function normalizeMahalleName(name: string | null | undefined): string {
  if (!name) return 'Merkez Mah.';
  let clean = name.toString().trim();

  // If village
  if (/(?:Köyü|Koy|Koyu)$/i.test(clean)) {
    const cleanK = clean.replace(/\s+(?:Köyü|Koy|Koyu)$/i, '').trim();
    return toTitleCaseTurkish(cleanK) + ' Köyü';
  }

  // Remove existing suffix (supporting both Turkish İ/I and English i/I)
  clean = clean.replace(/\s+(?:[Mm][Aa][Hh][Aa][Ll][Ll][Ee][Ss][İiIı]|[Mm][Aa][Hh]\.?|[Mm][Hh]\.?)$/i, '').trim();

  // Check 100. Yıl variants (including when entered as "Yıl" or "Yıl Mahallesi")
  const lower = clean.toLocaleLowerCase('tr-TR');
  if (
    lower === 'yıl' ||
    lower === 'yil' ||
    lower === '100.yıl' ||
    lower === '100.yil' ||
    lower === '100 yıl' ||
    lower === '100 yil' ||
    lower === '100. yıl' ||
    lower === '100. yil' ||
    lower === '100yıl' ||
    lower === '100yil' ||
    lower === 'yüzüncü yıl' ||
    lower === 'yuzuncu yil' ||
    lower === 'yıl mahallesi' ||
    lower === 'yil mahallesi' ||
    /(?:^|\b)(?:100\s*\.?\s*y[ıi]l|y[uü]z[uü]nc[uü]\s*y[ıi]l|y[ıi]l)(?:\b|$)/i.test(clean)
  ) {
    return '100. Yıl Mah.';
  }

  // Normalize other numbered neighborhoods spacing, e.g. "1.Murat" -> "1. Murat"
  clean = clean.replace(/^(\d+)\.([A-Za-zÇŞĞÜÖİçşğüöı])/, '$1. $2');

  return toTitleCaseTurkish(clean) + ' Mah.';
}

/**
 * Detects whether a location is a Mahalle or a Köy, and formats its standard name.
 * Handles inputs from separate columns or embedded within the address.
 */
export function detectSettlement(
  rawMahalle?: string | null,
  rawKoy?: string | null,
  acikAdres?: string | null
): { name: string; type: 'MAHALLE' | 'KOY' } {
  let m = (rawMahalle || '').toString().trim();
  let k = (rawKoy || '').toString().trim();
  let addr = (acikAdres || '').toString().trim();

  // 1. Explicit Village column
  if (k) {
    let cleanK = k.replace(/\s+(?:Köyü|Koy|Koyu)$/i, '').trim();
    if (cleanK) {
      return { name: toTitleCaseTurkish(cleanK) + ' Köyü', type: 'KOY' };
    }
  }

  // 2. Explicit Mahalle column
  if (m) {
    if (/(?:Köyü|Koy|Koyu)$/i.test(m)) {
      let cleanK = m.replace(/\s+(?:Köyü|Koy|Koyu)$/i, '').trim();
      return { name: toTitleCaseTurkish(cleanK) + ' Köyü', type: 'KOY' };
    }
    return { name: normalizeMahalleName(m), type: 'MAHALLE' };
  }

  // 3. Inspect open address
  if (addr) {
    // 3a. Specifically check 100. Yıl or Yıl Mahallesi in open address
    if (
      /(?:100\s*\.?\s*y[ıi]l|y[uü]z[uü]nc[uü]\s*y[ıi]l)\s*(?:[Mm][Aa][Hh][Aa][Ll][Ll][Ee][Ss][İiIı]|[Mm][Aa][Hh]\.?|[Mm][Hh]\.?)?/i.test(addr) ||
      /\b(?:y[ıi]l)\s+(?:[Mm][Aa][Hh][Aa][Ll][Ll][Ee][Ss][İiIı]|[Mm][Aa][Hh]\.?|[Mm][Hh]\.?)/i.test(addr)
    ) {
      return { name: '100. Yıl Mah.', type: 'MAHALLE' };
    }

    // 3b. Village check in open address
    const koyMatch = addr.match(/([A-Za-zÇŞĞÜÖİçşğüöı\s]+?)\s+(?:Köyü|Koyu|Köy\b)/i);
    if (koyMatch && koyMatch[1].trim().length > 1) {
      return { name: toTitleCaseTurkish(koyMatch[1].trim()) + ' Köyü', type: 'KOY' };
    }

    // 3c. Numbered neighborhood check in open address e.g. "1. Murat Mah.", "50. Yıl Mah."
    const numMahMatch = addr.match(/(?:^|[,\s;])(\d{1,3}\.?\s+[A-Za-zÇŞĞÜÖİçşğüöı\s]+?)\s+(?:[Mm][Aa][Hh][Aa][Ll][Ll][Ee][Ss][İiIı]|[Mm][Aa][Hh]\.?|[Mm][Hh]\.?)\b/i);
    if (numMahMatch && numMahMatch[1].trim().length > 1) {
      return { name: normalizeMahalleName(numMahMatch[1].trim()), type: 'MAHALLE' };
    }

    // 3d. General neighborhood check in open address
    const mahMatch = addr.match(/(?:^|[,\s;])([A-Za-z0-9ÇŞĞÜÖİçşğüöı\s.]+?)\s+(?:[Mm][Aa][Hh][Aa][Ll][Ll][Ee][Ss][İiIı]|[Mm][Aa][Hh]\.?|[Mm][Hh]\.?)\b/i);
    if (mahMatch && mahMatch[1].trim().length > 1) {
      const candidate = mahMatch[1].trim().replace(/^[,\s.-]+/, '');
      return { name: normalizeMahalleName(candidate), type: 'MAHALLE' };
    }
  }

  return { name: 'Merkez Mah.', type: 'MAHALLE' };
}

/**
 * Extracts and cleans street/cadde name and door/apartment number from address.
 * Enables natural sorting (1, 2, 3... 10, 14, 28) and street-level filtering.
 */
export function extractStreetAndDoor(
  acikAdres?: string | null,
  rawStreet?: string | null,
  rawHane?: string | null,
  mahalleName?: string | null
): {
  sokak: string;
  kapiNo: number;
  daireNo: number;
} {
  let explicitStreet = (rawStreet || '').toString().trim();
  let addr = (acikAdres || '').toString().trim();

  // Defensive check: If explicit street or address is encrypted with AES-256-GCM, sanitize
  if (explicitStreet.startsWith('ENC:GCM:v1:') || explicitStreet.startsWith('ENC:')) {
    explicitStreet = '';
  }
  if (addr.startsWith('ENC:GCM:v1:') || addr.startsWith('ENC:')) {
    addr = '';
  }

  let street = '';

  if (explicitStreet) {
    street = explicitStreet;
    // Normalize suffix
    if (!/(?:Caddesi|Cad\.|Cad|Sokağı|Sokak|Sok\.|Sok|Sk\.|Sk|Bulvarı|Bulvar|Mevkii|Küme Evleri|Yolu)\b/i.test(street)) {
      if (/cad/i.test(street)) street += ' Cad.';
      else if (/sok|sk/i.test(street)) street += ' Sok.';
    }
  } else if (addr) {
    let clean = addr;
    if (mahalleName) {
      if (/100\.\s*Yıl/i.test(mahalleName) || /Yıl\s+Mah/i.test(mahalleName)) {
        clean = clean.replace(/(?:100\s*\.?\s*y[ıi]l|y[uü]z[uü]nc[uü]\s*y[ıi]l|y[ıi]l)\s*(?:mahallesi|mah\.?|mh\.?)?\s*/gi, '').trim();
      } else {
        const cleanM = mahalleName.replace(/(?:Mahallesi|Mah\.|Mh\.|Köyü|Koy|Koyu)$/i, '').trim();
        if (cleanM.length > 2) {
          const escapedM = cleanM.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
          clean = clean.replace(new RegExp(escapedM + '\\s*(?:Mahallesi|Mah\\.|Mh\\.|Köyü|Koy|Koyu)?', 'gi'), '');
        }
      }
    }
    clean = clean.replace(/^[A-Za-z0-9ÇŞĞÜÖİçşğüöı\s.]+?\s+(?:[Mm][Aa][Hh][Aa][Ll][Ll][Ee][Ss][İiIı]|[Mm][Aa][Hh]\.?|[Mm][Hh]\.?|[Kk][öo]y[uü]?)\s*/i, '').trim();

    const regex = /(?:^|[\s,;])([A-Za-zÇŞĞÜÖİçşğüöı0-9\s.]+?)\s+(Caddesi|Cad\.|Cad|Cd\.|Cd|Sokağı|Sokak|Sok\.|Sok|Sk\.|Sk|Bulvarı|Bulvar|Blv\.|Blv|Küme\s+Evleri|Kume\s+Evleri|Mevkii|Mevki|Meydanı|Meydani|Yolu|Yol|Kümesi|Kumesi)\b/i;
    const sm = clean.match(regex);
    if (sm) {
      let suffix = sm[2].trim();
      if (/^cad/i.test(suffix)) suffix = 'Cad.';
      else if (/^(sok|sk)/i.test(suffix)) suffix = 'Sok.';
      else if (/^blv/i.test(suffix)) suffix = 'Bulvarı';
      else if (/^k[uü]me/i.test(suffix)) suffix = 'Küme Evleri';
      else if (/^mev/i.test(suffix)) suffix = 'Mevkii';
      else if (/^meydan/i.test(suffix)) suffix = 'Meydanı';
      else if (/^yol/i.test(suffix)) suffix = 'Yolu';

      let prefix = sm[1].replace(/^[,\s.-]+/, '').trim();
      street = (prefix ? prefix + ' ' : '') + suffix;
    } else {
      if (/k[oö]y\s+[iı]çi/i.test(clean)) street = 'Köy İçi Mevkii';
      else if (/cami\s+yan/i.test(clean)) street = 'Cami Yanı Mevkii';
      else street = 'Köy İçi / Ana Yol';
    }
  } else {
    street = 'Köy İçi / Sokak Belirtilmemiş';
  }

  // Extract door number
  let door = 999999;
  if (rawHane) {
    const parsedHane = parseInt(rawHane.toString().replace(/[^0-9]/g, ''), 10);
    if (!isNaN(parsedHane) && parsedHane > 0) {
      door = parsedHane;
    }
  }

  if (door === 999999 && addr) {
    const doorMatch = addr.match(/(?:No|Kapı|Kapi|Hane|Bina)\s*[:.]?\s*(\d+)/i) || addr.match(/\b(\d+)\s*(?:\/|\s+Daire|\s+D:|\s*$|\s*Kat)/i);
    if (doorMatch) {
      door = parseInt(doorMatch[1], 10);
    }
  }

  // Extract apartment number
  let apt = 0;
  if (addr) {
    const aptMatch = addr.match(/(?:Daire|D|Kat|İç Kapı|Ic Kapi)\s*[:.]?\s*(\d+)/i) || addr.match(/\/\s*(\d+)/);
    if (aptMatch) {
      apt = parseInt(aptMatch[1], 10);
    }
  }

  return { sokak: street, kapiNo: door, daireNo: apt };
}

/**
 * Helper to get clean street info from any beneficiary record
 */
export function getRecordStreetInfo(record: Record<string, any> | null | undefined): {
  sokak: string;
  kapiNo: number;
  daireNo: number;
} {
  if (!record) return { sokak: 'Köy İçi / Sokak Belirtilmemiş', kapiNo: 999999, daireNo: 0 };

  // Defensive check: If encrypted ciphertext is passed, ignore to prevent leaking ciphertext
  let rawSokak = record.sokak;
  if (typeof rawSokak === 'string' && (rawSokak.startsWith('ENC:GCM:v1:') || rawSokak.startsWith('ENC:'))) {
    rawSokak = '';
  }

  let rawAdres = record.acik_adres;
  if (typeof rawAdres === 'string' && (rawAdres.startsWith('ENC:GCM:v1:') || rawAdres.startsWith('ENC:'))) {
    rawAdres = '';
  }

  if (rawSokak && !rawSokak.startsWith('ENC:') && record.kapi_no !== undefined && record.kapi_no !== null) {
    return {
      sokak: rawSokak,
      kapiNo: typeof record.kapi_no === 'number' ? record.kapi_no : (parseInt(record.kapi_no, 10) || 999999),
      daireNo: record.daire_no || 0,
    };
  }
  return extractStreetAndDoor(rawAdres, rawSokak, record.hane_no, record.mahalle);
}

/**
 * Natural address comparison function (Street name -> Door number 1 to 99 -> Apartment number -> Person name)
 */
export function compareByAddressAsc(a: any, b: any): number {
  const sa = getRecordStreetInfo(a);
  const sb = getRecordStreetInfo(b);

  const streetComp = sa.sokak.localeCompare(sb.sokak, 'tr');
  if (streetComp !== 0) return streetComp;

  if (sa.kapiNo !== sb.kapiNo) return sa.kapiNo - sb.kapiNo;
  if (sa.daireNo !== sb.daireNo) return sa.daireNo - sb.daireNo;

  return (a.ad_soyad || '').localeCompare(b.ad_soyad || '', 'tr');
}

/**
 * Natural comparison by Order Number (Sıra No / İmza Listesi Sırası):
 * Ana Liste (0) first: 1, 2, 3...
 * Then Ek 1: Ek1 - 1, Ek1 - 2...
 * Then Ek 2: Ek2 - 1, Ek2 - 2...
 */
export function compareBySiraNo(a: any, b: any): number {
  const getEkNo = (item: any): number => {
    if (typeof item.ek_liste_no === 'number') return item.ek_liste_no;
    if (item.sira_no && typeof item.sira_no === 'string') {
      const match = item.sira_no.match(/^Ek\s*(\d+)/i);
      if (match) return parseInt(match[1], 10);
    }
    return 0; // Ana Liste
  };

  const getSeqNo = (item: any): number => {
    if (typeof item.mahalle_sira === 'number') return item.mahalle_sira;
    if (item.sira_no) {
      const match = String(item.sira_no).match(/(\d+)(?!.*\d)/); // extract last number
      if (match) return parseInt(match[1], 10);
    }
    return 999999;
  };

  const ekA = getEkNo(a);
  const ekB = getEkNo(b);
  if (ekA !== ekB) return ekA - ekB;

  const seqA = getSeqNo(a);
  const seqB = getSeqNo(b);
  if (seqA !== seqB) return seqA - seqB;

  return (a.ad_soyad || '').localeCompare(b.ad_soyad || '', 'tr');
}

/**
 * Cleans household number (Hane No) e.g. "Hane: 101" -> "101"
 */
export function cleanHaneNo(hane: string | number | null | undefined): string {
  if (hane === null || hane === undefined) return '';
  const str = hane.toString().trim();
  if (!str) return '';
  return str.replace(/^(?:hane\s*(?:no|numaras[ıi])?\s*[:.-]?\s*)/i, '').trim();
}

/**
 * Normalizes household number for exact key matching e.g. "Hane 101/A" -> "101a"
 */
export function cleanHaneKey(hane: string | number | null | undefined): string {
  const cleaned = cleanHaneNo(hane);
  if (!cleaned) return '';
  return cleanTurkishText(cleaned).replace(/[^a-z0-9]/g, '');
}

/**
 * Formats delivery status into a human-readable, professional Turkish summary
 * e.g. "TAMAMLANDI - 34 Torba Teslim Edildi (14.10.2026 11:30)"
 */
export function formatDeliveryStatusSummary(record: {
  teslimat_durumu?: string | null;
  torba_sayisi?: number | null;
  hedef_torba?: number | null;
  teslimat_tarihi?: string | null;
  teslim_alan?: string | null;
}): string {
  const durum = (record.teslimat_durumu || 'BEKLIYOR').toUpperCase();
  const torba = Number(record.torba_sayisi || 0);
  const hedef = Number(record.hedef_torba || 34);
  const tarih = record.teslimat_tarihi ? ` [Tarih: ${record.teslimat_tarihi}]` : '';

  if (durum === 'TAMAMLANDI') {
    return `TAMAMLANDI - ${torba} Torba Teslim Edildi${tarih}`;
  } else if (durum === 'EKSIK') {
    const kalan = Math.max(0, hedef - torba);
    return `EKSİK TESLİMAT - ${torba}/${hedef} Torba Verildi, ${kalan} Torba Kalan${tarih}`;
  } else if (durum === 'IPTAL') {
    return `İPTAL EDİLDİ - Teslimat Yapılamadı${tarih}`;
  } else {
    return 'BEKLİYOR - Henüz Kömür Teslimatı Yapılmadı';
  }
}

