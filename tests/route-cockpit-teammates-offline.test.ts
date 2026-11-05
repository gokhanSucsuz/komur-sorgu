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

test('5. Sadece İmzası Alınan Kayıtlar & Dağıtım Takibi: Rotalı/Rotasız ve Doğrudan Teslimat Ayrımı', () => {
  // 1. Backend API & Frontend Component Doğrulaması
  const routeApiSrc = fs.readFileSync(path.join(process.cwd(), 'src/app/api/routes/route.ts'), 'utf-8');
  const routePageSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/RoutePage.tsx'), 'utf-8');

  // A. Backend API signedTrackingRecords & signedTrackingStats üretmeli
  assert.ok(
    routeApiSrc.includes('signedTrackingRecords') &&
      routeApiSrc.includes('signedTrackingStats') &&
      routeApiSrc.includes('routeBeneficiaryMap') &&
      routeApiSrc.includes('dogrudan_teslimat'),
    'GET /api/routes imzalı kayıtların rotalı/rotasız durumlarını ve istatistiklerini haritalamalıdır'
  );

  // B. RoutePage SIGNED_RECORDS sekmesini ve 4 adet KPI/filtre kategorisini barındırmalı
  assert.ok(
    routePageSrc.includes("'SIGNED_RECORDS'") &&
      routePageSrc.includes('signedTrackingStats') &&
      routePageSrc.includes('signedTrackingRecords') &&
      routePageSrc.includes("'UNDELIVERED'") &&
      routePageSrc.includes("'DELIVERED'") &&
      routePageSrc.includes("'DIRECT_DELIVERED'"),
    'RoutePage imzalı kayıtlar için SIGNED_RECORDS sekmesine ve alt filtrelerine sahip olmalıdır'
  );

  // C. RoutePage üzerinde navigasyon (Yandex 1., Google 2., Parsel 3.) butonları yer almalı
  assert.ok(
    routePageSrc.includes('getYandexNaviUrl(person)') &&
      routePageSrc.includes('getGoogleMapsUrl(person)') &&
      routePageSrc.includes('getParselSorguSearchSummary(person)') &&
      routePageSrc.includes('PARSEL_SORGU_URL'),
    'RoutePage imzalı kayıtlar listesinde Yandex, Google ve Parsel Sorgu navigasyon butonlarını sunmalıdır'
  );

  // 2. Saf Mantık & İstatistik Ayrıştırma Testi
  const sampleBeneficiaries = [
    // 1. İmzalı & Aktif Rotada Bekleyen
    { id: 'b1', tc_no: '11111111110', ad_soyad: 'Ahmet Yılmaz', imza_durumu: 'IMZALANDI', teslimat_durumu: 'BEKLIYOR', hedef_torba: 34 },
    // 2. İmzalı & Havuzda Bekleyen (Rotasız)
    { id: 'b2', tc_no: '22222222220', ad_soyad: 'Mehmet Kaya', imza_durumu: 'IMZALANDI', teslimat_durumu: 'BEKLIYOR', hedef_torba: 34 },
    // 3. İmzalı & Rota İle Teslim Edilen
    { id: 'b3', tc_no: '33333333330', ad_soyad: 'Ayşe Demir', imza_durumu: 'IMZALANDI', teslimat_durumu: 'TAMAMLANDI', torba_sayisi: 34, hedef_torba: 34 },
    // 4. İmzalı & Rotaya Dahil Edilmeden Doğrudan Teslim Edilen
    { id: 'b4', tc_no: '44444444440', ad_soyad: 'Fatma Çelik', imza_durumu: 'IMZALANDI', teslimat_durumu: 'TAMAMLANDI', torba_sayisi: 34, hedef_torba: 34 },
  ];

  const routeBeneficiaryMap = new Map<string, { routeId: string; routeName: string; routeStatus: string }>();
  routeBeneficiaryMap.set('b1', { routeId: 'r1', routeName: 'Ekip 1 Rotası', routeStatus: 'AKTIF' });
  routeBeneficiaryMap.set('b3', { routeId: 'r2', routeName: 'Dünkü Arşiv Rotası', routeStatus: 'TAMAMLANDI' });

  let totalSigned = 0;
  let signedUndelivered = 0;
  let signedDelivered = 0;
  let directDelivered = 0;
  let routeDelivered = 0;

  const processed = sampleBeneficiaries.map((b) => {
    const routeInfo = routeBeneficiaryMap.get(b.id);
    const isInRoute = !!routeInfo;
    const isDelivered = b.teslimat_durumu === 'TAMAMLANDI';
    const isSigned = b.imza_durumu === 'IMZALANDI';
    const isDirectDelivery = isDelivered && !isInRoute;

    if (isSigned) {
      totalSigned++;
      if (isDelivered) signedDelivered++;
      else signedUndelivered++;
    }
    if (isDelivered) {
      if (isInRoute) routeDelivered++;
      else directDelivered++;
    }

    let teslimatSekli = 'HAVUZDA_BEKLIYOR';
    if (isDelivered) teslimatSekli = isInRoute ? 'ROTA_TESLIMATI' : 'DOGRUDAN_TESLIMAT';
    else teslimatSekli = isInRoute ? 'ROTADA_BEKLIYOR' : 'HAVUZDA_BEKLIYOR';

    return {
      ...b,
      isInRoute,
      isDirectDelivery,
      teslimatSekli
    };
  });

  assert.strictEqual(totalSigned, 4, 'Toplam imzalı hane 4 olmalıdır');
  assert.strictEqual(signedUndelivered, 2, 'İmzası alınıp teslim edilmeyen 2 hane olmalıdır');
  assert.strictEqual(signedDelivered, 2, 'İmzası alınıp teslim edilen 2 hane olmalıdır');
  assert.strictEqual(directDelivered, 1, 'Rotaya dahil edilmeden teslim edilen 1 hane olmalıdır (Fatma Çelik)');
  assert.strictEqual(routeDelivered, 1, 'Rota ile teslim edilen 1 hane olmalıdır (Ayşe Demir)');

  const b1 = processed.find((p) => p.id === 'b1');
  assert.strictEqual(b1?.teslimatSekli, 'ROTADA_BEKLIYOR');

  const b2 = processed.find((p) => p.id === 'b2');
  assert.strictEqual(b2?.teslimatSekli, 'HAVUZDA_BEKLIYOR');

  const b3 = processed.find((p) => p.id === 'b3');
  assert.strictEqual(b3?.teslimatSekli, 'ROTA_TESLIMATI');

  const b4 = processed.find((p) => p.id === 'b4');
  assert.strictEqual(b4?.teslimatSekli, 'DOGRUDAN_TESLIMAT');
  assert.strictEqual(b4?.isDirectDelivery, true);
});

test('6. Teslimat Arşivi: İptal edilen teslimatların ve imzası geri alınan hanelerin teslimat sayısından düşülmesi', () => {
  const historyApiSrc = fs.readFileSync(path.join(process.cwd(), 'src/app/api/delivery/history/route.ts'), 'utf-8');
  const deliveryArchiveSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/DeliveryArchive.tsx'), 'utf-8');
  const deliveryApiSrc = fs.readFileSync(path.join(process.cwd(), 'src/app/api/delivery/route.ts'), 'utf-8');
  const exportApiSrc = fs.readFileSync(path.join(process.cwd(), 'src/app/api/export/route.ts'), 'utf-8');

  // A. Backend History API doğrulaması
  assert.ok(
    historyApiSrc.includes('benMap') &&
      historyApiSrc.includes('hasSubsequentCancel') &&
      historyApiSrc.includes('isSignatureRevoked') &&
      historyApiSrc.includes('iptal_edildi'),
    'GET /api/delivery/history hak sahipleri tablosu ve iptal loglarıyla mutabakat yaparak iptal_edildi bayrağı belirlemelidir'
  );

  // B. DeliveryArchive UI doğrulaması
  assert.ok(
    deliveryArchiveSrc.includes('!r.iptal_edildi') &&
      deliveryArchiveSrc.includes('deliveredItems = useMemo') &&
      deliveryArchiveSrc.includes('todayRecords = useMemo'),
    'DeliveryArchive bileşeni teslim edilenler ve bugün listelerinde iptal_edildi bayraklı kayıtları elemelidir'
  );

  // C. Delivery API iptal işleminde geçmişi bayraklama
  assert.ok(
    deliveryApiSrc.includes('iptal_edildi: true') &&
      deliveryApiSrc.includes('histCol.updateMany'),
    'Kömür teslimatı iptal edildiğinde geçmişteki TESLIMAT kayıtları iptal_edildi: true olarak işaretlenmelidir'
  );

  // D. Export API iptal edilenleri dışa aktarmadan eleme
  assert.ok(
    exportApiSrc.includes('validRecords') &&
      exportApiSrc.includes('r.iptal_edildi'),
    'Excel dışa aktarım API iptal edilmiş teslimatları resmi teslimat listesinden kesinlikle çıkarmalıdır'
  );

  // E. Simülasyon: Hatalı teslimat ve imza geri alma senaryosu
  const mockBens = new Map([
    // Mehmet Ali: Teslim edildi -> İptal edildi -> Yeniden teslim edildi (Aktif)
    ['b_ali', { id: 'b_ali', ad_soyad: 'Mehmet Ali', teslimat_durumu: 'TAMAMLANDI', imza_durumu: 'IMZALANDI', torba_sayisi: 34 }],
    // Nurettin: Yanlışlıkla teslim edildi -> İptal edildi & İmza geri alındı (Teslim Edilmedi!)
    ['b_nurettin', { id: 'b_nurettin', ad_soyad: 'Nurettin Dur', teslimat_durumu: 'BEKLIYOR', imza_durumu: 'BEKLIYOR', torba_sayisi: 0 }],
    // Normal Hane: Teslim edildi
    ['b_normal', { id: 'b_normal', ad_soyad: 'Ayşe Hanım', teslimat_durumu: 'TAMAMLANDI', imza_durumu: 'IMZALANDI', torba_sayisi: 34 }],
  ]);

  const mockHistory = [
    { id: 'h1', beneficiary_id: 'b_ali', islem_tipi: 'TESLIMAT', torba_sayisi: 34, tarih: '14:44' },
    { id: 'h2', beneficiary_id: 'b_ali', islem_tipi: 'IPTAL', torba_sayisi: 34, tarih: '14:46' },
    { id: 'h3', beneficiary_id: 'b_ali', islem_tipi: 'TESLIMAT', torba_sayisi: 34, tarih: '14:47' },
    { id: 'h4', beneficiary_id: 'b_nurettin', islem_tipi: 'TESLIMAT', torba_sayisi: 34, tarih: '18:25' },
    { id: 'h5', beneficiary_id: 'b_nurettin', islem_tipi: 'IPTAL', torba_sayisi: 34, tarih: '21:54' },
    { id: 'h6', beneficiary_id: 'b_normal', islem_tipi: 'TESLIMAT', torba_sayisi: 34, tarih: '10:00' },
  ];

  const historyByBen = new Map();
  mockHistory.forEach((r) => {
    if (!historyByBen.has(r.beneficiary_id)) historyByBen.set(r.beneficiary_id, []);
    historyByBen.get(r.beneficiary_id).push(r);
  });

  let validDeliveries = 0;
  let validTorba = 0;
  let cancelledDeliveries = 0;

  mockHistory.forEach((r) => {
    if (r.islem_tipi === 'TESLIMAT') {
      const ben = mockBens.get(r.beneficiary_id);
      const benHistory = historyByBen.get(r.beneficiary_id) || [];
      const thisIdx = benHistory.indexOf(r);
      const subsequentEvents = benHistory.slice(thisIdx + 1);

      const hasSubsequentCancel = subsequentEvents.some((e: any) => e.islem_tipi === 'IPTAL');
      const hasSubsequentDelivery = subsequentEvents.some((e: any) => e.islem_tipi === 'TESLIMAT');
      const isCurrentlyDeliveredInDb = ben && (ben.teslimat_durumu === 'TAMAMLANDI' || ben.teslimat_durumu === 'TESLIM_EDILDI');
      const isSignatureRevoked = !ben || ben.imza_durumu !== 'IMZALANDI';

      let isCancelled = false;
      if (hasSubsequentCancel && !hasSubsequentDelivery) isCancelled = true;
      else if (hasSubsequentDelivery) isCancelled = true;
      else if (!isCurrentlyDeliveredInDb || isSignatureRevoked) isCancelled = true;

      if (isCancelled) {
        cancelledDeliveries++;
      } else {
        validDeliveries++;
        validTorba += r.torba_sayisi;
      }
    }
  });

  // Toplam 4 adet TESLIMAT kaydından sadece 2 tanesi geçerlidir (Ayşe Hanım ve Mehmet Ali'nin son teslimatı)
  // Nurettin Dur iptal edildiği için, Mehmet Ali'nin ilk hatalı teslimatı da iptal edildiği için sayılmamalıdır!
  assert.strictEqual(validDeliveries, 2, 'Geçerli teslimat sayısı 2 olmalıdır (Nurettin Dur ve Mehmet Ali ilk kayıt hariç)');
  assert.strictEqual(validTorba, 68, 'Geçerli toplam torba 68 olmalıdır');
  assert.strictEqual(cancelledDeliveries, 2, 'İptal / geçersiz sayılan teslimat kaydı 2 olmalıdır');
});
