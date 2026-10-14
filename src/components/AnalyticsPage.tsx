'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, Calendar, Printer, Filter, AlertTriangle, 
  CheckCircle2, Clock, Truck, Target, TrendingUp, Users, MapPin, 
  Search, Navigation, Building2, Trees, FileSpreadsheet, PackageCheck, 
  Layers, ArrowUpDown, ChevronDown
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
  // Navigation Subtab State
  const [subTab, setSubTab] = useState<'OVERVIEW' | 'MAHALLE' | 'SOKAK' | 'BATCHES'>('OVERVIEW');

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
    window.print();
  };

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

  // Filtered Sokak Stats
  const filteredSokakStats = useMemo(() => {
    return sokakStats.filter((s) => {
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

        <button
          onClick={handlePrint}
          className="btn-primary lg:w-auto text-xs py-2.5 px-4 shadow-md shadow-amber-500/20 bg-gradient-to-r from-amber-500 to-orange-600 flex items-center gap-2 font-bold self-start sm:self-auto"
        >
          <Printer className="w-4 h-4 text-white" />
          <span>Resmi PDF Raporu Yazdır</span>
        </button>
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

          {/* Detailed Mahalle Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="desktop-compact-table">
              <thead>
                <tr>
                  <th>Yerleşim / Bölge Adı</th>
                  <th className="text-center">Tip</th>
                  <th className="text-center">Toplam Kayıt</th>
                  <th className="text-center text-emerald-800">Teslim Yapılan</th>
                  <th className="text-center text-amber-800">Teslim Yapılmayan</th>
                  <th className="text-center">Eksik Kalan</th>
                  <th className="text-right">Kömür Dağıtımı (Torba)</th>
                  <th className="text-right">Tamamlanma</th>
                </tr>
              </thead>
              <tbody>
                {filteredMahalleStats.map((m: any) => {
                  const isKoy = m.tip === 'KOY';
                  const teslimEdilen = m.teslimEdilen ?? m.tamHane ?? 0;
                  const teslimEdilmeyen = m.teslimEdilmeyen ?? ((m.toplamKayit || m.toplamHane || 0) - teslimEdilen);

                  return (
                    <tr key={m.mahalle}>
                      <td>
                        <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                          {isKoy ? (
                            <Trees className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
                          )}
                          <span>{m.mahalle}</span>
                        </div>
                      </td>
                      <td className="text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                          isKoy ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}>
                          {isKoy ? 'Köy' : 'Mahalle'}
                        </span>
                      </td>
                      <td className="text-center font-bold text-slate-900">
                        {m.toplamKayit || m.toplamHane} Kişi
                      </td>
                      <td className="text-center font-black text-emerald-700 bg-emerald-50/50">
                        {teslimEdilen} Kişi
                      </td>
                      <td className="text-center font-black text-amber-800 bg-amber-50/50">
                        {teslimEdilmeyen} Kişi
                      </td>
                      <td className="text-center font-bold text-slate-600">
                        {m.eksikHane > 0 ? (
                          <span className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                            {m.eksikHane}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="text-right font-mono text-xs">
                        <strong className="text-emerald-700">{m.dagitilanTorba || 0}</strong> / <span className="text-slate-500">{m.hedefTorba || 0}</span>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min(100, m.yuzde || 0)}%` }}
                            />
                          </div>
                          <span className="font-extrabold text-amber-800 font-mono text-xs">
                            %{m.yuzde || 0}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
    </div>
  );
}
