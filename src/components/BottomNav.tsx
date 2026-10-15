'use client';

import { Search, Route as RouteIcon, Clock, History, Truck, FileSpreadsheet, BarChart3, BookOpen } from 'lucide-react';

export type NavTab = 'search' | 'route' | 'shift' | 'analytics' | 'archive' | 'tonnage' | 'import' | 'guide';

interface BottomNavProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  userRole?: 'ADMIN' | 'PERSONEL';
  hasActiveShift?: boolean;
  incompleteDeliveriesCount?: number;
  importErrorsCount?: number;
  activeRouteStopsCount?: number;
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
  const tabs = [
    {
      id: 'search' as NavTab,
      label: 'Sorgu',
      icon: Search,
      badge: incompleteDeliveriesCount && incompleteDeliveriesCount > 0 ? incompleteDeliveriesCount : undefined,
      badgeColor: 'bg-amber-600 text-white'
    },
    {
      id: 'route' as NavTab,
      label: 'Rota',
      icon: RouteIcon,
      badge: activeRouteStopsCount && activeRouteStopsCount > 0 ? activeRouteStopsCount : undefined,
      badgeColor: 'bg-sky-600 text-white font-extrabold'
    },
    {
      id: 'shift' as NavTab,
      label: 'Çalışma Saati',
      icon: Clock
    },
    {
      id: 'analytics' as NavTab,
      label: 'İstatistik',
      icon: BarChart3
    },
    {
      id: 'archive' as NavTab,
      label: 'Arşiv',
      icon: History
    },
    {
      id: 'tonnage' as NavTab,
      label: 'Tonaj',
      icon: Truck
    },
    {
      id: 'import' as NavTab,
      label: 'Excel',
      icon: FileSpreadsheet,
      badge: importErrorsCount && importErrorsCount > 0 ? importErrorsCount : undefined,
      badgeColor: 'bg-rose-600 text-white'
    },
    {
      id: 'guide' as NavTab,
      label: 'Kılavuz',
      icon: BookOpen
    }
  ];

  // Restrict Analytics, Archive, and Excel tabs strictly to ADMIN
  const adminOnlyTabs: NavTab[] = ['analytics', 'archive', 'import'];
  const visibleTabs = tabs.filter(
    (tab) => !adminOnlyTabs.includes(tab.id) || userRole === 'ADMIN'
  );

  return (
    <nav className="mobile-nav-bar no-print lg:hidden" role="navigation" aria-label="Ana Menü">
      {visibleTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = currentTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`nav-item ${isActive ? 'active' : ''}`}
            aria-selected={isActive}
          >
            <div className="nav-icon-container relative">
              <Icon className="w-5 h-5" />
              {tab.badge !== undefined && (
                <span className={`nav-badge ${tab.badgeColor || 'bg-rose-600 text-white'}`}>
                  {typeof tab.badge === 'number' && tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </div>
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
