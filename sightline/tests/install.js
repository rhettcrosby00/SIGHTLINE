// Sightrep on the home screen (v6.4), run by tests/run.js: what makes it installable (manifest,
// icons, iPhone tags, launch pictures, offline), the install steps for each phone and browser,
// when they show ("Remind me later" stops after 2), the key in the home-screen app (its first
// move there is free; Safari hears "installed"), and the setup saved with the key coming back
// (settings, levels, waiver acceptance). The browser half: tools/screens/scenarios/install.mjs.

import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { test, assert } from './harness.js';
import { detectDevice, installGuide, installPlan, initInstall, REMINDERS } from '../js/install.js';
import { BACKUP_KEYS, BACKUP_MAX, snapshot, restoreBackup, createBackup } from '../js/backup.js';
import { createLicense } from '../js/license.js';
import { createWaiverStore, WAIVER_KEY } from '../js/waiver.js';
import { WAIVER } from '../js/content/safety.js';
import { PRO } from '../js/content/pro.js';
import { createLicensing, backupProblem, KEYS } from '../api/_lib/license.js';
import { memoryStore } from '../api/_lib/memory-store.js';
import { handle } from '../api/license.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));
const INK = /--p-ink-950:\s*(#[0-9A-F]{6})/i.exec(read('css/palette.css'))[1];
const PAPER = /--p-paper-50:\s*(#[0-9A-F]{6})/i.exec(read('css/palette.css'))[1];
const verifyAll = async (key) => ({ valid: !['BAD'].includes(key), refunded: false });
const PHONE = 'safari-aaaa-0001';
const APP = 'homeapp-bbbb-0002';
const OTHER = 'phone-cccc-0003';

const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

// A tiny PNG reader (8-bit RGB or RGBA, as tools/brand/make.py writes them): width, height, pixel(x, y).
function png(path) {
  const buf = readFileSync(new URL(path, root));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), type = buf[25];
  const ch = { 2: 3, 6: 4 }[type];
  if (buf[24] !== 8 || !ch) throw new Error(`${path}: not 8-bit RGB(A)`);
  const parts = [];
  for (let i = 8; i < buf.length;) {
    const len = buf.readUInt32BE(i), kind = buf.toString('ascii', i + 4, i + 8);
    if (kind === 'IDAT') parts.push(buf.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(parts)), stride = w * ch, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[y * stride + x - ch] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= ch && y ? px[(y - 1) * stride + x - ch] : 0;
      const p = a + b - c, pr = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      px[y * stride + x] = (row[x] + [0, a, b, (a + b) >> 1, pr][f]) & 255;
    }
  }
  return { w, h, at: (x, y) => [...px.subarray((y * w + x) * ch, (y * w + x) * ch + 3)] };
}
const hex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

test('Installable: manifest, palette colors, a stable app ID, and the iPhone tags', () => {
  assert(manifest.id === '/' && manifest.start_url === '/' && manifest.scope === '/', 'app ID, start and scope: the app’s own address');
  assert(manifest.name === 'Sightrep' && manifest.short_name === 'Sightrep' && manifest.display === 'standalone' && manifest.orientation === 'portrait', 'name, full screen, portrait');
  assert(manifest.background_color === INK && manifest.theme_color === INK, `colors from the palette (ink ${INK})`);
  const meta = (name) => new RegExp(`<meta name="${name}" content="([^"]+)"`).exec(html)?.[1];
  assert(meta('apple-mobile-web-app-capable') === 'yes' && meta('mobile-web-app-capable') === 'yes', 'opens full screen from the home screen');
  assert(meta('apple-mobile-web-app-title') === 'Sightrep', 'the name under the icon');
  assert(meta('apple-mobile-web-app-status-bar-style') === 'black-translucent', 'a dark status bar that the app draws under');
  assert(html.includes(`<meta name="theme-color" content="${INK}" media="(prefers-color-scheme: dark)">`)
    && html.includes(`<meta name="theme-color" content="${PAPER}" media="(prefers-color-scheme: light)">`), 'browser bar colors from the palette');
  // The status bar's clock is white: in the light themes a strip of ink sits behind it.
  assert(/@media \(display-mode: standalone\) \{\s*:root:not\(\[data-appearance="dark"\]\) body::before \{[^}]*height: env\(safe-area-inset-top\);\s*background: var\(--p-ink-950\)/.test(read('css/styles.css')), 'readable status bar in light mode');
  assert(/<link rel="manifest" href="manifest\.webmanifest">/.test(html), 'the manifest is linked');
});

test('Icons: 192, 512, maskable (inside the safe circle) and Apple 180, all on the brand ink; launch pictures too', () => {
  const by = Object.fromEntries(manifest.icons.map((i) => [i.src, i]));
  for (const [src, size, purpose] of [['icons/icon-192.png', 192, 'any'], ['icons/icon-512.png', 512, 'any'], ['icons/icon-maskable-512.png', 512, 'maskable']]) {
    assert(by[src]?.sizes === `${size}x${size}` && by[src].purpose === purpose && by[src].type === 'image/png', `${src} in the manifest`);
  }
  for (const [f, size] of [['icons/icon-192.png', 192], ['icons/icon-512.png', 512], ['icons/icon-maskable-512.png', 512], ['icons/apple-touch-icon.png', 180]]) {
    const p = png(f);
    assert(p.w === size && p.h === size, `${f} is ${p.w}x${p.h}`);
    assert(hex(p.at(1, 1)) === INK && hex(p.at(size - 2, size - 2)) === INK, `${f}: background ${hex(p.at(1, 1))}, not the brand ink`);
  }
  // Maskable: phones crop it to a circle or squircle; the logo must stay inside the middle 80% circle.
  const m = png('icons/icon-maskable-512.png');
  let far = 0;
  for (let y = 0; y < 512; y += 2) for (let x = 0; x < 512; x += 2) {
    const [r, g, b] = m.at(x, y);
    if (Math.abs(r - 0x0A) + Math.abs(g - 0x0B) + Math.abs(b - 0x08) > 60) far = Math.max(far, Math.hypot(x - 256, y - 256) / 256);
  }
  assert(far > 0.3 && far <= 0.8, `maskable logo reaches ${far.toFixed(2)} of the radius (safe: 0.8)`);
  for (const [, file] of html.matchAll(/<link rel="apple-touch-startup-image" href="([^"]+)"/g)) {
    assert(existsSync(new URL(file, root)), `${file} missing`);
    const p = png(file);
    assert(hex(p.at(2, 2)) === INK, `${file}: launch picture background ${hex(p.at(2, 2))}`);
  }
});

test('Works offline after the first open: the worker precaches the app, icons and new files', () => {
  const sw = read('sw.js');
  for (const f of ['./', './index.html', './manifest.webmanifest', './js/install.js', './js/backup.js', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png']) {
    assert(sw.includes(`'${f}'`), `${f} isn’t precached`);
  }
  assert(/navigator\.serviceWorker\.register\('\.\/sw\.js'\)/.test(read('js/main.js')), 'the worker is registered');
});

test('Which phone and browser: iPhone Safari, Chrome and in-app; iPad; Android browsers; computers', () => {
  const UA = {
    iphoneSafari: ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1', 'ios', 'safari'],
    iphoneChrome: ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1', 'ios', 'chrome'],
    iphoneFirefox: ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15', 'ios', 'firefox'],
    iphoneInstagram: ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85 (iPhone15,2; iOS 18_5; en_US)', 'ios', 'inapp'],
    iphoneGoogleApp: ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/380.0.785553811 Mobile/15E148 Safari/604.1', 'ios', 'inapp'],
    androidChrome: ['Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36', 'android', 'chrome'],
    androidSamsung: ['Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36', 'android', 'samsung'],
    androidFirefox: ['Mozilla/5.0 (Android 15; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0', 'android', 'firefox'],
    androidEdge: ['Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 EdgA/138.0.0.0', 'android', 'edge'],
    androidWebView: ['Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36', 'android', 'inapp'],
    macChrome: ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', 'desktop', 'chrome'],
    winEdge: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0', 'desktop', 'edge'],
    macSafari: ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15', 'desktop', 'safari'],
    winFirefox: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0', 'desktop', 'firefox'],
  };
  for (const [name, [ua, os, browser]] of Object.entries(UA)) {
    const d = detectDevice(ua);
    assert(d.os === os && d.browser === browser, `${name}: ${JSON.stringify(d)}`);
  }
  const ipad = detectDevice(UA.macSafari[0], { touchPoints: 5 });
  assert(ipad.os === 'ios' && ipad.browser === 'safari', 'an iPad (it says “Macintosh,” but has touch)');
});

test('Install steps: only the ones for this phone and browser', () => {
  const ios = installGuide({ os: 'ios', browser: 'safari' });
  assert(ios.kind === 'steps' && ios.steps.length === 3, 'iPhone Safari: 3 steps');
  assert(/Share/.test(ios.steps[0].text) && /square with an arrow pointing up/.test(ios.steps[0].text) && /“Add to Home Screen\.”/.test(ios.steps[1].text) && /“Add\.”/.test(ios.steps[2].text), 'Share → Add to Home Screen → Add');
  assert(/paste your key once/.test(ios.note) && /Copy your key/.test(ios.note) && /free/.test(ios.note), 'and what happens next on iPhone');
  assert(installGuide({ os: 'ios', browser: 'safari' }, { canPrompt: true }).kind === 'steps', 'iPhone never has an install button');
  const crios = installGuide({ os: 'ios', browser: 'chrome' });
  assert(crios.kind === 'steps' && /address bar/.test(crios.steps[0].text) && /Safari/.test(crios.copyLink), 'iPhone Chrome: its Share button, or Safari');
  for (const browser of ['firefox', 'edge', 'inapp', 'other']) {
    const g = installGuide({ os: 'ios', browser });
    assert(g.kind === 'open' && /Safari/.test(g.title) && g.copyLink === '', `iPhone ${browser}: open in Safari, with Copy link`);
  }
  const prompt = installGuide({ os: 'android', browser: 'chrome' }, { canPrompt: true });
  assert(prompt.kind === 'prompt' && prompt.button === 'Install Sightrep' && !prompt.steps.length, 'Android with the browser’s prompt: one big button');
  const chrome = installGuide({ os: 'android', browser: 'chrome' });
  assert(chrome.kind === 'steps' && /⋮/.test(chrome.steps[0].text) && /Add to Home screen|Install app/.test(chrome.steps[1].text), 'Android Chrome without it: ⋮ → Install app');
  assert(/≡/.test(installGuide({ os: 'android', browser: 'samsung' }).steps[0].text), 'Samsung Internet: its own menu');
  assert(/Chrome/.test(installGuide({ os: 'android', browser: 'inapp' }).title), 'Android in-app browsers: open in Chrome');
  const desk = installGuide({ os: 'desktop', browser: 'chrome' }, { canPrompt: true });
  assert(desk.kind === 'prompt' && desk.button === 'Install app' && /bookmark/.test(desk.note), 'computers: Install app, or bookmark');
  assert(installGuide({ os: 'desktop', browser: 'firefox' }).kind === 'bookmark', 'Firefox on a computer: bookmark');
});

test('The banner: never in the home-screen app; "Remind me later" stops after 2 (the full steps: step 4 of the setup)', () => {
  assert(REMINDERS === 2, 'two reminders');
  assert(installPlan({}) === null && installPlan({ status: 'new' }) === null, 'no banner before “Remind me later”');
  assert(installPlan({ status: 'later', reminders: 0 }, { standalone: true }) === null, 'never in the home-screen app');
  assert(installPlan({ status: 'added' }) === null, '“Done” / “I’ve added it” ends it');
  assert(installPlan({ status: 'later', reminders: 1 }) === 'banner' && installPlan({ status: 'later', reminders: 2 }) === null, 'twice');
  // A phone's visits after "Remind me later", through initInstall (the real bookkeeping).
  const was = { window: globalThis.window, matchMedia: globalThis.matchMedia };
  globalThis.window = { addEventListener() {} };
  globalThis.matchMedia = () => ({ matches: false });
  try {
    const storage = memory({ 'sightrep.install.v2': JSON.stringify({ status: 'later', reminders: 0 }) });
    const seen = [];
    for (let visit = 1; visit <= 4; visit++) {
      const install = initInstall({ storage });
      const plan = install.plan();
      seen.push(plan);
      if (plan === 'banner') install.bannerShown();
    }
    assert(seen.join() === 'banner,banner,,', `visits: ${seen.join()}`);
    // A phone unlocked before 6.4 (no install record): the banner twice, never the full screen.
    const old = memory();
    const plans = [1, 2, 3].map(() => { const i = initInstall({ storage: old }); const p = i.plan(); if (p === 'banner') i.bannerShown(); return p; });
    assert(plans.join() === 'banner,banner,', `an older phone: ${plans.join()}`);
  } finally {
    Object.assign(globalThis, was);
  }
  const main = read('js/main.js');
  assert(/\} else \{\s*installNext = install\.plan\(\);\s*\}/.test(main), 'the banner only on phones past the setup');
  assert(/if \(installNext !== 'banner'\) return;\s*\$\('install-banner'\)\.hidden = false;\s*install\.bannerShown\(\);/.test(main), 'the banner counts each visit it shows');
  assert(/id="btn-settings-install"[^>]*>[^]*?Install on home screen/.test(html) && /\$\('btn-settings-install'\)[^]*?install\.showScreen\(\$\('screen-install'\), \{ fromSettings: true \}\)/.test(main), 'Settings → Install on home screen');
  const src = read('js/install.js');
  assert(src.includes('I’ve added it') && src.includes('Remind me later') && /beforeinstallprompt/.test(src) && /p\.prompt\(\)/.test(src), 'the two buttons, and the browser’s own prompt');
  assert(!/data-install="(skip|close)"[^]*disabled/.test(src), 'nothing is blocked');
});

test('Saved data blocked (private browsing): the install steps and the backup never stop the app', async () => {
  const was = { window: globalThis.window, matchMedia: globalThis.matchMedia, ls: Object.getOwnPropertyDescriptor(globalThis, 'localStorage') };
  globalThis.window = { addEventListener() {} };
  globalThis.matchMedia = () => ({ matches: false });
  Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('storage blocked'); }, configurable: true });
  try {
    const install = initInstall();   // must not throw: main.js makes it before the waiver shows
    assert(install.plan() === 'banner' && !install.added(), 'still offered, for this visit');
    assert(await createBackup({ license: { needed: () => true } }).saveNow() === false, 'nothing to save without a key');
    assert(Object.keys(snapshot()).length === 0, 'and nothing read');
  } finally {
    globalThis.window = was.window;
    globalThis.matchMedia = was.matchMedia;
    if (was.ls) Object.defineProperty(globalThis, 'localStorage', was.ls); else delete globalThis.localStorage;
  }
});

test('Server: the first move into the home-screen app is free; Safari hears "installed"', async () => {
  let t = Date.UTC(2026, 9, 20);
  const store = memoryStore({ now: () => t });
  const keys = createLicensing(store, { verify: verifyAll, now: () => t });
  const K = 'ABCD-HOME-SCREEN';
  assert((await keys.activate({ key: K, device: PHONE })).ok, 'Safari');
  const moved = await keys.activate({ key: K, device: APP, app: true });
  assert(moved.ok && moved.moved && moved.free === true, `into the home-screen app: ${JSON.stringify(moved)}`);
  assert(JSON.stringify(await keys.check({ key: K, device: PHONE })) === '{"ok":false,"reason":"installed"}', 'Safari: “open it from your home screen”');
  // The free move used none of the 3: three more moves still work, then the 4th is refused.
  for (const d of [OTHER, APP, OTHER]) assert((await keys.activate({ key: K, device: d, app: true })).free === false, 'only the first app move is free');
  assert((await keys.activate({ key: K, device: APP, app: true })).reason === 'moves', 'then the usual limit');
  assert(JSON.stringify(await keys.check({ key: K, device: PHONE })) === '{"ok":false,"reason":"moved"}', 'once it moves on, Safari hears “moved” again');
  assert(PRO.locked.installed && /home screen/.test(PRO.locked.installed) && /free/.test(PRO.app.help), 'the words for both');
  t += 31 * 86400000;
  assert((await keys.activate({ key: K, device: PHONE })).ok, '30 days later: as usual');
});

test('Server: the saved setup is kept only from the phone the key is on, only known items, not too much', async () => {
  const store = memoryStore();
  const keys = createLicensing(store, { verify: verifyAll });
  const K = 'ABCD-SAVE-SETUP';
  const data = { 'sightrep.settings.v1': '{"appearance":"dark"}' };
  assert((await keys.save({ key: K, device: PHONE, data })).reason === 'moved', 'no saving before the key is on this phone');
  await keys.activate({ key: K, device: PHONE });
  assert((await keys.save({ key: K, device: PHONE, data })).ok, 'saved');
  assert((await keys.save({ key: K, device: OTHER, data })).reason === 'moved', 'another phone can’t overwrite it');
  assert(backupProblem({ 'sightrep.license.v1': 'x' }) && backupProblem({ 'sightrep.settings.v1': 3 }) && backupProblem([]) && backupProblem(null), 'only known items, as text');
  assert(backupProblem({ 'sightrep.settings.v1': 'x'.repeat(BACKUP_MAX) }) === 'Too much to save.' && backupProblem(data) === '', 'and a size limit');
  let status = 0;
  await keys.save({ key: K, device: PHONE, data: { evil: '1' } }).catch((e) => { status = e.status; });
  assert(status === 400, 'a bad save is a 400');
  const out = await keys.activate({ key: K, device: APP, app: true, restore: true });
  assert(JSON.stringify(out.data) === JSON.stringify(data), 'it comes back where it’s asked for');
  assert(!('data' in await keys.activate({ key: K, device: APP })), 'and only then');
  assert(KEYS.saves >= 100, 'room for a team saving on one Wi-Fi');
});

test('Backup: only the setup (never the key or phone ID), restored without touching the waiver this phone just accepted', async () => {
  for (const k of ['sightrep.license.v1', 'sightrep.device.v1', 'sightrep.install.v2', 'sightrep.lbqueue.v1']) assert(!BACKUP_KEYS.includes(k), `${k} must not travel`);
  assert(BACKUP_KEYS.includes(WAIVER_KEY) && BACKUP_KEYS.includes('sightrep.settings.v1') && BACKUP_KEYS.includes('sightrep.routine.v1'), 'waiver, settings, My Routine');
  const phone = memory({ 'sightrep.settings.v1': '{"a":1}', 'sightrep.license.v1': '{"key":"SECRET"}', 'sightrep.device.v1': 'id-123456' });
  const snap = snapshot(phone);
  assert(Object.keys(snap).join() === 'sightrep.settings.v1', `only the setup: ${Object.keys(snap)}`);
  const fresh = memory({ [WAIVER_KEY]: 'mine' });
  assert(restoreBackup({ 'sightrep.settings.v1': '{"a":1}', [WAIVER_KEY]: 'theirs', 'sightrep.license.v1': 'x' }, { storage: fresh, keepWaiver: true }) === 1, 'one item back');
  assert(fresh.getItem(WAIVER_KEY) === 'mine' && fresh.getItem('sightrep.license.v1') === null, 'its own waiver kept; nothing unknown written');
  // Saves only when something changed.
  let sent = 0;
  const license = { needed: () => false, backup: async () => { sent++; return true; } };
  const b = createBackup({ license, storage: phone });
  await b.saveNow();
  await b.saveNow();
  phone.setItem('sightrep.settings.v1', '{"a":2}');
  await b.saveNow();
  assert(sent === 2, `saved ${sent} times (once, then only after a change)`);
});

test('Carry-over: Safari → home-screen app on one iPhone, with the key; settings and waiver come back', async () => {
  const env = { LB_MEMORY: '1', TEST_KEYS: '1' };
  const fetch = async (url, opts) => {
    const out = await handle({ method: 'POST', body: JSON.parse(opts.body), ip: '198.51.100.7' }, env);
    return { ok: out.status < 400, status: out.status, json: async () => out.body };
  };
  const KEY = 'TEST-OK-CARRYOVER';
  // Safari: the waiver, a few settings, a key, and the setup saved with it.
  const safari = memory({ 'sightrep.settings.v1': '{"appearance":"outdoor","sport":"football"}', 'sightrep.routine.v1': '{"steps":["box"]}' });
  createWaiverStore(safari).accept({ risks: true, age: true });
  const inSafari = createLicense({ storage: safari, fetch });
  assert((await inSafari.activate(KEY, { restore: true })).ok, 'unlocked in Safari');
  assert(await createBackup({ license: inSafari, storage: safari }).saveNow(), 'its setup saved with the key');
  // The home-screen app: its own empty storage. The key once; the move is free; the setup comes back.
  const app = memory();
  const inApp = createLicense({ storage: app, fetch });
  assert(!inApp.hasRecord() && createWaiverStore(app).needed(), 'starts empty: no key, no waiver');
  const out = await inApp.activate(KEY, { app: true, restore: true });
  assert(out.ok && out.moved && out.free, `moved in, free: ${JSON.stringify({ ...out, data: !!out.data })}`);
  assert(restoreBackup(out.data, { storage: app, keepWaiver: !createWaiverStore(app).needed() }) === 3, 'settings, My Routine, waiver');
  assert(!createWaiverStore(app).needed(), 'no waiver again (same version)');
  assert(app.getItem('sightrep.settings.v1') === safari.getItem('sightrep.settings.v1') && app.getItem('sightrep.routine.v1') === safari.getItem('sightrep.routine.v1'), 'same settings and routine');
  assert(app.getItem('sightrep.device.v1') !== safari.getItem('sightrep.device.v1'), 'its own phone ID');
  assert(createWaiverStore(app).needed(WAIVER.version + 1), 'a new waiver version still has to be accepted');
  assert(await inSafari.recheck({ force: true }) === 'installed' && inSafari.lockedFor() === 'installed', 'Safari: “open it from your home screen”');
  // Deleted the icon and added it again: empty again; the key once more; everything back (a normal move).
  const again = memory();
  const out2 = await createLicense({ storage: again, fetch }).activate(KEY, { app: true, restore: true });
  assert(out2.ok && !out2.free && restoreBackup(out2.data, { storage: again }) === 3, 'after re-adding the icon: back again');
});

test('The home-screen app asks for the key first, with Paste; Privacy says what’s saved with it', () => {
  const unlock = read('js/unlock.js');
  assert(/app \? \{ heading: PRO\.app\.heading/.test(unlock) && /mode: standalone \? 'app'/.test(read('js/main.js')) && PRO.app.heading === 'Welcome to the Sightrep app', 'a welcome, not a sales page');
  assert(/data-act="paste-go"/.test(unlock) && /navigator\.clipboard\.readText\(\)/.test(unlock), 'a big Paste your key button');
  assert(/activate: \{ app: standalone, restore: freshPhone \}/.test(read('js/main.js')), 'tells the server it’s the home-screen app, and asks for the setup on a fresh phone');
  const privacy = read('../site/src/privacy.html');
  assert(/saved with your key/i.test(privacy) && /waiver/i.test(privacy.slice(privacy.search(/saved with your key/i))), 'Privacy: the setup saved with the key');
});
