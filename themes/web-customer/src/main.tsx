import { AppErrorBoundary, LanguageProvider, OfflineBanner, bootstrapApp } from '@samou-go/ui';
import { StrictMode } from 'react';
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

  // Register the PWA service worker (public/service-worker.js). Production only:
// a stale dev-time cache fights Vite HMR. The worker is registered after load
// so it never delays first paint, and registration failures are logged quietly
// instead of surfacing an error overlay.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
      .catch((err: unknown) => {
        console.warn('SW registration failed: ', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><OfflineBanner /><LanguageProvider><BrowserRouter>
      <CartProvider><FavoritesProvider><App /></FavoritesProvider></CartProvider>
    </BrowserRouter></LanguageProvider></AppErrorBoundary>
    <Toaster />
  </StrictMode>
);
