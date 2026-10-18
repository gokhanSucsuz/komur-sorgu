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
 * %100 Türkçe Karakter Uyumlu Küçük Harfe Çevirme (Exact Turkish Case Folding).
 * Türkçe alfabedeki her harf yalnızca kendi büyük/küçük karşılığı ile eşleşir:
 * - 'ı' <-> 'I' (Noktasız I; 'i' veya 'İ' ile ASLA eşleşmez)
 * - 'i' <-> 'İ' (Noktalı İ; 'ı' veya 'I' ile ASLA eşleşmez)
 * - 'ş' <-> 'Ş' ('s' veya 'S' ile ASLA eşleşmez)
 * - 's' <-> 'S' ('ş' veya 'Ş' ile ASLA eşleşmez)
 * - 'ç' <-> 'Ç' ('c' veya 'C' ile ASLA eşleşmez)
 * - 'ğ' <-> 'Ğ' ('g' veya 'G' ile ASLA eşleşmez)
 * - 'ö' <-> 'Ö' ('o' veya 'O' ile ASLA eşleşmez)
 * - 'ü' <-> 'Ü' ('u' veya 'U' ile ASLA eşleşmez)
 */
export function toExactTurkishLower(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toString()
    .normalize('NFC')
    .replace(/i\u0307/g, 'i')
    .replace(/I\u0307/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/Ç/g, 'ç')
    .replace(/Ğ/g, 'ğ')
    .replace(/Ö/g, 'ö')
    .replace(/Ş/g, 'ş')
    .replace(/Ü/g, 'ü')
    .toLocaleLowerCase('tr-TR')
    .replace(/\u0307/g, '');
}

/**
 * Normalizes text specifically for 100% Turkish-character compliant search matching.
 * Preserves all Turkish letters (ç, ğ, ı, i, ö, ş, ü) distinctly while normalizing case
 * according to Turkish grammar rules ('İ' -> 'i', 'I' -> 'ı', 'Ş' -> 'ş', 'S' -> 's', etc.).
 */
export function normalizeTurkishForSearch(text: string | null | undefined): string {
  if (!text) return '';
  return toExactTurkishLower(text)
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Normalizes a name string specifically for exact ("birebir") 100% Turkish character matching.
 * Preserves distinct Turkish letters (ı !== i, ş !== s, ç !== c, ğ !== g, ö !== o, ü !== u),
 * removes punctuation, collapses multiple spaces, and trims.
 */
export function normalizeTurkishNameForExactMatch(name: string | null | undefined): string {
  if (!name) return '';
  return toExactTurkishLower(name)
    .replace(/[^a-z0-9çğıöşüâîû\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Checks whether a beneficiary record matches a search query:
 * - Searches ONLY in TC Kimlik No (`tc_no`) and Hak Sahibi / Adı Soyadı (`ad_soyad` / `hak_sahibi`).
 * - Strictly DOES NOT search in addresses (`acik_adres`, `mahalle`, `sokak`, `hane_no`), phone numbers, or notes.
 * - 100% Turkish character compliant:
 *   - 'ı' / 'I' only matches 'ı' / 'I' (never 'i' / 'İ')
 *   - 'i' / 'İ' only matches 'i' / 'İ' (never 'ı' / 'I')
 *   - 'ş' / 'Ş' only matches 'ş' / 'Ş' (never 's' / 'S')
 *   - 's' / 'S' only matches 's' / 'S' (never 'ş' / 'Ş')
 *   - 'ç' / 'Ç', 'ğ' / 'Ğ', 'ö' / 'Ö', 'ü' / 'Ü' only match their own Turkish letter.
 */
export function isBirebirBeneficiaryMatch(
  record: { tc_no?: any; ad_soyad?: any; hak_sahibi?: any } | null | undefined,
  query: string | null | undefined
): boolean {
  if (!query || !query.trim() || !record) return false;
  const rawQ = query.trim();

  // 1. TC Kimlik No Eşleşmesi (Yalnızca tc_no alanında arama yapar)
  const qDigits = rawQ.replace(/\D/g, '');
  const isPureDigits = /^\d+$/.test(rawQ.replace(/\s+/g, ''));
  if (isPureDigits && qDigits.length > 0 && record.tc_no) {
    const recordTcDigits = String(record.tc_no).replace(/\D/g, '');
    if (recordTcDigits) {
      if (qDigits.length === 11 && recordTcDigits === qDigits) {
        return true;
      }
      if (recordTcDigits.includes(qDigits)) {
        return true;
      }
    }
  }

  // Eğer kullanıcı sadece rakam girdiyse isim alanında aramaya gerek yok
  if (isPureDigits) {
    return false;
  }

  // 2. Hak Sahibi / Adı Soyadı Eşleşmesi (%100 Türkçe Karakter Uyumlu)
  const rawName = record.ad_soyad || record.hak_sahibi || '';
  if (rawName) {
    const normTarget = normalizeTurkishNameForExactMatch(String(rawName));
    const normQuery = normalizeTurkishNameForExactMatch(rawQ);

    if (normTarget && normQuery) {
      if (normTarget === normQuery) {
        return true;
      }

      const queryTerms = normQuery.split(' ').filter(Boolean);
      if (queryTerms.length > 0) {
        // Kullanıcının girdiği her arama kelimesi (%100 Türkçe karakter uyumuyla) Ad Soyad içinde yer almalıdır
        const allTermsFound = queryTerms.every((term) => normTarget.includes(term));
        if (allTermsFound) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Builds a regex pattern that matches exact Turkish uppercase/lowercase pairs
 * without conflating Turkish letters with ASCII letters (e.g., 'ı' -> '[ıI]', 'i' -> '[iİ]', 'ş' -> '[şŞ]', 's' -> '[sS]').
 */
export function buildTurkishRegexPattern(text: string): string {
  if (!text) return '';
  return toExactTurkishLower(text)
    .split('')
    .map((ch) => {
      if (/\s/.test(ch)) return '\\s+';
      switch (ch) {
        case 'a':
          return '[aA]';
        case 'c':
          return '[cC]';
        case 'ç':
          return '[çÇ]';
        case 'g':
          return '[gG]';
        case 'ğ':
          return '[ğĞ]';
        case 'ı':
          return '[ıI]';
        case 'i':
          return '[iİ]';
        case 'o':
          return '[oO]';
        case 'ö':
          return '[öÖ]';
        case 's':
          return '[sS]';
        case 'ş':
          return '[şŞ]';
        case 'u':
          return '[uU]';
        case 'ü':
          return '[üÜ]';
        default:
          return ch.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&');
      }
    })
    .join('');
}

/**
 * Builds a MongoDB query filter for exact Turkish character search across TC and Ad Soyad.
 */
export function buildTurkishSearchFilter(
  query: string,
  fields: string[] = ['tc_no', 'ad_soyad']
): any {
  const terms = (query || '').trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return {};

  const andClauses = terms.map((term) => {
    const pattern = buildTurkishRegexPattern(term);
    const reg = new RegExp(pattern);
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
 * 100% respecting Turkish character distinctions (ı !== i, ş !== s, ç !== c, ğ !== g, ö !== o, ü !== u).
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
 * Checks whether an object record matches a search query across the specified fields
 * with 100% Turkish character fidelity.
 */
export function turkishRecordMatches(
  record: Record<string, any>,
  fields: string[] = ['tc_no', 'ad_soyad'],
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
export const EDIRNE_VILLAGES_LIST = [
  'Ahi Köyü', 'Avarız Köyü', 'Bosna Köyü', 'Budakdoğanca Köyü', 'Büyükdöllük Köyü',
  'Büyükismailçe Köyü', 'Değirmenyeni Köyü', 'Demirhanlı Köyü', 'Doyran Köyü', 'Ekmekçi Köyü',
  'Elçili Köyü', 'Eskikadın Köyü', 'Hacıumur Köyü', 'Hasanağa Köyü', 'Hatipköy Köyü',
  'Hıdırağa Köyü', 'İskender Köyü', 'Karabulut Köyü', 'Karakasım Köyü', 'Karayusuf Köyü',
  'Kemal Köyü', 'Korucu Köyü', 'Köşençiftliği Köyü', 'Küçükdöllük Köyü', 'Menekşesofular Köyü',
  'Muratçalı Köyü', 'Musabeyli Köyü', 'Orhaniye Köyü', 'Sarayakpınar Köyü', 'Sazlıdere Köyü',
  'Suakacağı Köyü', 'Tayakadın Köyü', 'Uzgaç Köyü', 'Üyüklütatar Köyü', 'Yenikadın Köyü',
  'Yolüstü Köyü',
] as const;

export const EDIRNE_NEIGHBORHOODS_LIST = [
  '1. Murat Mah.', '100. Yıl Mah.', 'Abdurrahman Mah.', 'Atatürk Mah.', 'Babademirtaş Mah.',
  'Barutluk Mah.', 'Cumhuriyet Mah.', 'Çavuşbey Mah.', 'Dilaverbey Mah.', 'Fatih Mah.',
  'İstasyon Mah.', 'Karaağaç Mah.', 'Koca Sinan Mah.', 'Medrese Ali Bey Mah.', 'Menzilahır Mah.',
  'Meydan Mah.', 'Mithat Paşa Mah.', 'Nişancıpaşa Mah.', 'Sabuni Mah.', 'Sarıcapaşa Mah.',
  'Şükrüpaşa Mah.', 'Talatpaşa Mah.', 'Umurbey Mah.', 'Yancıkçı Şahin Mah.', 'Yeniimaret Mah.',
  'Yıldırım Beyazıt Mah.', 'Yıldırım Hacı Sarraf Mah.',
] as const;

export const EDIRNE_VILLAGE_LOOKUP: Record<string, string> = {
  'ahi': 'Ahi Köyü',
  'avariz': 'Avarız Köyü',
  'avarız': 'Avarız Köyü',
  'bosna': 'Bosna Köyü',
  'bosnakoy': 'Bosna Köyü',
  'bosnaköy': 'Bosna Köyü',
  'budakdoganca': 'Budakdoğanca Köyü',
  'budakdoğanca': 'Budakdoğanca Köyü',
  'buyukdolluk': 'Büyükdöllük Köyü',
  'büyükdöllük': 'Büyükdöllük Köyü',
  'buyukismailce': 'Büyükismailçe Köyü',
  'büyükismailce': 'Büyükismailçe Köyü',
  'büyükismailçe': 'Büyükismailçe Köyü',
  'degirmenyeni': 'Değirmenyeni Köyü',
  'degirmenyani': 'Değirmenyeni Köyü',
  'degirmenyanı': 'Değirmenyeni Köyü',
  'değirmenyeni': 'Değirmenyeni Köyü',
  'değirmenyani': 'Değirmenyeni Köyü',
  'değirmenyanı': 'Değirmenyeni Köyü',
  'demirhanli': 'Demirhanlı Köyü',
  'demirhanlı': 'Demirhanlı Köyü',
  'doyran': 'Doyran Köyü',
  'ekmekci': 'Ekmekçi Köyü',
  'ekmekçi': 'Ekmekçi Köyü',
  'elcili': 'Elçili Köyü',
  'elçili': 'Elçili Köyü',
  'eskikadin': 'Eskikadın Köyü',
  'eskikadın': 'Eskikadın Köyü',
  'haciumur': 'Hacıumur Köyü',
  'hacıumur': 'Hacıumur Köyü',
  'hasanaga': 'Hasanağa Köyü',
  'hasanağa': 'Hasanağa Köyü',
  'hatip': 'Hatipköy Köyü',
  'hatipkoy': 'Hatipköy Köyü',
  'hatipköy': 'Hatipköy Köyü',
  'hidirağa': 'Hıdırağa Köyü',
  'hıdırağa': 'Hıdırağa Köyü',
  'hidıraga': 'Hıdırağa Köyü',
  'hıdıraga': 'Hıdırağa Köyü',
  'iskender': 'İskender Köyü',
  'karabulut': 'Karabulut Köyü',
  'karakasim': 'Karakasım Köyü',
  'karakasım': 'Karakasım Köyü',
  'karayusuf': 'Karayusuf Köyü',
  'kemal': 'Kemal Köyü',
  'kemalkoy': 'Kemal Köyü',
  'kemalköy': 'Kemal Köyü',
  'korucu': 'Korucu Köyü',
  'kosen': 'Köşençiftliği Köyü',
  'köşen': 'Köşençiftliği Köyü',
  'kosenciftligi': 'Köşençiftliği Köyü',
  'köşençiftliği': 'Köşençiftliği Köyü',
  'kucukdolluk': 'Küçükdöllük Köyü',
  'küçükdöllük': 'Küçükdöllük Köyü',
  'meneksesofular': 'Menekşesofular Köyü',
  'menekşesofular': 'Menekşesofular Köyü',
  'muratcali': 'Muratçalı Köyü',
  'muratçalı': 'Muratçalı Köyü',
  'musabeyli': 'Musabeyli Köyü',
  'orhaniye': 'Orhaniye Köyü',
  'sarayakpinar': 'Sarayakpınar Köyü',
  'sarayakpınar': 'Sarayakpınar Köyü',
  'sazlidere': 'Sazlıdere Köyü',
  'sazlıdere': 'Sazlıdere Köyü',
  'suakacagi': 'Suakacağı Köyü',
  'suakacağı': 'Suakacağı Köyü',
  'tayakadin': 'Tayakadın Köyü',
  'tayakadın': 'Tayakadın Köyü',
  'uzgac': 'Uzgaç Köyü',
  'uzgaç': 'Uzgaç Köyü',
  'uyuklutatar': 'Üyüklütatar Köyü',
  'üyüklütatar': 'Üyüklütatar Köyü',
  'yenikadin': 'Yenikadın Köyü',
  'yenikadın': 'Yenikadın Köyü',
  'yolustu': 'Yolüstü Köyü',
  'yolüstü': 'Yolüstü Köyü',
};

export const EDIRNE_MAHALLE_LOOKUP: Record<string, string> = {
  '1. murat': '1. Murat Mah.',
  '1 murat': '1. Murat Mah.',
  '1.murat': '1. Murat Mah.',
  '100. yıl': '100. Yıl Mah.',
  '100 yıl': '100. Yıl Mah.',
  '100.yıl': '100. Yıl Mah.',
  'abdurrahman': 'Abdurrahman Mah.',
  'ataturk': 'Atatürk Mah.',
  'atatürk': 'Atatürk Mah.',
  'babademirtas': 'Babademirtaş Mah.',
  'babademirtaş': 'Babademirtaş Mah.',
  'barutluk': 'Barutluk Mah.',
  'cavusbey': 'Çavuşbey Mah.',
  'çavuşbey': 'Çavuşbey Mah.',
  'cumhuriyet': 'Cumhuriyet Mah.',
  'dilaverbey': 'Dilaverbey Mah.',
  'fatih': 'Fatih Mah.',
  'istasyon': 'İstasyon Mah.',
  'karaagac': 'Karaağaç Mah.',
  'karaağaç': 'Karaağaç Mah.',
  'koca sinan': 'Koca Sinan Mah.',
  'kocasinan': 'Koca Sinan Mah.',
  'medrese ali bey': 'Medrese Ali Bey Mah.',
  'medrese alibey': 'Medrese Ali Bey Mah.',
  'menzilahir': 'Menzilahır Mah.',
  'menzilahır': 'Menzilahır Mah.',
  'meydan': 'Meydan Mah.',
  'mithat pasa': 'Mithat Paşa Mah.',
  'mithat paşa': 'Mithat Paşa Mah.',
  'mithatpasa': 'Mithat Paşa Mah.',
  'mithatpaşa': 'Mithat Paşa Mah.',
  'nisancipasa': 'Nişancıpaşa Mah.',
  'nişancıpaşa': 'Nişancıpaşa Mah.',
  'sabuni': 'Sabuni Mah.',
  'saricapasa': 'Sarıcapaşa Mah.',
  'sarıcapaşa': 'Sarıcapaşa Mah.',
  'sukrupasa': 'Şükrüpaşa Mah.',
  'şükrüpaşa': 'Şükrüpaşa Mah.',
  'talatpasa': 'Talatpaşa Mah.',
  'talatpaşa': 'Talatpaşa Mah.',
  'umurbey': 'Umurbey Mah.',
  'yancikci sahin': 'Yancıkçı Şahin Mah.',
  'yancıkçı şahin': 'Yancıkçı Şahin Mah.',
  'yeniimaret': 'Yeniimaret Mah.',
  'yeni imaret': 'Yeniimaret Mah.',
  'yildirim beyazit': 'Yıldırım Beyazıt Mah.',
  'yıldırım beyazıt': 'Yıldırım Beyazıt Mah.',
  'yildirim haci sarraf': 'Yıldırım Hacı Sarraf Mah.',
  'yıldırım hacı sarraf': 'Yıldırım Hacı Sarraf Mah.',
};

/**
 * Normalizes neighborhood name ensuring standard canonical format:
 * - "100. Yıl Mahallesi", "100.Yıl Mah.", "100 Yıl", "Yıl Mahallesi", "Yıl Mah.", "Yıl" -> "100. Yıl Mah."
 * - "Cumhuriyet Mahallesi", "Cumhuriyet" -> "Cumhuriyet Mah."
 * - "Dereköy Köyü", "Dereköy" (if village) -> "Dereköy Köyü"
 * - Returns '' if empty or if generic district name ("Merkez", "Edirne Merkez"). NEVER creates artificial "Merkez Mah."!
 */
export function normalizeMahalleName(name: string | null | undefined): string {
  if (!name) return '';
  let clean = name.toString().trim();
  if (/^(?:Edirne\s+)?Merkez(?:\s+Mahallesi|\s+Mah\.?|\s+Mh\.?)?$/i.test(clean)) {
    return '';
  }

  // If village suffix included
  if (/(?:Köyü|Koy|Koyu)$/i.test(clean)) {
    const cleanK = clean.replace(/\s+(?:Köyü|Koy|Koyu)$/i, '').trim();
    const lowerK = cleanK.toLocaleLowerCase('tr-TR');
    if (EDIRNE_VILLAGE_LOOKUP[lowerK]) {
      return EDIRNE_VILLAGE_LOOKUP[lowerK];
    }
    return toTitleCaseTurkish(cleanK) + ' Köyü';
  }

  // Check known Edirne village lookup
  const lowerVillage = clean.toLocaleLowerCase('tr-TR').replace(/\s+(?:[Mm][Aa][Hh][Aa][Ll][Ll][Ee][Ss][İiIı]|[Mm][Aa][Hh]\.?|[Mm][Hh]\.?)$/i, '').trim();
  if (EDIRNE_VILLAGE_LOOKUP[lowerVillage]) {
    return EDIRNE_VILLAGE_LOOKUP[lowerVillage];
  }

  // Check known Edirne mahalle lookup
  if (EDIRNE_MAHALLE_LOOKUP[lowerVillage]) {
    return EDIRNE_MAHALLE_LOOKUP[lowerVillage];
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
 * Strictly avoids creating artificial "Merkez Mah."!
 */
export function detectSettlement(
  rawMahalle?: string | null,
  rawKoy?: string | null,
  acikAdres?: string | null
): { name: string; type: 'MAHALLE' | 'KOY' } {
  let m = (rawMahalle || '').toString().trim();
  let k = (rawKoy || '').toString().trim();
  let addr = (acikAdres || '').toString().trim();

  // "Merkez" is the district, not a neighborhood
  if (/^(?:Edirne\s+)?Merkez(?:\s+Mahallesi|\s+Mah\.?|\s+Mh\.?)?$/i.test(m)) {
    m = '';
  }

  // 1. Explicit Village column
  if (k) {
    let cleanK = k.replace(/\s+(?:Köyü|Koy|Koyu)$/i, '').trim();
    if (cleanK && !/^(?:Edirne\s+)?Merkez$/i.test(cleanK)) {
      const lowerK = cleanK.toLocaleLowerCase('tr-TR');
      if (EDIRNE_VILLAGE_LOOKUP[lowerK]) return { name: EDIRNE_VILLAGE_LOOKUP[lowerK], type: 'KOY' };
      return { name: toTitleCaseTurkish(cleanK) + ' Köyü', type: 'KOY' };
    }
  }

  // 2. Explicit Mahalle column
  if (m) {
    if (/(?:Köyü|Koy|Koyu)$/i.test(m)) {
      let cleanK = m.replace(/\s+(?:Köyü|Koy|Koyu)$/i, '').trim();
      const lowerK = cleanK.toLocaleLowerCase('tr-TR');
      if (EDIRNE_VILLAGE_LOOKUP[lowerK]) return { name: EDIRNE_VILLAGE_LOOKUP[lowerK], type: 'KOY' };
      return { name: toTitleCaseTurkish(cleanK) + ' Köyü', type: 'KOY' };
    }
    const lowerM = m.toLocaleLowerCase('tr-TR').replace(/\s+(?:[Mm][Aa][Hh][Aa][Ll][Ll][Ee][Ss][İiIı]|[Mm][Aa][Hh]\.?|[Mm][Hh]\.?)$/i, '').trim();
    if (EDIRNE_VILLAGE_LOOKUP[lowerM]) return { name: EDIRNE_VILLAGE_LOOKUP[lowerM], type: 'KOY' };
    if (EDIRNE_MAHALLE_LOOKUP[lowerM]) return { name: EDIRNE_MAHALLE_LOOKUP[lowerM], type: 'MAHALLE' };
    const normM = normalizeMahalleName(m);
    if (normM) return { name: normM, type: 'MAHALLE' };
  }

  // 3. Inspect open address
  if (addr) {
    const cleanAddr = addr.replace(/_\d+/g, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();

    // 3a. Specifically check 100. Yıl or Yıl Mahallesi in open address
    if (
      /(?:100\s*\.?\s*y[ıi]l|y[uü]z[uü]nc[uü]\s*y[ıi]l)\s*(?:[Mm][Aa][Hh][Aa][Ll][Ll][Ee][Ss][İiIı]|[Mm][Aa][Hh]\.?|[Mm][Hh]\.?)?/i.test(cleanAddr) ||
      /\b(?:y[ıi]l)\s+(?:[Mm][Aa][Hh][Aa][Ll][Ll][Ee][Ss][İiIı]|[Mm][Aa][Hh]\.?|[Mm][Hh]\.?)/i.test(cleanAddr)
    ) {
      return { name: '100. Yıl Mah.', type: 'MAHALLE' };
    }

    // 3b. Check if first word of address is a known Edirne village
    const words = cleanAddr.split(/\s+/);
    const firstWordClean = (words[0] || '').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]/g, '');
    if (EDIRNE_VILLAGE_LOOKUP[firstWordClean]) {
      return { name: EDIRNE_VILLAGE_LOOKUP[firstWordClean], type: 'KOY' };
    }

    // 3c. Check if first words match a known Edirne neighborhood
    const firstTwoWords = `${firstWordClean} ${(words[1] || '').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]/g, '')}`.trim();
    if (EDIRNE_MAHALLE_LOOKUP[firstTwoWords]) {
      return { name: EDIRNE_MAHALLE_LOOKUP[firstTwoWords], type: 'MAHALLE' };
    }
    if (EDIRNE_MAHALLE_LOOKUP[firstWordClean]) {
      return { name: EDIRNE_MAHALLE_LOOKUP[firstWordClean], type: 'MAHALLE' };
    }

    // 3d. Check explicit "X Köyü" in open address
    const koyMatch = cleanAddr.match(/([A-Za-zÇŞĞÜÖİçşğüöı\s]+?)\s+(?:Köyü|Koyu|Köy\b)/i);
    if (koyMatch && koyMatch[1].trim().length > 1) {
      const cand = koyMatch[1].trim().toLocaleLowerCase('tr-TR');
      if (EDIRNE_VILLAGE_LOOKUP[cand]) return { name: EDIRNE_VILLAGE_LOOKUP[cand], type: 'KOY' };
      return { name: toTitleCaseTurkish(koyMatch[1].trim()) + ' Köyü', type: 'KOY' };
    }

    // 3e. Check Küme Evleri village in address
    const kumeMatch = cleanAddr.match(/([A-Za-zÇŞĞÜÖİçşğüöı]+?)\s+(?:[A-Za-zÇŞĞÜÖİçşğüöı]+\s+)?K[üu]me\s+Evleri/i);
    if (kumeMatch && kumeMatch[1].trim().length > 1) {
      const cand = kumeMatch[1].trim().toLocaleLowerCase('tr-TR');
      if (EDIRNE_VILLAGE_LOOKUP[cand]) return { name: EDIRNE_VILLAGE_LOOKUP[cand], type: 'KOY' };
    }

    // 3f. Numbered neighborhood check in open address e.g. "1. Murat Mah."
    const numMahMatch = cleanAddr.match(/(?:^|[,\s;])(\d{1,3}\.?\s+[A-Za-zÇŞĞÜÖİçşğüöı\s]+?)\s+(?:[Mm][Aa][Hh][Aa][Ll][Ll][Ee][Ss][İiIı]|[Mm][Aa][Hh]\.?|[Mm][Hh]\.?)\b/i);
    if (numMahMatch && numMahMatch[1].trim().length > 1) {
      const cand = numMahMatch[1].trim().toLocaleLowerCase('tr-TR');
      if (EDIRNE_MAHALLE_LOOKUP[cand]) return { name: EDIRNE_MAHALLE_LOOKUP[cand], type: 'MAHALLE' };
      const nm = normalizeMahalleName(numMahMatch[1].trim());
      if (nm) return { name: nm, type: 'MAHALLE' };
    }

    // 3g. General neighborhood check in open address e.g. "Barutluk Mah."
    const mahMatch = cleanAddr.match(/(?:^|[,\s;])([A-Za-z0-9ÇŞĞÜÖİçşğüöı\s.]+?)\s+(?:[Mm][Aa][Hh][Aa][Ll][Ll][Ee][Ss][İiIı]|[Mm][Aa][Hh]\.?|[Mm][Hh]\.?)\b/i);
    if (mahMatch && mahMatch[1].trim().length > 1) {
      const candidate = mahMatch[1].trim().replace(/^[,\s.-]+/, '');
      const candLower = candidate.toLocaleLowerCase('tr-TR');
      if (EDIRNE_MAHALLE_LOOKUP[candLower]) return { name: EDIRNE_MAHALLE_LOOKUP[candLower], type: 'MAHALLE' };
      const nm = normalizeMahalleName(candidate);
      if (nm) return { name: nm, type: 'MAHALLE' };
    }

    // 3h. Search whole address for known Edirne village or neighborhood names
    const lowerAddr = cleanAddr.toLocaleLowerCase('tr-TR');
    for (const [vKey, vVal] of Object.entries(EDIRNE_VILLAGE_LOOKUP)) {
      if (lowerAddr.includes(vKey)) return { name: vVal, type: 'KOY' };
    }
    for (const [mKey, mVal] of Object.entries(EDIRNE_MAHALLE_LOOKUP)) {
      if (lowerAddr.includes(mKey)) return { name: mVal, type: 'MAHALLE' };
    }
  }

  return { name: 'Genel (Belirtilmemiş)', type: 'MAHALLE' };
}

/**
 * Extracts and cleans street/cadde name and door/apartment number from address.
 * Enables natural sorting (1, 2, 3... 10, 14, 28) and street-level filtering.
 * Ignores cadastre/GIS revision suffix like 2._2 SK. -> 2. Sok.
 * Avoids labeling urban neighborhood addresses as "Köy İçi".
 */
export function extractStreetAndDoor(
  acikAdres?: string | null,
  rawStreet?: string | null,
  rawHane?: string | null,
  mahalleName?: string | null
): {
  sokak: string;
  kapiNo: string | number;
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

  const isVillage = mahalleName ? /(?:Köyü|Koy|Koyu)$/i.test(mahalleName) : /(?:Köyü|Koy|Koyu)/i.test(addr);

  // If explicitStreet is a placeholder / previous fallback or mistakenly labeled as "Köy İçi" in a neighborhood:
  if (
    /(?:k[oö]y\s+[iı]çi|mahalle\s+[iı]çi|belirtilmemi[sş])/i.test(explicitStreet) ||
    (!isVillage && /k[oö]y/i.test(explicitStreet))
  ) {
    explicitStreet = '';
  }

  // Strip GIS / Cadastral revision tokens like _2, _1, _ in explicitStreet
  if (explicitStreet) {
    explicitStreet = explicitStreet
      .replace(/_\d+/g, '')
      .replace(/_+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  let street = '';

  // First priority: Extract clean street and door from full open address (acikAdres)
  if (addr) {
    let clean = addr;
    // Strip CAD / GIS revision indicators like 2._2 SK. -> 2. SK. or TAVANLI ÇEŞME_ -> TAVANLI ÇEŞME
    clean = clean
      .replace(/_\d+/g, '')
      .replace(/_+/g, ' ')
      .replace(/\s+/g, ' ');

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

      let prefix = sm[1].replace(/^[,\s.-]+/, '').replace(/_\d+/g, '').replace(/_+/g, ' ').trim();
      prefix = prefix.replace(/.*(?:Mahallesi|Mah\.|Mh\.|Köyü|Koy|Koyu)\s*/i, '').trim();
      prefix = prefix.replace(/^(?:Edirne\s+)?Merkez\s*/i, '').trim();

      if (/^\d+$/.test(prefix)) {
        prefix = prefix + '.';
      }

      street = (prefix ? prefix + ' ' : '') + suffix;
    }
  }

  // If street not found from addr, check explicitStreet
  if (!street && explicitStreet) {
    street = explicitStreet;
    street = street
      .replace(/\b(?:caddesi|cad\.?|cd\.?)\b/gi, 'Cad.')
      .replace(/\b(?:sokağı|sokagi|sokak|sok\.?|sk\.?)\b/gi, 'Sok.')
      .replace(/\b(?:bulvarı|bulvari|bulvar|blv\.?)\b/gi, 'Bulvarı')
      .replace(/\b(?:küme\s+evleri|kume\s+evleri)\b/gi, 'Küme Evleri');

    if (!/(?:Cad\.|Sok\.|Bulvarı|Mevkii|Küme Evleri|Yolu)\b/i.test(street)) {
      if (/cad/i.test(street)) street += ' Cad.';
      else if (/sok|sk/i.test(street)) street += ' Sok.';
      else if (/^\d+\.?$/.test(street)) street = street.replace(/\.$/, '') + '. Sok.';
    } else {
      street = street.replace(/^(\d+)\s+(Sok\.|Cad\.)/i, '$1. $2');
    }
  }

  let villageName = '';
  if (isVillage) {
    if (mahalleName && /(?:Köyü|Koy|Koyu)$/i.test(mahalleName)) {
      villageName = mahalleName;
    } else if (addr) {
      const det = detectSettlement(null, null, addr);
      if (det.type === 'KOY') villageName = det.name;
    }
  }

  // Fallback if still no street identified, or if village record
  if (isVillage) {
    // Köylerde sokak ismi olmadığı için "Köy İçi" yerine doğrudan köy adı yazılır
    if (
      !street ||
      /k[oö]y\s+[iı]çi/i.test(street) ||
      /(?:küme\s+evleri|kume\s+evleri|mevkii|mevki|yolu)/i.test(street) ||
      !/(?:Cad\.|Sok\.)\b/i.test(street)
    ) {
      street = villageName || street || 'Köy';
    }
  } else {
    if (!street || /k[oö]y\s+[iı]çi/i.test(street)) {
      street = 'Mahalle İçi / Cadde-Sokak Belirtilmemiş';
    }
  }

  // Extract door and apartment numbers
  let door: string | number = 999999;
  let apt = 0;

  if (addr) {
    const doorParsed = extractDoorAndSuffix(addr);
    if (doorParsed) {
      door = doorParsed.doorStr;
      if (doorParsed.daire) apt = doorParsed.daire;
    }
  }

  // 2. Eğer açık adreste kapı no bulunamadıysa ve harici açık bir kapı no (rawHane / explicitDoor) verilmişse kullan
  // (NOT: Hane dosya numarası kapı numarası yerine KULLANILMAZ!)
  if ((door === 999999 || door === '999999') && rawHane !== undefined && rawHane !== null) {
    const strExp = String(rawHane).trim();
    if (strExp && strExp !== '999999') {
      const expParsed = extractDoorAndSuffix(strExp);
      if (expParsed) {
        door = expParsed.doorStr;
        if (expParsed.daire && apt === 0) apt = expParsed.daire;
      }
    }
  }

  // Extract apartment number (Daire No / İç Kapı No) if not already extracted
  // NOT: \bD\b ve \bD\. sınır kontrolü zorunludur; aksi halde "CAD." sonundaki "D." daire sanılıyordu!
  if (apt === 0 && addr) {
    const aptMatch =
      addr.match(/(?:İç\s*Kapı|Ic\s*Kapi|Daire|\bD\b|\bD\.)\s*(?:No|Numarası|Numarasi)?\s*[:.]?\s*(\d+)/i) ||
      addr.match(/(?:No\s*[:.]?\s*\d+\s*[\/-]\s*)\s*(\d+)(?!\/\d)/i);
    if (aptMatch) {
      apt = parseInt(aptMatch[1], 10);
    }
  }

  return { sokak: street, kapiNo: door, daireNo: apt };
}

/**
 * Helper to extract door number, optional block letter (e.g. 7D, 14A, 34),
 * and 3-part / 2-part slash formats:
 * - 3-part slash (e.g. 34/3/7) -> door: 34, daire: 7 (middle number is ignored)
 * - 2-part slash (e.g. 34/7) -> door: 34, daire: 7
 */
export function extractDoorAndSuffix(addr: string): {
  doorStr: string;
  doorNum: number;
  daire?: number;
} | null {
  if (!addr) return null;

  // Pattern 0: Three-part slash (No: 34/3/7, 34A/3/7, No: 34 / 3 / 7)
  // First is Door, Middle number is ignored per requirement, Last number is Daire
  const threePartSlash =
    addr.match(/(?:Dış\s*Kapı|Dis\s*Kapi|Kapı|Kapi|Bina|Hane\s*Kapı|Hane\s*Kapi|No)\s*[:.]?\s*(\d+\s*[-/]?\s*[A-Za-zÇŞĞÜÖİçşğüöı]?|\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)(?!\d)/i) ||
    addr.match(/(?:Sokağı|Sokak|Sok\.|Sok|Sk\.|Sk|Caddesi|Cad\.|Cad|Cd\.|Cd|Bulvarı|Bulvar|Küme\s+Evleri|Yolu)\s*[:.]?\s*(?:No[:.]?\s*)?(\d+\s*[-/]?\s*[A-Za-zÇŞĞÜÖİçşğüöı]?|\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)(?!\d)/i) ||
    addr.match(/\b(\d+\s*[-/]?\s*[A-Za-zÇŞĞÜÖİçşğüöı]?|\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)(?!\d)/i);

  if (threePartSlash) {
    const rawDoor = threePartSlash[1].replace(/[\s\/-]/g, '').toLocaleUpperCase('tr');
    const num = parseInt(rawDoor.replace(/[^0-9]/g, ''), 10);
    return {
      doorStr: rawDoor,
      doorNum: num,
      daire: parseInt(threePartSlash[3], 10) || 0,
    };
  }

  // Pattern 0.5: Two-part slash with explicit No/Kapı/Sokak prefix (e.g. No: 34/7) -> Door/Daire
  const twoPartSlash =
    addr.match(/(?:Dış\s*Kapı|Dis\s*Kapi|Kapı|Kapi|Bina|Hane\s*Kapı|Hane\s*Kapi|No)\s*[:.]?\s*(\d+\s*[-/]?\s*[A-Za-zÇŞĞÜÖİçşğüöı]?|\d+)\s*\/\s*(\d+)(?!\s*\/\s*\d|\d)/i) ||
    addr.match(/(?:Sokağı|Sokak|Sok\.|Sok|Sk\.|Sk|Caddesi|Cad\.|Cad|Cd\.|Cd|Bulvarı|Bulvar|Küme\s+Evleri|Yolu)\s*[:.]?\s*(?:No[:.]?\s*)?(\d+\s*[-/]?\s*[A-Za-zÇŞĞÜÖİçşğüöı]?|\d+)\s*\/\s*(\d+)(?!\s*\/\s*\d|\d)/i);

  if (twoPartSlash) {
    const rawDoor = twoPartSlash[1].replace(/[\s\/-]/g, '').toLocaleUpperCase('tr');
    const num = parseInt(rawDoor.replace(/[^0-9]/g, ''), 10);
    return {
      doorStr: rawDoor,
      doorNum: num,
      daire: parseInt(twoPartSlash[2], 10) || 0,
    };
  }

  // Pattern 1: No: 7 D Blok, No: 7 Blok D, No: 7-D Blok, No: 7/D Blok, No: 7 D. Blok
  const blockMatch =
    addr.match(/(?:Dış\s*Kapı|Dis\s*Kapi|Kapı|Kapi|Bina|Hane\s*Kapı|Hane\s*Kapi|No)\s*(?:No|Numarası|Numarasi)?\s*[:.]?\s*(\d+)\s*(?:[-/]?\s*([A-Za-zÇŞĞÜÖİçşğüöı])\s*(?:[-.]?\s*Blok\b)|(?:[-.]?\s*Blok\s*[:.]?\s*([A-Za-zÇŞĞÜÖİçşğüöı])))/i) ||
    addr.match(/(?:Sokağı|Sokak|Sok\.|Sok|Sk\.|Sk|Caddesi|Cad\.|Cad|Cd\.|Cd|Bulvarı|Bulvar|Küme\s+Evleri|Yolu)\s*[:.]?\s*(?:No[:.]?\s*)?(\d+)\s*(?:[-/]?\s*([A-Za-zÇŞĞÜÖİçşğüöı])\s*(?:[-.]?\s*Blok\b)|(?:[-.]?\s*Blok\s*[:.]?\s*([A-Za-zÇŞĞÜÖİçşğüöı])))/i);

  if (blockMatch) {
    const num = parseInt(blockMatch[1], 10);
    const letter = (blockMatch[2] || blockMatch[3] || '').toLocaleUpperCase('tr');
    if (letter) {
      return { doorStr: `${num}${letter}`, doorNum: num };
    }
  }

  // Pattern 2: No: 7D, No: 7-D, No: 7/D, No: 7 D
  // (Single letter attached or separated by - or / or space, NOT followed by colon or word characters)
  // Negative lookahead: (?![A-Za-zÇŞĞÜÖİçşğüöı:]|\s*[:=]) ensures it won't match "7 D: 3" or "7 Daire"
  const directLetterMatch =
    addr.match(/(?:Dış\s*Kapı|Dis\s*Kapi|Kapı|Kapi|Bina|Hane\s*Kapı|Hane\s*Kapi|No)\s*(?:No|Numarası|Numarasi)?\s*[:.]?\s*(\d+)\s*[-/]?\s*([A-Za-zÇŞĞÜÖİçşğüöı])(?![A-Za-zÇŞĞÜÖİçşğüöı:]|\s*[:=])/i) ||
    addr.match(/(?:Sokağı|Sokak|Sok\.|Sok|Sk\.|Sk|Caddesi|Cad\.|Cad|Cd\.|Cd|Bulvarı|Bulvar|Küme\s+Evleri|Yolu)\s*[:.]?\s*(?:No[:.]?\s*)?(\d+)\s*[-/]?\s*([A-Za-zÇŞĞÜÖİçşğüöı])(?![A-Za-zÇŞĞÜÖİçşğüöı:]|\s*[:=])/i);

  if (directLetterMatch) {
    const num = parseInt(directLetterMatch[1], 10);
    const letter = directLetterMatch[2].toLocaleUpperCase('tr');
    return { doorStr: `${num}${letter}`, doorNum: num };
  }

  // Pattern 3: Standard numeric door number (No: 7, Kapı: 14, Sokak 12)
  const numMatch =
    addr.match(/(?:Dış\s*Kapı|Dis\s*Kapi|Kapı|Kapi|Bina|Hane\s*Kapı|Hane\s*Kapi|No)\s*(?:No|Numarası|Numarasi)?\s*[:.]?\s*(\d+)/i) ||
    addr.match(/(?:Sokağı|Sokak|Sok\.|Sok|Sk\.|Sk|Caddesi|Cad\.|Cad|Cd\.|Cd|Bulvarı|Bulvar|Küme\s+Evleri|Yolu)\s*[:.]?\s*(?:No[:.]?\s*)?(\d+)/i) ||
    addr.match(/\b(\d+)\s*(?:\/|\s+Daire|\s+D:|\s*Kat)/i);

  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    return { doorStr: String(num), doorNum: num };
  }

  return null;
}

/**
 * Helper to get clean street info from any beneficiary record
 */
export function getRecordStreetInfo(record: Record<string, any> | null | undefined): {
  sokak: string;
  kapiNo: string | number;
  daireNo: number;
} {
  const isVillage = record?.mahalle ? /(?:Köyü|Koy|Koyu)$/i.test(record.mahalle) : (record?.yerlesim_tipi === 'KOY');
  const villageName = (record?.mahalle && /(?:Köyü|Koy|Koyu)$/i.test(record.mahalle)) ? record.mahalle : '';
  const fallbackSokak = isVillage ? (villageName || 'Köy') : 'Mahalle İçi / Cadde-Sokak Belirtilmemiş';

  if (!record) return { sokak: fallbackSokak, kapiNo: 999999, daireNo: 0 };

  // Defensive check: If encrypted ciphertext is passed, ignore to prevent leaking ciphertext
  let rawSokak = record.sokak;
  if (typeof rawSokak === 'string' && (rawSokak.startsWith('ENC:GCM:v1:') || rawSokak.startsWith('ENC:'))) {
    rawSokak = '';
  }

  let rawAdres = record.acik_adres;
  if (typeof rawAdres === 'string' && (rawAdres.startsWith('ENC:GCM:v1:') || rawAdres.startsWith('ENC:'))) {
    rawAdres = '';
  }

  // Her zaman açık adresteki gerçek sokak ve kapı no bilgisini çözümle
  const extracted = extractStreetAndDoor(rawAdres, rawSokak, record.kapi_no, record.mahalle);

  // Sokak belirleme: Öncelik extracted.sokak, genel/boş ise rawSokak
  let finalSokak = extracted.sokak;

  if (isVillage) {
    // Köylerde sokak ismi olmadığı için "Köy İçi" yerine doğrudan köy adı yazılır
    if (
      !finalSokak ||
      /k[oö]y\s+[iı]çi/i.test(finalSokak) ||
      /(?:küme\s+evleri|kume\s+evleri|mevkii|mevki|yolu)/i.test(finalSokak) ||
      finalSokak === 'Sokak Belirtilmemiş' ||
      !/(?:Cad\.|Sok\.)\b/i.test(finalSokak)
    ) {
      finalSokak = villageName || finalSokak || fallbackSokak;
    }
  } else {
    if (
      (!finalSokak ||
        finalSokak === 'Köy İçi / Sokak Belirtilmemiş' ||
        finalSokak === 'Köy İçi / Ana Yol' ||
        finalSokak === 'Mahalle İçi / Cadde-Sokak Belirtilmemiş' ||
        /k[oö]y\s+[iı]çi/i.test(finalSokak)) &&
      rawSokak
    ) {
      let cleanedRaw = rawSokak.replace(/_\d+/g, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!/k[oö]y\s+[iı]çi/i.test(cleanedRaw) && cleanedRaw) {
        finalSokak = cleanedRaw;
      }
    }

    if (finalSokak) {
      finalSokak = finalSokak.replace(/_\d+/g, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
      if (/k[oö]y\s+[iı]çi/i.test(finalSokak)) {
        finalSokak = fallbackSokak;
      }
    }

    if (!finalSokak) {
      finalSokak = fallbackSokak;
    }
  }

  // Kapı no belirleme:
  // 1. Açık adresten başarıyla ayıklanan kapı no daima önceliklidir (örneğin "No: 7D" veya "No: 14" varsa o gelir)
  let finalKapiNo: string | number = extracted.kapiNo;

  // 2. Eğer açık adreste kapı no bulunamadıysa ve veritabanında geçerli bir kapi_no varsa
  // (ancak hane_no ile birebir aynı olmamalı - eski hatalı import kalıntısını engellemek için)
  if (
    (finalKapiNo === 999999 || finalKapiNo === '999999') &&
    record.kapi_no !== undefined &&
    record.kapi_no !== null &&
    record.kapi_no !== 999999 &&
    record.kapi_no !== '999999'
  ) {
    const strKapi = String(record.kapi_no).trim();
    const dbHane = record.hane_no ? String(record.hane_no).replace(/[^0-9]/g, '') : null;
    const cleanKapiDigits = strKapi.replace(/[^0-9]/g, '');
    if (cleanKapiDigits && cleanKapiDigits !== dbHane) {
      finalKapiNo = strKapi;
    }
  }

  let finalDaireNo = extracted.daireNo;
  if (finalDaireNo === 0 && record.daire_no) {
    const parsedDaire = parseInt(String(record.daire_no), 10);
    const kapiNum = parseInt(String(finalKapiNo).replace(/[^0-9]/g, ''), 10);
    // Eski CAD. hatasından kalma daire_no == kapi_no veya 999999 değerlerini tek katlı yer evlerine daire olarak yazma!
    if (!isNaN(parsedDaire) && parsedDaire > 0 && parsedDaire !== 999999 && parsedDaire !== kapiNum) {
      finalDaireNo = parsedDaire;
    }
  }

  return {
    sokak: finalSokak,
    kapiNo: finalKapiNo,
    daireNo: finalDaireNo,
  };
}

/**
 * Natural address comparison function (Street name -> Door number 1 to 99 -> Block -> Apartment -> Person name)
 */
export function compareByAddressAsc(a: any, b: any): number {
  const sa = getRecordStreetInfo(a);
  const sb = getRecordStreetInfo(b);

  const streetComp = sa.sokak.localeCompare(sb.sokak, 'tr');
  if (streetComp !== 0) return streetComp;

  // Alphanumeric natural door comparison (e.g. 7 < 7A < 7B < 7D < 8)
  const numA = parseInt(String(sa.kapiNo).replace(/[^0-9]/g, ''), 10) || 999999;
  const numB = parseInt(String(sb.kapiNo).replace(/[^0-9]/g, ''), 10) || 999999;

  if (numA !== numB) {
    return numA - numB;
  }

  const strA = String(sa.kapiNo || '');
  const strB = String(sb.kapiNo || '');
  if (strA !== strB) {
    return strA.localeCompare(strB, 'tr', { numeric: true });
  }

  if (sa.daireNo !== sb.daireNo) return sa.daireNo - sb.daireNo;

  return (a.ad_soyad || '').localeCompare(b.ad_soyad || '', 'tr');
}

/**
 * Natural comparison by Order Number (Sıra No / İmza Listesi Sırası):
 * Ana Liste (0) first: 1, 2, 3...
 * Then Ek 1: Ek1 - 1, Ek1 - 2...
 * Then Ek 2: Ek2 - 1, Ek2 - 2...
 */
export type BeneficiaryListType = 'ANA_LISTE' | 'EK_LISTE' | 'SIGORTALI';

export interface ListTypeInfo {
  type: BeneficiaryListType;
  label: string;
  badgeLabel: string;
  badgeClass: string;
  folderLabel: string;
}

/**
 * Hak sahibinin hangi listeye (Ana Liste, Ek Liste veya Sigortalılar Listesi) ait olduğunu tespit eder.
 * Saha personelinin ıslak imza formunu fiziksel klasörden anında bulmasını sağlar.
 */
export function getBeneficiaryListTypeInfo(item: any): ListTypeInfo {
  if (!item) {
    return {
      type: 'ANA_LISTE',
      label: 'Ana Liste',
      badgeLabel: 'Ana Liste',
      badgeClass: 'bg-sky-50 text-sky-900 border-sky-200 font-bold',
      folderLabel: 'Ana Liste Klasörü',
    };
  }

  const isSigortali =
    item.liste_turu === 'SIGORTALI' ||
    item.ek_liste_adi === 'Sigortalılar Listesi' ||
    item.ek_liste_adi === 'Sigortalı Listesi' ||
    (item.sira_no && typeof item.sira_no === 'string' && /^(sigortal[ıi]|sigortali)/i.test(item.sira_no.trim())) ||
    item.ek_liste_no === 1000 ||
    item.ek_liste_no === -1;

  if (isSigortali) {
    return {
      type: 'SIGORTALI',
      label: 'Sigortalılar Listesi',
      badgeLabel: 'Sigortalı',
      badgeClass: 'bg-purple-100 text-purple-950 border-purple-300 font-bold',
      folderLabel: 'Sigortalılar Listesi Klasörü',
    };
  }

  const isEk =
    item.liste_turu === 'EK_LISTE' ||
    (typeof item.ek_liste_no === 'number' && item.ek_liste_no > 0 && item.ek_liste_no < 1000) ||
    (item.sira_no && typeof item.sira_no === 'string' && /^Ek\s*\d+/i.test(item.sira_no.trim())) ||
    (item.ek_liste_adi && /^Ek\s*\d+/i.test(item.ek_liste_adi.trim()));

  if (isEk) {
    const match = (item.sira_no && typeof item.sira_no === 'string') ? item.sira_no.match(/^(Ek\s*\d+)/i) : null;
    const ekLabel = item.ek_liste_adi || (match ? match[1] : 'Ek Liste');
    return {
      type: 'EK_LISTE',
      label: ekLabel,
      badgeLabel: ekLabel,
      badgeClass: 'bg-amber-100 text-amber-950 border-amber-300 font-bold',
      folderLabel: `${ekLabel} Klasörü`,
    };
  }

  return {
    type: 'ANA_LISTE',
    label: 'Ana Liste',
    badgeLabel: 'Ana Liste',
    badgeClass: 'bg-sky-50 text-sky-900 border-sky-200 font-bold',
    folderLabel: 'Ana Liste Klasörü',
  };
}

export function compareBySiraNo(a: any, b: any): number {
  const getEkNo = (item: any): number => {
    if (
      item.liste_turu === 'SIGORTALI' ||
      item.ek_liste_adi === 'Sigortalılar Listesi' ||
      item.ek_liste_no === 1000 ||
      (item.sira_no && typeof item.sira_no === 'string' && /^(sigortal[ıi]|sigortali)/i.test(item.sira_no.trim()))
    ) {
      return 1000; // Sigortalı list comes after Ana Liste (0) and Ek listeler (1, 2, 3...)
    }
    if (typeof item.ek_liste_no === 'number' && item.ek_liste_no >= 0) return item.ek_liste_no;
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

/**
 * Kantar tartım fişlerinden veya kullanıcı girişlerinden gelen tonaj verilerini
 * matematiksel olarak standart "Ton" birimine dönüştürür.
 * 
 * - Eğer girilen sayı >= 1000 ise (örn: 27850, 42150, 14300):
 *   Değer kilogram (kg) cinsinden girilmiştir.
 *   Matematiksel karşılığı: Ton = kg / 1000 (örn: 27850 kg -> 27,85 Ton)
 * - Eğer girilen sayı < 1000 ise (örn: 27.85, 42.15, 14.3):
 *   Değer doğrudan Ton cinsinden girilmiştir.
 */
export function normalizeToTon(val: string | number | null | undefined, isTruckRecord: boolean = false): number {
  if (val === null || val === undefined || val === '') return 0;
  let str = val.toString().trim().replace(/\s+/g, '');
  if (str.includes(',') && !str.includes('.')) {
    str = str.replace(',', '.');
  } else if (str.includes('.') && str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  }
  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  const sign = num < 0 ? -1 : 1;
  const absNum = Math.abs(num);
  
  // Karayolları azami yük sınırına göre tek bir tır asla 100 tondan fazla kömür taşıyamaz.
  // Bu yüzden tek tır tartım kaydı formunda 100'den büyük tüm değerler doğrudan kilogramdır (örn: 27850 -> 27.85 Ton).
  //
  // Genel / kurumsal / toplam tonaj bağlamında ise:
  // Kurum tahsisi veya saha toplamı 1.000 - 5.000 Ton olabilir (örn: 1500 Ton, 2500 Ton).
  // Kilogram olarak girilen değerler ise 10.000 ve üzeri olur (örn: 27850 kg, 1500000 kg).
  let absTon: number;
  if (isTruckRecord) {
    absTon = absNum > 100 ? absNum / 1000 : absNum;
  } else {
    absTon = absNum >= 10000 ? absNum / 1000 : absNum;
  }
  return parseFloat((sign * absTon).toFixed(3));
}

/**
 * Tonaj miktarını hem "Ton" hem de "kg" cinsinden Türkçe dil ve matematik kurallarına
 * göre biçimlendirir.
 * 
 * Örnek çıktılar:
 * - formatTonnage(27850) -> { ton: 27.85, kg: 27850, tonStr: "27,85 Ton", kgStr: "27.850 kg", combined: "27,85 Ton (27.850 kg)", compact: "27,85 T / 27.850 kg" }
 * - formatTonnage(27.85) -> { ton: 27.85, kg: 27850, tonStr: "27,85 Ton", kgStr: "27.850 kg", combined: "27,85 Ton (27.850 kg)", compact: "27,85 T / 27.850 kg" }
 */
export function formatTonnage(val: string | number | null | undefined): {
  ton: number;
  kg: number;
  tonStr: string;
  kgStr: string;
  combined: string;
  compact: string;
} {
  const ton = normalizeToTon(val);
  const kg = Math.round(ton * 1000);
  const tonFormatted = ton.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  const kgFormatted = kg.toLocaleString('tr-TR');

  return {
    ton,
    kg,
    tonStr: `${tonFormatted} Ton`,
    kgStr: `${kgFormatted} kg`,
    combined: `${tonFormatted} Ton (${kgFormatted} kg)`,
    compact: `${tonFormatted} T / ${kgFormatted} kg`,
  };
}


