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

  // Register service worker for PWA offline capability.
  // It will serve the app shell assets from cache and fallback to network for API data.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').then((reg) => {
      console.log('SW registered: ', reg);
    }).catch((err) => {
      console.error('SW registration failed: ', err);
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
