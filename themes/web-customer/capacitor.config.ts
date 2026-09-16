import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Existing iOS identity. Android uses com.samouquick.customer in android/app/build.gradle.
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
