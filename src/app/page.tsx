'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import BottomNav, { NavTab } from '@/components/BottomNav';
import BeneficiaryList from '@/components/BeneficiaryList';
import MorningAlertBanner from '@/components/MorningAlertBanner';
import LoginPage from '@/components/LoginPage';
import { FlaskConical, RotateCcw, Shield, Sparkles } from 'lucide-react';
import { showToast, showAlert, showConfirm } from '@/components/GlobalAlertManager';
import { setOfflineQueueActiveMode, clearSandboxOfflineQueue } from '@/lib/offlineSync';
import { getPendingOfflineCount, syncOfflineDeliveries } from '@/lib/offlineSync';
import { signatureQueue } from '@/lib/signatureQueue';
import { getSecureItem, setSecureItem, removeSecureItem, migrateSensitiveStorageKeys } from '@/lib/secureStorage';
import { applySafeCachePurge, checkAndPurgeIfVersionChanged, purgeSessionStorage } from '@/lib/cacheManager';

// Modern Skeleton loader for dynamically loaded sub-tabs
function TabLoadingSkeleton({ text = 'Yükleniyor...' }: { text?: string }) {
  return (
    <div className="p-8 sm:p-12 rounded-3xl bg-white border border-slate-200 shadow-sm text-center space-y-3 animate-pulse my-4">
      <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-xs">
        <Sparkles className="w-5 h-5 animate-spin" />
      </div>
      <p className="text-xs sm:text-sm font-bold text-slate-700">{text}</p>
      <div className="w-48 h-1.5 bg-slate-100 rounded-full mx-auto overflow-hidden">
        <div className="w-2/3 h-full bg-amber-500 rounded-full" />
      </div>
    </div>
  );
}

// Next.js High-Performance Code-Splitting for Heavy Sub-Tabs
const SingleHouseholdAddPage = dynamic(() => import('@/components/SingleHouseholdAddPage'), {
  loading: () => <TabLoadingSkeleton text="Tekil Hane Kayıt Paneli Hazırlanıyor..." />,
});
const RoutePage = dynamic(() => import('@/components/RoutePage'), {
  loading: () => <TabLoadingSkeleton text="Dağıtım Rotası ve İmza Listeleri Yükleniyor..." />,
});
const ShiftPage = dynamic(() => import('@/components/ShiftPage'), {
  loading: () => <TabLoadingSkeleton text="Çalışma Saatleri ve Vardiya Paneli Yükleniyor..." />,
});
const AnalyticsPage = dynamic(() => import('@/components/AnalyticsPage'), {
  loading: () => <TabLoadingSkeleton text="İstatistik ve Resmi Raporlama Paneli Yükleniyor..." />,
});
const DeliveryArchive = dynamic(() => import('@/components/DeliveryArchive'), {
  loading: () => <TabLoadingSkeleton text="Teslimat Arşivi Yükleniyor..." />,
});
const TonnagePage = dynamic(() => import('@/components/TonnagePage'), {
  loading: () => <TabLoadingSkeleton text="Kömür Stok ve Tonaj Paneli Yükleniyor..." />,
});
const ExcelImportPage = dynamic(() => import('@/components/ExcelImportPage'), {
  loading: () => <TabLoadingSkeleton text="Excel İçe Aktarma ve Liste Yönetimi Yükleniyor..." />,
});
const GuidePage = dynamic(() => import('@/components/GuidePage'), {
  loading: () => <TabLoadingSkeleton text="Resmi Kullanım Kılavuzu Yükleniyor..." />,
});

// Lazy-loaded Modals (yalnızca ilgili modal açıldığında indirilir; ilk açılış JS paketini küçültür)
const DeliveryModal = dynamic(() => import('@/components/DeliveryModal'));
const CancelModal = dynamic(() => import('@/components/CancelModal'));
const HouseholdModal = dynamic(() => import('@/components/HouseholdModal'));
const QuotaModal = dynamic(() => import('@/components/QuotaModal'));
const PersonnelManagementModal = dynamic(() => import('@/components/PersonnelManagementModal'));
const DeviceManagementModal = dynamic(() => import('@/components/DeviceManagementModal'));
const AuditLogsModal = dynamic(() => import('@/components/AuditLogsModal'));
const AdminAuthModal = dynamic(() => import('@/components/AdminAuthModal'));
const EditBeneficiaryModal = dynamic(() => import('@/components/EditBeneficiaryModal'));
const KomurIptalModal = dynamic(() => import('@/components/KomurIptalModal'));
const SeasonManagementModal = dynamic(() => import('@/components/SeasonManagementModal'));

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
  const [userRole, setUserRole] = useState<'ADMIN' | 'PERSONEL' | 'MUDUR'>('PERSONEL');
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
  const [calismaModu, setCalismaModu] = useState<'RESMI' | 'DENEME'>('RESMI');
  const [modeSyncVersion, setModeSyncVersion] = useState<number>(0);
  const [sandboxStats, setSandboxStats] = useState<any>(null);
  const [officialStats, setOfficialStats] = useState<any>(null);
  const [isSwitchingGlobalMode, setIsSwitchingGlobalMode] = useState<boolean>(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMahalleler, setSelectedMahalleler] = useState<string[]>([]);
  const [selectedQueueTab, setSelectedQueueTab] = useState<'PENDING_AND_PARTIAL' | 'DELIVERED' | 'EXCLUDED' | 'ALL'>('PENDING_AND_PARTIAL');
  const [selectedDurumFilter, setSelectedDurumFilter] = useState<string>('HEPSI');

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
      const savedRole = getSecureItem('komur_user_role') as 'ADMIN' | 'PERSONEL' | 'MUDUR' | null;
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
    role: 'ADMIN' | 'PERSONEL' | 'MUDUR';
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
        const incomingMode = data.calisma_modu || data.settings?.calisma_modu;
        if (incomingMode === 'DENEME' || incomingMode === 'RESMI') {
          setCalismaModu(incomingMode);
          setOfflineQueueActiveMode(incomingMode);
        }
        if (data.settings?.sandbox_stats) {
          setSandboxStats(data.settings.sandbox_stats);
        }
        if (data.settings?.official_stats) {
          setOfficialStats(data.settings.official_stats);
        }
      }
    } catch (e) {
      console.error('Error fetching settings:', e);
    }
  }, []);

  const clearOpenRecordModals = useCallback(() => {
    setDeliveryTarget(null);
    setCancelTarget(null);
    setHouseholdTarget(null);
    setEditTarget(null);
    setKomurIptalTarget(null);
  }, []);

  const handleGlobalModeSwitch = useCallback(async (targetMode: 'RESMI' | 'DENEME') => {
    setIsSwitchingGlobalMode(true);
    try {
      signatureQueue.clear();
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SET_CALISMA_MODU', calisma_modu: targetMode }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Çalışma modu değiştirilemedi');
      }
      setCalismaModu(targetMode);
      setOfflineQueueActiveMode(targetMode);
      setPendingSyncCount(getPendingOfflineCount());
      beneficiariesMemoryCacheRef.current = null;
      clearOpenRecordModals();
      setModeSyncVersion((v) => v + 1);
      showToast({
        type: targetMode === 'DENEME' ? 'info' : 'success',
        title: targetMode === 'DENEME' ? 'Deneme Modu Aktif Edildi' : 'Normal (Resmi) Moda Geçildi',
        message: data.message,
      });
    } catch (err: any) {
      showAlert({
        type: 'error',
        title: 'Hata',
        message: err.message || 'Çalışma modu değiştirilirken hata oluştu.',
      });
      throw err;
    } finally {
      setIsSwitchingGlobalMode(false);
    }
  }, [clearOpenRecordModals]);

  const handleGlobalResetSandbox = useCallback(async (seedFakeAfterReset: boolean = false) => {
    const confirmed = await showConfirm({
      title: seedFakeAfterReset ? 'Deneme Verilerini Sıfırla & Fake Veri Yükle' : 'Deneme Modu Verilerini Sıfırla',
      message: seedFakeAfterReset
        ? 'Deneme modundaki mevcut test işlemleri sıfırlanacak ve temiz örnek (fake) hane listeleri yeniden yüklenecektir. Asıl (Resmi) verilerinize kesinlikle dokunulmaz. Onaylıyor musunuz?'
        : 'Deneme (Test) modundaki tüm test Excel listeleri, test haneleri ve deneme işlemleri tamamen sıfırlanacaktır (0 kayıt). Asıl (Resmi) listelerinize hiçbir şekilde dokunulmaz. Onaylıyor musunuz?',
      type: 'warning',
      confirmText: seedFakeAfterReset ? 'Evet, Sıfırla ve Fake Veri Yükle' : 'Evet, Deneme Modunu Sıfırla',
      cancelText: 'Vazgeç',
    });
    if (!confirmed) return false;

    setIsSwitchingGlobalMode(true);
    try {
      signatureQueue.clear();
      clearSandboxOfflineQueue();
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RESET_SANDBOX_DATA',
          seed_fake_data: seedFakeAfterReset,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Deneme modu sıfırlanamadı');
      }
      beneficiariesMemoryCacheRef.current = null;
      clearOpenRecordModals();
      setModeSyncVersion((v) => v + 1);
      showToast({
        type: 'success',
        title: seedFakeAfterReset ? 'Örnek (Fake) Veriler Yüklendi' : 'Deneme Modu Sıfırlandı',
        message: data.message,
      });
      return true;
    } catch (err: any) {
      showAlert({
        type: 'error',
        title: 'Hata',
        message: err.message || 'Deneme modu sıfırlanırken hata oluştu.',
      });
      return false;
    } finally {
      setIsSwitchingGlobalMode(false);
    }
  }, [clearOpenRecordModals]);

  const beneficiariesMemoryCacheRef = useRef<{
    data: any[];
    mahalleler: any[];
    eksikHaneler: any[];
  } | null>(null);

  const handleRoleChange = (role: 'ADMIN' | 'PERSONEL' | 'MUDUR', name: string, username?: string, sessionToken?: string) => {
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
  }, [handleLogout]);

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

  // Safe version upgrade & cache purge on initial app boot
  useEffect(() => {
    const bundledVersion = process.env.NEXT_PUBLIC_APP_VERSION;
    if (bundledVersion) {
      const vCheck = checkAndPurgeIfVersionChanged(bundledVersion);
      if (vCheck.changed) {
        applySafeCachePurge(bundledVersion).then(() => {
          if (!vCheck.isFirstRun) {
            showToast({
              type: 'info',
              title: '🚀 Sistem Yeni Sürüme Güncellendi',
              message: 'Son güncellemeler yüklendi ve cihaz önbelleği güvenle yenilendi.',
            });
          }
        });
      }
    }
  }, []);

  // Refresh all data
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    beneficiariesMemoryCacheRef.current = null;
    purgeSessionStorage();
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
      fetchBeneficiaries(true);
      fetchArchive();
      fetchTrucks();
      fetchStats();
      fetchActiveRouteCount();
    }
  }, [isLoggedIn, fetchSettings, fetchBeneficiaries, fetchArchive, fetchTrucks, fetchStats, fetchActiveRouteCount]);

  // Always points at the latest offline-queue sync handler (avoids stale closures in the listener effect below)
  const syncOfflineQueueRef = useRef<() => void>(() => {});

  // Check online status and pending offline queue
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      setPendingSyncCount(getPendingOfflineCount());

      const handleOnline = () => {
        setIsOnline(true);
        syncOfflineQueueRef.current();
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
  useEffect(() => {
    syncOfflineQueueRef.current = handleSyncOfflineQueue;
  });

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
        if (data.appVersion) {
          const vCheck = checkAndPurgeIfVersionChanged(data.appVersion);
          if (vCheck.changed) {
            beneficiariesMemoryCacheRef.current = null;
            await applySafeCachePurge(data.appVersion);
            if (!vCheck.isFirstRun) {
              showToast({
                type: 'info',
                title: '🚀 Sistem Yeni Sürüme Güncellendi',
                message: 'Son güncellemeler yüklendi ve cihaz önbelleği güvenle yenilendi.',
              });
            }
            fetchSettings();
            fetchBeneficiaries(true);
            fetchArchive();
            fetchTrucks();
            fetchStats();
            fetchActiveRouteCount();
          }
        }
        if (data.success) {
          let modeChangedOnServer = false;
          if (data.calismaModu === 'DENEME' || data.calismaModu === 'RESMI') {
            setCalismaModu((prev) => {
              if (prev !== data.calismaModu) {
                modeChangedOnServer = true;
                signatureQueue.clear();
                setOfflineQueueActiveMode(data.calismaModu);
                setPendingSyncCount(getPendingOfflineCount());
                beneficiariesMemoryCacheRef.current = null;
                clearOpenRecordModals();
                setModeSyncVersion((v) => v + 1);
                showToast({
                  type: data.calismaModu === 'DENEME' ? 'info' : 'success',
                  title:
                    data.calismaModu === 'DENEME'
                      ? '🧪 Deneme Modu Aktif Edildi'
                      : '🛡️ Normal (Resmi) Moda Geçildi',
                  message:
                    data.calismaModu === 'DENEME'
                      ? 'Yönetici tarafından Deneme Modu açıldı. Şu anda ekranda deneme (fake) kayıtları gösterilmektedir.'
                      : 'Deneme modu kapatıldı ve normal (resmi) vakıf kayıtları yüklendi.',
                });
              }
              return data.calismaModu;
            });
          }
          if (data.lastSyncTime || modeChangedOnServer) {
            if (!lastKnownSyncRef.current && !modeChangedOnServer) {
              lastKnownSyncRef.current = data.lastSyncTime || '';
            } else if (modeChangedOnServer || data.lastSyncTime !== lastKnownSyncRef.current) {
              // New delivery, mode switch or update occurred across field staff!
              if (data.lastSyncTime) {
                lastKnownSyncRef.current = data.lastSyncTime;
              }
              fetchSettings();
              fetchBeneficiaries(true);
              fetchArchive();
              fetchTrucks();
              fetchStats();
              fetchActiveRouteCount();
            }
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
  }, [isLoggedIn, fetchSettings, fetchBeneficiaries, fetchArchive, fetchTrucks, fetchStats, fetchActiveRouteCount, clearOpenRecordModals]);

  // Tab protection: Non-admin can never view 'import' tab; Personel can never view 'analytics' tab; Mudur can never view 'add_household'
  useEffect(() => {
    if (userRole !== 'ADMIN' && currentTab === 'import') {
      setCurrentTab('search');
    }
    if (userRole === 'PERSONEL' && currentTab === 'analytics') {
      setCurrentTab('search');
    }
    if (userRole === 'MUDUR' && currentTab === 'add_household') {
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
  const handleDeliverySuccess = () => {
    setDeliveryTarget(null);
    handleRefreshAll();
  };

  // Cancellation completed handler
  const handleCancelSuccess = () => {
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
          if (tab === 'add_household' && userRole === 'MUDUR') {
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
        calismaModu={calismaModu}
        onToggleDenemeModu={async () => {
          const nextMode = calismaModu === 'DENEME' ? 'RESMI' : 'DENEME';
          await handleGlobalModeSwitch(nextMode);
          await handleRefreshAll();
        }}
        onLogout={() => handleLogout()}
        onUserUpdated={handleUserUpdated}
        onRefresh={handleRefreshAll}
        isRefreshing={isRefreshing || isSyncingOffline}
      />

      {/* DENEME / TEST MODU AKTİFKEN TÜM EKRANLARDA GÖRÜNEN KÜRESEL UYARI BANDI */}
      {calismaModu === 'DENEME' && (
        <div className="bg-indigo-950 border-b-2 border-amber-400 text-white px-3 sm:px-6 py-2.5 shadow-md sticky top-0 z-40 no-print">
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-md bg-amber-400 text-indigo-950 font-black uppercase tracking-wider shrink-0 flex items-center gap-1">
                <FlaskConical className="w-3.5 h-3.5" />
                DENEME MODU AKTİF
              </span>
              <span className="font-semibold text-indigo-100 leading-snug">
                Şu anda sistemdeki <strong>sahte (fake) deneme verilerini</strong> görüntülüyorsunuz. Tüm personel bu kayıtları görür; <strong>asıl (resmi) verileriniz (%100 korumalı) etkilenmez.</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-white/15 border border-white/20 text-[11px] font-bold text-amber-200 shrink-0">
                Deneme Verisi: {beneficiaries.length} Hane | Asıl Veri: {officialStats?.hane_sayisi ?? 0} Hane (Güvende)
              </span>
            </div>

            {userRole === 'ADMIN' && (
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
                {currentTab !== 'import' && (
                  <button
                    type="button"
                    onClick={() => setCurrentTab('import')}
                    className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 text-[11px] font-bold transition-all"
                  >
                    Deneme Alanı
                  </button>
                )}
                <button
                  type="button"
                  disabled={isSwitchingGlobalMode}
                  onClick={async () => {
                    const ok = await handleGlobalResetSandbox(true);
                    if (ok) await handleRefreshAll();
                  }}
                  title="Deneme modundaki test işlemlerini sıfırla ve örnek (fake) hane listelerini yeniden yükle"
                  className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-indigo-950 text-[11px] font-black flex items-center gap-1 shadow-xs transition-all active:scale-95 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Fake Veri Yenile</span>
                </button>
                <button
                  type="button"
                  disabled={isSwitchingGlobalMode}
                  onClick={async () => {
                    const ok = await handleGlobalResetSandbox(false);
                    if (ok) await handleRefreshAll();
                  }}
                  title="Deneme modundaki tüm verileri sıfırla (boşalt)"
                  className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black flex items-center gap-1 shadow-xs transition-all active:scale-95 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Deneme Verilerini Sıfırla</span>
                </button>
                <button
                  type="button"
                  disabled={isSwitchingGlobalMode}
                  onClick={async () => {
                    await handleGlobalModeSwitch('RESMI');
                    await handleRefreshAll();
                  }}
                  title="Deneme modunu kapat ve hiçbir veri kaybı olmadan normal (resmi) işleyişe devam et"
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-black flex items-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-50"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Deneme Modunu Kapat (Asıl Moda Dön)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Container */}
      <div key={`main-view-${calismaModu}-${modeSyncVersion}`} className="app-container">
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
              userRole={userRole}
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
            activeSeasonCode={activeSeasonCode}
            calismaModu={calismaModu}
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

        {/* Tab 2: İstatistik & Resmi PDF Raporlama (Yönetici ve Müdür Yetkilisi) */}
        {currentTab === 'analytics' && (userRole === 'ADMIN' || userRole === 'MUDUR') && (
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
            userRole={userRole}
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
            activeSeasonCode={activeSeasonCode}
            calismaModu={calismaModu}
            sandboxStats={sandboxStats}
            officialStats={officialStats}
            onChangeCalismaModu={async (newMode) => {
              await handleGlobalModeSwitch(newMode);
              await handleRefreshAll();
            }}
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
            <Image unoptimized
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
          if (tab === 'add_household' && userRole === 'MUDUR') {
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
          onSuccess={() => {
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
