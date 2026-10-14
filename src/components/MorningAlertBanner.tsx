'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  PackagePlus,
  MapPin,
  X,
  PenTool,
  CheckCircle,
  Phone
} from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/normalizer';

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
  const [activeTab, setActiveTab] = useState<'ALL' | 'EKSIK' | 'IMZALI'>('ALL');

  if (isDismissed || !eksikHaneler || eksikHaneler.length === 0) {
    return null;
  }

  const eksikKalanlar = eksikHaneler.filter(
    (h) => h.uyari_tipi === 'EKSIK_TESLIMAT' || h.teslimat_durumu === 'EKSIK'
  );
  const imzaliBekleyenler = eksikHaneler.filter(
    (h) =>
      h.uyari_tipi === 'IMZALI_TESLIM_BEKLIYOR' ||
      (h.imza_durumu === 'IMZALANDI' &&
        h.teslimat_durumu !== 'TAMAMLANDI' &&
        h.teslimat_durumu !== 'EKSIK')
  );

  const toplamEksikTorba = eksikKalanlar.reduce(
    (acc, curr) => acc + (curr.kalan_torba || curr.eksik_torba || 0),
    0
  );
  const toplamImzaliTorba = imzaliBekleyenler.reduce(
    (acc, curr) => acc + (curr.kalan_torba || curr.hedef_torba || 34),
    0
  );

  const displayedList =
    activeTab === 'EKSIK'
      ? eksikKalanlar
      : activeTab === 'IMZALI'
      ? imzaliBekleyenler
      : eksikHaneler;

  return (
    <div className="mb-4 rounded-2xl bg-amber-50/95 border border-amber-300 shadow-md shadow-amber-500/5 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Alert Header Banner */}
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

              {eksikKalanlar.length > 0 && (
                <span className="text-[10px] sm:text-[11px] font-bold text-rose-800 font-mono bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200 flex items-center gap-1">
                  <span>⚠️</span>
                  <span>{eksikKalanlar.length} Eksik Teslimat</span>
                </span>
              )}

              {imzaliBekleyenler.length > 0 && (
                <span className="text-[10px] sm:text-[11px] font-bold text-indigo-900 font-mono bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-200 flex items-center gap-1">
                  <PenTool className="w-3 h-3 text-indigo-700" />
                  <span>{imzaliBekleyenler.length} İmzalı Bekleyen</span>
                </span>
              )}
            </div>

            <p className="text-xs sm:text-sm font-bold text-slate-900 leading-tight mt-1">
              {eksikKalanlar.length > 0 && (
                <>
                  Daha önce yarım kalan: <strong className="text-amber-900">{toplamEksikTorba} Torba</strong> eksik
                </>
              )}
              {eksikKalanlar.length > 0 && imzaliBekleyenler.length > 0 && <span> • </span>}
              {imzaliBekleyenler.length > 0 && (
                <>
                  İmzası alınıp teslim bekleyen: <strong className="text-indigo-900">{imzaliBekleyenler.length} Hane ({toplamImzaliTorba} Torba)</strong>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300 flex items-center gap-1 transition-all active:scale-95 shadow-xs"
          >
            <span>{isExpanded ? 'Gizle' : `Listeyi Gör (${eksikHaneler.length})`}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            aria-label="Kapat"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded List of Alerts with Tabs */}
      {isExpanded && (
        <div className="p-3 bg-white border-t border-amber-200 space-y-3">
          {/* Filter Tabs if multiple types exist */}
          {eksikKalanlar.length > 0 && imzaliBekleyenler.length > 0 && (
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('ALL')}
                className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tümü ({eksikHaneler.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('EKSIK')}
                className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  activeTab === 'EKSIK'
                    ? 'bg-amber-100 text-amber-950 shadow-xs border border-amber-300'
                    : 'text-amber-800 hover:text-amber-950'
                }`}
              >
                <span>⚠️ Eksik Kömür ({eksikKalanlar.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('IMZALI')}
                className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  activeTab === 'IMZALI'
                    ? 'bg-indigo-100 text-indigo-950 shadow-xs border border-indigo-300'
                    : 'text-indigo-800 hover:text-indigo-950'
                }`}
              >
                <PenTool className="w-3 h-3 text-indigo-700" />
                <span>İmzası Alınanlar ({imzaliBekleyenler.length})</span>
              </button>
            </div>
          )}

          <p className="text-xs text-slate-600 font-medium">
            Dağıtıma başlamadan önce veya kamyon sahadayken lütfen bu hanelerin kömür teslimatını tamamlayınız:
          </p>

          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {displayedList.map((person) => {
              const isEksikTip =
                person.uyari_tipi === 'EKSIK_TESLIMAT' || person.teslimat_durumu === 'EKSIK';
              const hedef = person.hedef_torba || 34;
              const teslim = person.torba_sayisi || 0;
              const kalan = isEksikTip
                ? person.kalan_torba || Math.max(0, hedef - teslim)
                : hedef;

              return (
                <div
                  key={person.id}
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all shadow-xs ${
                    isEksikTip
                      ? 'bg-amber-50/50 border-amber-200 hover:border-amber-400'
                      : 'bg-indigo-50/40 border-indigo-200 hover:border-indigo-400'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {/* Üst Başlık & Rozetler */}
                    <div className="flex flex-wrap items-center justify-between sm:justify-start gap-1.5">
                      <span className="text-sm font-extrabold text-slate-900">{person.ad_soyad}</span>
                      <span className="text-xs font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        TC: {person.tc_no}
                      </span>

                      {isEksikTip ? (
                        <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                          ⚠️ Eksik Dağıtım ({teslim}/{hedef})
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded-full border border-indigo-300 flex items-center gap-1">
                          <PenTool className="w-3 h-3 text-indigo-700" />
                          <span>İmza Alındı • Kömür Teslim Edilmedi</span>
                        </span>
                      )}
                    </div>

                    {/* Adres & Mahalle */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-700 flex-wrap">
                      <span className="flex items-center gap-1 font-semibold text-slate-900">
                        <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        {person.mahalle}
                      </span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-600 truncate max-w-[200px] sm:max-w-none">
                        {person.acik_adres}
                      </span>
                    </div>

                    {/* Telefon & İmza / Not Detayları */}
                    <div className="flex flex-wrap items-center gap-2 text-xs pt-0.5">
                      {isEksikTip ? (
                        <>
                          <span className="text-slate-600 font-medium bg-white px-2 py-0.5 rounded border border-slate-200">
                            Verilen: <strong className="text-slate-900">{teslim}</strong>/{hedef}
                          </span>
                          <span className="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            Kalan: <strong>{kalan} Torba</strong>
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-indigo-800 font-bold bg-white px-2 py-0.5 rounded border border-indigo-200 flex items-center gap-1">
                            <PenTool className="w-3 h-3 text-indigo-600" />
                            <span>İmza Tarihi: {person.imza_tarihi || 'Kayıtlı'}</span>
                          </span>
                          <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Teslim Edilecek: <strong>{kalan} Torba</strong>
                          </span>
                        </>
                      )}

                      {person.teslimat_notu && (
                        <span className="text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded text-[11px] truncate max-w-[220px]">
                          Not: {person.teslimat_notu}
                        </span>
                      )}

                      {person.telefon && (
                        <a
                          href={`tel:${person.telefon}`}
                          className="font-mono text-emerald-700 font-semibold hover:underline flex items-center gap-1 ml-auto"
                        >
                          <Phone className="w-3 h-3" />
                          <span>{formatPhoneDisplay(person.telefon)}</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Aksiyon Butonu */}
                  <button
                    type="button"
                    onClick={() => onCompleteHousehold(person)}
                    className={`w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-xs shrink-0 flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all mt-1 sm:mt-0 text-white ${
                      isEksikTip
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800'
                        : 'bg-gradient-to-r from-indigo-600 to-sky-700 hover:from-indigo-700 hover:to-sky-800'
                    }`}
                  >
                    {isEksikTip ? (
                      <>
                        <PackagePlus className="w-4 h-4 text-white" />
                        <span>+{kalan} Torbayı Tamamla</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 text-white" />
                        <span>✓ Kömürü Teslim Et ({kalan} Torba)</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}

            {displayedList.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-500">
                Bu kategoride bekleyen kayıt bulunamadı.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
