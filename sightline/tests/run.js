// Randomization tests. No libraries: `node tests/run.js` (or `npm test`).
// Vercel runs this before every deploy (see vercel.json); if anything fails,
// the build fails and nothing goes live.

import { createSession } from '../js/session.js';
import { createVariety } from '../js/lib/variety.js';
import { PILLARS } from '../js/plan.js';
import { STROOP_PAIRS, STROOP_WORDS, MIN_EDGE_DIST, GAP_MS, HARD_GAP } from '../js/content/reaction.js';
import { MIN_SACCADE_DIST, GAZE_LETTERS } from '../js/content/eyes.js';
import { SCRIPTS, scriptSeconds } from '../js/content/scripts.js';
import { CUE_WORDS } from '../js/content/cues.js';
import { QUESTIONS } from '../js/data/questions.js';
import { CUES } from '../js/lib/colors.js';
import { dist } from '../js/lib/rng.js';

// ---- tiny runner ----------------------------------------------------------------
const results = [];
function test(name, fn) {
  try { fn(); results.push([true, name]); } catch (e) { results.push([false, name, e.message]); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const SESSIONS = 1000;
const MODES = ['tap', 'cones'];
const LENGTHS = ['quick', 'standard', 'full'];
const DIFFS = ['normal', 'hard'];
const settingsFor = (i) => ({
  mode: MODES[i % 2], length: LENGTHS[i % 3], difficulty: DIFFS[Math.floor(i / 6) % 2],
});

// Draw every stream as hard as a real session could (plus practice), in a
// fixed order, and return everything that was shown.
const DRAWS = { colorCall: 80, goNoGo: 80, peripheral: 80, math: 60, questions: 25, saccades: 120, gaze: 80 };
function drawSession(session, settings) {
  const c = session.content;
  const hard = settings.difficulty === 'hard';
  const out = { steps: session.steps.map((s) => ({ id: s.id, pillar: s.pillarId, ms: s.durationMs })) };
  out.colorCall = Array.from({ length: DRAWS.colorCall }, () => c.colorCall());
  out.goNoGo = Array.from({ length: DRAWS.goNoGo }, () => c.goNoGo());
  out.stroop = [];
  for (let t; (t = c.stroop()); ) out.stroop.push(t);
  out.peripheral = Array.from({ length: DRAWS.peripheral }, (_, i) => c.peripheral({ lure: hard && i % 2 === 0 }));
  out.math = Array.from({ length: DRAWS.math }, (_, i) => c.math({ hard: hard && i > 2 }));
  out.questions = Array.from({ length: DRAWS.questions }, () => c.questions()).filter(Boolean);
  out.saccades = Array.from({ length: DRAWS.saccades }, () => c.saccades());
  out.gaze = Array.from({ length: DRAWS.gaze }, () => c.gaze());
  out.pursuit = c.pursuit(6, hard);
  out.script = c.script();
  out.cues = c.cueSuggestions.slice();
  const gap = c.gaps('test');
  out.gaps = Array.from({ length: 20 }, () => gap(hard));
  out.tips = Array.from({ length: 30 }, () => c.breathing.tip('in'));
  return out;
}

const unique = (arr, label) => {
  const seen = new Set();
  for (const x of arr) { assert(!seen.has(x), `${label} repeated: ${x}`); seen.add(x); }
};
// Never twice in a row; never more than 2 of the same in any 5.
const spacedOk = (arr, label) => {
  for (let i = 0; i < arr.length; i++) {
    assert(i === 0 || arr[i] !== arr[i - 1], `${label}: "${arr[i]}" twice in a row at ${i}`);
    const win = arr.slice(Math.max(0, i - 4), i + 1);
    assert(win.filter((x) => x === arr[i]).length <= 2, `${label}: "${arr[i]}" more than 2 in 5 at ${i}`);
  }
};
const maxRun = (arr, value) => {
  let best = 0; let run = 0;
  for (const x of arr) { run = x === value ? run + 1 : 0; best = Math.max(best, run); }
  return best;
};

// Pre-build the 1,000 sessions once (no history), shared by several tests.
const runs = Array.from({ length: SESSIONS }, (_, i) => {
  const settings = settingsFor(i);
  return { settings, d: drawSession(createSession({ settings, seed: 1000 + i }), settings) };
});

// 1 ---------------------------------------------------------------------------------
test(`${SESSIONS} sessions: no repeated content within a session`, () => {
  for (const { d } of runs) {
    unique(d.math.map((p) => p.text), 'math problem');
    unique(d.stroop.map((p) => `${p.word}/${p.ink}`), 'Stroop pair');
    unique(d.questions.map((q) => q.q), 'question');
    unique(d.cues, 'cue suggestion');
    unique(d.pursuit.map((p) => p.id), 'pursuit path');
    assert(d.script && d.script.id, 'no visualization script');
    unique(d.steps.map((s) => s.id), 'drill');
  }
});

// 2 ---------------------------------------------------------------------------------
test('No back-to-back colors, sides, numbers or letters; max 2 of the same in any 5', () => {
  for (const { d } of runs) {
    spacedOk(d.colorCall.map((t) => t.color), 'Color Call color');
    spacedOk(d.stroop.map((t) => t.ink), 'Stroop ink');
    spacedOk(d.peripheral.map((t) => t.color), 'Peripheral color');
    spacedOk(d.peripheral.map((t) => t.side), 'Peripheral side');
    spacedOk(d.goNoGo.map((t) => t.side), 'Go/No-Go arrow side');
    spacedOk(d.questions.map((q) => q.answer), 'Question answer color');
    spacedOk(d.saccades.map((t) => t.num), 'Saccade number');
    spacedOk(d.gaze, 'Gaze letter');
  }
});

test('Targets keep their distance: saccades and peripheral flashes never land near the last one', () => {
  for (const { d } of runs) {
    for (let i = 1; i < d.saccades.length; i++) {
      assert(dist(d.saccades[i], d.saccades[i - 1]) >= MIN_SACCADE_DIST - 1e-9, `saccade too close at ${i}`);
      assert(Math.max(Math.abs(d.saccades[i].x), Math.abs(d.saccades[i].y)) >= 0.4, 'saccade too near center');
    }
    for (let i = 1; i < d.peripheral.length; i++) {
      assert(dist(d.peripheral[i], d.peripheral[i - 1]) >= MIN_EDGE_DIST - 1e-9, `peripheral flash too close at ${i}`);
    }
  }
});

test('Two-way cues are mixed: Go ≤ 3 and No-Go ≤ 2 in a row; odd/even ≤ 3 in a row', () => {
  for (const { d } of runs) {
    const go = d.goNoGo.map((t) => t.go);
    assert(maxRun(go, true) <= 3 && maxRun(go, false) <= 2, 'Go/No-Go run too long');
    const odd = d.math.map((p) => p.odd);
    assert(maxRun(odd, true) <= 3 && maxRun(odd, false) <= 3, 'odd/even run too long');
  }
  const allGo = runs.flatMap(({ d }) => d.goNoGo.map((t) => t.go));
  const share = allGo.filter(Boolean).length / allGo.length;
  assert(share > 0.55 && share < 0.72, `Go share ${share.toFixed(2)} outside 55–72%`);
});

// 3 ---------------------------------------------------------------------------------
test('Stroop never shows a matching word and ink', () => {
  const label = Object.fromEntries(CUES.map((c) => [c.id, c.label]));
  assert(STROOP_PAIRS.every((p) => p.word !== label[p.ink]), 'pair list contains a match');
  for (const { d } of runs) {
    for (const p of d.stroop) {
      assert(p.word !== label[p.ink], `match: ${p.word} in ${p.ink}`);
      assert(STROOP_WORDS.includes(p.word), `unknown word ${p.word}`);
    }
    assert(d.stroop.length === STROOP_PAIRS.length, 'Stroop pool not fully available');
  }
  assert(STROOP_PAIRS.length >= 45, 'Stroop pool too small for a Full session');
});

// 4 ---------------------------------------------------------------------------------
test('Math answers are correct and odd → BLUE, even → RED', () => {
  for (const { d } of runs) {
    for (const p of d.math) {
      const expr = p.text.replace(/×/g, '*').replace(/−/g, '-');
      assert(/^[\d\s+\-*]+$/.test(expr), `odd characters in "${p.text}"`);
      const v = Function(`return (${expr})`)();
      assert(v === p.value, `${p.text} gave ${p.value}, should be ${v}`);
      assert(v >= 1, `${p.text} is below 1`);
      assert(p.odd === (v % 2 === 1), `${p.text} parity wrong`);
      assert(p.answer === (p.odd ? 'blue' : 'red'), `${p.text} mapped to ${p.answer}`);
    }
  }
});

// 5 ---------------------------------------------------------------------------------
test('Pillar order is fixed; drill order inside pillars varies', () => {
  const pillarIds = PILLARS.map((p) => p.id);
  const challengeOrders = new Set();
  const activateOrders = new Set();
  for (const { d } of runs) {
    const seq = d.steps.map((s) => s.pillar).filter((p, i, a) => p !== a[i - 1]);
    assert(seq.join() === pillarIds.join(), `pillar order ${seq.join()}`);
    assert(d.steps.at(-1).id === 'lockin' && d.steps.at(-2).id === 'visualize', 'Rehearse order changed');
    for (const p of PILLARS) {
      const ids = d.steps.filter((s) => s.pillar === p.id).map((s) => s.id).sort();
      assert(ids.join() === p.drills.map((x) => x.id).sort().join(), `${p.id} drills wrong`);
    }
    challengeOrders.add(d.steps.filter((s) => s.pillar === 'challenge').map((s) => s.id).join());
    activateOrders.add(d.steps.filter((s) => s.pillar === 'activate').map((s) => s.id).join());
  }
  assert(challengeOrders.size > 300, `only ${challengeOrders.size} Challenge orders`);
  assert(activateOrders.size === 6, `only ${activateOrders.size} Activate orders`);
});

test('Session length stays about the same (Quick ≈5, Standard ≈8, Full ≈12 min)', () => {
  const want = { quick: [4.75, 5.75], standard: [7.75, 8.75], full: [11.25, 12.25] };
  for (const { settings, d } of runs.slice(0, 12)) {
    const min = d.steps.reduce((a, s) => a + s.ms, 0) / 60000;
    const [lo, hi] = want[settings.length];
    assert(min >= lo && min <= hi, `${settings.length} is ${min} min`);
  }
});

// 6 ---------------------------------------------------------------------------------
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
// A realistic Full session: ~12 questions, ~20 math problems, 1 script, 5 cue words.
function playSession(variety, i, { questions = 12, math = 20 } = {}) {
  const settings = { mode: 'tap', length: 'full', difficulty: 'normal' };
  const s = createSession({ settings, seed: 5000 + i, recent: variety.recent() });
  const shown = {
    questions: Array.from({ length: questions }, () => s.content.questions()).filter(Boolean).map((q) => q.q),
    math: Array.from({ length: math }, () => s.content.math()).map((p) => p.text),
    script: s.content.script().id,
    cues: s.content.cueSuggestions.slice(),
    challenge: s.steps.filter((x) => x.pillarId === 'challenge').map((x) => x.id).join(),
  };
  variety.add(s.record());
  return shown;
}

test('Content from the last 3 sessions doesn’t come back (device storage on)', () => {
  const variety = createVariety(memoryStorage());
  const history = [];
  for (let i = 0; i < 40; i++) {
    const now = playSession(variety, i);
    for (const past of history.slice(-3)) {
      for (const q of now.questions) assert(!past.questions.includes(q), `session ${i}: question came back: ${q}`);
      for (const m of now.math) assert(!past.math.includes(m), `session ${i}: math problem came back: ${m}`);
      assert(now.script !== past.script, `session ${i}: script came back: ${now.script}`);
      for (const c of now.cues) assert(!past.cues.includes(c), `session ${i}: cue suggestion came back: ${c}`);
    }
    if (history.length) assert(now.challenge !== history.at(-1).challenge, `session ${i}: same drill order as last time`);
    history.push(now);
  }
});

test('When a pool runs low it resets on its own (no errors, still no repeats in a session)', () => {
  const variety = createVariety(memoryStorage());
  for (let i = 0; i < 8; i++) {
    const now = playSession(variety, i, { questions: 40 });
    unique(now.questions, 'question');
    assert(now.questions.length === 40, 'ran out of questions');
  }
  // A session can use the whole question bank without a repeat; then it stops.
  const s = createSession({ settings: settingsFor(0), seed: 77 });
  const all = [];
  for (let q; (q = s.content.questions()); ) all.push(q.q);
  assert(all.length === QUESTIONS.length, `drew ${all.length} of ${QUESTIONS.length}`);
  unique(all, 'question');
});

test('Reset variety clears the recently-used list', () => {
  const variety = createVariety(memoryStorage());
  playSession(variety, 1);
  assert(variety.recent().length === 1, 'nothing recorded');
  variety.reset();
  assert(variety.recent().length === 0, 'reset did not clear');
});

// 7 ---------------------------------------------------------------------------------
test('Works with device storage disabled (still random, still no repeats)', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  for (const variety of [createVariety(broken), createVariety(null), createVariety()]) {
    assert(variety.recent().length === 0, 'recent() should be empty');
    variety.add({ questions: ['x'] });   // must not throw
    variety.reset();
    const settings = settingsFor(3);
    const d = drawSession(createSession({ settings, recent: variety.recent() }), settings);
    unique(d.math.map((p) => p.text), 'math problem');
    unique(d.questions.map((q) => q.q), 'question');
    spacedOk(d.colorCall.map((t) => t.color), 'Color Call color');
  }
});

// 8 ---------------------------------------------------------------------------------
test('The same seed replays the same session; different seeds differ', () => {
  const settings = { mode: 'cones', length: 'standard', difficulty: 'hard' };
  const recent = [{ questions: [QUESTIONS[0].q], scripts: ['first-1'], math: ['3 + 4'], cues: ['CALM'] }];
  const a = JSON.stringify(drawSession(createSession({ settings, seed: 424242, recent }), settings));
  const b = JSON.stringify(drawSession(createSession({ settings, seed: 424242, recent }), settings));
  const c = JSON.stringify(drawSession(createSession({ settings, seed: 424243, recent }), settings));
  assert(a === b, 'same seed gave a different session');
  assert(a !== c, 'different seeds gave the same session');
  const s1 = createSession({ settings, seed: 'debug-run' });
  const s2 = createSession({ settings, seed: 'debug-run' });
  assert(s1.seed === s2.seed && JSON.stringify(s1.steps) === JSON.stringify(s2.steps), 'text seeds not stable');
});

// 9 ---------------------------------------------------------------------------------
test('Timing between cues varies within 0.8–1.6 s (shorter on Hard)', () => {
  for (const { settings, d } of runs) {
    const k = settings.difficulty === 'hard' ? HARD_GAP : 1;
    for (const g of d.gaps) assert(g >= GAP_MS[0] * k && g <= GAP_MS[1] * k, `gap ${g}`);
    assert(new Set(d.gaps.map((g) => Math.round(g))).size > 10, 'gaps not varied');
  }
});

// Content pools -------------------------------------------------------------------
test('Content pools are big enough and well-formed', () => {
  assert(SCRIPTS.length >= 12, 'need 12+ visualization scripts');
  for (const s of SCRIPTS) assert(Math.abs(scriptSeconds(s) - 45) <= 1, `${s.id} is ${scriptSeconds(s)} s`);
  const themes = new Set(SCRIPTS.map((s) => s.theme));
  assert(themes.size === 3, 'need 3 script themes');
  unique(SCRIPTS.map((s) => s.id), 'script id');
  assert(CUE_WORDS.length >= 20, 'need 20+ cue words');
  unique(CUE_WORDS, 'cue word');
  for (const bad of ['O', 'Q', 'I', 'L']) assert(!GAZE_LETTERS.includes(bad), `${bad} is easy to confuse`);
  unique(QUESTIONS.map((q) => q.q), 'question');
  for (const q of QUESTIONS) assert(!q.w.includes(q.a), `answer listed as wrong: ${q.q}`);
});

test('Breathing wording rotates without repeating back-to-back', () => {
  for (const { d } of runs.slice(0, 100)) {
    for (let i = 1; i < d.tips.length; i++) assert(d.tips[i] !== d.tips[i - 1], 'same tip twice in a row');
  }
});

// ---- report ---------------------------------------------------------------------
let failed = 0;
for (const [ok, name, err] of results) {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    ${err}`}`);
  if (!ok) failed++;
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
