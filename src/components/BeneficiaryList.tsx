'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  Search, MapPin, Phone, PackageCheck, Eye, EyeOff, Users, 
  CheckCircle2, Clock, Filter, AlertCircle, ChevronRight, ChevronDown, AlertTriangle, 
  PackagePlus, CheckSquare, Square, X, SlidersHorizontal, ArrowRight, Undo2,
  Navigation, ArrowUpDown, Trees, Building2, Compass
} from 'lucide-react';
import { getRecordPhones, formatPhoneDisplay, getRecordStreetInfo, compareByAddressAsc } from '@/lib/normalizer';

interface BeneficiaryListProps {
  records: any[];
  mahalleler: any[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedMahalleler: string[];
  onMahallelerChange: (m: string[]) => void;
  selectedQueueTab: 'PENDING_AND_PARTIAL' | 'DELIVERED';
  onQueueTabChange: (tab: 'PENDING_AND_PARTIAL' | 'DELIVERED') => void;
  selectedDurumFilter: string;
  onDurumFilterChange: (d: string) => void;
  onOpenDelivery: (person: any) => void;
  onOpenHousehold: (person: any) => void;
  onOpenCancel?: (person: any) => void;
  defaultQuota?: number;
  isLoading?: boolean;
}

export default function BeneficiaryList({
  records,
  mahalleler,
  searchQuery,
  onSearchChange,
  selectedMahalleler,
  onMahallelerChange,
  selectedQueueTab,
  onQueueTabChange,
  selectedDurumFilter,
  onDurumFilterChange,
  onOpenDelivery,
  onOpenHousehold,
  onOpenCancel,
  defaultQuota = 34,
  isLoading = false
}: BeneficiaryListProps) {
  const [showAllOpenAddresses, setShowAllOpenAddresses] = useState(false);
  const [expandedAddresses, setExpandedAddresses] = useState<Record<number, boolean>>({});
  const [showMahalleModal, setShowMahalleModal] = useState(false);
  const [showSokakModal, setShowSokakModal] = useState(false);
  const [phoneSelectTarget, setPhoneSelectTarget] = useState<any | null>(null);
  const [sortOrder, setSortOrder] = useState<'ADDRESS_ASC' | 'NAME_ASC'>('ADDRESS_ASC');
  const [selectedSokak, setSelectedSokak] = useState<string>('HEPSI');
  const [sokakSearchTerm, setSokakSearchTerm] = useState('');

  const toggleAddress = (id: number) => {
    setExpandedAddresses((prev) => {
      const current = prev[id] !== undefined ? prev[id] : showAllOpenAddresses;
      return {
        ...prev,
        [id]: !current
      };
    });
  };

  // Toggle single neighborhood selection
  const handleToggleMahalle = (mahalleName: string) => {
    if (selectedMahalleler.includes(mahalleName)) {
      onMahallelerChange(selectedMahalleler.filter((m) => m !== mahalleName));
    } else {
      onMahallelerChange([...selectedMahalleler, mahalleName]);
    }
  };

  // Select all / deselect all
  const handleSelectAllMahalle = () => {
    if (selectedMahalleler.length === mahalleler.length) {
      onMahallelerChange([]);
    } else {
      onMahallelerChange(mahalleler.map((m) => m.mahalle));
    }
  };

  // Household duplicates detection
  const householdCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of records) {
      if (r.norm_adres) {
        counts[r.norm_adres] = (counts[r.norm_adres] || 0) + 1;
      }
    }
    return counts;
  }, [records]);

  // Separate records into:
  // 1. Teslim Edilecekler (Pending + Partial) - Teslim edilenler burada ASLA görünmez!
  // 2. Teslim Edilenler (Completed)
  const allPendingRecords = useMemo(() => {
    return records.filter((r) => {
      const isComplete = r.teslimat_durumu === 'TAMAMLANDI' || r.teslimat_durumu === 'TESLIM_EDILDI';
      return !isComplete;
    });
  }, [records]);

  // Sub-filtered pending records according to selectedDurumFilter ('HEPSI' | 'EKSIK' | 'BEKLIYOR')
  const filteredPendingRecords = useMemo(() => {
    return allPendingRecords.filter((r) => {
      if (selectedDurumFilter === 'EKSIK') return r.teslimat_durumu === 'EKSIK';
      if (selectedDurumFilter === 'BEKLIYOR') return r.teslimat_durumu === 'BEKLIYOR' || !r.teslimat_durumu;
      return true;
    });
  }, [allPendingRecords, selectedDurumFilter]);

  const deliveredRecords = useMemo(() => {
    return records.filter((r) => r.teslimat_durumu === 'TAMAMLANDI' || r.teslimat_durumu === 'TESLIM_EDILDI');
  }, [records]);

  const isSearching = Boolean(searchQuery && searchQuery.trim().length > 0);

  // Active list to display based on search mode or selectedQueueTab
  // When searching, display ALL matching records directly so field staff finds anyone instantly
  const activeDisplayList = isSearching
    ? records
    : selectedQueueTab === 'PENDING_AND_PARTIAL'
    ? filteredPendingRecords
    : deliveredRecords;

  const totalPendingCount = allPendingRecords.length;
  const eksikCount = allPendingRecords.filter((r) => r.teslimat_durumu === 'EKSIK').length;
  const bekleyenCount = allPendingRecords.filter((r) => r.teslimat_durumu === 'BEKLIYOR' || !r.teslimat_durumu).length;

  // Extract all available streets across current active records
  const availableStreets = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of activeDisplayList) {
      const st = getRecordStreetInfo(r);
      const sName = st.sokak || 'Köy İçi / Ana Yol';
      map.set(sName, (map.get(sName) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([sokak, count]) => ({ sokak, count }))
      .sort((a, b) => a.sokak.localeCompare(b.sokak, 'tr'));
  }, [activeDisplayList]);

  // If selected street is no longer present, reset to HEPSI
  useEffect(() => {
    if (selectedSokak !== 'HEPSI' && !availableStreets.some((s) => s.sokak === selectedSokak)) {
      setSelectedSokak('HEPSI');
    }
  }, [availableStreets, selectedSokak]);

  // Filter records by selected street if active
  const streetFilteredList = useMemo(() => {
    if (selectedSokak === 'HEPSI') return activeDisplayList;
    return activeDisplayList.filter((r) => {
      const st = getRecordStreetInfo(r);
      return st.sokak === selectedSokak;
    });
  }, [activeDisplayList, selectedSokak]);

  // Group active records by mahalle / village
  const groupedByMahalle = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const r of streetFilteredList) {
      const m = r.mahalle || 'Belirtilmemiş';
      if (!groups[m]) {
        groups[m] = [];
      }
      groups[m].push(r);
    }
    // Sort each settlement according to selected sortOrder
    Object.keys(groups).forEach((key) => {
      if (sortOrder === 'ADDRESS_ASC') {
        groups[key].sort(compareByAddressAsc);
      } else {
        groups[key].sort((a, b) => a.ad_soyad.localeCompare(b.ad_soyad, 'tr'));
      }
    });
    return groups;
  }, [streetFilteredList, sortOrder]);

  const mahalleKeys = Object.keys(groupedByMahalle).sort((a, b) => a.localeCompare(b, 'tr'));

  return (
    <div className="space-y-4">
      {/* Search Header Bar - Light Mode */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="w-5 h-5 absolute left-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="TC Kimlik No, İsim veya Adres ile ara..."
            className="w-full pl-11 pr-10 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-900 placeholder-slate-400 font-medium text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3.5 p-1 text-slate-400 hover:text-slate-700"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ARAMA MODU: Sade, Hızlı ve Pratik Arama Bilgi Çubuğu */}
      {isSearching && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl px-3.5 py-2.5 shadow-xs">
          <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5 truncate">
            <Search className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Arama Sonucu:</span>
            <strong className="text-slate-900 font-extrabold">{activeDisplayList.length} Hane Bulundu</strong>
          </span>
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="text-xs font-bold text-rose-600 hover:text-rose-800 underline active:scale-95 shrink-0 ml-2"
          >
            Aramayı Temizle
          </button>
        </div>
      )}

      {/* NORMAL MOD (Arama yapılmadığında görünen kontroller) */}
      {!isSearching && (
        <>
          {/* DYNAMIC QUEUE TOGGLE TABS (Teslim Edilecekler vs Teslim Edilenler) */}
          <div className="p-1 rounded-2xl bg-slate-200/90 border border-slate-300/70 grid grid-cols-2 gap-1 shadow-inner">
            <button
              type="button"
              onClick={() => onQueueTabChange('PENDING_AND_PARTIAL')}
              className={`py-2.5 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all min-h-[44px] ${
                selectedQueueTab === 'PENDING_AND_PARTIAL'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/90'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PackageCheck className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="truncate">Teslim Edilecek ({totalPendingCount})</span>
            </button>

            <button
              type="button"
              onClick={() => onQueueTabChange('DELIVERED')}
              className={`py-2.5 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all min-h-[44px] ${
                selectedQueueTab === 'DELIVERED'
                  ? 'bg-white text-emerald-800 shadow-sm border border-slate-200/90'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">Teslim Edilen ({deliveredRecords.length})</span>
            </button>
          </div>

          {/* MOBİL ERGONOMİK FİLTRE VE GÖRÜNÜM KONTROL PANELİ */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-2.5 space-y-2">
            {/* Üst Satır: Mahalle/Köy Seçici & Sokak/Cadde Seçici (50% - 50% Grid) */}
            <div className="grid grid-cols-2 gap-2">
              {/* Mahalle / Köy Seçim Butonu */}
              <button
                type="button"
                onClick={() => setShowMahalleModal(true)}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800 flex items-center justify-between shadow-2xs active:scale-95 transition-all min-h-[44px]"
                title="Dağıtım yapılacak mahalle veya köyleri filtreleyin"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="truncate text-left">
                    {selectedMahalleler.length === 0 || selectedMahalleler.length === mahalleler.length
                      ? 'Tüm Mahalle & Köyler'
                      : `${selectedMahalleler.length} Bölge Seçili`}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
              </button>

              {/* Sokak / Cadde Seçim Butonu */}
              <button
                type="button"
                onClick={() => setShowSokakModal(true)}
                className={`w-full py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-between shadow-2xs active:scale-95 transition-all min-h-[44px] ${
                  selectedSokak !== 'HEPSI'
                    ? 'bg-sky-50 border-sky-300 text-sky-950 font-black'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                }`}
                title="Sokağa göre filtreleyin"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Navigation className="w-4 h-4 text-sky-600 shrink-0" />
                  <span className="truncate text-left">
                    {selectedSokak === 'HEPSI' ? 'Tüm Sokaklar' : selectedSokak}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
              </button>
            </div>

            {/* Orta Satır: Adres Sıralaması (Küçükten Büyüğe Kapı No) & Açık Adresleri Göster/Gizle */}
            <div className="grid grid-cols-2 gap-2">
              {/* Sıralama Seçici */}
              <button
                type="button"
                onClick={() => setSortOrder((prev) => (prev === 'ADDRESS_ASC' ? 'NAME_ASC' : 'ADDRESS_ASC'))}
                className={`w-full py-2.5 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs active:scale-95 min-h-[44px] ${
                  sortOrder === 'ADDRESS_ASC'
                    ? 'bg-emerald-50 hover:bg-emerald-100/80 border-emerald-300 text-emerald-950 font-black'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                }`}
                title="Adrese (Kapı No: 1, 2, 3...) veya isme göre sıralayın"
              >
                <ArrowUpDown className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="truncate">
                  {sortOrder === 'ADDRESS_ASC' ? 'Kapı No (1→99)' : 'İsim (A→Z)'}
                </span>
              </button>

              {/* Açık Adresleri Göster / Gizle Butonu */}
              <button
                type="button"
                onClick={() => {
                  const nextState = !showAllOpenAddresses;
                  setShowAllOpenAddresses(nextState);
                  setExpandedAddresses({});
                }}
                className={`w-full py-2.5 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs active:scale-95 min-h-[44px] ${
                  showAllOpenAddresses
                    ? 'bg-amber-500 border-amber-600 text-white shadow-xs font-black'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                }`}
                title="Tüm hanelerin açık adresini toplu olarak göster veya gizle"
              >
                {showAllOpenAddresses ? (
                  <>
                    <EyeOff className="w-4 h-4 text-white shrink-0" />
                    <span className="truncate font-black">Adresleri Gizle</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="truncate">Açık Adresleri Göster</span>
                  </>
                )}
              </button>
            </div>

            {/* Alt Satır: Dağıtım Durumu Filtresi (3'lü Segment: Tüm Kalanlar | Eksik Kalanlar ⚠️ | Bekleyenler) */}
            {selectedQueueTab === 'PENDING_AND_PARTIAL' && (
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80">
                {/* 1. Tüm Kalanlar */}
                <button
                  type="button"
                  onClick={() => onDurumFilterChange('HEPSI')}
                  className={`py-2 px-1 rounded-lg flex flex-col items-center justify-center transition-all min-h-[46px] ${
                    selectedDurumFilter === 'HEPSI'
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-300/80 font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="text-sm font-black leading-tight text-slate-900">
                    {totalPendingCount}
                  </span>
                  <span className="text-[11px] font-bold leading-tight mt-0.5 truncate max-w-full">
                    Tüm Kalanlar
                  </span>
                </button>

                {/* 2. Eksik Kalanlar ⚠️ */}
                <button
                  type="button"
                  onClick={() => onDurumFilterChange('EKSIK')}
                  className={`py-2 px-1 rounded-lg flex flex-col items-center justify-center transition-all min-h-[46px] relative ${
                    selectedDurumFilter === 'EKSIK'
                      ? 'bg-amber-500 text-white shadow-sm font-black'
                      : eksikCount > 0
                      ? 'bg-amber-100/80 border border-amber-300 text-amber-900 font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1 leading-tight">
                    <span className={`text-sm font-black ${selectedDurumFilter === 'EKSIK' ? 'text-white' : eksikCount > 0 ? 'text-amber-900' : 'text-slate-900'}`}>
                      {eksikCount}
                    </span>
                    {eksikCount > 0 && <span className="text-xs">⚠️</span>}
                  </div>
                  <span className="text-[11px] font-bold leading-tight mt-0.5 truncate max-w-full">
                    Eksik Kalanlar
                  </span>
                </button>

                {/* 3. Bekleyenler */}
                <button
                  type="button"
                  onClick={() => onDurumFilterChange('BEKLIYOR')}
                  className={`py-2 px-1 rounded-lg flex flex-col items-center justify-center transition-all min-h-[46px] ${
                    selectedDurumFilter === 'BEKLIYOR'
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-300/80 font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="text-sm font-black leading-tight text-slate-900">
                    {bekleyenCount}
                  </span>
                  <span className="text-[11px] font-bold leading-tight mt-0.5 truncate max-w-full">
                    Bekleyenler
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Selected Neighborhood Chips (Dismissible) */}
          {selectedMahalleler.length > 0 && selectedMahalleler.length < mahalleler.length && (
            <div className="p-2.5 rounded-2xl bg-amber-50/70 border border-amber-200 flex flex-wrap items-center gap-1.5 shadow-xs">
              <span className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-1">
                <MapPin className="w-3 h-3 text-amber-700" />
                Aktif:
              </span>
              {selectedMahalleler.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white border border-amber-300 text-amber-950 text-xs font-bold shadow-xs"
                >
                  <span>{m}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleMahalle(m)}
                    className="text-slate-400 hover:text-rose-600 p-0.5 ml-0.5 transition-colors"
                    aria-label={`${m} filtresini kaldır`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => onMahallelerChange([])}
                className="text-[11px] text-rose-700 hover:text-rose-900 font-bold ml-auto underline"
              >
                Filtreyi Temizle
              </button>
            </div>
          )}

          {/* Quick-filter Street Chips (Hızlı Sokak Seçimi) */}
          {availableStreets.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedSokak('HEPSI')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border shrink-0 ${
                  selectedSokak === 'HEPSI'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-200'
                }`}
              >
                Tüm Sokaklar ({activeDisplayList.length})
              </button>
              {availableStreets.map((st) => (
                <button
                  key={st.sokak}
                  type="button"
                  onClick={() => setSelectedSokak(st.sokak)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border shrink-0 flex items-center gap-1.5 ${
                    selectedSokak === st.sokak
                      ? 'bg-sky-600 text-white border-sky-600 shadow-xs font-black'
                      : 'bg-white text-slate-700 hover:bg-sky-50 border-slate-200'
                  }`}
                >
                  <Navigation className="w-3 h-3 text-sky-500 shrink-0" />
                  <span>{st.sokak}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                      selectedSokak === st.sokak ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {st.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Active Street Filter Bar if a street is selected */}
          {selectedSokak !== 'HEPSI' && (
            <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Compass className="w-4 h-4 text-sky-700 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-sky-800 block">
                    Filtrelenen Sokak / Cadde:
                  </span>
                  <div className="text-xs font-black text-sky-950 truncate flex items-center gap-1.5">
                    <span>{selectedSokak}</span>
                    <span className="text-[11px] font-bold text-sky-700">({streetFilteredList.length} Hane)</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSokak('HEPSI')}
                className="text-xs font-bold text-rose-600 hover:text-rose-800 underline shrink-0 ml-2"
              >
                Sokağı Temizle
              </button>
            </div>
          )}

          {/* Record Counter & Search Tip */}
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              {selectedQueueTab === 'PENDING_AND_PARTIAL' ? 'Kömür Dağıtılacak: ' : 'Teslim Edilen: '}
              <strong className="text-slate-900 font-bold">{activeDisplayList.length} Hane</strong> • Hedef Kota: <strong className="text-amber-700">{defaultQuota} Torba</strong>
            </span>
          </div>
        </>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="p-12 text-center text-slate-500">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm font-semibold">Kayıtlar listeleniyor...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && activeDisplayList.length === 0 && (
        isSearching ? (
          <div className="p-8 text-center rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <p className="text-base font-extrabold text-slate-900">
              Aramanızla Eşleşen Kayıt Bulunamadı
            </p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
              <strong className="text-amber-800">&ldquo;{searchQuery}&rdquo;</strong> için isim, TC Kimlik No, telefon veya adres kaydı bulunamadı.
            </p>
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs inline-flex items-center gap-1.5 transition-all active:scale-95 border border-slate-200 shadow-2xs"
            >
              <span>✕ Aramayı Temizle</span>
            </button>
          </div>
        ) : (
          <div className="p-10 text-center rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="text-sm font-bold text-slate-800">
              {selectedQueueTab === 'PENDING_AND_PARTIAL'
                ? 'Tebrikler! Seçilen mahallelerde teslim edilecek hane kalmadı.'
                : 'Seçilen mahallelerde henüz tamamlanmış teslimat bulunmuyor.'}
            </p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              {selectedQueueTab === 'PENDING_AND_PARTIAL'
                ? 'Tamamlanan teslimatları incelemek için yukarıdaki "Teslim Edilenler" sekmesine geçebilirsiniz.'
                : 'Dağıtıma başlamak için "Teslim Edilecekler" sekmesine dönün.'}
            </p>
          </div>
        )
      )}

      {/* Grouped by Neighborhood / Village - Light Mode */}
      {!isLoading && mahalleKeys.map((mahalleName) => {
        const citizens = groupedByMahalle[mahalleName];
        const incompleteCount = citizens.filter((c) => c.teslimat_durumu === 'EKSIK').length;
        const isKoy = citizens.some((c) => c.yerlesim_tipi === 'KOY') || /(?:Köyü|Koy|Koyu)$/i.test(mahalleName);

        return (
          <div key={mahalleName} className="space-y-2 mb-5">
            {/* Mahalle / Köy Header Badge */}
            <div className="sticky top-[60px] z-20 py-2 px-3 rounded-xl bg-white/95 backdrop-blur border border-slate-200 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2 min-w-0">
                {isKoy ? (
                  <Trees className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider truncate">
                  {mahalleName}
                </h3>
                <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                  isKoy 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}>
                  {isKoy ? 'Köy' : 'Mahalle'}
                </span>
              </div>
              <div className="text-[11px] font-bold text-slate-600 flex items-center gap-2 shrink-0">
                {incompleteCount > 0 && (
                  <span className="text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                    {incompleteCount} Eksik Hane
                  </span>
                )}
                <span>
                  <strong className="text-slate-900">{citizens.length}</strong> Hane
                </span>
              </div>
            </div>

            {/* Citizens Cards */}
            <div className="space-y-2.5">
              {citizens.map((person) => {
                const isComplete = person.teslimat_durumu === 'TAMAMLANDI' || person.teslimat_durumu === 'TESLIM_EDILDI';
                const isPartial = person.teslimat_durumu === 'EKSIK';
                const hedef = person.hedef_torba || defaultQuota;
                const teslim = person.torba_sayisi || 0;
                const kalan = Math.max(0, hedef - teslim);
                const phones = getRecordPhones(person);
                const stInfo = getRecordStreetInfo(person);

                const isExpanded = expandedAddresses[person.id] !== undefined
                  ? expandedAddresses[person.id]
                  : showAllOpenAddresses;
                const hasHouseholdDuplicate = (householdCounts[person.norm_adres] || 0) > 1;

                return (
                  <div
                    key={person.id}
                    className={`citizen-card ${
                      isPartial
                        ? 'border-amber-300 bg-amber-50/20'
                        : hasHouseholdDuplicate
                        ? 'has-household-duplicate'
                        : ''
                    }`}
                  >
                    {/* Top Row: Name + Status Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-extrabold text-slate-900 leading-tight truncate">
                            {person.ad_soyad}
                          </h4>
                          {hasHouseholdDuplicate && (
                            <button
                              onClick={() => onOpenHousehold(person)}
                              title="Aynı adreste başka kişi kayıtlı!"
                              className="badge badge-household shrink-0 text-[10px] py-0.5 px-2 cursor-pointer active:scale-95"
                            >
                              <Users className="w-3 h-3" />
                              Aynı Hane
                            </button>
                          )}
                        </div>

                        {/* TC, Mahalle/Köy & Sokak / Kapı No Info */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs">
                          <span className="font-mono text-amber-800 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            TC: {person.tc_no}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-700 font-medium truncate">
                            {person.mahalle}
                          </span>
                          {stInfo.sokak && (
                            <>
                              <span className="text-slate-400">•</span>
                              <span className="inline-flex items-center gap-1 font-bold text-sky-900 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
                                <Navigation className="w-3 h-3 text-sky-600 shrink-0" />
                                <span>{stInfo.sokak}</span>
                                {stInfo.kapiNo && (
                                  <strong className="text-sky-950 font-black">No: {stInfo.kapiNo}</strong>
                                )}
                                {stInfo.daireNo && (
                                  <span className="text-sky-700">D: {stInfo.daireNo}</span>
                                )}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Distinct Phone Badges */}
                        {phones.length === 1 && (
                          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-600">
                            <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <a
                              href={`tel:${phones[0]}`}
                              className="font-mono font-bold text-slate-800 hover:text-emerald-700 hover:underline"
                              title="Doğrudan Ara"
                            >
                              {formatPhoneDisplay(phones[0])}
                            </a>
                          </div>
                        )}

                        {phones.length >= 2 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <a
                              href={`tel:${phones[0]}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-950 font-mono text-[11px] font-bold transition-all active:scale-95 shadow-2xs"
                              title="1. Numarayı Ara"
                            >
                              <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="text-[10px] font-sans font-extrabold text-emerald-700 mr-0.5">1:</span>
                              <span>{formatPhoneDisplay(phones[0])}</span>
                            </a>
                            <a
                              href={`tel:${phones[1]}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-950 font-mono text-[11px] font-bold transition-all active:scale-95 shadow-2xs"
                              title="2. Numarayı Ara"
                            >
                              <Phone className="w-3 h-3 text-teal-600 shrink-0" />
                              <span className="text-[10px] font-sans font-extrabold text-teal-700 mr-0.5">2:</span>
                              <span>{formatPhoneDisplay(phones[1])}</span>
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Status Badge */}
                      <div className="shrink-0">
                        {isComplete ? (
                          <span className="badge badge-delivered">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Tam ({teslim} Torba)
                          </span>
                        ) : isPartial ? (
                          <span className="badge badge-pending">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Eksik: {teslim}/{hedef}
                          </span>
                        ) : (
                          <span className="badge badge-pending">
                            <Clock className="w-3.5 h-3.5" />
                            Bekliyor ({hedef})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Incomplete Warning Bar on Card */}
                    {isPartial && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-medium">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>Bu haneye daha önce <strong>{teslim} torba</strong> verildi.</span>
                        </div>
                        <span className="text-rose-700 font-bold bg-rose-100 px-2 py-0.5 rounded border border-rose-200 shrink-0">
                          {kalan} Torba Eksik
                        </span>
                      </div>
                    )}

                    {/* Address Display (Collapsible or Open) */}
                    <div className="mt-2.5 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between text-xs">
                        <button
                          onClick={() => toggleAddress(person.id)}
                          className="text-slate-600 hover:text-slate-900 flex items-center gap-1 font-semibold transition-colors"
                        >
                          <MapPin className="w-3.5 h-3.5 text-amber-600" />
                          <span>{isExpanded ? 'Açık Adresi Gizle' : 'Açık Adres Göster'}</span>
                        </button>

                        <button
                          onClick={() => onOpenHousehold(person)}
                          className="text-xs text-sky-700 hover:text-sky-900 font-bold flex items-center gap-0.5"
                        >
                          <span>Hane & Detay</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed animate-in fade-in duration-200">
                          <p className="font-semibold">{person.acik_adres}</p>
                          {person.hane_no && (
                            <span className="inline-block mt-1 text-[11px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">
                              Hane / Kapı No: {person.hane_no}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action Row: Phone & Delivery Action */}
                    <div className="mt-3 flex items-center gap-2">
                      {phones.length === 1 ? (
                        <a
                          href={`tel:${phones[0]}`}
                          className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-emerald-700 hover:text-emerald-800 shrink-0 flex items-center justify-center transition-all active:scale-95 shadow-xs"
                          title={`${formatPhoneDisplay(phones[0])} Numarasını Ara`}
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      ) : phones.length >= 2 ? (
                        <button
                          type="button"
                          onClick={() => setPhoneSelectTarget(person)}
                          className="p-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 shrink-0 flex items-center justify-center gap-1 transition-all active:scale-95 shadow-xs relative"
                          title="Telefon Numarası Seç ve Ara (2 Numara Kayıtlı)"
                        >
                          <Phone className="w-4 h-4 text-emerald-700" />
                          <span className="text-[10px] font-black bg-emerald-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                            2
                          </span>
                        </button>
                      ) : null}

                      {isPartial ? (
                        <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center gap-1.5">
                          <button
                            onClick={() => onOpenDelivery(person)}
                            className="btn-primary flex-1 py-2 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-700 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5"
                          >
                            <PackagePlus className="w-4 h-4 text-white" />
                            <span>Kalanı Tamamla (+{kalan} Torba)</span>
                          </button>
                          {onOpenCancel && (
                            <button
                              onClick={() => onOpenCancel(person)}
                              className="px-2.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1 transition-all active:scale-95 shadow-2xs"
                              title="Hatalı yapılan teslimatı geri al / iptal et"
                            >
                              <Undo2 className="w-3.5 h-3.5 text-rose-600" />
                              <span className="hidden sm:inline">Geri Al</span>
                            </button>
                          )}
                        </div>
                      ) : !isComplete ? (
                        <button
                          onClick={() => onOpenDelivery(person)}
                          className="btn-primary flex-1 py-2 text-xs font-bold"
                        >
                          <PackageCheck className="w-4 h-4 text-white" />
                          Kömür Teslimatı Yap ({hedef} Torba)
                        </button>
                      ) : (
                        <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold">
                          <span className="truncate">✓ {teslim} Torba Tamamlandı</span>
                          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                            {onOpenCancel && (
                              <button
                                onClick={() => onOpenCancel(person)}
                                className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1 transition-all active:scale-95 shadow-2xs"
                                title="Bu hanenin teslimatını iptal et / geri al"
                              >
                                <Undo2 className="w-3.5 h-3.5 text-rose-600" />
                                <span>Teslimatı Geri Al</span>
                              </button>
                            )}
                            <button
                              onClick={() => onOpenHousehold(person)}
                              className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold"
                            >
                              Detay
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* MULTI-MAHALLE SELECTION MODAL */}
      {showMahalleModal && (
        <div className="modal-overlay" onClick={() => setShowMahalleModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center border border-amber-200">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Mahalle & Köy Seçimi</h3>
                  <p className="text-xs text-slate-500">Dağıtım yapılacak mahalle veya köyleri seçin</p>
                </div>
              </div>
              <button
                onClick={() => setShowMahalleModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg text-sm"
              >
                ✕
              </button>
            </div>

            {/* Select All Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <button
                type="button"
                onClick={handleSelectAllMahalle}
                className="flex items-center gap-2 text-xs font-bold text-amber-800 hover:underline"
              >
                {selectedMahalleler.length === mahalleler.length ? (
                  <>
                    <CheckSquare className="w-4 h-4 text-amber-600" />
                    <span>Tüm Seçimleri Kaldır</span>
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4 text-slate-400" />
                    <span>Tüm Bölgeleri Seç ({mahalleler.length})</span>
                  </>
                )}
              </button>

              <span className="text-xs font-semibold text-slate-500">
                {selectedMahalleler.length} / {mahalleler.length} Seçili
              </span>
            </div>

            {/* Neighborhood / Village List with Checkboxes */}
            <div className="py-2 space-y-2 max-h-80 overflow-y-auto">
              {mahalleler.map((m: any) => {
                const isSelected = selectedMahalleler.includes(m.mahalle);
                const isKoy = m.tip === 'KOY' || /(?:Köyü|Koy|Koyu)$/i.test(m.mahalle);
                return (
                  <div
                    key={m.mahalle}
                    onClick={() => handleToggleMahalle(m.mahalle)}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-amber-50 border-amber-300 text-slate-900 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                        isSelected
                          ? 'bg-amber-500 border-amber-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <CheckSquare className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{m.mahalle}</span>
                          <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded border uppercase ${
                            isKoy
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}>
                            {isKoy ? 'Köy' : 'Mahalle'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {m.kisi_sayisi} Hane • {m.tamamlanan || 0} Tamamlandı
                        </div>
                      </div>
                    </div>

                    <span className="text-xs font-bold text-amber-800 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                      {m.kisi_sayisi} Hane
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-200 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onMahallelerChange([]);
                  setShowMahalleModal(false);
                }}
                className="btn-secondary flex-1"
              >
                Tümünü Göster
              </button>
              <button
                type="button"
                onClick={() => setShowMahalleModal(false)}
                className="btn-primary flex-1 font-bold"
              >
                Filtreyi Uygula ({selectedMahalleler.length > 0 ? selectedMahalleler.length : 'Tümü'})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SOKAK / CADDE SEÇİM MODALI */}
      {showSokakModal && (
        <div className="modal-overlay" onClick={() => setShowSokakModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                  <Navigation className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Sokak / Cadde Seçimi</h3>
                  <p className="text-xs text-slate-500">Dağıtım yapacağınız sokağı seçin</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSokakModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            {/* Sokak Arama Çubuğu */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={sokakSearchTerm}
                onChange={(e) => setSokakSearchTerm(e.target.value)}
                placeholder="Sokak veya cadde adı ara..."
                className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
              {sokakSearchTerm && (
                <button
                  type="button"
                  onClick={() => setSokakSearchTerm('')}
                  className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-700 p-0.5"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sokak Listesi */}
            <div className="py-1 space-y-1.5 max-h-80 overflow-y-auto">
              {/* Tüm Sokaklar Seçeneği */}
              <div
                onClick={() => {
                  setSelectedSokak('HEPSI');
                  setShowSokakModal(false);
                }}
                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  selectedSokak === 'HEPSI'
                    ? 'bg-sky-50 border-sky-300 text-slate-900 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Compass className={`w-4 h-4 ${selectedSokak === 'HEPSI' ? 'text-sky-600' : 'text-slate-400'}`} />
                  <span className="text-xs font-bold text-slate-900">Tüm Sokakları Göster</span>
                </div>
                <span className="text-xs font-bold text-sky-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {activeDisplayList.length} Hane
                </span>
              </div>

              {availableStreets
                .filter(
                  (st) =>
                    !sokakSearchTerm.trim() ||
                    st.sokak.toLocaleLowerCase('tr').includes(sokakSearchTerm.toLocaleLowerCase('tr'))
                )
                .map((st) => {
                  const isSelected = selectedSokak === st.sokak;
                  return (
                    <div
                      key={st.sokak}
                      onClick={() => {
                        setSelectedSokak(st.sokak);
                        setShowSokakModal(false);
                      }}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-sky-50 border-sky-300 text-slate-900 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Navigation className={`w-4 h-4 shrink-0 ${isSelected ? 'text-sky-600' : 'text-slate-400'}`} />
                        <span className="text-xs font-bold text-slate-900 truncate">{st.sokak}</span>
                      </div>
                      <span className="text-xs font-bold text-sky-800 bg-sky-50/80 px-2 py-0.5 rounded border border-sky-200 shrink-0 ml-2">
                        {st.count} Hane
                      </span>
                    </div>
                  );
                })}

              {availableStreets.filter(
                (st) =>
                  !sokakSearchTerm.trim() ||
                  st.sokak.toLocaleLowerCase('tr').includes(sokakSearchTerm.toLocaleLowerCase('tr'))
              ).length === 0 && (
                <div className="p-6 text-center text-xs text-slate-500">
                  Aramanızla eşleşen sokak bulunamadı.
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedSokak('HEPSI');
                  setShowSokakModal(false);
                }}
                className="btn-secondary flex-1 text-xs py-2.5 font-bold"
              >
                Filtreyi Temizle
              </button>
              <button
                type="button"
                onClick={() => setShowSokakModal(false)}
                className="btn-primary flex-1 text-xs py-2.5 font-bold"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ÇİFT TELEFON NUMARASI ARAMA SEÇİM MODALI */}
      {phoneSelectTarget && (() => {
        const targetPhones = getRecordPhones(phoneSelectTarget);
        return (
          <div className="modal-overlay" onClick={() => setPhoneSelectTarget(null)}>
            <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-200">
                    <Phone className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 leading-tight">Telefon Numarası Seçin</h3>
                    <p className="text-xs text-slate-500 font-medium">Aramak istediğiniz numarayı seçiniz</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPhoneSelectTarget(null)}
                  className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg text-sm"
                  aria-label="Kapat"
                >
                  ✕
                </button>
              </div>

              {/* Vatandaş Bilgi Kartı */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 mb-4">
                <h4 className="text-sm font-extrabold text-slate-900 truncate">{phoneSelectTarget.ad_soyad}</h4>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  TC: {phoneSelectTarget.tc_no} • {phoneSelectTarget.mahalle}
                </p>
              </div>

              {/* Telefon Seçenekleri */}
              <div className="space-y-3">
                {targetPhones.map((ph, idx) => (
                  <a
                    key={idx}
                    href={`tel:${ph}`}
                    onClick={() => setPhoneSelectTarget(null)}
                    className="w-full p-3.5 rounded-2xl bg-white hover:bg-emerald-50/60 border-2 border-slate-200 hover:border-emerald-500 transition-all flex items-center justify-between shadow-xs active:scale-[0.98] group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-sm group-hover:scale-105 transition-transform shrink-0">
                        <Phone className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200 inline-block mb-0.5">
                          {idx === 0 ? '1. Telefon Numarası' : '2. Telefon Numarası'}
                        </span>
                        <p className="text-base font-mono font-black text-slate-900">
                          {formatPhoneDisplay(ph)}
                        </p>
                      </div>
                    </div>

                    <div className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm shrink-0">
                      <span>Ara</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </a>
                ))}
              </div>

              <div className="pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setPhoneSelectTarget(null)}
                  className="btn-secondary w-full py-2.5 font-bold"
                >
                  Vazgeç / Kapat
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
