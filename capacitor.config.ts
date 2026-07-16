import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.heyhey.app',
  appName: 'hey1',
  webDir: 'dist',
  server: {
    url: 'https://06d98cdb-8a33-4aee-8f84-71ecd386a16f.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;