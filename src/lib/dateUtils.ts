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
