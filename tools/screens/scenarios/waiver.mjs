// The safety waiver (v5.2) in a real browser: `node tools/screens/cdp.mjs waiver`.
// A fresh phone gets it right after the key (6.5: the key first, so a waiver accepted on another
// phone can come back with it), nothing else is reachable, the button waits for
// both boxes, a direct drill link waits for it, it's remembered after closing
// the app, and it comes back for a new version or when saved data is gone.
// Then the safety notes and waiver links on the screens they belong to.
// Shot format: scenarios/main.mjs.
import { WAIVER, DISCLAIMER, SAFETY } from '../../../sightline/js/content/safety.js';

export const BASE = { length: 'standard', difficulty: 'normal', sound: 'off', guide: 'full', cue: 'ATTACK' };

const FRESH = 'waiver=0';
const tick = (box) => ['click', `[data-check="${box}"]`];
const ACCEPT = [tick('risks'), tick('age'), ['click', '[data-act="agree"]'], ['waitFor', '#screen-start.is-active']];
const DISABLED = 'js:document.querySelector("[data-act=agree]").disabled';
// Only the waiver: still gated, no other screen or overlay visible.
const ONLY_WAIVER = [
  '#screen-waiver.is-active', 'js:document.documentElement.dataset.gate === "waiver"',
  'js:[...document.querySelectorAll(".screen")].filter((s) => getComputedStyle(s).display !== "none").map((s) => s.id).join() === "screen-waiver"',
  'js:!document.querySelector(".guide, .howto, .count")', 'Before you start.',
];
const SAVED = `js:(() => { const r = JSON.parse(localStorage.getItem("sightrep.waiver.v1")); return r.version === ${WAIVER.version}
  && r.risks === true && r.age === true && Math.abs(Date.parse(r.acceptedAt) - Date.now()) < 120000; })()`;
const DRILL = (session, only, extra = '') => `autostart=1&session=${session}&only=${only}${extra}`;
// Each shot is its own phone on its own made-up network (the server limits key tries per network).
const NETWORK = "if (!sessionStorage.net) sessionStorage.net = '10.' + [1, 2, 3].map(() => Math.floor(Math.random() * 250)).join('.'); { const f = window.fetch; window.fetch = (u, o = {}) => f(u, { ...o, headers: { ...(o.headers || {}), 'X-Test-Network': sessionStorage.net } }); }";
const typeKey = ['eval', "const i = document.querySelector('#unlock-key'); i.value = 'TEST-OK-' + Math.random().toString(36).slice(2, 10).toUpperCase();"];
const KEY_THEN_WAIVER = [typeKey, ['click', '#screen-unlock [data-act="unlock"]'], ['waitFor', '#screen-waiver.is-active', 8000], ['wait', 300]];
const READY = [['waitFor', '.btn-ready', 15000], ['click', '.btn-ready'], ['waitFor', '#hud-safety:not([hidden])', 8000], ['wait', 800]];

export const SHOTS = [
  // ---- First launch ----
  { name: 'waiver', params: FRESH, expect: [...ONLY_WAIVER, 'Assumption of risk', 'View full waiver', 'Agree and continue', DISABLED,
    'js:[...document.querySelectorAll("[data-check]")].every((b) => !b.checked)', '.waiver__logo .logo'] },
  { name: 'waiver-one-box', params: FRESH, steps: [tick('risks')], expect: [...ONLY_WAIVER, DISABLED], combos: 'few' },
  { name: 'waiver-other-box', params: FRESH, steps: [tick('age')], expect: [...ONLY_WAIVER, DISABLED], combos: 'few' },
  // One box, then a tap on the button anyway: nothing happens.
  { name: 'waiver-tap-early', params: FRESH, steps: [tick('risks'), ['eval', 'document.querySelector("[data-act=agree]").click()'], ['wait', 400]],
    expect: [...ONLY_WAIVER, 'js:!localStorage.getItem("sightrep.waiver.v1")'], combos: 'few' },
  { name: 'waiver-both', params: FRESH, steps: [tick('risks'), tick('age')], expect: [...ONLY_WAIVER, `js:!${DISABLED.slice(3)}`] },
  // Unticking one turns the button off again.
  { name: 'waiver-untick', params: FRESH, steps: [tick('risks'), tick('age'), tick('age')], expect: [...ONLY_WAIVER, DISABLED], combos: 'few' },
  { name: 'waiver-text-end', params: FRESH, steps: [['eval', 'const t = document.querySelector(".waiver__text"); t.scrollTop = t.scrollHeight'], ['wait', 300]],
    expect: ['Changes', `Version ${WAIVER.version}`], combos: 'few' },
  { name: 'waiver-full', params: FRESH, steps: [['click', '[data-act="full"]']], expect: ['.waiver-full', 'Safety waiver', 'Release of liability', 'Supervision of minors', 'Close'] },
  { name: 'waiver-full-closed', params: FRESH, steps: [['click', '[data-act="full"]'], ['click', '.waiver-full [data-act="close"]']],
    expect: [...ONLY_WAIVER, 'js:!document.querySelector(".waiver-full")'], combos: 'few' },

  // ---- Nothing reachable before it ----
  // A direct drill link on a fresh phone: the waiver, and no drill starts.
  { name: 'waiver-direct-link', params: `${FRESH}&${DRILL('activate', 'peripheral')}`, steps: [['wait', 2500]],
    expect: [...ONLY_WAIVER, 'js:!document.getElementById("stage").children.length'] },
  // Accept: then the link's drill starts.
  { name: 'waiver-direct-link-accepted', params: `${FRESH}&${DRILL('activate', 'peripheral')}`, steps: [tick('risks'), tick('age'), ['click', '[data-act="agree"]'], ['waitFor', '.howto', 8000]],
    expect: ['Peripheral Flash', '#screen-session.is-active', SAVED], combos: 'few' },
  // A brand-new phone: the waiver is step 1 of the first-time setup (js/onboarding.js), then You're in.
  { name: 'waiver-then-setup', params: `${FRESH}&install=none`, firstRun: true, steps: [['wait', 1500], ['eval', 'if (document.querySelector("#screen-onboard.is-active")) throw new Error("setup before the waiver")'],
    tick('risks'), tick('age'), ['click', '[data-act="agree"]'], ['waitFor', '.ob__check', 8000]], expect: ['Step 2 of 4', 'You’re in'], combos: 'few' },

  // ---- Accept, close, reopen ----
  { name: 'waiver-accepted', params: FRESH, steps: ACCEPT, expect: ['#screen-start.is-active', 'js:!document.documentElement.dataset.gate', 'Choose a preset', SAVED, DISCLAIMER] },
  { name: 'waiver-reopened', params: FRESH, steps: ACCEPT, reopen: 'noguide=1', expect: ['#screen-start.is-active', 'js:!document.documentElement.dataset.gate', 'js:!document.getElementById("screen-waiver").children.length', SAVED] },
  // Saved data cleared (Safari can do this after a week unused): the key again, then the waiver again.
  { name: 'waiver-cleared', params: FRESH, init: NETWORK, steps: [...ACCEPT, ['eval', 'localStorage.clear()']], reopen: 'noguide=1', after: KEY_THEN_WAIVER, expect: ONLY_WAIVER, combos: 'few' },
  // A new waiver version: only the previous one was accepted.
  { name: 'waiver-new-version', params: 'waiver=old', expect: ONLY_WAIVER, combos: 'few' },
  // Saved data blocked: the key and the waiver every visit; accepting still lets this visit go on.
  { name: 'waiver-no-storage', params: 'nostorage=1', init: NETWORK, steps: KEY_THEN_WAIVER, expect: ONLY_WAIVER, combos: 'few' },
  { name: 'waiver-no-storage-accepted', params: 'nostorage=1', init: NETWORK, steps: [...KEY_THEN_WAIVER, ACCEPT[0], ACCEPT[1], ACCEPT[2], ['waitFor', '#screen-start.is-active', 8000]],
    expect: ['#screen-start.is-active', 'js:!document.documentElement.dataset.gate'], combos: 'few' },

  // ---- Safety notes, always on the screen they belong to ----
  { name: 'safety-move-hub', steps: [['click', '#btn-move']], expect: [SAFETY.move, 'brightness all the way up'] },
  { name: 'safety-custom', steps: [['click', '#btn-move'], ['click', '[data-nav="custom"]']], expect: [SAFETY.move, `js:!document.body.innerText.includes(${JSON.stringify(SAFETY.flashing)})`], combos: 'few' },
  { name: 'safety-custom-flash', cone: { display: 'flash' }, steps: [['click', '#btn-move'], ['click', '[data-nav="custom"]']], expect: [SAFETY.move, SAFETY.flashing] },
  { name: 'safety-cone-layout', steps: [['click', '#btn-move'], ['click', '[data-nav="custom"]'], ['click', '[data-nav="layout"]']], expect: ['Set out', SAFETY.move], combos: 'few' },
  { name: 'safety-peripheral-howto', params: DRILL('activate', 'peripheral'), steps: [['waitFor', '.howto', 15000]], expect: ['Peripheral Flash', SAFETY.flashing] },
  { name: 'safety-peripheral', params: DRILL('activate', 'peripheral'), steps: READY, expect: ['#hud-safety:not([hidden])', SAFETY.flashing] },
  { name: 'safety-capture', params: DRILL('vision', 'capture'), steps: READY, expect: [SAFETY.flashing], combos: 'few' },
  { name: 'safety-span', params: DRILL('vision', 'span'), steps: READY, expect: [SAFETY.flashing], combos: 'few' },
  { name: 'safety-quieteye', params: DRILL('activate', 'quieteye'), steps: READY, expect: [SAFETY.flashing], combos: 'few' },
  { name: 'safety-gaze-howto', params: DRILL('extras', 'gaze'), steps: [['waitFor', '.howto', 15000]], expect: ['Gaze Stabilization', SAFETY.dizzy], combos: 'few' },
  { name: 'safety-gaze', params: DRILL('extras', 'gaze'), steps: READY, expect: ['.gaze', SAFETY.dizzy] },
  { name: 'safety-nearfar-howto', params: DRILL('vision', 'nearfar'), steps: [['waitFor', '.howto', 15000]], expect: ['Near-Far Focus', SAFETY.dizzy], combos: 'few' },
  { name: 'safety-nearfar', params: DRILL('vision', 'nearfar'), steps: READY, expect: ['.nf', SAFETY.dizzy] },
  // Smooth Pursuit flashes only with Occlusion on (Training).
  { name: 'safety-pursuit-plain', params: DRILL('activate', 'pursuit'), steps: [['waitFor', '.btn-ready', 15000], ['click', '.btn-ready'], ['wait', 1500]],
    expect: ['#hud-safety[hidden]', `js:!document.body.innerText.includes(${JSON.stringify(SAFETY.flashing)})`], combos: 'few' },
  { name: 'safety-pursuit-occlusion', set: { day: 'training', occlusion: 'on', occlusionOk: true }, params: DRILL('activate', 'pursuit'), steps: READY, expect: [SAFETY.flashing], combos: 'few' },
  // No note on a drill without one.
  { name: 'safety-none', params: DRILL('challenge', 'colorcall'), steps: [['waitFor', '.btn-ready', 15000], ['click', '.btn-ready'], ['wait', 1500]], expect: ['#hud-safety[hidden]'], combos: 'few' },

  // ---- Waiver links and the disclaimer ----
  { name: 'about-legal', steps: [['click', '#btn-about'], ['scrollEnd']], expect: ['Safety waiver', DISCLAIMER] },
  { name: 'about-waiver', steps: [['click', '#btn-about'], ['click', '#btn-about-waiver']], expect: ['.waiver-full', 'Assumption of risk'], combos: 'few' },
  { name: 'settings-legal', steps: [['click', '#btn-settings'], ['scrollTo', '#btn-settings-waiver']], expect: ['Legal', 'Safety waiver'], combos: 'few' },
  { name: 'settings-waiver', steps: [['click', '#btn-settings'], ['click', '#btn-settings-waiver']], expect: ['.waiver-full', 'Release of liability'], combos: 'few' },
];
