// SkillHUB Assistant - Service Worker (offline-first)
// ВАЖЛИВО: при кожному релізі міняйте VERSION - тоді всі пристрої підтягнуть нові файли.
const VERSION = 'v-49f6049746';
const SHELL_CACHE = 'skillhub-shell-' + VERSION;   // "оболонка": сторінки, іконки, бібліотеки
const RUNTIME_CACHE = 'skillhub-runtime-v1';       // шрифти, картинки досягнень та інше, що завантажується під час роботи

const SHELL = [
  "./",
  "./Education.html",
  "./Format.html",
  "./Objections.html",
  "./Start.html",
  "./assets/achievements/1.webp",
  "./assets/achievements/10.webp",
  "./assets/achievements/11.webp",
  "./assets/achievements/17.webp",
  "./assets/achievements/2.webp",
  "./assets/achievements/3.webp",
  "./assets/achievements/4.webp",
  "./assets/achievements/5.webp",
  "./assets/achievements/6.webp",
  "./assets/achievements/7.webp",
  "./assets/achievements/8.webp",
  "./assets/achievements/9.webp",
  "./assets/brand/icon-192.png",
  "./assets/brand/icon-512.png",
  "./assets/brand/logo.png",
  "./assets/fonts/Inter-Black.woff",
  "./assets/fonts/Inter-Bold.woff",
  "./assets/fonts/Inter-ExtraBold.woff",
  "./assets/fonts/Inter-Medium.woff",
  "./assets/fonts/Inter-Regular.woff",
  "./assets/fonts/Inter-SemiBold.woff",
  "./assets/icons/academy/achievement.svg",
  "./assets/icons/academy/course.svg",
  "./assets/icons/academy/education.svg",
  "./assets/icons/academy/enroll-in-a-course.svg",
  "./assets/icons/academy/exit.svg",
  "./assets/icons/academy/filters.svg",
  "./assets/icons/academy/info.svg",
  "./assets/icons/academy/meet.svg",
  "./assets/icons/academy/my-statistic.svg",
  "./assets/icons/academy/save.svg",
  "./assets/icons/academy/statistic.svg",
  "./assets/icons/academy/test.svg",
  "./assets/icons/academy/time.svg",
  "./assets/icons/academy/update.svg",
  "./assets/icons/settings/Factory%20reset.svg",
  "./assets/icons/settings/font-size.svg",
  "./assets/icons/settings/security.svg",
  "./assets/icons/settings/shop.svg",
  "./assets/icons/settings/system-update.svg",
  "./assets/icons/settings/themes.svg",
  "./assets/icons/skillhub/Check.svg",
  "./assets/icons/skillhub/Discount.svg",
  "./assets/icons/skillhub/Favorite.svg",
  "./assets/icons/skillhub/Klochkivska.svg",
  "./assets/icons/skillhub/News.svg",
  "./assets/icons/skillhub/SkillHUB.svg",
  "./assets/icons/skillhub/Smart.svg",
  "./assets/icons/skillhub/add.svg",
  "./assets/icons/skillhub/aim.svg",
  "./assets/icons/skillhub/analytics.svg",
  "./assets/icons/skillhub/calculator.svg",
  "./assets/icons/skillhub/change.svg",
  "./assets/icons/skillhub/chat.svg",
  "./assets/icons/skillhub/check-mark.svg",
  "./assets/icons/skillhub/conditioning.svg",
  "./assets/icons/skillhub/dialogue.svg",
  "./assets/icons/skillhub/discounting.svg",
  "./assets/icons/skillhub/education.svg",
  "./assets/icons/skillhub/education1.svg",
  "./assets/icons/skillhub/exchange.svg",
  "./assets/icons/skillhub/information.svg",
  "./assets/icons/skillhub/install.svg",
  "./assets/icons/skillhub/no.svg",
  "./assets/icons/skillhub/password-protection.svg",
  "./assets/icons/skillhub/presa.svg",
  "./assets/icons/skillhub/puzzle.svg",
  "./assets/icons/skillhub/rating.svg",
  "./assets/icons/skillhub/refresh-time.svg",
  "./assets/icons/skillhub/rozetka-image.svg",
  "./assets/icons/skillhub/settings.svg",
  "./assets/icons/skillhub/shuffle.svg",
  "./assets/icons/skillhub/statistics.svg",
  "./assets/icons/skillhub/test.svg",
  "./assets/icons/skillhub/website.svg",
  "./assets/icons/ui/Academy-Main.svg",
  "./assets/icons/ui/add.svg",
  "./assets/icons/ui/bulb.svg",
  "./assets/icons/ui/check-mark.svg",
  "./assets/icons/ui/discount.svg",
  "./assets/icons/ui/favorite.svg",
  "./assets/icons/ui/medal.svg",
  "./assets/icons/ui/password-protection.svg",
  "./assets/icons/ui/refresh-time.svg",
  "./assets/icons/ui/rezerv.svg",
  "./assets/icons/ui/search.svg",
  "./assets/icons/ui/settings.svg",
  "./assets/icons/ui/shuffle.svg",
  "./assets/icons/ui/ukraine.svg",
  "./css/academy.css",
  "./css/assistant.css",
  "./css/fonts.css",
  "./css/richtext.css",
  "./index.html",
  "./js/academy/academy.js",
  "./js/assistant/assistant.js",
  "./js/core/config.js",
  "./js/core/richtext.js",
  "./js/core/search.js",
  "./js/core/storage.js",
  "./js/trainer/objections-data.js",
  "./js/vendor/README.md",
  "./manifest.json"
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // кожен файл окремо: один відсутній файл не ламає встановлення
    await Promise.all(SHELL.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (e) { console.warn('SW: не вдалося закешувати', url, e); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      const oldShell = (k.startsWith('skillhub-shell-') && k !== SHELL_CACHE) || k.startsWith('skillhub-test-cache');
      return oldShell ? caches.delete(k) : null;
    }));
    await self.clients.claim();
  })());
});

function isCacheable(res) {
  return res && (res.status === 200 || res.type === 'opaque');
}

// сторінки: спершу мережа (щоб бачити оновлення), але не довше 3 с - далі кеш
async function networkFirstWithTimeout(request, timeoutMs) {
  const cache = await caches.open(SHELL_CACHE);
  const fromCache = () => cache.match(request, { ignoreSearch: true });
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
    ]);
    if (isCacheable(res)) cache.put(request, res.clone());
    return res;
  } catch (e) {
    return (await fromCache()) || (await cache.match('./index.html')) || Response.error();
  }
}

// решта: миттєво з кешу, а в фоні оновлюємо
async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const runtime = await caches.open(RUNTIME_CACHE);
  const cached = (await cache.match(request)) || (await runtime.match(request));
  const network = fetch(request).then((res) => {
    if (isCacheable(res)) runtime.put(request, res.clone());
    return res;
  }).catch(() => null);
  if (cached) { network.catch(() => {}); return cached; }
  return (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                              // POST (збереження результатів) - напряму
  if (req.headers.has('range')) return;                          // відео/аудіо
  const url = new URL(req.url);
  if (url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com') return; // API: кешує сам застосунок (IndexedDB)

  if (req.mode === 'navigate') {
    event.respondWith(networkFirstWithTimeout(req, 3000));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});
