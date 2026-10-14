// Quick Math problems, generated on the fly. Odd → BLUE (left), even → RED
// (right). Parity is balanced with at most 3 of the same in a row. No problem
// repeats within a session, and problems from recent sessions are avoided.

import { binary } from '../lib/rng.js';

export const ODD_CUE = 'blue';
export const EVEN_CUE = 'red';

function make(rng, hard) {
  const kind = rng.int(0, hard ? 3 : 2);
  let a, b, c;
  switch (kind) {
    case 0:
      a = hard ? rng.int(12, 49) : rng.int(2, 15); b = hard ? rng.int(12, 49) : rng.int(2, 15);
      return { text: `${a} + ${b}`, value: a + b };
    case 1:
      a = hard ? rng.int(25, 70) : rng.int(6, 20); b = rng.int(hard ? 5 : 1, a - 1);
      return { text: `${a} − ${b}`, value: a - b };
    case 2:
      a = hard ? rng.int(3, 12) : rng.int(2, 9); b = hard ? rng.int(3, 9) : rng.int(2, 5);
      return { text: `${a} × ${b}`, value: a * b };
    default:
      a = rng.int(2, 7); b = rng.int(2, 7); c = rng.int(1, 9);
      return a * b - c >= 1 && rng.chance(0.5)
        ? { text: `${a} × ${b} − ${c}`, value: a * b - c }
        : { text: `${a} × ${b} + ${c}`, value: a * b + c };
  }
}

//   recent: array of Sets of problem texts from recent sessions.
export function mathStream(rng, { recent = [] } = {}) {
  const seen = new Set();
  const avoid = new Set(recent.flatMap((s) => [...s]));
  const wantOdd = binary(rng, { p: 0.5, maxTrue: 3, maxFalse: 3 });
  return ({ hard = false } = {}) => {
    const odd = wantOdd();
    let p = null;
    for (let i = 0; i < 400; i++) {
      const cand = make(rng, hard);
      if (cand.value % 2 !== (odd ? 1 : 0) || seen.has(cand.text)) continue;
      if (avoid.has(cand.text) && i < 300) continue;   // only fall back to a recent one if truly stuck
      p = cand;
      break;
    }
    seen.add(p.text);
    return { ...p, odd, answer: odd ? ODD_CUE : EVEN_CUE };
  };
}
