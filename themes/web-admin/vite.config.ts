import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Stable framework chunks can be cached across screen updates.
        manualChunks(id) {
          const modulePath = id.replaceAll('\\', '/');
          if (!modulePath.includes('/node_modules/')) return;
          if (/\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(modulePath)) return 'react-vendor';
          if (/\/(framer-motion|motion-dom|motion-utils)\//.test(modulePath)) return 'motion-vendor';
          if (/\/(leaflet|react-leaflet|@react-leaflet)\//.test(modulePath)) return 'map-vendor';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
server: {
    port: 5179,
    strictPort: true,
  },
});
