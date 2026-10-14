// Routine engine: plays each step in order, drives the progress bar and HUD,
// handles pause/quit, and keeps the screen awake.
//
// Every drill module exports:
//   async run({ el, settings, step, durationMs, signal, sleep, now, isPaused })
//     -> { name, trials?, correct?, rtMs? }
// `sleep(ms)` only counts unpaused time and rejects when the session is quit,
// so drills built on it get pause/quit for free. `now()` is unpaused ms since
// the step began, for smooth animations that freeze on pause.
// `speed` (dev only, via ?speed=N) fast-forwards the clock for testing.

import { keepAwake, allowSleep } from './lib/wakelock.js';
import { cues } from './lib/audio.js';

const $ = (id) => document.getElementById(id);

export class AbortedError extends Error {}

export async function runSession(steps, settings, { speed = 1 } = {}) {
  const stageEl = $('stage');
  const fill = $('progress-fill');
  const bar = fill.parentElement;
  const hudBlock = $('hud-block');
  const hudTime = $('hud-time');
  const overlay = $('pause-overlay');

  const total = steps.reduce((a, s) => a + s.durationMs, 0);
  const controller = new AbortController();
  const { signal } = controller;

  // Progress clock: planned time of finished steps + unpaused time in the
  // current step (capped at its slice), so the bar only ever moves forward.
  let paused = false;
  let doneMs = 0;
  let stepMs = 0;
  let stepCap = 0;
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    if (!paused) stepMs += (now - last) * speed;
    last = now;
  };
  const elapsed = () => doneMs + Math.min(stepMs, stepCap);

  const isPaused = () => paused;
  const now = () => { tick(); return stepMs; };

  function sleep(ms) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new AbortedError());
      let left = ms;
      let prev = performance.now();
      const id = setInterval(() => {
        const now = performance.now();
        if (!paused) left -= (now - prev) * speed;
        prev = now;
        if (left <= 0) { cleanup(); resolve(); }
      }, 30);
      const onAbort = () => { cleanup(); reject(new AbortedError()); };
      const cleanup = () => { clearInterval(id); signal.removeEventListener('abort', onAbort); };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  // HUD loop (interval, not rAF, so it keeps pace with the sleep() clock)
  let hudTimer;
  const fmt = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const drawHud = () => {
    tick();
    const pct = Math.min(100, (elapsed() / total) * 100);
    fill.style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    hudTime.textContent = fmt(total - elapsed());
  };

  // Pause / resume / quit
  const pause = () => { paused = true; overlay.hidden = false; $('btn-resume').focus(); };
  const resume = () => { paused = false; overlay.hidden = true; };
  const quit = () => { paused = false; overlay.hidden = true; controller.abort(); };
  const onVisibility = () => { if (document.visibilityState === 'hidden' && !paused) pause(); };

  $('btn-pause').onclick = pause;
  $('btn-resume').onclick = resume;
  $('btn-quit').onclick = quit;
  document.addEventListener('visibilitychange', onVisibility);

  keepAwake();
  overlay.hidden = true;
  last = performance.now();
  hudTimer = setInterval(drawHud, 100);

  const results = [];
  try {
    let prevBlock = null;
    for (const step of steps) {
      if (prevBlock && step.blockId !== prevBlock) cues.block();
      prevBlock = step.blockId;
      hudBlock.textContent = step.blockTitle;
      stageEl.innerHTML = '';
      tick();
      stepMs = 0;
      stepCap = step.durationMs;
      const result = await step.module.run({
        el: stageEl, settings, step, durationMs: step.durationMs, signal, sleep, now, isPaused,
      });
      doneMs += step.durationMs;
      stepMs = 0;
      results.push({ id: step.id, blockId: step.blockId, name: step.title, ...result });
    }
    return { completed: true, results };
  } catch (err) {
    if (err instanceof AbortedError) return { completed: false, results };
    throw err;
  } finally {
    clearInterval(hudTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    $('btn-pause').onclick = $('btn-resume').onclick = $('btn-quit').onclick = null;
    stageEl.innerHTML = '';
    allowSleep();
  }
}
