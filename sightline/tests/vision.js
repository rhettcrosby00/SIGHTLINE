// Visual skills (run by tests/run.js): adaptive difficulty settles near 80%
// right and stays in its band, Perception Span / Object Tracking / Target
// Capture score correctly, nothing flashes faster than 3 changes a second,
// Low contrast never drops below its visible floor, and Occlusion is opt-in,
// warned about, and never on Game Day.

import { readFileSync } from 'node:fs';
import { test, assert } from './harness.js';
import { createRng } from '../js/lib/rng.js';
import { createLevel, createLevelStore, LEVEL_RANGE, TARGET } from '../js/lib/adapt.js';
import { opacityFor, contrastAt, lowContrastAt, LOW_CONTRAST_FLOOR, toHex } from '../js/lib/contrast.js';
import {
  NEAR_LETTERS, nearFarStream, nearFarAt, GAP_DIRS, captureStream, captureAt, spanStream, spanAt, scoreSpan,
  motAt, motField, scoreMot, createOcclusion, OCCLUSION_MS, occludedSaccade,
} from '../js/content/vision.js';
import { createSession } from '../js/session.js';
import { totalMinutes } from '../js/plan.js';
import { windowAt } from '../js/stages/reaction.js';
import { GAP_MS, HARD_GAP } from '../js/content/reaction.js';
import { PACING } from '../js/plan.js';
import { CUES } from '../js/lib/colors.js';
import { GROUPS, OCCLUSION_WARNING } from '../js/settings.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// Most changes inside any 1-second window, for a sorted list of change times (ms).
function changesPerSecond(times) {
  let most = 0;
  for (let i = 0, j = 0; i < times.length; i++) {
    while (times[i] - times[j] >= 1000) j++;
    most = Math.max(most, i - j + 1);
  }
  return most;
}

test('Adaptive difficulty settles at 75–85% right and stays inside its band', () => {
  // Simulated athletes: chance is 25% (4 choices); `edge` is the level where they get ~62% right.
  for (const [difficulty, edges] of [['normal', [0.2, 0.35, 0.5]], ['hard', [0.6, 0.75, 0.9]]]) {
    const [lo, hi] = LEVEL_RANGE[difficulty];
    for (const edge of edges) {
      const rng = createRng(`adapt:${difficulty}:${edge}`);
      const level = createLevel(undefined, difficulty);
      let right = 0;
      let counted = 0;
      for (let i = 0; i < 4000; i++) {
        const p = 0.25 + 0.75 / (1 + Math.exp((level.value - edge) / 0.06));
        const ok = rng.next() < p;
        if (i >= 1000) { counted++; if (ok) right++; }
        level.update(ok);
        assert(level.value >= lo - 1e-9 && level.value <= hi + 1e-9, `${difficulty}: level ${level.value} left its band`);
      }
      const rate = right / counted;
      assert(rate >= 0.75 && rate <= 0.85, `${difficulty} athlete at ${edge}: ${(rate * 100).toFixed(1)}% right`);
    }
  }
  assert(TARGET >= 0.75 && TARGET <= 0.85, 'target');
  // Too strong for the band: it tops out (and stays there), it never runs away.
  const pro = createLevel(undefined, 'normal');
  for (let i = 0; i < 200; i++) pro.update(true);
  assert(pro.value === LEVEL_RANGE.normal[1], 'a perfect run tops out at the band');
  const rough = createLevel(0.5, 'normal');
  for (let i = 0; i < 50; i++) rough.update(false);
  assert(rough.value === 0, 'a rough day bottoms out at the easiest level');
  // A saved level from Normal is kept inside Hard's band, and the reverse.
  assert(createLevel(0.1, 'hard').value === LEVEL_RANGE.hard[0] && createLevel(0.9, 'normal').value === LEVEL_RANGE.normal[1], 'saved levels clamp');
});

test('Adaptive limits: every drill’s numbers stay sensible at every level', () => {
  for (let i = 0; i <= 20; i++) {
    const L = i / 20;
    const w = windowAt(L);
    assert(w >= 0.65 && w <= 1.15, `window factor ${w}`);
    assert(1400 * w * PACING.flat.window >= 800, 'Color Call never asks for under 0.8 s');
    const s = spanAt(L);
    assert([3, 4, 5].includes(s.grid) && s.dots >= 3 && s.dots <= 8 && s.dots < (s.grid * s.grid) / 2 + 1, `span ${JSON.stringify(s)}`);
    assert(s.flashMs >= 300 && s.flashMs <= 1000, 'span flash 0.3–1 s');
    const m = motAt(L);
    assert(m.dots >= 6 && m.dots <= 10 && m.targets >= 2 && m.targets <= 4 && m.targets * 2 <= m.dots, `tracking ${JSON.stringify(m)}`);
    assert(m.moveMs >= 5000 && m.moveMs <= 8000, 'tracking moves 5–8 s');
    const c = captureAt(L);
    assert(c.flashMs >= 150 && c.flashMs <= 600 && c.sizePx >= 24, `capture ${JSON.stringify(c)}`);
    const n = nearFarAt(L);
    assert(n.sizePx >= 18 && n.showMs >= 300 && n.farMs >= 1300, `near-far ${JSON.stringify(n)}`);
    if (i) {
      const prev = (i - 1) / 20;
      assert(windowAt(L) < windowAt(prev) && captureAt(L).flashMs <= captureAt(prev).flashMs && spanAt(L).flashMs <= spanAt(prev).flashMs, 'harder as the level rises');
    }
  }
});

test('Levels are saved on this phone, and the app works with storage blocked', () => {
  const m = new Map();
  const store = createLevelStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) });
  const s = createSession({ sessionId: 'vision', settings: { length: 'standard' }, seed: 1, levels: store.get() });
  const lv = s.content.level('span');
  for (let i = 0; i < 6; i++) lv.update(true);
  store.save(s.levels());
  const again = createSession({ sessionId: 'vision', settings: { length: 'standard' }, seed: 2, levels: store.get() });
  assert(Math.abs(again.content.level('span').value - lv.value) < 0.001, 'next session starts where this one ended');
  assert(again.content.level('capture').value === createLevel(undefined).value, 'an unseen drill starts fresh');
  const blocked = createLevelStore({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  blocked.save({ span: 0.5 });
  assert(JSON.stringify(blocked.get()) === '{}', 'blocked storage reads as empty');
  assert(JSON.stringify(createLevelStore(null).get()) === '{}', 'no storage at all');
});

test('Perception Span scores correctly', () => {
  assert(scoreSpan([1, 4, 7], [7, 1, 4]).ok, 'same squares, any order');
  const miss = scoreSpan([1, 4, 7], [1, 4]);
  assert(!miss.ok && miss.hits === 2 && miss.missed === 1 && miss.wrong === 0, 'one missed');
  const extra = scoreSpan([1, 4, 7], [1, 4, 7, 8]);
  assert(!extra.ok && extra.wrong === 1, 'an extra square is wrong');
  const swap = scoreSpan([0, 2], [0, 3]);
  assert(!swap.ok && swap.hits === 1 && swap.wrong === 1 && swap.missed === 1, 'one right, one wrong');
  assert(!scoreSpan([2, 5], []).ok, 'no taps');
  const next = spanStream(createRng('span'));
  let last = '';
  for (let i = 0; i < 300; i++) {
    const { grid, dots } = spanAt((i % 21) / 20);
    const cells = next(grid, dots);
    assert(cells.length === dots && new Set(cells).size === dots && cells.every((c) => c >= 0 && c < grid * grid), 'a pattern fits its grid');
    assert(cells.join() !== last, 'never the same pattern twice in a row');
    last = cells.join();
  }
});

test('Object Tracking scores correctly, and the dots stay on screen and apart', () => {
  assert(scoreMot([0, 1, 2], [2, 0, 1]).ok, 'all followed, any order');
  assert(!scoreMot([0, 1, 2], [0, 1, 5]).ok && scoreMot([0, 1, 2], [0, 1, 5]).hits === 2, 'one wrong');
  assert(!scoreMot([0, 1], [0]).ok, 'one short');
  assert(!scoreMot([0, 1], [0, 1, 3]).ok, 'too many');
  for (const L of [0, 0.5, 1]) {
    const p = motAt(L);
    const w = 343;
    const h = 330;
    const r = 16;
    const a = motField(createRng(`mot:${L}`), { w, h, n: p.dots, r, speed: p.speed });
    const b = motField(createRng(`mot:${L}`), { w, h, n: p.dots, r, speed: p.speed });
    for (let t = 0; t < p.moveMs; t += 16) {
      a.advance(16);
      b.advance(16);
      for (const d of a.dots) assert(d.x >= r - 1e-6 && d.x <= w - r + 1e-6 && d.y >= r - 1e-6 && d.y <= h - r + 1e-6, 'a dot left the field');
    }
    // After each step, overlapping dots are pushed apart (a little overlap mid-bounce is fine).
    for (let i = 0; i < a.dots.length; i++) {
      for (let j = i + 1; j < a.dots.length; j++) {
        assert(Math.hypot(a.dots[i].x - a.dots[j].x, a.dots[i].y - a.dots[j].y) > r, 'two dots stuck together');
      }
    }
    assert(a.dots.every((d, i) => d.x === b.dots[i].x && d.y === b.dots[i].y), 'same seed, same motion on every phone');
    const fastest = Math.max(...a.dots.map((d) => Math.hypot(d.vx, d.vy)));
    assert(fastest <= p.speed * w * 2.01, 'bounces never fling a dot');
  }
});

test('Target Capture and Near-Far: every answer has its button, and edges vary', () => {
  const capture = captureStream(createRng('capture'));
  let last = null;
  for (let i = 0; i < 300; i++) {
    const t = capture();
    assert(GAP_DIRS.includes(t.gap), `gap ${t.gap}`);
    assert(Math.max(Math.abs(t.x), Math.abs(t.y)) >= 0.89 && Math.abs(t.x) <= 0.9 && Math.abs(t.y) <= 0.9, 'near an edge, inside the screen');
    assert(!last || t.side !== last.side, 'never the same edge twice in a row');
    last = t;
  }
  const nf = nearFarStream(createRng('nearfar'));
  let prev = null;
  for (let i = 0; i < 300; i++) {
    const t = nf();
    assert(t.choices.length === 4 && new Set(t.choices).size === 4 && t.choices.includes(t.answer), 'four different letters, one of them right');
    assert(t.choices.every((l) => NEAR_LETTERS.includes(l)) && t.answer !== prev, 'letters vary');
    prev = t.answer;
  }
  // Target Capture's buttons are the four gap directions (js/stages/reaction.js).
  assert(/choices: GAP_DIRS\.map/.test(read('js/stages/reaction.js')), 'Target Capture buttons come from GAP_DIRS');
});

test('Nothing flashes faster than 3 changes a second; no full-screen flicker', () => {
  // Occlusion: 10 minutes of hide / show at many seeds.
  for (let seed = 0; seed < 200; seed++) {
    const occ = createOcclusion(createRng(`occ:${seed}`));
    const times = occ.changes(600000);
    assert(changesPerSecond(times) <= 3, `occlusion seed ${seed}: ${changesPerSecond(times)} changes in a second`);
    assert(times.every((t, i) => !i || t - times[i - 1] >= 400 - 1e-9), 'every window at least 400 ms');
    let t = 0;
    for (const x of times.slice(0, 40)) { assert(occ.visible(t) === (times.indexOf(x) % 2 === 0), 'visible() matches the switches'); t = x; }
  }
  assert(OCCLUSION_MS.visible[0] >= 400 && OCCLUSION_MS.hidden[0] >= 400, 'occlusion windows');
  // Saccade Jumps with occlusion: show, hide, jump.
  for (const gap of [GAP_MS[0] * HARD_GAP, GAP_MS[0], GAP_MS[1]]) {
    const o = occludedSaccade(gap);
    const times = [];
    for (let at = 0; at < 20000; at += o.showMs + o.hiddenMs) times.push(at, at + o.showMs);
    assert(changesPerSecond(times) <= 3 && o.hiddenMs >= 400 && o.showMs >= 400, `occluded saccades at ${gap} ms`);
  }
  // Reaction cues (Color Call's fill, Peripheral Flash, Target Capture): at the
  // quickest (Hard gaps, Flat pacing, instant taps, the shortest flash), a cue
  // appears and goes, then the 380 ms feedback and the gap come before the next.
  const quickest = GAP_MS[0] * HARD_GAP * PACING.flat.gap + 380;
  const times = [];
  for (let at = 0; at < 20000; at += quickest + 150) times.push(at, at + 150);
  assert(changesPerSecond(times) <= 3, `reaction cues: ${changesPerSecond(times)} changes in a second`);

  // CSS: every repeating animation that switches in steps stays under 3 changes a second,
  // and anything that repeats is slower than 0.67 s.
  const css = read('css/styles.css');
  const frames = Object.fromEntries([...css.matchAll(/@keyframes ([\w-]+) \{([\s\S]*?\})\s*\}/g)].map((m) => [m[1], (m[2].match(/\{/g) ?? []).length]));
  for (const m of css.matchAll(/animation:\s*([\w-]+)\s+([\d.]+)(m?s)\s+([^;}]*)/g)) {
    const [, name, n, unit, rest] = m;
    if (!/infinite|\b\d{2,}\b/.test(rest)) continue;
    const sec = Number(n) / (unit === 'ms' ? 1000 : 1);
    assert(sec >= 0.667, `${name} repeats every ${sec} s`);
    if (/steps\(/.test(rest)) assert(((frames[name] ?? 1) + 1) / sec <= 3, `${name}: ${(frames[name] + 1) / sec} changes a second`);
  }
  assert(!/@keyframes[^{]*\{[^}]*\b(visibility|display)\s*:/.test(css), 'no keyframes blink things on and off');
});

test('Low contrast stays above its floor in every theme, and really is fainter', () => {
  const tokens = read('css/tokens.css');
  const themeBlock = (marker) => {
    const at = tokens.indexOf(marker);
    const open = tokens.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < tokens.length; i++) {
      if (tokens[i] === '{') depth++;
      if (tokens[i] === '}' && --depth === 0) return tokens.slice(open + 1, i);
    }
    return '';
  };
  const colors = (css) => Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((x) => [x[1], x[2].toLowerCase()]));
  const light = colors(themeBlock(':root {'));
  const themes = { light, dark: { ...light, ...colors(themeBlock(':root[data-appearance="dark"]')) }, outdoor: { ...light, ...colors(themeBlock(':root[data-appearance="outdoor"]')) } };
  for (const [name, t] of Object.entries(themes)) {
    // Cues on the drill field (Color Call, Peripheral Flash, Target Capture), and the saccade number on the page.
    const pairs = [...CUES.map((c) => [c.hex, t['cue-bg']]), [t['cue-fg'], t['cue-bg']], [t.text, t.bg]];
    for (const [fg, bg] of pairs) {
      for (let i = 0; i <= 10; i++) {
        const target = lowContrastAt(i / 10);
        const op = opacityFor(fg, bg, target);
        const got = contrastAt(fg, bg, op);
        assert(op > 0 && op <= 1, 'opacity 0–1');
        assert(got >= LOW_CONTRAST_FLOOR - 0.01, `${name}: ${fg} on ${bg} at level ${i / 10} is ${got.toFixed(2)}:1, below the floor`);
        if (contrastAt(fg, bg) > target + 0.5) assert(got < contrastAt(fg, bg) && Math.abs(got - target) < 0.05, `${name}: ${fg} should land on ${target}:1, got ${got.toFixed(2)}`);
      }
    }
  }
  assert(LOW_CONTRAST_FLOOR >= 2.5, 'the faintest cue stays at least 2.5:1');
  assert(toHex('rgb(18, 196, 139)') === '#12c48b' && toHex('#FFF') === '#ffffff', 'colors read from the page');
  const low = createSession({ sessionId: 'game', settings: { length: 'standard', contrast: 'low' }, seed: 1 });
  assert(low.content.lowContrast && !createSession({ sessionId: 'game', settings: { length: 'standard' }, seed: 1 }).content.lowContrast, 'Low contrast is a setting, off by default');
});

test('Occlusion: opt-in, warned about, behind its flag, Training mode only, never on Game Day', () => {
  const on = { length: 'standard', occlusion: 'on', day: 'training' };
  assert(createSession({ sessionId: 'activate', settings: on, seed: 1, flags: { occlusion: true } }).content.occlusion, 'on in Eyes only (Training mode) when chosen');
  assert(createSession({ sessionId: 'training', settings: { ...on, day: 'game' }, seed: 1, flags: { occlusion: true } }).content.occlusion, 'on in the Training session');
  assert(!createSession({ sessionId: 'activate', settings: { ...on, day: 'game' }, seed: 1, flags: { occlusion: true } }).content.occlusion, 'off in Game Day mode');
  assert(!createSession({ sessionId: 'game', settings: on, seed: 1, flags: { occlusion: true } }).content.occlusion, 'never in Game Ready');
  assert(!createSession({ sessionId: 'activate', settings: on, seed: 1, flags: {} }).content.occlusion, 'off while its flag is off');
  assert(!createSession({ sessionId: 'activate', settings: { length: 'standard' }, seed: 1, flags: { occlusion: true } }).content.occlusion, 'off unless chosen');
  const field = GROUPS.flatMap((g) => g.fields).find((f) => f.key === 'occlusion');
  assert(field?.flag === 'occlusion' && /never in game ready/i.test(field.hint()), 'the setting sits behind its flag and says Training only');
  assert(/epilepsy/i.test(OCCLUSION_WARNING) && /seizure/i.test(OCCLUSION_WARNING) && /never flashes/i.test(OCCLUSION_WARNING), 'photosensitivity warning');
  assert(/confirm\(OCCLUSION_WARNING\)/.test(read('js/settings.js')), 'the warning shows before it turns on');
});

test('Visual skills: exact minutes, never in Game Ready, and safety wording on screen', () => {
  for (const length of ['quick', 'standard', 'full']) {
    for (const guide of ['full', 'brief']) {
      for (let seed = 0; seed < 30; seed++) {
        const s = createSession({ sessionId: 'vision', settings: { length, guide }, seed });
        const ms = s.steps.reduce((a, x) => a + x.durationMs + x.introMs, 0);
        assert(Math.abs(ms - totalMinutes('vision', length) * 60000) < 1, `vision ${length}: ${ms} ms`);
        assert(s.steps.map((x) => x.id).sort().join() === 'capture,nearfar,span', 'all three drills');
        assert(s.steps.every((x) => x.durationMs >= 20000), 'every drill gets at least 20 s');
      }
      const game = createSession({ sessionId: 'game', settings: { length, guide }, seed: 1 });
      assert(!game.steps.some((x) => ['nearfar', 'capture', 'span', 'mot'].includes(x.id)), 'Game Ready stays as approved');
    }
  }
  const vision = read('js/stages/vision.js');
  assert((vision.match(/Stop if you feel dizzy/g) ?? []).length >= 2, 'Near-Far says "Stop if you feel dizzy." on the how-to and on screen');
});
