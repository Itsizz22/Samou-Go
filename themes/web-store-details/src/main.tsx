import { LanguageProvider, bootstrapApp } from '@samou-go/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import './index.css';
import App from './App.tsx';

// Handles: light-mode lock, Framer Motion skip-animations in editable mode,
// and global broken-image fallback. Single source of truth in @samou-go/ui.
bootstrapApp();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider><App /></LanguageProvider>
    <Toaster />
  </StrictMode>
);
