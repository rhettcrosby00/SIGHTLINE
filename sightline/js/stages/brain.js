// Brain drills: Quick Math (odd/even) and Quick Questions (2–4 choices, each
// tied to a cone color). Both run on the shared tap/cone runner.

import { runDrill } from './reaction.js';
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
      tapLines: [`Solve it.`, `ODD → ${ODD.label} ${ODD.shape}`, `EVEN → ${EVEN.label} ${EVEN.shape}`],
      coneLines: [`Solve it.`, `ODD → ${ODD.label} cone (left)`, `EVEN → ${EVEN.label} cone (right)`],
      tapWindow: 3000,
      coneShow: [3200, 2500],
      fbMs: 600,
      next({ hard, cone }) {
        let p;
        // Avoid long same-parity runs so guessing doesn't pay.
        do { p = problem(hard); } while (streak >= 3 && p.value % 2 === lastParity);
        const parity = p.value % 2;
        streak = parity === lastParity ? streak + 1 : 1;
        lastParity = parity;
        const odd = parity === 1;
        const c = odd ? ODD : EVEN;
        return {
          answer: c.id,
          padLabels: { [ODD.id]: 'ODD', [EVEN.id]: 'EVEN' },
          reveal: `= ${p.value}`,
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
      tapLines: ['Read it. Tap the right answer.'],
      coneLines: ['Read it.', 'Go to the cone for the right answer.'],
      tapWindow: 7000,
      coneShow: [6500, 5000],
      fbMs: 1000,
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
          padLabels: Object.fromEntries(pairs.map((p) => [p.c.id, p.text])),
          reveal: item.a,
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
