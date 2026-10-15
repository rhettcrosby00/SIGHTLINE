// MOVE: cognitive change of direction with the phone on a stand. Four ways in:
//   Quick Start   fixed preset → cone layout → drill
//   Game Day      your custom cones, 3 short sets at Game Speed, full rest → layout → drill
//   Training      your custom cones with decisions, 5 × 30 s (non-game days) → layout → drill
//   Custom setup  every Cone Drill option → cone layout → drill
//   Signals Only  arrows, no cones → drill
// The drill runs in the shared session engine (pause, wake lock). No taps
// during a set. Only the setups are saved.

import { initSetup } from './setup.js';
import { renderLayout, layoutSvg } from './layout.js';
import { planDrill } from './plan.js';
import { coneSession, tuneButtons, wireTune } from './run.js';
import { validate, quickStart, gameDay, training, normalizeSignals, GAME_DAY, TRAINING } from './config.js';
import { PATTERNS } from './patterns.js';
import { PACE_LABEL, STYLE_LABEL, TIMING, coneSlots, drillMs, applyTune, createTuneStore } from './timing.js';
import { runSession } from '../engine.js';
import { unlock as unlockAudio, buzz } from '../lib/audio.js';
import { icon } from '../lib/icons.js';
import { SUM_LOGO } from '../stages/summary.js';
import { initPartner } from './partner.js';
import { isOn } from '../features.js';
import { moveScore, moveMultiplier, SCORING } from '../score/scoring.js';

const $ = (id) => document.getElementById(id);
const mmss = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const CUE_NAME = { colors: 'Colors', arrows: 'Arrows', numbers: 'Numbers', mixed: 'Mixed', sport: 'Sport calls' };

export const MOVE_RUNS = { quick: 'Quick Start', gameday: 'Game Day', training: 'Training', custom: 'Custom setup', signals: 'Signals Only' };
const PRESETS = new Set(['quick', 'gameday', 'training']);   // fixed recipes: straight to the cone layout

// "5 yd", or "3–10 yd" when each cone has its own distance.
function yardsText(s) {
  const yards = coneSlots(s).map((sl) => sl.yards);
  const lo = Math.min(...yards);
  const hi = Math.max(...yards);
  return `${lo === hi ? lo : `${lo}–${hi}`} yd`;
}

// One line per way in, e.g. "4 cones · Colors · 5 yd · Training · 3 sets".
function describeSetup(s, run = 'custom') {
  const pace = s.manual ? `${s.manualS.toFixed(1)} s per rep` : PACE_LABEL[s.pace];
  const sets = `${s.sets} set${s.sets > 1 ? 's' : ''}${s.setMode === 'timed' ? ` × ${s.timedSec} s` : ''}`;
  if (s.mode === 'planned') return `${PATTERNS[s.pattern].label} · Planned · ${pace} · ${sets}`;
  const dist = s.style === 'firststep' ? STYLE_LABEL.firststep
    : `${yardsText(s)}${s.style === 'conetocone' ? ' cone to cone' : ''}`;
  if (run === 'signals') return `${s.directions.length} directions · ${dist} · ${pace} · ${sets}`;
  const what = s.cueType === 'arrows' || s.cueType === 'mixed' ? `${s.directions.length} directions` : `${s.cones} cones`;
  return `${what} · ${CUE_NAME[s.cueType]}${s.decision ? ' + decisions' : ''} · ${dist} · ${pace} · ${sets}`;
}
const minutesOf = (s) => Math.max(1, Math.round(drillMs(s) / 60000));

// show(name, {back}) switches screens; dev = { speed, autoReady, seed } from
// the URL; onRun(run) fires when a drill starts (for "Run last"); leaderboard
// (optional) gets the score once a drill ends with at least one full set;
// sport = { get, set }: the sport picked on this phone (shared with Focus);
// onTrained() fires when a Training drill finishes (the weekly streak).
export function initMove({ show, dev = {}, onRun = () => {}, onTrained = () => {}, leaderboard = null, sport }) {
  const hubEl = $('move-hub');
  const layoutEl = $('cd-layout');
  const doneEl = $('cd-done');
  const tunes = createTuneStore();
  let run = 'custom';
  let setup = null;

  const nav = (where, { back = false } = {}) => {
    if (where === 'home') return show('start', { back: true });
    if (where === 'board') return leaderboard?.openBoard('cone-done', { side: 'move' });
    if (where === 'menu') { renderHub(); return show('move', { back: true }); }
    if (where === 'custom') return open('custom');
    if (where === 'partner' && partner) { partner.open(); return show('partner'); }
    if (where === 'setup') {
      const ctl = run === 'signals' ? signals : custom;
      ctl.render();
      return show(run === 'signals' ? 'signals' : 'cone-setup', { back });
    }
    if (where === 'layout') { renderLayout(layoutEl, setup, { preset: PRESETS.has(run), tune: tunes.get(setup) }); return show('cone-layout'); }
    if (where === 'start') return go();
  };

  // The two editable setups; Quick Start is built fresh each time.
  const fromSetup = (variant) => (where, s) => { run = variant; setup = s; nav(where); };
  const custom = initSetup($('cd-setup'), { onNav: fromSetup('custom'), variant: 'custom', sport });
  // Partner mode: the stand phone uses the Custom setup's cones (reactive).
  const partner = isOn('partner') ? initPartner($('cd-partner'), {
    getSetup: () => ({ ...custom.get(), mode: 'reactive' }),
    onBack: () => nav('menu'),
  }) : null;
  const signals = initSetup($('cd-signals'), { onNav: fromSetup('signals'), variant: 'signals', sport });
  const setupFor = (r) => (r === 'quick' ? quickStart(custom.get()) : r === 'gameday' ? gameDay(custom.get())
    : r === 'training' ? training(custom.get()) : r === 'signals' ? signals.get() : custom.get());

  function renderHub() {
    const rowFor = (r, sub, trail) => `
      <button type="button" class="hub-row" data-run="${r}">
        <span class="hub-row__text"><strong>${MOVE_RUNS[r]}</strong><small>${sub}</small></span>
        <span class="hub-row__meta">${minutesOf(setupFor(r))} min</span>${icon(trail)}
      </button>`;
    hubEl.innerHTML = `
      <header class="nav">
        <button type="button" class="nav__back" data-nav="home">${icon('chevron-left', { size: 22 })}Home</button>
        <p class="side-tag">${icon('move', { size: 18 })}Move</p>
        <h2 class="nav__title">React · Cut · Compete</h2>
        <p class="cset__sub">Set your phone down facing you. No taps during a set.</p>
      </header>
      <section class="group"><h3 class="group__title">Game day or training</h3><div class="group__rows">
        ${rowFor('gameday', `${GAME_DAY.sets} × ${GAME_DAY.timedSec} s at Game Speed, full rest · ${describeSetup(setupFor('gameday'), 'gameday').split(' · ').slice(0, 2).join(' · ')}`, 'play')}
        ${rowFor('training', `${TRAINING.sets} × ${TRAINING.timedSec} s with decisions, on days without a game`, 'play')}
      </div><p class="setting__hint">Both use your custom cones.</p></section>
      <section class="group"><h3 class="group__title">Your setups</h3><div class="group__rows">
        ${rowFor('custom', describeSetup(custom.get(), 'custom'), 'chevron-right')}
        ${rowFor('signals', `No cones · ${describeSetup(signals.get(), 'signals')}`, 'chevron-right')}
      </div></section>
      ${partner ? `<section class="group"><h3 class="group__title">With a coach</h3><div class="group__rows">
        <button type="button" class="hub-row" data-nav="partner">
          <span class="hub-row__text"><strong>Partner mode</strong><small>A coach’s phone sends the cues</small></span>${icon('chevron-right')}
        </button></div></section>` : ''}
      <div class="screen__foot">
        <p class="cset__est">${describeSetup(setupFor('quick'), 'quick')} · ${minutesOf(setupFor('quick'))} min</p>
        <button type="button" class="btn btn--primary btn--block" data-run="quick">${icon('play')}Quick Start</button>
      </div>`;
  }

  // From the hub or home: Quick Start and Game Day show the cone layout; the others open their setup.
  function open(r) {
    run = r;
    setup = setupFor(r);
    if (PRESETS.has(r) && r !== 'quick' && !validate(setup).ok) { run = 'custom'; return nav('setup'); }
    nav(PRESETS.has(r) ? 'layout' : 'setup');
  }

  hubEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.run) open(b.dataset.run);
    else if (b?.dataset.nav) nav(b.dataset.nav);
  });

  layoutEl.addEventListener('click', (e) => {
    const where = e.target.closest('[data-nav]')?.dataset.nav;
    if (where) nav(where, { back: where !== 'start' });
  });

  // Runs the drill (pause, wake lock, Too fast / Too slow between sets).
  // Call from a tap (sound unlock). Resolves { completed, r, plan, totalMs }.
  async function play() {
    unlockAudio(setup.sound === 'on', { voice: setup.callouts });   // inside the tap
    onRun(run);
    // "Too fast / Too slow": start from this setup's saved answer; each answer
    // applies from the next set and is saved for this distance and rep style.
    const tuning = {
      factor: tunes.get(setup),
      choice: 'same',
      pick(choice) { this.choice = choice; },
      commit() {
        if (this.choice === 'same') return;
        this.factor = applyTune(this.factor, this.choice);
        this.choice = 'same';
        tunes.set(setup, this.factor);
      },
    };
    const plan = planDrill(setup, dev.seed, { tune: tuning.factor });
    const r = { reps: 0, holds: 0, sets: 0 };   // fills in as sets finish
    const { steps, session, totalMs } = coneSession(plan, setup, tuning, r);
    $('screen-session').dataset.side = 'move';
    show('session');
    const { completed } = await runSession(steps, setup, { session, speed: dev.speed, autoReady: dev.autoReady });
    if (completed) buzz([60, 80, 120]);   // drill complete
    if (completed && run === 'training') onTrained();   // a training day, for the weekly streak
    return { completed, r, plan, totalMs, tuning };
  }

  async function go() {
    const { completed, r, plan, totalMs, tuning } = await play();
    // Stopped early: with the leaderboard on, completed sets still count.
    if (!completed && !(leaderboard && r.sets > 0)) return nav(run === 'quick' ? 'menu' : 'setup', { back: true });
    doneEl.innerHTML = `
      <div class="sum">
        <div class="sum__top"><p class="sum__kicker">${completed ? `${MOVE_RUNS[run]} complete` : `Stopped after ${r.sets} of ${setup.sets} sets`}</p>${SUM_LOGO}</div>
        <h2 class="sum__title">${completed ? 'Nice work' : 'Good work'}</h2>
        <p class="sum__meta">${describeSetup(setup, run)}</p>
        <div class="tiles">
          <div class="tile"><p class="tile__value">${r.reps}</p><p class="tile__label">reps</p></div>
          <div class="tile"><p class="tile__value">${completed ? r.sets : `${r.sets}/${setup.sets}`}</p><p class="tile__label">sets</p></div>
          ${completed ? `<div class="tile"><p class="tile__value">${mmss(totalMs)}</p><p class="tile__label">total time</p></div>` : ''}
        </div>
        ${r.holds ? `<p class="sum__note">Plus <b>${r.holds}</b> fake-out${r.holds > 1 ? 's' : ''} where you held still.</p>` : ''}
        ${tuneButtons('How was the pace?')}
        <p class="sum__foot">Only your pace answer is saved, for this distance and rep style.</p>
        <p class="sum__seed">Session code ${plan.seed}</p>
      </div>
      <div class="screen__foot">
        <button type="button" class="btn btn--primary btn--block" data-nav="start">${icon('rotate-ccw')}Run it back</button>
        <div class="cdone__row">
          <button type="button" class="btn btn--secondary" data-nav="${run === 'quick' ? 'custom' : 'setup'}">${run === 'quick' ? 'Customize' : 'Change setup'}</button>
          <button type="button" class="btn btn--secondary" data-nav="home">Home</button>
        </div>
        ${leaderboard ? `<button type="button" class="link-btn lb-link" data-nav="board">${icon('trophy')}Leaderboard</button>` : ''}
      </div>`;
    // The answer here sets the pace for next time (an exact manual time stays as set).
    const before = tuning.factor;
    const pct = Math.round(TIMING.tuneStep * 100);
    const saved = setup.manual ? 'Your exact time stays as you set it.'
      : `Saved for ${setup.style === 'firststep' ? 'First step' : `${yardsText(setup)} ${STYLE_LABEL[setup.style].toLowerCase()}`}.`;
    wireTune(doneEl, (choice) => tunes.set(setup, applyTune(before, choice)), {
      slower: `Next time: ${pct}% more time per rep. ${saved}`,
      same: `Next time: same pace. ${saved}`,
      faster: `Next time: ${pct}% less time per rep. ${saved}`,
    });
    if (leaderboard) {
      const per = Math.round(SCORING.move.perRep * moveMultiplier(setup));
      await leaderboard.afterSession({
        side: 'move',
        score: moveScore(setup, { reps: r.reps, setsDone: r.sets }),
        detail: `${r.reps} reps × ${per} pts${completed ? ' + finish bonus' : ' · completed sets only'} · honor system`,
        settings: { setup, setsDone: r.sets },
      });
    }
    show('cone-done');
  }

  // ---- Full Pre-Game, after Focus ---------------------------------------------
  // "Set your phone down", then the Game Day sets: with the athlete's custom
  // cones, or arrows with no cones (remembered on this phone). Resolves the
  // Move result, { skipped: true }, or null if stopped before a full set.
  const PG_KEY = 'sightline.pregame.v1';
  const pgCones = {
    get() { try { return JSON.parse(localStorage.getItem(PG_KEY) || '{}').cones !== false; } catch { return true; } },
    set(cones) { try { localStorage.setItem(PG_KEY, JSON.stringify({ cones })); } catch { /* storage blocked */ } },
  };
  const preGameSetup = (cones) => (cones ? gameDay(custom.get()) : normalizeSignals({
    ...signals.get(), setMode: 'timed', timedSec: GAME_DAY.timedSec, sets: GAME_DAY.sets, pace: GAME_DAY.pace, restMode: 'auto', manual: false,
  }));

  function runPreGame() {
    return new Promise((resolve) => {
      let cones = pgCones.get() && validate(preGameSetup(true)).ok;
      const draw = () => {
        run = cones ? 'gameday' : 'signals';
        setup = preGameSetup(cones);
        layoutEl.innerHTML = `
          <div class="clay">
            <header class="nav">
              <p class="side-tag">${icon('move', { size: 18 })}Move · Full Pre-Game</p>
              <h2 class="nav__title">Set your phone down</h2>
            </header>
            <p class="clay__how">Focus is done. Stand the phone up facing you where you can see it, then step back to your start spot. No taps during a set.</p>
            <div class="seg seg--fill" role="radiogroup" aria-label="Cones">
              <button type="button" role="radio" data-cones="1" aria-checked="${cones}">With cones</button>
              <button type="button" role="radio" data-cones="0" aria-checked="${!cones}">No cones</button>
            </div>
            ${cones ? layoutSvg(setup) : `<p class="clay__how">An arrow shows a direction. Cut or shuffle 2–3 steps that way, then reset.</p>`}
            <p class="timing__sum">${describeSetup(setup, run)} · about ${minutesOf(setup)} min</p>
            <p class="notice">${icon('triangle-alert')}Clear, flat space. Warm up before high-speed cuts.</p>
          </div>
          <div class="screen__foot">
            <button type="button" class="btn btn--primary btn--block" data-pg="start">${icon('play')}Start Move</button>
            <button type="button" class="btn btn--secondary btn--block" data-pg="skip">Skip Move</button>
          </div>`;
      };
      const onClick = async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.cones) {
          cones = b.dataset.cones === '1' && validate(preGameSetup(true)).ok;
          return draw();
        }
        if (!b.dataset.pg) return;
        layoutEl.removeEventListener('click', onClick);
        if (b.dataset.pg === 'skip') return resolve({ skipped: true });
        pgCones.set(cones);
        const { completed, r } = await play();
        if (!completed && r.sets === 0) return resolve(null);
        const per = Math.round(SCORING.move.perRep * moveMultiplier(setup));
        resolve({
          completed, reps: r.reps, sets: r.sets, setsPlanned: setup.sets, label: MOVE_RUNS[run],
          score: moveScore(setup, { reps: r.reps, setsDone: r.sets }),
          detail: `${r.reps} reps × ${per} pts${completed ? ' + finish bonus' : ' · completed sets only'} · honor system`,
          settings: { setup, setsDone: r.sets },
        });
      };
      layoutEl.addEventListener('click', onClick);
      draw();
      show('cone-layout');
    });
  }

  doneEl.addEventListener('click', (e) => {
    const where = e.target.closest('[data-nav]')?.dataset.nav;
    if (where) nav(where, { back: where === 'setup' });
  });

  return {
    // The MOVE screen.
    openHub: () => { renderHub(); show('move'); },
    // Quick Start from home (layout first), or a setup screen.
    open,
    runPreGame,
    describe: (r) => describeSetup(setupFor(r), r),
    minutes: (r) => minutesOf(setupFor(r)),
    // "Run last": the cones are already out, so go straight to the drill.
    // Must be called from a tap (sound unlock).
    runLast: (r) => {
      run = r;
      setup = setupFor(r);
      return validate(setup).ok ? go() : nav('setup');
    },
  };
}
