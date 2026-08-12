import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ExternalLink, LogOut } from 'lucide-react';
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
import { ForgotPasswordScreen, LoginScreen, RegisterScreen } from './screens/AuthScreens';
import { BootScreen } from './components/BootScreen';
import { NavigationDrawer, NavigationDrawerProvider } from './components/NavigationDrawer';
import { ThemeProvider } from './theme/ThemeProvider';
import { useAuth, useRoleGate, type Auth } from './hooks/useApi';
import type { PublicUser } from '@samou-go/shared-types';
import { USER_ROLE_LABELS } from '@samou-go/shared-types';
// %IMPORT_STATEMENT

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
  const auth = useAuth();
  const gate = useRoleGate('customer');
  const [splashElapsed, setSplashElapsed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSplashElapsed(true), 1_650);
    return () => window.clearTimeout(timer);
  }, []);

  if (!auth.ready || !splashElapsed) return <BootScreen />;

  return (
    <ThemeProvider>
      <NavigationDrawerProvider>
        {gate.denied && auth.user ? (
          <RoleRedirectScreen user={auth.user} targetUrl={gate.targetUrl} onSignOut={auth.signOut} />
        ) : (
          <StartupRoutes auth={auth} />
        )}
        {!gate.denied && <NavigationDrawer />}
      </NavigationDrawerProvider>
    </ThemeProvider>
  );
}

/**
 * Wrong-app gate: a STORE_MANAGER / CAPTAIN / ADMIN who signs into the customer
 * storefront sees this instead of the catalogue. The API still enforces every
 * permission server-side; this only spares staff from browsing a strangers' UI.
 */
function RoleRedirectScreen({
  user,
  targetUrl,
  onSignOut,
}: {
  user: PublicUser;
  targetUrl: string | null;
  onSignOut: () => void;
}) {
  const label = USER_ROLE_LABELS[user.role];
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas p-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-tint text-brand-deep">
        <LogOut size={26} />
      </span>
      <div>
        <h1 className="text-lg font-extrabold text-ink">هذا التطبيق للعملاء فقط</h1>
        <p dir="ltr" className="mt-1 text-[11px] font-medium text-ink-muted">
          This app is for customers
        </p>
      </div>
      <p className="max-w-[18rem] text-xs leading-relaxed text-ink-soft">
        أنت مسجّل كـ <span className="font-bold text-ink">«{label.ar}»</span> — تطبيقك المخصص
        متاح من الرابط بالأسفل.
      </p>
      {targetUrl && (
        <a
          href={targetUrl}
          className="flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-xs font-extrabold text-white transition hover:bg-brand-dark active:scale-[0.98]"
        >
          <ExternalLink size={14} />
          فتح تطبيق {label.ar} <span dir="ltr" className="font-medium text-white/80">Open {label.en}</span>
        </a>
      )}
      <button
        type="button"
        onClick={onSignOut}
        className="flex items-center gap-2 rounded-xl border border-line px-5 py-3 text-xs font-bold text-ink-muted transition hover:bg-brand-surface active:scale-[0.98]"
      >
        <LogOut size={14} />
        تسجيل الخروج <span dir="ltr">Sign out</span>
      </button>
    </div>
  );
}

function ProtectedRoute({ auth, children }: { auth: Auth; children: React.ReactNode }) {
  if (!auth.ready) return <BootScreen />;
  return auth.user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AuthRoute({ auth, children }: { auth: Auth; children: React.ReactNode }) {
  if (!auth.ready) return <BootScreen />;
  return auth.user ? <Navigate to="/home" replace /> : <>{children}</>;
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
      <Route path="/login" element={<AuthRoute auth={auth}><LoginScreen /></AuthRoute>} />
      <Route path="/register" element={<AuthRoute auth={auth}><RegisterScreen /></AuthRoute>} />
      <Route path="/forgot-password" element={<AuthRoute auth={auth}><ForgotPasswordScreen /></AuthRoute>} />
      <Route path="*" element={<Navigate to={auth.user ? '/home' : '/login'} replace />} />
    </Routes>
  );
}

export default App;
