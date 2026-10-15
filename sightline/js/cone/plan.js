// Cone Drill planner: turns a setup + seed into every cue of every set before
// the drill starts. Pure module (no DOM), so the tests can simulate thousands
// of sets and the same seed always replays the same drill.
//
// Rules:
//   - Each set is balanced: every cone comes up the same number of times (±1).
//   - 3+ cones: never the same cone twice in a row, never more than 2 in any 5.
//   - 2 cones: never 3 in a row (strict alternation would be predictable).
//   - Fake-outs (HOLD) are extra cues: never first in a set, never back-to-back.
//   - Decision Layer (js/cone/decide.js): about 40% of cues need a decision,
//     never the first or the last cue of a set, never the same kind twice in
//     a row. A "two cues" decision covers two reps.
//   - Every set ends on a plain cue (no decision, no hold): it ends on a success.
//   - Random / peripheral cue spots never repeat back-to-back.
//   - Planned (js/cone/patterns.js): one run of the pattern per rep, then the walk back.
//   - Time after each cue comes from the cone just called (distance, rep
//     style, pace; js/cone/timing.js), varied ±10% but never below the
//     realistic minimum. Cone to cone uses the distance from the last cone.
//   Each event keeps its base time, minimum and variation, so "Too fast /
//   Too slow" can rescale later sets while the drill runs.

import { createRng, spaced } from '../lib/rng.js';
import { CUES } from './cues/index.js';
import { FAKE_RATES, COUNTDOWN_MS } from './config.js';
import { TIMING, coneSlots, repTiming, holdSeconds, averageRepSeconds, finalMs, restSec, plannedRep, plannedMs, decisionSeconds } from './timing.js';
import { DECISION_RATE, decisionsFor, fitsTarget, leftRight, mirrors, stroopWord } from './decide.js';

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

// Turn some go cues into decisions (they keep the cone they send the athlete to).
function addDecisions(rng, setup, cue, targets, events, kinds) {
  const byKey = Object.fromEntries(targets.map((t) => [t.key, t]));
  const goAt = events.flatMap((e, i) => (e.type === 'go' ? [i] : []));
  const [first, last] = [goAt[0], goAt.at(-1)];
  const out = [];
  let prev = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const next = events[i + 1];
    if (e.type !== 'go' || i === first || i === last || !rng.chance(DECISION_RATE)) { out.push(e); continue; }
    const options = kinds.filter((k) => k !== prev && fitsTarget(k, setup, byKey[e.key], targets)
      && (k !== 'pair' || (next?.type === 'go' && i + 1 !== last && next.key !== e.key))
      && (k !== 'nogo' || out.at(-1)?.type !== 'hold'));   // never two holds in a row
    if (!options.length) { out.push(e); continue; }
    const kind = rng.pick(options);
    prev = kind;
    if (kind === 'nogo') {
      // A real cue (another cone) under a big HOLD band: stay put. Then this cue as normal.
      const other = rng.pick(targets.filter((t) => t.key !== e.key));
      out.push({ type: 'hold', decision: 'nogo', face: { ...cue.face(other, { asArrow: e.asArrow }), nogo: true } }, e);
      continue;
    }
    if (kind === 'pair') {
      out.push({ type: 'go', decision: 'pair', key: e.key, keys: [e.key, next.key], face: { kind: 'pair', faces: [e.face, next.face] } });
      i++;
      continue;
    }
    if (kind === 'parity') {
      const odd = e.key === leftRight(setup, targets).left;
      e.face = { kind: 'parity', num: rng.int(5, 49) * 2 + (odd ? 1 : 0) };   // 10–99
    } else if (kind === 'stroop') {
      const ink = byKey[e.key].color;
      e.face = { kind: 'stroop', ink, word: stroopWord(rng, setup, ink) };
    } else if (kind === 'opposite') {
      e.face = { ...cue.face(byKey[mirrors(setup, targets)[e.key]], { asArrow: e.asArrow }), opposite: true };
    }
    e.decision = kind;
    out.push(e);
  }
  return out;
}

// Planned: every rep is one run of the pattern, then the walk back. No jitter: the timing is known.
function planPlannedSet(setup, tune) {
  const { runS, recoverS } = plannedRep(setup);
  const events = Array.from({ length: setup.reps }, () => {
    const e = { type: 'go', key: setup.pattern, face: { kind: 'planned', pattern: setup.pattern }, runMs: Math.round(runS * 1000), baseMs: Math.round((runS + recoverS) * 1000) };
    e.interval = plannedMs(e, tune);
    return e;
  });
  return { events, reps: setup.reps, holds: 0, durationMs: events.reduce((a, e) => a + e.interval, 0) };
}

function planSet(rng, setup, cue, targets, tune) {
  if (setup.mode === 'planned') return planPlannedSet(setup, tune);
  const fakeRate = FAKE_RATES[setup.fakes] ?? 0;

  let goCount;
  let holdCount;
  if (setup.setMode === 'timed') {
    const avgMs = averageRepSeconds(setup) * 1000 * tune;
    const slots = Math.max(2, Math.round((setup.timedSec * 1000) / avgMs));
    holdCount = Math.round(slots * fakeRate);
    goCount = slots - holdCount;
  } else {
    goCount = setup.reps;
    holdCount = Math.round(goCount * fakeRate);
  }
  holdCount = Math.min(holdCount, goCount);

  const byKey = Object.fromEntries(targets.map((t) => [t.key, t]));
  const order = orderTargets(rng, targets.map((t) => t.key), goCount);

  // Fake-outs go into different gaps between go cues: never first, never
  // adjacent, never last (the set ends on a go).
  holdCount = Math.min(holdCount, goCount - 1);
  const holdAfter = new Set(rng.shuffle(Array.from({ length: goCount - 1 }, (_, i) => i + 1)).slice(0, holdCount));

  let events = [];
  order.forEach((key, i) => {
    events.push({ type: 'go', key });
    if (holdAfter.has(i + 1)) events.push({ type: 'hold' });
  });

  // Faces: mixed decides color vs arrow for each cue.
  events.forEach((e) => {
    if (e.type !== 'go') { e.face = { kind: 'hold' }; return; }
    e.asArrow = cue.id === 'mixed' ? rng.chance(0.5) : cue.id === 'arrows';
    e.face = cue.face(byKey[e.key], { asArrow: e.asArrow });
  });
  const kinds = decisionsFor(setup);
  if (kinds.length) events = addDecisions(rng, setup, cue, targets, events, kinds);

  // Where each cue appears on screen.
  if (setup.position !== 'center') {
    const spot = spaced(rng, setup.position === 'peripheral' ? EDGE_SPOTS : GRID_SPOTS, { key: (p) => p.id });
    for (const e of events) e.pos = spot();
  }

  // Time until the next cue: set by the cone just called (Cone to cone: from
  // the last cone), varied so the rhythm can't be guessed. A fake-out keeps
  // the athlete where they are.
  const slotByKey = Object.fromEntries(coneSlots(setup).map((sl) => [sl.key, sl]));
  const holdMs = Math.round(holdSeconds(setup.pace) * 1000);
  let from = null;
  const think = decisionSeconds(setup.pace);
  for (const e of events) {
    if (e.type === 'go') {
      // Two cues: both reps back to back (Cone to cone: via the first cone).
      let base = 0;
      let min = 0;
      for (const key of e.keys ?? [e.key]) {
        const t = repTiming(setup, slotByKey[key], from);
        base += t.base;
        min += t.min;
        if (setup.style === 'conetocone') from = slotByKey[key];
      }
      if (e.decision) { base += think; min += think; }
      e.baseMs = Math.round(base * 1000);
      e.minMs = Math.round(min * 1000);
    } else {
      e.baseMs = Math.min(holdMs, e.baseMs ?? holdMs);
      e.minMs = e.baseMs;
    }
    e.jitter = rng.range(-TIMING.jitter, TIMING.jitter);
    e.interval = finalMs(e, tune);
  }

  return {
    events,
    reps: goCount,
    holds: events.filter((e) => e.type === 'hold').length,
    durationMs: events.reduce((a, e) => a + e.interval, 0),
  };
}

// The whole drill: every set planned up front, plus the total running time.
// `tune` is the athlete's saved "Too fast / Too slow" factor for this setup.
export function planDrill(setup, seed, { tune = 1 } = {}) {
  const rng = createRng(seed);
  const cue = CUES[setup.cueType];
  const targets = cue.targets(setup);
  const sets = Array.from({ length: setup.sets }, (_, i) => planSet(rng.fork(`set:${i}`), setup, cue, targets, tune));
  const restMs = restSec(setup) * 1000;
  const totalMs = sets.reduce((a, st) => a + COUNTDOWN_MS + st.durationMs, 0) + restMs * (setup.sets - 1);
  return { seed: rng.seed, cue, targets, sets, restMs, totalMs };
}
