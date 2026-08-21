import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.samougo.customer',
  appName: "Samou'Go",
  webDir: 'dist',
  server: {
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    // Enable hardware-accelerated WebView for CSS/framer-motion animations
    allowMixedContent: false,
    webContentsDebuggingEnabled: true,
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
