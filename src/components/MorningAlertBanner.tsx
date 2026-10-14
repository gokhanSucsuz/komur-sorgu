'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, PackagePlus, MapPin, X } from 'lucide-react';

interface MorningAlertBannerProps {
  eksikHaneler: any[];
  onCompleteHousehold: (person: any) => void;
}

export default function MorningAlertBanner({
  eksikHaneler,
  onCompleteHousehold
}: MorningAlertBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed || !eksikHaneler || eksikHaneler.length === 0) {
    return null;
  }

  const toplamEksikTorba = eksikHaneler.reduce((acc, curr) => acc + (curr.kalan_torba || curr.eksik_torba || 0), 0);

  return (
    <div className="mb-4 rounded-2xl bg-amber-50/90 border border-amber-300 shadow-md shadow-amber-500/5 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Alert Header Banner - Light Mode */}
      <div className="p-3 sm:p-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 bg-amber-200 px-2 py-0.5 rounded-full border border-amber-300">
                Günün Dağıtım Uyarısı
              </span>
              <span className="text-[10px] sm:text-[11px] font-bold text-rose-700 font-mono bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200">
                {eksikHaneler.length} Hane Eksik
              </span>
            </div>
            <p className="text-xs sm:text-sm font-bold text-slate-900 leading-tight mt-1">
              Daha önce yarım kalan: <strong className="text-amber-800">{toplamEksikTorba} Torba</strong> eksik!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300 flex items-center gap-1 transition-all active:scale-95 shadow-xs"
          >
            <span>{isExpanded ? 'Gizle' : 'Listeyi Gör'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            aria-label="Kapat"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded List of Incomplete Households - Mobile Friendly Cards */}
      {isExpanded && (
        <div className="p-3 bg-white border-t border-amber-200 space-y-2.5">
          <p className="text-xs text-slate-600 font-medium">
            Dağıtıma başlamadan önce lütfen bu hanelerin eksik kalan kömürlerini tamamlayınız:
          </p>

          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {eksikHaneler.map((person) => {
              const hedef = person.hedef_torba || 34;
              const teslim = person.torba_sayisi || 0;
              const kalan = person.kalan_torba || (hedef - teslim);

              return (
                <div
                  key={person.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-amber-400 transition-all shadow-xs"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center justify-between sm:justify-start gap-1.5">
                      <span className="text-sm font-extrabold text-slate-900">{person.ad_soyad}</span>
                      <span className="text-xs font-mono font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                        TC: {person.tc_no}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-700 flex-wrap">
                      <span className="flex items-center gap-1 font-semibold text-slate-900">
                        <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        {person.mahalle}
                      </span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-600 truncate max-w-[200px] sm:max-w-none">{person.acik_adres}</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs pt-1">
                      <span className="text-slate-600 font-medium bg-slate-200/80 px-2 py-0.5 rounded">
                        Verilen: <strong className="text-slate-900">{teslim}</strong>/{hedef}
                      </span>
                      <span className="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        Kalan: <strong>{kalan} Torba</strong>
                      </span>
                    </div>
                  </div>

                  {/* Complete Household Button */}
                  <button
                    onClick={() => onCompleteHousehold(person)}
                    className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-xs shrink-0 flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all mt-1 sm:mt-0"
                  >
                    <PackagePlus className="w-4 h-4 text-white" />
                    <span>+{kalan} Torbayı Tamamla</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
