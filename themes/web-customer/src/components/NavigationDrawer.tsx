import { useAndroidOverlayBack } from '@/lib/androidBack';
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
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UserRole } from '@samou-go/shared-types';
import {
  Heart,
  Headphones,
  Home as HomeIcon,
  LogOut,
  Moon,
  Package,
  Check,
  ChevronLeft,
  Search,
  Settings,
  Store,
  Sun,
  Truck,
  UserRound,
  X,
} from 'lucide-react';
import { BrandLogo, useLanguage } from '@samou-go/ui';
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
  { to: '/support', labelAr: 'المساعدة والدعم', labelEn: 'Support', icon: Headphones },
  { to: '/profile', labelAr: 'ملفي', labelEn: 'Profile', icon: UserRound },
  { to: '/settings', labelAr: 'الإعدادات', labelEn: 'Settings', icon: Settings },
] as const;

export function NavigationDrawer() {
  const { open, closeDrawer } = useDrawer();
  useAndroidOverlayBack(open, closeDrawer);
  const auth = useAuth();
  const { accent, mode, setAccent, setMode } = useTheme();
  const { dir, language, toggleLanguage } = useLanguage();
  const { t } = useLanguage();
  const location = useLocation();

  // Slide direction follows the document direction: in RTL the drawer sits on
  // the inline-start (right) edge, so it enters from the right. Reactive to the
  // language context so a flip to English re-animates from the correct edge.
  const away = useMemo(() => (dir === 'rtl' ? '100%' : '-100%'), [dir]);

  // Swipe-to-close: dragging the panel toward the outside of the screen closes
  // it. RTL panel sits on the inline-start (right) edge, so a swipe toward the
  // viewport's outer edge is +x there; LTR is -x. A wrapper div carries a plain
  // transform so the panel follows the finger 1:1; framer-motion only handles
  // the enter/exit slide (its `animate` prop owns the motion value, which would
  // swallow synthetic-touch drags).
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const SWIPE_CLOSE_THRESHOLD = 96;
  const MAX_PULL = 320;
  const gestureStart = useRef<number | null>(null);

  const onTouchStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (touch) {
      gestureStart.current = touch.pageX;
      setDragging(true);
    }
  }, []);

  const onTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      if (gestureStart.current === null) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.pageX - gestureStart.current;
      if (dx === 0) return;
      // Closing direction: RTL pull = +x, LTR pull = -x. Opposing drags only
      // rubber-band so the panel never opens further than its rest position.
      const closing = dir === 'rtl' ? 1 : -1;
      const raw = dx * closing;
      setDragX(Math.min(MAX_PULL, Math.max(-MAX_PULL, raw > 0 ? dx : dx * 0.15)));
    },
    [dir]
  );

  const onTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      const start = gestureStart.current;
      gestureStart.current = null;
      setDragging(false);
      if (start !== null) {
        const touch = event.changedTouches[0];
        const closing = dir === 'rtl' ? 1 : -1;
        const distance = touch ? (touch.pageX - start) * closing : 0;
        if (distance >= SWIPE_CLOSE_THRESHOLD) closeDrawer();
      }
      setDragX(0);
    },
    [closeDrawer, dir]
  );

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
    to === '/' ? ['/', '/home'].includes(location.pathname) : location.pathname.startsWith(to);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            key="drawer-scrim"
            type="button"
            aria-label={t('إغلاق القائمة', 'Close menu')}
            onClick={closeDrawer}
            className="fixed inset-0 z-40 bg-slate-900/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.aside
            key="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t('قائمة التنقل', 'Navigation menu')}
            className="fixed inset-y-0 start-0 z-50"
            style={{ touchAction: 'pan-y' }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={() => {
              gestureStart.current = null;
              setDragging(false);
              setDragX(0);
            }}
            initial={{ x: away }}
            animate={{ x: 0 }}
            exit={{ x: away }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
          <div
            className={`flex h-full w-70 max-w-[85vw] flex-col overflow-y-auto bg-surface text-ink shadow-raised will-change-transform ${
              dragging ? '' : 'transition-transform duration-300 ease-out'
            }`}
            style={dragX ? { transform: `translateX(${dragX}px)` } : undefined}
          >
            {/* Brand + close */}
            <header className="flex items-center justify-between shrink-0 bg-brand px-5 pb-2 pt-8 text-white" style={{ paddingBlockStart: 'max(2rem, env(safe-area-inset-top))' }}>
              <div className="flex items-center gap-2.5">
                <BrandLogo size={28} />
                <div className="leading-tight">
                  <p className="text-base font-extrabold">{t('سموع كويك', 'Samou Quick')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label={t('إغلاق', 'Close')}
                className="sq-icon-button rounded-full bg-white/15 p-2 transition hover:bg-white/15 active:scale-95"
              >
                <X size={20} />
              </button>
            </header>

            {/* Signed-in identity — or a sign-in shortcut. */}
            {auth.user ? (
              <div className="flex shrink-0 items-center gap-3 rounded-b-3xl bg-brand px-5 pb-6 pt-2 text-white">
                {auth.user.profileImageUrl ? (
                  <img
                    src={auth.user.profileImageUrl}
                    alt={auth.user.name}
                    className="h-11 w-11 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sm font-extrabold text-brand">
                    {auth.user.name.slice(0, 2)}
                  </span>
                )}
                <div className="min-w-0 text-end">
                  <p className="truncate text-sm font-extrabold">{auth.user.name}</p>
                  <p className="truncate text-[11px] text-white/80" dir="ltr">
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
                  <p className="text-sm font-extrabold">{t('تسجيل الدخول', 'Sign in to order')}</p>
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
                        {t(
                          auth.user.role === UserRole.CAPTAIN ? 'واجهة الكابتن' : 'واجهة مدير المتجر',
                          auth.user.role === UserRole.CAPTAIN
                            ? 'Captain dashboard'
                            : 'Store manager dashboard'
                        )}
                      </span>
                    </span>
                    <span className="rounded-full bg-brand px-2.5 py-1 text-micro font-extrabold text-white">
                      {t('فتح', 'Open')}
                    </span>
                  </Link>
                </div>
              )}

            {/* Navigation links */}
            <nav className="shrink-0 px-4 py-4" aria-label="Drawer navigation">
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
                        className={`flex items-center min-h-11 gap-3 rounded-xl px-3 py-1.5 text-sm transition active:scale-[0.99] ${
                          active
                            ? 'bg-brand-surface font-bold text-brand'
                            : 'font-semibold text-ink hover:bg-brand-surface'
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            active ? 'bg-surface text-brand' : 'bg-canvas text-ink-muted'
                          }`}
                        >
                          <Icon size={18} />
                        </span>
                        <span className="flex-1 text-start">{t(item.labelAr, item.labelEn)}</span>
                        <ChevronLeft size={16} className="shrink-0 rtl:rotate-0 ltr:rotate-180" />
                      </Link>
                    </li>
                  );
                })}
              </ul>

            </nav>
            <section className="shrink-0 border-t border-line px-5 py-3" aria-label={t('لون الواجهة', 'Appearance')}>
              <h2 className="text-sm font-bold">{t('لون الواجهة', 'Appearance')}</h2>
              <div className="flex items-center justify-between gap-2">
                <button type="button" role="switch" aria-checked={mode === 'dark'} onClick={() => setMode(mode === 'light' ? 'dark' : 'light')} className="flex min-h-11 items-center gap-2 text-xs text-ink-muted">
                  {mode === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                  <span className={`flex h-5 w-9 items-center rounded-full p-0.5 ${mode === 'dark' ? 'justify-end bg-brand' : 'justify-start bg-line'}`}><span className="h-4 w-4 rounded-full bg-white shadow-sm" /></span>
                  <span>{t('الوضع الداكن', 'Dark mode')}</span>
                </button>
                <button type="button" onClick={toggleLanguage} aria-label={language === 'ar' ? 'English' : 'العربية'} className="flex min-h-11 min-w-11 items-center justify-center text-xs font-bold"><span className="rounded-lg border border-line bg-canvas px-2 py-1">{language === 'ar' ? 'EN' : 'عربي'}</span></button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-ink-muted">{t('اختيار السمة', 'Accent colour')}</span>
                <div className="flex" role="radiogroup" aria-label={t('لون التمييز', 'Accent colour')}>
                  {ACCENT_OPTIONS.map(option => <button key={option.key} type="button" role="radio" aria-checked={accent === option.key} aria-label={t(option.labelAr, option.labelEn)} onClick={() => setAccent(option.key)} className="flex h-11 w-11 items-center justify-center rounded-full"><span className="flex h-5 w-5 items-center justify-center rounded-full text-white" style={{backgroundColor:option.swatch}}>{accent === option.key && <Check size={13} strokeWidth={3} />}</span></button>)}
                </div>
              </div>
            </section>

            {/* Footer actions */}
            {auth.user && (
              <footer className="shrink-0 border-t border-line px-5 py-5 safe-bottom">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-danger-ink/50 bg-danger-tint/40 px-4 py-3 text-xs font-extrabold text-danger-ink transition hover:bg-danger-tint active:scale-[0.98]"
                >
                  <LogOut size={15} />
                  {t('تسجيل الخروج', 'Sign out')}
                </button>
              </footer>
            )}
          </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
