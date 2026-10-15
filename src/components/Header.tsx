'use client';

import { useState } from 'react';
import { 
  Flame, Shield, User, RefreshCw, CheckCircle2, Users, LogOut, FileClock,
  Search, Route as RouteIcon, Clock, History, Truck, FileSpreadsheet, BarChart3, WifiOff, Wifi, Calendar, BookOpen
} from 'lucide-react';
import type { NavTab } from '@/components/BottomNav';
import ProfileModal from '@/components/ProfileModal';

interface HeaderProps {
  userRole: 'ADMIN' | 'PERSONEL';
  userName: string;
  defaultQuota?: number;
  currentTab?: NavTab;
  onTabChange?: (tab: NavTab) => void;
  hasActiveShift?: boolean;
  incompleteDeliveriesCount?: number;
  importErrorsCount?: number;
  activeRouteStopsCount?: number;
  pendingSyncCount?: number;
  onTriggerSync?: () => void;
  isOnline?: boolean;
  onOpenQuotaModal?: () => void;
  onOpenPersonnelModal?: () => void;
  onOpenAuditLogs?: () => void;
  onOpenSeasonModal?: () => void;
  activeSeasonCode?: string;
  onLogout?: () => void;
  onUserUpdated?: (user: { name: string; username: string }) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export default function Header({
  userRole,
  userName,
  defaultQuota = 34,
  currentTab = 'search',
  onTabChange,
  hasActiveShift,
  incompleteDeliveriesCount,
  importErrorsCount,
  activeRouteStopsCount,
  pendingSyncCount = 0,
  onTriggerSync,
  isOnline = true,
  onOpenQuotaModal,
  onOpenPersonnelModal,
  onOpenAuditLogs,
  onOpenSeasonModal,
  activeSeasonCode = '2026-2027',
  onLogout,
  onUserUpdated,
  onRefresh,
  isRefreshing = false
}: HeaderProps) {
  const [showProfileModal, setShowProfileModal] = useState(false);

  const allNavTabs = [
    {
      id: 'search' as NavTab,
      label: 'Sorgu & Dağıtım',
      icon: Search,
      badge: incompleteDeliveriesCount && incompleteDeliveriesCount > 0 ? incompleteDeliveriesCount : undefined,
      badgeColor: 'bg-amber-600 text-white'
    },
    {
      id: 'route' as NavTab,
      label: 'Dağıtım Rotası',
      icon: RouteIcon,
      badge: activeRouteStopsCount && activeRouteStopsCount > 0 ? activeRouteStopsCount : undefined,
      badgeColor: 'bg-sky-600 text-white font-extrabold'
    },
    {
      id: 'shift' as NavTab,
      label: 'Çalışma Saatleri',
      icon: Clock
    },
    {
      id: 'analytics' as NavTab,
      label: 'İstatistik & Rapor',
      icon: BarChart3
    },
    {
      id: 'archive' as NavTab,
      label: 'Teslimat Arşivi',
      icon: History
    },
    {
      id: 'tonnage' as NavTab,
      label: 'Kömür Tonajı',
      icon: Truck
    },
    {
      id: 'import' as NavTab,
      label: 'Excel Aktarımı',
      icon: FileSpreadsheet,
      badge: importErrorsCount && importErrorsCount > 0 ? importErrorsCount : undefined,
      badgeColor: 'bg-rose-600 text-white'
    },
    {
      id: 'guide' as NavTab,
      label: 'Kullanım Kılavuzu',
      icon: BookOpen
    }
  ];

  // Restrict Excel Import Tab strictly to ADMIN
  const visibleNavTabs = allNavTabs.filter((tab) => tab.id !== 'import' || userRole === 'ADMIN');

  return (
    <>
      <header className="app-header no-print">
        <div className="app-header-inner">
          {/* Top Row: Institution Logo & Title + Actions */}
          <div className="flex items-center justify-between w-full gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink">
              {/* Official Edirne SYDV Logo */}
              <div className="header-logo-container" style={{ width: '40px', height: '40px', minWidth: '40px', minHeight: '40px' }}>
                <img
                  src="/edirne-sydv-logo.png"
                  alt="Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı"
                  width={40}
                  height={40}
                  className="header-logo-img"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <h1 className="text-xs sm:text-sm font-black tracking-tight text-slate-900 leading-tight truncate">
                    EDİRNE SYDV BAŞKANLIĞI
                  </h1>
                  <span className="text-[8px] sm:text-[9px] uppercase font-black tracking-wider px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 shrink-0 hidden sm:inline-block">
                    T.C. VALİLİK
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 font-semibold truncate">
                  Kömür Dağıtım ve Saha Takip Sistemi
                </p>
              </div>
            </div>

            {/* User Role Badge & Actions */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
              {/* Pending Offline Sync Badge */}
              {pendingSyncCount > 0 && onTriggerSync && (
                <button
                  onClick={onTriggerSync}
                  title="Çevrimdışı yapılan teslimatları sisteme aktar"
                  className="flex items-center gap-1 px-2 py-1 rounded-xl bg-amber-500 text-white text-[11px] font-black shadow-xs hover:bg-amber-600 transition-all shrink-0 animate-pulse"
                >
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span className="hidden xs:inline">Eşitle:</span>
                  <span>{pendingSyncCount}</span>
                </button>
              )}

              {/* Offline Indicator on mobile */}
              {!isOnline && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold shrink-0">
                  <WifiOff className="w-3 h-3 text-amber-700" />
                  <span className="hidden xs:inline">Çevrimdışı</span>
                </span>
              )}

              {/* Admin Personnel Management Shortcut - Admin Only */}
              {userRole === 'ADMIN' && onOpenPersonnelModal && (
                <button
                  onClick={onOpenPersonnelModal}
                  title="Personel & Şifre Yönetimi (Sadece Yönetici)"
                  className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-xs font-bold text-purple-900 transition-all active:scale-95 shadow-sm shrink-0"
                >
                  <Users className="w-3.5 h-3.5 text-purple-700" />
                  <span className="hidden sm:inline">Personel</span>
                </button>
              )}

              {/* Admin Audit Logs Shortcut - Admin Only */}
              {userRole === 'ADMIN' && onOpenAuditLogs && (
                <button
                  onClick={onOpenAuditLogs}
                  title="Kullanıcı İşlem & Denetim Logları (Sadece Yönetici)"
                  className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold text-indigo-900 transition-all active:scale-95 shadow-sm shrink-0"
                >
                  <FileClock className="w-3.5 h-3.5 text-indigo-700" />
                  <span className="hidden sm:inline">İşlem Logları</span>
                </button>
              )}

              {/* Season & Archive Management Button */}
              {onOpenSeasonModal && (
                <button
                  onClick={onOpenSeasonModal}
                  title={`Kömür Dağıtım Dönemi: ${activeSeasonCode} (Dönem & Arşiv Yönetimi)`}
                  className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-xs font-bold text-blue-900 transition-all active:scale-95 shadow-sm shrink-0"
                >
                  <Calendar className="w-3.5 h-3.5 text-blue-700" />
                  <span className="hidden sm:inline">{activeSeasonCode}</span>
                  <span className="sm:hidden text-[11px]">Dönem</span>
                </button>
              )}

              {/* Target Quota - Only Admin Can Edit; Personnel Sees Read-Only */}
              {userRole === 'ADMIN' && onOpenQuotaModal ? (
                <button
                  onClick={onOpenQuotaModal}
                  title="Hane Kömür Kotası Ayarla (Yönetici Yetkisi)"
                  className="flex items-center gap-0.5 sm:gap-1 px-1.5 py-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-xs font-bold text-amber-900 transition-all active:scale-95 shadow-sm shrink-0"
                >
                  <span className="text-xs">🎯</span>
                  <span className="text-[11px] sm:text-xs font-bold">{defaultQuota || 34}</span>
                </button>
              ) : (
                <div
                  title={`Hedef Hane Kotası: ${defaultQuota || 34} Torba (Yönetici Tarafından Belirlenir)`}
                  className="flex items-center gap-1 px-1.5 py-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 shrink-0 cursor-default"
                >
                  <span className="text-xs">🎯</span>
                  <span className="text-[11px] sm:text-xs font-bold">{defaultQuota || 34}</span>
                </div>
              )}

              {/* Quick Guide Shortcut */}
              {onTabChange && (
                <button
                  onClick={() => onTabChange('guide')}
                  title="Resmi Sistem Kullanım Kılavuzu & Yardım"
                  className={`flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 shadow-sm shrink-0 ${
                    currentTab === 'guide'
                      ? 'bg-emerald-600 text-white border-emerald-700'
                      : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-900'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Kılavuz</span>
                </button>
              )}

              <button
                onClick={onRefresh}
                title="Yenile"
                aria-label="Yenile"
                className={`p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 hover:text-slate-900 transition-all active:scale-95 shadow-sm shrink-0 ${
                  isRefreshing ? 'animate-spin text-amber-600' : ''
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              {/* User Profile Badge (Clicking Opens Profile Info, No Arbitrary Role Change) */}
              <button
                onClick={() => setShowProfileModal(true)}
                className="flex items-center gap-1 sm:gap-1.5 px-1.5 py-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-800 transition-all active:scale-95 shadow-sm max-w-[85px] xs:max-w-[105px] sm:max-w-[130px] shrink-0"
                title="Kullanıcı Oturum Bilgisi"
              >
                {userRole === 'ADMIN' ? (
                  <>
                    <Shield className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="text-amber-900 font-bold truncate text-[11px] sm:text-xs">{userName || 'Yönetici'}</span>
                  </>
                ) : (
                  <>
                    <User className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span className="text-sky-900 font-bold truncate text-[11px] sm:text-xs">{userName || 'Personel'}</span>
                  </>
                )}
              </button>

              {/* Logout Button */}
              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Güvenli Çıkış Yap"
                  aria-label="Güvenli Çıkış Yap"
                  className="p-1.5 sm:p-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 hover:text-rose-700 transition-all active:scale-95 shadow-sm shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Desktop Navigation Bar */}
          {onTabChange && (
            <div className="desktop-nav-bar hidden lg:flex items-center justify-between w-full">
              <nav className="desktop-nav-tabs" role="tablist" aria-label="Masaüstü Ana Menü">
                {visibleNavTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = currentTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange(tab.id)}
                      className={`desktop-nav-tab ${isActive ? 'active' : ''}`}
                      role="tab"
                      aria-selected={isActive}
                    >
                      <Icon className="w-4 h-4 desktop-nav-icon shrink-0" />
                      <span>{tab.label}</span>
                      {tab.badge !== undefined && (
                        <span className={`desktop-nav-badge ${tab.badgeColor || 'bg-rose-600 text-white'}`}>
                          {typeof tab.badge === 'number' && tab.badge > 99 ? '99+' : tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Institutional Online Status Tag */}
              <div className="hidden xl:flex items-center gap-2 text-xs font-bold text-slate-500 shrink-0">
                {!isOnline ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                    <span>Çevrimdışı Mod</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Sistem Çevrimiçi</span>
                  </span>
                )}
                <span className="text-slate-300">•</span>
                <span className="text-slate-600 font-semibold">T.C. Edirne Valiliği SYDV</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* User Profile & Password Update Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        userRole={userRole}
        userName={userName}
        onUserUpdated={onUserUpdated || (() => {})}
        onLogout={onLogout}
      />
    </>
  );
}
