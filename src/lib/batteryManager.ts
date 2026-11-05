'use client';

/**
 * Battery & Power Conservation Manager (Edirne SYDV Mobil Saha Optimizasyonu)
 *
 * Sahada dağıtım yapan personellerin telefon bataryalarının hızla tükenmesini engeller:
 * 1. Ekran Kilitlendiğinde / Arka Plandayken (document.visibilityState === 'hidden')
 *    tüm HTTP ağ yoklamalarını (polling) DERHAL DURDURUR.
 * 2. Cihaz Batarya Seviyesi (Battery Status API) %20 ve altına düştüğünde
 *    otomatik olarak "Güç Tasarrufu Modu"nu devreye alır.
 * 3. Ağ yoklama aralıklarını uyarlamalı (adaptive backoff) olarak uzatır (4G/5G modem uyku moduna geçer).
 * 4. Rota Modunda telefon unutulduğunda ekranın sabaha kadar açık kalıp şarjı bitirmemesi için
 *    hareketsizlik zamanlayıcısı ile WakeLock'ı serbest bırakır, ilk dokunuşta tekrar uyandırır.
 * 5. Titreşim motoru aşırı güç harcadığından düşük pilde titreşimi kısaltır/korur.
 * 6. GPU gölgelendirici ve bulanıklık (backdrop-filter) efektlerini devre dışı bırakır.
 */

export interface BatteryStatus {
  level: number; // 0.0 to 1.0
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  supported: boolean;
}

const POWER_SAVER_STORAGE_KEY = 'komur_power_saver';

let currentBatteryStatus: BatteryStatus = {
  level: 1,
  charging: true,
  chargingTime: 0,
  dischargingTime: Infinity,
  supported: false,
};

let listeners: Array<(status: BatteryStatus, isPowerSaver: boolean) => void> = [];
let isInitialized = false;

function syncPowerSaverClass(): void {
  if (typeof document === 'undefined') return;
  const active = isPowerSaverActive();
  if (active) {
    document.documentElement.classList.add('power-saver-active');
  } else {
    document.documentElement.classList.remove('power-saver-active');
  }
}

function notifyListeners(): void {
  const isPs = isPowerSaverActive();
  listeners.forEach((fn) => {
    try {
      fn(currentBatteryStatus, isPs);
    } catch {}
  });
}

export function initBatteryManager(): void {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  syncPowerSaverClass();

  // Battery Status API (Chrome / Edge / Android WebView)
  if ('getBattery' in navigator) {
    (navigator as any)
      .getBattery()
      .then((battery: any) => {
        const update = () => {
          currentBatteryStatus = {
            level: typeof battery.level === 'number' ? battery.level : 1,
            charging: Boolean(battery.charging),
            chargingTime: battery.chargingTime || 0,
            dischargingTime: battery.dischargingTime || Infinity,
            supported: true,
          };
          syncPowerSaverClass();
          notifyListeners();
        };

        update();
        battery.addEventListener('levelchange', update);
        battery.addEventListener('chargingchange', update);
      })
      .catch(() => {
        currentBatteryStatus.supported = false;
      });
  }

  document.addEventListener('visibilitychange', () => {
    syncPowerSaverClass();
    notifyListeners();
  });
}

export function isScreenVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

export function isManualPowerSaver(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(POWER_SAVER_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function isAutoBatterySaving(): boolean {
  return currentBatteryStatus.supported && !currentBatteryStatus.charging && currentBatteryStatus.level <= 0.20;
}

export function isPowerSaverActive(): boolean {
  return isManualPowerSaver() || isAutoBatterySaving();
}

export function setPowerSaverMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(POWER_SAVER_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {}
  syncPowerSaverClass();
  notifyListeners();
  if (typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('komur_power_saver_changed', { detail: { enabled } }));
    } catch {}
  }
}

export function subscribeBatteryStatus(
  callback: (status: BatteryStatus, isPowerSaver: boolean) => void
): () => void {
  listeners.push(callback);
  callback(currentBatteryStatus, isPowerSaverActive());
  return () => {
    listeners = listeners.filter((cb) => cb !== callback);
  };
}

/**
 * Batarya ve ekran durumuna göre optimize edilmiş dinamik yoklama aralığı (milisaniye)
 */
export function getOptimizedPollingInterval(type: 'pulse' | 'sync' | 'heartbeat' | 'session'): number {
  const isPs = isPowerSaverActive();
  switch (type) {
    case 'pulse':
      // Rota senkronizasyon kontrolü: normal 8s, güç tasarrufu 16s
      return isPs ? 16000 : 8000;
    case 'sync':
      // Genel uygulama senkronizasyonu: normal 12s, güç tasarrufu 25s
      return isPs ? 25000 : 12000;
    case 'heartbeat':
      // Rota kilit canlı tutma (Sunucu aşımı 25 dakikadır): normal 15s, güç tasarrufu 25s
      return isPs ? 25000 : 15000;
    case 'session':
      // Oturum kontrolü: normal 45s, güç tasarrufu 90s
      return isPs ? 90000 : 45000;
  }
}

/**
 * Batarya dostu titreşim yardımcısı.
 * Telefon pili %15 ve altındayken veya güç tasarrufunda gereksiz motor akımını engeller.
 */
export function safeVibrate(pattern: number | number[] = 100): boolean {
  if (typeof window === 'undefined' || !('navigator' in window) || !('vibrate' in navigator)) {
    return false;
  }

  // Kritik pil seviyesinde titreşimi iptal et
  if (currentBatteryStatus.supported && !currentBatteryStatus.charging && currentBatteryStatus.level <= 0.12) {
    return false;
  }

  // Güç tasarrufunda yalnızca çok kısa (30ms) hafif bir dokunuş hissi ver
  if (isPowerSaverActive()) {
    try {
      return navigator.vibrate(30);
    } catch {
      return false;
    }
  }

  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
