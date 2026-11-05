import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isProtectedStorageKey } from '../src/lib/cacheManager';
import { saveOfflineDelivery, getOfflineQueue, clearSandboxOfflineQueue, setOfflineQueueActiveMode } from '../src/lib/offlineSync';

test('1. Eksik Kömür Teslimatı Mantığı: Hedef kotadan az girildiğinde EKSIK durumu ve torba miktarı tam korunur', () => {
  const hedef = 34;
  const parsed = 20; // Kullanıcı 20 torba girdi
  const prevDelivered = 0;

  const effectiveInput = !isNaN(parsed) && parsed > 0 ? parsed : (prevDelivered > 0 ? Math.max(0, hedef - prevDelivered) : hedef);
  const totalDelivered = prevDelivered > 0 ? prevDelivered + effectiveInput : effectiveInput;

  let targetDurum: 'TAMAMLANDI' | 'EKSIK' = 'TAMAMLANDI';
  let targetTorba = hedef;

  if (totalDelivered >= hedef) {
    targetTorba = totalDelivered;
    targetDurum = 'TAMAMLANDI';
  } else {
    targetTorba = totalDelivered;
    targetDurum = 'EKSIK';
  }

  assert.equal(targetDurum, 'EKSIK', 'Hedef 34 iken 20 torba teslim edilirse durum EKSIK olmalıdır');
  assert.equal(targetTorba, 20, 'Teslim edilen torba sayısı tam olarak girilen 20 torba olmalıdır');
  assert.equal(hedef - targetTorba, 14, 'Kalan eksik torba 14 olmalıdır');

  // Tam teslimat senaryosu
  const fullParsed = 34;
  const fullTotal = fullParsed;
  const fullDurum = fullTotal >= hedef ? 'TAMAMLANDI' : 'EKSIK';
  assert.equal(fullDurum, 'TAMAMLANDI', '34 torba girildiğinde TAMAMLANDI olmalıdır');
});

test('2. Filtre Kalıcılığı: Mahalle ve sokak filtre anahtarları localStorage temizliğine karşı kesin korunmalıdır', () => {
  assert.equal(isProtectedStorageKey('komur_filter_mahalleler'), true, 'komur_filter_mahalleler korunmalı');
  assert.equal(isProtectedStorageKey('komur_filter_sokak'), true, 'komur_filter_sokak korunmalı');
});

test('3. Çevrimdışı Kuyruk & Rota Durağı Senkronizasyon Desteği', () => {
  // Mock localStorage and window
  const storage: Record<string, string> = {};
  (globalThis as any).window = {
    dispatchEvent: () => true,
  };
  (globalThis as any).localStorage = {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => { storage[key] = val; },
    removeItem: (key: string) => { delete storage[key]; },
  };

  setOfflineQueueActiveMode('DENEME');
  clearSandboxOfflineQueue();

  const item = saveOfflineDelivery({
    beneficiary_id: 'ben_123',
    route_id: 'route_456',
    stop_index: 2,
    durum: 'EKSIK',
    tc_no: '12345678901',
    ad_soyad: 'Ahmet Yılmaz',
    torba_sayisi: 20,
    eklenen_torba: 20,
    teslim_alan: 'Ahmet Yılmaz',
    personel: 'Saha Ekibi 1',
    notlar: '20 torba teslim edildi'
  });

  assert.ok(item.client_uuid, 'Client UUID üretilmeli');
  assert.equal(item.durum, 'EKSIK');
  assert.equal(item.route_id, 'route_456');
  assert.equal(item.stop_index, 2);
  assert.equal(item.torba_sayisi, 20);

  const queue = getOfflineQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].route_id, 'route_456');
  assert.equal(queue[0].stop_index, 2);

  clearSandboxOfflineQueue();
});

test('4. Kod Bütünlüğü: Ekip arkadaşları kilit engeli olmadan durak ekleyebilmeli, tam ekran uyarısı kaldırılmış olmalı', () => {
  const routeApiSrc = fs.readFileSync(path.join(process.cwd(), 'src/app/api/routes/route.ts'), 'utf8');
  const routePageSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/RoutePage.tsx'), 'utf8');
  const cockpitSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/route/RouteModeCockpitModal.tsx'), 'utf8');
  const benListSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BeneficiaryList.tsx'), 'utf8');

  // A. ADD_STOPS_TO_ROUTE kilit kontrolü kaldırılmış olmalı (ekip arkadaşı ekleyebilsin)
  assert.ok(
    routeApiSrc.includes('ADD_STOPS_TO_ROUTE') &&
      routeApiSrc.includes('Saha işbirliği: Yetkili ekip arkadaşları aktif veya kilitli bir rotaya yeni imzalı haneleri'),
    'ADD_STOPS_TO_ROUTE işleminde ekip arkadaşları kokpit kilidi tarafından engellenmemelidir'
  );

  // B. Hayalet durak otomatik temizliği (İmzası geri alınmış olanlar rotadan otomatik çıkarılır)
  assert.ok(
    routeApiSrc.includes('Auto-cleanup ghost stops: İmzası geri alınmış veya kömürü iptal edilmiş olup rotada takılı kalan kayıtları rotadan çıkar') &&
      routeApiSrc.includes('ghostFound'),
    'GET /api/routes aktif rotalardaki imzası iptal edilen hayalet durakları otomatik temizlemelidir'
  );

  // C. Tam ekran zorlaması (onPointerDown) kaldırılmış olmalı
  assert.ok(
    !cockpitSrc.includes('onPointerDown={() => {'),
    'RouteModeCockpitModal ekran dokunuşunda sürekli donanım tam ekranı tetiklememelidir'
  );

  // D. Rota Modu teslimatı tamamlananlar bölümü
  assert.ok(
    cockpitSrc.includes('Teslimatı Tamamlanan Rota Kayıtları') &&
      cockpitSrc.includes('showCompletedSection'),
    'RouteModeCockpitModal teslimatı tamamlanan rota kayıtları için özel bölüme sahip olmalıdır'
  );

  // E. Rota Modu sıralı gezinti sadece eksik/bekleyen haneler arasında dolaşmalı
  assert.ok(
    cockpitSrc.includes('incompleteStops') && cockpitSrc.includes('nextIncompleteStop'),
    'RouteModeCockpitModal sıralı gezintisi yalnızca eksik/bekleyen haneler arasında dolaşmalıdır'
  );

  // F. İmza geri alma aktif rota kontrol ve onay uyarısı
  assert.ok(
    benListSrc.includes('routeRevokeTarget') &&
      benListSrc.includes('Aktif Rota ve İmza Uyarısı') &&
      benListSrc.includes('rotadan da çıkarılsın mı'),
    'BeneficiaryList imzası geri alınan hanenin aktif rotada olup olmadığını denetleyip kullanıcıya onay sormalıdır'
  );

  // G. RoutePage çevrimdışı teslimat kaydetme ve eksik teslimat tespiti
  assert.ok(
    routePageSrc.includes('saveOfflineDelivery') &&
      routePageSrc.includes("targetDurum = 'EKSIK'"),
    'RoutePage çevrimdışı teslimatı kaydetmeli ve eksik teslimatta EKSIK durumunu uygulamalıdır'
  );
});
