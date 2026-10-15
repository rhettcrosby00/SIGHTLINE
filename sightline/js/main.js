// Boot, screen switching, and the home screen.

import { initSettings, updateSetting, describe } from './settings.js';
import { buildRoutine } from './routine.js';
import { runSession } from './engine.js';
import { unlock as unlockAudio, buzz } from './lib/audio.js';
import { hydrateIcons } from './lib/icons.js';
import { renderSummary } from './stages/summary.js';
import { showGuide, guideSeen } from './guide.js';
import { askBefore, askAfter } from './stages/readiness.js';
import { createSession } from './session.js';
import { createVariety } from './lib/variety.js';
import { isOn } from './features.js';
import { initConeDrill } from './cone/ui.js';

// Keep in step with CACHE_VERSION in sw.js.
export const APP_VERSION = '1.9';

const $ = (id) => document.getElementById(id);

// Screens slide forward (from the right) or back (from the left), 200ms.
// Reduced motion: the tokens set the duration to 0.
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
  window.scrollTo(0, 0);
}

hydrateIcons();

// Dev aids: ?speed=20 fast-forwards a session; ?autostart=1 skips the Start tap;
// ?only=lockin,stroop runs just those drill ids; ?autoready=1 skips the Ready
// taps; ?noguide=1 skips the first-run guide; ?seed=N replays session N
// exactly (ignores and doesn't update the "recently used" list).
const params = new URLSearchParams(location.search);
const speed = Math.max(1, Number(params.get('speed')) || 1);
const autoReady = params.has('autoready');
const replaySeed = params.get('seed');
const variety = createVariety();
let inSession = false;

// ---- "Run last setup": remembers which drill ran last (device only) ----
const LAST_KEY = 'sightline.last.v1';
const lastRun = {
  get() { try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch { return null; } },
  set(v) { try { localStorage.setItem(LAST_KEY, JSON.stringify(v)); } catch { /* ignore */ } },
};

let cone = null;
let settingsNow = null;   // latest Routine settings, for the home screen
function renderLast() {
  const last = lastRun.get();
  const btn = $('btn-last');
  if (last?.type === 'cone' && cone) {
    $('last-desc').textContent = cone.describe();
    btn.hidden = false;
  } else if (last?.type === 'game') {
    $('last-desc').textContent = `Game Ready · ${describe(settingsNow)}`;
    btn.hidden = false;
  } else {
    btn.hidden = true;
  }
}

const getSettings = initSettings({
  onChange: (s) => {
    settingsNow = s;
    $('home-meta').textContent = `${describe(s)} · Regulate → Activate → Challenge → Rehearse`;
    renderLast();
  },
});

$('version').textContent = `· v${APP_VERSION}`;
$('about-version').textContent = `Version ${APP_VERSION}`;
$('btn-guide').addEventListener('click', showGuide);

// Splash: show the logo for a beat, then fade (immediately for test runs).
const splash = $('splash');
const hideSplash = () => {
  splash.classList.add('is-out');
  setTimeout(() => splash.remove(), 300);
  if (!guideSeen() && !params.has('noguide') && !params.has('autostart')) showGuide();
};
setTimeout(hideSplash, params.has('autostart') ? 0 : Math.max(0, 700 - performance.now()));

// Routine settings
$('btn-settings').addEventListener('click', () => show('settings'));
$('btn-settings-back').addEventListener('click', () => show('start', { back: true }));
$('btn-settings-done').addEventListener('click', () => show('start', { back: true }));

// Cone Drill: its own option on the home screen (behind a feature flag).
if (isOn('coneDrill')) {
  cone = initConeDrill({
    show,
    dev: { speed, autoReady, seed: replaySeed },
    onRun: () => { lastRun.set({ type: 'cone' }); renderLast(); },
  });
  $('btn-cone').hidden = false;
  $('btn-cone').addEventListener('click', () => cone.open());
}
renderLast();

$('btn-last').addEventListener('click', () => {
  const last = lastRun.get();
  if (last?.type === 'cone' && cone) cone.runLast();
  else $('btn-start').click();
});

// About screen, with "Reset variety".
$('btn-about').addEventListener('click', () => { $('variety-status').textContent = ''; show('about'); });
$('btn-about-back').addEventListener('click', () => show('start', { back: true }));
$('btn-about-guide').addEventListener('click', showGuide);
$('btn-reset-variety').addEventListener('click', () => {
  variety.reset();
  $('variety-status').textContent = variety.available
    ? 'Variety reset. Your next session can use everything again.'
    : 'Nothing to reset on this device.';
});

$('btn-start').addEventListener('click', async () => {
  const settings = getSettings();
  unlockAudio(settings.sound === 'on');   // must happen inside the tap
  lastRun.set({ type: 'game' });
  // Every session is freshly shuffled; content from the last few sessions rests.
  const session = createSession({ settings, seed: replaySeed, recent: replaySeed ? [] : variety.recent() });
  const only = params.get('only')?.split(',');
  const steps = buildRoutine(session).filter((s) => !only || only.includes(s.id));

  // Readiness + cue word before; readiness again after. Not timed, not saved.
  const readiness = { before: null, after: null };
  if (!autoReady) {
    show('check');
    const pick = await askBefore($('check'), { cue: settings.cue, suggestions: session.content.cueSuggestions });
    readiness.before = pick.level;
    settings.cue = pick.cue;
    updateSetting('cue', pick.cue);
  }

  show('session');
  inSession = true;
  const { completed, results } = await runSession(steps, settings, { session, speed, autoReady });
  inSession = false;
  if (!replaySeed) variety.add(session.record());   // also after a quit: they saw it
  renderLast();
  if (!completed) { show('start', { back: true }); return; }
  buzz([60, 80, 120]);   // session complete

  if (!autoReady) {
    show('check');
    readiness.after = await askAfter($('check'), { cue: settings.cue });
  }
  $('check').innerHTML = '';

  const totalMs = steps.reduce((a, s) => a + s.durationMs, 0);
  renderSummary($('summary'), { results, settings, totalMs, readiness, seed: session.seed });
  show('done');
});

// Nothing is kept: clear the summary and go back home.
$('btn-done').addEventListener('click', () => {
  $('summary').innerHTML = '';
  show('start', { back: true });
});

// Offline support. Skipped on localhost so edits show up right away;
// add ?sw=1 to test it locally.
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if ('serviceWorker' in navigator && (!isLocal || params.has('sw'))) {
  // A new version downloads in the background; offer it on the home screen
  // (never mid-session). Tapping swaps it in and reloads.
  let waiting = null;
  let updating = false;
  const offer = (worker) => {
    waiting = worker;
    if (!inSession) $('update').hidden = false;
  };
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
  // Show a pending update once a session finishes.
  $('btn-done').addEventListener('click', () => { if (waiting) $('update').hidden = false; });
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

if (params.has('autostart')) $('btn-start').click();
