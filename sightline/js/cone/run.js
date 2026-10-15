// Runs a Cone Drill session inside the shared session engine (so it gets the
// pause button, screen wake lock, and pause-when-hidden for free):
//   1. Settle — the same box-breathing drill that opens Game Ready (1 min)
//   2. The Cone Drill — each cue full-screen, "Set 2 of 4 · Rep 7" in the top
//      bar, and a big rest countdown between sets (tap anywhere to pause).
// Nothing else from Game Ready runs.

import { countdown } from '../stages/common.js';
import { settle } from '../stages/breathe.js';
import { tone, say } from '../lib/audio.js';
import { createRng } from '../lib/rng.js';
import { breathingText } from '../content/breathing.js';
import { faceHtml, spotStyle } from './render.js';
import { COUNTDOWN_MS } from './config.js';

export const SETTLE_MS = 60_000;

// The steps for one Cone Drill session, plus the bit of session content the
// breathing drill needs (its rotating wording).
export function coneSession(plan, setup) {
  return {
    steps: [
      { id: 'settle', title: 'Settle', blockId: 'regulate', blockTitle: 'Settle', durationMs: SETTLE_MS, module: settle },
      coneStep(plan, setup),
    ],
    session: { content: { breathing: breathingText(createRng(plan.seed).fork('breathing')) } },
    totalMs: SETTLE_MS + plan.totalMs,
  };
}

export function coneStep(plan, setup) {
  return {
    id: 'conedrill',
    title: 'Cone Drill',
    blockId: 'cone',
    blockTitle: 'Cone Drill',
    durationMs: plan.totalMs,
    module: { run: (ctx) => runDrill(ctx, plan, setup) },
  };
}

const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

async function runDrill(ctx, plan, setup) {
  const { el, sleep } = ctx;
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
    for (const e of set.events) {
      if (e.type === 'go') rep++;
      hud.textContent = `Set ${s + 1} of ${total} · Rep ${rep}`;
      cueEl.innerHTML = faceHtml(e.face);
      cueEl.setAttribute('style', spotStyle(e.pos));
      cueEl.classList.toggle('is-placed', !!e.pos);
      tone(e.type === 'hold' ? 330 : 880, { dur: 0.12, gain: 0.14 });
      if (setup.callouts) say(e.type === 'hold' ? 'hold' : plan.cue.speak(e.face));
      if (setup.display === 'flash') {
        const show = Math.min(setup.flashMs, e.interval);
        await sleep(show);
        blank();
        await sleep(e.interval - show);
      } else {
        await sleep(e.interval);
      }
    }
    blank();
    stats.reps += set.reps;
    stats.holds += set.holds;
    stats.sets++;

    if (s < total - 1) await rest(ctx, stage, plan.restMs, s + 2, total, hud);
  }
  return stats;
}

// Big rest countdown. Tapping anywhere pauses (the engine's pause screen).
async function rest({ sleep, now }, stage, ms, next, total, hud) {
  hud.textContent = `Rest · Set ${next} of ${total} next`;
  const layer = document.createElement('div');
  layer.className = 'cd__rest';
  layer.innerHTML = `<p class="cd__rest-label">REST</p><p class="cd__rest-time"></p>
    <p class="cd__rest-next">Set ${next} of ${total} next</p><p class="cd__rest-tip">Tap anywhere to pause</p>`;
  stage.appendChild(layer);
  const time = layer.querySelector('.cd__rest-time');
  const onTap = () => document.getElementById('btn-pause')?.click();
  layer.addEventListener('click', onTap);
  const end = now() + ms;
  try {
    while (now() < end) {
      time.textContent = fmt(end - now());
      if (end - now() <= 3000 && end - now() > 2750) tone(660, { dur: 0.08, gain: 0.1 });
      await sleep(Math.min(250, end - now()));
    }
  } finally {
    layer.remove();
  }
}
