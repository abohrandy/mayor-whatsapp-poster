import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.whatsappposter.app',
  appName: 'WhatsApp Group Poster',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
