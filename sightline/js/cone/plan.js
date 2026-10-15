// Cone Drill planner: turns a setup + seed into every cue of every set before
// the drill starts. Pure module (no DOM), so the tests can simulate thousands
// of sets and the same seed always replays the same drill.
//
// Rules:
//   - Each set is balanced: every cone comes up the same number of times (±1).
//   - 3+ cones: never the same cone twice in a row, never more than 2 in any 5.
//   - 2 cones: never 3 in a row (strict alternation would be predictable).
//   - Fake-outs (HOLD) are extra cues: never first in a set, never back-to-back.
//   - Reverse cues (arrows only, when the opposite direction is in use):
//     never first, never back-to-back.
//   - Random / peripheral cue spots never repeat back-to-back.
//   - Time between cues varies ±15% around the chosen speed.

import { createRng, spaced } from '../lib/rng.js';
import { CUES } from './cues/index.js';
import { intervalMs, JITTER, FAKE_RATES, REVERSE_RATE, COUNTDOWN_MS } from './config.js';

// Cue spots in -1..1 screen space. RANDOM: a 3×3 grid. PERIPHERAL: the 8
// spots around the edge (the eyes stay on the center dot).
export const GRID_SPOTS = [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((x) => ({ id: `${x},${y}`, x, y })));
const EDGE_SPOTS = GRID_SPOTS.filter((p) => p.x !== 0 || p.y !== 0);

// Does cone `k` fit next, given the cues so far?
function fits(out, k, coneCount) {
  const last = out[out.length - 1];
  if (coneCount === 2) return !(last === k && out[out.length - 2] === k);
  if (last === k) return false;
  return out.slice(-4).filter((x) => x === k).length < 2;
}

// Balanced, rule-following order of `count` cues over `keys`.
function orderTargets(rng, keys, count) {
  const n = keys.length;
  for (let attempt = 0; attempt < 500; attempt++) {
    const base = Math.floor(count / n);
    const left = new Map(keys.map((k) => [k, base]));
    for (const k of rng.shuffle(keys).slice(0, count % n)) left.set(k, base + 1);
    const out = [];
    for (let i = 0; i < count; i++) {
      const allowed = keys.filter((k) => left.get(k) > 0 && fits(out, k, n));
      if (!allowed.length) break;
      // Lean toward cones with the most cues left so the set stays balanced to the end.
      const weights = allowed.map((k) => left.get(k) ** 2);
      let r = rng.next() * weights.reduce((a, b) => a + b, 0);
      let pick = allowed[allowed.length - 1];
      for (let j = 0; j < allowed.length; j++) { r -= weights[j]; if (r <= 0) { pick = allowed[j]; break; } }
      out.push(pick);
      left.set(pick, left.get(pick) - 1);
    }
    if (out.length === count) return out;
  }
  throw new Error(`Could not order ${count} cues over ${n} cones`);
}

function planSet(rng, setup, cue, targets) {
  const base = intervalMs(setup);
  const fakeRate = FAKE_RATES[setup.fakes] ?? 0;

  let goCount;
  let holdCount;
  if (setup.setMode === 'timed') {
    const slots = Math.max(2, Math.round((setup.timedSec * 1000) / base));
    holdCount = Math.round(slots * fakeRate);
    goCount = slots - holdCount;
  } else {
    goCount = setup.reps;
    holdCount = Math.round(goCount * fakeRate);
  }
  holdCount = Math.min(holdCount, goCount);

  const byKey = Object.fromEntries(targets.map((t) => [t.key, t]));
  const order = orderTargets(rng, targets.map((t) => t.key), goCount);

  // Fake-outs go into different gaps after go cues: never first, never adjacent.
  const holdAfter = new Set(rng.shuffle(Array.from({ length: goCount }, (_, i) => i + 1)).slice(0, holdCount));

  const events = [];
  order.forEach((key, i) => {
    events.push({ type: 'go', key });
    if (holdAfter.has(i + 1)) events.push({ type: 'hold' });
  });

  // Faces: mixed decides color vs arrow; reverse only on eligible arrow cues.
  let lastReverse = -2;
  events.forEach((e, i) => {
    if (e.type !== 'go') { e.face = { kind: 'hold' }; return; }
    const target = byKey[e.key];
    const asArrow = cue.id === 'mixed' ? rng.chance(0.5) : cue.id === 'arrows';
    const eligible = setup.reverse && asArrow && cue.canReverse?.(target, setup) && i > 0 && i - lastReverse > 1;
    e.reverse = !!(eligible && rng.chance(REVERSE_RATE));
    if (e.reverse) lastReverse = i;
    e.face = cue.face(target, { asArrow, reverse: e.reverse });
  });

  // Where each cue appears on screen.
  if (setup.position !== 'center') {
    const spot = spaced(rng, setup.position === 'peripheral' ? EDGE_SPOTS : GRID_SPOTS, { key: (p) => p.id });
    for (const e of events) e.pos = spot();
  }

  // Time until the next cue, varied so the rhythm can't be guessed.
  for (const e of events) e.interval = Math.round(base * rng.range(1 - JITTER, 1 + JITTER));

  return {
    events,
    reps: goCount,
    holds: holdCount,
    durationMs: events.reduce((a, e) => a + e.interval, 0),
  };
}

// The whole drill: every set planned up front, plus the total running time.
export function planDrill(setup, seed) {
  const rng = createRng(seed);
  const cue = CUES[setup.cueType];
  const targets = cue.targets(setup);
  const sets = Array.from({ length: setup.sets }, (_, i) => planSet(rng.fork(`set:${i}`), setup, cue, targets));
  const restMs = setup.restSec * 1000;
  const totalMs = sets.reduce((a, st) => a + COUNTDOWN_MS + st.durationMs, 0) + restMs * (setup.sets - 1);
  return { seed: rng.seed, cue, targets, sets, restMs, totalMs };
}
