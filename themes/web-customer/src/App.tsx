import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { UserRole, type UserRole as UserRoleValue } from '@samou-go/shared-types';
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
import { useAuth, type Auth } from './hooks/useApi';
import { roleHomePath } from './lib/roles';
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
  const auth = useAuth();
  const [splashElapsed, setSplashElapsed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSplashElapsed(true), 1_650);
    return () => window.clearTimeout(timer);
  }, []);

  if (!auth.ready || !splashElapsed) return <BootScreen />;

  return (
    <ThemeProvider>
      <NavigationDrawerProvider>
        <StartupRoutes auth={auth} />
        <NavigationDrawer />
      </NavigationDrawerProvider>
    </ThemeProvider>
  );
}

function ProtectedRoute({ auth, children }: { auth: Auth; children: React.ReactNode }) {
  if (!auth.ready) return <BootScreen />;
  return auth.user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AuthRoute({ auth, children }: { auth: Auth; children: React.ReactNode }) {
  if (!auth.ready) return <BootScreen />;
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
  if (!auth.ready) return <BootScreen />;
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
      <Route path="/login" element={<AuthRoute auth={auth}><LoginScreen /></AuthRoute>} />
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

      <Route path="*" element={<Navigate to={auth.user ? roleHomePath(auth.user.role) : '/login'} replace />} />
    </Routes>
  );
}

export default App;