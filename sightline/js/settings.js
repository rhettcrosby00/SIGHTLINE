// App settings, grouped like a phone's Settings app (segmented controls,
// toggles, a text field). Remembered on this device only. The everyday choices
// live on each side as presets (js/presets.js); this is the "Advanced" layer.
// MOVE's Custom setup and Signals Only keep their own setups (js/cone/setup.js).

import { CUE_MAX, cleanCue } from './content/cues.js';
import { SPORTS, sportById, cleanSport } from './content/sports.js';
import { GET_SET_S } from './cone/config.js';
import { isOn } from './features.js';
import { esc } from './lib/text.js';

const STORAGE_KEY = 'sightline.settings.v1';
const GET_SET = Array.from({ length: GET_SET_S[1] - GET_SET_S[0] + 1 }, (_, i) => String(GET_SET_S[0] + i));

// Every choice the Settings screen offers.
export const GROUPS = [
  { title: 'You', fields: [
    { key: 'sport', label: 'Sport', select: () => SPORTS.map((x) => [x.id, x.label]),
      hint: () => 'Picks your visualization scripts and skill cue words.' },
    { key: 'position', label: 'Position', select: (s) => [['', 'Any'], ...sportById[s.sport].positions], when: (s) => sportById[s.sport].positions.length > 0 },
    { key: 'cue', label: 'Cue word', text: CUE_MAX,
      hint: () => 'One or two words you say to yourself before you compete, like ATTACK or EYES UP. Used in Lock In and My Routine.' },
  ] },
  { title: 'Focus', fields: [
    { key: 'guide', label: 'Instructions', stack: true, options: [['auto', 'Auto'], ['full', 'Full'], ['brief', 'Brief']],
      hint: () => 'Auto shows an example and a short practice the first 3 times you run a drill, then just the rule.' },
    { key: 'contrast', label: 'Contrast', options: [['full', 'Full'], ['low', 'Low']],
      hint: () => 'Low fades the cues toward the background, like poor light, shadow or glare: Color Call, Saccade Jumps, Peripheral Flash and Target Capture. Turn your brightness up outdoors.' },
    { key: 'occlusion', label: 'Occlusion (training)', toggle: true,
      hint: () => 'Training mode only, never in Game Ready. In Smooth Pursuit, Saccade Jumps and Object Tracking the moving target disappears and comes back, so you predict where it went. Only the target, never the screen. Leave it off if flashing light bothers you.' },
    { key: 'eyeCheck', label: 'Eye Check (beta)', toggle: true,
      hint: () => 'Uses the front camera to estimate where your eyes look during Quiet Eye, Peripheral Flash, Saccade Jumps and Smooth Pursuit, with a 10-second calibration first. Video never leaves your phone and nothing is recorded. Feedback only: it never changes your score. Estimates, not a vision or medical test.' },
    { key: 'focusCheck', label: 'Focus Check (training)', toggle: true,
      hint: () => 'Training mode only. About 30 seconds of taps at the start and end of a Training session: today against your usual on this phone. A readiness check, not a medical test.' },
  ] },
  { title: 'Move', fields: [
    { key: 'getSet', label: 'Countdown before the first set', stack: true, options: GET_SET.map((v) => [v, `${v} s`]),
      hint: () => 'Time to set the phone down and get to your start spot. The numbers are spoken when Sounds are on.' },
  ] },
  { title: 'Sound', fields: [
    { key: 'sound', label: 'Sounds', toggle: true,
      hint: () => 'Beeps and spoken numbers on both sides, even with the iPhone’s silent switch on. Other music pauses while a session runs.' },
    { key: 'music', label: 'Keep my music playing', toggle: true,
      hint: () => 'The app plays no sound at all, so your own music never stops. Cues come as vibration (on phones that allow it) and on screen. iPhone doesn’t let web apps vibrate, so keep an eye on the screen there.' },
  ] },
  { title: 'Leaderboard', fields: [
    { key: 'nameStyle', label: 'Names', options: [['name', 'Name'], ['initials', 'Initials']],
      hint: () => 'Up to 12 characters, or classic 3-letter initials.' },
  ] },
  { title: 'Appearance', fields: [
    { key: 'appearance', label: 'Theme', stack: true, options: [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['outdoor', 'Outdoor']],
      hint: () => 'Auto follows your phone. Outdoor is high contrast for bright sun.' },
  ] },
];
// Set by the presets (Quick / Standard / Game Speed), not shown in Settings.
const PRESET_FIELDS = [
  { key: 'length', options: [['quick'], ['standard'], ['full']] },
  { key: 'difficulty', options: [['normal'], ['hard']] },
];
const FIELDS = [...GROUPS.flatMap((g) => g.fields), ...PRESET_FIELDS];

export const DEFAULTS = {
  length: 'standard', difficulty: 'normal', sound: 'on', music: 'off', guide: 'auto', appearance: 'auto', nameStyle: 'name',
  sport: 'general', position: '', sportAsked: false, cue: 'COMPETE', guideV: 2,
  contrast: 'full', occlusion: 'off', occlusionOk: false, focusCheck: 'off', eyeCheck: 'off',
  day: 'game',   // each side: Game Day or Training
  getSet: '7',   // MOVE: seconds of countdown before the first set
  setupDone: false,   // the first-run setup was finished or skipped (js/guide.js)
};

// Shown once, the first time Occlusion is turned on.
export const OCCLUSION_WARNING = 'Occlusion makes the moving target disappear and come back (never more than 3 changes a second). The screen itself never flashes.\n\n'
  + 'If you have epilepsy, have ever had a seizure, or flashing light bothers you, leave it off. Stop if you feel dizzy or unwell.\n\nTurn it on?';

// Saved settings → current settings. Anything unknown or out of range falls
// back to the default; settings that no longer exist (the old Tap/Cones
// "mode") are dropped.
export function parseSettings(saved = {}) {
  const out = { ...DEFAULTS };
  for (const f of FIELDS.filter((x) => !x.select && !x.text)) {
    const ok = f.toggle ? ['on', 'off'] : f.options.map(([v]) => v);
    if (ok.includes(saved?.[f.key])) out[f.key] = saved[f.key];
  }
  Object.assign(out, cleanSport(saved?.sport, saved?.position));
  out.sportAsked = saved?.sportAsked === true;
  out.setupDone = saved?.setupDone === true;
  out.occlusionOk = saved?.occlusionOk === true;
  out.day = saved?.day === 'training' ? 'training' : 'game';
  if (typeof saved?.cue === 'string') out.cue = cleanCue(saved.cue);
  // Before v2.4, Full was the default (there was no Auto): move those phones to Auto once.
  if (saved?.guide === 'full' && saved?.guideV !== 2) out.guide = 'auto';
  return out;
}

let current = null;   // live settings object, shared with updateSetting()
let redraw = () => {};   // redraws the Settings screen (after a change from elsewhere)

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

// "Auto instructions · Low contrast · Sounds on" for the FOCUS options row.
export function describe(s) {
  return [
    { auto: 'Auto instructions', full: 'Full instructions', brief: 'Brief instructions' }[s.guide] ?? 'Auto instructions',
    ...(s.contrast === 'low' ? ['Low contrast'] : []),
    ...(s.occlusion === 'on' ? ['Occlusion'] : []),
    ...(s.focusCheck === 'on' ? ['Focus Check'] : []),
    ...(s.eyeCheck === 'on' ? ['Eye Check (beta)'] : []),
    s.music === 'on' ? 'Music mode' : `Sounds ${s.sound}`,
  ].join(' · ');
}

// Change one setting from outside the Settings screen (e.g. the cue word).
export function updateSetting(key, value) {
  if (!current) return;
  current[key] = value;
  save(current);
  redraw();
}

const seg = (f, s) => `
  <div class="seg${f.stack ? ' seg--fill' : ''}" role="radiogroup" aria-label="${f.label}">
    ${f.options.map(([v, text]) => `<button type="button" role="radio" data-key="${f.key}" data-value="${v}"
      aria-checked="${s[f.key] === v}">${text}</button>`).join('')}
  </div>`;

const select = (f, s) => `
  <select class="lb-select" data-select="${f.key}" aria-label="${f.label}">
    ${f.select(s).map(([v, text]) => `<option value="${v}"${s[f.key] === v ? ' selected' : ''}>${text}</option>`).join('')}
  </select>`;

const text = (f, s) => `
  <input class="lbn__input set-text" type="text" data-text="${f.key}" maxlength="${f.text}" value="${esc(s[f.key])}"
    autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="done" aria-label="${f.label}">`;

const toggle = (f, s) => `
  <button type="button" class="switch" role="switch" data-toggle="${f.key}" aria-checked="${s[f.key] === 'on'}" aria-label="${f.label}"></button>`;

function render(el, s) {
  el.innerHTML = GROUPS.filter((g) => !g.flag || isOn(g.flag)).map((g) => `
    <section class="group" aria-label="${g.title}">
      <h3 class="group__title">${g.title}</h3>
      <div class="group__rows">
        ${g.fields.filter((f) => (!f.when || f.when(s)) && (!f.flag || isOn(f.flag))).map((f) => `
          <div class="setting${f.stack || f.select || f.text ? ' setting--stack' : ''}">
            <span class="setting__label">${f.label}</span>
            ${f.toggle ? toggle(f, s) : f.select ? select(f, s) : f.text ? text(f, s) : seg(f, s)}
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

  el.addEventListener('change', (e) => {
    if (e.target.dataset?.text === 'cue') {
      settings.cue = cleanCue(e.target.value) || settings.cue;
      e.target.value = settings.cue;
      save(settings);
      onChange({ ...settings });
      return;
    }
    const key = e.target.dataset?.select;
    if (!key) return;
    settings[key] = e.target.value;
    Object.assign(settings, cleanSport(settings.sport, key === 'sport' ? '' : settings.position));
    settings.sportAsked = true;
    save(settings);
    render(el, settings);
    onChange({ ...settings });
  });

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const key = b.dataset.toggle;
    if (b.dataset.key) settings[b.dataset.key] = b.dataset.value;
    else if (key) {
      const on = settings[key] !== 'on';
      // Occlusion: a photosensitivity warning the first time it's turned on.
      if (key === 'occlusion' && on && !settings.occlusionOk) {
        if (!confirm(OCCLUSION_WARNING)) return;
        settings.occlusionOk = true;
      }
      settings[key] = on ? 'on' : 'off';
    } else return;
    save(settings);
    if (b.dataset.key === 'appearance') applyAppearance(settings.appearance);
    render(el, settings);
    onChange({ ...settings });
  });

  redraw = () => render(el, settings);
  render(el, settings);
  onChange({ ...settings });
  return () => ({ ...settings });
}
