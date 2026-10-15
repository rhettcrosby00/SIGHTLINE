// Eye-drill content: pursuit paths, saccade targets, gaze-stabilization letters.

import { spaced, dist } from '../lib/rng.js';

const PATH_IDS = ['horizontal', 'vertical', 'diag-down', 'diag-up', 'circle', 'figure-8'];

// Smooth Pursuit: a fresh mix of paths, speeds and directions each session.
export function pursuitPlan(rng) {
  return (count, hard) => rng.shuffle(PATH_IDS).slice(0, count).map((id) => ({
    id,
    period: (hard ? 2000 : 3200) * rng.range(0.85, 1.15),   // ms per full sweep
    dir: rng.chance(0.5) ? -1 : 1,
  }));
}

// Saccade Jumps: targets anywhere on screen away from the center
// (max(|x|,|y|) ≥ 0.4), each at least MIN_SACCADE_DIST from the last.
// Numbers 1–9 follow the spaced rule.
export const MIN_SACCADE_DIST = 0.8;
export function saccadeStream(rng) {
  const num = spaced(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  let last = null;
  const sample = () => {
    for (;;) {
      const p = { x: rng.range(-1, 1), y: rng.range(-1, 1) };
      if (Math.max(Math.abs(p.x), Math.abs(p.y)) >= 0.4) return p;
    }
  };
  return () => {
    let p;
    for (let i = 0; i < 25; i++) {
      p = sample();
      if (!last || dist(p, last) >= MIN_SACCADE_DIST) break;
    }
    // The mirror point is always ≥ 0.8 away because targets avoid the center.
    if (last && dist(p, last) < MIN_SACCADE_DIST) p = { x: -last.x, y: -last.y };
    last = p;
    return { ...p, num: num() };
  };
}

// Gaze Stabilization letters: no look-alikes (no I, L, O, Q, no digits).
export const GAZE_LETTERS = 'ABCDEFGHJKMNPRSTUVWXYZ'.split('');
export function gazeStream(rng) {
  return spaced(rng, GAZE_LETTERS);
}

// Quiet Eye: where the target sits (-1..1, kept off the edges, never near the
// last spot) and which symbol flashes inside it (spaced rule).
export const QE_SYMBOLS = ['▲', '●', '■', '◆'];
export function quietEyeStream(rng) {
  const symbol = spaced(rng, QE_SYMBOLS);
  let last = null;
  return () => {
    let p;
    for (let i = 0; i < 25; i++) {
      p = { x: rng.range(-0.6, 0.6), y: rng.range(-0.6, 0.6) };
      if (!last || dist(p, last) >= 0.5) break;
    }
    last = p;
    return { ...p, symbol: symbol() };
  };
}
