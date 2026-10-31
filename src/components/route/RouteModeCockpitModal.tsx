'use client';

import { Dispatch, SetStateAction, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  MapPin,
  CheckCircle2,
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
import { formatPhoneDisplay, getBeneficiaryListTypeInfo, getRecordPhones } from '@/lib/normalizer';
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
  const stops: any[] = activeRoute?.duraklar || [];
  const [isFullscreen, setIsFullscreen] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
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
    if (!isRouteModeOpen || typeof document === 'undefined') return;
    const activePill = document.getElementById(`route-pill-${safeIndex}`);
    if (activePill) {
      activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [isRouteModeOpen, safeIndex]);

  if (!isRouteModeOpen || !activeRoute || typeof document === 'undefined') return null;
  const currentStop = stops[safeIndex] || null;
  const currentStopListInfo = getBeneficiaryListTypeInfo(currentStop);
  const currentStopPhones = getRecordPhones(currentStop);
  const nextStopInOrder = safeIndex + 1 < totalStops ? stops[safeIndex + 1] : null;

  // Canlı Eşzamanlı Operatörler (Aynı rotayı şu anda açık tutan diğer ekip arkadaşları)
  const localClientId =
    typeof window !== 'undefined' ? localStorage.getItem('komur_route_client_id') || '' : '';
  const coOperators: Array<{ personel: string; stop_index: number }> = (
    Array.isArray(activeRoute?.aktif_operatorler) ? activeRoute.aktif_operatorler : []
  ).filter((op: any) => {
    if (!op || !op.personel) return false;
    if (localClientId && op.client_id && op.client_id === localClientId) return false;
    return Date.now() - Number(op.timestamp || 0) < 90 * 1000;
  });

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

  // Mobil kaydırma (Swipe) ile önceki / sonraki kayda geçiş
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('input, button, a, textarea, select')) {
      touchStartRef.current = null;
      return;
    }
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || routeModePausedNotice) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    if (dt > 600 || Math.abs(dx) < 70 || Math.abs(dy) > 45) return;

    if (dx < -70 && safeIndex + 1 < totalStops) {
      const nextIdx = safeIndex + 1;
      setRouteModeIndex(nextIdx);
      syncRouteModeInputsForStop(stops[nextIdx]);
    } else if (dx > 70 && safeIndex > 0) {
      const prevIdx = safeIndex - 1;
      setRouteModeIndex(prevIdx);
      syncRouteModeInputsForStop(stops[prevIdx]);
    }
  };

  return createPortal(
    <div
      className="route-mode-overlay no-print"
      role="dialog"
      aria-modal="true"
      aria-label={`Rota Modu: ${activeRoute.rota_adi || 'Dağıtım Rotası'}`}
      onPointerDown={() => {
        if (!isAppFullscreen()) {
          requestAppFullscreen();
        }
      }}
    >
      {/* 1. SADE & NET ÜST KOKPİT BARI */}
      <div className="route-mode-topbar">
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {/* Aktif Sıra Sayacı */}
              <div
                className="px-2.5 py-1.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center shrink-0"
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  border: '1px solid #38bdf8',
                }}
              >
                #{currentStop?.sira || safeIndex + 1}/{totalStops}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-black text-white truncate">
                    {activeRoute.rota_adi}
                  </span>
                  {isTeammateRoute && (
                    <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-600 text-white shrink-0">
                      ORTAK
                    </span>
                  )}
                </div>
                <div
                  className="flex items-center gap-1.5 text-[11px] font-bold truncate"
                  style={{ color: '#cbd5e1' }}
                >
                  <span>
                    Biten:{' '}
                    <strong className="text-white">
                      {completedCount}/{totalStops}
                    </strong>
                  </span>
                  <span>•</span>
                  <strong className="text-emerald-400">{totalDeliveredBags} Torba</strong>
                  {activeRoute.arac_plaka && (
                    <>
                      <span className="hidden xs:inline">•</span>
                      <span className="hidden xs:inline font-mono text-amber-300 font-bold">
                        {activeRoute.arac_plaka}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Sağ Üst Aksiyonlar: Liste (Sıra Seç), Tam Ekran, Çıkış */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setStopPickerSearch('');
                  setStopPickerFilter('ALL');
                  setShowStopPickerModal(true);
                }}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 transition-all active:scale-95"
                style={{
                  background: 'rgba(56, 189, 248, 0.2)',
                  border: '1px solid rgba(56, 189, 248, 0.55)',
                  color: '#7dd3fc',
                }}
                title="Rotadaki tüm haneleri listele ve istediğin sıraya geç"
              >
                <ListOrdered className="w-4 h-4 text-sky-300" />
                <span>Liste</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isFullscreen) {
                    exitAppFullscreen();
                  } else {
                    requestAppFullscreen();
                  }
                }}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center justify-center transition-all active:scale-95 shrink-0"
                style={{
                  background: isFullscreen ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.12)',
                  border: isFullscreen
                    ? '1px solid rgba(56, 189, 248, 0.6)'
                    : '1px solid rgba(255, 255, 255, 0.25)',
                  color: isFullscreen ? '#7dd3fc' : '#ffffff',
                }}
                title={isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran Yap'}
                aria-label={isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran Yap'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4 text-sky-300" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  handlePauseRouteAndExit(
                    'Personel Rota Modundan geçici durdurma seçti (Daha sonra devam edilecek).'
                  )
                }
                disabled={isActionLoading}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 transition-all active:scale-95"
                style={{
                  background: 'rgba(245, 158, 11, 0.25)',
                  border: '1px solid rgba(251, 191, 36, 0.65)',
                  color: '#fef3c7',
                }}
                title="Rota Modundan Çık (Kaldığınız yer kaydedilir)"
              >
                <Pause className="w-3.5 h-3.5 text-amber-300" />
                <span>Çıkış</span>
              </button>
            </div>
          </div>

          {/* İlerleme Çubuğu */}
          <div
            className="w-full h-1.5 rounded-full overflow-hidden mt-2"
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

          {/* Canlı Ekip Arkadaşı Göstergesi (Aynı rotada anlık çalışan diğer personeller) */}
          {coOperators.length > 0 && (
            <div
              className="mt-1.5 px-2.5 py-1 rounded-lg flex items-center justify-between gap-2 text-[11px] font-bold"
              style={{
                background: 'rgba(16, 185, 129, 0.18)',
                border: '1px solid rgba(52, 211, 153, 0.45)',
                color: '#a7f3d0',
              }}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="truncate">
                  Canlı Senkron:{' '}
                  {coOperators
                    .map((op) => `${op.personel} (#${(Number(op.stop_index) || 0) + 1}. Hane)`)
                    .join(', ')}
                </span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300 shrink-0">
                ANLIK AÇIK
              </span>
            </div>
          )}

          {/* Sıralı Durak Numarası Sekmeleri (#1, #2, #3...) */}
          <div className="route-mode-pill-strip mt-2">
            {stops.map((stItem: any, idx: number) => {
              const isCurrent = idx === safeIndex && !routeModePausedNotice;
              const isDone = stItem.durum === 'TAMAMLANDI';
              const isDeferred =
                stItem.durum === 'EKSIK' || stItem.durum === 'TESLIM_EDILEMEDI';
              const teammateOnThisStop = coOperators.find(
                (op) => Number(op.stop_index) === idx
              );

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
                    setRouteModePausedNotice(false);
                    setRouteModeIndex(idx);
                    syncRouteModeInputsForStop(stops[idx]);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-black shrink-0 flex items-center gap-1 transition-all active:scale-95"
                  style={{
                    background: bg,
                    border: `1px solid ${border}`,
                    color: text,
                  }}
                  title={
                    teammateOnThisStop
                      ? `${teammateOnThisStop.personel} şu an bu haneyi görüntülüyor`
                      : undefined
                  }
                >
                  <span>#{stItem.sira || idx + 1}</span>
                  {isDone && <span>✓</span>}
                  {isDeferred && <span>⏳</span>}
                  {teammateOnThisStop && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. ANA İÇERİK GÖVDESİ (SIRALI TESLİMAT EKRANI) */}
      <div
        className="route-mode-body"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="route-mode-container">
          {/* SON KAYDA ULAŞILDI VE EKSİK KAYITLAR VARSA GEÇİCİ DURDURULDU EKRANI */}
          {routeModePausedNotice ? (
            <div className="bg-white rounded-3xl border-2 border-amber-400 shadow-lg p-4 sm:p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center shrink-0">
                  <Pause className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                    TÜM DURAKLAR GEZİLDİ
                  </span>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1">
                    Eksik / Sonraya Bırakılan Kayıtlar Bekliyor
                  </h3>
                  <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">
                    Sıradaki haneler ziyaret edildi ancak{' '}
                    <strong>{deferredStops.length} hane</strong> daha sonra tamamlanmak üzere
                    bekliyor.
                  </p>
                </div>
              </div>

              {deferredStops.length > 0 && (
                <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-900 block">
                    ⏳ Bekleyen / Eksik Haneler ({deferredStops.length}):
                  </span>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {deferredStops.map(({ stop: dStop, index: dIdx }) => (
                      <div
                        key={dStop.beneficiary_id || dIdx}
                        className="p-2.5 rounded-xl bg-white border border-amber-200 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-xs font-black">
                              #{dStop.sira || dIdx + 1}
                            </span>
                            <span className="text-xs font-extrabold text-slate-900 truncate">
                              {dStop.ad_soyad}
                            </span>
                          </div>
                          <p className="text-xs text-amber-800 font-bold mt-0.5">
                            {dStop.durum === 'EKSIK'
                              ? `Verilen: ${dStop.teslim_edilen_torba}/${dStop.hedef_torba || 34} Torba`
                              : `0 / ${dStop.hedef_torba || 34} Torba`}
                            {dStop.teslimat_notu ? ` • ${dStop.teslimat_notu}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setRouteModePausedNotice(false);
                            setRouteModeIndex(dIdx);
                            syncRouteModeInputsForStop(dStop);
                          }}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black shrink-0"
                        >
                          Aç →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                {deferredStops.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const firstDef = deferredStops[0];
                      setRouteModePausedNotice(false);
                      setRouteModeIndex(firstDef.index);
                      syncRouteModeInputsForStop(firstDef.stop);
                    }}
                    className="flex-1 min-h-[48px] py-3.5 px-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
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
                  className="flex-1 min-h-[48px] py-3.5 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
                >
                  <Pause className="w-4 h-4" />
                  <span>Rotadan Çık (Daha Sonra Devam Et)</span>
                </button>
              </div>
            </div>
          ) : currentStop ? (
            <div className="bg-white rounded-3xl border border-slate-300 shadow-md overflow-hidden">
              {/* 1. ÜST HANE & VATANDAŞ ÖZET BAŞLIĞI (TEK BAKIŞTA KİMLİK, SIRA VE TELEFON) */}
              <div
                className="p-3.5 sm:p-4 border-b space-y-2.5"
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
                {/* Sıra Rozeti + Durum + Hedef Kota */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="px-3 py-1 rounded-xl font-black text-xs sm:text-sm shrink-0 shadow-2xs"
                      style={{
                        background:
                          currentStop.durum === 'TAMAMLANDI'
                            ? '#059669'
                            : currentStop.durum === 'EKSIK' ||
                              currentStop.durum === 'TESLIM_EDILEMEDI'
                            ? '#d97706'
                            : '#0284c7',
                        color: '#ffffff',
                      }}
                    >
                      SIRA #{currentStop.sira || safeIndex + 1}
                    </span>
                    <span
                      className={`text-xs font-black uppercase px-2.5 py-0.5 rounded-full border truncate ${
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
                        ? '✓ TAMAMLANDI'
                        : currentStop.durum === 'EKSIK'
                        ? '⏳ EKSİK KAYIT'
                        : currentStop.durum === 'TESLIM_EDILEMEDI'
                        ? '⏳ SONRAYA BIRAKILDI'
                        : isLastStopInRoute
                        ? '🏁 SON DURAK'
                        : `SIRADAKİ HANE (Kalan: ${waitingStops.length})`}
                    </span>
                  </div>

                  {/* Hedef Torba Rozeti */}
                  <div className="bg-white px-3 py-1 rounded-xl border border-slate-300 shadow-2xs text-right shrink-0">
                    <span className="text-sm sm:text-base font-black text-slate-900 font-mono">
                      {hedefTorba} Torba
                    </span>
                    <span className="text-xs font-bold text-amber-800 ml-1">
                      ({(hedefTorba * 0.025).toFixed(2)} T)
                    </span>
                  </div>
                </div>

                {/* Hak Sahibi Ad Soyad + Kimlik + Arama */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-black text-slate-950 leading-tight">
                      {currentStop.ad_soyad}
                    </h2>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="text-xs font-mono font-black text-amber-950 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                        TC: {currentStop.tc_no}
                      </span>

                      <span
                        className={`text-xs font-black px-2 py-0.5 rounded-lg border flex items-center gap-1 ${currentStopListInfo.badgeClass}`}
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
                        <span>{currentStopListInfo.badgeLabel}</span>
                        {currentStop.sira_no && (
                          <span className="font-mono">#{currentStop.sira_no}</span>
                        )}
                      </span>

                      {currentStop.imza_durumu === 'IMZALANDI' ? (
                        <span className="text-xs font-black text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-300 flex items-center gap-1">
                          <PenTool className="w-3 h-3 text-emerald-700" />
                          İmzalı
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSignInRouteMode(safeIndex, currentStop)}
                          disabled={isActionLoading}
                          className="text-xs font-black text-amber-950 bg-amber-200 hover:bg-amber-300 px-2.5 py-0.5 rounded-lg border border-amber-400 flex items-center gap-1 transition-all active:scale-95"
                        >
                          <PenTool className="w-3 h-3 text-amber-900" />
                          <span>✍️ İmza Al</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tek Dokunuşla Vatandaşı Ara Butonu (Çoklu Numara Destekli) */}
                  {currentStopPhones.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {currentStopPhones.map((phoneStr, pIdx) => (
                        <a
                          key={phoneStr}
                          href={`tel:${phoneStr}`}
                          className="min-h-[42px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all"
                        >
                          <Phone className="w-4 h-4 shrink-0" />
                          <span>
                            {currentStopPhones.length > 1 ? `Hat ${pIdx + 1}: ` : ''}
                            {formatPhoneDisplay(phoneStr)}
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 text-xs font-bold shrink-0 self-start sm:self-center">
                      Telefon Yok
                    </div>
                  )}
                </div>
              </div>

              {/* Önceden Atlanan Hane Varsa Tek Satır Hızlı Dönüş Bandı */}
              {skippedPendingStops.length > 0 && (
                <div className="px-3.5 py-2 bg-amber-50 border-b border-amber-200 text-xs flex items-center justify-between gap-2">
                  <span className="font-bold text-amber-950 truncate">
                    ⚠️ Önceden atlanan {skippedPendingStops.length} hane var (#
                    {skippedPendingStops[0].stop.sira || skippedPendingStops[0].index + 1}{' '}
                    {skippedPendingStops[0].stop.ad_soyad})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const firstSkipped = skippedPendingStops[0];
                      setRouteModeIndex(firstSkipped.index);
                      syncRouteModeInputsForStop(firstSkipped.stop);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shrink-0"
                  >
                    Dön →
                  </button>
                </div>
              )}

              {/* 2. NET TESLİMAT ADRESİ KUTUSU */}
              <div className="p-3.5 sm:p-4 bg-sky-50/70 border-b border-sky-200/80 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-sky-900 flex items-center gap-1">
                    <MapPin className="w-4 h-4 text-sky-600" />
                    TESLİMAT ADRESİ
                  </span>
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-sky-900 text-white">
                    {currentStop.mahalle || 'Belirtilmemiş'}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-white border-2 border-sky-300 shadow-2xs">
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
                              NO: {currentStop.kapi_no}
                            </span>
                          )}
                        {currentStop.daire_no && currentStop.daire_no > 0 && (
                          <span className="px-2.5 py-1 rounded-xl bg-slate-800 text-white font-black text-xs sm:text-sm">
                            D: {currentStop.daire_no}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : null}
                  <p
                    className={`text-xs sm:text-sm font-bold text-slate-700 leading-snug ${
                      currentStop.sokak ? 'mt-1.5 pt-1.5 border-t border-slate-100' : ''
                    }`}
                  >
                    {currentStop.acik_adres || 'Açık adres bilgisi belirtilmemiş'}
                  </p>
                </div>

                {/* Eğer daha önce kısmi teslimat yapıldıysa bilgi kutusu */}
                {currentStop.durum === 'EKSIK' && prevDeliveredTorba > 0 && (
                  <div className="p-2.5 rounded-xl bg-amber-100/90 border border-amber-300 text-amber-950 text-xs flex items-center justify-between gap-2">
                    <div>
                      <strong className="font-black block">
                        Önceki Verilen: {prevDeliveredTorba} Torba (Kalan: {remainingForStop} Torba)
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCancelStopTarget(currentStop)}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 font-black text-xs shrink-0 flex items-center gap-1"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Geri Al</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 3. SADE & HIZLI TESLİMAT İŞLEM PANELİ */}
              {currentStop.durum === 'TAMAMLANDI' ? (
                <div className="p-3.5 sm:p-4 bg-white space-y-3">
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-950 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span className="text-sm font-black">Teslimat Tamamlandı</span>
                      </div>
                      <span className="text-xs font-mono font-black px-2.5 py-1 rounded-lg bg-emerald-200/80 text-emerald-950">
                        {currentStop.teslim_edilen_torba || hedefTorba} Torba
                      </span>
                    </div>
                    <div className="text-xs text-slate-700 flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-emerald-200/70">
                      <span>
                        <strong>Teslim Alan:</strong> {currentStop.teslim_alan || currentStop.ad_soyad}
                      </span>
                      <span>
                        <strong>Tarih:</strong> {formatTrAuto(currentStop.teslim_tarihi) || 'Kayıtlı'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {nextStopInOrder ? (
                      <button
                        type="button"
                        onClick={() => {
                          const nextIdx = safeIndex + 1;
                          setRouteModeIndex(nextIdx);
                          syncRouteModeInputsForStop(stops[nextIdx]);
                        }}
                        className="w-full min-h-[52px] py-3.5 px-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all"
                      >
                        <span>
                          Sıradaki Haneye Geç (#{nextStopInOrder.sira || safeIndex + 2}{' '}
                          {nextStopInOrder.ad_soyad})
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
                        className="w-full min-h-[52px] py-3.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-sm flex items-center justify-center gap-2 shadow-xs active:scale-[0.99] transition-all"
                      >
                        <span>
                          ⏳ Eksik Kayıtlara Git (#
                          {deferredStops[0].stop.sira || deferredStops[0].index + 1})
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => setCancelStopTarget(currentStop)}
                      disabled={isActionLoading}
                      className="w-full min-h-[46px] py-3 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-black text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
                    >
                      <Undo2 className="w-4 h-4 shrink-0" />
                      <span>↩ Yanlışlıkla Yapıldıysa Teslimatı Geri Al</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 sm:p-4 bg-white space-y-3">
                  {/* MOD 1: STANDART TAM TESLİMAT (VARSAYILAN SADE EKRAN) */}
                  {routeModeTab === 'DELIVER' ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-xs font-black text-slate-700 uppercase block mb-1">
                            Teslim Edilen Torba
                          </label>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setRouteModeTorba((v) =>
                                  String(Math.max(1, (parseInt(v, 10) || hedefTorba) - 1))
                                )
                              }
                              className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 font-black text-lg text-slate-800 active:scale-95"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={routeModeTorba}
                              onChange={(e) => setRouteModeTorba(e.target.value)}
                              min="1"
                              max={hedefTorba}
                              className="flex-1 h-11 px-3 rounded-xl bg-white border-2 border-emerald-500 text-center text-base font-mono font-black text-slate-900 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setRouteModeTorba((v) =>
                                  String(Math.min(hedefTorba, (parseInt(v, 10) || 0) + 1))
                                )
                              }
                              className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 font-black text-lg text-slate-800 active:scale-95"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-black text-slate-700 uppercase block mb-1">
                            Teslim Alan Kişi
                          </label>
                          <input
                            type="text"
                            value={routeModeRecipient}
                            onChange={(e) => setRouteModeRecipient(e.target.value)}
                            placeholder={currentStop.ad_soyad}
                            className="w-full h-11 px-3 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>

                      {/* ANA TESLİMAT BUTONU (TEK DOKUNUŞLA TAMAMLA & SIRADAKİNE GEÇ) */}
                      <button
                        type="button"
                        onClick={() => handleRouteModeSubmit('COMPLETE')}
                        disabled={isActionLoading}
                        className="w-full min-h-[56px] py-4 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-md active:scale-[0.99] transition-all cursor-pointer"
                      >
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <span>
                          {isActionLoading
                            ? 'Kaydediliyor...'
                            : isOnlyRemainingStop
                            ? `🎉 ${routeModeTorba || hedefTorba} TORBA TESLİM ET & ROTAYI BİTİR`
                            : `✓ ${routeModeTorba || hedefTorba} TORBA TESLİM ET & SIRADAKİNE GEÇ →`}
                        </span>
                      </button>

                      {/* İKİNCİL HIZLI SAHA AKSİYONLARI (EKSİK / EVDE YOK vs ŞİMDİLİK ATLA) */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
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
                          className="min-h-[44px] py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                        >
                          <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                          <span>Eksik / Evde Yok</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleSkipCurrentStop}
                          className="min-h-[44px] py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                          title="Bu haneyi teslimat yapmadan bekleyen olarak bırakır ve sıradaki haneye geçer"
                        >
                          <SkipForward className="w-4 h-4 text-slate-600 shrink-0" />
                          <span>Şimdilik Atla →</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* MOD 2: EKSİK BIRAK / EVDE YOK (DAHA SONRA TAMAMLANACAK) */
                    <div className="space-y-3 p-3.5 rounded-2xl bg-amber-50/80 border-2 border-amber-300">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-amber-950">
                          ⏳ Eksik / Evde Yok (Sonraya Bırak)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setRouteModeTab('DELIVER');
                            setRouteModeTorba(String(hedefTorba));
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-black"
                        >
                          ← Tam Teslimata Dön
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRouteModeDeferType('ZERO');
                            setRouteModeTorba('0');
                            if (!routeModeNote || routeModeNote.includes('Kamyonda')) {
                              setRouteModeNote('Evde kimse yok - Daha sonra tamamlanacak');
                            }
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            routeModeDeferType === 'ZERO'
                              ? 'bg-white border-rose-500 text-rose-950 shadow-2xs ring-2 ring-rose-400/30'
                              : 'bg-white/60 border-slate-200 text-slate-600'
                          }`}
                        >
                          <span className="text-xs font-black block">
                            🏠 Evde Yok (0 Torba)
                          </span>
                          <span className="text-xs font-medium opacity-85 block mt-0.5">
                            Şu an verilemedi
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRouteModeDeferType('PARTIAL');
                            setRouteModeTorba('20');
                            if (!routeModeNote || routeModeNote.includes('Evde')) {
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
                            ⚠️ Kısmi Verildi (Eksik)
                          </span>
                          <span className="text-xs font-medium opacity-85 block mt-0.5">
                            Kalanı sonra verilecek
                          </span>
                        </button>
                      </div>

                      {routeModeDeferType === 'PARTIAL' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                          <div>
                            <label className="text-xs font-black text-amber-950 block mb-1">
                              Şu An Verilen Torba (Kalan:{' '}
                              {Math.max(0, hedefTorba - (parseInt(routeModeTorba, 10) || 0))} T)
                            </label>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={routeModeTorba}
                              onChange={(e) => setRouteModeTorba(e.target.value)}
                              min="1"
                              max={hedefTorba - 1}
                              className="w-full h-11 px-3 rounded-xl bg-white border-2 border-amber-400 text-sm font-mono font-black text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-black text-amber-950 block mb-1">
                              Teslim Alan Kişi
                            </label>
                            <input
                              type="text"
                              value={routeModeRecipient}
                              onChange={(e) => setRouteModeRecipient(e.target.value)}
                              placeholder={currentStop.ad_soyad}
                              className="w-full h-11 px-3 rounded-xl bg-white border border-amber-300 text-xs font-bold text-slate-900"
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="text-xs font-black text-amber-950 block mb-1">
                          Not / Neden
                        </label>
                        <input
                          type="text"
                          value={routeModeNote}
                          onChange={(e) => setRouteModeNote(e.target.value)}
                          placeholder="Örn: Evde kimse yok - Daha sonra tamamlanacak"
                          className="w-full h-10 px-3 rounded-xl bg-white border border-amber-300 text-xs font-semibold text-slate-900"
                        />
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {[
                            'Evde kimse yok - Daha sonra tamamlanacak',
                            'Kamyonda kömür bitti - Daha sonra tamamlanacak',
                            'Sokak kapalı - Daha sonra girilecek',
                          ].map((reasonChip) => (
                            <button
                              key={reasonChip}
                              type="button"
                              onClick={() => setRouteModeNote(reasonChip)}
                              className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-950 border border-amber-300"
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
                        className="w-full min-h-[50px] py-3.5 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all"
                      >
                        <SkipForward className="w-4 h-4 shrink-0" />
                        <span>
                          {isActionLoading
                            ? 'İşleniyor...'
                            : !hasRemainingStopsAfterCurrent
                            ? '⏸️ KAYDET & ROTAYI GEÇİCİ DURDUR'
                            : '⏳ SONRAYA BIRAK & SIRADAKİ HANEYE GEÇ →'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* 3. ALT SIRALI NAVİGASYON BARI (ÖNCEKİ / SIRADAKİ HANE / SONRAKİ) */}
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
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 text-xs font-black flex items-center gap-1 border border-slate-300 shrink-0 active:scale-95"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Önceki</span>
          </button>

          {/* Sıradaki Durak Bilgisi */}
          <div className="min-w-0 text-center flex-1 px-1">
            {nextStopInOrder ? (
              <div className="truncate">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 block">
                  SIRADAKİ (#{nextStopInOrder.sira || safeIndex + 2})
                </span>
                <span className="text-xs font-black text-slate-800 truncate block">
                  {nextStopInOrder.ad_soyad}
                </span>
              </div>
            ) : (
              <div className="truncate">
                <span className="text-xs font-extrabold uppercase tracking-wider text-amber-600 block">
                  SON DURAK
                </span>
                <span className="text-xs font-bold text-slate-700 truncate block">
                  {deferredStops.length > 0
                    ? `${deferredStops.length} eksik kayıt var`
                    : 'Tamamlandığında rota biter'}
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
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 text-xs font-black flex items-center gap-1 border border-slate-300 shrink-0 active:scale-95"
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
            <div className="p-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/40 text-sky-400 flex items-center justify-center shrink-0">
                  <ListOrdered className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-black truncate">
                    Rotadaki Haneler ({stops.length})
                  </h3>
                  <p className="text-xs text-slate-300 truncate">
                    İstediğiniz sıradaki haneye dokunarak geçebilirsiniz
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStopPickerModal(false)}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0 transition-colors"
                title="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-slate-200 bg-slate-50 space-y-2 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={stopPickerSearch}
                  onChange={(e) => setStopPickerSearch(e.target.value)}
                  placeholder="İsim, T.C., sokak, kapı no veya #sıra ara..."
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
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
                  Bekleyen ({stops.filter((s: any) => s.durum !== 'TAMAMLANDI').length})
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

            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {filteredPickerStops.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <p className="text-xs font-bold">Aramanızla eşleşen hane bulunamadı.</p>
                </div>
              ) : (
                filteredPickerStops.map(({ stop: pStop, index: pIdx }) => {
                  const isCurrent = pIdx === safeIndex && !routeModePausedNotice;
                  const isDone = pStop.durum === 'TAMAMLANDI';
                  const isDeferred =
                    pStop.durum === 'EKSIK' || pStop.durum === 'TESLIM_EDILEMEDI';

                  return (
                    <button
                      key={pStop.beneficiary_id || pIdx}
                      type="button"
                      onClick={() => {
                        setRouteModePausedNotice(false);
                        setRouteModeIndex(pIdx);
                        syncRouteModeInputsForStop(pStop);
                        setShowStopPickerModal(false);
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
                            {isDone && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs font-bold">
                                ✓ {pStop.teslim_edilen_torba || 34} T
                              </span>
                            )}
                            {isDeferred && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-xs font-bold">
                                ⏳ {pStop.durum === 'EKSIK' ? `${pStop.teslim_edilen_torba} T` : '0 T'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 font-medium truncate mt-0.5">
                            {pStop.mahalle} {pStop.sokak ? `• ${pStop.sokak}` : ''}
                            {pStop.kapi_no &&
                            pStop.kapi_no !== 999999 &&
                            pStop.kapi_no !== '999999'
                              ? ` No:${pStop.kapi_no}`
                              : ''}
                          </p>
                        </div>
                      </div>

                      <ArrowRight className="w-4 h-4 text-sky-600 shrink-0" />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
