// Routine engine: plays each step in order, drives the progress bar and HUD,
// handles pause/quit, and keeps the screen awake.
//
// It pauses on its own, with a big Resume, whenever the phone gets in the way:
// the screen locks, the athlete switches apps, a call or alarm takes over the
// sound, or something covers the app. (A notification banner on its own can't
// be seen by a web app.) If the screen can't be kept awake (Low Power Mode,
// Battery Saver, an older phone) a tip says so.
// Options: lock (MOVE) ignores every tap during the drill; holding a finger
// anywhere for 1 s pauses. resumeLeadS (MOVE) counts back in after Resume, so
// there's time to get back to the start spot.
//
// Every drill module exports:
//   async run(ctx) -> { trials?, correct?, rtMs?, ... }
// ctx: { el, settings, session, step, durationMs, signal, sleep, now, remaining, hold, ready, isPaused }
//   session      this session's plan and content streams (js/session.js).
//   sleep(ms)    waits unpaused time; rejects when the session is quit.
//   now()        unpaused ms since the step began (animations, reaction times).
//   remaining()  drill time left. Time spent inside hold() doesn't count, so
//                how-to cards and practice never eat into a drill's slot.
//   hold(fn)     runs fn with the drill clock held (instructions, practice).
//   ready(btn)   waits for a tap on btn (use inside hold).
// Dev only: `speed` (?speed=N) fast-forwards; `autoReady` (?autoready=1)
// skips ready buttons so scripted runs don't stall.

import { keepAwake, allowSleep } from './lib/wakelock.js';
import { cues, onInterrupt, resumeAudio, say } from './lib/audio.js';

export const HOLD_TO_PAUSE_MS = 1000;
export const AWAKE_TIP = 'Your screen may turn off by itself. Low Power Mode (or Battery Saver) can stop Sightline keeping it on: turn it off, or set Auto-Lock to Never for now.';
export const PAUSE_WHY = {
  hidden: 'You left the app or the screen locked.',
  sound: 'Something took over the sound, like a call or an alarm.',
  covered: 'Something covered the screen.',
  hold: '',
  tap: '',
};

const $ = (id) => document.getElementById(id);

class AbortedError extends Error {}

export async function runSession(steps, settings, { session, speed = 1, autoReady = false, lock = false, resumeLeadS = 0 } = {}) {
  const stageEl = $('stage');
  const fill = $('progress-fill');
  const bar = fill.parentElement;
  const hudBlock = $('hud-block');
  const hudTime = $('hud-time');
  const overlay = $('pause-overlay');

  const total = steps.reduce((a, s) => a + s.durationMs, 0);
  const controller = new AbortController();
  const { signal } = controller;

  // Two clocks for the current step:
  //   activeMs  unpaused time; drives sleep(), now(), animations, reaction times.
  //   workMs    unpaused time outside hold(); drives the progress bar and
  //             remaining(). Finished steps add their full planned slice, so
  //             the bar only ever moves forward.
  let paused = false;
  let held = 0;
  let doneMs = 0;
  let activeMs = 0;
  let workMs = 0;
  let stepCap = 0;
  let last = performance.now();
  const tick = () => {
    const t = performance.now();
    const d = (t - last) * speed;
    last = t;
    if (paused) return;
    activeMs += d;
    if (!held) workMs += d;
  };
  const elapsed = () => doneMs + Math.min(workMs, stepCap);

  const isPaused = () => paused;
  const now = () => { tick(); return activeMs; };
  const remaining = () => { tick(); return stepCap - workMs; };

  async function hold(fn) {
    tick(); held++;
    try { return await fn(); } finally { tick(); held--; }
  }

  function ready(btn) {
    if (autoReady) return sleep(400);
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new AbortedError());
      const done = () => { cleanup(); resolve(); };
      const onAbort = () => { cleanup(); reject(new AbortedError()); };
      const cleanup = () => { btn.removeEventListener('click', done); signal.removeEventListener('abort', onAbort); };
      btn.addEventListener('click', done, { once: true });
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

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
  const screen = $('screen-session');
  const why = $('pause-why');
  let lead = null;   // the count back in after Resume (MOVE)
  const pause = (reason = 'tap') => {
    const counting = !!lead;   // paused again while counting back in: stay paused
    if (lead) { clearInterval(lead); lead = null; overlay.classList.remove('is-counting'); }
    if (paused && !counting) return;
    paused = true;
    why.textContent = PAUSE_WHY[reason] ?? '';
    overlay.hidden = false;
    $('btn-resume').focus();
  };
  const unpause = () => { paused = false; overlay.hidden = true; overlay.classList.remove('is-counting'); };
  const resume = () => {
    resumeAudio();   // inside the tap: sound comes back after a call
    if (!resumeLeadS || lead) return unpause();
    let n = resumeLeadS;
    overlay.classList.add('is-counting');
    why.innerHTML = `Back to your start spot<b class="pause__count">${n}</b>`;
    say(String(n));
    lead = setInterval(() => {
      n--;
      if (n > 0) { why.querySelector('.pause__count').textContent = n; say(String(n)); return; }
      clearInterval(lead);
      lead = null;
      unpause();
    }, 1000);
  };
  const quit = () => { if (lead) clearInterval(lead); lead = null; paused = false; overlay.hidden = true; controller.abort(); };
  const onVisibility = () => { if (document.visibilityState === 'hidden') pause('hidden'); };
  const onHide = () => pause('hidden');
  // Phones only: a blur with the page still showing is system UI over the app (Control Center, a call screen).
  const touch = matchMedia('(pointer: coarse)').matches;
  let blurTimer = null;
  const onBlur = () => {
    if (!touch) return;
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => { if (!document.hasFocus()) pause('covered'); }, 250);
  };
  const stopInterrupt = onInterrupt(() => pause('sound'));

  // Touch lock (MOVE): taps do nothing; a 1 s hold anywhere pauses.
  let holdTimer = null;
  const ring = $('hold-ring');
  const endHold = () => { clearTimeout(holdTimer); holdTimer = null; ring.hidden = true; };
  const onHoldStart = (e) => {
    if (paused || !e.isPrimary || e.target.closest('.tune')) return;
    endHold();
    ring.style.left = `${e.clientX}px`;
    ring.style.top = `${e.clientY}px`;
    ring.hidden = false;
    holdTimer = setTimeout(() => { endHold(); pause('hold'); }, HOLD_TO_PAUSE_MS / speed);
  };
  const noMenu = (e) => e.preventDefault();
  if (lock) {
    screen.classList.add('is-locked');
    $('stage').addEventListener('pointerdown', onHoldStart);
    screen.querySelector('.hud').addEventListener('pointerdown', onHoldStart);
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) screen.addEventListener(t, endHold);
    screen.addEventListener('contextmenu', noMenu);
  }

  // Screen awake: if the phone won't keep it on, say so once (it doesn't stop the session).
  const tip = $('awake-tip');
  let tipTimer = null;
  const awakeProblem = () => {
    if (tipTimer) return;
    tip.textContent = AWAKE_TIP;
    tip.hidden = false;
    tipTimer = setTimeout(() => { tip.hidden = true; }, 12000);
  };

  $('btn-pause').onclick = () => pause('tap');
  $('btn-resume').onclick = resume;
  $('btn-quit').onclick = quit;
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onHide);
  document.addEventListener('freeze', onHide);
  window.addEventListener('blur', onBlur);

  keepAwake({ onProblem: awakeProblem });
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
      activeMs = 0;
      workMs = 0;
      stepCap = step.durationMs;
      const result = await step.module.run({
        el: stageEl, settings, session, step, durationMs: step.durationMs, signal,
        sleep, now, remaining, hold, ready, isPaused,
      });
      doneMs += step.durationMs;
      activeMs = 0;
      workMs = 0;
      results.push({ id: step.id, blockId: step.blockId, name: step.title, ...result });
    }
    return { completed: true, results };
  } catch (err) {
    if (err instanceof AbortedError) return { completed: false, results };
    throw err;
  } finally {
    clearInterval(hudTimer);
    clearTimeout(blurTimer);
    clearTimeout(tipTimer);
    if (lead) clearInterval(lead);
    endHold();
    tip.hidden = true;
    stopInterrupt();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onHide);
    document.removeEventListener('freeze', onHide);
    window.removeEventListener('blur', onBlur);
    if (lock) {
      screen.classList.remove('is-locked');
      $('stage').removeEventListener('pointerdown', onHoldStart);
      screen.querySelector('.hud').removeEventListener('pointerdown', onHoldStart);
      for (const t of ['pointerup', 'pointercancel', 'pointerleave']) screen.removeEventListener(t, endHold);
      screen.removeEventListener('contextmenu', noMenu);
    }
    $('btn-pause').onclick = $('btn-resume').onclick = $('btn-quit').onclick = null;
    stageEl.innerHTML = '';
    allowSleep();
  }
}
