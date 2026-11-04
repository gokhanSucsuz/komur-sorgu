import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { requestAppFullscreen, exitAppFullscreen, isAppFullscreen } from '../src/lib/fullscreen';
import {
  validateSmartSearchInput,
  isBirebirBeneficiaryMatch,
  getCleanNavigationAddress,
  getYandexNaviUrl,
  getGoogleMapsUrl,
} from '../src/lib/normalizer';

test('Fullscreen: isAppFullscreen returns false when no fullscreenElement exists', () => {
  (globalThis as any).document = {
    fullscreenElement: null,
    documentElement: {
      requestFullscreen: async () => {},
    },
    exitFullscreen: async () => {},
  };

  assert.equal(isAppFullscreen(), false);
});

test('Fullscreen: requestAppFullscreen calls documentElement.requestFullscreen', () => {
  let called = false;
  (globalThis as any).document = {
    fullscreenElement: null,
    documentElement: {
      requestFullscreen: async () => {
        called = true;
      },
    },
  };

  requestAppFullscreen();
  assert.equal(called, true);
});

test('Fullscreen: exitAppFullscreen calls document.exitFullscreen when active', () => {
  let exited = false;
  const mockElement = {};
  (globalThis as any).document = {
    fullscreenElement: mockElement,
    exitFullscreen: async () => {
      exited = true;
    },
  };

  assert.equal(isAppFullscreen(), true);
  exitAppFullscreen();
  assert.equal(exited, true);
});

test('Route Mode Sequential Cockpit: direct launch, synchronous fullscreen, back-button & double-tap guards, and multi-phone support', () => {
  const accordionSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/ActiveRouteAccordionCard.tsx'),
    'utf8'
  );
  const createModalSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/route/RouteCreationModals.tsx'),
    'utf8'
  );
  const routePageSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/RoutePage.tsx'),
    'utf8'
  );
  const cockpitSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/route/RouteModeCockpitModal.tsx'),
    'utf8'
  );

  // 1. ActiveRouteAccordionCard opens Fullscreen Route Mode directly on card click and "Rotayı Aç (Tam Ekran)" button
  assert.ok(
    accordionSrc.includes('Rotayı Aç (Tam Ekran)') && accordionSrc.includes('onStartRouteMode()'),
    'ActiveRouteAccordionCard must launch Fullscreen Route Mode directly when clicking "Rotayı Aç"'
  );

  // 2. RouteCreationModals allows launching directly into Fullscreen Route Mode on route creation
  assert.ok(
    createModalSrc.includes('Rotayı Aç & Tam Ekran Başlat') &&
      createModalSrc.includes('handleCreateRouteSubmit(true)'),
    'RouteCreationModals must support launching newly created routes directly into Fullscreen Route Mode'
  );

  // 3. RoutePage calls requestAppFullscreen synchronously and protects against double-tap & accidental back navigation
  assert.ok(
    routePageSrc.includes('isSubmittingStopRef') &&
      routePageSrc.includes('routeModeGuard') &&
      routePageSrc.includes('requestAppFullscreen()'),
    'RoutePage must include synchronous fullscreen trigger, double-tap lock, and mobile back-button guard'
  );

  // 4. RouteModeCockpitModal supports multi-phone safe calling and touch swipe navigation
  assert.ok(
    cockpitSrc.includes('getRecordPhones(currentStop)') &&
      cockpitSrc.includes('handleTouchStart') &&
      cockpitSrc.includes('handleTouchEnd'),
    'RouteModeCockpitModal must use getRecordPhones and support touch swipe between sequential stops'
  );
});

test('Smart Search Input: numeric start locks to TC mode & blocks letters; letter start locks to NAME mode & blocks digits', () => {
  // 1. Empty input -> IDLE mode
  const idleRes = validateSmartSearchInput('');
  assert.equal(idleRes.mode, 'IDLE');
  assert.equal(idleRes.value, '');
  assert.equal(idleRes.rejected, false);
  assert.equal(idleRes.warning, null);

  // 2. Numeric start -> TC mode, accepts digits, rejects letters with warning
  const tcValid = validateSmartSearchInput('123456');
  assert.equal(tcValid.mode, 'TC');
  assert.equal(tcValid.value, '123456');
  assert.equal(tcValid.rejected, false);
  assert.equal(tcValid.warning, null);

  const tcWithLetter = validateSmartSearchInput('123456a');
  assert.equal(tcWithLetter.mode, 'TC');
  assert.equal(tcWithLetter.value, '123456');
  assert.equal(tcWithLetter.rejected, true);
  assert.ok(tcWithLetter.warning && tcWithLetter.warning.includes('TC Kimlik No'));

  const tcTooLong = validateSmartSearchInput('123456789012');
  assert.equal(tcTooLong.mode, 'TC');
  assert.equal(tcTooLong.value, '12345678901');
  assert.equal(tcTooLong.rejected, true);
  assert.ok(tcTooLong.warning && tcTooLong.warning.includes('11'));

  // 3. Letter start -> NAME mode, accepts Turkish letters + spaces, rejects digits with warning
  const nameValid = validateSmartSearchInput('Şükrü Çağlar');
  assert.equal(nameValid.mode, 'NAME');
  assert.equal(nameValid.value, 'Şükrü Çağlar');
  assert.equal(nameValid.rejected, false);
  assert.equal(nameValid.warning, null);

  const nameWithDigit = validateSmartSearchInput('Şükrü5');
  assert.equal(nameWithDigit.mode, 'NAME');
  assert.equal(nameWithDigit.value, 'Şükrü');
  assert.equal(nameWithDigit.rejected, true);
  assert.ok(nameWithDigit.warning && nameWithDigit.warning.includes('Ad Soyad'));

  // 4. Matching strictly follows TC vs Name mode
  const sampleRecord = { tc_no: '12345678901', ad_soyad: 'Ekrem Yılmaz', sira_no: '12' };
  assert.equal(isBirebirBeneficiaryMatch(sampleRecord, '12345'), true);
  assert.equal(isBirebirBeneficiaryMatch(sampleRecord, 'Ekrem'), true);
  assert.equal(isBirebirBeneficiaryMatch({ tc_no: '99999999999', ad_soyad: 'Ali Veli', sira_no: '12' }, '12'), false);
});

test('Route Mode Exit & Pull-to-Refresh Guard: exiting Route Mode synchronously clears all session keys and never re-enters on refresh', () => {
  const routePageSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/RoutePage.tsx'),
    'utf8'
  );
  const homePageSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/app/page.tsx'),
    'utf8'
  );

  // 1. Synchronous ref lock prevents saveCurrentSession from re-saving after exit is triggered
  assert.ok(
    routePageSrc.includes('isRouteModeActiveRef') &&
      routePageSrc.includes('if (!isRouteModeOpen || !isRouteModeActiveRef.current || !activeRoute) return;'),
    'saveCurrentSession must be guarded by isRouteModeActiveRef so async fetches during exit never re-write localStorage'
  );

  // 2. clearSavedSession wipes all komur_active_route_session_* keys
  assert.ok(
    routePageSrc.includes("key.startsWith('komur_active_route_session_')") &&
      routePageSrc.includes('localStorage.removeItem(key)'),
    'clearSavedSession must clear all komur_active_route_session_* keys across username transitions'
  );

  // 3. Session restore checks aktif_rota_modu !== false and DURAKLATILDI so paused routes do not auto-open
  assert.ok(
    routePageSrc.includes("targetRoute.aktif_rota_modu === false") &&
      routePageSrc.includes("targetRoute.durum === 'DURAKLATILDI'"),
    'Session restore must not auto-open Route Mode if the route was paused/exited'
  );

  // 4. Home page respects non-route active tabs on pull-to-refresh and cleans up stale route session keys
  assert.ok(
    homePageSrc.includes("if (currentTab !== 'route')") &&
      homePageSrc.includes("saved !== 'route'"),
    'Home page must keep user on their current tab on pull-to-refresh when not in Route Mode'
  );
});

test('Yandex Navigasyon & Clean Address: deduplicated neighborhood, exterior door precision, and direct card button', () => {
  // 1. Prevent duplicate mahalle (the core bug: "mahalle adını 2 kez yazıyor navigasyona ve aranan adres bulunmuyor")
  const personDuplicate = {
    mahalle: 'Cumhuriyet Mah.',
    acik_adres: 'Cumhuriyet Mah. Karanfil Sokak No: 14 Kat: 2 Daire: 5 Edirne',
  };
  const cleanAddr = getCleanNavigationAddress(personDuplicate);
  assert.equal(cleanAddr, 'Cumhuriyet Mahallesi, Karanfil Sokak No: 14, Edirne');
  // Check that "Cumhuriyet" only occurs once
  const cumhuriyetMatches = cleanAddr.match(/Cumhuriyet/gi) || [];
  assert.equal(cumhuriyetMatches.length, 1, 'Mahalle name must never appear twice in navigation address');

  // 2. Village address with door number
  const villagePerson = {
    mahalle: 'Kayapa Köyü',
    acik_adres: 'Kayapa Köyü No: 48 Edirne',
  };
  const villageAddr = getCleanNavigationAddress(villagePerson);
  assert.equal(villageAddr, 'Kayapa Köyü, No: 48, Edirne');

  // 2.1 Village address with Küme Evleri
  const villageKumePerson = {
    mahalle: 'Avarız Köyü',
    acik_adres: 'Avarız Köyü Küme Evleri No: 12 Edirne',
  };
  assert.equal(getCleanNavigationAddress(villageKumePerson), 'Avarız Köyü, Küme Evleri No: 12, Edirne');

  // 3. Numbered street and apartment noise stripping (interior noise confuses outdoor GPS)
  const numberedStreetPerson = {
    mahalle: 'Fatih Mahallesi',
    acik_adres: 'Fatih Mah. 24. Sokak No: 7/A Kat: 3 Daire: 8 Merkez Edirne',
  };
  const numberedAddr = getCleanNavigationAddress(numberedStreetPerson);
  assert.equal(numberedAddr, 'Fatih Mahallesi, 24. Sokak No: 7A, Edirne');

  // 4. Cul-de-sac (Çıkmazı) street
  const culDeSacPerson = {
    mahalle: 'Babademirtaş',
    acik_adres: 'Babademirtaş Mah. Gül Çıkmazı No: 5',
  };
  const culDeSacAddr = getCleanNavigationAddress(culDeSacPerson);
  assert.equal(culDeSacAddr, 'Babademirtaş Mahallesi, Gül Çıkmazı No: 5, Edirne');

  // 5. Yandex Navigasyon URL generation
  const yandexUrl = getYandexNaviUrl(personDuplicate);
  assert.ok(yandexUrl.startsWith('https://yandex.com.tr/harita/?text='), 'Must produce valid Yandex Navigasyon URL');
  assert.ok(
    decodeURIComponent(yandexUrl).includes('Cumhuriyet Mahallesi, Karanfil Sokak No: 14, Edirne'),
    'Yandex query must be the clean pinpoint address'
  );

  // 6. Google Maps URL generation
  const googleUrl = getGoogleMapsUrl(personDuplicate);
  assert.ok(googleUrl.startsWith('https://www.google.com/maps/search/?api=1&query='), 'Must produce valid Google Maps URL');

  // 7. Component check: BeneficiaryList, RouteModeCockpitModal, HouseholdModal, ActiveRouteAccordionCard all provide Yandex Navigasyon
  const beneficiaryListSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/BeneficiaryList.tsx'),
    'utf8'
  );
  const cockpitSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/route/RouteModeCockpitModal.tsx'),
    'utf8'
  );
  const householdSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/HouseholdModal.tsx'),
    'utf8'
  );
  const accordionSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/ActiveRouteAccordionCard.tsx'),
    'utf8'
  );

  assert.ok(
    beneficiaryListSrc.includes('getYandexNaviUrl(person)') &&
      beneficiaryListSrc.includes('Yandex Navigasyon'),
    'BeneficiaryList must display Yandex Navigasyon directly in record cards'
  );
  assert.ok(
    cockpitSrc.includes('getYandexNaviUrl(currentStop)'),
    'RouteModeCockpitModal must provide direct Yandex Navigasyon button in delivery address box'
  );
  assert.ok(
    householdSrc.includes('getYandexNaviUrl(person)'),
    'HouseholdModal must provide direct Yandex Navigasyon button in address section'
  );
  assert.ok(
    accordionSrc.includes('getYandexNaviUrl({'),
    'ActiveRouteAccordionCard must provide direct Yandex Navigasyon button'
  );
});

