// Eye Check (beta): the math, with no camera or screen, so the tests can run
// it in Node. Everything here is an estimate: a phone's front camera gives a
// general direction (left / center / right, a rough 3×3 grid at best), about
// 30 times a second, so nothing measures eye-jump speed or eye reaction time.
//
// Screen positions are normalized: x 0..1 across the screen, y 0..1 down it.
// Distances are in "screen widths" (y is scaled by the screen's height / width).

// ---- Features from one camera frame ------------------------------------------
// Face Landmarker (MediaPipe) landmarks: eye corners and lids per eye, and the
// two iris centers (468, 473). Each eye is measured the same way in the image:
// where the iris sits between its corners (h), how far above or below the
// corner line (v), and how open the eye is.
const EYES = [
  { corners: [33, 133], lids: [159, 145] },
  { corners: [362, 263], lids: [386, 374] },
];
const IRIS = [468, 473];

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const dot2 = (a, b) => a.x * b.x + a.y * b.y;
const len = (a) => Math.hypot(a.x, a.y);
const mean = (xs) => xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const score = (shapes, name) => shapes?.find((c) => c.categoryName === name)?.score ?? 0;

// One frame → features, or null when there's no usable face.
//   landmarks: [{x, y}] (normalized image coordinates), blendshapes: [{categoryName, score}],
//   matrix: 16 numbers (the face's pose, column-major) or null.
export function eyeFeatures(landmarks, blendshapes = [], matrix = null) {
  if (!landmarks || landmarks.length < 478) return null;
  const per = EYES.map(({ corners, lids }) => {
    let [a, b] = corners.map((i) => landmarks[i]);
    if (a.x > b.x) [a, b] = [b, a];   // image-left corner first, for both eyes
    const span = sub(b, a);
    const w = len(span);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // The iris nearer this eye's middle belongs to it.
    const iris = IRIS.map((i) => landmarks[i]).sort((p, q) => len(sub(p, mid)) - len(sub(q, mid)))[0];
    const normal = { x: -span.y / w, y: span.x / w };   // points down the image
    const [up, low] = lids.map((i) => landmarks[i]);
    return {
      h: dot2(sub(iris, a), span) / (w * w) - 0.5,
      v: dot2(sub(iris, mid), normal) / w,
      open: len(sub(low, up)) / w,
      w,
    };
  });
  const out = {
    hx: mean(per.map((e) => e.h)),
    vy: mean(per.map((e) => e.v)),
    open: mean(per.map((e) => e.open)),
    // How big the face is in the picture: the gap between the outer eye corners.
    size: len(sub(landmarks[33], landmarks[263])),
    hb: (score(blendshapes, 'eyeLookOutLeft') + score(blendshapes, 'eyeLookInRight')) / 2
      - (score(blendshapes, 'eyeLookInLeft') + score(blendshapes, 'eyeLookOutRight')) / 2,
    vb: (score(blendshapes, 'eyeLookUpLeft') + score(blendshapes, 'eyeLookUpRight')) / 2
      - (score(blendshapes, 'eyeLookDownLeft') + score(blendshapes, 'eyeLookDownRight')) / 2,
    blink: Math.max(score(blendshapes, 'eyeBlinkLeft'), score(blendshapes, 'eyeBlinkRight')),
    yaw: 0,
    pitch: 0,
  };
  if (matrix && matrix.length >= 16) {
    out.yaw = Math.atan2(matrix[8], matrix[10]);
    out.pitch = Math.atan2(-matrix[9], Math.hypot(matrix[8], matrix[10]));
  }
  return out;
}

// ---- Calibration: features → screen position ---------------------------------
// A small linear model per axis, fitted with ridge regression (it can't
// overfit five dots much). Inputs are standardized from the calibration samples.
export const MODEL = {
  x: ['hx', 'hb', 'yaw'],
  y: ['vy', 'vb', 'pitch', 'open'],
  ridge: 0.15,
};

// Solves (AᵀA + λI) w = Aᵀb by Gauss-Jordan elimination (tiny systems only).
function solve(A, b, lambda) {
  const n = A[0].length;
  const M = Array.from({ length: n }, (_, i) => {
    const row = Array.from({ length: n }, (_, j) => A.reduce((s, r) => s + r[i] * r[j], 0) + (i === j && i > 0 ? lambda * A.length : 0));
    row.push(A.reduce((s, r, k) => s + r[i] * b[k], 0));
    return row;
  });
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-9;
    for (let j = c; j <= n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row) => row[n]);
}

// samples: [{ f: features, t: [x, y] }] from the calibration dots.
export function fitCalibration(samples, { ridge = MODEL.ridge } = {}) {
  const fit = (keys, axis) => {
    const mu = keys.map((k) => mean(samples.map((s) => s.f[k])));
    const sd = keys.map((k, i) => Math.sqrt(mean(samples.map((s) => (s.f[k] - mu[i]) ** 2))) || 1);
    const A = samples.map((s) => [1, ...keys.map((k, i) => (s.f[k] - mu[i]) / sd[i])]);
    return { keys, mu, sd, w: solve(A, samples.map((s) => s.t[axis]), ridge) };
  };
  return { x: fit(MODEL.x, 0), y: fit(MODEL.y, 1) };
}

export function predict(model, f) {
  const one = ({ keys, mu, sd, w }) => w[0] + keys.reduce((s, k, i) => s + w[i + 1] * ((f[k] - mu[i]) / sd[i]), 0);
  return [clamp(one(model.x), -0.1, 1.1), clamp(one(model.y), -0.1, 1.1)];
}

// Distance in screen widths. aspect = screen height / width.
export const gap = ([x1, y1], [x2, y2], aspect = 2) => Math.hypot(x1 - x2, (y1 - y2) * aspect);

// How well calibration will do on new looks: fit on four dots, test on the
// fifth, for each dot (median error, in screen widths). Also whether left and
// right came out the right way round.
export function calibrationError(samples, aspect = 2) {
  const dots = [...new Set(samples.map((s) => s.t.join()))];
  const errs = [];
  for (const d of dots) {
    const train = samples.filter((s) => s.t.join() !== d);
    const test = samples.filter((s) => s.t.join() === d);
    if (!train.length || !test.length) continue;
    const m = fitCalibration(train);
    const p = [median(test.map((s) => predict(m, s.f)[0])), median(test.map((s) => predict(m, s.f)[1]))];
    errs.push(gap(p, test[0].t, aspect));
  }
  const all = fitCalibration(samples);
  const at = (x) => median(samples.filter((s) => s.t[0] === x).map((s) => predict(all, s.f)[0]));
  const xs = [...new Set(samples.map((s) => s.t[0]))].sort((a, b) => a - b);
  return { error: errs.length ? median(errs) : Infinity, leftRight: xs.length < 2 || at(xs[0]) < at(xs.at(-1)) };
}

export function median(xs) {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Accuracy, in words, from the calibration error (screen widths).
export function accuracyLabel(error) {
  if (error <= 0.18) return { word: 'Good', note: 'left, center and right, and a rough 3 × 3 grid' };
  if (error <= 0.3) return { word: 'OK', note: 'left, center and right' };
  return { word: 'Rough', note: 'only big glances' };
}

// ---- Smoothing ---------------------------------------------------------------
// One Euro filter: steady when the eyes are still, quicker when they move.
// Two settings: SMOOTH for "where are the eyes" feedback (Pursuit, Saccades,
// Peripheral; responsive, still smoothed so it doesn't jitter) and CALM, much
// heavier, for "are the eyes still" (Quiet Eye, drift), where lag doesn't matter.
export const SMOOTH = { minCutoff: 1.0, beta: 0.7, dCutoff: 1 };
export const CALM = { minCutoff: 0.5, beta: 0.4, dCutoff: 1 };
function lowpass() {
  let y = null;
  return (x, a) => (y = y == null ? x : y + a * (x - y));
}
const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
export function oneEuro({ minCutoff = SMOOTH.minCutoff, beta = SMOOTH.beta, dCutoff = SMOOTH.dCutoff } = {}) {
  const xf = lowpass();
  const df = lowpass();
  let prevT = null;
  let prevX = null;
  return (t, x) => {
    const dt = prevT == null ? 1 / 30 : Math.max(1e-3, (t - prevT) / 1000);
    const dx = prevX == null ? 0 : (x - prevX) / dt;
    prevT = t;
    const edx = df(dx, alpha(dCutoff, dt));
    prevX = xf(x, alpha(minCutoff + beta * Math.abs(edx), dt));
    return prevX;
  };
}
export function gazeFilter(opts) {
  const fx = oneEuro(opts);
  const fy = oneEuro(opts);
  return (t, [x, y]) => [fx(t, x), fy(t, y)];
}

// ---- Is the picture good enough? ---------------------------------------------
// brightness: 0..255 (the average of a tiny copy of the frame, never kept).
export const LIMITS = { dark: 45, near: 0.5, far: 0.14, blink: 0.55 };
export const TIPS = {
  face: 'Keep your face in view of the front camera.',
  dark: 'Move to brighter light.',
  near: 'Hold the phone a little farther away.',
  far: 'Hold the phone a little closer.',
  blink: 'Keep your eyes open and look at the screen.',
  glasses: 'Remove sunglasses.',
};
export function frameCheck(f, brightness = 128) {
  if (!f) return { ok: false, tip: 'face' };
  if (brightness < LIMITS.dark) return { ok: false, tip: 'dark' };
  if (f.size > LIMITS.near) return { ok: false, tip: 'near' };
  if (f.size < LIMITS.far) return { ok: false, tip: 'far' };
  if (f.blink > LIMITS.blink) return { ok: false, tip: 'blink' };
  return { ok: true, tip: null };
}

// Quietly pauses the eye features after a short run of bad frames and brings
// them back after a short run of good ones (no flicker between the two).
export function confidence({ dropMs = 600, backMs = 300 } = {}) {
  let ok = false;
  let since = null;
  return (t, good) => {
    if (good === ok) { since = null; return ok; }
    since ??= t;
    if (t - since >= (good ? backMs : dropMs)) { ok = good; since = null; }
    return ok;
  };
}

// ---- Indirect feedback --------------------------------------------------------
// A yes/no state (in the zone, on track, eyes away) that only changes after it
// has held for a moment, and never more than about 2.8 times a second, so
// nothing on screen blinks (photosensitivity: under 3 changes a second).
export const FEEDBACK = { holdMs: 150, minGapMs: 350 };
export function settled({ holdMs = FEEDBACK.holdMs, minGapMs = FEEDBACK.minGapMs, initial = false } = {}) {
  let state = initial;
  let since = null;
  let changedAt = -Infinity;
  return (t, want) => {
    if (want === state) { since = null; return state; }
    since ??= t;
    if (t - since >= holdMs && t - changedAt >= minGapMs) { state = want; changedAt = t; since = null; }
    return state;
  };
}

// Eyes still: every point of the last `ms` within `radius` of their middle.
export const STEADY = { ms: 350, radius: 0.07 };
export function steadyTracker({ ms = STEADY.ms, radius = STEADY.radius, aspect = 2 } = {}) {
  let pts = [];
  return (t, p) => {
    pts.push([t, p]);
    pts = pts.filter(([u]) => t - u <= ms);
    if (pts.length < 3 || t - pts[0][0] < ms * 0.6) return false;
    const c = [mean(pts.map(([, q]) => q[0])), mean(pts.map(([, q]) => q[1]))];
    return pts.every(([, q]) => gap(q, c, aspect) <= radius);
  };
}

// Quiet Eye ring: fills while the eyes are steady on the target, resets when
// they move away; full after lockMs of steady looking. Returns { progress
// (0..1), runMs (this steady look so far), on (eyes on the target) }.
export function quietRing({ lockMs, zone = 0.28, aspect = 2 }) {
  const steady = steadyTracker({ aspect });
  let filled = 0;
  let last = null;
  let on = false;
  return (t, gaze, target) => {
    const dt = last == null ? 0 : t - last;
    last = t;
    if (gaze) {   // no reading: hold where it is
      on = gap(gaze, target, aspect) <= zone;
      filled = on && steady(t, gaze) ? filled + dt : 0;
    }
    return { progress: Math.min(1, filled / lockMs), runMs: filled, on };
  };
}

// Saccade check (direction only): did the eyes move toward the new target?
// from: gaze when it appeared; now: gaze since; target: where it is.
// Left / right is more reliable than up / down, so up / down needs a bigger move.
export const SACCADE = { minMove: 0.1, minMoveVertical: 0.16, maxAngle: 50 };
export function movedToward(from, now, target, aspect = 2) {
  if (!from || !now) return false;
  const want = [target[0] - from[0], (target[1] - from[1]) * aspect];
  const got = [now[0] - from[0], (now[1] - from[1]) * aspect];
  const g = Math.hypot(...got);
  const w = Math.hypot(...want);
  const vertical = Math.abs(want[1]) > Math.abs(want[0]);
  if (w < SACCADE.minMove || g < (vertical ? SACCADE.minMoveVertical : SACCADE.minMove)) return false;
  const cos = (want[0] * got[0] + want[1] * got[1]) / (g * w);
  return cos >= Math.cos((SACCADE.maxAngle * Math.PI) / 180);
}

// Which way the eyes left the center (for the edge glow): 'left' | 'right' | 'up' | 'down' | null.
export function sideOf(gaze, center, zone = 0.2, aspect = 2) {
  if (!gaze || gap(gaze, center, aspect) <= zone) return null;
  const dx = gaze[0] - center[0];
  const dy = (gaze[1] - center[1]) * aspect;
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}

// ---- After the drill: stats, heat map, one tip ---------------------------------
// rec = { drill, gaze: [[t, x, y] | [t, null]], targets: [[t, x, y]], center?, locks?: [ms], checks?: [bool] }
export const ZONES = { center: 0.2, track: 0.28 };
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

export function drillStats(rec, aspect = 2) {
  const seen = rec.gaze.filter((g) => g[1] != null);
  const tracked = pct(seen.length, rec.gaze.length);
  const lines = [];
  let tip = null;
  if (rec.drill === 'peripheral') {
    const c = rec.center ?? [0.5, 0.5];
    const away = seen.map((g) => sideOf([g[1], g[2]], c, ZONES.center, aspect));
    const centered = pct(away.filter((s) => !s).length, away.length);
    // A glance: away from the center for 4+ readings in a row (about 0.2 s).
    let glances = 0;
    let run = 0;
    const sides = {};
    for (const s of away) {
      run = s ? run + 1 : 0;
      if (run === 4) { glances++; sides[s] = (sides[s] ?? 0) + 1; }
    }
    lines.push(`Eyes centered ${centered}%`, `Looked away ${glances} time${glances === 1 ? '' : 's'}`);
    const most = Object.entries(sides).sort((a, b) => b[1] - a[1])[0];
    tip = most ? `Your eyes drifted ${most[0]} most often. Try softening your focus on the center dot and let the edges come to you.`
      : 'Your eyes stayed on the center dot. Keep that soft, steady focus.';
  } else if (rec.drill === 'pursuit') {
    const near = seen.filter((g) => {
      const tgt = nearestTarget(rec.targets, g[0]);
      return tgt && gap([g[1], g[2]], tgt, aspect) <= ZONES.track;
    }).length;
    const on = pct(near, seen.length);
    lines.push(`On track ${on}%`);
    tip = on >= 70 ? 'Your eyes stayed with the dot. Keep your head still and let your eyes lead.'
      : 'Your eyes fell behind the dot at times. Keep your head still and follow it smoothly, not in jumps.';
  } else if (rec.drill === 'saccades') {
    const checks = rec.checks ?? [];
    const right = checks.filter(Boolean).length;
    lines.push(`Moved toward the target ${right} of ${checks.length}`);
    tip = pct(right, checks.length) >= 60 ? 'Quick, clean jumps. Keep your head still and let your eyes do the work.'
      : 'Try snapping your eyes straight to each number, then saying it.';
  } else if (rec.drill === 'quieteye') {
    // locks: the steady look on each target (ms), 0 where the eyes never locked on.
    const locks = (rec.locks ?? []).filter((ms) => ms > 0);
    const all = (rec.locks ?? []).length;
    const avg = locks.length ? mean(locks) / 1000 : 0;
    lines.push(`Quiet Eye: ${avg.toFixed(1)} s average`, `Locked on ${locks.length} of ${all}`);
    tip = locks.length >= all * 0.7 ? 'Steady eyes. Bring that same still look to your routine.'
      : 'Let your eyes settle on the dot before anything else. Still eyes first, then the action.';
  }
  lines.push(`Eye tracking worked ${tracked}% of the drill`);
  if (tracked < 60) tip = 'Tracking dropped out often. Try brighter light and propping the phone up at eye level.';
  return { lines, tip, tracked };
}

const nearestTarget = (targets, t) => {
  let best = null;
  for (const tg of targets) { if (tg[0] <= t + 40) best = tg; else break; }
  return best ? [best[1], best[2]] : null;
};

// Where the eyes spent their time: a cols × rows grid of shares (0..1, the busiest cell 1).
export function heatGrid(gaze, cols = 9, rows = 16) {
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (const g of gaze) {
    if (g[1] == null) continue;
    const c = clamp(Math.floor(g[1] * cols), 0, cols - 1);
    const r = clamp(Math.floor(g[2] * rows), 0, rows - 1);
    grid[r][c]++;
  }
  const top = Math.max(1, ...grid.flat());
  return grid.map((row) => row.map((v) => v / top));
}

// Drift: steady looks that land far from where the drill says the eyes should
// be. A few seconds of that, and Eye Check suggests recalibrating.
export const DRIFT = { off: 0.3, ms: 3000 };
export function driftWatch({ aspect = 2 } = {}) {
  let offMs = 0;
  let last = null;
  return (t, gaze, expected, steady) => {
    const dt = last == null ? 0 : Math.min(200, t - last);
    last = t;
    if (gaze && expected && steady && gap(gaze, expected, aspect) > DRIFT.off) offMs += dt;
    return offMs >= DRIFT.ms;
  };
}

// Which part of the phone runs the face tracker: the graphics chip (GPU) first,
// the main processor (CPU) if the GPU fails, or if it's slow and the CPU turns
// out faster. Decided from the first readings (often during calibration), then kept.
export const DELEGATE = { warmup: 5, sample: 20, slowMs: 30 };
export function delegatePicker() {
  const times = { GPU: [], CPU: [] };
  let current = 'GPU';
  let settled = false;
  return {
    current: () => current,
    // The GPU tracker broke: the CPU for good. Returns the delegate to switch to, or null.
    failed() {
      if (current !== 'GPU') return null;
      current = 'CPU';
      settled = true;
      return 'CPU';
    },
    // One detection took `ms`. Returns the delegate to switch to, or null.
    timing(ms) {
      if (settled) return null;
      const list = times[current];
      list.push(ms);
      if (list.length < DELEGATE.warmup + DELEGATE.sample) return null;
      const typical = median(list.slice(DELEGATE.warmup));
      if (current === 'GPU') {
        if (typical < DELEGATE.slowMs) { settled = true; return null; }
        current = 'CPU';   // slow on the GPU: see if the CPU does better
        return 'CPU';
      }
      settled = true;
      if (typical > median(times.GPU.slice(DELEGATE.warmup))) { current = 'GPU'; return 'GPU'; }
      return null;
    },
  };
}

// Tracking rate: slower on older or busy phones; stop if the phone can't keep up.
export const RATE = { fastMs: 33, slowMs: 66, slowAt: 40, stopAt: 110, slackMs: 8 };
export function nextInterval(currentMs, avgDetectMs) {
  if (avgDetectMs >= RATE.stopAt) return null;   // the phone is running slow: stop
  if (avgDetectMs >= RATE.slowAt) return RATE.slowMs;
  return currentMs;
}
