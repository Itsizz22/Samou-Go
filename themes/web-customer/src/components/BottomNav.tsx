import { useEffect, useState } from 'react';
import { Home, Heart, Package, Search, User, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '@samou-go/ui';
import { useAuth } from '@/hooks/useApi';
import { API_URL, getToken } from '@samou-go/api-client';
import { OrderStatus } from '@samou-go/shared-types';

/**
 * Samou' Go — customer bottom tab bar.
 *
 * Rendered with React Router's `NavLink`, so each tab is a real client-side
 * route (`/`, `/search`, `/orders`, `/favorites`, `/profile`) that swaps the
 * screen inside the WebView without a page load and without handing control to
 * the OS browser.
 *
 * The Orders tab shows a badge with the count of active (non-terminal) orders
 * so customers can see at a glance whether they have orders in progress.
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

/** Terminal statuses — orders in these states are no longer "active." */
const TERMINAL: ReadonlySet<string> = new Set([OrderStatus.DELIVERED, OrderStatus.CANCELLED]);

/**
 * Lightweight hook: polls for active order count every 30 s (unauthenticated
 * users get 0). No-op when logged out.
 */
function useActiveOrderCount(): number {
  const auth = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!auth.user) { setCount(0); return; }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function fetchCount(): Promise<void> {
      try {
        const token = getToken();
        if (!token) return;
        // Fetch active orders — any status that is not DELIVERED or CANCELLED.
        // We fetch all statuses the server supports and count non-terminal ones.
        const res = await fetch(`${API_URL}/api/v1/orders?pageSize=50`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const json = await res.json() as { data?: { items?: Array<{ status: string }> } };
        const items = json.data?.items ?? [];
        const active = items.filter((o) => !TERMINAL.has(o.status as OrderStatus)).length;
        if (!cancelled) setCount(active);
      } catch {
        // Network error — keep previous count.
      }
    }

    void fetchCount();
    timer = setInterval(() => void fetchCount(), 30_000);

    return () => { cancelled = true; clearInterval(timer); };
  }, [auth.user]);

  return count;
}

export function BottomNav() {
  const { t } = useLanguage();
  const activeOrders = useActiveOrderCount();

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
              `relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-bold transition-all duration-200 active:scale-[0.95] ${
                isActive
                  ? 'bg-brand-tint text-brand-deep shadow-sm'
                  : 'text-ink-muted active:bg-canvas'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <Icon
                    size={21}
                    strokeWidth={isActive ? 2.5 : 1.8}
                    fill={isActive && to === '/home' ? 'currentColor' : 'none'}
                    className={isActive ? 'text-brand-deep' : ''}
                  />
                  {/* Active-order badge — only on the Orders tab */}
                  {to === '/orders' && activeOrders > 0 && (
                    <span className="absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[8px] font-black text-white">
                      {activeOrders > 9 ? '9+' : activeOrders}
                    </span>
                  )}
                </span>
                <span className="leading-none">{t(labelAr, labelEn)}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
