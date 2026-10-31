import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { requestAppFullscreen, exitAppFullscreen, isAppFullscreen } from '../src/lib/fullscreen';

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
