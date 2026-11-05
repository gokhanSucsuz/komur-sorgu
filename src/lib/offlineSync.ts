'use client';

import { getSecureItem } from './secureStorage';

export interface OfflineDeliveryItem {
  client_uuid: string;
  timestamp: number;
  beneficiary_id: string;
  route_id?: string;
  stop_index?: number;
  durum?: 'TAMAMLANDI' | 'EKSIK' | 'TESLIM_EDILEMEDI';
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
  action_type?: 'DELIVERY' | 'SIGN_BENEFICIARY';
  imza_durumu?: 'IMZALANDI' | 'BEKLIYOR';
}

const STORAGE_KEY_OFFICIAL = 'komur_offline_queue';
const STORAGE_KEY_SANDBOX = 'komur_offline_queue_sandbox';
const ACTIVE_MODE_STORAGE_KEY = 'komur_active_calisma_modu';
const OBF_PREFIX = 'KVKK_OBF_v1:';

export function setOfflineQueueActiveMode(mode: 'RESMI' | 'DENEME'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_MODE_STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent('komur_offline_queue_changed'));
  } catch {}
}

function getActiveStorageKey(): string {
  if (typeof window === 'undefined') return STORAGE_KEY_OFFICIAL;
  try {
    const mode = localStorage.getItem(ACTIVE_MODE_STORAGE_KEY);
    return mode === 'DENEME' ? STORAGE_KEY_SANDBOX : STORAGE_KEY_OFFICIAL;
  } catch {
    return STORAGE_KEY_OFFICIAL;
  }
}

export function clearSandboxOfflineQueue(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY_SANDBOX);
    window.dispatchEvent(new CustomEvent('komur_offline_queue_changed', { detail: { count: 0 } }));
  } catch {}
}

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
      (typeof window !== 'undefined' && (getSecureItem('komur_session_token') || localStorage.getItem('komur_session_token'))) ||
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
    (typeof window !== 'undefined' && (getSecureItem('komur_session_token') || localStorage.getItem('komur_session_token'))) ||
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
    const raw = localStorage.getItem(getActiveStorageKey());
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
  const maskedTc = maskTcForStorage(item.tc_no);

  // Yerel cihaz kuyruğunda aynı hane için mükerrer işlem oluşmasını engelle (De-duplication)
  const existingIdx = queue.findIndex(
    (q) =>
      q.status === 'PENDING' &&
      q.beneficiary_id &&
      item.beneficiary_id &&
      String(q.beneficiary_id) === String(item.beneficiary_id) &&
      (q.action_type || 'DELIVERY') === (item.action_type || 'DELIVERY')
  );

  if (existingIdx !== -1) {
    const existing = queue[existingIdx];
    const updatedItem: OfflineDeliveryItem = {
      ...existing,
      ...item,
      tc_no: maskedTc || existing.tc_no,
      timestamp: Date.now(),
      created_at_formatted: new Date().toLocaleString('tr-TR'),
    };
    queue[existingIdx] = updatedItem;
    if (typeof window !== 'undefined') {
      localStorage.setItem(getActiveStorageKey(), encodeStoragePayload(queue));
      window.dispatchEvent(new CustomEvent('komur_offline_queue_changed', { detail: { count: queue.length } }));
    }
    return updatedItem;
  }

  const newItem: OfflineDeliveryItem = {
    ...item,
    tc_no: maskedTc,
    client_uuid: 'off_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
    status: 'PENDING',
    created_at_formatted: new Date().toLocaleString('tr-TR'),
  };

  queue.push(newItem);
  if (typeof window !== 'undefined') {
    localStorage.setItem(getActiveStorageKey(), encodeStoragePayload(queue));
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
    localStorage.setItem(getActiveStorageKey(), encodeStoragePayload(queue));
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
      let url = '/api/delivery';
      let bodyPayload: any = {};

      if (item.action_type === 'SIGN_BENEFICIARY') {
        url = '/api/routes';
        bodyPayload = {
          action: 'SIGN_BENEFICIARY',
          beneficiary_id: item.beneficiary_id,
          imza_durumu: item.imza_durumu || 'IMZALANDI',
          imza_alan_personel: item.personel || 'İmza Ekibi',
          notlar: item.notlar
            ? `[Çevrimdışı İmza ${item.created_at_formatted}] ${item.notlar}`
            : `[Çevrimdışı İmza ${item.created_at_formatted}]`,
          is_offline_sync: true,
        };
      } else {
        const isRouteStop = Boolean(item.route_id && (item.stop_index !== undefined || item.beneficiary_id));
        url = isRouteStop ? '/api/routes' : '/api/delivery';
        bodyPayload = isRouteStop
          ? {
              action: 'UPDATE_STOP',
              route_id: item.route_id,
              stop_index: item.stop_index,
              beneficiary_id: item.beneficiary_id,
              tc_no: item.tc_no,
              durum: item.durum || 'TAMAMLANDI',
              torba_sayisi: item.torba_sayisi,
              teslim_alan: item.teslim_alan,
              personel: item.personel,
              notlar: item.notlar
                ? `[Çevrimdışı Aktarım ${item.created_at_formatted}] ${item.notlar}`
                : `[Çevrimdışı Aktarım ${item.created_at_formatted}]`,
              daha_sonra_tamamlanacak: item.durum !== 'TAMAMLANDI',
              is_offline_sync: true,
            }
          : {
              action: 'TESLIMAT',
              beneficiary_id: item.beneficiary_id,
              eklenen_torba: item.eklenen_torba,
              torba_sayisi: item.torba_sayisi,
              teslim_alan: item.teslim_alan,
              personel: item.personel,
              notlar: item.notlar
                ? `[Çevrimdışı Aktarım ${item.created_at_formatted}] ${item.notlar}`
                : `[Çevrimdışı Aktarım ${item.created_at_formatted}]`,
              is_offline_sync: true,
            };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-offline-sync': 'true',
        },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();

      if (data.alreadyCompletedByPartner || data.already_completed) {
        // Ekip arkadaşı tarafından daha önce tamamlanmış veya çakışma güvenle önlenmiş!
        synced++;
        const partnerName = data.completedBy || 'ekip arkadaşınız';
        messages.push(`🔄 ${item.ad_soyad}: ${partnerName} tarafından daha önce teslim edildi (Mükerrer teslimat engellendi).`);

        // Kuyruktan güvenle temizle
        const idx = updatedQueue.findIndex((q) => q.client_uuid === item.client_uuid);
        if (idx !== -1) updatedQueue.splice(idx, 1);
      } else if (res.status === 409 || res.status === 423 || data.conflict) {
        // Mükerrer teslimat veya aktif rota kilit çakışması yakalandı ve engellendi
        conflicts++;
        const conflictMsg =
          data.error || `${item.ad_soyad} kaydı başka bir personel tarafından işlem görmüş veya kilitli.`;
        messages.push(`⚠️ Çakışma Önleme: ${conflictMsg}`);

        // Sonsuz döngüye girmemesi için kuyruktan çıkar
        const idx = updatedQueue.findIndex((q) => q.client_uuid === item.client_uuid);
        if (idx !== -1) updatedQueue.splice(idx, 1);
      } else if (data.success) {
        synced++;
        messages.push(`✅ ${item.ad_soyad}: ${data.message || 'İşlem aktarıldı'}`);

        // Kuyruktan kaldır
        const idx = updatedQueue.findIndex((q) => q.client_uuid === item.client_uuid);
        if (idx !== -1) updatedQueue.splice(idx, 1);
      } else {
        failed++;
        messages.push(`❌ ${item.ad_soyad}: ${data.error || 'Aktarılamadı'}`);
      }

      onProgress?.(synced + conflicts, pending.length);
    } catch (netErr: any) {
      // Ağ hala çevrimdışı; sonraki adımları beklet
      failed++;
      messages.push(`📶 Ağ bağlantısı kesintili: Kalan ${pending.length - i} işlem çevrimdışı kuyrukta bekletiliyor.`);
      break;
    }
  }

  localStorage.setItem(getActiveStorageKey(), encodeStoragePayload(updatedQueue));
  window.dispatchEvent(new CustomEvent('komur_offline_queue_changed', { detail: { count: updatedQueue.length } }));

  return {
    success: synced > 0 || conflicts > 0,
    synced,
    conflicts,
    failed,
    messages,
  };
}

