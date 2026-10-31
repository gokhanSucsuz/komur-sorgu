'use client';

import { useState, useEffect } from 'react';
import {
  Search,
  UserPlus,
  Route as RouteIcon,
  Clock,
  History,
  Truck,
  FileSpreadsheet,
  BarChart3,
  BookOpen,
  LayoutGrid,
  X,
  ChevronRight
} from 'lucide-react';

export type NavTab =
  | 'search'
  | 'add_household'
  | 'route'
  | 'shift'
  | 'analytics'
  | 'archive'
  | 'tonnage'
  | 'import'
  | 'guide';

interface BottomNavProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  userRole?: 'ADMIN' | 'PERSONEL' | 'MUDUR';
  hasActiveShift?: boolean;
  incompleteDeliveriesCount?: number;
  importErrorsCount?: number;
  activeRouteStopsCount?: number;
}

interface TabDef {
  id: NavTab;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof Search;
  badge?: number;
  badgeColor?: string;
}

export default function BottomNav({
  currentTab,
  onTabChange,
  userRole = 'PERSONEL',
  hasActiveShift,
  incompleteDeliveriesCount,
  importErrorsCount,
  activeRouteStopsCount
}: BottomNavProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const tabs: TabDef[] = [
    {
      id: 'search',
      label: 'Vatandaş Sorgu',
      shortLabel: 'Sorgu',
      description: 'TC, isim ve mahalle bazlı hane sorgulama ve teslimat',
      icon: Search,
      badge: incompleteDeliveriesCount && incompleteDeliveriesCount > 0 ? incompleteDeliveriesCount : undefined,
      badgeColor: 'bg-amber-600 text-white'
    },
    {
      id: 'route',
      label: 'Dağıtım Rotası',
      shortLabel: 'Rota',
      description: 'Saha dağıtım sırası, navigasyon ve durak yönetimi',
      icon: RouteIcon,
      badge: activeRouteStopsCount && activeRouteStopsCount > 0 ? activeRouteStopsCount : undefined,
      badgeColor: 'bg-sky-600 text-white font-extrabold'
    },
    {
      id: 'shift',
      label: 'Çalışma Saati',
      shortLabel: 'Mesai',
      description: 'Günlük saha mesai başlangıç, bitiş ve vardiya kaydı',
      icon: Clock
    },
    {
      id: 'archive',
      label: 'Teslimat Arşivi',
      shortLabel: 'Arşiv',
      description: 'Tamamlanan teslimatlar, tutanaklar ve geçmiş kayıtlar',
      icon: History
    },
    {
      id: 'add_household',
      label: 'Yeni Hane Ekle',
      shortLabel: 'Hane Ekle',
      description: 'Listeye tekil vatandaş veya ek kömür kaydı ekleme',
      icon: UserPlus
    },
    {
      id: 'tonnage',
      label: 'Tonaj & Kantar',
      shortLabel: 'Tonaj',
      description: 'Araç kantar fişleri, gelen kömür ve stok mutabakatı',
      icon: Truck
    },
    {
      id: 'analytics',
      label: 'İstatistik & Rapor',
      shortLabel: 'İstatistik',
      description: 'Mahalle bazlı dağıtım oranları ve yönetici özetleri',
      icon: BarChart3
    },
    {
      id: 'import',
      label: 'Excel Aktarımı',
      shortLabel: 'Excel',
      description: 'Toplu Excel listesi yükleme ve veri doğrulama',
      icon: FileSpreadsheet,
      badge: importErrorsCount && importErrorsCount > 0 ? importErrorsCount : undefined,
      badgeColor: 'bg-rose-600 text-white'
    },
    {
      id: 'guide',
      label: 'Sistem Kılavuzu',
      shortLabel: 'Kılavuz',
      description: 'Saha kullanım rehberi ve güvenlik mimarisi özeti',
      icon: BookOpen
    }
  ];

  // Role-based visibility
  const visibleTabs = tabs.filter((tab) => {
    if (tab.id === 'import') return userRole === 'ADMIN';
    if (tab.id === 'analytics') return userRole === 'ADMIN' || userRole === 'MUDUR';
    if (tab.id === 'add_household') return userRole !== 'MUDUR';
    return true;
  });

  // Primary 4 tabs on the bottom bar (zero horizontal scroll, 100% thumb reachability)
  const primaryIds: NavTab[] =
    userRole === 'MUDUR'
      ? ['search', 'route', 'analytics', 'archive']
      : ['search', 'route', 'shift', 'archive'];

  const primaryTabs = primaryIds
    .map((id) => visibleTabs.find((t) => t.id === id))
    .filter((t): t is TabDef => Boolean(t));

  const secondaryTabs = visibleTabs.filter((t) => !primaryIds.includes(t.id));
  const activeSecondaryTab = secondaryTabs.find((t) => t.id === currentTab);

  // Aggregate any badge on secondary tabs so user never misses an alert hidden under "Menü"
  const secondaryBadgeCount = secondaryTabs.reduce((acc, t) => acc + (t.badge || 0), 0);

  useEffect(() => {
    if (!isMoreOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMoreOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMoreOpen]);

  const handleSelectTab = (tabId: NavTab) => {
    setIsMoreOpen(false);
    onTabChange(tabId);
  };

  const MoreIcon = activeSecondaryTab ? activeSecondaryTab.icon : LayoutGrid;

  return (
    <>
      {isMoreOpen && (
        <div
          className="modal-overlay no-print lg:hidden"
          onClick={() => setIsMoreOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Tüm Modüller Menüsü"
        >
          <div
            className="modal-sheet pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
                  <LayoutGrid className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                    Modüller &amp; Saha Araçları
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Geçiş yapmak istediğiniz ekranı seçin
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
                aria-label="Menüyü Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Secondary Modules Grid */}
            <div className="space-y-2 mb-4">
              {secondaryTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = currentTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleSelectTab(tab.id)}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-all active:scale-[0.99] ${
                      isActive
                        ? 'bg-amber-50 border-amber-400 text-slate-900 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                          isActive
                            ? 'bg-amber-500 text-white border-amber-600'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-slate-900 truncate">
                            {tab.label}
                          </span>
                          {tab.id === 'shift' && hasActiveShift && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Aktif Mesai
                            </span>
                          )}
                          {tab.badge !== undefined && (
                            <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${tab.badgeColor || 'bg-rose-600 text-white'}`}>
                              {tab.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {tab.description}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-700' : 'text-slate-400'}`} />
                  </button>
                );
              })}
            </div>

            {/* Primary Shortcuts */}
            <div className="pt-3 border-t border-slate-200">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                Ana Saha Ekranları
              </div>
              <div className="grid grid-cols-4 gap-2">
                {primaryTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = currentTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleSelectTab(tab.id)}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                        isActive
                          ? 'bg-amber-50 border-amber-300 text-amber-900 font-extrabold'
                          : 'bg-slate-50 border-slate-200 text-slate-700 font-bold hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-xs truncate max-w-full">{tab.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="mobile-nav-bar no-print lg:hidden" role="navigation" aria-label="Ana Menü">
        {primaryTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id && !isMoreOpen;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelectTab(tab.id)}
              className={`nav-item ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="nav-icon-container relative">
                <Icon className="w-5 h-5" />
                {tab.id === 'shift' && hasActiveShift && tab.badge === undefined && (
                  <span
                    className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white absolute -top-0.5 -right-0.5 animate-pulse"
                    title="Aktif Mesai Devam Ediyor"
                  />
                )}
                {tab.badge !== undefined && (
                  <span className={`nav-badge ${tab.badgeColor || 'bg-rose-600 text-white'}`}>
                    {typeof tab.badge === 'number' && tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
              <span className="truncate max-w-full">{tab.shortLabel}</span>
            </button>
          );
        })}

        {/* 5th Slot: More / Active Secondary Module */}
        <button
          type="button"
          onClick={() => setIsMoreOpen((prev) => !prev)}
          className={`nav-item ${Boolean(activeSecondaryTab) || isMoreOpen ? 'active' : ''}`}
          aria-expanded={isMoreOpen}
          aria-haspopup="dialog"
          aria-label="Diğer Modüller Menüsü"
        >
          <div className="nav-icon-container relative">
            <MoreIcon className="w-5 h-5" />
            {secondaryBadgeCount > 0 && (
              <span className="nav-badge bg-rose-600 text-white">
                {secondaryBadgeCount > 99 ? '99+' : secondaryBadgeCount}
              </span>
            )}
          </div>
          <span className="truncate max-w-full">
            {activeSecondaryTab ? activeSecondaryTab.shortLabel : 'Menü'}
          </span>
        </button>
      </nav>
    </>
  );
}
