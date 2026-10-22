# Код, вынутый из приложения

## index.tsx — регистрация service worker (вставить перед `const rootElement`)

```ts
// Register Service Worker for Offline support
if ('serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // In development, unregister any active service worker to prevent stale caching issues
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister().then(() => {
          console.log('Active Service Worker unregistered in development mode');
        });
      }
    });
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((registration) => {
          console.log('SW registered: ', registration);
        })
        .catch((registrationError) => {
          console.log('SW registration failed: ', registrationError);
        });
    });
  }
}
```

## hooks/useLibrary.ts — открытие файлов через PWA File Handling API

Вставить перед `const handleExternalFolderPicked = async`.

```ts
  const handleExternalFilePickedRef = useRef(handleExternalFilePicked);
  useEffect(() => { handleExternalFilePickedRef.current = handleExternalFilePicked; }, [handleExternalFilePicked]);

  // PWA File Handling API support
  useEffect(() => {
    if ('launchQueue' in window) {
      try {
        (window as any).launchQueue?.setConsumer(async (launchParams: any) => {
          if (!launchParams.files || !launchParams.files.length) return;
          const files: File[] = [];
          for (const handle of launchParams.files) {
            try {
              const file = await handle.getFile();
              files.push(file);
            } catch (e) {
              console.error("Could not get file from handle", e);
            }
          }
          if (files.length > 0) {
            handleExternalFilePickedRef.current(files);
          }
        });
      } catch (e) {
        console.error("Error setting up launchQueue", e);
      }
    }
  }, []);
```

## index.html — теги в `<head>`

```html
    <link rel="manifest" href="./manifest.json" />
    <link rel="icon" type="image/svg+xml" href="./icon.svg" />
    <link rel="icon" type="image/png" sizes="64x64" href="./favicon.png" />
    <link rel="apple-touch-icon" href="./apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="CoolRead" />
```
