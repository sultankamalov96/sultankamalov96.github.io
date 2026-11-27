// Service worker: после первой загрузки редактор открывается без интернета.
// Список файлов сборки берётся из precache.json (его пишет плагин в vite.config.ts).
const VERSION = 'kidcode-v2';
const SHELL = ['/', '/index.html', '/help', '/privacy', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    let files = [];
    try {
      const r = await fetch('/precache.json', { cache: 'no-store' });
      files = await r.json();
    } catch (e) { /* без списка — только оболочка */ }
    // По одному файлу: если какой-то не отдался (например, /help на GitHub Pages приходит с кодом 404),
    // установка не срывается — остальное всё равно сохраняется
    const urls = [...SHELL, ...files].filter((v, i, a) => a.indexOf(v) === i);
    await Promise.allSettled(urls.map(async (u) => {
      const res = await fetch(u, { cache: 'no-cache' });
      if (res.ok) await cache.put(u, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // API и админка — всегда из сети
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  if (req.mode === 'navigate') {
    // Страницы: сначала сеть, без сети — index.html из кэша
    event.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
      return res;
    }).catch(async () => (await caches.match(req)) || (await caches.match('/index.html'))));
    return;
  }
  // Файлы сборки, звуки, шрифты: из кэша, иначе из сети с сохранением
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  })));
});
