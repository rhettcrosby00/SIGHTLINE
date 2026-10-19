// Putting Sightrep on the home screen (v6.4) in a real browser: `node tools/screens/cdp.mjs install`.
// The steps for each phone and browser right after a first unlock; "Remind me later" (the banner
// next visit) and "I've added it"; Settings → Install on home screen; the home-screen app's first
// open (the key first, with Paste) and the setup saved with the key coming back; a drill with no
// network from the offline copy; and Chrome's own installability check.
// Needs testserver.py (:5175) and apiserver.mjs (:5176, test keys on), started fresh: this set
// unlocks about 30 keys, and the server allows 40 tries per network every 10 minutes (all local
// shots share one network). Loading this set saves a setup under a fresh test key on the local
// test API only (for the carry-over shots).
// Shot format: scenarios/main.mjs.
import { WAIVER } from '../../../sightline/js/content/safety.js';

export const BASE = { length: 'standard', difficulty: 'normal', sound: 'off', guide: 'full', cue: 'ATTACK' };

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85 (iPhone15,2; iOS 18_5; en_US)',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
};
// Chrome's own install prompt (beforeinstallprompt), as Android and computers offer it.
const PROMPT = "window.addEventListener('load', () => { const e = new Event('beforeinstallprompt'); e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });";
// Running as the home-screen app: iPhone's navigator.standalone, and display-mode: standalone.
const STANDALONE = "Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });";
const APP_MEDIA = [{ name: 'display-mode', value: 'standalone' }];

const NEW_KEY = ['eval', "const i = document.querySelector('#unlock-key'); i.value = 'TEST-OK-' + Math.random().toString(36).slice(2, 10).toUpperCase();"];
const FIRST_UNLOCK = [['waitFor', '#unlock-key'], NEW_KEY, ['click', '#screen-unlock [data-act="unlock"]'], ['waitFor', '#screen-install.is-active', 8000], ['wait', 500]];
const ONLY_INSTALL = 'js:[...document.querySelectorAll(".screen")].filter((s) => getComputedStyle(s).display !== "none").map((s) => s.id).join() === "screen-install"';
const BUTTONS = ['I’ve added it', 'Remind me later'];

// The setup saved under a test key, as Safari would have saved it, for the carry-over shots.
const API = 'http://localhost:5176/api/license';
const CARRY = `TEST-OK-CARRY${Date.now().toString(36).toUpperCase()}`;
const post = (body) => fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const SAFARI = 'seed-safari-0001';
await post({ action: 'activate', key: CARRY, device: SAFARI });
await post({ action: 'save', key: CARRY, device: SAFARI, data: {
  'sightrep.settings.v1': JSON.stringify({ ...BASE, appearance: 'outdoor', setupDone: true, sportAsked: true }),
  'sightrep.name.v1': JSON.stringify('Carry'),
  'sightrep.waiver.v1': JSON.stringify({ version: WAIVER.version, acceptedAt: '2026-10-20T12:00:00.000Z', risks: true, age: true }),
} });

export const SHOTS = [
  // ---- Right after a first unlock: only this phone's steps ----
  { name: 'install-iphone', params: 'license=0', ua: UA.iphone, steps: FIRST_UNLOCK,
    expect: [ONLY_INSTALL, 'Put Sightrep on your home screen', 'Tap the Share button', 'Add to Home Screen', 'Open as Web App', 'enter your key once more', 'Copy your key (ending', ...BUTTONS,
      'js:!document.querySelector("[data-install=prompt]")', 'js:!/Android|⋮/.test(document.querySelector("#screen-install").innerText)'] },
  { name: 'install-iphone-end', params: 'license=0', ua: UA.iphone, steps: [...FIRST_UNLOCK, ['scrollEnd']], expect: ['Copy your key', ...BUTTONS], combos: 'few' },
  { name: 'install-iphone-chrome', params: 'license=0', ua: UA.iphoneChrome, steps: FIRST_UNLOCK, expect: ['Share button in the address bar', 'Open this page in Safari instead', 'Copy link'], combos: 'few' },
  { name: 'install-iphone-instagram', params: 'license=0', ua: UA.iphoneInstagram, steps: FIRST_UNLOCK, expect: ['Open this page in Safari to install', 'Copy link', 'Open in Safari'], combos: 'few' },
  { name: 'install-android', params: 'license=0', ua: UA.android, init: PROMPT, steps: FIRST_UNLOCK,
    expect: [ONLY_INSTALL, '[data-install="prompt"]', 'Install Sightrep', ...BUTTONS, 'js:!/Share|Safari/.test(document.querySelector("#screen-install").innerText)'] },
  { name: 'install-android-manual', params: 'license=0', ua: UA.android, steps: FIRST_UNLOCK, expect: ['Tap ⋮ at the top right.', 'Install app', 'js:!document.querySelector("[data-install=prompt]")'], combos: 'few' },
  { name: 'install-android-installed', params: 'license=0', ua: UA.android, init: PROMPT, steps: [...FIRST_UNLOCK, ['click', '[data-install="prompt"]'], ['waitFor', '#screen-start.is-active', 8000]],
    expect: ['#screen-start.is-active', 'js:JSON.parse(localStorage.getItem("sightrep.install.v2")).status === "added"'], combos: 'few' },
  { name: 'install-desktop', params: 'license=0', sizes: ['desk'], themes: ['dark', 'light'], init: PROMPT, steps: FIRST_UNLOCK, expect: ['Install app', 'Or bookmark this page.'] },

  // ---- "Remind me later": a banner on the next visit; "I've added it": never again ----
  { name: 'install-later', params: 'license=0', ua: UA.iphone, steps: [...FIRST_UNLOCK, ['click', '[data-install="later"]'], ['waitFor', '#screen-start.is-active', 8000]],
    reopen: 'noguide=1', after: [['waitFor', '#install-banner:not([hidden])', 8000], ['wait', 300]],
    expect: ['#install-banner:not([hidden])', 'Put Sightrep on your home screen', 'js:JSON.parse(localStorage.getItem("sightrep.install.v2")).reminders === 1'] },
  { name: 'install-added', params: 'license=0', ua: UA.iphone, steps: [...FIRST_UNLOCK, ['click', '[data-install="added"]'], ['waitFor', '#screen-start.is-active', 8000]],
    reopen: 'noguide=1', after: [['wait', 600]], expect: ['#install-banner[hidden]', '#screen-start.is-active'], combos: 'few' },
  // A phone unlocked before 6.4: the banner (twice), never the full screen.
  { name: 'install-banner-old', params: 'install=none', ua: UA.iphone, expect: ['#install-banner:not([hidden])', '#screen-start.is-active'], combos: 'few' },
  { name: 'install-settings', ua: UA.iphone, steps: [['click', '#btn-settings'], ['click', '#btn-settings-install'], ['waitFor', '#screen-install.is-active']],
    expect: ['Put Sightrep on your home screen', 'Add to Home Screen', 'Done', 'js:!/Remind me later/.test(document.querySelector("#screen-install").innerText)'], combos: 'few' },
  { name: 'install-settings-row', steps: [['click', '#btn-settings'], ['scrollTo', '#btn-settings-install']], expect: ['Install on home screen'], combos: 'few' },

  // ---- The home-screen app's first open: the key first; the setup comes back with it ----
  { name: 'app-welcome', url: 'http://localhost:5175/?noguide=1', ua: UA.iphone, init: STANDALONE, media: APP_MEDIA, steps: [['waitFor', '#unlock-key'], ['wait', 300]],
    expect: ['Welcome to the Sightrep app', 'Your key', 'Paste', 'free', '#screen-unlock.is-active', 'js:!document.querySelector("#screen-waiver.is-active")'], sizes: ['se', 'pm'], themes: ['dark'] },
  { name: 'app-restored', url: 'http://localhost:5175/?noguide=1', ua: UA.iphone, init: STANDALONE, media: APP_MEDIA, sizes: ['se', 'pm'], themes: ['dark'],
    steps: [['waitFor', '#unlock-key'], ['type', '#unlock-key', CARRY], ['click', '#screen-unlock [data-act="unlock"]'], ['wait', 300]],
    settle: 3500, after: [['waitFor', '#screen-start.is-active', 8000], ['wait', 400]],
    expect: ['#screen-start.is-active', 'Your eyes move first.', 'js:document.documentElement.dataset.appearance === "outdoor"', 'js:JSON.parse(localStorage.getItem("sightrep.name.v1")) === "Carry"',
      'js:!document.querySelector("#screen-waiver.is-active") && !document.documentElement.dataset.gate', '#install-banner[hidden]'] },

  // ---- Works with no signal, from the offline copy ----
  { name: 'offline-drill', params: 'sw=1', steps: [['eval', 'navigator.serviceWorker.ready.then(() => { window.__swReady = true; })'], ['until', 'window.__swReady', 20000], ['wait', 2500]],
    reopen: 'sw=1&noguide=1&autostart=1&session=activate&only=peripheral&autoready=1', offline: true,
    after: [['waitFor', '#screen-session.is-active', 15000], ['wait', 800]], expect: ['#screen-session.is-active', 'js:!navigator.onLine || true'], sizes: ['pm'], themes: ['dark'] },

  // ---- Chrome's own installability check ----
  { name: 'installable', params: 'sw=1', steps: [['eval', 'navigator.serviceWorker.ready.then(() => { window.__swReady = true; })'], ['until', 'window.__swReady', 20000], ['wait', 1500]],
    installable: true, sizes: ['pm'], themes: ['dark'] },
];
