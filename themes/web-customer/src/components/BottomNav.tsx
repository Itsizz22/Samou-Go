import { useCart } from '@/components/CartProvider';
import { useEffect, useState } from 'react';
import { Home, ShoppingCart, Heart, FileText, User, BadgePercent, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '@samou-go/ui';
import { useAuth, useOrders } from '@/hooks/useApi';
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
  { to: '/offers', labelAr: 'العروض', labelEn: 'Offers', icon: BadgePercent },
  { to: '/orders', labelAr: 'طلباتي', labelEn: 'Orders', icon: FileText },
  { to: '/cart', labelAr: 'السلة', labelEn: 'Cart', icon: ShoppingCart },
  { to: '/favorites', labelAr: 'المفضلة', labelEn: 'Favorites', icon: Heart },
  { to: '/profile', labelAr: 'حسابي', labelEn: 'Profile', icon: User },
];

/** Terminal statuses — orders in these states are no longer "active." */
const TERMINAL: ReadonlySet<string> = new Set([OrderStatus.DELIVERED, OrderStatus.CANCELLED]);

/**
 * Lightweight hook: polls for active order count every 30 s (unauthenticated
 * users get 0). No-op when logged out.
 */
function useActiveOrderCount() {
  const auth = useAuth();
  const orders = useOrders({ pageSize: 50 }, { enabled: Boolean(auth.user), pollMs: 30_000 });
  const count = auth.ready && auth.user
    ? orders.data?.items.filter((order) => !TERMINAL.has(order.status)).length ?? 0
    : 0;
  return { count, error: orders.error, refresh: orders.refresh };
}

export function BottomNav() {
  const { t } = useLanguage();
  const cart = useCart();
  const { count: activeOrders, error: ordersError, refresh: refreshOrders } = useActiveOrderCount();
  const [cartBounce, setCartBounce] = useState(false);
  const [cartRipple, setCartRipple] = useState(false);

  // Listen for cart:item-added events and trigger bounce + ripple animation.
  useEffect(() => {
    const handler = () => {
      setCartBounce(true);
      setCartRipple(true);
      const bounceTimeout = setTimeout(() => setCartBounce(false), 500);
      const rippleTimeout = setTimeout(() => setCartRipple(false), 700);
      return () => { clearTimeout(bounceTimeout); clearTimeout(rippleTimeout); };
    };
    window.addEventListener('cart:item-added', handler);
    return () => window.removeEventListener('cart:item-added', handler);
  }, []);

  return (
    <nav
      className="sq-bottom-nav fixed bottom-0 inset-x-0 z-20 border-t border-line bg-surface px-4"
      aria-label={t('التنقل السفلي', 'Bottom navigation')}
    >
      {ordersError && (
        <p role="status" className="mx-auto flex max-w-md items-center justify-between gap-2 text-xs text-danger">
          <span>{ordersError.localizedMessage}</span>
          <button type="button" onClick={refreshOrders} className="shrink-0 underline">
            {t('إعادة المحاولة', 'Retry')}
          </button>
        </p>
      )}
      <div className="mx-auto grid max-w-md grid-cols-6 items-stretch gap-0.5 sm:grid-cols-6">
        {TABS.map(({ to, labelAr, labelEn, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/home'}
            className={({ isActive }) =>
              `relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'text-brand'
                  : 'text-ink-muted hover:bg-canvas'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <Icon
                    size={21}
                    strokeWidth={isActive ? 2.5 : 1.8}
                    fill="none"
                    className={`${
                      to === '/cart' && cartBounce ? 'cart-bounce' : ''
                    } ${
                      to === '/cart' && cartRipple ? 'animate-[greenRipple_0.6s_ease-out_both]' : ''
                    } ${
                      isActive ? 'text-brand-deep' : ''
                    }`}
                  />
                  {to === '/cart' && cart.itemCount > 0 && <span className="absolute -inset-e-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-white" dir="ltr">{cart.itemCount > 99 ? "99+" : cart.itemCount}</span>}
                  {/* Active-order badge — only on the Orders tab */}
                  {to === '/orders' && activeOrders > 0 && (
                    <span className="absolute -inset-e-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[8px] font-black text-white animate-[cartPop_0.3s_var(--ease-spring)_both]">
                      {activeOrders > 9 ? '9+' : activeOrders}
                    </span>
                  )}
                </span>
                <span className="text-[11px] leading-4 truncate w-full text-center">{t(labelAr, labelEn)}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
