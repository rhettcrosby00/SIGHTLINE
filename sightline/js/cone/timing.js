// MOVE timing: the time between cues comes from how far the athlete has to
// go, not a fixed speed. Pure module (no DOM), so the tests can check every
// distance, pace and rep style.
//
//   cue interval = pace × (reaction + yards out × pace per yard + turn
//                          + yards back × pace per yard + reset)
//
// Out and back runs out and back; Cone to cone runs one way (from the last
// cone to the next one); First step is a fixed short interval per pace.
// A decision cue (js/cone/decide.js) adds a moment to think. Planned drills
// (js/cone/patterns.js) time one run of the pattern plus the walk back.
// All numbers live in TIMING so they can be tuned in one place.

import { dirById, COUNTDOWN_MS } from './config.js';
import { CUES } from './cues/index.js';
import { PATTERNS, patternRunSeconds, patternRecoverySeconds } from './patterns.js';

export const TIMING = {
  // Seconds. Calibrated so Game Speed out and back hits the reference targets
  // (3 yd ≈ 2.0 s, 5 yd ≈ 2.75 s, 10 yd ≈ 4.25 s, 15 yd ≈ 5.75 s). The first
  // proposal (reaction 0.35, turn 0.45, reset 0.25) ran 0.3 s slower than those.
  reactionS: 0.25,
  turnS: 0.35,
  resetS: 0.15,
  nearYards: 5,       // first 5 yards cost more (acceleration)…
  nearPaceS: 0.20,    // …0.20 s per yard
  farPaceS: 0.15,     // every yard after that: 0.15 s
  paces: { learning: 1.4, training: 1.2, game: 1.0, overdrive: 0.9 },
  firstStepS: { learning: 2.0, training: 1.7, game: 1.4, overdrive: 1.2 },
  decisionS: 0.3,     // a decision cue: a moment to think before the cut (× pace)
  decisionShare: 0.4, // about this share of cues need a decision when it's on (js/cone/decide.js)
  jitter: 0.10,       // ±10% so the rhythm can't be predicted
  minS: 1.0,          // hard limits for any cue interval
  maxS: 12,
  tuneStep: 0.10,     // "Too fast" / "Too slow" change the next set by 10%
  tuneRange: [0.5, 2.5],
  // Suggested rest = work × ratio (about 1:2 Learning, 1:3 Training, 1:5 Game, 1:1.5 Overdrive).
  restRatio: { learning: 2, training: 3, game: 5, overdrive: 1.5 },
  restRange: [15, 300],
};

export const PACE_LABEL = { learning: 'Learning', training: 'Training', game: 'Game Speed', overdrive: 'Overdrive' };
export const STYLE_LABEL = { outback: 'Out and back', firststep: 'First step', conetocone: 'Cone to cone' };

const clampS = (s) => Math.min(TIMING.maxS, Math.max(TIMING.minS, s));
const round = (x, step) => Math.round(x / step) * step;

// Running time for a distance: the first 5 yards are slower.
export function runSeconds(yards) {
  return Math.min(yards, TIMING.nearYards) * TIMING.nearPaceS + Math.max(0, yards - TIMING.nearYards) * TIMING.farPaceS;
}

// The formula, unclamped. backYards is 0 for Cone to cone.
export function formulaSeconds({ style, pace, outYards = 0, backYards = outYards }, mult = TIMING.paces[pace]) {
  if (style === 'firststep') return TIMING.firstStepS[pace];
  const back = style === 'conetocone' ? 0 : backYards;
  return mult * (TIMING.reactionS + runSeconds(outYards) + TIMING.turnS + runSeconds(back) + TIMING.resetS);
}

// The fastest realistic time for the same rep: the formula at Overdrive.
export function minimumSeconds({ style, outYards = 0, backYards = outYards }) {
  return formulaSeconds({ style, pace: 'overdrive', outYards, backYards }, TIMING.paces.overdrive);
}

// A fake-out (Hold): nobody moves, so just react and reset.
export const holdSeconds = (pace) => clampS(TIMING.paces[pace] * (TIMING.reactionS + TIMING.turnS + TIMING.resetS));

// Where each cone sits: angle (0 = toward the phone, clockwise), yards from
// the start spot, and a stable "slot" for per-cone distances (a direction for
// arrows, else the cone's position: c1, c2, …).
export function coneSlots(setup) {
  const targets = CUES[setup.cueType].targets(setup);
  const arrows = setup.cueType === 'arrows' || setup.cueType === 'mixed' || setup.cueType === 'sport';
  const n = targets.length;
  return targets.map((target, i) => {
    const angle = arrows ? dirById[target.dir].angle
      : n <= 5 ? -90 + (180 * (i + 0.5)) / n   // semicircle in front
        : -90 + (360 * i) / n;                 // full circle
    const slot = arrows ? target.dir : `c${i + 1}`;
    const yards = setup.distanceMode === 'each' ? (setup.coneYards?.[slot] ?? setup.distance) : setup.distance;
    const rad = (angle * Math.PI) / 180;
    return { target, key: target.key, slot, angle, yards, x: yards * Math.sin(rad), y: yards * Math.cos(rad) };
  });
}

const between = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// One rep's planned seconds and its realistic minimum. `from` is the cone the
// athlete is coming from (Cone to cone only; null = the start spot).
export function repTiming(setup, slot, from = null) {
  const style = setup.style;
  const outYards = style === 'conetocone' && from ? between(from, slot) : slot.yards;
  const spec = { style, pace: setup.pace, outYards };
  const min = clampS(minimumSeconds(spec));
  const base = setup.manual ? clampS(setup.manualS) : clampS(formulaSeconds(spec));
  return { base, min };
}

// The interval actually used: tuned, varied by ±10%, never below the realistic
// minimum (or the tuned time, if the athlete asked for faster than that), and
// always within 1–12 s per rep (a two-cue decision covers two reps).
export function finalMs({ baseMs, minMs, jitter = 0, keys }, tune = 1) {
  const tuned = baseMs * tune;
  const floor = Math.min(minMs, tuned);
  // Below the floor? Bounce back up by the same amount, so a rep already at
  // the minimum (Overdrive) still varies, just only upward.
  const varied = tuned * (1 + jitter);
  const reps = keys?.length ?? 1;
  return Math.round(Math.min(TIMING.maxS * reps, Math.max(TIMING.minS, (varied < floor ? 2 * floor - varied : varied) / 1000)) * 1000);
}

// A planned rep: the run plus the walk back, tuned, never shorter than the run.
export const plannedMs = ({ runMs, baseMs }, tune = 1) => Math.max(runMs, Math.round(baseMs * tune));

// Planned: one run of the pattern, then the walk back.
export const plannedRep = (setup) => ({ runS: patternRunSeconds(setup.pattern, setup.pace), recoverS: patternRecoverySeconds(setup.pattern, setup.pace) });
// Extra seconds for a decision cue at this pace.
export const decisionSeconds = (pace) => TIMING.paces[pace] * TIMING.decisionS;

// Average seconds per rep, for the setup summary and time estimates.
export function averageRepSeconds(setup) {
  if (setup.mode === 'planned') { const p = plannedRep(setup); return p.runS + p.recoverS; }
  const think = setup.decision ? TIMING.decisionShare * decisionSeconds(setup.pace) : 0;
  const slots = coneSlots(setup);
  if (setup.manual || setup.style !== 'conetocone') {
    return slots.reduce((a, s) => a + repTiming(setup, s).base, 0) / slots.length + think;
  }
  let sum = 0;
  let n = 0;
  for (const a of slots) for (const b of slots) if (a !== b) { sum += repTiming(setup, b, a).base; n++; }
  return (n ? sum / n : repTiming(setup, slots[0]).base) + think;
}

// Suggested rest between sets from the work in one set. Planned drills
// already recover between runs, so their sets need a shorter break.
export function suggestedRestSec(setup) {
  const [lo, hi] = TIMING.restRange;
  if (setup.mode === 'planned') return Math.min(180, Math.max(30, round(plannedRep(setup).recoverS * 3, 15)));
  const workS = setup.setMode === 'timed' ? setup.timedSec : setup.reps * averageRepSeconds(setup);
  return Math.min(hi, Math.max(lo, round(workS * TIMING.restRatio[setup.pace], 15)));
}
export const restSec = (setup) => (setup.restMode === 'custom' ? setup.restSec : suggestedRestSec(setup));

// Full drill time: sets of cues (or timed sets) plus countdowns and rests.
export function drillMs(setup) {
  const per = setup.setMode === 'timed' ? setup.timedSec * 1000 : setup.reps * averageRepSeconds(setup) * 1000;
  return setup.sets * per + setup.getSetS * 1000 + (setup.sets - 1) * (COUNTDOWN_MS + restSec(setup) * 1000);
}

// The farthest any rep goes, for the "faster than realistic" check.
export function farthestYards(setup) {
  const slots = coneSlots(setup);
  if (setup.style === 'conetocone') return Math.max(...slots.flatMap((a) => slots.map((b) => between(a, b))), ...slots.map((s) => s.yards));
  return Math.max(...slots.map((s) => s.yards));
}

// Manual time faster than realistic for the distance? (Shown as an on-screen
// "Continue?" before starting.)
export function manualTooFast(setup) {
  if (!setup.manual) return false;
  const spec = { style: setup.style, outYards: farthestYards(setup) };
  return setup.manualS < clampS(minimumSeconds(spec)) - 1e-9;
}

// Plain-language summary: "5 yds · Training pace · about 3.3 s per rep · ~18 reps per minute".
const fmt = (s) => (Math.round(s * 10) / 10).toFixed(1);
export function timingSummary(setup, tune = 1) {
  if (setup.mode === 'planned') {
    const p = plannedRep(setup);
    return `${PATTERNS[setup.pattern].label} · ${PACE_LABEL[setup.pace]} pace · about ${fmt(p.runS * tune)} s run, ${Math.round(p.recoverS * tune)} s walk back`;
  }
  const slots = coneSlots(setup);
  const reps = slots.map((s) => repTiming(setup, s).base * tune);
  const avg = averageRepSeconds(setup) * tune;
  const perMin = `~${Math.round(60 / avg)} reps per minute`;
  const pace = `${PACE_LABEL[setup.pace]} pace`;
  if (setup.manual) return `Exact time · ${fmt(clampS(setup.manualS * tune))} s per rep · ${perMin}`;
  if (setup.style === 'firststep') return `First step · ${pace} · ${fmt(avg)} s per rep · ${perMin}`;
  if (setup.style === 'conetocone') return `Cone to cone · ${pace} · about ${fmt(avg)} s per rep · ${perMin}`;
  const yd = slots.map((s) => s.yards);
  const lo = Math.min(...yd);
  const hi = Math.max(...yd);
  if (lo === hi) return `${lo} yds · ${pace} · about ${fmt(avg)} s per rep · ${perMin}`;
  return `${lo}–${hi} yds · ${pace} · ${fmt(Math.min(...reps))}–${fmt(Math.max(...reps))} s per rep, set by the cone called`;
}

// ---- "Too fast / Just right / Too slow" ------------------------------------
// Each answer changes the next set by 10%. Remembered on this device for that
// distance and rep style only (no profile). An exact manual time isn't changed
// for next time.

const TUNE_CHOICES = { slower: 1 + TIMING.tuneStep, same: 1, faster: 1 - TIMING.tuneStep };

export function applyTune(factor, choice) {
  const [lo, hi] = TIMING.tuneRange;
  return Math.min(hi, Math.max(lo, factor * (TUNE_CHOICES[choice] ?? 1)));
}

export function tuneKey(setup) {
  if (setup.mode === 'planned') return `planned|${setup.pattern}`;
  if (setup.style === 'firststep') return 'firststep';
  const yards = coneSlots(setup).map((s) => s.yards).join(',');
  return setup.style === 'conetocone' ? `conetocone|${setup.cueType}|${yards}` : `outback|${yards}`;
}

const TUNE_KEY = 'sightline.tune.v1';
export function createTuneStore(storage = (() => { try { return globalThis.localStorage ?? null; } catch { return null; } })()) {
  const read = () => { try { return JSON.parse(storage?.getItem(TUNE_KEY) || '{}') || {}; } catch { return {}; } };
  return {
    get: (setup) => (setup.manual ? 1 : read()[tuneKey(setup)] ?? 1),
    set(setup, factor) {
      if (setup.manual) return;
      const all = read();
      if (Math.abs(factor - 1) < 1e-9) delete all[tuneKey(setup)];
      else all[tuneKey(setup)] = Math.round(factor * 1000) / 1000;
      try { storage?.setItem(TUNE_KEY, JSON.stringify(all)); } catch { /* storage blocked: this visit only */ }
    },
  };
}
