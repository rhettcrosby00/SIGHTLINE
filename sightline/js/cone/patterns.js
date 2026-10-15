// PLANNED drills: a known pattern (5-10-5, square, T-drill). The athlete knows
// the route; the phone only says when to go and times the walk back. This is
// change-of-direction speed, a different skill from reacting to a cue you
// can't predict (Reactive, the default), which is closer to game demands.
// Pure module (no DOM), so the tests can check every pattern and pace.

import { TIMING, runSeconds } from './timing.js';

// legs: [direction, yards]; cones: where to put them (yards: x to the right,
// y toward the phone); start: the cone the athlete starts at.
export const PATTERNS = {
  proagility: {
    label: '5-10-5', name: 'Pro agility (5-10-5)',
    legs: [['R', 5], ['L', 10], ['R', 5]],
    cones: [{ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }], start: 1,
    how: 'Start at the middle cone. Sprint 5 yd right and touch the line, 10 yd left and touch, then 5 yd back through the middle.',
  },
  square: {
    label: 'Square', name: 'Square (5 yd)',
    legs: [['F', 5], ['R', 5], ['B', 5], ['L', 5]],
    cones: [{ x: 0, y: 0 }, { x: 0, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 0 }], start: 0,
    how: 'Sprint 5 yd forward, shuffle 5 yd right, backpedal 5 yd, shuffle 5 yd left to finish where you started.',
  },
  tdrill: {
    label: 'T-drill', name: 'T-drill',
    legs: [['F', 10], ['L', 5], ['R', 10], ['L', 5], ['B', 10]],
    cones: [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: -5, y: 10 }, { x: 5, y: 10 }], start: 0,
    how: 'Sprint 10 yd to the middle cone, shuffle 5 yd left, 10 yd right, 5 yd left, then backpedal 10 yd to the start.',
  },
};
export const PATTERN_IDS = Object.keys(PATTERNS);

export const patternYards = (id) => PATTERNS[id].legs.reduce((a, [, yd]) => a + yd, 0);

// One run of the pattern: react, every leg, a turn between legs, reset.
export function patternRunSeconds(id, pace) {
  const legs = PATTERNS[id].legs;
  return TIMING.paces[pace] * (TIMING.reactionS + legs.reduce((a, [, yd]) => a + runSeconds(yd), 0) + (legs.length - 1) * TIMING.turnS + TIMING.resetS);
}

// Walk back and recover before the next run: speed work needs near-full
// recovery (the pace's work-to-rest ratio), 10–60 s.
export const PLANNED_RECOVERY_S = [10, 60];
export function patternRecoverySeconds(id, pace) {
  const [lo, hi] = PLANNED_RECOVERY_S;
  return Math.min(hi, Math.max(lo, Math.round(patternRunSeconds(id, pace) * TIMING.restRatio[pace])));
}
