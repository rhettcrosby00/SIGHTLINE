// Runs a MOVE drill inside the shared session engine (so it gets the touch
// lock, hold-to-pause, screen wake lock, and pause-when-hidden for free). Just
// the drill: a spoken get-set countdown (5–10 s, Settings) so there's time to
// set the phone down, each cue full-screen, "Set 2 of 4 · Rep 7" in the top
// bar, and a big rest countdown between sets with "Too fast / Just right / Too
// slow" for the next set. Rest never waits for a tap: the next set starts on
// its own. No taps while cues are showing. Nothing from FOCUS runs here.
// Two-cue decisions show both cues briefly, then clear (it's a memory task).
// Planned drills show GO for the run, then a walk-back countdown.

import { tone, say, buzz, cues } from '../lib/audio.js';
import { faceHtml, spotStyle } from './render.js';
import { countdownMs } from './config.js';
import { finalMs, plannedMs, TIMING } from './timing.js';

const PAIR_SHOW_MS = 1500;   // two cues stay up this long, then it's from memory

// What the phone says (Spoken callouts). Decision cues say the decision, not the answer.
function callout(face, cue) {
  if (face.nogo || face.kind === 'hold') return 'hold';
  if (face.kind === 'parity') return String(face.num);
  if (face.kind === 'stroop') return '';
  if (face.kind === 'pair') return 'two';
  if (face.kind === 'planned') return 'go';
  if (face.opposite) return 'opposite';
  return cue.speak(face);
}

// The steps for one MOVE session: only the drill itself.
// tuning = { factor, pick(choice), commit() } from js/cone/ui.js; each set's
// cue times are scaled by tuning.factor when they play. `stats` fills in as
// sets finish, so a drill stopped early still knows its completed sets.
export function coneSession(plan, setup, tuning = { factor: 1, pick() {}, commit() {} }, stats = { reps: 0, holds: 0, sets: 0 }) {
  return { steps: [coneStep(plan, setup, tuning, stats)], session: null, totalMs: plan.totalMs };
}

function coneStep(plan, setup, tuning, stats) {
  return {
    id: 'conedrill',
    title: 'Cone Drill',
    blockId: 'cone',
    blockTitle: 'Cone Drill',
    durationMs: plan.totalMs,
    module: { run: (ctx) => runDrill(ctx, plan, setup, tuning, stats) },
  };
}

const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

async function runDrill(ctx, plan, setup, tuning, stats) {
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

  for (let s = 0; s < total; s++) {
    const set = plan.sets[s];
    hud.textContent = `Set ${s + 1} of ${total} · Get ready`;
    blank();
    await getSet(ctx, stage, countdownMs(setup, s), s ? { label: `SET ${s + 1}` }
      : { label: 'GET SET', note: 'Set your phone down facing you. Brightness all the way up.' });

    let rep = 0;
    let holds = 0;
    const setStart = now();
    for (const e of set.events) {
      // Timed sets end on time, whatever the pace adjustments did to the reps.
      if (setup.setMode === 'timed' && now() - setStart >= setup.timedSec * 1000) break;
      if (e.type === 'go') rep += e.keys?.length ?? 1;
      else holds++;
      // This cone's time, with the athlete's pace adjustment.
      const interval = e.face.kind === 'planned' ? plannedMs(e, tuning.factor) : finalMs(e, tuning.factor);
      hud.textContent = `Set ${s + 1} of ${total} · Rep ${rep}`;
      cueEl.innerHTML = faceHtml(e.face);
      cueEl.setAttribute('style', spotStyle(e.pos));
      cueEl.classList.toggle('is-placed', !!e.pos);
      tone(e.type === 'hold' ? 330 : 880, { dur: 0.12, gain: 0.14 });
      buzz(e.type === 'hold' ? [20, 40, 20] : 30);   // cue appears
      const words = setup.callouts ? callout(e.face, plan.cue) : '';
      if (words) say(words);
      if (e.face.kind === 'planned') {
        // Run, then walk back: the seconds count down, with a tick for the last 3.
        await sleep(e.runMs);
        const end = now() + interval - e.runMs;
        while (now() < end) {
          const secs = Math.ceil((end - now()) / 1000);
          cueEl.innerHTML = faceHtml({ kind: 'recover', secs });
          if (secs <= 3) tone(660, { dur: 0.06, gain: 0.1 });
          await sleep(Math.min(1000, end - now()) || 1);
        }
      } else if (setup.display === 'flash' || e.keys) {
        const show = Math.min(e.keys ? PAIR_SHOW_MS : setup.flashMs, interval);
        await sleep(show);
        blank();
        await sleep(interval - show);
      } else {
        await sleep(interval);
      }
    }
    blank();
    cues.done();   // set complete: two notes (and a buzz where the phone allows)
    stats.reps += rep;
    stats.holds += holds;
    stats.sets++;

    if (s < total - 1) await rest(ctx, stage, plan.restMs, s + 2, total, hud, tuning);
  }
  return stats;
}

// The countdown before a set, one number a second (the last ones spoken when
// the phone may talk), then GO. The first set's is 5–10 s; later sets get 3.
async function getSet({ sleep }, box, ms, { label, note = '' }) {
  const layer = document.createElement('div');
  layer.className = 'count count--move';
  layer.innerHTML = `<p class="count__label">${label}</p><p class="count__num"></p>${note ? `<p class="count__note">${note}</p>` : ''}`;
  box.appendChild(layer);
  const num = layer.querySelector('.count__num');
  try {
    const secs = Math.max(1, Math.round(ms / 1000));
    for (let n = secs; n >= 1; n--) {
      num.textContent = n;
      tone(587, { dur: 0.09, gain: 0.1 });
      say(String(n));
      await sleep(1000);
    }
    tone(880, { dur: 0.16, gain: 0.14 });
  } finally {
    layer.remove();
  }
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
    buzz(20);   // the picked button lights up on screen too
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
    <p class="cd__rest-next">Set ${next} of ${total} starts on its own</p>${tuneButtons()}`;
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
