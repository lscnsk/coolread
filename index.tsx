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
import { Capacitor } from '@capacitor/core';
import App from './App';
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
const isWebApp = import.meta.env.VITE_TARGET === 'web' && !Capacitor.isNativePlatform();
if ('serviceWorker' in navigator) {
  if (isWebApp) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
  } else {
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).catch(() => {});
    if ('caches' in window) {
      caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
    }
  }
}
// Books live in the browser's storage: ask it not to clear them when space runs low (Safari does)
if (isWebApp) navigator.storage?.persist?.().catch(() => {});

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