import type { CapacitorConfig } from '@capacitor/cli';

// FLAVOR=bimbo builds BimboRead: pink splash. The Android app id and name
// come from the Gradle product flavor (android/app/build.gradle).
const isBimbo = process.env.VITE_FLAVOR === 'bimbo';

const config: CapacitorConfig = {
  "appId": "com.coolread.app",
  "appName": isBimbo ? "BimboRead" : "CoolRead",
  "webDir": "dist",
  "server": {
    "androidScheme": "https"
  },
  // OPDS servers and their cover images are often plain http
  "android": {
    "allowMixedContent": true
  },
  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 3000,
      "launchAutoHide": false,
      "launchFadeOutDuration": 300,
      "backgroundColor": isBimbo ? "#FFF0F5" : "#23211f",
      "androidScaleType": "CENTER_INSIDE",
      "showSpinner": false,
      "androidSpinnerStyle": "large",
      "spinnerColor": "#fffff0",
      "splashFullScreen": true,
      "splashImmersive": true
    }
  }
};

export default config;
