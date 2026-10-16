// Eye Check (beta): estimates where the athlete's eyes are looking, with the
// front camera, during four FOCUS drills (Quiet Eye, Peripheral Flash, Saccade
// Jumps, Smooth Pursuit). Never MOVE, never Gaze Stabilization. Opt-in
// (Settings → Eye Check, off by default).
//
// Privacy: frames go straight from the camera into MediaPipe Face Landmarker
// (vendor/mediapipe/, served by Sightrep itself) on the phone. No video or
// image is recorded, saved or sent anywhere. Only a handful of numbers per
// frame (an estimated gaze point) are kept, in memory, for this session's
// summary, and dropped when the summary closes.
//
// Rules: feedback only (never scores or the leaderboard); "estimated" on
// everything; the camera is on only during an eye drill (and its
// calibration), with an on-screen indicator, and off the moment the drill
// ends; if tracking gets unreliable it pauses quietly and the drill carries
// on; slower tracking on older phones, and a stop if the phone runs slow.
//
//   const eye = createEyeCheck()                  one per FOCUS session
//   const t = await eye.open(ctx, { drill, title }) inside a drill: null = run it normally
//   t.gaze() → [x, y] | null (responsive)   t.calm() → [x, y] | null (heavier smoothing, for stillness)
//   t.at(el) → [x, y]   t.mark([x, y])   t.expect([x, y] | null)
//   t.note(key, value)   t.active()   t.close()
//   eye.recordings() → for the summary;  eye.dispose() → forget everything

import {
  eyeFeatures, fitCalibration, predict, calibrationError, gazeFilter, frameCheck, confidence,
  steadyTracker, driftWatch, nextInterval, delegatePicker, RATE, CALM,
} from './math.js';
import {
  explain as explainScreen, preflight as preflightScreen, calibrate as calibrateScreen, seeGaze as seeGazeScreen,
  failed as failedScreen, status as statusLine, setRecalibrate as recalibrateButton,
} from './ui.js';

const VENDOR = new URL('../../vendor/mediapipe/', import.meta.url).href;
// A tiny module that only loads with WebAssembly SIMD (the build Sightrep ships).
const SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

export const EYE_DRILLS = ['quieteye', 'peripheral', 'saccades', 'pursuit'];

// deps (tests and ?eyesim=1): media (getUserMedia), loadLandmarker(delegate), read(t) →
// { f, brightness } in place of the face tracker, now, ui (the screens).
// Speed: the face tracker runs on the phone's graphics chip when that works and
// is faster (delegatePicker), and each new camera frame is read as it arrives.
export function createEyeCheck(deps = {}) {
  const media = deps.media ?? ((c) => navigator.mediaDevices.getUserMedia(c));
  const loadLandmarker = deps.loadLandmarker ?? defaultLandmarker;
  const clock = deps.now ?? (() => performance.now());
  const { explain, preflight, calibrate, seeGaze, failed, status, setRecalibrate } = {
    explain: explainScreen, preflight: preflightScreen, calibrate: calibrateScreen, seeGaze: seeGazeScreen,
    failed: failedScreen, status: statusLine, setRecalibrate: recalibrateButton, ...deps.ui,
  };
  const picker = delegatePicker();
  let switching = false;
  // Start the face tracker on the GPU, or the CPU if the GPU won't start.
  async function startTracker() {
    try {
      return await loadLandmarker(picker.current());
    } catch (err) {
      if (!picker.failed()) throw err;
      return loadLandmarker('CPU');
    }
  }
  // Move to the other delegate (the old tracker keeps working until the new one is ready).
  async function switchTo(delegate) {
    if (switching) return;
    switching = true;
    try {
      const next = await loadLandmarker(delegate);
      const old = s.landmarker;
      s.landmarker = next;
      old?.close?.();
    } catch { /* keep the one that works */ }
    switching = false;
    status.engine?.(picker.current());
  }
  const s = {
    off: false,          // declined, unavailable or skipped: drills run normally for the rest of the session
    asked: false,
    model: null,         // calibration (memory only)
    error: null,
    recal: false,        // drifted: recalibrate before the next eye drill
    landmarker: null,
    stream: null,
    video: null,
    recordings: [],
    current: null,
    seen: false,       // the "See your gaze" check was shown this session
  };
  const aspect = () => (globalThis.innerHeight || 2) / (globalThis.innerWidth || 1);

  async function cameraOn() {
    if (s.stream) return true;
    try {
      s.stream = await media({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
    } catch {
      s.stream = null;
      return false;
    }
    if (globalThis.document) {
      s.video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, autoplay: true });
      s.video.setAttribute('playsinline', '');
      s.video.srcObject = s.stream;
      try { await s.video.play(); } catch { /* starts on the next frame */ }
    }
    status.camera(true);
    return true;
  }
  function cameraOff() {
    for (const tr of s.stream?.getTracks() ?? []) tr.stop();
    if (s.video) { s.video.pause(); s.video.srcObject = null; }
    s.stream = null;
    s.video = null;
    status.camera(false);
  }

  // One reading from the camera right now: { f, brightness } (features may be null).
  let lum = 128;
  let lumAt = -Infinity;
  const canvas = globalThis.document?.createElement('canvas');
  function read(t) {
    if (deps.read) return s.stream ? deps.read(t) : null;
    const v = s.video;
    if (!v || v.readyState < 2 || !s.landmarker) return null;
    if (t - lumAt > 1000 && canvas) {
      // Brightness from a 16 × 12 copy of the frame: read here, never kept.
      canvas.width = 16; canvas.height = 12;
      const c = canvas.getContext('2d', { willReadFrequently: true });
      c.drawImage(v, 0, 0, 16, 12);
      const d = c.getImageData(0, 0, 16, 12).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      lum = sum / (d.length / 4);
      lumAt = t;
      c.clearRect(0, 0, 16, 12);
    }
    const t0 = clock();
    let r;
    try {
      r = s.landmarker.detectForVideo(v, t);
    } catch {
      const to = picker.failed();
      if (to) switchTo(to);
      return null;
    }
    const to = picker.timing(clock() - t0);
    if (to) switchTo(to);
    return { f: eyeFeatures(r.faceLandmarks?.[0], r.faceBlendshapes?.[0]?.categories, r.facialTransformationMatrixes?.[0]?.data), brightness: lum };
  }

  // Every frame (at the tracking rate): features in, an estimated gaze point out.
  function loop(onFrame) {
    const nav = globalThis.navigator ?? {};
    let interval = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 2 ? RATE.slowMs : RATE.fastMs;
    let lastAt = -Infinity;
    let avg = 0;
    let stopped = false;
    let handle = 0;
    // Read each new camera frame as it arrives (no waiting for the next screen
    // refresh); where the browser can't say, every screen refresh instead.
    let byFrame = !deps.read && typeof s.video?.requestVideoFrameCallback === 'function';
    let gotFrame = false;
    const video = s.video;
    const schedule = () => {
      if (byFrame) handle = video.requestVideoFrameCallback(() => { gotFrame = true; tick(); });
      else handle = requestAnimationFrame(tick);
    };
    const watchdog = byFrame ? setTimeout(() => {
      if (gotFrame || stopped) return;
      video.cancelVideoFrameCallback?.(handle);
      byFrame = false;
      schedule();
    }, 600) : null;
    const tick = () => {
      if (stopped) return;
      schedule();
      const t = clock();
      if (t - lastAt < interval - RATE.slackMs) return;   // frames come about every 33 ms, give or take
      lastAt = t;
      const t0 = clock();
      let frame = null;
      try { frame = read(t); } catch { frame = null; }
      avg = avg ? avg * 0.85 + (clock() - t0) * 0.15 : clock() - t0;
      const next = nextInterval(interval, avg);
      if (next == null) { onFrame(t, null, 'slow'); return; }
      interval = next;
      onFrame(t, frame);
    };
    schedule();
    return () => {
      stopped = true;
      clearTimeout(watchdog);
      if (byFrame) video.cancelVideoFrameCallback?.(handle); else cancelAnimationFrame(handle);
    };
  }

  // Calibration: live tips until the picture is good, five dots, then (the first
  // time) the "See your gaze" check. Resolves true when calibrated.
  async function runCalibration({ drifted = false } = {}) {
    for (;;) {
      let latest = null;
      const stop = loop((t, frame, why) => { latest = why === 'slow' ? { slow: true } : frame; });
      const ready = await preflight(() => (latest?.slow ? { ok: false, tip: 'slow' } : frameCheck(latest?.f, latest?.brightness)), { drifted });
      if (!ready) { stop(); return false; }
      const samples = await calibrate(() => (latest && frameCheck(latest.f, latest.brightness).ok ? latest.f : null));
      stop();
      if (!samples) return false;
      const err = calibrationError(samples, aspect());
      if (!Number.isFinite(err.error) || err.error > 0.45 || !err.leftRight) {
        if (await failed()) continue;   // try again
        return false;
      }
      s.model = fitCalibration(samples);
      s.error = err.error;
      if (s.seen) return true;
      s.seen = true;
      // The only place the estimated gaze is ever shown live.
      const filter = gazeFilter();
      let gz = null;
      const stopView = loop((t, frame) => {
        const ok = frame && frameCheck(frame.f, frame.brightness).ok;
        gz = ok ? filter(t, predict(s.model, frame.f)) : null;
      });
      const choice = await seeGaze(() => gz, s.error);
      stopView();
      if (choice === 'recal') continue;
      return true;
    }
  }

  async function open(ctx, { drill, title }) {
    if (s.off || !EYE_DRILLS.includes(drill)) return null;
    const ok = await ctx.hold(async () => {
      if (!s.asked) {
        s.asked = true;
        if (!WebAssembly?.validate?.(SIMD_TEST)) { await explain({ unsupported: true }); s.off = true; return false; }
        if (!(await explain())) { s.off = true; return false; }
      }
      if (!(await cameraOn())) { status.flash('Camera is off. The drill runs normally.'); s.off = true; return false; }
      try { s.landmarker ??= await startTracker(); status.engine?.(picker.current()); } catch { cameraOff(); status.flash('Eye Check couldn’t start on this phone. The drill runs normally.'); s.off = true; return false; }
      if (!s.model || s.recal) {
        const done = await runCalibration({ drifted: s.recal });
        s.recal = false;
        if (!done) { cameraOff(); s.off = true; return false; }
      }
      return true;
    });
    if (!ok) return null;
    return track(ctx, drill, title);
  }

  // Tracking during one drill.
  function track(ctx, drill, title) {
    const start = clock();
    const rec = { drill, title, start, gaze: [], targets: [], center: null, locks: [], checks: [], error: s.error, aspect: aspect() };
    const filter = gazeFilter();
    const calmFilter = gazeFilter(CALM);
    const conf = confidence();
    const steady = steadyTracker({ aspect: rec.aspect });
    const drift = driftWatch({ aspect: rec.aspect });
    let gaze = null;
    let calm = null;
    let expected = null;
    let live = true;
    let lastLog = -Infinity;
    const end = (why) => {
      if (!live) return;
      live = false;
      stop();
      cameraOff();
      gaze = null;
      if (why) status.note(why);
    };
    const onEnded = () => end('Camera stopped. The drill keeps going.');
    for (const tr of s.stream?.getTracks() ?? []) tr.addEventListener('ended', onEnded);
    const stop = loop((t, frame, why) => {
      if (why === 'slow') return end('Eye tracking stopped: the phone is busy. The drill keeps going.');
      if (ctx.isPaused?.()) return;
      const good = !!frame && frameCheck(frame.f, frame.brightness).ok;
      const raw = good ? predict(s.model, frame.f) : null;
      const est = raw ? filter(t, raw) : null;
      const still = raw ? calmFilter(t, raw) : null;
      const ok = conf(t, good);
      gaze = ok && est ? est : null;
      calm = ok && still ? still : null;
      status.paused(!ok);
      if (t - lastLog >= 45) { rec.gaze.push(gaze ? [t - start, gaze[0], gaze[1]] : [t - start, null]); lastLog = t; }
      if (calm && drift(t, calm, expected, steady(t, calm)) && !s.recal) {
        s.recal = true;
        status.note('Eye tracking may be off. It will recalibrate before the next eye drill.');
      }
    });
    s.current = { rec, end };
    setRecalibrate(async () => {
      // From the pause screen: the session is paused, so this costs no drill time.
      const was = s.model;
      if (!(await runCalibration())) s.model = was;
    });
    const t = {
      active: () => live && !!gaze,
      gaze: () => (live ? gaze : null),
      calm: () => (live ? calm : null),
      at(el) {
        const r = el.getBoundingClientRect();
        return [(r.left + r.width / 2) / (globalThis.innerWidth || 1), (r.top + r.height / 2) / (globalThis.innerHeight || 1)];
      },
      mark(p) { if (p) rec.targets.push([clock() - start, p[0], p[1]]); },
      expect(p) { expected = p; if (p && drill === 'peripheral') rec.center = p; },
      note(key, value) { rec[key].push(value); },
      close() {
        end();
        setRecalibrate(null);
        status.paused(false);
        rec.end = clock() - start;
        s.recordings.push(rec);
        s.current = null;
      },
    };
    return t;
  }

  return {
    open,
    recordings: () => s.recordings.slice(),
    // Camera off and everything forgotten (summary closed, or the session ended early).
    dispose() {
      s.current?.end();
      cameraOff();
      s.recordings = [];
      s.model = null;
      s.landmarker?.close?.();
      s.landmarker = null;
      status.camera(false);
    },
    // For tests: is the camera on right now?
    cameraIsOn: () => !!s.stream,
  };
}

// delegate: 'GPU' (the graphics chip) or 'CPU'.
async function defaultLandmarker(delegate = 'GPU') {
  const { FaceLandmarker } = await import(`${VENDOR}vision_bundle.mjs`);
  return FaceLandmarker.createFromOptions(
    { wasmLoaderPath: `${VENDOR}vision_wasm_internal.js`, wasmBinaryPath: `${VENDOR}vision_wasm_internal.wasm` },
    {
      baseOptions: { modelAssetPath: `${VENDOR}face_landmarker.task`, delegate },
      runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
    },
  );
}
