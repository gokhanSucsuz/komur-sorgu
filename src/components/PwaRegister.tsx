'use client';

import { useEffect, useState } from 'react';
import {
  Download,
  X,
  Smartphone,
  Check,
  Zap,
  Maximize2,
  Copy,
  Share2,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { showToast } from './GlobalAlertManager';

export default function PwaRegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showHelperModal, setShowHelperModal] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isOldAndroid, setIsOldAndroid] = useState(false);
  const [androidVersion, setAndroidVersion] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isLiteMode, setIsLiteMode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Register Service Worker safely (graceful fallback on very old WebViews)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('SW registered successfully:', reg.scope);
        })
        .catch((err) => {
          console.warn('SW registration failed (legacy browser fallback active):', err);
        });
    }

    // 2. Check if already running as standalone PWA
    const standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // 3. Detect OS & Older Android Phones (Android 4, 5, 6, 7, 8, 9 or <= 2GB RAM)
    const ua = window.navigator.userAgent || '';
    const uaLower = ua.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(uaLower);
    const isAndroidDevice = /android/.test(uaLower);
    setIsIOS(isAppleDevice);
    setIsAndroid(isAndroidDevice);

    let detectedOldAndroid = false;
    const androidMatch = ua.match(/Android\s+([0-9.]+)/i);
    if (androidMatch && androidMatch[1]) {
      setAndroidVersion(androidMatch[1]);
      const majorVer = parseInt(androidMatch[1].split('.')[0], 10);
      if (!isNaN(majorVer) && majorVer <= 9) {
        detectedOldAndroid = true;
      }
    }
    const devMem = (navigator as any).deviceMemory;
    if (typeof devMem === 'number' && devMem <= 2) {
      detectedOldAndroid = true;
    }
    setIsOldAndroid(detectedOldAndroid);

    // 4. Initialize Lite Mode (Eski Android Hafif & Hızlı Performans Modu)
    try {
      const savedLite = localStorage.getItem('komur_lite_mode');
      const shouldEnableLite = savedLite === 'true' || (savedLite === null && detectedOldAndroid);
      if (shouldEnableLite) {
        setIsLiteMode(true);
        document.documentElement.classList.add('lite-mode');
        if (savedLite === null && detectedOldAndroid) {
          localStorage.setItem('komur_lite_mode', 'true');
        }
      }
    } catch {}

    // 5. Show top install / helper banner on mobile devices (even if beforeinstallprompt never fires on old Android!)
    try {
      const dismissed = localStorage.getItem('pwa_banner_dismissed');
      if (!dismissed && !standalone && (isAndroidDevice || isAppleDevice || detectedOldAndroid)) {
        setShowInstallBanner(true);
      }
    } catch {}

    // 6. Handle beforeinstallprompt for supported Android / Chrome devices
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      try {
        const dismissed = localStorage.getItem('pwa_banner_dismissed');
        if (!dismissed && !standalone) {
          setShowInstallBanner(true);
        }
      } catch {}
    };

    // 7. Listen for global custom event to open the Old Android & App Install Helper Modal from LoginPage / Header
    const handleOpenHelper = () => {
      setShowHelperModal(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('komur_open_android_helper', handleOpenHelper);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('komur_open_android_helper', handleOpenHelper);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          setShowInstallBanner(false);
          setDeferredPrompt(null);
          return;
        }
      } catch {
        // Fallback to manual helper modal if WebAPK install fails on old Android
      }
      setDeferredPrompt(null);
    }
    // If deferredPrompt is unavailable (old Android / iOS / WebAPK unsupported), open the helper modal!
    setShowHelperModal(true);
  };

  const handleToggleLiteMode = () => {
    const next = !isLiteMode;
    setIsLiteMode(next);
    try {
      localStorage.setItem('komur_lite_mode', next ? 'true' : 'false');
    } catch {}
    if (typeof document !== 'undefined') {
      if (next) {
        document.documentElement.classList.add('lite-mode');
      } else {
        document.documentElement.classList.remove('lite-mode');
      }
    }
    showToast({
      type: 'success',
      title: next ? 'Eski Telefon Hızlı Modu Aktif' : 'Standart Görsel Mod Aktif',
      message: next
        ? 'Ağır görsel efektler kapatıldı. Eski model Android telefonlarda maksimum hızda çalışır.'
        : 'Standart görsel efektler yeniden açıldı.',
    });
  };

  const handleOpenFullscreen = () => {
    if (typeof document !== 'undefined') {
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
    if (!isLiteMode) {
      handleToggleLiteMode();
    }
    setShowHelperModal(false);
    showToast({
      type: 'success',
      title: 'Kurulumsuz Tam Ekran Modu',
      message: 'Uygulama yüklemeden doğrudan tam ekran olarak kullanabilirsiniz.',
    });
  };

  const handleCopyUrl = () => {
    if (typeof window === 'undefined') return;
    const url = window.location.origin;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
    showToast({
      type: 'success',
      title: 'Giriş Adresi Kopyalandı',
      message: 'Bağlantıyı telefonunuzun tarayıcısında yer imlerine (★) ekleyebilirsiniz.',
    });
  };

  const handleDismiss = () => {
    setShowInstallBanner(false);
    try {
      localStorage.setItem('pwa_banner_dismissed', 'true');
    } catch {}
  };

  return (
    <>
      {/* ÜST TURUNCU UYGULAMA & ESKİ ANDROID KURULUM BARI */}
      {!isStandalone && showInstallBanner && (
        <div
          className="relative z-50 p-2.5 sm:p-3 shadow-md border-b border-orange-700/20 pwa-banner no-print"
          style={{
            background: 'linear-gradient(135deg, #d97706 0%, #ea580c 50%, #c2410c 100%)',
            color: '#ffffff',
            boxShadow: '0 4px 14px rgba(234, 88, 12, 0.25)',
          }}
        >
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-2.5 px-1 sm:px-4">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.35)',
                }}
              >
                <Smartphone className="w-5 h-5" style={{ color: '#fef3c7' }} />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[11px] sm:text-xs font-black uppercase tracking-wider truncate"
                  style={{ color: '#fef08a', textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)' }}
                >
                  {isOldAndroid
                    ? `Eski Model Android (${androidVersion ? `Android ${androidVersion}` : 'Hızlı Mod'}) Çözümü`
                    : 'Mobil Uygulama & Ana Ekran Kısayolu'}
                </p>
                <p
                  className="text-xs sm:text-sm font-bold leading-tight truncate"
                  style={{ color: '#ffffff', textShadow: '0 1px 2px rgba(0, 0, 0, 0.15)' }}
                >
                  {deferredPrompt
                    ? 'Telefonunuza hızlıca yükleyin veya kısayol ekleyin'
                    : 'Uygulama yüklenmiyorsa tek dokunuşla kurulumsuz açın'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleInstallClick}
                className="px-3 py-1.5 rounded-lg text-xs font-black shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                style={{
                  backgroundColor: '#ffffff',
                  color: '#9a3412',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.8)',
                }}
              >
                <Download className="w-3.5 h-3.5" style={{ color: '#ea580c' }} />
                <span>{deferredPrompt ? 'Yükle' : 'Kurulum Çözümü'}</span>
              </button>

              {!deferredPrompt && (
                <button
                  type="button"
                  onClick={() => setShowHelperModal(true)}
                  className="hidden sm:flex px-2.5 py-1.5 rounded-lg text-xs font-extrabold items-center gap-1 cursor-pointer"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.35)',
                  }}
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Eski Telefon Yardımı</span>
                </button>
              )}

              <button
                type="button"
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
      )}

      {/* ESKİ MODEL ANDROID & UYGULAMA YÜKLENMEME ÇÖZÜM MERKEZİ MODALI */}
      {showHelperModal && (
        <div
          className="fixed inset-0 z-[9999] bg-slate-950/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto no-print"
          onClick={() => setShowHelperModal(false)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 my-auto max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Üst Başlık */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900">
                    Eski Model Android & Mobil Kurulum Çözümü
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    Uygulama yüklenmeyen telefonlar için 3 pratik ve kesin çözüm
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHelperModal(false)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Neden Yüklenmiyor Bilgilendirmesi */}
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1">
              <div className="font-black flex items-center gap-1.5 text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Eski Telefonlarda Neden &quot;Uygulama Yüklenemedi&quot; Uyarısı Çıkar?</span>
              </div>
              <p className="text-[11px] text-amber-900 font-medium leading-relaxed">
                Eski model Android telefonlarda (Android 6/7/8/9 veya hafızası dolu cihazlarda) Google Play servisleri yeni nesil uygulama paketini (WebAPK) oluşturamayabilir. <strong>Hiçbir uygulama (APK) yüklemenize gerek yoktur!</strong> Aşağıdaki 3 yöntemle sistemi telefonunuzda sorunsuz kullanabilirsiniz:
              </p>
            </div>

            {/* ÇÖZÜM 1: KURULUMSUZ HAFİF & HIZLI MOD (0 MB HAFIZA) */}
            <div className="p-3.5 rounded-2xl bg-emerald-50/90 border-2 border-emerald-400 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider">
                  1. Çözüm (Önerilen • 0 MB Hafıza)
                </span>
                <span className="text-[11px] font-extrabold text-emerald-800">
                  Kurulum Gerektirmez
                </span>
              </div>
              <h4 className="text-xs sm:text-sm font-black text-emerald-950">
                ⚡ Eski Android &quot;Hafif & Hızlı Mod (Lite Mode)&quot; ile Doğrudan Kullanın
              </h4>
              <p className="text-[11px] text-emerald-900 font-medium leading-relaxed">
                Telefonunuza hiçbir dosya indirmeden, doğrudan tarayıcı üzerinden çalışır. <strong>Hafif Mod</strong> açıldığında eski telefonları yoran görsel efektler kapatılır ve sistem en eski Android telefonlarda bile çok hızlı çalışır.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleToggleLiteMode}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 ${
                    isLiteMode
                      ? 'bg-emerald-700 text-white border border-emerald-800'
                      : 'bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-400'
                  }`}
                >
                  {isLiteMode ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Hafif & Hızlı Mod Aktif (Açık)</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-amber-500" />
                      <span>Eski Telefon Hızlı Modunu Aç</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleOpenFullscreen}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Uygulama Gibi Tam Ekran Aç</span>
                </button>
              </div>
            </div>

            {/* ÇÖZÜM 2: APK YÜKLEMEDEN ANA EKRANA KISAYOL İKONU EKLEME */}
            <div className="p-3.5 rounded-2xl bg-sky-50/80 border border-sky-200 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="px-2 py-0.5 rounded-md bg-sky-600 text-white text-[10px] font-black uppercase tracking-wider">
                  2. Çözüm (Telefon Ekranına İkon Ekleme)
                </span>
                <span className="text-[11px] font-extrabold text-sky-800">
                  Tüm Eski Android&apos;lerde Çalışır
                </span>
              </div>
              <h4 className="text-xs sm:text-sm font-black text-slate-900">
                📌 Uygulama İndirmeden &quot;Ana Ekrana Kısayol&quot; Ekleyin
              </h4>
              <div className="space-y-1.5 text-[11px] text-slate-700 font-medium">
                <p>
                  <strong>• Chrome (Eski/Yeni Tüm Android&apos;ler):</strong> Tarayıcının sağ üst köşesindeki <strong>⋮ (Üç Nokta)</strong> menüsüne dokunun → <strong>&quot;Ana ekrana ekle&quot;</strong> (veya <em>&quot;Kısayol oluştur&quot;</em>) seçeneğine basın → <strong>&quot;Ekle&quot;</strong> deyin.
                </p>
                <p>
                  <strong>• Samsung Internet / Xiaomi / Huawei Tarayıcı:</strong> Alt veya üst köşedeki <strong>≡ (Menü)</strong> simgesine dokunun → <strong>&quot;Şuraya ekle&quot;</strong> → <strong>&quot;Ana ekran&quot;</strong> seçin.
                </p>
                {isIOS && (
                  <p>
                    <strong>• iPhone / Safari:</strong> Ekranın altındaki <strong>Paylaş (↑)</strong> simgesine dokunun → <strong>&quot;Ana Ekrana Ekle&quot;</strong> seçin.
                  </p>
                )}
              </div>
            </div>

            {/* ÇÖZÜM 3: WHATSAPP VEYA YER İMLERİNE KAYDETME */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="px-2 py-0.5 rounded-md bg-slate-700 text-white text-[10px] font-black uppercase tracking-wider">
                  3. Çözüm (Tek Tıkla Erişim)
                </span>
              </div>
              <h4 className="text-xs sm:text-sm font-black text-slate-900">
                🔗 Giriş Bağlantısını Kopyalayın veya WhatsApp&apos;a Gönderin
              </h4>
              <p className="text-[11px] text-slate-600 font-medium">
                Bağlantıyı kopyalayıp WhatsApp&apos;ta kendi mesajlarınıza yapıştırabilir veya tarayıcıda <strong>☆ (Yıldız / Yer İmleri)</strong> simgesine basarak kaydedebilirsiniz.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Bağlantı Kopyalandı!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-600" />
                      <span>Giriş Bağlantısını Kopyala</span>
                    </>
                  )}
                </button>

                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Edirne SYDV Kömür Dağıtım Sistemi Hızlı Giriş Bağlantısı: ${
                      typeof window !== 'undefined' ? window.location.origin : ''
                    }`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>WhatsApp&apos;a Kısayol Gönder</span>
                </a>
              </div>
            </div>

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelperModal(false)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all"
              >
                Anlaşıldı, Sistemi Kullanmaya Devam Et
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
