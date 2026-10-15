// App settings: FOCUS options (grouped rows, segmented controls, a toggle)
// plus Appearance. Remembered on this device only. MOVE keeps its own setup
// (js/cone/setup.js).

import { totalMinutes } from './plan.js';
import { cleanCue } from './content/cues.js';
import { isOn } from './features.js';

const STORAGE_KEY = 'sightline.settings.v1';
const mins = (length) => Math.round(totalMinutes('game', length));

// Every choice the Settings screen offers, grouped like a phone's Settings app.
export const GROUPS = [
  { title: 'Focus', fields: [
    { key: 'length', label: 'Length', stack: true,
      options: ['quick', 'standard', 'full'].map((v) => [v, `${v[0].toUpperCase()}${v.slice(1)} · ${mins(v)}`]),
      hint: () => 'Minutes for Game Ready, instructions included. It never runs past 10.' },
    { key: 'difficulty', label: 'Difficulty', options: [['normal', 'Normal'], ['hard', 'Hard']] },
    { key: 'guide', label: 'Instructions', stack: true, options: [['auto', 'Auto'], ['full', 'Full'], ['brief', 'Brief']],
      hint: () => 'Auto shows an example and a short practice the first 3 times you run a drill, then just the rule.' },
    { key: 'sound', label: 'Sound', toggle: true },
  ] },
  { title: 'Leaderboard', flag: 'leaderboard', fields: [
    { key: 'nameStyle', label: 'Names', options: [['name', 'Name'], ['initials', 'Initials']],
      hint: () => 'Up to 12 characters, or classic 3-letter initials.' },
  ] },
  { title: 'Appearance', fields: [
    { key: 'appearance', label: 'Theme', stack: true, options: [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['outdoor', 'Outdoor']],
      hint: () => 'Auto follows your phone. Outdoor is high contrast for bright sun.' },
  ] },
];
const FIELDS = GROUPS.flatMap((g) => g.fields);

export const DEFAULTS = { length: 'standard', difficulty: 'normal', sound: 'on', guide: 'auto', appearance: 'auto', nameStyle: 'name', cue: 'COMPETE', guideV: 2 };

// Saved settings → current settings. Anything unknown or out of range falls
// back to the default; settings that no longer exist (the old Tap/Cones
// "mode") are dropped.
export function parseSettings(saved = {}) {
  const out = { ...DEFAULTS };
  for (const f of FIELDS) {
    const ok = f.toggle ? ['on', 'off'] : f.options.map(([v]) => v);
    if (ok.includes(saved?.[f.key])) out[f.key] = saved[f.key];
  }
  if (typeof saved?.cue === 'string') out.cue = cleanCue(saved.cue);
  // Before v2.4, Full was the default (there was no Auto): move those phones to Auto once.
  if (saved?.guide === 'full' && saved?.guideV !== 2) out.guide = 'auto';
  return out;
}

let current = null;   // live settings object, shared with updateSetting()

function load() {
  try { return parseSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch { return { ...DEFAULTS }; }
}

function save(settings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* private mode etc. */ }
}

function applyAppearance(value) {
  const root = document.documentElement;
  if (value === 'light' || value === 'dark' || value === 'outdoor') root.dataset.appearance = value;
  else delete root.dataset.appearance;
}

// "Standard · Normal · Full instructions · Sound on" for the FOCUS options row.
export function describe(s) {
  return [
    `${s.length[0].toUpperCase()}${s.length.slice(1)}`,
    s.difficulty === 'hard' ? 'Hard' : 'Normal',
    { auto: 'Auto instructions', full: 'Full instructions', brief: 'Brief instructions' }[s.guide] ?? 'Auto instructions',
    `Sound ${s.sound}`,
  ].join(' · ');
}

// Change one setting from outside the Settings screen (e.g. the cue word).
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

function render(el, s) {
  el.innerHTML = GROUPS.filter((g) => !g.flag || isOn(g.flag)).map((g) => `
    <section class="group" aria-label="${g.title}">
      <h3 class="group__title">${g.title}</h3>
      <div class="group__rows">
        ${g.fields.map((f) => `
          <div class="setting${f.stack ? ' setting--stack' : ''}">
            <span class="setting__label">${f.label}</span>
            ${f.toggle ? toggle(f, s) : seg(f, s)}
            ${f.hint ? `<p class="setting__hint">${f.hint(s)}</p>` : ''}
          </div>`).join('')}
      </div>
    </section>`).join('');
}

// onChange(settings) runs after every change (home screen, theme).
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
