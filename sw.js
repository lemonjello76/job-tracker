/* Self-destructing service worker.
   The previous caching worker was serving a stale copy of the app. Browsers
   re-fetch sw.js to check for updates; because this file changed, this worker
   installs, wipes all caches, unregisters itself, and reloads any open clients
   so they get the live network version. */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => c.navigate(c.url));
    } catch (e) { /* best effort */ }
  })());
});

// Pass every request straight through to the network — no caching.
self.addEventListener('fetch', () => {});
