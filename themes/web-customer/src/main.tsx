import { AppErrorBoundary, LanguageProvider, OfflineBanner, bootstrapApp } from '@samou-go/ui';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import './index.css';
import App from './App.tsx';
import { CartProvider } from './components/CartProvider';
import { FavoritesProvider } from './components/FavoritesProvider';

// Handles: light-mode lock, Framer Motion skip-animations in editable mode,
// and global broken-image fallback. Single source of truth in @samou-go/ui.
// The customer app ships a dark-mode toggle, so it opts out of the forced
// light-mode lock — ThemeProvider owns the `.dark` class instead.
bootstrapApp({ allowDarkMode: true });

// ---------------------------------------------------------------------------
// Crash protection: catch unhandled promise rejections from Capacitor plugins
// or third-party SDKs that would otherwise crash the WebView.
// ---------------------------------------------------------------------------
window.addEventListener('unhandledrejection', (event) => {
  console.error('[app] Unhandled promise rejection:', event.reason);
  event.preventDefault(); // Prevent the WebView from crashing.
});

// ---------------------------------------------------------------------------
// Service worker: only register on web (Vercel), NOT on Capacitor native.
// On Android the service worker caches stale index.html with old JS bundle
// hashes, causing blank screens and infinite reload loops on app reopen.
// ---------------------------------------------------------------------------
const isNative =
  typeof window !== 'undefined' &&
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  (window.location.protocol === 'capacitor:' ||
    window.location.hostname === 'localhost' && navigator.userAgent.includes('Capacitor'));

if ('serviceWorker' in navigator && import.meta.env.PROD && !isNative) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
      .catch((err: unknown) => {
        console.warn('[app] SW registration failed:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <OfflineBanner />
    <LanguageProvider>
      <BrowserRouter>
        <CartProvider>
          <FavoritesProvider>
            <App />
          </FavoritesProvider>
        </CartProvider>
      </BrowserRouter>
    </LanguageProvider>
    <Toaster />
  </AppErrorBoundary>,
);
