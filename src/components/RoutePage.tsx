'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Route as RouteIcon, Navigation, CheckCircle2, Plus, Truck, Trash2, Archive, RefreshCw, ChevronDown, ChevronUp, PenTool, Download, Printer, Play, Pause } from 'lucide-react';
import dynamic from 'next/dynamic';
import { showAlert, showConfirm, showToast } from '@/components/GlobalAlertManager';
import ActiveRouteAccordionCard from './ActiveRouteAccordionCard';

const RouteCreationModals = dynamic(() => import('./route/RouteCreationModals'));
const RouteActionModals = dynamic(() => import('./route/RouteActionModals'));
const RoutePrintReportModal = dynamic(() => import('./route/RoutePrintReportModal'));
const RouteModeCockpitModal = dynamic(() => import('./route/RouteModeCockpitModal'));
import { formatPhoneDisplay, getRecordStreetInfo, compareByAddressAsc, isBirebirBeneficiaryMatch, extractUniquePersonnelList } from '@/lib/normalizer';
import { formatTrDate } from '@/lib/dateUtils';
import { requestAppFullscreen, exitAppFullscreen } from '@/lib/fullscreen';

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
  userRole: 'ADMIN' | 'PERSONEL' | 'MUDUR';
  userName: string;
  userUsername?: string;
  userTeam?: string;
  userPartners?: string[];
  eksikHaneler?: any[];
  onCompleteHousehold?: (person: any) => void;
  onRefreshAll?: () => void;
  onNavigateToSearch?: () => void;
}

export default function RoutePage({
  userRole,
  userName,
  userUsername,
  userTeam,
  userPartners,
  onRefreshAll,
  onNavigateToSearch
}: RoutePageProps) {
  const [currentClientId] = useState<string>(() => getOrCreateClientId());
  const [activeTab, setActiveTab] = useState<'ACTIVE_ROUTE' | 'ARCHIVE'>('ACTIVE_ROUTE');
  const [printRoute, setPrintRoute] = useState<any | null>(null);

  // Rota tutanağında görev alan tüm personellerin listesi
  const routeStaffList = useMemo(() => {
    if (!printRoute) return [];
    const stopRecords = printRoute.duraklar || [];
    return extractUniquePersonnelList([
      printRoute.dagitim_personeli,
      printRoute.kapatan_personel,
      ...stopRecords,
      userName,
    ]);
  }, [printRoute, userName]);

  const [activeRoutes, setActiveRoutes] = useState<any[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [expandedActiveRouteId, setExpandedActiveRouteId] = useState<string | null>(null);

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

  // Check if current user is authorized to deliver / resume / manage this route (Admin, Operator, or Team Partner)
  const isUserTeamAuthorized = useCallback((route: any): boolean => {
    if (!route) return true;
    if (userRole === 'ADMIN' || userRole === 'MUDUR') return true;

    const GENERIC_NAMES = ['personel', 'saha personeli', 'dağıtım personeli', 'dagitim personeli', 'dağıtım ekibi', 'dagitim ekibi', 'ekip', 'admin', 'kullanıcı', 'kullanici', 'user'];
    const isGeneric = (str: string) => !str || str.length < 3 || GENERIC_NAMES.includes(str.trim().toLowerCase());

    const myUsername = (userUsername || '').trim().toLowerCase();
    const myName = (userName || '').trim().toLowerCase();
    const myTeam = (userTeam || '').trim().toLowerCase();
    const myPartners = (userPartners || []).map((p: string) => String(p).trim().toLowerCase());

    const routeOpUser = String(route.isleten_username || route.olusturan_username || '').trim().toLowerCase();
    const routeOpName = String(route.isleten_personel || route.dagitim_personeli || '').trim().toLowerCase();
    const routeTeam = String(route.ekip_adi || '').trim().toLowerCase();
    const routePartners = [
      ...(Array.isArray(route.ekip_arkadaslari) ? route.ekip_arkadaslari : []),
      ...(route.ekip_arkadasi ? [route.ekip_arkadasi] : [])
    ].map((p: any) => String(p).trim().toLowerCase()).filter(Boolean);

    // If route has no operator assigned yet and name is generic/empty, anyone can take it
    if (!routeOpUser && (!routeOpName || isGeneric(routeOpName))) return true;

    // 1. Direct ownership by username
    if (myUsername && routeOpUser && myUsername === routeOpUser) return true;

    // 1b. Direct ownership by full name (only if non-generic)
    if (!isGeneric(myName) && !isGeneric(routeOpName) && myName === routeOpName) return true;

    // 2. Team name match
    if (myTeam && routeTeam && myTeam === routeTeam) return true;

    // 3. User has route operator in their partners list
    if (routeOpUser && myPartners.includes(routeOpUser)) return true;
    if (!isGeneric(routeOpName) && myPartners.includes(routeOpName)) return true;

    // 4. Route lists user in route's partners list
    if (myUsername && routePartners.includes(myUsername)) return true;
    if (!isGeneric(myName) && routePartners.includes(myName)) return true;

    // 5. Multiple operators in dagitim_personeli (e.g. "Ahmet Yılmaz / Mehmet Demir")
    if (routeOpName) {
      const splitOps = routeOpName.split(/[,/&+]/).map((s: string) => s.trim().toLowerCase()).filter((s: string) => !isGeneric(s));
      if (!isGeneric(myName) && splitOps.includes(myName)) return true;
      if (myUsername && splitOps.includes(myUsername)) return true;
    }

    return false;
  }, [userRole, userName, userUsername, userTeam, userPartners]);

  // Is this route operated by a teammate rather than directly by this user?
  const isTeammateRoute = useMemo(() => {
    if (!activeRoute) return false;
    const myUsername = (userUsername || '').trim().toLowerCase();
    const myName = (userName || '').trim().toLowerCase();
    const routeOpUser = String(activeRoute.isleten_username || activeRoute.olusturan_username || '').trim().toLowerCase();
    const routeOpName = String(activeRoute.isleten_personel || activeRoute.dagitim_personeli || '').trim().toLowerCase();
    const isDirectOwner = (myUsername && routeOpUser === myUsername) || (myName && routeOpName === myName);
    return !isDirectOwner && isUserTeamAuthorized(activeRoute);
  }, [activeRoute, userUsername, userName, isUserTeamAuthorized]);

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

    // If the route is paused (DURAKLATILDI) and not in active route mode:
    // the lock is free so either operator or team partner can resume it!
    if (activeRoute.durum === 'DURAKLATILDI' || !activeRoute.aktif_rota_modu) {
      return false;
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
  const [, setAllPendingBeneficiaries] = useState<any[]>([]);
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
  const [, setCreateSelectionTab] = useState<'SIGNED' | 'ALL'>('SIGNED');
  const [createModalStep, setCreateModalStep] = useState<'SELECT' | 'ORDER'>('SELECT');
  const [selectedBeneficiaryIds, setSelectedBeneficiaryIds] = useState<string[]>([]);
  const [createSearchQuery, setCreateSearchQuery] = useState<string>('');

  // Finalize Modal State
  const [finalizeNote, setFinalizeNote] = useState<string>('');

  // Add to Existing Route Modal State
  const [showAddToExistingModal, setShowAddToExistingModal] = useState<boolean>(false);
  const [addToRouteTargetId, setAddToRouteTargetId] = useState<string>('');
  const [addToRouteSelectedIds, setAddToRouteSelectedIds] = useState<string[]>([]);
  const [addToRouteSearch, setAddToRouteSearch] = useState<string>('');
  const [showUnassignedList, setShowUnassignedList] = useState<boolean>(false);

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
          const hasStopsInOtherRoutes = activeRoutes.some((r) =>
            (r.duraklar || []).some((d: any) => !d.durum || d.durum === 'BEKLIYOR')
          );
          showAlert({
            title: 'Dağıtım Bekleyen İmzalı Hane Bulunamadı',
            message: hasStopsInOtherRoutes
              ? 'Şu an atanmamış boşta imzalı hane bulunmamaktadır.\n\nİpucu: Mevcut aktif rotalardaki haneleri "Rotadan Çıkar" (👤-) butonu ile boşa çıkarabilir ve yeni ekibe aktarabilirsiniz. Veya "İmza Topla" ekranından yeni hanelerin imzasını alabilirsiniz.'
              : 'İmzası alınmış ve kömürü teslim edilmemiş hane bulunmadığı için yeni dağıtım rotası başlatılamaz.\n\nLütfen önce Sorgu / İmza Topla ekranından teslimat yapılacak hanelerin kapıda imzasını alınız.',
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

  // Open Add to Existing Route Modal
  const handleOpenAddToExistingModal = (targetRouteId?: string) => {
    if (!activeRoutes || activeRoutes.length === 0) {
      showAlert({
        title: 'Aktif Dağıtım Ekibi Bulunmuyor',
        message: 'Şu anda sahada aktif bir dağıtım rotası bulunmuyor. Lütfen önce "+ Yeni Dağıtım Rotası / Ekip Başlat" butonu ile yeni bir rota oluşturunuz.',
        type: 'warning'
      });
      return;
    }
    const initialTarget = targetRouteId || (activeRoute ? String(activeRoute.id || activeRoute._id) : String(activeRoutes[0].id || activeRoutes[0]._id));
    setAddToRouteTargetId(initialTarget);
    setAddToRouteSearch('');
    // Pre-select all available signed beneficiaries
    setAddToRouteSelectedIds(availableSignedBeneficiaries.map((b: any) => String(b.id || b._id)));
    setShowAddToExistingModal(true);
  };

  // Submit adding stops to existing route
  const handleAddStopsToExistingRoute = async () => {
    if (!addToRouteTargetId) {
      showAlert({
        title: 'Hedef Rota Seçilmedi',
        message: 'Lütfen hanelerin ekleneceği hedef dağıtım rotasını seçiniz.',
        type: 'warning'
      });
      return;
    }
    if (addToRouteSelectedIds.length === 0) {
      showAlert({
        title: 'Hane Seçilmedi',
        message: 'Lütfen rotaya eklenecek en az bir hane seçiniz.',
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
          action: 'ADD_STOPS_TO_ROUTE',
          route_id: addToRouteTargetId,
          beneficiary_ids: addToRouteSelectedIds,
          personel: userName || 'Personel',
          client_id: currentClientId
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast({
          type: 'success',
          title: 'Haneler Rotaya Eklendi',
          message: data.message || `${addToRouteSelectedIds.length} hane başarıyla rotaya eklendi.`
        });
        setShowAddToExistingModal(false);
        setAddToRouteSelectedIds([]);
        await fetchRoutes();
        if (onRefreshAll) onRefreshAll();
      } else {
        showAlert({
          title: 'İşlem Başarısız',
          message: data.error || 'Haneler rotaya eklenemedi.',
          type: 'error'
        });
      }
    } catch (e: any) {
      showAlert({
        title: 'Bağlantı Hatası',
        message: 'İşlem sırasında hata oluştu: ' + e.message,
        type: 'error'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // ========================================================
  // OTURUM SÜREKLİLİĞİ & ARKA PLAN / EKRAN KİLİDİ DEVAM ETME
  // ========================================================
  const sessionUserKey = userUsername || userName || 'personel';
  const hasRestoredSessionRef = useRef<boolean>(false);
  const wakeLockSentinelRef = useRef<any>(null);
  const isSubmittingStopRef = useRef<boolean>(false);

  // Mobil Geri (Back) Tuşu Koruması: Rota Modundan çıkılana kadar yanlışlıkla geri tuşuyla sayfadan çıkılmasını önler
  useEffect(() => {
    if (!isRouteModeOpen || typeof window === 'undefined') return;
    try {
      window.history.pushState({ routeModeGuard: true }, '');
    } catch {}

    const handlePopState = () => {
      if (!isRouteModeOpen) return;
      try {
        window.history.pushState({ routeModeGuard: true }, '');
      } catch {}
      showToast({
        type: 'info',
        title: 'Rota Modu Aktif',
        message: 'Rota modundan çıkmak için sağ üstteki "Çıkış" (Durdur & Çık) butonunu kullanabilirsiniz.',
        durationMs: 2800
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isRouteModeOpen]);

  // Screen Wake Lock API: Rota Modundayken telefon ekranının kapanmasını/uyumasını engelle
  const requestWakeLock = useCallback(async () => {
    if (typeof window === 'undefined' || !('wakeLock' in navigator)) return;
    try {
      if (!wakeLockSentinelRef.current) {
        wakeLockSentinelRef.current = await (navigator as any).wakeLock.request('screen');
        wakeLockSentinelRef.current.addEventListener('release', () => {
          wakeLockSentinelRef.current = null;
        });
      }
    } catch {
      // Ekran kilidi düşük pil veya arka planda reddedilebilir
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockSentinelRef.current) {
      try {
        await wakeLockSentinelRef.current.release();
      } catch {}
      wakeLockSentinelRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isRouteModeOpen) {
      requestWakeLock();
      requestAppFullscreen();
    } else {
      releaseWakeLock();
      exitAppFullscreen();
    }
    return () => {
      releaseWakeLock();
      exitAppFullscreen();
    };
  }, [isRouteModeOpen, requestWakeLock, releaseWakeLock]);

  // Oturum durumunu anlık olarak localStorage'a kaydet (KVKK: vatandaş adı/notu gibi kişisel veriler localStorage'a yazılmaz)
  const saveCurrentSession = useCallback(() => {
    if (typeof window === 'undefined') return;
    const storageKey = `komur_active_route_session_${sessionUserKey}`;
    if (isRouteModeOpen && activeRoute) {
      const routeId = String(activeRoute.id || activeRoute._id);
      const sessionData = {
        routeId,
        isRouteModeOpen: true,
        routeModeIndex,
        routeModeTorba,
        routeModeTab,
        routeModeDeferType,
        timestamp: Date.now()
      };
      try {
        const serialized = JSON.stringify(sessionData);
        localStorage.setItem(storageKey, serialized);
        localStorage.setItem('komur_active_route_session_last', serialized);
        localStorage.setItem('komur_active_tab', 'route');
      } catch (e) {}
    }
  }, [
    isRouteModeOpen,
    activeRoute,
    routeModeIndex,
    routeModeTorba,
    routeModeTab,
    routeModeDeferType,
    sessionUserKey
  ]);

  const clearSavedSession = useCallback(() => {
    if (typeof window === 'undefined') return;
    const storageKey = `komur_active_route_session_${sessionUserKey}`;
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem('komur_active_route_session_last');
    } catch (e) {}
  }, [sessionUserKey]);

  // Rota Modu açıkken her veri değişiminde veya sayfa arka plana geçtiğinde/kapandığında kaydet
  useEffect(() => {
    if (isRouteModeOpen) {
      saveCurrentSession();
    }
  }, [
    isRouteModeOpen,
    routeModeIndex,
    routeModeTorba,
    routeModeRecipient,
    routeModeNote,
    routeModeTab,
    routeModeDeferType,
    saveCurrentSession
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeUnload = () => {
      saveCurrentSession();
    };

    const resumeRouteModeFromBackground = () => {
      if (!isRouteModeOpen) return;
      requestWakeLock();
      const routeId = activeRoute?.id || activeRoute?._id;
      if (routeId) {
        fetch('/api/routes', {
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
        }).catch(() => {});
      }
      fetchRoutes(true);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentSession();
      } else if (document.visibilityState === 'visible' && isRouteModeOpen) {
        resumeRouteModeFromBackground();
      }
    };

    const handlePageShow = () => {
      if (isRouteModeOpen) {
        resumeRouteModeFromBackground();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    saveCurrentSession,
    isRouteModeOpen,
    requestWakeLock,
    activeRoute?.id,
    activeRoute?._id,
    currentClientId,
    userName,
    routeModeIndex,
    fetchRoutes
  ]);

  // Tüm duraklar tamamlandığında rotanın otomatik olarak kapanmasını ve arşivlenmesini garanti et
  useEffect(() => {
    if (!activeRoute || activeRoute.durum === 'TAMAMLANDI') return;
    const stops = activeRoute.duraklar || [];
    if (stops.length === 0) return;
    const allStopsFinished = stops.every((s: any) =>
      s.durum === 'TAMAMLANDI' ||
      s.durum === 'TESLIM_EDILDI' ||
      (Number(s.teslim_edilen_torba) > 0 && Number(s.teslim_edilen_torba) >= Number(s.hedef_torba || 34))
    );
    if (allStopsFinished) {
      if (isRouteModeOpen) {
        setIsRouteModeOpen(false);
        clearSavedSession();
      }
      fetchRoutes(true);
    }
  }, [activeRoute, isRouteModeOpen, fetchRoutes, clearSavedSession]);

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
  const handleOpenRouteMode = async (
    targetRoute?: any,
    forcedStopIndex?: number,
    restoredSessionState?: {
      routeModeTorba?: string;
      routeModeTab?: 'DELIVER' | 'DEFER';
      routeModeDeferType?: 'PARTIAL' | 'ZERO';
    }
  ) => {
    const routeToUse = targetRoute || activeRoute;
    if (!routeToUse || !routeToUse.duraklar || routeToUse.duraklar.length === 0) return;

    if (!isUserTeamAuthorized(routeToUse)) {
      showAlert({
        title: '🔒 Yetkisiz Erişim / Farklı Ekip',
        message: `"${routeToUse.rota_adi}" rotası ${routeToUse.isleten_personel || routeToUse.dagitim_personeli || 'başka bir personel'} personeline aittir. Bu rotayı yalnızca kendisi veya tanımlı ekip arkadaşları işletebilir.`,
        type: 'lock'
      });
      return;
    }

    // Kullanıcı dokunuşu (user gesture) anında senkron tam ekran isteği gönder (Mobil Chrome/Safari uyumu)
    requestAppFullscreen();

    const routeId = routeToUse.id || routeToUse._id;
    const stops = routeToUse.duraklar;
    let startIdx = 0;

    if (typeof forcedStopIndex === 'number' && forcedStopIndex >= 0 && forcedStopIndex < stops.length) {
      startIdx = forcedStopIndex;
    } else {
      // 1. Prefer first unvisited stop (BEKLIYOR) in sequential order
      const firstWaitingIdx = stops.findIndex((s: any) => !s.durum || s.durum === 'BEKLIYOR');
      if (firstWaitingIdx !== -1) {
        startIdx = firstWaitingIdx;
      } else {
        // 2. Otherwise first deferred / incomplete stop (EKSIK or TESLIM_EDILEMEDI)
        const firstIncompleteIdx = stops.findIndex((s: any) => s.durum !== 'TAMAMLANDI');
        startIdx = firstIncompleteIdx !== -1 ? firstIncompleteIdx : 0;
      }
    }

    // Anında (0ms gecikme ile) Tam Ekran Rota Modunu aç ve sıradaki kaydı getir
    setSelectedRouteId(String(routeId));
    setRouteModeIndex(startIdx);
    syncRouteModeInputsForStop(stops[startIdx]);
    if (restoredSessionState) {
      if (restoredSessionState.routeModeTab) setRouteModeTab(restoredSessionState.routeModeTab);
      if (restoredSessionState.routeModeDeferType) setRouteModeDeferType(restoredSessionState.routeModeDeferType);
      if (restoredSessionState.routeModeTorba) setRouteModeTorba(restoredSessionState.routeModeTorba);
    }
    setRouteStatusBanner(null);
    setIsRouteModeOpen(true);

    // Arka planda rota kilidini doğrula / tek personel kuralı kontrolü
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
        setIsRouteModeOpen(false);
        clearSavedSession();
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
      // Saha internet kopmalarında Rota Modu açık kalmaya devam eder
      console.warn('Lock acquisition network blip (continuing in Route Mode):', err);
    }

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

  // Pause Route and Exit Rota Modu (releases lock on backend)
  const handlePauseRouteAndExit = async (customReason?: string) => {
    clearSavedSession();
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

  // Canlı Ekip Senkronizasyonu & Rota Oturumu Heartbeat (4 saniyede bir gerçek zamanlı senkronizasyon)
  useEffect(() => {
    if (!isRouteModeOpen || !activeRoute) return;
    const routeId = activeRoute.id || activeRoute._id;
    if (!routeId) return;

    const sendHeartbeat = async () => {
      if (isSubmittingStopRef.current) return;
      try {
        const res = await fetch('/api/routes', {
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
        const data = await res.json().catch(() => null);
        if (!data?.success || !data?.route || isSubmittingStopRef.current) return;

        const remoteRoute = data.route;
        const remoteStops: any[] = Array.isArray(remoteRoute.duraklar) ? remoteRoute.duraklar : [];

        setActiveRoutes((prev) => {
          const currentLocal = prev.find((r) => String(r.id || r._id) === String(routeId));
          if (!currentLocal) return prev;

          const localStops: any[] = Array.isArray(currentLocal.duraklar) ? currentLocal.duraklar : [];
          let changedStopIdx = -1;
          let changedStopObj: any = null;
          let hasAnyDiff =
            currentLocal.updated_at !== remoteRoute.updated_at ||
            currentLocal.durum !== remoteRoute.durum ||
            JSON.stringify(currentLocal.aktif_operatorler || []) !==
              JSON.stringify(remoteRoute.aktif_operatorler || []);

          for (let i = 0; i < remoteStops.length; i++) {
            const ls = localStops[i];
            const rs = remoteStops[i];
            if (!ls || !rs) continue;
            if (
              ls.durum !== rs.durum ||
              Number(ls.teslim_edilen_torba || 0) !== Number(rs.teslim_edilen_torba || 0) ||
              ls.imza_durumu !== rs.imza_durumu
            ) {
              hasAnyDiff = true;
              if (ls.durum !== rs.durum) {
                changedStopIdx = i;
                changedStopObj = rs;
              }
            }
          }

          if (!hasAnyDiff) return prev;

          // Eğer başka bir personel bir durağın durumunu değiştirdiyse canlı bildirim göster ve gerekiyorsa sıradaki durağa geç
          if (changedStopObj && changedStopIdx !== -1) {
            const actor = changedStopObj.teslim_eden_personel || 'Ekip arkadaşınız';
            const statusText =
              changedStopObj.durum === 'TAMAMLANDI'
                ? 'Tam Teslimat Yapıldı ✓'
                : changedStopObj.durum === 'EKSIK'
                ? `Kısmi Teslimat (${changedStopObj.teslim_edilen_torba} Torba)`
                : changedStopObj.durum === 'TESLIM_EDILEMEDI'
                ? 'Sonraya Bırakıldı'
                : 'Güncellendi';

            setTimeout(() => {
              showToast({
                type: 'info',
                title: `🔄 Anlık Ekip Güncellemesi (#${changedStopObj.sira || changedStopIdx + 1}. Hane)`,
                message: `${changedStopObj.ad_soyad} hanesi ${actor} tarafından "${statusText}" olarak işlendi.`
              });

              const allRemoteDone =
                remoteStops.length > 0 &&
                remoteStops.every((s: any) => s.durum === 'TAMAMLANDI' || s.durum === 'TESLIM_EDILDI');

              if (allRemoteDone) {
                clearSavedSession();
                setIsRouteModeOpen(false);
                setRouteStatusBanner({
                  type: 'COMPLETED',
                  title: '🎉 Tüm Kayıtlar Tamamlandı!',
                  message: `"${remoteRoute.rota_adi}" rotasındaki son hane de ekip arkadaşınız tarafından tamamlandı.`
                });
                return;
              }

              // Eğer şu an ekranda açık olan durak ekip arkadaşı tarafından tamamlandıysa otomatik sıradaki bekleyen durağa geç!
              if (changedStopIdx === routeModeIndex && changedStopObj.durum === 'TAMAMLANDI') {
                const nextIdxAfter = remoteStops.findIndex(
                  (s: any, idx: number) => idx > routeModeIndex && s.durum !== 'TAMAMLANDI'
                );
                const anyIdxWaiting = remoteStops.findIndex((s: any) => s.durum !== 'TAMAMLANDI');
                const targetIdx = nextIdxAfter !== -1 ? nextIdxAfter : anyIdxWaiting;
                if (targetIdx !== -1 && targetIdx !== routeModeIndex) {
                  setRouteModeIndex(targetIdx);
                  syncRouteModeInputsForStop(remoteStops[targetIdx]);
                }
              }
            }, 0);
          }

          return prev.map((r) => (String(r.id || r._id) === String(routeId) ? remoteRoute : r));
        });
      } catch (err) {
        console.error('Heartbeat route lock error:', err);
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 4 * 1000);

    return () => clearInterval(interval);
    // activeRoute is intentionally tracked by id only: depending on the whole object would restart the heartbeat on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRouteModeOpen, activeRoute?.id, activeRoute?._id, routeModeIndex, userName, currentClientId]);

  // Sayfa açıldığında veya yenilendiğinde, yarım kalan aktif Rota Modu oturumunu otomatik geri yükle
  useEffect(() => {
    if (hasRestoredSessionRef.current || !activeRoutes || activeRoutes.length === 0) return;
    if (typeof window === 'undefined') return;

    const storageKey = `komur_active_route_session_${sessionUserKey}`;
    try {
      const raw =
        localStorage.getItem(storageKey) ||
        localStorage.getItem('komur_active_route_session_last');
      if (!raw) {
        hasRestoredSessionRef.current = true;
        return;
      }
      const savedSession = JSON.parse(raw);
      // Sadece son 24 saat içindeki oturumları geri yükle
      if (savedSession && savedSession.routeId && Date.now() - savedSession.timestamp < 24 * 60 * 60 * 1000) {
        const targetRoute = activeRoutes.find(
          (r) => String(r.id || r._id) === String(savedSession.routeId)
        );

        if (targetRoute && targetRoute.durum !== 'TAMAMLANDI' && isUserTeamAuthorized(targetRoute)) {
          hasRestoredSessionRef.current = true;
          setSelectedRouteId(String(targetRoute.id || targetRoute._id));
          const stops = targetRoute.duraklar || [];
          let stopIdx =
            typeof savedSession.routeModeIndex === 'number' &&
            stops[savedSession.routeModeIndex]
              ? savedSession.routeModeIndex
              : 0;

          // Eğer kayıtlı durak arka plana geçmeden hemen önce tamamlanmışsa, sıradaki bekleyen haneye geç
          let isRestoringSameIncompleteStop = true;
          if (stops[stopIdx]?.durum === 'TAMAMLANDI') {
            isRestoringSameIncompleteStop = false;
            const nextWaiting = stops.findIndex(
              (s: any, idx: number) => idx > stopIdx && s.durum !== 'TAMAMLANDI'
            );
            const anyWaiting = stops.findIndex((s: any) => s.durum !== 'TAMAMLANDI');
            if (nextWaiting !== -1) stopIdx = nextWaiting;
            else if (anyWaiting !== -1) stopIdx = anyWaiting;
          }

          if (savedSession.isRouteModeOpen) {
            handleOpenRouteMode(
              targetRoute,
              stopIdx,
              isRestoringSameIncompleteStop ? savedSession : undefined
            ).then(() => {
              showToast({
                type: 'info',
                title: '🔄 Rota Modu Kaldığı Yerden Devam Ediyor',
                message: `"${targetRoute.rota_adi}" teslimat ekranınız kaldığınız sıradan (#${stops[stopIdx]?.sira || stopIdx + 1}. Hane) otomatik olarak geri yüklendi.`
              });
            });
            return;
          }
        }
      }
      hasRestoredSessionRef.current = true;
    } catch (e) {
      console.error('Error restoring route session:', e);
      hasRestoredSessionRef.current = true;
    }
    // Session restore must run once per route list / user change, not whenever handleOpenRouteMode is re-created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoutes, isUserTeamAuthorized, sessionUserKey]);

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
    if (isSubmittingStopRef.current || isActionLoading) return;
    if (!activeRoute || !activeRoute.duraklar) return;
    const stops = activeRoute.duraklar;
    const currentStop = stops[routeModeIndex];
    if (!currentStop) return;

    if (!isUserTeamAuthorized(activeRoute)) {
      showAlert({
        title: '🔒 Yetkisiz Erişim / Farklı Ekip',
        message: `"${activeRoute.rota_adi}" rotası ${activeRoute.isleten_personel || activeRoute.dagitim_personeli || 'başka bir personel'} personeline ve ekibine aittir. Yalnızca ilgili personel veya tanımlı ekip arkadaşı işlem yapabilir.`,
        type: 'lock'
      });
      return;
    }

    const hedef = Number(currentStop.hedef_torba) || 34;
    let targetDurum: 'TAMAMLANDI' | 'EKSIK' | 'TESLIM_EDILEMEDI' = 'TAMAMLANDI';
    let targetTorba = hedef;
    let targetNote = routeModeNote.trim();

    if (submitKind === 'COMPLETE') {
      const prevDelivered = Number(currentStop.teslim_edilen_torba) || 0;
      const parsed = parseInt(routeModeTorba, 10);
      if (!isNaN(parsed) && parsed > 0) {
        if (parsed >= hedef) {
          targetTorba = parsed;
        } else if (prevDelivered > 0) {
          targetTorba = Math.max(hedef, prevDelivered + parsed);
        } else {
          targetTorba = hedef;
        }
      } else {
        targetTorba = hedef;
      }
      targetDurum = 'TAMAMLANDI';
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

    isSubmittingStopRef.current = true;
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

      if (data.alreadyCompletedByPartner) {
        showToast({
          type: 'info',
          title: '🔄 Ekip Arkadaşınız Az Önce Teslim Etti',
          message:
            data.message ||
            `${currentStop.sira}. Durak (${currentStop.ad_soyad}) ekip arkadaşınız tarafından teslim edildiği için mükerrer kayıt engellendi ve sıradaki durağa geçiliyor.`
        });
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
        (updatedStops.length > 0 &&
          updatedStops.every(
            (s: any) =>
              s.durum === 'TAMAMLANDI' ||
              s.durum === 'TESLIM_EDILDI' ||
              (Number(s.teslim_edilen_torba) > 0 && Number(s.teslim_edilen_torba) >= Number(s.hedef_torba || 34))
          ));

      // Case 1: All stops in the route are now TAMAMLANDI -> finalize route & exit Rota Modu!
      if (allCompleted) {
        clearSavedSession();
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
      isSubmittingStopRef.current = false;
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

    if (startInRouteMode) {
      requestAppFullscreen();
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
          action: 'CREATE_ROUTE',
          rota_adi: newRouteName.trim(),
          arac_plaka: newRoutePlate.trim(),
          olusturan_personel: userName || 'Personel',
          dagitim_personeli: newRouteStaff.trim() || userName || 'Personel',
          notlar: newRouteNote.trim(),
          beneficiary_ids: selectedBeneficiaryIds,
          client_id: currentClientId
        })
      });

      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        if (data.route && (data.route.id || data.route._id)) {
          const newRouteId = String(data.route.id || data.route._id);
          setActiveRoutes((prev) => {
            const exists = prev.some((r) => String(r.id || r._id) === newRouteId);
            return exists
              ? prev.map((r) => (String(r.id || r._id) === newRouteId ? data.route : r))
              : [data.route, ...prev];
          });
          setSelectedRouteId(newRouteId);
          if (startInRouteMode) {
            void handleOpenRouteMode(data.route, 0);
          }
        }
        await fetchRoutes(true);
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
          route_id: activeRoute.id || activeRoute._id,
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
    if (!isUserTeamAuthorized(activeRoute)) {
      showAlert({
        title: '🔒 Yetkisiz Erişim / Farklı Ekip',
        message: `"${activeRoute.rota_adi}" rotası ${activeRoute.isleten_personel || activeRoute.dagitim_personeli || 'başka bir personel'} personeline ve ekibine aittir. Yalnızca ilgili personel veya tanımlı ekip arkadaşı işlem yapabilir.`,
        type: 'lock'
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
    if (!isUserTeamAuthorized(activeRoute)) {
      showAlert({
        title: '🔒 Yetkisiz Erişim / Farklı Ekip',
        message: `"${activeRoute.rota_adi}" rotası ${activeRoute.isleten_personel || activeRoute.dagitim_personeli || 'başka bir personel'} personeline ve ekibine aittir. Yalnızca ilgili personel veya tanımlı ekip arkadaşı işlem yapabilir.`,
        type: 'lock'
      });
      return;
    }

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
          clearSavedSession();
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
        clearSavedSession();
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

              {userRole !== 'MUDUR' ? (
                <div className="pt-2 space-y-2">
                  <button
                    type="button"
                    onClick={handleOpenCreateModal}
                    className="w-full max-w-md mx-auto py-3 px-4 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all bg-amber-500 hover:bg-amber-600 bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border border-amber-600/40 shadow-sm shadow-amber-500/20 cursor-pointer active:scale-98"
                    style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)', color: '#ffffff' }}
                  >
                    <Plus className="w-5 h-5 stroke-[2.5]" />
                    <span>
                      {availableSignedBeneficiaries.length > 0
                        ? `Yeni Dağıtım Rotası Başlat (${availableSignedBeneficiaries.length} İmzalı Hane)`
                        : '+ Yeni Dağıtım Rotası Başlat'}
                    </span>
                  </button>

                  {availableSignedBeneficiaries.length === 0 && (
                    <p className="text-[11px] font-semibold text-rose-700 max-w-md mx-auto">
                      İmzası alınmış ve kömürü teslim edilmemiş hane bulunmadığı için yeni dağıtım rotası başlatılamaz.
                    </p>
                  )}
                </div>
              ) : (
                <div className="pt-2 text-xs font-semibold text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200 max-w-md mx-auto">
                  🛡️ Şu anda aktif dağıtım rotası bulunmamaktadır. Müdür yetkilisi salt okunur (izleme) modundadır.
                </div>
              )}
            </div>
          )}

          {/* ROTAYA ATANMAMIŞ İMZALI HANELER BİLDİRİM VE HIZLI İŞLEM PANELİ */}
          {availableSignedBeneficiaries.length > 0 && (
            <div className="bg-emerald-50/90 border-2 border-emerald-400 rounded-2xl p-3.5 sm:p-4 shadow-sm space-y-3 no-print">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <PenTool className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-black text-emerald-950">
                        📋 Dağıtım Bekleyen İmzalı Haneler ({availableSignedBeneficiaries.length} Hane Hazır)
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full border border-emerald-300">
                        Herhangi Bir Rotada Değil
                      </span>
                    </div>
                    <p className="text-xs text-emerald-900 font-medium mt-0.5 leading-relaxed">
                      Kapıda ıslak imzası alınan ancak henüz sahadaki hiçbir dağıtım ekibine atanmamış {availableSignedBeneficiaries.length} hane bulunmaktadır.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {userRole !== 'MUDUR' && (
                    <>
                      <button
                        type="button"
                        onClick={handleOpenCreateModal}
                        className="px-3.5 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all text-white bg-amber-500 hover:bg-amber-600 border border-amber-600/40 shadow-xs active:scale-95 cursor-pointer"
                        style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)', color: '#ffffff' }}
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>+ Yeni Rota Oluştur</span>
                      </button>

                      {activeRoutes.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleOpenAddToExistingModal()}
                          className="px-3.5 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all text-white bg-emerald-700 hover:bg-emerald-800 border border-emerald-800 shadow-xs active:scale-95 cursor-pointer"
                          style={{ background: 'linear-gradient(135deg, #059669 0%, #0f766e 100%)', color: '#ffffff' }}
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>📥 Var Olan Rotaya Ekle</span>
                        </button>
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowUnassignedList((prev) => !prev)}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <span>{showUnassignedList ? 'Listeyi Gizle' : `Haneleri Gör (${availableSignedBeneficiaries.length})`}</span>
                    {showUnassignedList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* AÇILIR LİSTE: Rotada Olmayan İmzalı Haneler Önizleme Kartları */}
              {showUnassignedList && (
                <div className="pt-2.5 border-t border-emerald-200 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                    {availableSignedBeneficiaries.map((b: any) => {
                      const stInfo = getRecordStreetInfo(b);
                      return (
                        <div
                          key={b.id || b._id}
                          className="p-2.5 rounded-xl bg-white border border-emerald-200 shadow-2xs flex flex-col justify-between gap-2"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="text-xs font-black text-slate-900 truncate">{b.ad_soyad}</span>
                              <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded border border-amber-300 shrink-0">
                                {b.hedef_torba || 34} Torba
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                              {b.mahalle ? `${b.mahalle} Mah.` : ''} {stInfo.sokak ? `${stInfo.sokak} No:${stInfo.kapiNo || ''}` : b.adres || ''}
                            </p>
                            {b.telefon && (
                              <p className="text-[10px] font-mono text-emerald-700 font-semibold mt-0.5">
                                📞 {formatPhoneDisplay(b.telefon)}
                              </p>
                            )}
                          </div>

                          {activeRoutes.length > 0 && userRole !== 'MUDUR' && (
                            <button
                              type="button"
                              onClick={() => {
                                setAddToRouteSelectedIds([String(b.id || b._id)]);
                                handleOpenAddToExistingModal();
                              }}
                              className="w-full py-1.5 rounded-lg text-[11px] font-extrabold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center justify-center gap-1 transition-all cursor-pointer"
                            >
                              <span>📥 Bir Rotaya Ekle</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ÇOKLU EKİP ROTA SEÇİCİ & YENİ ROTA EKLEME ÇUBUĞU */}
          {activeRoutes.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3 space-y-2.5 no-print">
              <div className="flex items-center justify-between gap-2.5 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-emerald-600" />
                    Sahadaki Dağıtım Ekipleri ({activeRoutes.length} Aktif Rota)
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {userRole !== 'MUDUR' && availableSignedBeneficiaries.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleOpenAddToExistingModal()}
                      className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 transition-all text-white bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 shadow-sm active:scale-95 cursor-pointer"
                      style={{ background: 'linear-gradient(135deg, #059669 0%, #0f766e 100%)', color: '#ffffff' }}
                      title="Boştaki imzalı haneleri mevcut bir rotaya ekle"
                    >
                      <Plus className="w-4 h-4 stroke-[2.5]" />
                      <span>📥 Var Olan Rotaya Ekle ({availableSignedBeneficiaries.length})</span>
                    </button>
                  )}

                  {userRole !== 'MUDUR' && (
                    <button
                      type="button"
                      onClick={handleOpenCreateModal}
                      title="Yeni dağıtım rotası / ekibi başlat"
                      className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all bg-amber-500 hover:bg-amber-600 bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border border-amber-600/40 shadow-sm shadow-amber-500/20 active:scale-95 cursor-pointer"
                      style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)', color: '#ffffff' }}
                    >
                      <Plus className="w-4 h-4 stroke-[2.5]" />
                      <span>
                        {availableSignedBeneficiaries.length > 0
                          ? `+ Yeni Ekip / Rota Başlat (${availableSignedBeneficiaries.length} İmzalı Hazır)`
                          : '+ Yeni Ekip / Rota Başlat'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* AKORDİYON AKTİF ROTALAR LİSTESİ */}
          {activeRoutes.length > 0 && (
            <div className="space-y-3">
              {activeRoutes.map((route, routeIdx) => {
                const routeIdStr = String(route.id || route._id);
                const isExpanded = expandedActiveRouteId === routeIdStr;
                return (
                  <ActiveRouteAccordionCard
                    key={routeIdStr || routeIdx}
                    route={route}
                    routeIdx={routeIdx}
                    userRole={userRole}
                    isExpanded={isExpanded}
                    onToggle={() => {
                      setExpandedActiveRouteId((prev) => (prev === routeIdStr ? null : routeIdStr));
                      setSelectedRouteId(routeIdStr);
                    }}
                    onPrint={() => setPrintRoute(route)}
                    onDelete={() => {
                      setSelectedRouteId(routeIdStr);
                      setShowDeleteConfirm(true);
                    }}
                    onFinalize={() => {
                      setSelectedRouteId(routeIdStr);
                      setShowFinalizeModal(true);
                    }}
                    onMoveStop={(index, direction) => {
                      setSelectedRouteId(routeIdStr);
                      handleMoveStop(index, direction);
                    }}
                    onOpenStopModal={(index, stop, mode) => {
                      setSelectedRouteId(routeIdStr);
                      handleOpenStopModal(index, stop, mode);
                    }}
                    onRemoveStop={(index, stop) => {
                      setSelectedRouteId(routeIdStr);
                      handleRemoveStop(index, stop);
                    }}
                    onStartRouteMode={() => handleOpenRouteMode(route)}
                    onOpenAddToRoute={() => handleOpenAddToExistingModal(routeIdStr)}
                    availableSignedCount={availableSignedBeneficiaries.length}
                  />
                );
              })}
            </div>
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
                        {formatTrDate(route.tarih)}
                      </span>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        ✓ Tamamlandı
                      </span>
                    </div>
                    <h4 className="text-sm font-black text-slate-900 mt-1 truncate">
                      {route.rota_adi}
                    </h4>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {route.kapatan_personel ? (
                        <>Teslim Eden: <strong className="text-slate-700 font-bold">{route.kapatan_personel}</strong> {route.dagitim_personeli ? `(${route.dagitim_personeli})` : ''}</>
                      ) : (
                        <>{route.dagitim_personeli}</>
                      )} • {route.toplam_hane} Hane ({route.toplam_dagitilan_torba || 0} Torba)
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
                            {(s.teslim_eden_personel || route.kapatan_personel || route.dagitim_personeli || s.teslim_alan) && (
                              <div className="text-[10px] text-slate-600 truncate mt-0.5 flex flex-wrap gap-x-2">
                                <span>Teslim Eden: <strong className="text-slate-900 font-bold">{s.teslim_eden_personel || route.kapatan_personel || route.dagitim_personeli || '-'}</strong></span>
                                {s.teslim_alan && (
                                  <span>Teslim Alan: <strong className="text-slate-900 font-bold">{s.teslim_alan}</strong></span>
                                )}
                              </div>
                            )}
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
      {/* MODÜLER ROTA MODALLARI (Oluşturma, İşlem, Tutanak, Kokpit) */}
      {/* ======================================================== */}
      <RouteCreationModals
        showAddToExistingModal={showAddToExistingModal}
        setShowAddToExistingModal={setShowAddToExistingModal}
        addToRouteTargetId={addToRouteTargetId}
        setAddToRouteTargetId={setAddToRouteTargetId}
        activeRoutes={activeRoutes}
        addToRouteSelectedIds={addToRouteSelectedIds}
        setAddToRouteSelectedIds={setAddToRouteSelectedIds}
        availableSignedBeneficiaries={availableSignedBeneficiaries}
        addToRouteSearch={addToRouteSearch}
        setAddToRouteSearch={setAddToRouteSearch}
        handleAddStopsToExistingRoute={handleAddStopsToExistingRoute}
        showCreateModal={showCreateModal}
        setShowCreateModal={setShowCreateModal}
        newRouteName={newRouteName}
        setNewRouteName={setNewRouteName}
        newRoutePlate={newRoutePlate}
        setNewRoutePlate={setNewRoutePlate}
        newRouteStaff={newRouteStaff}
        setNewRouteStaff={setNewRouteStaff}
        createModalStep={createModalStep}
        setCreateModalStep={setCreateModalStep}
        selectedBeneficiaryIds={selectedBeneficiaryIds}
        createSearchQuery={createSearchQuery}
        setCreateSearchQuery={setCreateSearchQuery}
        modalDisplayList={modalDisplayList}
        handleSelectAllInView={handleSelectAllInView}
        handleToggleBeneficiary={handleToggleBeneficiary}
        orderedCreateStops={orderedCreateStops}
        handleSortCreateStopsByAddress={handleSortCreateStopsByAddress}
        handleReverseCreateStops={handleReverseCreateStops}
        handleMoveCreateStop={handleMoveCreateStop}
        handleRemoveCreateStop={handleRemoveCreateStop}
        handleCreateRouteSubmit={handleCreateRouteSubmit}
        isActionLoading={isActionLoading}
      />

      <RouteActionModals
        showStopModal={showStopModal}
        setShowStopModal={setShowStopModal}
        stopTorbaInput={stopTorbaInput}
        setStopTorbaInput={setStopTorbaInput}
        stopRecipientInput={stopRecipientInput}
        setStopRecipientInput={setStopRecipientInput}
        stopNoteInput={stopNoteInput}
        setStopNoteInput={setStopNoteInput}
        stopDeferLaterInput={stopDeferLaterInput}
        setStopDeferLaterInput={setStopDeferLaterInput}
        handleStopActionSubmit={handleStopActionSubmit}
        showFinalizeModal={showFinalizeModal}
        setShowFinalizeModal={setShowFinalizeModal}
        activeRoute={activeRoute}
        finalizeNote={finalizeNote}
        setFinalizeNote={setFinalizeNote}
        handleFinalizeRouteSubmit={handleFinalizeRouteSubmit}
        showDeleteConfirm={showDeleteConfirm}
        setShowDeleteConfirm={setShowDeleteConfirm}
        handleDeleteRoute={handleDeleteRoute}
        cancelStopTarget={cancelStopTarget}
        setCancelStopTarget={setCancelStopTarget}
        userName={userName}
        handleCancelStopSuccess={handleCancelStopSuccess}
        isActionLoading={isActionLoading}
      />

      <RoutePrintReportModal
        printRoute={printRoute}
        routeStaffList={routeStaffList}
        onClose={() => setPrintRoute(null)}
      />

      <RouteModeCockpitModal
        isRouteModeOpen={isRouteModeOpen}
        activeRoute={activeRoute}
        routeModeIndex={routeModeIndex}
        setRouteModeIndex={setRouteModeIndex}
        routeModeTab={routeModeTab}
        setRouteModeTab={setRouteModeTab}
        routeModeDeferType={routeModeDeferType}
        setRouteModeDeferType={setRouteModeDeferType}
        routeModeTorba={routeModeTorba}
        setRouteModeTorba={setRouteModeTorba}
        routeModeRecipient={routeModeRecipient}
        setRouteModeRecipient={setRouteModeRecipient}
        routeModeNote={routeModeNote}
        setRouteModeNote={setRouteModeNote}
        routeModePausedNotice={routeModePausedNotice}
        setRouteModePausedNotice={setRouteModePausedNotice}
        showStopPickerModal={showStopPickerModal}
        setShowStopPickerModal={setShowStopPickerModal}
        stopPickerSearch={stopPickerSearch}
        setStopPickerSearch={setStopPickerSearch}
        stopPickerFilter={stopPickerFilter}
        setStopPickerFilter={setStopPickerFilter}
        isTeammateRoute={isTeammateRoute}
        isActionLoading={isActionLoading}
        syncRouteModeInputsForStop={syncRouteModeInputsForStop}
        handlePauseRouteAndExit={handlePauseRouteAndExit}
        handleSignInRouteMode={handleSignInRouteMode}
        handleRouteModeSubmit={handleRouteModeSubmit}
        handleSkipCurrentStop={handleSkipCurrentStop}
        setCancelStopTarget={setCancelStopTarget}
      />
    </div>
  );
}
