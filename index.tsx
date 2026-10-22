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
import '@fontsource/creepster/400.css';
import '@fontsource/pacifico/400.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Suppress console.log in production to optimize performance on mobile WebViews
if (import.meta.env.PROD) {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}

// The app has no service worker (the PWA parts live in web-pwa/). Remove one
// left behind by an older build so it cannot serve stale cached files.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).catch(() => {});
  if ('caches' in window) {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
  }
}

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