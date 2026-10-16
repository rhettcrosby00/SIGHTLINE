// MOVE setup screens: Custom setup (every Cone Drill option) and Signals Only
// (arrows, no cones). Every change is saved on this device (setup only; no
// history), so the athlete doesn't re-enter it each time.
// Custom setup also picks Reactive or Planned (a known pattern), the Sport
// cue type (calls from the athlete's sport) and the Decision Layer.

import {
  CONE_COLORS, colorById, dirById, DIRECTIONS, DIRECTION_PRESETS, REPS, TIMED_SECONDS, SETS, REST_SEC, FLASH_MS,
  MIN_CONES, MAX_CONES, DISTANCE_YD, MANUAL_S, DECISIONS, normalize, normalizeSignals, validate,
} from './config.js';
import { PATTERNS, PATTERN_IDS } from './patterns.js';
import { SPORT_DIRS, packFor, RIGHT_HANDED } from './cues/sport.js';
import { DECISION_LABEL, DECISION_HINT, decisionsFor } from './decide.js';
import { readableYards } from './render.js';
import { SPORTS } from '../content/sports.js';
import { moveSafety } from '../content/safety.js';
import {
  TIMING, PACE_LABEL, coneSlots, timingSummary, suggestedRestSec, manualTooFast, farthestYards, drillMs, createTuneStore,
} from './timing.js';
import { icon, DIR_ICON } from '../lib/icons.js';
import { isMusicMode } from '../lib/audio.js';

// Each variant: where it's saved and how a saved setup is cleaned up.
const VARIANTS = {
  custom: { key: 'sightrep.cone.v1', normalize },
  signals: { key: 'sightrep.signals.v1', normalize: normalizeSignals },
};

function loadSetup(variant = 'custom') {
  const v = VARIANTS[variant];
  try { return v.normalize(JSON.parse(localStorage.getItem(v.key) || '{}')); } catch { return v.normalize(); }
}
function saveSetup(variant, s) {
  try { localStorage.setItem(VARIANTS[variant].key, JSON.stringify(s)); } catch { /* storage blocked: still works this visit */ }
}


const seg = (key, value, options, fill = false, cls = '') => `
  <div class="seg${fill ? ' seg--fill' : ''}${cls ? ` ${cls}` : ''}" role="radiogroup">
    ${options.map(([v, label]) => `<button type="button" role="radio" data-set="${key}" data-value="${v}"
      aria-checked="${String(v) === String(value)}">${label}</button>`).join('')}
  </div>`;

// One settings row: label + control side by side, or stacked for wide controls.
const row = (label, control, { hint = '', stack = false } = {}) => `
  <div class="setting${stack ? ' setting--stack' : ''}">
    <span class="setting__label">${label}</span>${control}${hint ? `<p class="setting__hint">${hint}</p>` : ''}
  </div>`;

const group = (title, rows) => `
  <section class="group">${title ? `<h3 class="group__title">${title}</h3>` : ''}<div class="group__rows">${rows}</div></section>`;

const stepper = (key, value, [min, max], { unit = '', step = 1, fmt = (v) => `${v}${unit}`, label = '' } = {}) => `
  <div class="stepper">
    <button type="button" data-step="${key}" data-delta="${-step}" aria-label="Less${label ? ` ${label}` : ''}" ${value <= min ? 'disabled' : ''}>${icon('minus')}</button>
    <output>${fmt(value)}</output>
    <button type="button" data-step="${key}" data-delta="${step}" aria-label="More${label ? ` ${label}` : ''}" ${value >= max ? 'disabled' : ''}>${icon('plus')}</button>
  </div>`;

const slider = (key, value, [min, max], step, fmt) => `
  <div class="slider"><input type="range" data-range="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${key}">
  <output data-out="${key}">${fmt(value)}</output></div>`;

// A row that folds its settings open in place.
const expander = (id, label, summary, open, body) => `
  <button type="button" class="expander" data-expand="${id}" aria-expanded="${open}">
    <span><span class="setting__label">${label}</span><span class="expander__sum">${summary}</span></span>${icon('chevron-down')}
  </button>
  ${open ? `<div class="expand">${body}</div>` : ''}`;

// The preset (2/3/4/5/8) matching these directions, in any order; '' for a custom pick.
const presetFor = (dirs) => Object.keys(DIRECTION_PRESETS)
  .find((k) => DIRECTION_PRESETS[k].length === dirs.length && DIRECTION_PRESETS[k].every((d) => dirs.includes(d))) ?? '';

// Config labels are uppercase (for cues); rows read better in sentence case.
const nice = (t) => t.charAt(0) + t.slice(1).toLowerCase();
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
const tunes = createTuneStore();

const STYLE_HINT = {
  outback: 'Sprint to the cone, plant, come back to the start.',
  firststep: 'Explode 2–3 steps toward it, then reset. Short and sharp; distance doesn’t matter.',
  conetocone: 'Go straight from cone to cone without coming back. Time comes from the distance between cones.',
};
const SIGNAL_STYLE_HINT = {
  firststep: 'Explode 2–3 steps the way it points, then reset.',
  outback: 'Cut or shuffle that far the way it points, then come back.',
};
const PACE_HINT = {
  learning: 'Extra time while you learn the cues.',
  training: 'Steady, quality reps.',
  game: 'Game speed for trained athletes.',
  overdrive: 'Conditioning: faster than game speed.',
};

function estimate(s) {
  const min = Math.round(drillMs(s) / 6000) / 10;
  return `${s.sets} set${s.sets > 1 ? 's' : ''} × ${s.setMode === 'timed' ? `${s.timedSec} s` : `${s.reps} reps`} · about ${min} min`;
}

// ui = { open: Set of expanded section ids, color: index of the cone whose palette is open }
// variant: 'custom' (cones) or 'signals' (arrows only, no cones, no layout step).
function renderSetup(el, s, ui = { open: new Set(), color: -1 }, variant = 'custom') {
  const signals = variant === 'signals';
  const planned = !signals && s.mode === 'planned';
  const usesColors = s.cueType === 'colors' || s.cueType === 'mixed';
  const usesArrows = s.cueType === 'arrows' || s.cueType === 'mixed';
  const colorRows = s.cueType === 'mixed' ? s.directions.length : s.cones;
  const v = validate(s);

  const colorList = !s.coloredCones ? '' : Array.from({ length: colorRows }, (_, i) => {
    const mine = colorById[s.colors[i]];
    const name = s.cueType === 'mixed' ? nice(DIRECTIONS.find((d) => d.id === s.directions[i])?.label ?? `Cone ${i + 1}`) : `Cone ${i + 1}`;
    const open = ui.color === i;
    return `<div class="setting setting--stack">
      <button type="button" class="cpick-row" data-colorrow="${i}" aria-expanded="${open}">
        <span class="cpick-row__chip" style="--c:${mine.hex};--ink:${mine.ink}" aria-hidden="true">${mine.shape}</span>
        <span class="cpick-row__name">${name}</span>
        <span class="cpick-row__value">${nice(mine.label)}${icon(open ? 'chevron-down' : 'chevron-right')}</span>
      </button>
      ${open ? `<div class="cpick__swatches expand">
        ${CONE_COLORS.map((c) => {
          const taken = c.id !== mine.id && s.colors.slice(0, colorRows).includes(c.id);
          return `<button type="button" class="swatch" style="--c:${c.hex};--ink:${c.ink}"
            data-color="${i}" data-value="${c.id}" aria-pressed="${c.id === mine.id}" ${taken ? 'disabled' : ''}
            aria-label="${nice(c.label)}${taken ? ' (used by another cone)' : ''}">${c.shape}</button>`;
        }).join('')}
      </div>` : ''}
    </div>`;
  }).join('');

  const compass = `
    <div class="compass" role="group" aria-label="Directions to include">
      ${DIRECTIONS.map((d) => `<button type="button" class="compass__dir compass__dir--${d.id}" data-dir="${d.id}"
        aria-pressed="${s.directions.includes(d.id)}" aria-label="${nice(d.label)}">${icon(DIR_ICON[d.id], { size: 26 })}</button>`).join('')}
      <span class="compass__you">You</span>
    </div>`;

  const eyeSummary = [
    { center: 'Center', random: 'Random spots', peripheral: 'Peripheral' }[s.position],
    s.display === 'flash' ? `Flash ${secs(s.flashMs)}` : 'Hold',
    s.fakes === 'off' ? 'No fake-outs' : `Fake-outs ${s.fakes}`,
  ].filter(Boolean).join(' · ');
  // Decision Layer: what this setup can use, and why the rest can't.
  const usable = new Set(decisionsFor({ ...s, decision: true, decisions: DECISIONS }));
  const WHY_NOT = {
    parity: 'needs a left and a right cone', stroop: 'needs colored cones', opposite: 'needs cones opposite each other',
  };
  const decisionRows = !s.decision ? '' : `
    <div class="setting setting--stack">
      <div class="chips" role="group" aria-label="Decisions">
        ${DECISIONS.map((d) => `<button type="button" class="chip" role="checkbox" data-decision="${d}"
          aria-checked="${s.decisions.includes(d) && usable.has(d)}" ${usable.has(d) ? '' : 'disabled'}>${DECISION_LABEL[d]}</button>`).join('')}
      </div>
      <ul class="dec__list">${DECISIONS.filter((d) => usable.has(d) && s.decisions.includes(d)).map((d) => `<li>${DECISION_HINT[d]}</li>`).join('')}</ul>
      ${DECISIONS.some((d) => !usable.has(d)) ? `<p class="setting__hint">${DECISIONS.filter((d) => !usable.has(d)).map((d) => `${DECISION_LABEL[d]} ${WHY_NOT[d]}`).join('. ')}.</p>` : ''}
    </div>`;
  // Sport calls: the sport picked on this phone, each call's direction, and how far it reads.
  const pack = packFor(s.sport);
  const calls = SPORT_DIRS.map((d) => pack[d]);
  const sportRows = s.cueType !== 'sport' ? '' : `
    ${row('Sport', `<select class="lb-select" data-sport aria-label="Sport">${SPORTS.map((x) => `<option value="${x.id}"${x.id === s.sport ? ' selected' : ''}>${x.label}</option>`).join('')}</select>`,
      { stack: true, hint: 'The same sport as your visualization in Focus.' })}
    <div class="setting setting--stack">
      <ul class="calls">${SPORT_DIRS.map((d) => `<li><b>${pack[d]}</b><span>${icon(DIR_ICON[d], { size: 18 })}${nice(dirById[d].label)}</span></li>`).join('')}</ul>
      <p class="setting__hint">Words are small from far away: these read at a glance from about ${Math.floor(Math.min(...calls.map((c) => readableYards(c))))} yd on a phone, so set the cones close. Colors, arrows and numbers read from much farther.${
        RIGHT_HANDED.includes(s.sport) ? ' Calls assume a right-hander; lefties swap the left and right cones.' : ''}</p>
    </div>`;
  const soundSummary = isMusicMode() ? 'Silent: music mode is on' : s.callouts ? 'Beeps + callouts' : 'Beeps';

  // Distances: one for every cone, or one per cone (Custom setup only). First step ignores distance.
  const tune = tunes.get(s);
  const slotName = (sl, i) => (usesArrows || s.cueType === 'sport' ? nice(dirById[sl.slot].label)
    : `Cone ${i + 1}${usesColors ? ` · ${nice(colorById[sl.target.color].label)}` : ''}`);
  const yd = { unit: ' yd', label: 'distance' };
  const distanceRows = s.style === 'firststep' ? ''
    : signals ? row('Distance', stepper('distance', s.distance, DISTANCE_YD, yd))
      : `${row('Distance', seg('distanceMode', s.distanceMode, [['same', 'Same for all'], ['each', 'Each cone']]))}
        ${s.distanceMode === 'same'
          ? row('Every cone', stepper('distance', s.distance, DISTANCE_YD, yd), { hint: 'From your start spot.' })
          : coneSlots(s).map((sl, i) => row(slotName(sl, i), stepper(`cone:${sl.slot}`, sl.yards, DISTANCE_YD, yd))).join('')}`;

  el.innerHTML = `
    <div class="cset">
      <header class="nav">
        <button type="button" class="nav__back" data-nav="menu">${icon('chevron-left', { size: 22 })}Move</button>
        <h2 class="nav__title">${signals ? 'Signals Only' : 'Custom setup'}</h2>
        <p class="cset__sub">${signals ? 'No cones. Cut or shuffle the way the arrow points.' : 'Cognitive change of direction'}</p>
      </header>
      ${moveSafety(s).map((n) => `<p class="notice">${icon('triangle-alert')}${n}</p>`).join('')}

      ${signals ? '' : group('Drill', `
        ${row('Drill type', seg('mode', s.mode, [['reactive', 'Reactive'], ['planned', 'Planned']], true), {
          stack: true,
          hint: 'Different skills. Reactive: you don’t know where until the cue (agility, closer to what games demand). Planned: a set route, the phone just says go (change-of-direction speed).' })}
        ${planned ? row('Pattern', seg('pattern', s.pattern, PATTERN_IDS.map((id) => [id, PATTERNS[id].label]), true), { stack: true, hint: PATTERNS[s.pattern].how }) : ''}`)}

      ${signals || planned ? '' : group('Cues', `
        ${row('Cue type', seg('cueType', s.cueType, [['colors', 'Colors'], ['arrows', 'Arrows'], ['numbers', 'Numbers'], ['mixed', 'Mixed'], ['sport', 'Sport']], true, 'seg--three'), {
          stack: true,
          hint: { colors: 'Each cone has a color. The screen shows a color.', arrows: 'Cones sit in directions. The screen shows an arrow.',
            numbers: 'Each cone has a number. The screen shows a number.', mixed: 'Cones are colored and in fixed directions. Cues switch between colors and arrows.',
            sport: 'Calls from your sport, each one a direction.' }[s.cueType] })}
        ${s.cueType === 'mixed' || s.cueType === 'sport' ? '' : row('Cones', stepper('cones', s.cones, [MIN_CONES, MAX_CONES]))}
        ${sportRows}`)}

      ${planned ? '' : group('Decision Layer', `
        ${row('Decisions', `<button type="button" class="switch" role="switch" data-flip="decision" aria-checked="${s.decision}" aria-label="Decision Layer"></button>`,
          { hint: s.decision ? 'About 4 in 10 cues need a quick decision before you cut. The first and last cue of a set never do.'
            : 'Off: just react (best to start). On: some cues need a quick decision first. Thinking while moving carries over best.' })}
        ${decisionRows}`)}

      ${usesArrows && !planned && s.cueType !== 'sport' ? group('Directions', `
        ${row('Preset', seg('preset', presetFor(s.directions),
          Object.keys(DIRECTION_PRESETS).map((k) => [k, k]), true), { stack: true, hint: '2 left/right · 3 adds forward · 4 adds back · 5 adds forward diagonals · 8 all' })}
        ${row('Or tap the exact directions', compass, { stack: true })}
        ${!signals && s.cueType === 'arrows' && s.directions.length !== s.cones ? `<div class="setting setting--stack">
          <p class="notice">${icon('triangle-alert')}${s.directions.length} directions but ${s.cones} cones. Set out one cone per direction.</p>
          <button type="button" class="btn btn--secondary btn--block" data-fixcones="${s.directions.length}">Use ${s.directions.length} cones</button></div>` : ''}`) : ''}

      ${usesColors && !planned ? group('Cone colors', `
        ${row('Colors', seg('coloredCones', s.coloredCones, [[true, 'I’ll pick'], [false, 'Defaults']]))}
        ${s.coloredCones ? colorList : `<div class="setting setting--stack"><p class="setting__hint">${
          ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'white', 'pink'].slice(0, colorRows).map((id) => nice(colorById[id].label)).join(' · ')}</p></div>`}`) : ''}

      ${planned ? group('Reps', `
        ${row('Pace', seg('pace', s.pace, [['learning', 'Learning'], ['training', 'Training'], ['game', 'Game'], ['overdrive', 'Overdrive']], true),
          { stack: true, hint: PACE_HINT[s.pace] })}
        <div class="setting setting--stack"><p class="timing__sum">${timingSummary(s, tune)}</p></div>`) : group('Reps', `
        ${row('Rep style', seg('style', s.style, signals
          ? [['firststep', 'First step'], ['outback', 'Out & back']]
          : [['outback', 'Out & back'], ['firststep', 'First step'], ['conetocone', 'Cone to cone']], true),
        { stack: true, hint: (signals ? SIGNAL_STYLE_HINT : STYLE_HINT)[s.style] })}
        ${distanceRows}
        ${row('Pace', seg('pace', s.pace, [['learning', 'Learning'], ['training', 'Training'], ['game', 'Game'], ['overdrive', 'Overdrive']], true),
          { stack: true, hint: s.manual ? 'Using your exact time (Advanced).' : PACE_HINT[s.pace] })}
        <div class="setting setting--stack">
          <p class="timing__sum">${timingSummary(s, tune)}</p>
          ${tune !== 1 ? `<p class="setting__hint">${Math.round(Math.abs(tune - 1) * 100)}% ${tune > 1 ? 'more' : 'less'} time per rep than the formula, from your “Too fast / Too slow” answers at this distance.
            <button type="button" class="link-btn" data-tune-reset>Reset</button></p>` : ''}
        </div>`)}

      ${group('Sets', `
        ${planned ? '' : row('Sets by', seg('setMode', s.setMode, [['reps', 'Reps'], ['timed', 'Time']]))}
        ${s.setMode === 'reps'
          ? row('Reps per set', slider('reps', s.reps, REPS, 1, (x) => `${x} reps`), { stack: true })
          : row('Set length', seg('timedSec', s.timedSec, TIMED_SECONDS.map((t) => [t, `${t}s`]), true), { stack: true })}
        ${row('Sets', stepper('sets', s.sets, SETS))}
        ${s.sets > 1 ? row('Rest between sets', seg('restMode', s.restMode, [['auto', `Suggested · ${mmss(suggestedRestSec(s))}`], ['custom', 'Custom']], true),
          { stack: true, hint: `About 1:${TIMING.restRatio[s.pace]} work to rest at ${PACE_LABEL[s.pace]} pace.` }) : ''}
        ${s.sets > 1 && s.restMode === 'custom' ? row('Rest', stepper('restSec', s.restSec, REST_SEC, { step: 15, fmt: mmss, label: 'rest' })) : ''}`)}

      ${planned ? '' : group('', expander('advanced', 'Advanced', s.manual ? `Exact time · ${s.manualS.toFixed(1)} s per rep` : 'Time set by distance and pace', ui.open.has('advanced'), `
        ${row('Exact seconds per rep', `<button type="button" class="switch" role="switch" data-flip="manual" aria-checked="${s.manual}" aria-label="Exact seconds per rep"></button>`,
          { hint: 'Every rep gets the same time, whatever the distance.' })}
        ${s.manual ? row('Seconds per rep', slider('manualS', s.manualS, MANUAL_S, 0.1, (x) => `${Number(x).toFixed(1)} s`), { stack: true }) : ''}`))}

      ${planned ? '' : group('', expander('eye', 'Eye engagement', eyeSummary, ui.open.has('eye'), `
        ${row('Cue position', seg('position', s.position, [['center', 'Center'], ['random', 'Random'], ['peripheral', 'Peripheral']], true), {
          stack: true, hint: { center: 'Cues fill the screen.', random: 'Cues pop up in different spots. Find it, then go.',
            peripheral: 'Eyes on the center dot. Cues appear near the edge.' }[s.position] })}
        ${row('Display', seg('display', s.display, [['hold', 'Hold'], ['flash', 'Flash']]),
          { hint: s.display === 'hold' ? 'The cue stays up until the next one.' : 'The cue shows briefly, then disappears.' })}
        ${s.display === 'flash' ? row('Flash length', slider('flashMs', s.flashMs, FLASH_MS, 50, secs), { stack: true }) : ''}
        ${row('Fake-outs', seg('fakes', s.fakes, [['off', 'Off'], ['low', 'Low'], ['medium', 'Med']]), { hint: 'A gray Hold screen now and then. Stay still.' })}`))}

      ${group('', expander('sound', 'Sound', soundSummary, ui.open.has('sound'), `
        ${row('Spoken callouts', `<button type="button" class="switch" role="switch" data-flip="callouts" aria-checked="${s.callouts}" aria-label="Spoken callouts"></button>`,
          { hint: 'The phone says the cue, like “Red” or “Left”. Beeps and the countdown follow Settings → Sounds.' })}`))}
    </div>
    <div class="screen__foot">
      ${ui.confirm ? `
      <p class="notice" role="alert">${icon('triangle-alert')}${s.style === 'firststep'
        ? 'This may be faster than is realistic for First step.' : `This may be faster than is realistic at ${Math.round(farthestYards(s))} yds.`} Continue?</p>
      <div class="cdone__row">
        <button type="button" class="btn btn--secondary" data-confirm="no">Change time</button>
        <button type="button" class="btn btn--primary" data-confirm="yes">Continue</button>
      </div>` : `
      <p class="cset__est">${estimate(s)}</p>
      ${v.errors.map((e) => `<p class="cerr">${e}</p>`).join('')}
      ${signals
        ? `<button type="button" class="btn btn--primary btn--block" data-nav="start" ${v.ok ? '' : 'disabled'}>${icon('play')}Start</button>`
        : `<button type="button" class="btn btn--primary btn--block" data-nav="layout" ${v.ok ? '' : 'disabled'}>Set up cones</button>`}`}
    </div>`;
}

// Wires a setup screen. onNav('menu' | 'layout' | 'start', setup) is called for navigation.
// sport = { get, set }: the sport picked on this phone (shared with Focus).
export function initSetup(el, { onNav, variant = 'custom', sport = { get: () => 'general', set() {} } }) {
  let s = VARIANTS[variant].normalize({ ...loadSetup(variant), sport: sport.get() });
  // open: expanded sections; color: the cone whose palette is open; confirm:
  // where to go once a too-fast exact time is confirmed.
  const ui = { open: new Set(), color: -1, confirm: null };
  const draw = () => {
    const y = window.scrollY;
    renderSetup(el, s, ui, variant);
    window.scrollTo(0, y);
  };
  const update = (patch, { rerender = true } = {}) => {
    s = VARIANTS[variant].normalize({ ...s, ...patch });
    saveSetup(variant, s);
    ui.confirm = null;
    if (rerender) draw();
  };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.nav) {
      // An exact time faster than realistic for the distance: confirm on screen first.
      if ((d.nav === 'layout' || d.nav === 'start') && manualTooFast(s)) { ui.confirm = d.nav; return draw(); }
      return onNav(d.nav, s);
    }
    if (d.confirm) {
      const where = ui.confirm;
      ui.confirm = null;
      if (d.confirm === 'yes') return onNav(where, s);
      ui.open.add('advanced');
      return draw();
    }
    if (b.hasAttribute('data-tune-reset')) { tunes.set(s, 1); return draw(); }
    if (d.expand) { ui.open.has(d.expand) ? ui.open.delete(d.expand) : ui.open.add(d.expand); return draw(); }
    if (d.colorrow !== undefined) { ui.color = ui.color === Number(d.colorrow) ? -1 : Number(d.colorrow); return draw(); }
    if (d.flip) return update({ [d.flip]: !s[d.flip] });
    if (d.decision) {
      const on = s.decisions.includes(d.decision);
      const next = on ? s.decisions.filter((x) => x !== d.decision) : [...s.decisions, d.decision];
      return update({ decisions: next.length ? next : s.decisions });   // keep at least one
    }
    if (d.set === 'preset') return update({ directions: DIRECTION_PRESETS[d.value].slice(), cones: DIRECTION_PRESETS[d.value].length });
    if (d.set) {
      let val = d.value;
      if (val === 'true' || val === 'false') val = val === 'true';
      else if (/^\d+$/.test(val) && ['timedSec', 'restSec'].includes(d.set)) val = Number(val);
      const patch = { [d.set]: val };
      if (d.set === 'cueType' && val === 'mixed') patch.cones = s.directions.length;
      return update(patch);
    }
    if (d.step?.startsWith('cone:')) {
      const slot = d.step.slice(5);
      const now = coneSlots(s).find((sl) => sl.slot === slot)?.yards ?? s.distance;
      return update({ coneYards: { ...s.coneYards, [slot]: now + Number(d.delta) } });
    }
    if (d.step) return update({ [d.step]: s[d.step] + Number(d.delta) });
    if (d.dir) {
      const dirs = s.directions.includes(d.dir) ? s.directions.filter((x) => x !== d.dir) : [...s.directions, d.dir];
      return update({ directions: dirs, ...(s.cueType === 'mixed' ? { cones: dirs.length } : {}) });
    }
    if (d.fixcones) return update({ cones: Number(d.fixcones) });
    if (d.color !== undefined) {
      const i = Number(d.color);
      const colors = s.colors.slice();
      const other = colors.indexOf(d.value);
      if (other !== -1) colors[other] = colors[i];   // swap so colors never duplicate
      colors[i] = d.value;
      ui.color = -1;   // close the palette once a color is picked
      return update({ colors });
    }
  });

  // The sport (shared with Focus): saved for both sides.
  el.addEventListener('change', (e) => {
    if (!e.target.matches('[data-sport]')) return;
    sport.set(e.target.value);
    update({ sport: e.target.value });
  });

  // Sliders: update the label while dragging, save when released.
  el.addEventListener('input', (e) => {
    const r = e.target.closest('input[type="range"]');
    if (!r) return;
    const key = r.dataset.range;
    const val = Number(r.value);
    const out = el.querySelector(`[data-out="${key}"]`);
    if (out) out.textContent = key === 'reps' ? `${val} reps` : key === 'manualS' ? `${val.toFixed(1)} s` : secs(val);
    update({ [key]: val }, { rerender: false });
    const est = el.querySelector('.cset__est');
    if (est) est.textContent = estimate(s);
    const sum = el.querySelector('.timing__sum');
    if (sum) sum.textContent = timingSummary(s, tunes.get(s));
  });

  renderSetup(el, s, ui, variant);
  return {
    get: () => (s = VARIANTS[variant].normalize({ ...s, sport: sport.get() })),
    render: () => renderSetup(el, s = VARIANTS[variant].normalize({ ...s, sport: sport.get() }), ui, variant),
    set: (patch) => update(patch, { rerender: false }),
  };
}
