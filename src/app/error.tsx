'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log unexpected client error to console
    console.error('[Application Runtime Error]:', error);
  }, [error]);

  const handleClearCacheAndReload = () => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.clear();
        localStorage.removeItem('komur_active_tab');
        window.location.href = '/';
      }
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
            Beklenmeyen Bir Hata Oluştu
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
            Sistemde geçici bir işlem aksaklığı meydana geldi. Verileriniz ve çevrimdışı teslimat kayıtlarınız güvenle korunmaktadır.
          </p>
        </div>

        {error?.message && process.env.NODE_ENV !== 'production' && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-left font-mono text-[11px] text-rose-700 max-h-32 overflow-y-auto">
            {error.message}
          </div>
        )}

        <div className="flex flex-col gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            <span>İşlemi Yeniden Dene</span>
          </button>

          <button
            type="button"
            onClick={handleClearCacheAndReload}
            className="w-full py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Home className="w-4 h-4" />
            <span>Ana Sayfaya Dön & Yenile</span>
          </button>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
          <span>Edirne SYDV Kömür Dağıtım Güvenlik Katmanı</span>
        </div>
      </div>
    </div>
  );
}
