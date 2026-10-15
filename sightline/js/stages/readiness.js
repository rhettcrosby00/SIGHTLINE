// Readiness check-in: "How do you feel right now?" Flat · Ready · Wired, one
// tap, and the session adapts (js/plan.js). Asked again at the end; the
// before → after shows on the summary only. Nothing is saved. It's a
// self-check, not a measurement.
// The cue word sits on the same screen: skill words for the athlete's sport
// ("Eyes up") and energy words ("Attack"), or their own.

import { CUE_MAX, cleanCue } from '../content/cues.js';
import { sportById } from '../content/sports.js';
import { esc } from '../lib/text.js';

export const STATE_LABELS = {
  flat: { name: 'Flat', hint: 'Low energy, sluggish' },
  ready: { name: 'Ready', hint: 'Good to go' },
  wired: { name: 'Wired', hint: 'Amped up or nervous' },
};

const states = () => `
  <div class="feel" role="group" aria-label="How do you feel?">
    ${Object.entries(STATE_LABELS).map(([id, s]) => `
      <button type="button" class="feel__btn feel__btn--${id}" data-state="${id}">
        <b>${s.name}</b><span>${s.hint}</span>
      </button>`).join('')}
  </div>`;

const chips = (words, word) => words.map((w) => `<button type="button" class="chip" role="radio" data-cue="${esc(w)}" aria-checked="${w === word}">${esc(w)}</button>`).join('');

// Before: one tap on how you feel starts the session. The cue word can be
// changed first. Resolves { state, cue }; Skip counts as Ready.
// Optional sport question (first time only): resolves sport too.
export function askBefore(el, { cue, skill = [], energy = [], askSport = false, sport = 'general', position = '' }) {
  let word = cue;
  el.innerHTML = `
    <div class="check">
      <p class="check__kicker">Before we start</p>
      <h2 class="check__title">How do you feel right now?</h2>
      ${states()}
      <button type="button" class="check__cue" aria-expanded="false">
        <span>Your cue word</span><b class="check__word-now">${esc(word)}</b><span class="check__change">Change</span>
      </button>
      <div class="check__cues" hidden>
        <p class="check__hint">For skill</p>
        <div class="chips" role="radiogroup" aria-label="Skill cue words">${chips(skill, word)}</div>
        <p class="check__hint">For energy</p>
        <div class="chips" role="radiogroup" aria-label="Energy cue words">${chips(energy, word)}</div>
        <input class="check__input" type="text" maxlength="${CUE_MAX}" placeholder="Or type your own"
               autocomplete="off" autocapitalize="characters" spellcheck="false" value="">
      </div>
      ${askSport ? `
      <div class="check__sport">
        <p class="check__hint">What do you play? (asked once, for your visualization and cue words)</p>
        <select class="lb-select" data-pick="sport" aria-label="Sport">
          ${Object.values(sportById).map((s) => `<option value="${s.id}"${s.id === sport ? ' selected' : ''}>${s.label}</option>`).join('')}
        </select>
        <select class="lb-select" data-pick="position" aria-label="Position" hidden></select>
      </div>` : ''}
      <button type="button" class="link-btn check__skip">Skip</button>
    </div>`;

  const root = el.firstElementChild;
  const now = root.querySelector('.check__word-now');
  const panel = root.querySelector('.check__cues');
  const input = root.querySelector('.check__input');
  let pick = { sport, position };

  const mark = () => {
    root.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-checked', String(c.dataset.cue === word)));
    now.textContent = word;
  };
  root.querySelector('.check__cue').addEventListener('click', (e) => {
    panel.hidden = !panel.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
  });
  panel.addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    word = c.dataset.cue;
    input.value = '';
    mark();
  });
  input.addEventListener('input', () => {
    word = cleanCue(input.value) || cue;
    mark();
  });

  if (askSport) {
    const sportSel = root.querySelector('[data-pick="sport"]');
    const posSel = root.querySelector('[data-pick="position"]');
    const fillPositions = () => {
      const list = sportById[pick.sport].positions;
      posSel.hidden = !list.length;
      posSel.innerHTML = `<option value="">Position (any)</option>${list.map(([id, label]) => `<option value="${id}"${id === pick.position ? ' selected' : ''}>${label}</option>`).join('')}`;
    };
    sportSel.addEventListener('change', () => { pick = { sport: sportSel.value, position: '' }; fillPositions(); });
    posSel.addEventListener('change', () => { pick.position = posSel.value; });
    fillPositions();
  }

  return new Promise((resolve) => {
    root.querySelector('.feel').addEventListener('click', (e) => {
      const b = e.target.closest('[data-state]');
      if (!b) return;
      b.classList.add('is-picked');
      setTimeout(() => resolve({ state: b.dataset.state, cue: word || cue, ...pick }), 180);   // let the tap register
    });
    root.querySelector('.check__skip').addEventListener('click', () => resolve({ state: 'ready', cue: word || cue, ...pick, skipped: true }));
  });
}

// After: one tap finishes. Resolves 'flat' | 'ready' | 'wired', or null (skipped).
export function askAfter(el, { cue }) {
  el.innerHTML = `
    <div class="check">
      <p class="check__kicker">One last thing</p>
      <h2 class="check__title">How do you feel now?</h2>
      ${states()}
      ${cue ? `<p class="check__word">${esc(cue)}</p>` : ''}
      <button type="button" class="link-btn check__skip">Skip</button>
    </div>`;
  const root = el.firstElementChild;
  return new Promise((resolve) => {
    root.querySelector('.feel').addEventListener('click', (e) => {
      const b = e.target.closest('[data-state]');
      if (!b) return;
      b.classList.add('is-picked');
      setTimeout(() => resolve(b.dataset.state), 180);
    });
    root.querySelector('.check__skip').addEventListener('click', () => resolve(null));
  });
}
