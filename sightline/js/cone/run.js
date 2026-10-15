// Runs a MOVE drill inside the shared session engine (so it gets the pause
// button, screen wake lock, and pause-when-hidden for free). Just the drill:
// each cue full-screen, "Set 2 of 4 · Rep 7" in the top bar, and a big rest
// countdown between sets with "Too fast / Just right / Too slow" for the next
// set. No taps while cues are showing. Nothing from FOCUS runs here.

import { countdown } from '../stages/common.js';
import { tone, say, buzz } from '../lib/audio.js';
import { faceHtml, spotStyle } from './render.js';
import { COUNTDOWN_MS } from './config.js';
import { finalMs, TIMING } from './timing.js';

// The steps for one MOVE session: only the drill itself.
// tuning = { factor, pick(choice), commit() } from js/cone/ui.js; each set's
// cue times are scaled by tuning.factor when they play.
export function coneSession(plan, setup, tuning = { factor: 1, pick() {}, commit() {} }) {
  return { steps: [coneStep(plan, setup, tuning)], session: null, totalMs: plan.totalMs };
}

function coneStep(plan, setup, tuning) {
  return {
    id: 'conedrill',
    title: 'Cone Drill',
    blockId: 'cone',
    blockTitle: 'Cone Drill',
    durationMs: plan.totalMs,
    module: { run: (ctx) => runDrill(ctx, plan, setup, tuning) },
  };
}

const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

async function runDrill(ctx, plan, setup, tuning) {
  const { el, sleep, now } = ctx;
  const hud = document.getElementById('hud-block');
  const total = plan.sets.length;
  el.innerHTML = `
    <div class="cd cd--${setup.position}">
      <div class="cd__stage">${setup.position === 'peripheral' ? '<i class="cd__dot" aria-hidden="true"></i>' : ''}
        <div class="cd__cue" aria-live="assertive"></div>
      </div>
    </div>`;
  const stage = el.querySelector('.cd__stage');
  const cueEl = el.querySelector('.cd__cue');
  const blank = () => { cueEl.innerHTML = ''; cueEl.removeAttribute('style'); };
  const stats = { reps: 0, holds: 0, sets: 0 };

  for (let s = 0; s < total; s++) {
    const set = plan.sets[s];
    hud.textContent = `Set ${s + 1} of ${total} · Get ready`;
    blank();
    await countdown(ctx, stage, s ? `SET ${s + 1}` : 'GET SET');
    await sleep(COUNTDOWN_MS - 2400);

    let rep = 0;
    let holds = 0;
    const setStart = now();
    for (const e of set.events) {
      // Timed sets end on time, whatever the pace adjustments did to the reps.
      if (setup.setMode === 'timed' && now() - setStart >= setup.timedSec * 1000) break;
      if (e.type === 'go') rep++;
      else holds++;
      const interval = finalMs(e, tuning.factor);   // this cone's time, with the athlete's pace adjustment
      hud.textContent = `Set ${s + 1} of ${total} · Rep ${rep}`;
      cueEl.innerHTML = faceHtml(e.face);
      cueEl.setAttribute('style', spotStyle(e.pos));
      cueEl.classList.toggle('is-placed', !!e.pos);
      tone(e.type === 'hold' ? 330 : 880, { dur: 0.12, gain: 0.14 });
      buzz(e.type === 'hold' ? [20, 40, 20] : 30);   // cue appears
      if (setup.callouts) say(e.type === 'hold' ? 'hold' : plan.cue.speak(e.face));
      if (setup.display === 'flash') {
        const show = Math.min(setup.flashMs, interval);
        await sleep(show);
        blank();
        await sleep(interval - show);
      } else {
        await sleep(interval);
      }
    }
    blank();
    buzz([40, 60, 40]);   // set complete
    stats.reps += rep;
    stats.holds += holds;
    stats.sets++;

    if (s < total - 1) await rest(ctx, stage, plan.restMs, s + 2, total, hud, tuning);
  }
  return stats;
}

// "Too fast / Just right / Too slow": big buttons, easy to hit while breathing
// hard. Shared with the end screen (js/cone/ui.js).
const TUNE_NOTE = {
  slower: `Next set: ${Math.round(TIMING.tuneStep * 100)}% more time per rep`,
  same: 'Next set: same pace',
  faster: `Next set: ${Math.round(TIMING.tuneStep * 100)}% less time per rep`,
};
export const tuneButtons = (ask = 'How was that pace?') => `
  <div class="tune" role="radiogroup" aria-label="${ask}">
    <p class="tune__ask">${ask}</p>
    <button type="button" class="tune__btn" role="radio" data-tune="slower" aria-checked="false">Too fast</button>
    <button type="button" class="tune__btn" role="radio" data-tune="same" aria-checked="true">Just right</button>
    <button type="button" class="tune__btn" role="radio" data-tune="faster" aria-checked="false">Too slow</button>
    <p class="tune__note" aria-live="polite"></p>
  </div>`;
export function wireTune(root, onPick, notes = TUNE_NOTE) {
  root.querySelector('.tune').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tune]');
    if (!b) return;
    root.querySelectorAll('[data-tune]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    root.querySelector('.tune__note').textContent = notes[b.dataset.tune];
    buzz(20);
    onPick(b.dataset.tune);
  });
}

// Big rest countdown, with the pace question for the next set. The pause
// button stays in the top bar.
async function rest({ sleep, now }, stage, ms, next, total, hud, tuning) {
  hud.textContent = `Rest · Set ${next} of ${total} next`;
  const layer = document.createElement('div');
  layer.className = 'cd__rest';
  layer.innerHTML = `<p class="cd__rest-label">Rest</p><p class="cd__rest-time"></p>
    <p class="cd__rest-next">Set ${next} of ${total} next</p>${tuneButtons()}`;
  stage.appendChild(layer);
  const time = layer.querySelector('.cd__rest-time');
  wireTune(layer, (choice) => tuning.pick(choice));
  const end = now() + ms;
  try {
    while (now() < end) {
      time.textContent = fmt(end - now());
      if (end - now() <= 3000 && end - now() > 2750) tone(660, { dur: 0.08, gain: 0.1 });
      await sleep(Math.min(250, end - now()));
    }
  } finally {
    tuning.commit();   // the answer applies from the next set on
    layer.remove();
  }
}
