/* Rechnungen Konverter – offline app shell + vendor cache */
const CACHE = 'rechnungen-konverter-v1.6';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/transform.js',
  './js/pdf.js',
  './manifest.webmanifest',
  './vendor/pdf-lib.min.js',
  './vendor/xlsx.full.min.js',
  './icons/drop-cloud-icon.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './apple-touch-icon.png',
  './fonts/Constantia-Bold.subset.ttf',
  './fonts/Aeonis.subset.ttf',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const url = new URL(req.url);
          if (res.ok && url.origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
