// MOVE: cognitive change of direction with the phone on a stand. The MOVE
// screen opens with the Game Day / Training switch, the cones every preset
// uses (one diagram), a brightness reminder and three presets (Quick,
// Standard, Game Speed: js/cone/config.js). Tap one and the get-set countdown
// starts. Under Advanced: the countdown length, Custom setup (every option →
// cone layout → drill) and Signals Only (arrows, no cones).
// The drill runs in the shared session engine (touch lock, hold to pause,
// wake lock). Only the setups are saved.

import { initSetup } from './setup.js';
import { renderLayout, layoutSvg } from './layout.js';
import { planDrill } from './plan.js';
import { coneSession, tuneButtons, wireTune } from './run.js';
import { validate, normalize, presetCones, movePreset, MOVE_PRESETS } from './config.js';
import { PATTERNS } from './patterns.js';
import { PACE_LABEL, STYLE_LABEL, TIMING, coneSlots, drillMs, applyTune, createTuneStore } from './timing.js';
import { runSession } from '../engine.js';
import { PRESETS, runKey, parseRunKey, runTitle, dayToggle, dayNote } from '../presets.js';
import { isOn } from '../features.js';
import { unlock as unlockAudio, buzz } from '../lib/audio.js';
import { icon } from '../lib/icons.js';
import { SUM_LOGO } from '../stages/summary.js';
import { initPartner } from './partner.js';
import { SAFETY } from '../content/safety.js';
import { moveScore, moveMultiplier, SCORING } from '../score/scoring.js';

const $ = (id) => document.getElementById(id);
const mmss = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const CUE_NAME = { colors: 'Colors', arrows: 'Arrows', numbers: 'Numbers', mixed: 'Mixed', sport: 'Sport calls' };
const SETUPS = { custom: 'Custom setup', signals: 'Signals Only' };
// Time to get back to the start spot after Resume.
const RESUME_LEAD_S = 3;

// "5 yd", or "3–10 yd" when each cone has its own distance.
function yardsText(s) {
  const yards = coneSlots(s).map((sl) => sl.yards);
  const lo = Math.min(...yards);
  const hi = Math.max(...yards);
  return `${lo === hi ? lo : `${lo}–${hi}`} yd`;
}
const conesText = (s) => (s.cueType === 'arrows' || s.cueType === 'mixed' ? `${s.directions.length} directions` : `${s.cones} cones`);
const distText = (s) => (s.style === 'firststep' ? STYLE_LABEL.firststep : `${yardsText(s)}${s.style === 'conetocone' ? ' cone to cone' : ''}`);

// One line per setup, e.g. "4 cones · Colors · 5 yd · Training · 3 sets".
function describeSetup(s, run = 'custom') {
  const pace = s.manual ? `${s.manualS.toFixed(1)} s per rep` : PACE_LABEL[s.pace];
  const sets = `${s.sets} set${s.sets > 1 ? 's' : ''}${s.setMode === 'timed' ? ` × ${s.timedSec} s` : ''}`;
  if (s.mode === 'planned') return `${PATTERNS[s.pattern].label} · Planned · ${pace} · ${sets}`;
  if (run === 'signals') return `${s.directions.length} directions · ${distText(s)} · ${pace} · ${sets}`;
  return `${conesText(s)} · ${CUE_NAME[s.cueType]}${s.decision ? ' + decisions' : ''} · ${distText(s)} · ${pace} · ${sets}`;
}
const minutesOf = (s) => Math.max(1, Math.round(drillMs(s) / 60000));

// show(name, {back}) switches screens; dev = { speed, autoReady, seed } from
// the URL; onRun(key) fires when a drill starts (for "Run last"); leaderboard
// (optional) gets the score once a drill ends with at least one full set;
// sport = { get, set }: the sport picked on this phone (shared with Focus);
// getSettings / updateSetting: Sounds, the countdown and Game Day / Training;
// onTrained() fires when a Training drill finishes (the weekly streak);
// week() gives that streak; onDay() fires when the switch changes;
// afterSession() runs on the summary (the setup saved with the key, js/backup.js).
export function initMove({
  show, dev = {}, onRun = () => {}, onTrained = () => {}, leaderboard = null, sport, getSettings, updateSetting,
  week = () => ({}), onDay = () => {}, afterSession = () => {},
}) {
  const hubEl = $('move-hub');
  const layoutEl = $('cd-layout');
  const doneEl = $('cd-done');
  const tunes = createTuneStore();
  let advanced = false;
  let key = 'custom';   // what's running: a preset key ("game:speed") or 'custom' | 'signals'
  let setup = null;

  // The two editable setups. Presets run on the Custom setup's cones.
  const fromSetup = (variant) => (where, s) => { key = variant; setup = withPrefs(s); nav(where); };
  const custom = initSetup($('cd-setup'), { onNav: fromSetup('custom'), variant: 'custom', sport });
  const signals = initSetup($('cd-signals'), { onNav: fromSetup('signals'), variant: 'signals', sport });
  // Partner mode (a coach's phone sends the cues) is parked: off everywhere (js/features.js).
  const partner = isOn('partner') ? initPartner($('cd-partner'), {
    getSetup: () => ({ ...custom.get(), mode: 'reactive' }),
    onBack: () => nav('menu'),
  }) : null;

  // Sounds and the countdown come from Settings, for every way in.
  const withPrefs = (s) => normalize({ ...s, sound: getSettings().sound, getSetS: Number(getSettings().getSet) });
  function setupFor(k) {
    const p = parseRunKey(k);
    if (p) return withPrefs(movePreset(p.id, p.day, custom.get()));
    return withPrefs(k === 'signals' ? signals.get() : custom.get());
  }
  const titleOf = (k) => runTitle(k) ?? SETUPS[k] ?? '';

  const nav = (where, { back = false } = {}) => {
    if (where === 'home') return show('start', { back: true });
    if (where === 'board') return leaderboard?.openBoard('cone-done', { side: 'move' });
    if (where === 'menu') { renderHub(); return show('move', { back: true }); }
    if (where === 'custom') { key = 'custom'; custom.render(); return show('cone-setup'); }
    if (where === 'signals') { key = 'signals'; signals.render(); return show('signals'); }
    if (where === 'partner' && partner) { partner.open(); return show('partner'); }
    if (where === 'setup') {
      const ctl = key === 'signals' ? signals : custom;
      ctl.render();
      return show(key === 'signals' ? 'signals' : 'cone-setup', { back });
    }
    if (where === 'layout') { renderLayout(layoutEl, setup, { tune: tunes.get(setup) }); return show('cone-layout'); }
    if (where === 'start') return go();
  };

  function renderHub() {
    const day = getSettings().day;
    const cones = presetCones(custom.get());
    const getSet = getSettings().getSet;
    const preset = (p) => {
      const s = setupFor(runKey(day, p.id));
      const m = MOVE_PRESETS[day === 'training' ? 'training' : 'game'][p.id];
      return `
        <button type="button" class="preset" data-run="${runKey(day, p.id)}">
          <span class="preset__text"><strong>${p.title}</strong><small>${m.sets} × ${m.timedSec} s · ${m.pace === 'game' ? 'game pace, full rest' : 'training pace'}${m.decision ? ' + decisions' : ''}</small></span>
          <span class="preset__min">${minutesOf(s)} min</span>${icon('play')}
        </button>`;
    };
    hubEl.innerHTML = `
      <header class="nav">
        <button type="button" class="nav__back" data-nav="home">${icon('chevron-left', { size: 22 })}Home</button>
        <p class="side-tag">${icon('move', { size: 18 })}Move</p>
        <h2 class="nav__title">React · Cut · Compete</h2>
      </header>
      ${dayToggle(day)}
      <p class="side-note">${dayNote(day, week())}</p>
      <div class="notice notice--sun notice--pair">
        <p>${icon('sun')}<span>Turn brightness all the way up. After you tap, you have ${getSet} s to set the phone down and get to your start.</span></p>
        <p>${icon('triangle-alert')}<span>${SAFETY.move}</span></p>
      </div>
      <section class="presets" aria-label="Start">
        ${PRESETS.map(preset).join('')}
      </section>
      <section class="mcones" aria-labelledby="mcones-title">
        <h3 id="mcones-title" class="group__title">Your cones</h3>
        ${layoutSvg(cones)}
        <p class="mcones__text">${conesText(cones)} · ${CUE_NAME[cones.cueType]} · ${distText(cones)}
          <button type="button" class="link-btn" data-nav="custom">Change cones</button></p>
        <p class="setting__hint">No taps during a set. Hold a finger on the screen for 1 second to pause.</p>
      </section>
      <details class="adv"${advanced ? ' open' : ''}>
        <summary class="adv__head">Advanced${icon('chevron-down')}</summary>
        <section class="group"><h3 class="group__title">Countdown before the first set</h3>
          <div class="seg seg--fill" role="radiogroup" aria-label="Countdown before the first set">
            ${['5', '6', '7', '8', '9', '10'].map((v) => `<button type="button" role="radio" data-getset="${v}" aria-checked="${v === getSet}">${v}s</button>`).join('')}
          </div>
        </section>
        <section class="group"><h3 class="group__title">Your setups</h3><div class="group__rows">
          <button type="button" class="hub-row" data-nav="custom">
            <span class="hub-row__text"><strong>Custom setup</strong><small>Every option: ${describeSetup(custom.get(), 'custom')}</small></span>${icon('chevron-right')}
          </button>
          <button type="button" class="hub-row" data-nav="signals">
            <span class="hub-row__text"><strong>Signals Only</strong><small>No cones · ${describeSetup(signals.get(), 'signals')}</small></span>${icon('chevron-right')}
          </button>
        </div></section>
        ${partner ? `
        <section class="group"><h3 class="group__title">With a coach</h3><div class="group__rows">
          <button type="button" class="hub-row" data-nav="partner">
            <span class="hub-row__text"><strong>Partner mode</strong><small>A coach’s phone sends the cues</small></span>${icon('chevron-right')}
          </button></div></section>` : ''}
      </details>`;
    hubEl.querySelector('.adv').addEventListener('toggle', (e) => { advanced = e.target.open; });
  }

  hubEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.run) run(b.dataset.run);
    else if (b.dataset.day) { updateSetting('day', b.dataset.day); onDay(); renderHub(); }
    else if (b.dataset.getset) { updateSetting('getSet', b.dataset.getset); renderHub(); }
    else if (b.dataset.nav) nav(b.dataset.nav);
  });

  layoutEl.addEventListener('click', (e) => {
    const where = e.target.closest('[data-nav]')?.dataset.nav;
    if (where) nav(where, { back: where !== 'start' });
  });

  // Runs the drill (touch lock, wake lock, Too fast / Too slow between sets).
  // Call from a tap: sound and the spoken countdown unlock first, inside it.
  async function play() {
    unlockAudio(setup.sound === 'on', { voice: true });
    onRun(key);
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
    const { completed } = await runSession(steps, setup, {
      session, speed: dev.speed, autoReady: dev.autoReady, lock: true, resumeLeadS: RESUME_LEAD_S,
    });
    if (completed) buzz([60, 80, 120]);   // drill complete (the summary appears too)
    if (completed && parseRunKey(key)?.day === 'training') onTrained();   // a training day, for the weekly streak
    return { completed, r, plan, totalMs, tuning };
  }

  async function go() {
    const { completed, r, plan, totalMs, tuning } = await play();
    const preset = !!parseRunKey(key);
    // Stopped early: completed sets still count on the leaderboard.
    if (!completed && !(leaderboard && r.sets > 0)) return nav(preset ? 'menu' : 'setup', { back: true });
    doneEl.innerHTML = `
      <div class="sum">
        <div class="sum__top"><p class="sum__kicker">${completed ? `${titleOf(key)} complete` : `Stopped after ${r.sets} of ${setup.sets} sets`}</p>${SUM_LOGO}</div>
        <h2 class="sum__title">${completed ? 'Nice work' : 'Good work'}</h2>
        <p class="sum__meta">${describeSetup(setup, key)}</p>
        <div class="tiles">
          <div class="tile"><p class="tile__value">${r.reps}</p><p class="tile__label">reps</p></div>
          <div class="tile"><p class="tile__value">${completed ? r.sets : `${r.sets}/${setup.sets}`}</p><p class="tile__label">sets</p></div>
          ${completed ? `<div class="tile"><p class="tile__value">${mmss(totalMs)}</p><p class="tile__label">total time</p></div>` : ''}
        </div>
        ${r.holds ? `<p class="sum__note">Plus <b>${r.holds}</b> fake-out${r.holds > 1 ? 's' : ''} where you held still.</p>` : ''}
        <div class="lb-inline"></div>
        ${tuneButtons('How was the pace?')}
        <p class="sum__foot">Only your pace answer is saved, for this distance and rep style.</p>
        <p class="sum__seed">Session code ${plan.seed}</p>
      </div>
      <div class="screen__foot">
        <button type="button" class="btn btn--primary btn--block" data-act="again">${icon('rotate-ccw')}Run it back</button>
        <div class="cdone__row">
          <button type="button" class="btn btn--secondary" data-nav="${preset ? 'menu' : 'setup'}">${preset ? 'Move' : 'Change setup'}</button>
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
    afterSession({ key });
    if (leaderboard) {
      const per = Math.round(SCORING.move.perRep * moveMultiplier(setup));
      await leaderboard.afterSession({
        side: 'move',
        score: moveScore(setup, { reps: r.reps, setsDone: r.sets }),
        detail: `${r.reps} reps × ${per} pts${completed ? ' + finish bonus' : ' · completed sets only'} · honor system`,
        settings: { setup, setsDone: r.sets },
      }, { slot: doneEl.querySelector('.lb-inline') });
    }
    show('cone-done');
  }

  // Start a run straight away (a preset, Run last, Run it back, or "Next: Move"
  // after Focus). Call from a tap. A setup that can't run opens its screen.
  function run(k) {
    key = k;
    setup = setupFor(k);
    return validate(setup).ok ? go() : nav('setup');
  }

  doneEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="again"]')) return run(key);
    const where = e.target.closest('[data-nav]')?.dataset.nav;
    if (where) nav(where, { back: where === 'setup' || where === 'menu' });
  });

  return {
    // The MOVE screen.
    openHub: () => { renderHub(); show('move'); },
    run,
    // "Game Speed · 2 min", for home's Run last and Focus's "Next: Move".
    describeRun: (k) => `${titleOf(k)} · ${minutesOf(setupFor(k))} min`,
    knows: (k) => !!parseRunKey(k) || k in SETUPS,
  };
}
