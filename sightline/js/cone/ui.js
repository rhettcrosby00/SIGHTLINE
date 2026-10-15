// MOVE: cognitive change of direction with the phone on a stand. Three ways in:
//   Quick Start   fixed preset → cone layout → drill
//   Custom setup  every Cone Drill option → cone layout → drill
//   Signals Only  arrows, no cones → drill
// The drill runs in the shared session engine (pause, wake lock). No taps
// during a set. Only the setups are saved.

import { initSetup } from './setup.js';
import { renderLayout } from './layout.js';
import { planDrill } from './plan.js';
import { coneSession, tuneButtons, wireTune } from './run.js';
import { validate, quickStart } from './config.js';
import { PACE_LABEL, STYLE_LABEL, TIMING, coneSlots, drillMs, applyTune, createTuneStore } from './timing.js';
import { runSession } from '../engine.js';
import { unlock as unlockAudio, buzz } from '../lib/audio.js';
import { icon } from '../lib/icons.js';
import { SUM_LOGO } from '../stages/summary.js';

const $ = (id) => document.getElementById(id);
const mmss = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const CUE_NAME = { colors: 'Colors', arrows: 'Arrows', numbers: 'Numbers', mixed: 'Mixed' };

export const MOVE_RUNS = { quick: 'Quick Start', custom: 'Custom setup', signals: 'Signals Only' };

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
  const sets = `${s.sets} set${s.sets > 1 ? 's' : ''}`;
  const dist = s.style === 'firststep' ? STYLE_LABEL.firststep
    : `${yardsText(s)}${s.style === 'conetocone' ? ' cone to cone' : ''}`;
  if (run === 'signals') return `${s.directions.length} directions · ${dist} · ${pace} · ${sets}`;
  const what = s.cueType === 'arrows' || s.cueType === 'mixed' ? `${s.directions.length} directions` : `${s.cones} cones`;
  return `${what} · ${CUE_NAME[s.cueType]} · ${dist} · ${pace} · ${sets}`;
}
const minutesOf = (s) => Math.max(1, Math.round(drillMs(s) / 60000));

// show(name, {back}) switches screens; dev = { speed, autoReady, seed } from
// the URL; onRun(run) fires when a drill starts (for "Run last").
export function initMove({ show, dev = {}, onRun = () => {} }) {
  const hubEl = $('move-hub');
  const layoutEl = $('cd-layout');
  const doneEl = $('cd-done');
  const tunes = createTuneStore();
  let run = 'custom';
  let setup = null;

  const nav = (where, { back = false } = {}) => {
    if (where === 'home') return show('start', { back: true });
    if (where === 'menu') { renderHub(); return show('move', { back: true }); }
    if (where === 'custom') return open('custom');
    if (where === 'setup') {
      const ctl = run === 'signals' ? signals : custom;
      ctl.render();
      return show(run === 'signals' ? 'signals' : 'cone-setup', { back });
    }
    if (where === 'layout') { renderLayout(layoutEl, setup, { preset: run === 'quick', tune: tunes.get(setup) }); return show('cone-layout'); }
    if (where === 'start') return go();
  };

  // The two editable setups; Quick Start is built fresh each time.
  const fromSetup = (variant) => (where, s) => { run = variant; setup = s; nav(where); };
  const custom = initSetup($('cd-setup'), { onNav: fromSetup('custom'), variant: 'custom' });
  const signals = initSetup($('cd-signals'), { onNav: fromSetup('signals'), variant: 'signals' });
  const setupFor = (r) => (r === 'quick' ? quickStart(custom.get()) : r === 'signals' ? signals.get() : custom.get());

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
      <section class="group"><h3 class="group__title">Your setups</h3><div class="group__rows">
        ${rowFor('custom', describeSetup(custom.get(), 'custom'), 'chevron-right')}
        ${rowFor('signals', `No cones · ${describeSetup(signals.get(), 'signals')}`, 'chevron-right')}
      </div></section>
      <div class="screen__foot">
        <p class="cset__est">${describeSetup(setupFor('quick'), 'quick')} · ${minutesOf(setupFor('quick'))} min</p>
        <button type="button" class="btn btn--primary btn--block" data-run="quick">${icon('play')}Quick Start</button>
      </div>`;
  }

  // From the hub or home: Quick Start shows the cone layout; the others open their setup.
  function open(r) {
    run = r;
    setup = setupFor(r);
    nav(r === 'quick' ? 'layout' : 'setup');
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

  async function go() {
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
    const { steps, session, totalMs } = coneSession(plan, setup, tuning);
    $('screen-session').dataset.side = 'move';
    show('session');
    const { completed, results } = await runSession(steps, setup, { session, speed: dev.speed, autoReady: dev.autoReady });
    if (!completed) return nav(run === 'quick' ? 'menu' : 'setup', { back: true });
    buzz([60, 80, 120]);   // drill complete
    const r = results.find((x) => x.id === 'conedrill');
    doneEl.innerHTML = `
      <div class="sum">
        <div class="sum__top"><p class="sum__kicker">${MOVE_RUNS[run]} complete</p>${SUM_LOGO}</div>
        <h2 class="sum__title">Nice work</h2>
        <p class="sum__meta">${describeSetup(setup, run)}</p>
        <div class="tiles">
          <div class="tile"><p class="tile__value">${r.reps}</p><p class="tile__label">reps</p></div>
          <div class="tile"><p class="tile__value">${r.sets}</p><p class="tile__label">sets</p></div>
          <div class="tile"><p class="tile__value">${mmss(totalMs)}</p><p class="tile__label">total time</p></div>
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
    show('cone-done');
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
