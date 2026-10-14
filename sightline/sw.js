// Offline support: precache the whole app on install, then serve from cache.
// Bump CACHE_VERSION (and APP_VERSION in js/main.js) whenever any file
// changes. Phones download the new version in the background and show a
// "New version ready" banner on the start screen.

const CACHE_VERSION = 'v1.3';
const CACHE = `sightline-${CACHE_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/engine.js',
  './js/guide.js',
  './js/main.js',
  './js/plan.js',
  './js/routine.js',
  './js/session.js',
  './js/settings.js',
  './js/stages/brain.js',
  './js/stages/breathe.js',
  './js/stages/common.js',
  './js/stages/eyes.js',
  './js/stages/reaction.js',
  './js/stages/readiness.js',
  './js/stages/summary.js',
  './js/stages/visualize.js',
  './js/content/breathing.js',
  './js/content/cues.js',
  './js/content/eyes.js',
  './js/content/math.js',
  './js/content/questions.js',
  './js/content/reaction.js',
  './js/content/scripts.js',
  './js/lib/audio.js',
  './js/lib/colors.js',
  './js/lib/rng.js',
  './js/lib/text.js',
  './js/lib/variety.js',
  './js/lib/wakelock.js',
  './js/data/questions.js',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg',
  './assets/logo/logo-mark.svg',
  './assets/logo/logo-horizontal.svg',
  './assets/logo/logo-wordmark.svg',
];

self.addEventListener('install', (e) => {
  // Normally an update waits until the athlete taps the banner. v1 pages
  // have no banner, so when replacing v1 take over right away (one time).
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))
    .then(() => caches.has('sightline-v1'))
    .then((fromV1) => { if (fromV1) self.skipWaiting(); }));
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
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
