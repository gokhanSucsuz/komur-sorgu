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
      <div className="p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 bg-amber-200 px-2 py-0.5 rounded-full border border-amber-300">
                Günün Dağıtım Uyarısı
              </span>
              <span className="text-[11px] font-bold text-rose-700 font-mono bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200">
                {eksikHaneler.length} Hane Eksik
              </span>
            </div>
            <p className="text-sm font-bold text-slate-900 leading-tight truncate mt-0.5">
              Daha önce yarım kalan kömürler: <strong className="text-amber-800">{toplamEksikTorba} Torba</strong> eksik!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300 flex items-center gap-1 transition-all active:scale-95 shadow-xs"
          >
            <span>{isExpanded ? 'Gizle' : 'Listeyi Gör'}</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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

      {/* Expanded List of Incomplete Households - Light Mode */}
      {isExpanded && (
        <div className="p-3 bg-white border-t border-amber-200 space-y-2">
          <p className="text-xs text-slate-600 font-medium">
            Dağıtıma başlamadan önce lütfen bu hanelerin eksik kalan kömürlerini tamamlayınız:
          </p>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {eksikHaneler.map((person) => {
              const hedef = person.hedef_torba || 34;
              const teslim = person.torba_sayisi || 0;
              const kalan = person.kalan_torba || (hedef - teslim);

              return (
                <div
                  key={person.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2.5 hover:border-amber-400 transition-all shadow-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-slate-900 truncate">{person.ad_soyad}</span>
                      <span className="text-xs font-mono font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
                        TC: {person.tc_no}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-600 mt-1">
                      <span className="flex items-center gap-1 text-slate-800 font-semibold">
                        <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        {person.mahalle}
                      </span>
                      <span>•</span>
                      <span className="text-slate-700 font-medium">
                        Verilen: {teslim} / {hedef} Torba
                      </span>
                      <span className="text-rose-700 font-bold bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                        Kalan: {kalan} Torba
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {person.acik_adres}
                    </p>
                  </div>

                  {/* Complete Household Button */}
                  <button
                    onClick={() => onCompleteHousehold(person)}
                    className="px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-bold text-xs shrink-0 flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
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
