// Rehearse pillar: Visualization. One ~45-second script per session, rotated
// so recent scripts rest. Each line shows for its share of the time with a
// soft chime between lines; the athlete reads it, then pictures it.

import { howTo } from './common.js';
import { tone } from '../lib/audio.js';
import { esc } from '../lib/text.js';
import { scriptSeconds } from '../content/scripts.js';

export const visualize = {
  async run(ctx) {
    const { el, session, sleep, remaining } = ctx;
    const script = session.content.script();
    await howTo(ctx, {
      kicker: 'Rehearse',
      title: 'Visualization',
      rule: 'Read each line, then close your eyes and picture it. A soft chime means the next line is ready.',
    });

    el.innerHTML = `
      <div class="viz">
        <p class="viz__theme">${esc(script.theme)} · ${esc(script.title)}</p>
        <p class="viz__line" aria-live="polite"></p>
        <div class="viz__dots" aria-hidden="true">${script.lines.map(() => '<i></i>').join('')}</div>
      </div>`;
    const lineEl = el.querySelector('.viz__line');
    const dots = [...el.querySelectorAll('.viz__dots i')];

    // Stretch or squeeze the script to fill this drill's slot exactly.
    const scale = remaining() / (scriptSeconds(script) * 1000);
    for (const [i, [text, sec]] of script.lines.entries()) {
      lineEl.textContent = text;
      dots.forEach((d, j) => d.classList.toggle('is-on', j <= i));
      if (i) tone(587, { toFreq: 784, dur: 0.5, gain: 0.06 });
      await sleep(Math.min(Math.max(0, remaining()), sec * 1000 * scale));
    }
    await sleep(Math.max(0, remaining()));
    return { script: script.id };
  },
};
