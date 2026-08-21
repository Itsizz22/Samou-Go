import { Home, Heart, Package, Search, User, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '@samou-go/ui';

/**
 * Samou' Go — customer bottom tab bar.
 *
 * Rendered with React Router's `NavLink`, so each tab is a real client-side
 * route (`/`, `/search`, `/orders`, `/favorites`, `/profile`) that swaps the
 * screen inside the WebView without a page load and without handing control to
 * the OS browser.
 */

interface TabItem {
  to: string;
  labelAr: string;
  labelEn: string;
  icon: LucideIcon;
}

const TABS: readonly TabItem[] = [
  { to: '/home', labelAr: 'الرئيسية', labelEn: 'Home', icon: Home },
  { to: '/search', labelAr: 'بحث', labelEn: 'Search', icon: Search },
  { to: '/orders', labelAr: 'طلباتي', labelEn: 'Orders', icon: Package },
  { to: '/favorites', labelAr: 'المفضلة', labelEn: 'Favorites', icon: Heart },
  { to: '/profile', labelAr: 'حسابي', labelEn: 'Profile', icon: User },
];

export function BottomNav() {
  const { t } = useLanguage();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-20 border-t border-line/80 bg-surface/95 px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2 shadow-nav backdrop-blur-md"
      aria-label={t('التنقل السفلي', 'Bottom navigation')}
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-stretch gap-1">
        {TABS.map(({ to, labelAr, labelEn, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/home'}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-1 rounded-field px-1 text-micro font-bold transition-all duration-200 active:scale-[0.96] ${
                isActive
                  ? 'bg-brand-tint text-brand-deep shadow-card'
                  : 'text-ink-muted hover:bg-canvas hover:text-ink-soft'
              }`
            }
          >
            {({ isActive }) => <><Icon size={20} strokeWidth={isActive ? 2.4 : 1.9} fill={isActive && to === '/home' ? 'currentColor' : 'none'} /><span>{t(labelAr, labelEn)}</span></>}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
