// Offline support: precache the whole app on install, then serve from cache.
// Bump CACHE_VERSION (and APP_VERSION in js/main.js) whenever any file
// changes. Phones download the new version in the background and show a
// "New version ready" banner on the start screen.

const CACHE_VERSION = 'v2.3';
const CACHE = `sightline-${CACHE_VERSION}`;

// Google Fonts (Archivo + Schibsted Grotesk) live in their own cache that
// survives app updates. Keep FONT_CSS identical to the <link> in index.html.
const FONT_CACHE = 'sightline-fonts-v1';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Schibsted+Grotesk:wght@400;500;600;700&display=swap';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './css/tokens.css',
  './js/engine.js',
  './js/features.js',
  './js/focus.js',
  './js/guide.js',
  './js/main.js',
  './js/migrate.js',
  './js/plan.js',
  './js/routine.js',
  './js/session.js',
  './js/settings.js',
  './js/cone/config.js',
  './js/cone/layout.js',
  './js/cone/plan.js',
  './js/cone/render.js',
  './js/cone/run.js',
  './js/cone/setup.js',
  './js/cone/timing.js',
  './js/cone/ui.js',
  './js/content/breathing.js',
  './js/content/cues.js',
  './js/content/eyes.js',
  './js/content/math.js',
  './js/content/questions.js',
  './js/content/reaction.js',
  './js/content/scripts.js',
  './js/data/questions.js',
  './js/lib/audio.js',
  './js/lib/colors.js',
  './js/lib/icons.js',
  './js/lib/rng.js',
  './js/lib/text.js',
  './js/lib/variety.js',
  './js/lib/wakelock.js',
  './js/score/board.js',
  './js/score/names.js',
  './js/score/scoring.js',
  './js/score/ui.js',
  './js/stages/brain.js',
  './js/stages/breathe.js',
  './js/stages/common.js',
  './js/stages/eyes.js',
  './js/stages/memory.js',
  './js/stages/reaction.js',
  './js/stages/readiness.js',
  './js/stages/summary.js',
  './js/stages/visualize.js',
  './js/cone/cues/arrow.js',
  './js/cone/cues/color.js',
  './js/cone/cues/index.js',
  './js/cone/cues/mixed.js',
  './js/cone/cues/number.js',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg',
  './assets/logo/logo-horizontal-mono-dark.svg',
  './assets/logo/logo-horizontal.svg',
  './assets/logo/logo-mark-mono-dark.svg',
  './assets/logo/logo-mark.svg',
  './assets/logo/logo-wordmark-mono-dark.svg',
  './assets/logo/logo-wordmark.svg',
];

self.addEventListener('install', (e) => {
  // Normally an update waits until the athlete taps the banner. v1 pages
  // have no banner, so when replacing v1 take over right away (one time).
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))
    .then(() => cacheFonts().catch(() => {}))   // offline fonts are a bonus, never a blocker
    .then(() => caches.has('sightline-v1'))
    .then((fromV1) => { if (fromV1) self.skipWaiting(); }));
});

// Fetches the font stylesheet and every font file it points to.
async function cacheFonts() {
  const cache = await caches.open(FONT_CACHE);
  if (await cache.match(FONT_CSS, { ignoreVary: true })) return;
  const css = await fetch(FONT_CSS, { mode: 'cors' });
  if (!css.ok) return;
  const urls = [...(await css.clone().text()).matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]);
  await Promise.all(urls.map((u) => fetch(u, { mode: 'cors' }).then((r) => r.ok && cache.put(u, r))));
  await cache.put(FONT_CSS, css);
}

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sightline-') && k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FONT_HOSTS.includes(url.hostname)) {
    // Fonts: cache first, saved on first use. Offline with nothing cached
    // falls back to the system fonts listed in css/tokens.css.
    e.respondWith(caches.open(FONT_CACHE).then((c) => c.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  // The leaderboard is always live: never cached.
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
