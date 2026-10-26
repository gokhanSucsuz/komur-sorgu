/**
 * Independent Date & Time Utilities for Istanbul / Turkish Timezone
 * Standalone module with zero external dependencies to prevent circular imports.
 */

export interface IstanbulDateResult {
  iso: string;
  dateStr: string;
  timeStr: string;
  fullStr: string;
  nowIso: string;
  nowLocaleTr: string;
  nowEnCa: string;
  nowTimeHHmm: string;
}

/**
 * Guarantees correct local date & time strings regardless of server host UTC settings.
 */
export function getIstanbulDate(): IstanbulDateResult {
  const now = new Date();
  const trDateStr = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
  const trTimeStr = now.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' });
  const parts = trDateStr.split('.'); // dd.mm.yyyy
  const dateStr = parts.length === 3 ? `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}` : now.toISOString().slice(0, 10);
  const fullStr = `${trDateStr} ${trTimeStr}`;
  return {
    iso: now.toISOString(),
    dateStr, // YYYY-MM-DD
    timeStr: trTimeStr, // HH:MM:SS
    fullStr, // DD.MM.YYYY HH:MM:SS
    nowIso: now.toISOString(),
    nowLocaleTr: fullStr,
    nowEnCa: dateStr,
    nowTimeHHmm: trTimeStr.slice(0, 5),
  };
}

/**
 * Safely parses any date representation (Date object, ISO string, 'YYYY-MM-DD', 'DD.MM.YYYY', 'DD.MM.YYYY HH:mm:ss', etc.)
 * into a valid Date object without timezone shift bugs.
 */
export function parseDateSafely(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const str = String(val).trim();
  if (!str) return null;

  // 1. DD.MM.YYYY [HH:mm[:ss]]
  const dotMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[,\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (dotMatch) {
    const [, d, m, y, h, min, s] = dotMatch;
    if (h !== undefined) {
      return new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s || 0));
    }
    return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
  }

  // 2. YYYY-MM-DD [T/space HH:mm[:ss]]
  const dashMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dashMatch) {
    const [, y, m, d, h, min, s] = dashMatch;
    if (h !== undefined) {
      return new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s || 0));
    }
    return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formats date as "25.09.2025 Cumartesi" (DD.MM.YYYY Weekday)
 */
export function formatTrDateWithDay(val: any): string {
  const d = parseDateSafely(val);
  if (!d) return val ? String(val) : '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const weekday = new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long',
    timeZone: 'Europe/Istanbul',
  }).format(d);
  return `${day}.${month}.${year} ${weekday}`;
}

/**
 * Formats date as "18 Ekim 2026 Pazar" (d MMMM yyyy EEEE in Turkish)
 */
export function formatTrDate(val: any): string {
  const d = parseDateSafely(val);
  if (!d) return val ? String(val) : '';
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
    timeZone: 'Europe/Istanbul',
  }).format(d);
}

/**
 * Formats date and time as "18 Ekim 2026 Pazar 10:22:20"
 */
export function formatTrDateTime(val: any): string {
  const d = parseDateSafely(val);
  if (!d) return val ? String(val) : '';
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Europe/Istanbul',
  }).format(d);
}

/**
 * Automatically determines format based on input:
 * If time components are present, formats as "18 Ekim 2026 Pazar 10:22:20".
 * Otherwise formats as "18 Ekim 2026 Pazar".
 */
export function formatTrAuto(val: any): string {
  if (!val) return '';
  if (val instanceof Date) return formatTrDateTime(val);
  const str = String(val).trim();
  const hasTime = str.includes(':') || (str.includes('T') && str.length > 10);
  return hasTime ? formatTrDateTime(val) : formatTrDate(val);
}
