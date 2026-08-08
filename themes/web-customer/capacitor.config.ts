import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.samougo.customer',
  appName: "Samou'Go",
  webDir: 'dist',
  server: {
    cleartext: true,
    // All customer screens are internal React Router routes now, so the app no
    // longer links out to sibling apps. The allow-list below is retained for
    // LAN dev hosts only (vite dev server / API during native debugging).
    allowNavigation: ['192.168.0.111', 'localhost'],
  },
};

export default config;
