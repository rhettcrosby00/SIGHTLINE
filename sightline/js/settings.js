// Game Ready settings: a native-style Routine screen (grouped rows, segmented
// controls, a toggle) plus Appearance. Remembered on this device only.

import { CUES } from './lib/colors.js';
import { totalMinutes } from './plan.js';
import { cleanCue } from './content/cues.js';

const STORAGE_KEY = 'sightline.settings.v1';

// Every choice the Routine screen offers, grouped like a phone's Settings app.
export const GROUPS = [
  { title: 'Routine', fields: [
    { key: 'mode', label: 'Mode', options: [['tap', 'Tap'], ['cones', 'Cones']],
      hint: (s) => (s.mode === 'cones' ? 'Phone on a stand 10–15 ft away. Run to the cone it shows.' : 'Hold your phone and tap your answers.') },
    { key: 'length', label: 'Length', stack: true, options: [['quick', 'Quick · 5'], ['standard', 'Standard · 8'], ['full', 'Full · 12']] },
    { key: 'difficulty', label: 'Difficulty', options: [['normal', 'Normal'], ['hard', 'Hard']] },
  ] },
  { title: 'Coaching', fields: [
    { key: 'guide', label: 'Instructions', options: [['full', 'Full'], ['brief', 'Brief']],
      hint: () => 'Full shows an example and a short practice before each drill.' },
    { key: 'sound', label: 'Sound', toggle: true },
  ] },
  { title: 'Appearance', fields: [
    { key: 'appearance', label: 'Theme', stack: true, options: [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['outdoor', 'Outdoor']],
      hint: () => 'Auto follows your phone. Outdoor is high contrast for bright sun.' },
  ] },
];
const FIELDS = GROUPS.flatMap((g) => g.fields);

const DEFAULTS = { mode: 'tap', length: 'standard', difficulty: 'normal', sound: 'on', guide: 'full', appearance: 'auto', cue: 'COMPETE' };

let current = null;   // live settings object, shared with updateSetting()

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const out = { ...DEFAULTS };
    for (const f of FIELDS) {
      const ok = f.toggle ? ['on', 'off'] : f.options.map(([v]) => v);
      if (ok.includes(saved[f.key])) out[f.key] = saved[f.key];
    }
    if (typeof saved.cue === 'string') out.cue = cleanCue(saved.cue);
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

function save(settings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* private mode etc. */ }
}

export function applyAppearance(value) {
  const root = document.documentElement;
  if (value === 'light' || value === 'dark' || value === 'outdoor') root.dataset.appearance = value;
  else delete root.dataset.appearance;
}

// "8 min · Tap · Normal" for the home screen and "Run last setup".
export function describe(s) {
  return `${Math.round(totalMinutes(s.length))} min · ${s.mode === 'cones' ? 'Cones' : 'Tap'} · ${s.difficulty === 'hard' ? 'Hard' : 'Normal'}`;
}

// Change one setting from outside the Routine screen (e.g. the cue word).
export function updateSetting(key, value) {
  if (!current) return;
  current[key] = value;
  save(current);
}

const seg = (f, s) => `
  <div class="seg${f.stack ? ' seg--fill' : ''}" role="radiogroup" aria-label="${f.label}">
    ${f.options.map(([v, text]) => `<button type="button" role="radio" data-key="${f.key}" data-value="${v}"
      aria-checked="${s[f.key] === v}">${text}</button>`).join('')}
  </div>`;

const toggle = (f, s) => `
  <button type="button" class="switch" role="switch" data-toggle="${f.key}" aria-checked="${s[f.key] === 'on'}" aria-label="${f.label}"></button>`;

const coneDiagram = () => `
  <div class="cross" aria-label="Cone layout: green in front, red to the right, yellow behind, blue to the left">
    <span class="cross__you">You</span>
    ${CUES.map((c) => `<span class="cross__cone cross__cone--${c.dir}" style="--c:${c.hex}"><b aria-hidden="true">${c.shape}</b>${c.label}</span>`).join('')}
  </div>`;

function render(el, s) {
  el.innerHTML = GROUPS.map((g) => `
    <section class="group" aria-label="${g.title}">
      <h3 class="group__title">${g.title}</h3>
      <div class="group__rows">
        ${g.fields.map((f) => `
          <div class="setting${f.stack ? ' setting--stack' : ''}">
            <span class="setting__label">${f.label}</span>
            ${f.toggle ? toggle(f, s) : seg(f, s)}
            ${f.hint ? `<p class="setting__hint">${f.hint(s)}</p>` : ''}
          </div>`).join('')}
        ${g.title === 'Routine' && s.mode === 'cones' ? `
          <div class="setting setting--stack">
            <span class="setting__label">Cone setup · 3–5 yds from you</span>
            ${coneDiagram()}
          </div>` : ''}
      </div>
    </section>`).join('');
}

// onChange(settings) runs after every change (home screen summary, theme).
export function initSettings({ onChange = () => {} } = {}) {
  const settings = load();
  current = settings;
  applyAppearance(settings.appearance);
  const el = document.getElementById('settings-body');

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.key) settings[b.dataset.key] = b.dataset.value;
    else if (b.dataset.toggle) settings[b.dataset.toggle] = settings[b.dataset.toggle] === 'on' ? 'off' : 'on';
    else return;
    save(settings);
    if (b.dataset.key === 'appearance') applyAppearance(settings.appearance);
    render(el, settings);
    onChange({ ...settings });
  });

  render(el, settings);
  onChange({ ...settings });
  return () => ({ ...settings });
}
