// Offline support: precache the whole app on install, then serve from cache.
// Bump CACHE_VERSION whenever any file changes so phones pick up the update.

const CACHE_VERSION = 'v1';
const CACHE = `sightline-${CACHE_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/main.js',
  './js/settings.js',
  './js/routine.js',
  './js/engine.js',
  './js/lib/audio.js',
  './js/lib/colors.js',
  './js/lib/rng.js',
  './js/lib/wakelock.js',
  './js/stages/common.js',
  './js/stages/breathe.js',
  './js/stages/eyes.js',
  './js/stages/reaction.js',
  './js/stages/brain.js',
  './js/stages/summary.js',
  './js/data/questions.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sightline-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
