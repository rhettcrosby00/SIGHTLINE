// Start-screen settings: segmented controls, remembered on this device only.

import { CUES } from './lib/colors.js';
import { totalMinutes } from './routine.js';

const STORAGE_KEY = 'sightline.settings.v1';

export const FIELDS = [
  { key: 'mode',       label: 'Mode',       options: [['tap', 'Tap'], ['cones', 'Cones']] },
  { key: 'length',     label: 'Length',     options: [['quick', 'Quick'], ['standard', 'Standard'], ['full', 'Full']] },
  { key: 'difficulty', label: 'Difficulty', options: [['normal', 'Normal'], ['hard', 'Hard']] },
  { key: 'sound',      label: 'Sound',      options: [['on', 'On'], ['off', 'Off']] },
];

const DEFAULTS = { mode: 'tap', length: 'standard', difficulty: 'normal', sound: 'on' };

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const out = { ...DEFAULTS };
    for (const f of FIELDS) {
      if (f.options.some(([v]) => v === saved[f.key])) out[f.key] = saved[f.key];
    }
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

function save(settings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* private mode etc. */ }
}

export function initSettings() {
  const settings = load();
  const form = document.getElementById('settings');
  const coneSetup = document.getElementById('cone-setup');
  const lengthNote = document.getElementById('length-note');

  // Build segmented controls (radiogroups).
  for (const f of FIELDS) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const id = `lbl-${f.key}`;
    wrap.innerHTML = `<span class="field__label" id="${id}">${f.label}</span>`;
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-labelledby', id);
    for (const [value, text] of f.options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.key = f.key;
      b.dataset.value = value;
      b.textContent = text;
      seg.appendChild(b);
    }
    wrap.appendChild(seg);
    form.appendChild(wrap);
  }

  // Cone diagram (cross layout around the athlete).
  const grid = coneSetup.querySelector('.cone-grid');
  grid.innerHTML = '<div class="cone-you">YOU</div>' + CUES.map((c) => `
    <div class="cone cone--${c.dir}" style="color:${c.hex}">
      <span class="cone__shape" aria-hidden="true">${c.shape}</span>
      <span>${c.label}</span>
    </div>`).join('');

  function render() {
    form.querySelectorAll('.seg button').forEach((b) => {
      b.setAttribute('aria-checked', String(settings[b.dataset.key] === b.dataset.value));
      b.tabIndex = settings[b.dataset.key] === b.dataset.value ? 0 : -1;
    });
    coneSetup.hidden = settings.mode !== 'cones';
    lengthNote.textContent = `About ${Math.round(totalMinutes(settings.length))} minutes · ${
      settings.mode === 'cones' ? 'phone on a stand, 10–15 ft away' : 'hold your phone'}`;
  }

  form.addEventListener('click', (e) => {
    const b = e.target.closest('.seg button');
    if (!b) return;
    settings[b.dataset.key] = b.dataset.value;
    save(settings);
    render();
  });

  render();
  return () => ({ ...settings });
}
