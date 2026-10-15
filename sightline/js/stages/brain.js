// Challenge pillar, brain drills: Quick Math (odd/even) and Quick Questions
// (2–4 color-coded answer buttons). Both run on the shared tap runner;
// problems and questions come from the session (no repeats).

import { runDrill } from './reaction.js';
import { mini } from './common.js';
import { cueById } from '../lib/colors.js';

// ---- Quick Math ----------------------------------------------------------------
// Odd → the BLUE button, Even → the RED button.

const ODD = cueById.blue;
const EVEN = cueById.red;

export const quickMath = {
  run(ctx) {
    return runDrill(ctx, {
      kicker: 'Challenge',
      title: 'Quick Math',
      rule: 'Solve the problem in your head. Odd answer → tap ODD. Even answer → tap EVEN.',
      strip: 'IS THE ANSWER ODD OR EVEN?',
      pad: 'oddeven',
      practice: 2,
      tapWindow: 3000,
      demo: {
        pad: 'oddeven',
        frames: [
          { cue: mini.text('7 + 4'), answer: ODD.id, caption: '7 + 4 = 11 → ODD' },
          { cue: mini.text('3 × 2'), answer: EVEN.id, caption: '3 × 2 = 6 → EVEN' },
        ],
      },
      next({ hard, practice }) {
        // Odd/even stays balanced (never more than 3 in a row); no problem repeats.
        const p = ctx.session.content.math({ hard: hard && !practice });
        const odd = p.odd;
        const c = cueById[p.answer];
        return {
          answer: c.id,
          answerLabel: `${odd ? 'ODD' : 'EVEN'} (${p.value})`,
          html: `<div class="cue cue--math"><span class="math__q">${p.text}</span></div>`,
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
      strip: 'TAP THE RIGHT ANSWER',
      pad: 'list',
      practice: 0,
      tapWindow: 7000,
      fbMs: 1100,
      demo: {
        pad: 'list',
        frames: [{
          cue: mini.text('Days in a week?'), answer: 'red', caption: 'Tap the right answer',
          buttons: [{ id: 'green', label: '5' }, { id: 'red', label: '7' }, { id: 'blue', label: '10' }],
        }],
      },
      next() {
        // No question repeats in a session; answers and colors reshuffle every time.
        const item = ctx.session.content.questions();
        if (!item) return null;
        const pairs = item.choices.map((ch) => ({ text: ch.text, c: cueById[ch.color] }));
        const right = cueById[item.answer];
        return {
          answer: right.id,
          answerLabel: item.a,
          buttons: pairs.map((p) => ({ id: p.c.id, label: p.text })),
          html: `<div class="cue cue--quiz"><p class="quiz__q">${item.q}</p></div>`,
        };
      },
    });
  },
};
