/**
 * Samou' Go — navigation drawer.
 *
 * The "+hamburger+ menu" (3-lines icon in the app headers) opens a start-edge
 * (right in RTL) side drawer with full app navigation, a quick theme switcher
 * and sign-out. It is a dialog: a scrim backdrop covers the app, clicking the
 * scrim or pressing Esc closes it, and body scroll is locked while it is open.
 * Framer Motion drives the slide so there is no layout shift.
 *
 * The drawer is mounted once at the app root (`App.tsx`) so it overlays every
 * route; any screen opens it through `useDrawer().openDrawer()`.
 */

import { AnimatePresence, motion } from 'framer-motion';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UserRole } from '@samou-go/shared-types';
import {
  Heart,
  Home as HomeIcon,
  LogOut,
  Moon,
  Package,
  Palette,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Sun,
  Truck,
  UserRound,
  X,
} from 'lucide-react';
import { LanguageToggle, useLanguage } from '@samou-go/ui';
import { useAuth } from '@/hooks/useApi';
import { useTheme } from '@/theme/ThemeProvider';
import { ACCENT_OPTIONS } from '@/theme/presets';
import { roleHomePath } from '@/lib/roles';

interface DrawerContextValue {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function useDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useDrawer must be used within NavigationDrawerProvider');
  return ctx;
}

export function NavigationDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  // Route change closes the drawer — navigation and drawer never interleave.
  const pathname = location.pathname;
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const value = useMemo(
    () => ({ open, openDrawer, closeDrawer }),
    [open, openDrawer, closeDrawer]
  );

  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

/* ---------------------------------------------------------------------------
 * Drawer
 * ------------------------------------------------------------------------- */

const NAV_ITEMS = [
  { to: '/', labelAr: 'الرئيسية', labelEn: 'Home', icon: HomeIcon },
  { to: '/search', labelAr: 'البحث', labelEn: 'Search', icon: Search },
  { to: '/orders', labelAr: 'طلباتي', labelEn: 'Orders', icon: Package },
  { to: '/favorites', labelAr: 'المفضلة', labelEn: 'Favorites', icon: Heart },
  { to: '/profile', labelAr: 'ملفي', labelEn: 'Profile', icon: UserRound },
  { to: '/settings', labelAr: 'الإعدادات', labelEn: 'Settings', icon: Settings },
] as const;

export function NavigationDrawer() {
  const { open, closeDrawer } = useDrawer();
  const auth = useAuth();
  const { accent, mode, setAccent, setMode } = useTheme();
  const { dir } = useLanguage();
  const location = useLocation();

  // Slide direction follows the document direction: in RTL the drawer sits on
  // the inline-start (right) edge, so it enters from the right. Reactive to the
  // language context so a flip to English re-animates from the correct edge.
  const away = useMemo(() => (dir === 'rtl' ? '100%' : '-100%'), [dir]);

  // Lock body scroll + Esc handling while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, closeDrawer]);

  const go = () => closeDrawer();

  const handleSignOut = () => {
    auth.signOut();
    closeDrawer();
  };

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            key="drawer-scrim"
            type="button"
            aria-label="إغلاق القائمة / Close menu"
            onClick={closeDrawer}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.aside
            key="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="قائمة التنقل / Navigation menu"
            className="fixed inset-y-0 start-0 z-50 flex w-[290px] max-w-[85vw] flex-col bg-surface text-ink shadow-raised"
            initial={{ x: away }}
            animate={{ x: 0 }}
            exit={{ x: away }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            {/* Brand + close */}
            <header className="flex items-center justify-between bg-brand px-5 py-5 text-white safe-top">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                  <ShoppingCart size={18} />
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-extrabold">Samou' Go</p>
                  <p dir="ltr" className="text-[10px] text-white/80">
                    Menu
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="إغلاق / Close"
                className="rounded-full p-2 transition hover:bg-white/15 active:scale-95"
              >
                <X size={20} />
              </button>
            </header>

            {/* Signed-in identity — or a sign-in shortcut. */}
            {auth.user ? (
              <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                {auth.user.profileImageUrl ? (
                  <img
                    src={auth.user.profileImageUrl}
                    alt={auth.user.name}
                    className="h-11 w-11 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-tint text-sm font-extrabold text-brand-deep">
                    {auth.user.name.slice(0, 2)}
                  </span>
                )}
                <div className="min-w-0 text-end">
                  <p className="truncate text-sm font-extrabold">{auth.user.name}</p>
                  <p className="truncate text-[11px] text-ink-muted" dir="ltr">
                    {auth.user.phone}
                  </p>
                </div>
              </div>
            ) : (
              <Link
                to="/login"
                onClick={closeDrawer}
                className="flex items-center gap-3 border-b border-line px-5 py-4 transition hover:bg-brand-surface"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
                  <UserRound size={20} />
                </span>
                <div className="text-end">
                  <p className="text-sm font-extrabold">تسجيل الدخول</p>
                  <p className="text-[11px] text-ink-muted" dir="ltr">
                    Sign in to order
                  </p>
                </div>
              </Link>
            )}

            {/* Staff role switcher — a captain/store manager browsing the feed
                can jump straight to their merged dashboard. */}
            {auth.user &&
              (auth.user.role === UserRole.CAPTAIN || auth.user.role === UserRole.STORE_MANAGER) && (
                <div className="border-b border-line px-5 py-4">
                  <Link
                    to={roleHomePath(auth.user.role)}
                    onClick={closeDrawer}
                    className="flex items-center gap-3 rounded-2xl bg-brand-tint px-4 py-3 transition hover:bg-brand-surface active:scale-[0.99]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
                      {auth.user.role === UserRole.CAPTAIN ? <Truck size={18} /> : <Store size={18} />}
                    </span>
                    <span className="flex-1 text-end">
                      <span className="block text-sm font-extrabold text-brand-deep">
                        {auth.user.role === UserRole.CAPTAIN
                          ? 'واجهة الكابتن'
                          : 'واجهة مدير المتجر'}
                      </span>
                      <span dir="ltr" className="block text-[10px] font-medium text-ink-muted">
                        {auth.user.role === UserRole.CAPTAIN
                          ? 'Captain dashboard'
                          : 'Store manager dashboard'}
                      </span>
                    </span>
                    <span className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-extrabold text-white">
                      فتح
                    </span>
                  </Link>
                </div>
              )}

            {/* Navigation links */}
            <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Drawer navigation">
              <ul className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.to);
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        onClick={go}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition active:scale-[0.99] ${
                          active
                            ? 'bg-brand-tint font-extrabold text-brand-deep'
                            : 'font-bold text-ink-soft hover:bg-brand-surface'
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                            active ? 'bg-brand text-white' : 'bg-canvas text-ink-muted'
                          }`}
                        >
                          <Icon size={18} />
                        </span>
                        <span className="flex-1 text-end">
                          <span className="block">{item.labelAr}</span>
                          <span dir="ltr" className="block text-[10px] font-medium text-ink-subtle">
                            {item.labelEn}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {/* Quick theme switcher */}
              <div className="mt-4 rounded-2xl border border-line bg-canvas p-4">
                <p className="flex items-center gap-2 text-xs font-extrabold text-ink">
                  <Palette size={14} className="text-brand" />
                  <span>لون الواجهة</span>
                  <span dir="ltr" className="text-[10px] font-medium text-ink-subtle">
                    Theme
                  </span>
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2" role="radiogroup" aria-label="Accent colour">
                    {ACCENT_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        role="radio"
                        aria-checked={accent === option.key}
                        aria-label={option.labelAr}
                        title={option.labelAr}
                        onClick={() => setAccent(option.key)}
                        className={`flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95 ${
                          accent === option.key
                            ? 'ring-2 ring-ink/40 ring-offset-2 ring-offset-canvas'
                            : ''
                        }`}
                      >
                        <span
                          className="h-7 w-7 rounded-full"
                          style={{ backgroundColor: option.swatch }}
                        />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
                    aria-pressed={mode === 'dark'}
                    className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[11px] font-bold text-ink-soft transition hover:text-brand active:scale-95"
                  >
                    {mode === 'light' ? <Moon size={13} /> : <Sun size={13} />}
                    <span dir="ltr">{mode === 'light' ? 'Dark' : 'Light'}</span>
                  </button>
                  <LanguageToggle />
                </div>
              </div>
            </nav>

            {/* Footer actions */}
            {auth.user && (
              <footer className="border-t border-line px-4 py-3 safe-bottom">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger-tint bg-danger-tint/40 px-4 py-3 text-xs font-extrabold text-danger-ink transition hover:bg-danger-tint active:scale-[0.98]"
                >
                  <LogOut size={15} />
                  تسجيل الخروج <span dir="ltr" className="font-medium text-danger/70">Sign out</span>
                </button>
              </footer>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}