'use client';

import { useState, useEffect } from 'react';
import { 
  BarChart3, Calendar, Printer, Download, Filter, AlertTriangle, 
  CheckCircle2, Clock, Truck, Target, TrendingUp, Users, MapPin, RefreshCw, ChevronRight 
} from 'lucide-react';

interface AnalyticsPageProps {
  onRefreshAll?: () => void;
  userRole?: 'ADMIN' | 'PERSONEL';
  onOpenQuotaModal?: () => void;
}

export default function AnalyticsPage({
  onRefreshAll,
  userRole,
  onOpenQuotaModal
}: AnalyticsPageProps) {
  // Date filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMahalle, setSelectedMahalle] = useState('HEPSI');
  const [activePreset, setActivePreset] = useState('ALL');

  // Report data state
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (selectedMahalle) params.set('mahalle', selectedMahalle);

      const res = await fetch(`/api/reports?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setReportData(data.reportData);
      }
    } catch (err) {
      console.error('Error fetching report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate, selectedMahalle]);

  // Quick Date Presets
  const applyPreset = (preset: string) => {
    setActivePreset(preset);
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    if (preset === 'TODAY') {
      const d = formatDate(today);
      setStartDate(d);
      setEndDate(d);
    } else if (preset === 'YESTERDAY') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const d = formatDate(yesterday);
      setStartDate(d);
      setEndDate(d);
    } else if (preset === 'WEEK') {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      setStartDate(formatDate(weekAgo));
      setEndDate(formatDate(today));
    } else if (preset === 'MONTH') {
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);
      setStartDate(formatDate(monthAgo));
      setEndDate(formatDate(today));
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const summary = reportData?.summary;
  const donemStats = reportData?.donemStats;
  const eksikHaneler = reportData?.eksikHaneler || [];
  const mahalleStats = reportData?.mahalleStats || [];
  const dailyBreakdown = reportData?.dailyBreakdown || [];

  return (
    <div className="space-y-6">
      {/* Action / Print Header (Hidden during print) */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-600" />
            İstatistiki Bilgiler & PDF Raporlama
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Kömür dağıtım performansı, eksik kalan haneler ve tonaj analizleri
          </p>
        </div>

        <button
          onClick={handlePrint}
          className="btn-primary text-xs py-2.5 px-3.5 shadow-md shadow-amber-500/20 bg-gradient-to-r from-amber-500 to-orange-600 flex items-center gap-2 font-bold"
        >
          <Printer className="w-4 h-4 text-white" />
          <span>Resmi PDF Raporu Yazdır</span>
        </button>
      </div>

      {/* Date Range & Filter Panel - Light Mode (Hidden during print) */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3 no-print">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
            <Calendar className="w-4 h-4 text-amber-600" />
            Tarih Aralığı ve Filtreleme
          </span>

          {userRole === 'ADMIN' && onOpenQuotaModal && (
            <button
              onClick={onOpenQuotaModal}
              className="text-xs text-amber-800 hover:text-amber-900 font-bold underline flex items-center gap-1"
            >
              <Target className="w-3.5 h-3.5 text-amber-600" />
              <span>Hane Kotasını Değiştir ({reportData?.varsayilanHedefTorba || 34} Torba)</span>
            </button>
          )}
        </div>

        {/* Quick Date Presets */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'ALL', label: 'Tüm Zamanlar' },
            { id: 'TODAY', label: 'Bugün' },
            { id: 'YESTERDAY', label: 'Dün' },
            { id: 'WEEK', label: 'Son 7 Gün' },
            { id: 'MONTH', label: 'Son 30 Gün' }
          ].map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                activePreset === preset.id
                  ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Date Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Başlangıç Tarihi
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setActivePreset('CUSTOM');
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-amber-500 focus:bg-white font-medium"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Bitiş Tarihi
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setActivePreset('CUSTOM');
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-amber-500 focus:bg-white font-medium"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Mahalle Seçimi
            </label>
            <select
              value={selectedMahalle}
              onChange={(e) => setSelectedMahalle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
            >
              <option value="HEPSI">Tüm Mahalleler</option>
              {mahalleStats.map((m: any) => (
                <option key={m.mahalle} value={m.mahalle}>
                  {m.mahalle} ({m.toplamHane} Hane)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* PRINT OFFICIAL REPORT HEADER - Light Mode */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4 print-only-header">
        <div className="text-center pb-3 border-b border-slate-200">
          <h1 className="text-lg font-black tracking-wider text-slate-900 uppercase">
            T.C. KÖMÜR DAĞITIM VE YARDIM HİZMETLERİ
          </h1>
          <h2 className="text-sm font-extrabold text-amber-700 uppercase mt-0.5">
            RESMİ DAĞITIM, TONAJ VE EKSİK HANE DENETİM RAPORU
          </h2>
          <div className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-3 font-medium">
            <span>Rapor Tarih Aralığı: <strong className="text-slate-800">{startDate || 'Başlangıç'} - {endDate || 'Bugün'}</strong></span>
            <span>•</span>
            <span>Mahalle: <strong className="text-slate-800">{selectedMahalle === 'HEPSI' ? 'Tüm Mahalleler' : selectedMahalle}</strong></span>
          </div>
        </div>

        {/* Top KPI Metrics Grid - Light Mode */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="stat-card">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Hane Başı Kota</span>
            <div className="text-2xl font-black text-amber-700 mt-0.5">
              {reportData?.varsayilanHedefTorba || 34} <span className="text-xs font-normal text-slate-500">Torba</span>
            </div>
            <span className="text-[10px] text-slate-500">≈ {((reportData?.varsayilanHedefTorba || 34) * 0.025).toFixed(2)} Ton / Hane</span>
          </div>

          <div className="stat-card">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Toplam Hedef Kömür</span>
            <div className="text-2xl font-black text-slate-900 mt-0.5">
              {summary?.hedefTonaj || 0} <span className="text-xs font-normal text-slate-500">Ton</span>
            </div>
            <span className="text-[10px] text-slate-500">{summary?.hedefTorba || 0} Torba ({summary?.toplamHane || 0} Hane)</span>
          </div>

          <div className="stat-card">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Dağıtılan Miktar</span>
            <div className="text-2xl font-black text-emerald-600 mt-0.5">
              {summary?.dagitilanTonaj || 0} <span className="text-xs font-normal text-slate-500">Ton</span>
            </div>
            <span className="text-[10px] text-emerald-800 font-bold">{summary?.dagitilanTorba || 0} Torba (%{summary?.tamamlamaYuzdesi || 0})</span>
          </div>

          <div className="stat-card">
            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Kalan Eksik Kömür</span>
            <div className="text-2xl font-black text-rose-600 mt-0.5">
              {summary?.eksikTonaj || 0} <span className="text-xs font-normal text-slate-500">Ton</span>
            </div>
            <span className="text-[10px] text-rose-800 font-bold">{summary?.eksikTorba || 0} Torba Eksik</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 font-bold">Genel Dağıtım Tamamlanma Oranı:</span>
            <span className="font-extrabold text-amber-700">%{summary?.tamamlamaYuzdesi || 0} Tamamlandı</span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden border border-slate-200 p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${Math.min(100, summary?.tamamlamaYuzdesi || 0)}%` }}
            />
          </div>
        </div>

        {/* Hane Durumları Kırılımı */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-center">
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-[10px] font-bold text-emerald-800 uppercase block">Tam Teslimat Yapılan</span>
            <div className="text-lg font-black text-emerald-700 mt-0.5">{summary?.tamHane || 0} Hane</div>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
            <span className="text-[10px] font-bold text-amber-800 uppercase block">Yarım / Eksik Kalan</span>
            <div className="text-lg font-black text-amber-700 mt-0.5">{summary?.eksikHane || 0} Hane</div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-600 uppercase block">Hiç Almayan (Bekleyen)</span>
            <div className="text-lg font-black text-slate-800 mt-0.5">{summary?.bekleyenHane || 0} Hane</div>
          </div>
        </div>
      </div>

      {/* SECTION 1: EKSİK KÖMÜR ALAN HANELER LİSTESİ */}
      <div className="p-5 rounded-2xl bg-white border border-amber-300 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                Eksik / Yarım Kömür Alan Haneler ({eksikHaneler.length} Hane)
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Hedef kotası tamamlanmamış, öncelikli dağıtılacak haneler
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-rose-800 bg-rose-100 px-2.5 py-1 rounded-xl border border-rose-200">
            Toplam {eksikHaneler.reduce((acc: number, curr: any) => acc + (curr.eksik_torba || 0), 0)} Torba Eksik
          </span>
        </div>

        {eksikHaneler.length === 0 ? (
          <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-500 text-xs font-medium">
            Tebrikler! Şu anda yarım kalmış veya eksik kömür alan bir hane bulunmuyor.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 text-[11px] uppercase bg-slate-50">
                  <th className="py-2.5 px-3">TC Kimlik</th>
                  <th className="py-2.5 px-3">Ad Soyad</th>
                  <th className="py-2.5 px-3">Mahalle & Adres</th>
                  <th className="py-2.5 px-3 text-center">Verilen</th>
                  <th className="py-2.5 px-3 text-center">Hedef</th>
                  <th className="py-2.5 px-3 text-center text-rose-700 font-bold">Kalan Eksik</th>
                  <th className="py-2.5 px-3">Teslimat Notu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {eksikHaneler.map((h: any) => (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-amber-800">{h.tc_no}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{h.ad_soyad}</td>
                    <td className="py-2.5 px-3 max-w-[200px] truncate">
                      <strong className="text-slate-900">{h.mahalle}</strong> - {h.acik_adres}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold">{h.torba_sayisi} Torba</td>
                    <td className="py-2.5 px-3 text-center text-slate-500">{h.hedef_torba} Torba</td>
                    <td className="py-2.5 px-3 text-center font-black text-rose-700 bg-rose-50">
                      {h.eksik_torba} Torba
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-500 italic">
                      {h.teslimat_notu || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 2: MAHALLE BAZLI İLERLEME TABLOSU */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-amber-600" />
          Mahalle Bazlı Dağıtım ve Tamamlanma Durumu
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600 text-[11px] uppercase bg-slate-50">
                <th className="py-2.5 px-3">Mahalle Adı</th>
                <th className="py-2.5 px-3 text-center">Toplam Hane</th>
                <th className="py-2.5 px-3 text-center text-emerald-800 font-bold">Tamamlanan</th>
                <th className="py-2.5 px-3 text-center text-amber-800 font-bold">Eksik Kalan</th>
                <th className="py-2.5 px-3 text-center">Bekleyen</th>
                <th className="py-2.5 px-3 text-right">Dağıtılan (Ton)</th>
                <th className="py-2.5 px-3 text-right">İlerleme %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {mahalleStats.map((m: any) => (
                <tr key={m.mahalle} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-bold text-slate-900">{m.mahalle}</td>
                  <td className="py-2.5 px-3 text-center font-semibold">{m.toplamHane}</td>
                  <td className="py-2.5 px-3 text-center text-emerald-700 font-extrabold">{m.tamHane}</td>
                  <td className="py-2.5 px-3 text-center text-amber-800 font-bold">
                    {m.eksikHane > 0 ? `${m.eksikHane} Hane` : '-'}
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-500">{m.bekleyenHane}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                    {m.dagitilanTonaj} / {m.hedefTonaj}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.min(100, m.yuzde)}%` }}
                        />
                      </div>
                      <span className="font-extrabold text-amber-800 font-mono text-[11px]">
                        %{m.yuzde}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3: SEÇİLEN TARİH ARALIĞINDAKİ GÜNLÜK HAREKETLER & TIRLAR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Daily timeline */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            Tarih Aralığında Günlük Dağıtım
          </h4>
          {dailyBreakdown.length === 0 ? (
            <p className="text-xs text-slate-500">Seçilen aralıkta dağıtım bulunamadı.</p>
          ) : (
            <div className="space-y-1.5">
              {dailyBreakdown.map((d: any) => (
                <div key={d.gun} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">{d.gun}</span>
                  <div className="text-right">
                    <span className="text-emerald-700 font-extrabold">{d.torba} Torba</span>
                    <span className="text-slate-500 ml-1">({(d.torba * 0.025).toFixed(2)} Ton)</span>
                    <span className="text-[11px] text-slate-500 block">• {d.teslimat} Hane Teslimatı</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trucks in date range */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-sky-600" />
            Tarih Aralığında Gelen Tırlar
          </h4>
          {donemStats?.toplamTirSayisi === 0 ? (
            <p className="text-xs text-slate-500">Seçilen aralıkta tır girişi bulunamadı.</p>
          ) : (
            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                <span>Gelen Tır Sayısı: <strong className="text-slate-900">{donemStats?.toplamTirSayisi} Adet</strong></span>
                <span>Toplam Net Kömür: <strong className="text-amber-800 font-bold">{donemStats?.gelenNetTonaj} Ton</strong></span>
              </div>
              <p className="text-[11px] text-slate-600 font-medium italic">
                Depo / Saha Kalan Güncel Stok: <strong className="text-sky-700">{summary?.kalanStokTonaj} Ton</strong>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* PRINT OFFICIAL SIGNATURES BLOCK */}
      <div className="p-6 rounded-2xl bg-white border border-slate-300 space-y-6 print-signatures shadow-sm">
        <h4 className="text-xs font-bold text-center uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-2">
          RESMİ TUTANAK VE İMZA ONAY ALANI
        </h4>

        <div className="grid grid-cols-3 gap-6 text-center text-xs text-slate-700 pt-4">
          <div className="space-y-8">
            <p className="font-bold text-slate-900">Dağıtım Sorumlusu Personel</p>
            <div className="h-10 border-b border-dashed border-slate-300"></div>
            <p className="text-[11px] text-slate-500">İmza / Tarih</p>
          </div>

          <div className="space-y-8">
            <p className="font-bold text-slate-900">Kontrol Eden Saha Yetkilisi</p>
            <div className="h-10 border-b border-dashed border-slate-300"></div>
            <p className="text-[11px] text-slate-500">İmza / Mühür</p>
          </div>

          <div className="space-y-8">
            <p className="font-bold text-slate-900">Komisyon Başkanı / Onay</p>
            <div className="h-10 border-b border-dashed border-slate-300"></div>
            <p className="text-[11px] text-slate-500">İmza / Kaşe</p>
          </div>
        </div>
      </div>
    </div>
  );
}
