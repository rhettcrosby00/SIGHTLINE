// Challenge pillar, brain drills: Quick Math (odd/even) and Quick Questions
// (2–4 choices, each tied to a cone color). Both run on the shared tap/cone
// runner; problems and questions come from the session (no repeats).

import { runDrill } from './reaction.js';
import { mini } from './common.js';
import { cueById } from '../lib/colors.js';

const ARROW = { front: '↑', right: '→', back: '↓', left: '←' };

// ---- Quick Math ----------------------------------------------------------------
// Odd → BLUE (left cone), Even → RED (right cone).

const ODD = cueById.blue;
const EVEN = cueById.red;

export const quickMath = {
  run(ctx) {
    return runDrill(ctx, {
      kicker: 'Challenge',
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
        // Odd/even stays balanced (never more than 3 in a row); no problem repeats.
        const p = ctx.session.content.math({ hard: hard && !practice });
        const odd = p.odd;
        const c = cueById[p.answer];
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
    return runDrill(ctx, {
      kicker: 'Challenge',
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
        // No question repeats in a session; answers and colors reshuffle every time.
        const item = ctx.session.content.questions();
        if (!item) return null;
        const pairs = item.choices.map((ch) => ({ text: ch.text, c: cueById[ch.color] }));
        const right = cueById[item.answer];
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
