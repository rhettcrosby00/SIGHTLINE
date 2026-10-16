// Eye Check (beta), run by tests/run.js: the gaze math (calibration, smoothing,
// confidence, feedback that never blinks, stats), and the rules: drills run
// normally when the camera is declined, lost or unreliable; the camera turns
// off when a drill ends; no video or image is saved or sent; eye data never
// reaches scoring or the leaderboard; never in MOVE or Gaze Stabilization.

import { readFileSync, readdirSync } from 'node:fs';
import { test, assert } from './harness.js';
import {
  eyeFeatures, fitCalibration, predict, calibrationError, median, accuracyLabel, MODEL, oneEuro, gazeFilter, SMOOTH, CALM,
  delegatePicker, DELEGATE,
  frameCheck, confidence, settled, FEEDBACK, steadyTracker, STEADY, quietRing, movedToward, SACCADE, sideOf,
  drillStats, heatGrid, driftWatch, DRIFT, nextInterval, RATE, gap,
} from '../js/eye/math.js';
import { createEyeCheck, EYE_DRILLS } from '../js/eye/index.js';
import { DOTS, DOT_MS } from '../js/eye/ui.js';
import { FEATURES } from '../js/features.js';
import { DEFAULTS, GROUPS } from '../js/settings.js';
import { createRng } from '../js/lib/rng.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const eyeFiles = readdirSync(new URL('js/eye/', root)).map((f) => `js/eye/${f}`);

// Pretend features for someone looking at [x, y] (plus a little noise).
const rng = createRng('eye-tests');
const noise = (a) => (rng.next() - 0.5) * a;
const look = ([x, y], n = 0.02) => ({
  hx: (x - 0.5) * 0.3 + noise(n), hb: (x - 0.5) * 0.8 + noise(n), yaw: noise(0.01),
  vy: (y - 0.5) * 0.12 + noise(n), vb: (0.5 - y) * 0.8 + noise(n), pitch: noise(0.01), open: 0.28 - (y - 0.5) * 0.05,
  size: 0.26, blink: 0,
});
const calSamples = (n = 0.02) => DOTS.flatMap((t) => Array.from({ length: 30 }, () => ({ f: look(t, n), t })));

test('Eye Check: opt-in (off by default); four FOCUS drills only (never MOVE or Gaze Stabilization)', () => {
  assert(!('eyeCheck' in FEATURES) && DEFAULTS.eyeCheck === 'off' && GROUPS.flatMap((g) => g.fields).some((f) => f.key === 'eyeCheck' && !f.flag), 'approved: an opt-in setting, no switch');
  assert(EYE_DRILLS.join() === 'quieteye,peripheral,saccades,pursuit', EYE_DRILLS.join());
  for (const f of [...readdirSync(new URL('js/cone/', root)).map((x) => `js/cone/${x}`).filter((x) => x.endsWith('.js'))]) {
    assert(!/eye\/|session\.eye/.test(read(f)), `${f} uses Eye Check`);
  }
  const gazeDrill = read('js/stages/eyes.js').split('export const gaze')[1];
  assert(!/session\.eye/.test(gazeDrill), 'Gaze Stabilization uses Eye Check');
  assert(/drill: 'quieteye'/.test(read('js/stages/quieteye.js')) && /drill: 'peripheral'/.test(read('js/stages/reaction.js'))
    && /drill: 'pursuit'/.test(read('js/stages/eyes.js')) && /drill: 'saccades'/.test(read('js/stages/eyes.js')), 'the four drills');
});

test('Features from face landmarks: the iris position and head pose come out the right way', () => {
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  // Two eyes, corners and lids, and irises sitting toward image-right.
  Object.assign(lm, { 33: { x: 0.36, y: 0.45 }, 133: { x: 0.44, y: 0.45 }, 362: { x: 0.56, y: 0.45 }, 263: { x: 0.64, y: 0.45 },
    159: { x: 0.4, y: 0.43 }, 145: { x: 0.4, y: 0.47 }, 386: { x: 0.6, y: 0.43 }, 374: { x: 0.6, y: 0.47 },
    468: { x: 0.42, y: 0.45 }, 473: { x: 0.62, y: 0.45 } });
  const f = eyeFeatures(lm, [{ categoryName: 'eyeBlinkLeft', score: 0.1 }], new Array(16).fill(0).map((_, i) => (i % 5 === 0 ? 1 : 0)));
  assert(f.hx > 0.2 && Math.abs(f.vy) < 0.01 && f.open > 0.3 && Math.abs(f.size - 0.28) < 0.001 && f.blink === 0.1 && f.yaw === 0, JSON.stringify(f));
  assert(eyeFeatures(null) === null && eyeFeatures(lm.slice(0, 400)) === null, 'no face, no features');
});

test('Calibration: five dots map the eyes to the screen; a bad one is caught', () => {
  assert(DOTS.length === 5 && DOTS[0].join() === '0.5,0.5', 'center, then four corners');
  assert(DOTS.length * (DOT_MS.settle + DOT_MS.collect) <= 10000, 'about 10 seconds');
  const samples = calSamples();
  const m = fitCalibration(samples);
  for (const t of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.7], [0.3, 0.85]]) {
    const p = predict(m, look(t, 0));
    assert(gap(p, t, 2) < 0.08, `looking at ${t} reads as ${p.map((v) => v.toFixed(2))}`);
  }
  const good = calibrationError(samples, 2);
  assert(good.error < 0.15 && good.leftRight, `error ${good.error}`);
  assert(accuracyLabel(good.error).word === 'Good', 'Good accuracy');
  // Eyes that don't follow the dots (sunglasses, bad light): the error is too big to use.
  const junk = DOTS.flatMap((t) => Array.from({ length: 30 }, () => ({ f: look([rng.next(), rng.next()], 0.02), t })));
  assert(calibrationError(junk, 2).error > 0.3, 'junk calibration is rejected');
  assert(MODEL.x.length + 1 <= 5 && MODEL.y.length + 1 <= 5, 'few enough inputs for five dots');
  assert(median([3, 1, 2]) === 2 && median([1, 2, 3, 4]) === 2.5, 'median');
});

test('Smoothing: "where" feedback is quick but steady; "still?" (Quiet Eye) is steadier still', () => {
  assert(SMOOTH.minCutoff > CALM.minCutoff && SMOOTH.beta > CALM.beta, 'two settings: responsive and calm');
  const spreadOf = (opts) => {
    const f = oneEuro(opts);
    const out = [];
    for (let i = 0; i < 120; i++) out.push(f(i * 33, 0.5 + noise(0.08)));
    return Math.max(...out.slice(30)) - Math.min(...out.slice(30));
  };
  const quick = spreadOf(SMOOTH);
  const calm = spreadOf(CALM);
  assert(quick < 0.06, `responsive jitter ${quick.toFixed(3)} from ±0.04 noise`);
  assert(calm < 0.04 && calm <= quick, `calm jitter ${calm.toFixed(3)}`);
  // Following a smoothly moving target (like the Pursuit dot): how far behind is the estimate?
  const behind = (opts) => {
    const g = gazeFilter(opts);
    let err = 0;
    let n = 0;
    for (let i = 0; i < 120; i++) {
      const x = 0.5 + 0.3 * Math.sin((2 * Math.PI * 0.5 * i * 33) / 1000);
      const p = g(i * 33, [x, 0.5]);
      if (i > 30) { err += Math.abs(p[0] - x); n++; }
    }
    return err / n;
  };
  assert(behind(SMOOTH) < 0.05 && behind(SMOOTH) < behind(CALM) * 0.8, `responsive ${behind(SMOOTH).toFixed(3)} vs calm ${behind(CALM).toFixed(3)} behind`);
  // A big jump still lands within a third of a second.
  const g = gazeFilter(SMOOTH);
  let p;
  for (let i = 0; i < 30; i++) p = g(i * 33, [0.2, 0.5]);
  for (let i = 30; i < 39; i++) p = g(i * 33, [0.8, 0.5]);
  assert(p[0] > 0.7, `a jump: ${p[0].toFixed(2)} after 0.3 s`);
});

test('Confidence: tips for each problem; pauses quietly after bad frames, returns after good ones', () => {
  const ok = look([0.5, 0.5]);
  assert(frameCheck(null).tip === 'face' && frameCheck(ok, 20).tip === 'dark' && frameCheck({ ...ok, size: 0.6 }).tip === 'near'
    && frameCheck({ ...ok, size: 0.08 }).tip === 'far' && frameCheck({ ...ok, blink: 0.9 }).tip === 'blink' && frameCheck(ok).ok, 'tips');
  const c = confidence();
  let t = 0;
  for (; t < 500; t += 33) c(t, true);
  assert(c(t, true), 'on after good frames');
  assert(c(t + 100, false), 'a blink doesn’t pause it');
  assert(!c(t + 800, false), 'paused after 0.6 s of bad frames');
  assert(!c(t + 900, true) && c(t + 1350, true), 'back after 0.4 s of good frames');
});

test('Feedback never blinks (under 3 changes a second, whatever the eyes do) yet answers quickly', () => {
  assert(FEEDBACK.minGapMs > 1000 / 3, 'under 3 changes a second');
  for (const flipMs of [40, 100, 160, 200, 260, 340, 500, 800]) {
    const s = settled();
    let changes = 0;
    let prev = false;
    for (let t = 0; t < 10000; t += 16) {
      const v = s(t, Math.floor(t / flipMs) % 2 === 0);
      if (v !== prev) changes++;
      prev = v;
    }
    assert(changes / 10 < 3, `eyes flipping every ${flipMs} ms: ${changes / 10} changes a second`);
  }
  const s = settled();
  let t = 0;
  while (!s(t, true)) t += 16;
  assert(t <= FEEDBACK.holdMs + 16 && FEEDBACK.holdMs <= 200, `a real change shows within ${t} ms`);
  assert(settled({ initial: true })(0, true) === true, 'can start on');
});

test('Speed: the graphics chip when it works and is faster; the main processor otherwise', () => {
  const run = (gpu, cpu) => {
    const p = delegatePicker();
    const switches = [];
    for (let i = 0; i < 60; i++) {
      const to = p.timing(p.current() === 'GPU' ? gpu(i) : cpu(i));
      if (to) switches.push(to);
    }
    return { now: p.current(), switches };
  };
  assert(run(() => 12, () => 25).now === 'GPU', 'a fast GPU stays');
  assert(run((i) => (i < DELEGATE.warmup ? 200 : 12), () => 25).now === 'GPU', 'a slow first few frames (warming up) don’t count');
  const slowGpu = run(() => 45, () => 20);
  assert(slowGpu.now === 'CPU' && slowGpu.switches.join() === 'CPU', 'a slow GPU hands over to a faster CPU');
  const bothSlow = run(() => 45, () => 70);
  assert(bothSlow.now === 'GPU' && bothSlow.switches.join() === 'CPU,GPU', 'if the CPU is slower still, back to the GPU, once');
  const broken = delegatePicker();
  assert(broken.failed() === 'CPU' && broken.current() === 'CPU' && broken.failed() === null && broken.timing(500) === null, 'a GPU that breaks: the CPU, for good');
  const idx = read('js/eye/index.js');
  assert(/requestVideoFrameCallback/.test(idx) && /requestAnimationFrame\(tick\)/.test(idx), 'each new camera frame as it arrives, with a fallback');
  assert(/fill\(tt, eye\.calm\(\), tgt\)/.test(read('js/stages/quieteye.js')), 'Quiet Eye judges stillness on the steadier estimate');
});

test('Quiet Eye ring: fills only while the eyes are steady on the target; resets when they move', () => {
  assert(STEADY.ms <= 400, 'steady is judged over a short window');
  const target = [0.5, 0.5];
  const ring = quietRing({ lockMs: 2500 });
  let r;
  for (let t = 0; t <= 3000; t += 33) r = ring(t, [0.51, 0.5], target);
  assert(r.progress === 1 && r.on, 'full after 2.5 s of steady looking');
  const moving = quietRing({ lockMs: 2500 });
  for (let t = 0; t <= 3000; t += 33) r = moving(t, [0.5 + Math.sin(t / 100) * 0.15, 0.5], target);
  assert(r.progress < 0.3, `eyes moving: ${r.progress}`);
  const away = quietRing({ lockMs: 2500 });
  for (let t = 0; t <= 3000; t += 33) r = away(t, [0.9, 0.1], target);
  assert(r.progress === 0 && !r.on, 'looking elsewhere');
  const lost = quietRing({ lockMs: 2500 });
  for (let t = 0; t <= 1500; t += 33) r = lost(t, [0.5, 0.5], target);
  const before = r.progress;
  for (let t = 1500; t <= 2500; t += 33) r = lost(t, null, target);
  assert(r.progress === before, 'no reading: holds where it was');
  const st = steadyTracker();
  let still;
  for (let t = 0; t < 600; t += 33) still = st(t, [0.5, 0.5]);
  assert(still, 'still eyes are steady');
});

test('Saccade check (direction only) and which way the eyes left the center', () => {
  assert(SACCADE.minMoveVertical > SACCADE.minMove, 'up / down needs a bigger move (less reliable)');
  assert(movedToward([0.5, 0.5], [0.7, 0.5], [0.85, 0.5]), 'moved right toward a right target');
  assert(!movedToward([0.5, 0.5], [0.3, 0.5], [0.85, 0.5]), 'moved the wrong way');
  assert(!movedToward([0.5, 0.5], [0.53, 0.5], [0.85, 0.5]), 'too small to tell');
  assert(!movedToward(null, [0.7, 0.5], [0.85, 0.5]), 'no reading before: no check');
  assert(sideOf([0.52, 0.5], [0.5, 0.5]) === null && sideOf([0.1, 0.5], [0.5, 0.5]) === 'left' && sideOf([0.9, 0.52], [0.5, 0.5]) === 'right'
    && sideOf([0.5, 0.1], [0.5, 0.5]) === 'up' && sideOf([0.5, 0.95], [0.5, 0.5]) === 'down', 'sides');
});

test('Summary stats and one plain tip per drill; drift and slow phones are handled', () => {
  const gz = (pts) => pts.map(([t, x, y]) => [t, x, y]);
  const periph = drillStats({ drill: 'peripheral', center: [0.5, 0.5], targets: [],
    gaze: gz([...Array.from({ length: 80 }, (_, i) => [i * 45, 0.5, 0.5]), ...Array.from({ length: 6 }, (_, i) => [4000 + i * 45, 0.9, 0.5]), ...Array.from({ length: 14 }, (_, i) => [4300 + i * 45, 0.5, 0.5])]) });
  assert(periph.lines[0] === 'Eyes centered 94%' && periph.lines[1] === 'Looked away 1 time' && /drifted right/.test(periph.tip), JSON.stringify(periph));
  const pursuit = drillStats({ drill: 'pursuit', targets: Array.from({ length: 50 }, (_, i) => [i * 45, 0.3, 0.5]), gaze: gz(Array.from({ length: 50 }, (_, i) => [i * 45, i < 40 ? 0.32 : 0.9, 0.5])) });
  assert(pursuit.lines[0] === 'On track 80%', pursuit.lines[0]);
  const qe = drillStats({ drill: 'quieteye', targets: [[0, 0.5, 0.5], [3000, 0.4, 0.4]], locks: [2600, 0], gaze: gz([[0, 0.5, 0.5]]) });
  assert(qe.lines[0] === 'Quiet Eye: 2.6 s average' && qe.lines[1] === 'Locked on 1 of 2', qe.lines.join());
  const sac = drillStats({ drill: 'saccades', targets: [], checks: [true, true, false], gaze: gz([[0, 0.5, 0.5], [45, null]]) });
  assert(sac.lines[0] === 'Moved toward the target 2 of 3' && /worked 50%/.test(sac.lines.at(-1)) && /brighter light/.test(sac.tip), sac.lines.join());
  for (const st of [periph, pursuit, qe, sac]) {
    const text = (st.lines.join(' ') + st.tip).toLowerCase();
    for (const bad of ['diagnos', 'concussion', 'impair', 'vision problem', 'injur', 'symptom']) assert(!text.includes(bad), `"${bad}" in Eye Check feedback`);
  }
  const heat = heatGrid([[0, 0.5, 0.5], [1, 0.5, 0.5], [2, 0.1, 0.1], [3, null]]);
  assert(Math.max(...heat.flat()) === 1 && heat.flat().filter((v) => v > 0).length === 2, 'heat map');
  const drift = driftWatch();
  let flagged = false;
  for (let t = 0; t <= DRIFT.ms + 400; t += 33) flagged = drift(t, [0.9, 0.9], [0.5, 0.5], true);
  assert(flagged, 'steady looks far from the target suggest recalibrating');
  // Frames arrive about every 33 ms with some jitter: none skipped at full speed, every other one when slowed.
  const kept = (gap, interval) => { let last = -Infinity; let n = 0; for (let t = 0; t < 3000; t += gap + (n % 2 ? 1.5 : -1.5)) { if (t - last >= interval - RATE.slackMs) { last = t; n++; } } return n; };
  assert(kept(33.3, RATE.fastMs) >= 88 && kept(33.3, RATE.slowMs) <= 46 && kept(16.7, RATE.fastMs) <= 92, `frames kept: ${kept(33.3, RATE.fastMs)}, ${kept(33.3, RATE.slowMs)}, ${kept(16.7, RATE.fastMs)}`);
  assert(nextInterval(RATE.fastMs, 10) === RATE.fastMs && nextInterval(RATE.fastMs, 50) === RATE.slowMs && nextInterval(RATE.slowMs, 200) === null, 'slower, then stop');
});

// ---- The controller, with a fake camera, tracker and screens -----------------
function fakeCamera() {
  const listeners = [];
  const track = { readyState: 'live', stop() { this.readyState = 'ended'; }, addEventListener: (e, fn) => listeners.push(fn), end() { listeners.forEach((fn) => fn()); } };
  return { stream: { getTracks: () => [track] }, track };
}
function harness({ media, explainAnswer = true, readFrame } = {}) {
  const notes = [];
  globalThis.requestAnimationFrame ??= (cb) => setTimeout(() => cb(performance.now()), 8);
  globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);
  const cam = fakeCamera();
  const eye = createEyeCheck({
    media: media ?? (async () => cam.stream),
    loadLandmarker: async () => ({ close() {} }),
    read: readFrame ?? (() => ({ f: look([0.5, 0.5], 0.01), brightness: 120 })),
    ui: {
      explain: async () => explainAnswer,
      preflight: async () => true,
      calibrate: async () => calSamples(0.01),
      seeGaze: async () => 'go',
      failed: async () => false,
      setRecalibrate() {},
      status: { camera() {}, paused() {}, note: (t) => notes.push(t), flash: (t) => notes.push(t) },
    },
  });
  const ctx = { hold: (fn) => fn(), isPaused: () => false };
  return { eye, ctx, cam, notes };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('The GPU tracker won’t start: the CPU one does, and Eye Check carries on', async () => {
  const asked = [];
  const h = harness();
  const eye = createEyeCheck({
    media: async () => h.cam.stream,
    loadLandmarker: async (d) => { asked.push(d); if (d === 'GPU') throw new Error('no WebGL'); return { close() {} }; },
    read: () => ({ f: look([0.5, 0.5], 0.01), brightness: 120 }),
    ui: { explain: async () => true, preflight: async () => true, calibrate: async () => calSamples(0.01), seeGaze: async () => 'go', failed: async () => false, setRecalibrate() {}, status: { camera() {}, paused() {}, note() {}, flash() {}, engine: (e) => asked.push(`engine:${e}`) } },
  });
  const t = await eye.open(h.ctx, { drill: 'quieteye', title: 'Quiet Eye' });
  assert(t && asked.join() === 'GPU,CPU,engine:CPU', asked.join());
  t.close();
  eye.dispose();
});

test('Camera declined or blocked: no eye features, the drill runs normally', async () => {
  const no = harness({ explainAnswer: false });
  assert(await no.eye.open(no.ctx, { drill: 'quieteye', title: 'Quiet Eye' }) === null, '"Not now"');
  assert(!no.eye.cameraIsOn() && await no.eye.open(no.ctx, { drill: 'pursuit', title: 'x' }) === null, 'not asked again this session');
  const blocked = harness({ media: async () => { throw new Error('NotAllowedError'); } });
  assert(await blocked.eye.open(blocked.ctx, { drill: 'peripheral', title: 'Peripheral Flash' }) === null, 'permission denied');
  assert(blocked.notes.some((n) => /runs normally/.test(n)), 'says the drill runs normally');
  const move = harness();
  assert(await move.eye.open(move.ctx, { drill: 'gaze', title: 'Gaze' }) === null && !move.eye.cameraIsOn(), 'not in Gaze Stabilization');
});

test('Tracking: estimates while the picture is good, pauses when it isn’t, and the camera turns off when the drill ends', async () => {
  let face = true;
  const h = harness({ readFrame: () => ({ f: face ? look([0.8, 0.3], 0.01) : null, brightness: 120 }) });
  const t = await h.eye.open(h.ctx, { drill: 'pursuit', title: 'Smooth Pursuit' });
  assert(t && h.eye.cameraIsOn(), 'calibrated and tracking');
  await wait(900);
  const g = t.gaze();
  assert(g && gap(g, [0.8, 0.3], 2) < 0.15, `estimated gaze ${g}`);
  face = false;
  await wait(900);
  assert(t.gaze() === null && !t.active(), 'low confidence: eye features pause quietly');
  face = true;
  await wait(700);
  assert(t.gaze() !== null, 'and come back');
  t.mark([0.5, 0.5]);
  t.close();
  assert(!h.eye.cameraIsOn() && h.cam.track.readyState === 'ended', 'camera off the moment the drill ends');
  const recs = h.eye.recordings();
  assert(recs.length === 1 && recs[0].gaze.length > 10 && recs[0].gaze.some((x) => x[1] == null), 'kept for the summary, gaps included');
  assert(Object.keys(recs[0]).every((k) => ['drill', 'title', 'start', 'gaze', 'targets', 'center', 'locks', 'checks', 'error', 'aspect', 'end'].includes(k)), 'only numbers, no images');
  h.eye.dispose();
  assert(h.eye.recordings().length === 0, 'forgotten when the summary closes');
});

test('Camera lost mid-drill: eye features stop, the camera is released, the drill keeps going', async () => {
  const h = harness();
  const t = await h.eye.open(h.ctx, { drill: 'saccades', title: 'Saccade Jumps' });
  await wait(200);
  h.cam.track.end();
  assert(!h.eye.cameraIsOn() && t.gaze() === null && h.notes.some((n) => /drill keeps going/.test(n)), 'lost');
  t.close();
  assert(h.eye.recordings().length === 1, 'what it saw so far still shows on the summary');
});

test('Privacy: no video or image is saved or sent; Eye Check talks to no server', () => {
  for (const f of eyeFiles) {
    const src = read(f).replace(/^\s*\/\/.*$/gm, '');
    for (const bad of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB', 'caches.', 'toDataURL', 'toBlob', 'MediaRecorder', 'ImageCapture', '/api/']) {
      assert(!src.includes(bad), `${f} uses ${bad}`);
    }
  }
  const idx = read('js/eye/index.js');
  assert((idx.match(/getImageData/g) ?? []).length === 1 && /getImageData\(0, 0, 16, 12\)/.test(idx) && /clearRect\(0, 0, 16, 12\)/.test(idx), 'only a 16 × 12 brightness reading, then cleared');
  const bundle = read('vendor/mediapipe/vision_bundle.mjs');
  assert(!/https?:\/\//.test(bundle), 'the face tracker has no web addresses');
  assert(/VENDOR = new URL\('\.\.\/\.\.\/vendor\/mediapipe\/', import\.meta\.url\)/.test(idx), 'loaded from Sightline itself');
  const sw = read('sw.js');
  assert(!sw.includes("'./vendor/mediapipe/") && /EYE_CACHE = 'sightline-eye-v1'/.test(sw), 'not precached for everyone; saved on first use');
});

test('Eye data never reaches scoring or the leaderboard', () => {
  for (const f of readdirSync(new URL('js/score/', root)).map((x) => `js/score/${x}`)) assert(!/eye\/|session\.eye|gaze|eyeCheck|recordings/.test(read(f)), `${f} uses Eye Check data`);
  for (const f of ['js/stages/quieteye.js', 'js/stages/reaction.js', 'js/stages/eyes.js']) {
    for (const line of read(f).split('\n').filter((l) => /scorer|level\.update/.test(l))) assert(!/\beye\b|look\.|gaze/.test(line), `${f}: ${line.trim()}`);
  }
  const focus = read('js/focus.js');
  const entry = focus.slice(focus.indexOf('function focusEntry'), focus.indexOf('\n  }\n', focus.indexOf('function focusEntry')));
  assert(!/eye/i.test(entry), 'the leaderboard entry has no eye data');
  // Quiet Eye waits for steady eyes only in held time, so the number of targets (and the score) doesn’t change.
  assert(/await hold\(async \(\) => \{\s*const until = now\(\) \+ EYE_WAIT_MS/.test(read('js/stages/quieteye.js')), 'the extra wait is held');
});

test('Every eye drill turns the camera off when it ends, even when stopped early', () => {
  const sources = { quieteye: read('js/stages/quieteye.js'), reaction: read('js/stages/reaction.js'), eyes: read('js/stages/eyes.js') };
  for (const [name, src] of Object.entries(sources)) {
    const opens = (src.match(/session\.eye\?\.open\(/g) ?? []).length;
    const closes = (src.match(/finally \{\s*eye\?\.close\(\);/g) ?? []).length;
    assert(opens > 0 && opens === closes, `${name}: ${opens} opens, ${closes} closes in finally`);
  }
  const focus = read('js/focus.js');
  assert(/session\.eye\?\.dispose\(\);[\s\S]{0,120}if \(!completed\)/.test(focus), 'and the whole session releases it, finished or not');
});
