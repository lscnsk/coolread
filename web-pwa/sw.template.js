// Service worker of the installed web app. The build writes the list of its files below,
// so after the first visit the app opens without internet. A new build has a new version:
// its files are fetched in the background and the app switches over on the next start.
const VERSION = '__VERSION__';
const CACHE = 'coolread-' + VERSION;
const FILES = __FILES__;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One by one: a single missing file must not stop the rest
    for (const f of FILES) {
      try { await cache.add(new Request(f, { cache: 'reload' })); } catch (e) {}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('coolread-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only the app's own files; books, catalogs and covers from other sites go straight to the network
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      // The page itself: fresh when online, the cached copy offline
      try {
        const res = await fetch(req);
        if (res.ok) cache.put('./', res.clone());
        return res;
      } catch (e) {
        return (await cache.match('./')) || (await cache.match('./index.html')) || Response.error();
      }
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  })());
});
