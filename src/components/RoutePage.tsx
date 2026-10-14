'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Route as RouteIcon, MapPin, Navigation, CheckCircle2, AlertTriangle, XCircle,
  Clock, Plus, ArrowUp, ArrowDown, Users, Phone, Truck, Trash2, Archive,
  CheckSquare, Square, Search, RefreshCw, FileText, ChevronDown, ChevronUp,
  AlertCircle, ShieldCheck, PenTool, Check, ArrowRight, Download, Printer,
  ArrowUpDown
} from 'lucide-react';
import { formatPhoneDisplay, getRecordStreetInfo, compareByAddressAsc } from '@/lib/normalizer';

interface RoutePageProps {
  userRole: 'ADMIN' | 'PERSONEL';
  userName: string;
  onRefreshAll?: () => void;
  onNavigateToSearch?: () => void;
}

export default function RoutePage({
  userRole,
  userName,
  onRefreshAll,
  onNavigateToSearch
}: RoutePageProps) {
  const [activeTab, setActiveTab] = useState<'ACTIVE_ROUTE' | 'ARCHIVE'>('ACTIVE_ROUTE');
  const [activeRoute, setActiveRoute] = useState<any | null>(null);
  const [archivedRoutes, setArchivedRoutes] = useState<any[]>([]);
  const [signedBeneficiaries, setSignedBeneficiaries] = useState<any[]>([]);
  const [allPendingBeneficiaries, setAllPendingBeneficiaries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStopModal, setShowStopModal] = useState<{
    stopIndex: number;
    stop: any;
    mode: 'TAMAMLANDI' | 'EKSIK' | 'TESLIM_EDILEMEDI';
  } | null>(null);
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expandedArchivedRouteId, setExpandedArchivedRouteId] = useState<string | null>(null);

  // Stop Action Modal State
  const [stopTorbaInput, setStopTorbaInput] = useState<string>('34');
  const [stopRecipientInput, setStopRecipientInput] = useState<string>('');
  const [stopNoteInput, setStopNoteInput] = useState<string>('');

  // Create Modal Form State
  const [newRouteName, setNewRouteName] = useState<string>('');
  const [newRoutePlate, setNewRoutePlate] = useState<string>('');
  const [newRouteStaff, setNewRouteStaff] = useState<string>(userName || 'Personel');
  const [newRouteNote, setNewRouteNote] = useState<string>('');
  const [createSelectionTab, setCreateSelectionTab] = useState<'SIGNED' | 'ALL'>('SIGNED');
  const [createModalStep, setCreateModalStep] = useState<'SELECT' | 'ORDER'>('SELECT');
  const [selectedBeneficiaryIds, setSelectedBeneficiaryIds] = useState<string[]>([]);
  const [createSearchQuery, setCreateSearchQuery] = useState<string>('');

  // Finalize Modal State
  const [finalizeNote, setFinalizeNote] = useState<string>('');

  // Fetch routes data
  const fetchRoutes = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/routes');
      const data = await res.json();
      if (data.success) {
        setActiveRoute(data.activeRoute || null);
        setArchivedRoutes(data.archivedRoutes || []);
        setSignedBeneficiaries(data.signedBeneficiaries || []);
      }
    } catch (err) {
      console.error('Error fetching routes:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch pending beneficiaries for custom route building
  const fetchPendingBeneficiaries = useCallback(async () => {
    try {
      const res = await fetch('/api/beneficiaries?durum=HEPSI&limit=500');
      const data = await res.json();
      if (data.success && data.data) {
        const pending = data.data.filter((b: any) => b.teslimat_durumu !== 'TAMAMLANDI');
        setAllPendingBeneficiaries(pending);
      }
    } catch (err) {
      console.error('Error fetching pending beneficiaries:', err);
    }
  }, []);

  useEffect(() => {
    fetchRoutes();
    fetchPendingBeneficiaries();
  }, [fetchRoutes, fetchPendingBeneficiaries]);

  // Open Create Route Modal
  const handleOpenCreateModal = async () => {
    const todayStr = new Date().toLocaleDateString('tr-TR');
    setNewRouteName(`${todayStr} Kömür Dağıtım Rotası`);
    setNewRouteStaff(userName || 'Personel');
    setNewRoutePlate('');
    setNewRouteNote('');

    try {
      const res = await fetch('/api/routes');
      const data = await res.json();
      if (data.success && data.signedBeneficiaries) {
        setSignedBeneficiaries(data.signedBeneficiaries);
        if (data.signedBeneficiaries.length > 0) {
          setCreateSelectionTab('SIGNED');
          setSelectedBeneficiaryIds(data.signedBeneficiaries.map((b: any) => String(b.id)));
        } else {
          setCreateSelectionTab('ALL');
          setSelectedBeneficiaryIds([]);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setCreateModalStep('SELECT');
    setShowCreateModal(true);
  };

  // Toggle selection in create modal
  const handleToggleBeneficiary = (id: string) => {
    setSelectedBeneficiaryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllInView = (list: any[]) => {
    const listIds = list.map((b) => String(b.id));
    const allSelected = listIds.every((id) => selectedBeneficiaryIds.includes(id));
    if (allSelected) {
      setSelectedBeneficiaryIds((prev) => prev.filter((id) => !listIds.includes(id)));
    } else {
      setSelectedBeneficiaryIds((prev) => Array.from(new Set([...prev, ...listIds])));
    }
  };

  // Submit Create Route
  const handleCreateRouteSubmit = async () => {
    if (selectedBeneficiaryIds.length === 0) {
      alert('Lütfen rotaya eklenecek en az bir hane seçiniz.');
      return;
    }

    setIsActionLoading(true);
    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_ROUTE',
          rota_adi: newRouteName.trim(),
          arac_plaka: newRoutePlate.trim(),
          olusturan_personel: userName || 'Personel',
          dagitim_personeli: newRouteStaff.trim() || userName || 'Personel',
          notlar: newRouteNote.trim(),
          beneficiary_ids: selectedBeneficiaryIds
        })
      });

      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        await fetchRoutes();
        if (onRefreshAll) onRefreshAll();
      } else {
        alert(data.error || 'Rota oluşturulamadı');
      }
    } catch (err: any) {
      alert('Bağlantı hatası: ' + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Move Stop Up or Down in order
  const handleMoveStop = async (currentIndex: number, direction: 'UP' | 'DOWN') => {
    if (!activeRoute || !activeRoute.duraklar) return;
    const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= activeRoute.duraklar.length) return;

    const updatedStops = [...activeRoute.duraklar];
    const temp = updatedStops[currentIndex];
    updatedStops[currentIndex] = updatedStops[targetIndex];
    updatedStops[targetIndex] = temp;

    // Optimistic UI update
    setActiveRoute({
      ...activeRoute,
      duraklar: updatedStops.map((s, idx) => ({ ...s, sira: idx + 1 }))
    });

    try {
      await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REORDER_STOPS',
          route_id: activeRoute.id,
          duraklar: updatedStops
        })
      });
    } catch (err) {
      console.error('Error reordering stops:', err);
    }
  };

  // Open Stop Action Modal
  const handleOpenStopModal = (
    stopIndex: number,
    stop: any,
    mode: 'TAMAMLANDI' | 'EKSIK' | 'TESLIM_EDILEMEDI'
  ) => {
    const hedef = stop.hedef_torba || 34;
    setShowStopModal({ stopIndex, stop, mode });
    setStopTorbaInput(mode === 'TAMAMLANDI' ? String(hedef) : mode === 'EKSIK' ? '20' : '0');
    setStopRecipientInput(stop.ad_soyad || '');
    setStopNoteInput(
      mode === 'EKSIK'
        ? 'Kamyonda kömür bitti'
        : mode === 'TESLIM_EDILEMEDI'
        ? 'Evde kimse yok / Kapı açılmadı'
        : ''
    );
  };

  // Submit Stop Action
  const handleStopActionSubmit = async () => {
    if (!showStopModal || !activeRoute) return;

    const { stopIndex, stop, mode } = showStopModal;
    setIsActionLoading(true);

    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_STOP',
          route_id: activeRoute.id,
          stop_index: stopIndex,
          durum: mode,
          torba_sayisi: mode === 'TAMAMLANDI' || mode === 'EKSIK' ? parseInt(stopTorbaInput, 10) : 0,
          teslim_alan: stopRecipientInput.trim() || stop.ad_soyad,
          notlar: stopNoteInput.trim(),
          personel: userName || 'Dağıtım Personeli'
        })
      });

      const data = await res.json();
      if (data.success) {
        setShowStopModal(null);
        await fetchRoutes();
        if (onRefreshAll) onRefreshAll();
      } else {
        alert(data.error || 'İşlem güncellenemedi');
      }
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Finalize Route
  const handleFinalizeRouteSubmit = async () => {
    if (!activeRoute) return;
    setIsActionLoading(true);

    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'FINALIZE_ROUTE',
          route_id: activeRoute.id,
          notlar: finalizeNote.trim(),
          personel: userName || 'Personel'
        })
      });

      const data = await res.json();
      if (data.success) {
        setShowFinalizeModal(false);
        setActiveRoute(null);
        setActiveTab('ARCHIVE');
        await fetchRoutes();
        if (onRefreshAll) onRefreshAll();
      } else {
        alert(data.error || 'Rota tamamlanamadı');
      }
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Delete Route
  const handleDeleteRoute = async () => {
    if (!activeRoute) return;
    setIsActionLoading(true);

    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DELETE_ROUTE',
          route_id: activeRoute.id
        })
      });

      const data = await res.json();
      if (data.success) {
        setShowDeleteConfirm(false);
        setActiveRoute(null);
        await fetchRoutes();
        if (onRefreshAll) onRefreshAll();
      } else {
        alert(data.error || 'Rota silinemedi');
      }
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Delete Archived Route
  const handleDeleteArchivedRoute = async (routeId: string) => {
    if (!confirm('Bu arşiv kaydını silmek istediğinize emin misiniz?')) return;
    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DELETE_ROUTE',
          route_id: routeId
        })
      });
      const data = await res.json();
      if (data.success) {
        await fetchRoutes();
      }
    } catch (err) {
      console.error('Error deleting archived route:', err);
    }
  };

  // Filter beneficiaries in Create Modal
  const modalDisplayList = useMemo(() => {
    const list = createSelectionTab === 'SIGNED' ? signedBeneficiaries : allPendingBeneficiaries;
    if (!createSearchQuery.trim()) return list;
    const q = createSearchQuery.toLocaleLowerCase('tr');
    return list.filter(
      (b) =>
        b.ad_soyad?.toLocaleLowerCase('tr').includes(q) ||
        b.tc_no?.includes(q) ||
        b.mahalle?.toLocaleLowerCase('tr').includes(q) ||
        b.acik_adres?.toLocaleLowerCase('tr').includes(q)
    );
  }, [createSelectionTab, signedBeneficiaries, allPendingBeneficiaries, createSearchQuery]);

  // Fast map to lookup beneficiaries by ID
  const allBeneficiariesMap = useMemo(() => {
    const map = new Map<string, any>();
    allPendingBeneficiaries.forEach((b) => map.set(String(b.id), b));
    signedBeneficiaries.forEach((b) => map.set(String(b.id), b));
    return map;
  }, [allPendingBeneficiaries, signedBeneficiaries]);

  // Ordered list of selected stops for create modal
  const orderedCreateStops = useMemo(() => {
    return selectedBeneficiaryIds
      .map((id) => allBeneficiariesMap.get(id))
      .filter(Boolean);
  }, [selectedBeneficiaryIds, allBeneficiariesMap]);

  // Reordering helpers for Create Route modal (telefondan kolay rota sırası belirleme)
  const handleMoveCreateStop = (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= selectedBeneficiaryIds.length) return;
    const nextList = [...selectedBeneficiaryIds];
    const temp = nextList[index];
    nextList[index] = nextList[targetIndex];
    nextList[targetIndex] = temp;
    setSelectedBeneficiaryIds(nextList);
  };

  const handleRemoveCreateStop = (id: string) => {
    setSelectedBeneficiaryIds((prev) => prev.filter((item) => item !== id));
  };

  const handleSortCreateStopsByAddress = () => {
    const items = [...orderedCreateStops];
    items.sort(compareByAddressAsc);
    setSelectedBeneficiaryIds(items.map((b) => String(b.id)));
  };

  const handleReverseCreateStops = () => {
    setSelectedBeneficiaryIds((prev) => [...prev].reverse());
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Top Header & Tab Navigation */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center border border-sky-200">
              <RouteIcon className="w-5 h-5 text-sky-700" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                Dağıtım Rotası & İmza Takibi
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                İmzası toplanan hanelere sıralı kamyon teslimatı
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchRoutes}
            disabled={isLoading}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all active:scale-95"
            title="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-sky-600' : ''}`} />
          </button>
        </div>

        {/* 2-Way Tab Bar: Aktif Rota vs Günlük Rota Arşivi */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 mt-3">
          <button
            type="button"
            onClick={() => setActiveTab('ACTIVE_ROUTE')}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'ACTIVE_ROUTE'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-300/80 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Navigation className="w-4 h-4 text-sky-600" />
            <span>Aktif Rota</span>
            {activeRoute && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ARCHIVE')}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'ARCHIVE'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-300/80 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Archive className="w-4 h-4 text-amber-600" />
            <span>Günlük Rota Arşivi ({archivedRoutes.length})</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: AKTİF DAĞITIM ROTASI                              */}
      {/* ======================================================== */}
      {activeTab === 'ACTIVE_ROUTE' && (
        <div className="space-y-3">
          {/* DURUM 1: HENÜZ AKTİF ROTA YOK İSE */}
          {!activeRoute && !isLoading && (
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center mx-auto">
                <RouteIcon className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-slate-900">
                  Şu Anda Devam Eden Bir Rota Yok
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Kamyon teslimatı için bugün kapıda imzası toplanan vatandaşlardan veya seçtiğiniz sokaklardan sıralı dağıtım rotası oluşturabilirsiniz.
                </p>
              </div>

              {/* İmzası Alınanlar Bildirim Çubuğu */}
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-medium flex items-center justify-between max-w-md mx-auto text-left">
                <div className="flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Bugün Kapıda İmzası Alınan: <strong>{signedBeneficiaries.length} Hane Hazır</strong>
                  </span>
                </div>
                {signedBeneficiaries.length === 0 && onNavigateToSearch && (
                  <button
                    type="button"
                    onClick={onNavigateToSearch}
                    className="text-amber-800 font-bold underline hover:text-amber-950 text-[11px] shrink-0"
                  >
                    İmza Topla
                  </button>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleOpenCreateModal}
                  className="btn-primary w-full max-w-md mx-auto py-3 text-sm font-black flex items-center justify-center gap-2 shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                  <span>Yeni Dağıtım Rotası Başlat</span>
                </button>
              </div>
            </div>
          )}

          {/* DURUM 2: DEVAM EDEN AKTİF BİR ROTA VAR İSE */}
          {activeRoute && (
            <>
              {/* Resmi Baskı Başlığı (Sadece Yazdırırken Çıkar) */}
              <div className="p-4 rounded-2xl bg-white border border-slate-300 shadow-sm print-only-header">
                <div className="flex items-center justify-between pb-3 border-b-2 border-slate-900">
                  <div className="w-16 h-16 shrink-0 flex items-center justify-center p-1 bg-white rounded-full border border-slate-200">
                    <img
                      src="/edirne-sydv-logo.png"
                      alt="Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="text-center flex-1 px-3">
                    <p className="text-xs font-black tracking-widest text-slate-800 uppercase">
                      T.C. EDİRNE VALİLİĞİ
                    </p>
                    <h2 className="text-sm font-black text-slate-900 uppercase">
                      EDİRNE SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI
                    </h2>
                    <h3 className="text-xs font-bold text-amber-800 uppercase mt-0.5">
                      RESMİ KÖMÜR DAĞITIM VE TESLİMAT SAHA ÇİZELGESİ
                    </h3>
                  </div>
                  <div className="w-16 h-16 shrink-0 flex flex-col items-center justify-center border-2 border-slate-400 rounded-lg text-[8px] font-black text-slate-700 leading-tight">
                    <span>RESMİ</span>
                    <span>ÇİZELGE</span>
                  </div>
                </div>
              </div>

              {/* ROTA ÖZETİ VE İLERLEME KARTI */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                        Dağıtım Sürüyor
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {activeRoute.tarih}
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-slate-900 mt-1 truncate">
                      {activeRoute.rota_adi}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-1">
                      {activeRoute.arac_plaka && (
                        <span className="flex items-center gap-1 font-bold text-slate-800">
                          <Truck className="w-3.5 h-3.5 text-slate-500" />
                          Plaka: {activeRoute.arac_plaka}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-slate-600">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        Dağıtım: {activeRoute.dagitim_personeli}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-all active:scale-95"
                      title="Rotayı Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* İlerleme Çubuğu */}
                {(() => {
                  const total = activeRoute.toplam_hane || 1;
                  const completed = activeRoute.tamamlanan_hane || 0;
                  const eksik = activeRoute.eksik_hane || 0;
                  const undelivered = activeRoute.teslim_edilemeyen_hane || 0;
                  const handled = completed + eksik + undelivered;
                  const percent = Math.min(100, Math.round((handled / total) * 100));

                  return (
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
                  );
                })()}

                {/* 4'lü İstatistik Metrikleri */}
                <div className="grid grid-cols-4 gap-1.5 pt-1 text-center">
                  <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-base font-black text-emerald-800 block leading-tight">
                      {activeRoute.tamamlanan_hane || 0}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-900 uppercase">Tamam</span>
                  </div>

                  <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
                    <span className="text-base font-black text-amber-800 block leading-tight">
                      {activeRoute.eksik_hane || 0}
                    </span>
                    <span className="text-[10px] font-bold text-amber-900 uppercase">Eksik</span>
                  </div>

                  <div className="p-2 rounded-xl bg-rose-50 border border-rose-200">
                    <span className="text-base font-black text-rose-800 block leading-tight">
                      {activeRoute.teslim_edilemeyen_hane || 0}
                    </span>
                    <span className="text-[10px] font-bold text-rose-900 uppercase">Verilemedi</span>
                  </div>

                  <div className="p-2 rounded-xl bg-sky-50 border border-sky-200">
                    <span className="text-base font-black text-sky-800 block leading-tight">
                      {activeRoute.toplam_dagitilan_torba || 0}
                    </span>
                    <span className="text-[10px] font-bold text-sky-900 uppercase">Torba</span>
                  </div>
                </div>

                {/* Günü Bitir & Listeyi İndir Butonları */}
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFinalizeModal(true)}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Günü Bitir • Rotayı Tamamla ve Arşivle</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/export?type=daily_deliveries&date=${activeRoute.tarih || new Date().toLocaleDateString('en-CA')}`}
                      download={`Edirne_SYDV_Teslimat_Listesi_${activeRoute.tarih || 'Bugun'}.xlsx`}
                      className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Günün Teslimat Listesini İndir (Excel)</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="py-2 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Yazdır</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* SIRALI DURAKLAR LİSTESİ */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-sky-600" />
                    <span>Sıralı Durak Listesi ({activeRoute.duraklar?.length || 0} Hane)</span>
                  </h4>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Kapı No sıralı • Yukarı/Aşağı taşınabilir
                  </span>
                </div>

                {activeRoute.duraklar?.map((stop: any, index: number) => {
                  const isTamam = stop.durum === 'TAMAMLANDI';
                  const isEksik = stop.durum === 'EKSIK';
                  const isUndelivered = stop.durum === 'TESLIM_EDILEMEDI';
                  const isPending = !stop.durum || stop.durum === 'BEKLIYOR';

                  return (
                    <div
                      key={stop.beneficiary_id || index}
                      className={`p-3.5 rounded-2xl border transition-all shadow-xs ${
                        isTamam
                          ? 'bg-emerald-50/40 border-emerald-300'
                          : isEksik
                          ? 'bg-amber-50/50 border-amber-300'
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
                            #{stop.sira || index + 1}
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
                            onClick={() => handleMoveStop(index, 'UP')}
                            disabled={index === 0}
                            className="p-1 rounded text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-600"
                            title="Yukarı Taşı"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveStop(index, 'DOWN')}
                            disabled={index === (activeRoute.duraklar?.length || 0) - 1}
                            className="p-1 rounded text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-600"
                            title="Aşağı Taşı"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Adres ve Sokak Bilgisi */}
                      <div className="mt-2 text-xs flex flex-wrap items-center gap-1.5">
                        {stop.sokak && (
                          <span className="inline-flex items-center gap-1 font-bold text-sky-900 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                            <Navigation className="w-3 h-3 text-sky-600 shrink-0" />
                            <span>{stop.sokak}</span>
                            {stop.kapi_no && <strong>No: {stop.kapi_no}</strong>}
                            {stop.daire_no && <span>D: {stop.daire_no}</span>}
                          </span>
                        )}
                        <span className="text-slate-600 truncate max-w-full font-medium">
                          {stop.acik_adres}
                        </span>
                      </div>

                      {/* Durum Rozeti & Telefon */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          {stop.imza_durumu === 'IMZALANDI' ? (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                              <PenTool className="w-3 h-3 text-emerald-700" />
                              İmza Alındı
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              İmza Yok
                            </span>
                          )}

                          <span className="text-xs font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                            Kota: {stop.hedef_torba || 34} Torba
                          </span>
                        </div>

                        {stop.telefon && (
                          <a
                            href={`tel:${stop.telefon}`}
                            className="text-xs font-mono font-bold text-emerald-700 hover:underline flex items-center gap-1"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            {formatPhoneDisplay(stop.telefon)}
                          </a>
                        )}
                      </div>

                      {/* TESLİMAT DURUMU BİLGİSİ VEYA AKSİYON BUTONLARI */}
                      <div className="mt-3 pt-2 border-t border-slate-100">
                        {isTamam && (
                          <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-100/70 border border-emerald-300 text-emerald-900 text-xs font-bold">
                            <span className="flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                              <span>
                                ✓ Tamamlandı: {stop.teslim_edilen_torba || stop.hedef_torba} Torba Teslim Edildi
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenStopModal(index, stop, 'TAMAMLANDI')}
                              className="text-[11px] underline text-emerald-800 hover:text-emerald-950 font-bold ml-2"
                            >
                              Düzenle
                            </button>
                          </div>
                        )}

                        {isEksik && (
                          <div className="flex items-center justify-between p-2 rounded-xl bg-amber-100/70 border border-amber-300 text-amber-950 text-xs font-bold">
                            <div className="min-w-0">
                              <span className="flex items-center gap-1.5">
                                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                                <span>
                                  ⚠️ Eksik Teslimat: {stop.teslim_edilen_torba} / {stop.hedef_torba} Torba
                                </span>
                              </span>
                              {stop.teslimat_notu && (
                                <p className="text-[11px] font-normal text-amber-900 mt-0.5 truncate pl-5.5">
                                  Not: {stop.teslimat_notu}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenStopModal(index, stop, 'EKSIK')}
                              className="text-[11px] underline text-amber-900 hover:text-amber-950 font-bold ml-2 shrink-0"
                            >
                              Düzenle
                            </button>
                          </div>
                        )}

                        {isUndelivered && (
                          <div className="flex items-center justify-between p-2 rounded-xl bg-rose-100/70 border border-rose-300 text-rose-950 text-xs font-bold">
                            <div className="min-w-0">
                              <span className="flex items-center gap-1.5">
                                <XCircle className="w-4 h-4 text-rose-700 shrink-0" />
                                <span>✕ Teslim Edilemedi</span>
                              </span>
                              {stop.teslimat_notu && (
                                <p className="text-[11px] font-normal text-rose-900 mt-0.5 truncate pl-5.5">
                                  Neden: {stop.teslimat_notu}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenStopModal(index, stop, 'TESLIM_EDILEMEDI')}
                              className="text-[11px] underline text-rose-900 hover:text-rose-950 font-bold ml-2 shrink-0"
                            >
                              Düzenle
                            </button>
                          </div>
                        )}

                        {isPending && (
                          <div className="grid grid-cols-3 gap-1.5">
                            {/* 1. Tam Teslimat Butonu */}
                            <button
                              type="button"
                              onClick={() => handleOpenStopModal(index, stop, 'TAMAMLANDI')}
                              className="col-span-1 py-2 px-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span className="truncate">Teslim ({stop.hedef_torba || 34})</span>
                            </button>

                            {/* 2. Eksik Kömür Verildi Butonu */}
                            <button
                              type="button"
                              onClick={() => handleOpenStopModal(index, stop, 'EKSIK')}
                              className="col-span-1 py-2 px-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span className="truncate">Eksik Ver</span>
                            </button>

                            {/* 3. Teslim Edilemedi Butonu */}
                            <button
                              type="button"
                              onClick={() => handleOpenStopModal(index, stop, 'TESLIM_EDILEMEDI')}
                              className="col-span-1 py-2 px-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span className="truncate">Verilemedi</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: GÜNLÜK ROTA ARŞİVİ                                */}
      {/* ======================================================== */}
      {activeTab === 'ARCHIVE' && (
        <div className="space-y-3">
          {archivedRoutes.length === 0 && (
            <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-xs text-center space-y-2">
              <Archive className="w-10 h-10 text-slate-400 mx-auto" />
              <p className="text-sm font-extrabold text-slate-800">Henüz Tamamlanan Rota Bulunmuyor</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Günlük dağıtımlar tamamlandığında bu alanda tarihli olarak arşivlenir.
              </p>
            </div>
          )}

          {archivedRoutes.map((route: any) => {
            const isExpanded = expandedArchivedRouteId === route.id;
            return (
              <div
                key={route.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
              >
                {/* Header Row */}
                <div
                  onClick={() => setExpandedArchivedRouteId(isExpanded ? null : route.id)}
                  className="p-3.5 cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                        {route.tarih}
                      </span>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        ✓ Tamamlandı
                      </span>
                    </div>
                    <h4 className="text-sm font-black text-slate-900 mt-1 truncate">
                      {route.rota_adi}
                    </h4>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {route.dagitim_personeli} • {route.toplam_hane} Hane ({route.toplam_dagitilan_torba || 0} Torba)
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteArchivedRoute(route.id);
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                      title="Arşiv Kaydını Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-3.5 bg-slate-50 border-t border-slate-200 space-y-3">
                    {/* Summary Metrics */}
                    <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                      <div className="p-2 rounded-xl bg-white border border-slate-200">
                        <strong className="text-emerald-700 block text-sm">{route.tamamlanan_hane || 0}</strong>
                        <span className="text-[10px] text-slate-500 font-bold">Tamam</span>
                      </div>
                      <div className="p-2 rounded-xl bg-white border border-slate-200">
                        <strong className="text-amber-700 block text-sm">{route.eksik_hane || 0}</strong>
                        <span className="text-[10px] text-slate-500 font-bold">Eksik</span>
                      </div>
                      <div className="p-2 rounded-xl bg-white border border-slate-200">
                        <strong className="text-rose-700 block text-sm">{route.teslim_edilemeyen_hane || 0}</strong>
                        <span className="text-[10px] text-slate-500 font-bold">Verilemedi</span>
                      </div>
                      <div className="p-2 rounded-xl bg-white border border-slate-200">
                        <strong className="text-sky-700 block text-sm">{route.toplam_dagitilan_torba || 0}</strong>
                        <span className="text-[10px] text-slate-500 font-bold">Torba</span>
                      </div>
                    </div>

                    {route.kapanis_notu && (
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-700">
                        <strong className="text-slate-900 block font-bold mb-0.5">Kapanış Notu:</strong>
                        <span>{route.kapanis_notu}</span>
                      </div>
                    )}

                    {/* Action Bar for this Route */}
                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href={`/api/export?type=daily_deliveries&date=${route.tarih}`}
                        download={`Edirne_SYDV_Rota_Teslimat_Listesi_${route.tarih}.xlsx`}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Günün Teslimat Listesini İndir (Excel)</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="py-2 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Yazdır</span>
                      </button>
                    </div>

                    {/* Stops List */}
                    <div className="space-y-1.5 pt-1">
                      <h5 className="text-[11px] font-extrabold uppercase text-slate-500 tracking-wider">
                        Durak Dökümü:
                      </h5>
                      {route.duraklar?.map((s: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-2 rounded-xl bg-white border border-slate-200 text-xs flex items-center justify-between"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-bold text-slate-900 truncate">
                              #{s.sira || idx + 1}. {s.ad_soyad}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {s.mahalle} {s.sokak ? `• ${s.sokak}` : ''}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            {s.durum === 'TAMAMLANDI' && (
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                ✓ {s.teslim_edilen_torba} Torba
                              </span>
                            )}
                            {s.durum === 'EKSIK' && (
                              <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                ⚠️ Eksik ({s.teslim_edilen_torba})
                              </span>
                            )}
                            {s.durum === 'TESLIM_EDILEMEDI' && (
                              <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                ✕ Verilemedi
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: YENİ ROTA OLUŞTURMA MODALI                      */}
      {/* ======================================================== */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center">
                  <RouteIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Yeni Dağıtım Rotası</h3>
                  <p className="text-xs text-slate-500">Kamyon dağıtımı için durakları belirleyin</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            {/* Rota Adı & Araç Bilgileri Formu */}
            <div className="space-y-2.5 mb-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Rota Başlığı</label>
                <input
                  type="text"
                  value={newRouteName}
                  onChange={(e) => setNewRouteName(e.target.value)}
                  placeholder="Örn: 14 Ekim Cumhuriyet & Fatih Dağıtımı"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Araç Plakası</label>
                  <input
                    type="text"
                    value={newRoutePlate}
                    onChange={(e) => setNewRoutePlate(e.target.value)}
                    placeholder="Örn: 34 KM 101"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Dağıtım Personeli</label>
                  <input
                    type="text"
                    value={newRouteStaff}
                    onChange={(e) => setNewRouteStaff(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>

            {/* 2 ADIMLI MODAL SEÇİMİ: 1. Haneleri Seç | 2. Sıralamayı Belirle */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 mb-3">
              <button
                type="button"
                onClick={() => setCreateModalStep('SELECT')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  createModalStep === 'SELECT'
                    ? 'bg-white text-slate-900 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5 text-sky-600" />
                <span>1. Haneleri Seç ({selectedBeneficiaryIds.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setCreateModalStep('ORDER')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  createModalStep === 'ORDER'
                    ? 'bg-white text-slate-900 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <RouteIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span>2. Sırayı Belirle ({selectedBeneficiaryIds.length})</span>
              </button>
            </div>

            {/* ADIM 1: HANE SEÇİMİ */}
            {createModalStep === 'SELECT' && (
              <>
                {/* Hane Kaynak Seçimi: İmzası Alınanlar vs Tüm Kalanlar */}
                <div className="p-1 bg-slate-100 rounded-xl border border-slate-200 grid grid-cols-2 gap-1 mb-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateSelectionTab('SIGNED');
                      if (signedBeneficiaries.length > 0) {
                        setSelectedBeneficiaryIds(signedBeneficiaries.map((b) => String(b.id)));
                      }
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
                      createSelectionTab === 'SIGNED'
                        ? 'bg-white text-slate-900 shadow-sm font-black'
                        : 'text-slate-600'
                    }`}
                  >
                    <PenTool className="w-3.5 h-3.5 text-emerald-600" />
                    <span>İmzası Alınanlar ({signedBeneficiaries.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateSelectionTab('ALL')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
                      createSelectionTab === 'ALL'
                        ? 'bg-white text-slate-900 shadow-sm font-black'
                        : 'text-slate-600'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-sky-600" />
                    <span>Tüm Bekleyenler</span>
                  </button>
                </div>

                {/* Arama & Toplu Seçim */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={createSearchQuery}
                      onChange={(e) => setCreateSearchQuery(e.target.value)}
                      placeholder="İsim veya sokak ara..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectAllInView(modalDisplayList)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 shrink-0"
                  >
                    {modalDisplayList.every((b) => selectedBeneficiaryIds.includes(String(b.id))) ? (
                      <>
                        <CheckSquare className="w-3.5 h-3.5 text-sky-600" />
                        <span>Seçimi Kaldır</span>
                      </>
                    ) : (
                      <>
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                        <span>Tümünü Seç</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Hane Listesi */}
                <div className="py-1 space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                  {modalDisplayList.map((person) => {
                    const isSelected = selectedBeneficiaryIds.includes(String(person.id));
                    const st = getRecordStreetInfo(person);

                    return (
                      <div
                        key={person.id}
                        onClick={() => handleToggleBeneficiary(String(person.id))}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-sky-50 border-sky-300 text-slate-900 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                              isSelected ? 'bg-sky-600 border-sky-700 text-white' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-900 truncate">
                                {person.ad_soyad}
                              </span>
                              {person.imza_durumu === 'IMZALANDI' && (
                                <span className="text-[9px] font-extrabold text-emerald-800 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-200">
                                  İmzalı
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {person.mahalle} • {st.sokak || person.acik_adres} {st.kapiNo ? `No:${st.kapiNo}` : ''}
                            </div>
                          </div>
                        </div>

                        <span className="text-[11px] font-bold text-slate-700 shrink-0 ml-2">
                          {person.hedef_torba || 34} Torba
                        </span>
                      </div>
                    );
                  })}

                  {modalDisplayList.length === 0 && (
                    <div className="p-6 text-center text-xs text-slate-500">
                      {createSelectionTab === 'SIGNED'
                        ? 'Henüz imzası alınan hane bulunamadı. "Tüm Bekleyenler" sekmesinden hane ekleyebilirsiniz.'
                        : 'Eşleşen kayıt bulunamadı.'}
                    </div>
                  )}
                </div>

                {/* Adım 1 Alt Butonlar */}
                <div className="pt-3 border-t border-slate-200 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn-secondary flex-1 text-xs py-2.5 font-bold"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateModalStep('ORDER')}
                    disabled={selectedBeneficiaryIds.length === 0}
                    className="btn-primary flex-1 text-xs py-2.5 font-bold flex items-center justify-center gap-1.5"
                  >
                    <span>Sıralamayı Belirle ({selectedBeneficiaryIds.length})</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {/* ADIM 2: DURAK SIRALAMASINI PERSONELİN BELİRLEMESİ */}
            {createModalStep === 'ORDER' && (
              <>
                {/* Sıralama Araç Çubuğu */}
                <div className="p-2.5 bg-sky-50 rounded-xl border border-sky-200 mb-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-sky-950 flex items-center gap-1">
                        <RouteIcon className="w-3.5 h-3.5 text-sky-700" />
                        <span>Kamyon Dağıtım Sırası</span>
                      </h4>
                      <p className="text-[11px] text-sky-800">
                        Sırayı telefonunuzdan <strong className="font-extrabold">▲ / ▼</strong> butonlarıyla belirleyin.
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleSortCreateStopsByAddress}
                        className="px-2 py-1 rounded-lg bg-white hover:bg-sky-100 text-sky-900 text-[11px] font-bold border border-sky-300 flex items-center gap-1 shadow-2xs active:scale-95"
                        title="Adrese ve kapı numarasına göre doğal sırala"
                      >
                        <ArrowUpDown className="w-3 h-3 text-sky-700" />
                        <span className="hidden sm:inline">Adrese Göre</span> Diz
                      </button>
                      <button
                        type="button"
                        onClick={handleReverseCreateStops}
                        className="px-2 py-1 rounded-lg bg-white hover:bg-sky-100 text-sky-900 text-[11px] font-bold border border-sky-300 flex items-center gap-1 shadow-2xs active:scale-95"
                        title="Sırayı tersine çevir"
                      >
                        <span>🔄</span>
                        <span className="hidden sm:inline">Ters</span> Çevir
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sıralı Duraklar Listesi */}
                <div className="py-1 space-y-2 max-h-60 overflow-y-auto pr-0.5">
                  {orderedCreateStops.map((person, index) => {
                    const st = getRecordStreetInfo(person);
                    const isFirst = index === 0;
                    const isLast = index === orderedCreateStops.length - 1;

                    return (
                      <div
                        key={person.id}
                        className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2 shadow-2xs hover:border-sky-300 transition-all"
                      >
                        {/* Sol Taraf: Sıra Numarası & Hane Bilgisi */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-sky-600 text-white font-black text-xs sm:text-sm flex items-center justify-center shrink-0 shadow-xs">
                            #{index + 1}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-extrabold text-slate-900 truncate">
                                {person.ad_soyad}
                              </span>
                              {person.imza_durumu === 'IMZALANDI' ? (
                                <span className="text-[9px] font-extrabold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-0.5">
                                  <PenTool className="w-2.5 h-2.5 text-emerald-700" />
                                  İmzalı
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1 py-0.2 rounded">
                                  İmzasız
                                </span>
                              )}
                              <span className="text-[10px] font-bold text-slate-600 font-mono">
                                ({person.hedef_torba || 34} T)
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-600 truncate mt-0.5">
                              <strong className="text-slate-800">{person.mahalle}</strong>
                              {st.sokak && <span> • {st.sokak}</span>}
                              {st.kapiNo && <span> No:{st.kapiNo}</span>}
                              {st.daireNo && <span> D:{st.daireNo}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Sağ Taraf: Dokunmatik Büyük ▲ / ▼ Butonları ve Çıkar */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* YUKARI BUTONU */}
                          <button
                            type="button"
                            onClick={() => handleMoveCreateStop(index, 'UP')}
                            disabled={isFirst}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center border font-bold transition-all active:scale-90 ${
                              isFirst
                                ? 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
                                : 'bg-slate-100 hover:bg-sky-100 border-slate-300 text-slate-800 hover:text-sky-900 shadow-2xs'
                            }`}
                            title="Yukarı Taşı"
                            aria-label={`Durak ${index + 1} yukarı taşı`}
                          >
                            <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                          </button>

                          {/* AŞAĞI BUTONU */}
                          <button
                            type="button"
                            onClick={() => handleMoveCreateStop(index, 'DOWN')}
                            disabled={isLast}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center border font-bold transition-all active:scale-90 ${
                              isLast
                                ? 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
                                : 'bg-slate-100 hover:bg-sky-100 border-slate-300 text-slate-800 hover:text-sky-900 shadow-2xs'
                            }`}
                            title="Aşağı Taşı"
                            aria-label={`Durak ${index + 1} aşağı taşı`}
                          >
                            <ArrowDown className="w-4 h-4 stroke-[2.5]" />
                          </button>

                          {/* LİSTEDEN ÇIKAR BUTONU */}
                          <button
                            type="button"
                            onClick={() => handleRemoveCreateStop(String(person.id))}
                            className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-all ml-0.5"
                            title="Listeden Kaldır"
                            aria-label="Listeden kaldır"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {orderedCreateStops.length === 0 && (
                    <div className="p-8 text-center text-xs text-slate-500">
                      Henüz rotaya eklenmiş hane yok. Lütfen &quot;1. Haneleri Seç&quot; sekmesine dönerek hane seçiniz.
                    </div>
                  )}
                </div>

                {/* Adım 2 Alt Butonlar */}
                <div className="pt-3 border-t border-slate-200 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateModalStep('SELECT')}
                    className="btn-secondary flex-1 text-xs py-2.5 font-bold"
                  >
                    ← Hane Seçimi
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateRouteSubmit}
                    disabled={isActionLoading || selectedBeneficiaryIds.length === 0}
                    className="btn-primary flex-1 text-xs py-2.5 font-bold flex items-center justify-center gap-1.5"
                  >
                    {isActionLoading ? (
                      <span>Oluşturuluyor...</span>
                    ) : (
                      <>
                        <RouteIcon className="w-4 h-4" />
                        <span>Rotayı Başlat ({selectedBeneficiaryIds.length} Durak)</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: DURAK İŞLEM MODALI (Tamam / Eksik / Verilemedi)  */}
      {/* ======================================================== */}
      {showStopModal && (
        <div className="modal-overlay" onClick={() => setShowStopModal(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    showStopModal.mode === 'TAMAMLANDI'
                      ? 'bg-emerald-100 text-emerald-800'
                      : showStopModal.mode === 'EKSIK'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {showStopModal.mode === 'TAMAMLANDI' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : showStopModal.mode === 'EKSIK' ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {showStopModal.mode === 'TAMAMLANDI'
                      ? 'Tam Teslimat Kaydı'
                      : showStopModal.mode === 'EKSIK'
                      ? 'Eksik Kömür Teslimatı'
                      : 'Teslim Edilemedi Kaydı'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {showStopModal.stop?.sira}. Durak: {showStopModal.stop?.ad_soyad}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStopModal(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            {/* Vatandaş Özet Kartı */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 mb-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">{showStopModal.stop?.ad_soyad}</span>
                <span className="text-xs font-mono font-bold text-amber-800">
                  TC: {showStopModal.stop?.tc_no}
                </span>
              </div>
              <p className="text-xs text-slate-600 truncate">{showStopModal.stop?.acik_adres}</p>
              <div className="text-[11px] font-bold text-slate-500">
                Hedef Kota: <strong className="text-slate-900">{showStopModal.stop?.hedef_torba || 34} Torba</strong>
              </div>
            </div>

            {/* Form Alanları */}
            <div className="space-y-3">
              {showStopModal.mode !== 'TESLIM_EDILEMEDI' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    {showStopModal.mode === 'TAMAMLANDI' ? 'Teslim Edilen Torba' : 'Kamyondan Verilen Torba'}
                  </label>
                  <input
                    type="number"
                    value={stopTorbaInput}
                    onChange={(e) => setStopTorbaInput(e.target.value)}
                    min="1"
                    max={showStopModal.stop?.hedef_torba || 34}
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono font-black text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                  {showStopModal.mode === 'EKSIK' && (
                    <p className="text-[11px] font-bold text-amber-800 mt-1">
                      Kalan Eksik Kömür:{' '}
                      {Math.max(0, (showStopModal.stop?.hedef_torba || 34) - (parseInt(stopTorbaInput, 10) || 0))} Torba
                    </p>
                  )}
                </div>
              )}

              {showStopModal.mode !== 'TESLIM_EDILEMEDI' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Teslim Alan Kişi</label>
                  <input
                    type="text"
                    value={stopRecipientInput}
                    onChange={(e) => setStopRecipientInput(e.target.value)}
                    placeholder="Ad Soyad veya Yakını"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  {showStopModal.mode === 'TESLIM_EDILEMEDI' ? 'Teslim Edilememe Nedeni' : 'Açıklama / Not'}
                </label>
                <input
                  type="text"
                  value={stopNoteInput}
                  onChange={(e) => setStopNoteInput(e.target.value)}
                  placeholder={
                    showStopModal.mode === 'TESLIM_EDILEMEDI'
                      ? 'Örn: Kapı açılmadı, evde kimse yok, taşınmış...'
                      : 'Opsiyonel not ekleyin'
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Hızlı Seçim Butonları (Teslim Edilemediğinde) */}
              {showStopModal.mode === 'TESLIM_EDILEMEDI' && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['Evde yok / Kapı kapalı', 'Adreste bulunamadı', 'Taşınmış / Ayrılmış', 'Teslimatı reddetti'].map(
                    (quick) => (
                      <button
                        key={quick}
                        type="button"
                        onClick={() => setStopNoteInput(quick)}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                      >
                        {quick}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Modal Butonları */}
            <div className="pt-4 border-t border-slate-200 flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowStopModal(null)}
                className="btn-secondary flex-1 text-xs py-2.5 font-bold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleStopActionSubmit}
                disabled={isActionLoading}
                className={`flex-1 text-xs py-2.5 font-black text-white rounded-xl shadow-xs transition-all active:scale-95 ${
                  showStopModal.mode === 'TAMAMLANDI'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : showStopModal.mode === 'EKSIK'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isActionLoading ? 'Kaydediliyor...' : 'Kaydet ve İlerle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: GÜNÜ BİTİR / ROTAYI TAMAMLA & ARŞİVLE MODALI     */}
      {/* ======================================================== */}
      {showFinalizeModal && activeRoute && (
        <div className="modal-overlay" onClick={() => setShowFinalizeModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Günlük Dağıtımı Bitir</h3>
                  <p className="text-xs text-slate-500">Rotayı tamamla ve arşive kaldır</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFinalizeModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            {/* Gün Sonu Özeti */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 mb-3">
              <h4 className="text-xs font-black uppercase text-slate-700">Dağıtım Sonuçları:</h4>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded-xl bg-white border border-slate-200">
                  <span className="text-emerald-700 font-black text-sm block">
                    {activeRoute.tamamlanan_hane || 0}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">Tam Hane</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-slate-200">
                  <span className="text-amber-700 font-black text-sm block">
                    {activeRoute.eksik_hane || 0}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">Eksik Hane</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-slate-200">
                  <span className="text-rose-700 font-black text-sm block">
                    {activeRoute.teslim_edilemeyen_hane || 0}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">Verilemedi</span>
                </div>
              </div>
              <p className="text-xs text-slate-600 font-medium pt-1">
                Toplam Dağıtılan Kömür:{' '}
                <strong className="text-slate-900 font-black">
                  {activeRoute.toplam_dagitilan_torba || 0} Torba
                </strong>
              </p>
            </div>

            {/* Bekleyen Durak Uyarısı */}
            {(() => {
              const pendingCount =
                (activeRoute.duraklar || []).filter((s: any) => !s.durum || s.durum === 'BEKLIYOR').length;
              if (pendingCount > 0) {
                return (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold flex items-start gap-2 mb-3">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <strong>Dikkat: {pendingCount} hane henüz dağıtılmadı!</strong>
                      <p className="text-[11px] font-normal text-amber-800 mt-0.5">
                        Rotayı şimdi tamamlarsanız bu haneler sistemde teslim edilmemiş olarak kalacaktır.
                      </p>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Kapanış / Vardiya Notu</label>
              <textarea
                value={finalizeNote}
                onChange={(e) => setFinalizeNote(e.target.value)}
                placeholder="Örn: Günlük dağıtım tamamlandı. Kamyonda 15 torba kömür kaldı."
                rows={2}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => setShowFinalizeModal(false)}
                className="btn-secondary flex-1 text-xs py-2.5 font-bold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleFinalizeRouteSubmit}
                disabled={isActionLoading}
                className="flex-1 text-xs py-2.5 font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all active:scale-95"
              >
                {isActionLoading ? 'Tamamlanıyor...' : 'Onayla ve Arşivle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: ROTA SİLME ONAYI                                */}
      {/* ======================================================== */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Rotayı Sil</h3>
                <p className="text-xs text-slate-500">Aktif dağıtım rotasını kaldırmak üzeresiniz</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Bu işlem aktif rotayı sistemden silecektir. Tamamlanmış olan kömür teslimat kayıtları vatandaş geçmişinde korunur. Devam etmek istiyor musunuz?
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-secondary flex-1 text-xs py-2.5 font-bold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleDeleteRoute}
                disabled={isActionLoading}
                className="flex-1 text-xs py-2.5 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs"
              >
                {isActionLoading ? 'Siliniyor...' : 'Evet, Rotayı Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
