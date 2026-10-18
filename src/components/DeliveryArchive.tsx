'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, PackageCheck, AlertTriangle, Undo2, Search, Download, Clock, User, MapPin, Printer, X, FileText, CheckCircle2, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { isBirebirBeneficiaryMatch, extractUniquePersonnelList } from '@/lib/normalizer';
import { formatTrDate, formatTrDateTime, formatTrAuto } from '@/lib/dateUtils';

interface DeliveryArchiveProps {
  groupedDays: any[];
  allRecords: any[];
  stats: any;
  onOpenCancel: (record: any) => void;
  isLoading?: boolean;
}

export default function DeliveryArchive({
  groupedDays,
  allRecords,
  stats,
  onOpenCancel,
  isLoading = false
}: DeliveryArchiveProps) {
  const [subTab, setSubTab] = useState<'DELIVERIES' | 'CANCELLATIONS'>('DELIVERIES');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDay, setSelectedDay] = useState<string>('ALL');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [printDayGroup, setPrintDayGroup] = useState<any | null>(null);

  // ESC tuşu ve overlay ile yazdırma modalını güvenli kapatma (ekran kilitlenmesini önler)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPrintDayGroup(null);
      }
    };
    if (printDayGroup) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [printDayGroup]);

  const todayStr = new Date().toLocaleDateString('en-CA');
  const todayRecords = allRecords.filter((r) => r.islem_tipi === 'TESLIMAT' && r.gun_tarihi === todayStr);

  // Günlük tutanakta görev alan tüm personellerin listesi
  const deliveryStaffList = useMemo(() => {
    if (!printDayGroup) return [];
    const sameDayRecords = Array.isArray(allRecords)
      ? allRecords.filter(
          (r) =>
            r &&
            (r.gun_tarihi === printDayGroup.gun_tarihi ||
              (typeof r.tarih === 'string' && r.tarih.startsWith(printDayGroup.gun_tarihi)))
        )
      : [];
    return extractUniquePersonnelList([...(printDayGroup.items || []), ...sameDayRecords]);
  }, [printDayGroup, allRecords]);

  // Filter cancelled items
  const cancelledItems = allRecords.filter((r) => r.islem_tipi === 'IPTAL');

  // Filter delivered items
  const deliveredItems = allRecords.filter((r) => r.islem_tipi === 'TESLIMAT');

  // Search filter for deliveries (Yalnızca TC Kimlik No ve Adı Soyadı alanlarında %100 Türkçe karakter uyumlu arama)
  const filteredDelivered = deliveredItems.filter((r) => {
    if (selectedDay !== 'ALL' && r.gun_tarihi !== selectedDay) return false;
    if (!searchQuery) return true;
    return isBirebirBeneficiaryMatch(r, searchQuery);
  });

  // Search filter for cancellations (Yalnızca TC Kimlik No ve Adı Soyadı alanlarında %100 Türkçe karakter uyumlu arama)
  const filteredCancelled = cancelledItems.filter((r) => {
    if (!searchQuery) return true;
    return isBirebirBeneficiaryMatch(r, searchQuery);
  });

  // Re-group filtered deliveries by date
  const filteredGroupedDays = groupedDays.map((group) => ({
    ...group,
    items: group.items.filter((item: any) => {
      if (item.islem_tipi !== 'TESLIMAT') return false;
      if (selectedDay !== 'ALL' && item.gun_tarihi !== selectedDay) return false;
      if (!searchQuery) return true;
      return isBirebirBeneficiaryMatch(item, searchQuery);
    })
  })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-4">
      {/* Metrics Banner - Light Mode */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="stat-card">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Toplam Teslimat</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-600">{stats?.toplamTeslimatSayisi || 0}</span>
            <span className="text-xs text-slate-500 font-semibold">Kişi</span>
          </div>
        </div>

        <div className="stat-card">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Toplam Kömür</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-black text-amber-700">
              {((stats?.toplamTorbaSayisi || 0) * 0.025).toFixed(1)}
            </span>
            <span className="text-xs text-slate-500 font-semibold">Ton</span>
          </div>
        </div>

        <div className="stat-card">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Bugün Dağıtılan</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-black text-sky-700">{stats?.bugunTeslimatSayisi || 0}</span>
            <span className="text-xs text-slate-500 font-semibold">Kişi</span>
          </div>
        </div>

        <div className="stat-card">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">İptal Edilenler</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-black text-rose-600">{stats?.toplamIptalSayisi || 0}</span>
            <span className="text-xs text-slate-500 font-semibold">Kayıt</span>
          </div>
        </div>
      </div>

      {/* Sub Tabs: Günlük Arşiv vs İptal Edilen Teslimatlar - Light Mode */}
      <div className="flex rounded-2xl bg-slate-200/80 p-1 border border-slate-300 text-xs font-bold shadow-inner">
        <button
          onClick={() => setSubTab('DELIVERIES')}
          className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all ${
            subTab === 'DELIVERIES'
              ? 'bg-white text-slate-900 shadow-md font-extrabold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <PackageCheck className="w-4 h-4 text-amber-600" />
          <span>Günlük Teslimat Arşivi ({deliveredItems.length})</span>
        </button>

        <button
          onClick={() => setSubTab('CANCELLATIONS')}
          className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all ${
            subTab === 'CANCELLATIONS'
              ? 'bg-white text-rose-800 shadow-md font-extrabold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Undo2 className="w-4 h-4 text-rose-600" />
          <span>İptal Edilenler ({cancelledItems.length})</span>
        </button>
      </div>

      {/* Today's Delivery Fast Actions Banner */}
      {subTab === 'DELIVERIES' && todayRecords.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border border-emerald-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-200/70 px-2 py-0.2 rounded-md">
                  Günün Dağıtım Özeti
                </span>
                <span className="text-xs font-bold text-slate-500">{formatTrDate(todayStr)}</span>
              </div>
              <h4 className="text-sm font-black text-slate-900 mt-0.5">
                Bugün <span className="text-emerald-700">{todayRecords.length} Haneye</span> Kömür Teslim Edildi
              </h4>
            </div>
          </div>

          <div className="w-full sm:w-auto flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                const todayGroup = groupedDays.find((g) => g.gun_tarihi === todayStr) || {
                  gun_tarihi: todayStr,
                  items: todayRecords,
                };
                setPrintDayGroup(todayGroup);
              }}
              className="flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-xs whitespace-nowrap cursor-pointer"
              title="Bugünün teslimat tutanağını resmi rapor formatında görüntüle ve yazdır"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>Günün Tutanağını Yazdır</span>
            </button>
            <a
              href={`/api/export?type=daily_deliveries&date=${todayStr}`}
              download={`Bugunku_Komur_Teslimat_Listesi_${todayStr}.xlsx`}
              className="flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 shadow-xs whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Günün Listesini İndir (Excel)</span>
            </a>
          </div>
        </div>
      )}

      {/* Search & Date Filter Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Arşivde TC Kimlik No veya Adı Soyadı ara..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-amber-500 font-medium"
          />
        </div>

        {subTab === 'DELIVERIES' && (
          <select
            value={selectedDay}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedDay(val);
              setExpandedDay(val !== 'ALL' ? val : null);
            }}
            className="px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-bold focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">Tüm Günler ({deliveredItems.length} Teslimat)</option>
            {groupedDays.map((g) => (
              <option key={g.gun_tarihi} value={g.gun_tarihi}>
                {formatTrDate(g.gun_tarihi)} ({g.teslimatSayisi} Teslimat)
              </option>
            ))}
          </select>
        )}
      </div>

      {/* VIEW 1: Günlük Teslimat Arşivi (Akordiyon Görünüm) - Light Mode */}
      {subTab === 'DELIVERIES' && (
        <div className="space-y-3">
          {filteredGroupedDays.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs shadow-sm">
              Seçilen kriterlerde teslimat kaydı bulunamadı.
            </div>
          ) : (
            filteredGroupedDays.map((dayGroup) => {
              const isExpanded = expandedDay === dayGroup.gun_tarihi;
              const totalBags = dayGroup.items.reduce((acc: number, curr: any) => acc + (curr.torba_sayisi || 0), 0);
              const totalTon = (totalBags * 0.025).toFixed(2);

              return (
                <div
                  key={dayGroup.gun_tarihi}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all"
                >
                  {/* Akordiyon Gün Başlığı - Rota Arşivi Gibi Tıklanabilir */}
                  <div
                    onClick={() => setExpandedDay(isExpanded ? null : dayGroup.gun_tarihi)}
                    className="p-3.5 cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 select-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4 text-amber-700" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-black text-slate-900 tracking-wide">
                            {formatTrDate(dayGroup.gun_tarihi)}
                          </span>
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {dayGroup.items.length} Teslimat
                          </span>
                          <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            {totalTon} Ton
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          {dayGroup.items.length} Haneye toplam {totalBags} torba kömür ulaştırıldı
                        </p>
                      </div>
                    </div>

                    {/* Aksiyon Butonları & Akordiyon Oku */}
                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                      <a
                        href={`/api/export?type=daily_deliveries&date=${dayGroup.gun_tarihi}`}
                        download={`Komur_Teslimat_Listesi_${dayGroup.gun_tarihi}.xlsx`}
                        onClick={(e) => e.stopPropagation()}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all shadow-2xs"
                        title="Bu günün teslimat listesini Excel olarak indir"
                      >
                        <Download className="w-3 h-3 text-emerald-700" />
                        <span className="hidden xs:inline">Excel</span>
                      </a>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPrintDayGroup(dayGroup);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all shadow-2xs"
                        title="Günün teslimat tutanağını yazdır veya liste olarak incele"
                      >
                        <Printer className="w-3 h-3 text-slate-600" />
                        <span className="hidden xs:inline">Tutanak / Yazdır</span>
                      </button>
                      <div className="p-1 text-slate-400">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-slate-600" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-600" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Akordiyon Açılır İçeriği: Günün Teslimat Kayıtları */}
                  {isExpanded && (
                    <div className="p-3.5 bg-slate-50 border-t border-slate-200">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                        {dayGroup.items.map((item: any) => (
                          <div
                            key={item.id}
                            className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 transition-all space-y-2 shadow-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="text-sm font-extrabold text-slate-900">{item.ad_soyad}</h4>
                                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                  <span className="font-mono font-bold text-amber-800">TC: {item.tc_no}</span>
                                  <span>•</span>
                                  <span className="text-slate-700 font-medium">{item.mahalle}</span>
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="text-xs font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-200">
                                  {item.torba_sayisi} Torba
                                </span>
                                <div className="text-[10px] text-slate-500 mt-1 font-semibold flex items-center justify-end gap-1">
                                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{formatTrAuto(item.tarih)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Details row & Cancel Button */}
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-600">
                              <div className="truncate">
                                <span>Teslim Alan: <strong className="text-slate-900">{item.teslim_alan || item.ad_soyad}</strong></span>
                                {item.personel && <span> • Pers: {item.personel}</span>}
                              </div>

                              {/* Teslimat İptal Butonu */}
                              <button
                                onClick={() => onOpenCancel(item)}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-[11px] font-bold shrink-0 flex items-center gap-1 active:scale-95 transition-all shadow-xs"
                              >
                                <Undo2 className="w-3 h-3" />
                                Hatalı Teslimat İptal Et
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW 2: İptal Edilen Teslimatlar Sayfası - Light Mode */}
      {subTab === 'CANCELLATIONS' && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>
              Bu sayfada daha önce yapılan fakat hata veya tutanak nedeniyle iptal edilen tüm teslimatlar arşivlenmektedir.
            </span>
          </div>

          {filteredCancelled.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs shadow-sm">
              Henüz iptal edilmiş bir teslimat kaydı bulunmuyor.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filteredCancelled.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-white border border-rose-200 space-y-2 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">{item.ad_soyad}</h4>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <span className="font-mono font-bold text-rose-700">TC: {item.tc_no}</span>
                        <span>•</span>
                        <span className="text-slate-700 font-medium">{item.mahalle}</span>
                      </div>
                    </div>

                    <span className="badge badge-cancelled text-[11px]">
                      İptal Edildi
                    </span>
                  </div>

                  {/* Cancellation Reason */}
                  <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200 text-xs text-rose-900">
                    <p className="font-bold text-rose-800">İptal Gerekçesi:</p>
                    <p className="mt-0.5 font-medium">{item.iptal_nedeni || 'Gerekçe belirtilmedi'}</p>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 font-medium">
                    <span>İşlemi Yapan: <strong className="text-slate-800">{item.personel}</strong></span>
                    <span>{formatTrAuto(item.tarih)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Günlük Teslimat Tutanağı ve Yazdırma Modalı */}
      {printDayGroup && typeof document !== 'undefined' && createPortal(
        <div 
          className="report-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPrintDayGroup(null);
            }
          }}
        >
          {/* Modal Panel: Sabit %92 ekran yüksekliği ve flex düzeni ile tüm içerik scroll edilir */}
          <div className="report-modal-card relative bg-white rounded-2xl sm:rounded-3xl w-full max-w-5xl h-[92vh] max-h-[92vh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden z-10">
            
            {/* Modal Header: Daima üstte sabit kalır */}
            <div className="report-modal-header shrink-0 h-14 sm:h-16 px-4 sm:px-6 border-b border-slate-200 flex items-center justify-between bg-slate-100 z-20 no-print">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <h3 className="text-xs sm:text-sm md:text-base font-black text-slate-900 truncate">
                    Günlük Kömür Dağıtım ve Teslimat Tutanağı
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-semibold flex items-center gap-1.5 flex-wrap">
                    <span>Tarih: <strong className="text-slate-800">{formatTrDate(printDayGroup.gun_tarihi)}</strong></span>
                    <span>•</span>
                    <span>Toplam: <strong className="text-emerald-700">{printDayGroup.items.length} Hane</strong></span>
                    <span>•</span>
                    <span><strong className="text-amber-800">{(printDayGroup.items.reduce((acc: number, curr: any) => acc + (curr.torba_sayisi || 0), 0) * 0.025).toFixed(2)} Ton</strong></span>
                    {deliveryStaffList.length > 0 && (
                      <>
                        <span>•</span>
                        <span>Personel: <strong className="text-slate-800">{deliveryStaffList.join(', ')}</strong></span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={() => setPrintDayGroup(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-rose-100 hover:text-rose-700 text-slate-700 text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs"
                  title="Pencereyi Kapat (ESC)"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Kapat (ESC)</span>
                </button>
              </div>
            </div>

            {/* Modal Body / Printable Content (Yalnızca içerik kayar, başlık ve butonlar asla kaybolmaz) */}
            <div 
              className="report-modal-body flex-1 min-h-0 overflow-y-auto overflow-x-auto p-3.5 sm:p-6 pb-14 space-y-4 text-xs text-slate-800 bg-white" 
              id="printableDeliveryReport"
              style={{ overscrollBehavior: 'contain' }}
            >
              {/* Official Institutional Header */}
              <div className="p-3 sm:p-4 rounded-2xl bg-white border border-slate-300 text-center space-y-1 shadow-2xs">
                <div className="flex items-center justify-between pb-3 border-b-2 border-slate-900 gap-2">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 flex items-center justify-center p-1 bg-white rounded-full border border-slate-200">
                    <img
                      src="/edirne-sydv-logo.png"
                      alt="Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı"
                      width={48}
                      height={48}
                      className="print-logo-img"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div className="text-center flex-1 px-1 sm:px-3 min-w-0">
                    <p className="text-[10px] sm:text-[11px] font-black uppercase text-slate-800 tracking-wider">
                      T.C. EDİRNE VALİLİĞİ
                    </p>
                    <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase">
                      EDİRNE SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI
                    </h2>
                    <h3 className="text-[11px] sm:text-xs font-bold text-amber-800 uppercase mt-0.5">
                      KÖMÜR YARDIMI GÜNLÜK DAĞITIM VE TESLİMAT TUTANAĞI
                    </h3>
                  </div>
                  <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 flex flex-col items-center justify-center border-2 border-slate-400 rounded-lg text-[7px] sm:text-[8px] font-black text-slate-700 leading-tight">
                    <span>RESMİ</span>
                    <span>TUTANAK</span>
                  </div>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-600 pt-1">
                  Bu tutanak, <strong>{formatTrDate(printDayGroup.gun_tarihi)}</strong> tarihinde Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı bünyesinde görevli dağıtım personelleri ({deliveryStaffList.join(', ')}) tarafından hak sahibi hanelere teslim edilen kömür kayıtlarını içerir.
                </p>
              </div>

              {/* Table of households */}
              <div className="overflow-x-auto rounded-xl sm:rounded-2xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse table-auto">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200">
                      <th className="py-2 px-2 text-center w-8">#</th>
                      <th className="py-2 px-2 w-28">TC Kimlik</th>
                      <th className="py-2 px-2 w-36">Adı Soyadı</th>
                      <th className="py-2 px-2">Mahalle / Açık Adres</th>
                      <th className="py-2 px-2 text-center w-14">Torba</th>
                      <th className="py-2 px-2 w-32">Teslim Alan</th>
                      <th className="py-2 px-2 text-center w-16">Saat</th>
                      <th className="py-2 px-2 text-center w-20">İmza / Teyit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {printDayGroup.items.map((item: any, idx: number) => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="py-2 px-2 text-center font-bold text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-2 font-mono font-bold text-slate-800 truncate">{item.tc_no}</td>
                        <td className="py-2 px-2 font-bold text-slate-900 break-words">{item.ad_soyad}</td>
                        <td className="py-2 px-2 text-slate-600 break-words" title={item.acik_adres}>
                          <span className="font-semibold text-slate-800 block">{item.mahalle}</span>
                          {item.acik_adres && <span className="block text-[11px] text-slate-500 line-clamp-2">{item.acik_adres}</span>}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className="font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded text-[11px]">
                            {item.torba_sayisi}
                          </span>
                        </td>
                        <td className="py-2 px-2 font-medium text-slate-700 break-words">{item.teslim_alan || item.ad_soyad}</td>
                        <td className="py-2 px-2 font-mono text-[11px] text-slate-500 text-center">{item.tarih ? item.tarih.split(' ')[1] || item.tarih : '-'}</td>
                        <td className="py-2 px-2 text-center">
                          <div className="w-14 h-5 border-b border-dashed border-slate-400 mx-auto"></div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Sign-off area: Dağıtımda görev alan tüm personel ve Vakıf Müdürü / Onay alanı */}
              <div className="pt-4 border-t border-slate-200 print-signatures-container">
                <div className="text-center mb-2.5">
                  <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500">
                    RESMİ TUTANAK VE İMZA ONAY ALANI
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 print-signatures">
                  {deliveryStaffList.map((staffName, idx) => (
                    <div
                      key={`staff-${idx}-${staffName}`}
                      className="p-3 sm:p-3.5 rounded-xl bg-slate-50 border border-slate-300 flex flex-col justify-between text-center min-h-[110px] shadow-2xs"
                    >
                      <div>
                        <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                          Dağıtımı Yapan Personel
                        </span>
                        <p className="text-xs sm:text-sm font-black text-slate-900 mt-1.5 break-words">
                          {staffName}
                        </p>
                      </div>
                      <div className="mt-4 pt-2.5 border-t border-dashed border-slate-300">
                        <span className="text-[10px] sm:text-[11px] text-slate-400 font-bold italic">İmza</span>
                      </div>
                    </div>
                  ))}

                  {/* Vakıf Müdürü / Onay */}
                  <div className="p-3 sm:p-3.5 rounded-xl bg-slate-50 border border-slate-300 flex flex-col justify-between text-center min-h-[110px] shadow-2xs">
                    <div>
                      <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Vakıf Müdürü / Onay
                      </span>
                      <p className="text-xs sm:text-sm font-black text-slate-900 mt-1.5 break-words">
                        Edirne SYDV Başkanlığı
                      </p>
                    </div>
                    <div className="mt-4 pt-2.5 border-t border-dashed border-slate-300">
                      <span className="text-[10px] sm:text-[11px] text-slate-400 font-bold italic">İmza / Mühür</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer: Daima alt kısımda sabit kalır */}
            <div className="report-modal-footer shrink-0 h-14 sm:h-16 px-4 sm:px-6 border-t border-slate-200 bg-slate-100 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 no-print z-20 shadow-sm">
              <a
                href={`/api/export?type=daily_deliveries&date=${printDayGroup.gun_tarihi}`}
                download={`Edirne_SYDV_Teslimat_Listesi_${printDayGroup.gun_tarihi}.xlsx`}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Excel Olarak İndir</span>
                <span className="sm:hidden">Excel</span>
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPrintDayGroup(null)}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold transition-all active:scale-95 shadow-2xs"
                >
                  Kapat (ESC)
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                  title="Yazıcıdan çıktı al veya PDF olarak kaydet"
                >
                  <Printer className="w-4 h-4" />
                  <span>Yazdır / PDF Kaydet</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
