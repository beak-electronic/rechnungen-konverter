/* Rechnungen Konverter – offline app shell + vendor cache */
const CACHE = 'rechnungen-konverter-v1.7';
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

function isNavigationRequest(request) {
  if (request.mode === 'navigate') return true;
  if (request.destination === 'document') return true;
  // Avoid treating CSS/font/script as HTML just because Accept lists text/html.
  if (request.destination && request.destination !== '') return false;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

function isIconOrTouchAsset(url) {
  const p = url.pathname || '';
  return (
    /apple-touch-icon/i.test(p) ||
    /\/favicon\.png$/i.test(p) ||
    /\/icons\/icon-\d+/i.test(p)
  );
}

function isVendorOrFontAsset(url) {
  const p = url.pathname || '';
  return /\/vendor\//i.test(p) || /\/fonts\//i.test(p);
}

function isCodeAsset(url) {
  // App JS/CSS/manifest/JSON — not vendor bundles (those stay cache-first).
  if (isVendorOrFontAsset(url)) return false;
  return /\.(m?js|css|json|webmanifest)$/i.test(url.pathname || '');
}

function isServiceWorkerScript(url) {
  return /\/sw\.js$/i.test(url.pathname);
}

/** Cache match that ignores ?v= cache-bust query strings. */
function matchCache(request) {
  return caches.match(request, { ignoreSearch: true });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Add individually so one 404 does not abort the whole install.
      await Promise.all(
        ASSETS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'reload' });
            if (!res.ok) {
              console.warn('[SW] skip asset (HTTP ' + res.status + '):', url);
              return;
            }
            await cache.put(url, res);
          } catch (err) {
            console.warn('[SW] skip missing asset:', url, err);
          }
        })
      );
      await self.skipWaiting();
    })()
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

  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Never intercept Home Screen / PWA icons — iOS Safari must hit the network/CDN.
  if (isIconOrTouchAsset(url)) return;

  // Navigation + SW script: network-first; HTML shell fallback only for navigations.
  if (isNavigationRequest(req) || isServiceWorkerScript(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && isNavigationRequest(req)) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => {
              cache.put('./index.html', clone);
              cache.put('./', clone.clone());
            });
          }
          return res;
        })
        .catch(async () => {
          if (isNavigationRequest(req)) {
            const shell = (await matchCache('./index.html')) || (await matchCache('./'));
            if (shell) return shell;
          }
          return new Response('', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // Code/data (JS, MJS, CSS, JSON, manifest): network-first (revalidated), cache fallback offline.
  if (isCodeAsset(url)) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(async () => (await matchCache(req)) || new Response('', { status: 503, statusText: 'Offline' }))
    );
    return;
  }

  // Other same-origin assets (fonts, images, vendor): cache-first, then network.
  event.respondWith(
    matchCache(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() =>
          new Response('', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain' },
          })
        );
    })
  );
});
