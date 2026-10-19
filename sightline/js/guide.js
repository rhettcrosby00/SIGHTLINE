// "How it works" (About): the two sides and Game Ready, panel by panel. The first-time
// setup (sport, name, home screen) is js/onboarding.js (6.5).

import { icon } from './lib/icons.js';

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
