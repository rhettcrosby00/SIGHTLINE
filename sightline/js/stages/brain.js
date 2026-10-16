// Extras, brain drill: Quick Math (odd/even). Runs on the shared tap runner;
// problems come from the session (no repeats).

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
