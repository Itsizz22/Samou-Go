import React from 'react';
import { ChevronLeft, ShoppingCart } from 'lucide-react';
import { NotificationBell, type BellNotification } from '@samou-go/ui';
interface HeaderNavProps {
  title: string;
  arabicTitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  showCart?: boolean;
  cartCount?: number;
  onCartClick?: () => void;
  /** Live notifications — turns the header bell into a real notification center. */
  notifications?: BellNotification[];
  /** Namespace for the bell's read-marker, e.g. `"tracking"`. */
  storageKey?: string;
  onNotificationNavigate?: (href: string) => void;
}
export const HeaderNav: React.FC<HeaderNavProps> = ({
  title,
  arabicTitle,
  showBack = true,
  onBack,
  showCart = true,
  cartCount = 0,
  onCartClick,
  notifications,
  storageKey = 'customer',
  onNotificationNavigate
}) => {
  return <header className="sticky top-0 z-50 flex items-center justify-between w-full h-16 px-4 bg-surface border-b border-line shadow-card">
      <div className="flex items-center gap-3">
        {showBack && <button onClick={onBack} className="p-2 transition-colors rounded-full hover:bg-canvas active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand/40" aria-label="Go back">
            <ChevronLeft className="w-6 h-6 text-ink-soft rtl:rotate-180" />
          </button>}
        <div className="flex flex-col">
          <h1 className="text-lg font-bold text-ink leading-tight">
            {title}
          </h1>
          {arabicTitle && <span className="text-sm font-medium text-ink-muted">
              {arabicTitle}
            </span>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {showCart && <button onClick={onCartClick} className="relative p-2 transition-colors rounded-full hover:bg-canvas active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand/40" aria-label="Cart">
            <ShoppingCart className="w-6 h-6 text-ink-soft" />
            {cartCount > 0 && <span dir="ltr" className="absolute top-1 end-1 flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-brand rounded-full border-2 border-surface">
                {cartCount}
              </span>}
          </button>}
        <NotificationBell
          notifications={notifications ?? []}
          storageKey={storageKey}
          max={8}
          onNavigate={(href) => onNotificationNavigate ? onNotificationNavigate(href) : (window.location.href = href)}
        />
      </div>
    </header>;
};
export default HeaderNav;
