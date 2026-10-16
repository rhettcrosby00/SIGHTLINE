// FOCUS: eyes, mind and breathing with the phone in hand. Every answer is a
// tap. The FOCUS screen opens with the Game Day / Training switch, one
// readiness tap (Flat · Ready · Wired, Ready unless changed) and three
// presets (js/presets.js): tap one and it starts. Game Ready never runs past
// 10 minutes; Training (non-game days) runs every pillar plus the visual
// skills, harder. Everything else sits under Advanced: My Routine, one part
// on its own, the optional Extras, the Focus Check (Training mode only) and
// the options.

import { buildRoutine } from './routine.js';
import { runSession } from './engine.js';
import { createSession } from './session.js';
import { FOCUS_SESSIONS, sessionById, totalMinutes } from './plan.js';
import { PRESETS, focusPreset, runKey, parseRunKey, runTitle, dayToggle, dayNote } from './presets.js';
import { renderSummary } from './stages/summary.js';
import { STATE_LABELS, feelSeg } from './stages/readiness.js';
import { describe } from './settings.js';
import { createFocusScorer, focusScore } from './score/scoring.js';
import { unlock as unlockAudio, buzz } from './lib/audio.js';
import { icon } from './lib/icons.js';
import { createSeen } from './lib/seen.js';
import { createLevelStore } from './lib/adapt.js';
import { createRoutineStore, routineSeconds } from './myroutine.js';
import { createRng } from './lib/rng.js';
import { checkPlan, createCheckLog } from './lib/check.js';
import { runFocusCheck, showCheckResult } from './stages/focuscheck.js';

const $ = (id) => document.getElementById(id);
// Whole minutes, or halves under 2 minutes ("1.5 min").
const roundMin = (m) => (m < 2 ? Math.round(m * 2) / 2 : Math.round(m));

// show(name, {back}) switches screens; dev = { speed, autoReady, seed, only, state }
// from the URL; onRun(key) fires when a session starts (for "Run last");
// leaderboard (optional) gets the score after each finished session.
// onTrained() fires when a Training session finishes (the weekly streak);
// week() gives that streak; onDay() fires when the Game Day / Training switch changes.
// afterSession(done) runs on the summary (install tip, "Next: Move").
export function initFocus({
  show, dev = {}, variety, getSettings, updateSetting, onRun = () => {}, onOptions = () => {}, onRoutine = () => {},
  onTrained = () => {}, leaderboard = null, week = () => ({}), onDay = () => {}, afterSession = () => {},
}) {
  const hubEl = $('focus-hub');
  const seen = createSeen();   // drills this phone has run, for Auto instructions
  const levels = createLevelStore();   // adaptive difficulty: each drill's level, on this phone
  const routines = createRoutineStore();   // My Routine, saved on this phone
  const checks = createCheckLog();   // the last 10 Focus Checks, on this phone
  let from = 'start';   // where Done (or quitting) goes back to
  let feel = 'ready';   // this visit's readiness tap
  let advanced = false;   // the Advanced section is open

  const routineS = () => routineSeconds(routines.get());
  const minutes = (id, length = getSettings().length) => roundMin(totalMinutes(id, length, routineS()));
  const routineLabel = () => `${Math.round(routineS())} s`;

  // A run key ("game:speed", or a part id) → what it runs.
  function runOf(key) {
    const p = parseRunKey(key);
    if (p) return { key, ...focusPreset(p.id, p.day) };
    return sessionById[key] ? { key, sessionId: key } : null;
  }
  // "Standard · 8 min" (or "Eyes only · 4 min") for home's Run last.
  function describeRun(key) {
    const r = runOf(key);
    if (!r) return '';
    return `${runTitle(key) ?? sessionById[r.sessionId].title} · ${minutes(r.sessionId, r.length)} min`;
  }

  function renderHub() {
    const day = getSettings().day;
    const parts = FOCUS_SESSIONS.filter((s) => s.id !== 'game' && s.id !== 'training' && !s.extra && !s.timedByRoutine);
    const row = (s) => `
          <button type="button" class="hub-row" data-run="${s.id}">
            <span class="hub-row__text"><strong>${s.title}</strong><small>${s.short}</small></span>
            <span class="hub-row__meta">${minutes(s.id)} min</span>${icon('play')}
          </button>`;
    const preset = (p) => {
      const f = focusPreset(p.id, day);
      return `
        <button type="button" class="preset" data-preset="${p.id}">
          <span class="preset__text"><strong>${p.title}</strong><small>${sessionById[f.sessionId].title}${f.difficulty === 'hard' ? ' · Hard' : ''}</small></span>
          <span class="preset__min">${minutes(f.sessionId, f.length)} min</span>${icon('play')}
        </button>`;
    };
    hubEl.innerHTML = `
      <header class="nav">
        <button type="button" class="nav__back" data-nav="home">${icon('chevron-left', { size: 22 })}Home</button>
        <p class="side-tag">${icon('eye', { size: 18 })}Focus</p>
        <h2 class="nav__title">Eyes · Mind · Breath</h2>
      </header>
      ${dayToggle(day)}
      <p class="side-note">${dayNote(day, week())}</p>
      <section class="group" aria-labelledby="feel-title">
        <h3 id="feel-title" class="group__title">How do you feel?</h3>
        ${feelSeg(feel)}
        <p class="setting__hint feel-hint">${STATE_LABELS[feel].does}</p>
      </section>
      <section class="presets" aria-label="Start">
        ${PRESETS.map(preset).join('')}
        <p class="setting__hint">${sessionById[focusPreset('standard', day).sessionId].short}. Hold your phone; every answer is a tap.</p>
      </section>
      <details class="adv"${advanced ? ' open' : ''}>
        <summary class="adv__head">Advanced${icon('chevron-down')}</summary>
        <section class="group"><h3 class="group__title">My Routine</h3><div class="group__rows">
          <button type="button" class="hub-row" data-run="myroutine">
            <span class="hub-row__text"><strong>Run My Routine</strong><small>Breath, cue word, quiet eye, go. Before you compete.</small></span>
            <span class="hub-row__meta">${routineLabel()}</span>${icon('play')}
          </button>
          <button type="button" class="hub-row" data-nav="routine">
            <span class="hub-row__text"><strong>Build My Routine</strong><small>Pick your breath, imagery line and quiet-eye hold</small></span>${icon('chevron-right')}
          </button>
        </div></section>
        <section class="group"><h3 class="group__title">One part${day === 'training' ? ' · Training mode' : ''}</h3><div class="group__rows">
          ${parts.map(row).join('')}
        </div></section>
        <section class="group"><h3 class="group__title">Extras · optional</h3><div class="group__rows">
          ${FOCUS_SESSIONS.filter((s) => s.extra).map(row).join('')}
        </div><p class="setting__hint">Lab-style brain games. Fine for fun, but the research behind them is thin, so they’re not part of Game Ready.</p></section>
        ${day === 'training' ? `
        <section class="group"><h3 class="group__title">Focus Check</h3><div class="group__rows">
          <button type="button" class="hub-row" data-nav="check">
            <span class="hub-row__text"><strong>Focus Check</strong><small>About 30 s of taps: today against your usual on this phone</small></span>
            <span class="hub-row__meta">30 s</span>${icon('play')}
          </button>
        </div></section>` : ''}
        <section class="group"><div class="group__rows">
          <button type="button" class="hub-row" data-nav="options">
            <span class="hub-row__text"><strong>Options</strong><small>${describe(getSettings())}</small></span>${icon('chevron-right')}
          </button>
        </div></section>
      </details>`;
    hubEl.querySelector('.adv').addEventListener('toggle', (e) => { advanced = e.target.open; });
  }

  hubEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.preset) {
      const day = getSettings().day;
      const p = focusPreset(b.dataset.preset, day);
      start(p.sessionId, { from: 'focus', state: feel, length: p.length, difficulty: p.difficulty, key: runKey(day, b.dataset.preset) });
    } else if (b.dataset.run) start(b.dataset.run, { from: 'focus', state: feel });
    else if (b.dataset.feel) {
      feel = b.dataset.feel;
      hubEl.querySelectorAll('[data-feel]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      hubEl.querySelector('.feel-hint').textContent = STATE_LABELS[feel].does;
    } else if (b.dataset.day) {
      updateSetting('day', b.dataset.day);
      onDay();
      renderHub();
    } else if (b.dataset.nav === 'home') show('start', { back: true });
    else if (b.dataset.nav === 'options') onOptions();
    else if (b.dataset.nav === 'routine') onRoutine();
    else if (b.dataset.nav === 'check') checkOnly();
  });

  // One Focus Check: intro, taps, then the result against this phone's usual.
  // Resolves { result, choice } (result null if skipped).
  async function focusCheck({ phase, before = null, lighter = false }) {
    show('check');
    const result = await runFocusCheck($('check'), { plan: checkPlan(createRng(dev.seed).fork(`check:${phase}`)), phase });
    if (!result) return { result: null, choice: 'go' };
    const history = checks.get();
    if (result.rtMs != null) checks.add(result);
    const choice = await showCheckResult($('check'), { result, history, before, lighter });
    return { result, choice };
  }
  // From the FOCUS screen (Training mode): a check on its own.
  async function checkOnly() {
    unlockAudio(getSettings().sound === 'on');   // inside the tap
    await focusCheck({ phase: 'check' });
    $('check').innerHTML = '';
    renderHub();
    show('focus', { back: true });
  }

  // Runs one FOCUS session. Call from a tap (sound unlock happens first, inside it).
  // opts: from (where Done goes), state (readiness), length / difficulty
  // (a preset; remembered for the single parts too), key (for Run last).
  async function start(sessionId, opts = {}) {
    const meta = sessionById[sessionId] ?? sessionById.game;
    unlockAudio(getSettings().sound === 'on');   // must happen inside the tap
    from = opts.from ?? 'start';
    if (opts.length) updateSetting('length', opts.length);
    if (opts.difficulty) updateSetting('difficulty', opts.difficulty);
    const settings = getSettings();
    onRun(opts.key ?? meta.id);
    // Focus Check (Training only, if on): noticeably slower than usual offers the lighter (Quick) version.
    const bookend = meta.training && settings.focusCheck === 'on' && !dev.autoReady;
    const checked = { before: null, after: null };
    if (bookend) {
      const r = await focusCheck({ phase: 'start', lighter: settings.length !== 'quick' });
      checked.before = r.result;
      if (r.choice === 'lighter') settings.length = 'quick';   // this session only
    }
    // Every session is freshly shuffled; content from the last few sessions rests.
    // The readiness tap shapes the breathing and pacing.
    const state = dev.state ?? opts.state ?? 'ready';
    const session = createSession({
      sessionId: meta.id, settings, seed: dev.seed, recent: dev.seed ? [] : variety.recent(), seen: seen.get(),
      state, routine: routines.get(), levels: levels.get(),
    });
    const steps = buildRoutine(session).filter((s) => !dev.only || dev.only.includes(s.id));
    session.scorer = createFocusScorer();   // leaderboard points, cue by cue

    $('screen-session').dataset.side = 'focus';
    show('session');
    const { completed, results } = await runSession(steps, settings, { session, speed: dev.speed, autoReady: dev.autoReady });
    if (!dev.seed) variety.add(session.record());   // also after a quit: they saw it
    seen.add(results.map((r) => r.id));             // Auto instructions get shorter as drills get familiar
    levels.save(session.levels());                  // next time, each drill starts where it ended
    if (!completed) { back(); return; }
    buzz([60, 80, 120]);   // session complete (the summary appears too)
    if (meta.timedByRoutine) { back(); return; }   // My Routine on its own: straight back, nothing to sum up

    if (meta.training) onTrained();   // a training day, for the weekly streak
    if (bookend) checked.after = (await focusCheck({ phase: 'end', before: checked.before })).result;
    $('check').innerHTML = '';

    const totalMs = steps.reduce((a, s) => a + s.durationMs + (s.introMs ?? 0), 0);   // instructions included
    renderSummary($('summary'), { title: meta.title, results, settings, totalMs, readiness: { before: state }, checked, seed: session.seed });
    afterSession({ key: opts.key ?? meta.id });
    if (leaderboard && !meta.unscored) await leaderboard.afterSession(focusEntry(meta, session, settings), { slot: $('summary-board') });
    show('done');
  }

  // This session's leaderboard entry.
  function focusEntry(meta, session, settings) {
    const streak = session.scorer.bestStreak;
    return {
      side: 'focus',
      score: focusScore({ points: session.scorer.points, sessionId: meta.id, difficulty: settings.difficulty }),
      detail: [meta.title, settings.difficulty === 'hard' ? 'Hard ×1.5' : '', streak >= 5 ? `best streak ${streak}` : '', 'finish bonus included']
        .filter(Boolean).join(' · '),
      settings: { sessionId: meta.id, length: settings.length, difficulty: settings.difficulty },
    };
  }

  const back = () => {
    if (from === 'focus') renderHub();
    show(from, { back: true });
  };

  // Nothing is kept: clear the summary and go back.
  $('btn-done').addEventListener('click', () => { $('summary').innerHTML = ''; back(); });

  return {
    openHub: () => { feel = 'ready'; renderHub(); show('focus'); },
    renderHub,
    // Run last (home): call from a tap.
    runLast: (key) => {
      const r = runOf(key);
      if (r) start(r.sessionId, { state: 'ready', length: r.length, difficulty: r.difficulty, key });
    },
    start,
    describeRun,
    routineLabel,
  };
}
