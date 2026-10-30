/**
 * Cross-browser Fullscreen API Helper
 * Supports standard Fullscreen API and vendor-prefixed implementations (WebKit, Moz, MS)
 * with graceful fallback for mobile WebViews / iOS Safari.
 */

export function requestAppFullscreen(): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement as any;
  const req =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.mozRequestFullScreen ||
    el.msRequestFullscreen;
  if (req) {
    req.call(el).catch(() => {});
  }
}

export function exitAppFullscreen(): void {
  if (typeof document === 'undefined') return;
  const doc = document as any;
  if (
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement
  ) {
    const exit =
      doc.exitFullscreen ||
      doc.webkitExitFullscreen ||
      doc.mozCancelFullScreen ||
      doc.msExitFullscreen;
    if (exit) {
      exit.call(doc).catch(() => {});
    }
  }
}

export function isAppFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as any;
  return !!(
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement
  );
}
