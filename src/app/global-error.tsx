'use client';

import { RefreshCw, ShieldAlert } from 'lucide-react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans antialiased">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black text-slate-900">
              Sistem Başlatılamadı
            </h1>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Uygulama yüklenirken kritik bir sistem hatası tespit edildi. Sayfayı yeniden başlatabilirsiniz.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => reset()}
              className="w-full py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Sistemi Yeniden Başlat</span>
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
