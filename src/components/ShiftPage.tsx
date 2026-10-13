'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Clock, Play, CheckCircle2, AlertTriangle, Calendar, User, 
  MapPin, Package, Sparkles, Filter, Plus, Printer, Trash2, 
  Edit3, RefreshCw, ChevronDown, Check, X, FileSpreadsheet
} from 'lucide-react';

interface ShiftPageProps {
  userRole: 'ADMIN' | 'PERSONEL';
  userName: string;
  onOpenStartModal: () => void;
  onOpenEndModal: (shift: any) => void;
  onRefreshAll?: () => void;
}

export default function ShiftPage({
  userRole,
  userName,
  onOpenStartModal,
  onOpenEndModal,
  onRefreshAll
}: ShiftPageProps) {
  const [shifts, setShifts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedPersonnel, setSelectedPersonnel] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [availableMonths, setAvailableMonths] = useState<any[]>([]);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<any[]>([]);
  const [showMonthlyPayroll, setShowMonthlyPayroll] = useState<boolean>(false);
  const [dateFilterType, setDateFilterType] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>('ALL');
  const [dayTypeFilter, setDayTypeFilter] = useState<'ALL' | 'HAFTA_ICI' | 'CUMARTESI' | 'PAZAR'>('ALL');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Manual Add / Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingShift, setEditingShift] = useState<any | null>(null);

  // Fetch shifts
  const fetchShifts = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedPersonnel !== 'ALL') {
        params.append('personel', selectedPersonnel);
      }
      if (selectedMonth !== 'ALL') {
        params.append('month', selectedMonth);
      }
      if (dayTypeFilter !== 'ALL') {
        params.append('dayType', dayTypeFilter);
      }

      const now = new Date();
      const todayStr = now.toLocaleDateString('en-CA');

      if (dateFilterType === 'TODAY') {
        params.append('gun', todayStr);
      } else if (dateFilterType === 'WEEK') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        params.append('startDate', weekAgo.toLocaleDateString('en-CA'));
        params.append('endDate', todayStr);
      } else if (dateFilterType === 'MONTH') {
        const monthAgo = new Date(now);
        monthAgo.setDate(monthAgo.getDate() - 30);
        params.append('startDate', monthAgo.toLocaleDateString('en-CA'));
        params.append('endDate', todayStr);
      } else if (dateFilterType === 'CUSTOM') {
        if (customStartDate) params.append('startDate', customStartDate);
        if (customEndDate) params.append('endDate', customEndDate);
      }

      const res = await fetch(`/api/shifts?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setShifts(data.shifts || []);
        setStats(data.stats || {});
        setActiveShift(data.activeShift || null);
        if (data.availableMonths) setAvailableMonths(data.availableMonths);
        if (data.monthlyBreakdown) setMonthlyBreakdown(data.monthlyBreakdown);
      }
    } catch (err) {
      console.error('Error loading shifts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
  }, [selectedPersonnel, selectedMonth, dateFilterType, dayTypeFilter, customStartDate, customEndDate]);

  // Extract distinct personnel list from shifts + defaults
  const personnelList = useMemo(() => {
    const set = new Set<string>(['Murat Dağıtım', 'Ahmet Saha', 'Kemal Taş']);
    shifts.forEach((s) => {
      if (s.personel_adi) set.add(s.personel_adi);
    });
    if (userName) set.add(userName);
    return Array.from(set);
  }, [shifts, userName]);

  // Delete shift handler
  const handleDeleteShift = async (id: number) => {
    if (!confirm('Bu mesai kaydını silmek istediğinize emin misiniz?')) return;
    try {
      const res = await fetch('/api/shifts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        fetchShifts();
      } else {
        alert(data.error || 'Silinemedi.');
      }
    } catch (err: any) {
      alert(err.message || 'Hata oluştu.');
    }
  };

  // Print function
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 leading-tight">
                Personel Günlük Çalışma ve Mesai Takibi
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Günlük başlama-bitiş saatleri, net çalışma süresi (saat & dakika) ve dağıtım yapılan mahalleler
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Month Selector */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
            <Calendar className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-bold text-slate-500">Ay:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-xs font-black text-slate-900 bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="ALL">📅 Tüm Aylar</option>
              {availableMonths.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowMonthlyPayroll(!showMonthlyPayroll)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs ${
              showMonthlyPayroll
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
            title="Aylık Personel Mesai ve Dağıtım İcmali"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Aylık İcmal Tablosu</span>
          </button>

          <button
            onClick={fetchShifts}
            className="p-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-all active:scale-95 shadow-2xs"
            title="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-600' : ''}`} />
          </button>

          <button
            onClick={handlePrint}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs no-print"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">Yazdır</span>
          </button>

          <button
            onClick={() => {
              setEditingShift({
                personel_adi: userName || 'Murat Dağıtım',
                tarih: new Date().toLocaleDateString('en-CA'),
                baslama_saati: '08:30',
                bitis_saati: '17:30',
                mahalleler: '',
                teslim_edilen_torba: 0,
                teslim_edilen_hane: 0,
                notlar: ''
              });
              setShowEditModal(true);
            }}
            className="btn-primary py-2 px-3 text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>Yeni Mesai Ekle</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Stat 1: Hafta İçi Mesai (17:30 Sonrası & Devreden) */}
        <div 
          onClick={() => setDayTypeFilter(dayTypeFilter === 'HAFTA_ICI' ? 'ALL' : 'HAFTA_ICI')}
          className={`p-3.5 rounded-2xl cursor-pointer transition-all border shadow-2xs ${
            dayTypeFilter === 'HAFTA_ICI' 
              ? 'bg-blue-50/80 border-blue-400 ring-2 ring-blue-400/30' 
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-600 font-bold mb-1">
            <span className="flex items-center gap-1">
              🏢 Hafta İçi Mesaisi
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {stats.haftaIciMesaiFormatli || '0 sa'}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
            17:30 Sonrası & Devreden • Normal: {stats.haftaIciNormalFormatli || '0 sa'}
          </p>
        </div>

        {/* Stat 2: Cumartesi Mesaisi (Ayrı Getiri) */}
        <div 
          onClick={() => setDayTypeFilter(dayTypeFilter === 'CUMARTESI' ? 'ALL' : 'CUMARTESI')}
          className={`p-3.5 rounded-2xl cursor-pointer transition-all border shadow-2xs ${
            dayTypeFilter === 'CUMARTESI'
              ? 'bg-amber-100/80 border-amber-500 ring-2 ring-amber-500/30'
              : 'bg-amber-50/70 border-amber-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-amber-900 font-bold mb-1">
            <span className="flex items-center gap-1">
              💼 Cumartesi Mesaisi
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-amber-950">
            {stats.cumartesiFormatli || '0 sa'}
          </div>
          <p className="text-[11px] text-amber-800 font-medium mt-0.5">
            {stats.cumartesiGunSayisi || 0} Gün Cumartesi Mesaisi
          </p>
        </div>

        {/* Stat 3: Pazar Full Mesaisi (Ayrı Getiri) */}
        <div 
          onClick={() => setDayTypeFilter(dayTypeFilter === 'PAZAR' ? 'ALL' : 'PAZAR')}
          className={`p-3.5 rounded-2xl cursor-pointer transition-all border shadow-2xs ${
            dayTypeFilter === 'PAZAR'
              ? 'bg-purple-100/80 border-purple-500 ring-2 ring-purple-500/30'
              : 'bg-purple-50/70 border-purple-200 hover:border-purple-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-purple-900 font-bold mb-1">
            <span className="flex items-center gap-1">
              ⭐ Pazar Full Mesaisi
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-purple-950">
            {stats.pazarFormatli || '0 sa'}
          </div>
          <p className="text-[11px] text-purple-800 font-medium mt-0.5">
            {stats.pazarGunSayisi || 0} Gün Pazar Mesaisi
          </p>
        </div>

        {/* Stat 4: Genel Toplam & Dağıtım */}
        <div 
          onClick={() => setDayTypeFilter('ALL')}
          className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 shadow-2xs cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold mb-1">
            <span>Genel Toplam & Dağıtım</span>
            <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-800 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {stats.toplamMesaiFormatli || '0 sa'}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {stats.toplamTorba || 0} Torba • {stats.toplamHane || 0} Hane
            {stats.toplamSarkanDakika > 0 && ` (${stats.toplamSarkanFormatli} aktarım)`}
          </p>
        </div>
      </div>

      {/* Mesai, Taşıma ve 11 Saat Kuralı Bilgi Çubuğu */}
      <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/90 text-xs text-amber-950 space-y-1.5">
        <div className="flex items-center gap-2 font-black text-amber-900">
          <span className="w-5 h-5 rounded-lg bg-amber-500 text-white flex items-center justify-center text-xs">⚖️</span>
          <span>Mesai & Yasal 11 Saat Aktarım Kuralları:</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] font-medium text-amber-900/90 pt-1">
          <div className="p-2 rounded-xl bg-white/70 border border-amber-200/60 leading-relaxed">
            <strong className="font-bold text-amber-950 block">1. Hafta İçi (08:30–17:30):</strong>
            Dağıtım gün içinde erken başlasa dahi 17:30 öncesi normal çalışma kabul edilir. Mesai 17:30 sonrasında başlar.
          </div>
          <div className="p-2 rounded-xl bg-white/70 border border-amber-200/60 leading-relaxed">
            <strong className="font-bold text-amber-950 block">2. Günlük 11 Saat Sınırı:</strong>
            Günlük toplam süre 11 saati (660 dk) aştığında, artan saat ve dakikalar otomatik olarak bir sonraki iş gününe aktarılır.
          </div>
          <div className="p-2 rounded-xl bg-white/70 border border-amber-200/60 leading-relaxed">
            <strong className="font-bold text-amber-950 block">3. Cuma ➡️ Pazartesi Kuralı:</strong>
            Cuma gününden sarkan mesai, Cumartesi ve Pazar mesai hesaplamaları farklı olduğu için doğrudan Pazartesi gününe eklenir.
          </div>
        </div>
      </div>

      {/* Monthly Payroll Summary Table (Açılır İcmal Tablosu) */}
      {showMonthlyPayroll && (
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                📊
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  {selectedMonth !== 'ALL' ? `${selectedMonth} Dönemi` : 'Genel'} Personel Mesai & Dağıtım İcmali
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Personellerin hafta içi, cumartesi, pazar ve aktarılan mesai hak ediş dökümü
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowMonthlyPayroll(false)}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <th className="py-2.5 px-3 rounded-l-lg">Personel Adı</th>
                  <th className="py-2.5 px-3">Hafta İçi (17:30+)</th>
                  <th className="py-2.5 px-3">Cumartesi Mesai</th>
                  <th className="py-2.5 px-3">Pazar Full Mesai</th>
                  <th className="py-2.5 px-3">Sarkan/Aktarılan</th>
                  <th className="py-2.5 px-3 font-extrabold text-amber-900">Toplam Mesai Hak Edişi</th>
                  <th className="py-2.5 px-3 rounded-r-lg">Dağıtılan Kömür</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                {monthlyBreakdown.map((row) => (
                  <tr key={row.personel_adi} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-amber-600" />
                      {row.personel_adi}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{row.haftaIciMesaiFormatli}</td>
                    <td className="py-2.5 px-3 text-amber-900 font-bold">{row.cumartesiFormatli}</td>
                    <td className="py-2.5 px-3 text-purple-900 font-bold">{row.pazarFormatli}</td>
                    <td className="py-2.5 px-3">
                      {row.sarkanDakika > 0 ? (
                        <span className="text-amber-800 font-bold bg-amber-100 px-1.5 py-0.5 rounded text-[11px]">
                          +{row.sarkanFormatli}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-black text-emerald-800 text-sm">
                      {row.toplamMesaiFormatli}
                    </td>
                    <td className="py-2.5 px-3">
                      {row.toplamTorba} Torba ({row.toplamHane} Hane)
                    </td>
                  </tr>
                ))}
                {monthlyBreakdown.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-slate-400 font-medium">
                      Bu döneme ait mesai kaydı bulunamadı.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Active Shift Controller / Live Action Widget */}
      {activeShift && activeShift.durum === 'DEVAM_EDIYOR' ? (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border-2 border-emerald-400 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md relative">
                <Clock className="w-6 h-6 animate-spin" />
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white animate-ping" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                    🟢 Dağıtım Mesaisi Şu An Devam Ediyor
                  </span>
                </div>
                <div className="text-sm font-black text-slate-900 mt-1">
                  {activeShift.personel_adi} • Başlama Saati: {activeShift.baslama_saati}
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Çalışma Tarihi: <strong className="text-slate-800">{activeShift.tarih}</strong>
                  {activeShift.durationFormatted && (
                    <span className="ml-2 font-bold text-emerald-800 bg-white/80 px-2 py-0.5 rounded border border-emerald-200">
                      Geçen Süre: {activeShift.durationFormatted}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => onOpenEndModal(activeShift)}
              className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 shrink-0"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Bugünkü Dağıtımı Bitir & Mesaiyi Kapat</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-300">
              <Play className="w-4 h-4 fill-amber-800 ml-0.5" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-slate-900">
                Bugünkü Dağıtım Başlamadı mı?
              </h4>
              <p className="text-[11px] text-slate-500">
                Dağıtıma çıkarken tek tıkla mesaiyi başlatın, gün sonu saatlerinizi ve fazla mesainizi otomatik hesaplayalım.
              </p>
            </div>
          </div>

          <button
            onClick={onOpenStartModal}
            className="btn-primary py-2 px-4 text-xs font-extrabold flex items-center justify-center gap-2 shadow-xs shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Dağıtımı Başlat</span>
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
        {/* Row 1: Day Type Tabs (Hafta İçi, Cumartesi, Pazar, Tümü) */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-amber-600" />
              Mesai Türü:
            </span>
            {[
              { id: 'ALL', label: 'Tüm Günler' },
              { id: 'HAFTA_ICI', label: `🏢 Hafta İçi (${stats.haftaIciGunSayisi || 0})` },
              { id: 'CUMARTESI', label: `💼 Cumartesi (${stats.cumartesiGunSayisi || 0})` },
              { id: 'PAZAR', label: `⭐ Pazar (${stats.pazarGunSayisi || 0})` }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDayTypeFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 ${
                  dayTypeFilter === tab.id
                    ? tab.id === 'CUMARTESI'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : tab.id === 'PAZAR'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : tab.id === 'HAFTA_ICI'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Personnel Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Personel:</span>
            <select
              value={selectedPersonnel}
              onChange={(e) => setSelectedPersonnel(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">👥 Tüm Personel ({personnelList.length})</option>
              {personnelList.map((p) => (
                <option key={p} value={p}>
                  👤 {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Date Range Tabs */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-bold text-slate-500 mr-1 whitespace-nowrap">Tarih Aralığı:</span>
            {[
              { id: 'ALL', label: 'Tüm Tarihler' },
              { id: 'TODAY', label: 'Bugün' },
              { id: 'WEEK', label: 'Son 7 Gün' },
              { id: 'MONTH', label: 'Son 30 Gün' },
              { id: 'CUSTOM', label: 'Özel Tarih' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDateFilterType(tab.id as any)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  dateFilterType === tab.id
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range Row */}
        {dateFilterType === 'CUSTOM' && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
              <span>Başlangıç:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold bg-white"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
              <span>Bitiş:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold bg-white"
              />
            </div>
          </div>
        )}
      </div>

      {/* Shifts List (Day-by-day Cards) */}
      <div className="space-y-3">
        {isLoading && (
          <div className="p-12 text-center text-slate-500">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs font-bold">Mesai kayıtları yükleniyor...</p>
          </div>
        )}

        {!isLoading && shifts.length === 0 && (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
            <Clock className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">Henüz mesai kaydı bulunamadı</p>
            <p className="text-xs text-slate-400">
              Dağıtıma başlarken mesaiyi başlatabilir veya sağ üstten &quot;Yeni Mesai Ekle&quot; butonunu kullanabilirsiniz.
            </p>
          </div>
        )}

        {!isLoading && shifts.map((shift) => {
          const isOngoing = shift.durum === 'DEVAM_EDIYOR';
          const isSaturday = shift.isSaturday;
          const isSunday = shift.isSunday;
          const isWeekday = shift.isWeekday;
          const exceeds11Hours = shift.exceeds11Hours;

          return (
            <div
              key={shift.id}
              className={`p-4 rounded-2xl bg-white border transition-all shadow-xs ${
                isOngoing
                  ? 'border-emerald-400 bg-emerald-50/15 ring-2 ring-emerald-400/20'
                  : exceeds11Hours
                  ? 'border-rose-300 bg-rose-50/20'
                  : isSunday
                  ? 'border-purple-200 hover:border-purple-300'
                  : isSaturday
                  ? 'border-amber-200 hover:border-amber-300'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Row 1: Header (Date + Person + Status + Badges) */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg font-bold flex items-center justify-center text-xs ${
                    isSunday 
                      ? 'bg-purple-100 text-purple-800' 
                      : isSaturday 
                      ? 'bg-amber-100 text-amber-800' 
                      : 'bg-slate-100 text-slate-800'
                  }`}>
                    {isSunday ? '⭐' : isSaturday ? '💼' : '📅'}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 leading-tight">
                      {shift.tarih} {shift.dayName ? `(${shift.dayName})` : ''}
                    </h4>
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 mt-0.5">
                      <User className="w-3 h-3 text-amber-600" />
                      {shift.personel_adi}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Distinct Badges for Saturday, Sunday, Weekday */}
                  {isSaturday ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black shadow-2xs">
                      <Sparkles className="w-3 h-3 text-amber-700" />
                      Cumartesi Mesaisi
                    </span>
                  ) : isSunday ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-purple-100 text-purple-900 border border-purple-300 text-xs font-black shadow-2xs">
                      <Sparkles className="w-3 h-3 text-purple-700" />
                      Pazar Full Mesaisi
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      Hafta İçi (08:30-17:30)
                    </span>
                  )}

                  {/* 11 Hours Warning Badge */}
                  {exceeds11Hours && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-100 text-rose-900 border border-rose-300 text-xs font-black animate-pulse">
                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                      11 Saati Aşıyor!
                    </span>
                  )}

                  {isOngoing ? (
                    <span className="badge badge-pending animate-pulse">
                      <Clock className="w-3.5 h-3.5" />
                      Devam Ediyor
                    </span>
                  ) : (
                    <span className="badge badge-delivered">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Tamamlandı
                    </span>
                  )}
                </div>
              </div>

              {/* Carryover Banners (Sarkan / Devreden Mesai Bildirimleri) */}
              {shift.transferredOutMinutes > 0 && (
                <div className="my-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-1.5 shadow-2xs">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Günlük yasal 11 saat doldu: <strong className="text-amber-950 font-black">+{shift.transferredOutFormatted}</strong> artık süre{' '}
                      <strong className="text-amber-950 font-black">{shift.transferredOutTarget}</strong> gününe aktarıldı.
                    </span>
                  </div>
                  <span className="bg-amber-200/90 text-amber-950 px-2 py-0.5 rounded text-[11px] font-black shrink-0">
                    Sonraki Güne Aktarıldı ➡️
                  </span>
                </div>
              )}

              {shift.transferredInMinutes > 0 && (
                <div className="my-2.5 p-2.5 rounded-xl bg-blue-50 border border-blue-300 text-xs text-blue-900 flex flex-wrap items-center justify-between gap-1.5 shadow-2xs">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      <strong className="text-blue-950 font-black">{shift.transferredInSource}</strong> gününden sarkan{' '}
                      <strong className="text-blue-950 font-black">+{shift.transferredInFormatted}</strong> mesai bu günün hak edişine eklendi.
                    </span>
                  </div>
                  <span className="bg-blue-200/90 text-blue-950 px-2 py-0.5 rounded text-[11px] font-black shrink-0">
                    ⬅️ Devreden Eklendi
                  </span>
                </div>
              )}

              {/* Row 2: Hours & Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 text-xs">
                {/* Working Hours */}
                <div>
                  <span className="text-slate-500 font-semibold block">Çalışma Saatleri</span>
                  <strong className="text-sm font-black text-slate-900">
                    {shift.baslama_saati} — {shift.bitis_saati || 'Devam Ediyor'}
                  </strong>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Toplam Süre: {shift.durationFormatted || '-'}
                  </span>
                </div>

                {/* Overtime calculation details */}
                <div>
                  <span className="text-slate-500 font-semibold block">
                    {shift.isWeekday ? 'Hafta İçi Mesai (17:30+)' : 'Hafta Sonu Mesaisi'}
                  </span>
                  <strong className={`text-sm font-black ${shift.finalOvertimeMinutes > 0 ? 'text-amber-950' : 'text-slate-600'}`}>
                    {shift.finalOvertimeFormatted || '0 dk'}
                  </strong>
                  {shift.isWeekday ? (
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Normal: {shift.normalFormatted} (17:30 öncesi)
                    </span>
                  ) : (
                    <span className="text-[11px] text-purple-700 font-semibold block mt-0.5">
                      {shift.isSaturday ? 'Cumartesi Tam Mesai' : 'Pazar Full Mesai'}
                    </span>
                  )}
                </div>

                {/* Distributed Bags */}
                <div>
                  <span className="text-slate-500 font-semibold block">Dağıtılan Kömür</span>
                  <strong className="text-sm font-black text-slate-900">
                    {shift.teslim_edilen_torba || 0} Torba
                  </strong>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    {shift.teslim_edilen_hane ? `${shift.teslim_edilen_hane} Haneye Teslim` : '0 Hane'}
                  </span>
                </div>

                {/* Neighborhoods & Transfer Info */}
                <div>
                  <span className="text-slate-500 font-semibold block">Dağıtım Mahallesi</span>
                  <span className="font-bold text-slate-800 truncate block" title={shift.mahalleler}>
                    {shift.mahalleler || 'Belirtilmemiş'}
                  </span>
                  {shift.transferredOutMinutes > 0 && (
                    <span className="text-[11px] text-amber-700 font-bold block mt-0.5 truncate">
                      Devir: +{shift.transferredOutFormatted} ({shift.transferredOutTarget})
                    </span>
                  )}
                  {shift.transferredInMinutes > 0 && (
                    <span className="text-[11px] text-blue-700 font-bold block mt-0.5 truncate">
                      Dünden: +{shift.transferredInFormatted}
                    </span>
                  )}
                </div>
              </div>

              {/* Row 3: Notes if any */}
              {shift.notlar && (
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700 font-medium mb-2">
                  📝 {shift.notlar}
                </div>
              )}

              {/* Row 4: Actions (Admin Edit/Delete or Personnel Finish) */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                {isOngoing ? (
                  <button
                    onClick={() => onOpenEndModal(shift)}
                    className="btn-primary py-1.5 px-3 text-xs font-bold flex items-center gap-1.5 ml-auto bg-emerald-600 hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Günü Bitir & Kapat</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      onClick={() => {
                        setEditingShift(shift);
                        setShowEditModal(true);
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold flex items-center gap-1 transition-all active:scale-95"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Düzenle</span>
                    </button>

                    {userRole === 'ADMIN' && (
                      <button
                        onClick={() => handleDeleteShift(shift.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold flex items-center gap-1 transition-all active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Sil</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Manual Add / Edit Shift Modal */}
      {showEditModal && editingShift && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-sheet max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  ⏱️
                </div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {editingShift.id ? 'Mesai Kaydını Düzenle' : 'Manuel Mesai Kaydı Ekle'}
                </h3>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const isUpdate = !!editingShift.id;
                const url = '/api/shifts';
                const method = isUpdate ? 'PUT' : 'POST';
                const body = isUpdate
                  ? editingShift
                  : { action: 'CREATE', ...editingShift };

                try {
                  const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                  });
                  const data = await res.json();
                  if (data.success) {
                    setShowEditModal(false);
                    fetchShifts();
                  } else {
                    alert(data.error || 'Kaydedilemedi.');
                  }
                } catch (err: any) {
                  alert(err.message || 'Hata oluştu.');
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Personel Adı</label>
                <input
                  type="text"
                  value={editingShift.personel_adi}
                  onChange={(e) => setEditingShift({ ...editingShift, personel_adi: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tarih</label>
                  <input
                    type="date"
                    value={editingShift.tarih}
                    onChange={(e) => setEditingShift({ ...editingShift, tarih: e.target.value })}
                    required
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Başlama</label>
                  <input
                    type="time"
                    value={editingShift.baslama_saati}
                    onChange={(e) => setEditingShift({ ...editingShift, baslama_saati: e.target.value })}
                    required
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Bitiş</label>
                  <input
                    type="time"
                    value={editingShift.bitis_saati || ''}
                    onChange={(e) => setEditingShift({ ...editingShift, bitis_saati: e.target.value })}
                    required
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Dağıtım Mahallesi</label>
                <input
                  type="text"
                  value={editingShift.mahalleler || ''}
                  onChange={(e) => setEditingShift({ ...editingShift, mahalleler: e.target.value })}
                  placeholder="Örn: Cumhuriyet Mah., Atatürk Mah."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Dağıtılan Torba</label>
                  <input
                    type="number"
                    value={editingShift.teslim_edilen_torba || 0}
                    onChange={(e) => setEditingShift({ ...editingShift, teslim_edilen_torba: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Teslim Edilen Hane</label>
                  <input
                    type="number"
                    value={editingShift.teslim_edilen_hane || 0}
                    onChange={(e) => setEditingShift({ ...editingShift, teslim_edilen_hane: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notlar</label>
                <textarea
                  value={editingShift.notlar || ''}
                  onChange={(e) => setEditingShift({ ...editingShift, notlar: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn-secondary flex-1 py-2 text-xs font-bold"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1 py-2 text-xs font-bold"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
