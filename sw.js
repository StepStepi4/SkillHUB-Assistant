const APP_VERSION = 'skillhub-v2.1.0'; // Оновлена версія для скидання кешу
const CACHE_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.jpg'  // Змінено з .png на .jpg відповідно до вашого файлу
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_VERSION).then((cache) => {
      return cache.addAll(CACHE_FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== APP_VERSION) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('script.google.com')) {
      return; 
  }
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    }).catch(() => {
        return caches.match('./index.html');
    })
  );
});
