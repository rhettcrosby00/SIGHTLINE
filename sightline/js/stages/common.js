// Shared pieces for drills: the how-to card, the 3-2-1 countdown, and the
// small looping examples that show what a correct answer looks like.

import { cues } from '../lib/audio.js';
import { CUES, cueById } from '../lib/colors.js';

const CONE_HOWTO_MS = 8000;   // Cone mode can't tap "ready" from 15 ft away
const BRIEF_MS = 3500;        // Instructions: Brief shows just the rule

// How-to card shown before every drill. Runs inside hold(), so reading it
// never eats into drill time.
//   Full (default): rule + looping example. Tap mode waits for I'M READY;
//   Cone mode shows it for 8 s. Brief: the rule for 3.5 s.
export async function howTo(ctx, { kicker, title, rule, demo }) {
  const { el, settings, sleep, hold, ready } = ctx;
  const cone = settings.mode === 'cones';
  const full = settings.guide !== 'brief';
  const waitTap = full && !cone;

  await hold(async () => {
    el.innerHTML = `
      <div class="howto ${cone ? 'howto--cone' : ''}">
        <p class="howto__kicker">${kicker}</p>
        <h2 class="howto__title">${title}</h2>
        <p class="howto__rule">${rule}</p>
        ${full && demo ? '<div class="howto__demo" aria-hidden="true"></div>' : ''}
        ${waitTap
          ? '<button type="button" class="btn btn--primary btn--block btn--big btn-ready">Ready</button>'
          : '<p class="howto__soon">Starting in a moment…</p>'}
      </div>`;
    const stop = full && demo ? playDemo(el.querySelector('.howto__demo'), demo, cone) : () => {};
    try {
      if (waitTap) await ready(el.querySelector('.btn-ready'));
      else await sleep(full ? CONE_HOWTO_MS : BRIEF_MS);
    } finally {
      stop();
    }
  });
}

// Big 3-2-1 with a label ("GET SET", "NOW FOR REAL"), drawn over `box`.
export async function countdown({ sleep }, box, label) {
  const layer = document.createElement('div');
  layer.className = 'count';
  layer.innerHTML = `<p class="count__label">${label}</p><p class="count__num"></p>`;
  box.appendChild(layer);
  const num = layer.querySelector('.count__num');
  try {
    for (const n of [3, 2, 1]) {
      num.textContent = n;
      cues.tick();
      await sleep(800);
    }
    cues.go();
  } finally {
    layer.remove();
  }
}

// Runs `frame(t)` on every animation frame until stopped; t is the step clock.
export function animate(now, frame) {
  let raf = requestAnimationFrame(function loop() {
    frame(now());
    raf = requestAnimationFrame(loop);
  });
  return () => cancelAnimationFrame(raf);
}

// ---- Looping examples ----------------------------------------------------------
// demo = { html } for a custom CSS animation, or
// demo = { pad, frames: [{ cue, answer, caption, buttons? }], coneFrames? }
//   pad: 'colors' | 'oddeven' | 'list' | 'anywhere' (matches the real drill)
//   answer: a cue id, 'any' (tap anywhere) or null (hold / freeze)
// Each frame shows the mini cue, then "taps" the right answer a beat later.

const FRAME_MS = 3000;
const TAP_AT_MS = 1100;

const miniBtn = (c, label, answer) =>
  `<span class="mini__btn ${c.id === answer ? 'is-answer' : ''}" style="--c:${c.hex};--ink:${c.ink}">
     <b>${c.shape}</b>${label}</span>`;

function tapFrame(f, pad) {
  let padHtml = '';
  if (pad === 'colors') {
    padHtml = ['green', 'red', 'blue', 'yellow'].map((id) => miniBtn(cueById[id], cueById[id].label, f.answer)).join('');
  } else if (pad === 'oddeven') {
    padHtml = miniBtn(cueById.blue, 'ODD', f.answer) + miniBtn(cueById.red, 'EVEN', f.answer);
  } else if (pad === 'list') {
    padHtml = f.buttons.map((b) => miniBtn(cueById[b.id], b.label, f.answer)).join('');
  }
  const cueCls = f.answer === 'any' ? 'is-answer' : f.answer === null ? 'is-answer is-hold' : '';
  return `
    <div class="mini">
      <div class="mini__phone">
        <div class="mini__cue ${cueCls}">${f.cue}</div>
        ${padHtml ? `<div class="mini__pad mini__pad--${pad}">${padHtml}</div>` : ''}
      </div>
      <p class="mini__cap">${f.caption}</p>
    </div>`;
}

function coneFrame(f) {
  const cones = CUES.map((c) => `
    <span class="mini__cone mini__cone--${c.dir} ${c.id === f.answer ? 'is-answer' : ''}" style="--c:${c.hex}">${c.shape}</span>`).join('');
  return `
    <div class="mini mini--cone">
      <div class="mini__phone mini__phone--stand"><div class="mini__cue">${f.cue}</div></div>
      <div class="mini__field">
        ${cones}
        <span class="mini__you ${f.answer === null ? 'is-answer is-hold' : ''}">YOU</span>
      </div>
      <p class="mini__cap">${f.caption}</p>
    </div>`;
}

export function playDemo(box, demo, cone) {
  if (demo.html) { box.innerHTML = demo.html; return () => {}; }
  const frames = (cone && demo.coneFrames) || demo.frames;
  let i = 0;
  let tapTimer = 0;
  const show = () => {
    const f = frames[i++ % frames.length];
    box.innerHTML = cone ? coneFrame(f) : tapFrame(f, demo.pad);
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => box.querySelectorAll('.is-answer').forEach((n) => n.classList.add('is-tapped')), TAP_AT_MS);
  };
  show();
  const iv = setInterval(show, FRAME_MS);
  return () => { clearInterval(iv); clearTimeout(tapTimer); };
}

// Mini cue faces for examples.
export const mini = {
  fill: (id, inner) => { const c = cueById[id]; return `<span class="mc mc--fill" style="--c:${c.hex};--ink:${c.ink}">${inner ?? c.shape}</span>`; },
  arrow: (glyph) => `<span class="mc mc--arrow">${glyph}</span>`,
  word: (word, inkId) => `<span class="mc mc--word" style="--c:${cueById[inkId].hex}">${word}</span>`,
  periph: (id, side) => { const c = cueById[id]; return `<span class="mc mc--periph"><i class="mc__dot"></i><i class="mc__flash mc__flash--${side}" style="--c:${c.hex};--ink:${c.ink}">${c.shape}</i></span>`; },
  text: (t) => `<span class="mc mc--text">${t}</span>`,
};
