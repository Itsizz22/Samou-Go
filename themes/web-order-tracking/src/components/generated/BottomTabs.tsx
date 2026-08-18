import React from 'react';
import { Home, Search, ClipboardList, User } from 'lucide-react';
import { useLanguage } from '@samou-go/ui';
interface BottomTabsProps {
  activeTab: 'home' | 'explore' | 'orders' | 'profile';
  onTabChange?: (tab: 'home' | 'explore' | 'orders' | 'profile') => void;
}
export const BottomTabs: React.FC<BottomTabsProps> = ({
  activeTab,
  onTabChange
}) => {
  const { t } = useLanguage();
  const tabs = [{
    id: 'home',
    label: 'Home',
    arabicLabel: 'الرئيسية',
    icon: Home
  }, {
    id: 'explore',
    label: 'Explore',
    arabicLabel: 'استكشف',
    icon: Search
  }, {
    id: 'orders',
    label: 'Orders',
    arabicLabel: 'طلباتي',
    icon: ClipboardList
  }, {
    id: 'profile',
    label: 'Profile',
    arabicLabel: 'حسابي',
    icon: User
  }] as const;
  return <nav className="fixed inset-x-0 bottom-0 z-50 bg-surface/95 backdrop-blur border-t border-line shadow-raised px-4 safe-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        return <button key={tab.id} onClick={() => onTabChange?.(tab.id)} aria-current={isActive ? 'page' : undefined} className={`flex flex-col items-center justify-center w-full h-full transition-colors rounded-xl active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand/40 ${isActive ? 'text-brand' : 'text-ink-muted hover:text-ink-soft'}`}>
              <Icon className={`w-6 h-6 mb-1 ${isActive ? 'fill-current' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
              <div className="flex flex-col items-center leading-none">
                <span className="text-micro font-bold uppercase tracking-wider">
                  {t(tab.arabicLabel, tab.label)}
                </span>
              </div>
            </button>;
      })}
      </div>
    </nav>;
};
export default BottomTabs;
