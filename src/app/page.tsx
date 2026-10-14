'use client';

import { useState, useEffect, useCallback } from 'react';
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
import AuditLogsModal from '@/components/AuditLogsModal';
import ShiftActiveBanner from '@/components/ShiftActiveBanner';
import ShiftStartModal from '@/components/ShiftStartModal';
import ShiftEndModal from '@/components/ShiftEndModal';
import ShiftPage from '@/components/ShiftPage';
import RoutePage from '@/components/RoutePage';

export default function Home() {
  const [currentTab, setCurrentTab] = useState<NavTab>('search');
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<'ADMIN' | 'PERSONEL'>('PERSONEL');
  const [userName, setUserName] = useState<string>('Saha Personeli');
  const [activeRouteStopsCount, setActiveRouteStopsCount] = useState<number>(0);

  // Quota & Personnel & Audit Log modals state
  const [defaultQuota, setDefaultQuota] = useState<number>(34);
  const [showQuotaModal, setShowQuotaModal] = useState<boolean>(false);
  const [showPersonnelModal, setShowPersonnelModal] = useState<boolean>(false);
  const [showAuditLogsModal, setShowAuditLogsModal] = useState<boolean>(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedMahalleler, setSelectedMahalleler] = useState<string[]>([]);
  const [selectedQueueTab, setSelectedQueueTab] = useState<'PENDING_AND_PARTIAL' | 'DELIVERED'>('PENDING_AND_PARTIAL');
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

  // Shift state
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [shiftRefreshKey, setShiftRefreshKey] = useState<number>(0);
  const [showShiftStartModal, setShowShiftStartModal] = useState<boolean>(false);
  const [shiftEndTarget, setShiftEndTarget] = useState<any | null>(null);

  // Modals state
  const [deliveryTarget, setDeliveryTarget] = useState<any | null>(null);
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [householdTarget, setHouseholdTarget] = useState<any | null>(null);
  const [householdMembers, setHouseholdMembers] = useState<any[]>([]);

  // Load user role & session from localStorage on initial mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLogin = localStorage.getItem('komur_logged_in');
      const savedRole = localStorage.getItem('komur_user_role') as 'ADMIN' | 'PERSONEL' | null;
      const savedName = localStorage.getItem('komur_user_name');
      if (savedLogin === 'true' && savedRole && savedName) {
        setIsLoggedIn(true);
        setUserRole(savedRole);
        setUserName(savedName);
      } else {
        setIsLoggedIn(false);
      }
      setIsAuthChecking(false);
    }
  }, []);

  const handleLoginSuccess = (user: { role: 'ADMIN' | 'PERSONEL'; name: string; username: string }) => {
    setUserRole(user.role);
    setUserName(user.name);
    setIsLoggedIn(true);
    localStorage.setItem('komur_logged_in', 'true');
    localStorage.setItem('komur_user_role', user.role);
    localStorage.setItem('komur_user_name', user.name);
    localStorage.setItem('komur_username', user.username);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('komur_logged_in');
    localStorage.removeItem('komur_user_role');
    localStorage.removeItem('komur_user_name');
    localStorage.removeItem('komur_username');
    // Clear data from memory for security
    setBeneficiaries([]);
    setEksikHaneler([]);
    setArchiveAllRecords([]);
    setArchiveGroupedDays([]);
    setTrucks([]);
    setOverallStats(null);
  };

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success && data.settings?.varsayilan_hedef_torba) {
        setDefaultQuota(data.settings.varsayilan_hedef_torba);
      }
    } catch (e) {
      console.error('Error fetching settings:', e);
    }
  }, []);

  const handleRoleChange = (role: 'ADMIN' | 'PERSONEL', name: string) => {
    setUserRole(role);
    setUserName(name);
    localStorage.setItem('komur_user_role', role);
    localStorage.setItem('komur_user_name', name);
  };

  // Fetch beneficiaries only when authenticated
  const fetchBeneficiaries = useCallback(async () => {
    setIsLoadingBeneficiaries(true);
    try {
      const params = new URLSearchParams({
        q: debouncedSearchQuery,
        mahalleler: selectedMahalleler.join(','),
        durum: 'HEPSI',
        limit: '500'
      });
      const res = await fetch(`/api/beneficiaries?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setBeneficiaries(data.data || []);
        setMahalleler(data.mahalleler || []);
        setEksikHaneler(data.eksikHaneler || []);
      }
    } catch (err) {
      console.error('Error fetching beneficiaries:', err);
    } finally {
      setIsLoadingBeneficiaries(false);
    }
  }, [debouncedSearchQuery, selectedMahalleler]);

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

  // Fetch active shift
  const fetchActiveShift = useCallback(async () => {
    if (!userName) return;
    try {
      const res = await fetch(`/api/shifts?personel=${encodeURIComponent(userName)}`);
      const data = await res.json();
      if (data.success) {
        setActiveShift(data.activeShift || null);
      }
    } catch (err) {
      console.error('Error fetching active shift:', err);
    }
  }, [userName]);

  // Fetch Active Route pending stops count for navbar badge
  const fetchActiveRouteCount = useCallback(async () => {
    try {
      const res = await fetch('/api/routes');
      const data = await res.json();
      if (data.success && data.activeRoute) {
        const pending = (data.activeRoute.duraklar || []).filter(
          (s: any) => !s.durum || s.durum === 'BEKLIYOR'
        ).length;
        setActiveRouteStopsCount(pending);
      } else {
        setActiveRouteStopsCount(0);
      }
    } catch (e) {
      console.error('Error fetching route count:', e);
    }
  }, []);

  // Quick Start Shift (one-click with current time)
  const handleQuickStartShift = async () => {
    try {
      const staffName = (userName || '').trim() || 'Murat Dağıtım';
      const now = new Date();
      const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'START',
          personel_adi: staffName,
          baslama_saati: localTime
        })
      });
      const data = await res.json();
      if (data.success) {
        setActiveShift(data.shift);
        setShiftRefreshKey((k) => k + 1);
        handleRefreshAll();
      } else {
        alert(data.error || 'Mesai başlatılamadı.');
      }
    } catch (err) {
      console.error('Error quick starting shift:', err);
      alert('Mesai başlatılırken bağlantı hatası oluştu.');
    }
  };

  // Refresh all data
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    setShiftRefreshKey((k) => k + 1);
    await Promise.all([
      fetchBeneficiaries(),
      fetchArchive(),
      fetchTrucks(),
      fetchStats(),
      fetchSettings(),
      fetchActiveShift(),
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
      fetchActiveShift();
      fetchActiveRouteCount();
    }
  }, [isLoggedIn, fetchSettings, fetchBeneficiaries, fetchArchive, fetchTrucks, fetchStats, fetchActiveShift, fetchActiveRouteCount]);

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
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // 3. Authenticated: Render the Main Application
  return (
    <main className="min-h-screen bg-[var(--bg-app)] text-slate-900 selection:bg-amber-500 selection:text-white">
      {/* Top Header */}
      <Header
        userRole={userRole}
        userName={userName}
        defaultQuota={defaultQuota}
        onOpenQuotaModal={() => setShowQuotaModal(true)}
        onOpenPersonnelModal={() => setShowPersonnelModal(true)}
        onOpenAuditLogs={() => setShowAuditLogsModal(true)}
        onLogout={handleLogout}
        onRoleChange={handleRoleChange}
        onRefresh={handleRefreshAll}
        isRefreshing={isRefreshing}
      />

      {/* Main Container */}
      <div className="app-container">
        {/* Tab 1: Sorgu & Dağıtım Listesi */}
        {currentTab === 'search' && (
          <>
            {/* LIVE WORK SHIFT BANNER - Arama yaparken sahada ekranı sade tutmak için gizlenir */}
            {!searchQuery.trim() && (
              <ShiftActiveBanner
                activeShift={activeShift}
                currentStaff={userName}
                onOpenStartModal={() => setShowShiftStartModal(true)}
                onOpenEndModal={(shift) => setShiftEndTarget(shift)}
                onQuickStart={handleQuickStartShift}
                onNavigateToShiftPage={() => setCurrentTab('shift')}
              />
            )}

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
              onNavigateToRoute={() => setCurrentTab('route')}
              defaultQuota={defaultQuota}
              isLoading={isLoadingBeneficiaries}
            />
          </>
        )}

        {/* Tab: Dağıtım Rotası & İmza Takibi */}
        {currentTab === 'route' && (
          <RoutePage
            userRole={userRole}
            userName={userName}
            onRefreshAll={handleRefreshAll}
            onNavigateToSearch={() => setCurrentTab('search')}
          />
        )}

        {/* Tab: Mesai & Vardiya Takibi */}
        {currentTab === 'shift' && (
          <ShiftPage
            userRole={userRole}
            userName={userName}
            activeShift={activeShift}
            refreshTrigger={shiftRefreshKey}
            onOpenStartModal={() => setShowShiftStartModal(true)}
            onOpenEndModal={(shift) => setShiftEndTarget(shift)}
            onRefreshAll={handleRefreshAll}
          />
        )}

        {/* Tab 2: İstatistik & Resmi PDF Raporlama */}
        {currentTab === 'analytics' && (
          <AnalyticsPage
            userRole={userRole}
            onOpenQuotaModal={() => setShowQuotaModal(true)}
            onRefreshAll={handleRefreshAll}
          />
        )}

        {/* Tab 3: Teslimat Arşivi & İptal Edilenler */}
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
          />
        )}

        {/* Tab 5: Excel Yükleme & Yükleme Sonuçları */}
        {currentTab === 'import' && (
          <ExcelImportPage
            userRole={userRole}
            onSwitchToAdmin={() => handleRoleChange('ADMIN', 'Yönetici')}
            onRefreshAll={handleRefreshAll}
          />
        )}
      </div>

      {/* Mobile Sticky Bottom Navigation */}
      <BottomNav
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        hasActiveShift={!!activeShift}
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

      {/* 5. Dağıtım Mesaisini Başlat Modal */}
      {showShiftStartModal && (
        <ShiftStartModal
          currentStaff={userName}
          onClose={() => setShowShiftStartModal(false)}
          onSuccess={(newShift) => {
            setActiveShift(newShift);
            handleRefreshAll();
          }}
        />
      )}

      {/* 6. Dağıtım Mesaisini Bitir & Kapat Modal */}
      {shiftEndTarget && (
        <ShiftEndModal
          shift={shiftEndTarget}
          onClose={() => setShiftEndTarget(null)}
          onSuccess={(updatedShift) => {
            setActiveShift(null);
            handleRefreshAll();
          }}
        />
      )}

      {/* 5. Admin Personel & Şifre Yönetimi Modal */}
      {showPersonnelModal && (
        <PersonnelManagementModal
          isOpen={showPersonnelModal}
          onClose={() => setShowPersonnelModal(false)}
          onRefresh={handleRefreshAll}
        />
      )}

      {/* 6. Admin Kullanıcı İşlem & Denetim Logları Modal */}
      {showAuditLogsModal && (
        <AuditLogsModal
          onClose={() => setShowAuditLogsModal(false)}
        />
      )}
    </main>
  );
}
