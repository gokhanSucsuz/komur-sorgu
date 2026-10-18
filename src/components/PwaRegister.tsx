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
    <div
      className="relative z-50 p-2.5 sm:p-3 shadow-md border-b border-orange-700/20 pwa-banner"
      style={{
        background: 'linear-gradient(135deg, #d97706 0%, #ea580c 50%, #c2410c 100%)',
        color: '#ffffff',
        boxShadow: '0 4px 14px rgba(234, 88, 12, 0.25)',
      }}
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 px-1 sm:px-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <Smartphone className="w-5 h-5" style={{ color: '#fef3c7' }} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[11px] sm:text-xs font-black uppercase tracking-wider"
              style={{ color: '#fef08a', textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)' }}
            >
              Mobil Uygulama Olarak İndir
            </p>
            <p
              className="text-xs sm:text-sm font-bold leading-tight truncate"
              style={{ color: '#ffffff', textShadow: '0 1px 2px rgba(0, 0, 0, 0.15)' }}
            >
              {isIOS ? 'Safari Paylaş > Ana Ekrana Ekle' : deferredPrompt ? 'Telefonunuza hızlıca yükleyin' : 'Chrome Menü (⋮) > Ana ekrana ekle'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isIOS && deferredPrompt && (
            <button
              onClick={handleInstallClick}
              className="px-3.5 py-1.5 rounded-lg text-xs font-black shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: '#ffffff',
                color: '#9a3412',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.8)',
              }}
            >
              <Download className="w-3.5 h-3.5" style={{ color: '#ea580c' }} />
              <span>Yükle</span>
            </button>
          )}
          <button
            onClick={handleDismiss}
            aria-label="Kapat"
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{
              color: '#ffffff',
              backgroundColor: 'rgba(255, 255, 255, 0.18)',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
