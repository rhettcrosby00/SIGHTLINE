// First-run setup (about 30 seconds, skippable at every step) and "How it
// works" (About). The setup shows once on a phone, then never again:
//   1. The two sides, in one line each.
//   2. Sport (and position) plus a cue word: shapes visualization and Lock In.
//   3. A name or initials for the leaderboard (optional), so scores save on
//      their own after every session.
// Everything it asks can be changed later in Settings.

import { icon } from './lib/icons.js';
import { SPORTS, sportById, SKILL_WORDS, cleanSport } from './content/sports.js';
import { CUE_WORDS, CUE_MAX, cleanCue } from './content/cues.js';
import { lastName } from './score/board.js';
import { cleanName, nameProblem } from './score/names.js';
import { esc } from './lib/text.js';

function overlay(label) {
  const el = document.createElement('div');
  el.className = 'guide';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', label);
  document.body.appendChild(el);
  return el;
}

const card = ({ step, of, title, body, back = 'Skip', next = 'Next' }) => `
  <div class="guide__card">
    <p class="guide__step">${step} of ${of}</p>
    <h2 class="guide__title">${title}</h2>
    <div class="guide__body">${body}</div>
    <div class="guide__nav">
      <button type="button" class="btn btn--secondary guide__skip">${back}</button>
      <button type="button" class="btn btn--primary guide__next">${next}</button>
    </div>
  </div>`;

const SIDES = `
  <div class="guide__modes">
    <div data-side="focus"><p class="side-tag">${icon('eye', { size: 18 })}Focus · Eyes, mind, breath</p>
      <p><b>Hold your phone.</b> Breathing, eye and brain drills. Every answer is a tap. Locker room, bus, sideline.</p></div>
    <div data-side="move"><p class="side-tag">${icon('move', { size: 18 })}Move · React, cut, compete</p>
      <p><b>Set your phone down</b> facing you. Big signals tell you which way to cut. On the field.</p></div>
  </div>
  <p class="guide__muted">Each side has three presets: Quick, Standard and Game Speed. Two taps and you’re going.</p>`;

// getSettings / updateSetting from js/settings.js; onDone() when finished or skipped.
export function showFirstRun({ getSettings, updateSetting, onDone = () => {} }) {
  const el = overlay('Set up Sightrep');
  const s = getSettings();
  const pick = { sport: s.sport, position: s.position, cue: s.cue, name: lastName.get() };
  let step = 1;
  const finish = () => {
    const { sport, position } = cleanSport(pick.sport, pick.position);
    updateSetting('sport', sport);
    updateSetting('position', position);
    updateSetting('sportAsked', true);
    updateSetting('cue', cleanCue(pick.cue) || s.cue);
    updateSetting('setupDone', true);
    el.remove();
    onDone();
  };
  const skip = () => { updateSetting('setupDone', true); el.remove(); onDone(); };

  const render = () => {
    if (step === 1) {
      el.innerHTML = card({ step: 1, of: 3, title: 'Welcome to Sightrep', body: `${SIDES}
        <p class="guide__muted">Three quick questions (about 30 seconds), all changeable later in Settings.</p>`, next: 'Set up' });
    } else if (step === 2) {
      const sp = sportById[pick.sport] ?? sportById.general;
      const words = [...new Set([...(SKILL_WORDS[sp.id] ?? []).slice(0, 3), ...CUE_WORDS.slice(0, 3)])];
      el.innerHTML = card({ step: 2, of: 3, title: 'Your sport and cue word', body: `
        <label class="setting__label" for="fr-sport">What do you play?</label>
        <select id="fr-sport" class="lb-select" data-pick="sport">
          ${SPORTS.map((x) => `<option value="${x.id}"${x.id === sp.id ? ' selected' : ''}>${x.label}</option>`).join('')}
        </select>
        ${sp.positions.length ? `<select class="lb-select" data-pick="position" aria-label="Position">
          <option value="">Position (any)</option>
          ${sp.positions.map(([id, label]) => `<option value="${id}"${id === pick.position ? ' selected' : ''}>${label}</option>`).join('')}
        </select>` : ''}
        <p class="setting__label">Your cue word</p>
        <p class="guide__muted">One or two words you say to yourself before you compete.</p>
        <div class="chips" role="radiogroup" aria-label="Cue words">
          ${words.map((w) => `<button type="button" class="chip" role="radio" data-cue="${esc(w)}" aria-checked="${w === pick.cue}">${esc(w)}</button>`).join('')}
        </div>
        <input class="lbn__input" data-pick="cue" type="text" maxlength="${CUE_MAX}" placeholder="Or type your own" value="${words.includes(pick.cue) ? '' : esc(pick.cue)}"
          autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Your own cue word">` });
    } else {
      el.innerHTML = card({ step: 3, of: 3, title: 'Your leaderboard name', next: 'Done', back: 'Skip', body: `
        <p class="guide__muted">Scores then save on their own after every session. Up to 12 characters, or leave it empty to stay off the board.</p>
        <input class="lbn__input" data-pick="name" type="text" maxlength="12" value="${esc(pick.name)}" autocomplete="off" autocorrect="off"
          spellcheck="false" autocapitalize="words" enterkeyhint="done" aria-label="Your name">
        <p class="lbn__hint" aria-live="polite"></p>
        <p class="caption">Your name and scores will be visible on the leaderboard.</p>` });
    }
    el.querySelector('.guide__skip').onclick = step === 3 ? finish : skip;
    el.querySelector('.guide__next').onclick = () => {
      if (step < 3) { step++; return render(); }
      const typed = el.querySelector('[data-pick="name"]').value.trim();
      if (typed) {
        const problem = nameProblem(typed);
        if (problem) { const h = el.querySelector('.lbn__hint'); h.className = 'lbn__hint is-bad'; h.textContent = problem; return; }
        lastName.set(cleanName(typed));
      }
      finish();
    };
    el.querySelector('.guide__next').focus();
  };

  el.addEventListener('change', (e) => {
    const k = e.target.dataset.pick;
    if (k === 'sport') { pick.sport = e.target.value; pick.position = ''; render(); }
    if (k === 'position') pick.position = e.target.value;
  });
  el.addEventListener('input', (e) => {
    if (e.target.dataset.pick !== 'cue') return;
    pick.cue = cleanCue(e.target.value) || pick.cue;
    el.querySelectorAll('[data-cue]').forEach((c) => c.setAttribute('aria-checked', 'false'));
  });
  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cue]');
    if (!c) return;
    pick.cue = c.dataset.cue;
    el.querySelectorAll('[data-cue]').forEach((x) => x.setAttribute('aria-checked', String(x === c)));
    const input = el.querySelector('[data-pick="cue"]');
    if (input) input.value = '';
  });
  render();
}

// ---- How it works (About) ----------------------------------------------------
const PANELS = [
  { title: 'Two sides, one warm-up', body: SIDES },
  {
    title: 'Focus: Game Ready',
    body: `
      <ol class="guide__blocks">
        <li><b>Regulate</b><span>Breathe with the circle to calm down and focus.</span></li>
        <li><b>Activate</b><span>Follow, jump and hold with your eyes.</span></li>
        <li><b>Challenge</b><span>React to colors. Go, or hold still.</span></li>
        <li><b>Rehearse</b><span>Your cue word, your best play, then your routine.</span></li>
      </ol>
      <p class="guide__muted">Game Day: 5 or 8 minutes. On other days, Training (10–15 minutes) adds the visual skills. Tap Flat, Ready or Wired first and the breathing matches how you feel.</p>`,
  },
  {
    title: 'Move: set the phone down',
    body: `
      <p>Tap a preset, then stand the phone up facing you. A countdown gives you time to get to your start spot.</p>
      <p>During a set the screen ignores taps. To pause, hold a finger on it for a second.</p>
      <p class="guide__muted">Turn your brightness all the way up outdoors. Colors, arrows and numbers fill the screen so you can read them from far away.</p>`,
  },
];

export function showGuide() {
  const el = overlay('How Sightrep works');
  let i = 0;
  const render = () => {
    const last = i === PANELS.length - 1;
    el.innerHTML = card({ step: i + 1, of: PANELS.length, title: PANELS[i].title, body: PANELS[i].body, back: last ? 'Back' : 'Skip', next: last ? 'Got it' : 'Next' });
    el.querySelector('.guide__next').onclick = () => (last ? el.remove() : (i++, render()));
    el.querySelector('.guide__skip').onclick = () => (last ? (i--, render()) : el.remove());
    el.querySelector('.guide__next').focus();
  };
  render();
}
