import { bootstrapApp } from '@samou-go/ui';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CartProvider>
        <FavoritesProvider>
          <App />
        </FavoritesProvider>
      </CartProvider>
    </BrowserRouter>
    <Toaster />
  </StrictMode>
);
