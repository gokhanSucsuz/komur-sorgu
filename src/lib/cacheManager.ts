'use client';

/**
 * Safe Client-Side Cache & LocalStorage Purge Manager
 *
 * Automatically manages application version upgrades after git commits / deploys.
 * Purges obsolete browser caches, service worker caches, and stale local storage
 * while STRICTLY preserving critical user credentials, authentication tokens,
 * 2FA device pairings, and offline unsent delivery queues.
 */

// Critical keys that must NEVER be deleted under any circumstances
const EXACT_PROTECTED_KEYS = new Set([
  'komur_logged_in',
  'komur_session_token',
  'komur_username',
  'komur_user_name',
  'komur_user_role',
  'komur_user_team',
  'komur_user_partners',
  'komur_login_time',
  'komur_device_token',
  'komur_offline_queue',
  'komur_offline_queue_sandbox',
  'komur_active_calisma_modu',
  'komur_active_tab',
  'komur_route_client_id',
  'komur_active_route_session_last',
  'komur_lite_mode',
  'pwa_banner_dismissed',
  'komur_app_version'
]);

/**
 * Checks whether a given localStorage key is strictly protected against cache wipes.
 */
export function isProtectedStorageKey(key: string): boolean {
  if (!key) return false;
  if (EXACT_PROTECTED_KEYS.has(key)) return true;

  const lower = key.toLowerCase();
  // Protect any device authorization tokens, offline queues, active route sessions, or session tokens
  if (
    lower.includes('device_token') ||
    lower.includes('offline_queue') ||
    lower.includes('session_token') ||
    lower.includes('active_route_session') ||
    lower.includes('route_client_id') ||
    lower.includes('user_role') ||
    lower.includes('komur_user')
  ) {
    return true;
  }

  return false;
}

/**
 * Safely cleans stale items from localStorage, preserving all protected keys.
 */
export function purgeStaleLocalStorage(): { removedKeys: string[]; preservedKeys: string[] } {
  if (typeof window === 'undefined') return { removedKeys: [], preservedKeys: [] };

  const removedKeys: string[] = [];
  const preservedKeys: string[] = [];

  try {
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) allKeys.push(k);
    }

    allKeys.forEach((key) => {
      if (isProtectedStorageKey(key)) {
        preservedKeys.push(key);
      } else {
        localStorage.removeItem(key);
        removedKeys.push(key);
      }
    });

    if (removedKeys.length > 0) {
      console.log('[CacheManager] Stale localStorage keys safely purged:', removedKeys);
    }
  } catch (err) {
    console.error('[CacheManager] Error during localStorage purge:', err);
  }

  return { removedKeys, preservedKeys };
}

/**
 * Clears volatile sessionStorage completely.
 */
export function purgeSessionStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.clear();
  } catch (err) {
    console.error('[CacheManager] Error clearing sessionStorage:', err);
  }
}

/**
 * Purges all CacheStorage entries managed by the browser / Service Worker.
 */
export async function purgeCacheStorage(): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;

  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    console.log('[CacheManager] CacheStorage cleared successfully. Purged caches:', keys);
    return true;
  } catch (err) {
    console.error('[CacheManager] Error clearing CacheStorage:', err);
    return false;
  }
}

/**
 * Tells active and waiting Service Workers to skip waiting and clear their caches.
 */
export async function updateServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      if (reg.active) {
        reg.active.postMessage({ action: 'CLEAR_CACHE' });
        reg.active.postMessage({ action: 'SKIP_WAITING' });
      }
      if (reg.waiting) {
        reg.waiting.postMessage({ action: 'SKIP_WAITING' });
      }
      await reg.update().catch(() => {});
    }
  } catch (err) {
    console.error('[CacheManager] Error notifying service workers:', err);
  }
}

/**
 * Applies a full safe cache purge cycle.
 * Preserves active login, device pairing, and offline delivery queues.
 */
export async function applySafeCachePurge(newVersion?: string): Promise<{ success: boolean; removedCount: number }> {
  if (typeof window === 'undefined') {
    return { success: false, removedCount: 0 };
  }

  console.log(`[CacheManager] Applying safe cache purge... ${newVersion ? `Target version: ${newVersion}` : ''}`);

  // 1. Purge volatile browser storage
  purgeSessionStorage();
  const { removedKeys } = purgeStaleLocalStorage();

  // 2. Purge Service Worker / CacheStorage
  await purgeCacheStorage();

  // 3. Update Service Worker
  await updateServiceWorker();

  // 4. Update stored version
  if (newVersion) {
    try {
      localStorage.setItem('komur_app_version', newVersion);
    } catch {}
  }

  return { success: true, removedCount: removedKeys.length };
}

/**
 * Compares current local version with server version.
 * If there is a mismatch or first run on a legacy device, signals that an update is required.
 */
export function checkAndPurgeIfVersionChanged(serverVersion: string): {
  changed: boolean;
  isFirstRun: boolean;
  previousVersion: string | null;
} {
  if (typeof window === 'undefined' || !serverVersion) {
    return { changed: false, isFirstRun: false, previousVersion: null };
  }

  try {
    const localVersion = localStorage.getItem('komur_app_version');

    // Case 1: Device was installed earlier without version tracking
    if (!localVersion) {
      return { changed: true, isFirstRun: true, previousVersion: null };
    }

    // Case 2: New commit / version deployed on server
    if (localVersion !== serverVersion) {
      console.warn(`[CacheManager] App version mismatch detected: local=${localVersion}, server=${serverVersion}`);
      return { changed: true, isFirstRun: false, previousVersion: localVersion };
    }

    return { changed: false, isFirstRun: false, previousVersion: localVersion };
  } catch {
    return { changed: false, isFirstRun: false, previousVersion: null };
  }
}
