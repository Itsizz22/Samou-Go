import { useEffect, useRef } from 'react';
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

  function setTheme(theme: Theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  setTheme(theme);

  return (
    <Routes>
      <Route path="/" element={<SamouGoHome />} />
      <Route path="/stores/:storeId" element={<StoreDetailScreen />} />
      <Route path="/cart" element={<CartScreen />} />
      <Route path="/checkout" element={<CheckoutScreen />} />
      <Route path="/orders" element={<OrdersScreen />} />
      <Route path="/orders/:orderId" element={<OrderTrackingScreen />} />
      <Route path="/profile" element={<ProfileScreen />} />
      <Route path="/favorites" element={<FavoritesScreen />} />
      <Route path="/search" element={<SearchScreen />} />
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/register" element={<RegisterScreen />} />
      <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
      {/* Any other deep link falls back to the feed instead of a blank screen. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
