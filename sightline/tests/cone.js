// MOVE tests: the Cone Drill engine, Quick Start and Signals Only (run by tests/run.js).

import { readFileSync } from 'node:fs';
import { test, assert } from './harness.js';
import { planDrill, GRID_SPOTS } from '../js/cone/plan.js';
import {
  normalize, validate, coneColors, CONE_COLORS, DIRECTIONS, DIRECTION_PRESETS, OPPOSITE,
  FAKE_RATES, CUE_TYPES, MIN_CONES, MAX_CONES, PACES, STYLES, quickStart, normalizeSignals,
} from '../js/cone/config.js';
import { CUES } from '../js/cone/cues/index.js';
import { coneSlots, finalMs, TIMING } from '../js/cone/timing.js';
import { createRng } from '../js/lib/rng.js';
import { coneSession } from '../js/cone/run.js';

const ALL_DIRS = DIRECTIONS.map((d) => d.id);
const ALL_COLORS = CONE_COLORS.map((c) => c.id);

// A random but valid setup for a cue type and cone count.
function makeSetup(rng, cueType, cones) {
  const dirs = DIRECTION_PRESETS[cones] && rng.chance(0.5)
    ? DIRECTION_PRESETS[cones].slice()
    : rng.shuffle(ALL_DIRS).slice(0, cones);   // compass picker: any n directions
  return normalize({
    cueType,
    cones,
    directions: dirs,
    coloredCones: rng.chance(0.7),
    colors: rng.shuffle(ALL_COLORS).slice(0, 8),
    style: rng.pick(STYLES),
    pace: rng.pick(PACES),
    distance: rng.int(2, 20),
    distanceMode: rng.chance(0.4) ? 'each' : 'same',
    coneYards: Object.fromEntries([...ALL_DIRS, 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'].map((k) => [k, rng.int(2, 20)])),
    manual: rng.chance(0.15),
    manualS: rng.range(1, 12),
    setMode: rng.chance(0.7) ? 'reps' : 'timed',
    reps: rng.int(5, 30),
    timedSec: rng.pick([15, 20, 30, 45]),
    sets: rng.int(1, 4),
    restSec: 15,
    position: rng.pick(['center', 'random', 'peripheral']),
    display: rng.pick(['hold', 'flash']),
    fakes: rng.pick(['off', 'low', 'medium']),
    reverse: rng.chance(0.5),
  });
}

// Build 1,000+ sets across every cue type and cone count (2–8).
const rng = createRng(2024);
const drills = [];
let setCount = 0;
for (let i = 0; setCount < 1000; i++) {
  const cueType = CUE_TYPES[i % CUE_TYPES.length];
  const cones = MIN_CONES + (Math.floor(i / CUE_TYPES.length) % (MAX_CONES - MIN_CONES + 1));
  const setup = makeSetup(rng, cueType, cones);
  const plan = planDrill(setup, 10_000 + i);
  drills.push({ setup, plan });
  setCount += plan.sets.length;
}

const goKeys = (set) => set.events.filter((e) => e.type === 'go').map((e) => e.key);

test('Every cue type works with every cone count from 2 to 8', () => {
  for (const cueType of CUE_TYPES) {
    for (let n = MIN_CONES; n <= MAX_CONES; n++) {
      const found = drills.filter((d) => d.setup.cueType === cueType && CUES[cueType].targets(d.setup).length === n);
      assert(found.length > 0, `no ${cueType} drill with ${n} cones`);
      for (const { setup, plan } of found) {
        assert(validate(setup).ok, `${cueType}/${n}: setup invalid: ${validate(setup).errors}`);
        assert(plan.targets.length === n, `${cueType}/${n}: ${plan.targets.length} targets`);
        assert(new Set(plan.targets.map((t) => t.key)).size === n, `${cueType}/${n}: duplicate targets`);
        assert(plan.sets.every((s) => s.events.length > 0), `${cueType}/${n}: empty set`);
        assert(coneSlots(setup).length === n, `${cueType}/${n}: layout shows wrong cone count`);
      }
    }
  }
});

test(`No back-to-back repeats over ${setCount} simulated sets (2 cones: never 3 in a row)`, () => {
  for (const { plan } of drills) {
    const n = plan.targets.length;
    for (const set of plan.sets) {
      const keys = goKeys(set);
      for (let i = 1; i < keys.length; i++) {
        if (n === 2) assert(!(keys[i] === keys[i - 1] && keys[i - 1] === keys[i - 2]), `2 cones: 3 in a row at ${i}`);
        else assert(keys[i] !== keys[i - 1], `${n} cones: "${keys[i]}" twice in a row at ${i}`);
      }
    }
  }
});

test('Never more than 2 of the same cue in any 5 (3+ cones)', () => {
  for (const { plan } of drills) {
    if (plan.targets.length < 3) continue;
    for (const set of plan.sets) {
      const keys = goKeys(set);
      for (let i = 0; i < keys.length; i++) {
        const win = keys.slice(Math.max(0, i - 4), i + 1);
        assert(win.filter((k) => k === keys[i]).length <= 2, `"${keys[i]}" 3 times in 5 at ${i}`);
      }
    }
  }
});

test('Cues are balanced within each set (every cone within 1 of the others)', () => {
  for (const { plan } of drills) {
    for (const set of plan.sets) {
      const counts = Object.fromEntries(plan.targets.map((t) => [t.key, 0]));
      for (const k of goKeys(set)) counts[k]++;
      const v = Object.values(counts);
      assert(Math.max(...v) - Math.min(...v) <= 1, `unbalanced: ${JSON.stringify(counts)}`);
    }
  }
});

test('Fake-outs: never first, never back-to-back, extra to the reps, about the chosen rate', () => {
  for (const { setup, plan } of drills) {
    for (const set of plan.sets) {
      const ev = set.events;
      if (setup.fakes === 'off') assert(ev.every((e) => e.type === 'go'), 'fake-out with fake-outs off');
      assert(ev[0].type === 'go', 'fake-out as the first cue');
      for (let i = 1; i < ev.length; i++) assert(!(ev[i].type === 'hold' && ev[i - 1].type === 'hold'), 'fake-outs back to back');
      const holds = ev.filter((e) => e.type === 'hold').length;
      const gos = ev.length - holds;
      assert(holds === set.holds && gos === set.reps, 'counts wrong');
      if (setup.setMode === 'reps') {
        assert(gos === setup.reps, `reps ${gos} ≠ ${setup.reps} (fake-outs must be extra)`);
        assert(holds === Math.min(gos, Math.round(gos * FAKE_RATES[setup.fakes])), 'fake-out rate wrong');
      }
      for (const e of ev) if (e.type === 'hold') assert(e.face.kind === 'hold', 'fake-out drawn as a real cue');
    }
  }
});

test('Reverse cues: arrows only, opposite way, never first, never back-to-back', () => {
  let seen = 0;
  for (const { setup, plan } of drills) {
    for (const set of plan.sets) {
      const ev = set.events;
      ev.forEach((e, i) => {
        if (!e.reverse) return;
        seen++;
        assert(setup.reverse, 'reverse cue with the rule off');
        assert(i > 0, 'reverse cue first in a set');
        assert(!ev[i - 1].reverse && !ev[i + 1]?.reverse, 'reverse cues back to back');
        assert(e.face.kind === 'arrow' && e.face.reverse, 'reverse cue not drawn as a bordered arrow');
        assert(e.face.dir === OPPOSITE[e.key], `reverse arrow ${e.face.dir} should point opposite ${e.key}`);
        assert(setup.directions.includes(e.face.dir), 'reverse arrow points to a direction not in use');
      });
    }
  }
  assert(seen > 50, `only ${seen} reverse cues generated`);
});

test('Each cue shows its own cone (color, number or arrow matches the target)', () => {
  for (const { plan } of drills) {
    const byKey = Object.fromEntries(plan.targets.map((t) => [t.key, t]));
    for (const set of plan.sets) {
      for (const e of set.events) {
        if (e.type !== 'go') continue;
        const t = byKey[e.key];
        if (e.face.kind === 'color') assert(e.face.color === t.color, 'wrong color');
        if (e.face.kind === 'number') assert(e.face.num === t.num, 'wrong number');
        if (e.face.kind === 'arrow' && !e.reverse) assert(e.face.dir === t.dir, 'wrong arrow');
      }
    }
  }
});

test('Chosen colors are never duplicated', () => {
  for (let n = MIN_CONES; n <= MAX_CONES; n++) {
    for (const coloredCones of [true, false]) {
      const s = normalize({ cueType: 'colors', cones: n, coloredCones, colors: ['red', 'red', 'blue', 'blue', 'green'] });
      const picked = coneColors(s);
      assert(picked.length === n, `${n} cones got ${picked.length} colors`);
      assert(new Set(picked).size === n, `duplicate colors: ${picked}`);
    }
  }
  // A duplicate that slips through is caught before starting.
  const forced = { ...normalize({ cueType: 'colors', cones: 3 }), colors: ['red', 'red', 'blue'] };
  assert(!validate(forced).ok, 'duplicate colors were not blocked');
});

test('The arrow picker only uses the selected directions', () => {
  for (const { setup, plan } of drills) {
    if (setup.cueType !== 'arrows' && setup.cueType !== 'mixed') continue;
    assert(plan.targets.every((t) => setup.directions.includes(t.dir)), 'target outside selection');
    for (const set of plan.sets) {
      for (const e of set.events) {
        if (e.face.kind === 'arrow') assert(setup.directions.includes(e.face.dir), `arrow ${e.face.dir} not selected`);
      }
    }
  }
  const s = normalize({ cueType: 'arrows', cones: 3, directions: ['L', 'R'] });
  assert(validate(s).warnings.length === 1, 'no warning when cones ≠ directions');
  assert(!validate(normalize({ cueType: 'mixed', directions: ['L', 'R', 'F'], cones: 4 })).ok, 'mixed mismatch not blocked');
});

test('Every cue’s time stays within ±10% of its rep time, 1–12 s, never below the minimum', () => {
  for (const { plan } of drills) {
    for (const set of plan.sets) {
      for (const e of set.events) {
        assert(e.interval === finalMs(e, 1), 'planned time doesn’t match the timing rule');
        assert(e.interval >= 1000 && e.interval <= 12000, `gap ${e.interval} outside 1–12 s`);
        assert(e.interval >= Math.min(e.minMs, e.baseMs) - 1, `gap ${e.interval} below the minimum ${e.minMs}`);
        const lo = Math.max(1000, Math.min(e.minMs, e.baseMs * (1 - TIMING.jitter)));
        const hi = Math.min(12000, e.baseMs * (1 + TIMING.jitter));
        assert(e.interval >= lo - 1 && e.interval <= hi + 1, `gap ${e.interval} outside ${e.baseMs} ±10%`);
      }
      if (set.events.length > 5) assert(new Set(set.events.map((e) => e.interval)).size > 2, 'gaps not varied');
    }
  }
});

test('Random cue spots never repeat back-to-back; peripheral spots stay near the edge', () => {
  for (const { setup, plan } of drills) {
    for (const set of plan.sets) {
      const ev = set.events;
      if (setup.position === 'center') { assert(ev.every((e) => !e.pos), 'center cue has a spot'); continue; }
      for (let i = 1; i < ev.length; i++) assert(ev[i].pos.id !== ev[i - 1].pos.id, 'same spot twice in a row');
      if (setup.position === 'peripheral') assert(ev.every((e) => e.pos.x !== 0 || e.pos.y !== 0), 'peripheral cue in the center');
      else assert(ev.every((e) => GRID_SPOTS.some((p) => p.id === e.pos.id)), 'unknown spot');
    }
  }
});

test('The same seed replays the same drill; different seeds differ', () => {
  const setup = normalize({ cueType: 'mixed', directions: ['L', 'R', 'F', 'B'], cones: 4, reverse: true, fakes: 'medium', position: 'random', sets: 3 });
  const a = JSON.stringify(planDrill(setup, 31337).sets);
  const b = JSON.stringify(planDrill(setup, 31337).sets);
  const c = JSON.stringify(planDrill(setup, 31338).sets);
  assert(a === b, 'same seed gave a different drill');
  assert(a !== c, 'different seeds gave the same drill');
});

test('Each drill feels different: first sets vary across 200 runs', () => {
  const setup = normalize({ cueType: 'colors', cones: 4, reps: 10 });
  const firsts = new Set(Array.from({ length: 200 }, (_, i) => goKeys(planDrill(setup, i).sets[0]).join()));
  assert(firsts.size > 190, `only ${firsts.size} different first sets`);
});


test('Cone layout puts arrow cones in their directions', () => {
  const s = normalize({ cueType: 'arrows', directions: DIRECTION_PRESETS[8], cones: 8 });
  for (const { target, angle } of coneSlots(s)) assert(DIRECTIONS.find((d) => d.id === target.dir).angle === angle, 'wrong angle');
});

test('A Cone Drill session is only the Cone Drill — no breathing or other drills', () => {
  for (const { setup, plan } of drills.slice(0, 50)) {
    const { steps, totalMs } = coneSession(plan, setup);
    assert(steps.map((st) => st.id).join() === 'conedrill', `steps were ${steps.map((st) => st.id)}`);
    assert(steps[0].durationMs === plan.totalMs && totalMs === plan.totalMs, 'drill time wrong');
  }
});

// ---- MOVE presets ------------------------------------------------------------

test('MOVE Quick Start: 4 cones, colors, 5 yd out and back, Training pace, 3 sets — and it plans a full drill', () => {
  const q = quickStart({ sound: 'off', callouts: true });
  assert(q.cueType === 'colors' && q.cones === 4 && q.distance === 5 && q.distanceMode === 'same' && q.style === 'outback'
    && q.pace === 'training' && !q.manual && q.sets === 3 && q.restMode === 'auto', 'preset changed');
  assert(q.sound === 'off' && q.callouts === true, 'Quick Start should keep the athlete’s sound choice');
  assert(validate(q).ok, 'Quick Start must always be valid');
  const plan = planDrill(q, 1);
  assert(plan.sets.length === 3 && plan.sets.every((st) => goKeys(st).length === 10), 'Quick Start should be 3 sets of 10');
});

test('MOVE Signals Only: arrows only, no cones to place, any 2–8 directions', () => {
  const rng = createRng('signals');
  for (let i = 0; i < 300; i++) {
    const dirs = rng.shuffle(DIRECTIONS.map((d) => d.id)).slice(0, rng.int(2, 8));
    const s = normalizeSignals({ cueType: 'colors', directions: dirs, cones: 7 });
    assert(s.cueType === 'arrows', 'Signals Only must use arrows');
    assert(s.cones === s.directions.length, 'one target per direction');
    assert(validate(s).ok && validate(s).warnings.length === 0, `setup should be clean: ${validate(s).warnings}`);
    const plan = planDrill(s, i);
    for (const st of plan.sets) for (const e of st.events) {
      if (e.face.kind !== 'hold') assert(e.face.kind === 'arrow' && s.directions.includes(e.face.dir), 'non-arrow or unselected cue');
    }
  }
  assert(normalizeSignals().directions.join() === 'F,R,B,L', 'default: 4 directions');
});

test('No MOVE screen asks for a tap during a set', () => {
  const src = (f) => readFileSync(new URL(`../js/cone/${f}`, import.meta.url), 'utf8');
  for (const f of ['run.js', 'render.js', ...['arrow', 'color', 'mixed', 'number', 'index'].map((c) => `cues/${c}.js`)]) {
    // The rest screen's pace buttons are the only buttons allowed (between sets).
    const code = src(f).replace(/export const tuneButtons[\s\S]*?<\/div>`;/, '');
    assert(!/<button|ready\(|pointerdown/.test(code), `${f} asks for input during the drill`);
  }
  // The only buttons during a drill are on the rest screen between sets
  // ("Too fast / Just right / Too slow"); pause stays in the top bar.
  const code = src('run.js');
  const listeners = [...code.matchAll(/addEventListener\('(\w+)'/g)].map((m) => m[1]);
  assert(listeners.join() === 'click' && /root\.querySelector\('\.tune'\)\.addEventListener/.test(code), `unexpected drill listeners: ${listeners}`);
  const loop = code.slice(code.indexOf('for (const e of set.events)'), code.indexOf('// set complete'));
  assert(!/tuneButtons|wireTune|addEventListener/.test(loop), 'something asks for input while cues are showing');
});
