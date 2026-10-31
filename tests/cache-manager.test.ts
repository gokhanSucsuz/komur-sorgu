import test from 'node:test';
import assert from 'node:assert/strict';
import { isProtectedStorageKey, purgeStaleLocalStorage, checkAndPurgeIfVersionChanged } from '../src/lib/cacheManager';
import { getAppVersion } from '../src/lib/version';

test('CacheManager: isProtectedStorageKey correctly protects sensitive and essential keys', () => {
  // 1. Exact protected keys
  assert.equal(isProtectedStorageKey('komur_logged_in'), true, 'komur_logged_in must be protected');
  assert.equal(isProtectedStorageKey('komur_session_token'), true, 'komur_session_token must be protected');
  assert.equal(isProtectedStorageKey('komur_username'), true, 'komur_username must be protected');
  assert.equal(isProtectedStorageKey('komur_user_name'), true, 'komur_user_name must be protected');
  assert.equal(isProtectedStorageKey('komur_user_role'), true, 'komur_user_role must be protected');
  assert.equal(isProtectedStorageKey('komur_user_team'), true, 'komur_user_team must be protected');
  assert.equal(isProtectedStorageKey('komur_user_partners'), true, 'komur_user_partners must be protected');
  assert.equal(isProtectedStorageKey('komur_device_token'), true, 'komur_device_token must be protected');
  assert.equal(isProtectedStorageKey('komur_offline_queue'), true, 'komur_offline_queue must be protected');
  assert.equal(isProtectedStorageKey('komur_offline_queue_sandbox'), true, 'komur_offline_queue_sandbox must be protected');
  assert.equal(isProtectedStorageKey('komur_active_calisma_modu'), true, 'komur_active_calisma_modu must be protected');
  assert.equal(isProtectedStorageKey('komur_lite_mode'), true, 'komur_lite_mode must be protected');
  assert.equal(isProtectedStorageKey('pwa_banner_dismissed'), true, 'pwa_banner_dismissed must be protected');
  assert.equal(isProtectedStorageKey('komur_app_version'), true, 'komur_app_version must be protected');

  // 2. Pattern matches for device token, offline queue, or active Route Mode session
  assert.equal(isProtectedStorageKey('user_device_token_xyz'), true);
  assert.equal(isProtectedStorageKey('my_offline_queue_backup'), true);
  assert.equal(isProtectedStorageKey('custom_session_token'), true);
  assert.equal(isProtectedStorageKey('komur_active_route_session_personel1'), true);
  assert.equal(isProtectedStorageKey('komur_active_route_session_last'), true);
  assert.equal(isProtectedStorageKey('komur_route_client_id'), true);
  assert.equal(isProtectedStorageKey('komur_active_tab'), true);

  // 3. Stale / legacy keys that SHOULD be purged
  assert.equal(isProtectedStorageKey('komur_beneficiaries_cache'), false);
  assert.equal(isProtectedStorageKey('stale_temp_data'), false);
  assert.equal(isProtectedStorageKey('old_search_filter'), false);
  assert.equal(isProtectedStorageKey('legacy_export_blob'), false);
});

test('CacheManager: purgeStaleLocalStorage wipes only unwhitelisted data while preserving login & queues', () => {
  // Create a mock localStorage in globalThis
  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, val: string) => { storageMap.set(key, String(val)); },
    removeItem: (key: string) => { storageMap.delete(key); },
    clear: () => { storageMap.clear(); },
    key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
    get length() { return storageMap.size; }
  };

  (globalThis as any).window = globalThis;
  (globalThis as any).localStorage = mockLocalStorage;

  // Populate mock storage with both critical data and stale cache
  mockLocalStorage.setItem('komur_session_token', 'JWT_SECRET_TOKEN_123');
  mockLocalStorage.setItem('komur_device_token', 'PAIRING_TOKEN_ABC');
  mockLocalStorage.setItem('komur_offline_queue', '[{"beneficiary_id":"1","ad_soyad":"Ahmet"}]');
  mockLocalStorage.setItem('komur_username', 'gokhansucsuz');
  mockLocalStorage.setItem('komur_user_role', 'ADMIN');
  mockLocalStorage.setItem('komur_lite_mode', 'true');

  // Stale items to be purged
  mockLocalStorage.setItem('komur_beneficiaries_cache', '{"data": [old_records]}');
  mockLocalStorage.setItem('old_search_results', 'some_old_json');
  mockLocalStorage.setItem('temp_view_state', 'active');

  const { removedKeys } = purgeStaleLocalStorage();

  // Verify stale keys are removed
  assert.ok(removedKeys.includes('komur_beneficiaries_cache'));
  assert.ok(removedKeys.includes('old_search_results'));
  assert.ok(removedKeys.includes('temp_view_state'));
  assert.equal(mockLocalStorage.getItem('komur_beneficiaries_cache'), null);
  assert.equal(mockLocalStorage.getItem('old_search_results'), null);
  assert.equal(mockLocalStorage.getItem('temp_view_state'), null);

  // Verify critical keys are preserved
  assert.equal(mockLocalStorage.getItem('komur_session_token'), 'JWT_SECRET_TOKEN_123');
  assert.equal(mockLocalStorage.getItem('komur_device_token'), 'PAIRING_TOKEN_ABC');
  assert.equal(mockLocalStorage.getItem('komur_offline_queue'), '[{"beneficiary_id":"1","ad_soyad":"Ahmet"}]');
  assert.equal(mockLocalStorage.getItem('komur_username'), 'gokhansucsuz');
  assert.equal(mockLocalStorage.getItem('komur_user_role'), 'ADMIN');
  assert.equal(mockLocalStorage.getItem('komur_lite_mode'), 'true');
});

test('CacheManager: checkAndPurgeIfVersionChanged detects version upgrades properly', () => {
  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, val: string) => { storageMap.set(key, String(val)); },
    removeItem: (key: string) => { storageMap.delete(key); },
    clear: () => { storageMap.clear(); },
    key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
    get length() { return storageMap.size; }
  };
  (globalThis as any).window = globalThis;
  (globalThis as any).localStorage = mockLocalStorage;

  // Case 1: First run on an existing phone without version stored
  const firstRun = checkAndPurgeIfVersionChanged('9e9ca6a');
  assert.equal(firstRun.changed, true);
  assert.equal(firstRun.isFirstRun, true);

  // Record version
  mockLocalStorage.setItem('komur_app_version', '9e9ca6a');

  // Case 2: Same version (no change)
  const sameVersion = checkAndPurgeIfVersionChanged('9e9ca6a');
  assert.equal(sameVersion.changed, false);
  assert.equal(sameVersion.isFirstRun, false);

  // Case 3: New commit deployed on server
  const upgraded = checkAndPurgeIfVersionChanged('a1b2c3d');
  assert.equal(upgraded.changed, true);
  assert.equal(upgraded.isFirstRun, false);
  assert.equal(upgraded.previousVersion, '9e9ca6a');
});

test('Version: getAppVersion returns valid commit hash or version identifier', () => {
  const ver = getAppVersion();
  assert.ok(ver && ver.length >= 4, `App version must be valid string: got "${ver}"`);
});
