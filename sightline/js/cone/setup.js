// MOVE setup screens: Custom setup (every Cone Drill option) and Signals Only
// (arrows, no cones). Every change is saved on this device (setup only; no
// history), so the athlete doesn't re-enter it each time.

import {
  CONE_COLORS, colorById, DIRECTIONS, DIRECTION_PRESETS, CUSTOM_MS, REPS, TIMED_SECONDS,
  SETS, REST_SECONDS, FLASH_MS, MIN_CONES, MAX_CONES, normalize, normalizeSignals, validate, intervalMs, drillMs,
} from './config.js';
import { icon, DIR_ICON } from '../lib/icons.js';

// Each variant: where it's saved and how a saved setup is cleaned up.
const VARIANTS = {
  custom: { key: 'sightline.cone.v1', normalize },
  signals: { key: 'sightline.signals.v1', normalize: normalizeSignals },
};

function loadSetup(variant = 'custom') {
  const v = VARIANTS[variant];
  try { return v.normalize(JSON.parse(localStorage.getItem(v.key) || '{}')); } catch { return v.normalize(); }
}
function saveSetup(variant, s) {
  try { localStorage.setItem(VARIANTS[variant].key, JSON.stringify(s)); } catch { /* storage blocked: still works this visit */ }
}


const seg = (key, value, options, fill = false) => `
  <div class="seg${fill ? ' seg--fill' : ''}" role="radiogroup">
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

const stepper = (key, value, [min, max], unit = '') => `
  <div class="stepper">
    <button type="button" data-step="${key}" data-delta="-1" aria-label="Fewer" ${value <= min ? 'disabled' : ''}>${icon('minus')}</button>
    <output>${value}${unit}</output>
    <button type="button" data-step="${key}" data-delta="1" aria-label="More" ${value >= max ? 'disabled' : ''}>${icon('plus')}</button>
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
const restLabel = (t) => (t < 60 ? `${t}s` : t === 60 ? '1 min' : `${t / 60} min`);

function estimate(s) {
  const min = Math.round(drillMs(s) / 6000) / 10;
  return `${s.sets} set${s.sets > 1 ? 's' : ''} × ${s.setMode === 'timed' ? `${s.timedSec} s` : `${s.reps} reps`} · about ${min} min`;
}

// ui = { open: Set of expanded section ids, color: index of the cone whose palette is open }
// variant: 'custom' (cones) or 'signals' (arrows only, no cones, no layout step).
function renderSetup(el, s, ui = { open: new Set(), color: -1 }, variant = 'custom') {
  const signals = variant === 'signals';
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
    usesArrows && s.reverse ? 'Reverse on' : '',
  ].filter(Boolean).join(' · ');
  const soundSummary = s.sound === 'on' ? (s.callouts ? 'Beep + callouts' : 'Beep') : 'Off';

  el.innerHTML = `
    <div class="cset">
      <header class="nav">
        <button type="button" class="nav__back" data-nav="menu">${icon('chevron-left', { size: 22 })}Move</button>
        <h2 class="nav__title">${signals ? 'Signals Only' : 'Custom setup'}</h2>
        <p class="cset__sub">${signals ? 'No cones. Cut or shuffle the way the arrow points.' : 'Cognitive change of direction'}</p>
      </header>
      <p class="notice">${icon('triangle-alert')}Use a clear, flat area. Warm up before high-speed cuts.</p>

      ${signals ? '' : group('Cues', `
        ${row('Cue type', seg('cueType', s.cueType, [['colors', 'Colors'], ['arrows', 'Arrows'], ['numbers', 'Numbers'], ['mixed', 'Mixed']], true), {
          stack: true,
          hint: { colors: 'Each cone has a color. The screen shows a color.', arrows: 'Cones sit in directions. The screen shows an arrow.',
            numbers: 'Each cone has a number. The screen shows a number.', mixed: 'Cones are colored and in fixed directions. Cues switch between colors and arrows.' }[s.cueType] })}
        ${s.cueType === 'mixed' ? '' : row('Cones', stepper('cones', s.cones, [MIN_CONES, MAX_CONES]))}`)}

      ${usesArrows ? group('Directions', `
        ${row('Preset', seg('preset', presetFor(s.directions),
          Object.keys(DIRECTION_PRESETS).map((k) => [k, k]), true), { stack: true, hint: '2 left/right · 3 adds forward · 4 adds back · 5 adds forward diagonals · 8 all' })}
        ${row('Or tap the exact directions', compass, { stack: true })}
        ${!signals && s.cueType === 'arrows' && s.directions.length !== s.cones ? `<div class="setting setting--stack">
          <p class="notice">${icon('triangle-alert')}${s.directions.length} directions but ${s.cones} cones. Set out one cone per direction.</p>
          <button type="button" class="btn btn--secondary btn--block" data-fixcones="${s.directions.length}">Use ${s.directions.length} cones</button></div>` : ''}`) : ''}

      ${usesColors ? group('Cone colors', `
        ${row('Colors', seg('coloredCones', s.coloredCones, [[true, 'I’ll pick'], [false, 'Defaults']]))}
        ${s.coloredCones ? colorList : `<div class="setting setting--stack"><p class="setting__hint">${
          ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'white', 'pink'].slice(0, colorRows).map((id) => nice(colorById[id].label)).join(' · ')}</p></div>`}`) : ''}

      ${group('Timing', `
        ${row('Cue speed', seg('speed', s.speed, [['slow', 'Slow'], ['medium', 'Med'], ['fast', 'Fast'], ['game', 'Game'], ['custom', 'Custom']], true), {
          stack: true, hint: s.speed === 'custom' ? 'Set your own time between cues.' : `${secs(intervalMs(s))} between cues, varied a little so the rhythm can’t be predicted.` })}
        ${s.speed === 'custom' ? row('Time between cues', slider('customMs', s.customMs, CUSTOM_MS, 100, secs), { stack: true }) : ''}
        ${row('Sets by', seg('setMode', s.setMode, [['reps', 'Reps'], ['timed', 'Time']]))}
        ${s.setMode === 'reps'
          ? row('Reps per set', slider('reps', s.reps, REPS, 1, (x) => `${x} reps`), { stack: true })
          : row('Set length', seg('timedSec', s.timedSec, TIMED_SECONDS.map((t) => [t, `${t}s`]), true), { stack: true })}
        ${row('Sets', stepper('sets', s.sets, SETS))}
        ${s.sets > 1 ? row('Rest between sets', seg('restSec', s.restSec, REST_SECONDS.map((t) => [t, restLabel(t)]), true), { stack: true }) : ''}`)}

      ${group('', expander('eye', 'Eye engagement', eyeSummary, ui.open.has('eye'), `
        ${row('Cue position', seg('position', s.position, [['center', 'Center'], ['random', 'Random'], ['peripheral', 'Peripheral']], true), {
          stack: true, hint: { center: 'Cues fill the screen.', random: 'Cues pop up in different spots. Find it, then go.',
            peripheral: 'Eyes on the center dot. Cues appear near the edge.' }[s.position] })}
        ${row('Display', seg('display', s.display, [['hold', 'Hold'], ['flash', 'Flash']]),
          { hint: s.display === 'hold' ? 'The cue stays up until the next one.' : 'The cue shows briefly, then disappears.' })}
        ${s.display === 'flash' ? row('Flash length', slider('flashMs', s.flashMs, FLASH_MS, 50, secs), { stack: true }) : ''}
        ${row('Fake-outs', seg('fakes', s.fakes, [['off', 'Off'], ['low', 'Low'], ['medium', 'Med']]), { hint: 'A gray Hold screen now and then. Stay still.' })}
        ${usesArrows ? row('Reverse rule', seg('reverse', s.reverse, [[false, 'Off'], [true, 'On']]),
          { hint: 'When the arrow has a flashing white border, go the opposite way.' }) : ''}`))}

      ${group('', expander('sound', 'Sound', soundSummary, ui.open.has('sound'), `
        ${row('Beep on each cue', `<button type="button" class="switch" role="switch" data-flip="sound" aria-checked="${s.sound === 'on'}" aria-label="Sound"></button>`)}
        ${s.sound === 'on' ? row('Spoken callouts', `<button type="button" class="switch" role="switch" data-flip="callouts" aria-checked="${s.callouts}" aria-label="Spoken callouts"></button>`,
          { hint: 'The phone says the cue, like “Red” or “Left”.' }) : ''}`))}
    </div>
    <div class="screen__foot">
      <p class="cset__est">${estimate(s)}</p>
      ${v.errors.map((e) => `<p class="cerr">${e}</p>`).join('')}
      ${signals
        ? `<button type="button" class="btn btn--primary btn--block" data-nav="start" ${v.ok ? '' : 'disabled'}>${icon('play')}Start</button>`
        : `<button type="button" class="btn btn--primary btn--block" data-nav="layout" ${v.ok ? '' : 'disabled'}>Set up cones</button>`}
    </div>`;
}

// Wires a setup screen. onNav('menu' | 'layout' | 'start', setup) is called for navigation.
export function initSetup(el, { onNav, variant = 'custom' }) {
  let s = loadSetup(variant);
  const ui = { open: new Set(), color: -1 };
  const draw = () => {
    const y = window.scrollY;
    renderSetup(el, s, ui, variant);
    window.scrollTo(0, y);
  };
  const update = (patch, { rerender = true } = {}) => {
    s = VARIANTS[variant].normalize({ ...s, ...patch });
    saveSetup(variant, s);
    if (rerender) draw();
  };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.nav) return onNav(d.nav, s);
    if (d.expand) { ui.open.has(d.expand) ? ui.open.delete(d.expand) : ui.open.add(d.expand); return draw(); }
    if (d.colorrow !== undefined) { ui.color = ui.color === Number(d.colorrow) ? -1 : Number(d.colorrow); return draw(); }
    if (d.flip) return update({ [d.flip]: d.flip === 'sound' ? (s.sound === 'on' ? 'off' : 'on') : !s[d.flip] });
    if (d.set === 'preset') return update({ directions: DIRECTION_PRESETS[d.value].slice(), cones: DIRECTION_PRESETS[d.value].length });
    if (d.set) {
      let val = d.value;
      if (val === 'true' || val === 'false') val = val === 'true';
      else if (/^\d+$/.test(val) && ['timedSec', 'restSec'].includes(d.set)) val = Number(val);
      const patch = { [d.set]: val };
      if (d.set === 'cueType' && val === 'mixed') patch.cones = s.directions.length;
      return update(patch);
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

  // Sliders: update the label while dragging, save when released.
  el.addEventListener('input', (e) => {
    const r = e.target.closest('input[type="range"]');
    if (!r) return;
    const key = r.dataset.range;
    const val = Number(r.value);
    const out = el.querySelector(`[data-out="${key}"]`);
    if (out) out.textContent = key === 'reps' ? `${val} reps` : secs(val);
    update({ [key]: val }, { rerender: false });
    const est = el.querySelector('.cset__est');
    if (est) est.textContent = estimate(s);
  });

  renderSetup(el, s, ui, variant);
  return { get: () => s, render: () => renderSetup(el, s, ui, variant), set: (patch) => update(patch, { rerender: false }) };
}
