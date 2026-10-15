// Reaction drills: Color Call, Go/No-Go, Stroop (Challenge), Peripheral
// Flash (Activate) and Target Capture (Vision). FOCUS only: the athlete holds
// the phone and taps.
//
// Every drill runs the same way:
//   1. How-to card: the rule in one sentence plus a looping example.
//   2. Practice (Instructions: Full): a few slow, unscored cues; the right
//      button pulses if the athlete hesitates.
//   3. "NOW FOR REAL" countdown, then the scored part with the rule pinned at
//      the top. Difficulty adapts cue by cue (js/lib/adapt.js): quicker after
//      right answers, gentler after misses, aiming at about 80% right.
// Steps 1–2 and the countdown run inside hold(), so they never use drill time.
// Big answer buttons; we score correct / wrong / too slow and time.
// Low contrast (Settings): cues that carry a color (trial.fg) fade toward the
// background, fainter as the level rises, never below the visible floor.

import { howTo, countdown, mini, practiceLeft, backdrop } from './common.js';
import { cueById } from '../lib/colors.js';
import { cues } from '../lib/audio.js';
import { icon } from '../lib/icons.js';
import { esc } from '../lib/text.js';
import { lerp } from '../lib/adapt.js';
import { opacityFor, lowContrastAt, toHex } from '../lib/contrast.js';
import { GAP_DIRS, captureAt } from '../content/vision.js';

const GRID = ['green', 'red', 'blue', 'yellow'];   // 2×2 answer grid, reading order

const fill = (c, inner = '') =>
  `<div class="cue cue--fill" style="--c:${c.hex};--ink:${c.ink}">
     ${inner || `<span class="cue__shape">${c.shape}</span><span class="cue__label">${c.label}</span>`}
   </div>`;

const secs = (ms) => `${(ms / 1000).toFixed(2)} s`;

// Place a flash at a point in -1..1 across the cue area, kept inside the edges.
const at = (p) => `left:calc(50% + ${p.x.toFixed(3)} * (50% - var(--size) / 2 - 6px));`
  + `top:calc(50% + ${p.y.toFixed(3)} * (50% - var(--size) / 2 - 6px));transform:translate(-50%, -50%)`;

// The answer window by level: 115% of the drill's window at the easiest, 65% at the hardest.
export const windowAt = (level) => lerp(1.15, 0.65, level);
const GENTLE_CUES = 3;      // first scored cues get extra time…
const GENTLE_FACTOR = 1.5;  // …this much
const FINISH_CUES = 3;      // the last cues are easy (simple cue, extra time)…
const FINISH_FACTOR = 1.6;  // …so every drill ends on a success
const AVG_GAP_MS = 1200;    // middle of the 0.8–1.6 s gap between cues

// Close enough to the end that only the last few (easy) cues fit?
export function finishing(leftMs, windowMs, hard) {
  const perCue = AVG_GAP_MS * (hard ? 0.75 : 1) + windowMs * FINISH_FACTOR + 450;
  return leftMs < FINISH_CUES * perCue;
}

// ---- Shared runner -------------------------------------------------------------
// Also used by the brain drills. Spec fields:
//   kicker?, title, rule, strip, demo, practice (count)
//   pad: 'colors' | 'oddeven' | 'list' | 'plain' | 'anywhere'
//   choices [{ id, html }] for 'plain' pads (neutral buttons)
//   tapWindow (ms), fbMs?
//   next({ hard, practice, easy, level }) -> trial   (easy: the simplest cue, for the finish)
// Trial fields:
//   html, answer (cue id, 'go', or null = hold), answerLabel (for "It was …"),
//   kind?, flashMs?, buttons? [{ id, label }] for 'list' pads,
//   fg? (the cue's color, or a CSS variable like '--cue-fg', for Low contrast)
// next() returns null when the drill's content pool is used up; the drill then
// ends early rather than repeat anything. All randomness comes from
// ctx.session (js/session.js), so a seed replays the session exactly.

export async function runDrill(ctx, spec) {
  await howTo(ctx, { kicker: spec.kicker ?? 'Challenge', title: spec.title, rule: spec.rule, demo: spec.demo });
  return runTap(ctx, spec);
}

function padButtons(spec, trial) {
  const btn = (c, label) => `
    <button type="button" class="pad__btn" data-id="${c.id}" style="--c:${c.hex};--ink:${c.ink}">
      <span class="pad__shape" aria-hidden="true">${c.shape}</span><span class="pad__label">${label}</span>
    </button>`;
  if (spec.pad === 'colors') return GRID.map((id) => btn(cueById[id], cueById[id].label)).join('');
  if (spec.pad === 'oddeven') return btn(cueById.blue, 'ODD') + btn(cueById.red, 'EVEN');
  if (spec.pad === 'list') return (trial?.buttons ?? []).map((b) => btn(cueById[b.id], b.label)).join('');
  if (spec.pad === 'plain') return spec.choices.map((b) => `<button type="button" class="pad__btn pad__btn--plain" data-id="${b.id}" aria-label="${b.label}">${b.html}</button>`).join('');
  return '';
}

async function runTap(ctx, spec) {
  const { el, settings, session, step, sleep, now, remaining, hold } = ctx;
  const hard = settings.difficulty === 'hard';
  const level = session.content.level(step.id);
  const anywhere = spec.pad === 'anywhere';
  const gapMs = session.content.gaps(step.id);
  const practiceN = (step.guide ?? settings.guide) === 'brief' ? 0 : (spec.practice ?? 3);

  el.innerHTML = `
    <div class="rx rx--tap ${anywhere ? 'rx--anywhere' : ''}">
      <div class="rx__strip"><span class="rx__rule"></span><span class="rx__count"></span></div>
      <div class="rx__cue"><div class="rx__fix" aria-hidden="true"></div></div>
      <div class="rx__fb" aria-live="polite"></div>
      ${anywhere ? `<p class="rx__hint">${spec.tapHint ?? ''}</p>`
                 : `<div class="pad pad--${spec.pad}" role="group" aria-label="Answer">${padButtons(spec)}</div>`}
    </div>`;
  const root = el.firstElementChild;
  const ruleEl = root.querySelector('.rx__rule');
  const countEl = root.querySelector('.rx__count');
  const cueBox = root.querySelector('.rx__cue');
  const fb = root.querySelector('.rx__fb');
  const pad = root.querySelector('.pad');
  const low = session.content.lowContrast;
  const cueBg = low ? backdrop(cueBox) : null;

  // One listener; the current trial (if any) picks up the tap.
  let onTap = null;
  (anywhere ? root : pad).addEventListener('pointerdown', (e) => {
    const id = anywhere ? 'go' : e.target.closest('.pad__btn')?.dataset.id;
    if (id && onTap) { e.preventDefault(); onTap(id); }
  });

  const waitTap = (ms) => new Promise((resolve, reject) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; onTap = null; resolve(v); } };
    onTap = finish;
    sleep(ms).then(() => finish(null), (err) => { if (!done) { done = true; onTap = null; reject(err); } });
  });

  const showTrial = (trial, faint = false) => {
    if (spec.pad === 'list') pad.innerHTML = padButtons(spec, trial);
    // Low contrast: the cue fades to this level's contrast ratio (full strength on easy cues).
    const fg = trial.fg?.startsWith('--') ? toHex(getComputedStyle(cueBox).getPropertyValue(trial.fg)) : trial.fg;
    const strength = faint && low && fg ? opacityFor(fg, cueBg, lowContrastAt(level.value)) : 1;
    cueBox.style.setProperty('--cue-strength', String(strength));
    cueBox.innerHTML = trial.html;
    root.dataset.cue = trial.kind ?? '';
    if (trial.flashMs) {
      const flashed = [...cueBox.querySelectorAll('.flash')];
      sleep(trial.flashMs).then(() => flashed.forEach((n) => n.remove()), () => {});
    }
  };

  // Feedback line: a leading ✓ / ✗ becomes a check / x icon.
  const say = (cls, text) => {
    fb.className = `rx__fb ${cls}`;
    const m = /^([✓✗]) (.*)$/.exec(text);
    fb.innerHTML = m ? `${icon(m[1] === '✓' ? 'check' : 'x')}<span>${esc(m[2])}</span>` : esc(text);
  };
  const clearFb = () => { fb.className = 'rx__fb'; fb.textContent = ''; };
  const blank = () => { cueBox.innerHTML = '<div class="rx__fix" aria-hidden="true"></div>'; };

  // ---- Practice: slow, unscored, with a hint if the athlete hesitates ----
  if (practiceN) {
    await hold(async () => {
      for (let i = 1; i <= practiceN; i++) {
        if (practiceLeft(ctx) < 3500) break;   // out of instruction time: on to the real thing
        ruleEl.textContent = `PRACTICE ${i} of ${practiceN} · ${spec.strip}`;
        blank();
        await sleep(700);
        const trial = spec.next({ hard: false, practice: true, level: 0 });
        if (!trial) break;
        showTrial(trial);
        let answered = false;
        sleep(1500).then(() => {
          if (answered) return;
          if (trial.answer == null) say('is-hint', 'Don’t tap — just hold…');
          else if (anywhere) say('is-hint', 'Tap anywhere!');
          else pad.querySelector(`[data-id="${trial.answer}"]`)?.classList.add('is-hint');
        }, () => {});
        const resp = await waitTap(trial.answer == null ? 2200 : Math.max(2500, Math.min(8000, practiceLeft(ctx) - 1100)));
        answered = true;
        pad?.querySelectorAll('.is-hint').forEach((n) => n.classList.remove('is-hint'));
        if (trial.answer == null) {
          if (resp == null) { say('is-ok', '✓ Held'); cues.correct(); }
          else { say('is-bad', 'Red means don’t touch'); cues.wrong(); }
        } else if (resp === trial.answer) {
          say('is-ok', '✓ Correct'); cues.correct();
        } else {
          say('is-bad', resp == null ? `It was ${trial.answerLabel}` : `That was ${trial.answerLabel}`); cues.wrong();
        }
        blank();
        await sleep(1100);
        clearFb();
      }
    });
  }

  ruleEl.textContent = spec.strip;
  await hold(() => countdown(ctx, cueBox, practiceN ? 'NOW FOR REAL' : 'GET SET'));

  // ---- Scored ----
  const stats = { trials: 0, correct: 0, misses: 0, wrong: 0, falseAlarms: 0, rts: [] };
  while (true) {
    const left = remaining();
    // The level sets the answer window; pacing from the check-in: calmer when wired, snappier when flat.
    const base = spec.tapWindow * windowAt(level.value) * (session.pacing?.window ?? 1);
    const easy = finishing(left, base, hard);
    const gentle = easy ? FINISH_FACTOR : stats.trials < GENTLE_CUES ? GENTLE_FACTOR : 1;
    const counts = gentle === 1;   // only ordinary cues move the level
    const windowMs = base * gentle;
    const gap = gapMs(hard) * (session.pacing?.gap ?? 1);
    if (left < gap + windowMs + 400) break;

    blank();
    await sleep(gap);

    const trial = spec.next({ hard: hard && !easy, practice: false, easy, level: easy ? 0 : level.value });
    if (!trial) break;
    countEl.textContent = `#${stats.trials + 1}`;
    showTrial(trial, !easy);
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
    if (counts) level.update(ok);
    // Leaderboard points: right (speed bonus for taps), wrong or tapped on red, or too slow.
    session.scorer?.trial(ok ? { outcome: 'correct', rtMs: resp == null ? null : rt }
      : { outcome: resp == null ? 'missed' : 'wrong' });
    (ok ? cues.correct : cues.wrong)();

    if (ok) say('is-ok', resp == null ? '✓ Held' : `✓ ${secs(rt)}`);
    else if (trial.answer == null) say('is-bad', '✗ Red means don’t touch');
    else if (resp == null) say('is-bad', 'Too slow');
    else say('is-bad', `✗ It was ${trial.answerLabel}`);
    blank();
    await sleep(spec.fbMs ?? (ok ? 380 : 750));
    clearFb();
  }
  // Fill the rest of the slot so the routine stays on schedule.
  blank();
  countEl.textContent = '';
  await sleep(Math.max(0, remaining()));

  const avgRt = stats.rts.length ? Math.round(stats.rts.reduce((a, b) => a + b, 0) / stats.rts.length) : null;
  return {
    trials: stats.trials, correct: stats.correct, misses: stats.misses, wrong: stats.wrong,
    falseAlarms: stats.falseAlarms, rtMs: avgRt, rtCount: stats.rts.length,
    bestRtMs: stats.rts.length ? Math.round(Math.min(...stats.rts)) : null,
  };
}

// ---- Drills ------------------------------------------------------------------

export const colorCall = {
  run(ctx) {
    return runDrill(ctx, {
      title: 'Color Call',
      rule: 'A color fills the screen. Tap the button with the same color — as fast as you can.',
      strip: 'TAP THE MATCHING COLOR',
      pad: 'colors',
      tapWindow: 1400,
      demo: {
        pad: 'colors',
        frames: [
          { cue: mini.fill('red'), answer: 'red', caption: 'RED fills the screen → tap RED' },
          { cue: mini.fill('blue'), answer: 'blue', caption: 'BLUE → tap BLUE' },
        ],
      },
      next() {
        const c = cueById[ctx.session.content.colorCall().color];
        return { answer: c.id, answerLabel: c.label, fg: c.hex, html: fill(c) };
      },
    });
  },
};

export const goNoGo = {
  run(ctx) {
    const go = cueById.green;
    const stop = cueById.red;
    return runDrill(ctx, {
      title: 'Go / No-Go',
      rule: `GREEN ${go.shape} → tap anywhere on the screen, fast. RED ${stop.shape} → don’t touch it.`,
      strip: 'GREEN = TAP · RED = DON’T TOUCH',
      pad: 'anywhere',
      tapHint: `Tap anywhere on GREEN ${go.shape} · Hold on RED ${stop.shape}`,
      tapWindow: 1000,
      demo: {
        pad: 'anywhere',
        frames: [
          { cue: mini.fill('green'), answer: 'any', caption: 'GREEN → tap anywhere, fast' },
          { cue: mini.fill('red'), answer: null, caption: 'RED → don’t touch' },
        ],
      },
      next({ easy }) {
        // About 65% go; never more than 3 go or 2 hold in a row. The finish is all GO.
        const isGo = easy || ctx.session.content.goNoGo().go;
        const c = isGo ? go : stop;
        return {
          answer: isGo ? 'go' : null, answerLabel: 'GREEN', kind: isGo ? 'go' : 'nogo',
          html: fill(c, `<span class="cue__shape cue__shape--xl">${c.shape}</span>`),
        };
      },
    });
  },
};

export const stroop = {
  run(ctx) {
    return runDrill(ctx, {
      title: 'Stroop',
      rule: 'You’ll see a color word. Tap the color of the INK it’s written in — not what the word says.',
      strip: 'TAP THE INK COLOR — NOT THE WORD',
      pad: 'colors',
      tapWindow: 1700,
      demo: {
        pad: 'colors',
        frames: [
          { cue: mini.word('BLUE', 'yellow'), answer: 'yellow', caption: 'Says BLUE, ink is YELLOW → tap YELLOW' },
          { cue: mini.word('GREEN', 'red'), answer: 'red', caption: 'Says GREEN, ink is RED → tap RED' },
        ],
      },
      next() {
        // Word and ink never match, and no word/ink pair repeats in a session.
        const t = ctx.session.content.stroop();
        if (!t) return null;
        const ink = cueById[t.ink];
        return {
          answer: ink.id,
          answerLabel: ink.label,
          html: `<div class="cue cue--stroop" style="--c:${ink.hex}">
                   <span class="stroop__word">${t.word}</span>
                   <span class="stroop__shape" aria-hidden="true">${ink.shape}</span>
                 </div>`,
        };
      },
    });
  },
};

export const peripheral = {
  run(ctx) {
    return runDrill(ctx, {
      kicker: 'Activate',
      title: 'Peripheral Flash',
      rule: 'Keep your eyes on the dot in the middle. A color flashes at the edge — tap that color.',
      strip: 'EYES ON THE DOT · TAP THE FLASH COLOR',
      pad: 'colors',
      tapWindow: 1500,
      demo: {
        pad: 'colors',
        frames: [
          { cue: mini.periph('green', 'right'), answer: 'green', caption: 'Eyes on the dot. GREEN flashed → tap GREEN' },
          { cue: mini.periph('yellow', 'top'), answer: 'yellow', caption: 'YELLOW flashed → tap YELLOW' },
        ],
      },
      next({ hard, practice, easy, level }) {
        // Anywhere along an edge, never the same side twice in a row and well
        // away from the last spot. Hard adds a white number as a distractor.
        // The flash gets shorter as the level rises (450 → 150 ms).
        const t = ctx.session.content.peripheral({ lure: hard && !practice && !easy });
        const c = cueById[t.color];
        const lure = t.lure ? `<div class="flash flash--lure" style="${at(t.lure)}">${t.lure.digit}</div>` : '';
        const flashMs = practice || easy ? 900 : Math.round(lerp(450, 150, level));
        return {
          answer: c.id,
          answerLabel: c.label,
          fg: c.hex,
          flashMs,
          html: `<div class="cue cue--periph">
                   <div class="rx__fix rx__fix--lock"></div>
                   <div class="flash" style="--c:${c.hex};--ink:${c.ink};${at(t)}">${c.shape}</div>
                   ${lure}
                 </div>`,
        };
      },
    });
  },
};

// Target Capture: a tiny ring with a gap (a Landolt C, the eye-test symbol)
// flashes near an edge; tap the ring whose gap faces the same way. The flash
// gets shorter and the ring smaller as the level rises (js/content/vision.js).
const TURN = { right: 0, down: 90, left: 180, up: 270 };
const ring = (gap) => `<svg class="ring" viewBox="0 0 10 10" aria-hidden="true"><path d="M8.873 6A4 4 0 1 1 8.873 4" transform="rotate(${TURN[gap]} 5 5)"/></svg>`;

export const capture = {
  run(ctx) {
    return runDrill(ctx, {
      kicker: 'Vision',
      title: 'Target Capture',
      rule: 'Start with your eyes on the dot. A tiny ring flashes near an edge. Tap the ring with its gap facing the same way.',
      strip: 'FIND THE RING · MATCH ITS GAP',
      pad: 'plain',
      choices: GAP_DIRS.map((g) => ({ id: g, label: `Gap ${g}`, html: ring(g) })),
      tapWindow: 2500,
      demo: { html: `<div class="mini"><div class="mini__phone mini__phone--eyes"><i class="mini__ring">${ring('left')}</i></div>
        <p class="mini__cap">Ring flashes → its gap faces left → tap that one</p></div>` },
      next({ practice, easy, level }) {
        const t = ctx.session.content.capture();
        const big = practice || easy;
        const { flashMs, sizePx } = captureAt(level);
        return {
          answer: t.gap,
          answerLabel: t.gap.toUpperCase(),
          fg: '--cue-fg',
          flashMs: big ? 900 : flashMs,
          html: `<div class="cue cue--periph">
                   <div class="rx__fix rx__fix--lock"></div>
                   <div class="flash flash--ring" style="--size:${big ? 44 : sizePx}px;${at(t)}">${ring(t.gap)}</div>
                 </div>`,
        };
      },
    });
  },
};
