import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.samougo.customer',
  appName: "Samou'Go",
  webDir: 'dist',
  server: {
    // cleartext must be false in production — all API traffic must go over
    // HTTPS.  Set to true only in local dev (capacitor.config.ts can be
    // overridden per environment via capacitor.config.json).
    cleartext: false,
  },
  plugins: {
    // iOS status bar: dark text on light background, matching the app's
    // light-mode header.
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#10b981',
    },
    // Splash screen shown while the Capacitor WebView loads.
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#10b981',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
