// "How Sightline works": three short panels shown on first launch (and once
// more after the v2.0 update, which split the app into FOCUS and MOVE) and
// from About → How it works. Only a seen-flag is stored.

import { icon } from './lib/icons.js';

const SEEN_KEY = 'sightline.guideSeen.v2';

const PANELS = [
  {
    title: 'Two sides, one warm-up',
    body: `
      <div class="guide__modes">
        <div data-side="focus"><p class="side-tag">${icon('eye', { size: 18 })}Focus · Eyes, mind, breath</p>
          <p><b>Hold your phone.</b> Breathing, eye and brain drills. Every answer is a tap. Locker room, bus, sideline.</p></div>
        <div data-side="move"><p class="side-tag">${icon('move', { size: 18 })}Move · React, cut, compete</p>
          <p><b>Set your phone down</b> facing you, 10–20 yards away. React to the signal and cut to the right spot. On the field.</p></div>
      </div>`,
  },
  {
    title: 'Focus: Game Ready',
    body: `
      <ol class="guide__blocks">
        <li><b>Regulate</b><span>Breathe with the circle to calm down and focus.</span></li>
        <li><b>Activate</b><span>Follow, jump and hold with your eyes.</span></li>
        <li><b>Challenge</b><span>React to colors, quick math and quick questions.</span></li>
        <li><b>Rehearse</b><span>Your cue word, your best play, then lock in.</span></li>
      </ol>
      <p class="guide__muted">Short on time? Run one part on its own.</p>`,
  },
  {
    title: 'Every drill teaches you first',
    body: `
      <p>Before each Focus drill you’ll see the rule, a quick example, and a short practice. Then it’s for real.</p>
      <p>At the end you’ll see your <b>accuracy</b> and <b>reaction time</b> in seconds — lower is faster.</p>
      <p class="guide__muted">Nothing is saved. It’s a warm-up, not a medical test.</p>`,
  },
];

export function guideSeen() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}

export function showGuide() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
  const overlay = document.createElement('div');
  overlay.className = 'guide';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'How Sightline works');
  document.body.appendChild(overlay);

  let i = 0;
  const close = () => overlay.remove();
  const render = () => {
    const p = PANELS[i];
    const last = i === PANELS.length - 1;
    overlay.innerHTML = `
      <div class="guide__card">
        <p class="guide__step">${i + 1} of ${PANELS.length}</p>
        <h2 class="guide__title">${p.title}</h2>
        <div class="guide__body">${p.body}</div>
        <div class="guide__nav">
          <button type="button" class="btn btn--secondary guide__skip">${last ? 'Back' : 'Skip'}</button>
          <button type="button" class="btn btn--primary guide__next">${last ? 'Got it' : 'Next'}</button>
        </div>
      </div>`;
    overlay.querySelector('.guide__next').onclick = () => (last ? close() : (i++, render()));
    overlay.querySelector('.guide__skip').onclick = () => (last ? (i--, render()) : close());
    overlay.querySelector('.guide__next').focus();
  };
  render();
}
