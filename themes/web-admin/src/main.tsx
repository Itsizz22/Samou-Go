import { AppErrorBoundary, LanguageProvider, OfflineBanner, bootstrapApp } from '@samou-go/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import './index.css';
import App from './App.tsx';

// Handles: light-mode lock (opted out below — admin ships its own dark-mode
// toggle), Framer Motion skip-animations in editable mode, and the global
// broken-image fallback. Single source of truth in @samou-go/ui.
bootstrapApp({ allowDarkMode: true });
// Initial document direction is set by bootstrapApp + LanguageProvider below.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><OfflineBanner /><LanguageProvider><App /></LanguageProvider></AppErrorBoundary>
    <Toaster />
  </StrictMode>
);
