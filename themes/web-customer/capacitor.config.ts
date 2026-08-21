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
    allowMixedContent: false,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
