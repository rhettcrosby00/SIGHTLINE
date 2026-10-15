// MOVE distance-based timing (run by tests/run.js): the formula for every
// distance, pace and rep style; per-cone and cone-to-cone times; variation
// never below the minimum; "Too fast / Too slow" within limits and remembered
// only for its distance and rep style.

import { test, assert } from './harness.js';
import { normalize, normalizeSignals, quickStart, PACES, STYLES, DISTANCE_YD } from '../js/cone/config.js';
import { planDrill } from '../js/cone/plan.js';
import {
  TIMING, runSeconds, formulaSeconds, minimumSeconds, repTiming, coneSlots, finalMs, applyTune, tuneKey,
  createTuneStore, suggestedRestSec, manualTooFast, timingSummary,
} from '../js/cone/timing.js';
import { createRng } from '../js/lib/rng.js';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const clampS = (s) => Math.min(12, Math.max(1, s));

// The formula written out on its own, straight from the Phase 2 spec.
function expected(style, pace, outYards, backYards = outYards) {
  if (style === 'firststep') return TIMING.firstStepS[pace];
  const perYard = (y) => Math.min(y, 5) * 0.20 + Math.max(0, y - 5) * 0.15;
  const back = style === 'conetocone' ? 0 : backYards;
  return TIMING.paces[pace] * (TIMING.reactionS + perYard(outYards) + TIMING.turnS + perYard(back) + TIMING.resetS);
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('Interval matches the formula for every distance 2–20 yds, every pace and rep style', () => {
  assert(DISTANCE_YD[0] === 2 && DISTANCE_YD[1] === 20, 'distance range should be 2–20 yds');
  for (let yd = 2; yd <= 20; yd++) {
    assert(near(runSeconds(yd), Math.min(yd, 5) * 0.2 + Math.max(0, yd - 5) * 0.15), `running time at ${yd} yd`);
    for (const pace of PACES) {
      for (const style of STYLES) {
        const s = normalize({ cueType: 'colors', cones: 4, style, pace, distance: yd });
        const want = clampS(expected(style, pace, yd));
        for (const slot of coneSlots(s)) {
          // Out and back / First step from any cone; Cone to cone's first rep runs from the start spot.
          assert(near(repTiming(s, slot).base, want), `${style} ${pace} ${yd} yd: ${repTiming(s, slot).base} vs ${want}`);
        }
        assert(near(formulaSeconds({ style, pace, outYards: yd }), expected(style, pace, yd)), 'formulaSeconds');
        assert(near(minimumSeconds({ style, outYards: yd }), expected(style, 'overdrive', yd)), 'minimum is the formula at Overdrive');
      }
    }
  }
});

test('Reference targets for out and back (Game / Training / Learning), within 0.3 s', () => {
  const targets = { 3: [2.0, 2.5, 3.0], 5: [2.75, 3.25, 4.0], 10: [4.25, 5.0, 6.0], 15: [5.75, 6.75, 8.0] };
  for (const [yd, want] of Object.entries(targets)) {
    ['game', 'training', 'learning'].forEach((pace, i) => {
      const got = formulaSeconds({ style: 'outback', pace, outYards: Number(yd) });
      assert(Math.abs(got - want[i]) <= 0.3, `${yd} yd ${pace}: ${got.toFixed(2)} s vs ~${want[i]} s`);
    });
  }
  // First step: fixed 1.2–2.0 s by pace, whatever the distance.
  assert(TIMING.firstStepS.overdrive === 1.2 && TIMING.firstStepS.learning === 2.0, 'first step range');
  for (const pace of PACES) assert(near(formulaSeconds({ style: 'firststep', pace, outYards: 20 }), formulaSeconds({ style: 'firststep', pace, outYards: 2 })), 'first step ignores distance');
});

test('Per-cone distances: the time after each cue matches the cone just called', () => {
  const rng = createRng('per-cone');
  for (let i = 0; i < 300; i++) {
    const arrows = i % 2 === 0;
    const dirs = rng.shuffle(['F', 'FR', 'R', 'BR', 'B', 'BL', 'L', 'FL']).slice(0, rng.int(2, 8));
    const coneYards = Object.fromEntries([...dirs, 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'].map((k) => [k, rng.int(2, 20)]));
    const pace = rng.pick(PACES);
    const s = normalize(arrows
      ? { cueType: 'arrows', directions: dirs, cones: dirs.length, distanceMode: 'each', coneYards, pace, fakes: 'medium', reverse: true }
      : { cueType: 'colors', cones: rng.int(2, 8), distanceMode: 'each', coneYards, pace, fakes: 'low' });
    const yardsOf = Object.fromEntries(coneSlots(s).map((sl) => [sl.key, sl.yards]));
    for (const set of planDrill(s, i).sets) {
      for (const e of set.events.filter((x) => x.type === 'go')) {
        const want = Math.round(clampS(expected('outback', pace, yardsOf[e.key])) * 1000);
        assert(e.baseMs === want, `cone ${e.key} at ${yardsOf[e.key]} yd: ${e.baseMs} vs ${want}`);
      }
    }
  }
  // The example from the spec: sides at 5 yds, forward at 10.
  const ex = normalize({ cueType: 'arrows', directions: ['L', 'F', 'R'], cones: 3, distanceMode: 'each', coneYards: { L: 5, R: 5, F: 10 }, pace: 'game' });
  const byDir = Object.fromEntries(coneSlots(ex).map((sl) => [sl.slot, repTiming(ex, sl).base]));
  assert(near(byDir.L, byDir.R) && byDir.F > byDir.L + 1, 'forward cone should get more time than the sides');
});

test('Cone to cone: each rep is timed from the last cone (the first from the start spot)', () => {
  const rng = createRng('cone-to-cone');
  for (let i = 0; i < 200; i++) {
    const s = normalize({ cueType: rng.pick(['colors', 'numbers', 'arrows']), cones: rng.int(2, 8), directions: ['L', 'F', 'R', 'B'],
      style: 'conetocone', pace: rng.pick(PACES), distance: rng.int(2, 20), distanceMode: rng.chance(0.5) ? 'each' : 'same',
      coneYards: { c1: rng.int(2, 20), c2: rng.int(2, 20), c3: rng.int(2, 20), L: rng.int(2, 20), F: rng.int(2, 20) } });
    const at = Object.fromEntries(coneSlots(s).map((sl) => [sl.key, sl]));
    for (const set of planDrill(s, i).sets) {
      let from = null;
      for (const e of set.events.filter((x) => x.type === 'go')) {
        const yd = from ? Math.hypot(at[e.key].x - from.x, at[e.key].y - from.y) : at[e.key].yards;
        const want = Math.round(clampS(expected('conetocone', s.pace, yd)) * 1000);
        assert(e.baseMs === want, `cone to cone ${yd.toFixed(2)} yd: ${e.baseMs} vs ${want}`);
        from = at[e.key];
      }
    }
  }
});

test('Random variation never drops below the minimum (any pace, style, distance or adjustment)', () => {
  const rng = createRng('variation');
  for (let i = 0; i < 400; i++) {
    const s = normalize({ cueType: 'colors', cones: rng.int(2, 8), style: rng.pick(STYLES), pace: rng.pick(PACES), distance: rng.int(2, 20),
      manual: rng.chance(0.2), manualS: rng.range(1, 12), fakes: rng.pick(['off', 'low', 'medium']) });
    for (const tune of [0.5, 0.9, 1, 1.1, 2.5]) {
      for (const set of planDrill(s, i, { tune }).sets) {
        for (const e of set.events) {
          const ms = finalMs(e, tune);
          assert(ms >= 1000 && ms <= 12000, `${ms} ms outside 1–12 s`);
          assert(ms >= Math.min(e.minMs, e.baseMs * tune) - 1, `${ms} ms below the minimum`);
          assert(ms <= Math.max(1000, e.baseMs * tune * (1 + TIMING.jitter)) + 1, `${ms} ms more than 10% over`);
        }
      }
    }
  }
});

test('"Too fast / Just right / Too slow" changes the next set by about 10% and stays within 1–12 s', () => {
  assert(near(applyTune(1, 'slower'), 1.1) && near(applyTune(1, 'faster'), 0.9) && applyTune(1, 'same') === 1, 'one step is 10%');
  let up = 1;
  let down = 1;
  for (let i = 0; i < 50; i++) { up = applyTune(up, 'slower'); down = applyTune(down, 'faster'); }
  assert(up === TIMING.tuneRange[1] && down === TIMING.tuneRange[0], 'adjustment keeps going without a limit');
  // Even at the extremes, a cue is never under 1 s or over 12 s.
  const slowest = normalize({ cueType: 'colors', cones: 4, pace: 'learning', distance: 20 });
  const fastest = normalize({ cueType: 'colors', cones: 4, pace: 'overdrive', style: 'firststep' });
  for (const e of planDrill(slowest, 1).sets[0].events) assert(finalMs(e, up) <= 12000, 'over 12 s');
  for (const e of planDrill(fastest, 1).sets[0].events) assert(finalMs(e, down) >= 1000, 'under 1 s');
  // "Too slow" at 5 yds Training: 3.3 s → about 3.0 s on the next set.
  const q = quickStart();
  const e = { baseMs: 3300, minMs: 2475, jitter: 0 };
  assert(finalMs(e, applyTune(1, 'faster')) === 2970 && finalMs(e, applyTune(1, 'slower')) === 3630, 'Too slow / Too fast at 5 yds');
  assert(timingSummary(q) === '5 yds · Training pace · about 3.3 s per rep · ~18 reps per minute', `summary: ${timingSummary(q)}`);
});

test('Pace answers are remembered for that distance and rep style only', () => {
  const store = createTuneStore(memoryStorage());
  const five = normalize({ cueType: 'colors', cones: 4, distance: 5 });
  store.set(five, 1.1);
  assert(store.get(five) === 1.1, 'not remembered');
  assert(store.get(normalize({ ...five, pace: 'game' })) === 1.1, 'pace shouldn’t matter (same distance and style)');
  assert(store.get(normalize({ ...five, distance: 10 })) === 1, 'leaked to another distance');
  assert(store.get(normalize({ ...five, style: 'conetocone' })) === 1, 'leaked to another rep style');
  assert(store.get(normalize({ ...five, style: 'firststep' })) === 1, 'leaked to First step');
  assert(tuneKey(normalize({ ...five, style: 'firststep', distance: 9 })) === tuneKey(normalize({ ...five, style: 'firststep' })), 'First step ignores distance');
  const manual = normalize({ ...five, manual: true, manualS: 4 });
  store.set(manual, 1.3);
  assert(store.get(manual) === 1 && store.get(five) === 1.1, 'an exact manual time shouldn’t be changed or saved');
  store.set(five, 1);
  assert(store.get(five) === 1, 'reset to the formula');
});

test('Suggested rest: about 1:5 Game, 1:3 Training, 1:2 Learning, 1:1.5 Overdrive', () => {
  for (const pace of PACES) {
    for (const reps of [5, 10, 20, 30]) {
      for (const yd of [3, 5, 10]) {
        const s = normalize({ cueType: 'colors', cones: 4, pace, reps, distance: yd });
        const rest = suggestedRestSec(s);
        assert(rest % 15 === 0 && rest >= 15 && rest <= 300, `rest ${rest}`);
        const work = reps * formulaSeconds({ style: 'outback', pace, outYards: yd });
        const want = Math.min(300, Math.max(15, work * TIMING.restRatio[pace]));
        assert(Math.abs(rest - want) <= 7.5, `${pace} ${reps}×${yd} yd: rest ${rest} vs ${want.toFixed(0)}`);
      }
    }
  }
  const custom = normalize({ restMode: 'custom', restSec: 95 });
  assert(custom.restSec === 90, 'custom rest snaps to 15 s steps');
});

test('An exact time faster than realistic asks first (on screen)', () => {
  const ten = { cueType: 'colors', cones: 4, distance: 10, manual: true };
  assert(manualTooFast(normalize({ ...ten, manualS: 2 })), '2 s at 10 yds should ask');
  assert(!manualTooFast(normalize({ ...ten, manualS: 4 })), '4 s at 10 yds is fine');
  assert(!manualTooFast(normalize({ ...ten, manual: false })), 'only exact times ask');
  assert(manualTooFast(normalize({ ...ten, style: 'firststep', manualS: 1.0 })), 'First step under 1.2 s should ask');
});

test('Signals Only: First step by default, never Cone to cone, one distance', () => {
  const s = normalizeSignals();
  assert(s.style === 'firststep' && s.distanceMode === 'same', 'defaults');
  assert(normalizeSignals({ style: 'conetocone' }).style === 'firststep', 'no cones, so no Cone to cone');
  assert(normalizeSignals({ style: 'outback', distance: 8 }).distance === 8, 'out and back keeps its distance');
});
