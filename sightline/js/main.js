// Boot, screen switching, home, Settings and About.
//
// Two sides: FOCUS (js/focus.js — eyes, mind, breath; phone in hand, every
// answer a tap) and MOVE (js/cone/ui.js — phone on a stand, react and cut).
// Home offers just those two, each with "Run last"; each side opens with
// Game Day / Training and three presets (js/presets.js).

import { initSettings, updateSetting } from './settings.js';
import { setMusicMode } from './lib/audio.js';
import { hydrateIcons } from './lib/icons.js';
import { showGuide, showFirstRun } from './guide.js';
import { createVariety } from './lib/variety.js';
import { createLastRuns, renameSavedData } from './migrate.js';
import { initFocus } from './focus.js';
import { initMove } from './cone/ui.js';
import { createTrainingLog, WEEK_GOAL } from './lib/streak.js';
import { initLeaderboard } from './score/ui.js';
import { initRoutineBuilder } from './myroutine-ui.js';
import { initInstall } from './install.js';
import { createBackup, restoreBackup } from './backup.js';
import { parseRunKey } from './presets.js';
import { BRAND, hydrateLogos } from './brand.js';
import { createWaiverStore, showWaiver, showFullWaiver } from './waiver.js';
import { DISCLAIMER } from './content/safety.js';
import { createLicense } from './license.js';
import { showUnlock } from './unlock.js';
import { PRO } from './content/pro.js';
import { isLiveHost } from './features.js';

// Sightline is now Sightrep: move this phone's saved data to the new keys
// before anything below reads it.
renameSavedData();

// Keep in step with CACHE_VERSION in sw.js.
export const APP_VERSION = '6.4';

const $ = (id) => document.getElementById(id);

// Screens slide forward (from the right) or back (from the left), 200ms.
// Reduced motion: the tokens set the duration to 0.
let onHome = () => {};
function show(name, { back = false } = {}) {
  const next = $(`screen-${name}`);
  document.querySelectorAll('.screen').forEach((s) => {
    const on = s === next;
    s.classList.toggle('is-active', on);
    s.classList.remove('enter-fwd', 'enter-back');
  });
  if (next && name !== 'session') {
    void next.offsetWidth;   // restart the animation
    next.classList.add(back ? 'enter-back' : 'enter-fwd');
  }
  if (name === 'start') onHome();
  window.scrollTo(0, 0);
}

hydrateIcons();
hydrateLogos();   // home and About (js/brand.js)

// ---- First the safety waiver (js/waiver.js), then the key (js/unlock.js) ----
// index.html starts with <html data-gate="waiver">, which hides every other
// screen until both are done: the waiver accepted (this version), and a key
// that unlocks this phone (sold on Gumroad). Everything that can open by
// itself (the first-run setup, the ?autostart direct links) waits for `accepted`.
// The setup saved with the key (js/backup.js), the waiver acceptance included, comes
// back when the key is entered on a phone that has none yet: a new phone, or the
// home-screen app on iPhone (its own storage, apart from Safari), which asks for the
// key first. Then the app starts over with it. Right after a key first unlocks a phone:
// how to put Sightrep on the home screen (js/install.js).
const waiver = createWaiverStore();
const license = createLicense();
const install = initInstall({ license });
const backup = createBackup({ license });
const standalone = install.standalone();
const freshPhone = !license.hasRecord();   // no key was ever entered here
const FIRST = 'sightrep.firstunlock';      // the first unlock, kept across the restart below (this visit only)
async function unlockScreen(reason, { welcome = false } = {}) {
  document.documentElement.dataset.gate = 'unlock';
  show('unlock');
  return showUnlock($('screen-unlock'), license, { reason, welcome, preview: !isLiveHost(location.hostname),
    activate: { app: standalone, restore: freshPhone } });
}
function restartWithSetup(out) {
  if (!freshPhone || !out?.data || !restoreBackup(out.data, { keepWaiver: !waiver.needed() })) return false;
  try { sessionStorage.setItem(FIRST, '1'); } catch { /* blocked */ }
  location.reload();
  return true;
}
let installNext = null;
const accepted = (async () => {
  let gated = false;
  let unlocked = null;
  if (standalone && freshPhone && license.needed()) {
    gated = true;
    unlocked = await unlockScreen(null, { welcome: true });
    if (restartWithSetup(unlocked)) return new Promise(() => {});
  }
  if (waiver.needed()) {
    gated = true;
    show('waiver');
    waiver.accept(await showWaiver($('screen-waiver')));
  }
  // Last good check over 30 days ago: check now, before asking for the key again.
  if (license.lockedFor() === 'expired') await license.recheck({ force: true });
  if (license.needed()) {
    gated = true;
    unlocked = await unlockScreen(license.lockedFor());
    if (restartWithSetup(unlocked)) return new Promise(() => {});
  }
  let restarted = false;
  try { restarted = sessionStorage.getItem(FIRST) === '1'; sessionStorage.removeItem(FIRST); } catch { /* blocked */ }
  installNext = install.plan({ firstUnlock: (!!unlocked && freshPhone) || restarted });
  if (installNext === 'screen') {
    gated = true;
    document.documentElement.dataset.gate = 'install';
    show('install');
    await install.showScreen($('screen-install'));
  }
  document.documentElement.removeAttribute('data-gate');
  if (gated) show('start');
  backup.saveSoon(unlocked || restarted ? 0 : 4000);
})();

// Once a day (when online), check the key is still good on this phone. A key
// moved to another phone, or refunded, locks this one, but only on the home
// screen, never mid-session.
let lockReason = null;
async function lockIfDue() {
  if (!lockReason || !$('screen-start').classList.contains('is-active')) return;
  const reason = lockReason;
  lockReason = null;
  await unlockScreen(reason);
  document.documentElement.removeAttribute('data-gate');
  show('start');
}
accepted.then(() => license.recheck()).then((reason) => { lockReason = reason; lockIfDue(); });
$('btn-about-waiver').addEventListener('click', () => showFullWaiver());
$('btn-settings-waiver').addEventListener('click', () => showFullWaiver());
$('disclaimer').textContent = DISCLAIMER;
$('about-disclaimer').textContent = DISCLAIMER;

$('brand-tagline').textContent = BRAND.tagline;   // one place to change it: js/brand.js

// Dev aids: ?speed=20 fast-forwards; ?autostart=1 starts Game Ready (or
// ?autostart=1&session=activate a one-part session, ?autostart=game:speed |
// custom | signals a MOVE run); ?only=lockin,stroop runs just those drill ids;
// ?autoready=1 skips the Ready taps; ?noguide=1 skips the first-run setup;
// ?seed=N replays a session exactly (ignores and doesn't update the
// "recently used" list).
const params = new URLSearchParams(location.search);
const dev = {
  speed: Math.max(1, Number(params.get('speed')) || 1),
  autoReady: params.has('autoready'),
  seed: params.get('seed'),
  only: params.get('only')?.split(','),
  state: params.get('state'),   // flat | ready | wired, to test the readiness tap's routines
  eyeSim: params.get('eyesim'),   // Eye Check with a pretend face (js/eye/sim.js)
};
const variety = createVariety();
const lastRuns = createLastRuns();
const trainingLog = createTrainingLog();   // training days, for the weekly streak (this phone only)
const week = () => ({ ...trainingLog.summary(), goal: WEEK_GOAL });

// ---- Settings, reachable from home and from FOCUS (Advanced → Options) ----
let focus = null;
let move = null;
let settingsFrom = 'start';
const getSettings = initSettings({
  onChange: (s) => { setMusicMode(s.music === 'on'); renderHome(); backup.saveSoon(); },
});
function renderLicense() {
  $('license-title').textContent = PRO.settings.title;
  $('license-status').textContent = license.last4() ? `${PRO.settings.on} · ${PRO.settings.key(license.last4())}` : PRO.settings.on;
  $('license-hint').textContent = PRO.settings.move;
}
function openSettings(from) {
  renderLicense();
  settingsFrom = from;
  $('settings-back-label').textContent = from === 'focus' ? 'Focus' : 'Home';
  show('settings');
}
const closeSettings = () => { if (settingsFrom === 'focus') focus.renderHub(); show(settingsFrom, { back: true }); };
$('btn-settings').addEventListener('click', () => openSettings('start'));
$('btn-settings-back').addEventListener('click', closeSettings);
$('btn-settings-done').addEventListener('click', closeSettings);
$('btn-settings-install').addEventListener('click', async () => {
  show('install');
  await install.showScreen($('screen-install'), { fromSettings: true });
  show('settings', { back: true });
});

// "Remind me later": a small banner on the home screen, on the next 2 visits (js/install.js).
accepted.then(() => {
  if (installNext !== 'banner') return;
  $('install-banner').hidden = false;
  install.bannerShown();
});
$('btn-install-banner-x').addEventListener('click', () => { $('install-banner').hidden = true; });
$('btn-install-banner').addEventListener('click', async () => {
  show('install');
  const choice = await install.showScreen($('screen-install'));
  $('install-banner').hidden = choice === 'added' || choice === 'later';
  show('start', { back: true });
});
// Save the setup with the key when the app goes to the background (js/backup.js).
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') backup.saveNow(); });

// ---- Leaderboard ----
const leaderboard = initLeaderboard({ show, getSettings });
$('btn-board').addEventListener('click', () => leaderboard.openBoard('start'));
$('btn-done-board').addEventListener('click', () => leaderboard.openBoard('done', { side: 'focus' }));

// ---- The two sides ----
// After a FOCUS session: save the setup with the key, and "Next: Move" after a Game Day preset
// (Game Speed: set the phone down, the countdown gives time to get to the start).
const NEXT_MOVE = 'game:speed';
focus = initFocus({
  show, dev, variety, getSettings, updateSetting, leaderboard, week,
  onRun: (key) => lastRuns.set('focus', key),
  onTrained: () => trainingLog.add(),
  onOptions: () => openSettings('focus'),
  onRoutine: () => builder.open(),
  afterSession: ({ key }) => {
    backup.saveSoon();
    const next = parseRunKey(key)?.day === 'game';
    $('btn-next-move').hidden = !next;
    if (next) $('next-move-desc').textContent = move.describeRun(NEXT_MOVE);
  },
});
const builder = initRoutineBuilder({
  show, getSettings,
  onTry: () => focus.start('myroutine', { from: 'routine' }),
  onBack: () => { focus.renderHub(); show('focus', { back: true }); },
});
// MOVE's Sport calls use the sport picked for Focus (asked once, on this phone).
const sport = {
  get: () => getSettings().sport,
  set(value) { updateSetting('sport', value); updateSetting('position', ''); updateSetting('sportAsked', true); },
};
move = initMove({
  show, dev, leaderboard, sport, getSettings, updateSetting, week,
  onRun: (key) => lastRuns.set('move', key),
  onTrained: () => trainingLog.add(),
  afterSession: () => backup.saveSoon(),
});
$('btn-next-move').addEventListener('click', () => move.run(NEXT_MOVE));
$('btn-done').addEventListener('click', () => { $('summary-board').innerHTML = ''; });

// ---- Home: two choices, each with "Run last" (one tap) once something has run ----
function renderHome() {
  if (!focus || !move) return;
  const last = lastRuns.get();
  const f = last.focus ? focus.describeRun(last.focus) : '';
  const m = last.move && move.knows(last.move) ? move.describeRun(last.move) : '';
  $('btn-focus-last').hidden = !f;
  $('btn-focus-open').hidden = !!f;
  $('focus-last-desc').textContent = f;
  $('btn-move-last').hidden = !m;
  $('btn-move-open').hidden = !!m;
  $('move-last-desc').textContent = m;
}
onHome = () => { renderHome(); lockIfDue(); };
renderHome();

$('btn-focus').addEventListener('click', () => focus.openHub());
$('btn-focus-open').addEventListener('click', () => focus.openHub());
$('btn-move').addEventListener('click', () => move.openHub());
$('btn-move-open').addEventListener('click', () => move.openHub());
$('btn-focus-last').addEventListener('click', () => focus.runLast(lastRuns.get().focus));
$('btn-move-last').addEventListener('click', () => move.run(lastRuns.get().move));

$('version').textContent = `· v${APP_VERSION}`;
$('about-version').textContent = `Version ${APP_VERSION}`;

// Splash: show the logo for a beat, then fade (immediately for test runs).
// A brand-new phone (or the first open after v4.0) gets the first-run setup.
const splash = $('splash');
const hideSplash = () => {
  splash.classList.add('is-out');
  setTimeout(() => splash.remove(), 300);
  accepted.then(() => {
    if (!getSettings().setupDone && !params.has('noguide') && !params.has('autostart')) {
      showFirstRun({ getSettings, updateSetting, onDone: renderHome });
    }
  });
};
setTimeout(hideSplash, params.has('autostart') ? 0 : Math.max(0, 700 - performance.now()));

// ---- About, with "How it works" and "Reset variety" ----
$('btn-about').addEventListener('click', () => { $('variety-status').textContent = ''; show('about'); });
$('btn-about-back').addEventListener('click', () => show('start', { back: true }));
$('btn-about-guide').addEventListener('click', showGuide);
$('btn-reset-variety').addEventListener('click', () => {
  variety.reset();
  $('variety-status').textContent = variety.available
    ? 'Variety reset. Your next session can use everything again.'
    : 'Nothing to reset on this device.';
});

// Offline support. Skipped on localhost so edits show up right away;
// add ?sw=1 to test it locally.
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if ('serviceWorker' in navigator && (!isLocal || params.has('sw'))) {
  // A new version downloads in the background; it's offered on the home
  // screen (never mid-session). Tapping swaps it in and reloads.
  let waiting = null;
  let updating = false;
  const offer = (worker) => {
    waiting = worker;
    if ($('screen-start').classList.contains('is-active')) $('update').hidden = false;
  };
  const prevHome = onHome;
  onHome = () => { prevHome(); if (waiting) $('update').hidden = false; };
  $('btn-update').addEventListener('click', () => {
    updating = true;
    waiting?.postMessage('SKIP_WAITING');
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
  }).catch(() => {});
}

// Direct links start a session only once the waiver is accepted.
accepted.then(() => {
  const auto = params.get('autostart');
  const autoMove = { quick: 'game:quick' }[auto] ?? auto;
  if (auto && move.knows(autoMove)) move.run(autoMove);
  else if (auto) focus.start(params.get('session') ?? 'game');
});
