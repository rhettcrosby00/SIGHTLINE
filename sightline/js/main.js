// Boot and screen switching.

import { initSettings } from './settings.js';
import { buildRoutine } from './routine.js';
import { runSession } from './engine.js';
import { unlock as unlockAudio } from './lib/audio.js';
import { renderSummary } from './stages/summary.js';

const $ = (id) => document.getElementById(id);

function show(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-active', s.id === `screen-${name}`));
  window.scrollTo(0, 0);
}

const getSettings = initSettings();
// Dev aids: ?speed=20 fast-forwards a session; ?autostart=1 skips the Start tap;
// ?only=lockin,stroop runs just those drill ids.
const params = new URLSearchParams(location.search);
const speed = Math.max(1, Number(params.get('speed')) || 1);

$('btn-start').addEventListener('click', async () => {
  const settings = getSettings();
  unlockAudio(settings.sound === 'on');   // must happen inside the tap
  const only = params.get('only')?.split(',');
  const steps = buildRoutine(settings).filter((s) => !only || only.includes(s.id));
  show('session');
  const { completed, results } = await runSession(steps, settings, { speed });
  if (!completed) { show('start'); return; }

  const totalMs = steps.reduce((a, s) => a + s.durationMs, 0);
  renderSummary($('summary'), { results, settings, totalMs });
  show('done');
});

// Nothing is kept: clear the summary and go back to the start screen.
$('btn-done').addEventListener('click', () => {
  $('summary').innerHTML = '';
  show('start');
});

// Offline support. Skipped on localhost so edits show up right away;
// add ?sw=1 to test it locally.
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if ('serviceWorker' in navigator && (!isLocal || params.has('sw'))) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Install: Chrome/Android offers a prompt; iOS Safari gets a one-line tip.
const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (!installed) {
  const box = $('install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    box.innerHTML = '<button type="button" class="btn-install">Install app for offline use</button>';
    box.hidden = false;
    box.firstElementChild.addEventListener('click', () => { box.hidden = true; e.prompt(); });
  });
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    box.textContent = 'Tip: Share → Add to Home Screen to use it offline.';
    box.hidden = false;
  }
}

if (params.has('autostart')) $('btn-start').click();
