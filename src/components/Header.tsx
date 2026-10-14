'use client';

import { useState } from 'react';
import { 
  Flame, Shield, User, RefreshCw, CheckCircle2, Users, LogOut, FileClock,
  Search, Route as RouteIcon, Clock, History, Truck, FileSpreadsheet, BarChart3
} from 'lucide-react';
import type { NavTab } from '@/components/BottomNav';

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
  onOpenQuotaModal?: () => void;
  onOpenPersonnelModal?: () => void;
  onOpenAuditLogs?: () => void;
  onLogout?: () => void;
  onRoleChange: (role: 'ADMIN' | 'PERSONEL', name: string) => void;
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
  onOpenQuotaModal,
  onOpenPersonnelModal,
  onOpenAuditLogs,
  onLogout,
  onRoleChange,
  onRefresh,
  isRefreshing = false
}: HeaderProps) {
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'ADMIN' | 'PERSONEL'>(userRole);
  const [inputName, setInputName] = useState(userName);
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  const navTabs = [
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
      label: 'Mesai Takibi',
      icon: Clock,
      badge: hasActiveShift ? '●' : undefined,
      badgeColor: 'bg-emerald-500 text-white animate-pulse'
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
    }
  ];

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRole === 'ADMIN') {
      if (adminPin !== '1234' && adminPin.toLowerCase() !== 'admin') {
        setPinError('Geçersiz Yönetici PIN kodu! (Varsayılan: 1234)');
        return;
      }
    }
    setPinError('');
    onRoleChange(selectedRole, inputName || (selectedRole === 'ADMIN' ? 'Yönetici' : 'Saha Personeli'));
    setShowRoleModal(false);
    setAdminPin('');
  };

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
              {/* Admin Personnel Management Shortcut */}
              {userRole === 'ADMIN' && onOpenPersonnelModal && (
                <button
                  onClick={onOpenPersonnelModal}
                  title="Personel & Şifre Yönetimi"
                  className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-xs font-bold text-purple-900 transition-all active:scale-95 shadow-sm shrink-0"
                >
                  <Users className="w-3.5 h-3.5 text-purple-700" />
                  <span className="hidden sm:inline">Personel</span>
                </button>
              )}

              {/* Admin Audit Logs Shortcut */}
              {userRole === 'ADMIN' && onOpenAuditLogs && (
                <button
                  onClick={onOpenAuditLogs}
                  title="Kullanıcı İşlem & Denetim Logları"
                  className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold text-indigo-900 transition-all active:scale-95 shadow-sm shrink-0"
                >
                  <FileClock className="w-3.5 h-3.5 text-indigo-700" />
                  <span className="hidden sm:inline">İşlem Logları</span>
                </button>
              )}

              {onOpenQuotaModal && (
                <button
                  onClick={onOpenQuotaModal}
                  title="Hane Kömür Kotası Ayarla"
                  className="flex items-center gap-0.5 sm:gap-1 px-1.5 py-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-xs font-bold text-amber-900 transition-all active:scale-95 shadow-sm shrink-0"
                >
                  <span className="text-xs">🎯</span>
                  <span className="text-[11px] sm:text-xs font-bold">{defaultQuota || 34}</span>
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

              <button
                onClick={() => {
                  setSelectedRole(userRole);
                  setInputName(userName);
                  setShowRoleModal(true);
                }}
                className="flex items-center gap-1 sm:gap-1.5 px-1.5 py-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-800 transition-all active:scale-95 shadow-sm max-w-[85px] xs:max-w-[105px] sm:max-w-[130px] shrink-0"
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

              {/* Logout Button - Always visible and pinned on right */}
              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Çıkış Yap"
                  aria-label="Çıkış Yap"
                  className="p-1.5 sm:p-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 hover:text-rose-700 transition-all active:scale-95 shadow-sm shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Desktop Navigation Bar (Visible on min-width: 1024px, hidden on mobile) */}
          {onTabChange && (
            <div className="desktop-nav-bar hidden lg:flex items-center justify-between w-full">
              <nav className="desktop-nav-tabs" role="tablist" aria-label="Masaüstü Ana Menü">
                {navTabs.map((tab) => {
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
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Sistem Çevrimiçi</span>
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-600 font-semibold">T.C. Edirne Valiliği SYDV</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Role Switcher Modal - Light Mode */}
      {showRoleModal && (
        <div className="modal-overlay" onClick={() => setShowRoleModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-600" />
                Kullanıcı Girişi / Rol Değiştir
              </h3>
              <button
                onClick={() => setShowRoleModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Giriş Türü Seçiniz
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRole('PERSONEL');
                      setPinError('');
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedRole === 'PERSONEL'
                        ? 'border-sky-500 bg-sky-50 text-slate-900 shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <User className="w-5 h-5 text-sky-600" />
                      {selectedRole === 'PERSONEL' && <CheckCircle2 className="w-4 h-4 text-sky-600" />}
                    </div>
                    <div className="text-sm font-bold text-slate-900">Saha Personeli</div>
                    <div className="text-[11px] text-slate-500">Sorgulama, Mahalle, Teslimat</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRole('ADMIN');
                      setPinError('');
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedRole === 'ADMIN'
                        ? 'border-amber-500 bg-amber-50 text-slate-900 shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Shield className="w-5 h-5 text-amber-600" />
                      {selectedRole === 'ADMIN' && <CheckCircle2 className="w-4 h-4 text-amber-600" />}
                    </div>
                    <div className="text-sm font-bold text-slate-900">Yönetici (Admin)</div>
                    <div className="text-[11px] text-slate-500">Excel Yükleme, Tonaj, Tam Yetki</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Adınız / Takma Adınız
                </label>
                <input
                  type="text"
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  placeholder="Örn: Ahmet Yılmaz"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              {selectedRole === 'ADMIN' && (
                <div>
                  <label className="block text-xs font-bold text-amber-800 uppercase tracking-wider mb-1.5">
                    Yönetici PIN Kodu
                  </label>
                  <input
                    type="password"
                    value={adminPin}
                    onChange={(e) => setAdminPin(e.target.value)}
                    placeholder="Varsayılan: 1234"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-amber-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                  {pinError && <p className="text-xs text-rose-600 mt-1 font-medium">{pinError}</p>}
                  <p className="text-[11px] text-slate-500 mt-1">İpucu: Varsayılan PIN <span className="text-amber-800 font-mono font-bold">1234</span> veya <span className="text-amber-800 font-mono font-bold">admin</span></p>
                </div>
              )}

              <div className="pt-2 space-y-2">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowRoleModal(false)}
                    className="btn-secondary flex-1"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    className="btn-primary flex-1 font-bold"
                  >
                    Kaydet
                  </button>
                </div>
                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowRoleModal(false);
                      onLogout();
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                  >
                    <LogOut className="w-4 h-4 text-rose-600" />
                    Oturumu Kapat (Çıkış Yap)
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
