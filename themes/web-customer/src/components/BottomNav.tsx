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
      className="fixed bottom-0 inset-x-0 z-20 border-t border-line/80 bg-surface/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-nav backdrop-blur-md safe-bottom"
      aria-label={t('التنقل السفلي', 'Bottom navigation')}
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-stretch gap-0.5">
        {TABS.map(({ to, labelAr, labelEn, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/home'}
            className={({ isActive }) =>
              `flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-bold transition-all duration-200 active:scale-[0.95] ${
                isActive
                  ? 'bg-brand-tint text-brand-deep shadow-sm'
                  : 'text-ink-muted active:bg-canvas'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={21}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  fill={isActive && to === '/home' ? 'currentColor' : 'none'}
                  className={isActive ? 'text-brand-deep' : ''}
                />
                <span className="leading-none">{t(labelAr, labelEn)}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
