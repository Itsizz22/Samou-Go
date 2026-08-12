import { AppErrorBoundary, OfflineBanner, bootstrapApp } from '@samou-go/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import './index.css';
import App from './App.tsx';

// Handles: light-mode lock (opted out below — admin ships its own dark-mode
// toggle), Framer Motion skip-animations in editable mode, and the global
// broken-image fallback. Single source of truth in @samou-go/ui.
bootstrapApp({ allowDarkMode: true });
document.documentElement.dir = 'rtl';
document.documentElement.lang = 'ar';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><OfflineBanner /><App /></AppErrorBoundary>
    <Toaster />
  </StrictMode>
);
