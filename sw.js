const CACHE_NAME = 'skillhub-dynamic-cache';
const CACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) return caches.delete(cache);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Игнорируем запросы к Google Apps Script (они обрабатываются отдельно в HTML)
  if (event.request.url.includes('script.google.com')) return;

  // Стратегия: Сначала Сеть (Network First), затем Кэш. 
  // Это избавляет от необходимости менять версию вручную при правках HTML.
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Если сеть есть, сохраняем свежую копию в кэш
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // Если интернета нет, отдаем из кэша
        return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || caches.match('./index.html');
        });
      })
  );
});
