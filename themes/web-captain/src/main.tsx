import { AppErrorBoundary, LanguageProvider, OfflineBanner, bootstrapApp } from '@samou-go/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import './index.css';
import App from './App.tsx';

// Handles: dark-mode (owned by the shared DarkModeToggle), Framer Motion
// skip-animations in editable mode, and global broken-image fallback. Single
// source of truth in @samou-go/ui.
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
    <AppErrorBoundary><OfflineBanner /><LanguageProvider><App /></LanguageProvider></AppErrorBoundary>
    <Toaster />
  </StrictMode>
);
