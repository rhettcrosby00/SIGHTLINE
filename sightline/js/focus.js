// FOCUS: eyes, mind and breathing with the phone in hand. Every answer is a
// tap. Game Ready runs all four pillars (never more than 10 minutes);
// Training (non-game days) runs every pillar plus the visual skills, harder;
// the other sessions run one pillar, or the optional Extras. The optional
// Focus Check (about 30 s) can bookend Game Ready and Training, or run alone.

import { buildRoutine } from './routine.js';
import { runSession } from './engine.js';
import { createSession } from './session.js';
import { FOCUS_SESSIONS, sessionById, totalMinutes } from './plan.js';
import { renderSummary } from './stages/summary.js';
import { askBefore, askAfter } from './stages/readiness.js';
import { describe } from './settings.js';
import { createFocusScorer, focusScore } from './score/scoring.js';
import { unlock as unlockAudio, buzz } from './lib/audio.js';
import { icon } from './lib/icons.js';
import { isOn } from './features.js';
import { createSeen } from './lib/seen.js';
import { createLevelStore } from './lib/adapt.js';
import { createRoutineStore, routineSeconds } from './myroutine.js';
import { createRng } from './lib/rng.js';
import { checkPlan, createCheckLog } from './lib/check.js';
import { runFocusCheck, showCheckResult } from './stages/focuscheck.js';

const $ = (id) => document.getElementById(id);

// show(name, {back}) switches screens; dev = { speed, autoReady, seed, only }
// from the URL; onRun(sessionId) fires when a session starts (for "Run last");
// leaderboard (optional) gets the score after each finished session.
// onTrained() fires when a Training session finishes (the weekly streak).
export function initFocus({ show, dev = {}, variety, getSettings, updateSetting, onRun = () => {}, onOptions = () => {}, onRoutine = () => {}, onTrained = () => {}, leaderboard = null }) {
  const hubEl = $('focus-hub');
  const flags = { newDrills: isOn('newDrills'), occlusion: isOn('occlusion') };
  const seen = createSeen();   // drills this phone has run, for Auto instructions
  const levels = createLevelStore();   // adaptive difficulty: each drill's level, on this phone
  const routines = createRoutineStore();   // My Routine, saved on this phone
  const checks = createCheckLog();   // the last 10 Focus Checks, on this phone
  let from = 'start';   // where Done (or quitting) goes back to

  // Whole minutes, or halves under 2 minutes ("1.5 min"). My Routine shows seconds.
  const minutes = (id) => {
    const m = totalMinutes(id, getSettings().length, routineSeconds(routines.get()));
    return m < 2 ? Math.round(m * 2) / 2 : Math.round(m);
  };
  const routineLabel = () => `${Math.round(routineSeconds(routines.get()))} s`;

  // The main session follows the home screen's mode: Game Ready or Training.
  const mainId = () => (getSettings().day === 'training' ? 'training' : 'game');

  function renderHub() {
    const main = sessionById[mainId()];
    const parts = FOCUS_SESSIONS.filter((s) => s.id !== 'game' && s.id !== 'training' && !s.extra && !s.timedByRoutine);
    const row = (s) => `
          <button type="button" class="hub-row" data-run="${s.id}">
            <span class="hub-row__text"><strong>${s.title}</strong><small>${s.short}</small></span>
            <span class="hub-row__meta">${minutes(s.id)} min</span>${icon('play')}
          </button>`;
    hubEl.innerHTML = `
      <header class="nav">
        <button type="button" class="nav__back" data-nav="home">${icon('chevron-left', { size: 22 })}Home</button>
        <p class="side-tag">${icon('eye', { size: 18 })}Focus</p>
        <h2 class="nav__title">Eyes · Mind · Breath</h2>
        <p class="cset__sub">Hold your phone. Every answer is a tap.</p>
      </header>
      <section class="group"><h3 class="group__title">My Routine</h3><div class="group__rows">
        <button type="button" class="hub-row" data-run="myroutine">
          <span class="hub-row__text"><strong>Run My Routine</strong><small>Breath, cue word, quiet eye, go. Before you compete.</small></span>
          <span class="hub-row__meta">${routineLabel()}</span>${icon('play')}
        </button>
        <button type="button" class="hub-row" data-nav="routine">
          <span class="hub-row__text"><strong>Build My Routine</strong><small>Pick your breath, imagery line and quiet-eye hold</small></span>${icon('chevron-right')}
        </button>
      </div></section>
      <section class="group"><h3 class="group__title">Focus Check</h3><div class="group__rows">
        <button type="button" class="hub-row" data-nav="check">
          <span class="hub-row__text"><strong>Focus Check</strong><small>About 30 s of taps: today against your usual on this phone</small></span>
          <span class="hub-row__meta">30 s</span>${icon('play')}
        </button>
      </div></section>
      <section class="group"><h3 class="group__title">One part${getSettings().day === 'training' ? ' · Training mode' : ''}</h3><div class="group__rows">
        ${parts.map(row).join('')}
      </div></section>
      <section class="group"><h3 class="group__title">Extras · optional</h3><div class="group__rows">
        ${FOCUS_SESSIONS.filter((s) => s.extra).map(row).join('')}
      </div><p class="setting__hint">Lab-style brain games. Fine for fun, but the research behind them is thin, so they’re not part of Game Ready.</p></section>
      <section class="group"><div class="group__rows">
        <button type="button" class="hub-row" data-nav="options">
          <span class="hub-row__text"><strong>Options</strong><small>${describe(getSettings())}</small></span>${icon('chevron-right')}
        </button>
      </div></section>
      <div class="screen__foot">
        <p class="cset__est">${main.short} · ${minutes(main.id)} min</p>
        <button type="button" class="btn btn--primary btn--block" data-run="${main.id}">${icon('play')}${main.title}</button>
      </div>`;
  }

  hubEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.run) start(b.dataset.run, { from: 'focus' });
    else if (b.dataset.nav === 'home') show('start', { back: true });
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
  // From the FOCUS screen: a check on its own.
  async function checkOnly() {
    unlockAudio(getSettings().sound === 'on');   // inside the tap
    await focusCheck({ phase: 'check' });
    $('check').innerHTML = '';
    renderHub();
    show('focus', { back: true });
  }

  // Runs one FOCUS session. Call from a tap (sound unlock).
  async function start(sessionId, opts = {}) {
    const meta = sessionById[sessionId] ?? sessionById.game;
    from = opts.from ?? 'start';
    const settings = getSettings();
    if (opts.length) settings.length = opts.length;   // Full Pre-Game runs the Quick version
    unlockAudio(settings.sound === 'on');   // must happen inside the tap
    onRun(meta.id);
    // Focus Check at the start (if on): noticeably slower than usual offers the lighter (Quick) version.
    const bookend = meta.check === 'both' && settings.focusCheck === 'on' && !dev.autoReady;
    const checked = { before: null, after: null };
    if (bookend) {
      const r = await focusCheck({ phase: 'start', lighter: settings.length !== 'quick' });
      checked.before = r.result;
      if (r.choice === 'lighter') settings.length = 'quick';   // this session only
    }
    // Every session is freshly shuffled; content from the last few sessions rests.
    const build = (state, seed) => createSession({
      sessionId: meta.id, settings, seed, recent: dev.seed ? [] : variety.recent(), flags, seen: seen.get(),
      state, routine: routines.get(), levels: levels.get(),
    });
    let session = build('ready', dev.seed);

    // Check-in before (how you feel + cue word): it shapes the session, so the
    // session is rebuilt from the same seed with that state. Asked again after
    // Game Ready. Shown on the summary only; not saved.
    const readiness = { before: null, after: null };
    if (meta.check && !dev.autoReady) {
      show('check');
      const pick = await askBefore($('check'), {
        cue: settings.cue, skill: session.content.cueSkill, energy: session.content.cueSuggestions,
        askSport: !settings.sportAsked, sport: settings.sport, position: settings.position,
      });
      readiness.before = pick.skipped ? null : pick.state;
      settings.cue = pick.cue;
      updateSetting('cue', pick.cue);
      if (!settings.sportAsked) {
        Object.assign(settings, { sport: pick.sport, position: pick.position, sportAsked: true });
        updateSetting('sport', pick.sport);
        updateSetting('position', pick.position);
        updateSetting('sportAsked', true);
      }
      session = build(pick.state, session.seed);
    } else if (dev.state) {
      session = build(dev.state, session.seed);
    }
    const steps = buildRoutine(session).filter((s) => !dev.only || dev.only.includes(s.id));
    session.scorer = createFocusScorer();   // leaderboard points, cue by cue

    $('screen-session').dataset.side = 'focus';
    show('session');
    const { completed, results } = await runSession(steps, settings, { session, speed: dev.speed, autoReady: dev.autoReady });
    if (!dev.seed) variety.add(session.record());   // also after a quit: they saw it
    seen.add(results.map((r) => r.id));             // Auto instructions get shorter as drills get familiar
    levels.save(session.levels());                  // next time, each drill starts where it ended
    if (!completed) { back(); return; }
    buzz([60, 80, 120]);   // session complete
    if (meta.timedByRoutine) { back(); return; }   // My Routine on its own: straight back, nothing to sum up
    // Full Pre-Game: Move comes next; the check-out, summary and scores wait until the end.
    if (opts.pregame) return { meta, session, results, steps, settings, readiness, checked };

    if (meta.training) onTrained();   // a training day, for the weekly streak
    if (bookend) checked.after = (await focusCheck({ phase: 'end', before: checked.before })).result;
    if (meta.check === 'both' && !dev.autoReady) {
      show('check');
      readiness.after = await askAfter($('check'), { cue: settings.cue });
    }
    $('check').innerHTML = '';

    const totalMs = steps.reduce((a, s) => a + s.durationMs + (s.introMs ?? 0), 0);   // instructions included
    renderSummary($('summary'), { title: meta.title, results, settings, totalMs, readiness, checked, seed: session.seed });
    if (leaderboard && !meta.unscored) await leaderboard.afterSession(focusEntry(meta, session, settings));
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

  // Full Pre-Game, after Move: how they feel now, one summary (Focus, plus a
  // Move section), and one name entry that saves both scores.
  async function finishPreGame({ meta, session, results, steps, settings, readiness, checked }, moved) {
    if (!dev.autoReady) {
      show('check');
      readiness.after = await askAfter($('check'), { cue: settings.cue });
    }
    $('check').innerHTML = '';
    const totalMs = steps.reduce((a, s) => a + s.durationMs + (s.introMs ?? 0), 0);
    renderSummary($('summary'), { title: 'Full Pre-Game', results, settings, totalMs, readiness, checked, seed: session.seed });
    const ran = moved && !moved.skipped && moved.sets > 0;
    if (ran) {
      const block = document.createElement('section');
      block.className = 'sum__move';
      block.dataset.side = 'move';
      block.innerHTML = `
        <p class="side-tag">${icon('move', { size: 18 })}Move · ${moved.label}</p>
        <div class="tiles">
          <div class="tile"><p class="tile__value">${moved.reps}</p><p class="tile__label">reps</p></div>
          <div class="tile"><p class="tile__value">${moved.completed ? moved.sets : `${moved.sets}/${moved.setsPlanned}`}</p><p class="tile__label">sets</p></div>
        </div>`;
      const sum = $('summary').querySelector('.sum');
      sum.insertBefore(block, sum.querySelector('.sum__foot'));
    }
    if (leaderboard) {
      await leaderboard.afterSession({
        entries: [focusEntry(meta, session, settings), ...(ran ? [{ side: 'move', score: moved.score, detail: moved.detail, settings: moved.settings }] : [])],
      });
    }
    show('done');
  }

  const back = () => {
    if (from === 'focus') renderHub();
    show(from, { back: true });
  };

  // Nothing is kept: clear the summary and go back.
  $('btn-done').addEventListener('click', () => { $('summary').innerHTML = ''; back(); });

  return {
    openHub: () => { renderHub(); show('focus'); },
    renderHub,
    start,
    finishPreGame,
    routineLabel,
    minutes,
    title: (id) => sessionById[id]?.title ?? '',
  };
}
