import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Theme } from './settings/types';
import { SamouGoHome } from './components/generated/SamouGoHome';
import { OrdersScreen } from './screens/OrdersScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { SearchScreen } from './screens/SearchScreen';
import { StoreDetailScreen } from './screens/StoreDetailScreen';
import { CartScreen } from './screens/CartScreen';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { OrderTrackingScreen } from './screens/OrderTrackingScreen';
import { ForgotPasswordScreen, LoginScreen, RegisterScreen } from './screens/AuthScreens';
import { BootScreen } from './components/BootScreen';
import { useAuth, type Auth } from './hooks/useApi';
// %IMPORT_STATEMENT

const theme: Theme = 'light';

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

  function setTheme(theme: Theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  setTheme(theme);

  if (!auth.ready || !splashElapsed) return <BootScreen />;

  return (
    <StartupRoutes auth={auth} />
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
