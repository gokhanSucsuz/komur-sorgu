'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Route as RouteIcon, MapPin, Navigation, CheckCircle2, AlertTriangle, XCircle,
  Clock, Plus, ArrowUp, ArrowDown, Users, Phone, Truck, Trash2, Archive,
  CheckSquare, Square, Search, RefreshCw, FileText, ChevronDown, ChevronUp,
  AlertCircle, ShieldCheck, PenTool, Check, ArrowRight, Download, Printer,
  ArrowUpDown, X, UserMinus, Play, Pause, SkipForward, ChevronLeft, ChevronRight,
  Undo2, Lock, Unlock, ListOrdered
} from 'lucide-react';
import CancelModal from '@/components/CancelModal';
import { showAlert, showConfirm, showToast } from '@/components/GlobalAlertManager';
import { formatPhoneDisplay, getRecordStreetInfo, compareByAddressAsc, isBirebirBeneficiaryMatch } from '@/lib/normalizer';

function getOrCreateClientId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = sessionStorage.getItem('komur_client_id');
    if (!id) {
      id = 'cid_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      sessionStorage.setItem('komur_client_id', id);
    }
    return id;
  } catch {
    return 'cid_' + Math.random().toString(36).substring(2, 9);
  }
}

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
  const [currentClientId] = useState<string>(() => getOrCreateClientId());
  const [activeTab, setActiveTab] = useState<'ACTIVE_ROUTE' | 'ARCHIVE'>('ACTIVE_ROUTE');
  const [printRoute, setPrintRoute] = useState<any | null>(null);
  const [activeRoutes, setActiveRoutes] = useState<any[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  // Active route currently selected & being viewed/worked on
  const activeRoute = useMemo(() => {
    if (!activeRoutes || activeRoutes.length === 0) return null;
    if (selectedRouteId) {
      const found = activeRoutes.find((r) => String(r.id || r._id) === String(selectedRouteId));
      if (found) return found;
    }
    return activeRoutes[0] || null;
  }, [activeRoutes, selectedRouteId]);

  // Set of beneficiary IDs currently assigned to an ongoing active route
  const activeAssignedSet = useMemo(() => {
    const set = new Set<string>();
    activeRoutes.forEach((r) => {
      (r.duraklar || []).forEach((d: any) => {
        if (d.durum !== 'TAMAMLANDI') {
          set.add(String(d.beneficiary_id));
        }
      });
    });
    return set;
  }, [activeRoutes]);

  // ========================================================
  // ROTA MODU (SIRALI SAHA TESLİMAT MODU - UBER/LYFT COCKPIT)
  // ========================================================
  const [isRouteModeOpen, setIsRouteModeOpen] = useState<boolean>(false);
  const [routeModeIndex, setRouteModeIndex] = useState<number>(0);
  const [routeModeTab, setRouteModeTab] = useState<'DELIVER' | 'DEFER'>('DELIVER');
  const [routeModeDeferType, setRouteModeDeferType] = useState<'PARTIAL' | 'ZERO'>('PARTIAL');
  const [routeModeTorba, setRouteModeTorba] = useState<string>('34');
  const [routeModeRecipient, setRouteModeRecipient] = useState<string>('');
  const [routeModeNote, setRouteModeNote] = useState<string>('');
  const [routeModePausedNotice, setRouteModePausedNotice] = useState<boolean>(false);
  const [showStopPickerModal, setShowStopPickerModal] = useState<boolean>(false);
  const [stopPickerSearch, setStopPickerSearch] = useState<string>('');
  const [stopPickerFilter, setStopPickerFilter] = useState<'ALL' | 'WAITING' | 'DONE'>('ALL');
  const [routeStatusBanner, setRouteStatusBanner] = useState<{
    type: 'COMPLETED' | 'PAUSED' | 'INFO';
    title: string;
    message: string;
  } | null>(null);

  // Route lock status: Is the selected activeRoute locked by another staff or another device?
  const isRouteLockedByOther = useMemo(() => {
    if (!activeRoute || !activeRoute.kilitli_personel) return false;
    const lockTimestamp = Number(activeRoute.kilit_timestamp) || 0;
    const isExpired = lockTimestamp > 0 && Date.now() - lockTimestamp > 25 * 60 * 1000;
    if (isExpired) return false;

    // If THIS tab/device has Route Mode open AND route has our client_id:
    if (isRouteModeOpen && activeRoute.kilitli_client_id && activeRoute.kilitli_client_id === currentClientId) {
      return false; // I am the one actively running Route Mode!
    }

    // If locked to another client/device:
    if (activeRoute.kilitli_client_id) {
      return activeRoute.kilitli_client_id !== currentClientId;
    }

    // Fallback: If personnel name differs
    const currentStaff = (userName || 'Personel').trim().toLowerCase();
    const lockedStaff = String(activeRoute.kilitli_personel).trim().toLowerCase();
    return lockedStaff !== currentStaff;
  }, [activeRoute, userName, isRouteModeOpen, currentClientId]);

  const routeLockedByName = activeRoute?.kilitli_personel ? String(activeRoute.kilitli_personel).trim() : '';

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
  const [cancelStopTarget, setCancelStopTarget] = useState<any | null>(null);
  const [expandedArchivedRouteId, setExpandedArchivedRouteId] = useState<string | null>(null);

  // Stop Action Modal State
  const [stopTorbaInput, setStopTorbaInput] = useState<string>('34');
  const [stopRecipientInput, setStopRecipientInput] = useState<string>('');
  const [stopNoteInput, setStopNoteInput] = useState<string>('');
  const [stopDeferLaterInput, setStopDeferLaterInput] = useState<boolean>(true);

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

  // ESC key listener to close report modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && printRoute) {
        setPrintRoute(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [printRoute]);

  // Fetch routes data
  const fetchRoutes = useCallback(async (silentOrEvent?: boolean | any) => {
    const silent = typeof silentOrEvent === 'boolean' ? silentOrEvent : false;
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch(`/api/routes?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'x-client-id': currentClientId
        }
      });
      const data = await res.json();
      if (data.success) {
        const routes = data.activeRoutes || (data.activeRoute ? [data.activeRoute] : []);
        setActiveRoutes(routes);
        setSelectedRouteId((prev) => {
          if (prev && routes.some((r: any) => String(r.id || r._id) === String(prev))) {
            return prev;
          }
          return routes[0] ? String(routes[0].id || routes[0]._id) : null;
        });
        setArchivedRoutes(data.archivedRoutes || []);
        setSignedBeneficiaries(data.signedBeneficiaries || []);
      }
    } catch (err) {
      console.error('Error fetching routes:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [currentClientId]);

  // Fetch pending beneficiaries for custom route building
  const fetchPendingBeneficiaries = useCallback(async () => {
    try {
      const res = await fetch('/api/beneficiaries?durum=HEPSI&limit=0');
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

  // Real-time synchronization polling for Route Page:
  // Detects when another staff starts/exits route mode, locks/unlocks a route, or updates a stop
  const lastSyncPulseRef = useRef<string>('');
  const lastRouteLocksRef = useRef<string>('');
  const wasLockedRef = useRef<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const checkPulse = async () => {
      if (typeof window !== 'undefined') {
        if (!navigator.onLine || document.visibilityState === 'hidden') return;
      }
      try {
        const res = await fetch(`/api/sync/status?_t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'x-client-id': currentClientId
          }
        });
        const data = await res.json();
        if (data.success) {
          const syncTime = data.lastSyncTime || '';
          const locksJson = JSON.stringify(data.activeRouteLocks || []);

          const hasSyncTimeChanged = Boolean(lastSyncPulseRef.current && syncTime !== lastSyncPulseRef.current);
          const hasLocksChanged = Boolean(lastRouteLocksRef.current && locksJson !== lastRouteLocksRef.current);

          lastSyncPulseRef.current = syncTime;
          lastRouteLocksRef.current = locksJson;

          if ((hasSyncTimeChanged || hasLocksChanged) && isMounted) {
            await fetchRoutes(true); // Silent fetch without spinner
          }
        }
      } catch (e) {
        // blip or offline
      }
    };

    // Smart quota-friendly poll every 4 seconds while viewing routes (pauses automatically when screen is off)
    const interval = setInterval(checkPulse, 4000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkPulse();
      }
    };

    window.addEventListener('focus', checkPulse);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', checkPulse);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchRoutes, currentClientId]);

  // Notify when a route that was locked by another staff is now unlocked
  useEffect(() => {
    if (wasLockedRef.current && !isRouteLockedByOther && activeRoute) {
      showToast({
        type: 'success',
        title: '🟢 Rota Kilidi Kaldırıldı',
        message: `"${activeRoute.rota_adi}" rotası serbest bırakıldı. Artık Rota Modunu başlatabilirsiniz.`
      });
    }
    wasLockedRef.current = isRouteLockedByOther;
  }, [isRouteLockedByOther, activeRoute]);

  // KURAL: Yalnızca imzası alınmış, kömürü teslim edilmemiş ve başka aktif rotada olmayan hanelerle yeni rota başlatılabilir
  const availableSignedBeneficiaries = useMemo(() => {
    return (signedBeneficiaries || []).filter(
      (b: any) =>
        b.imza_durumu === 'IMZALANDI' &&
        b.teslimat_durumu !== 'TAMAMLANDI' &&
        b.teslimat_durumu !== 'TESLIM_EDILDI' &&
        !activeAssignedSet.has(String(b.id))
    );
  }, [signedBeneficiaries, activeAssignedSet]);

  // Open Create Route Modal
  const handleOpenCreateModal = async () => {
    const todayStr = new Date().toLocaleDateString('tr-TR');
    const teamNum = (activeRoutes?.length || 0) + 1;
    setNewRouteName(`Ekip ${teamNum} - ${todayStr} Dağıtım Rotası`);
    setNewRouteStaff(userName || `Ekip ${teamNum}`);
    setNewRoutePlate('');
    setNewRouteNote('');

    try {
      const res = await fetch(`/api/routes?_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.signedBeneficiaries) {
        setSignedBeneficiaries(data.signedBeneficiaries);
        // Exclude beneficiaries that are already assigned to an ongoing active route or already delivered
        const availableSigned = (data.signedBeneficiaries || []).filter(
          (b: any) =>
            b.imza_durumu === 'IMZALANDI' &&
            b.teslimat_durumu !== 'TAMAMLANDI' &&
            b.teslimat_durumu !== 'TESLIM_EDILDI' &&
            !activeAssignedSet.has(String(b.id))
        );

        if (availableSigned.length === 0) {
          showAlert({
            title: 'İmzalı Hane Bulunamadı',
            message:
              'İmzası alınmış ve kömürü teslim edilmemiş hane bulunmadığı için yeni dağıtım rotası başlatılamaz.\n\nLütfen önce Sorgu ekranından teslimat yapılacak hanelerin imzasını alınız.',
            type: 'warning'
          });
          return;
        }

        setCreateSelectionTab('SIGNED');
        setSelectedBeneficiaryIds(availableSigned.map((b: any) => String(b.id)));
      } else if (availableSignedBeneficiaries.length === 0) {
        showAlert({
          title: 'İmzalı Hane Bulunamadı',
          message:
            'İmzası alınmış ve kömürü teslim edilmemiş hane bulunmadığı için yeni dağıtım rotası başlatılamaz.\n\nLütfen önce Sorgu ekranından teslimat yapılacak hanelerin imzasını alınız.',
          type: 'warning'
        });
        return;
      }
    } catch (e) {
      console.error(e);
      if (availableSignedBeneficiaries.length === 0) {
        showAlert({
          title: 'İmzalı Hane Bulunamadı',
          message:
            'İmzası alınmış ve kömürü teslim edilmemiş hane bulunmadığı için yeni dağıtım rotası başlatılamaz.',
          type: 'warning'
        });
        return;
      }
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

  // Helper: Sync Rota Modu form inputs when switching to a stop
  const syncRouteModeInputsForStop = useCallback((stop: any) => {
    if (!stop) return;
    const hedef = Number(stop.hedef_torba) || 34;
    const prevDelivered = Number(stop.teslim_edilen_torba) || 0;
    setRouteModeTab('DELIVER');
    setRouteModeTorba(String(hedef));
    setRouteModeRecipient(stop.teslim_alan || stop.ad_soyad || '');
    setRouteModeNote(stop.teslimat_notu || '');
    setRouteModeDeferType(prevDelivered > 0 ? 'PARTIAL' : 'PARTIAL');
    setRouteModePausedNotice(false);
  }, []);

  // Rota Modunda Sıradaki Haneyi Şimdilik Atla (Sonraki Haneye Geç)
  const handleSkipCurrentStop = () => {
    if (!activeRoute || !activeRoute.duraklar) return;
    const stops = activeRoute.duraklar;
    const currentStop = stops[routeModeIndex];

    // 1. Önce mevcut duraktan sonraki tamamlanmamış haneyi ara
    let nextIdx = stops.findIndex(
      (s: any, idx: number) => idx > routeModeIndex && s.durum !== 'TAMAMLANDI'
    );

    // 2. Eğer sonrasındaki tüm haneler bitmişse, baştan itibaren tamamlanmamış haneyi ara (döngü)
    if (nextIdx === -1) {
      nextIdx = stops.findIndex(
        (s: any, idx: number) => idx !== routeModeIndex && s.durum !== 'TAMAMLANDI'
      );
    }

    if (nextIdx !== -1) {
      const nextStop = stops[nextIdx];
      setRouteModePausedNotice(false);
      setRouteModeIndex(nextIdx);
      syncRouteModeInputsForStop(nextStop);
      showToast({
        type: 'info',
        title: 'Hane Şimdilik Atlandı',
        message: `#${currentStop?.sira || routeModeIndex + 1} (${currentStop?.ad_soyad}) atlandı. #${nextStop?.sira || nextIdx + 1} (${nextStop?.ad_soyad}) hanesine geçildi. Atlanan hane rotanın devamında tekrar sıraya gelecektir.`,
        durationMs: 4000
      });
    } else {
      showToast({
        type: 'warning',
        title: 'Atlanabilecek Başka Hane Yok',
        message: 'Rotada geçilebilecek başka tamamlanmamış hane bulunmuyor.',
      });
    }
  };

  // Open Rota Modu (Uber/Lyft style sequential field delivery cockpit)
  const handleOpenRouteMode = async (targetRoute?: any, forcedStopIndex?: number) => {
    const routeToUse = targetRoute || activeRoute;
    if (!routeToUse || !routeToUse.duraklar || routeToUse.duraklar.length === 0) return;

    const routeId = routeToUse.id || routeToUse._id;
    const stops = routeToUse.duraklar;
    let startIdx = 0;

    if (typeof forcedStopIndex === 'number' && forcedStopIndex >= 0 && forcedStopIndex < stops.length) {
      startIdx = forcedStopIndex;
    } else {
      // 1. Prefer first unvisited stop (BEKLIYOR)
      const firstWaitingIdx = stops.findIndex((s: any) => !s.durum || s.durum === 'BEKLIYOR');
      if (firstWaitingIdx !== -1) {
        startIdx = firstWaitingIdx;
      } else {
        // 2. Otherwise first deferred / incomplete stop (EKSIK or TESLIM_EDILEMEDI)
        const firstIncompleteIdx = stops.findIndex((s: any) => s.durum !== 'TAMAMLANDI');
        startIdx = firstIncompleteIdx !== -1 ? firstIncompleteIdx : 0;
      }
    }

    // Rota kilidini al / tek personel kuralı kontrolü
    setIsActionLoading(true);
    try {
      const lockRes = await fetch('/api/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': currentClientId
        },
        body: JSON.stringify({
          action: 'ACQUIRE_ROUTE_LOCK',
          route_id: routeId,
          personel: userName || 'Personel',
          client_id: currentClientId,
          stop_index: startIdx
        })
      });
      const lockData = await lockRes.json();
      if (!lockData.success) {
        showAlert({
          title: '🔒 Rota Kullanımda & Kilitli',
          message:
            lockData.error ||
            'Bu rota şu anda başka bir personel tarafından Rota Modunda kullanılmaktadır. Aynı anda yalnızca bir personel bir rotayı kullanabilir.',
          type: 'lock',
          badge: lockData.locked_by || routeLockedByName || undefined
        });
        await fetchRoutes(true);
        return;
      }
    } catch (err: any) {
      console.error('Lock acquisition error:', err);
      showAlert({
        title: 'Bağlantı Hatası',
        message: 'Rota kilidi kontrolünde hata oluştu: ' + err.message,
        type: 'error'
      });
      return;
    } finally {
      setIsActionLoading(false);
    }

    setSelectedRouteId(String(routeId));
    setRouteModeIndex(startIdx);
    syncRouteModeInputsForStop(stops[startIdx]);
    setRouteStatusBanner(null);
    setIsRouteModeOpen(true);

    // If the route was temporarily paused (DURAKLATILDI), resume it to AKTIF
    if (routeToUse.durum === 'DURAKLATILDI') {
      try {
        await fetch('/api/routes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': currentClientId
          },
          body: JSON.stringify({
            action: 'RESUME_ROUTE',
            route_id: routeId,
            personel: userName || 'Saha Personeli',
            client_id: currentClientId
          })
        });
        setActiveRoutes((prev) =>
          prev.map((r) =>
            String(r.id || r._id) === String(routeId)
              ? { ...r, durum: 'AKTIF' }
              : r
          )
        );
      } catch (e) {
        console.error('Error resuming route:', e);
      }
    }
  };

  // Normal Exit Rota Modu (Release lock)
  const handleExitRouteMode = async () => {
    setIsRouteModeOpen(false);
    setRouteModePausedNotice(false);

    if (activeRoute) {
      const routeId = activeRoute.id || activeRoute._id;
      try {
        await fetch('/api/routes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': currentClientId
          },
          body: JSON.stringify({
            action: 'RELEASE_ROUTE_LOCK',
            route_id: routeId,
            personel: userName || 'Personel',
            client_id: currentClientId
          })
        });
        await fetchRoutes();
        if (onRefreshAll) onRefreshAll();
      } catch (e) {
        console.error('Error releasing route lock on exit:', e);
      }
    }
  };

  // Pause Route and Exit Rota Modu (releases lock on backend)
  const handlePauseRouteAndExit = async (customReason?: string) => {
    if (!activeRoute) {
      setIsRouteModeOpen(false);
      return;
    }
    setIsActionLoading(true);
    try {
      await fetch('/api/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': currentClientId
        },
        body: JSON.stringify({
          action: 'PAUSE_ROUTE',
          route_id: activeRoute.id || activeRoute._id,
          notlar: customReason || 'Personel tarafından rota geçici olarak durduruldu (Daha sonra devam edilecek).',
          personel: userName || 'Saha Personeli',
          client_id: currentClientId
        })
      });
      await fetchRoutes();
      setIsRouteModeOpen(false);
      setRouteModePausedNotice(false);
      setRouteStatusBanner({
        type: 'PAUSED',
        title: '⏸️ Rota Geçici Olarak Durduruldu',
        message: `"${activeRoute.rota_adi}" rotası geçici olarak durduruldu ve serbest bırakıldı. Eksik veya bekleyen kayıtları tamamlamak için istediğiniz zaman "Rota Moduna Devam Et" butonuna tıklayabilirsiniz.`
      });
      if (onRefreshAll) onRefreshAll();
    } catch (e) {
      console.error('Error pausing route:', e);
      setIsRouteModeOpen(false);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Admin Force Unlock
  const handleForceUnlockRoute = async (routeId: string) => {
    const confirmed = await showConfirm({
      title: 'Rotanın Kilidini Kaldır',
      message: `Bu rotanın kilidini zorla kaldırmak istediğinize emin misiniz?\n\n"${routeLockedByName || 'Diğer personel'}" personeline ait aktif Rota Modu oturumu sonlandırılabilir.`,
      type: 'warning',
      confirmText: 'Evet, Kilidi Kaldır',
      cancelText: 'Vazgeç'
    });
    if (!confirmed) {
      return;
    }
    setIsActionLoading(true);
    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': currentClientId
        },
        body: JSON.stringify({
          action: 'RELEASE_ROUTE_LOCK',
          route_id: routeId,
          force: true,
          personel: userName || 'Admin',
          client_id: currentClientId
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast({
          type: 'success',
          title: 'Kilit Kaldırıldı',
          message: 'Rota kilidi başarıyla kaldırıldı.'
        });
        await fetchRoutes();
        if (onRefreshAll) onRefreshAll();
      } else {
        showAlert({
          title: 'İşlem Başarısız',
          message: data.error || 'Kilit kaldırılamadı',
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
      setIsActionLoading(false);
    }
  };

  // Heartbeat to keep route lock active and report current active stop while in Route Mode
  useEffect(() => {
    if (!isRouteModeOpen || !activeRoute) return;
    const routeId = activeRoute.id || activeRoute._id;
    if (!routeId) return;

    const sendHeartbeat = async () => {
      try {
        await fetch('/api/routes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': currentClientId
          },
          body: JSON.stringify({
            action: 'HEARTBEAT_ROUTE_LOCK',
            route_id: routeId,
            personel: userName || 'Personel',
            client_id: currentClientId,
            stop_index: routeModeIndex
          })
        });
      } catch (err) {
        console.error('Heartbeat route lock error:', err);
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 20 * 1000);

    return () => clearInterval(interval);
  }, [isRouteModeOpen, activeRoute?.id, activeRoute?._id, routeModeIndex, userName, currentClientId]);

  // Sign beneficiary directly inside Rota Modu (1-tap kapıda imza)
  const handleSignInRouteMode = async (stopIndex: number, stop: any) => {
    if (!stop || !stop.beneficiary_id) return;
    setIsActionLoading(true);
    try {
      const res = await fetch('/api/beneficiaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SIGN_BENEFICIARY',
          id: stop.beneficiary_id,
          personel: userName || 'Saha Personeli'
        })
      });
      const data = await res.json();
      if (data.success) {
        // Optimistic update on activeRoutes
        setActiveRoutes((prev) =>
          prev.map((r) => {
            if (String(r.id || r._id) !== String(activeRoute?.id || activeRoute?._id)) return r;
            const nextStops = [...(r.duraklar || [])];
            if (nextStops[stopIndex]) {
              nextStops[stopIndex] = { ...nextStops[stopIndex], imza_durumu: 'IMZALANDI' };
            }
            return { ...r, duraklar: nextStops };
          })
        );
        if (onRefreshAll) onRefreshAll();
      } else {
        showAlert({
          title: 'İmza Güncellenemedi',
          message: data.error || 'İmza durumu güncellenemedi',
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
      setIsActionLoading(false);
    }
  };

  // Submit stop action inside Rota Modu (Full Delivery OR Defer/Partial for Later)
  const handleRouteModeSubmit = async (submitKind: 'COMPLETE' | 'DEFER_LATER') => {
    if (!activeRoute || !activeRoute.duraklar) return;
    const stops = activeRoute.duraklar;
    const currentStop = stops[routeModeIndex];
    if (!currentStop) return;

    const hedef = Number(currentStop.hedef_torba) || 34;
    let targetDurum: 'TAMAMLANDI' | 'EKSIK' | 'TESLIM_EDILEMEDI' = 'TAMAMLANDI';
    let targetTorba = hedef;
    let targetNote = routeModeNote.trim();

    if (submitKind === 'COMPLETE') {
      const parsed = parseInt(routeModeTorba, 10);
      targetTorba = !isNaN(parsed) && parsed > 0 ? parsed : hedef;
      targetDurum = targetTorba < hedef ? 'EKSIK' : 'TAMAMLANDI';
    } else {
      // DEFER_LATER ("Daha Sonra Tamamlanacak")
      if (routeModeDeferType === 'PARTIAL') {
        const parsed = parseInt(routeModeTorba, 10);
        if (isNaN(parsed) || parsed <= 0) {
          showAlert({
            title: 'Torba Sayısı Gerekli',
            message: 'Kısmi teslimat için en az 1 torba girilmelidir. Eğer şu an hiç kömür bırakılamadıysa "Şu An Teslim Edilemedi (0 Torba)" seçeneğini seçiniz.',
            type: 'warning'
          });
          return;
        }
        if (parsed >= hedef) {
          showAlert({
            title: 'Tam Teslimat Uyarısı',
            message: `Hedef kota (${hedef} torba) kadar giriş yaptınız. Tam teslimat için "Tam Teslimat Yap" butonunu kullanınız.`,
            type: 'warning'
          });
          return;
        }
        targetDurum = 'EKSIK';
        targetTorba = parsed;
        if (!targetNote) {
          targetNote = 'Kısmi teslimat yapıldı - Kalanı daha sonra tamamlanacak';
        }
      } else {
        targetDurum = 'TESLIM_EDILEMEDI';
        targetTorba = 0;
        if (!targetNote) {
          targetNote = 'Daha sonra tamamlanacak (Geçici olarak atlandı)';
        }
      }
    }

    setIsActionLoading(true);
    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': currentClientId
        },
        body: JSON.stringify({
          action: 'UPDATE_STOP',
          route_id: activeRoute.id || activeRoute._id,
          stop_index: routeModeIndex,
          durum: targetDurum,
          torba_sayisi: targetTorba,
          teslim_alan: routeModeRecipient.trim() || currentStop.ad_soyad,
          notlar: targetNote,
          daha_sonra_tamamlanacak: submitKind === 'DEFER_LATER' || targetDurum !== 'TAMAMLANDI',
          personel: userName || 'Dağıtım Personeli',
          client_id: currentClientId
        })
      });

      const data = await res.json();
      if (!data.success) {
        showAlert({
          title: 'Durak Güncellenemedi',
          message: data.error || 'Durak güncellenemedi',
          type: 'error'
        });
        return;
      }

      // Build reliable updatedStops array (from API response or local fallback)
      const fallbackUpdatedStops = stops.map((s: any, idx: number) =>
        idx === routeModeIndex
          ? data.stop || {
              ...s,
              durum: targetDurum,
              teslim_edilen_torba: targetTorba,
              teslim_alan: routeModeRecipient.trim() || currentStop.ad_soyad,
              teslimat_notu: targetNote,
              daha_sonra_tamamlanacak: targetDurum !== 'TAMAMLANDI'
            }
          : s
      );
      const updatedStops: any[] =
        (Array.isArray(data.duraklar) && data.duraklar.length > 0 && data.duraklar) ||
        (Array.isArray(data.route?.duraklar) && data.route.duraklar.length > 0 && data.route.duraklar) ||
        fallbackUpdatedStops;

      const allCompleted =
        Boolean(data.routeAutoCompleted) ||
        (updatedStops.length > 0 && updatedStops.every((s: any) => s.durum === 'TAMAMLANDI'));

      // Case 1: All stops in the route are now TAMAMLANDI -> finalize route & exit Rota Modu!
      if (allCompleted) {
        setIsRouteModeOpen(false);
        setRouteModePausedNotice(false);
        setRouteStatusBanner({
          type: 'COMPLETED',
          title: '🎉 Tüm Kayıtlar Tamamlandı — Rota "Tamamlandı" Durumuna Geçti!',
          message: `"${activeRoute.rota_adi}" rotasındaki tüm hanelerin kömür teslimatı eksiksiz tamamlandı. Rota Modundan otomatik çıkış yapıldı ve rota arşivlendi.`
        });
        await fetchRoutes();
        if (onRefreshAll) onRefreshAll();
        return;
      }

      // Immediately update activeRoutes in memory so the UI transitions without waiting or flickering
      const currentRouteId = String(activeRoute.id || activeRoute._id);
      setActiveRoutes((prev) =>
        prev.map((r) => {
          if (String(r.id || r._id) !== currentRouteId) return r;
          if (data.route) return data.route;
          return {
            ...r,
            durum: data.routeStatus || r.durum,
            duraklar: updatedStops,
            tamamlanan_hane: data.stats?.tamamlanan_hane ?? r.tamamlanan_hane,
            eksik_hane: data.stats?.eksik_hane ?? r.eksik_hane,
            teslim_edilemeyen_hane: data.stats?.teslim_edilemeyen_hane ?? r.teslim_edilemeyen_hane,
            toplam_dagitilan_torba: data.stats?.toplam_dagitilan_torba ?? r.toplam_dagitilan_torba
          };
        })
      );

      // Case 2: Is there any remaining uncompleted stop AFTER the current stop?
      // (Whether current stop was completed OR left incomplete, always advance to the next stop!)
      const nextStopIndexAfter = updatedStops.findIndex(
        (s: any, idx: number) => idx > routeModeIndex && s.durum !== 'TAMAMLANDI'
      );

      if (nextStopIndexAfter !== -1) {
        setRouteModePausedNotice(false);
        setRouteModeIndex(nextStopIndexAfter);
        syncRouteModeInputsForStop(updatedStops[nextStopIndexAfter]);
        if (onRefreshAll) onRefreshAll();
        return;
      }

      // Case 2B: Sonraki haneler bittiyse, önceden atlanmış ve hala bekleyen (BEKLIYOR) hanelere otomatik dön!
      const firstSkippedWaitingStop = updatedStops.findIndex(
        (s: any, idx: number) => idx < routeModeIndex && (!s.durum || s.durum === 'BEKLIYOR')
      );

      if (firstSkippedWaitingStop !== -1) {
        setRouteModePausedNotice(false);
        setRouteModeIndex(firstSkippedWaitingStop);
        syncRouteModeInputsForStop(updatedStops[firstSkippedWaitingStop]);
        showToast({
          type: 'info',
          title: 'Sıradaki Atlanan Haneye Dönüldü',
          message: `Sonraki kayıtlar tamamlandı. Önceden atlanan #${updatedStops[firstSkippedWaitingStop].sira || firstSkippedWaitingStop + 1} nolu haneye (${updatedStops[firstSkippedWaitingStop].ad_soyad}) geçildi.`,
          durationMs: 4500
        });
        if (onRefreshAll) onRefreshAll();
        return;
      }

      // Case 2C: Bekleyen yoksa, daha önce "Daha Sonra Tamamlanacak" olarak işaretlenen eksik hanelere dön
      const firstDeferredStop = updatedStops.findIndex(
        (s: any, idx: number) => idx < routeModeIndex && s.durum !== 'TAMAMLANDI'
      );

      if (firstDeferredStop !== -1) {
        setRouteModePausedNotice(false);
        setRouteModeIndex(firstDeferredStop);
        syncRouteModeInputsForStop(updatedStops[firstDeferredStop]);
        showToast({
          type: 'info',
          title: 'Eksik / Ertelenen Haneye Dönüldü',
          message: `Daha önce eksik bırakılan #${updatedStops[firstDeferredStop].sira || firstDeferredStop + 1} nolu haneye (${updatedStops[firstDeferredStop].ad_soyad}) dönüldü.`,
          durationMs: 4500
        });
        if (onRefreshAll) onRefreshAll();
        return;
      }

      // Case 3: We just processed the LAST stop in the sequence (no stops left after currentStop and no skipped stops left),
      // and since allCompleted is false, there are incomplete/deferred stops in the route -> Show Pause screen!
      setRouteModePausedNotice(true);
      setRouteStatusBanner({
        type: 'PAUSED',
        title: '⏸️ Rota Ziyaretleri Tamamlandı — Eksik Kayıtlar Bekliyor',
        message: `"${activeRoute.rota_adi}" rotasındaki tüm haneler ziyaret edildi. Eksik / daha sonra tamamlanacak kayıtlar bulunduğu için rota geçici olarak durduruldu.`
      });
      await fetchRoutes();
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      showAlert({
        title: 'Bağlantı Hatası',
        message: 'Bağlantı hatası: ' + err.message,
        type: 'error'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Stop Delivery Cancellation Success Handler (both Rota Modu & Route stop list)
  const handleCancelStopSuccess = async (updatedBeneficiary?: any) => {
    const cancelledTarget = cancelStopTarget;
    setCancelStopTarget(null);

    if (activeRoute) {
      const targetBenId = String(
        cancelledTarget?.beneficiary_id ||
        cancelledTarget?.id ||
        updatedBeneficiary?.id ||
        ''
      );
      const targetTc = cancelledTarget?.tc_no || updatedBeneficiary?.tc_no || '';

      const updatedStops = (activeRoute.duraklar || []).map((s: any, idx: number) => {
        const isMatch =
          (targetBenId && String(s.beneficiary_id) === targetBenId) ||
          (targetTc && s.tc_no === targetTc) ||
          (isRouteModeOpen && idx === routeModeIndex);

        if (isMatch) {
          return {
            ...s,
            durum: 'BEKLIYOR',
            teslim_edilen_torba: 0,
            teslim_tarihi: null,
            teslim_eden_personel: null,
            teslim_alan: '',
            teslimat_notu: '',
            daha_sonra_tamamlanacak: false
          };
        }
        return s;
      });

      let completedCount = 0;
      let eksikCount = 0;
      let undeliveredCount = 0;
      let totalDeliveredBags = 0;

      updatedStops.forEach((s: any) => {
        if (s.durum === 'TAMAMLANDI') {
          completedCount++;
          totalDeliveredBags += s.teslim_edilen_torba || s.hedef_torba || 34;
        } else if (s.durum === 'EKSIK') {
          eksikCount++;
          totalDeliveredBags += s.teslim_edilen_torba || 0;
        } else if (s.durum === 'TESLIM_EDILEMEDI') {
          undeliveredCount++;
        }
      });

      const currentRouteId = String(activeRoute.id || activeRoute._id);
      setActiveRoutes((prev) =>
        prev.map((r) => {
          if (String(r.id || r._id) !== currentRouteId) return r;
          return {
            ...r,
            durum: 'AKTIF',
            duraklar: updatedStops,
            tamamlanan_hane: completedCount,
            eksik_hane: eksikCount,
            teslim_edilemeyen_hane: undeliveredCount,
            toplam_dagitilan_torba: totalDeliveredBags
          };
        })
      );

      // If we are in Rota Modu, refresh the inputs for the current stop
      if (isRouteModeOpen && updatedStops[routeModeIndex]) {
        syncRouteModeInputsForStop(updatedStops[routeModeIndex]);
      }
    }

    setRouteStatusBanner({
      type: 'INFO',
      title: '↩ Teslimat Geri Alındı',
      message: `${cancelledTarget?.ad_soyad || 'Hanenin'} teslimatı iptal edildi ve kayıt tekrar "Bekliyor" durumuna alındı.`
    });

    await fetchRoutes();
    if (onRefreshAll) onRefreshAll();
  };

  // Submit Create Route
  const handleCreateRouteSubmit = async (startInRouteMode: boolean = true) => {
    if (selectedBeneficiaryIds.length === 0) {
      showAlert({
        title: 'Hane Seçimi Gerekli',
        message: 'Lütfen rotaya eklenecek en az bir hane seçiniz.',
        type: 'warning'
      });
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
        if (data.route && (data.route.id || data.route._id)) {
          setSelectedRouteId(String(data.route.id || data.route._id));
          if (startInRouteMode) {
            handleOpenRouteMode(data.route, 0);
          }
        }
        if (onRefreshAll) onRefreshAll();
      } else {
        showAlert({
          title: 'Rota Oluşturulamadı',
          message: data.error || 'Rota oluşturulamadı',
          type: 'error'
        });
      }
    } catch (err: any) {
      showAlert({
        title: 'Bağlantı Hatası',
        message: 'Bağlantı hatası: ' + err.message,
        type: 'error'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Move Stop Up or Down in order
  const handleMoveStop = async (currentIndex: number, direction: 'UP' | 'DOWN') => {
    if (isRouteLockedByOther) {
      showAlert({
        title: '🔒 Rota Kullanımda & Kilitli',
        message: `Bu rota şu anda "${routeLockedByName}" tarafından Rota Modunda kullanılmaktadır.\n\nMükerrer teslimatları önlemek için aynı anda yalnızca bir personel bir rotayı kullanabilir.`,
        type: 'lock',
        badge: routeLockedByName || undefined
      });
      return;
    }
    if (!activeRoute || !activeRoute.duraklar) return;
    const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= activeRoute.duraklar.length) return;

    const updatedStops = [...activeRoute.duraklar];
    const temp = updatedStops[currentIndex];
    updatedStops[currentIndex] = updatedStops[targetIndex];
    updatedStops[targetIndex] = temp;

    // Optimistic UI update
    const reindexedStops = updatedStops.map((s, idx) => ({ ...s, sira: idx + 1 }));
    setActiveRoutes((prev) =>
      prev.map((r) => {
        if (String(r.id || r._id) === String(activeRoute.id || activeRoute._id)) {
          return { ...r, duraklar: reindexedStops };
        }
        return r;
      })
    );

    try {
      await fetch('/api/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': currentClientId
        },
        body: JSON.stringify({
          action: 'REORDER_STOPS',
          route_id: activeRoute.id,
          duraklar: updatedStops,
          client_id: currentClientId,
          personel: userName || 'Personel'
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
    if (isRouteLockedByOther) {
      showAlert({
        title: '🔒 Rota Kullanımda & Kilitli',
        message: `Bu rota şu anda "${routeLockedByName}" tarafından Rota Modunda kullanılmaktadır.\n\nMükerrer teslimatları önlemek için aynı anda yalnızca bir personel bir rotayı kullanabilir.`,
        type: 'lock',
        badge: routeLockedByName || undefined
      });
      return;
    }
    const hedef = stop.hedef_torba || 34;
    setShowStopModal({ stopIndex, stop, mode });
    setStopTorbaInput(mode === 'TAMAMLANDI' ? String(hedef) : mode === 'EKSIK' ? '20' : '0');
    setStopRecipientInput(stop.ad_soyad || '');
    setStopDeferLaterInput(mode !== 'TAMAMLANDI');
    setStopNoteInput(
      mode === 'EKSIK'
        ? 'Kamyonda kömür bitti - Daha sonra tamamlanacak'
        : mode === 'TESLIM_EDILEMEDI'
        ? 'Evde kimse yok - Daha sonra tamamlanacak'
        : ''
    );
  };

  // Submit Stop Action
  const handleStopActionSubmit = async () => {
    if (!showStopModal || !activeRoute) return;

    const { stopIndex, stop, mode } = showStopModal;

    if (mode === 'EKSIK') {
      const parsedTorba = parseInt(stopTorbaInput, 10);
      if (isNaN(parsedTorba) || parsedTorba <= 0) {
        showAlert({
          title: 'Torba Sayısı Gerekli',
          message: 'Eksik teslimat için en az 1 torba girilmelidir. Hiç kömür verilemediyse "Verilemedi" seçeneğini kullanınız.',
          type: 'warning'
        });
        return;
      }
    }

    setIsActionLoading(true);

    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': currentClientId
        },
        body: JSON.stringify({
          action: 'UPDATE_STOP',
          route_id: activeRoute.id,
          stop_index: stopIndex,
          durum: mode,
          torba_sayisi: mode === 'TAMAMLANDI' || mode === 'EKSIK' ? parseInt(stopTorbaInput, 10) : 0,
          teslim_alan: stopRecipientInput.trim() || stop.ad_soyad,
          notlar: stopNoteInput.trim(),
          daha_sonra_tamamlanacak: mode !== 'TAMAMLANDI' ? stopDeferLaterInput : false,
          personel: userName || 'Dağıtım Personeli',
          client_id: currentClientId
        })
      });

      const data = await res.json();
      if (data.success) {
        setShowStopModal(null);
        if (data.routeAutoCompleted) {
          setRouteStatusBanner({
            type: 'COMPLETED',
            title: '🎉 Tüm Kayıtlar Tamamlandı — Rota "Tamamlandı" Durumuna Geçti!',
            message: `"${activeRoute.rota_adi}" rotasındaki tüm hanelerin teslimatı tamamlandı ve rota otomatik olarak arşivlendi.`
          });
        } else if (data.routeAutoPaused) {
          setRouteStatusBanner({
            type: 'PAUSED',
            title: '⏸️ Son Kayda Ulaşıldı — Rota Geçici Olarak Durduruldu',
            message: `"${activeRoute.rota_adi}" rotasında daha sonra tamamlanacak eksik kayıtlar bulunduğu için rota geçici olarak durduruldu.`
          });
        }
        await fetchRoutes();
        if (onRefreshAll) onRefreshAll();
      } else {
        showAlert({
          title: 'İşlem Başarısız',
          message: data.error || 'İşlem güncellenemedi',
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
      setIsActionLoading(false);
    }
  };

  // Remove Stop from active route
  const handleRemoveStop = async (index: number, stop: any) => {
    if (isRouteLockedByOther) {
      showAlert({
        title: '🔒 Rota Kullanımda & Kilitli',
        message: `Bu rota şu anda "${routeLockedByName}" tarafından Rota Modunda kullanılmaktadır.\n\nMükerrer teslimatları önlemek için aynı anda yalnızca bir personel bir rotayı kullanabilir.`,
        type: 'lock',
        badge: routeLockedByName || undefined
      });
      return;
    }
    if (!activeRoute) return;
    const confirmMsg = `"${stop.ad_soyad}" (${stop.mahalle || ''}) hanesini bu rotadan çıkarmak istiyor musunuz?\n\nBu hane genel listede teslimat bekliyor olarak kalacaktır. Kalan hanelerin teslimatı bittiğinde rota tamamlanabilir.`;
    const confirmed = await showConfirm({
      title: 'Durağı Rotadan Çıkar',
      message: confirmMsg,
      type: 'warning',
      confirmText: 'Evet, Çıkar',
      cancelText: 'Vazgeç'
    });
    if (!confirmed) return;

    setIsActionLoading(true);
    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': currentClientId
        },
        body: JSON.stringify({
          action: 'REMOVE_STOP',
          route_id: activeRoute.id,
          stop_index: index,
          personel: userName || 'Personel',
          client_id: currentClientId
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast({
          type: 'info',
          title: 'Durak Çıkarıldı',
          message: `"${stop.ad_soyad}" rotadan çıkarıldı.`
        });
        await fetchRoutes();
        if (onRefreshAll) onRefreshAll();
      } else {
        showAlert({
          title: 'İşlem Başarısız',
          message: data.error || 'Durak rotadan çıkarılamadı',
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
      setIsActionLoading(false);
    }
  };

  // Finalize Route
  const handleFinalizeRouteSubmit = async () => {
    if (isRouteLockedByOther) {
      showAlert({
        title: '🔒 Rota Kullanımda & Kilitli',
        message: `Bu rota şu anda "${routeLockedByName}" tarafından Rota Modunda kullanılmaktadır.\n\nMükerrer teslimatları önlemek için aynı anda yalnızca bir personel bir rotayı kullanabilir.`,
        type: 'lock',
        badge: routeLockedByName || undefined
      });
      return;
    }
    if (!activeRoute) return;

    // Kural Kontrolü: Rotayı tamamlayabilmek için rotadaki tüm hanelere kömür teslim edilmiş olmalıdır.
    // Eksik teslimat kabul edilir, ancak hiç kömür verilmeyen hane var ise tamamlanamaz!
    const stops = activeRoute.duraklar || [];
    const noCoalStops = stops.filter((s: any) => {
      const delivered = Number(s.teslim_edilen_torba) || (s.durum === 'TAMAMLANDI' ? (Number(s.hedef_torba) || 34) : 0);
      const hasCoal = (s.durum === 'TAMAMLANDI' || s.durum === 'EKSIK') && delivered > 0;
      return !hasCoal;
    });

    if (noCoalStops.length > 0) {
      showAlert({
        title: 'Eksik Teslimat Uyarısı',
        message: `Rotayı tamamlayabilmek için rotadaki tüm hanelere kömür teslim edilmesi gerekmektedir.\n\nHiç kömür teslim edilmeyen ${noCoalStops.length} hane bulunmaktadır. Eksik kömür verilen hane olsa bile rota tamamlanabilir; ancak hiç kömür verilmeyen hane var ise tamamlanamaz.`,
        type: 'warning'
      });
      return;
    }

    setIsActionLoading(true);

    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': currentClientId
        },
        body: JSON.stringify({
          action: 'FINALIZE_ROUTE',
          route_id: activeRoute.id,
          notlar: finalizeNote.trim(),
          personel: userName || 'Personel',
          client_id: currentClientId
        })
      });

      const data = await res.json();
      if (data.success) {
        setShowFinalizeModal(false);
        const remaining = activeRoutes.filter(r => String(r.id || r._id) !== String(activeRoute.id || activeRoute._id));
        setActiveRoutes(remaining);
        if (remaining.length > 0) {
          setSelectedRouteId(String(remaining[0].id || remaining[0]._id));
        } else {
          setSelectedRouteId(null);
          setActiveTab('ARCHIVE');
        }
        await fetchRoutes();
        if (onRefreshAll) onRefreshAll();
      } else {
        showAlert({
          title: 'Rota Tamamlanamadı',
          message: data.error || 'Rota tamamlanamadı',
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
      setIsActionLoading(false);
    }
  };

  // Delete Route
  const handleDeleteRoute = async () => {
    if (isRouteLockedByOther && userRole !== 'ADMIN') {
      showAlert({
        title: '🔒 Rota Kullanımda & Kilitli',
        message: `Bu rota şu anda "${routeLockedByName}" tarafından Rota Modunda kullanılmaktadır ve silinemez.`,
        type: 'lock',
        badge: routeLockedByName || undefined
      });
      return;
    }
    if (!activeRoute) return;
    setIsActionLoading(true);

    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': currentClientId
        },
        body: JSON.stringify({
          action: 'DELETE_ROUTE',
          route_id: activeRoute.id,
          personel: userName || 'Personel',
          client_id: currentClientId
        })
      });

      const data = await res.json();
      if (data.success) {
        setShowDeleteConfirm(false);
        const remaining = activeRoutes.filter(r => String(r.id || r._id) !== String(activeRoute.id || activeRoute._id));
        setActiveRoutes(remaining);
        if (remaining.length > 0) {
          setSelectedRouteId(String(remaining[0].id || remaining[0]._id));
        } else {
          setSelectedRouteId(null);
        }
        await fetchRoutes();
        if (onRefreshAll) onRefreshAll();
      } else {
        showAlert({
          title: 'Rota Silinemedi',
          message: data.error || 'Rota silinemedi',
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
      setIsActionLoading(false);
    }
  };

  // Delete Archived Route
  const handleDeleteArchivedRoute = async (routeId: string) => {
    const confirmed = await showConfirm({
      title: 'Arşiv Kaydını Sil',
      message: 'Bu arşiv kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      type: 'warning',
      confirmText: 'Evet, Sil',
      cancelText: 'Vazgeç'
    });
    if (!confirmed) return;
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
        showToast({
          type: 'info',
          title: 'Arşiv Silindi',
          message: 'Arşivlenmiş rota başarıyla silindi.'
        });
        await fetchRoutes();
      } else {
        showAlert({
          title: 'Hata',
          message: data.error || 'Arşiv kaydı silinemedi',
          type: 'error'
        });
      }
    } catch (err: any) {
      showAlert({
        title: 'Hata',
        message: 'Hata: ' + (err?.message || 'Bilinmeyen hata'),
        type: 'error'
      });
    }
  };

  // Filter beneficiaries in Create Modal (Yalnızca İmzası Alınmış & Teslim Edilmemiş haneler ve TC/Ad-Soyad %100 Türkçe arama)
  const modalDisplayList = useMemo(() => {
    const list = availableSignedBeneficiaries;
    if (!createSearchQuery.trim()) return list;
    return list.filter((b) => isBirebirBeneficiaryMatch(b, createSearchQuery));
  }, [availableSignedBeneficiaries, createSearchQuery]);

  // Fast map to lookup beneficiaries by ID
  const allBeneficiariesMap = useMemo(() => {
    const map = new Map<string, any>();
    availableSignedBeneficiaries.forEach((b) => map.set(String(b.id), b));
    signedBeneficiaries.forEach((b) => map.set(String(b.id), b));
    return map;
  }, [availableSignedBeneficiaries, signedBeneficiaries]);

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
            onClick={() => fetchRoutes()}
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
            <span>Aktif Rotalar ({activeRoutes.length})</span>
            {activeRoutes.length > 0 && (
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

      {/* Otomatik Rota Tamamlanma / Geçici Durdurulma Bildirim Banner'ı */}
      {routeStatusBanner && (
        <div
          className={`p-4 rounded-2xl border shadow-sm flex items-start justify-between gap-3 ${
            routeStatusBanner.type === 'COMPLETED'
              ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
              : 'bg-amber-50 border-amber-400 text-amber-950'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black ${
                routeStatusBanner.type === 'COMPLETED'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-600 text-white'
              }`}
            >
              {routeStatusBanner.type === 'COMPLETED' ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Pause className="w-5 h-5" />
              )}
            </div>
            <div>
              <h4 className="text-sm font-black">{routeStatusBanner.title}</h4>
              <p className="text-xs font-medium mt-0.5 leading-relaxed opacity-90">
                {routeStatusBanner.message}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {routeStatusBanner.type === 'COMPLETED' && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('ARCHIVE');
                      setRouteStatusBanner(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center gap-1.5 shadow-2xs"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Tamamlanan Rota Arşivini Gör</span>
                  </button>
                )}
                {routeStatusBanner.type === 'PAUSED' && activeRoute && (
                  <button
                    type="button"
                    onClick={() => handleOpenRouteMode(activeRoute)}
                    className="px-3 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-black flex items-center gap-1.5 shadow-2xs"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Rota Moduna Tekrar Gir (Eksikleri Tamamla)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRouteStatusBanner(null)}
            className="p-1.5 rounded-lg hover:bg-black/5 text-slate-500 font-bold text-xs shrink-0"
            title="Bildirimi Kapat"
          >
            ✕
          </button>
        </div>
      )}

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
                  Kamyon teslimatı için yalnızca kapıda imzası alınmış ve kömürü henüz teslim edilmemiş hanelerden sıralı dağıtım rotası oluşturulabilir.
                </p>
              </div>

              {/* İmzası Alınanlar Bildirim Çubuğu */}
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-medium flex items-center justify-between max-w-md mx-auto text-left">
                <div className="flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Bugün Kapıda İmzası Alınan: <strong>{availableSignedBeneficiaries.length} Hane Hazır</strong>
                  </span>
                </div>
                {availableSignedBeneficiaries.length === 0 && onNavigateToSearch && (
                  <button
                    type="button"
                    onClick={onNavigateToSearch}
                    className="text-amber-800 font-bold underline hover:text-amber-950 text-[11px] shrink-0"
                  >
                    İmza Topla
                  </button>
                )}
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={handleOpenCreateModal}
                  disabled={availableSignedBeneficiaries.length === 0}
                  className={`w-full max-w-md mx-auto py-3 px-4 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all ${
                    availableSignedBeneficiaries.length > 0
                      ? 'btn-primary shadow-sm cursor-pointer'
                      : 'bg-slate-200 text-slate-500 border border-slate-300 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-5 h-5" />
                  <span>
                    {availableSignedBeneficiaries.length > 0
                      ? `Yeni Dağıtım Rotası Başlat (${availableSignedBeneficiaries.length} İmzalı Hane)`
                      : 'Yeni Dağıtım Rotası Başlatılamaz (0 İmzalı Hane)'}
                  </span>
                </button>

                {availableSignedBeneficiaries.length === 0 && (
                  <p className="text-[11px] font-semibold text-rose-700 max-w-md mx-auto">
                    İmzası alınmış ve kömürü teslim edilmemiş hane bulunmadığı için yeni dağıtım rotası başlatılamaz.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ÇOKLU EKİP ROTA SEÇİCİ & YENİ ROTA EKLEME ÇUBUĞU */}
          {activeRoutes.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3 space-y-2.5 no-print">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-emerald-600" />
                    Sahadaki Dağıtım Ekipleri ({activeRoutes.length} Aktif Rota)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleOpenCreateModal}
                  disabled={availableSignedBeneficiaries.length === 0}
                  title={
                    availableSignedBeneficiaries.length === 0
                      ? 'İmzası alınmış ve kömürü teslim edilmemiş yeni hane bulunmadığı için yeni rota başlatılamaz'
                      : 'Yeni dağıtım rotası başlat'
                  }
                  className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
                    availableSignedBeneficiaries.length > 0
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-xs active:scale-95 cursor-pointer'
                      : 'bg-slate-200 text-slate-500 border border-slate-300 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {availableSignedBeneficiaries.length > 0
                      ? `+ Yeni Ekip / Rota Başlat (${availableSignedBeneficiaries.length} Hazır)`
                      : 'Yeni Rota Başlatılamaz (0 İmzalı Hane)'}
                  </span>
                </button>
              </div>

              {/* Rota Butonları Listesi */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
                {activeRoutes.map((r, idx) => {
                  const isSelected = String(r.id || r._id) === String(activeRoute?.id || activeRoute?._id);
                  const isPaused = r.durum === 'DURAKLATILDI';
                  const isLockExpired = Number(r.kilit_timestamp) > 0 && Date.now() - Number(r.kilit_timestamp) > 45 * 60 * 1000;
                  const isLocked = Boolean(r.kilitli_personel && !isLockExpired);
                  const total = r.toplam_hane || 0;
                  const completedCount = r.tamamlanan_hane || 0;
                  const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

                  return (
                    <button
                      key={r.id || r._id || idx}
                      type="button"
                      onClick={() => setSelectedRouteId(String(r.id || r._id))}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left border transition-all shrink-0 active:scale-95 ${
                        isSelected
                          ? 'bg-sky-50 border-sky-400 text-sky-950 shadow-xs font-bold ring-2 ring-sky-400/20'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isLocked
                            ? 'bg-amber-500'
                            : isPaused
                            ? 'bg-amber-500'
                            : isSelected
                            ? 'bg-emerald-500 animate-pulse'
                            : 'bg-slate-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black truncate max-w-[170px] sm:max-w-[220px]">
                            {r.rota_adi}
                          </span>
                          {isLocked && (
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300 font-black shrink-0 flex items-center gap-0.5"
                              title={`Kullanımda & Kilitli: ${r.kilitli_personel}`}
                            >
                              <Lock className="w-2.5 h-2.5" />
                              <span className="truncate max-w-[80px]">{r.kilitli_personel}</span>
                            </span>
                          )}
                          {isPaused && !isLocked && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-black shrink-0">
                              ⏸️ DURAKLATILDI
                            </span>
                          )}
                          {r.arac_plaka && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-800 font-mono font-bold shrink-0">
                              {r.arac_plaka}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium mt-0.5">
                          <span>{r.dagitim_personeli || 'Personel'}</span>
                          <span>•</span>
                          <span className="font-bold text-slate-700">
                            {completedCount}/{total} Tamam (%{percent})
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* DURUM 2: DEVAM EDEN AKTİF BİR ROTA VAR İSE */}
          {activeRoute && (
            <>
              {/* Resmi Baskı Başlığı (Sadece Yazdırırken Çıkar) */}
              <div className="p-4 rounded-2xl bg-white border border-slate-300 shadow-sm print-only-header">
                <div className="flex items-center justify-between pb-3 border-b-2 border-slate-900">
                  <div className="w-16 h-16 shrink-0 flex items-center justify-center p-1 bg-white rounded-full border border-slate-200" style={{ width: '56px', height: '56px', minWidth: '56px', minHeight: '56px' }}>
                    <img
                      src="/edirne-sydv-logo.png"
                      alt="Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı"
                      width={50}
                      height={50}
                      className="print-logo-img"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
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

              {/* MASAÜSTÜ İKİ KOLONLU KOMUTA DÜZENİ / MOBİL DİKEY SIRALAMA */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Sol Panel: Rota Özeti & İlerleme Kartı (Masaüstünde Yapışkan Panel) */}
                <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-28 space-y-3">
                  {/* ROTA ÖZETİ VE İLERLEME KARTI */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {activeRoute.durum === 'DURAKLATILDI' ? (
                            <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                              <Pause className="w-3 h-3 text-amber-700" />
                              Geçici Durduruldu (Eksikler Bekliyor)
                            </span>
                          ) : (
                            <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                              Dağıtım Sürüyor
                            </span>
                          )}
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

                    {/* ======================================================== */}
                    {/* ROTA KİLİTLİ UYARI BANNERI                                */}
                    {/* ======================================================== */}
                    {isRouteLockedByOther && (
                      <div className="p-3.5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                            <Lock className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 bg-amber-200/90 px-1.5 py-0.5 rounded">
                                🔒 Rota Kullanımda & Kilitli
                              </span>
                              <span className="text-xs font-black text-amber-950">
                                {routeLockedByName}
                              </span>
                            </div>
                            <p className="text-[11px] text-amber-800 mt-0.5">
                              Bu rota şu anda <strong>{routeLockedByName}</strong> tarafından Rota Modunda aktif olarak yürütülmektedir. Aynı anda yalnızca bir personel bir rotayı kullanabilir.
                            </p>
                            {typeof activeRoute.aktif_durak_index === 'number' && activeRoute.duraklar?.[activeRoute.aktif_durak_index] && (
                              <div className="flex items-center gap-2 mt-1.5 text-xs text-amber-950 bg-amber-200/60 px-2 py-1 rounded-lg border border-amber-300/80">
                                <span className="flex h-2 w-2 relative">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600"></span>
                                </span>
                                <span className="font-extrabold text-[11px]">Canlı İşlenen Durak:</span>
                                <span className="text-[11px] font-bold">
                                  #{activeRoute.aktif_durak_index + 1} - {activeRoute.duraklar[activeRoute.aktif_durak_index].ad_soyad}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        {userRole === 'ADMIN' && (
                          <button
                            type="button"
                            onClick={() => handleForceUnlockRoute(String(activeRoute.id || activeRoute._id))}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-black flex items-center gap-1 shrink-0 shadow-xs active:scale-95 transition-all"
                            title="Admin yetkisiyle kilidi kaldır"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Admin: Kilidi Kaldır</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* ======================================================== */}
                    {/* UBER/LYFT TARZI ROTA MODUNA GİRİŞ HERO BUTONU            */}
                    {/* ======================================================== */}
                    {(() => {
                      const stops = activeRoute.duraklar || [];
                      const waitingCount = stops.filter((s: any) => !s.durum || s.durum === 'BEKLIYOR').length;
                      const deferredCount = stops.filter(
                        (s: any) => s.durum === 'EKSIK' || s.durum === 'TESLIM_EDILEMEDI'
                      ).length;
                      const isPaused = activeRoute.durum === 'DURAKLATILDI';
                      const nextStop =
                        stops.find((s: any) => !s.durum || s.durum === 'BEKLIYOR') ||
                        stops.find((s: any) => s.durum !== 'TAMAMLANDI') ||
                        stops[0];

                      if (isRouteLockedByOther) {
                        const liveIndex = typeof activeRoute.aktif_durak_index === 'number' ? activeRoute.aktif_durak_index : 0;
                        const liveStop = activeRoute.duraklar?.[liveIndex];
                        return (
                          <div className="pt-1">
                            <div
                              className="w-full p-3.5 rounded-2xl text-left flex items-center justify-between gap-3 bg-slate-100 border-2 border-amber-400/60 text-slate-700 opacity-95 cursor-not-allowed select-none"
                              title={`Bu rota şu anda "${routeLockedByName}" personeli tarafından Rota Modunda kullanılmaktadır.`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-amber-500 text-white shadow-xs">
                                  <Lock className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-sm font-black tracking-wide text-slate-800 uppercase">
                                      Rota Kilitli & Canlı İşlemde
                                    </span>
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-200 text-amber-950">
                                      {routeLockedByName}
                                    </span>
                                  </div>
                                  <p className="text-[11px] font-medium text-slate-600 truncate mt-0.5">
                                    {liveStop ? (
                                      <>🚚 Canlı Durak: <strong>#{liveIndex + 1} {liveStop.ad_soyad}</strong></>
                                    ) : (
                                      <>Bu rota {routeLockedByName} personeli tarafından yürütülüyor.</>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="px-2.5 py-1.5 rounded-xl text-xs font-black shrink-0 flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300">
                                <Lock className="w-3.5 h-3.5" />
                                <span>Kilitli</span>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleOpenRouteMode(activeRoute)}
                            className={`w-full p-3.5 rounded-2xl text-left flex items-center justify-between gap-3 ${
                              isPaused ? 'route-mode-paused-btn' : 'route-mode-hero-btn'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                                style={{
                                  background: 'rgba(255, 255, 255, 0.16)',
                                  border: '1px solid rgba(255, 255, 255, 0.28)'
                                }}
                              >
                                <Play className="w-5 h-5 text-white fill-white" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-black tracking-wide text-white uppercase">
                                    {isPaused
                                      ? 'Rota Moduna Devam Et'
                                      : 'Rota Moduna Gir (Saha Modu)'}
                                  </span>
                                  <span
                                    className="text-[10px] font-black px-2 py-0.5 rounded-full"
                                    style={{
                                      background: 'rgba(255,255,255,0.2)',
                                      color: '#ffffff'
                                    }}
                                  >
                                    {waitingCount > 0
                                      ? `${waitingCount} Sıradaki`
                                      : `${deferredCount} Eksik Kayıt`}
                                  </span>
                                </div>
                                <p
                                    className="text-[11px] font-semibold truncate mt-0.5"
                                  style={{ color: 'rgba(255, 255, 255, 0.88)' }}
                                >
                                  {nextStop
                                    ? `Sıradaki: #${nextStop.sira} ${nextStop.ad_soyad} (${nextStop.sokak || nextStop.mahalle || ''})`
                                    : 'Sıralı adres ekranını başlat'}
                                </p>
                              </div>
                            </div>
                            <div
                              className="px-2.5 py-1.5 rounded-xl text-xs font-black shrink-0 flex items-center gap-1"
                              style={{
                                background: '#ffffff',
                                color: isPaused ? '#92400e' : '#0369a1'
                              }}
                            >
                              <span>Başlat</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </div>
                          </button>
                        </div>
                      );
                    })()}

                    {/* İlerleme Çubuğu */}
                    {(() => {
                      const total = activeRoute.toplam_hane || 1;
                      const completed = activeRoute.tamamlanan_hane || 0;
                      const eksik = activeRoute.eksik_hane || 0;
                      const undelivered = activeRoute.teslim_edilemeyen_hane || 0;
                      const handled = completed + eksik + undelivered;
                      const percent = Math.min(100, Math.round((completed / total) * 100));

                      return (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-slate-700">
                              Tamamlanan: <strong className="text-slate-900">{completed} / {total} Hane</strong>
                              {handled > completed && (
                                <span className="text-amber-700 ml-1">
                                  ({handled - completed} Daha Sonra)
                                </span>
                              )}
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
                        <span className="text-[10px] font-bold text-rose-900 uppercase">Sonra/Yok</span>
                      </div>

                      <div className="p-2 rounded-xl bg-sky-50 border border-sky-200">
                        <span className="text-base font-black text-sky-800 block leading-tight">
                          {activeRoute.toplam_dagitilan_torba || 0}
                        </span>
                        <span className="text-[10px] font-bold text-sky-900 uppercase">Torba</span>
                      </div>
                    </div>

                    {/* Rotayı Tamamla & Listeyi İndir Butonları */}
                    {(() => {
                      const stops = activeRoute.duraklar || [];
                      const noCoalStops = stops.filter((s: any) => {
                        const delivered = Number(s.teslim_edilen_torba) || (s.durum === 'TAMAMLANDI' ? (Number(s.hedef_torba) || 34) : 0);
                        const hasCoal = (s.durum === 'TAMAMLANDI' || s.durum === 'EKSIK') && delivered > 0;
                        return !hasCoal;
                      });
                      const canFinalize = stops.length > 0 && noCoalStops.length === 0;

                      return (
                        <div className="pt-2 flex flex-col gap-2">
                          {/* Tamamlanabilirlik Durum Göstergesi */}
                          {canFinalize ? (
                            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-[11px] font-semibold flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>Tüm hanelere kömür verildi. Rota tamamlanmaya hazır.</span>
                            </div>
                          ) : (
                            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 text-[11px] font-semibold flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold text-rose-900 block">
                                  Hiç kömür verilmeyen {noCoalStops.length} hane var!
                                </span>
                                <span className="text-[10px] text-rose-800 font-normal leading-tight block mt-0.5">
                                  Tüm kayıtlar tamamlandığında rota otomatik kapanır. Eksik kayıt varsa &quot;Rota Modu&quot; ile sırayla tamamlayabilirsiniz.
                                </span>
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => setShowFinalizeModal(true)}
                            className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] ${
                              canFinalize
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
                                : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300'
                            }`}
                            title={canFinalize ? 'Rotayı Tamamla ve Arşivle' : `${noCoalStops.length} hane henüz kömür almadı`}
                          >
                            {canFinalize ? (
                              <>
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Rotayı Tamamla ve Arşivle</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-4 h-4 text-rose-600" />
                                <span>Rotayı Tamamla ({noCoalStops.length} Haneye Kömür Verilmedi)</span>
                              </>
                            )}
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
                              onClick={() => setPrintRoute(activeRoute)}
                              className="py-2 px-3 rounded-xl bg-white hover:bg-amber-50 hover:border-amber-300 hover:text-amber-900 border border-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                              title="Resmi Dağıtım Tutanağını Önizle ve Yazdır"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Yazdır</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Sağ Panel: SIRALI DURAKLAR LİSTESİ */}
                <div className="lg:col-span-7 xl:col-span-8 space-y-2.5">
                  <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-sky-600" />
                      <span>Sıralı Durak Listesi ({activeRoute.duraklar?.length || 0} Hane)</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => handleOpenRouteMode(activeRoute)}
                      disabled={isRouteLockedByOther}
                      className={`text-xs font-black px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all ${
                        isRouteLockedByOther
                          ? 'text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed opacity-60'
                          : 'text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200'
                      }`}
                      title={isRouteLockedByOther ? `Bu rota şu anda ${routeLockedByName} tarafından kullanılmaktadır` : 'Sıralı Rota Modunu Aç'}
                    >
                      {isRouteLockedByOther ? (
                        <>
                          <Lock className="w-3 h-3 text-slate-400" />
                          <span>Kilitli ({routeLockedByName})</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 fill-sky-700" />
                          <span>Sıralı Rota Modunu Aç</span>
                        </>
                      )}
                    </button>
                  </div>

                  {activeRoute.duraklar?.map((stop: any, index: number) => {
                    const isTamam = stop.durum === 'TAMAMLANDI';
                    const isEksik = stop.durum === 'EKSIK';
                    const isUndelivered = stop.durum === 'TESLIM_EDILEMEDI';
                    const isPending = !stop.durum || stop.durum === 'BEKLIYOR';
                    const isCurrentlyActiveInRouteMode =
                      isRouteLockedByOther &&
                      (activeRoute.aktif_durak_index ?? 0) === index &&
                      !isTamam;

                    return (
                      <div
                        key={stop.beneficiary_id || index}
                        className={`p-3.5 rounded-2xl border transition-all shadow-xs ${
                          isCurrentlyActiveInRouteMode
                            ? 'bg-amber-50/90 border-2 border-amber-500 shadow-md ring-2 ring-amber-300/50'
                            : isTamam
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
                                  : isCurrentlyActiveInRouteMode
                                  ? 'bg-amber-600 text-white border-amber-700'
                                  : 'bg-slate-900 text-white border-slate-900'
                              }`}
                            >
                              #{stop.sira || index + 1}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="text-sm font-extrabold text-slate-900 truncate">
                                  {stop.ad_soyad}
                                </h4>
                                {isCurrentlyActiveInRouteMode && (
                                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-white flex items-center gap-1 shadow-xs animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                                    <span>🚚 Şu Anda İşleniyor ({routeLockedByName})</span>
                                  </span>
                                )}
                                {!isTamam && stop.daha_sonra_tamamlanacak && !isCurrentlyActiveInRouteMode && (
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                    ⏳ Daha Sonra Tamamlanacak
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                                <span className="font-mono text-amber-800 font-bold">
                                  TC: {stop.tc_no}
                                </span>
                                <span>•</span>
                                <span className="text-slate-700 font-medium">{stop.mahalle}</span>
                              </div>
                            </div>
                          </div>

                          {/* Sıralama Taşıma Butonları (Reorder), Rota Modunda Aç ve Çıkar Butonu */}
                          <div className="flex items-center gap-0.5 shrink-0 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                            <button
                              type="button"
                              onClick={() => handleOpenRouteMode(activeRoute, index)}
                              disabled={isRouteLockedByOther}
                              className={`px-1.5 py-1 rounded text-[10px] font-black flex items-center gap-0.5 ${
                                isRouteLockedByOther
                                  ? 'text-slate-400 opacity-40 cursor-not-allowed'
                                  : 'text-sky-800 hover:bg-sky-100'
                              }`}
                              title={isRouteLockedByOther ? `Bu rota ${routeLockedByName} tarafından kilitli` : 'Rota Modunu Bu Duraktan Başlat'}
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span className="hidden sm:inline">Odakla</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveStop(index, 'UP')}
                              disabled={isRouteLockedByOther || index === 0}
                              className="p-1 rounded text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-600"
                              title="Yukarı Taşı"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveStop(index, 'DOWN')}
                              disabled={isRouteLockedByOther || index === (activeRoute.duraklar?.length || 0) - 1}
                              className="p-1 rounded text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-600"
                              title="Aşağı Taşı"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveStop(index, stop)}
                              disabled={isRouteLockedByOther}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ml-0.5 border-l border-slate-200 pl-1 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Bu haneyi rotadan çıkar (Beklemeye döner)"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Adres ve Sokak Bilgisi */}
                        <div className="mt-2 text-xs flex flex-wrap items-center gap-1.5">
                          {stop.sokak && (
                            <span className="inline-flex items-center gap-1 font-bold text-sky-900 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                              <Navigation className="w-3 h-3 text-sky-600 shrink-0" />
                              <span>{stop.sokak}</span>
                              {stop.kapi_no && stop.kapi_no !== 999999 && stop.kapi_no !== '999999' && <strong>No: {stop.kapi_no}</strong>}
                              {stop.daire_no ? <span>D: {stop.daire_no}</span> : null}
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
                              <div className="flex items-center gap-1.5 ml-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isRouteLockedByOther) {
                                      showAlert({
                                        title: '🔒 Rota Kullanımda & Kilitli',
                                        message: `Bu rota şu anda "${routeLockedByName}" tarafından Rota Modunda kullanılmaktadır.\n\nMükerrer teslimatları önlemek için aynı anda yalnızca bir personel bir rotayı kullanabilir.`,
                                        type: 'lock',
                                        badge: routeLockedByName || undefined
                                      });
                                      return;
                                    }
                                    setCancelStopTarget(stop);
                                  }}
                                  className="text-[11px] text-rose-700 hover:text-rose-900 font-bold px-2 py-1 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 flex items-center gap-1 transition-all active:scale-95"
                                  title="Teslimatı Geri Al / İptal Et"
                                >
                                  <Undo2 className="w-3 h-3" />
                                  <span>Geri Al</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenStopModal(index, stop, 'TAMAMLANDI')}
                                  className="text-[11px] underline text-emerald-800 hover:text-emerald-950 font-bold px-1"
                                >
                                  Düzenle
                                </button>
                              </div>
                            </div>
                          )}

                          {isEksik && (
                            <div className="flex items-center justify-between p-2 rounded-xl bg-amber-100/70 border border-amber-300 text-amber-950 text-xs font-bold gap-2">
                              <div className="min-w-0">
                                <span className="flex items-center gap-1.5">
                                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                                  <span>
                                    ⚠️ Eksik Teslimat: {stop.teslim_edilen_torba} / {stop.hedef_torba} Torba (Kalan: {Math.max(0, (stop.hedef_torba || 34) - (stop.teslim_edilen_torba || 0))} T)
                                  </span>
                                </span>
                                {stop.teslimat_notu && (
                                  <p className="text-[11px] font-normal text-amber-900 mt-0.5 truncate pl-5.5">
                                    Not: {stop.teslimat_notu}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleOpenStopModal(index, stop, 'TAMAMLANDI')}
                                  className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black"
                                >
                                  Tamamla
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenStopModal(index, stop, 'EKSIK')}
                                  className="text-[11px] underline text-amber-900 hover:text-amber-950 font-bold"
                                >
                                  Düzenle
                                </button>
                              </div>
                            </div>
                          )}

                          {isUndelivered && (
                            <div className="flex items-center justify-between p-2 rounded-xl bg-rose-100/70 border border-rose-300 text-rose-950 text-xs font-bold gap-2">
                              <div className="min-w-0">
                                <span className="flex items-center gap-1.5">
                                  <XCircle className="w-4 h-4 text-rose-700 shrink-0" />
                                  <span>
                                    {stop.daha_sonra_tamamlanacak
                                      ? '⏳ Daha Sonra Tamamlanacak (0 Torba)'
                                      : '✕ Teslim Edilemedi'}
                                  </span>
                                </span>
                                {stop.teslimat_notu && (
                                  <p className="text-[11px] font-normal text-rose-900 mt-0.5 truncate pl-5.5">
                                    Neden: {stop.teslimat_notu}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleOpenStopModal(index, stop, 'TAMAMLANDI')}
                                  className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black"
                                >
                                  Şimdi Teslim Et
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenStopModal(index, stop, 'TESLIM_EDILEMEDI')}
                                  className="text-[11px] underline text-rose-900 hover:text-rose-950 font-bold"
                                >
                                  Düzenle
                                </button>
                              </div>
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
                                <span className="truncate">Eksik / Sonra</span>
                              </button>

                              {/* 3. Teslim Edilemedi Butonu */}
                              <button
                                type="button"
                                onClick={() => handleOpenStopModal(index, stop, 'TESLIM_EDILEMEDI')}
                                className="col-span-1 py-2 px-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span className="truncate">Daha Sonra</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                        onClick={() => setPrintRoute(route)}
                        className="py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95"
                        title="Resmi Dağıtım Tutanağını Önizle ve Yazdır"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Tutanağı Yazdır</span>
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
                {/* Hane Kaynak Bilgisi: Yalnızca İmzası Alınmış ve Teslim Edilmemiş Haneler */}
                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-900">
                    <PenTool className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>İmzası Alınan &amp; Teslimat Bekleyen Haneler ({availableSignedBeneficiaries.length})</span>
                  </div>
                </div>

                {/* Arama & Toplu Seçim */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={createSearchQuery}
                      onChange={(e) => setCreateSearchQuery(e.target.value)}
                      placeholder="TC Kimlik No veya Adı Soyadı ara..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectAllInView(modalDisplayList)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 shrink-0"
                  >
                    {modalDisplayList.length > 0 && modalDisplayList.every((b) => selectedBeneficiaryIds.includes(String(b.id))) ? (
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
                              {person.mahalle} • {st.sokak || person.acik_adres} {st.kapiNo && st.kapiNo !== 999999 && st.kapiNo !== '999999' ? `No: ${st.kapiNo}` : ''}{st.daireNo > 0 ? ` D: ${st.daireNo}` : ''}
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
                      İmzası alınmış ve kömürü teslim edilmemiş eşleşen hane bulunamadı.
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
                              {st.kapiNo && st.kapiNo !== 999999 && st.kapiNo !== '999999' ? <span> No:{st.kapiNo}</span> : null}
                              {st.daireNo && st.daireNo > 0 ? <span> D:{st.daireNo}</span> : null}
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
                <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateModalStep('SELECT')}
                    className="btn-secondary text-xs py-2.5 px-3 font-bold"
                  >
                    ← Hane Seçimi
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreateRouteSubmit(false)}
                    disabled={isActionLoading || selectedBeneficiaryIds.length === 0}
                    className="btn-secondary flex-1 text-xs py-2.5 font-bold flex items-center justify-center gap-1.5"
                  >
                    <span>Sadece Rotayı Kaydet</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreateRouteSubmit(true)}
                    disabled={isActionLoading || selectedBeneficiaryIds.length === 0}
                    className="btn-primary flex-1 text-xs py-2.5 font-black flex items-center justify-center gap-1.5"
                  >
                    {isActionLoading ? (
                      <span>Oluşturuluyor...</span>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-white" />
                        <span>Rotayı Başlat & Rota Moduna Gir ({selectedBeneficiaryIds.length})</span>
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
                      : 'Teslim Edilemedi / Daha Sonra'}
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
                  {showStopModal.mode === 'TESLIM_EDILEMEDI' ? 'Teslim Edilememe / Erteleme Nedeni' : 'Açıklama / Not'}
                </label>
                <input
                  type="text"
                  value={stopNoteInput}
                  onChange={(e) => setStopNoteInput(e.target.value)}
                  placeholder={
                    showStopModal.mode === 'TESLIM_EDILEMEDI'
                      ? 'Örn: Evde yok - Daha sonra tamamlanacak...'
                      : 'Opsiyonel not ekleyin'
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Daha Sonra Tamamlanacak Seçeneği (Eksik veya Verilemedi ise) */}
              {showStopModal.mode !== 'TAMAMLANDI' && (
                <button
                  type="button"
                  onClick={() => setStopDeferLaterInput((v) => !v)}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all ${
                    stopDeferLaterInput
                      ? 'bg-amber-50 border-amber-400 text-amber-950'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {stopDeferLaterInput ? (
                      <CheckSquare className="w-4 h-4 text-amber-700 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <div>
                      <span className="text-xs font-black block">
                        ⏳ Daha Sonra Tamamlanacak Olarak İşaretle
                      </span>
                      <span className="text-[10px] font-medium opacity-80 block">
                        Sonraki kayda geçilir; son kayıt ise rota geçici olarak durdurulur.
                      </span>
                    </div>
                  </div>
                </button>
              )}

              {/* Hızlı Seçim Butonları (Teslim Edilemediğinde) */}
              {showStopModal.mode === 'TESLIM_EDILEMEDI' && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    'Evde yok - Daha sonra tamamlanacak',
                    'Kamyonda kömür bitti - Sonra verilecek',
                    'Sokak kapalı - Daha sonra girilecek',
                    'Adreste bulunamadı'
                  ].map((quick) => (
                    <button
                      key={quick}
                      type="button"
                      onClick={() => setStopNoteInput(quick)}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                    >
                      {quick}
                    </button>
                  ))}
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
                  <h3 className="text-base font-extrabold text-slate-900">Rotayı Tamamla</h3>
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

            {/* Rota Özeti */}
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

            {/* Rota Tamamlanma Durumu & Kural Kontrolü */}
            {(() => {
              const stops = activeRoute.duraklar || [];
              const noCoal = stops.filter((s: any) => {
                const delivered = Number(s.teslim_edilen_torba) || (s.durum === 'TAMAMLANDI' ? (Number(s.hedef_torba) || 34) : 0);
                const hasCoal = (s.durum === 'TAMAMLANDI' || s.durum === 'EKSIK') && delivered > 0;
                return !hasCoal;
              });

              if (noCoal.length > 0) {
                return (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 space-y-2 mb-3">
                    <div className="flex items-start gap-2">
                      <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-xs font-black text-rose-900 block">
                          ⛔ Rota Tamamlanamaz: Hiç Kömür Verilmeyen {noCoal.length} Hane Var!
                        </strong>
                        <p className="text-[11px] font-medium text-rose-800 mt-1 leading-relaxed">
                          Rotayı tamamlayabilmek için rotadaki tüm hanelere kömür teslim edilmesi gerekmektedir. İstisna olarak eksik kömür verilen olsa bile tamamlama yapılabilir; <strong>ancak hiç kömür verilmeyen hane var ise tamamlanamaz.</strong>
                        </p>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-rose-200">
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 block mb-1">
                        Kömür Teslim Edilmeyen Haneler ({noCoal.length}):
                      </span>
                      <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                        {noCoal.map((s: any) => (
                          <div
                            key={s.beneficiary_id || s.sira}
                            className="flex items-center justify-between text-[11px] bg-white/90 px-2 py-1 rounded-lg border border-rose-200"
                          >
                            <span className="font-bold text-slate-800 truncate mr-2">
                              #{s.sira} {s.ad_soyad} {s.mahalle ? `(${s.mahalle})` : ''}
                            </span>
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                              s.durum === 'TESLIM_EDILEMEDI'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {s.durum === 'TESLIM_EDILEMEDI' ? 'Verilemedi (0 Torba)' : 'Bekliyor'}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium mt-1">
                        İpucu: Hanelere kömür teslim edebilir veya ulaşılamayan haneleri rotadan çıkararak kalan hanelerle rotayı kapatabilirsiniz.
                      </p>
                    </div>
                  </div>
                );
              }

              return (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <strong className="block text-emerald-950">✓ Tüm Hanelere Kömür Teslim Edildi</strong>
                    <p className="text-[11px] font-normal text-emerald-800 mt-0.5">
                      Rotadaki tüm hanelere kömür verildi ({activeRoute.tamamlanan_hane || 0} tam, {activeRoute.eksik_hane || 0} eksik teslimat). Rota arşive kaldırılmaya uygundur.
                    </p>
                  </div>
                </div>
              );
            })()}

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Kapanış / Vardiya Notu</label>
              <textarea
                value={finalizeNote}
                onChange={(e) => setFinalizeNote(e.target.value)}
                placeholder="Örn: Rota dağıtımı tamamlandı. Araçta 15 torba kömür kaldı."
                rows={2}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Modal Butonları */}
            {(() => {
              const stops = activeRoute.duraklar || [];
              const noCoal = stops.filter((s: any) => {
                const delivered = Number(s.teslim_edilen_torba) || (s.durum === 'TAMAMLANDI' ? (Number(s.hedef_torba) || 34) : 0);
                const hasCoal = (s.durum === 'TAMAMLANDI' || s.durum === 'EKSIK') && delivered > 0;
                return !hasCoal;
              });
              const canFinalize = stops.length > 0 && noCoal.length === 0;

              return (
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
                    disabled={isActionLoading || !canFinalize}
                    className={`flex-1 text-xs py-2.5 font-black rounded-xl shadow-xs transition-all ${
                      canFinalize
                        ? 'text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95'
                        : 'text-slate-400 bg-slate-200 cursor-not-allowed border border-slate-300'
                    }`}
                    title={!canFinalize ? 'Hiç kömür verilmeyen hane varken rota tamamlanamaz' : undefined}
                  >
                    {isActionLoading
                      ? 'Tamamlanıyor...'
                      : canFinalize
                      ? 'Onayla ve Arşivle'
                      : 'Hiç Kömür Verilmeyen Hane Var (Kapatılamaz)'}
                  </button>
                </div>
              );
            })()}
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

      {/* Teslimatı Geri Al / İptal Et Modal (Rota & Rota Modu) */}
      {cancelStopTarget && (
        <CancelModal
          beneficiary={cancelStopTarget}
          currentStaff={userName}
          onClose={() => setCancelStopTarget(null)}
          onSuccess={handleCancelStopSuccess}
        />
      )}

      {/* ======================================================== */}
      {/* RESMİ DAĞITIM ROTASI VE SAHA TESLİMAT TUTANAĞI MODALI    */}
      {/* ======================================================== */}
      {printRoute && typeof document !== 'undefined' && createPortal(
        <div 
          className="report-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPrintRoute(null);
            }
          }}
        >
          {/* Modal Panel: Sabit %92 ekran yüksekliği ve flex düzeni ile tüm içerik scroll edilir */}
          <div className="report-modal-card relative bg-white rounded-2xl sm:rounded-3xl w-full max-w-5xl h-[92vh] max-h-[92vh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden z-10">
            
            {/* Modal Header: Daima üstte sabit kalır */}
            <div className="report-modal-header shrink-0 h-14 sm:h-16 px-4 sm:px-6 border-b border-slate-200 flex items-center justify-between bg-slate-100 z-20 no-print">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <RouteIcon className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <h3 className="text-xs sm:text-sm md:text-base font-black text-slate-900 truncate">
                    {printRoute.rota_adi || 'Günlük Kömür Dağıtım Rotası Tutanağı'}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-semibold flex items-center gap-1.5 flex-wrap">
                    <span>Tarih: <strong className="text-slate-800">{printRoute.tarih}</strong></span>
                    <span>•</span>
                    <span>Personel: <strong className="text-slate-800">{printRoute.dagitim_personeli || userName || 'Saha Personeli'}</strong></span>
                    {(printRoute.arac_plaka || printRoute.arac_plakasi) && (
                      <>
                        <span>•</span>
                        <span>Plaka: <strong className="text-slate-800">{printRoute.arac_plaka || printRoute.arac_plakasi}</strong></span>
                      </>
                    )}
                    <span>•</span>
                    <span>Toplam: <strong className="text-emerald-700">{printRoute.toplam_hane || printRoute.duraklar?.length || 0} Hane</strong></span>
                    <span>•</span>
                    <span><strong className="text-amber-800">{((printRoute.toplam_dagitilan_torba || printRoute.duraklar?.reduce((acc: number, d: any) => acc + (d.teslim_edilen_torba || 0), 0) || 0) * 0.025).toFixed(2)} Ton</strong></span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={() => setPrintRoute(null)}
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
              id="printableRouteReport"
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
                        GÜNLÜK KÖMÜR DAĞITIM ROTASI VE SAHA TESLİMAT TUTANAĞI
                      </span>
                    </div>
                  </div>
                  <div className="w-12 sm:w-14 shrink-0 hidden sm:block text-right">
                    <span className="text-[9px] font-mono text-slate-400 block">KOD: SYDV-RT</span>
                    <span className="text-[9px] font-mono text-slate-400 block mt-0.5">{printRoute.tarih}</span>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between text-[11px] text-slate-600 gap-2 font-medium">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>Rota: <strong className="text-slate-900">{printRoute.rota_adi}</strong></span>
                    <span>•</span>
                    <span>Tarih: <strong className="text-slate-900">{printRoute.tarih}</strong></span>
                    {(printRoute.arac_plaka || printRoute.arac_plakasi) && (
                      <>
                        <span>•</span>
                        <span>Araç: <strong className="text-slate-900">{printRoute.arac_plaka || printRoute.arac_plakasi}</strong></span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Sorumlu Personel: <strong className="text-slate-900">{printRoute.dagitim_personeli || userName}</strong></span>
                  </div>
                </div>
              </div>

              {/* Route Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Toplam Hedef Hane</span>
                  <span className="text-base font-black text-slate-900">{printRoute.toplam_hane || printRoute.duraklar?.length || 0} Hane</span>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase block">Tam Teslim Edilen</span>
                  <span className="text-base font-black text-emerald-700">{printRoute.tamamlanan_hane || printRoute.duraklar?.filter((d: any) => d.durum === 'TAMAMLANDI').length || 0} Hane</span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">Eksik / Kalan</span>
                  <span className="text-base font-black text-amber-800">
                    {(printRoute.eksik_hane || 0) + (printRoute.teslim_edilemeyen_hane || 0)} Hane
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200">
                  <span className="text-[10px] font-bold text-sky-800 uppercase block">Toplam Dağıtılan</span>
                  <span className="text-base font-black text-sky-800">
                    {printRoute.toplam_dagitilan_torba || printRoute.duraklar?.reduce((acc: number, d: any) => acc + (d.teslim_edilen_torba || 0), 0) || 0} Torba ({((printRoute.toplam_dagitilan_torba || printRoute.duraklar?.reduce((acc: number, d: any) => acc + (d.teslim_edilen_torba || 0), 0) || 0) * 0.025).toFixed(2)} Ton)
                  </span>
                </div>
              </div>

              {printRoute.kapanis_notu && (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                  <strong className="text-slate-900 font-bold block mb-0.5">Saha / Kapanış Notu:</strong>
                  <p className="font-medium">{printRoute.kapanis_notu}</p>
                </div>
              )}

              {/* Stops Table */}
              <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 border-b border-slate-300 font-black">
                      <th className="p-2.5 text-center w-10">Sıra</th>
                      <th className="p-2.5 w-28">T.C. Kimlik No</th>
                      <th className="p-2.5 w-36">Hak Sahibi</th>
                      <th className="p-2.5 w-44">Adres & Yerleşim</th>
                      <th className="p-2.5 text-center w-24">Teslimat</th>
                      <th className="p-2.5 text-center w-24">Durum</th>
                      <th className="p-2.5 text-center w-28">İmza / Teslim Alan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {printRoute.duraklar?.map((stop: any, index: number) => {
                      const isTamam = stop.durum === 'TAMAMLANDI';
                      const isEksik = stop.durum === 'EKSIK';
                      const isUndelivered = stop.durum === 'TESLIM_EDILEMEDI';
                      return (
                        <tr key={index} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2.5 text-center font-bold text-slate-500">{stop.sira || index + 1}</td>
                          <td className="p-2.5 font-mono text-slate-800 font-semibold">{stop.tc_no || '-'}</td>
                          <td className="p-2.5 font-bold text-slate-900 break-words whitespace-normal max-w-[140px] leading-snug">{stop.ad_soyad}</td>
                          <td className="p-2.5 text-slate-600 break-words whitespace-normal max-w-[180px] leading-snug">
                            <span className="font-semibold text-slate-900">{stop.mahalle}</span>
                            {stop.sokak && <span className="block text-[11px] text-slate-500 font-medium">{stop.sokak}{stop.kapi_no && stop.kapi_no !== 999999 && stop.kapi_no !== '999999' ? ` No: ${stop.kapi_no}` : ''}</span>}
                          </td>
                          <td className="p-2.5 text-center font-black text-slate-900">
                            {stop.teslim_edilen_torba ? `${stop.teslim_edilen_torba} Torba` : '-'}
                          </td>
                          <td className="p-2.5 text-center">
                            {isTamam && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                ✓ TAM
                              </span>
                            )}
                            {isEksik && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                                EKSİK
                              </span>
                            )}
                            {isUndelivered && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                                VERİLEMEDİ
                              </span>
                            )}
                            {!isTamam && !isEksik && !isUndelivered && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-300">
                                BEKLİYOR
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-center text-[10px] text-slate-400 font-mono italic">
                            {stop.teslim_alan ? stop.teslim_alan : '.....................'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Official 2-Column Signature Section */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-300 space-y-4 print-signatures shadow-2xs">
                <h4 className="text-[10px] sm:text-xs font-bold text-center uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-2">
                  RESMİ TUTANAK VE İMZA ONAY ALANI
                </h4>
                <div className="grid grid-cols-2 gap-4 sm:gap-8 max-w-2xl mx-auto text-center text-xs text-slate-700 pt-2">
                  <div className="space-y-6 sm:space-y-8 p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
                    <div>
                      <p className="font-extrabold text-slate-900 text-xs sm:text-sm">DAĞITIMI YAPAN PERSONEL</p>
                      <p className="text-[11px] font-bold text-slate-700 mt-0.5">
                        {printRoute.dagitim_personeli || userName || 'Saha Personeli'}
                      </p>
                    </div>
                    <div className="h-10 flex items-center justify-center">
                      <span className="text-[10px] text-slate-400 italic">İmza</span>
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
                href={`/api/export?type=daily_deliveries&date=${printRoute.tarih}`}
                download={`Edirne_SYDV_Rota_Teslimat_Listesi_${printRoute.tarih}.xlsx`}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Excel İndir</span>
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPrintRoute(null)}
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

      {/* ======================================================== */}
      {/* UBER / LYFT TARZI HARİTASIZ TAM EKRAN ROTA MODU KOKPİTİ   */}
      {/* ======================================================== */}
      {isRouteModeOpen && activeRoute && typeof document !== 'undefined' && createPortal(
        (() => {
          const stops: any[] = activeRoute.duraklar || [];
          const totalStops = stops.length;
          const safeIndex = Math.min(Math.max(0, routeModeIndex), Math.max(0, totalStops - 1));
          const currentStop = stops[safeIndex] || null;
          const nextStopInOrder = safeIndex + 1 < totalStops ? stops[safeIndex + 1] : null;

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

          return (
            <div className="route-mode-overlay no-print">
              {/* 1. ÜST KOKPİT BARI */}
              <div className="route-mode-topbar">
                <div style={{ maxWidth: '680px', margin: '0 auto' }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: 'rgba(56, 189, 248, 0.2)',
                          border: '1px solid rgba(56, 189, 248, 0.45)'
                        }}
                      >
                        <Navigation className="w-4 h-4 text-sky-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{ background: '#0284c7', color: '#ffffff' }}
                          >
                            ROTA MODU
                          </span>
                          <span className="text-xs font-black text-white truncate">
                            {activeRoute.rota_adi}
                          </span>
                        </div>
                        <div
                          className="flex items-center gap-2 text-[11px] font-medium mt-0.5"
                          style={{ color: '#cbd5e1' }}
                        >
                          <span>
                            Tamamlanan: <strong className="text-white">{completedCount}/{totalStops}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Dağıtılan: <strong className="text-emerald-400">{totalDeliveredBags} Torba</strong>
                          </span>
                          {activeRoute.arac_plaka && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-amber-300 font-bold">
                                {activeRoute.arac_plaka}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Sağ Üst Aksiyonlar: Sıra Seç, Geçici Durdur & Listeye Dön */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setStopPickerSearch('');
                          setStopPickerFilter('ALL');
                          setShowStopPickerModal(true);
                        }}
                        className="px-2.5 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all active:scale-95"
                        style={{
                          background: 'rgba(56, 189, 248, 0.2)',
                          border: '1px solid rgba(56, 189, 248, 0.55)',
                          color: '#7dd3fc'
                        }}
                        title="Rotadaki tüm haneleri listele ve dilediğin sıraya geç"
                      >
                        <ListOrdered className="w-3.5 h-3.5 text-sky-300" />
                        <span className="hidden sm:inline">Sıra Değiştir / Hane Seç</span>
                        <span className="sm:hidden">Sıra Seç</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handlePauseRouteAndExit(
                            'Personel Rota Modundan geçici durdurma seçti (Daha sonra devam edilecek).'
                          )
                        }
                        disabled={isActionLoading}
                        className="px-2.5 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1 transition-all active:scale-95"
                        style={{
                          background: 'rgba(245, 158, 11, 0.2)',
                          border: '1px solid rgba(251, 191, 36, 0.5)',
                          color: '#fde68a'
                        }}
                        title="Rotayı geçici olarak durdur ve çık"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Geçici Durdur</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleExitRouteMode}
                        className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95"
                        style={{
                          background: 'rgba(255, 255, 255, 0.12)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: '#f8fafc'
                        }}
                        title="Rota Modundan Çık (Liste Görünümü)"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Çıkış</span>
                      </button>
                    </div>
                  </div>

                  {/* İlerleme Çubuğu */}
                  <div
                    className="w-full h-1.5 rounded-full overflow-hidden mt-2.5"
                    style={{ background: 'rgba(255,255,255,0.14)' }}
                  >
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${progressPercent}%`,
                        background: 'linear-gradient(90deg, #38bdf8, #10b981)'
                      }}
                    />
                  </div>

                  {/* Durak Numarası Sekmeleri (Hızlı Geçiş Barı) */}
                  <div className="route-mode-pill-strip mt-2">
                    {stops.map((stItem: any, idx: number) => {
                      const isCurrent = idx === safeIndex && !routeModePausedNotice;
                      const isDone = stItem.durum === 'TAMAMLANDI';
                      const isDeferred =
                        stItem.durum === 'EKSIK' || stItem.durum === 'TESLIM_EDILEMEDI';

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
                          type="button"
                          onClick={() => {
                            setRouteModeIndex(idx);
                            syncRouteModeInputsForStop(stops[idx]);
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-black shrink-0 flex items-center gap-1 transition-all active:scale-95"
                          style={{
                            background: bg,
                            border: `1px solid ${border}`,
                            color: text
                          }}
                        >
                          <span>#{stItem.sira || idx + 1}</span>
                          {isDone && <span>✓</span>}
                          {isDeferred && <span>⏳</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 2. ANA İÇERİK GÖVDESİ */}
              <div className="route-mode-body">
                <div className="route-mode-container">
                  {/* EĞER SON KAYDA ULAŞILDI VE EKSİK / DAHA SONRA TAMAMLANACAK KAYITLAR VARSA GEÇİCİ DURDURULDU EKRANI */}
                  {routeModePausedNotice ? (
                    <div className="bg-white rounded-3xl border-2 border-amber-400 shadow-lg p-5 space-y-4">
                      <div className="flex items-start gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center shrink-0">
                          <Pause className="w-6 h-6" />
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                            ROTA GEÇİCİ OLARAK DURDURULDU
                          </span>
                          <h3 className="text-lg font-black text-slate-900 mt-1">
                            Son Kayda Ulaşıldı — Eksik Kayıtlar Bekliyor
                          </h3>
                          <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">
                            Rotadaki sıradaki kayıtlar tamamlandı ancak <strong>&quot;Daha Sonra Tamamlanacak&quot;</strong> olarak işaretlenen <strong>{deferredStops.length} hane</strong> bulunduğu için rota geçici olarak durduruldu.
                          </p>
                        </div>
                      </div>

                      {/* Bekleyen / Daha Sonra Tamamlanacak Kayıtlar Listesi */}
                      {deferredStops.length > 0 && (
                        <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                          <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 block">
                            ⏳ Daha Sonra Tamamlanacak Kayıtlar ({deferredStops.length} Hane):
                          </span>
                          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                            {deferredStops.map(({ stop: dStop, index: dIdx }) => (
                              <div
                                key={dStop.beneficiary_id || dIdx}
                                className="p-2.5 rounded-xl bg-white border border-amber-200 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-black">
                                      #{dStop.sira || dIdx + 1}
                                    </span>
                                    <span className="text-xs font-extrabold text-slate-900 truncate">
                                      {dStop.ad_soyad}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-600 truncate mt-0.5">
                                    {dStop.mahalle} {dStop.sokak ? `• ${dStop.sokak}${dStop.kapi_no && dStop.kapi_no !== 999999 && dStop.kapi_no !== '999999' ? ` No:${dStop.kapi_no}` : ''}` : ''}
                                  </p>
                                  <p className="text-[10px] text-amber-800 font-bold mt-0.5">
                                    {dStop.durum === 'EKSIK'
                                      ? `Verilen: ${dStop.teslim_edilen_torba} / ${dStop.hedef_torba || 34} Torba (Kalan: ${(dStop.hedef_torba || 34) - (dStop.teslim_edilen_torba || 0)} T)`
                                      : `Henüz Kömür Verilmedi (0 / ${dStop.hedef_torba || 34} Torba)`}
                                    {dStop.teslimat_notu ? ` • ${dStop.teslimat_notu}` : ''}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRouteModeIndex(dIdx);
                                    syncRouteModeInputsForStop(dStop);
                                  }}
                                  className="px-2.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-black shrink-0"
                                >
                                  Kayda Git →
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Aksiyon Seçenekleri */}
                      <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                        {deferredStops.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const firstDef = deferredStops[0];
                              setRouteModeIndex(firstDef.index);
                              syncRouteModeInputsForStop(firstDef.stop);
                            }}
                            className="flex-1 py-3.5 px-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
                          >
                            <Play className="w-4 h-4 fill-white" />
                            <span>Eksik Kayıtları Şimdi Tamamla (#{deferredStops[0].stop.sira || deferredStops[0].index + 1})</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handlePauseRouteAndExit('Son kayda ulaşıldı - Rota geçici olarak durduruldu.')}
                          className="flex-1 py-3.5 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
                        >
                          <Pause className="w-4 h-4" />
                          <span>Rotayı Geçici Durdurulmuş Bırak ve Çık</span>
                        </button>
                      </div>
                    </div>
                  ) : currentStop ? (
                    <>
                      {/* AKTİF DURAK ANA KARTI (HARİTASIZ, YÜKSEK OKUNABİLİRLİKLİ SAHA KARTI) */}
                      <div className="bg-white rounded-3xl border border-slate-300 shadow-md overflow-hidden">
                        {/* Kart Üst Başlık: Sıra No, Durum ve Hedef Torba */}
                        <div
                          className="p-4 flex items-center justify-between gap-3 border-b"
                          style={{
                            background:
                              currentStop.durum === 'TAMAMLANDI'
                                ? '#ecfdf5'
                                : currentStop.durum === 'EKSIK' || currentStop.durum === 'TESLIM_EDILEMEDI'
                                ? '#fffbeb'
                                : '#f8fafc',
                            borderColor: '#e2e8f0'
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="px-3.5 py-2 rounded-2xl font-black text-base sm:text-lg flex items-center justify-center shadow-xs"
                              style={{
                                background:
                                  currentStop.durum === 'TAMAMLANDI'
                                    ? '#059669'
                                    : currentStop.durum === 'EKSIK' || currentStop.durum === 'TESLIM_EDILEMEDI'
                                    ? '#d97706'
                                    : '#0f172a',
                                color: '#ffffff'
                              }}
                            >
                              #{currentStop.sira || safeIndex + 1}. DURAK
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border inline-block ${
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
                                    ? '✓ TESLİMAT TAMAMLANDI'
                                    : currentStop.durum === 'EKSIK'
                                    ? '⏳ EKSİK BIRAKILDI (DAHA SONRA TAMAMLANACAK)'
                                    : currentStop.durum === 'TESLIM_EDILEMEDI'
                                    ? '⏳ DAHA SONRA TAMAMLANACAK (0 TORBA)'
                                    : `SIRADAKİ TESLİMAT (${safeIndex + 1} / ${totalStops})`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStopPickerSearch('');
                                    setStopPickerFilter('ALL');
                                    setShowStopPickerModal(true);
                                  }}
                                  className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-[10px] font-bold flex items-center gap-1 border border-slate-300 transition-colors shadow-2xs"
                                  title="Rotadaki başka bir haneye geç"
                                >
                                  <ListOrdered className="w-3 h-3 text-sky-600" />
                                  <span>Sıra Değiştir</span>
                                </button>
                              </div>
                              <p className="text-xs text-slate-500 font-bold mt-0.5">
                                {isLastStopInRoute ? '🏁 Rotadaki Son Durak' : `Kalan Bekleyen: ${waitingStops.length} Durak`}
                              </p>
                            </div>
                          </div>

                          {/* Hedef Kota Rozeti */}
                          <div className="text-right shrink-0 bg-white px-3 py-1.5 rounded-2xl border border-slate-200 shadow-2xs">
                            <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                              HEDEF KOTA
                            </span>
                            <span className="text-base sm:text-lg font-black text-slate-900 font-mono">
                              {hedefTorba} Torba
                            </span>
                            <span className="text-[10px] font-bold text-amber-800 block">
                              ({(hedefTorba * 0.025).toFixed(2)} Ton)
                            </span>
                          </div>
                        </div>

                        {/* Rotada Önceden Atlanan Haneler Uyarısı & Hızlı Dönüş */}
                        {skippedPendingStops.length > 0 && (
                          <div className="p-3 sm:p-3.5 bg-amber-50 border-b border-amber-200 text-xs flex items-center justify-between gap-2.5 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-2xs">
                                {skippedPendingStops.length}
                              </div>
                              <div className="min-w-0">
                                <span className="font-black text-amber-950 block truncate">
                                  Rotada daha önce atlanan {skippedPendingStops.length} hane var
                                </span>
                                <span className="text-[10px] text-amber-900 font-medium block truncate">
                                  {skippedPendingStops.map((x) => `#${x.stop.sira || x.index + 1} ${x.stop.ad_soyad}`).join(' • ')}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const firstSkipped = skippedPendingStops[0];
                                setRouteModeIndex(firstSkipped.index);
                                syncRouteModeInputsForStop(firstSkipped.stop);
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black flex items-center gap-1 transition-all active:scale-95 shadow-2xs shrink-0"
                            >
                              <span>#{skippedPendingStops[0].stop.sira || skippedPendingStops[0].index + 1}&apos;e Geri Dön</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {/* BÜYÜK ADRES VE KONUM KUTUSU (HARİTASIZ NET ADRES REHBERİ) */}
                        <div className="p-4 sm:p-5 bg-sky-50/70 border-b border-sky-200/80 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-[11px] font-black uppercase tracking-wider text-sky-800 flex items-center gap-1">
                              <MapPin className="w-4 h-4 text-sky-600" />
                              TESLİMAT ADRESİ BİLGİLERİ
                            </span>
                            <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-sky-900 text-white">
                              {currentStop.mahalle || 'MERKEZ'} MAHALLESİ
                            </span>
                          </div>

                          {/* Sokak ve Kapı Numarası Büyük Punto */}
                          <div className="p-3.5 rounded-2xl bg-white border-2 border-sky-300 shadow-2xs">
                            {currentStop.sokak ? (
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="text-base sm:text-xl font-black text-slate-950 tracking-tight">
                                  {currentStop.sokak}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {currentStop.kapi_no && currentStop.kapi_no !== 999999 && currentStop.kapi_no !== '999999' && (
                                    <span className="px-2.5 py-1 rounded-xl bg-amber-500 text-white font-black text-sm sm:text-base shadow-2xs">
                                      KAPI NO: {currentStop.kapi_no}
                                    </span>
                                  )}
                                  {currentStop.daire_no && currentStop.daire_no > 0 && (
                                    <span className="px-2.5 py-1 rounded-xl bg-slate-800 text-white font-black text-xs sm:text-sm">
                                      DAİRE: {currentStop.daire_no}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : null}
                            <p
                              className={`text-xs sm:text-sm font-bold text-slate-700 leading-relaxed ${
                                currentStop.sokak ? 'mt-2 pt-2 border-t border-slate-100' : ''
                              }`}
                            >
                              {currentStop.acik_adres || 'Açık adres bilgisi belirtilmemiş'}
                            </p>
                          </div>
                        </div>

                        {/* VATANDAŞ KİMLİK, İMZA VE TELEFON SATIRI */}
                        <div className="p-4 sm:p-5 space-y-3 border-b border-slate-200">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                HAK SAHİBİ VATANDAŞ
                              </span>
                              <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-snug">
                                {currentStop.ad_soyad}
                              </h2>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="text-xs font-mono font-black text-amber-900 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200">
                                  T.C.: {currentStop.tc_no}
                                </span>

                                {currentStop.imza_durumu === 'IMZALANDI' ? (
                                  <span className="text-xs font-black text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-lg border border-emerald-300 flex items-center gap-1">
                                    <PenTool className="w-3.5 h-3.5 text-emerald-700" />
                                    Kapıda İmza Alındı
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleSignInRouteMode(safeIndex, currentStop)}
                                    disabled={isActionLoading}
                                    className="text-xs font-black text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg border border-amber-400 flex items-center gap-1 transition-all active:scale-95"
                                  >
                                    <PenTool className="w-3.5 h-3.5 text-amber-800" />
                                    <span>✍️ Kapıda İmza Alındı İşaretle</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Tek Dokunuşla Vatandaşı Ara Butonu */}
                            {currentStop.telefon ? (
                              <a
                                href={`tel:${currentStop.telefon}`}
                                className="px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs active:scale-95 transition-all shrink-0"
                              >
                                <Phone className="w-4 h-4" />
                                <span>Ara: {formatPhoneDisplay(currentStop.telefon)}</span>
                              </a>
                            ) : (
                              <div className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 text-xs font-bold shrink-0">
                                Telefon Kayıtlı Değil
                              </div>
                            )}
                          </div>

                          {/* Eğer daha önce kısmi teslimat yapıldıysa bilgi kutusu */}
                          {currentStop.durum === 'EKSIK' && prevDeliveredTorba > 0 && (
                            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start justify-between gap-2.5">
                              <div className="flex items-start gap-2.5 min-w-0">
                                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                                <div>
                                  <strong className="font-black block">
                                    Önceki Kısmi Teslimat: {prevDeliveredTorba} Torba Verildi (Kalan Eksik: {remainingForStop} Torba)
                                  </strong>
                                  <span className="text-[11px] font-medium block mt-0.5">
                                    Kalan {remainingForStop} torbayı teslim ettiğinizde aşağıdaki &quot;Tam Teslimat ({hedefTorba} Torba)&quot; butonu ile kaydı tamamlayabilirsiniz.
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setCancelStopTarget(currentStop)}
                                className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 font-black text-[11px] shrink-0 flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                                title="Bu kısmi teslimatı iptal et / geri al"
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                                <span>Geri Al</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* ======================================================== */}
                        {/* TESLİMAT İŞLEM PANELİ: TAMAMLANMIŞ TESLİMAT (GERİ AL) vs TESLİMAT YAP */}
                        {/* ======================================================== */}
                        {currentStop.durum === 'TAMAMLANDI' ? (
                          /* TAMAMLANMIŞ TESLİMAT KARTI & TESLİMATI GERİ AL AKSİYON PANELİ */
                          <div className="p-4 sm:p-5 bg-white space-y-4">
                            {/* Teslimat Tamamlandı Durum Kutusu */}
                            <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-950 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                                    <CheckCircle2 className="w-6 h-6" />
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-black text-emerald-950">
                                      Bu Hanenin Kömür Teslimatı Tamamlandı
                                    </h4>
                                    <p className="text-xs font-semibold text-emerald-800 mt-0.5">
                                      Kayıt başarıyla sisteme işlenmiş ve onaylanmıştır.
                                    </p>
                                  </div>
                                </div>
                                <span className="text-xs font-mono font-black px-2.5 py-1 rounded-lg bg-emerald-200/80 text-emerald-900 shrink-0">
                                  {currentStop.teslim_edilen_torba || hedefTorba} Torba ({(((currentStop.teslim_edilen_torba || hedefTorba) * 0.025)).toFixed(2)} Ton)
                                </span>
                              </div>

                              {/* Detay Bilgileri */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-emerald-200/70 text-xs">
                                <div>
                                  <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                                    Teslim Alan Kişi
                                  </span>
                                  <span className="font-extrabold text-slate-900">
                                    {currentStop.teslim_alan || currentStop.ad_soyad}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                                    Teslim Tarihi & Personel
                                  </span>
                                  <span className="font-bold text-slate-800">
                                    {currentStop.teslim_tarihi || 'Kayıtlı'} {currentStop.teslim_eden_personel ? `(${currentStop.teslim_eden_personel})` : ''}
                                  </span>
                                </div>
                                {currentStop.teslimat_notu && (
                                  <div className="sm:col-span-2">
                                    <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                                      Teslimat Notu
                                    </span>
                                    <span className="font-medium text-slate-800 italic">
                                      &quot;{currentStop.teslimat_notu}&quot;
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* UYARI VE GERİ ALMA BİLGİLENDİRMESİ */}
                            <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200 space-y-1.5">
                              <div className="flex items-center gap-2 text-rose-900 text-xs font-black">
                                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                <span>Yanlışlıkla mı teslimat yapıldı?</span>
                              </div>
                              <p className="text-[11px] font-medium text-rose-800 leading-relaxed">
                                Bu haneye rota içinde yanlışlıkla teslimat yapıldıysa aşağıdaki &quot;Teslimatı Geri Al&quot; butonuyla işlemi iptal edebilirsiniz. Hane tekrar <strong>BEKLİYOR</strong> durumuna dönecektir.
                              </p>
                            </div>

                            {/* AKSİYON BUTONLARI: TESLİMATI GERİ AL vs SIRADAKİ KAYDA GEÇ */}
                            <div className="space-y-2.5 pt-1">
                              {/* TESLİMATI GERİ AL BUTONU */}
                              <button
                                type="button"
                                onClick={() => setCancelStopTarget(currentStop)}
                                disabled={isActionLoading}
                                className="w-full py-4 px-5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-md active:scale-[0.99] transition-all"
                              >
                                <Undo2 className="w-5 h-5 shrink-0" />
                                <span>↩ TESLİMATI GERİ AL / İPTAL ET</span>
                              </button>

                              {/* SIRADAKİ KAYDA GEÇ BUTONU */}
                              {nextStopInOrder ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextIdx = safeIndex + 1;
                                    setRouteModeIndex(nextIdx);
                                    syncRouteModeInputsForStop(stops[nextIdx]);
                                  }}
                                  className="w-full py-3.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs sm:text-sm flex items-center justify-center gap-2 border border-slate-300 active:scale-[0.99] transition-all"
                                >
                                  <span>Sıradaki Kayda Devam Et (#{nextStopInOrder.sira || safeIndex + 2}. Durak: {nextStopInOrder.ad_soyad})</span>
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
                                  className="w-full py-3.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs active:scale-[0.99] transition-all"
                                >
                                  <span>⏳ Eksik / Bekleyen Kayıtlara Git (#{deferredStops[0].stop.sira || deferredStops[0].index + 1}. Durak)</span>
                                  <ArrowRight className="w-4 h-4" />
                                </button>
                              ) : null}

                              {/* ROTADAKİ BAŞKA BİR HANEYE GEÇ */}
                              <button
                                type="button"
                                onClick={() => {
                                  setStopPickerSearch('');
                                  setStopPickerFilter('ALL');
                                  setShowStopPickerModal(true);
                                }}
                                className="w-full py-3 px-4 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 border border-indigo-200 active:scale-[0.99] transition-all"
                              >
                                <ListOrdered className="w-4 h-4" />
                                <span>📋 Rotadaki Başka Bir Haneye Geç (Sıra Seç)</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* HENÜZ TAMAMLANMAMIŞ DURAKLAR İÇİN TESLİMAT İŞLEM PANELİ */
                          <div className="p-4 sm:p-5 bg-white space-y-4">
                            {/* 2'li Mod Seçici Sekme */}
                            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200">
                              <button
                                type="button"
                                onClick={() => {
                                  setRouteModeTab('DELIVER');
                                  setRouteModeTorba(String(hedefTorba));
                                }}
                                className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                                  routeModeTab === 'DELIVER'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'text-slate-700 hover:text-slate-900'
                                }`}
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>1. Tam Teslimat Yap</span>
                              </button>

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
                                className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                                  routeModeTab === 'DEFER'
                                    ? 'bg-amber-500 text-white shadow-xs'
                                    : 'text-slate-700 hover:text-slate-900'
                                }`}
                              >
                                <Clock className="w-4 h-4" />
                                <span>2. Eksik / Daha Sonra</span>
                              </button>
                            </div>

                            {/* SEKME 1: TAM TESLİMAT YAP VE SIRADAKİ KAYDA GEÇ */}
                            {routeModeTab === 'DELIVER' && (
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[11px] font-black text-slate-700 uppercase block mb-1">
                                      Toplam Teslim Edilen Torba
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setRouteModeTorba((v) =>
                                            String(Math.max(1, (parseInt(v, 10) || hedefTorba) - 1))
                                          )
                                        }
                                        className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 font-black text-base text-slate-800"
                                      >
                                        -
                                      </button>
                                      <input
                                        type="number"
                                        value={routeModeTorba}
                                        onChange={(e) => setRouteModeTorba(e.target.value)}
                                        min="1"
                                        max={hedefTorba}
                                        className="flex-1 h-11 px-3 rounded-xl bg-white border-2 border-emerald-400 text-center text-base font-mono font-black text-slate-900 focus:outline-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setRouteModeTorba((v) =>
                                            String(Math.min(hedefTorba, (parseInt(v, 10) || 0) + 1))
                                          )
                                        }
                                        className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 font-black text-base text-slate-800"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>

                                  <div>
                                    <label className="text-[11px] font-black text-slate-700 uppercase block mb-1">
                                      Teslim Alan Kişi
                                    </label>
                                    <input
                                      type="text"
                                      value={routeModeRecipient}
                                      onChange={(e) => setRouteModeRecipient(e.target.value)}
                                      placeholder={currentStop.ad_soyad}
                                      className="w-full h-11 px-3 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                                    />
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleRouteModeSubmit('COMPLETE')}
                                  disabled={isActionLoading}
                                  className="w-full py-4 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-md active:scale-[0.99] transition-all"
                                >
                                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                                  <span>
                                    {isActionLoading
                                      ? 'Kaydediliyor...'
                                      : isOnlyRemainingStop
                                      ? `🎉 TESLİMATI TAMAMLA (${routeModeTorba || hedefTorba} TORBA) & ROTAYI BİTİR`
                                      : `✓ TESLİMATI TAMAMLA (${routeModeTorba || hedefTorba} TORBA) & SIRADAKİ KAYDA GEÇ →`}
                                  </span>
                                </button>
                              </div>
                            )}

                            {/* SEKME 2: EKSİK BIRAK / DAHA SONRA TAMAMLANACAK */}
                            {routeModeTab === 'DEFER' && (
                              <div className="space-y-3 p-3.5 rounded-2xl bg-amber-50/70 border border-amber-300">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-black text-amber-950">
                                    ⏳ Eksik / Daha Sonra Tamamlanacak Seçeneği:
                                  </span>
                                </div>

                                {/* Alt Seçenek: Kısmi Kömür Verildi vs Şu An 0 Torba */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRouteModeDeferType('PARTIAL');
                                      setRouteModeTorba('20');
                                      if (!routeModeNote) {
                                        setRouteModeNote('Kamyonda kömür bitti - Kalanı daha sonra tamamlanacak');
                                      }
                                    }}
                                    className={`p-2.5 rounded-xl border text-left transition-all ${
                                      routeModeDeferType === 'PARTIAL'
                                        ? 'bg-white border-amber-500 text-amber-950 shadow-2xs ring-2 ring-amber-400/30'
                                        : 'bg-white/60 border-slate-200 text-slate-600'
                                    }`}
                                  >
                                    <span className="text-xs font-black block">
                                      ⚠️ Kısmi Kömür Verildi (Eksik)
                                    </span>
                                    <span className="text-[10px] font-medium opacity-85 block mt-0.5">
                                      Bir kısmı şimdi verildi, kalanı daha sonra tamamlanacak
                                    </span>
                                  </button>

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
                                      ⏳ Şu An Verilemedi (0 Torba)
                                    </span>
                                    <span className="text-[10px] font-medium opacity-85 block mt-0.5">
                                      Evde yok / ulaşılamadı, daha sonra tamamlanacak
                                    </span>
                                  </button>
                                </div>

                                {routeModeDeferType === 'PARTIAL' && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                    <div>
                                      <label className="text-[11px] font-black text-amber-950 block mb-1">
                                        Şu An Verilen Torba Sayısı
                                      </label>
                                      <input
                                        type="number"
                                        value={routeModeTorba}
                                        onChange={(e) => setRouteModeTorba(e.target.value)}
                                        min="1"
                                        max={hedefTorba - 1}
                                        className="w-full px-3 py-2 rounded-xl bg-white border-2 border-amber-400 text-sm font-mono font-black text-slate-900"
                                      />
                                      <span className="text-[10px] font-extrabold text-amber-900 block mt-1">
                                        Daha Sonra Tamamlanacak Kalan:{' '}
                                        {Math.max(0, hedefTorba - (parseInt(routeModeTorba, 10) || 0))} Torba
                                      </span>
                                    </div>
                                    <div>
                                      <label className="text-[11px] font-black text-amber-950 block mb-1">
                                        Teslim Alan Kişi
                                      </label>
                                      <input
                                        type="text"
                                        value={routeModeRecipient}
                                        onChange={(e) => setRouteModeRecipient(e.target.value)}
                                        placeholder={currentStop.ad_soyad}
                                        className="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 text-xs font-bold text-slate-900"
                                      />
                                    </div>
                                  </div>
                                )}

                                <div>
                                  <label className="text-[11px] font-black text-amber-950 block mb-1">
                                    Daha Sonra Tamamlanma / Eksik Nedeni
                                  </label>
                                  <input
                                    type="text"
                                    value={routeModeNote}
                                    onChange={(e) => setRouteModeNote(e.target.value)}
                                    placeholder="Örn: Evde yok / Kamyonda kömür bitti - Daha sonra tamamlanacak"
                                    className="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 text-xs font-semibold text-slate-900"
                                  />
                                  {/* Hızlı Neden Etiketleri */}
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {[
                                      'Evde kimse yok - Daha sonra tamamlanacak',
                                      'Kamyonda kömür bitti - Daha sonra tamamlanacak',
                                      'Sokak kapalı - Daha sonra girilecek',
                                      'Vatandaş daha sonra teslim almak istedi'
                                    ].map((reasonChip) => (
                                      <button
                                        key={reasonChip}
                                        type="button"
                                        onClick={() => setRouteModeNote(reasonChip)}
                                        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-950 border border-amber-300"
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
                                  className="w-full py-3.5 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all"
                                >
                                  <SkipForward className="w-4 h-4 shrink-0" />
                                  <span>
                                    {isActionLoading
                                      ? 'İşleniyor...'
                                      : !hasRemainingStopsAfterCurrent
                                      ? '⏸️ DAHA SONRA TAMAMLANACAK İŞARETLE & ROTAYI GEÇİCİ DURDUR'
                                      : '⏳ DAHA SONRA TAMAMLANACAK İŞARETLE & SIRADAKİ KAYDA GEÇ →'}
                                  </span>
                                </button>
                              </div>
                            )}

                            {/* SIRADAN BAĞIMSIZ DAĞITIM VE GEÇİŞ AKSİYONLARI */}
                            <div className="pt-2 border-t border-slate-200 space-y-2">
                              <div className="flex items-center justify-between text-[11px] font-black text-slate-500 uppercase tracking-wider px-1">
                                <span>Serbest Sıralama / Güzergah Değişikliği</span>
                                <span className="text-sky-700 font-extrabold lowercase font-sans text-[10px]">
                                  (sırayı bozmadan devam eder)
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={handleSkipCurrentStop}
                                  className="w-full py-3 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs flex items-center justify-center gap-2 border border-slate-300 active:scale-[0.98] transition-all"
                                  title="Bu haneyi teslimat yapmadan bekleyen olarak bırakır ve sıradaki sonraki haneye geçer"
                                >
                                  <SkipForward className="w-4 h-4 text-slate-600" />
                                  <span>Bu Haneyi Şimdilik Atla</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStopPickerSearch('');
                                    setStopPickerFilter('ALL');
                                    setShowStopPickerModal(true);
                                  }}
                                  className="w-full py-3 px-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs flex items-center justify-center gap-2 border border-indigo-200 active:scale-[0.98] transition-all"
                                  title="Rotadaki tüm haneler arasından istediğiniz sıradaki haneye anında geçin"
                                >
                                  <ListOrdered className="w-4 h-4 text-indigo-600" />
                                  <span>Rotadaki Başka Sıraya Geç</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              {/* 3. ALT NAVİGASYON VE SIRADAKİ DURAK ÖNİZLEME BARI */}
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
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 text-xs font-black flex items-center gap-1 border border-slate-300 shrink-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Önceki</span>
                  </button>

                  {/* Sıradaki Durak Bilgisi */}
                  <div className="min-w-0 text-center flex-1 px-2">
                    {nextStopInOrder ? (
                      <div className="truncate">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                          SIRADAKİ KAYIT (#{nextStopInOrder.sira || safeIndex + 2})
                        </span>
                        <span className="text-xs font-black text-slate-800 truncate block">
                          {nextStopInOrder.ad_soyad} —{' '}
                          <span className="text-sky-700">
                            {nextStopInOrder.sokak
                              ? `${nextStopInOrder.sokak}${nextStopInOrder.kapi_no && nextStopInOrder.kapi_no !== 999999 && nextStopInOrder.kapi_no !== '999999' ? ` No:${nextStopInOrder.kapi_no}` : ''}`
                              : nextStopInOrder.mahalle}
                          </span>
                        </span>
                      </div>
                    ) : (
                      <div className="truncate">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 block">
                          SON DURAKTASINIZ
                        </span>
                        <span className="text-xs font-bold text-slate-700 truncate block">
                          {deferredStops.length > 0
                            ? `${deferredStops.length} kayıt daha sonra tamamlanacak`
                            : 'Tüm kayıtlar tamamlandığında rota kapanır'}
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
                        // Son duraktayız: önceden atlanmış veya tamamlanmamış kayıt varsa oraya otomatik dön
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
                            durationMs: 3500
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
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 text-xs font-black flex items-center gap-1 border border-slate-300 shrink-0"
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
                    {/* Modal Başlık */}
                    <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/40 text-sky-400 flex items-center justify-center shrink-0">
                          <ListOrdered className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm sm:text-base font-black truncate">
                            Rotadaki Haneler &amp; Sıra Seçimi
                          </h3>
                          <p className="text-[11px] text-slate-300 truncate">
                            {stops.length} hane arasından istediğinize doğrudan geçebilirsiniz
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowStopPickerModal(false)}
                        className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0 transition-colors"
                        title="Kapat"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Arama Kutusu ve Filtreler */}
                    <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50 space-y-2.5 shrink-0">
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={stopPickerSearch}
                          onChange={(e) => setStopPickerSearch(e.target.value)}
                          placeholder="İsim, T.C., sokak, kapı no veya #sıra ara..."
                          className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                          autoFocus
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

                      {/* Filtre Butonları */}
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
                          Bekleyen / Eksik ({stops.filter((s: any) => s.durum !== 'TAMAMLANDI').length})
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

                    {/* Liste */}
                    <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1.5">
                      {filteredPickerStops.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                          <p className="text-xs font-bold">Aramanızla eşleşen hane bulunamadı.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setStopPickerSearch('');
                              setStopPickerFilter('ALL');
                            }}
                            className="mt-2 text-xs font-black text-sky-600 underline"
                          >
                            Filtreleri Temizle
                          </button>
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
                                showToast({
                                  type: 'info',
                                  title: 'Haneye Geçildi',
                                  message: `#${pStop.sira || pIdx + 1}. sıradaki haneye geçildi: ${pStop.ad_soyad}`,
                                  durationMs: 3500
                                });
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
                                {/* Sıra Rozeti */}
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
                                    {isCurrent && (
                                      <span className="px-1.5 py-0.5 rounded bg-sky-600 text-white text-[9px] font-black uppercase">
                                        ŞU ANKİ DURAK
                                      </span>
                                    )}
                                    {isDone && (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                                        ✓ {pStop.teslim_edilen_torba || 34} Torba
                                      </span>
                                    )}
                                    {isDeferred && (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[9px] font-bold">
                                        ⏳ {pStop.durum === 'EKSIK' ? `${pStop.teslim_edilen_torba} Torba Verildi` : 'Ertelendi (0 T)'}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-600 font-medium truncate mt-0.5">
                                    {pStop.mahalle} {pStop.sokak ? `• ${pStop.sokak}` : ''}
                                    {pStop.kapi_no && pStop.kapi_no !== 999999 && pStop.kapi_no !== '999999' ? ` No:${pStop.kapi_no}` : ''}
                                    {pStop.daire_no && pStop.daire_no > 0 ? ` D:${pStop.daire_no}` : ''}
                                  </p>
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center gap-1 text-sky-700 font-extrabold text-xs">
                                {isCurrent ? (
                                  <span className="text-[11px] text-sky-700 font-black">Açık</span>
                                ) : (
                                  <>
                                    <span className="hidden sm:inline">Bu Sıraya Geç</span>
                                    <ArrowRight className="w-4 h-4 text-sky-600" />
                                  </>
                                )}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* Modal Alt Bilgi */}
                    <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[11px] font-bold text-slate-500 shrink-0">
                      <span>💡 Bir haneyi tamamladıktan sonra sistem kaldığı sıradan devam eder.</span>
                      <button
                        type="button"
                        onClick={() => setShowStopPickerModal(false)}
                        className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-black"
                      >
                        Kapat
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}