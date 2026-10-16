// MOVE decisions (run by tests/run.js): every Decision Layer cue sends the
// athlete to the right cone (odd / even, color word, opposite, two cues,
// no-go), sets always end on a plain cue, sport calls and planned patterns
// are sound, Game Day stays short, and decision cues read from 10+ yards.

import { readFileSync } from 'node:fs';
import { test, assert } from './harness.js';
import { planDrill } from '../js/cone/plan.js';
import { normalize, validate, movePreset, MOVE_PRESETS, DECISIONS, DIRECTIONS, DIRECTION_PRESETS, CONE_COLORS, colorById, OPPOSITE } from '../js/cone/config.js';
import { CUES } from '../js/cone/cues/index.js';
import { decisionsFor, answerFor, leftRight, mirrors, DECISION_RATE } from '../js/cone/decide.js';
import { SPORT_PACKS, SPORT_DIRS, packFor } from '../js/cone/cues/sport.js';
import { PATTERNS, PATTERN_IDS, patternRunSeconds, patternRecoverySeconds, PLANNED_RECOVERY_S, patternYards } from '../js/cone/patterns.js';
import { drillMs, suggestedRestSec, TIMING } from '../js/cone/timing.js';
import { faceHtml, readableYards } from '../js/cone/render.js';
import { moveMultiplier } from '../js/score/scoring.js';
import { SPORTS } from '../js/content/sports.js';
import { createRng } from '../js/lib/rng.js';

const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const ALL_DIRS = DIRECTIONS.map((d) => d.id);

// Random setups with the Decision Layer on, across every cue type and layout.
function setups(count, seed) {
  const rng = createRng(seed);
  return Array.from({ length: count }, (_, i) => {
    const cueType = ['colors', 'arrows', 'numbers', 'mixed', 'sport'][i % 5];
    const cones = rng.int(2, 8);
    const dirs = DIRECTION_PRESETS[cones] && rng.chance(0.5) ? DIRECTION_PRESETS[cones].slice() : rng.shuffle(ALL_DIRS).slice(0, cones);
    return normalize({
      cueType, cones, directions: dirs, coloredCones: rng.chance(0.6), colors: rng.shuffle(CONE_COLORS.map((c) => c.id)),
      sport: rng.pick(Object.keys(SPORT_PACKS)), reps: rng.int(8, 30), sets: rng.int(1, 3), fakes: rng.pick(['off', 'low', 'medium']),
      setMode: rng.chance(0.8) ? 'reps' : 'timed', position: rng.pick(['center', 'random']),
      decision: true, decisions: rng.chance(0.5) ? DECISIONS : rng.shuffle(DECISIONS).slice(0, rng.int(1, 5)),
    });
  }).filter((s) => validate(s).ok);
}
const DRILLS = setups(600, 'decisions').map((s, i) => ({ setup: s, plan: planDrill(s, 500 + i) }));

test('Decision Layer: every decision cue sends the athlete to the right cone', () => {
  const seen = Object.fromEntries(DECISIONS.map((d) => [d, 0]));
  for (const { setup, plan } of DRILLS) {
    const targets = plan.targets;
    const byKey = Object.fromEntries(targets.map((t) => [t.key, t]));
    const usable = decisionsFor(setup);
    for (const set of plan.sets) {
      for (const e of set.events) {
        if (!e.decision) continue;
        seen[e.decision]++;
        assert(usable.includes(e.decision), `${e.decision} used but not available for ${setup.cueType}`);
        const got = answerFor(e.face, setup, targets);
        if (e.decision === 'nogo') { assert(e.type === 'hold' && got === null, 'a no-go cue must mean stay put'); continue; }
        if (e.decision === 'pair') {
          assert(got.join() === e.keys.join() && e.keys[0] !== e.keys[1], `two cues: shows ${got}, means ${e.keys}`);
          continue;
        }
        assert(got === e.key, `${e.decision}: the screen says ${got}, the plan expects ${e.key}`);
        if (e.decision === 'parity') {
          const lr = leftRight(setup, targets);
          assert(e.face.num >= 10 && e.face.num <= 99, 'two-digit number');
          assert((e.face.num % 2 === 1) === (e.key === lr.left), `${e.face.num} should send you ${e.face.num % 2 ? 'left' : 'right'}`);
        }
        if (e.decision === 'stroop') {
          assert(e.face.ink === byKey[e.key].color, 'the color you see is the cone you go to');
          assert(e.face.word !== colorById[e.face.ink].label, 'the word never matches the color');
        }
        if (e.decision === 'opposite') {
          const m = mirrors(setup, targets);
          assert(m[m[e.key]] === e.key, 'opposites go both ways');
          if (e.face.kind === 'arrow') assert(e.face.dir === OPPOSITE[e.key], 'the arrow points the other way');
        }
      }
    }
  }
  for (const d of DECISIONS) assert(seen[d] > 50, `only ${seen[d]} ${d} cues generated`);
});

test('Decisions: never the first or last cue, never the same kind twice in a row, about 4 in 10', () => {
  let cues = 0;
  let decided = 0;
  for (const { setup, plan } of DRILLS) {
    for (const set of plan.sets) {
      const ev = set.events;
      const go = ev.filter((e) => e.type === 'go');
      assert(!go[0].decision && !go.at(-1).decision, 'a decision as the first or last cue');
      const kinds = ev.filter((e) => e.decision).map((e) => e.decision);
      for (let i = 1; i < kinds.length; i++) assert(kinds[i] !== kinds[i - 1], `${kinds[i]} twice in a row`);
      if (decisionsFor(setup).length) { cues += go.length - 2; decided += ev.filter((e) => e.decision && e.decision !== 'nogo').length; }
    }
  }
  const share = decided / cues;
  assert(share > DECISION_RATE * 0.55 && share < DECISION_RATE * 1.1, `decision share ${share.toFixed(2)}`);
});

test('Every set ends on a plain cue (a success), with any settings', () => {
  const rng = createRng('ends');
  for (let i = 0; i < 400; i++) {
    const s = normalize({
      cueType: rng.pick(['colors', 'arrows', 'mixed', 'sport']), cones: 4, directions: ['L', 'R', 'F', 'B'], reps: rng.int(5, 20),
      sets: 2, fakes: rng.pick(['off', 'low', 'medium']), decision: rng.chance(0.7), setMode: rng.chance(0.5) ? 'timed' : 'reps',
    });
    for (const set of planDrill(s, i).sets) {
      const last = set.events.at(-1);
      assert(last.type === 'go' && !last.decision && !last.face.opposite && !last.face.nogo, `set ends on ${last.type} ${last.decision ?? ''}`);
    }
  }
});

test('Opposite and left / right are well defined for every layout', () => {
  for (const cueType of ['colors', 'numbers', 'arrows']) {
    for (let n = 2; n <= 8; n++) {
      const dirs = DIRECTION_PRESETS[n] ?? ALL_DIRS.slice(0, n);
      const s = normalize({ cueType, cones: n, directions: dirs, decision: true });
      const targets = CUES[s.cueType].targets(s);
      const m = mirrors(s, targets);
      for (const [a, b] of Object.entries(m)) assert(a !== b && m[b] === a, `${cueType}/${n}: ${a}→${b} isn't mutual`);
      if (cueType === 'colors' && n <= 5) assert(Object.keys(m).length === n - (n % 2), `${cueType}/${n}: semicircle mirrors`);
      const lr = leftRight(s, targets);
      if (lr) assert(lr.left !== lr.right, 'left and right are different cones');
      if (cueType === 'numbers') assert(!lr, 'numbers skip odd / even (their own digits would confuse it)');
    }
  }
  const sport = normalize({ cueType: 'sport', decision: true });
  assert(decisionsFor(sport).join() === 'parity,opposite,pair,nogo', `sport decisions: ${decisionsFor(sport)}`);
  assert(decisionsFor(normalize({ cueType: 'colors', cones: 4, decision: false })).length === 0, 'off means no decisions');
});

test('Sport packs: every sport has four short calls, one per direction', () => {
  for (const sp of SPORTS) {
    const pack = packFor(sp.id);
    assert(pack === SPORT_PACKS[sp.id], `${sp.id} has no pack`);
    const calls = SPORT_DIRS.map((d) => pack[d]);
    assert(new Set(calls).size === 4 && calls.every((c) => /^[A-Z]{2,6}$/.test(c)), `${sp.id}: ${calls}`);
    const s = normalize({ cueType: 'sport', sport: sp.id, cones: 7, directions: ['L', 'R'] });
    assert(s.cones === 4 && s.directions.join() === SPORT_DIRS.join() && validate(s).ok, `${sp.id}: setup`);
    const plan = planDrill(s, 7);
    for (const e of plan.sets.flatMap((x) => x.events)) {
      if (e.type === 'go') assert(e.face.word === pack[e.key] && e.face.dir === e.key, 'a call sends you its own direction');
    }
  }
  assert(normalize({ cueType: 'sport', sport: 'curling' }).sport === 'general', 'unknown sport falls back');
  assert(readableYards('GO') >= 10 && readableYards('NET') >= 10, 'two- and three-letter calls read from 10+ yd');
  assert(readableYards('SWITCH') < readableYards('DRIVE') && readableYards('ATTACK') >= 5, 'longer calls read from closer (shown honestly in setup)');
});

test('Decision cues read from 10+ yards: big numbers, full-screen color, a thick frame, a big band', () => {
  assert(readableYards('88') >= 10, 'a two-digit number reads from 10+ yd');
  const rule = (sel) => (css.match(new RegExp(`${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`)) ?? [])[1] ?? '';
  assert(/inset 0 0 0 (\d+)vmin/.test(rule('.cdf.is-opposite')) && Number(rule('.cdf.is-opposite').match(/inset 0 0 0 (\d+)vmin/)[1]) >= 8, 'the Opposite frame is at least 8% of the screen thick');
  assert(/height:\s*(3\d|[4-9]\d)%/.test(rule('.cdf__band')), 'the HOLD band covers at least 30% of the screen');
  assert(!/animation/.test(rule('.cdf.is-opposite') + rule('.cdf__band') + rule('.cdf--pair')), 'decision cues never blink');
  const stroop = faceHtml({ kind: 'stroop', ink: 'blue', word: 'RED' });
  assert(/cdf--color/.test(stroop) && /--c:#2f7bff/.test(stroop), 'Stroop fills the screen with the color to go to');
});

test('Planned drills: each pattern returns to the start, timing is known, no surprises', () => {
  const STEP = { F: [0, 1], B: [0, -1], L: [-1, 0], R: [1, 0] };
  for (const id of PATTERN_IDS) {
    const p = PATTERNS[id];
    let at = p.cones[p.start];
    for (const [d, yd] of p.legs) {
      at = { x: at.x + STEP[d][0] * yd, y: at.y + STEP[d][1] * yd };
      assert(p.cones.some((c) => c.x === at.x && c.y === at.y), `${id}: a leg ends away from a cone`);
    }
    assert(at.x === p.cones[p.start].x && at.y === p.cones[p.start].y, `${id}: doesn't finish at the start`);
    assert(patternYards(id) >= 20, `${id}: ${patternYards(id)} yd`);
    let prev = Infinity;
    for (const pace of ['learning', 'training', 'game', 'overdrive']) {
      const run = patternRunSeconds(id, pace);
      const rec = patternRecoverySeconds(id, pace);
      assert(run < prev && run > 3 && run < 20, `${id} ${pace}: ${run} s`);
      assert(rec >= PLANNED_RECOVERY_S[0] && rec <= PLANNED_RECOVERY_S[1], `${id} ${pace}: rest ${rec} s`);
      prev = run;
      const s = normalize({ mode: 'planned', pattern: id, pace, reps: 6, sets: 2, decision: true, fakes: 'medium', setMode: 'timed', cueType: 'arrows' });
      assert(s.setMode === 'reps' && validate(s).ok, 'planned uses reps');
      const plan = planDrill(s, 3);
      for (const set of plan.sets) {
        assert(set.events.length === 6 && set.events.every((e) => e.type === 'go' && e.face.kind === 'planned' && !e.decision), 'planned: one run per rep, nothing else');
        assert(set.events.every((e) => e.interval === Math.round((run + rec) * 1000) && e.runMs === Math.round(run * 1000)), 'run + walk back');
      }
      assert(Math.abs(plan.totalMs - drillMs(s)) < 1000, `${id} ${pace}: estimate ${drillMs(s)} vs plan ${plan.totalMs}`);
      assert(suggestedRestSec(s) >= 30 && suggestedRestSec(s) <= 180, 'rest between planned sets');
      assert(moveMultiplier(s) > 1, 'planned reps score by pattern length');
    }
  }
});

test('Game Speed (Game Day): 3 short sets at game pace with full rest, on the athlete’s own cones', () => {
  const GS = MOVE_PRESETS.game.speed;
  assert(GS.sets >= 3 && GS.sets <= 4 && GS.timedSec >= 15 && GS.timedSec <= 30 && GS.pace === 'game' && !GS.decision, 'Game Speed numbers');
  for (const custom of [{ cueType: 'colors', cones: 5 }, { cueType: 'arrows', directions: ['L', 'R', 'F'], cones: 3, decision: true }, { mode: 'planned' }, { cueType: 'numbers', cones: 4 }]) {
    const g = movePreset('speed', 'game', normalize(custom));
    assert(g.mode === 'reactive' && g.setMode === 'timed' && g.timedSec === GS.timedSec && g.sets === GS.sets && g.pace === 'game' && !g.decision, 'preset');
    if (custom.cueType) assert(g.cueType === custom.cueType, 'keeps the athlete’s cue type');
    assert(suggestedRestSec(g) >= GS.timedSec * TIMING.restRatio.game, 'full rest (1:5)');
    assert(drillMs(g) <= 6 * 60000, `Game Speed runs ${Math.round(drillMs(g) / 1000)} s`);
    const plan = planDrill(g, 1);
    assert(plan.sets.length === GS.sets, 'sets');
  }
});
