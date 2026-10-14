// Shared pieces for drills.

import { cues } from '../lib/audio.js';

export const INTRO_MS = 4000;

// Title card shown before a drill: name, one or two instruction lines, and a
// 3-2-1 countdown. Takes INTRO_MS out of the drill's slot.
export async function intro({ el, sleep }, { kicker, title, lines }) {
  el.innerHTML = `
    <div class="intro">
      <p class="intro__kicker">${kicker}</p>
      <h2 class="intro__title">${title}</h2>
      ${lines.map((l) => `<p class="intro__line">${l}</p>`).join('')}
      <p class="intro__count" aria-hidden="true"></p>
    </div>`;
  const count = el.querySelector('.intro__count');
  await sleep(INTRO_MS - 3000);
  for (const n of [3, 2, 1]) {
    count.textContent = n;
    cues.tick();
    await sleep(1000);
  }
  cues.go();
  el.innerHTML = '';
}

// Runs `frame(t)` on every animation frame until stopped; t is the step clock.
export function animate(now, frame) {
  let raf = requestAnimationFrame(function loop() {
    frame(now());
    raf = requestAnimationFrame(loop);
  });
  return () => cancelAnimationFrame(raf);
}
