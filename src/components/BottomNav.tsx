'use client';

import { Search, Clock, History, Truck, FileSpreadsheet, BarChart3 } from 'lucide-react';

export type NavTab = 'search' | 'shift' | 'analytics' | 'archive' | 'tonnage' | 'import';

interface BottomNavProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  hasActiveShift?: boolean;
  incompleteDeliveriesCount?: number;
  importErrorsCount?: number;
}

export default function BottomNav({
  currentTab,
  onTabChange,
  hasActiveShift,
  incompleteDeliveriesCount,
  importErrorsCount
}: BottomNavProps) {
  const tabs = [
    {
      id: 'search' as NavTab,
      label: 'Sorgu/Dağıtım',
      icon: Search,
      badge: incompleteDeliveriesCount && incompleteDeliveriesCount > 0 ? incompleteDeliveriesCount : undefined,
      badgeColor: 'bg-amber-600 text-white'
    },
    {
      id: 'shift' as NavTab,
      label: 'Mesai',
      icon: Clock,
      badge: hasActiveShift ? '●' : undefined,
      badgeColor: 'bg-emerald-500 text-white animate-pulse'
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
    }
  ];

  return (
    <nav className="mobile-nav-bar no-print" role="navigation" aria-label="Ana Menü">
      {tabs.map((tab) => {
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
