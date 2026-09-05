// Simple app-shell cache so the app opens offline from the home screen.
// Bump CACHE when you change files, or the old version keeps being served.
const CACHE = 'chore-quest-v3';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/store.js',
  './js/tasks.js',
  './js/ui.js',
  './js/calendar.js',
  './js/kid.js',
  './js/parent.js',
  './js/games.js',
  './js/chat.js',
  './js/cloud.js',
  './js/firebase-config.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never cache API calls or anything cross-origin.
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  // Network first, fall back to cache. Keeps local dev updates visible.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
