// Quick Questions: a no-repeat deck (recent sessions' questions rest), with
// answer order and colors shuffled each time. The right answer's color
// follows the spaced rule, so it's never the same color twice in a row.

import { CUES } from '../lib/colors.js';
import { deck, spaced } from '../lib/rng.js';
import { QUESTIONS } from '../data/questions.js';

export function questionStream(rng, { recent = [] } = {}) {
  const cards = deck(rng, QUESTIONS, { key: (q) => q.q, recent });
  const answerColor = spaced(rng, CUES.map((c) => c.id));
  return {
    next() {
      const item = cards.next();
      if (!item) return null;
      const wrong = rng.shuffle(item.w).slice(0, 3);
      const right = answerColor();
      const others = rng.shuffle(CUES.map((c) => c.id).filter((id) => id !== right));
      const choices = rng.shuffle([
        { text: item.a, color: right },
        ...wrong.map((text, i) => ({ text, color: others[i] })),
      ]);
      return { q: item.q, a: item.a, answer: right, choices };
    },
    used: cards.used,
  };
}
