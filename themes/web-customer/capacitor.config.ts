import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.samougo.customer',
  appName: "Samou Quick",
  webDir: 'dist',
  plugins: { PushNotifications: { presentationOptions: ['banner', 'list', 'sound', 'badge'] } },
  server: {
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    useLegacyBridge: true,
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
