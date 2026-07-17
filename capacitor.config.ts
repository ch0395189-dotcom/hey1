import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.heyhey.app',
  appName: 'hey1',
  webDir: 'dist',
  // Pin schemes so localStorage origin is stable across app installs/updates.
  // If the scheme changes between builds, the WebView treats it as a new
  // origin and the previous auth session in localStorage becomes invisible.
  android: {
    // Persistent WebView storage — required so localStorage survives after
    // the app is fully closed (Supabase session lives here).
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
};

export default config;