import test from 'node:test';
import assert from 'node:assert/strict';
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
