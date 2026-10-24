'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Header from '@/components/Header';
import BottomNav, { NavTab } from '@/components/BottomNav';
import BeneficiaryList from '@/components/BeneficiaryList';
import DeliveryArchive from '@/components/DeliveryArchive';
import TonnagePage from '@/components/TonnagePage';
import ExcelImportPage from '@/components/ExcelImportPage';
import AnalyticsPage from '@/components/AnalyticsPage';
import MorningAlertBanner from '@/components/MorningAlertBanner';
import DeliveryModal from '@/components/DeliveryModal';
import CancelModal from '@/components/CancelModal';
import HouseholdModal from '@/components/HouseholdModal';
import QuotaModal from '@/components/QuotaModal';
import LoginPage from '@/components/LoginPage';
import PersonnelManagementModal from '@/components/PersonnelManagementModal';
import DeviceManagementModal from '@/components/DeviceManagementModal';
import AuditLogsModal from '@/components/AuditLogsModal';
import ShiftPage from '@/components/ShiftPage';
import RoutePage from '@/components/RoutePage';
import AdminAuthModal from '@/components/AdminAuthModal';
import EditBeneficiaryModal from '@/components/EditBeneficiaryModal';
import KomurIptalModal from '@/components/KomurIptalModal';
import SeasonManagementModal from '@/components/SeasonManagementModal';
import GuidePage from '@/components/GuidePage';
import SingleHouseholdAddPage from '@/components/SingleHouseholdAddPage';
import { getPendingOfflineCount, syncOfflineDeliveries } from '@/lib/offlineSync';
import { signatureQueue } from '@/lib/signatureQueue';
import { getSecureItem, setSecureItem, removeSecureItem, migrateSensitiveStorageKeys } from '@/lib/secureStorage';

export default function Home() {
  const [currentTab, setCurrentTab] = useState<NavTab>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('komur_active_tab') as NavTab | null;
        if (saved && ['search', 'add_household', 'route', 'shift', 'analytics', 'archive', 'tonnage', 'import', 'guide'].includes(saved)) {
          return saved;
        }
      } catch (e) {}
    }
    return 'search';
  });
  const [addHouseholdInitialQuery, setAddHouseholdInitialQuery] = useState<string>('');
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<'ADMIN' | 'PERSONEL'>('PERSONEL');
  const [userName, setUserName] = useState<string>('Saha Personeli');
  const [userUsername, setUserUsername] = useState<string>('');
  const [userTeam, setUserTeam] = useState<string>('');
  const [userPartners, setUserPartners] = useState<string[]>([]);
  const [activeRouteStopsCount, setActiveRouteStopsCount] = useState<number>(0);

  // Persist active tab across browser reloads, screen locks, and app switching
  useEffect(() => {
    if (typeof window !== 'undefined' && currentTab) {
      try {
        localStorage.setItem('komur_active_tab', currentTab);
      } catch (e) {}
    }
  }, [currentTab]);

  // Offline Sync & Network States
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncingOffline, setIsSyncingOffline] = useState<boolean>(false);
  const lastKnownSyncRef = useRef<string>('');

  // Quota & Personnel & Audit Log & Season modals state
  const [defaultQuota, setDefaultQuota] = useState<number>(34);
  const [showQuotaModal, setShowQuotaModal] = useState<boolean>(false);
  const [showPersonnelModal, setShowPersonnelModal] = useState<boolean>(false);
  const [showDeviceModal, setShowDeviceModal] = useState<boolean>(false);
  const [showAuditLogsModal, setShowAuditLogsModal] = useState<boolean>(false);
  const [showAdminAuthModal, setShowAdminAuthModal] = useState<boolean>(false);
  const [showSeasonModal, setShowSeasonModal] = useState<boolean>(false);
  const [activeSeasonCode, setActiveSeasonCode] = useState<string>('2026-2027');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedMahalleler, setSelectedMahalleler] = useState<string[]>([]);
  const [selectedQueueTab, setSelectedQueueTab] = useState<'PENDING_AND_PARTIAL' | 'DELIVERED' | 'EXCLUDED' | 'ALL'>('PENDING_AND_PARTIAL');
  const [selectedDurumFilter, setSelectedDurumFilter] = useState<string>('HEPSI');

  // Debounce search query to prevent input stutter and out-of-order race conditions
  useEffect(() => {
    if (!searchQuery) {
      setDebouncedSearchQuery('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Data states
  const [beneficiaries, setBeneficiaries] = useState<any[]>([]);
  const [mahalleler, setMahalleler] = useState<any[]>([]);
  const [eksikHaneler, setEksikHaneler] = useState<any[]>([]);
  const [isLoadingBeneficiaries, setIsLoadingBeneficiaries] = useState(false);

  // Delivery Archive state
  const [archiveGroupedDays, setArchiveGroupedDays] = useState<any[]>([]);
  const [archiveAllRecords, setArchiveAllRecords] = useState<any[]>([]);
  const [archiveStats, setArchiveStats] = useState<any>(null);

  // Trucks state
  const [trucks, setTrucks] = useState<any[]>([]);
  const [truckStats, setTruckStats] = useState<any>(null);

  // Overall Stats
  const [overallStats, setOverallStats] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals state
  const [deliveryTarget, setDeliveryTarget] = useState<any | null>(null);
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [householdTarget, setHouseholdTarget] = useState<any | null>(null);
  const [householdMembers, setHouseholdMembers] = useState<any[]>([]);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [komurIptalTarget, setKomurIptalTarget] = useState<any | null>(null);

  const [sessionTerminatedReason, setSessionTerminatedReason] = useState<string | null>(null);

  const handleLogout = useCallback((reason?: string) => {
    if (reason) {
      setSessionTerminatedReason(reason);
    }
    const savedUsername = typeof window !== 'undefined' ? (getSecureItem('komur_username') || localStorage.getItem('komur_username') || '') : '';
    const savedToken = typeof window !== 'undefined' ? (getSecureItem('komur_session_token') || localStorage.getItem('komur_session_token') || '') : '';

    // If manual logout, clear active session on server
    if (!reason && savedUsername && savedToken) {
      try {
        fetch('/api/auth', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-token': savedToken,
          },
          body: JSON.stringify({
            action: 'logout',
            username: savedUsername,
            session_token: savedToken,
          }),
        }).catch(() => {});
      } catch (e) {
        // ignore
      }
    }

    setIsLoggedIn(false);
    setUserUsername('');
    setUserTeam('');
    setUserPartners([]);
    if (typeof window !== 'undefined') {
      removeSecureItem('komur_logged_in');
      removeSecureItem('komur_login_time');
      removeSecureItem('komur_user_role');
      removeSecureItem('komur_user_name');
      removeSecureItem('komur_username');
      removeSecureItem('komur_user_team');
      removeSecureItem('komur_user_partners');
      removeSecureItem('komur_session_token');
      localStorage.removeItem('komur_active_tab');
      try {
        sessionStorage.removeItem('komur_beneficiaries_cache');
      } catch (e) {
        // ignore
      }
    }
    // Clear data from memory for security
    beneficiariesMemoryCacheRef.current = null;
    setBeneficiaries([]);
    setEksikHaneler([]);
    setArchiveAllRecords([]);
    setArchiveGroupedDays([]);
    setTrucks([]);
    setOverallStats(null);
  }, []);

  // Single Device & 6h TTL Session Heartbeat & Verification
  const checkActiveSession = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const savedLogin = getSecureItem('komur_logged_in') || localStorage.getItem('komur_logged_in');
    const savedUsername = getSecureItem('komur_username') || localStorage.getItem('komur_username');
    const savedToken = getSecureItem('komur_session_token') || localStorage.getItem('komur_session_token');

    if (savedLogin !== 'true') return;

    if (!savedUsername || !savedToken) {
      handleLogout('Oturum güvenlik anahtarı bulunamadı. Lütfen tekrar giriş yapınız.');
      return;
    }

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': savedToken,
        },
        body: JSON.stringify({
          action: 'verify',
          username: savedUsername,
          session_token: savedToken,
        }),
      });

      const data = await res.json();
      if (!data.success || !data.valid) {
        if (
          data.code === 'SESSION_TERMINATED' ||
          data.code === 'SESSION_EXPIRED' ||
          data.code === 'USER_NOT_FOUND' ||
          res.status === 401
        ) {
          handleLogout(
            data.error ||
              'Bu kullanıcı adı ile başka bir cihazdan oturum açıldı veya 6 saatlik oturum süreniz doldu!'
          );
        }
      } else if (data.user) {
        if (data.user.username) {
          setUserUsername(data.user.username);
        }
        const effectiveName = data.user.ad_soyad || data.user.name;
        if (effectiveName) {
          setUserName(effectiveName);
          setSecureItem('komur_user_name', effectiveName);
        }
        if (data.user.ekip_adi !== undefined) {
          setUserTeam(data.user.ekip_adi || '');
          setSecureItem('komur_user_team', data.user.ekip_adi || '');
        }
        if (data.user.ekip_arkadaslari) {
          setUserPartners(data.user.ekip_arkadaslari || []);
          setSecureItem('komur_user_partners', JSON.stringify(data.user.ekip_arkadaslari || []));
        }
      }
    } catch (err) {
      // network offline - preserve offline capability
    }
  }, [handleLogout]);

  // 30-minute inactivity auto-logout (KVKK / security requirement for official state systems)
  useEffect(() => {
    if (!isLoggedIn) return;

    const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout('30 dakika boyunca işlem yapılmadığı için oturumunuz güvenlik nedeniyle otomatik olarak kapatıldı.');
      }, INACTIVITY_TIMEOUT_MS);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [isLoggedIn, handleLogout]);

  // Load user role & session from localStorage on initial mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      migrateSensitiveStorageKeys();
      const savedLogin = getSecureItem('komur_logged_in');
      const savedLoginTime = getSecureItem('komur_login_time');
      const savedRole = getSecureItem('komur_user_role') as 'ADMIN' | 'PERSONEL' | null;
      const savedName = getSecureItem('komur_user_name');
      const savedUsername = getSecureItem('komur_username');
      const savedToken = getSecureItem('komur_session_token');
      const savedTeam = getSecureItem('komur_user_team') || '';
      let savedPartners: string[] = [];
      try {
        const parsed = JSON.parse(getSecureItem('komur_user_partners') || '[]');
        if (Array.isArray(parsed)) savedPartners = parsed;
      } catch (e) {}

      // Fast client-side session timeout check (6 hours = 6 * 60 * 60 * 1000 ms)
      const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
      if (savedLoginTime && !isNaN(Number(savedLoginTime))) {
        const elapsed = Date.now() - Number(savedLoginTime);
        if (elapsed > SIX_HOURS_MS) {
          handleLogout('Kurumsal güvenlik politikası gereği 6 saatlik oturum süreniz dolmuştur. Lütfen tekrar giriş yapınız.');
          setIsAuthChecking(false);
          return;
        }
      }

      if (savedLogin === 'true' && savedRole && savedName && savedToken) {
        setIsLoggedIn(true);
        setUserRole(savedRole);
        const resolvedName = (savedRole === 'ADMIN' && (!savedName || savedName === 'Sistem Yöneticisi')) ? 'Gökhan SUÇSUZ' : savedName;
        setUserName(resolvedName);
        if (resolvedName !== savedName) {
          setSecureItem('komur_user_name', resolvedName);
        }
        if (savedUsername) setUserUsername(savedUsername);
        setUserTeam(savedTeam);
        setUserPartners(savedPartners);
        // Verify session validity on initial load
        checkActiveSession();
      } else {
        setIsLoggedIn(false);
      }
      setIsAuthChecking(false);
    }
  }, [checkActiveSession, handleLogout]);

  // Heartbeat timer & mobile foreground resume listener for single device session checking
  useEffect(() => {
    if (!isLoggedIn) return;

    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      checkActiveSession();
    }, 30000); // Check every 30 seconds when screen is active

    const handleWindowFocus = () => {
      checkActiveSession();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkActiveSession();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLoggedIn, checkActiveSession]);

  const handleLoginSuccess = (user: {
    role: 'ADMIN' | 'PERSONEL';
    name: string;
    username: string;
    session_token?: string;
    ekip_adi?: string;
    ekip_arkadaslari?: string[];
    ekip_arkadasi?: string;
  }) => {
    setUserRole(user.role);
    setUserName(user.name);
    setUserUsername(user.username);
    setUserTeam(user.ekip_adi || '');
    setUserPartners(user.ekip_arkadaslari || []);
    setIsLoggedIn(true);
    setSessionTerminatedReason(null);
    setSecureItem('komur_logged_in', 'true');
    setSecureItem('komur_login_time', Date.now().toString());
    setSecureItem('komur_user_role', user.role);
    setSecureItem('komur_user_name', user.name);
    setSecureItem('komur_username', user.username);
    setSecureItem('komur_user_team', user.ekip_adi || '');
    setSecureItem('komur_user_partners', JSON.stringify(user.ekip_arkadaslari || []));
    if (user.session_token) {
      setSecureItem('komur_session_token', user.session_token);
    }
  };

  const handleUserUpdated = (updatedUser: { name: string; username: string }) => {
    setUserName(updatedUser.name);
  };

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        if (data.settings?.varsayilan_hedef_torba) {
          setDefaultQuota(data.settings.varsayilan_hedef_torba);
        }
        if (data.settings?.aktif_donem?.kod) {
          setActiveSeasonCode(data.settings.aktif_donem.kod);
        }
      }
    } catch (e) {
      console.error('Error fetching settings:', e);
    }
  }, []);

  const beneficiariesMemoryCacheRef = useRef<{
    data: any[];
    mahalleler: any[];
    eksikHaneler: any[];
  } | null>(null);

  const handleRoleChange = (role: 'ADMIN' | 'PERSONEL', name: string, username?: string, sessionToken?: string) => {
    setUserRole(role);
    setUserName(name);
    setSecureItem('komur_user_role', role);
    setSecureItem('komur_user_name', name);
    if (username) {
      setSecureItem('komur_username', username);
    }
    if (sessionToken) {
      setSecureItem('komur_session_token', sessionToken);
    }
  };

  // Fetch beneficiaries with volatile in-memory caching (KVKK: never store plaintext PII in browser sessionStorage/localStorage)
  const fetchBeneficiaries = useCallback(async (force: boolean = false) => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('komur_beneficiaries_cache');
      } catch (e) {
        // ignore
      }
    }

    if (!force && beneficiariesMemoryCacheRef.current && beneficiariesMemoryCacheRef.current.data.length > 0) {
      setBeneficiaries(beneficiariesMemoryCacheRef.current.data);
      setMahalleler(beneficiariesMemoryCacheRef.current.mahalleler || []);
      setEksikHaneler(beneficiariesMemoryCacheRef.current.eksikHaneler || []);
      setIsLoadingBeneficiaries(false);
      return;
    }

    // Only trigger full loading spinner when there are no records in memory
    setBeneficiaries((current) => {
      if (current.length === 0) {
        setIsLoadingBeneficiaries(true);
      }
      return current;
    });

    try {
      const params = new URLSearchParams({
        durum: 'HEPSI',
        limit: '0'
      });
      const res = await fetch(`/api/beneficiaries?${params.toString()}`);
      if (res.status === 401) {
        const errData = await res.json().catch(() => ({}));
        handleLogout(errData.error || 'Kurumsal güvenlik politikası gereği 6 saatlik oturum süreniz dolmuştur. Lütfen tekrar giriş yapınız.');
        return;
      }
      const data = await res.json();
      if (data.success) {
        const records = data.data || [];
        const mList = data.mahalleler || [];
        const eksikList = data.eksikHaneler || [];
        setBeneficiaries(records);
        setMahalleler(mList);
        setEksikHaneler(eksikList);

        beneficiariesMemoryCacheRef.current = {
          data: records,
          mahalleler: mList,
          eksikHaneler: eksikList,
        };
      }
    } catch (err) {
      console.error('Error fetching beneficiaries:', err);
    } finally {
      setIsLoadingBeneficiaries(false);
    }
  }, []);

  // Fetch Delivery History only when authenticated
  const fetchArchive = useCallback(async () => {
    try {
      const res = await fetch('/api/delivery/history');
      const data = await res.json();
      if (data.success) {
        setArchiveGroupedDays(data.groupedDays || []);
        setArchiveAllRecords(data.records || []);
        setArchiveStats(data.stats || null);
      }
    } catch (err) {
      console.error('Error fetching archive:', err);
    }
  }, []);

  // Fetch Trucks only when authenticated
  const fetchTrucks = useCallback(async () => {
    try {
      const res = await fetch('/api/trucks');
      const data = await res.json();
      if (data.success) {
        setTrucks(data.trucks || []);
        setTruckStats(data.stats || null);
      }
    } catch (err) {
      console.error('Error fetching trucks:', err);
    }
  }, []);

  // Fetch Overall Stats only when authenticated
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success) {
        setOverallStats(data.stats || null);
        if (data.stats?.varsayilanHedefTorba) {
          setDefaultQuota(data.stats.varsayilanHedefTorba);
        }
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, []);

  // Fetch Active Route pending stops count for navbar badge
  const fetchActiveRouteCount = useCallback(async () => {
    try {
      const res = await fetch('/api/routes');
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.activeRoutes) && data.activeRoutes.length > 0) {
          let totalPending = 0;
          data.activeRoutes.forEach((r: any) => {
            totalPending += (r.duraklar || []).filter((s: any) => !s.durum || s.durum === 'BEKLIYOR').length;
          });
          setActiveRouteStopsCount(totalPending);
        } else if (data.activeRoute) {
          const pending = (data.activeRoute.duraklar || []).filter(
            (s: any) => !s.durum || s.durum === 'BEKLIYOR'
          ).length;
          setActiveRouteStopsCount(pending);
        } else {
          setActiveRouteStopsCount(0);
        }
      } else {
        setActiveRouteStopsCount(0);
      }
    } catch (e) {
      console.error('Error fetching route count:', e);
    }
  }, []);

  // Refresh all data
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchBeneficiaries(true), // Force reload from server
      fetchArchive(),
      fetchTrucks(),
      fetchStats(),
      fetchSettings(),
      fetchActiveRouteCount()
    ]);
    setIsRefreshing(false);
  };

  // Only trigger data fetching if user is logged in
  useEffect(() => {
    if (isLoggedIn) {
      fetchSettings();
      fetchBeneficiaries();
      fetchArchive();
      fetchTrucks();
      fetchStats();
      fetchActiveRouteCount();
    }
  }, [isLoggedIn, fetchSettings, fetchBeneficiaries, fetchArchive, fetchTrucks, fetchStats, fetchActiveRouteCount]);

  // Check online status and pending offline queue
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      setPendingSyncCount(getPendingOfflineCount());

      const handleOnline = () => {
        setIsOnline(true);
        handleSyncOfflineQueue();
      };

      const handleOffline = () => {
        setIsOnline(false);
      };

      const handleQueueChanged = () => {
        setPendingSyncCount(getPendingOfflineCount());
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      window.addEventListener('komur_offline_queue_changed', handleQueueChanged);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('komur_offline_queue_changed', handleQueueChanged);
      };
    }
  }, []);

  // Sync offline queue handler
  const handleSyncOfflineQueue = async () => {
    if (typeof window === 'undefined' || !navigator.onLine) return;
    const pending = getPendingOfflineCount();
    if (pending === 0) return;

    setIsSyncingOffline(true);
    try {
      const result = await syncOfflineDeliveries();
      setPendingSyncCount(getPendingOfflineCount());
      if (result.synced > 0 || result.conflicts > 0) {
        handleRefreshAll();
      }
    } catch (e) {
      console.error('Offline queue sync error:', e);
    } finally {
      setIsSyncingOffline(false);
    }
  };

  // Real-time synchronization polling:
  // Polls /api/sync/status every 9 seconds and immediately upon window focus/visibilitychange
  useEffect(() => {
    if (!isLoggedIn) return;

    const checkSyncStatus = async () => {
      if (typeof window !== 'undefined') {
        if (!navigator.onLine || document.visibilityState === 'hidden') return;
      }
      try {
        const res = await fetch('/api/sync/status');
        const data = await res.json();
        if (data.success && data.lastSyncTime) {
          if (!lastKnownSyncRef.current) {
            lastKnownSyncRef.current = data.lastSyncTime;
          } else if (data.lastSyncTime !== lastKnownSyncRef.current) {
            // New delivery or update occurred across field staff!
            lastKnownSyncRef.current = data.lastSyncTime;
            fetchBeneficiaries(true);
            fetchArchive();
            fetchStats();
            fetchActiveRouteCount();
          }
        }
      } catch (err) {
        // Blip or offline
      }
    };

    checkSyncStatus();
    const interval = setInterval(checkSyncStatus, 10000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkSyncStatus();
      }
    };
    window.addEventListener('focus', checkSyncStatus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkSyncStatus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isLoggedIn, fetchBeneficiaries, fetchArchive, fetchStats, fetchActiveRouteCount]);

  // Tab protection: Non-admin can never view 'analytics' or 'import' tabs (Archive is open to all users)
  useEffect(() => {
    const adminOnlyTabs: NavTab[] = ['analytics', 'import'];
    if (userRole !== 'ADMIN' && adminOnlyTabs.includes(currentTab)) {
      setCurrentTab('search');
    }
  }, [userRole, currentTab]);

  // Handle opening Household Modal
  const handleOpenHousehold = async (person: any) => {
    setHouseholdTarget(person);
    setHouseholdMembers([]);

    try {
      const res = await fetch(`/api/beneficiaries?targetTc=${person.tc_no}`);
      const data = await res.json();
      if (data.success && data.householdMembers) {
        setHouseholdMembers(data.householdMembers);
      }
    } catch (err) {
      console.error('Error loading household members:', err);
    }
  };

  // Delivery completed handler
  const handleDeliverySuccess = (updatedBeneficiary: any) => {
    setDeliveryTarget(null);
    handleRefreshAll();
  };

  // Cancellation completed handler
  const handleCancelSuccess = (updatedBeneficiary: any) => {
    setCancelTarget(null);
    handleRefreshAll();
  };

  // ========================================================
  // SIGNATURE QUEUE & LOCAL IN-MEMORY CACHE SYNC
  // Sıfır veritabanı tam yeniden yüklemesi, sıfır kota harcaması
  // ========================================================
  useEffect(() => {
    signatureQueue.setCallbacks(
      // 1. Optimistic Update: Ekranı ve sessionStorage'ı anında yerinde güncelle (0ms)
      (item) => {
        const formattedDate = new Date().toLocaleString('tr-TR');
        setBeneficiaries((prev) => {
          const updated = prev.map((p) => {
            if (String(p.id) === item.beneficiary_id) {
              return {
                ...p,
                imza_durumu: item.imza_durumu,
                imza_tarihi: item.imza_durumu === 'IMZALANDI' ? formattedDate : null,
                imza_alan_personel: item.imza_durumu === 'IMZALANDI' ? (item.imza_alan_personel || userName) : null
              };
            }
            return p;
          });

          // RAM önbelleğini güncelle (KVKK uyumu: sessionStorage'a açık metin PII yazılmaz)
          beneficiariesMemoryCacheRef.current = {
            data: updated,
            mahalleler,
            eksikHaneler
          };
          return updated;
        });

        // Morning Alert Banner için eksik haneleri de yerinde güncelle
        setEksikHaneler((prev) =>
          prev.map((h) => {
            if (String(h.id) === item.beneficiary_id) {
              return {
                ...h,
                imza_durumu: item.imza_durumu,
                imza_tarihi: item.imza_durumu === 'IMZALANDI' ? formattedDate : null
              };
            }
            return h;
          })
        );
      },
      // 2. Sync Time Callback: Sunucudan dönen zaman damgasını kaydet, böylece polling bu işlemi kendi işlemimiz olarak tanır ve TÜM LİSTEYİ TEKRAR ÇEKMEZ!
      (syncTime) => {
        lastKnownSyncRef.current = syncTime;
      },
      // 3. Error Callback: Hata durumunda güvenli geri alma (rollback)
      (failedItem, err) => {
        console.error('İmza kuyruğu hatası, işlem geri alınıyor:', err);
        setBeneficiaries((prev) =>
          prev.map((p) => {
            if (String(p.id) === failedItem.beneficiary_id) {
              return {
                ...p,
                imza_durumu: failedItem.previousState || 'BEKLIYOR'
              };
            }
            return p;
          })
        );
      }
    );
  }, [mahalleler, eksikHaneler, userName]);

  // Toplu imza (Bulk Sign) işlemlerinde önbellek senkronizasyonu
  useEffect(() => {
    const handleBulkSigned = (e: any) => {
      const { ids = [], syncTime } = e.detail || {};
      if (syncTime) {
        lastKnownSyncRef.current = syncTime;
      }
      if (Array.isArray(ids) && ids.length > 0) {
        const idSet = new Set(ids.map(String));
        const formattedDate = new Date().toLocaleString('tr-TR');
        setBeneficiaries((prev) => {
          const updated = prev.map((p) => {
            if (idSet.has(String(p.id))) {
              return {
                ...p,
                imza_durumu: 'IMZALANDI',
                imza_tarihi: formattedDate,
                imza_alan_personel: userName || 'İmza Ekibi'
              };
            }
            return p;
          });
          beneficiariesMemoryCacheRef.current = {
            data: updated,
            mahalleler,
            eksikHaneler
          };
          return updated;
        });

        setEksikHaneler((prev) =>
          prev.map((h) => {
            if (idSet.has(String(h.id))) {
              return {
                ...h,
                imza_durumu: 'IMZALANDI',
                imza_tarihi: formattedDate
              };
            }
            return h;
          })
        );
      }
    };

    window.addEventListener('komur_bulk_signed', handleBulkSigned);
    return () => {
      window.removeEventListener('komur_bulk_signed', handleBulkSigned);
    };
  }, [mahalleler, eksikHaneler, userName]);

  // Tekil imza butonuna tıklandığında çalışan kuyruklayıcı
  const handleToggleSignature = useCallback((person: any) => {
    const personId = String(person.id);
    const isSigned = person.imza_durumu === 'IMZALANDI';
    const nextSigned = !isSigned;

    signatureQueue.enqueue({
      beneficiary_id: personId,
      imza_durumu: nextSigned ? 'IMZALANDI' : 'BEKLIYOR',
      imza_alan_personel: userName || 'İmza Ekibi',
      previousState: isSigned ? 'IMZALANDI' : 'BEKLIYOR'
    });
  }, [userName]);

  // 1. Initial Auth Checking Screen (prevents flash of content)
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-bold text-slate-600">Güvenli Oturum Kontrol Ediliyor...</p>
      </div>
    );
  }

  // 2. Unauthenticated Gate: Show ONLY Login Page (No system info leaks!)
  if (!isLoggedIn) {
    return (
      <LoginPage 
        onLoginSuccess={handleLoginSuccess} 
        sessionTerminatedReason={sessionTerminatedReason} 
      />
    );
  }

  // 3. Authenticated: Render the Main Application
  return (
    <main className="min-h-screen bg-[var(--bg-app)] text-slate-900 selection:bg-amber-500 selection:text-white">
      {/* Top Header */}
      <Header
        userRole={userRole}
        userName={userName}
        defaultQuota={defaultQuota}
        currentTab={currentTab}
        onTabChange={(tab) => {
          if (tab === 'import' && userRole !== 'ADMIN') {
            setShowAdminAuthModal(true);
            return;
          }
          setCurrentTab(tab);
        }}
        incompleteDeliveriesCount={eksikHaneler.length}
        importErrorsCount={overallStats?.toplamHataSayisi}
        activeRouteStopsCount={activeRouteStopsCount}
        pendingSyncCount={pendingSyncCount}
        onTriggerSync={handleSyncOfflineQueue}
        isOnline={isOnline}
        onOpenQuotaModal={() => setShowQuotaModal(true)}
        onOpenPersonnelModal={() => setShowPersonnelModal(true)}
        onOpenDeviceModal={() => setShowDeviceModal(true)}
        onOpenAuditLogs={() => setShowAuditLogsModal(true)}
        onOpenSeasonModal={() => setShowSeasonModal(true)}
        activeSeasonCode={activeSeasonCode}
        onLogout={() => handleLogout()}
        onUserUpdated={handleUserUpdated}
        onRefresh={handleRefreshAll}
        isRefreshing={isRefreshing || isSyncingOffline}
      />

      {/* Main Container */}
      <div className="app-container">
        {/* Tab 1: Sorgu & Dağıtım Listesi */}
        {currentTab === 'search' && (
          <>
            {/* MORNING ALERT BANNER - Arama yaparken sahada ekranı sade tutmak için gizlenir */}
            {!searchQuery.trim() && (
              <MorningAlertBanner
                eksikHaneler={eksikHaneler}
                onCompleteHousehold={(person) => setDeliveryTarget(person)}
              />
            )}

            <BeneficiaryList
              records={beneficiaries}
              mahalleler={mahalleler}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedMahalleler={selectedMahalleler}
              onMahallelerChange={setSelectedMahalleler}
              selectedQueueTab={selectedQueueTab}
              onQueueTabChange={setSelectedQueueTab}
              selectedDurumFilter={selectedDurumFilter}
              onDurumFilterChange={setSelectedDurumFilter}
              onOpenDelivery={(person) => setDeliveryTarget(person)}
              onOpenHousehold={handleOpenHousehold}
              onOpenCancel={(person) => setCancelTarget(person)}
              onOpenEdit={(person) => setEditTarget(person)}
              onOpenKomurIptal={(person) => setKomurIptalTarget(person)}
              onToggleSignature={handleToggleSignature}
              onNavigateToRoute={() => setCurrentTab('route')}
              onOpenAddHousehold={(initialQuery) => {
                setAddHouseholdInitialQuery(initialQuery || '');
                setCurrentTab('add_household');
              }}
              defaultQuota={defaultQuota}
              isLoading={isLoadingBeneficiaries}
            />
          </>
        )}

        {/* Tab: Saha Tek Hane Kömür Ekleme (Hem Saha Personeli Hem Yönetici) */}
        {currentTab === 'add_household' && (
          <SingleHouseholdAddPage
            records={beneficiaries}
            mahalleler={mahalleler}
            userRole={userRole}
            userName={userName}
            defaultQuota={defaultQuota}
            initialTcOrName={addHouseholdInitialQuery}
            onClearInitialQuery={() => setAddHouseholdInitialQuery('')}
            onSuccess={(createdBeneficiary) => {
              if (createdBeneficiary) {
                setBeneficiaries((prev) => {
                  const exists = prev.some(
                    (p) => String(p.id) === String(createdBeneficiary.id) || p.tc_no === createdBeneficiary.tc_no
                  );
                  const next = exists ? prev : [createdBeneficiary, ...prev];
                  beneficiariesMemoryCacheRef.current = {
                    data: next,
                    mahalleler,
                    eksikHaneler,
                  };
                  return next;
                });
              }
              handleRefreshAll();
            }}
            onOpenDelivery={(person) => setDeliveryTarget(person)}
            onNavigateToSearch={(query) => {
              if (query !== undefined) {
                setSearchQuery(query);
              }
              setCurrentTab('search');
            }}
          />
        )}

        {/* Tab: Dağıtım Rotası & İmza Takibi */}
        {currentTab === 'route' && (
          <RoutePage
            userRole={userRole}
            userName={userName}
            userUsername={userUsername}
            userTeam={userTeam}
            userPartners={userPartners}
            eksikHaneler={eksikHaneler}
            onCompleteHousehold={(person) => setDeliveryTarget(person)}
            onRefreshAll={handleRefreshAll}
            onNavigateToSearch={() => setCurrentTab('search')}
          />
        )}

        {/* Tab: Günlük Çalışma Saati Girişi (Aynı Gün veya Geriye Dönük) */}
        {currentTab === 'shift' && (
          <ShiftPage
            userRole={userRole}
            userName={userName}
            onRefreshAll={handleRefreshAll}
          />
        )}

        {/* Tab 2: İstatistik & Resmi PDF Raporlama (Sadece Yönetici) */}
        {currentTab === 'analytics' && userRole === 'ADMIN' && (
          <AnalyticsPage
            userRole={userRole}
            onOpenQuotaModal={() => setShowQuotaModal(true)}
            onOpenSeasonModal={() => setShowSeasonModal(true)}
            onRefreshAll={handleRefreshAll}
          />
        )}

        {/* Tab 3: Teslimat Arşivi & İptal Edilenler (Tüm Kullanıcılar) */}
        {currentTab === 'archive' && (
          <DeliveryArchive
            groupedDays={archiveGroupedDays}
            allRecords={archiveAllRecords}
            stats={archiveStats}
            onOpenCancel={(record) => setCancelTarget(record)}
          />
        )}

        {/* Tab 4: Kömür Tonaj Sayfası (Tır Yönetimi) */}
        {currentTab === 'tonnage' && (
          <TonnagePage
            trucks={trucks}
            stats={truckStats}
            onRefresh={fetchTrucks}
            userRole={userRole}
          />
        )}

        {/* Tab 5: Excel Yükleme & Yükleme Sonuçları (Sadece Yönetici) */}
        {currentTab === 'import' && userRole === 'ADMIN' && (
          <ExcelImportPage
            userRole={userRole}
            onSwitchToAdmin={() => setShowAdminAuthModal(true)}
            onRefreshAll={handleRefreshAll}
          />
        )}

        {/* Tab 6: Resmi Kullanım Kılavuzu & Yardım */}
        {currentTab === 'guide' && (
          <GuidePage
            userRole={userRole}
            onNavigateTab={(tab) => setCurrentTab(tab)}
          />
        )}

        {/* Official Institutional Footer */}
        <footer className="mt-8 mb-20 text-center text-xs text-slate-500 py-4 border-t border-slate-200/80 space-y-1 no-print">
          <div className="flex items-center justify-center gap-2">
            <img
              src="/edirne-sydv-logo.png"
              alt="Edirne SYDV Logo"
              width={20}
              height={20}
              className="footer-logo-img"
              style={{ width: '20px', height: '20px', minWidth: '20px', minHeight: '20px', objectFit: 'contain' }}
            />
            <span className="font-extrabold text-slate-700">
              Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            T.C. Edirne Valiliği • Kömür Dağıtım ve Sorgulama Sistemi
          </p>
        </footer>
      </div>

      {/* Mobile Sticky Bottom Navigation */}
      <BottomNav
        currentTab={currentTab}
        onTabChange={(tab) => {
          if (tab === 'import' && userRole !== 'ADMIN') {
            setShowAdminAuthModal(true);
            return;
          }
          setCurrentTab(tab);
        }}
        userRole={userRole}
        incompleteDeliveriesCount={eksikHaneler.length}
        importErrorsCount={overallStats?.toplamHataSayisi}
        activeRouteStopsCount={activeRouteStopsCount}
      />

      {/* MODALS */}

      {/* 1. Kömür Teslimatı Yap / Tamamla Modal */}
      {deliveryTarget && (
        <DeliveryModal
          beneficiary={deliveryTarget}
          currentStaff={userName}
          defaultQuota={defaultQuota}
          onClose={() => setDeliveryTarget(null)}
          onSuccess={handleDeliverySuccess}
        />
      )}

      {/* 2. Teslimatı İptal Et Modal */}
      {cancelTarget && (
        <CancelModal
          beneficiary={cancelTarget}
          currentStaff={userName}
          onClose={() => setCancelTarget(null)}
          onSuccess={handleCancelSuccess}
        />
      )}

      {/* 3. Vatandaş & Aynı Hanedeki Diğer Kişiler Modal */}
      {householdTarget && (
        <HouseholdModal
          person={householdTarget}
          householdMembers={householdMembers}
          onClose={() => setHouseholdTarget(null)}
          onOpenDelivery={(person) => {
            setHouseholdTarget(null);
            setDeliveryTarget(person);
          }}
          onOpenCancel={(person) => {
            setHouseholdTarget(null);
            setCancelTarget(person);
          }}
          onOpenEdit={(person) => {
            setHouseholdTarget(null);
            setEditTarget(person);
          }}
          onOpenKomurIptal={(person) => {
            setHouseholdTarget(null);
            setKomurIptalTarget(person);
          }}
          onToggleSignature={handleToggleSignature}
        />
      )}

      {/* 3.1 İkametgah Adresi & Telefon Güncelleme Modalı */}
      {editTarget && (
        <EditBeneficiaryModal
          beneficiary={editTarget}
          mahalleler={mahalleler}
          currentStaff={userName}
          onClose={() => setEditTarget(null)}
          onSuccess={(updatedBeneficiary) => {
            setEditTarget(null);
            handleRefreshAll();
          }}
        />
      )}

      {/* 3.2 Kömür Dağıtımı İptal (Verilmeyecek) Modalı */}
      {komurIptalTarget && (
        <KomurIptalModal
          beneficiary={komurIptalTarget}
          currentStaff={userName}
          onClose={() => setKomurIptalTarget(null)}
          onSuccess={(updated) => {
            setBeneficiaries((prev) =>
              prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b))
            );
            setKomurIptalTarget(null);
            handleRefreshAll();
          }}
        />
      )}

      {/* 4. Hane Kömür Kotası Ayarla Modal (Admin) */}
      {showQuotaModal && (
        <QuotaModal
          currentQuota={defaultQuota}
          onClose={() => setShowQuotaModal(false)}
          onSuccess={handleRefreshAll}
        />
      )}

      {/* 5. Admin Personel & Şifre Yönetimi Modal */}
      {showPersonnelModal && (
        <PersonnelManagementModal
          isOpen={showPersonnelModal}
          onClose={() => setShowPersonnelModal(false)}
          onRefresh={handleRefreshAll}
          onOpenDeviceManagement={() => setShowDeviceModal(true)}
        />
      )}

      {/* 5B. Yetkili 4 Saha Cihazı Yönetim Modalı (Yöntem A Donanım Koruması) */}
      {showDeviceModal && (
        <DeviceManagementModal
          isOpen={showDeviceModal}
          onClose={() => setShowDeviceModal(false)}
        />
      )}

      {/* 6. Admin Kullanıcı İşlem & Denetim Logları Modal */}
      {showAuditLogsModal && (
        <AuditLogsModal
          onClose={() => setShowAuditLogsModal(false)}
        />
      )}

      {/* 7. Şifreli Yönetici Yetkilendirme Modalı */}
      {showAdminAuthModal && (
        <AdminAuthModal
          isOpen={showAdminAuthModal}
          onClose={() => setShowAdminAuthModal(false)}
          onSuccess={(adminUser) => {
            handleRoleChange('ADMIN', adminUser.name, adminUser.username, adminUser.session_token);
          }}
          title="Yönetici Yetkilendirmesi Gereklidir"
          description="Excel aktarımı ve toplu veri yönetimi işlemleri için lütfen Yönetici şifrenizi veya PIN kodunuzu giriniz."
        />
      )}

      {/* 8. Kömür Dağıtım Dönemi & Arşiv Yönetimi Modalı */}
      {showSeasonModal && (
        <SeasonManagementModal
          isOpen={showSeasonModal}
          onClose={() => setShowSeasonModal(false)}
          userRole={userRole}
          userName={userName}
          onSeasonChanged={() => {
            handleRefreshAll();
          }}
        />
      )}
    </main>
  );
}
