// Breathing screens: Settle (box breathing) and Lock In (energizing breaths
// + one steady finishing breath). A circle grows and shrinks with each phase;
// the phase word and countdown are sized to read from 10–15 ft in Cone mode.

import { cues } from '../lib/audio.js';
import { esc } from '../lib/text.js';

const SEC = 1000;
const SMALL = 0.42;   // circle scale at empty lungs
const BIG = 1;        // circle scale at full lungs

const ease = (t) => 0.5 - Math.cos(Math.PI * t) / 2;   // ease-in-out

// ---- Timelines -------------------------------------------------------------
// Each phase: { word, sub, ms, from, to, cue, count, showWord? }
//   count: 'secs' shows seconds left in the phase; a string shows as-is.
//   showWord: also show the athlete's cue word (last Settle breath, Lock In end).

// `text` is the session's rotating wording (js/content/breathing.js).
function settleTimeline(durationMs, text) {
  const cycleMs = 16 * SEC;                                   // 4-4-4-4 box
  const cycles = Math.max(1, Math.floor((durationMs - 6 * SEC) / cycleMs));
  const introMs = durationMs - cycles * cycleMs;              // intro absorbs the remainder
  const phases = [{
    word: 'SETTLE', sub: text.settleIntro,
    ms: introMs, from: SMALL, to: SMALL, count: 'secs', intro: true,
  }];
  for (let i = 1; i <= cycles; i++) {
    const tag = (kind) => `${text.tip(kind)} · Breath ${i} of ${cycles}`;
    const showWord = i === cycles;
    phases.push(
      { word: 'BREATHE IN',  sub: tag('in'),   ms: 4 * SEC, from: SMALL, to: BIG,   cue: 'inhale', count: 'secs', showWord },
      { word: 'HOLD',        sub: tag('hold'), ms: 4 * SEC, from: BIG,   to: BIG,   cue: 'hold',   count: 'secs', showWord },
      { word: 'BREATHE OUT', sub: tag('out'),  ms: 4 * SEC, from: BIG,   to: SMALL, cue: 'exhale', count: 'secs', showWord },
      { word: 'HOLD',        sub: tag('rest'), ms: 4 * SEC, from: SMALL, to: SMALL, cue: 'hold',   count: 'secs', showWord },
    );
  }
  return phases;
}

function lockInTimeline(durationMs, text) {
  const inMs = 1.5 * SEC;
  const outMs = 1 * SEC;
  const finalMs = (4 + 4 + 6) * SEC;
  const doneMs = 4 * SEC;
  const avail = durationMs - finalMs - doneMs - 5 * SEC;      // keep ≥5 s for the intro
  const breaths = Math.max(4, Math.min(15, Math.floor(avail / (inMs + outMs))));
  const introMs = durationMs - finalMs - doneMs - breaths * (inMs + outMs);

  const phases = [{
    word: 'LOCK IN', sub: text.lockInIntro,
    ms: introMs, from: SMALL, to: SMALL, count: 'secs', intro: true,
  }];
  for (let i = 1; i <= breaths; i++) {
    phases.push(
      { word: 'IN',  sub: `Power breath ${i} of ${breaths}`, ms: inMs,  from: SMALL, to: BIG,   cue: 'power', count: String(i) },
      { word: 'OUT', sub: `Power breath ${i} of ${breaths}`, ms: outMs, from: BIG,   to: SMALL,                count: String(i) },
    );
  }
  phases.push(
    { word: 'BREATHE IN',  sub: text.lockInSteady, ms: 4 * SEC, from: SMALL, to: BIG,   cue: 'inhale', count: 'secs' },
    { word: 'HOLD',        sub: text.lockInSteady, ms: 4 * SEC, from: BIG,   to: BIG,   cue: 'hold',   count: 'secs' },
    { word: 'BREATHE OUT', sub: text.lockInSteady, ms: 6 * SEC, from: BIG,   to: SMALL, cue: 'exhale', count: 'secs' },
    { word: 'LOCKED IN',   sub: text.lockInFinal, ms: doneMs, from: BIG, to: BIG, cue: 'done', count: '', final: true, showWord: true },
  );
  return phases;
}

// ---- Player ----------------------------------------------------------------

async function play({ el, sleep, now, settings }, phases, theme) {
  const cueWord = settings.cue ? esc(settings.cue) : '';
  el.innerHTML = `
    <div class="breathe breathe--${theme}">
      <div class="breathe__ring">
        <div class="breathe__guide" aria-hidden="true"></div>
        <div class="breathe__orb" aria-hidden="true"></div>
        <div class="breathe__count" aria-hidden="true"></div>
      </div>
      <p class="breathe__word" role="status"></p>
      <p class="breathe__sub"></p>
      <p class="breathe__cueword" hidden>${theme === 'lockin' ? cueWord : `Your word · <b>${cueWord}</b>`}</p>
    </div>`;
  const root = el.firstElementChild;
  const orb = root.querySelector('.breathe__orb');
  const count = root.querySelector('.breathe__count');
  const word = root.querySelector('.breathe__word');
  const sub = root.querySelector('.breathe__sub');
  const cueEl = root.querySelector('.breathe__cueword');

  let phase = phases[0];
  let phaseStart = 0;
  let raf = 0;

  const draw = () => {
    const t = now() - phaseStart;
    const p = phase.ms ? Math.min(1, Math.max(0, t / phase.ms)) : 1;
    orb.style.transform = `scale(${phase.from + (phase.to - phase.from) * ease(p)})`;
    if (phase.count === 'secs') count.textContent = Math.max(1, Math.ceil((phase.ms - t) / SEC));
    raf = requestAnimationFrame(draw);
  };

  try {
    raf = requestAnimationFrame(draw);
    for (const ph of phases) {
      phase = ph;
      phaseStart = now();
      word.textContent = ph.word;
      sub.innerHTML = ph.sub;
      if (ph.count !== 'secs') count.textContent = ph.count;
      root.classList.toggle('is-intro', !!ph.intro);
      root.classList.toggle('is-final', !!ph.final);
      cueEl.hidden = !(ph.showWord && cueWord);
      root.dataset.phase = ph.cue ?? '';
      if (ph.cue) cues[ph.cue]();
      await sleep(ph.ms);
    }
  } finally {
    cancelAnimationFrame(raf);
  }
  return {};
}

export const settle = {
  run: (ctx) => play(ctx, settleTimeline(ctx.durationMs, ctx.session.content.breathing), 'settle'),
};

export const lockIn = {
  run: (ctx) => play(ctx, lockInTimeline(ctx.durationMs, ctx.session.content.breathing), 'lockin'),
};

// Exposed for checking that timelines fill their slot exactly.
export const _timelines = { settleTimeline, lockInTimeline };
