// Breathing pacer: Box Breathing (settle), Cyclic Sigh, Resonance (6 a
// minute), 4-7-8, Energize, and Lock In (energizing breaths + one steady
// finishing breath). A circle grows and shrinks with each phase; each switch
// also vibrates (in: one long pulse, out: two), so eyes can stay closed.
// Phases are timed against the session clock, so a long pacer never drifts.

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

// Repeats one breath cycle to fill the slot; the intro absorbs the remainder.
function cycles(durationMs, cycleMs, intro, cycle) {
  const n = Math.max(1, Math.floor((durationMs - 6 * SEC) / cycleMs));
  return [intro(durationMs - n * cycleMs), ...Array.from({ length: n }, (_, i) => cycle(i + 1, n)).flat()];
}

// Physiological sigh: a full breath in, a short top-up breath, a long exhale.
const MID = 0.82;
function sighTimeline(durationMs, text) {
  return cycles(durationMs, 10 * SEC,
    (ms) => ({ word: 'SIGH', sub: text.sighIntro, ms, from: SMALL, to: SMALL, count: 'secs', intro: true }),
    (i, n) => {
      const sub = `Sigh ${i} of ${n}`;
      return [
        { word: 'BREATHE IN', sub, ms: 2 * SEC, from: SMALL, to: MID, cue: 'inhale', count: 'secs' },
        { word: 'TOP IT UP',  sub, ms: 1 * SEC, from: MID,   to: BIG, cue: 'hold',   count: 'secs' },
        { word: 'LONG OUT',   sub, ms: 6 * SEC, from: BIG,   to: SMALL, cue: 'exhale', count: 'secs', showWord: i === n },
        { word: 'REST',       sub, ms: 1 * SEC, from: SMALL, to: SMALL, count: '' },
      ];
    });
}

// Resonance: about 6 breaths a minute, in for 4, out for 6.
function resonanceTimeline(durationMs, text) {
  return cycles(durationMs, 10 * SEC,
    (ms) => ({ word: 'RESONANCE', sub: text.resonanceIntro, ms, from: SMALL, to: SMALL, count: 'secs', intro: true }),
    (i, n) => {
      const sub = `Breath ${i} of ${n} · in 4, out 6`;
      return [
        { word: 'BREATHE IN',  sub, ms: 4 * SEC, from: SMALL, to: BIG,   cue: 'inhale', count: 'secs' },
        { word: 'BREATHE OUT', sub, ms: 6 * SEC, from: BIG,   to: SMALL, cue: 'exhale', count: 'secs', showWord: i === n },
      ];
    });
}

// 4-7-8: in for 4, hold for 7, out for 8.
function fourSevenTimeline(durationMs, text) {
  return cycles(durationMs, 19 * SEC,
    (ms) => ({ word: '4-7-8', sub: text.fourSevenIntro, ms, from: SMALL, to: SMALL, count: 'secs', intro: true }),
    (i, n) => {
      const sub = `Breath ${i} of ${n}`;
      return [
        { word: 'BREATHE IN',  sub, ms: 4 * SEC, from: SMALL, to: BIG,   cue: 'inhale', count: 'secs' },
        { word: 'HOLD',        sub, ms: 7 * SEC, from: BIG,   to: BIG,   cue: 'hold',   count: 'secs' },
        { word: 'BREATHE OUT', sub, ms: 8 * SEC, from: BIG,   to: SMALL, cue: 'exhale', count: 'secs', showWord: i === n },
      ];
    });
}

// Energize and Lock In: quick power breaths, one steady breath, then done.
// Energize (Flat days) ends READY; Lock In ends LOCKED IN with the cue word.
function lockInTimeline(durationMs, text, { title = 'LOCK IN', intro = text.lockInIntro, done = 'LOCKED IN', final = text.lockInFinal } = {}) {
  const inMs = 1.5 * SEC;
  const outMs = 1 * SEC;
  const finalMs = (4 + 4 + 6) * SEC;
  const doneMs = 4 * SEC;
  const avail = durationMs - finalMs - doneMs - 5 * SEC;      // keep ≥5 s for the intro
  const breaths = Math.max(4, Math.min(15, Math.floor(avail / (inMs + outMs))));
  const introMs = durationMs - finalMs - doneMs - breaths * (inMs + outMs);

  const phases = [{
    word: title, sub: intro,
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
    { word: done,          sub: final, ms: doneMs, from: BIG, to: BIG, cue: 'done', count: '', final: true, showWord: true },
  );
  return phases;
}

const energizeTimeline = (durationMs, text) => lockInTimeline(durationMs, text, {
  title: 'ENERGIZE', intro: `${text.energizeIntro}<br><small>Stop if you feel lightheaded.</small>`, done: 'READY', final: text.lockInFinal,
});

// One breath of each pattern, for My Routine (no intro).
export function oneBreath(kind) {
  const text = { tip: () => '', settleIntro: '', sighIntro: '', resonanceIntro: '', lockInSteady: 'One steady breath', lockInFinal: '', lockInIntro: '', energizeIntro: '' };
  if (kind === 'box') return settleTimeline(16 * SEC + 6 * SEC, text).slice(1);
  if (kind === 'resonance') return resonanceTimeline(10 * SEC + 6 * SEC, text).slice(1);
  if (kind === 'energize') {
    const sub = 'Power breaths';
    return [1, 2, 3].flatMap((i) => [
      { word: 'IN', sub, ms: 1.5 * SEC, from: SMALL, to: BIG, cue: 'power', count: String(i) },
      { word: 'OUT', sub, ms: 1 * SEC, from: BIG, to: SMALL, count: String(i) },
    ]);
  }
  return sighTimeline(10 * SEC + 6 * SEC, text).slice(1);   // one cyclic sigh
}
export const breathMs = (kind) => oneBreath(kind).reduce((a, p) => a + p.ms, 0);

// ---- Player ----------------------------------------------------------------

// Runs phases back to back against absolute times on the clock (start + the
// phases so far), so small timer delays never add up: drift-free over minutes.
export async function runPhases(phases, { now, sleep, onPhase = () => {} }) {
  let end = now();
  for (const ph of phases) {
    const start = end;
    end += ph.ms;
    onPhase(ph, start);
    await sleep(Math.max(0, end - now()));
  }
  return end;
}

export async function play({ el, sleep, now, settings }, phases, theme) {
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
    await runPhases(phases, {
      now, sleep,
      onPhase(ph, start) {
        phase = ph;
        phaseStart = start;   // the planned start, so the circle stays on time too
        word.textContent = ph.word;
        sub.innerHTML = ph.sub;
        if (ph.count !== 'secs') count.textContent = ph.count;
        root.classList.toggle('is-intro', !!ph.intro);
        root.classList.toggle('is-final', !!ph.final);
        cueEl.hidden = !(ph.showWord && cueWord);
        root.dataset.phase = ph.cue ?? '';
        if (ph.cue) cues[ph.cue]();
      },
    });
  } finally {
    cancelAnimationFrame(raf);
  }
  return {};
}

export const settle = {
  run: (ctx) => play(ctx, settleTimeline(ctx.durationMs, ctx.session.content.breathing), 'settle'),
};

export const sigh = {
  run: (ctx) => play(ctx, sighTimeline(ctx.durationMs, ctx.session.content.breathing), 'settle'),
};

export const resonance = {
  run: (ctx) => play(ctx, resonanceTimeline(ctx.durationMs, ctx.session.content.breathing), 'settle'),
};

export const energize = {
  run: (ctx) => play(ctx, energizeTimeline(ctx.durationMs, ctx.session.content.breathing), 'lockin'),
};

export const breath478 = {
  run: (ctx) => play(ctx, fourSevenTimeline(ctx.durationMs, ctx.session.content.breathing), 'settle'),
};

export const lockIn = {
  run: (ctx) => play(ctx, lockInTimeline(ctx.durationMs, ctx.session.content.breathing), 'lockin'),
};

// Exposed for checking that timelines fill their slot exactly.
export const _timelines = { settleTimeline, sighTimeline, resonanceTimeline, fourSevenTimeline, energizeTimeline, lockInTimeline };
