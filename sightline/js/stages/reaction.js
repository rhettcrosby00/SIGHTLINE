// Reaction drills: Color Call, Go/No-Go, Stroop, Peripheral Flash.
//
// TAP mode: cue in the upper area, a diamond answer pad below laid out like
// the cones (green top, blue left, red right, yellow bottom). Each cue has a
// response window; we score correct / wrong / miss and reaction time.
// CONE mode: no input. Each cue fills the screen (a color or an arrow), stays
// up long enough to read from 10–15 ft, then a "back to center" pause.
// Both modes speed up across each drill.

import { intro, INTRO_MS } from './common.js';
import { CUES, cueById, cueByDir } from '../lib/colors.js';
import { noRepeatPicker, randRange } from '../lib/rng.js';
import { tone, cues } from '../lib/audio.js';

const ROT = { front: 0, right: 90, back: 180, left: 270 };
const DIRS = ['front', 'right', 'back', 'left'];
const PAD_ORDER = ['front', 'left', 'right', 'back'];   // DOM order; CSS places them

const arrow = (dir, cls = '') =>
  `<svg class="arrow ${cls}" viewBox="0 0 100 100" style="transform:rotate(${ROT[dir]}deg)" aria-hidden="true">
     <path d="M50 4 L94 50 H66 V96 H34 V50 H6 Z"/></svg>`;

const fill = (c, inner = '') =>
  `<div class="cue cue--fill" style="--c:${c.hex};--ink:${c.ink}">
     ${inner || `<span class="cue__shape">${c.shape}</span><span class="cue__label">${c.label}</span>`}
   </div>`;

// Speed ramps down to 75% of the starting window by the end of a drill.
const ramp = (prog) => 1 - 0.25 * Math.min(1, prog);

// ---- Shared runner -----------------------------------------------------------
// Also used by the brain drills. Spec fields:
//   title, kicker?, tapLines, coneLines, next({ hard, cone, prog }) -> trial
//   tapWindow (ms), coneShow? [normal, hard] ms, fbMs?, tapAnywhere?, tapHint?
// Trial fields: html, answer (cue id, 'go', or null = hold), kind?, flashMs?,
//   padLabels? { cueId: text } (others hidden), reveal? (shown when wrong),
//   coneReveal? (shown on the back-to-center screen).

export async function runDrill(ctx, spec) {
  const { settings } = ctx;
  const cone = settings.mode === 'cones';
  await intro(ctx, { kicker: spec.kicker ?? 'Reaction', title: spec.title, lines: cone ? spec.coneLines : spec.tapLines });
  return cone ? runCone(ctx, spec) : runTap(ctx, spec);
}

async function runTap(ctx, spec) {
  const { el, settings, durationMs, sleep, now } = ctx;
  const hard = settings.difficulty === 'hard';
  const anywhere = spec.tapAnywhere;

  el.innerHTML = `
    <div class="rx rx--tap ${anywhere ? 'rx--anywhere' : ''}">
      <div class="rx__cue"><div class="rx__fix" aria-hidden="true"></div></div>
      <div class="rx__fb" aria-live="polite"></div>
      ${anywhere ? `<p class="rx__hint">${spec.tapHint}</p>` : `
      <div class="pad" role="group" aria-label="Answer">
        ${PAD_ORDER.map((d) => { const c = cueByDir[d]; return `
          <button type="button" class="pad__btn pad__btn--${d}" data-id="${c.id}" style="--c:${c.hex};--ink:${c.ink}">
            <span class="pad__shape" aria-hidden="true">${c.shape}</span><span class="pad__label">${c.label}</span>
          </button>`; }).join('')}
      </div>`}
    </div>`;
  const root = el.firstElementChild;
  const cueBox = root.querySelector('.rx__cue');
  const fb = root.querySelector('.rx__fb');
  const pad = root.querySelector('.pad');

  // Per-trial button text (e.g. ODD / EVEN or quiz answers); unused buttons hide.
  const setPad = (labels) => {
    if (!pad) return;
    pad.classList.toggle('pad--text', !!labels);
    for (const b of pad.children) {
      const id = b.dataset.id;
      b.querySelector('.pad__label').textContent = labels ? (labels[id] ?? '') : cueById[id].label;
      b.style.visibility = !labels || id in labels ? '' : 'hidden';
    }
  };

  // One listener; the current trial (if any) picks up the tap.
  let onTap = null;
  const target = anywhere ? root : root.querySelector('.pad');
  target.addEventListener('pointerdown', (e) => {
    const id = anywhere ? 'go' : e.target.closest('.pad__btn')?.dataset.id;
    if (id && onTap) { e.preventDefault(); onTap(id); }
  });

  const waitTap = (ms) => new Promise((resolve, reject) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; onTap = null; resolve(v); } };
    onTap = finish;
    sleep(ms).then(() => finish(null), (err) => { if (!done) { done = true; onTap = null; reject(err); } });
  });

  const avail = durationMs - INTRO_MS;
  const start = now();
  const stats = { trials: 0, correct: 0, misses: 0, wrong: 0, falseAlarms: 0, rts: [] };

  while (true) {
    const elapsed = now() - start;
    const prog = elapsed / avail;
    const windowMs = spec.tapWindow * (hard ? 0.75 : 1) * ramp(prog);
    const gap = randRange(450, 900) * (hard ? 0.8 : 1);
    if (avail - elapsed < gap + windowMs + 400) break;

    cueBox.innerHTML = '<div class="rx__fix" aria-hidden="true"></div>';
    await sleep(gap);

    const trial = spec.next({ hard, cone: false, prog });
    setPad(trial.padLabels);
    cueBox.innerHTML = trial.html;
    root.dataset.cue = trial.kind ?? '';
    if (trial.flashMs) {
      const flashed = [...cueBox.querySelectorAll('.flash')];
      sleep(trial.flashMs).then(() => flashed.forEach((n) => n.remove()), () => {});
    }
    const shownAt = now();
    const resp = await waitTap(windowMs);
    const rt = now() - shownAt;

    stats.trials++;
    let ok;
    if (trial.answer == null) {                 // no-go: correct to hold
      ok = resp == null;
      if (!ok) stats.falseAlarms++;
    } else if (resp == null) {
      ok = false; stats.misses++;
    } else {
      ok = resp === trial.answer;
      if (!ok) stats.wrong++;
    }
    if (ok) { stats.correct++; if (resp != null) stats.rts.push(rt); }
    (ok ? cues.correct : cues.wrong)();

    fb.className = `rx__fb is-${ok ? 'ok' : 'bad'}`;
    fb.textContent = ok
      ? (resp == null ? '✓ held' : `✓ ${Math.round(rt)} ms`)
      : resp == null
        ? (trial.answer == null ? '' : `too slow${trial.reveal ? ` · ${trial.reveal}` : ''}`)
        : trial.answer == null ? '✗ hold on red' : `✗${trial.reveal ? ` ${trial.reveal}` : ''}`;
    cueBox.innerHTML = '';
    await sleep(spec.fbMs ?? 320);
    fb.className = 'rx__fb';
    fb.textContent = '';
  }
  // Fill the rest of the slot so the routine stays on schedule.
  cueBox.innerHTML = '<div class="rx__fix" aria-hidden="true"></div>';
  await sleep(Math.max(0, avail - (now() - start)));

  const avgRt = stats.rts.length ? Math.round(stats.rts.reduce((a, b) => a + b, 0) / stats.rts.length) : null;
  return {
    trials: stats.trials, correct: stats.correct, misses: stats.misses, wrong: stats.wrong,
    falseAlarms: stats.falseAlarms, rtMs: avgRt, rtCount: stats.rts.length,
    bestRtMs: stats.rts.length ? Math.round(Math.min(...stats.rts)) : null,
  };
}

async function runCone(ctx, spec) {
  const { el, settings, durationMs, sleep, now } = ctx;
  const hard = settings.difficulty === 'hard';
  el.innerHTML = '<div class="rx rx--cone"><div class="rx__cue"></div></div>';
  const cueBox = el.querySelector('.rx__cue');

  const avail = durationMs - INTRO_MS;
  const start = now();
  let cues = 0;

  while (true) {
    const elapsed = now() - start;
    const prog = elapsed / avail;
    const [showN, showH] = spec.coneShow ?? [1600, 1200];
    const showMs = (hard ? showH : showN) * ramp(prog);
    const backMs = (hard ? 1700 : 2200) * ramp(prog) * randRange(0.8, 1.2);
    if (avail - elapsed < showMs + 600) break;

    const trial = spec.next({ hard, cone: true, prog });
    cueBox.innerHTML = trial.html;
    tone(trial.answer == null ? 330 : 740, { dur: 0.12, gain: 0.12 });
    cues++;
    if (trial.flashMs) {
      await sleep(trial.flashMs);
      cueBox.querySelectorAll('.flash').forEach((n) => n.remove());
      await sleep(Math.max(0, showMs - trial.flashMs));
    } else {
      await sleep(showMs);
    }

    cueBox.innerHTML = `<div class="rx__back">${trial.coneReveal ? `<p class="rx__reveal">${trial.coneReveal}</p>` : ''}
      <div class="rx__fix"></div><p>BACK TO CENTER</p></div>`;
    await sleep(Math.min(backMs, Math.max(0, avail - (now() - start))));
  }
  cueBox.innerHTML = '<div class="rx__back"><div class="rx__fix"></div></div>';
  await sleep(Math.max(0, avail - (now() - start)));
  return { cues };
}

// ---- Drills ------------------------------------------------------------------

export const colorCall = {
  run(ctx) {
    const nextCue = noRepeatPicker(CUES);
    return runDrill(ctx, {
      title: 'Color Call',
      tapLines: ['Tap the matching color.', 'Fast and clean.'],
      coneLines: ['COLOR → run to that cone.', 'ARROW → run that way.'],
      tapWindow: 1400,
      next({ cone }) {
        const c = nextCue();
        // Cone mode mixes color fills with arrow flashes.
        if (cone && Math.random() < 0.5) {
          return { answer: c.id, html: `<div class="cue cue--arrow">${arrow(c.dir)}</div>` };
        }
        return { answer: c.id, html: fill(c) };
      },
    });
  },
};

export const goNoGo = {
  run(ctx) {
    const nextDir = noRepeatPicker(DIRS);
    const go = cueById.green;
    const stop = cueById.red;
    let streak = 0;   // cap no-go runs so it doesn't stall
    return runDrill(ctx, {
      title: 'Go / No-Go',
      tapLines: [`GREEN ${go.shape} → tap anywhere, fast.`, `RED ${stop.shape} → don’t touch.`],
      coneLines: ['GREEN → go where the arrow points.', 'RED → FREEZE.'],
      tapWindow: 1000,
      tapAnywhere: true,
      tapHint: 'Green = tap anywhere · Red = hold',
      next({ hard, cone }) {
        let isGo = Math.random() < (hard ? 0.6 : 0.7);
        if (!isGo && ++streak > 2) isGo = true;
        if (isGo) streak = 0;
        const c = isGo ? go : stop;
        const inner = cone
          ? `${arrow(nextDir(), 'arrow--ink')}<span class="cue__tag">${c.shape}</span>`
          : `<span class="cue__shape cue__shape--xl">${c.shape}</span>`;
        return { answer: isGo ? 'go' : null, kind: isGo ? 'go' : 'nogo', html: fill(c, inner) };
      },
    });
  },
};

export const stroop = {
  run(ctx) {
    const nextInk = noRepeatPicker(CUES);
    return runDrill(ctx, {
      title: 'Stroop',
      tapLines: ['Tap the INK color.', 'Ignore what the word says.'],
      coneLines: ['Go to the INK color.', 'Ignore what the word says.'],
      tapWindow: 1700,
      next({ hard }) {
        const ink = nextInk();
        const congruent = !hard && Math.random() < 0.25;
        const others = CUES.filter((c) => c !== ink);
        const word = congruent ? ink : others[Math.floor(Math.random() * others.length)];
        return {
          answer: ink.id,
          html: `<div class="cue cue--stroop" style="--c:${ink.hex}">
                   <span class="stroop__word">${word.label}</span>
                   <span class="stroop__shape" aria-hidden="true">${ink.shape}</span>
                 </div>`,
        };
      },
    });
  },
};

export const peripheral = {
  run(ctx) {
    const nextCue = noRepeatPicker(CUES);
    const nextEdge = noRepeatPicker(DIRS);
    return runDrill(ctx, {
      title: 'Peripheral Flash',
      tapLines: ['Eyes locked on the center dot.', 'Tap the color that flashes.'],
      coneLines: ['Eyes locked on the center dot.', 'Go to the color that flashes.'],
      tapWindow: 1500,
      next({ hard, cone }) {
        const c = nextCue();
        const edge = nextEdge();
        // Hard: a white number flashes at another edge as a distractor.
        let lure = '';
        if (hard) {
          const other = DIRS.filter((d) => d !== edge)[Math.floor(Math.random() * 3)];
          lure = `<div class="flash flash--${other} flash--lure">${1 + Math.floor(Math.random() * 9)}</div>`;
        }
        return {
          answer: c.id,
          flashMs: cone ? (hard ? 400 : 600) : (hard ? 200 : 350),
          html: `<div class="cue cue--periph">
                   <div class="rx__fix rx__fix--lock"></div>
                   <div class="flash flash--${edge}" style="--c:${c.hex};--ink:${c.ink}">${c.shape}</div>
                   ${lure}
                 </div>`,
        };
      },
    });
  },
};
