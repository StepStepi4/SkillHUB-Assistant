const CACHE_NAME = 'skillhub-test-cache-v2';
const CACHE_ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.jpg'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => { if(k !== CACHE_NAME) return caches.delete(k); }))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('script.google.com')) return;
  
  event.respondWith(
    fetch(event.request).then((res) => {
      return caches.open(CACHE_NAME).then(cache => {
        cache.put(event.request, res.clone());
        return res;
      });
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});
