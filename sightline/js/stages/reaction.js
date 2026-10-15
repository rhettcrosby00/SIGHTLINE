// Reaction drills: Color Call, Go/No-Go, Stroop, Peripheral Flash.
//
// Every drill runs the same way:
//   1. How-to card: the rule in one sentence plus a looping example.
//   2. Practice (Instructions: Full): a few slow, unscored cues; the right
//      button pulses if the athlete hesitates.
//   3. "NOW FOR REAL" countdown, then the scored part with the rule pinned at
//      the top. It starts gentle and speeds up as the drill goes on.
// Steps 1–2 and the countdown run inside hold(), so they never use drill time.
//
// TAP mode: big answer buttons; we score correct / wrong / too slow and time.
// CONE mode: no input. Each cue fills the screen (a color or an arrow), then a
// "back to center" pause.

import { howTo, countdown, mini } from './common.js';
import { cueById } from '../lib/colors.js';
import { tone, cues } from '../lib/audio.js';
import { icon } from '../lib/icons.js';
import { esc } from '../lib/text.js';

const ROT = { front: 0, right: 90, back: 180, left: 270 };
const GRID = ['green', 'red', 'blue', 'yellow'];   // 2×2 answer grid, reading order

const arrow = (dir, cls = '') =>
  `<svg class="arrow ${cls}" viewBox="0 0 100 100" style="transform:rotate(${ROT[dir]}deg)" aria-hidden="true">
     <path d="M50 4 L94 50 H66 V96 H34 V50 H6 Z"/></svg>`;

const fill = (c, inner = '') =>
  `<div class="cue cue--fill" style="--c:${c.hex};--ink:${c.ink}">
     ${inner || `<span class="cue__shape">${c.shape}</span><span class="cue__label">${c.label}</span>`}
   </div>`;

export const secs = (ms) => `${(ms / 1000).toFixed(2)} s`;

// Place a flash at a point in -1..1 across the cue area, kept inside the edges.
const at = (p) => `left:calc(50% + ${p.x.toFixed(3)} * (50% - var(--size) / 2 - 6px));`
  + `top:calc(50% + ${p.y.toFixed(3)} * (50% - var(--size) / 2 - 6px));transform:translate(-50%, -50%)`;

// Speed ramps down to 75% of the starting window by the end of a drill.
const ramp = (prog) => 1 - 0.25 * Math.min(1, Math.max(0, prog));
const GENTLE_CUES = 3;      // first scored cues get extra time…
const GENTLE_FACTOR = 1.5;  // …this much

// ---- Shared runner -------------------------------------------------------------
// Also used by the brain drills. Spec fields:
//   kicker?, title, rule, ruleCone, strip, stripCone, demo, practice (count)
//   pad: 'colors' | 'oddeven' | 'list' | 'anywhere'
//   tapWindow (ms), coneShow? [normal, hard] ms, fbMs?
//   next({ hard, cone, prog, practice }) -> trial
// Trial fields:
//   html, answer (cue id, 'go', or null = hold), answerLabel (for "It was …"),
//   kind?, flashMs?, buttons? [{ id, label }] for 'list' pads, coneReveal?
// next() returns null when the drill's content pool is used up; the drill then
// ends early rather than repeat anything. All randomness comes from
// ctx.session (js/session.js), so a seed replays the session exactly.

export async function runDrill(ctx, spec) {
  const cone = ctx.settings.mode === 'cones';
  await howTo(ctx, {
    kicker: spec.kicker ?? 'Challenge',
    title: spec.title,
    rule: cone ? spec.ruleCone : spec.rule,
    demo: spec.demo,
  });
  return cone ? runCone(ctx, spec) : runTap(ctx, spec);
}

function padButtons(spec, trial) {
  const btn = (c, label) => `
    <button type="button" class="pad__btn" data-id="${c.id}" style="--c:${c.hex};--ink:${c.ink}">
      <span class="pad__shape" aria-hidden="true">${c.shape}</span><span class="pad__label">${label}</span>
    </button>`;
  if (spec.pad === 'colors') return GRID.map((id) => btn(cueById[id], cueById[id].label)).join('');
  if (spec.pad === 'oddeven') return btn(cueById.blue, 'ODD') + btn(cueById.red, 'EVEN');
  if (spec.pad === 'list') return (trial?.buttons ?? []).map((b) => btn(cueById[b.id], b.label)).join('');
  return '';
}

async function runTap(ctx, spec) {
  const { el, settings, session, step, durationMs, sleep, now, remaining, hold } = ctx;
  const hard = settings.difficulty === 'hard';
  const anywhere = spec.pad === 'anywhere';
  const gapMs = session.content.gaps(step.id);
  const practiceN = settings.guide === 'brief' ? 0 : (spec.practice ?? 3);

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

  const showTrial = (trial) => {
    if (spec.pad === 'list') pad.innerHTML = padButtons(spec, trial);
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
        ruleEl.textContent = `PRACTICE ${i} of ${practiceN} · ${spec.strip}`;
        blank();
        await sleep(700);
        const trial = spec.next({ hard: false, cone: false, prog: 0, practice: true });
        if (!trial) break;
        showTrial(trial);
        let answered = false;
        sleep(1500).then(() => {
          if (answered) return;
          if (trial.answer == null) say('is-hint', 'Don’t tap — just hold…');
          else if (anywhere) say('is-hint', 'Tap anywhere!');
          else pad.querySelector(`[data-id="${trial.answer}"]`)?.classList.add('is-hint');
        }, () => {});
        const resp = await waitTap(trial.answer == null ? 2200 : 8000);
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
    const prog = 1 - left / durationMs;
    const gentle = stats.trials < GENTLE_CUES ? GENTLE_FACTOR : 1;
    const windowMs = spec.tapWindow * (hard ? 0.75 : 1) * ramp(prog) * gentle;
    const gap = gapMs(hard);
    if (left < gap + windowMs + 400) break;

    blank();
    await sleep(gap);

    const trial = spec.next({ hard, cone: false, prog, practice: false });
    if (!trial) break;
    countEl.textContent = `#${stats.trials + 1}`;
    showTrial(trial);
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

async function runCone(ctx, spec) {
  const { el, settings, session, step, durationMs, sleep, remaining, hold } = ctx;
  const hard = settings.difficulty === 'hard';
  const practiceN = settings.guide === 'brief' ? 0 : Math.min(2, spec.practice ?? 2);
  const jitter = session.content.gaps(`${step.id}:back`);

  el.innerHTML = `
    <div class="rx rx--cone">
      <div class="rx__strip"><span class="rx__rule"></span><span class="rx__count"></span></div>
      <div class="rx__cue"></div>
    </div>`;
  const ruleEl = el.querySelector('.rx__rule');
  const countEl = el.querySelector('.rx__count');
  const cueBox = el.querySelector('.rx__cue');
  const back = (reveal = '', text = 'BACK TO CENTER') => {
    cueBox.innerHTML = `<div class="rx__back">${reveal ? `<p class="rx__reveal">${reveal}</p>` : ''}
      <div class="rx__fix"></div>${text ? `<p>${text}</p>` : ''}</div>`;
  };

  // One cue: show it (flash cues disappear early), then back to center.
  const playCue = async (trial, showMs, backMs) => {
    cueBox.innerHTML = trial.html;
    tone(trial.answer == null ? 330 : 740, { dur: 0.12, gain: 0.12 });
    if (trial.flashMs) {
      await sleep(trial.flashMs);
      cueBox.querySelectorAll('.flash').forEach((n) => n.remove());
      await sleep(Math.max(0, showMs - trial.flashMs));
    } else {
      await sleep(showMs);
    }
    back(trial.coneReveal);
    await sleep(backMs);
  };

  const [showN, showH] = spec.coneShow ?? [1600, 1200];

  if (practiceN) {
    await hold(async () => {
      for (let i = 1; i <= practiceN; i++) {
        ruleEl.textContent = `PRACTICE ${i} of ${practiceN} · ${spec.stripCone}`;
        back('', 'GET READY');
        await sleep(1200);
        const trial = spec.next({ hard: false, cone: true, prog: 0, practice: true });
        if (!trial) break;
        await playCue(trial, showN * 1.6, 2600);
      }
    });
  }

  ruleEl.textContent = spec.stripCone;
  back('', '');
  await hold(() => countdown(ctx, cueBox, practiceN ? 'NOW FOR REAL' : 'GET SET'));

  let n = 0;
  while (true) {
    const left = remaining();
    const prog = 1 - left / durationMs;
    const gentle = n < GENTLE_CUES ? 1.25 : 1;
    const showMs = (hard ? showH : showN) * ramp(prog) * gentle;
    // Time to get back to center, varied so the rhythm can't be guessed.
    const backMs = (hard ? 1700 : 2200) * ramp(prog) * (jitter(false) / 1200);
    if (left < showMs + 600) break;
    const trial = spec.next({ hard, cone: true, prog, practice: false });
    if (!trial) break;
    countEl.textContent = `#${++n}`;
    await playCue(trial, showMs, Math.min(backMs, Math.max(0, remaining() - showMs)));
  }
  back('', '');
  countEl.textContent = '';
  await sleep(Math.max(0, remaining()));
  return { cues: n };
}

// ---- Drills ------------------------------------------------------------------

export const colorCall = {
  run(ctx) {
    return runDrill(ctx, {
      title: 'Color Call',
      rule: 'A color fills the screen. Tap the button with the same color — as fast as you can.',
      ruleCone: 'A color fills the screen: run to that cone. If you see an arrow, run the way it points.',
      strip: 'TAP THE MATCHING COLOR',
      stripCone: 'COLOR → THAT CONE · ARROW → THAT WAY',
      pad: 'colors',
      tapWindow: 1400,
      demo: {
        pad: 'colors',
        frames: [
          { cue: mini.fill('red'), answer: 'red', caption: 'RED fills the screen → tap RED' },
          { cue: mini.fill('blue'), answer: 'blue', caption: 'BLUE → tap BLUE' },
        ],
        coneFrames: [
          { cue: mini.fill('red'), answer: 'red', caption: 'RED → run to the red cone' },
          { cue: mini.arrow('←'), answer: 'blue', caption: 'Arrow ← → run left (blue cone)' },
        ],
      },
      next() {
        const t = ctx.session.content.colorCall();
        const c = cueById[t.color];
        // Cone mode mixes color fills with arrow flashes.
        if (t.form === 'arrow') {
          return { answer: c.id, answerLabel: c.label, html: `<div class="cue cue--arrow">${arrow(c.dir)}</div>` };
        }
        return { answer: c.id, answerLabel: c.label, html: fill(c) };
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
      ruleCone: 'GREEN → go the way the arrow points. RED → freeze where you are.',
      strip: 'GREEN = TAP · RED = DON’T TOUCH',
      stripCone: 'GREEN = GO · RED = FREEZE',
      pad: 'anywhere',
      tapHint: `Tap anywhere on GREEN ${go.shape} · Hold on RED ${stop.shape}`,
      tapWindow: 1000,
      demo: {
        pad: 'anywhere',
        frames: [
          { cue: mini.fill('green'), answer: 'any', caption: 'GREEN → tap anywhere, fast' },
          { cue: mini.fill('red'), answer: null, caption: 'RED → don’t touch' },
        ],
        coneFrames: [
          { cue: mini.fill('green', '→'), answer: 'red', caption: 'GREEN + arrow → run that way' },
          { cue: mini.fill('red', '←'), answer: null, caption: 'RED → freeze' },
        ],
      },
      next({ cone }) {
        // About 65% go; never more than 3 go or 2 hold in a row.
        const t = ctx.session.content.goNoGo();
        const isGo = t.go;
        const c = isGo ? go : stop;
        const inner = cone
          ? `${arrow(t.side, 'arrow--ink')}<span class="cue__tag">${c.shape}</span>`
          : `<span class="cue__shape cue__shape--xl">${c.shape}</span>`;
        return { answer: isGo ? 'go' : null, answerLabel: 'GREEN', kind: isGo ? 'go' : 'nogo', html: fill(c, inner) };
      },
    });
  },
};

export const stroop = {
  run(ctx) {
    return runDrill(ctx, {
      title: 'Stroop',
      rule: 'You’ll see a color word. Tap the color of the INK it’s written in — not what the word says.',
      ruleCone: 'You’ll see a color word. Run to the color of the INK — not what the word says.',
      strip: 'TAP THE INK COLOR — NOT THE WORD',
      stripCone: 'RUN TO THE INK COLOR',
      pad: 'colors',
      tapWindow: 1700,
      demo: {
        pad: 'colors',
        frames: [
          { cue: mini.word('BLUE', 'yellow'), answer: 'yellow', caption: 'Says BLUE, ink is YELLOW → tap YELLOW' },
          { cue: mini.word('GREEN', 'red'), answer: 'red', caption: 'Says GREEN, ink is RED → tap RED' },
        ],
        coneFrames: [
          { cue: mini.word('BLUE', 'yellow'), answer: 'yellow', caption: 'Ink is YELLOW → run to the yellow cone' },
          { cue: mini.word('GREEN', 'red'), answer: 'red', caption: 'Ink is RED → run to the red cone' },
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
      title: 'Peripheral Flash',
      rule: 'Keep your eyes on the dot in the middle. A color flashes at the edge — tap that color.',
      ruleCone: 'Keep your eyes on the dot in the middle. A color flashes at the edge — run to that cone.',
      strip: 'EYES ON THE DOT · TAP THE FLASH COLOR',
      stripCone: 'EYES ON THE DOT · RUN TO THE FLASH',
      pad: 'colors',
      tapWindow: 1500,
      demo: {
        pad: 'colors',
        frames: [
          { cue: mini.periph('green', 'right'), answer: 'green', caption: 'Eyes on the dot. GREEN flashed → tap GREEN' },
          { cue: mini.periph('yellow', 'top'), answer: 'yellow', caption: 'YELLOW flashed → tap YELLOW' },
        ],
        coneFrames: [
          { cue: mini.periph('green', 'right'), answer: 'green', caption: 'GREEN flashed → run to the green cone' },
        ],
      },
      next({ hard, cone, practice }) {
        // Anywhere along an edge, never the same side twice in a row and well
        // away from the last spot. Hard adds a white number as a distractor.
        const t = ctx.session.content.peripheral({ lure: hard && !practice });
        const c = cueById[t.color];
        const lure = t.lure ? `<div class="flash flash--lure" style="${at(t.lure)}">${t.lure.digit}</div>` : '';
        const flashMs = practice ? 900 : cone ? (hard ? 400 : 600) : (hard ? 200 : 350);
        return {
          answer: c.id,
          answerLabel: c.label,
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
