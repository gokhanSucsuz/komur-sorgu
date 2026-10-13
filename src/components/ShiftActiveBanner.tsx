'use client';

import { useState, useEffect } from 'react';
import { Clock, Play, CheckCircle2, ChevronRight, Sparkles, MapPin, AlertCircle } from 'lucide-react';

interface ShiftActiveBannerProps {
  activeShift: any | null;
  currentStaff: string;
  onOpenStartModal: () => void;
  onOpenEndModal: (shift: any) => void;
  onQuickStart: () => void;
  onNavigateToShiftPage: () => void;
}

export default function ShiftActiveBanner({
  activeShift,
  currentStaff,
  onOpenStartModal,
  onOpenEndModal,
  onQuickStart,
  onNavigateToShiftPage
}: ShiftActiveBannerProps) {
  const [elapsedTime, setElapsedTime] = useState<string>('');
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // Live timer tick for active shift
  useEffect(() => {
    if (!activeShift || activeShift.durum !== 'DEVAM_EDIYOR') return;

    const updateElapsed = () => {
      const cur = new Date();
      const [sh, sm] = (activeShift.baslama_saati || '08:30').split(':').map(Number);
      let diff = (cur.getHours() * 60 + cur.getMinutes()) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60;
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      setElapsedTime(h > 0 ? `${h} sa ${m} dk` : `${m} dk`);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 30000); // Update every 30 sec
    return () => clearInterval(interval);
  }, [activeShift]);

  // Case 1: Active shift running
  if (activeShift && activeShift.durum === 'DEVAM_EDIYOR') {
    return (
      <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border border-emerald-300 shadow-xs animate-in fade-in duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                <Clock className="w-5 h-5 animate-pulse" />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white animate-ping" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Dağıtım Mesaisi Aktif
                </span>
                <span className="text-xs font-bold text-slate-700 hidden sm:inline">
                  {activeShift.personel_adi}
                </span>
              </div>
              <p className="text-xs text-slate-700 font-semibold mt-0.5">
                Başlangıç: <strong className="text-slate-900 font-black">{activeShift.baslama_saati}</strong>
                {elapsedTime && (
                  <span className="ml-2 text-emerald-900 font-bold bg-white/80 px-2 py-0.5 rounded border border-emerald-200">
                    Süre: {elapsedTime}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onNavigateToShiftPage}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 transition-all active:scale-95 shadow-2xs"
            >
              Mesai Detayı
            </button>
            <button
              type="button"
              onClick={() => onOpenEndModal(activeShift)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Dağıtımı Bitir</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: No active shift started today
  return (
    <div className="mb-4 p-3.5 rounded-2xl bg-amber-50/80 border border-amber-300 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-300 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide">
              Bugünkü Kömür Dağıtım Mesainiz Başlatılmadı
            </h4>
            <p className="text-[11px] text-amber-900/80 font-medium mt-0.5">
              Günlük çalışma saatinizi, dakikanızı ve dağıtılan mahalleleri takip etmek için işe başlama saatini girin.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenStartModal}
            className="px-2.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-amber-300 text-xs font-bold text-amber-900 transition-all active:scale-95 shadow-2xs"
          >
            Özel Saat
          </button>
          <button
            type="button"
            onClick={onQuickStart}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Dağıtımı Başlat ({currentTime})</span>
          </button>
        </div>
      </div>
    </div>
  );
}
