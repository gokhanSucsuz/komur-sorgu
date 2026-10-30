'use client';

import { Dispatch, SetStateAction, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  MapPin,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Phone,
  Search,
  FileText,
  PenTool,
  ArrowRight,
  X,
  Play,
  Pause,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Undo2,
  ListOrdered,
  Shield,
  FileSpreadsheet,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { showToast } from '@/components/GlobalAlertManager';
import { formatPhoneDisplay, getBeneficiaryListTypeInfo } from '@/lib/normalizer';
import { formatTrAuto } from '@/lib/dateUtils';
import { requestAppFullscreen, exitAppFullscreen, isAppFullscreen } from '@/lib/fullscreen';

export interface RouteModeCockpitModalProps {
  isRouteModeOpen: boolean;
  activeRoute: any | null;
  routeModeIndex: number;
  setRouteModeIndex: Dispatch<SetStateAction<number>>;
  routeModeTab: 'DELIVER' | 'DEFER';
  setRouteModeTab: Dispatch<SetStateAction<'DELIVER' | 'DEFER'>>;
  routeModeDeferType: 'PARTIAL' | 'ZERO';
  setRouteModeDeferType: Dispatch<SetStateAction<'PARTIAL' | 'ZERO'>>;
  routeModeTorba: string;
  setRouteModeTorba: Dispatch<SetStateAction<string>>;
  routeModeRecipient: string;
  setRouteModeRecipient: Dispatch<SetStateAction<string>>;
  routeModeNote: string;
  setRouteModeNote: Dispatch<SetStateAction<string>>;
  routeModePausedNotice: boolean;
  setRouteModePausedNotice: Dispatch<SetStateAction<boolean>>;
  showStopPickerModal: boolean;
  setShowStopPickerModal: Dispatch<SetStateAction<boolean>>;
  stopPickerSearch: string;
  setStopPickerSearch: Dispatch<SetStateAction<string>>;
  stopPickerFilter: 'ALL' | 'WAITING' | 'DONE';
  setStopPickerFilter: Dispatch<SetStateAction<'ALL' | 'WAITING' | 'DONE'>>;
  isTeammateRoute: boolean;
  isActionLoading: boolean;
  syncRouteModeInputsForStop: (stop: any) => void;
  handlePauseRouteAndExit: (customReason?: string) => Promise<void>;
  handleSignInRouteMode: (stopIndex: number, stop: any) => Promise<void>;
  handleRouteModeSubmit: (submitKind: 'COMPLETE' | 'DEFER_LATER') => Promise<void>;
  handleSkipCurrentStop: () => void;
  setCancelStopTarget: Dispatch<SetStateAction<any | null>>;
}

export default function RouteModeCockpitModal({
  isRouteModeOpen,
  activeRoute,
  routeModeIndex,
  setRouteModeIndex,
  routeModeTab,
  setRouteModeTab,
  routeModeDeferType,
  setRouteModeDeferType,
  routeModeTorba,
  setRouteModeTorba,
  routeModeRecipient,
  setRouteModeRecipient,
  routeModeNote,
  setRouteModeNote,
  routeModePausedNotice,
  setRouteModePausedNotice,
  showStopPickerModal,
  setShowStopPickerModal,
  stopPickerSearch,
  setStopPickerSearch,
  stopPickerFilter,
  setStopPickerFilter,
  isTeammateRoute,
  isActionLoading,
  syncRouteModeInputsForStop,
  handlePauseRouteAndExit,
  handleSignInRouteMode,
  handleRouteModeSubmit,
  handleSkipCurrentStop,
  setCancelStopTarget,
}: RouteModeCockpitModalProps) {
  if (!isRouteModeOpen || !activeRoute || typeof document === 'undefined') return null;

  const stops: any[] = activeRoute.duraklar || [];
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(isAppFullscreen());
    };
    handleFsChange();
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const totalStops = stops.length;
  const safeIndex = Math.min(Math.max(0, routeModeIndex), Math.max(0, totalStops - 1));

  // Auto-scroll active pill into view in the pill strip
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const activePill = document.getElementById(`route-pill-${safeIndex}`);
    if (activePill) {
      activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [safeIndex]);
  const currentStop = stops[safeIndex] || null;
  const currentStopListInfo = getBeneficiaryListTypeInfo(currentStop);
  const nextStopInOrder = safeIndex + 1 < totalStops ? stops[safeIndex + 1] : null;

  const completedCount = stops.filter((s) => s.durum === 'TAMAMLANDI').length;
  const deferredStops = stops
    .map((s, idx) => ({ stop: s, index: idx }))
    .filter(({ stop }) => stop.durum === 'EKSIK' || stop.durum === 'TESLIM_EDILEMEDI');
  const waitingStops = stops
    .map((s, idx) => ({ stop: s, index: idx }))
    .filter(({ stop }) => !stop.durum || stop.durum === 'BEKLIYOR');

  const totalDeliveredBags = stops.reduce(
    (acc, s) => acc + (Number(s.teslim_edilen_torba) || 0),
    0
  );
  const progressPercent =
    totalStops > 0 ? Math.min(100, Math.round((completedCount / totalStops) * 100)) : 0;

  const isLastStopInRoute = safeIndex >= totalStops - 1;
  const hasRemainingStopsAfterCurrent = stops.some(
    (s, idx) => idx > safeIndex && s.durum !== 'TAMAMLANDI'
  );
  const isOnlyRemainingStop =
    stops.filter((s, idx) => idx !== safeIndex && s.durum !== 'TAMAMLANDI').length === 0;

  const hedefTorba = Number(currentStop?.hedef_torba) || 34;
  const prevDeliveredTorba = Number(currentStop?.teslim_edilen_torba) || 0;
  const remainingForStop = Math.max(0, hedefTorba - prevDeliveredTorba);

  // Önceden atlanmış ve hala tamamlanmamış haneler (Mevcut duraktan önceki bekleyenler)
  const skippedPendingStops = stops
    .map((s, idx) => ({ stop: s, index: idx }))
    .filter(({ stop, index }) => index < safeIndex && stop.durum !== 'TAMAMLANDI');

  // Durak Seçici Filtrelenmiş Liste
  const filteredPickerStops = stops
    .map((s, idx) => ({ stop: s, index: idx }))
    .filter(({ stop }) => {
      if (stopPickerFilter === 'WAITING' && stop.durum === 'TAMAMLANDI') return false;
      if (stopPickerFilter === 'DONE' && stop.durum !== 'TAMAMLANDI') return false;
      if (stopPickerSearch.trim()) {
        const q = stopPickerSearch.trim().toLocaleLowerCase('tr-TR');
        const name = (stop.ad_soyad || '').toLocaleLowerCase('tr-TR');
        const tc = (stop.tc_no || '').toLocaleLowerCase('tr-TR');
        const sokak = (stop.sokak || '').toLocaleLowerCase('tr-TR');
        const kapi = String(stop.kapi_no || '');
        const sira = `#${stop.sira || stop.index + 1}`;
        if (
          !name.includes(q) &&
          !tc.includes(q) &&
          !sokak.includes(q) &&
          !kapi.includes(q) &&
          !sira.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });

  return createPortal(
    <div className="route-mode-overlay no-print">
      {/* 1. ÜST KOKPİT BARI */}
      <div className="route-mode-topbar">
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: 'rgba(56, 189, 248, 0.2)',
                  border: '1px solid rgba(56, 189, 248, 0.45)',
                }}
              >
                <Navigation className="w-4 h-4 text-sky-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{ background: '#0284c7', color: '#ffffff' }}
                  >
                    ROTA MODU
                  </span>
                  {isTeammateRoute && (
                    <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                      🤝 EKİP ORTAKLIĞI
                    </span>
                  )}
                  <span className="text-xs font-black text-white truncate">
                    {activeRoute.rota_adi}
                  </span>
                </div>
                <div
                  className="flex items-center gap-2 text-[11px] font-medium mt-0.5"
                  style={{ color: '#cbd5e1' }}
                >
                  <span>
                    Tamamlanan:{' '}
                    <strong className="text-white">
                      {completedCount}/{totalStops}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Dağıtılan: <strong className="text-emerald-400">{totalDeliveredBags} Torba</strong>
                  </span>
                  {activeRoute.arac_plaka && (
                    <>
                      <span>•</span>
                      <span className="font-mono text-amber-300 font-bold">
                        {activeRoute.arac_plaka}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Sağ Üst Aksiyonlar: Tam Ekran, Sıra Seç, Geçici Durdur & Listeye Dön */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* Tam Ekran Toggle Butonu */}
              <button
                type="button"
                onClick={() => {
                  if (isFullscreen) {
                    exitAppFullscreen();
                  } else {
                    requestAppFullscreen();
                  }
                }}
                className="px-2 py-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1 transition-all active:scale-95 shrink-0"
                style={{
                  background: isFullscreen ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.12)',
                  border: isFullscreen ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid rgba(255, 255, 255, 0.25)',
                  color: isFullscreen ? '#7dd3fc' : '#ffffff',
                }}
                title={isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran Moduna Geç'}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-sky-300" /> : <Maximize2 className="w-3.5 h-3.5" />}
                <span className="hidden xs:inline">{isFullscreen ? 'Normal' : 'Tam Ekran'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStopPickerSearch('');
                  setStopPickerFilter('ALL');
                  setShowStopPickerModal(true);
                }}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all active:scale-95"
                style={{
                  background: 'rgba(56, 189, 248, 0.2)',
                  border: '1px solid rgba(56, 189, 248, 0.55)',
                  color: '#7dd3fc',
                }}
                title="Rotadaki tüm haneleri listele ve dilediğin sıraya geç"
              >
                <ListOrdered className="w-3.5 h-3.5 text-sky-300" />
                <span className="hidden sm:inline">Sıra Değiştir / Hane Seç</span>
                <span className="sm:hidden">Sıra Seç</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handlePauseRouteAndExit(
                    'Personel Rota Modundan geçici durdurma seçti (Daha sonra devam edilecek).'
                  )
                }
                disabled={isActionLoading}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all active:scale-95"
                style={{
                  background: 'rgba(245, 158, 11, 0.22)',
                  border: '1px solid rgba(251, 191, 36, 0.6)',
                  color: '#fef3c7',
                }}
                title="Rotayı geçici olarak durdurur, kilidi serbest bırakır ve Rota Modundan çıkar"
              >
                <Pause className="w-3.5 h-3.5 text-amber-300" />
                <span className="hidden sm:inline">Geçici Durdur ve Çık</span>
                <span className="sm:hidden">Durdur &amp; Çık</span>
              </button>
            </div>
          </div>

          {/* İlerleme Çubuğu */}
          <div
            className="w-full h-1.5 rounded-full overflow-hidden mt-2.5"
            style={{ background: 'rgba(255,255,255,0.14)' }}
          >
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${progressPercent}%`,
                background: 'linear-gradient(90deg, #38bdf8, #10b981)',
              }}
            />
          </div>

          {/* Durak Numarası Sekmeleri (Hızlı Geçiş Barı) */}
          <div className="route-mode-pill-strip mt-2">
            {stops.map((stItem: any, idx: number) => {
              const isCurrent = idx === safeIndex && !routeModePausedNotice;
              const isDone = stItem.durum === 'TAMAMLANDI';
              const isDeferred =
                stItem.durum === 'EKSIK' || stItem.durum === 'TESLIM_EDILEMEDI';

              let bg = 'rgba(255,255,255,0.08)';
              let border = 'rgba(255,255,255,0.18)';
              let text = '#cbd5e1';

              if (isCurrent) {
                bg = '#0284c7';
                border = '#7dd3fc';
                text = '#ffffff';
              } else if (isDone) {
                bg = 'rgba(16, 185, 129, 0.25)';
                border = 'rgba(52, 211, 153, 0.55)';
                text = '#6ee7b7';
              } else if (isDeferred) {
                bg = 'rgba(245, 158, 11, 0.25)';
                border = 'rgba(251, 191, 36, 0.55)';
                text = '#fcd34d';
              }

              return (
                <button
                  key={stItem.beneficiary_id || idx}
                  id={`route-pill-${idx}`}
                  type="button"
                  onClick={() => {
                    setRouteModeIndex(idx);
                    syncRouteModeInputsForStop(stops[idx]);
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-black shrink-0 flex items-center gap-1 transition-all active:scale-95"
                  style={{
                    background: bg,
                    border: `1px solid ${border}`,
                    color: text,
                  }}
                >
                  <span>#{stItem.sira || idx + 1}</span>
                  {isDone && <span>✓</span>}
                  {isDeferred && <span>⏳</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. ANA İÇERİK GÖVDESİ */}
      <div className="route-mode-body">
        <div className="route-mode-container">
          {/* EĞER SON KAYDA ULAŞILDI VE EKSİK / DAHA SONRA TAMAMLANACAK KAYITLAR VARSA GEÇİCİ DURDURULDU EKRANI */}
          {routeModePausedNotice ? (
            <div className="bg-white rounded-3xl border-2 border-amber-400 shadow-lg p-5 space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center shrink-0">
                  <Pause className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                    ROTA GEÇİCİ OLARAK DURDURULDU
                  </span>
                  <h3 className="text-lg font-black text-slate-900 mt-1">
                    Son Kayda Ulaşıldı — Eksik Kayıtlar Bekliyor
                  </h3>
                  <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">
                    Rotadaki sıradaki kayıtlar tamamlandı ancak{' '}
                    <strong>&quot;Daha Sonra Tamamlanacak&quot;</strong> olarak işaretlenen{' '}
                    <strong>{deferredStops.length} hane</strong> bulunduğu için rota geçici
                    olarak durduruldu.
                  </p>
                </div>
              </div>

              {/* Bekleyen / Daha Sonra Tamamlanacak Kayıtlar Listesi */}
              {deferredStops.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 block">
                    ⏳ Daha Sonra Tamamlanacak Kayıtlar ({deferredStops.length} Hane):
                  </span>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {deferredStops.map(({ stop: dStop, index: dIdx }) => (
                      <div
                        key={dStop.beneficiary_id || dIdx}
                        className="p-2.5 rounded-xl bg-white border border-amber-200 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-black">
                              #{dStop.sira || dIdx + 1}
                            </span>
                            <span className="text-xs font-extrabold text-slate-900 truncate">
                              {dStop.ad_soyad}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 truncate mt-0.5">
                            {dStop.mahalle}{' '}
                            {dStop.sokak
                              ? `• ${dStop.sokak}${dStop.kapi_no && dStop.kapi_no !== 999999 && dStop.kapi_no !== '999999' ? ` No:${dStop.kapi_no}` : ''}`
                              : ''}
                          </p>
                          <p className="text-[10px] text-amber-800 font-bold mt-0.5">
                            {dStop.durum === 'EKSIK'
                              ? `Verilen: ${dStop.teslim_edilen_torba} / ${dStop.hedef_torba || 34} Torba (Kalan: ${(dStop.hedef_torba || 34) - (dStop.teslim_edilen_torba || 0)} T)`
                              : `Henüz Kömür Verilmedi (0 / ${dStop.hedef_torba || 34} Torba)`}
                            {dStop.teslimat_notu ? ` • ${dStop.teslimat_notu}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setRouteModeIndex(dIdx);
                            syncRouteModeInputsForStop(dStop);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-black shrink-0"
                        >
                          Kayda Git →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Aksiyon Seçenekleri */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                {deferredStops.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const firstDef = deferredStops[0];
                      setRouteModeIndex(firstDef.index);
                      syncRouteModeInputsForStop(firstDef.stop);
                    }}
                    className="flex-1 py-3.5 px-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>
                      Eksik Kayıtları Şimdi Tamamla (#
                      {deferredStops[0].stop.sira || deferredStops[0].index + 1})
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    handlePauseRouteAndExit(
                      'Son kayda ulaşıldı - Rota geçici olarak durduruldu.'
                    )
                  }
                  className="flex-1 py-3.5 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
                >
                  <Pause className="w-4 h-4" />
                  <span>Rotayı Geçici Durdurulmuş Bırak ve Çık</span>
                </button>
              </div>
            </div>
          ) : currentStop ? (
            <>
              {/* AKTİF DURAK ANA KARTI (HARİTASIZ, YÜKSEK OKUNABİLİRLİKLİ SAHA KARTI) */}
              <div className="bg-white rounded-3xl border border-slate-300 shadow-md overflow-hidden">
                {/* Kart Üst Başlık: Sıra No, Durum ve Hedef Torba */}
                <div
                  className="p-3 sm:p-4 flex items-center justify-between gap-2 sm:gap-3 border-b"
                  style={{
                    background:
                      currentStop.durum === 'TAMAMLANDI'
                        ? '#ecfdf5'
                        : currentStop.durum === 'EKSIK' ||
                          currentStop.durum === 'TESLIM_EDILEMEDI'
                        ? '#fffbeb'
                        : '#f8fafc',
                    borderColor: '#e2e8f0',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl sm:rounded-2xl font-black text-xs sm:text-base flex items-center justify-center shadow-xs shrink-0"
                      style={{
                        background:
                          currentStop.durum === 'TAMAMLANDI'
                            ? '#059669'
                            : currentStop.durum === 'EKSIK' ||
                              currentStop.durum === 'TESLIM_EDILEMEDI'
                            ? '#d97706'
                            : '#0f172a',
                        color: '#ffffff',
                      }}
                    >
                      #{currentStop.sira || safeIndex + 1}. DURAK
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border inline-block ${
                            currentStop.durum === 'TAMAMLANDI'
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : currentStop.durum === 'EKSIK'
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : currentStop.durum === 'TESLIM_EDILEMEDI'
                              ? 'bg-rose-100 text-rose-900 border-rose-300'
                              : 'bg-sky-100 text-sky-900 border-sky-300'
                          }`}
                        >
                          {currentStop.durum === 'TAMAMLANDI'
                            ? '✓ TESLİMAT TAMAMLANDI'
                            : currentStop.durum === 'EKSIK'
                            ? '⏳ EKSİK BIRAKILDI (DAHA SONRA TAMAMLANACAK)'
                            : currentStop.durum === 'TESLIM_EDILEMEDI'
                            ? '⏳ DAHA SONRA TAMAMLANACAK (0 TORBA)'
                            : `SIRADAKİ TESLİMAT (${safeIndex + 1} / ${totalStops})`}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setStopPickerSearch('');
                            setStopPickerFilter('ALL');
                            setShowStopPickerModal(true);
                          }}
                          className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-[10px] font-bold flex items-center gap-1 border border-slate-300 transition-colors shadow-2xs"
                          title="Rotadaki başka bir haneye geç"
                        >
                          <ListOrdered className="w-3 h-3 text-sky-600" />
                          <span>Sıra Değiştir</span>
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 font-bold mt-0.5">
                        {isLastStopInRoute
                          ? '🏁 Rotadaki Son Durak'
                          : `Kalan Bekleyen: ${waitingStops.length} Durak`}
                      </p>
                    </div>
                  </div>

                  {/* Hedef Kota Rozeti */}
                  <div className="text-right shrink-0 bg-white px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                      HEDEF KOTA
                    </span>
                    <span className="text-sm sm:text-lg font-black text-slate-900 font-mono">
                      {hedefTorba} Torba
                    </span>
                    <span className="text-[10px] font-bold text-amber-800 block">
                      ({(hedefTorba * 0.025).toFixed(2)} Ton)
                    </span>
                  </div>
                </div>

                {/* Rotada Önceden Atlanan Haneler Uyarısı & Hızlı Dönüş */}
                {skippedPendingStops.length > 0 && (
                  <div className="p-3 sm:p-3.5 bg-amber-50 border-b border-amber-200 text-xs flex items-center justify-between gap-2.5 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-2xs">
                        {skippedPendingStops.length}
                      </div>
                      <div className="min-w-0">
                        <span className="font-black text-amber-950 block truncate">
                          Rotada daha önce atlanan {skippedPendingStops.length} hane var
                        </span>
                        <span className="text-[10px] text-amber-900 font-medium block truncate">
                          {skippedPendingStops
                            .map((x) => `#${x.stop.sira || x.index + 1} ${x.stop.ad_soyad}`)
                            .join(' • ')}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const firstSkipped = skippedPendingStops[0];
                        setRouteModeIndex(firstSkipped.index);
                        syncRouteModeInputsForStop(firstSkipped.stop);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black flex items-center gap-1 transition-all active:scale-95 shadow-2xs shrink-0"
                    >
                      <span>
                        #{skippedPendingStops[0].stop.sira || skippedPendingStops[0].index + 1}
                        &apos;e Geri Dön
                      </span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* BÜYÜK ADRES VE KONUM KUTUSU (HARİTASIZ NET ADRES REHBERİ) */}
                <div className="p-3 sm:p-4 bg-sky-50/70 border-b border-sky-200/80 space-y-1.5 sm:space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-black uppercase tracking-wider text-sky-800 flex items-center gap-1">
                      <MapPin className="w-4 h-4 text-sky-600" />
                      TESLİMAT ADRESİ BİLGİLERİ
                    </span>
                    <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-sky-900 text-white">
                      {currentStop.mahalle || 'Belirtilmemiş'}
                    </span>
                  </div>

                  {/* Sokak ve Kapı Numarası Büyük Punto */}
                  <div className="p-3.5 rounded-2xl bg-white border-2 border-sky-300 shadow-2xs">
                    {currentStop.sokak ? (
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-base sm:text-xl font-black text-slate-950 tracking-tight">
                          {currentStop.sokak}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {currentStop.kapi_no &&
                            currentStop.kapi_no !== 999999 &&
                            currentStop.kapi_no !== '999999' && (
                              <span className="px-2.5 py-1 rounded-xl bg-amber-500 text-white font-black text-sm sm:text-base shadow-2xs">
                                KAPI NO: {currentStop.kapi_no}
                              </span>
                            )}
                          {currentStop.daire_no && currentStop.daire_no > 0 && (
                            <span className="px-2.5 py-1 rounded-xl bg-slate-800 text-white font-black text-xs sm:text-sm">
                              DAİRE: {currentStop.daire_no}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : null}
                    <p
                      className={`text-xs sm:text-sm font-bold text-slate-700 leading-relaxed ${
                        currentStop.sokak ? 'mt-2 pt-2 border-t border-slate-100' : ''
                      }`}
                    >
                      {currentStop.acik_adres || 'Açık adres bilgisi belirtilmemiş'}
                    </p>
                  </div>
                </div>

                {/* VATANDAŞ KİMLİK, İMZA VE TELEFON SATIRI */}
                <div className="p-3 sm:p-4 space-y-2.5 sm:space-y-3 border-b border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                        HAK SAHİBİ VATANDAŞ
                      </span>
                      <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-snug">
                        {currentStop.ad_soyad}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-xs font-mono font-black text-amber-900 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200">
                          T.C.: {currentStop.tc_no}
                        </span>

                        <span
                          className={`text-xs font-black px-2.5 py-0.5 rounded-lg border flex items-center gap-1 ${currentStopListInfo.badgeClass}`}
                          title={currentStopListInfo.folderLabel}
                        >
                          {currentStopListInfo.type === 'SIGORTALI' && (
                            <Shield className="w-3.5 h-3.5 text-purple-700" />
                          )}
                          {currentStopListInfo.type === 'EK_LISTE' && (
                            <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-700" />
                          )}
                          {currentStopListInfo.type === 'ANA_LISTE' && (
                            <FileText className="w-3.5 h-3.5 text-emerald-700" />
                          )}
                          <span>{currentStopListInfo.label}</span>
                          {currentStop.sira_no && (
                            <span className="font-mono">#{currentStop.sira_no}</span>
                          )}
                        </span>

                        {currentStop.imza_durumu === 'IMZALANDI' ? (
                          <span className="text-xs font-black text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-lg border border-emerald-300 flex items-center gap-1">
                            <PenTool className="w-3.5 h-3.5 text-emerald-700" />
                            Kapıda İmza Alındı
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSignInRouteMode(safeIndex, currentStop)}
                            disabled={isActionLoading}
                            className="text-xs font-black text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg border border-amber-400 flex items-center gap-1 transition-all active:scale-95"
                          >
                            <PenTool className="w-3.5 h-3.5 text-amber-800" />
                            <span>✍️ Kapıda İmza Alındı İşaretle</span>
                          </button>
                        )}
                      </div>

                      <div
                        className={`mt-2 p-2 rounded-xl border flex items-center justify-between text-xs ${
                          currentStopListInfo.type === 'SIGORTALI'
                            ? 'bg-purple-50/70 border-purple-200 text-purple-950'
                            : currentStopListInfo.type === 'EK_LISTE'
                            ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950'
                            : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                        }`}
                      >
                        <span className="font-bold flex items-center gap-1.5">
                          <span>📁 Islak İmza Dosyası:</span>
                          <u>{currentStopListInfo.folderLabel}</u>
                        </span>
                        {currentStop.sira_no && (
                          <span className="font-mono font-black bg-white px-2 py-0.5 rounded-md border border-slate-300 shadow-2xs">
                            Sıra: #{currentStop.sira_no}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Tek Dokunuşla Vatandaşı Ara Butonu */}
                    {currentStop.telefon ? (
                      <a
                        href={`tel:${String(currentStop.telefon).replace(/[^0-9+]/g, '')}`}
                        className="px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs active:scale-95 transition-all shrink-0"
                      >
                        <Phone className="w-4 h-4" />
                        <span>Ara: {formatPhoneDisplay(currentStop.telefon)}</span>
                      </a>
                    ) : (
                      <div className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 text-xs font-bold shrink-0">
                        Telefon Kayıtlı Değil
                      </div>
                    )}
                  </div>

                  {/* Eğer daha önce kısmi teslimat yapıldıysa bilgi kutusu */}
                  {currentStop.durum === 'EKSIK' && prevDeliveredTorba > 0 && (
                    <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-black block">
                            Önceki Kısmi Teslimat: {prevDeliveredTorba} Torba Verildi (Kalan
                            Eksik: {remainingForStop} Torba)
                          </strong>
                          <span className="text-[11px] font-medium block mt-0.5">
                            Kalan {remainingForStop} torbayı teslim ettiğinizde aşağıdaki
                            &quot;Tam Teslimat ({hedefTorba} Torba)&quot; butonu ile kaydı
                            tamamlayabilirsiniz.
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCancelStopTarget(currentStop)}
                        className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 font-black text-[11px] shrink-0 flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                        title="Bu kısmi teslimatı iptal et / geri al"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        <span>Geri Al</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* ======================================================== */}
                {/* TESLİMAT İŞLEM PANELİ: TAMAMLANMIŞ TESLİMAT (GERİ AL) vs TESLİMAT YAP */}
                {/* ======================================================== */}
                {currentStop.durum === 'TAMAMLANDI' ? (
                  /* TAMAMLANMIŞ TESLİMAT KARTI & TESLİMATI GERİ AL AKSİYON PANELİ */
                  <div className="p-3 sm:p-4 bg-white space-y-3 sm:space-y-4">
                    {/* Teslimat Tamamlandı Durum Kutusu */}
                    <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-950 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-emerald-950">
                              Bu Hanenin Kömür Teslimatı Tamamlandı
                            </h4>
                            <p className="text-xs font-semibold text-emerald-800 mt-0.5">
                              Kayıt başarıyla sisteme işlenmiş ve onaylanmıştır.
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-black px-2.5 py-1 rounded-lg bg-emerald-200/80 text-emerald-900 shrink-0">
                          {currentStop.teslim_edilen_torba || hedefTorba} Torba (
                          {(((currentStop.teslim_edilen_torba || hedefTorba) * 0.025)).toFixed(2)}{' '}
                          Ton)
                        </span>
                      </div>

                      {/* Detay Bilgileri */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-emerald-200/70 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                            Teslim Alan Kişi
                          </span>
                          <span className="font-extrabold text-slate-900">
                            {currentStop.teslim_alan || currentStop.ad_soyad}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                            Teslim Tarihi &amp; Personel
                          </span>
                          <span className="font-bold text-slate-800">
                            {formatTrAuto(currentStop.teslim_tarihi) || 'Kayıtlı'}{' '}
                            {currentStop.teslim_eden_personel
                              ? `(${currentStop.teslim_eden_personel})`
                              : ''}
                          </span>
                        </div>
                        {currentStop.teslimat_notu && (
                          <div className="sm:col-span-2">
                            <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                              Teslimat Notu
                            </span>
                            <span className="font-medium text-slate-800 italic">
                              &quot;{currentStop.teslimat_notu}&quot;
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* UYARI VE GERİ ALMA BİLGİLENDİRMESİ */}
                    <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200 space-y-1.5">
                      <div className="flex items-center gap-2 text-rose-900 text-xs font-black">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Yanlışlıkla mı teslimat yapıldı?</span>
                      </div>
                      <p className="text-[11px] font-medium text-rose-800 leading-relaxed">
                        Bu haneye rota içinde yanlışlıkla teslimat yapıldıysa aşağıdaki
                        &quot;Teslimatı Geri Al&quot; butonuyla işlemi iptal edebilirsiniz. Hane
                        tekrar <strong>BEKLİYOR</strong> durumuna dönecektir.
                      </p>
                    </div>

                    {/* AKSİYON BUTONLARI: TESLİMATI GERİ AL vs SIRADAKİ KAYDA GEÇ */}
                    <div className="space-y-2.5 pt-1">
                      {/* TESLİMATI GERİ AL BUTONU */}
                      <button
                        type="button"
                        onClick={() => setCancelStopTarget(currentStop)}
                        disabled={isActionLoading}
                        className="w-full py-4 px-5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-md active:scale-[0.99] transition-all"
                      >
                        <Undo2 className="w-5 h-5 shrink-0" />
                        <span>↩ TESLİMATI GERİ AL / İPTAL ET</span>
                      </button>

                      {/* SIRADAKİ KAYDA GEÇ BUTONU */}
                      {nextStopInOrder ? (
                        <button
                          type="button"
                          onClick={() => {
                            const nextIdx = safeIndex + 1;
                            setRouteModeIndex(nextIdx);
                            syncRouteModeInputsForStop(stops[nextIdx]);
                          }}
                          className="w-full py-3.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs sm:text-sm flex items-center justify-center gap-2 border border-slate-300 active:scale-[0.99] transition-all"
                        >
                          <span>
                            Sıradaki Kayda Devam Et (#{nextStopInOrder.sira || safeIndex + 2}.
                            Durak: {nextStopInOrder.ad_soyad})
                          </span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      ) : deferredStops.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            const firstDef = deferredStops[0];
                            setRouteModeIndex(firstDef.index);
                            syncRouteModeInputsForStop(firstDef.stop);
                          }}
                          className="w-full py-3.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs active:scale-[0.99] transition-all"
                        >
                          <span>
                            ⏳ Eksik / Bekleyen Kayıtlara Git (#
                            {deferredStops[0].stop.sira || deferredStops[0].index + 1}. Durak)
                          </span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      ) : null}

                      {/* ROTADAKİ BAŞKA BİR HANEYE GEÇ */}
                      <button
                        type="button"
                        onClick={() => {
                          setStopPickerSearch('');
                          setStopPickerFilter('ALL');
                          setShowStopPickerModal(true);
                        }}
                        className="w-full py-3 px-4 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 border border-indigo-200 active:scale-[0.99] transition-all"
                      >
                        <ListOrdered className="w-4 h-4" />
                        <span>📋 Rotadaki Başka Bir Haneye Geç (Sıra Seç)</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* HENÜZ TAMAMLANMAMIŞ DURAKLAR İÇİN TESLİMAT İŞLEM PANELİ */
                  <div className="p-4 sm:p-5 bg-white space-y-4">
                    {/* 2'li Mod Seçici Sekme */}
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => {
                          setRouteModeTab('DELIVER');
                          setRouteModeTorba(String(hedefTorba));
                        }}
                        className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                          routeModeTab === 'DELIVER'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-700 hover:text-slate-900'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>1. Tam Teslimat Yap</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRouteModeTab('DEFER');
                          if (routeModeDeferType === 'PARTIAL') {
                            setRouteModeTorba(
                              prevDeliveredTorba > 0 ? String(prevDeliveredTorba) : '20'
                            );
                          } else {
                            setRouteModeTorba('0');
                          }
                        }}
                        className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                          routeModeTab === 'DEFER'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'text-slate-700 hover:text-slate-900'
                        }`}
                      >
                        <Clock className="w-4 h-4" />
                        <span>2. Eksik / Daha Sonra</span>
                      </button>
                    </div>

                    {/* SEKME 1: TAM TESLİMAT YAP VE SIRADAKİ KAYDA GEÇ */}
                    {routeModeTab === 'DELIVER' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-black text-slate-700 uppercase block mb-1">
                              Toplam Teslim Edilen Torba
                            </label>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setRouteModeTorba((v) =>
                                    String(Math.max(1, (parseInt(v, 10) || hedefTorba) - 1))
                                  )
                                }
                                className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 font-black text-base text-slate-800"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                value={routeModeTorba}
                                onChange={(e) => setRouteModeTorba(e.target.value)}
                                min="1"
                                max={hedefTorba}
                                className="flex-1 h-11 px-3 rounded-xl bg-white border-2 border-emerald-400 text-center text-base font-mono font-black text-slate-900 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setRouteModeTorba((v) =>
                                    String(Math.min(hedefTorba, (parseInt(v, 10) || 0) + 1))
                                  )
                                }
                                className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 font-black text-base text-slate-800"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="text-[11px] font-black text-slate-700 uppercase block mb-1">
                              Teslim Alan Kişi
                            </label>
                            <input
                              type="text"
                              value={routeModeRecipient}
                              onChange={(e) => setRouteModeRecipient(e.target.value)}
                              placeholder={currentStop.ad_soyad}
                              className="w-full h-11 px-3 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRouteModeSubmit('COMPLETE')}
                          disabled={isActionLoading}
                          className="w-full py-4 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-md active:scale-[0.99] transition-all"
                        >
                          <CheckCircle2 className="w-5 h-5 shrink-0" />
                          <span>
                            {isActionLoading
                              ? 'Kaydediliyor...'
                              : isOnlyRemainingStop
                              ? `🎉 TESLİMATI TAMAMLA (${routeModeTorba || hedefTorba} TORBA) & ROTAYI BİTİR`
                              : `✓ TESLİMATI TAMAMLA (${routeModeTorba || hedefTorba} TORBA) & SIRADAKİ KAYDA GEÇ →`}
                          </span>
                        </button>
                      </div>
                    )}

                    {/* SEKME 2: EKSİK BIRAK / DAHA SONRA TAMAMLANACAK */}
                    {routeModeTab === 'DEFER' && (
                      <div className="space-y-3 p-3.5 rounded-2xl bg-amber-50/70 border border-amber-300">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-amber-950">
                            ⏳ Eksik / Daha Sonra Tamamlanacak Seçeneği:
                          </span>
                        </div>

                        {/* Alt Seçenek: Kısmi Kömür Verildi vs Şu An 0 Torba */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRouteModeDeferType('PARTIAL');
                              setRouteModeTorba('20');
                              if (!routeModeNote) {
                                setRouteModeNote(
                                  'Kamyonda kömür bitti - Kalanı daha sonra tamamlanacak'
                                );
                              }
                            }}
                            className={`p-2.5 rounded-xl border text-left transition-all ${
                              routeModeDeferType === 'PARTIAL'
                                ? 'bg-white border-amber-500 text-amber-950 shadow-2xs ring-2 ring-amber-400/30'
                                : 'bg-white/60 border-slate-200 text-slate-600'
                            }`}
                          >
                            <span className="text-xs font-black block">
                              ⚠️ Kısmi Kömür Verildi (Eksik)
                            </span>
                            <span className="text-[10px] font-medium opacity-85 block mt-0.5">
                              Bir kısmı şimdi verildi, kalanı daha sonra tamamlanacak
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setRouteModeDeferType('ZERO');
                              setRouteModeTorba('0');
                              if (!routeModeNote || routeModeNote.includes('Kamyonda')) {
                                setRouteModeNote(
                                  'Evde kimse yok - Daha sonra tamamlanacak'
                                );
                              }
                            }}
                            className={`p-2.5 rounded-xl border text-left transition-all ${
                              routeModeDeferType === 'ZERO'
                                ? 'bg-white border-rose-500 text-rose-950 shadow-2xs ring-2 ring-rose-400/30'
                                : 'bg-white/60 border-slate-200 text-slate-600'
                            }`}
                          >
                            <span className="text-xs font-black block">
                              ⏳ Şu An Verilemedi (0 Torba)
                            </span>
                            <span className="text-[10px] font-medium opacity-85 block mt-0.5">
                              Evde yok / ulaşılamadı, daha sonra tamamlanacak
                            </span>
                          </button>
                        </div>

                        {routeModeDeferType === 'PARTIAL' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                            <div>
                              <label className="text-[11px] font-black text-amber-950 block mb-1">
                                Şu An Verilen Torba Sayısı
                              </label>
                              <input
                                type="number"
                                value={routeModeTorba}
                                onChange={(e) => setRouteModeTorba(e.target.value)}
                                min="1"
                                max={hedefTorba - 1}
                                className="w-full px-3 py-2 rounded-xl bg-white border-2 border-amber-400 text-sm font-mono font-black text-slate-900"
                              />
                              <span className="text-[10px] font-extrabold text-amber-900 block mt-1">
                                Daha Sonra Tamamlanacak Kalan:{' '}
                                {Math.max(0, hedefTorba - (parseInt(routeModeTorba, 10) || 0))}{' '}
                                Torba
                              </span>
                            </div>
                            <div>
                              <label className="text-[11px] font-black text-amber-950 block mb-1">
                                Teslim Alan Kişi
                              </label>
                              <input
                                type="text"
                                value={routeModeRecipient}
                                onChange={(e) => setRouteModeRecipient(e.target.value)}
                                placeholder={currentStop.ad_soyad}
                                className="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 text-xs font-bold text-slate-900"
                              />
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="text-[11px] font-black text-amber-950 block mb-1">
                            Daha Sonra Tamamlanma / Eksik Nedeni
                          </label>
                          <input
                            type="text"
                            value={routeModeNote}
                            onChange={(e) => setRouteModeNote(e.target.value)}
                            placeholder="Örn: Evde yok / Kamyonda kömür bitti - Daha sonra tamamlanacak"
                            className="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 text-xs font-semibold text-slate-900"
                          />
                          {/* Hızlı Neden Etiketleri */}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {[
                              'Evde kimse yok - Daha sonra tamamlanacak',
                              'Kamyonda kömür bitti - Daha sonra tamamlanacak',
                              'Sokak kapalı - Daha sonra girilecek',
                              'Vatandaş daha sonra teslim almak istedi',
                            ].map((reasonChip) => (
                              <button
                                key={reasonChip}
                                type="button"
                                onClick={() => setRouteModeNote(reasonChip)}
                                className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-950 border border-amber-300"
                              >
                                {reasonChip}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRouteModeSubmit('DEFER_LATER')}
                          disabled={isActionLoading}
                          className="w-full py-3.5 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all"
                        >
                          <SkipForward className="w-4 h-4 shrink-0" />
                          <span>
                            {isActionLoading
                              ? 'İşleniyor...'
                              : !hasRemainingStopsAfterCurrent
                              ? '⏸️ DAHA SONRA TAMAMLANACAK İŞARETLE & ROTAYI GEÇİCİ DURDUR'
                              : '⏳ DAHA SONRA TAMAMLANACAK İŞARETLE & SIRADAKİ KAYDA GEÇ →'}
                          </span>
                        </button>
                      </div>
                    )}

                    {/* SIRADAN BAĞIMSIZ DAĞITIM VE GEÇİŞ AKSİYONLARI */}
                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-black text-slate-500 uppercase tracking-wider px-1">
                        <span>Serbest Sıralama / Güzergah Değişikliği</span>
                        <span className="text-sky-700 font-extrabold lowercase font-sans text-[10px]">
                          (sırayı bozmadan devam eder)
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleSkipCurrentStop}
                          className="w-full py-3 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs flex items-center justify-center gap-2 border border-slate-300 active:scale-[0.98] transition-all"
                          title="Bu haneyi teslimat yapmadan bekleyen olarak bırakır ve sıradaki sonraki haneye geçer"
                        >
                          <SkipForward className="w-4 h-4 text-slate-600" />
                          <span>Bu Haneyi Şimdilik Atla</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStopPickerSearch('');
                            setStopPickerFilter('ALL');
                            setShowStopPickerModal(true);
                          }}
                          className="w-full py-3 px-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs flex items-center justify-center gap-2 border border-indigo-200 active:scale-[0.98] transition-all"
                          title="Rotadaki tüm haneler arasından istediğiniz sıradaki haneye anında geçin"
                        >
                          <ListOrdered className="w-4 h-4 text-indigo-600" />
                          <span>Rotadaki Başka Sıraya Geç</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* 3. ALT NAVİGASYON VE SIRADAKİ DURAK ÖNİZLEME BARI */}
      <div className="route-mode-footer">
        <div
          className="flex items-center justify-between gap-2"
          style={{ maxWidth: '680px', margin: '0 auto' }}
        >
          <button
            type="button"
            onClick={() => {
              if (routeModePausedNotice) {
                setRouteModePausedNotice(false);
                return;
              }
              const prevIdx = Math.max(0, safeIndex - 1);
              setRouteModeIndex(prevIdx);
              syncRouteModeInputsForStop(stops[prevIdx]);
            }}
            disabled={!routeModePausedNotice && safeIndex === 0}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 text-xs font-black flex items-center gap-1 border border-slate-300 shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Önceki</span>
          </button>

          {/* Sıradaki Durak Bilgisi */}
          <div className="min-w-0 text-center flex-1 px-2">
            {nextStopInOrder ? (
              <div className="truncate">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  SIRADAKİ KAYIT (#{nextStopInOrder.sira || safeIndex + 2})
                </span>
                <span className="text-xs font-black text-slate-800 truncate block">
                  {nextStopInOrder.ad_soyad} —{' '}
                  <span className="text-sky-700">
                    {nextStopInOrder.sokak
                      ? `${nextStopInOrder.sokak}${nextStopInOrder.kapi_no && nextStopInOrder.kapi_no !== 999999 && nextStopInOrder.kapi_no !== '999999' ? ` No:${nextStopInOrder.kapi_no}` : ''}`
                      : nextStopInOrder.mahalle}
                  </span>
                </span>
              </div>
            ) : (
              <div className="truncate">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 block">
                  SON DURAKTASINIZ
                </span>
                <span className="text-xs font-bold text-slate-700 truncate block">
                  {deferredStops.length > 0
                    ? `${deferredStops.length} kayıt daha sonra tamamlanacak`
                    : 'Tüm kayıtlar tamamlandığında rota kapanır'}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              if (safeIndex + 1 < totalStops) {
                const nextIdx = safeIndex + 1;
                setRouteModeIndex(nextIdx);
                syncRouteModeInputsForStop(stops[nextIdx]);
              } else {
                // Son duraktayız: önceden atlanmış veya tamamlanmamış kayıt varsa oraya otomatik dön
                const earliestIncomplete = stops.findIndex(
                  (s: any, idx: number) => idx < safeIndex && s.durum !== 'TAMAMLANDI'
                );
                if (earliestIncomplete !== -1) {
                  setRouteModeIndex(earliestIncomplete);
                  syncRouteModeInputsForStop(stops[earliestIncomplete]);
                  showToast({
                    type: 'info',
                    title: 'Önceki Eksik / Bekleyen Haneye Dönüldü',
                    message: `#${stops[earliestIncomplete].sira || earliestIncomplete + 1}. sıradaki haneye dönüldü: ${stops[earliestIncomplete].ad_soyad}`,
                    durationMs: 3500,
                  });
                } else if (deferredStops.length > 0) {
                  setRouteModePausedNotice(true);
                }
              }
            }}
            disabled={
              safeIndex >= totalStops - 1 &&
              !stops.some((s: any, idx: number) => idx < safeIndex && s.durum !== 'TAMAMLANDI')
            }
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 text-xs font-black flex items-center gap-1 border border-slate-300 shrink-0"
          >
            <span>Sonraki</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 4. ROTADAKİ TÜM HANELER / SERBEST SIRA SEÇİCİ MODALI */}
      {showStopPickerModal && (
        <div
          className="fixed inset-0 z-[100000] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setShowStopPickerModal(false)}
        >
          <div
            className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Başlık */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/40 text-sky-400 flex items-center justify-center shrink-0">
                  <ListOrdered className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-black truncate">
                    Rotadaki Haneler &amp; Sıra Seçimi
                  </h3>
                  <p className="text-[11px] text-slate-300 truncate">
                    {stops.length} hane arasından istediğinize doğrudan geçebilirsiniz
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStopPickerModal(false)}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0 transition-colors"
                title="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Arama Kutusu ve Filtreler */}
            <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50 space-y-2.5 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={stopPickerSearch}
                  onChange={(e) => setStopPickerSearch(e.target.value)}
                  placeholder="İsim, T.C., sokak, kapı no veya #sıra ara..."
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  autoFocus
                />
                {stopPickerSearch && (
                  <button
                    type="button"
                    onClick={() => setStopPickerSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filtre Butonları */}
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setStopPickerFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all ${
                    stopPickerFilter === 'ALL'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Tümü ({stops.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStopPickerFilter('WAITING')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all ${
                    stopPickerFilter === 'WAITING'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Bekleyen / Eksik ({stops.filter((s: any) => s.durum !== 'TAMAMLANDI').length})
                </button>
                <button
                  type="button"
                  onClick={() => setStopPickerFilter('DONE')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all ${
                    stopPickerFilter === 'DONE'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Tamamlanan ({stops.filter((s: any) => s.durum === 'TAMAMLANDI').length})
                </button>
              </div>
            </div>

            {/* Liste */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1.5">
              {filteredPickerStops.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <p className="text-xs font-bold">Aramanızla eşleşen hane bulunamadı.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setStopPickerSearch('');
                      setStopPickerFilter('ALL');
                    }}
                    className="mt-2 text-xs font-black text-sky-600 underline"
                  >
                    Filtreleri Temizle
                  </button>
                </div>
              ) : (
                filteredPickerStops.map(({ stop: pStop, index: pIdx }) => {
                  const isCurrent = pIdx === safeIndex && !routeModePausedNotice;
                  const isDone = pStop.durum === 'TAMAMLANDI';
                  const isDeferred =
                    pStop.durum === 'EKSIK' || pStop.durum === 'TESLIM_EDILEMEDI';
                  const pListInfo = getBeneficiaryListTypeInfo(pStop);

                  return (
                    <button
                      key={pStop.beneficiary_id || pIdx}
                      type="button"
                      onClick={() => {
                        setRouteModePausedNotice(false);
                        setRouteModeIndex(pIdx);
                        syncRouteModeInputsForStop(pStop);
                        setShowStopPickerModal(false);
                        showToast({
                          type: 'info',
                          title: 'Haneye Geçildi',
                          message: `#${pStop.sira || pIdx + 1}. sıradaki haneye geçildi: ${pStop.ad_soyad}`,
                          durationMs: 3500,
                        });
                      }}
                      className={`w-full p-3 rounded-2xl text-left border flex items-center justify-between gap-3 transition-all active:scale-[0.99] ${
                        isCurrent
                          ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-400/40'
                          : isDone
                          ? 'bg-emerald-50/40 border-emerald-200 hover:bg-emerald-50'
                          : isDeferred
                          ? 'bg-amber-50/40 border-amber-200 hover:bg-amber-50'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Sıra Rozeti */}
                        <div
                          className={`w-9 h-9 rounded-xl font-black text-xs flex items-center justify-center shrink-0 shadow-2xs ${
                            isDone
                              ? 'bg-emerald-600 text-white'
                              : isDeferred
                              ? 'bg-amber-500 text-white'
                              : isCurrent
                              ? 'bg-sky-600 text-white'
                              : 'bg-slate-800 text-white'
                          }`}
                        >
                          #{pStop.sira || pIdx + 1}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-xs sm:text-sm text-slate-900 truncate">
                              {pStop.ad_soyad}
                            </span>
                            <span
                              className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded border ${pListInfo.badgeClass}`}
                              title={`${pListInfo.folderLabel}${pStop.sira_no ? ` (Sıra: #${pStop.sira_no})` : ''}`}
                            >
                              {pListInfo.badgeLabel}
                            </span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.5 rounded bg-sky-600 text-white text-[9px] font-black uppercase">
                                ŞU ANKİ DURAK
                              </span>
                            )}
                            {isDone && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                                ✓ {pStop.teslim_edilen_torba || 34} Torba
                              </span>
                            )}
                            {isDeferred && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[9px] font-bold">
                                ⏳{' '}
                                {pStop.durum === 'EKSIK'
                                  ? `${pStop.teslim_edilen_torba} Torba Verildi`
                                  : 'Ertelendi (0 T)'}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 font-medium truncate mt-0.5">
                            {pStop.mahalle} {pStop.sokak ? `• ${pStop.sokak}` : ''}
                            {pStop.kapi_no &&
                            pStop.kapi_no !== 999999 &&
                            pStop.kapi_no !== '999999'
                              ? ` No:${pStop.kapi_no}`
                              : ''}
                            {pStop.daire_no && pStop.daire_no > 0
                              ? ` D:${pStop.daire_no}`
                              : ''}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1 text-sky-700 font-extrabold text-xs">
                        {isCurrent ? (
                          <span className="text-[11px] text-sky-700 font-black">Açık</span>
                        ) : (
                          <>
                            <span className="hidden sm:inline">Bu Sıraya Geç</span>
                            <ArrowRight className="w-4 h-4 text-sky-600" />
                          </>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Modal Alt Bilgi */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[11px] font-bold text-slate-500 shrink-0">
              <span>
                💡 Bir haneyi tamamladıktan sonra sistem kaldığı sıradan devam eder.
              </span>
              <button
                type="button"
                onClick={() => setShowStopPickerModal(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-black"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
