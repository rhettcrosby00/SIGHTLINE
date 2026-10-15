// Cone Drill setup screen. Every change is saved on this device (setup only;
// no history), so the athlete doesn't re-enter it each time.

import {
  CONE_COLORS, colorById, DIRECTIONS, DIRECTION_PRESETS, SPEEDS, CUSTOM_MS, REPS, TIMED_SECONDS,
  SETS, REST_SECONDS, FLASH_MS, MIN_CONES, MAX_CONES, normalize, validate, intervalMs, COUNTDOWN_MS,
} from './config.js';

const KEY = 'sightline.cone.v1';

export function loadSetup() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return normalize(); }
}
function saveSetup(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked: still works this visit */ }
}

const ARROW_GLYPH = { F: '↑', FR: '↗', R: '→', BR: '↘', B: '↓', BL: '↙', L: '←', FL: '↖' };
export { ARROW_GLYPH };

const seg = (key, value, options) => `
  <div class="seg" role="radiogroup">
    ${options.map(([v, label]) => `<button type="button" role="radio" data-set="${key}" data-value="${v}"
      aria-checked="${String(v) === String(value)}">${label}</button>`).join('')}
  </div>`;

const field = (label, body, hint = '') => `
  <div class="field"><span class="field__label">${label}</span>${body}${hint ? `<p class="field__hint">${hint}</p>` : ''}</div>`;

const stepper = (key, value, [min, max], unit = '') => `
  <div class="stepper">
    <button type="button" data-step="${key}" data-delta="-1" aria-label="Fewer" ${value <= min ? 'disabled' : ''}>−</button>
    <output>${value}${unit}</output>
    <button type="button" data-step="${key}" data-delta="1" aria-label="More" ${value >= max ? 'disabled' : ''}>+</button>
  </div>`;

const slider = (key, value, [min, max], step, fmt) => `
  <div class="slider"><input type="range" data-range="${key}" min="${min}" max="${max}" step="${step}" value="${value}">
  <output data-out="${key}">${fmt(value)}</output></div>`;

const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;

function estimate(s) {
  const per = s.setMode === 'timed' ? s.timedSec * 1000 : s.reps * intervalMs(s);
  const ms = s.sets * (per + COUNTDOWN_MS) + (s.sets - 1) * s.restSec * 1000;
  const min = Math.round((ms + 60_000) / 6000) / 10;   // + 1 min Settle breathing first
  return `Settle breathing + ${s.sets} set${s.sets > 1 ? 's' : ''} × ${s.setMode === 'timed' ? `${s.timedSec} s` : `${s.reps} reps`} · about ${min} min`;
}

export function renderSetup(el, s) {
  const usesColors = s.cueType === 'colors' || s.cueType === 'mixed';
  const usesArrows = s.cueType === 'arrows' || s.cueType === 'mixed';
  const colorRows = s.cueType === 'mixed' ? s.directions.length : s.cones;
  const v = validate(s);

  const colorPicker = !s.coloredCones ? '' : Array.from({ length: colorRows }, (_, i) => {
    const mine = s.colors[i];
    const label = s.cueType === 'mixed' ? DIRECTIONS.find((d) => d.id === s.directions[i])?.label ?? `Cone ${i + 1}` : `Cone ${i + 1}`;
    return `<div class="cpick"><span class="cpick__name">${label}</span><div class="cpick__swatches">
      ${CONE_COLORS.map((c) => {
        const taken = c.id !== mine && s.colors.slice(0, colorRows).includes(c.id);
        return `<button type="button" class="swatch ${c.dark ? 'swatch--dark' : ''}" style="--c:${c.hex};--ink:${c.ink}"
          data-color="${i}" data-value="${c.id}" aria-pressed="${c.id === mine}" ${taken ? 'disabled' : ''}
          aria-label="${c.label}${taken ? ' (used by another cone)' : ''}">${c.shape}</button>`;
      }).join('')}
    </div></div>`;
  }).join('');

  const compass = `
    <div class="compass" role="group" aria-label="Directions to include">
      ${DIRECTIONS.map((d) => `<button type="button" class="compass__dir compass__dir--${d.id}" data-dir="${d.id}"
        aria-pressed="${s.directions.includes(d.id)}" aria-label="${d.label}">${ARROW_GLYPH[d.id]}</button>`).join('')}
      <span class="compass__you">YOU</span>
    </div>`;

  el.innerHTML = `
    <div class="cset">
      <header class="cset__head">
        <button type="button" class="btn-link" data-nav="menu">‹ Menu</button>
        <h2 class="cset__title">CONE DRILL</h2>
        <p class="cset__sub">Change of direction + eye engagement</p>
      </header>
      <p class="cset__safety">Use a clear, flat area. Warm up before high-speed cuts.</p>

      <section class="cset__group"><h3>Cues</h3>
        ${field('Cue type', seg('cueType', s.cueType, [['colors', 'Colors'], ['arrows', 'Arrows'], ['numbers', 'Numbers'], ['mixed', 'Mixed']]),
          { colors: 'Each cone has a color; the screen shows a color.', arrows: 'Cones sit in directions; the screen shows an arrow.',
            numbers: 'Each cone has a number; the screen shows a number.', mixed: 'Advanced: cones are colored AND in fixed directions; cues switch between colors and arrows.' }[s.cueType])}
        ${s.cueType === 'mixed' ? '' : field('Number of cones', stepper('cones', s.cones, [MIN_CONES, MAX_CONES]))}
      </section>

      ${usesArrows ? `<section class="cset__group"><h3>Directions</h3>
        ${field('Presets', seg('preset', Object.keys(DIRECTION_PRESETS).find((k) => DIRECTION_PRESETS[k].join() === s.directions.join()) ?? '',
          Object.keys(DIRECTION_PRESETS).map((k) => [k, k])), '2 = left/right · 3 adds forward · 4 adds back · 5 adds forward diagonals · 8 = all')}
        ${field('Or tap the exact directions', compass)}
        ${s.cueType === 'arrows' && s.directions.length !== s.cones ? `<div class="cwarn">
          <p>${s.directions.length} directions but ${s.cones} cones — set out one cone per direction.</p>
          <button type="button" class="btn-ghost" data-fixcones="${s.directions.length}">Use ${s.directions.length} cones</button></div>` : ''}
      </section>` : ''}

      ${usesColors ? `<section class="cset__group"><h3>Cone colors</h3>
        ${field('Colored cones', seg('coloredCones', s.coloredCones, [[true, 'Yes, I’ll pick'], [false, 'Use defaults']]))}
        ${s.coloredCones ? `<div class="cpicks">${colorPicker}</div>`
          : `<p class="field__hint">Cones use: ${(s.cueType === 'mixed' ? s.directions.length : s.cones) <= 8
            ? ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'white', 'pink'].slice(0, colorRows).map((id) => colorById[id].label).join(', ') : ''}.</p>`}
        <p class="field__hint">Each color also shows its shape and name on screen as a backup.</p>
      </section>` : ''}

      <section class="cset__group"><h3>Timing</h3>
        ${field('Cue speed', seg('speed', s.speed, [['slow', 'Slow 3s'], ['medium', 'Med 2s'], ['fast', 'Fast 1.5s'], ['game', 'Game 1s'], ['custom', 'Custom']]),
          'Time between cues. It varies a little each time so the rhythm can’t be predicted.')}
        ${s.speed === 'custom' ? field('Custom speed', slider('customMs', s.customMs, CUSTOM_MS, 100, secs)) : ''}
        ${field('Sets by', seg('setMode', s.setMode, [['reps', 'Reps'], ['timed', 'Time']]))}
        ${s.setMode === 'reps'
          ? field('Reps per set', slider('reps', s.reps, REPS, 1, (x) => `${x} reps`))
          : field('Set length', seg('timedSec', s.timedSec, TIMED_SECONDS.map((t) => [t, `${t}s`])))}
        ${field('Sets', stepper('sets', s.sets, SETS))}
        ${s.sets > 1 ? field('Rest between sets', seg('restSec', s.restSec, REST_SECONDS.map((t) => [t, t < 60 ? `${t}s` : t === 60 ? '1 min' : `${t / 60} min`]))) : ''}
      </section>

      <section class="cset__group"><h3>Eye engagement</h3>
        ${field('Cue position', seg('position', s.position, [['center', 'Center'], ['random', 'Random'], ['peripheral', 'Peripheral']]),
          { center: 'Cues fill the screen.', random: 'Cues pop up in different spots — find it, then go.',
            peripheral: 'Keep your eyes on the center dot; cues appear near the edge.' }[s.position])}
        ${field('Display', seg('display', s.display, [['hold', 'Hold'], ['flash', 'Flash']]),
          s.display === 'hold' ? 'The cue stays up until the next one.' : 'The cue shows briefly, then disappears.')}
        ${s.display === 'flash' ? field('Flash length', slider('flashMs', s.flashMs, FLASH_MS, 50, secs)) : ''}
        ${field('Fake-outs', seg('fakes', s.fakes, [['off', 'Off'], ['low', 'Low'], ['medium', 'Medium']]),
          'A gray HOLD screen now and then — stay still.')}
        ${usesArrows ? field('Reverse rule', seg('reverse', s.reverse, [[false, 'Off'], [true, 'On']]),
          'Advanced: when the arrow has a flashing white border, go the OPPOSITE way.') : ''}
      </section>

      <section class="cset__group"><h3>Sound</h3>
        ${field('Sound', seg('sound', s.sound, [['on', 'On'], ['off', 'Off']]), 'A short beep at the start of each cue.')}
        ${s.sound === 'on' ? field('Spoken callouts', seg('callouts', s.callouts, [[false, 'Off'], [true, 'On']]), 'The phone says the cue (“Red!”, “Left!”) so you can react by ear.') : ''}
      </section>

      <div class="cset__foot">
        <p class="cset__est">${estimate(s)}</p>
        ${v.errors.map((e) => `<p class="cerr">${e}</p>`).join('')}
        <button type="button" class="btn-start btn-start--sm" data-nav="layout" ${v.ok ? '' : 'disabled'}>NEXT: SET UP CONES</button>
      </div>
    </div>`;
}

// Wires the setup screen. onNav('menu' | 'layout', setup) is called for navigation.
export function initSetup(el, { onNav }) {
  let s = loadSetup();
  const update = (patch, { rerender = true } = {}) => {
    s = normalize({ ...s, ...patch });
    saveSetup(s);
    if (rerender) {
      const y = window.scrollY;
      renderSetup(el, s);
      window.scrollTo(0, y);
    }
  };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.nav) return onNav(d.nav, s);
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

  renderSetup(el, s);
  return { get: () => s, render: () => renderSetup(el, s), set: (patch) => update(patch, { rerender: false }) };
}
