import { Home, Heart, Package, Search, User, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';

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
  label: string;
  icon: LucideIcon;
}

const TABS: TabItem[] = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/orders', label: 'Orders', icon: Package },
  { to: '/favorites', label: 'Favorites', icon: Heart },
  { to: '/profile', label: 'Profile', icon: User },
];

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-20 border-t border-line bg-surface/95 px-4 safe-bottom pt-3 shadow-raised"
      aria-label="Bottom navigation"
    >
      <div className="mx-auto flex max-w-md items-center justify-around" dir="ltr">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/home'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 transition active:scale-95 ${
                isActive ? 'text-brand' : 'text-ink-muted'
              }`
            }
          >
            <Icon size={20} fill={to === '/home' ? 'currentColor' : 'none'} />
            <span className="text-micro font-semibold">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
