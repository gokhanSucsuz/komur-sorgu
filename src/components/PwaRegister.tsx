'use client';

import { useEffect, useState } from 'react';
import { Download, X, Smartphone, Check } from 'lucide-react';

export default function PwaRegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Register Service Worker
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('SW registered successfully:', reg.scope);
        })
        .catch((err) => {
          console.warn('SW registration failed:', err);
        });
    }

    // Check if already running as standalone PWA
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isAppleDevice);

    // Handle beforeinstallprompt for Android / Chrome
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Check if user has previously dismissed
      const dismissed = localStorage.getItem('pwa_banner_dismissed');
      if (!dismissed && !standalone) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // If iOS and not standalone, show install tips if not dismissed
    if (isAppleDevice && !standalone) {
      const dismissed = localStorage.getItem('pwa_banner_dismissed');
      if (!dismissed) {
        setShowInstallBanner(true);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setShowInstallBanner(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowInstallBanner(false);
    localStorage.setItem('pwa_banner_dismissed', 'true');
  };

  if (isStandalone || !showInstallBanner) {
    return null;
  }

  return (
    <div className="relative z-50 p-3 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white shadow-md">
      <div className="max-w-md mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center shrink-0 border border-white/20">
            <Smartphone className="w-5 h-5 text-amber-200" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">Mobil Uygulama Olarak İndir</p>
            <p className="text-sm font-medium leading-tight truncate">
              {isIOS ? 'Safari Paylaş > Ana Ekrana Ekle' : deferredPrompt ? 'Telefonunuza hızlıca yükleyin' : 'Chrome Menü (⋮) > Ana ekrana ekle'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isIOS && deferredPrompt && (
            <button
              onClick={handleInstallClick}
              className="px-3 py-1.5 bg-white text-orange-950 font-semibold rounded-lg text-xs shadow hover:bg-amber-50 active:scale-95 transition-all flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              Yükle
            </button>
          )}
          <button
            onClick={handleDismiss}
            aria-label="Kapat"
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
