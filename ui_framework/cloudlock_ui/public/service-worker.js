const CACHE_NAME = 'cloudlock-static-v2';
const APP_SHELL_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return Promise.resolve(false);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isCacheableStaticRequest(request) {
  if (request.method !== 'GET') {
    return false;
  }

  const url = new URL(request.url);

  // Never cache API calls in the service worker.
  if (url.pathname.startsWith('/api')) {
    return false;
  }

  // Only cache same-origin app shell and static assets.
  if (url.origin !== self.location.origin) {
    return false;
  }

  return (
    request.mode === 'navigate' ||
    ['script', 'style', 'image', 'font'].includes(request.destination)
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    if (request.mode === 'navigate') {
      return cache.match('/index.html');
    }

    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || networkPromise;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (!isCacheableStaticRequest(request)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
