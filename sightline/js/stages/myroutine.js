// My Routine, as a drill: stand still → one breath → imagery line → cue word
// → quiet eye → GO. Every part is timed from the routine's start, so it never
// drifts. Nothing to answer, so it can't be failed: Game Ready ends here.

import { play, oneBreath } from './breathe.js';
import { routineParts } from '../myroutine.js';
import { cues, buzz } from '../lib/audio.js';
import { esc } from '../lib/text.js';

const SEC = 1000;

export const myRoutine = {
  async run(ctx) {
    const { el, settings, session, sleep, now, remaining } = ctx;
    const r = session.content.routine;
    const parts = routineParts(r);
    const word = esc(settings.cue || 'COMPETE');
    const start = now();
    let at = 0;   // seconds into the routine
    const until = async (sec) => { at += sec; await sleep(Math.max(0, start + at * SEC - now())); };
    const card = (kicker, big, sub = '') => {
      el.innerHTML = `
        <div class="mr">
          <p class="mr__kicker">${kicker}</p>
          <p class="mr__big">${big}</p>
          ${sub ? `<p class="mr__sub">${sub}</p>` : ''}
        </div>`;
    };

    card('My Routine', 'Stand still', 'Here we go.');
    await until(parts.still);

    await play(ctx, oneBreath(r.breath), 'settle');
    at += parts.breath;
    await sleep(Math.max(0, start + at * SEC - now()));

    if (parts.imagery) {
      card('See it', esc(r.imagery));
      await until(parts.imagery);
    }

    card('Your word', word, 'Say it to yourself.');
    cues.hold();
    await until(parts.cue);

    // Quiet eye: one still point, eyes locked on it until the ring closes.
    el.innerHTML = `
      <div class="mr mr--qe">
        <p class="mr__kicker">Quiet eye</p>
        <div class="qe" aria-hidden="true">
          <svg class="qe__ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" style="animation-duration:${parts.quietEye}s"/></svg>
          <span class="qe__dot"></span>
        </div>
        <p class="mr__sub">Eyes still on the dot.</p>
      </div>`;
    await until(parts.quietEye);

    card('', 'GO');
    el.querySelector('.mr').classList.add('mr--go');
    cues.go();
    buzz([90, 60, 90]);
    await until(parts.go);
    await sleep(Math.max(0, remaining()));   // fill the slot exactly
    return {};
  },
};
