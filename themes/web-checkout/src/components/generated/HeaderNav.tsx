import React from 'react';
import { ChevronLeft, ShoppingCart, Bell } from 'lucide-react';
interface HeaderNavProps {
  title: string;
  arabicTitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  showCart?: boolean;
  cartCount?: number;
  onCartClick?: () => void;
}
export const HeaderNav: React.FC<HeaderNavProps> = ({
  title,
  arabicTitle,
  showBack = true,
  onBack,
  showCart = true,
  cartCount = 0,
  onCartClick
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
        <button className="p-2 transition-colors rounded-full hover:bg-canvas active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand/40" aria-label="Notifications">
          <Bell className="w-6 h-6 text-ink-soft" />
        </button>
      </div>
    </header>;
};
export default HeaderNav;
