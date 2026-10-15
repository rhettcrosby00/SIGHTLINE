// Boot, screen switching, home, Settings and About.
//
// Two sides: FOCUS (js/focus.js — eyes, mind, breath; phone in hand, every
// answer a tap) and MOVE (js/cone/ui.js — phone on a stand, react and cut).

import { initSettings, updateSetting } from './settings.js';
import { setMusicMode } from './lib/audio.js';
import { hydrateIcons, icon } from './lib/icons.js';
import { showGuide, guideSeen } from './guide.js';
import { createVariety } from './lib/variety.js';
import { createLastRuns } from './migrate.js';
import { initFocus } from './focus.js';
import { initMove, MOVE_RUNS } from './cone/ui.js';
import { initLeaderboard } from './score/ui.js';
import { initRoutineBuilder } from './myroutine-ui.js';
import { isOn } from './features.js';

// Keep in step with CACHE_VERSION in sw.js.
export const APP_VERSION = '2.6';

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

// Dev aids: ?speed=20 fast-forwards; ?autostart=1 starts Game Ready (or
// ?autostart=1&session=activate a one-part session, ?autostart=quick|custom|signals
// a MOVE drill); ?only=lockin,stroop runs just those drill ids; ?autoready=1
// skips the Ready taps; ?noguide=1 skips the first-run guide; ?seed=N replays
// a session exactly (ignores and doesn't update the "recently used" list).
const params = new URLSearchParams(location.search);
const dev = {
  speed: Math.max(1, Number(params.get('speed')) || 1),
  autoReady: params.has('autoready'),
  seed: params.get('seed'),
  only: params.get('only')?.split(','),
  state: params.get('state'),   // flat | ready | wired, to test the check-in's routines
};
const variety = createVariety();
const lastRuns = createLastRuns();

// ---- Settings (FOCUS options + theme), reachable from home and from FOCUS ----
let focus = null;
let move = null;
let settingsFrom = 'start';
const getSettings = initSettings({
  onChange: (s) => { setMusicMode(s.music === 'on'); renderHome(); focus?.renderHub(); },
});
function openSettings(from) {
  settingsFrom = from;
  $('settings-back-label').textContent = from === 'focus' ? 'Focus' : 'Home';
  show('settings');
}
const closeSettings = () => show(settingsFrom, { back: true });
$('btn-settings').addEventListener('click', () => openSettings('start'));
$('btn-settings-back').addEventListener('click', closeSettings);
$('btn-settings-done').addEventListener('click', closeSettings);

// ---- Leaderboard (behind a flag until approved) ----
const leaderboard = isOn('leaderboard') ? initLeaderboard({ show, getSettings }) : null;
if (leaderboard) {
  $('btn-board').hidden = false;
  $('btn-board').addEventListener('click', () => leaderboard.openBoard('start'));
  $('btn-done-board').hidden = false;
  $('btn-done-board').addEventListener('click', () => leaderboard.openBoard('done', { side: 'focus' }));
}

// ---- The two sides ----
focus = initFocus({
  show, dev, variety, getSettings, updateSetting, leaderboard,
  onRun: (id) => lastRuns.set('focus', id),
  onOptions: () => openSettings('focus'),
  onRoutine: () => builder.open(),
});
const builder = initRoutineBuilder({
  show, getSettings,
  onTry: () => focus.start('myroutine', { from: 'routine' }),
  onBack: () => { focus.renderHub(); show('focus', { back: true }); },
});
move = initMove({ show, dev, leaderboard, onRun: (run) => lastRuns.set('move', run) });

// ---- Home: two choices, each with its preset, time and "Run last" ----
function renderHome() {
  if (!focus) return;
  $('btn-game').innerHTML = `${icon('play')}Game Ready · ${focus.minutes('game')} min`;
  $('routine-len').textContent = focus.routineLabel();
  $('btn-quick').innerHTML = `${icon('play')}Quick Start · ${move.minutes('quick')} min`;
  const last = lastRuns.get();
  // "Run last" shows when it's something other than the preset button above it.
  const focusLast = last.focus && last.focus !== 'game' && last.focus !== 'myroutine' ? last.focus : null;
  $('btn-focus-last').hidden = !focusLast;
  if (focusLast) $('focus-last-desc').textContent = `${focus.title(focusLast)} · ${focus.minutes(focusLast)} min`;
  $('btn-move-last').hidden = !last.move;
  if (last.move) $('move-last-desc').textContent = `${MOVE_RUNS[last.move]} · ${move.minutes(last.move)} min`;
}
onHome = renderHome;
renderHome();

$('btn-focus').addEventListener('click', () => focus.openHub());
$('btn-move').addEventListener('click', () => move.openHub());
$('btn-game').addEventListener('click', () => focus.start('game'));
$('btn-routine').addEventListener('click', () => focus.start('myroutine'));   // one tap from home
$('btn-quick').addEventListener('click', () => move.open('quick'));
$('btn-focus-last').addEventListener('click', () => focus.start(lastRuns.get().focus));
$('btn-move-last').addEventListener('click', () => move.runLast(lastRuns.get().move));

$('version').textContent = `· v${APP_VERSION}`;
$('about-version').textContent = `Version ${APP_VERSION}`;

// Splash: show the logo for a beat, then fade (immediately for test runs).
const splash = $('splash');
const hideSplash = () => {
  splash.classList.add('is-out');
  setTimeout(() => splash.remove(), 300);
  if (!guideSeen() && !params.has('noguide') && !params.has('autostart')) showGuide();
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

// Install: Chrome/Android offers a prompt; iOS Safari gets a one-line tip.
const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (!installed) {
  const box = $('install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    box.innerHTML = '<button type="button" class="link-btn">Install for offline use</button>';
    box.hidden = false;
    box.firstElementChild.addEventListener('click', () => { box.hidden = true; e.prompt(); });
  });
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    box.textContent = 'To use offline: Share → Add to Home Screen.';
    box.hidden = false;
  }
}

const auto = params.get('autostart');
if (auto && auto in MOVE_RUNS) move.runLast(auto);
else if (auto) focus.start(params.get('session') ?? 'game');
