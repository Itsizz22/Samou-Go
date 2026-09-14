import { LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { useCart } from '@/components/CartProvider';
import { useEffect, useState } from 'react';
import { Home, ShoppingCart, FileText, Menu, type LucideIcon } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
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
  { to: '/orders', labelAr: 'طلباتي', labelEn: 'Orders', icon: FileText },
  { to: '/cart', labelAr: 'السلة', labelEn: 'Cart', icon: ShoppingCart },
  { to: '/menu', labelAr: 'القائمة', labelEn: 'Menu', icon: Menu },
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
  const reduced = useReducedMotion();
  const { pathname } = useLocation();
  const menuActive = ['/menu', '/offers', '/favorites', '/profile', '/settings'].some(path => pathname === path || pathname.startsWith(`${path}/`));
  const cart = useCart();
  const { count: activeOrders, error: ordersError, refresh: refreshOrders } = useActiveOrderCount();
  const [cartFeedback, setCartFeedback] = useState(0);

  // A keyed SVG restarts one compositor-only animation on each addition.
  // No timers, layout reads, shadow animation, or background feedback work.
  useEffect(() => {
    const handler = () => { if (!document.hidden) setCartFeedback(value => value + 1); };
    window.addEventListener('cart:item-added', handler);
    return () => window.removeEventListener('cart:item-added', handler);
  }, []);

  return (
    <nav
      className="sq-bottom-nav fixed bottom-0 inset-x-0 z-20 border-t border-line px-3"
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
      <LayoutGroup id="customer-navigation"><div className="mx-auto grid max-w-md grid-cols-4 items-stretch gap-1">
        {TABS.map(({ to, labelAr, labelEn, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/home'}
            className={({ isActive }) =>
              `sq-nav-link relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand ${
                (isActive || (to === '/menu' && menuActive))
                  ? 'sq-nav-selected text-brand'
                  : 'text-ink-muted hover:bg-canvas'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {(isActive || (to === '/menu' && menuActive)) && <motion.span aria-hidden="true" layoutId="active-tab" className="absolute inset-0 rounded-2xl bg-brand-surface" transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }} />}
                <span className={`sq-nav-icon relative ${isActive || (to === '/menu' && menuActive) ? 'sq-tab-active' : ''}`}>
                  <Icon
                    key={to === '/cart' ? cartFeedback : to}
                    size={22}
                    strokeWidth={isActive || (to === '/menu' && menuActive) ? 2.5 : 1.8}
                    fill="none"
                    className={`${
                      to === '/cart' && cartFeedback > 0 ? 'sq-cart-feedback' : ''
                    } ${
                      isActive || (to === '/menu' && menuActive) ? 'text-brand-deep' : ''
                    }`}
                  />
                  {to === '/cart' && cart.itemCount > 0 && <span className="sq-nav-badge" dir="ltr">{cart.itemCount > 99 ? "99+" : cart.itemCount}</span>}
                  {/* Active-order badge — only on the Orders tab */}
                  {to === '/orders' && activeOrders > 0 && (
                    <span className="sq-nav-badge" dir="ltr">
                      {activeOrders > 99 ? '99+' : activeOrders}
                    </span>
                  )}
                </span>
                <span className="relative text-[11px] leading-4 truncate w-full text-center">{t(labelAr, labelEn)}</span>
              </>
            )}
          </NavLink>
        ))}
      </div></LayoutGroup>
    </nav>
  );
}
