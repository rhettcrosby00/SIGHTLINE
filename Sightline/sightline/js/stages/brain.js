// Brain drills: Quick Math (odd/even) and Quick Questions (2–4 choices, each
// tied to a cone color). Both run on the shared tap/cone runner.

import { runDrill } from './reaction.js';
import { mini } from './common.js';
import { CUES, cueById } from '../lib/colors.js';
import { randInt, shuffle } from '../lib/rng.js';
import { QUESTIONS } from '../data/questions.js';

const ARROW = { front: '↑', right: '→', back: '↓', left: '←' };
const DIR_ORDER = ['front', 'left', 'right', 'back'];   // list order for choices

// ---- Quick Math ----------------------------------------------------------------
// Odd → BLUE (left cone), Even → RED (right cone).

const ODD = cueById.blue;
const EVEN = cueById.red;

function problem(hard) {
  const kind = randInt(0, hard ? 3 : 2);
  let a, b, c, text, value;
  switch (kind) {
    case 0:
      a = hard ? randInt(12, 49) : randInt(2, 15); b = hard ? randInt(12, 49) : randInt(2, 15);
      text = `${a} + ${b}`; value = a + b; break;
    case 1:
      a = hard ? randInt(25, 70) : randInt(6, 20); b = randInt(hard ? 5 : 1, a - 1);
      text = `${a} − ${b}`; value = a - b; break;
    case 2:
      a = hard ? randInt(3, 12) : randInt(2, 9); b = hard ? randInt(3, 9) : randInt(2, 5);
      text = `${a} × ${b}`; value = a * b; break;
    default:
      a = randInt(2, 7); b = randInt(2, 7); c = randInt(1, 9);
      if (Math.random() < 0.5 || a * b - c < 1) { text = `${a} × ${b} + ${c}`; value = a * b + c; }
      else { text = `${a} × ${b} − ${c}`; value = a * b - c; }
  }
  return { text, value };
}

export const quickMath = {
  run(ctx) {
    let lastParity = null;
    let streak = 0;
    return runDrill(ctx, {
      kicker: 'Brain',
      title: 'Quick Math',
      rule: 'Solve the problem in your head. Odd answer → tap ODD. Even answer → tap EVEN.',
      ruleCone: `Solve the problem in your head. Odd answer → ${ODD.label} cone (left). Even answer → ${EVEN.label} cone (right).`,
      strip: 'IS THE ANSWER ODD OR EVEN?',
      stripCone: `ODD = ${ODD.label} ← · EVEN = ${EVEN.label} →`,
      pad: 'oddeven',
      practice: 2,
      tapWindow: 3000,
      coneShow: [3200, 2500],
      demo: {
        pad: 'oddeven',
        frames: [
          { cue: mini.text('7 + 4'), answer: ODD.id, caption: '7 + 4 = 11 → ODD' },
          { cue: mini.text('3 × 2'), answer: EVEN.id, caption: '3 × 2 = 6 → EVEN' },
        ],
        coneFrames: [
          { cue: mini.text('7 + 4'), answer: ODD.id, caption: '11 is ODD → run to the blue cone' },
          { cue: mini.text('3 × 2'), answer: EVEN.id, caption: '6 is EVEN → run to the red cone' },
        ],
      },
      next({ hard, cone, practice }) {
        let p;
        // Avoid long same-parity runs so guessing doesn't pay.
        do { p = problem(hard && !practice); } while (streak >= 3 && p.value % 2 === lastParity);
        const parity = p.value % 2;
        streak = parity === lastParity ? streak + 1 : 1;
        lastParity = parity;
        const odd = parity === 1;
        const c = odd ? ODD : EVEN;
        return {
          answer: c.id,
          answerLabel: `${odd ? 'ODD' : 'EVEN'} (${p.value})`,
          coneReveal: `${p.text} = ${p.value} · ${odd ? 'ODD' : 'EVEN'}`,
          html: `<div class="cue cue--math">
                   <span class="math__q">${p.text}</span>
                   ${cone ? `<span class="math__key">
                      <span style="color:${ODD.hex}">← ${ODD.shape} ODD</span>
                      <span style="color:${EVEN.hex}">EVEN ${EVEN.shape} →</span></span>` : ''}
                 </div>`,
        };
      },
    });
  },
};

// ---- Quick Questions -----------------------------------------------------------

export const quickQuestions = {
  run(ctx) {
    let deck = shuffle(QUESTIONS);
    return runDrill(ctx, {
      kicker: 'Brain',
      title: 'Quick Questions',
      rule: 'Read the question and tap the right answer.',
      ruleCone: 'Each answer has a color. Run to the cone for the right answer.',
      strip: 'TAP THE RIGHT ANSWER',
      stripCone: 'RUN TO THE RIGHT ANSWER’S CONE',
      pad: 'list',
      practice: 0,
      tapWindow: 7000,
      coneShow: [6500, 5000],
      fbMs: 1100,
      demo: {
        pad: 'list',
        frames: [{
          cue: mini.text('Days in a week?'), answer: 'red', caption: 'Tap the right answer',
          buttons: [{ id: 'green', label: '5' }, { id: 'red', label: '7' }, { id: 'blue', label: '10' }],
        }],
        coneFrames: [{
          cue: mini.text('Days in a week? <small>■ 5 · ▲ 7 · ● 10</small>'), answer: 'red',
          caption: '7 is RED ▲ → run to the red cone',
        }],
      },
      next({ cone }) {
        if (!deck.length) deck = shuffle(QUESTIONS);
        const item = deck.pop();
        const choices = shuffle([item.a, ...shuffle(item.w).slice(0, 3)]);
        // Random colors each time so positions can't be memorized.
        const colors = shuffle(CUES).slice(0, choices.length);
        const pairs = choices.map((text, i) => ({ text, c: colors[i] }))
          .sort((x, y) => DIR_ORDER.indexOf(x.c.dir) - DIR_ORDER.indexOf(y.c.dir));
        const right = pairs.find((p) => p.text === item.a).c;
        return {
          answer: right.id,
          answerLabel: item.a,
          buttons: pairs.map((p) => ({ id: p.c.id, label: p.text })),
          coneReveal: `Answer: <span style="color:${right.hex}">${right.shape} ${item.a}</span>`,
          html: `<div class="cue cue--quiz">
                   <p class="quiz__q">${item.q}</p>
                   ${cone ? `<ul class="quiz__choices">${pairs.map((p) => `
                     <li style="color:${p.c.hex}">
                       <span class="quiz__mark">${ARROW[p.c.dir]} ${p.c.shape}</span><span>${p.text}</span>
                     </li>`).join('')}</ul>` : ''}
                 </div>`,
        };
      },
    });
  },
};
