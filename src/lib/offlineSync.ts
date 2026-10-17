'use client';

export interface OfflineDeliveryItem {
  client_uuid: string;
  timestamp: number;
  beneficiary_id: string;
  tc_no: string;
  ad_soyad: string;
  torba_sayisi?: number;
  eklenen_torba?: number;
  teslim_alan: string;
  personel: string;
  notlar?: string;
  status: 'PENDING' | 'SYNCED' | 'CONFLICT';
  conflictMessage?: string;
  created_at_formatted: string;
}

const STORAGE_KEY = 'komur_offline_queue';
const OBF_PREFIX = 'KVKK_OBF_v1:';

/**
 * Masks TC Identity Number so full plaintext TC is never persisted in mobile localStorage.
 */
function maskTcForStorage(tc: string): string {
  const cleaned = String(tc || '').trim();
  if (cleaned.length <= 4) return '*******';
  return '*******' + cleaned.slice(-4);
}

/**
 * Obfuscates offline queue string in localStorage bound to current session token
 * so plaintext citizen names are not readable in raw browser storage inspection.
 */
function encodeStoragePayload(items: OfflineDeliveryItem[]): string {
  try {
    const json = JSON.stringify(items);
    const bytes = new TextEncoder().encode(json);
    const keyStr =
      (typeof window !== 'undefined' && localStorage.getItem('komur_session_token')) ||
      'edirne-sydv-mobile-kvkk-guard';
    const keyBytes = new TextEncoder().encode(keyStr);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
    }
    let binary = '';
    for (let i = 0; i < out.length; i++) {
      binary += String.fromCharCode(out[i]);
    }
    return OBF_PREFIX + btoa(binary);
  } catch {
    return JSON.stringify(items);
  }
}

function decodeStoragePayload(raw: string): OfflineDeliveryItem[] {
  if (!raw) return [];
  if (!raw.startsWith(OBF_PREFIX)) {
    return JSON.parse(raw);
  }
  const b64 = raw.slice(OBF_PREFIX.length);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const keyStr =
    (typeof window !== 'undefined' && localStorage.getItem('komur_session_token')) ||
    'edirne-sydv-mobile-kvkk-guard';
  const keyBytes = new TextEncoder().encode(keyStr);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  }
  const json = new TextDecoder().decode(out);
  return JSON.parse(json);
}

export function getOfflineQueue(): OfflineDeliveryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? decodeStoragePayload(raw) : [];
  } catch (e) {
    console.error('Failed to parse offline queue:', e);
    return [];
  }
}

export function saveOfflineDelivery(
  item: Omit<OfflineDeliveryItem, 'client_uuid' | 'timestamp' | 'status' | 'created_at_formatted'>
): OfflineDeliveryItem {
  const queue = getOfflineQueue();
  const newItem: OfflineDeliveryItem = {
    ...item,
    tc_no: maskTcForStorage(item.tc_no),
    client_uuid: 'off_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
    status: 'PENDING',
    created_at_formatted: new Date().toLocaleString('tr-TR'),
  };

  queue.push(newItem);
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, encodeStoragePayload(queue));
    // Dispatch custom event for UI updates
    window.dispatchEvent(new CustomEvent('komur_offline_queue_changed', { detail: { count: queue.length } }));
  }

  return newItem;
}

export function getPendingOfflineCount(): number {
  const queue = getOfflineQueue();
  return queue.filter((item) => item.status === 'PENDING').length;
}

export function removeOfflineItem(clientUuid: string): void {
  const queue = getOfflineQueue().filter((item) => item.client_uuid !== clientUuid);
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, encodeStoragePayload(queue));
    window.dispatchEvent(new CustomEvent('komur_offline_queue_changed', { detail: { count: queue.length } }));
  }
}

export async function syncOfflineDeliveries(
  onProgress?: (synced: number, total: number) => void
): Promise<{
  success: boolean;
  synced: number;
  conflicts: number;
  failed: number;
  messages: string[];
}> {
  if (typeof window === 'undefined') {
    return { success: false, synced: 0, conflicts: 0, failed: 0, messages: [] };
  }

  const queue = getOfflineQueue();
  const pending = queue.filter((item) => item.status === 'PENDING');
  if (pending.length === 0) {
    return { success: true, synced: 0, conflicts: 0, failed: 0, messages: ['Bekleyen çevrimdışı işlem yok.'] };
  }

  let synced = 0;
  let conflicts = 0;
  let failed = 0;
  const messages: string[] = [];
  const updatedQueue = [...queue];

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    try {
      const res = await fetch('/api/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'TESLIMAT',
          beneficiary_id: item.beneficiary_id,
          eklenen_torba: item.eklenen_torba,
          torba_sayisi: item.torba_sayisi,
          teslim_alan: item.teslim_alan,
          personel: item.personel,
          notlar: item.notlar
            ? `[Çevrimdışı Aktarım ${item.created_at_formatted}] ${item.notlar}`
            : `[Çevrimdışı Aktarım ${item.created_at_formatted}]`,
        }),
      });

      const data = await res.json();

      if (res.status === 409 || res.status === 423 || data.conflict) {
        // Double delivery or active route lock conflict prevented!
        conflicts++;
        const conflictMsg =
          data.error || `${item.ad_soyad} kaydı başka bir personel tarafından işlem görmüş veya kilitli.`;
        messages.push(`⚠️ Çakışma Önleme: ${conflictMsg}`);

        // Remove from queue so it does not loop
        const idx = updatedQueue.findIndex((q) => q.client_uuid === item.client_uuid);
        if (idx !== -1) updatedQueue.splice(idx, 1);
      } else if (data.success) {
        synced++;
        messages.push(`✅ ${item.ad_soyad}: ${data.message || 'Teslimat aktarıldı'}`);

        // Remove from queue
        const idx = updatedQueue.findIndex((q) => q.client_uuid === item.client_uuid);
        if (idx !== -1) updatedQueue.splice(idx, 1);
      } else {
        failed++;
        messages.push(`❌ ${item.ad_soyad}: ${data.error || 'Aktarılamadı'}`);
      }

      onProgress?.(synced + conflicts, pending.length);
    } catch (netErr: any) {
      // Network still offline; abort further items
      failed++;
      messages.push(`📶 Ağ bağlantısı kesintili: Kalan ${pending.length - i} işlem çevrimdışı kuyrukta bekletiliyor.`);
      break;
    }
  }

  localStorage.setItem(STORAGE_KEY, encodeStoragePayload(updatedQueue));
  window.dispatchEvent(new CustomEvent('komur_offline_queue_changed', { detail: { count: updatedQueue.length } }));

  return {
    success: synced > 0,
    synced,
    conflicts,
    failed,
    messages,
  };
}

