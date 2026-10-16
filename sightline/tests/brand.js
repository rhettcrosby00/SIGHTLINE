// Sightrep (v5.0), run by tests/run.js: one name and tagline everywhere
// (js/brand.js, the page, the home-screen app), no "Sightline" anywhere an
// athlete could see it, and saved phone data that survives the rename.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { test, assert } from './harness.js';
import { BRAND, logo, LOGO_DIR, LOGO_SIZE, APP_URL, OLD_HOSTS, movedFrom } from '../js/brand.js';
import { renameSavedData, OLD_PREFIX, PREFIX } from '../js/migrate.js';
import { SERVED } from '../build.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));
const meta = (attr, name) => new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`).exec(html)?.[1];

test('Name and tagline: one source (js/brand.js), and the page and home-screen app agree', () => {
  assert(BRAND.name === 'Sightrep' && BRAND.tagline === 'Reps for your eyes.', JSON.stringify(BRAND));
  assert(/<title>Sightrep<\/title>/.test(html) && meta('name', 'apple-mobile-web-app-title') === BRAND.name, 'page title and iPhone home-screen title');
  assert(manifest.name === BRAND.name && manifest.short_name === BRAND.name, 'manifest name and short_name');
  for (const d of [manifest.description, meta('name', 'description'), meta('property', 'og:description'), meta('name', 'twitter:description')]) {
    assert(d?.includes(BRAND.tagline), `a description without the tagline: ${d}`);
  }
  assert(meta('property', 'og:title') === BRAND.name && meta('property', 'og:site_name') === BRAND.name && meta('name', 'twitter:title') === BRAND.name, 'link previews');
  assert(new RegExp(`id="brand-tagline"[^>]*>${BRAND.tagline.replace('.', '\\.')}<`).test(html), 'the tagline is on the home screen even before the app starts');
  assert(/\$\('brand-tagline'\)\.textContent = BRAND\.tagline/.test(read('js/main.js')), 'and the home screen reads it from js/brand.js');
  assert(/<h1 id="app-title" class="home__logo" data-logo="horizontal" aria-label="Sightrep">/.test(html), 'home: the full logo, named Sightrep');
});

// Everything the site serves (build.mjs SERVED), except pictures and the face tracker's binaries.
const SHIPPED = [];
const walk = (p) => {
  if (/\.(png|wasm|task|webp|ico)$/.test(p)) return;
  if (statSync(new URL(p, root)).isDirectory()) for (const name of readdirSync(new URL(p, root))) walk(`${p}/${name}`);
  else SHIPPED.push(p);
};
SERVED.forEach(walk);
// The only places the old name may stay: internal names nobody sees.
const INTERNAL = [
  ['js/migrate.js', /sightline\./g],                          // moving old saved data
  ['index.html', /'sightline\.settings\.v1'/g],                 // the theme before the move runs
  ['sw.js', /'sightline-v1'|'sightline-'/g],                    // clearing the old offline caches
  ['js/features.js', /sightline-psi\.vercel\.app/g],            // Vercel's own address for the project
  ['js/brand.js', /'sightline-psi\.vercel\.app'/g],             // the old address, to point it at the new one
];
const stripComments = (src) => src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');

test('No "Sightline" anywhere an athlete can see it (the old name only in internal names)', () => {
  const left = [];
  for (const f of SHIPPED) {
    let src = read(f);
    for (const [file, re] of INTERNAL) if (file === f) src = src.replace(re, '');
    src = stripComments(src);   // comments are never shown
    if (/sightline/i.test(src)) left.push(`${f}: ${/.{0,40}sightline.{0,40}/i.exec(src)[0]}`);
  }
  assert(left.length === 0, `still says Sightline:\n    ${left.join('\n    ')}`);
  assert(SHIPPED.includes('index.html') && SHIPPED.includes('manifest.webmanifest') && SHIPPED.some((f) => f.startsWith('js/')), 'checked the app');
  // Logo images too: their titles and labels are read aloud.
  for (const f of SHIPPED.filter((x) => x.endsWith('.svg'))) assert(!/sightline/i.test(read(f)), `${f} is labeled Sightline`);
});

// A fake phone storage (with length / key(i), like the real one).
function storage(init = {}, { full = false } = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (full) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

test('Saved phone data survives the rename: settings, routines, levels, setups and the leaderboard name', () => {
  assert(OLD_PREFIX === 'sightline.' && PREFIX === 'sightrep.', 'prefixes');
  const old = {
    'sightline.settings.v1': JSON.stringify({ appearance: 'dark', cue: 'ATTACK', sport: 'soccer', day: 'training' }),
    'sightline.routine.v1': JSON.stringify({ breath: 'box', imagery: 'See the first touch.', quietEyeS: 3 }),
    'sightline.levels.v1': JSON.stringify({ colorcall: 0.4 }),
    'sightline.cone.v1': JSON.stringify({ cones: 5, distance: 8 }),
    'sightline.name.v1': JSON.stringify('Jordan'),
    'sightline.last.v2': JSON.stringify({ focus: 'game:standard', move: 'game:speed' }),
    'sightline.last.v1': JSON.stringify({ type: 'game' }),
    'someone-else': 'keep me',
  };
  const s = storage(old);
  assert(renameSavedData(s) === 7, 'seven keys moved');
  const now = s.dump();
  for (const [k, v] of Object.entries(old)) {
    if (k.startsWith('sightline.')) assert(now[`sightrep.${k.slice(10)}`] === v && !(k in now), `${k} moved unchanged`);
  }
  assert(now['someone-else'] === 'keep me', 'other keys untouched');
  assert(renameSavedData(s) === 0 && JSON.stringify(s.dump()) === JSON.stringify(now), 'running it again changes nothing');
  // Already saved under the new name (a second tab, say): the new value wins; the old key goes.
  const both = storage({ 'sightline.name.v1': '"Old"', 'sightrep.name.v1': '"New"' });
  renameSavedData(both);
  assert(both.dump()['sightrep.name.v1'] === '"New"' && !('sightline.name.v1' in both.dump()), 'newer data wins');
  // A full phone: nothing is lost (the old key stays to try again next time).
  const full = storage({ 'sightline.settings.v1': '{"cue":"GO"}' }, { full: true });
  assert(renameSavedData(full) === 0 && full.dump()['sightline.settings.v1'] === '{"cue":"GO"}', 'kept when the new key can’t be written');
  // Blocked or missing storage (private mode): no error.
  assert(renameSavedData({ get length() { throw new Error('blocked'); } }) === 0 && renameSavedData(null) === 0, 'blocked storage');
  // It runs before anything reads saved data.
  const main = read('js/main.js');
  assert(main.indexOf('renameSavedData();') > 0 && main.indexOf('renameSavedData();') < main.indexOf('initSettings('), 'first thing at startup');
  // Every saved key in the app uses the new prefix.
  for (const f of SHIPPED.filter((x) => x.startsWith('js/') && x !== 'js/migrate.js')) {
    const keys = [...read(f).matchAll(/'(sight\w+)\.[\w.]+'/g)].map((m) => m[1]);
    assert(keys.every((k) => k === 'sightrep'), `${f} saves under ${keys}`);
  }
});

// ---- Part 2: the logo --------------------------------------------------------
const png = (p) => { const b = readFileSync(new URL(p, root)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const exists = (p) => { try { statSync(new URL(p, root)); return true; } catch { return false; } };

test('Logo files: every lockup in dark, light (Light B), one-color white and black, plus the tab reticle', () => {
  assert(LOGO_DIR === 'assets/logo', 'one folder');
  for (const kind of ['icon', 'wordmark', 'horizontal', 'stacked']) {
    for (const suffix of ['', '-light', '-white', '-black']) {
      const f = `${LOGO_DIR}/logo-${kind}${suffix}.svg`;
      assert(exists(f), `${f} missing`);
      const src = read(f);
      const colors = new Set([...src.matchAll(/fill="(#[0-9A-F]{6})"/gi)].map((m) => m[1].toUpperCase()));
      const want = { '': ['#B7FF00', '#FFFFFF'], '-light': ['#3F5C00', '#050505'], '-white': ['#FFFFFF'], '-black': ['#050505'] }[suffix];
      assert([...colors].sort().join() === want.sort().join(), `${f}: colors ${[...colors]}`);
      assert(/<title>Sightrep logo<\/title>/.test(src) && /aria-label="Sightrep logo"/.test(src), `${f} label`);
      if (LOGO_SIZE[kind]) {
        const [w, h] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(src).slice(1).map(Number);
        assert(Math.round(w) === LOGO_SIZE[kind][0] && Math.round(h) === LOGO_SIZE[kind][1], `${f}: ${w}×${h} vs LOGO_SIZE`);
      }
    }
  }
  for (const f of ['logo-reticle.svg', 'logo-reticle-light.svg']) assert(exists(`${LOGO_DIR}/${f}`), f);
  assert(read(`${LOGO_DIR}/logo-reticle.svg`).length < read(`${LOGO_DIR}/logo-icon.svg`).length, 'the reticle leaves out the SR');
  assert(!readdirSync(new URL(LOGO_DIR + '/', root)).some((f) => /logo-mark|sightline|brand-sheet/i.test(f)), 'old Sightline logo files are gone');
  assert(!/logo-mark/.test(html + read('sw.js') + read('js/stages/summary.js')), 'and nothing points at them');
});

test('One logo component: dark and light versions, alt "Sightrep logo", used on every screen', () => {
  const h = logo('horizontal', { cls: 'x' });
  assert(h.includes(`src="${LOGO_DIR}/logo-horizontal.svg"`) && h.includes(`src="${LOGO_DIR}/logo-horizontal-light.svg"`), 'both versions');
  assert(/class="logo logo--horizontal on-dark x"/.test(h) && /class="logo logo--horizontal on-light x"/.test(h), 'the theme picks one');
  assert((h.match(/alt="Sightrep logo"/g) ?? []).length === 2, 'alt text');
  assert(/data-logo="horizontal"/.test(html) && /data-logo="stacked"/.test(html), 'home (full logo) and About (stacked, smaller)');
  assert(/logo\('icon', \{ cls: 'sum__logo' \}\)/.test(read('js/stages/summary.js')), 'summary: small icon');
  assert(/logo\('icon', \{ cls: 'lb-title__logo' \}\)/.test(read('js/score/ui.js')), 'leaderboard header: small icon');
  assert(/<img class="splash__logo on-dark" src="assets\/logo\/logo-stacked\.svg" alt="Sightrep logo"/.test(html)
    && /<img class="splash__logo on-light" src="assets\/logo\/logo-stacked-light\.svg" alt="Sightrep logo"/.test(html), 'splash: the stacked logo');
  for (const m of html.matchAll(/<img [^>]*src="assets\/logo\/[^"]+"[^>]*>/g)) assert(/alt="Sightrep logo"/.test(m[0]), `alt text: ${m[0]}`);
});

test('App icons, favicon, share picture and iPhone launch pictures show Sightrep at the right sizes', () => {
  const icons = Object.fromEntries(manifest.icons.map((i) => [i.src, i]));
  assert(icons['icons/icon-192.png'] && icons['icons/icon-512.png'] && icons['icons/icon-maskable-512.png']?.purpose === 'maskable', 'manifest icons');
  for (const [f, size] of [['icons/icon-192.png', 192], ['icons/icon-512.png', 512], ['icons/icon-maskable-512.png', 512],
    ['icons/apple-touch-icon.png', 180], ['icons/favicon-32.png', 32], ['icons/favicon-16.png', 16]]) {
    assert(png(f).join() === `${size},${size}`, `${f} is ${png(f)}`);
  }
  assert(/<link rel="icon" href="icons\/icon\.svg" type="image\/svg\+xml">/.test(html) && /favicon-32\.png" sizes="32x32"/.test(html)
    && /favicon-16\.png" sizes="16x16"/.test(html) && /rel="apple-touch-icon" href="icons\/apple-touch-icon\.png"/.test(html), 'favicon and Apple icon links');
  assert(/<title>Sightrep logo<\/title>/.test(read('icons/icon.svg')), 'the tab icon is labeled');
  assert(png('assets/share.png').join() === '1200,630' && meta('property', 'og:image') === 'https://app.sightrep.app/assets/share.png'
    && meta('name', 'twitter:image') === meta('property', 'og:image') && meta('property', 'og:url') === 'https://app.sightrep.app/'
    && meta('name', 'twitter:card') === 'summary_large_image', 'share picture');
  const sizes = JSON.parse(read('splash/sizes.json'));
  assert(sizes.length >= 8, 'iPhone screen sizes');
  for (const s of sizes) {
    assert(png(s.file).join() === `${s.width * s.ratio},${s.height * s.ratio}`, `${s.file} size`);
    assert(html.includes(`href="${s.file}" media="(device-width: ${s.width}px) and (device-height: ${s.height}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait)"`), `${s.file} link`);
  }
});

// The maskable icon must keep everything inside the middle 80% circle (phones crop the rest).
test('The maskable app icon isn’t clipped on rounded phone icons', async () => {
  const { inflateSync } = await import('node:zlib');
  const b = readFileSync(new URL('icons/icon-maskable-512.png', root));
  // Decode the PNG (8-bit RGB, no interlace), enough to find the logo's farthest pixel from the center.
  let off = 8; const idat = [];
  let w = 0, h = 0, type = 0;
  while (off < b.length) {
    const len = b.readUInt32BE(off); const kind = b.toString('ascii', off + 4, off + 8);
    if (kind === 'IHDR') { w = b.readUInt32BE(off + 8); h = b.readUInt32BE(off + 12); type = b[off + 17]; }
    if (kind === 'IDAT') idat.push(b.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const cur = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const up = y ? px[(y - 1) * stride + x] : 0;
      const ul = y && x >= bpp ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + up - ul; const pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - ul);
      const pred = [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : ul][f];
      px[y * stride + x] = (cur + pred) & 255;
    }
  }
  let far = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * stride + x * bpp;
    if (Math.max(px[i], px[i + 1], px[i + 2]) > 60) far = Math.max(far, Math.hypot(x - w / 2, y - h / 2));
  }
  assert(far > w * 0.2 && far <= w * 0.4, `the logo reaches ${(far / w * 100).toFixed(0)}% from the center (safe: 40%)`);
});

test('The old address says "Sightrep has a new home" (and only the old address)', () => {
  assert(APP_URL === 'https://app.sightrep.app/' && OLD_HOSTS.join() === 'sightline-psi.vercel.app', 'addresses');
  assert(movedFrom('sightline-psi.vercel.app') && movedFrom('SIGHTLINE-PSI.vercel.app'), 'the old address');
  for (const host of ['app.sightrep.app', 'sightrep.app', 'www.sightrep.app', 'sightline-git-feature-x-crosby-aos.vercel.app', 'localhost', '', undefined]) {
    assert(!movedFrom(host), `shown on ${host}`);
  }
  const card = /<section id="moved" class="moved"[^>]*hidden>[\s\S]*?<\/section>/.exec(html)?.[0];
  assert(card, 'hidden until the app decides');
  assert(card.includes(`href="${APP_URL}"`) && /target="_blank" rel="noopener"/.test(card), 'a button to the new address (opens Safari from an installed app)');
  assert(/Your settings start fresh there; your leaderboard scores are safe\./.test(card) && /same leaderboard name/.test(card), 'says what carries over');
  const main = read('js/main.js');
  assert(/\$\('moved'\)\.hidden = !\(movedFrom\(location\.hostname\) \|\| new URLSearchParams\(location\.search\)\.has\('moved'\)\);/.test(main), 'shown only by movedFrom (or ?moved=1 to check it)');
});
