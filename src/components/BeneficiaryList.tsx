'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  Search, MapPin, Phone, PackageCheck, Eye, EyeOff, Users, 
  CheckCircle2, Clock, Filter, AlertCircle, ChevronRight, ChevronDown, ChevronLeft,
  ChevronsLeft, ChevronsRight, AlertTriangle, 
  PackagePlus, CheckSquare, Square, X, SlidersHorizontal, ArrowRight, Undo2,
  Navigation, ArrowUpDown, Trees, Building2, Compass, PenTool,
  List, LayoutGrid, Edit3, Shield, FileSpreadsheet, FileText, Ban
} from 'lucide-react';
import { showAlert, showToast } from './GlobalAlertManager';
import { 
  getRecordPhones, 
  formatPhoneDisplay, 
  getRecordStreetInfo, 
  compareByAddressAsc, 
  compareBySiraNo,
  cleanTurkishText,
  cleanTcNo,
  turkishIncludes,
  isBirebirBeneficiaryMatch,
  getBeneficiaryListTypeInfo
} from '@/lib/normalizer';

interface BeneficiaryListProps {
  records: any[];
  mahalleler: any[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedMahalleler: string[];
  onMahallelerChange: (m: string[]) => void;
  selectedQueueTab: 'PENDING_AND_PARTIAL' | 'DELIVERED' | 'EXCLUDED';
  onQueueTabChange: (tab: 'PENDING_AND_PARTIAL' | 'DELIVERED' | 'EXCLUDED') => void;
  selectedDurumFilter: string;
  onDurumFilterChange: (d: string) => void;
  onOpenDelivery: (person: any) => void;
  onOpenHousehold: (person: any) => void;
  onOpenCancel?: (person: any) => void;
  onOpenEdit?: (person: any) => void;
  onOpenKomurIptal?: (person: any) => void;
  onToggleSignature?: (person: any) => void;
  onNavigateToRoute?: () => void;
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
  onOpenEdit,
  onOpenKomurIptal,
  onToggleSignature,
  onNavigateToRoute,
  defaultQuota = 34,
  isLoading = false
}: BeneficiaryListProps) {
  const [showAllOpenAddresses, setShowAllOpenAddresses] = useState(false);
  const [expandedAddresses, setExpandedAddresses] = useState<Record<number, boolean>>({});
  const [localSignatures, setLocalSignatures] = useState<Record<string, boolean>>({});
  const [showMahalleModal, setShowMahalleModal] = useState(false);
  const [showSokakModal, setShowSokakModal] = useState(false);
  const [phoneSelectTarget, setPhoneSelectTarget] = useState<any | null>(null);
  const [desktopViewMode, setDesktopViewMode] = useState<'TABLE' | 'CARDS'>('TABLE');
  const [sortOrder, setSortOrder] = useState<'SIRA_ASC' | 'ADDRESS_ASC' | 'NAME_ASC'>('SIRA_ASC');
  const [selectedSokak, setSelectedSokak] = useState<string>('HEPSI');
  const [sokakSearchTerm, setSokakSearchTerm] = useState('');

  // Sayfalama Durumu (Kullanıcı isteği doğrultusunda sayfa başına varsayılan 250 kayıt)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(250);

  // Bulk Signature & Signature Status Filter
  const [isBulkSignMode, setIsBulkSignMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [signatureFilter, setSignatureFilter] = useState<'ALL' | 'SIGNED' | 'UNSIGNED'>('ALL');
  const [isBulkSignLoading, setIsBulkSignLoading] = useState(false);

  // Liste Türü Filtresi (Tümü, Ana Liste, Ek Listeler, Sigortalılar Listesi)
  const [selectedListTypeFilter, setSelectedListTypeFilter] = useState<'HEPSI' | 'ANA_LISTE' | 'EK_LISTE' | 'SIGORTALI'>('HEPSI');

  // Filtre veya arama değiştiğinde sayfa numarasını otomatik olarak 1'e sıfırla
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedMahalleler, selectedSokak, selectedDurumFilter, selectedQueueTab, signatureFilter, selectedListTypeFilter]);

  const handleToggleCardSelect = (personId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  };

  const handleBulkSignSubmit = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkSignLoading(true);
    const idsArray = Array.from(selectedIds);

    // Optimistic local update
    setLocalSignatures((prev) => {
      const next = { ...prev };
      idsArray.forEach((id) => {
        next[id] = true;
      });
      return next;
    });

    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'BULK_SIGN',
          beneficiary_ids: idsArray,
          imza_durumu: 'IMZALANDI'
        })
      });
      const data = await res.json();
      if (data.success) {
        setSelectedIds(new Set());
        setIsBulkSignMode(false);
        showToast({
          type: 'success',
          title: 'Toplu İmza Kaydedildi',
          message: `${idsArray.length} hanenin imzası başarıyla kaydedildi.`
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('komur_bulk_signed', {
              detail: { ids: idsArray, syncTime: data.syncTime }
            })
          );
        }
      } else {
        showAlert({
          title: 'İşlem Başarısız',
          message: data.error || 'İmzalar toplu olarak kaydedilemedi',
          type: 'error'
        });
      }
    } catch (err: any) {
      showAlert({
        title: 'Hata',
        message: 'Hata: ' + err.message,
        type: 'error'
      });
    } finally {
      setIsBulkSignLoading(false);
    }
  };

  const handleToggleSignature = async (person: any) => {
    const personId = String(person.id);
    if (onToggleSignature) {
      onToggleSignature(person);
      return;
    }
    const currentSigned = localSignatures[personId] !== undefined
      ? localSignatures[personId]
      : person.imza_durumu === 'IMZALANDI';
    const nextSigned = !currentSigned;

    // Optimistic UI update
    setLocalSignatures((prev) => ({ ...prev, [personId]: nextSigned }));

    try {
      await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SIGN_BENEFICIARY',
          beneficiary_id: personId,
          imza_durumu: nextSigned ? 'IMZALANDI' : 'BEKLIYOR'
        })
      });
    } catch (err) {
      console.error('Error toggling signature:', err);
      // Revert on error
      setLocalSignatures((prev) => ({ ...prev, [personId]: currentSigned }));
    }
  };

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
  // 1. Teslim Edilecekler (Pending + Partial) - Teslim edilenler ve Kömür İptal Edilenler burada ASLA görünmez!
  // 2. Teslim Edilenler (Completed) - Kömür İptal Edilenler burada görünmez!
  // 3. Kömür Verilmeyecekler (İptal Edilenler / Hak Sahipliği İptali - Eşi kömür almış, doğalgaza geçmiş vb.)
  const allPendingRecords = useMemo(() => {
    return records.filter((r) => {
      const isComplete = r.teslimat_durumu === 'TAMAMLANDI' || r.teslimat_durumu === 'TESLIM_EDILDI';
      const isExcluded = Boolean(r.komur_verilmeyecek);
      return !isComplete && !isExcluded;
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
    return records.filter((r) => {
      const isComplete = r.teslimat_durumu === 'TAMAMLANDI' || r.teslimat_durumu === 'TESLIM_EDILDI';
      const isExcluded = Boolean(r.komur_verilmeyecek);
      return isComplete && !isExcluded;
    });
  }, [records]);

  // Kömür Verilmeyecekler (İptal Edilen Hak Sahipleri)
  const excludedRecords = useMemo(() => {
    return records.filter((r) => Boolean(r.komur_verilmeyecek));
  }, [records]);

  const isSearching = Boolean(searchQuery && searchQuery.trim().length > 0);

  // In-memory Turkish-aware search across all cached records:
  // TC Kimlik No ve Ad Soyad alanlarında BİREBİR arama (Adreslerde arama yapılmaz)
  const searchFilteredRecords = useMemo(() => {
    if (!isSearching) return [];
    return records.filter((r) => isBirebirBeneficiaryMatch(r, searchQuery));
  }, [records, isSearching, searchQuery]);

  // Active list to display based on search mode or selectedQueueTab
  const activeDisplayList = isSearching
    ? searchFilteredRecords
    : selectedQueueTab === 'PENDING_AND_PARTIAL'
    ? filteredPendingRecords
    : selectedQueueTab === 'DELIVERED'
    ? deliveredRecords
    : excludedRecords;

  // Filter by selected neighborhoods (if any)
  const mahalleFilteredList = useMemo(() => {
    if (!selectedMahalleler || selectedMahalleler.length === 0) {
      return activeDisplayList;
    }
    const set = new Set(selectedMahalleler);
    return activeDisplayList.filter((r) => set.has(r.mahalle));
  }, [activeDisplayList, selectedMahalleler]);

  const totalPendingCount = allPendingRecords.length;
  const eksikCount = allPendingRecords.filter((r) => r.teslimat_durumu === 'EKSIK').length;
  const bekleyenCount = allPendingRecords.filter((r) => r.teslimat_durumu === 'BEKLIYOR' || !r.teslimat_durumu).length;

  // Extract all available streets across current active records
  const availableStreets = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of mahalleFilteredList) {
      const st = getRecordStreetInfo(r);
      const sName = st.sokak || r.mahalle || 'Belirtilmemiş';
      map.set(sName, (map.get(sName) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([sokak, count]) => ({ sokak, count }))
      .sort((a, b) => a.sokak.localeCompare(b.sokak, 'tr'));
  }, [mahalleFilteredList]);

  // If selected street is no longer present, reset to HEPSI
  useEffect(() => {
    if (selectedSokak !== 'HEPSI' && !availableStreets.some((s) => s.sokak === selectedSokak)) {
      setSelectedSokak('HEPSI');
    }
  }, [availableStreets, selectedSokak]);

  const totalSignedCount = useMemo(() => {
    return mahalleFilteredList.filter((r) => {
      const pId = String(r.id);
      return localSignatures[pId] !== undefined ? localSignatures[pId] : r.imza_durumu === 'IMZALANDI';
    }).length;
  }, [mahalleFilteredList, localSignatures]);

  // Filter records by selected street, signature status and list type
  const streetFilteredList = useMemo(() => {
    let list = mahalleFilteredList;
    if (selectedSokak !== 'HEPSI') {
      list = list.filter((r) => {
        const st = getRecordStreetInfo(r);
        return st.sokak === selectedSokak;
      });
    }
    if (signatureFilter === 'SIGNED') {
      list = list.filter((r) => {
        const pId = String(r.id);
        return localSignatures[pId] !== undefined ? localSignatures[pId] : r.imza_durumu === 'IMZALANDI';
      });
    } else if (signatureFilter === 'UNSIGNED') {
      list = list.filter((r) => {
        const pId = String(r.id);
        const signed = localSignatures[pId] !== undefined ? localSignatures[pId] : r.imza_durumu === 'IMZALANDI';
        return !signed;
      });
    }
    if (selectedListTypeFilter !== 'HEPSI') {
      list = list.filter((r) => getBeneficiaryListTypeInfo(r).type === selectedListTypeFilter);
    }
    return list;
  }, [mahalleFilteredList, selectedSokak, signatureFilter, localSignatures, selectedListTypeFilter]);

  const listTypeCounts = useMemo(() => {
    let ana = 0;
    let ek = 0;
    let sig = 0;
    for (const r of mahalleFilteredList) {
      const t = getBeneficiaryListTypeInfo(r).type;
      if (t === 'SIGORTALI') sig++;
      else if (t === 'EK_LISTE') ek++;
      else ana++;
    }
    return { ana, ek, sig, total: mahalleFilteredList.length };
  }, [mahalleFilteredList]);

  // Sayfalama Hesaplamaları (Sayfa başına varsayılan 250 kayıt)
  const totalFilteredRecords = streetFilteredList.length;
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalFilteredRecords / pageSize)) : 1;
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = pageSize > 0 ? (safeCurrentPage - 1) * pageSize : 0;
  const endIndex = pageSize > 0 ? Math.min(startIndex + pageSize, totalFilteredRecords) : totalFilteredRecords;

  const pagedList = useMemo(() => {
    if (pageSize <= 0) return streetFilteredList;
    return streetFilteredList.slice(startIndex, endIndex);
  }, [streetFilteredList, startIndex, endIndex, pageSize]);

  // Group active records of CURRENT PAGE by mahalle / village
  const groupedByMahalle = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const r of pagedList) {
      const m = r.mahalle || 'Belirtilmemiş';
      if (!groups[m]) {
        groups[m] = [];
      }
      groups[m].push(r);
    }
    // Sort each settlement according to selected sortOrder
    Object.keys(groups).forEach((key) => {
      if (sortOrder === 'SIRA_ASC') {
        groups[key].sort(compareBySiraNo);
      } else if (sortOrder === 'ADDRESS_ASC') {
        groups[key].sort(compareByAddressAsc);
      } else {
        groups[key].sort((a, b) => (a.ad_soyad || '').localeCompare(b.ad_soyad || '', 'tr'));
      }
    });
    return groups;
  }, [pagedList, sortOrder]);

  const mahalleKeys = Object.keys(groupedByMahalle).sort((a, b) => a.localeCompare(b, 'tr'));

  // Sayfa numaralandırma penceresi
  const visiblePageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: number[] = [];
    pages.push(1);
    if (safeCurrentPage > 3) {
      pages.push(-1); // Ellipsis
    }
    const start = Math.max(2, safeCurrentPage - 1);
    const end = Math.min(totalPages - 1, safeCurrentPage + 1);
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    if (safeCurrentPage < totalPages - 2) {
      pages.push(-1); // Ellipsis
    }
    pages.push(totalPages);
    return pages;
  }, [totalPages, safeCurrentPage]);

  const handlePageChange = (newPage: number) => {
    const target = Math.min(Math.max(1, newPage), totalPages);
    setCurrentPage(target);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 120, behavior: 'smooth' });
    }
  };

  // Modern Sayfalama Çubuğu Bileşeni (Üst ve Alt için Ortak)
  const renderPaginationBar = (position: 'top' | 'bottom') => {
    if (totalFilteredRecords === 0) return null;
    return (
      <div className={`p-3 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 ${
        position === 'top' ? 'mb-2' : 'mt-4'
      }`}>
        {/* Sol Taraf: Sayfa ve Kayıt Göstergesi + Sayfa Boyutu Seçici */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-medium">
            Sayfa <strong className="text-slate-900 font-black">{safeCurrentPage}</strong> / <strong className="text-slate-900 font-black">{totalPages}</strong>
          </span>
          <span className="text-slate-300">•</span>
          <span>
            Toplam <strong className="text-amber-800 font-black">{totalFilteredRecords.toLocaleString('tr-TR')}</strong> Hane
            {totalFilteredRecords > 0 && (
              <> (Bu Sayfada: <strong className="text-slate-900 font-bold">{startIndex + 1} - {endIndex}</strong>)</>
            )}
          </span>

          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-200">
            <span className="text-[11px] text-slate-400 font-bold">Sayfa Başı:</span>
            {[100, 250, 500].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-extrabold transition-all ${
                  pageSize === size
                    ? 'bg-amber-500 text-white shadow-2xs font-black'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
                title={`Her sayfada ${size} kayıt göster`}
              >
                {size}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setPageSize(0);
                setCurrentPage(1);
              }}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-extrabold transition-all ${
                pageSize === 0
                  ? 'bg-amber-500 text-white shadow-2xs font-black'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
              title="Tüm kayıtları tek sayfada göster"
            >
              Tümü
            </button>
          </div>
        </div>

        {/* Sağ Taraf: Sayfa Butonları */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={safeCurrentPage === 1}
              onClick={() => handlePageChange(1)}
              className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none text-slate-700 transition-colors"
              title="İlk Sayfa"
              aria-label="İlk Sayfa"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={safeCurrentPage === 1}
              onClick={() => handlePageChange(safeCurrentPage - 1)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none text-xs font-bold text-slate-700 flex items-center gap-1 transition-colors"
              title="Önceki Sayfa"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Önceki</span>
            </button>

            <div className="flex items-center gap-1">
              {visiblePageNumbers.map((p, idx) => {
                if (p === -1) {
                  return (
                    <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 font-bold text-xs select-none">
                      •••
                    </span>
                  );
                }
                const isActive = p === safeCurrentPage;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handlePageChange(p)}
                    className={`min-w-[32px] h-8 px-2 rounded-xl text-xs font-black transition-all ${
                      isActive
                        ? 'bg-amber-500 text-white shadow-xs scale-105'
                        : 'border border-slate-200 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={safeCurrentPage === totalPages}
              onClick={() => handlePageChange(safeCurrentPage + 1)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none text-xs font-bold text-slate-700 flex items-center gap-1 transition-colors"
              title="Sonraki Sayfa"
            >
              <span className="hidden sm:inline">Sonraki</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={safeCurrentPage === totalPages}
              onClick={() => handlePageChange(totalPages)}
              className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none text-slate-700 transition-colors"
              title="Son Sayfa"
              aria-label="Son Sayfa"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };


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
            placeholder="TC Kimlik No veya Hak Sahibi (Ad Soyad) ile ara..."
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
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 shadow-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-amber-950">
              <Search className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Arama Sonucu:</span>
              <strong className="text-slate-900 font-extrabold">{totalFilteredRecords} Hane Bulundu</strong>

              {/* Aktif Filtre Etiketleri */}
              {selectedMahalleler.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded-lg border border-amber-300">
                  <MapPin className="w-3 h-3 text-amber-700" />
                  <span>{selectedMahalleler.length === 1 ? selectedMahalleler[0] : `${selectedMahalleler.length} Mahalle`}</span>
                  <button
                    type="button"
                    onClick={() => onMahallelerChange([])}
                    className="hover:text-rose-700 ml-0.5 font-black text-xs"
                    title="Mahalle filtresini kaldır"
                  >
                    ✕
                  </button>
                </span>
              )}

              {selectedSokak !== 'HEPSI' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-900 bg-sky-100/90 px-2 py-0.5 rounded-lg border border-sky-300">
                  <Navigation className="w-3 h-3 text-sky-700" />
                  <span>{selectedSokak}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedSokak('HEPSI')}
                    className="hover:text-rose-700 ml-0.5 font-black text-xs"
                    title="Sokak filtresini kaldır"
                  >
                    ✕
                  </button>
                </span>
              )}

              {selectedListTypeFilter !== 'HEPSI' && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg border ${
                  selectedListTypeFilter === 'SIGORTALI'
                    ? 'bg-purple-100 text-purple-950 border-purple-300'
                    : selectedListTypeFilter === 'EK_LISTE'
                    ? 'bg-amber-100 text-amber-950 border-amber-300'
                    : 'bg-sky-100 text-sky-950 border-sky-300'
                }`}>
                  {selectedListTypeFilter === 'SIGORTALI' && <Shield className="w-3 h-3 text-purple-700" />}
                  {selectedListTypeFilter === 'EK_LISTE' && <FileSpreadsheet className="w-3 h-3 text-amber-700" />}
                  {selectedListTypeFilter === 'ANA_LISTE' && <FileText className="w-3 h-3 text-sky-700" />}
                  <span>{selectedListTypeFilter === 'SIGORTALI' ? 'Sigortalılar Listesi' : selectedListTypeFilter === 'EK_LISTE' ? 'Ek Listeler' : 'Ana Liste'}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedListTypeFilter('HEPSI')}
                    className="hover:text-rose-700 ml-0.5 font-black text-xs"
                    title="Liste filtresini kaldır"
                  >
                    ✕
                  </button>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {(selectedMahalleler.length > 0 || selectedSokak !== 'HEPSI') && (
                <button
                  type="button"
                  onClick={() => {
                    onMahallelerChange([]);
                    setSelectedSokak('HEPSI');
                  }}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900 underline active:scale-95"
                >
                  Filtreleri Temizle
                </button>
              )}
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="text-xs font-bold text-rose-600 hover:text-rose-800 underline active:scale-95"
              >
                Aramayı Temizle
              </button>
            </div>
          </div>

          {/* Filtreli Mahallede/Sokakta 0 kayıt çıkıp diğer mahallelerde eşleşen kayıt varsa kullanıcıya anında çözüm sun */}
          {totalFilteredRecords === 0 && searchFilteredRecords.length > 0 && (
            <div className="pt-2 border-t border-amber-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-amber-900 font-medium">
                Seçili filtrelerde kayıt bulunamadı ancak diğer mahallelerde <strong className="text-slate-900 font-extrabold">{searchFilteredRecords.length} hane</strong> bulunmaktadır.
              </span>
              <button
                type="button"
                onClick={() => {
                  onMahallelerChange([]);
                  setSelectedSokak('HEPSI');
                }}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-extrabold text-xs shadow-xs active:scale-95 transition-all"
              >
                Tüm Mahallelerde Göster ({searchFilteredRecords.length})
              </button>
            </div>
          )}
        </div>
      )}

      {/* NORMAL MOD (Arama yapılmadığında görünen kontroller) */}
      {!isSearching && (
        <>
          {/* DYNAMIC QUEUE TOGGLE TABS (Teslim Edilecekler vs Teslim Edilenler vs Kömür Verilmeyecekler) */}
          <div className="p-1 rounded-2xl bg-slate-200/90 border border-slate-300/70 grid grid-cols-3 gap-1 shadow-inner">
            <button
              type="button"
              onClick={() => onQueueTabChange('PENDING_AND_PARTIAL')}
              className={`py-2.5 px-1.5 sm:px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all min-h-[44px] ${
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
              className={`py-2.5 px-1.5 sm:px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all min-h-[44px] ${
                selectedQueueTab === 'DELIVERED'
                  ? 'bg-white text-emerald-800 shadow-sm border border-slate-200/90'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">Teslim Edilen ({deliveredRecords.length})</span>
            </button>

            <button
              type="button"
              onClick={() => onQueueTabChange('EXCLUDED')}
              className={`py-2.5 px-1.5 sm:px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all min-h-[44px] ${
                selectedQueueTab === 'EXCLUDED'
                  ? 'bg-white text-rose-800 shadow-sm border border-rose-300'
                  : 'text-slate-600 hover:text-rose-900'
              }`}
              title="Eşi kömür almış, doğalgaza geçmiş vb. kömür verilmeyecek (iptal) hak sahipleri"
            >
              <Ban className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="truncate">Verilmeyecek ({excludedRecords.length})</span>
            </button>
          </div>

          {/* MOBİL VE MASAÜSTÜ ERGONOMİK FİLTRE VE GÖRÜNÜM KONTROL PANELİ */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-2.5 space-y-2">
            {/* Mahalle/Köy, Sokak/Cadde, Adres Sıralaması & Açık Adresleri Göster/Gizle (Mobil: 2x2, Masaüstü: 4'lü Bar) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
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

              {/* Sıralama Seçici */}
              <button
                type="button"
                onClick={() => {
                  setSortOrder((prev) => {
                    if (prev === 'SIRA_ASC') return 'ADDRESS_ASC';
                    if (prev === 'ADDRESS_ASC') return 'NAME_ASC';
                    return 'SIRA_ASC';
                  });
                }}
                className={`w-full py-2.5 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs active:scale-95 min-h-[44px] ${
                  sortOrder === 'SIRA_ASC'
                    ? 'bg-amber-500 border-amber-600 text-white font-black'
                    : sortOrder === 'ADDRESS_ASC'
                    ? 'bg-emerald-50 hover:bg-emerald-100/80 border-emerald-300 text-emerald-950 font-black'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                }`}
                title="İmza listesi sırası, kapı numarası veya isme göre sıralayın"
              >
                <ArrowUpDown className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="truncate">
                  {sortOrder === 'SIRA_ASC' ? 'İmza Sırası (1→99)' : sortOrder === 'ADDRESS_ASC' ? 'Kapı No (1→99)' : 'İsim (A→Z)'}
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

            {/* MASAÜSTÜ ÖZEL GÖRÜNÜM SEÇİCİ & HIZLI SIRALAMA PANELİ (Mobil Hariç) */}
            <div className="hidden lg:flex items-center justify-between gap-3 pt-2.5 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Geniş Ekran Modu:</span>
                <div className="inline-flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setDesktopViewMode('TABLE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                      desktopViewMode === 'TABLE'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/90 font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Kömür almayan hak sahiplerini sade liste (Ad Soyad, TC, Tel, Adres) halinde görüntüle"
                  >
                    <List className="w-3.5 h-3.5 text-amber-600" />
                    <span>Liste Halinde Görüntüle</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDesktopViewMode('CARDS')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                      desktopViewMode === 'CARDS'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/90 font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Geniş ekran 2 sütunlu kart görünümü"
                  >
                    <LayoutGrid className="w-3.5 h-3.5 text-slate-500" />
                    <span>Kart Görünümü</span>
                  </button>
                </div>
              </div>

              {/* Masaüstü Sıralama Butonları */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-bold">Kayıt Sıralaması:</span>
                <button
                  type="button"
                  onClick={() => setSortOrder('SIRA_ASC')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                    sortOrder === 'SIRA_ASC'
                      ? 'bg-amber-500 text-white border-amber-600 font-black shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="İmza listesi sırası: Ana liste 1, 2, 3... Ek listeler Ek1 - 1, Ek1 - 2..."
                >
                  İmza Sırası (1→99 / Ek)
                </button>
                <button
                  type="button"
                  onClick={() => setSortOrder('ADDRESS_ASC')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                    sortOrder === 'ADDRESS_ASC'
                      ? 'bg-emerald-600 text-white border-emerald-700 font-black shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Sokak ve kapı numarasına göre sırala"
                >
                  Kapı No (1→99)
                </button>
                <button
                  type="button"
                  onClick={() => setSortOrder('NAME_ASC')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                    sortOrder === 'NAME_ASC'
                      ? 'bg-sky-600 text-white border-sky-700 font-black shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="İsme göre alfabetik sırala"
                >
                  İsim (A→Z)
                </button>
              </div>
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

            {/* İmza Durumu Filtresi & Toplu İmza Seçim Butonu */}
            <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setSignatureFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    signatureFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-2xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tümü ({mahalleFilteredList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSignatureFilter('SIGNED')}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                    signatureFilter === 'SIGNED'
                      ? 'bg-emerald-600 text-white shadow-2xs font-black'
                      : 'text-emerald-800 hover:text-emerald-950'
                  }`}
                >
                  <PenTool className="w-3 h-3" />
                  <span>İmzalı ({totalSignedCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSignatureFilter('UNSIGNED')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    signatureFilter === 'UNSIGNED'
                      ? 'bg-white text-slate-900 shadow-2xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  İmzasız ({Math.max(0, mahalleFilteredList.length - totalSignedCount)})
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsBulkSignMode((prev) => !prev);
                  setSelectedIds(new Set());
                }}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 ${
                  isBulkSignMode
                    ? 'bg-emerald-600 text-white border-emerald-600 font-black'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>{isBulkSignMode ? 'Seçim Modunu Kapat' : 'Toplu İmza Seç'}</span>
                {isBulkSignMode && selectedIds.size > 0 && (
                  <span className="bg-emerald-800 text-white px-1.5 py-0.2 rounded-full text-[10px]">
                    {selectedIds.size}
                  </span>
                )}
              </button>
            </div>

            {/* Liste / Islak İmza Dosyası Türü Filtresi */}
            <div className="pt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5 overflow-x-auto text-xs w-full sm:w-auto">
                <span className="text-[11px] font-bold text-slate-500 shrink-0">İmza Dosyası:</span>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setSelectedListTypeFilter('HEPSI')}
                    className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap ${
                      selectedListTypeFilter === 'HEPSI'
                        ? 'bg-white text-slate-900 shadow-2xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tüm Listeler ({listTypeCounts.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedListTypeFilter('ANA_LISTE')}
                    className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${
                      selectedListTypeFilter === 'ANA_LISTE'
                        ? 'bg-sky-600 text-white shadow-2xs font-black'
                        : 'text-sky-900 hover:bg-sky-50'
                    }`}
                  >
                    <FileText className="w-3 h-3" />
                    <span>Ana Liste ({listTypeCounts.ana})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedListTypeFilter('EK_LISTE')}
                    className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${
                      selectedListTypeFilter === 'EK_LISTE'
                        ? 'bg-amber-600 text-white shadow-2xs font-black'
                        : 'text-amber-900 hover:bg-amber-50'
                    }`}
                  >
                    <FileSpreadsheet className="w-3 h-3" />
                    <span>Ek Listeler ({listTypeCounts.ek})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedListTypeFilter('SIGORTALI')}
                    className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${
                      selectedListTypeFilter === 'SIGORTALI'
                        ? 'bg-purple-600 text-white shadow-2xs font-black'
                        : 'text-purple-900 hover:bg-purple-50'
                    }`}
                  >
                    <Shield className="w-3 h-3 text-purple-600 group-hover:text-purple-800" />
                    <span>Sigortalılar ({listTypeCounts.sig})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Toplu İmza Seçim Yardımcı Çubuğu */}
          {isBulkSignMode && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs font-bold text-emerald-950 shadow-xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-emerald-700" />
                <span>
                  <strong>{selectedIds.size}</strong> hane seçildi
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const allIds = new Set<string>();
                    pagedList.forEach((r) => allIds.add(String(r.id)));
                    setSelectedIds(allIds);
                  }}
                  className="text-emerald-800 hover:text-emerald-950 underline"
                  title="Sadece mevcut sayfadaki haneleri seç"
                >
                  Bu Sayfayı Seç ({pagedList.length})
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => {
                    const allIds = new Set<string>();
                    streetFilteredList.forEach((r) => allIds.add(String(r.id)));
                    setSelectedIds(allIds);
                  }}
                  className="text-sky-800 hover:text-sky-950 underline"
                  title="Filtrelenmiş tüm sayfalardaki haneleri seç"
                >
                  Tüm Sayfaları Seç ({streetFilteredList.length})
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-rose-700 hover:text-rose-900 underline"
                >
                  Temizle
                </button>
              </div>
            </div>
          )}

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
                Tüm Sokaklar ({mahalleFilteredList.length})
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
              {selectedQueueTab === 'PENDING_AND_PARTIAL'
                ? 'Kömür Dağıtılacak: '
                : selectedQueueTab === 'DELIVERED'
                ? 'Teslim Edilen: '
                : 'Kömür Verilmeyecek (İptal): '}
              <strong className="text-slate-900 font-bold">{totalFilteredRecords} Hane</strong> • Hedef Kota: <strong className="text-amber-700">{defaultQuota} Torba</strong>
            </span>
          </div>
        </>
      )}

      {/* Loading state: Sadece hafızada hiç kayıt yokken ilk yükleme spinner'ı göster */}
      {isLoading && records.length === 0 && (
        <div className="p-12 text-center text-slate-500">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm font-semibold">Kayıtlar listeleniyor...</p>
        </div>
      )}

      {/* Empty State */}
      {(!isLoading || records.length > 0) && totalFilteredRecords === 0 && (
        isSearching ? (
          <div className="p-8 text-center rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <p className="text-base font-extrabold text-slate-900">
              Aramanızla Eşleşen Kayıt Bulunamadı
            </p>
            {selectedMahalleler.length > 0 && searchFilteredRecords.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                  Seçili bölge filtresinde (<strong className="text-slate-900 font-bold">{selectedMahalleler.join(', ')}</strong>) <strong className="text-amber-800 font-bold">&ldquo;{searchQuery}&rdquo;</strong> için hak sahibi bulunamadı.
                  <br />
                  Ancak sistemdeki diğer mahallelerde <strong className="text-emerald-700 font-extrabold">{searchFilteredRecords.length} hane</strong> bulunmaktadır.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onMahallelerChange([]);
                      setSelectedSokak('HEPSI');
                    }}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs inline-flex items-center gap-1.5 transition-all active:scale-95 shadow-xs"
                  >
                    <span>Tüm Mahallelerde Göster ({searchFilteredRecords.length} Hane)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs inline-flex items-center gap-1 transition-all active:scale-95 border border-slate-200"
                  >
                    <span>Aramayı Temizle</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  <strong className="text-amber-800">&ldquo;{searchQuery}&rdquo;</strong> için TC Kimlik No veya Hak Sahibi (Ad Soyad) kaydı bulunamadı.
                </p>
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs inline-flex items-center gap-1.5 transition-all active:scale-95 border border-slate-200 shadow-2xs"
                >
                  <span>✕ Aramayı Temizle</span>
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="p-10 text-center rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
            {selectedQueueTab === 'EXCLUDED' ? (
              <Ban className="w-10 h-10 text-rose-500 mx-auto" />
            ) : (
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            )}
            <p className="text-sm font-bold text-slate-800">
              {selectedQueueTab === 'PENDING_AND_PARTIAL'
                ? 'Tebrikler! Seçilen mahallelerde teslim edilecek hane kalmadı.'
                : selectedQueueTab === 'DELIVERED'
                ? 'Seçilen mahallelerde henüz tamamlanmış teslimat bulunmuyor.'
                : 'Seçilen filtrelerde kömür yardımı iptal edilmiş (verilmeyecek) hane bulunmuyor.'}
            </p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              {selectedQueueTab === 'PENDING_AND_PARTIAL'
                ? 'Tamamlanan teslimatları incelemek için yukarıdaki "Teslim Edilenler" sekmesine geçebilirsiniz.'
                : selectedQueueTab === 'DELIVERED'
                ? 'Dağıtıma başlamak için "Teslim Edilecekler" sekmesine dönün.'
                : 'Bir vatandaşın kömür yardımını iptal etmek için hane kartındaki "Kömür İptal" butonunu kullanabilirsiniz.'}
            </p>
          </div>
        )
      )}

      {/* Top Pagination Bar */}
      {(!isLoading || records.length > 0) && totalFilteredRecords > 0 && renderPaginationBar('top')}

      {/* Grouped by Neighborhood / Village - Light Mode */}
      {(!isLoading || records.length > 0) && mahalleKeys.map((mahalleName) => {
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

            {/* 1. MASAÜSTÜ KOMPAKT LİSTE / TABLO GÖRÜNÜMÜ (Mobil Hariç - Sadece Desktop Ekranlarda Tablo Modu Aktifken) */}
            {desktopViewMode === 'TABLE' && (
              <div className="hidden lg:block overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
                <table className="desktop-compact-table">
                  <thead>
                    <tr>
                      <th className="w-14 text-center">Sıra</th>
                      <th className="col-hak-sahibi">Hak Sahibi</th>
                      <th className="w-[110px] whitespace-nowrap">T.C. Kimlik</th>
                      <th className="w-[125px] whitespace-nowrap">Telefon</th>
                      <th className="col-adres">Adres & Yerleşim</th>
                      <th className="w-[130px] whitespace-nowrap">Kömür Durumu</th>
                      <th className="text-right whitespace-nowrap">Hızlı İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {citizens.map((person) => {
                      const isComplete = person.teslimat_durumu === 'TAMAMLANDI' || person.teslimat_durumu === 'TESLIM_EDILDI';
                      const isPartial = person.teslimat_durumu === 'EKSIK';
                      const hedef = person.hedef_torba || defaultQuota;
                      const teslim = person.torba_sayisi || 0;
                      const kalan = Math.max(0, hedef - teslim);
                      const phones = getRecordPhones(person);
                      const stInfo = getRecordStreetInfo(person);
                      const hasHouseholdDuplicate = (householdCounts[person.norm_adres] || 0) > 1;
                      const listInfo = getBeneficiaryListTypeInfo(person);

                      return (
                        <tr key={person.id} className={isPartial ? 'row-incomplete' : ''}>
                          {/* Sıra No & Liste Türü */}
                          <td className="text-center font-mono font-black w-14">
                            <div className="flex flex-col items-center gap-1">
                              <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-black shadow-2xs whitespace-nowrap">
                                #{person.sira_no || person.mahalle_sira || person.id}
                              </span>
                              <span
                                className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded border whitespace-nowrap ${listInfo.badgeClass}`}
                                title={`${listInfo.folderLabel} (Sıra: #${person.sira_no || person.mahalle_sira || person.id})`}
                              >
                                {listInfo.badgeLabel}
                              </span>
                            </div>
                          </td>

                          {/* Hak Sahibi (Daraltılmış & Aşağı Doğru Uzayan) */}
                          <td className="col-hak-sahibi">
                            <div className="flex flex-col gap-1 py-0.5 min-w-0">
                              <div className="font-extrabold text-slate-900 text-sm leading-snug break-words whitespace-normal">
                                <span>{person.ad_soyad}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1 min-w-0">
                                {hasHouseholdDuplicate && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenHousehold(person);
                                    }}
                                    className="badge badge-household text-[10px] py-0 px-1.5 shrink-0 cursor-pointer hover:opacity-90 active:scale-95 transition-transform"
                                    title="Aynı adreste başka hak sahibi kayıtlı (Görüntülemek için tıklayın)"
                                  >
                                    Aynı Hane
                                  </button>
                                )}
                                {person.fiili_adres_guncellendi && (
                                  <span
                                    className="text-[10px] font-bold text-sky-800 bg-sky-100 px-1.5 py-0.5 rounded border border-sky-300 inline-flex items-center gap-0.5 shrink-0"
                                    title="Fiili ikamet adresi güncellendi"
                                  >
                                    <MapPin className="w-2.5 h-2.5 text-sky-600 shrink-0" />
                                    <span>Fiili</span>
                                  </span>
                                )}
                              </div>
                              {person.uyari_notu && (
                                <div
                                  className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-300 font-bold flex items-start gap-1 break-words whitespace-normal leading-tight shadow-2xs mt-0.5"
                                  title={person.uyari_notu}
                                >
                                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                                  <span className="break-words">{person.uyari_notu}</span>
                                </div>
                              )}
                              {person.komur_verilmeyecek && (
                                <div
                                  className="text-[10px] bg-rose-50 text-rose-900 px-1.5 py-0.5 rounded border border-rose-300 font-bold flex items-start gap-1 break-words whitespace-normal leading-tight shadow-2xs mt-0.5"
                                  title={person.komur_iptal_aciklama || person.komur_iptal_nedeni}
                                >
                                  <Ban className="w-3 h-3 text-rose-600 shrink-0 mt-0.5" />
                                  <span className="break-words font-black">🚫 Kömür İptal: {person.komur_iptal_nedeni}</span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* T.C. Kimlik No */}
                          <td className="font-mono text-xs font-bold text-slate-700 whitespace-nowrap w-[110px]">
                            {person.tc_no}
                          </td>

                          {/* Telefon */}
                          <td className="whitespace-nowrap w-[125px]">
                            {phones.length > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={`tel:${phones[0]}`}
                                  className="inline-flex items-center gap-1 text-xs text-emerald-800 font-bold hover:underline bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200"
                                  title={`${formatPhoneDisplay(phones[0])} Ara`}
                                >
                                  <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>{formatPhoneDisplay(phones[0])}</span>
                                </a>
                                {phones.length > 1 && (
                                  <span className="text-[10px] font-extrabold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded shrink-0">
                                    +{phones.length - 1}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Telefon Yok</span>
                            )}
                          </td>

                          {/* Adres & Yerleşim (Daraltılmış & Aşağı Doğru Uzayan) */}
                          <td className="col-adres">
                            <div className="text-xs text-slate-700 min-w-0 flex flex-col gap-0.5">
                              <div className="font-bold text-sky-950 flex items-start gap-1 break-words whitespace-normal leading-snug">
                                <Navigation className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1 break-words">
                                  <span>{stInfo.sokak}{stInfo.kapiNo && stInfo.kapiNo !== 999999 && stInfo.kapiNo !== '999999' ? ` No: ${stInfo.kapiNo}` : ''}</span>
                                  {stInfo.daireNo > 0 && <span className="text-sky-700 ml-1">D: {stInfo.daireNo}</span>}
                                  {person.fiili_adres_guncellendi && (
                                    <span className="text-[10px] font-black text-sky-800 bg-sky-100 px-1 py-0.2 rounded border border-sky-300 ml-1 inline-block shrink-0" title="Fiili ikamet adresi güncellendi">
                                      Fiili İkamet
                                    </span>
                                  )}
                                </div>
                              </div>
                              {person.acik_adres && (
                                <span
                                  className="text-slate-500 block text-[11px] leading-snug break-words whitespace-normal mt-0.5"
                                  title={person.acik_adres}
                                >
                                  {person.acik_adres}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Durum / Kömür */}
                          <td className="whitespace-nowrap">
                            {person.komur_verilmeyecek ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-black">
                                  <Ban className="w-3.5 h-3.5 text-rose-600" />
                                  Kömür Verilmeyecek
                                </span>
                                <div className="text-[10px] text-rose-800 font-bold leading-tight">
                                  <span>{person.komur_iptal_nedeni || 'İptal Edildi'}</span>
                                  {person.komur_iptal_aciklama && (
                                    <span className="block text-[9px] text-slate-500 truncate max-w-[170px]" title={person.komur_iptal_aciklama}>
                                      {person.komur_iptal_aciklama}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : isComplete ? (
                              <div className="space-y-0.5">
                                <span className="badge badge-success text-[11px]">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  ✓ {teslim} Torba Tamamlandı
                                </span>
                                <div className="text-[10px] text-slate-600 font-medium leading-tight">
                                  <span>Teslim Eden: <strong className="text-slate-900">{person.teslim_eden_personel || '-'}</strong></span>
                                  {person.teslim_alan && person.teslim_alan !== person.ad_soyad && (
                                    <span className="block text-[10px] text-slate-500">Alan: {person.teslim_alan}</span>
                                  )}
                                  {person.teslimat_tarihi && (
                                    <span className="block text-[9px] font-mono text-slate-400">{person.teslimat_tarihi}</span>
                                  )}
                                </div>
                              </div>
                            ) : isPartial ? (
                              <div className="space-y-0.5">
                                <span className="badge badge-warning text-[11px]">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Eksik: {teslim}/{hedef} (+{kalan} Torba)
                                </span>
                                <div className="text-[10px] text-slate-600 font-medium leading-tight">
                                  <span>Teslim Eden: <strong className="text-slate-900">{person.teslim_eden_personel || '-'}</strong></span>
                                  {person.teslim_alan && person.teslim_alan !== person.ad_soyad && (
                                    <span className="block text-[10px] text-slate-500">Alan: {person.teslim_alan}</span>
                                  )}
                                  {person.teslimat_tarihi && (
                                    <span className="block text-[9px] font-mono text-slate-400">{person.teslimat_tarihi}</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="badge badge-pending text-[11px]">
                                <Clock className="w-3.5 h-3.5" />
                                {hedef} Torba Bekliyor
                              </span>
                            )}
                          </td>

                          {/* Hızlı İşlem */}
                          <td className="text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              {person.komur_verilmeyecek ? (
                                onOpenKomurIptal && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenKomurIptal(person)}
                                    className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all flex items-center gap-1 shadow-2xs active:scale-95"
                                    title="Kömür İptal Gerekçesi / İptali Kaldır"
                                  >
                                    <Ban className="w-3.5 h-3.5 text-rose-600" />
                                    <span>İncele / Aktif Et</span>
                                  </button>
                                )
                              ) : (
                                <>
                                  {isPartial ? (
                                    <button
                                      type="button"
                                      onClick={() => onOpenDelivery(person)}
                                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all active:scale-95 hover:opacity-90"
                                    >
                                      <PackagePlus className="w-3.5 h-3.5" />
                                      <span>Kalanı Ver (+{kalan})</span>
                                    </button>
                                  ) : !isComplete ? (
                                    <button
                                      type="button"
                                      onClick={() => onOpenDelivery(person)}
                                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all active:scale-95"
                                    >
                                      <PackageCheck className="w-3.5 h-3.5" />
                                      <span>Teslim Et ({hedef})</span>
                                    </button>
                                  ) : null}
                                  {(isComplete || isPartial) && onOpenCancel && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenCancel(person)}
                                      className="px-2 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all flex items-center gap-1 shadow-2xs active:scale-95"
                                      title="Teslimatı Geri Al / İptal Et"
                                    >
                                      <Undo2 className="w-3.5 h-3.5 text-rose-600" />
                                      <span className="hidden xl:inline">Geri Al</span>
                                    </button>
                                  )}
                                  {onOpenKomurIptal && !isComplete && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenKomurIptal(person)}
                                      className="px-2 py-1.5 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 text-xs font-bold transition-all flex items-center gap-1 shadow-2xs active:scale-95"
                                      title="Kömür yardımını iptal et (Eşi kömür almış, doğalgaza geçmiş vb.)"
                                    >
                                      <Ban className="w-3.5 h-3.5 text-rose-600" />
                                      <span className="hidden xl:inline">Kömür İptal</span>
                                    </button>
                                  )}
                                </>
                              )}
                              {onOpenEdit && (
                                <button
                                  type="button"
                                  onClick={() => onOpenEdit(person)}
                                  className="px-2 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-all flex items-center gap-1 shadow-2xs active:scale-95"
                                  title="Adres ve Telefon Bilgilerini Düzenle"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                                  <span className="hidden xl:inline">Adres/Tel</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onOpenHousehold(person)}
                                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
                              >
                                Detay
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* 2. KART GÖRÜNÜMÜ (Mobilde Her Zaman, Masaüstünde "Kart Görünümü" Seçiliyken) */}
            <div className={`citizen-cards-grid ${desktopViewMode === 'TABLE' ? 'block lg:hidden' : ''}`}>
              {citizens.map((person) => {
                const isComplete = person.teslimat_durumu === 'TAMAMLANDI' || person.teslimat_durumu === 'TESLIM_EDILDI';
                const isPartial = person.teslimat_durumu === 'EKSIK';
                const hedef = person.hedef_torba || defaultQuota;
                const teslim = person.torba_sayisi || 0;
                const kalan = Math.max(0, hedef - teslim);
                const phones = getRecordPhones(person);
                const stInfo = getRecordStreetInfo(person);
                const listInfo = getBeneficiaryListTypeInfo(person);

                const isExpanded = expandedAddresses[person.id] !== undefined
                  ? expandedAddresses[person.id]
                  : showAllOpenAddresses;
                const hasHouseholdDuplicate = (householdCounts[person.norm_adres] || 0) > 1;
                const isSigned = localSignatures[String(person.id)] !== undefined
                  ? localSignatures[String(person.id)]
                  : person.imza_durumu === 'IMZALANDI';

                return (
                  <div
                    key={person.id}
                    onClick={() => {
                      if (isBulkSignMode) {
                        handleToggleCardSelect(String(person.id));
                      }
                    }}
                    className={`citizen-card ${
                      isBulkSignMode ? 'cursor-pointer select-none' : ''
                    } ${
                      isBulkSignMode && selectedIds.has(String(person.id))
                        ? 'border-emerald-500 ring-2 ring-emerald-400 bg-emerald-50/40'
                        : isPartial
                        ? 'border-amber-400 bg-amber-50/30 ring-1 ring-amber-300 shadow-sm'
                        : hasHouseholdDuplicate
                        ? 'has-household-duplicate'
                        : ''
                    }`}
                  >
                    {/* Top Row: Name + Status Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isBulkSignMode && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleCardSelect(String(person.id));
                              }}
                              className="shrink-0 text-emerald-700"
                            >
                              {selectedIds.has(String(person.id)) ? (
                                <CheckSquare className="w-5 h-5 text-emerald-600" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-300" />
                              )}
                            </button>
                          )}
                          <span className="font-mono text-xs font-black px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-2xs shrink-0 flex items-center gap-0.5" title="İmza Listesi Sıra No">
                            #{person.sira_no || person.mahalle_sira || person.id}
                          </span>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border shrink-0 flex items-center gap-1 ${listInfo.badgeClass}`}
                            title={listInfo.folderLabel}
                          >
                            {listInfo.type === 'SIGORTALI' && <Shield className="w-3 h-3 text-purple-600" />}
                            {listInfo.type === 'EK_LISTE' && <FileSpreadsheet className="w-3 h-3 text-indigo-600" />}
                            {listInfo.type === 'ANA_LISTE' && <FileText className="w-3 h-3 text-emerald-600" />}
                            <span>{listInfo.label}</span>
                          </span>
                          <h4 className="text-base font-extrabold text-slate-900 leading-tight">
                            {person.ad_soyad}
                          </h4>
                          {hasHouseholdDuplicate && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenHousehold(person);
                              }}
                              title="Aynı adreste başka kişi kayıtlı! (Görüntüle)"
                              className="badge badge-household shrink-0 text-[10px] py-0.5 px-2 cursor-pointer active:scale-95"
                            >
                              <Users className="w-3 h-3" />
                              Aynı Hane
                            </button>
                          )}
                          {person.fiili_adres_guncellendi && (
                            <span className="text-[10px] font-black text-sky-800 bg-sky-100 px-1.5 py-0.5 rounded border border-sky-300 inline-flex items-center gap-0.5 shrink-0" title="Fiili ikamet adresi güncellendi">
                              <MapPin className="w-3 h-3 text-sky-600" />
                              <span>Fiili İkamet</span>
                            </span>
                          )}
                          {person.uyari_notu && (
                            <span 
                              className="text-[10px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 inline-flex items-center gap-1 max-w-[240px] truncate" 
                              title={person.uyari_notu}
                            >
                              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                              <span className="truncate">{person.uyari_notu}</span>
                            </span>
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
                                {stInfo.kapiNo && stInfo.kapiNo !== 999999 && stInfo.kapiNo !== '999999' && (
                                  <strong className="text-sky-950 font-black">No: {stInfo.kapiNo}</strong>
                                )}
                                {stInfo.daireNo > 0 && (
                                  <span className="text-sky-700">D: {stInfo.daireNo}</span>
                                )}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Doğrudan Arama Bağlantılı Telefon Bilgisi */}
                        {phones.length === 1 && (
                          <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                            <a
                              href={`tel:${phones[0]}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-950 font-mono text-xs font-bold transition-all active:scale-95 shadow-2xs"
                              title={`${formatPhoneDisplay(phones[0])} - Aramak için tıklayın`}
                            >
                              <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>{formatPhoneDisplay(phones[0])}</span>
                            </a>
                          </div>
                        )}

                        {phones.length >= 2 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <a
                              href={`tel:${phones[0]}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-950 font-mono text-[11px] font-bold transition-all active:scale-95 shadow-2xs"
                              title={`1. Tel: ${formatPhoneDisplay(phones[0])} - Aramak için tıklayın`}
                            >
                              <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="text-[10px] font-sans font-extrabold text-emerald-700 mr-0.5">1:</span>
                              <span>{formatPhoneDisplay(phones[0])}</span>
                            </a>
                            <a
                              href={`tel:${phones[1]}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-950 font-mono text-[11px] font-bold transition-all active:scale-95 shadow-2xs"
                              title={`2. Tel: ${formatPhoneDisplay(phones[1])} - Aramak için tıklayın`}
                            >
                              <Phone className="w-3 h-3 text-teal-600 shrink-0" />
                              <span className="text-[10px] font-sans font-extrabold text-teal-700 mr-0.5">2:</span>
                              <span>{formatPhoneDisplay(phones[1])}</span>
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Status Badge */}
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {isSigned && (
                          <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded border border-emerald-300 inline-flex items-center gap-1 shadow-2xs">
                            <PenTool className="w-3 h-3 text-emerald-700" />
                            İmzalı
                          </span>
                        )}
                        {person.komur_verilmeyecek ? (
                          <div className="text-right">
                            <span className="badge badge-danger text-[11px] bg-rose-100 text-rose-800 border border-rose-300">
                              <Ban className="w-3.5 h-3.5 text-rose-600" />
                              Verilmeyecek
                            </span>
                            <span className="text-[10px] text-rose-700 font-bold block mt-0.5 truncate max-w-[130px]" title={person.komur_iptal_nedeni}>
                              {person.komur_iptal_nedeni || 'İptal'}
                            </span>
                          </div>
                        ) : isComplete ? (
                          <div className="text-right">
                            <span className="badge badge-delivered">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Tam ({teslim} Torba)
                            </span>
                            {person.teslim_eden_personel && (
                              <span className="text-[10px] text-slate-700 font-extrabold block mt-0.5">
                                Teslim Eden: <strong className="text-emerald-900">{person.teslim_eden_personel}</strong>
                              </span>
                            )}
                            {person.teslimat_tarihi && (
                              <div className="text-[10px] text-emerald-800 font-bold mt-1 flex items-center justify-end gap-1 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                <Clock className="w-3 h-3 text-emerald-600" />
                                <span>{person.teslimat_tarihi}</span>
                              </div>
                            )}
                          </div>
                        ) : isPartial ? (
                          <div className="text-right">
                            <span className="badge badge-pending">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Eksik: {teslim}/{hedef}
                            </span>
                            {person.teslim_eden_personel && (
                              <span className="text-[10px] text-slate-700 font-extrabold block mt-0.5">
                                Teslim Eden: <strong className="text-amber-900">{person.teslim_eden_personel}</strong>
                              </span>
                            )}
                            {person.teslimat_tarihi && (
                              <div className="text-[10px] text-amber-800 font-bold mt-1 flex items-center justify-end gap-1 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>{person.teslimat_tarihi}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="badge badge-pending">
                            <Clock className="w-3.5 h-3.5" />
                            Bekliyor ({hedef})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Kömür Verilmeyecek / İptal Uyarısı */}
                    {person.komur_verilmeyecek && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-950 space-y-1 shadow-2xs">
                        <div className="flex items-start justify-between gap-1.5 font-bold">
                          <div className="flex items-start gap-1.5">
                            <Ban className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-black text-rose-800 block">🚫 KÖMÜR VERİLMEYECEK (İPTAL)</span>
                              <span className="text-rose-900 font-extrabold text-[11px]">Neden: {person.komur_iptal_nedeni || 'Belirtilmedi'}</span>
                            </div>
                          </div>
                          {onOpenKomurIptal && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenKomurIptal(person);
                              }}
                              className="text-[11px] font-extrabold text-rose-800 hover:text-rose-950 bg-white hover:bg-rose-100 px-2 py-0.5 rounded-lg border border-rose-300 shrink-0 shadow-2xs transition-all active:scale-95"
                            >
                              İncele / Aktif Et
                            </button>
                          )}
                        </div>
                        {person.komur_iptal_aciklama && (
                          <div className="text-[11px] text-rose-800 pt-1 border-t border-rose-200">
                            <strong>Açıklama:</strong> {person.komur_iptal_aciklama}
                          </div>
                        )}
                        {(person.komur_iptal_eden || person.komur_iptal_tarihi) && (
                          <div className="text-[10px] text-rose-600 flex flex-wrap items-center gap-x-2 pt-0.5">
                            {person.komur_iptal_eden && <span>İşlem Yapan: <strong>{person.komur_iptal_eden}</strong></span>}
                            {person.komur_iptal_tarihi && <span>Tarih: <strong>{person.komur_iptal_tarihi}</strong></span>}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Incomplete Warning Bar on Card */}
                    {isPartial && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-amber-100/70 border border-amber-300 text-xs text-amber-950 space-y-1 shadow-2xs">
                        <div className="flex flex-wrap items-center justify-between gap-1.5 font-bold">
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                            <span>Eksik Dağıtım: <strong>{teslim}/{hedef} Torba Verildi</strong></span>
                          </div>
                          <span className="text-rose-700 font-extrabold bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-300 shrink-0 font-mono">
                            +{kalan} Torba Eksik
                          </span>
                        </div>
                        {(person.teslim_eden_personel || person.teslim_alan) && (
                          <div className="text-[11px] text-amber-900 flex flex-wrap items-center gap-x-2 pt-1 border-t border-amber-200">
                            {person.teslim_eden_personel && (
                              <span>Teslim Eden: <strong className="font-extrabold">{person.teslim_eden_personel}</strong></span>
                            )}
                            {person.teslim_alan && (
                              <span>Teslim Alan: <strong className="font-extrabold">{person.teslim_alan}</strong></span>
                            )}
                          </div>
                        )}
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

                        <div className="flex items-center gap-1.5">
                          {onOpenKomurIptal && !person.komur_verilmeyecek && !isComplete && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenKomurIptal(person);
                              }}
                              className="text-xs text-slate-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-0.5 rounded-lg border border-slate-200 hover:border-rose-300 font-bold flex items-center gap-1 transition-all active:scale-95 shadow-2xs"
                              title="Kömür yardımını iptal et (Eşi kömür almış, doğalgaza geçmiş vb.)"
                            >
                              <Ban className="w-3 h-3 text-rose-500" />
                              <span>Kömür İptal</span>
                            </button>
                          )}

                          {onOpenEdit && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenEdit(person);
                              }}
                              className="text-xs text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300 font-bold flex items-center gap-1 transition-all active:scale-95 shadow-2xs"
                              title="Resmi adreste yaşamayan vatandaşlar için fiili ikametgah adresi veya telefon güncelle"
                            >
                              <Edit3 className="w-3 h-3 text-amber-700" />
                              <span>Adres / Tel</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenHousehold(person);
                            }}
                            className="text-xs text-sky-700 hover:text-sky-900 font-bold flex items-center gap-0.5"
                          >
                            <span>Hane & Detay</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed animate-in fade-in duration-200">
                          <p className="font-semibold">{person.acik_adres}</p>
                          {person.fiili_adres_guncellendi && (
                            <div className="mt-1 text-[11px] font-bold text-sky-800 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-sky-600" />
                              <span>Fiili İkametgah Adresi Güncellenmiştir</span>
                              {person.son_adres_guncelleme_tarihi && (
                                <span className="text-slate-400 font-normal">({person.son_adres_guncelleme_tarihi})</span>
                              )}
                            </div>
                          )}
                          {person.adres_guncelleme_notu && (
                            <p className="mt-1 text-[11px] text-amber-900 bg-amber-50 p-1.5 rounded border border-amber-200 font-medium">
                              Saha Notu: {person.adres_guncelleme_notu}
                            </p>
                          )}
                          {person.hane_no && (
                            <span className="inline-block mt-1 text-[11px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">
                              Hane No: {person.hane_no}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action Row: Teslimat ve İmza İşlemleri */}
                    <div className="mt-3 flex items-center gap-2">
                      {person.komur_verilmeyecek ? (
                        <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 font-semibold">
                          <div className="flex items-center gap-2">
                            <Ban className="w-4 h-4 text-rose-600 shrink-0" />
                            <div>
                              <span className="font-black text-rose-800">Kömür Yardımı İptal Edildi</span>
                              <span className="text-[11px] text-rose-700 block font-bold">{person.komur_iptal_nedeni || 'Kömür verilmeyecek'}</span>
                            </div>
                          </div>
                          {onOpenKomurIptal && (
                            <button
                              type="button"
                              onClick={() => onOpenKomurIptal(person)}
                              className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 font-bold text-xs shrink-0 shadow-2xs transition-all active:scale-95"
                            >
                              İncele / Aktif Et
                            </button>
                          )}
                        </div>
                      ) : isPartial ? (
                        <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center gap-1.5">
                          <button
                            onClick={() => onOpenDelivery(person)}
                            className="btn-primary flex-1 lg:flex-none lg:w-auto lg:px-5 py-2 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-700 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5"
                          >
                            <PackagePlus className="w-4 h-4 text-white" />
                            <span>Kalanı Tamamla (+{kalan} Torba)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleSignature(person)}
                            className={`px-2.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 border shrink-0 ${
                              isSigned
                                ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-950 border-emerald-300 font-black'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                            title={isSigned ? 'Kapıda İmza Alındı (İptal etmek için tıklayın)' : 'Kapıda İmza Al'}
                          >
                            <PenTool className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{isSigned ? 'İmzalı' : 'İmza Al'}</span>
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
                        <div className="flex-1 flex items-center gap-1.5">
                          <button
                            onClick={() => onOpenDelivery(person)}
                            className="btn-primary flex-1 lg:flex-none lg:w-auto lg:px-5 py-2 text-xs font-bold"
                          >
                            <PackageCheck className="w-4 h-4 text-white" />
                            Kömür Teslimatı Yap ({hedef} Torba)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleSignature(person)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 border shrink-0 ${
                              isSigned
                                ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-950 border-emerald-300 font-black'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                            title={isSigned ? 'Kapıda İmza Alındı (İptal etmek için tıklayın)' : 'Kapıda İmza Al'}
                          >
                            <PenTool className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{isSigned ? 'İmzalı' : 'İmza Al'}</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-semibold">
                          <div className="truncate">
                            <span className="font-extrabold text-emerald-950">✓ {teslim} Torba Tamamlandı</span>
                            <div className="text-[11px] text-emerald-800 space-y-0.5 mt-0.5">
                              {person.teslimat_tarihi && (
                                <div>
                                  Teslim Tarihi: <strong className="font-mono text-emerald-950">{person.teslimat_tarihi}</strong>
                                </div>
                              )}
                              {(person.teslim_eden_personel || person.teslim_alan) && (
                                <div className="flex flex-wrap items-center gap-x-2 text-[10px]">
                                  {person.teslim_eden_personel && (
                                    <span>Teslim Eden: <strong className="text-emerald-950 font-bold">{person.teslim_eden_personel}</strong></span>
                                  )}
                                  {person.teslim_alan && (
                                    <span>Alan: <strong className="text-emerald-950 font-bold">{person.teslim_alan}</strong></span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
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

      {/* Bottom Pagination Bar */}
      {(!isLoading || records.length > 0) && totalFilteredRecords > 0 && renderPaginationBar('bottom')}

      {/* Floating Bulk Sign & Route Bar */}
      {isBulkSignMode && selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:w-96 z-40 p-3 rounded-2xl bg-slate-900/95 text-white shadow-2xl border border-slate-700 backdrop-blur-md flex flex-col gap-2 animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center justify-between text-xs font-bold px-1">
            <span className="text-emerald-400 flex items-center gap-1.5">
              <PenTool className="w-3.5 h-3.5" />
              <span>{selectedIds.size} Hane Seçildi</span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-400 hover:text-white text-[11px]"
            >
              Seçimi Sıfırla
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isBulkSignLoading}
              onClick={handleBulkSignSubmit}
              className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isBulkSignLoading ? 'Kaydediliyor...' : 'İmzaları Kaydet'}</span>
            </button>

            {onNavigateToRoute && (
              <button
                type="button"
                onClick={async () => {
                  await handleBulkSignSubmit();
                  onNavigateToRoute();
                }}
                className="py-2.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                title="İmzaları kaydet ve Rota ekranına geç"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Rotaya Geç</span>
              </button>
            )}
          </div>
        </div>
      )}

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
                  {mahalleFilteredList.length} Hane
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
