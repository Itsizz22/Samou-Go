import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Loader2, MapPin, X } from 'lucide-react';
import { UserRole, type UserRole as UserRoleValue } from '@samou-go/shared-types';
import { useLanguage } from '@samou-go/ui';
import { updateMyLocation } from '@samou-go/api-client';
import { SamouGoHome } from './components/generated/SamouGoHome';
import { OrdersScreen } from './screens/OrdersScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { SearchScreen } from './screens/SearchScreen';
import { StoreDetailScreen } from './screens/StoreDetailScreen';
import { CartScreen } from './screens/CartScreen';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { OrderTrackingScreen } from './screens/OrderTrackingScreen';
import { CustomRequestsScreen } from './screens/CustomRequestsScreen';
import { ForgotPasswordScreen, LoginScreen, RegisterScreen } from './screens/AuthScreens';
import { CustomerAuthGate } from './components/CustomerAuthGate';
import { BootScreen } from './components/BootScreen';
import { NavigationDrawer, NavigationDrawerProvider } from './components/NavigationDrawer';
import { ThemeProvider } from './theme/ThemeProvider';
import { useAuth, type Auth } from './hooks/useApi';
import { roleHomePath } from './lib/roles';
import { registerForPushNotifications } from './lib/notifications';
import { getToken } from '@samou-go/api-client';
// %IMPORT_STATEMENT

/**
 * The Captain and Store Manager dashboards are merged into this single-entry
 * app under `/captain/*` and `/store-manager/*`. They are heavy, so they are
 * code-split with `React.lazy` and only fetched when a role-gated route mounts.
 */
const CaptainDashboard = lazy(() =>
  import('./staff/captain/SamouGoCaptain').then((module) => ({ default: module.SamouGoCaptain }))
);
const StoreManagerDashboard = lazy(() =>
  import('./staff/store-manager/SamouGoStoreManager').then((module) => ({
    default: module.SamouGoStoreManager,
  }))
);

/**
 * The in-app home for a signed-in user's role. Staff roles land in their merged
 * dashboard instead of the customer feed; customers go to the feed root. This
 * is the single place that maps role → redirect target (no `location.replace`
 * loops — everything stays inside the SPA router).
 */

/**
 * Android hardware back button → SPA history.
 *
 * The app is now a single React Router SPA, so the OS back button must walk the
 * in-app history instead of handing the whole WebView to the system. When the
 * WebView has history (`canGoBack`) we navigate `-1`; on a deep-linked first
 * screen with no history we go home instead of quitting; only on the home route
 * itself do we let Capacitor exit the app. The plugin is imported lazily so the
 * web build (vite dev, desktop) never pays for it, and any registration failure
 * in a plain browser is swallowed.
 */
function useAndroidBackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  useEffect(() => {
    let removeListener: (() => void) | undefined;
    let active = true;

    const wire = async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handler = await App.addListener('backButton', ({ canGoBack }) => {
          if (!active) return;
          if (canGoBack) {
            navigate(-1);
          } else if (pathnameRef.current !== '/') {
            navigate('/', { replace: true });
          } else {
            void App.exitApp();
          }
        });
        removeListener = () => {
          void handler.remove();
        };
      } catch {
        // Plain browser — no hardware back button, nothing to wire.
      }
    };

    void wire();
    return () => {
      active = false;
      removeListener?.();
    };
  }, [navigate]);
}

function App() {
  useAndroidBackButton();
  // The merged app serves the customer storefront plus the Captain and Store
  // Manager dashboards, so those three roles are allowed at the session level.
  // An ADMIN (or any other role) token on this origin is a foreign session and
  // is signed out by the gate instead of rendering a wrong-role UI.
  const auth = useAuth({
    allowedRoles: [UserRole.CUSTOMER, UserRole.CAPTAIN, UserRole.STORE_MANAGER],
  });
  const [splashElapsed, setSplashElapsed] = useState(false);

  // Minimum splash duration — show brand moment even if auth resolves fast.
  useEffect(() => {
    const timer = window.setTimeout(() => setSplashElapsed(true), 1_650);
    return () => window.clearTimeout(timer);
  }, []);

  // Register for push notifications when the user is authenticated.
  // Wrapped in try/catch — PushNotifications plugin may not be available
  // on all platforms or may throw on permission denial.
  useEffect(() => {
    if (auth.ready && auth.user) {
      const token = getToken();
      if (token) {
        registerForPushNotifications(token).catch((err: unknown) => {
          console.warn('[app] Push registration failed:', err);
        });
      }
    }
  }, [auth.ready, auth.user]);

  // Show splash until BOTH auth is resolved AND minimum duration elapsed.
  if (!auth.ready || !splashElapsed) return <BootScreen />;

  return (
    <ThemeProvider>
      <NavigationDrawerProvider>
        <StartupRoutes auth={auth} />
        <NavigationDrawer />
        <CustomerLocationPrompt auth={auth} />
      </NavigationDrawerProvider>
    </ThemeProvider>
  );
}

function ProtectedRoute({ auth, children }: { auth: Auth; children: React.ReactNode }) {
  // Guard: auth must be resolved before any route renders. The App component
  // already shows BootScreen while auth is loading — returning null here
  // avoids mounting/unmounting BootScreen inside the route tree (which causes
  // remount loops and "Throttling navigation" warnings).
  if (!auth.ready || !auth.user) return <Navigate to="/login" replace />;
  if (auth.user.role !== UserRole.CUSTOMER) {
    return <Navigate to={roleHomePath(auth.user.role)} replace />;
  }
  return <>{children}</>;
}

function AuthRoute({ auth, children }: { auth: Auth; children: React.ReactNode }) {
  if (!auth.ready) return null;
  return auth.user ? <Navigate to={roleHomePath(auth.user.role)} replace /> : <>{children}</>;
}

/**
 * Role gate for the merged staff routes. Grants access ONLY to the requested
 * role; unauthorised users (including other signed-in roles) are sent back to
 * the customer feed, and anonymous users to the sign-in screen — never to the
 * guarded path again, so there is no redirect loop.
 */
function RoleGuard({
  auth,
  role,
  children,
}: {
  auth: Auth;
  role: UserRoleValue;
  children: ReactNode;
}) {
  if (!auth.ready) return null;
  if (!auth.user) return <Navigate to="/login" replace />;
  if (auth.user.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Suspense boundary shared by the lazy staff dashboards. */
function StaffFallback() {
  return <BootScreen />;
}

function StartupRoutes({ auth }: { auth: Auth }) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/home" element={<ProtectedRoute auth={auth}><SamouGoHome /></ProtectedRoute>} />
      <Route path="/stores/:storeId" element={<ProtectedRoute auth={auth}><StoreDetailScreen /></ProtectedRoute>} />
      <Route path="/cart" element={<ProtectedRoute auth={auth}><CartScreen /></ProtectedRoute>} />
      <Route path="/checkout" element={<ProtectedRoute auth={auth}><CheckoutScreen /></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute auth={auth}><OrdersScreen /></ProtectedRoute>} />
      <Route path="/orders/:orderId" element={<ProtectedRoute auth={auth}><OrderTrackingScreen /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute auth={auth}><ProfileScreen /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute auth={auth}><SettingsScreen /></ProtectedRoute>} />
      <Route path="/favorites" element={<ProtectedRoute auth={auth}><FavoritesScreen /></ProtectedRoute>} />
      <Route path="/search" element={<ProtectedRoute auth={auth}><SearchScreen /></ProtectedRoute>} />
      <Route path="/custom-requests" element={<ProtectedRoute auth={auth}><CustomRequestsScreen /></ProtectedRoute>} />
      <Route path="/login" element={<AuthRoute auth={auth}><LoginScreen /></AuthRoute>} />
      <Route path="/otp-login" element={<AuthRoute auth={auth}><CustomerAuthGate auth={auth} /></AuthRoute>} />
      <Route path="/register" element={<AuthRoute auth={auth}><RegisterScreen /></AuthRoute>} />
      <Route path="/forgot-password" element={<AuthRoute auth={auth}><ForgotPasswordScreen /></AuthRoute>} />

      {/* Merged staff apps — lazy-loaded, CAPTAIN-only. */}
      <Route
        path="/captain"
        element={
          <RoleGuard auth={auth} role={UserRole.CAPTAIN}>
            <Navigate to="/captain/dashboard" replace />
          </RoleGuard>
        }
      />
      <Route
        path="/captain/dashboard"
        element={
          <RoleGuard auth={auth} role={UserRole.CAPTAIN}>
            <Suspense fallback={<StaffFallback />}>
              <CaptainDashboard />
            </Suspense>
          </RoleGuard>
        }
      />
      <Route
        path="/captain/*"
        element={
          <RoleGuard auth={auth} role={UserRole.CAPTAIN}>
            <Suspense fallback={<StaffFallback />}>
              <CaptainDashboard />
            </Suspense>
          </RoleGuard>
        }
      />

      {/* Merged staff apps — lazy-loaded, STORE_MANAGER-only. */}
      <Route
        path="/store-manager"
        element={
          <RoleGuard auth={auth} role={UserRole.STORE_MANAGER}>
            <Navigate to="/store-manager/orders" replace />
          </RoleGuard>
        }
      />
      <Route
        path="/store-manager/orders"
        element={
          <RoleGuard auth={auth} role={UserRole.STORE_MANAGER}>
            <Suspense fallback={<StaffFallback />}>
              <StoreManagerDashboard />
            </Suspense>
          </RoleGuard>
        }
      />
      <Route
        path="/store-manager/*"
        element={
          <RoleGuard auth={auth} role={UserRole.STORE_MANAGER}>
            <Suspense fallback={<StaffFallback />}>
              <StoreManagerDashboard />
            </Suspense>
          </RoleGuard>
        }
      />

      {/* Catch-all: only redirect if the user is actually logged in. If not,
          just render null — the /login route already handles the signed-out case.
          This prevents self-redirect loops (e.g. Navigate('/login') while on /login). */}
      <Route path="*" element={auth.user ? <Navigate to={roleHomePath(auth.user.role)} replace /> : null} />
    </Routes>
  );
}

/**
 * CustomerLocationPrompt — first-login nudge: when a CUSTOMER has no GPS
 * coords on their profile yet, offer to persist them via PUT /users/me/location.
 * Rendered app-wide (any route) because the saved location is profile state,
 * not a screen's concern. Dismissal is remembered per user so it never nags
 * again after the first skip; a successful save also clears it.
 */
function customerLocationDismissKey(userId: string): string {
  return `samou.user-location.dismissed.${userId}`;
}

function readLocationDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function markLocationDismissed(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* Private mode — the banner may reappear next load, acceptable. */
  }
}

function CustomerLocationPrompt({ auth }: { auth: Auth }) {
  const { t, language } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ar: string; en: string } | null>(null);
  const user = auth.user;

  const dismissKey = user ? customerLocationDismissKey(user.id) : '';
  const [dismissed, setDismissed] = useState(() => (dismissKey ? readLocationDismissed(dismissKey) : true));

  // Re-read on user change (e.g. a fresh login on another account).
  useEffect(() => {
    if (dismissKey) setDismissed(readLocationDismissed(dismissKey));
    else setDismissed(true);
  }, [dismissKey]);

  const needsLocation =
    user?.role === UserRole.CUSTOMER &&
    (user.latitude === null || user.longitude === null) &&
    !dismissed;

  if (!needsLocation) return null;

  const capture = () => {
    if (busy) return;
    if (!navigator.geolocation) {
      setStatus({ ar: 'تحديد الموقع غير مدعوم في هذا المتصفح', en: 'Geolocation is unavailable' });
      return;
    }
    setBusy(true);
    setStatus({ ar: 'جارٍ تحديد موقعك…', en: 'Detecting your location…' });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const updated = await updateMyLocation(coords.latitude, coords.longitude);
          if (updated) auth.setUser(updated);
          if (dismissKey) markLocationDismissed(dismissKey);
          setDismissed(true);
        } catch {
          setStatus({ ar: 'تعذّر حفظ الموقع — حاول مجدداً', en: 'Could not save your location — try again' });
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        setStatus({ ar: 'تعذّر تحديد الموقع — تحقق من إذن الموقع', en: 'Location permission was not granted' });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  };

  const skip = () => {
    if (dismissKey) markLocationDismissed(dismissKey);
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-4 top-3 z-50" role="dialog" aria-label={t('تحديد موقعك', 'Set your location')}>
      <div className="mx-auto max-w-md rounded-2xl border border-warning-tint bg-surface p-4 shadow-raised">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-dark">
            <MapPin size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-extrabold text-ink">
              {t('حدّد موقعك لتحسين خدمة التوصيل', 'Set your location for better delivery')}
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
              {t(
                'يُستخدم موقعك لمساعدتك على كتابة عنوان التوصيل بشكل أسرع.',
                'Your location is used to speed up entering your delivery address.',
              )}
            </p>
            {status && (
              <p className="mt-1 text-micro font-semibold text-ink-muted">{language === 'ar' ? status.ar : status.en}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void capture()}
                disabled={busy}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-brand px-4 text-xs font-bold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                {t('مشاركة موقعي', 'Share my location')}
              </button>
              <button
                type="button"
                onClick={skip}
                disabled={busy}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-xs font-bold text-ink-muted transition hover:bg-canvas active:scale-95 disabled:opacity-60"
              >
                <X size={13} />
                {t('لاحقاً', 'Later')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
