// Readiness check: a one-tap "How ready do you feel?" before the session
// (with the cue-word pick) and again after Lock In. Shown on the summary as
// "2 → 4". Nothing is saved. It's a self-check, not a measurement.

import { CUE_MAX, cleanCue } from '../content/cues.js';
import { esc } from '../lib/text.js';

export const LEVELS = ['Flat', 'Low', 'Okay', 'Good', 'Locked in'];

const scale = () => `
  <div class="scale" role="radiogroup" aria-label="Readiness from 1 to 5">
    ${LEVELS.map((label, i) => `
      <button type="button" class="scale__btn" role="radio" aria-checked="false" data-level="${i + 1}">
        <b>${i + 1}</b><span>${label}</span>
      </button>`).join('')}
  </div>`;

// Before: pick a level (optional) and a cue word, then LET'S GO.
// `suggestions` rotate every session; the athlete's last word stays first.
// Resolves { level: 1–5 | null, cue }.
export function askBefore(el, { cue, suggestions }) {
  const CUE_PRESETS = cue && !suggestions.includes(cue) ? [cue, ...suggestions] : suggestions;
  el.innerHTML = `
    <div class="check">
      <p class="check__kicker">Before we start</p>
      <h2 class="check__title">How ready do you feel?</h2>
      ${scale()}
      <h3 class="check__sub">Your cue word</h3>
      <p class="check__hint">One word to come back to when it gets loud.</p>
      <div class="chips" role="radiogroup" aria-label="Cue word">
        ${CUE_PRESETS.map((w) => `<button type="button" class="chip" role="radio" data-cue="${esc(w)}">${esc(w)}</button>`).join('')}
        <button type="button" class="chip chip--custom" role="radio" data-cue="">+ My own</button>
      </div>
      <input class="check__input" type="text" maxlength="${CUE_MAX}" placeholder="Type your word"
             autocomplete="off" autocapitalize="characters" spellcheck="false" value="" hidden>
      <div class="check__actions">
        <button type="button" class="btn btn--secondary check__skip">Skip</button>
        <button type="button" class="btn btn--primary check__go">Start</button>
      </div>
    </div>`;

  const root = el.firstElementChild;
  const input = root.querySelector('.check__input');
  const customChip = root.querySelector('.chip--custom');
  let level = null;
  let word = cue;

  const markChips = () => {
    root.querySelectorAll('.chip').forEach((c) => {
      const on = c === customChip ? !CUE_PRESETS.includes(word) && word !== '' : c.dataset.cue === word;
      c.setAttribute('aria-checked', String(on));
    });
  };
  markChips();

  root.querySelector('.scale').addEventListener('click', (e) => {
    const b = e.target.closest('.scale__btn');
    if (!b) return;
    level = Number(b.dataset.level);
    root.querySelectorAll('.scale__btn').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  });

  root.querySelector('.chips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    if (c === customChip) {
      input.hidden = false;
      input.focus();
      word = cleanCue(input.value);
    } else {
      input.hidden = true;
      word = c.dataset.cue;
    }
    markChips();
  });

  input.addEventListener('input', () => {
    word = cleanCue(input.value);
    customChip.textContent = word || '+ My own';
    markChips();
  });

  return new Promise((resolve) => {
    root.querySelector('.check__go').addEventListener('click', () => resolve({ level, cue: word || cue }));
    root.querySelector('.check__skip').addEventListener('click', () => resolve({ level: null, cue: word || cue }));
  });
}

// After: one tap on the scale finishes. Resolves 1–5 or null (skipped).
export function askAfter(el, { cue }) {
  el.innerHTML = `
    <div class="check">
      <p class="check__kicker">One last thing</p>
      <h2 class="check__title">How ready do you feel now?</h2>
      ${scale()}
      ${cue ? `<p class="check__word">${esc(cue)}</p>` : ''}
      <div class="check__actions check__actions--single">
        <button type="button" class="btn btn--secondary btn--block check__skip">Skip</button>
      </div>
    </div>`;
  const root = el.firstElementChild;
  return new Promise((resolve) => {
    root.querySelector('.scale').addEventListener('click', (e) => {
      const b = e.target.closest('.scale__btn');
      if (!b) return;
      b.setAttribute('aria-checked', 'true');
      setTimeout(() => resolve(Number(b.dataset.level)), 250);   // let the tap register visually
    });
    root.querySelector('.check__skip').addEventListener('click', () => resolve(null));
  });
}
