// A buyer's first minute (v6.5) in a real browser: `node tools/screens/cdp.mjs first-run`.
// "Start Sightrep" (?start) → Paste your key → waiver (step 1) → You're in → Make it yours →
// Home screen → "Let's try it" → the first session. Each step must fit an iPhone SE screen with
// no scrolling (the waiver's text box aside). Also: resuming after closing midway, the
// home-screen app (no step 4), Android's Install button, and a computer's QR code read by
// Chrome's own QR reader and opened as the phone. "record" makes the movie
// (python3 tools/screens/movie.py …).
// Needs testserver.py (:5175) and apiserver.mjs (:5176, test keys), started fresh.
// Shot format: scenarios/main.mjs.
import { FIRST } from '../../../sightline/js/content/firstrun.js';

export const BASE = { length: 'standard', difficulty: 'normal', sound: 'off', guide: 'auto', cue: 'ATTACK' };

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
};
// Each shot is its own phone on its own made-up network (the server limits key tries per network).
const NETWORK = "if (!sessionStorage.net) sessionStorage.net = '10.' + [1, 2, 3].map(() => Math.floor(Math.random() * 250)).join('.'); { const f = window.fetch; window.fetch = (u, o = {}) => f(u, { ...o, headers: { ...(o.headers || {}), 'X-Test-Network': sessionStorage.net } }); }";
// The clipboard, as if Copy was tapped on the Gumroad page (a fresh test key each time).
const CLIPBOARD = NETWORK + "window.__clip = 'TEST-OK-' + Math.random().toString(36).slice(2, 10).toUpperCase(); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => window.__clip, writeText: async (t) => { window.__clip = t; } } });";
const PROMPT = "window.addEventListener('load', () => { const e = new Event('beforeinstallprompt'); e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });";
const STANDALONE = "Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });";
const NEW = 'license=0&waiver=0&start=1';   // a brand-new phone, from "Start Sightrep"
const FITS = 'js:document.documentElement.scrollHeight <= innerHeight + 1';
// Screens that may scroll to "Don't have a key yet?": their main buttons are on the first screen.
const SEEN = (...sel) => `js:[${sel.map((x) => JSON.stringify(x)).join(', ')}].every((q) => { const r = document.querySelector(q).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })`;
const ONLY = (id) => `js:[...document.querySelectorAll(".screen")].filter((s) => getComputedStyle(s).display !== "none").map((s) => s.id).join() === "${id}"`;
const T = 700;   // a person's pause between taps (for the recording)

const PASTE = [['waitFor', '[data-act="paste-go"]'], ['click', '[data-act="paste-go"]'], ['waitFor', '#screen-waiver.is-active', 8000]];
const WAIVER = [['click', '[data-check="risks"]'], ['click', '[data-check="age"]'], ['click', '[data-act="agree"]'], ['waitFor', '.ob__check', 8000]];
const READY = [['waitFor', '.ob__tiles', 4000]];
const YOURS = [['click', '[data-sport="football"]'], ['select', '.ob__position', 'skill'], ['click', '[data-ob="next"]'], ['waitFor', '.ob__install', 4000]];
const LATER = [['click', '[data-ob="later"]'], ['waitFor', '[data-ob="start"]', 4000]];
const iphone = { ua: UA.iphone, init: CLIPBOARD, firstRun: true, params: NEW };
// A purchase, as Gumroad's sale notice would report it (local test API: no email is sent; the
// outbox shows it). Leaves window.__email and window.__link (the email's Start Sightrep link).
const SALE = [['eval', `window.__link = null; (async () => {
  const id = Math.random().toString(36).slice(2, 10).toUpperCase();
  const email = 'buyer-' + id.toLowerCase() + '@example.com';
  await fetch('/api/gumroad?k=test-ping', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ sale_id: 'T-' + id, email, license_key: 'TEST-OK-' + id }).toString() });
  const out = await (await fetch('/api/gumroad?action=outbox')).json();
  window.__email = email;
  window.__link = /(http\\S+#t=[A-Za-z0-9_-]{43})/.exec(out.mails.filter((m) => m.to === email).at(-1).text)[1];
})();`], ['until', 'window.__link', 8000]];

export const SHOTS = [
  // ---- Each step on its own (iPhone Safari) ----
  { name: 'fr-1-unlock', ...iphone, steps: [['waitFor', '[data-act="paste-go"]'], ['wait', 300]],
    expect: [FIRST.buyer.heading, FIRST.buyer.paste, FIRST.buyer.enter, 'Don’t have a key yet?', ONLY('screen-unlock'), FITS, 'js:!document.querySelector(".unlock__list")'] },
  { name: 'fr-1-nokey', ...iphone, init: `${CLIPBOARD} window.__clip = 'hello';`, steps: [['waitFor', '[data-act="paste-go"]'], ['click', '[data-act="paste-go"]'], ['wait', 400]],
    expect: ['Your clipboard doesn’t have a key', ONLY('screen-unlock')], combos: 'few' },
  { name: 'fr-1-typed', ...iphone, steps: [['waitFor', '[data-act="enter"]'], ['click', '[data-act="enter"]'], ['wait', 300]],
    expect: ['#unlock-key', 'js:!document.querySelector(".unlock__key--typed").hidden'], combos: 'few' },
  { name: 'fr-2-waiver', ...iphone, steps: PASTE, expect: ['Step 1 of 4', '#screen-waiver.is-active', ONLY('screen-waiver'), 'js:!document.querySelector("#screen-waiver .nav__back")'] },
  { name: 'fr-3-ready', ...iphone, steps: [...PASTE, ...WAIVER, ['wait', 700]], expect: ['Step 2 of 4', FIRST.ready.title, FIRST.ready.line, ONLY('screen-onboard'), FITS] },
  { name: 'fr-4-yours', ...iphone, steps: [...PASTE, ...WAIVER, ...READY, ['click', '[data-sport="football"]'], ['wait', 200]],
    expect: ['Step 3 of 4', FIRST.yours.title, FIRST.yours.skip, 'Basketball', 'Other', '.ob__position', '[data-ob="back"]', FITS] },
  { name: 'fr-5-install', ...iphone, steps: [...PASTE, ...WAIVER, ...READY, ...YOURS, ['wait', 300]],
    expect: ['Step 4 of 4', FIRST.install.title, 'Tap the Share button', 'Add to Home Screen', 'Copy your key', FIRST.install.done, FIRST.install.later, FITS,
      'js:JSON.parse(localStorage.getItem("sightrep.settings.v1")).sport === "football"'] },
  { name: 'fr-6-finish', ...iphone, steps: [...PASTE, ...WAIVER, ...READY, ...YOURS, ...LATER, ['wait', 300]],
    expect: [FIRST.finish.title, FIRST.finish.start, FIRST.finish.explore, '[data-ob="back"]', FITS] },
  { name: 'fr-7-first', ...iphone, steps: [...PASTE, ...WAIVER, ...READY, ...YOURS, ...LATER, ['click', '[data-ob="start"]'], ['waitFor', '#screen-session.is-active', 8000], ['wait', 1500]],
    expect: ['#screen-session.is-active', 'Regulate', 'Settle', 'js:!document.documentElement.dataset.gate', 'js:JSON.parse(localStorage.getItem("sightrep.onboard.v1")).step === "done"'] },
  { name: 'fr-explore', ...iphone, steps: [...PASTE, ...WAIVER, ...READY, ['click', '[data-ob="skip"]'], ['waitFor', '.ob__install'], ...LATER, ['click', '[data-ob="explore"]'], ['waitFor', '#screen-start.is-active', 4000]],
    reopen: 'noguide=0', after: [['wait', 800]],
    expect: ['#screen-start.is-active', '#install-banner:not([hidden])', 'js:!document.querySelector("#screen-onboard.is-active")'], combos: 'few' },

  // ---- Closed midway: it opens where it was; finished steps never come back ----
  { name: 'fr-resume', ...iphone, steps: [...PASTE, ...WAIVER, ...READY], reopen: 'start=1', after: [['waitFor', '.ob__tiles', 8000], ['wait', 300]],
    expect: [FIRST.yours.title, 'Step 3 of 4', 'js:!document.querySelector("#screen-waiver.is-active") && !document.querySelector("#screen-unlock.is-active")'], combos: 'few' },

  // ---- Back: You're in waits for Continue the second time ----
  { name: 'fr-back', ...iphone, steps: [...PASTE, ...WAIVER, ...READY, ['click', '[data-ob="back"]'], ['wait', 2000]],
    expect: [FIRST.ready.title, '[data-ob="next"]'], combos: 'few' },

  // ---- The home-screen app: no step 4 ----
  { name: 'fr-app', ...iphone, init: `${CLIPBOARD} ${STANDALONE}`, media: [{ name: 'display-mode', value: 'standalone' }],
    steps: [['waitFor', '[data-act="paste-go"]'], ['click', '[data-act="paste-go"]'], ['waitFor', '#screen-waiver.is-active', 8000], ...WAIVER, ...READY, ['click', '[data-ob="skip"]'], ['waitFor', '[data-ob="start"]', 4000]],
    expect: [FIRST.finish.title, 'js:!document.querySelector(".ob__install")', 'js:JSON.parse(localStorage.getItem("sightrep.onboard.v1")).sent.includes("install-skip")'], combos: 'few' },

  // ---- Android: the Install button ----
  { name: 'fr-android', ua: UA.android, init: `${CLIPBOARD} ${PROMPT}`, firstRun: true, params: NEW, steps: [...PASTE, ...WAIVER, ...READY, ['click', '[data-ob="skip"]'], ['waitFor', '.ob__install'], ['wait', 300]],
    expect: ['Step 4 of 4', '[data-install="prompt"]', 'Install Sightrep', FITS] },
  { name: 'fr-android-installed', ua: UA.android, init: `${CLIPBOARD} ${PROMPT}`, firstRun: true, params: NEW,
    steps: [...PASTE, ...WAIVER, ...READY, ['click', '[data-ob="skip"]'], ['waitFor', '.ob__install'], ['click', '[data-install="prompt"]'], ['waitFor', '[data-ob="start"]', 4000]],
    expect: [FIRST.finish.title, 'js:JSON.parse(localStorage.getItem("sightrep.install.v2")).status === "added"'], combos: 'few' },

  // ---- A computer: QR code → the phone opens unlocked (the same browser, as the phone) ----
  { name: 'fr-desktop', sizes: ['desk'], themes: ['dark', 'light'], init: CLIPBOARD, firstRun: true, params: NEW,
    steps: [['waitFor', '[data-act="paste-go"]'], ['click', '[data-act="paste-go"]'], ['waitFor', '.handoff:not([hidden]) .qr', 8000], ['wait', 300]],
    expect: [FIRST.desktop.heading, FIRST.desktop.qr, FIRST.desktop.here, 'js:!document.querySelector("[data-act=here]").disabled'] },
  { name: 'fr-desktop-phone', sizes: ['desk'], themes: ['dark'], init: CLIPBOARD, firstRun: true, params: NEW,
    steps: [['waitFor', '[data-act="paste-go"]'], ['click', '[data-act="paste-go"]'], ['waitFor', '.handoff:not([hidden]) .qr', 8000],
      ['eval', `(async () => {
        const svg = document.querySelector('.handoff .qr').outerHTML.replace('currentColor', 'black').replace('<svg ', '<svg width="400" height="400" ');
        const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
        const c = document.createElement('canvas'); c.width = c.height = 400; const g = c.getContext('2d'); g.fillStyle = 'white'; g.fillRect(0, 0, 400, 400); g.drawImage(img, 0, 0);
        window.__qrUrl = (await new BarcodeDetector({ formats: ['qr_code'] }).detect(c))[0]?.rawValue;
      })()`], ['until', 'window.__qrUrl', 8000], ['eval', 'sessionStorage.setItem("qr", window.__qrUrl); setTimeout(() => { location.href = window.__qrUrl; }, 50)']],
    settle: 3500, after: [['waitFor', '#screen-waiver.is-active', 8000]],
    expect: ['#screen-waiver.is-active', 'js:location.hash === ""', 'js:/^TEST-OK-/.test(JSON.parse(localStorage.getItem("sightrep.license.v1")).key)', 'js:/#h=[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}$/.test(sessionStorage.getItem("qr")) && !/TEST-OK/.test(sessionStorage.getItem("qr"))'] },
  { name: 'fr-desktop-here', sizes: ['desk'], themes: ['light'], init: CLIPBOARD, firstRun: true, params: NEW,
    steps: [['waitFor', '[data-act="paste-go"]'], ['click', '[data-act="paste-go"]'], ['waitFor', '.handoff:not([hidden])', 8000], ['click', '[data-act="here"]'], ['waitFor', '#screen-waiver.is-active', 8000], ['wait', 500]],
    expect: ['Step 1 of 4', '#screen-waiver.is-active'] },
  // Every length of link: Chrome's QR reader reads each code back.
  { name: 'fr-qr-codes', url: 'http://localhost:5175/?noguide=1', sizes: ['pm'], themes: ['dark'],
    steps: [['eval', `window.__qrDone = null; (async () => {
      const { qrSvg, qrMatrix } = await import('/js/lib/qr.js');
      const det = new BarcodeDetector({ formats: ['qr_code'] });
      const texts = ['A', 'https://app.sightrep.app/?start', ...[20, 40, 60, 80, 100, 110, 130, 150, 180, 200].map((n) => 'https://x.y/#' + 'abcdefghijklmnopqrstuvwxyz0123456789-_'.repeat(6).slice(0, n))];
      const out = [];
      for (const t of texts) {
        const svg = qrSvg(t).replace('currentColor', 'black').replace('<svg ', '<svg width="420" height="420" ');
        const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
        const c = document.createElement('canvas'); c.width = c.height = 420; const g = c.getContext('2d'); g.fillStyle = 'white'; g.fillRect(0, 0, 420, 420); g.drawImage(img, 0, 0, 420, 420);
        out.push([t.length, qrMatrix(t).version, (await det.detect(c))[0]?.rawValue === t]);
      }
      window.__qrDone = out;
    })().catch((e) => { window.__qrDone = [[String(e)]]; });`], ['until', 'window.__qrDone', 30000]],
    expect: ['js:window.__qrDone.length === 12 && window.__qrDone.every((r) => r[2] === true)'] },

  // ---- 6.6: the purchase email's Start Sightrep link, and 6-digit codes ----
  { name: 'fr-link', ...iphone, params: 'license=0&waiver=0&install=none', steps: [...SALE, ['eval', 'setTimeout(() => { location.href = window.__link; }, 50)']],
    settle: 3500, after: [['waitFor', '#screen-waiver.is-active', 8000], ...WAIVER, ['wait', 400]],
    expect: ['js:document.body.innerText.includes(sessionStorage.getItem("sightrep.email"))', 'Step 2 of 4', 'js:location.hash === ""',
      'js:/^TEST-OK-/.test(JSON.parse(localStorage.getItem("sightrep.license.v1")).key)'] },
  { name: 'fr-link-used', ...iphone, params: 'license=0&waiver=0', steps: [...SALE, ['eval', `fetch('/api/license', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'redeem', token: window.__link.split('#t=')[1], device: 'used-elsewhere-01' }) }).then(() => setTimeout(() => { location.href = window.__link; }, 50))`]],
    settle: 3500, after: [['waitFor', '[data-act="resend"]:not([hidden])', 8000], ['wait', 300]],
    expect: [FIRST.link.expired, FIRST.link.resend, FIRST.buyer.paste, FIRST.email.get, ONLY('screen-unlock'), SEEN('[data-act="resend"]', '[data-act="paste-go"]')] },
  { name: 'fr-link-resend', ...iphone, params: 'license=0&waiver=0', combos: 'few', steps: [...SALE, ['eval', `fetch('/api/license', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'redeem', token: window.__link.split('#t=')[1], device: 'used-elsewhere-01' }) }).then(() => setTimeout(() => { location.href = window.__link; }, 50))`]],
    settle: 3500, after: [['waitFor', '[data-act="resend"]:not([hidden])', 8000], ['click', '[data-act="resend"]'], ['wait', 800]],
    expect: [FIRST.link.sent] },
  { name: 'fr-code', ...iphone, steps: [...SALE, ['waitFor', '[data-act="email"]'], ['click', '[data-act="email"]'],
      ['eval', "document.querySelector('#unlock-email').value = window.__email"], ['click', '[data-act="code-send"]'], ['waitFor', '.unlock__code:not([hidden])', 8000], ['wait', 300]],
    expect: [FIRST.email.sent, FIRST.email.code, 'js:document.querySelector("#unlock-code").autocomplete === "one-time-code"', SEEN('#unlock-code')] },
  { name: 'fr-code-unlock', ...iphone, combos: 'few', steps: [...SALE, ['waitFor', '[data-act="email"]'], ['click', '[data-act="email"]'],
      ['eval', "document.querySelector('#unlock-email').value = window.__email"], ['click', '[data-act="code-send"]'], ['waitFor', '.unlock__code:not([hidden])', 8000],
      ['eval', `fetch('/api/gumroad?action=outbox').then((r) => r.json()).then((o) => { const m = o.mails.filter((x) => x.to === window.__email).at(-1); const c = document.querySelector('#unlock-code'); c.value = /(\\d{6}) is your/.exec(m.subject)[1]; c.dispatchEvent(new Event('input', { bubbles: true })); })`],
      ['waitFor', '#screen-waiver.is-active', 8000]],
    expect: ['#screen-waiver.is-active', 'Step 1 of 4', 'js:/^TEST-OK-/.test(JSON.parse(localStorage.getItem("sightrep.license.v1")).key)'] },
  { name: 'fr-code-app', ...iphone, init: `${CLIPBOARD} ${STANDALONE}`, media: [{ name: 'display-mode', value: 'standalone' }], steps: [['waitFor', '#unlock-email'], ['wait', 300]],
    expect: ['Welcome to the Sightrep app', FIRST.app.lead, FIRST.email.send, FIRST.app.paste, 'js:!document.querySelector(".unlock__email").hidden', SEEN('#unlock-email', '[data-act="code-send"]', '[data-act="paste-go"]')] },
  { name: 'fr-link-desktop', sizes: ['desk'], themes: ['dark'], init: CLIPBOARD, firstRun: true, params: 'license=0&waiver=0',
    steps: [...SALE, ['eval', 'sessionStorage.setItem("link", window.__link); setTimeout(() => { location.href = window.__link; }, 50)']],
    settle: 3000, after: [['waitFor', '.handoff .qr', 8000], ['eval', `(async () => {
        const svg = document.querySelector('.handoff .qr').outerHTML.replace('currentColor', 'black').replace('<svg ', '<svg width="400" height="400" ');
        const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
        const c = document.createElement('canvas'); c.width = c.height = 400; const g = c.getContext('2d'); g.fillStyle = 'white'; g.fillRect(0, 0, 400, 400); g.drawImage(img, 0, 0);
        window.__qrUrl = (await new BarcodeDetector({ formats: ['qr_code'] }).detect(c))[0]?.rawValue;
      })()`], ['until', 'window.__qrUrl', 8000]],
    expect: [FIRST.desktop.heading, FIRST.link.qr, FIRST.desktop.here, 'js:window.__qrUrl === sessionStorage.getItem("link")'] },

  // ---- The whole path, recorded (the movie for the checkpoint) ----
  { name: 'fr-movie', ...iphone, sizes: ['pm'], themes: ['dark'], record: true,
    steps: [['wait', 900], ...PASTE.slice(0, 2).flatMap((x) => [x, ['wait', T]]), ['waitFor', '#screen-waiver.is-active', 8000], ['wait', 1200],
      ['click', '[data-check="risks"]'], ['wait', 500], ['click', '[data-check="age"]'], ['wait', 500], ['click', '[data-act="agree"]'],
      ['waitFor', '.ob__check', 8000], ...READY, ['wait', T], ['click', '[data-sport="football"]'], ['wait', T], ['click', '[data-ob="next"]'],
      ['waitFor', '.ob__install', 4000], ['wait', 1600], ['click', '[data-ob="later"]'], ['waitFor', '[data-ob="start"]', 4000], ['wait', 1000],
      ['click', '[data-ob="start"]'], ['waitFor', '#screen-session.is-active', 8000], ['wait', 3000]],
    expect: ['Settle'] },
];
