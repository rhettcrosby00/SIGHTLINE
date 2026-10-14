// Trial streams for the reaction drills. Pure data (no HTML); the stages turn
// each trial into a screen. Every stream is built from one session's
// generator, so the same seed replays the same trials.

import { CUES } from '../lib/colors.js';
import { spaced, binary, dist } from '../lib/rng.js';

export const SIDES = ['front', 'right', 'back', 'left'];

// Gap between cues: 0.8–1.6 s, shorter on Hard, so the rhythm can't be guessed.
export const GAP_MS = [800, 1600];
export const HARD_GAP = 0.75;
export function gaps(rng) {
  return (hard) => rng.range(GAP_MS[0], GAP_MS[1]) * (hard ? HARD_GAP : 1);
}

// Color Call: a color (spaced rule); in Cone mode about half are arrows.
export function colorCallStream(rng, { cone }) {
  const color = spaced(rng, CUES, { key: (c) => c.id });
  return () => ({ color: color().id, form: cone && rng.chance(0.5) ? 'arrow' : 'fill' });
}

// Go / No-Go: about 65% go, at most 3 go or 2 no-go in a row.
// Cone mode adds an arrow whose side follows the spaced rule.
export function goNoGoStream(rng) {
  const go = binary(rng, { p: 0.65, maxTrue: 3, maxFalse: 2 });
  const side = spaced(rng, SIDES);
  return () => ({ go: go(), side: side() });
}

// Stroop: a color word in a different ink. The word is never the ink color.
// Besides the other cone colors, words include non-cone colors, which gives
// 4 inks × 13 words = 52 pairs. No pair repeats within a session. Inks come
// in shuffled blocks of all four (a block never starts with the ink that
// ended the last one), so the same ink is never back-to-back and never more
// than 2 in any 5 — all the way to the 52nd. Returns null after that.
export const STROOP_EXTRA_WORDS = ['PURPLE', 'ORANGE', 'PINK', 'BROWN', 'WHITE', 'GRAY', 'GOLD', 'BLACK', 'TEAL', 'NAVY'];
export const STROOP_WORDS = [...CUES.map((c) => c.label), ...STROOP_EXTRA_WORDS];
export const STROOP_PAIRS = CUES.flatMap((ink) =>
  STROOP_WORDS.filter((w) => w !== ink.label).map((word) => ({ ink: ink.id, word })));

export function stroopStream(rng) {
  const inks = CUES.map((c) => c.id);
  const words = Object.fromEntries(inks.map((ink) =>
    [ink, rng.shuffle(STROOP_PAIRS.filter((p) => p.ink === ink).map((p) => p.word))]));
  const order = [];
  const blocks = STROOP_PAIRS.length / inks.length;
  for (let b = 0; b < blocks; b++) {
    let block;
    do { block = rng.shuffle(inks); } while (block[0] === order[order.length - 1]);
    order.push(...block);
  }
  let i = 0;
  return () => {
    if (i >= order.length) return null;
    const ink = order[i++];
    return { ink, word: words[ink].pop() };
  };
}

// Peripheral Flash: a color (spaced) flashed at a side (spaced) and a random
// spot along that edge, at least MIN_EDGE_DIST from the last spot.
// Positions are in -1..1 across the cue area; edges sit at ±1.
export const MIN_EDGE_DIST = 0.6;
const edgePoint = (side, t) => ({
  front: { x: t, y: -1 }, back: { x: t, y: 1 }, left: { x: -1, y: t }, right: { x: 1, y: t },
}[side]);

export function peripheralStream(rng) {
  const color = spaced(rng, CUES, { key: (c) => c.id });
  const side = spaced(rng, SIDES);
  const digit = spaced(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  let last = null;
  return ({ lure = false } = {}) => {
    const s = side();
    let p;
    for (let i = 0; i < 25; i++) {
      p = { ...edgePoint(s, rng.range(-0.8, 0.8)), side: s };
      if (!last || dist(p, last) >= MIN_EDGE_DIST) break;
    }
    if (last && dist(p, last) < MIN_EDGE_DIST) {
      // The side always differs from the last one, so one end of this edge is far enough.
      const ends = [edgePoint(s, -0.8), edgePoint(s, 0.8)];
      p = { ...(dist(ends[0], last) > dist(ends[1], last) ? ends[0] : ends[1]), side: s };
    }
    last = p;
    const trial = { color: color().id, ...p };
    if (lure) {
      const other = SIDES.filter((x) => x !== s);
      trial.lure = { ...edgePoint(rng.pick(other), rng.range(-0.8, 0.8)), digit: digit() };
    }
    return trial;
  };
}
