'use client';

import { useState } from 'react';
import {
  Truck, Users, MapPin, Phone, Printer, Trash2, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, AlertCircle, Download, Navigation, ArrowUp,
  ArrowDown, XCircle, ArrowRight, UserMinus
} from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/normalizer';

interface ActiveRouteAccordionCardProps {
  route: any;
  routeIdx: number;
  isExpanded: boolean;
  onToggle: () => void;
  onPrint: () => void;
  onDelete: () => void;
  onFinalize: () => void;
  onMoveStop: (index: number, direction: 'UP' | 'DOWN') => void;
  onOpenStopModal: (index: number, stop: any, mode: 'TAMAMLANDI' | 'EKSIK' | 'TESLIM_EDILEMEDI') => void;
  onRemoveStop: (index: number, stop: any) => void;
  onStartRouteMode?: () => void;
}

export default function ActiveRouteAccordionCard({
  route,
  routeIdx,
  isExpanded,
  onToggle,
  onPrint,
  onDelete,
  onFinalize,
  onMoveStop,
  onOpenStopModal,
  onRemoveStop,
  onStartRouteMode,
}: ActiveRouteAccordionCardProps) {
  const [stopFilter, setStopFilter] = useState<'ALL' | 'PENDING' | 'EKSIK' | 'TAMAMLANDI' | 'TESLIM_EDILEMEDI'>('ALL');

  const routeStops = (route.duraklar as any[]) || [];
  const total = route.toplam_hane || routeStops.length || 0;
  const completed = route.tamamlanan_hane || 0;
  const eksik = route.eksik_hane || 0;
  const undelivered = route.teslim_edilemeyen_hane || 0;
  const handled = completed + eksik + undelivered;
  const percent = total > 0 ? Math.min(100, Math.round((handled / total) * 100)) : 0;

  // Eksik kömür teslim edilen haneler
  const thisRouteEksikStops = routeStops
    .map((s: any, idx: number) => ({ ...s, originalIndex: idx }))
    .filter((s: any) => s.durum === 'EKSIK');

  const thisRouteEksikTorba = thisRouteEksikStops.reduce((sum: number, s: any) => {
    const hedef = Number(s.hedef_torba) || 34;
    const teslim = Number(s.teslim_edilen_torba) || 0;
    return sum + Math.max(0, hedef - teslim);
  }, 0);

  // Hiç kömür verilmeyen haneler (rota tamamlama kontrolü için)
  const noCoalStops = routeStops.filter((s: any) => {
    const delivered = Number(s.teslim_edilen_torba) || (s.durum === 'TAMAMLANDI' ? (Number(s.hedef_torba) || 34) : 0);
    const hasCoal = (s.durum === 'TAMAMLANDI' || s.durum === 'EKSIK') && delivered > 0;
    return !hasCoal;
  });
  const canFinalize = routeStops.length > 0 && noCoalStops.length === 0;

  // Filtrelenmiş durak listesi
  const displayedStops = routeStops
    .map((stop: any, index: number) => ({ ...stop, originalIndex: index }))
    .filter((stop: any) => {
      if (stopFilter === 'ALL') return true;
      if (stopFilter === 'PENDING') return !stop.durum || stop.durum === 'BEKLIYOR';
      if (stopFilter === 'EKSIK') return stop.durum === 'EKSIK';
      if (stopFilter === 'TAMAMLANDI') return stop.durum === 'TAMAMLANDI';
      if (stopFilter === 'TESLIM_EDILEMEDI') return stop.durum === 'TESLIM_EDILEMEDI';
      return true;
    });

  return (
    <div
      className={`bg-white rounded-2xl border transition-all shadow-xs overflow-hidden ${
        isExpanded
          ? 'border-sky-400 ring-2 ring-sky-400/20 shadow-md'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
      }`}
    >
      {/* ======================================================== */}
      {/* AKORDİYON BAŞLIĞI (HEADER)                                */}
      {/* ======================================================== */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        className={`p-3.5 sm:p-4 cursor-pointer transition-colors select-none flex flex-col md:flex-row md:items-center justify-between gap-3 ${
          isExpanded ? 'bg-sky-50/70 border-b border-sky-100' : 'bg-white hover:bg-slate-50/80'
        }`}
      >
        {/* Sol Bölüm: İkon, Rota Başlığı, Plaka, Personel ve Özet */}
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
              isExpanded
                ? 'bg-sky-600 text-white border-sky-700 shadow-xs'
                : 'bg-sky-50 text-sky-700 border-sky-200'
            }`}
          >
            <Truck className="w-5 h-5" />
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"
                  title="Saha Dağıtımı Aktif"
                />
                <h3 className="text-sm sm:text-base font-black text-slate-900 truncate">
                  {route.rota_adi || `Ekip ${routeIdx + 1} Dağıtım Rotası`}
                </h3>
              </div>
              {route.arac_plaka && (
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300 shrink-0">
                  {route.arac_plaka}
                </span>
              )}
              <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                Dağıtım Sürüyor
              </span>
              {Boolean(route.kilitli_personel && !(Number(route.kilit_timestamp) > 0 && Date.now() - Number(route.kilit_timestamp) > 45 * 60 * 1000)) && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300 shrink-0">
                  🔒 Kullanımda: {route.kilitli_personel}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-500 font-medium">
              <span className="flex items-center gap-1 text-slate-700 font-semibold">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                {route.dagitim_personeli || 'Personel'}
              </span>
              <span>•</span>
              <span>{route.tarih}</span>
              <span>•</span>
              <span className="font-extrabold text-slate-800">
                {handled} / {total} Hane (%{percent})
              </span>
              {route.eksik_hane > 0 && (
                <>
                  <span>•</span>
                  <span className="text-amber-800 font-black bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                    ⚠️ {route.eksik_hane} Hane Eksik Kömür
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Sağ Bölüm: İlerleme Çubuğu, Hızlı Aksiyonlar ve Aç/Kapat Butonu */}
        <div className="flex items-center justify-between md:justify-end gap-2.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
          {/* Mini İlerleme Çubuğu */}
          <div className="hidden sm:flex flex-col items-end gap-1 w-24">
            <div className="text-[11px] font-black text-slate-700">
              %{percent} <span className="text-[10px] text-slate-400 font-normal">Tamam</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
              <div
                className="h-full bg-linear-to-r from-sky-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {/* Hızlı Aksiyon Butonları */}
          <div className="flex items-center gap-1.5">
            {onStartRouteMode && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartRouteMode();
                }}
                className="px-2.5 py-1.5 rounded-xl bg-linear-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-black text-xs flex items-center gap-1.5 shadow-xs active:scale-95 transition-all"
                title="Sıralı Saha Dağıtım Modunu Başlat"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Saha Modu</span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPrint();
              }}
              className="p-2 rounded-xl text-slate-600 hover:text-amber-800 hover:bg-amber-50 border border-slate-200 transition-all active:scale-95"
              title="Resmi Dağıtım Tutanağını Önizle ve Yazdır"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-all active:scale-95"
              title="Rotayı Sil"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Aç / Kapat Butonu */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black transition-all ${
                isExpanded
                  ? 'bg-sky-600 text-white border-sky-700 shadow-2xs'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <span className="hidden xs:inline">{isExpanded ? 'Kapat' : 'Aç'}</span>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* AKORDİYON GÖVDESİ (DETAYLAR VE DURAKLAR)                   */}
      {/* ======================================================== */}
      {isExpanded && (
        <div className="p-3.5 sm:p-5 bg-slate-50/50 border-t border-slate-200 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* SOL PANEL: Rota Özeti, Metrikler & Aksiyonlar */}
            <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-28 space-y-3">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                        Dağıtım Sürüyor
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {route.tarih}
                      </span>
                    </div>
                    <h3 className="text-base font-black text-slate-900 mt-1 truncate">
                      {route.rota_adi}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-1">
                      {route.arac_plaka && (
                        <span className="flex items-center gap-1 font-bold text-slate-800">
                          <Truck className="w-3.5 h-3.5 text-slate-500" />
                          Plaka: {route.arac_plaka}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-slate-600">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        Dağıtım: {route.dagitim_personeli}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={onDelete}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-all active:scale-95"
                      title="Rotayı Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* İlerleme Çubuğu */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-700">
                      Dağıtım Durumu: <strong className="text-slate-900">{handled} / {total} Hane</strong>
                    </span>
                    <span className="text-sky-800 font-extrabold font-mono">%{percent}</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                    <div
                      className="h-full bg-linear-to-r from-sky-500 to-emerald-500 transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                {/* 4'lü İstatistik Metrikleri */}
                <div className="grid grid-cols-4 gap-1.5 pt-1 text-center">
                  <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-base font-black text-emerald-800 block leading-tight">
                      {route.tamamlanan_hane || 0}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-900 uppercase">Tamam</span>
                  </div>

                  <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
                    <span className="text-base font-black text-amber-800 block leading-tight">
                      {route.eksik_hane || 0}
                    </span>
                    <span className="text-[10px] font-bold text-amber-900 uppercase">Eksik</span>
                  </div>

                  <div className="p-2 rounded-xl bg-rose-50 border border-rose-200">
                    <span className="text-base font-black text-rose-800 block leading-tight">
                      {route.teslim_edilemeyen_hane || 0}
                    </span>
                    <span className="text-[10px] font-bold text-rose-900 uppercase">Verilemedi</span>
                  </div>

                  <div className="p-2 rounded-xl bg-sky-50 border border-sky-200">
                    <span className="text-base font-black text-sky-800 block leading-tight">
                      {route.toplam_dagitilan_torba || 0}
                    </span>
                    <span className="text-[10px] font-bold text-sky-900 uppercase">Torba</span>
                  </div>
                </div>

                {/* Rotayı Tamamla & İndir Butonları */}
                <div className="pt-2 flex flex-col gap-2">
                  {onStartRouteMode && (
                    <button
                      type="button"
                      onClick={onStartRouteMode}
                      className="w-full py-2.5 px-3 rounded-xl bg-linear-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-xs active:scale-95 transition-all"
                    >
                      <Navigation className="w-4 h-4" />
                      <span>Saha Dağıtım Modunu Başlat (Sıralı Ekran)</span>
                    </button>
                  )}

                  {canFinalize ? (
                    thisRouteEksikStops.length > 0 ? (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-[11px] font-semibold flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-amber-900 block">
                            ⚠️ Rotada {thisRouteEksikStops.length} Hanede Eksik Kömür Kaldı ({thisRouteEksikTorba} Torba)
                          </span>
                          <span className="text-[10px] text-amber-800 font-normal leading-tight block mt-0.5">
                            Kısmi teslimat yapıldı. Rota kapatılabilir; ancak eksik torbalar genel sistemdeki eksik teslimat listesinde takibe devam eder.
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-[11px] font-semibold flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Tüm hanelere tam kömür verildi. Rota tamamlanmaya hazır.</span>
                      </div>
                    )
                  ) : (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 text-[11px] font-semibold flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-rose-900 block">
                          Hiç kömür verilmeyen {noCoalStops.length} hane var!
                        </span>
                        <span className="text-[10px] text-rose-800 font-normal leading-tight block mt-0.5">
                          Rotayı tamamlamak için tüm hanelere kömür verilmelidir (eksik teslimat kabul edilir, hiç kömür verilmeyen hane varken tamamlanamaz).
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={onFinalize}
                    className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] ${
                      canFinalize
                        ? thisRouteEksikStops.length > 0
                          ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
                        : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300'
                    }`}
                    title={
                      canFinalize
                        ? thisRouteEksikStops.length > 0
                          ? `Rotayı Tamamla (${thisRouteEksikStops.length} hanede eksik kömür kaldı)`
                          : 'Rotayı Tamamla ve Arşivle'
                        : `${noCoalStops.length} hane henüz kömür almadı`
                    }
                  >
                    {canFinalize ? (
                      thisRouteEksikStops.length > 0 ? (
                        <>
                          <AlertTriangle className="w-4 h-4" />
                          <span>Rotayı Tamamla ({thisRouteEksikStops.length} Eksik Teslimatla)</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Rotayı Tamamla ve Arşivle</span>
                        </>
                      )
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                        <span>Rotayı Tamamla ({noCoalStops.length} Haneye Kömür Verilmedi)</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/export?type=daily_deliveries&date=${route.tarih || new Date().toLocaleDateString('en-CA')}`}
                      download={`Edirne_SYDV_Teslimat_Listesi_${route.tarih || 'Bugun'}.xlsx`}
                      className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Teslimat Listesi (Excel)</span>
                    </a>
                    <button
                      type="button"
                      onClick={onPrint}
                      className="py-2 px-3 rounded-xl bg-white hover:bg-amber-50 hover:border-amber-300 hover:text-amber-900 border border-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                      title="Resmi Dağıtım Tutanağını Önizle ve Yazdır"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Yazdır</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* SAĞ PANEL: Sıralı Duraklar Listesi */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-2.5">
              {/* 1. ROTADA EKSİK KÖMÜR KALDI UYARISI BANNERI */}
              {thisRouteEksikStops.length > 0 && (
                <div className="rounded-2xl bg-amber-50/95 border-2 border-amber-400 p-3.5 shadow-sm space-y-2.5 animate-in fade-in duration-200">
                  <div className="flex items-start sm:items-center justify-between gap-2.5 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs animate-pulse">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-950 bg-amber-200 px-2 py-0.5 rounded-full border border-amber-300">
                            ⚠️ Rota Eksik Kömür Uyarısı
                          </span>
                          <span className="text-xs sm:text-sm font-extrabold text-amber-950">
                            {thisRouteEksikStops.length} Hanede Eksik Kömür Kaldı!
                          </span>
                        </div>
                        <p className="text-xs text-amber-900 font-medium mt-0.5">
                          Bu rotada kısmi kömür verildi. Toplam <strong className="text-rose-800 font-extrabold font-mono">{thisRouteEksikTorba} Torba</strong> kömür teslimi beklemektedir.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                      <button
                        type="button"
                        onClick={() => setStopFilter(stopFilter === 'EKSIK' ? 'ALL' : 'EKSIK')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all active:scale-95 flex items-center gap-1.5 shadow-2xs ${
                          stopFilter === 'EKSIK'
                            ? 'bg-amber-600 text-white border-amber-700'
                            : 'bg-white hover:bg-amber-100 text-amber-950 border-amber-300'
                        }`}
                      >
                        <span>{stopFilter === 'EKSIK' ? 'Tüm Durakları Göster' : `Eksikleri Filtrele (${thisRouteEksikStops.length})`}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Hızlı Eksik Tamamlama Kartları */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 border-t border-amber-200">
                    {thisRouteEksikStops.map((stop: any) => {
                      const hedef = Number(stop.hedef_torba) || 34;
                      const teslim = Number(stop.teslim_edilen_torba) || 0;
                      const kalan = Math.max(0, hedef - teslim);

                      return (
                        <div
                          key={stop.beneficiary_id || stop.sira}
                          className="p-2.5 rounded-xl bg-white border border-amber-300 flex items-center justify-between gap-2 shadow-2xs hover:border-amber-400 transition-all"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-md bg-amber-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                                #{stop.sira}
                              </span>
                              <span className="text-xs font-black text-slate-900 truncate">
                                {stop.ad_soyad}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] mt-1 text-slate-600">
                              <span>Verilen: <strong className="text-slate-900">{teslim}</strong>/{hedef}</span>
                              <span>•</span>
                              <span className="text-rose-700 font-bold bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 font-mono">
                                Kalan: {kalan} Torba
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onOpenStopModal(stop.originalIndex, stop, 'EKSIK')}
                            className="px-2.5 py-1.5 rounded-lg bg-linear-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold text-xs shrink-0 shadow-2xs transition-all active:scale-95"
                          >
                            Kalanı Ver / Düzenle
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. DURAK LİSTESİ BAŞLIĞI VE FİLTRELEME SEKMELERİ */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-sky-600" />
                    <span>Sıralı Durak Listesi ({routeStops.length} Hane)</span>
                  </h4>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {stopFilter === 'ALL' ? 'Kapı No sıralı • Yukarı/Aşağı taşınabilir' : `Filtrelendi (${displayedStops.length} durak)`}
                  </span>
                </div>

                {/* Durak Filtre Sekmeleri */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setStopFilter('ALL')}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                      stopFilter === 'ALL'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Tümü ({routeStops.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStopFilter('PENDING')}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                      stopFilter === 'PENDING'
                        ? 'bg-sky-600 text-white shadow-2xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Bekleyen ({routeStops.filter((s: any) => !s.durum || s.durum === 'BEKLIYOR').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStopFilter('EKSIK')}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap flex items-center gap-1 transition-all ${
                      stopFilter === 'EKSIK'
                        ? 'bg-amber-500 text-white shadow-2xs font-black'
                        : thisRouteEksikStops.length > 0
                        ? 'bg-amber-100 text-amber-950 border border-amber-300 font-extrabold animate-pulse'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <span>⚠️ Eksik Kalan ({thisRouteEksikStops.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStopFilter('TAMAMLANDI')}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                      stopFilter === 'TAMAMLANDI'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Tamamlanan ({route.tamamlanan_hane || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStopFilter('TESLIM_EDILEMEDI')}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                      stopFilter === 'TESLIM_EDILEMEDI'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Verilemedi ({route.teslim_edilemeyen_hane || 0})
                  </button>
                </div>
              </div>

              {/* Durak Kartları */}
              {displayedStops.map((stop: any) => {
                const isTamam = stop.durum === 'TAMAMLANDI';
                const isEksik = stop.durum === 'EKSIK';
                const isUndelivered = stop.durum === 'TESLIM_EDILEMEDI';
                const isPending = !stop.durum || stop.durum === 'BEKLIYOR';
                const hedefTorba = stop.hedef_torba || 34;
                const teslimTorba = stop.teslim_edilen_torba || 0;
                const kalanTorba = Math.max(0, hedefTorba - teslimTorba);

                return (
                  <div
                    key={stop.beneficiary_id || stop.originalIndex}
                    className={`p-3.5 rounded-2xl border transition-all shadow-xs ${
                      isTamam
                        ? 'bg-emerald-50/40 border-emerald-300'
                        : isEksik
                        ? 'bg-amber-50/60 border-amber-400 ring-1 ring-amber-300/50'
                        : isUndelivered
                        ? 'bg-rose-50/50 border-rose-300'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    {/* Üst Satır: Durak No, İsim ve Reorder Butonları */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        {/* Sıra Numarası Rozeti */}
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border ${
                            isTamam
                              ? 'bg-emerald-600 text-white border-emerald-700'
                              : isEksik
                              ? 'bg-amber-500 text-white border-amber-600'
                              : isUndelivered
                              ? 'bg-rose-600 text-white border-rose-700'
                              : 'bg-slate-900 text-white border-slate-900'
                          }`}
                        >
                          #{stop.sira || stop.originalIndex + 1}
                        </div>

                        <div className="min-w-0">
                          <h4 className="text-sm font-extrabold text-slate-900 truncate">
                            {stop.ad_soyad}
                          </h4>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                            <span className="font-mono text-amber-800 font-bold">
                              TC: {stop.tc_no}
                            </span>
                            <span>•</span>
                            <span className="text-slate-700 font-medium">{stop.mahalle}</span>
                          </div>
                        </div>
                      </div>

                      {/* Sıralama Taşıma Butonları (Reorder) */}
                      <div className="flex items-center gap-0.5 shrink-0 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() => onMoveStop(stop.originalIndex, 'UP')}
                          disabled={stop.originalIndex === 0 || stopFilter !== 'ALL'}
                          className="p-1 rounded text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-600"
                          title={stopFilter !== 'ALL' ? "Sıralama değiştirmek için 'Tümü' filtresini seçiniz" : "Yukarı Taşı"}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveStop(stop.originalIndex, 'DOWN')}
                          disabled={stop.originalIndex === routeStops.length - 1 || stopFilter !== 'ALL'}
                          className="p-1 rounded text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-600"
                          title={stopFilter !== 'ALL' ? "Sıralama değiştirmek için 'Tümü' filtresini seçiniz" : "Aşağı Taşı"}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Orta Satır: Adres ve Telefon */}
                    <div className="mt-2.5 space-y-1 text-xs">
                      <div className="flex items-start gap-1.5 text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">{stop.adres || 'Adres bilgisi girilmemiş'}</span>
                      </div>
                      {stop.telefon && (
                        <div className="flex items-center gap-1.5 text-slate-600 font-mono">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <a href={`tel:${stop.telefon}`} className="hover:text-sky-600 font-bold">
                            {formatPhoneDisplay(stop.telefon)}
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Alt Satır: Durum Kartı / Aksiyon Butonları */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-2">
                      {isTamam && (
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 text-xs text-emerald-900 font-bold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Teslim Edildi: <strong>{teslimTorba} Torba</strong></span>
                            {stop.teslim_alan && (
                              <span className="text-[11px] text-slate-500 font-normal">
                                ({stop.teslim_alan})
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => onOpenStopModal(stop.originalIndex, stop, 'TAMAMLANDI')}
                            className="text-[11px] text-emerald-800 hover:text-emerald-950 underline font-semibold"
                          >
                            Düzenle
                          </button>
                        </div>
                      )}

                      {isEksik && (
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-xs text-amber-950 font-black">
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                              <span>
                                Eksik Teslimat: <strong className="text-emerald-800">{teslimTorba}</strong> / {hedefTorba} Torba
                              </span>
                              <span className="text-rose-700 font-extrabold bg-rose-100 px-1.5 py-0.2 rounded border border-rose-300 font-mono">
                                Kalan: {kalanTorba} Torba
                              </span>
                            </div>
                            {stop.notlar && (
                              <p className="text-[10px] text-amber-900 font-medium pl-5.5">
                                Not: {stop.notlar}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenStopModal(stop.originalIndex, stop, 'EKSIK')}
                              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-2xs"
                            >
                              Kalanı Ver / Düzenle
                            </button>
                          </div>
                        </div>
                      )}

                      {isUndelivered && (
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 text-xs text-rose-800 font-bold">
                            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>Teslim Edilemedi</span>
                            {stop.notlar && (
                              <span className="text-[11px] text-rose-700 font-normal">
                                ({stop.notlar})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenStopModal(stop.originalIndex, stop, 'TAMAMLANDI')}
                              className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-2xs"
                            >
                              Teslim Et
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveStop(stop.originalIndex, stop)}
                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 font-bold text-[11px] border border-slate-200"
                              title="Rotadan Çıkar"
                            >
                              Rotadan Çıkar
                            </button>
                          </div>
                        </div>
                      )}

                      {isPending && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-3 gap-1.5">
                            {/* 1. Tam Teslim Et */}
                            <button
                              type="button"
                              onClick={() => onOpenStopModal(stop.originalIndex, stop, 'TAMAMLANDI')}
                              className="py-2 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-2xs transition-all active:scale-95"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span className="truncate">Teslim ({hedefTorba})</span>
                            </button>

                            {/* 2. Eksik Kömür Ver */}
                            <button
                              type="button"
                              onClick={() => onOpenStopModal(stop.originalIndex, stop, 'EKSIK')}
                              className="py-2 px-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-2xs transition-all active:scale-95"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span className="truncate">Eksik Ver</span>
                            </button>

                            {/* 3. Verilemedi */}
                            <button
                              type="button"
                              onClick={() => onOpenStopModal(stop.originalIndex, stop, 'TESLIM_EDILEMEDI')}
                              className="py-2 px-2 rounded-xl bg-slate-100 hover:bg-rose-100 hover:text-rose-800 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 border border-slate-200 transition-all active:scale-95"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span className="truncate">Verilemedi</span>
                            </button>
                          </div>

                          {/* 4. Rotadan Çıkar Butonu */}
                          <button
                            type="button"
                            onClick={() => onRemoveStop(stop.originalIndex, stop)}
                            className="w-full py-1.5 px-2 rounded-xl border border-slate-200 hover:border-rose-300 bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs"
                            title="Bu haneyi mevcut rotadan çıkarıp boşa alır (başka ekip veya yeni rota için seçilebilir)"
                          >
                            <UserMinus className="w-3.5 h-3.5 text-rose-500" />
                            <span>Rotadan Çıkar (Başka Ekibe / Yeni Rotaya Al)</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {displayedStops.length === 0 && (
                <div className="p-8 text-center rounded-2xl bg-white border border-slate-200 space-y-2">
                  <p className="text-xs font-bold text-slate-700">Bu filtreye uygun durak bulunamadı.</p>
                  <button
                    type="button"
                    onClick={() => setStopFilter('ALL')}
                    className="text-xs text-sky-600 hover:underline font-bold"
                  >
                    Tüm Durakları Göster
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
