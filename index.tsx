import React from 'react';
import ReactDOM from 'react-dom/client';
// Literata is bundled (no Google Fonts): upright 400 and 700 only, as in the
// original app. There is deliberately no italic file: italic text is the
// upright Literata slanted by the browser, which is the look the app had.
import '@fontsource/literata/400.css';
import '@fontsource/literata/700.css';
import '@fontsource/dancing-script/700.css';
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/uncial-antiqua/400.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/700.css';
import '@fontsource/parisienne/400.css';
import '@fontsource/share-tech-mono/400.css';
import '@fontsource/vt323/400.css';
import '@fontsource/satisfy/400.css';
import '@fontsource/poiret-one/400.css';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { initTelegram, isLite } from './utils/telegram';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Suppress console.log in production to optimize performance on mobile WebViews
if (import.meta.env.PROD) {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}

// The web version (npm run build:web) works offline through a service worker (web-pwa/).
// The APK and the dev server have none: remove one left behind so it cannot serve stale files.
// The Telegram version lives in a folder of the web version's site and leaves its worker alone.
const isWebApp = import.meta.env.VITE_TARGET === 'web' && !Capacitor.isNativePlatform();
if ('serviceWorker' in navigator) {
  if (isWebApp) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
  } else if (import.meta.env.VITE_TARGET !== 'telegram') {
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).catch(() => {});
    if ('caches' in window) {
      // Only the app's own files: the read-aloud voice is kept in another cache (utils/silero/store.ts)
      caches.keys().then(keys => keys.forEach(k => { if (k.startsWith('coolread-')) caches.delete(k); })).catch(() => {});
    }
  }
}
// Books live in the browser's storage: ask it not to clear them when space runs low (Safari does)
if (isWebApp || isLite) navigator.storage?.persist?.().catch(() => {});

initTelegram();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);