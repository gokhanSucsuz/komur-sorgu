'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  BarChart3, Calendar, Printer, Filter, AlertTriangle, 
  CheckCircle2, Clock, Truck, Target, TrendingUp, Users, MapPin, 
  Search, Navigation, Building2, Trees, FileSpreadsheet, PackageCheck, 
  Layers, ArrowUpDown, ChevronDown, Archive, X, FileText, Download
} from 'lucide-react';
import { formatTonnage } from '@/lib/normalizer';

interface AnalyticsPageProps {
  onRefreshAll?: () => void;
  userRole?: 'ADMIN' | 'PERSONEL';
  onOpenQuotaModal?: () => void;
  onOpenSeasonModal?: () => void;
}

export default function AnalyticsPage({
  onRefreshAll,
  userRole,
  onOpenQuotaModal,
  onOpenSeasonModal
}: AnalyticsPageProps) {
  // Navigation Subtab State
  const [subTab, setSubTab] = useState<'OVERVIEW' | 'MAHALLE' | 'SOKAK' | 'BATCHES'>('OVERVIEW');
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Date filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMahalle, setSelectedMahalle] = useState('HEPSI');
  const [activePreset, setActivePreset] = useState('ALL');

  // Search & Filter states for sub-views
  const [mahalleSearch, setMahalleSearch] = useState('');
  const [mahalleFilterTip, setMahalleFilterTip] = useState<'HEPSI' | 'MAHALLE' | 'KOY'>('HEPSI');
  const [sokakSearch, setSokakSearch] = useState('');
  const [selectedSokakMahalle, setSelectedSokakMahalle] = useState('HEPSI');
  const [batchSearch, setBatchSearch] = useState('');

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
    setShowPrintModal(true);
  };

  // ESC key listener to close report modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showPrintModal) {
        setShowPrintModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPrintModal]);

  const summary = reportData?.summary;
  const donemStats = reportData?.donemStats;
  const eksikHaneler = reportData?.eksikHaneler || [];
  const mahalleStats: any[] = reportData?.mahalleStats || [];
  const sokakStats: any[] = reportData?.sokakStats || [];
  const batchStats: any[] = reportData?.batchStats || [];
  const dailyBreakdown = reportData?.dailyBreakdown || [];

  // Filtered Mahalle Stats
  const filteredMahalleStats = useMemo(() => {
    return mahalleStats.filter((m) => {
      const matchSearch = (m.mahalle || '').toLocaleLowerCase('tr').includes(mahalleSearch.toLocaleLowerCase('tr'));
      const matchTip = mahalleFilterTip === 'HEPSI' || m.tip === mahalleFilterTip;
      return matchSearch && matchTip;
    });
  }, [mahalleStats, mahalleSearch, mahalleFilterTip]);

  // Gruplanmış Mahalleler ve Köyler Listeleri
  const mahallelerList = useMemo(() => {
    return filteredMahalleStats.filter((m) => m.tip !== 'KOY');
  }, [filteredMahalleStats]);

  const koylerList = useMemo(() => {
    return filteredMahalleStats.filter((m) => m.tip === 'KOY');
  }, [filteredMahalleStats]);

  const printMahalleler = useMemo(() => {
    return mahalleStats.filter((m) => m.tip !== 'KOY');
  }, [mahalleStats]);

  const printKoyler = useMemo(() => {
    return mahalleStats.filter((m) => m.tip === 'KOY');
  }, [mahalleStats]);

  // Filtered Sokak Stats (guarantee clean, human-readable street names)
  const filteredSokakStats = useMemo(() => {
    return sokakStats.map((s) => {
      const cleanSokak = s.sokak && !s.sokak.startsWith('ENC:GCM:v1:') && !s.sokak.startsWith('ENC:')
        ? s.sokak
        : 'Sokak / Mevkii Belirtilmemiş';
      return { ...s, sokak: cleanSokak };
    }).filter((s) => {
      const matchSearch = (s.sokak || '').toLocaleLowerCase('tr').includes(sokakSearch.toLocaleLowerCase('tr')) ||
        (s.mahalle || '').toLocaleLowerCase('tr').includes(sokakSearch.toLocaleLowerCase('tr'));
      const matchMahalle = selectedSokakMahalle === 'HEPSI' || s.mahalle === selectedSokakMahalle;
      return matchSearch && matchMahalle;
    });
  }, [sokakStats, sokakSearch, selectedSokakMahalle]);

  // Filtered Batches
  const filteredBatchStats = useMemo(() => {
    return batchStats.filter((b) => {
      if (!batchSearch) return true;
      const search = batchSearch.toLocaleLowerCase('tr');
      const matchName = (b.dosyaAdi || '').toLocaleLowerCase('tr').includes(search);
      const matchMahalle = (b.mahalleler || []).some((m: any) =>
        (m.mahalle || '').toLocaleLowerCase('tr').includes(search)
      );
      return matchName || matchMahalle;
    });
  }, [batchStats, batchSearch]);

  // Extract distinct mahalle names for dropdowns
  const distinctMahalleNames = useMemo(() => {
    return Array.from(new Set(mahalleStats.map((m) => m.mahalle))).sort((a, b) =>
      a.localeCompare(b, 'tr')
    );
  }, [mahalleStats]);

  // Aggregate stats across all mahalles
  const totalMahalleKayit = mahalleStats.reduce((acc, m) => acc + (m.toplamKayit || 0), 0);
  const totalMahalleTeslim = mahalleStats.reduce((acc, m) => acc + (m.teslimEdilen || 0), 0);
  const totalMahalleKalan = mahalleStats.reduce((acc, m) => acc + (m.teslimEdilmeyen || 0), 0);
  const totalMahalleEksik = mahalleStats.reduce((acc, m) => acc + (m.eksikHane || 0), 0);

  const renderMahalleGroupTable = (list: any[], title: string, type: 'MAHALLE' | 'KOY') => {
    if (list.length === 0) {
      return (
        <div className="p-5 rounded-2xl bg-white border border-slate-200 text-center text-slate-500 text-xs font-semibold">
          {type === 'MAHALLE' ? 'Eşleşen şehir mahallesi bulunamadı.' : 'Eşleşen köy kaydı bulunamadı.'}
        </div>
      );
    }

    const groupKayit = list.reduce((acc, m) => acc + (m.toplamKayit || 0), 0);
    const groupTeslim = list.reduce((acc, m) => acc + (m.teslimEdilen || 0), 0);
    const groupKalan = list.reduce((acc, m) => acc + (m.teslimEdilmeyen || 0), 0);
    const groupEksik = list.reduce((acc, m) => acc + (m.eksikHane || 0), 0);
    const groupTorba = list.reduce((acc, m) => acc + (m.dagitilanTorba || 0), 0);
    const groupTon = list.reduce((acc, m) => acc + (m.dagitilanTonaj || 0), 0);
    const groupPct = groupKayit > 0 ? ((groupTeslim / groupKayit) * 100).toFixed(1) : '0';
    const isKoy = type === 'KOY';

    return (
      <div className={`p-4 sm:p-5 rounded-2xl bg-white border ${isKoy ? 'border-emerald-300 shadow-sm' : 'border-sky-300 shadow-sm'} space-y-3`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isKoy ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>
              {isKoy ? <Trees className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${isKoy ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-sky-100 text-sky-800 border border-sky-200'}`}>
                  {list.length} Yerleşim
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                {isKoy ? 'Köy yerleşim yerleri dağıtım ve teslimat durumları' : 'Merkez ve şehir mahalleleri dağıtım durumları'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold">
              Kayıt: <strong className="text-slate-900">{groupKayit}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold">
              Teslim: <strong className="text-emerald-900">{groupTeslim}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold">
              Dağıtılan: <strong className="text-amber-950">{groupTorba} Torba ({groupTon.toFixed(1)} T)</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-sky-100 text-sky-800 font-black">
              %{groupPct} Başarı
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="desktop-compact-table w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                <th className="py-2.5 px-3 text-center w-12">#</th>
                <th className="py-2.5 px-3 text-left">Yerleşim Adı</th>
                <th className="py-2.5 px-3 text-center">Toplam Hane</th>
                <th className="py-2.5 px-3 text-center text-emerald-800">Tam Teslim</th>
                <th className="py-2.5 px-3 text-center text-amber-800">Eksik Hane</th>
                <th className="py-2.5 px-3 text-center text-slate-600">Bekleyen</th>
                <th className="py-2.5 px-3 text-center">Dağıtılan (Torba / Ton)</th>
                <th className="py-2.5 px-3 text-right">Tamamlanma</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {list.map((m: any, idx: number) => {
                const pct = m.toplamKayit > 0 ? Math.round((m.teslimEdilen / m.toplamKayit) * 100) : 0;
                return (
                  <tr key={`${m.mahalle}_${idx}`} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                      {isKoy ? <Trees className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Building2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                      <span>{m.mahalle}</span>
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-slate-900">{m.toplamKayit}</td>
                    <td className="py-2 px-3 text-center font-black text-emerald-700 bg-emerald-50/40">{m.teslimEdilen}</td>
                    <td className="py-2 px-3 text-center font-bold text-amber-700 bg-amber-50/40">{m.eksikHane || 0}</td>
                    <td className="py-2 px-3 text-center font-medium text-slate-500">{m.teslimEdilmeyen || 0}</td>
                    <td className="py-2 px-3 text-center font-bold text-slate-800">
                      {m.dagitilanTorba || 0} Torba <span className="text-[10px] text-slate-500 font-normal">({(m.dagitilanTonaj || 0).toFixed(1)} T)</span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-14 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                          <div
                            className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-slate-400'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-[11px] text-slate-700 w-8 text-right">%{pct}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/90 font-black text-slate-900 border-t border-slate-300 text-[11px]">
                <td className="py-2.5 px-3 text-center font-extrabold" colSpan={2}>
                  {title} Toplamı ({list.length})
                </td>
                <td className="py-2.5 px-3 text-center">{groupKayit}</td>
                <td className="py-2.5 px-3 text-center text-emerald-800">{groupTeslim}</td>
                <td className="py-2.5 px-3 text-center text-amber-800">{groupEksik}</td>
                <td className="py-2.5 px-3 text-center text-slate-600">{groupKalan}</td>
                <td className="py-2.5 px-3 text-center">
                  {groupTorba} Torba ({groupTon.toFixed(1)} Ton)
                </td>
                <td className="py-2.5 px-3 text-right text-emerald-800 font-mono">
                  %{groupPct}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Action / Print Header (Hidden during print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-600" />
            İstatistiki Bilgiler & Kayıt Dökümleri
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Toplam kayıtlar, mahalle/köy ve sokak/cadde dağılımı, ek liste partileri ve teslimat analizleri
          </p>
        </div>

        <div className="w-full sm:w-auto flex flex-wrap sm:flex-nowrap items-center gap-2">
          {onOpenSeasonModal && (
            <button
              type="button"
              onClick={onOpenSeasonModal}
              className="flex-1 sm:flex-initial justify-center px-3.5 py-2.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-bold flex items-center gap-2 transition-all shadow-xs active:scale-95"
              title="Kömür Dağıtım Dönemleri ve Arşivlenmiş Sezon Raporları"
            >
              <Archive className="w-4 h-4 text-blue-700 shrink-0" />
              <span>Dönem & Arşiv Raporları</span>
            </button>
          )}

          <button
            onClick={handlePrint}
            className="flex-1 sm:flex-initial justify-center btn-primary text-xs py-2.5 px-4 shadow-md shadow-amber-500/20 bg-gradient-to-r from-amber-500 to-orange-600 flex items-center gap-2 font-bold active:scale-95"
          >
            <Printer className="w-4 h-4 text-white shrink-0" />
            <span>Resmi PDF Raporu Yazdır</span>
          </button>
        </div>
      </div>

      {/* İSTATİSTİK VE RAPORLAMA ALT SEKMELERİ (MOBİL VE GENİŞ EKRAN) */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200 overflow-x-auto no-print">
        <button
          type="button"
          onClick={() => setSubTab('OVERVIEW')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
            subTab === 'OVERVIEW'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/90 font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-amber-600" />
          <span>Genel Dağıtım & PDF Rapor</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('MAHALLE')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
            subTab === 'MAHALLE'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/90 font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4 text-amber-600" />
          <span>Mahalle & Köy Dağılımı ({mahalleStats.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('SOKAK')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
            subTab === 'SOKAK'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/90 font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Navigation className="w-4 h-4 text-sky-600" />
          <span>Sokak & Cadde Dökümü ({sokakStats.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('BATCHES')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
            subTab === 'BATCHES'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/90 font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Yüklenen Ek Listeler ({batchStats.length})</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* 1. SEKME: GENEL DAĞITIM & RESMİ PDF RAPOR (MEVCUT RAPOR) */}
      {/* ======================================================== */}
      {subTab === 'OVERVIEW' && (
        <div className="space-y-6">
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
                  Mahalle Filtresi
                </label>
                <select
                  value={selectedMahalle}
                  onChange={(e) => setSelectedMahalle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-amber-500 focus:bg-white font-medium"
                >
                  <option value="HEPSI">Tüm Mahalle & Köyler</option>
                  {distinctMahalleNames.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* KPI CARDS (Dönem İcmali) */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Genel Dağıtım ve Tonaj İcmali
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 font-bold uppercase block">Toplam Hak Sahibi</span>
                <div className="text-xl font-black text-slate-900 mt-1">{summary?.toplamHane || 0} Kişi</div>
                <span className="text-[10px] text-slate-400 font-medium">Hedef: {summary?.hedefTorba || 0} Torba</span>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-[11px] text-emerald-800 font-bold uppercase block">Dağıtılan Kömür</span>
                <div className="text-xl font-black text-emerald-700 mt-1">{summary?.dagitilanTonaj || 0} Ton</div>
                <span className="text-[10px] text-emerald-800 font-bold">{summary?.dagitilanTorba || 0} Torba Teslim</span>
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <span className="text-[11px] text-amber-800 font-bold uppercase block">Kalan Kömür İhtiyacı</span>
                <div className="text-xl font-black text-amber-700 mt-1">{summary?.eksikTonaj || 0} Ton</div>
                <span className="text-[10px] text-amber-800 font-bold">{summary?.eksikTorba || 0} Torba Bekliyor</span>
              </div>

              <div className="p-3 rounded-xl bg-sky-50 border border-sky-200">
                <span className="text-[11px] text-sky-800 font-bold uppercase block">Tamamlanma Oranı</span>
                <div className="text-xl font-black text-sky-700 mt-1">%{summary?.tamamlamaYuzdesi || 0}</div>
                <span className="text-[10px] text-sky-700 font-bold">{summary?.tamHane || 0} Hane Tamamlandı</span>
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

          {/* EKSİK KÖMÜR ALAN HANELER LİSTESİ */}
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

          {/* GÜNLÜK HAREKETLER & TIRLAR */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        <span className="font-bold text-emerald-700">{d.torba} Torba</span>
                        <span className="text-[11px] text-slate-500 block">({d.teslimat} Teslimat)</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

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
                    <span>Toplam Net Kömür: <strong className="text-amber-800 font-bold">{formatTonnage(donemStats?.gelenNetTonaj).combined}</strong></span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-medium italic">
                    Depo / Saha Kalan Güncel Stok: <strong className="text-sky-700">{formatTonnage(summary?.kalanStokTonaj).combined}</strong>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-2xl mx-auto text-center text-xs text-slate-700 pt-4">
              <div className="space-y-8">
                <p className="font-bold text-slate-900">Dağıtım Sorumlusu Personel</p>
                <div className="h-10 border-b border-dashed border-slate-300"></div>
                <p className="text-[11px] text-slate-500">İmza / Tarih</p>
              </div>

              <div className="space-y-8">
                <p className="font-bold text-slate-900">Vakıf Müdürü / Onay</p>
                <div className="h-10 border-b border-dashed border-slate-300"></div>
                <p className="text-[11px] text-slate-500 font-semibold">Edirne SYDV Başkanlığı</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. SEKME: MAHALLE & KÖY BAZLI DETAYLI DAĞITIM VE KAYITLAR */}
      {/* ======================================================== */}
      {subTab === 'MAHALLE' && (
        <div className="space-y-4">
          {/* Top Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-500 font-bold uppercase block">Kayıtlı Mahalle / Köy</span>
              <div className="text-xl font-black text-slate-900 mt-1">{mahalleStats.length} Bölge</div>
              <span className="text-[10px] text-slate-400 font-medium">Toplam {totalMahalleKayit} Hak Sahibi</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-2xs">
              <span className="text-[11px] text-emerald-800 font-bold uppercase block">Teslimat Yapılan</span>
              <div className="text-xl font-black text-emerald-700 mt-1">{totalMahalleTeslim} Kişi</div>
              <span className="text-[10px] text-emerald-800 font-bold">Kömürünü Teslim Alanlar</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 shadow-2xs">
              <span className="text-[11px] text-amber-800 font-bold uppercase block">Teslimat Yapılmayan</span>
              <div className="text-xl font-black text-amber-700 mt-1">{totalMahalleKalan} Kişi</div>
              <span className="text-[10px] text-amber-800 font-bold">Dağıtım Bekleyen / Kalan</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 shadow-2xs">
              <span className="text-[11px] text-sky-800 font-bold uppercase block">Genel Başarı Oranı</span>
              <div className="text-xl font-black text-sky-700 mt-1">
                %{totalMahalleKayit > 0 ? ((totalMahalleTeslim / totalMahalleKayit) * 100).toFixed(1) : 0}
              </div>
              <span className="text-[10px] text-sky-700 font-bold">{totalMahalleEksik} Eksik Dağıtımlı</span>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="p-3 rounded-2xl bg-white border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={mahalleSearch}
                onChange={(e) => setMahalleSearch(e.target.value)}
                placeholder="Mahalle veya Köy adı ile ara..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
              />
              {mahalleSearch && (
                <button
                  onClick={() => setMahalleSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              {(['HEPSI', 'MAHALLE', 'KOY'] as const).map((tip) => (
                <button
                  key={tip}
                  type="button"
                  onClick={() => setMahalleFilterTip(tip)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    mahalleFilterTip === tip
                      ? 'bg-amber-500 text-white shadow-2xs font-black'
                      : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tip === 'HEPSI' ? 'Tümü' : tip === 'MAHALLE' ? 'Sadece Mahalleler' : 'Sadece Köyler'}
                </button>
              ))}
            </div>
          </div>

          {/* Detailed Mahalle & Köy Grouped Tables */}
          {filteredMahalleStats.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 font-medium">
              Aramanızla eşleşen mahalle veya köy kaydı bulunamadı.
            </div>
          ) : (
            <div className="space-y-6">
              {mahalleFilterTip !== 'KOY' && renderMahalleGroupTable(mahallelerList, 'Şehir Mahalleleri Dağılımı', 'MAHALLE')}
              {mahalleFilterTip !== 'MAHALLE' && renderMahalleGroupTable(koylerList, 'Köy Yerleşimleri Dağılımı', 'KOY')}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. SEKME: SOKAK SOKAK & CADDE CADDE KAYIT SAYILARI DÖKÜMÜ */}
      {/* ======================================================== */}
      {subTab === 'SOKAK' && (
        <div className="space-y-4">
          {/* Top Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-500 font-bold uppercase block">Toplam Sokak & Cadde</span>
              <div className="text-xl font-black text-slate-900 mt-1">{sokakStats.length} Cadde / Sokak</div>
              <span className="text-[10px] text-slate-400 font-medium">{filteredSokakStats.length} Sokak Gösteriliyor</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-600 font-bold uppercase block">Sokaklardaki Toplam Hak Sahibi</span>
              <div className="text-xl font-black text-slate-900 mt-1">
                {sokakStats.reduce((acc, s) => acc + (s.toplamKayit || 0), 0)} Kişi
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Cadde ve sokak bazlı döküm</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-2xs">
              <span className="text-[11px] text-emerald-800 font-bold uppercase block">Sokaklarda Teslim Edilen</span>
              <div className="text-xl font-black text-emerald-700 mt-1">
                {sokakStats.reduce((acc, s) => acc + (s.teslimEdilen || 0), 0)} Kişi
              </div>
              <span className="text-[10px] text-emerald-800 font-bold">Kömür Verilen Vatandaşlar</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 shadow-2xs">
              <span className="text-[11px] text-amber-800 font-bold uppercase block">Sokaklarda Dağıtım Bekleyen</span>
              <div className="text-xl font-black text-amber-700 mt-1">
                {sokakStats.reduce((acc, s) => acc + (s.teslimEdilmeyen || 0), 0)} Kişi
              </div>
              <span className="text-[10px] text-amber-800 font-bold">Kalan / Bekleyenler</span>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="p-3 rounded-2xl bg-white border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={sokakSearch}
                onChange={(e) => setSokakSearch(e.target.value)}
                placeholder="Sokak veya cadde adı ara..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
              />
              {sokakSearch && (
                <button
                  onClick={() => setSokakSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Mahalle:</span>
              <select
                value={selectedSokakMahalle}
                onChange={(e) => setSelectedSokakMahalle(e.target.value)}
                className="w-full sm:w-60 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-amber-500"
              >
                <option value="HEPSI">Tüm Mahalleler ({distinctMahalleNames.length})</option>
                {distinctMahalleNames.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Detailed Street Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="desktop-compact-table">
              <thead>
                <tr>
                  <th>Mahalle / Yerleşim</th>
                  <th>Sokak / Cadde / Mevkii</th>
                  <th className="text-center">Toplam Kayıt</th>
                  <th className="text-center text-emerald-800">Teslim Yapılan</th>
                  <th className="text-center text-amber-800">Teslimat Bekleyen</th>
                  <th className="text-center">Eksik Kalan</th>
                  <th className="text-right">Dağıtılan Torba</th>
                  <th className="text-right">Tamamlanma %</th>
                </tr>
              </thead>
              <tbody>
                {filteredSokakStats.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-500 text-xs font-semibold">
                      Aramanızla eşleşen sokak veya cadde kaydı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredSokakStats.map((s: any, idx: number) => (
                    <tr key={`${s.mahalle}_${s.sokak}_${idx}`}>
                      <td className="font-bold text-slate-700">
                        {s.mahalle}
                      </td>
                      <td>
                        <div className="font-extrabold text-sky-950 flex items-center gap-1.5">
                          <Navigation className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          <span>{s.sokak}</span>
                        </div>
                      </td>
                      <td className="text-center font-bold text-slate-900">
                        {s.toplamKayit} Kişi
                      </td>
                      <td className="text-center font-black text-emerald-700 bg-emerald-50/50">
                        {s.teslimEdilen} Kişi
                      </td>
                      <td className="text-center font-black text-amber-800 bg-amber-50/50">
                        {s.teslimEdilmeyen} Kişi
                      </td>
                      <td className="text-center font-bold text-slate-600">
                        {s.eksik > 0 ? (
                          <span className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                            {s.eksik}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="text-right font-mono text-xs font-bold text-emerald-800">
                        {s.dagitilanTorba} Torba
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min(100, s.yuzde || 0)}%` }}
                            />
                          </div>
                          <span className="font-extrabold text-amber-800 font-mono text-xs">
                            %{s.yuzde || 0}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. SEKME: YÜKLENEN EK LİSTELER & DOSYA BAZLI DÖKÜM       */}
      {/* ======================================================== */}
      {subTab === 'BATCHES' && (
        <div className="space-y-4">
          {/* Top Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-500 font-bold uppercase block">Toplam Yüklenen Dosya</span>
              <div className="text-xl font-black text-slate-900 mt-1">{batchStats.length} Dosya / Parti</div>
              <span className="text-[10px] text-slate-400 font-medium">Excel yükleme geçmişi</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-600 font-bold uppercase block">Toplam Aktarılan Kişi</span>
              <div className="text-xl font-black text-slate-900 mt-1">
                {batchStats.reduce((acc, b) => acc + (b.eklenenKisi || 0), 0)} Kişi
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Dosyalar üzerinden yüklenen</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-2xs">
              <span className="text-[11px] text-emerald-800 font-bold uppercase block">Dosyalardan Teslim Edilen</span>
              <div className="text-xl font-black text-emerald-700 mt-1">
                {batchStats.reduce((acc, b) => acc + (b.teslimEdilen || 0), 0)} Kişi
              </div>
              <span className="text-[10px] text-emerald-800 font-bold">Kömür Verilenler</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 shadow-2xs">
              <span className="text-[11px] text-amber-800 font-bold uppercase block">Dosyalardan Bekleyenler</span>
              <div className="text-xl font-black text-amber-700 mt-1">
                {batchStats.reduce((acc, b) => acc + (b.bekleyen || 0), 0)} Kişi
              </div>
              <span className="text-[10px] text-amber-800 font-bold">Dağıtım Sırasını Bekleyen</span>
            </div>
          </div>

          {/* Search Box */}
          <div className="p-3 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
                placeholder="Dosya adı veya mahalle adı ile ara..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
              />
              {batchSearch && (
                <button
                  onClick={() => setBatchSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* List of Batches with Neighborhood Details */}
          {filteredBatchStats.length === 0 ? (
            <div className="p-10 text-center rounded-2xl bg-white border border-slate-200 shadow-xs text-slate-500 text-xs font-semibold">
              Kayıtlı Excel yükleme işlemi bulunamadı.
            </div>
          ) : (
            filteredBatchStats.map((batch: any, index: number) => (
              <div
                key={batch.batchId || index}
                className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3"
              >
                {/* Batch Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-black text-slate-900 truncate">
                        {batch.dosyaAdi}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{batch.yuklemeTarihi}</span>
                        <span>•</span>
                        <span className="font-mono text-slate-700 font-bold">{batch.eklenenKisi} Hak Sahibi</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                    <span className="badge badge-success text-xs font-bold py-1 px-2.5">
                      ✓ {batch.teslimEdilen} Teslim Edildi
                    </span>
                    <span className="badge badge-pending text-xs font-bold py-1 px-2.5">
                      {batch.bekleyen} Bekliyor
                    </span>
                    <span className="font-mono text-xs font-black text-amber-800 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                      %{batch.yuzde || 0}
                    </span>
                  </div>
                </div>

                {/* Mahalle Breakdown Table inside Batch */}
                <div className="overflow-x-auto">
                  <table className="desktop-compact-table">
                    <thead>
                      <tr>
                        <th>Mahalle Adı</th>
                        <th>Liste Türü</th>
                        <th>Sıra No Aralığı (İmza Listesi)</th>
                        <th className="text-center">Kayıt Sayısı</th>
                        <th className="text-center text-emerald-800">Teslim Edilen</th>
                        <th className="text-center text-amber-800">Bekleyen</th>
                        <th className="text-right">Başarı Oranı</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(batch.mahalleler || []).map((m: any, mIdx: number) => (
                        <tr key={`${m.mahalle}_${mIdx}`}>
                          <td className="font-extrabold text-slate-900 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>{m.mahalle}</span>
                          </td>
                          <td>
                            <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded border ${
                              m.ekListeNo === 0
                                ? 'bg-sky-50 text-sky-800 border-sky-200'
                                : 'bg-amber-50 text-amber-900 border-amber-300'
                            }`}>
                              {m.ekListeAdi || (m.ekListeNo === 0 ? 'Ana Liste' : `Ek ${m.ekListeNo}`)}
                            </span>
                          </td>
                          <td className="font-mono text-xs font-bold text-emerald-900">
                            {m.siraAraligi || '-'}
                          </td>
                          <td className="text-center font-bold text-slate-900">
                            {m.toplamKayit} Kişi
                          </td>
                          <td className="text-center font-black text-emerald-700 bg-emerald-50/50">
                            {m.teslimEdilen} Kişi
                          </td>
                          <td className="text-center font-black text-amber-800 bg-amber-50/50">
                            {m.bekleyen} Kişi
                          </td>
                          <td className="text-right font-extrabold text-amber-800 font-mono text-xs">
                            %{m.yuzde || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      {/* ======================================================== */}
      {/* RESMİ KÖMÜR DAĞITIM VE İSTATİSTİKİ İCMAL RAPORU MODALI    */}
      {/* ======================================================== */}
      {showPrintModal && typeof document !== 'undefined' && createPortal(
        <div 
          className="report-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPrintModal(false);
            }
          }}
        >
          {/* Modal Panel: Sabit %92 ekran yüksekliği ve flex düzeni ile tüm içerik scroll edilir */}
          <div className="report-modal-card relative bg-white rounded-2xl sm:rounded-3xl w-full max-w-5xl h-[92vh] max-h-[92vh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden z-10">
            
            {/* Modal Header: Daima üstte sabit kalır */}
            <div className="report-modal-header shrink-0 h-14 sm:h-16 px-4 sm:px-6 border-b border-slate-200 flex items-center justify-between bg-slate-100 z-20 no-print">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <h3 className="text-xs sm:text-sm md:text-base font-black text-slate-900 truncate">
                    Kömür Dağıtım ve İstatistiki İcmal Raporu
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-semibold flex items-center gap-1.5 flex-wrap">
                    <span>Filtre: <strong className="text-slate-800">{activePreset === 'ALL' ? 'Tüm Dağıtım Süreci' : `${startDate || 'Başlangıç'} - ${endDate || 'Bugün'}`}</strong></span>
                    <span>•</span>
                    <span>Bölge: <strong className="text-slate-800">{selectedMahalle === 'HEPSI' ? 'Tüm Mahalleler' : selectedMahalle}</strong></span>
                    <span>•</span>
                    <span>Toplam: <strong className="text-emerald-700">{summary?.toplamHane || 0} Hane</strong></span>
                    <span>•</span>
                    <span><strong className="text-amber-800">{summary?.dagitilanTonaj || 0} Ton Dağıtıldı</strong></span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
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
              id="printableAnalyticsReport"
              style={{ overscrollBehavior: 'contain' }}
            >
              {/* Institutional Official Header */}
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
                    <h4 className="text-xs sm:text-base font-black uppercase text-slate-950 tracking-wide mt-0.5">
                      SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI
                    </h4>
                    <div className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-300">
                      <span className="text-[10px] sm:text-xs font-extrabold text-slate-900">
                        KÖMÜR YARDIMI DAĞITIM VE İSTATİSTİKİ İCMAL RAPORU
                      </span>
                    </div>
                  </div>
                  <div className="w-12 sm:w-14 shrink-0 hidden sm:block text-right">
                    <span className="text-[9px] font-mono text-slate-400 block">KOD: SYDV-IST</span>
                    <span className="text-[9px] font-mono text-slate-400 block mt-0.5">{new Date().toLocaleDateString('tr-TR')}</span>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between text-[11px] text-slate-600 gap-2 font-medium">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>Dönem / Kapsam: <strong className="text-slate-900">{activePreset === 'ALL' ? 'Tüm Dağıtım Süreci' : `${startDate || 'Başlangıç'} - ${endDate || 'Bugün'}`}</strong></span>
                    <span>•</span>
                    <span>Mahalle Kapsamı: <strong className="text-slate-900">{selectedMahalle === 'HEPSI' ? 'Tüm Mahalle ve Köyler' : selectedMahalle}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Rapor Tarihi: <strong className="text-slate-900">{new Date().toLocaleDateString('tr-TR')} {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                  </div>
                </div>
              </div>

              {/* KPI Cards / Tonaj İcmali */}
              <div className="p-4 rounded-2xl bg-white border border-slate-300 shadow-2xs space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Genel Dağıtım ve Tonaj İcmali
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Toplam Hak Sahibi</span>
                    <div className="text-lg font-black text-slate-900 mt-0.5">{summary?.toplamHane || 0} Kişi</div>
                    <span className="text-[10px] text-slate-500 font-medium">Hedef: {summary?.hedefTorba || 0} Torba</span>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-[10px] text-emerald-800 font-bold uppercase block">Dağıtılan Kömür</span>
                    <div className="text-lg font-black text-emerald-700 mt-0.5">{summary?.dagitilanTonaj || 0} Ton</div>
                    <span className="text-[10px] text-emerald-800 font-bold">{summary?.dagitilanTorba || 0} Torba Teslim</span>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <span className="text-[10px] text-amber-800 font-bold uppercase block">Kalan Kömür İhtiyacı</span>
                    <div className="text-lg font-black text-amber-700 mt-0.5">{summary?.eksikTonaj || 0} Ton</div>
                    <span className="text-[10px] text-amber-800 font-bold">{summary?.eksikTorba || 0} Torba Bekliyor</span>
                  </div>
                  <div className="p-3 rounded-xl bg-sky-50 border border-sky-200">
                    <span className="text-[10px] text-sky-800 font-bold uppercase block">Tamamlanma Oranı</span>
                    <div className="text-lg font-black text-sky-700 mt-0.5">%{summary?.tamamlamaYuzdesi || 0}</div>
                    <span className="text-[10px] text-sky-700 font-bold">{summary?.tamHane || 0} Hane Tamamlandı</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-center">
                  <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-[10px] font-bold text-emerald-800 uppercase block">Tam Teslim Yapılan</span>
                    <span className="text-sm font-black text-emerald-700">{summary?.tamHane || 0} Hane</span>
                  </div>
                  <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
                    <span className="text-[10px] font-bold text-amber-800 uppercase block">Eksik / Kısmi Verilen</span>
                    <span className="text-sm font-black text-amber-700">{summary?.eksikHane || 0} Hane</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-600 uppercase block">Bekleyen (Teslim Almayan)</span>
                    <span className="text-sm font-black text-slate-800">{summary?.bekleyenHane || 0} Hane</span>
                  </div>
                </div>
              </div>

              {/* Depo / Stok Durumu (Varsa) */}
              {donemStats && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-300 flex flex-wrap items-center justify-between text-xs gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Depo / Kömür Stok Takibi:</span>
                    <span className="font-bold text-slate-800">
                      Gelen Toplam: <strong className="text-amber-800">{donemStats.gelenNetTonaj || 0} Ton</strong> ({donemStats.toplamSevkiyat || 0} Sevkiyat)
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Depoda Kalan Güncel Stok:</span>
                    <span className="font-black text-sky-700 text-sm">{summary?.kalanStokTonaj || 0} Ton</span>
                  </div>
                </div>
              )}

              {/* Mahalle & Köy İcmali Tablosu (Gruplanmış) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Mahalle ve Köy Bazlı Dağıtım İcmali ({mahalleStats.length} Yerleşim)
                  </h4>
                  <div className="text-[11px] font-bold text-slate-500 flex items-center gap-2">
                    <span className="text-sky-700">{printMahalleler.length} Mahalle</span>
                    <span>•</span>
                    <span className="text-emerald-700">{printKoyler.length} Köy</span>
                  </div>
                </div>

                <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-900 border-b border-slate-300 font-black">
                        <th className="p-2 text-center w-10">#</th>
                        <th className="p-2">Mahalle / Köy Adı</th>
                        <th className="p-2 text-center">Toplam Hane</th>
                        <th className="p-2 text-center">Tam Teslim</th>
                        <th className="p-2 text-center">Eksik Hane</th>
                        <th className="p-2 text-center">Kalan Hane</th>
                        <th className="p-2 text-center">Dağıtılan Torba</th>
                        <th className="p-2 text-center">Dağıtılan Ton</th>
                        <th className="p-2 text-center">Tamamlanma</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {/* 1. GRUP: ŞEHİR MAHALLELERİ */}
                      {printMahalleler.length > 0 && (
                        <tr className="bg-sky-50/90 border-b border-sky-200">
                          <td colSpan={9} className="p-2 font-black text-sky-950 text-xs">
                            🏙️ Şehir Mahalleleri Dağıtım Durumu ({printMahalleler.length} Mahalle)
                          </td>
                        </tr>
                      )}
                      {printMahalleler.map((m: any, idx: number) => {
                        const pct = m.toplamKayit > 0 ? Math.round((m.teslimEdilen / m.toplamKayit) * 100) : 0;
                        return (
                          <tr key={`mahalle_${idx}`} className="hover:bg-slate-50 transition-colors">
                            <td className="p-2 text-center font-bold text-slate-500">{idx + 1}</td>
                            <td className="p-2 font-bold text-slate-900">{m.mahalle}</td>
                            <td className="p-2 text-center font-semibold text-slate-800">{m.toplamKayit}</td>
                            <td className="p-2 text-center font-bold text-emerald-700">{m.teslimEdilen}</td>
                            <td className="p-2 text-center font-bold text-amber-700">{m.eksikHane || 0}</td>
                            <td className="p-2 text-center font-medium text-slate-500">{m.teslimEdilmeyen || 0}</td>
                            <td className="p-2 text-center font-bold text-slate-900">{m.dagitilanTorba || 0}</td>
                            <td className="p-2 text-center font-mono font-bold text-amber-800">{((m.dagitilanTorba || 0) * 0.025).toFixed(2)}</td>
                            <td className="p-2 text-center">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                pct === 100 ? 'bg-emerald-100 text-emerald-800' : pct > 50 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                              }`}>
                                %{pct}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {printMahalleler.length > 0 && (
                        <tr className="bg-sky-100/70 font-black text-sky-950 border-t border-b border-sky-300 text-[11px]">
                          <td colSpan={2} className="p-2 text-right uppercase">ŞEHİR MAHALLELERİ ALT TOPLAMI:</td>
                          <td className="p-2 text-center">{printMahalleler.reduce((acc, m) => acc + (m.toplamKayit || 0), 0)}</td>
                          <td className="p-2 text-center text-emerald-800">{printMahalleler.reduce((acc, m) => acc + (m.teslimEdilen || 0), 0)}</td>
                          <td className="p-2 text-center text-amber-800">{printMahalleler.reduce((acc, m) => acc + (m.eksikHane || 0), 0)}</td>
                          <td className="p-2 text-center text-slate-700">{printMahalleler.reduce((acc, m) => acc + (m.teslimEdilmeyen || 0), 0)}</td>
                          <td className="p-2 text-center">{printMahalleler.reduce((acc, m) => acc + (m.dagitilanTorba || 0), 0)}</td>
                          <td className="p-2 text-center text-amber-900">{(printMahalleler.reduce((acc, m) => acc + (m.dagitilanTorba || 0), 0) * 0.025).toFixed(2)}</td>
                          <td className="p-2 text-center">
                            %{printMahalleler.reduce((acc, m) => acc + (m.toplamKayit || 0), 0) > 0
                              ? Math.round((printMahalleler.reduce((acc, m) => acc + (m.teslimEdilen || 0), 0) / printMahalleler.reduce((acc, m) => acc + (m.toplamKayit || 0), 0)) * 100)
                              : 0}
                          </td>
                        </tr>
                      )}

                      {/* 2. GRUP: KÖY YERLEŞİMLERİ */}
                      {printKoyler.length > 0 && (
                        <tr className="bg-emerald-50/90 border-b border-emerald-200">
                          <td colSpan={9} className="p-2 font-black text-emerald-950 text-xs">
                            🌲 Köy Yerleşimleri Dağıtım Durumu ({printKoyler.length} Köy)
                          </td>
                        </tr>
                      )}
                      {printKoyler.map((m: any, idx: number) => {
                        const pct = m.toplamKayit > 0 ? Math.round((m.teslimEdilen / m.toplamKayit) * 100) : 0;
                        return (
                          <tr key={`koy_${idx}`} className="hover:bg-slate-50 transition-colors">
                            <td className="p-2 text-center font-bold text-slate-500">{idx + 1}</td>
                            <td className="p-2 font-bold text-slate-900">{m.mahalle}</td>
                            <td className="p-2 text-center font-semibold text-slate-800">{m.toplamKayit}</td>
                            <td className="p-2 text-center font-bold text-emerald-700">{m.teslimEdilen}</td>
                            <td className="p-2 text-center font-bold text-amber-700">{m.eksikHane || 0}</td>
                            <td className="p-2 text-center font-medium text-slate-500">{m.teslimEdilmeyen || 0}</td>
                            <td className="p-2 text-center font-bold text-slate-900">{m.dagitilanTorba || 0}</td>
                            <td className="p-2 text-center font-mono font-bold text-amber-800">{((m.dagitilanTorba || 0) * 0.025).toFixed(2)}</td>
                            <td className="p-2 text-center">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                pct === 100 ? 'bg-emerald-100 text-emerald-800' : pct > 50 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                              }`}>
                                %{pct}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {printKoyler.length > 0 && (
                        <tr className="bg-emerald-100/70 font-black text-emerald-950 border-t border-b border-emerald-300 text-[11px]">
                          <td colSpan={2} className="p-2 text-right uppercase">KÖY YERLEŞİMLERİ ALT TOPLAMI:</td>
                          <td className="p-2 text-center">{printKoyler.reduce((acc, m) => acc + (m.toplamKayit || 0), 0)}</td>
                          <td className="p-2 text-center text-emerald-800">{printKoyler.reduce((acc, m) => acc + (m.teslimEdilen || 0), 0)}</td>
                          <td className="p-2 text-center text-amber-800">{printKoyler.reduce((acc, m) => acc + (m.eksikHane || 0), 0)}</td>
                          <td className="p-2 text-center text-slate-700">{printKoyler.reduce((acc, m) => acc + (m.teslimEdilmeyen || 0), 0)}</td>
                          <td className="p-2 text-center">{printKoyler.reduce((acc, m) => acc + (m.dagitilanTorba || 0), 0)}</td>
                          <td className="p-2 text-center text-amber-900">{(printKoyler.reduce((acc, m) => acc + (m.dagitilanTorba || 0), 0) * 0.025).toFixed(2)}</td>
                          <td className="p-2 text-center">
                            %{printKoyler.reduce((acc, m) => acc + (m.toplamKayit || 0), 0) > 0
                              ? Math.round((printKoyler.reduce((acc, m) => acc + (m.teslimEdilen || 0), 0) / printKoyler.reduce((acc, m) => acc + (m.toplamKayit || 0), 0)) * 100)
                              : 0}
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                        <td colSpan={2} className="p-2 text-right uppercase">GENEL TOPLAM:</td>
                        <td className="p-2 text-center">{totalMahalleKayit}</td>
                        <td className="p-2 text-center text-emerald-700">{totalMahalleTeslim}</td>
                        <td className="p-2 text-center text-amber-700">{totalMahalleEksik}</td>
                        <td className="p-2 text-center text-slate-600">{totalMahalleKalan}</td>
                        <td className="p-2 text-center">{summary?.dagitilanTorba || 0}</td>
                        <td className="p-2 text-center text-amber-800">{summary?.dagitilanTonaj || 0}</td>
                        <td className="p-2 text-center">%{summary?.tamamlamaYuzdesi || 0}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Eksik Kömür Alan Haneler (Özet Tablosu) */}
              {eksikHaneler.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-800">
                    Eksik / Kısmi Kömür Alan Haneler Listesi ({eksikHaneler.length} Hane)
                  </h4>
                  <div className="border border-amber-300 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-amber-50 text-amber-950 border-b border-amber-200 font-bold">
                          <th className="p-2 text-center w-10">#</th>
                          <th className="p-2">Hak Sahibi</th>
                          <th className="p-2">TC Kimlik No</th>
                          <th className="p-2">Mahalle</th>
                          <th className="p-2 text-center">Alınan Torba</th>
                          <th className="p-2 text-center">Kalan Eksik</th>
                          <th className="p-2">Açıklama</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100">
                        {eksikHaneler.slice(0, 50).map((h: any, idx: number) => (
                          <tr key={idx} className="hover:bg-amber-50/50">
                            <td className="p-2 text-center font-bold text-slate-500">{idx + 1}</td>
                            <td className="p-2 font-bold text-slate-900">{h.ad_soyad}</td>
                            <td className="p-2 font-mono text-slate-700">{h.tc_no}</td>
                            <td className="p-2 text-slate-700">{h.mahalle}</td>
                            <td className="p-2 text-center font-bold text-emerald-700">{h.torba_sayisi ?? h.verilen_torba ?? 0} Torba</td>
                            <td className="p-2 text-center font-bold text-amber-800">{h.eksik_torba} Torba</td>
                            <td className="p-2 text-[11px] text-slate-500">{h.teslimat_notu || h.aciklama || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 2-Column Official Signatures Block */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-300 space-y-4 print-signatures shadow-2xs">
                <h4 className="text-[10px] sm:text-xs font-bold text-center uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-2">
                  RESMİ TUTANAK VE İMZA ONAY ALANI
                </h4>
                <div className="grid grid-cols-2 gap-4 sm:gap-8 max-w-2xl mx-auto text-center text-xs text-slate-700 pt-2">
                  <div className="space-y-6 sm:space-y-8 p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
                    <div>
                      <p className="font-extrabold text-slate-900 text-xs sm:text-sm">DAĞITIM SORUMLUSU PERSONEL</p>
                      <p className="text-[11px] font-bold text-slate-700 mt-0.5">Saha / Rapor Sorumlusu</p>
                    </div>
                    <div className="h-10 flex items-center justify-center">
                      <span className="text-[10px] text-slate-400 italic">İmza / Tarih</span>
                    </div>
                  </div>

                  <div className="space-y-6 sm:space-y-8 p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
                    <div>
                      <p className="font-extrabold text-slate-900 text-xs sm:text-sm">VAKIF MÜDÜRÜ / ONAY</p>
                      <p className="text-[11px] font-bold text-slate-700 mt-0.5">Edirne SYDV Başkanlığı</p>
                    </div>
                    <div className="h-10 flex items-center justify-center">
                      <span className="text-[10px] text-slate-400 italic">İmza / Mühür</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer: Butonlar daima sabit kalır */}
            <div className="report-modal-footer shrink-0 p-3 sm:p-4 border-t border-slate-200 flex items-center justify-between bg-slate-100 z-20 no-print gap-2">
              <a
                href="/api/export?type=analytics"
                download={`Edirne_SYDV_Istatistik_Raporu_${new Date().toLocaleDateString('en-CA')}.xlsx`}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Excel İndir</span>
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-all active:scale-95 shadow-2xs"
                >
                  Kapat (ESC)
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-2 shadow-xs transition-all active:scale-95"
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