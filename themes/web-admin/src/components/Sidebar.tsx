/**
 * Samou' Go — Admin sidebar.
 *
 * Extracted from the dashboard so the panel shell stays readable and the same
 * navigation can be reused in the desktop rail and the mobile overlay. The nav
 * state (`activeNav`) lives in the dashboard; this component is purely presentational.
 */
import {
  ClipboardList,
  LogOut,
  Package,
  ShoppingBag,
  Store,
  Settings,
  Truck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

export interface AdminNavItem {
  id: string;
  ar: string;
  icon: LucideIcon;
}

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { id: 'Dashboard', ar: 'نظرة عامة', icon: ClipboardList },
  { id: 'Stores', ar: 'المتاجر والمطاعم', icon: Store },
  { id: 'Captains', ar: 'السائقين', icon: Truck },
  { id: 'Users', ar: 'العملاء', icon: Users },
  { id: 'Orders', ar: 'الطلبات', icon: Package },
  { id: 'Settings', ar: 'الإعدادات', icon: Settings },
] as const;

interface AdminSidebarProps {
  userName: string;
  activeNav: string;
  /** Whether the mobile overlay is visible. */
  open: boolean;
  onNavigate: (id: string) => void;
  onClose: () => void;
  onSignOut: () => void;
}

export function AdminSidebar({ userName, activeNav, open, onNavigate, onClose, onSignOut }: AdminSidebarProps) {
  return (
    <aside
      className={`fixed inset-y-0 start-0 z-30 w-[244px] flex-col bg-brand-deep px-4 py-6 text-white transition-transform duration-200 ${
        open ? 'flex translate-x-0' : 'hidden -translate-x-full md:flex md:translate-x-0'
      }`}
      aria-label="Admin sidebar"
    >
      <div className="flex items-center gap-3 px-3 pb-9" dir="ltr">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-brand">
          <ShoppingBag size={22} strokeWidth={2.6} />
        </span>
        <span>
          <strong className="block text-[18px] tracking-[-0.03em]">Samou' Go</strong>
          <span className="block text-[10px] font-medium text-white/70">السموع جو · ADMIN</span>
        </span>
        <button
          type="button"
          className="ms-auto rounded-lg p-1 text-white/80 hover:bg-surface/10 md:hidden"
          onClick={onClose}
          aria-label="Close sidebar"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1" aria-label="Primary navigation">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
          Workspace
        </p>
        <ul className="space-y-1">
          {ADMIN_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start transition ${
                    active ? 'bg-brand text-white shadow-raised' : 'text-white/75 hover:bg-surface/10 hover:text-white'
                  }`}
                >
                  <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                  <span className="flex-1 text-[13px] font-semibold">{item.id}</span>
                  <span dir="rtl" className={`text-[12px] ${active ? 'text-white/85' : 'text-white/65'}`}>
                    {item.ar}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 pt-5">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tint text-sm font-extrabold text-brand-deep">
            {userName.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-[12px]">{userName}</strong>
            <span className="block truncate text-[11px] text-white/70">مدير النظام</span>
          </span>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            className="ms-auto rounded-lg p-1 text-white/70 transition hover:bg-surface/10 hover:text-white"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default AdminSidebar;
