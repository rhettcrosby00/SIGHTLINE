// Sightrep Pro's unlock screen (v5.4) in a real browser: `node tools/screens/cdp.mjs unlock`.
// After the waiver, a phone with no key sees only the unlock screen; wrong and
// refunded keys say why; a good key opens the app and stays open after
// reopening; a phone whose key moved elsewhere is locked with the reason; one
// offline for 40 days checks in and opens. Then the Settings row and Coach tools.
// Each activating shot types a fresh test key, so reruns never hit the move limit.
// Shot format: scenarios/main.mjs.
import { PRO } from '../../../sightline/js/content/pro.js';

export const BASE = { length: 'standard', difficulty: 'normal', sound: 'off', guide: 'full', cue: 'ATTACK' };

const NO_KEY = 'license=0';
const typeKey = (prefix) => ['eval', `const i = document.querySelector('#unlock-key'); i.value = '${prefix}' + Math.random().toString(36).slice(2, 10).toUpperCase(); i.dispatchEvent(new Event('input', { bubbles: true }))`];
const UNLOCK = ['click', '#screen-unlock [data-act="unlock"]'];
// A first unlock shows the home-screen steps (js/install.js); "I've added it" goes on to the app.
const PAST_INSTALL = [['waitFor', '#screen-install.is-active', 8000], ['click', '[data-install="added"]']];
const ONLY_UNLOCK = [
  '#screen-unlock.is-active', 'js:document.documentElement.dataset.gate === "unlock"',
  'js:[...document.querySelectorAll(".screen")].filter((s) => getComputedStyle(s).display !== "none").map((s) => s.id).join() === "screen-unlock"',
  'js:!document.querySelector(".guide, .howto, .count")', PRO.heading,
];
const SAVED = 'js:(() => { const r = JSON.parse(localStorage.getItem("sightrep.license.v1")); return r.state === "ok" && /^TEST-OK-/.test(r.key) && Date.now() - r.checkedAt < 60000; })()';

export const SHOTS = [
  // ---- A phone with no key ----
  { name: 'unlock-after-waiver', params: `waiver=0&${NO_KEY}`,
    steps: [['click', '[data-check="risks"]'], ['click', '[data-check="age"]'], ['click', '[data-act="agree"]'], ['waitFor', '#screen-unlock.is-active', 8000], ['wait', 300]],
    expect: [...ONLY_UNLOCK, 'js:!!localStorage.getItem("sightrep.waiver.v1")'], combos: 'few' },
  { name: 'unlock', params: NO_KEY, expect: [...ONLY_UNLOCK, PRO.price, PRO.buy, PRO.keyLabel, PRO.previewHint, `#screen-unlock a.btn--primary[href="${PRO.buyUrl}"][target="_blank"]`] },
  { name: 'unlock-end', params: NO_KEY, steps: [['scrollEnd']], expect: [PRO.help], combos: 'few' },
  { name: 'unlock-empty', params: NO_KEY, steps: [UNLOCK, ['wait', 300]], expect: [...ONLY_UNLOCK, PRO.errors.empty], combos: 'few' },
  { name: 'unlock-wrong', params: NO_KEY, steps: [['type', '#unlock-key', 'TEST-WRONG-123'], UNLOCK, ['wait', 900]], expect: [...ONLY_UNLOCK, PRO.errors.invalid], combos: 'few' },
  { name: 'unlock-refunded', params: NO_KEY, steps: [typeKey('TEST-REFUNDED-'), UNLOCK, ['wait', 900]], expect: [...ONLY_UNLOCK, PRO.errors.refunded], combos: 'few' },
  // A direct drill link waits behind the unlock screen too.
  { name: 'unlock-direct-link', params: `${NO_KEY}&autostart=1&session=activate&only=peripheral`, steps: [['wait', 2500]],
    expect: [...ONLY_UNLOCK, 'js:!document.getElementById("stage").children.length'], combos: 'few' },

  // ---- A good key ----
  { name: 'unlock-good', params: NO_KEY, steps: [typeKey('TEST-OK-'), UNLOCK, ...PAST_INSTALL, ['waitFor', '#screen-start.is-active', 8000]],
    expect: ['#screen-start.is-active', 'js:!document.documentElement.dataset.gate', 'Choose a preset', SAVED] },
  { name: 'unlock-reopened', params: NO_KEY, steps: [typeKey('TEST-OK-'), UNLOCK, ...PAST_INSTALL, ['waitFor', '#screen-start.is-active', 8000]], reopen: 'noguide=1',
    expect: ['#screen-start.is-active', 'js:!document.documentElement.dataset.gate', 'js:!document.getElementById("screen-unlock").children.length', SAVED], combos: 'few' },
  { name: 'unlock-then-drill', params: `${NO_KEY}&autostart=1&session=activate&only=peripheral`, steps: [typeKey('TEST-OK-'), UNLOCK, ...PAST_INSTALL, ['waitFor', '.howto', 8000]],
    expect: ['Peripheral Flash', '#screen-session.is-active'], combos: 'few' },

  // ---- Locked, and offline too long ----
  { name: 'unlock-locked', params: 'license=locked', expect: [...ONLY_UNLOCK, PRO.locked.moved] },
  { name: 'unlock-old-online', params: 'license=old', steps: [['waitFor', '#screen-start.is-active', 8000]],
    expect: ['#screen-start.is-active', 'js:Date.now() - JSON.parse(localStorage.getItem("sightrep.license.v1")).checkedAt < 60000'], combos: 'few' },

  // ---- Settings and Coach tools ----
  { name: 'settings-license', steps: [['click', '#btn-settings'], ['scrollTo', '#license-group']], expect: [PRO.settings.title, `${PRO.settings.on} · ${PRO.settings.key('SEED')}`, PRO.settings.move], combos: 'few' },
  { name: 'coach-keys', steps: [['click', '#btn-board'], ['waitFor', '#lb-board [data-act="coach"]', 8000], ['click', '#lb-board [data-act="coach"]'],
    ['type', '#lb-pin', '2468'], ['click', '#lb-coach [data-act="unlock"]'], ['waitFor', '#lb-key', 8000],
    ['type', '#lb-key', 'NEVER-USED-KEY'], ['click', '#lb-coach [data-act="reset-key"]'], ['wait', 900], ['scrollTo', '#lb-key']],
    expect: ['Free a key for a new phone', 'No phone uses that key yet.'], combos: 'few' },
];
