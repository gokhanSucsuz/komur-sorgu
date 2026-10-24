'use client';

import { Search, UserPlus, Route as RouteIcon, Clock, History, Truck, FileSpreadsheet, BarChart3, BookOpen } from 'lucide-react';

export type NavTab = 'search' | 'add_household' | 'route' | 'shift' | 'analytics' | 'archive' | 'tonnage' | 'import' | 'guide';

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
      id: 'add_household' as NavTab,
      label: 'Hane Ekle',
      icon: UserPlus
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
      icon: FileSpreadsheet
    },
    {
      id: 'guide' as NavTab,
      label: 'Kılavuz',
      icon: BookOpen
    }
  ];

  // Restrict Analytics and Excel tabs strictly to ADMIN (Archive and Hane Ekle are open to all users)
  const adminOnlyTabs: NavTab[] = ['analytics', 'import'];
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
