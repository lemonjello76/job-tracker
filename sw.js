/* Service Worker — minimal offline-capable cache for the Job Tracker PWA.
   Strategy: network-first for HTML (so updates ship immediately), cache-first
   for static assets (icons, manifest), with cache fallback for everything when
   offline. */

const CACHE_NAME = 'job-tracker-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // Only handle GET — let everything else (POST to Firebase/Anthropic) pass through.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Don't intercept third-party API calls (Firebase, Anthropic, Google Maps, etc.)
  if (url.origin !== self.location.origin) return;

  // For navigation / HTML: try network first, fall back to cache when offline.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then(resp => {
          // Update cache in background
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // For static assets: cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        if (resp && resp.ok && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return resp;
      });
    })
  );
});
