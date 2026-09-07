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

// Service worker registration removed — no /service-worker.js exists in
// public/. Background caching is not intended for this origin.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><OfflineBanner /><LanguageProvider><App /></LanguageProvider></AppErrorBoundary>
    <Toaster />
  </StrictMode>
);
