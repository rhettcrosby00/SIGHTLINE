// Eye Check (beta) screens: the camera question, live tips until the picture
// is good, five-dot calibration, "See your gaze" (the only place the estimated
// gaze is ever shown live, as a soft glow), the small status line during a
// drill, and the summary (replay, stats, heat map, one tip). Everything says
// "estimated". No live cursor during drills.

import { icon } from '../lib/icons.js';
import { esc } from '../lib/text.js';
import { TIPS, accuracyLabel, drillStats, heatGrid } from './math.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The calibration dots: center, then the four corners (inset from the edges).
export const DOTS = [[0.5, 0.5], [0.14, 0.12], [0.86, 0.12], [0.86, 0.88], [0.14, 0.88]];
export const DOT_MS = { settle: 600, collect: 1300, extra: 1500, min: 8 };

function layer(html) {
  const el = $('eye-layer');
  el.innerHTML = html;
  el.hidden = false;
  return el;
}
const close = () => { const el = $('eye-layer'); el.hidden = true; el.innerHTML = ''; };
const card = (body) => `<div class="eyecal__card"><p class="eyecal__kicker">${icon('eye', { size: 18 })}Eye Check (beta)</p>${body}</div>`;
const choice = (el) => new Promise((resolve) => { el.onclick = (e) => { const b = e.target.closest('[data-eye]'); if (b) { el.onclick = null; resolve(b.dataset.eye); } }; });

// The camera question, once a session. Resolves true to turn the camera on.
export async function explain({ unsupported = false } = {}) {
  if (unsupported) {
    const el = layer(card(`
      <h2 class="eyecal__title">Not on this phone</h2>
      <p>Eye Check needs a newer phone or browser. The drill runs normally.</p>
      <button type="button" class="btn btn--primary btn--block" data-eye="ok">OK</button>`));
    await choice(el);
    close();
    return false;
  }
  const el = layer(card(`
    <h2 class="eyecal__title">Use the front camera?</h2>
    <p class="eyecal__lead">Used only to estimate where your eyes are looking. Video never leaves your phone.</p>
    <ul class="eyecal__list">
      <li>Prop your phone up at eye level (best), or hold it at arm’s length.</li>
      <li>Good light on your face. No sunglasses.</li>
      <li>Feedback only: it never changes your score.</li>
    </ul>
    <button type="button" class="btn btn--primary btn--block" data-eye="on">${icon('eye')}Turn on camera</button>
    <button type="button" class="btn btn--secondary btn--block" data-eye="skip">Not now</button>
    <p class="caption">Everything it shows is an estimate. Not a vision or medical test.</p>`));
  const pick = await choice(el);
  close();
  return pick === 'on';
}

// Live tips until the picture has been good for a moment. check() → { ok, tip }.
// Resolves true when ready, false if skipped.
export function preflight(check, { drifted = false } = {}) {
  const el = layer(card(`
    <h2 class="eyecal__title">${drifted ? 'Let’s recalibrate' : 'Calibrate (10 s)'}</h2>
    <p class="eyecal__lead">${drifted ? 'Eye tracking drifted during the last drill. ' : ''}Prop your phone up at eye level, or hold it at arm’s length. Keep your head still.</p>
    <ul class="eyecal__checks">
      <li data-check="face">Face in view</li><li data-check="light">Good light</li><li data-check="far">Phone at arm’s length</li>
    </ul>
    <p class="eyecal__tip" aria-live="polite"></p>
    <button type="button" class="btn btn--secondary btn--block" data-eye="skip">Skip Eye Check</button>`));
  const tipEl = el.querySelector('.eyecal__tip');
  const GROUP = { face: 'face', blink: 'face', dark: 'light', near: 'far', far: 'far', slow: 'face' };
  return new Promise((resolve) => {
    let goodSince = null;
    let done = false;
    const finish = (v) => { if (done) return; done = true; clearInterval(id); el.onclick = null; close(); resolve(v); };
    el.onclick = (e) => { if (e.target.closest('[data-eye="skip"]')) finish(false); };
    const id = setInterval(() => {
      const r = check();
      const bad = r.ok ? null : GROUP[r.tip];
      el.querySelectorAll('[data-check]').forEach((li) => li.classList.toggle('is-ok', r.ok || (bad && li.dataset.check !== bad && !(bad === 'face'))));
      tipEl.textContent = r.ok ? 'Looks good. Starting…' : r.tip === 'slow' ? 'The phone is busy. Try again later.' : (TIPS[r.tip] ?? '');
      if (!r.ok) { goodSince = null; return; }
      goodSince ??= Date.now();
      if (Date.now() - goodSince >= 800) finish(true);
    }, 150);
  });
}

// Five dots: look at each until it fills. sample() → features or null.
// Resolves the samples ([{ f, t: [x, y] }]), or null if skipped.
export async function calibrate(sample) {
  const el = layer(`
    <p class="eyecal__dotlead">Look at the dot until it fills. Keep your head still.</p>
    <span class="eyecal__dot" aria-hidden="true"><i></i></span>
    <button type="button" class="link-btn eyecal__skip" data-eye="skip">Skip</button>`);
  el.classList.add('is-dots');
  const dot = el.querySelector('.eyecal__dot');
  let skipped = false;
  el.onclick = (e) => { if (e.target.closest('[data-eye="skip"]')) skipped = true; };
  const samples = [];
  for (const [x, y] of DOTS) {
    dot.style.left = `${x * 100}%`;
    dot.style.top = `${y * 100}%`;
    dot.classList.remove('is-filling');
    void dot.offsetWidth;
    dot.classList.add('is-filling');
    await wait(DOT_MS.settle);
    let got = 0;
    const until = performance.now() + DOT_MS.collect;
    while (!skipped && (performance.now() < until || (got < DOT_MS.min && performance.now() < until + DOT_MS.extra))) {
      const f = sample();
      if (f) { samples.push({ f, t: [x, y] }); got++; }
      await wait(33);
    }
    if (skipped) break;
  }
  el.onclick = null;
  el.classList.remove('is-dots');
  close();
  return skipped ? null : samples;
}

// Calibration didn't take. Resolves true to try again.
export async function failed() {
  const el = layer(card(`
    <h2 class="eyecal__title">That didn’t calibrate</h2>
    <ul class="eyecal__list"><li>${TIPS.dark}</li><li>${TIPS.glasses}</li><li>Prop the phone up at eye level and keep your head still.</li></ul>
    <button type="button" class="btn btn--primary btn--block" data-eye="retry">Try again</button>
    <button type="button" class="btn btn--secondary btn--block" data-eye="skip">Skip (the drill runs normally)</button>`));
  const pick = await choice(el);
  close();
  return pick === 'retry';
}

// "See your gaze": a large, soft glow that follows the estimated gaze.
// Calibration only, never inside drills. Resolves 'go' or 'recal'.
export function seeGaze(gaze, error) {
  const acc = accuracyLabel(error);
  const el = layer(`
    <span class="eyecal__glow" aria-hidden="true" hidden></span>
    <div class="eyecal__card eyecal__card--see">
      <p class="eyecal__kicker">${icon('eye', { size: 18 })}See your gaze</p>
      <p class="eyecal__lead">Look at each corner, not the glow.</p>
      <p class="eyecal__acc">Accuracy (estimated): <b>${acc.word}</b>, about ±${Math.round(error * 100)}% of the screen width: ${acc.note}.</p>
      <button type="button" class="btn btn--primary btn--block" data-eye="go">${icon('play')}Start the drill</button>
      <button type="button" class="btn btn--secondary btn--block" data-eye="recal">Looks off? Recalibrate</button>
    </div>`);
  const glow = el.querySelector('.eyecal__glow');
  let raf = requestAnimationFrame(function draw() {
    const g = gaze();
    glow.hidden = !g;
    if (g) glow.style.transform = `translate(${g[0] * innerWidth}px, ${g[1] * innerHeight}px) translate(-50%, -50%)`;
    raf = requestAnimationFrame(draw);
  });
  return choice(el).then((pick) => { cancelAnimationFrame(raf); close(); return pick; });
}

// ---- During a drill: the camera indicator and a small note ---------------------
let pausedTimer = null;
let noteTimer = null;
let showingPaused = false;
let cameraOn = false;
// The bar shows while the camera is on (with its indicator), or while there's a note.
function bar() {
  const el = $('eye-status');
  if (!el) return;
  el.dataset.camera = cameraOn ? '1' : '';
  el.hidden = !cameraOn && !$('eye-note')?.textContent;
}
export const status = {
  camera(on) {
    cameraOn = on;
    if (!on) { clearTimeout(pausedTimer); pausedTimer = null; showingPaused = false; }
    bar();
  },
  // "Eye tracking paused" only after it has lasted a moment (no flicker).
  paused(on) {
    if (on === showingPaused || (on && pausedTimer)) return;
    if (!on) { clearTimeout(pausedTimer); pausedTimer = null; if (showingPaused) { showingPaused = false; setNote(''); } return; }
    pausedTimer = setTimeout(() => { pausedTimer = null; showingPaused = true; setNote('Eye tracking paused (estimates need a clear view of your eyes)'); }, 800);
  },
  note(text) {
    setNote(text);
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => setNote(showingPaused ? 'Eye tracking paused' : ''), 5000);
  },
  flash(text) { status.note(text); },
  // Which part of the phone runs the face tracker ('GPU' or 'CPU'), for testing.
  engine(name) { const el = $('eye-status'); if (el) el.dataset.engine = name; },
};
function setNote(text) {
  const el = $('eye-note');
  if (el) el.textContent = text;
  bar();
}

// The pause screen's "Recalibrate Eye Check" (only while an eye drill runs).
export function setRecalibrate(fn) {
  const b = $('btn-eye-recal');
  if (!b) return;
  b.hidden = !fn;
  b.onclick = fn ? async () => { b.disabled = true; await fn(); b.disabled = false; } : null;
}

// ---- The summary ---------------------------------------------------------------
const REPLAY_MS = 15000;   // the last 15 s of each drill
const TRAIL_MS = 700;

// Adds the Eye Check section to the summary (.sum), above its footnote.
// Returns a function that stops the replays.
export function renderEyeSummary(container, recordings) {
  if (!recordings.length) return () => {};
  const css = getComputedStyle(document.documentElement);
  const color = (v, d) => css.getPropertyValue(v).trim() || d;
  const ink = color('--text', '#111');
  const accent = color('--accent-text', '#4d6b00');   // readable on the surface in every theme
  const surface = color('--surface', '#fff');
  const muted = color('--muted', '#888');
  const sec = document.createElement('section');
  sec.className = 'eyesum';
  sec.dataset.side = 'focus';
  sec.innerHTML = `
    <p class="side-tag">${icon('eye', { size: 18 })}Eye Check (beta) · estimated</p>
    <p class="eyesum__note">Estimated from the front camera. Feedback only: it’s not part of your score. Not a vision or medical test. None of it is kept after you leave this screen.</p>
    ${recordings.map((r, i) => {
      const st = drillStats(r, r.aspect);
      return `
      <article class="eyesum__drill" data-i="${i}">
        <h3 class="eyesum__title">${esc(r.title)}</h3>
        <ul class="eyesum__stats">${st.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        <p class="eyesum__tip">${esc(st.tip)}</p>
        <div class="eyesum__viz">
          <figure><canvas class="eyesum__replay" role="img" aria-label="Replay of your estimated gaze"></canvas><figcaption>Replay</figcaption></figure>
          <figure><canvas class="eyesum__heat" role="img" aria-label="Where your eyes spent the most time (estimated)"></canvas><figcaption>Heat map</figcaption></figure>
        </div>
        <div class="eyesum__ctl">
          <button type="button" class="btn btn--secondary" data-play>${icon('play')}Play</button>
          <button type="button" class="btn btn--secondary" data-slow aria-pressed="false">0.5×</button>
        </div>
      </article>`;
    }).join('')}`;
  container.insertBefore(sec, container.querySelector('.sum__foot'));

  const players = recordings.map((rec, i) => {
    const art = sec.querySelector(`[data-i="${i}"]`);
    const [replay, heat] = art.querySelectorAll('canvas');
    const H = 240;
    const W = Math.round(H / (rec.aspect || 2));
    const setup = (cv) => { const dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W}px`; cv.style.height = `${H}px`; const c = cv.getContext('2d'); c.scale(dpr, dpr); return c; };
    const rc = setup(replay);
    const hc = setup(heat);
    // Heat map: soft blobs where the eyes spent the most time.
    hc.fillStyle = surface; hc.fillRect(0, 0, W, H);
    const grid = heatGrid(rec.gaze);
    grid.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return;
      const x = ((c + 0.5) / row.length) * W;
      const y = ((r + 0.5) / grid.length) * H;
      const g = hc.createRadialGradient(x, y, 0, x, y, W / 3);
      g.addColorStop(0, withAlpha(accent, 0.55 * v));
      g.addColorStop(1, withAlpha(accent, 0));
      hc.fillStyle = g;
      hc.fillRect(0, 0, W, H);
    }));
    if (rec.center) dotAt(hc, rec.center[0] * W, rec.center[1] * H, 5, ink);

    const endAt = rec.end ?? rec.gaze.at(-1)?.[0] ?? 0;
    const from = Math.max(0, endAt - REPLAY_MS);
    let t = from;
    let playing = false;
    let rate = 1;
    let last = 0;
    const draw = () => {
      rc.fillStyle = surface; rc.fillRect(0, 0, W, H);
      if (rec.center) dotAt(rc, rec.center[0] * W, rec.center[1] * H, 5, ink);
      // Targets: the moving dot (pursuit), or each target for a second after it showed.
      const shown = rec.drill === 'pursuit'
        ? rec.targets.filter((g) => g[0] <= t).slice(-1)
        : rec.targets.filter((g) => g[0] <= t && t - g[0] < 1000);
      for (const g of shown) dotAt(rc, g[1] * W, g[2] * H, 7, ink);
      // The estimated gaze: a soft trail and a soft spot (no sharp cursor).
      const trail = rec.gaze.filter((g) => g[1] != null && g[0] <= t && t - g[0] <= TRAIL_MS);
      rc.lineWidth = 3; rc.lineCap = 'round'; rc.lineJoin = 'round';
      for (let k = 1; k < trail.length; k++) {
        rc.strokeStyle = withAlpha(accent, (k / trail.length) * 0.9);
        rc.beginPath(); rc.moveTo(trail[k - 1][1] * W, trail[k - 1][2] * H); rc.lineTo(trail[k][1] * W, trail[k][2] * H); rc.stroke();
      }
      const now = trail.at(-1);
      if (now) {
        const g = rc.createRadialGradient(now[1] * W, now[2] * H, 0, now[1] * W, now[2] * H, 18);
        g.addColorStop(0, withAlpha(accent, 0.75)); g.addColorStop(1, withAlpha(accent, 0));
        rc.fillStyle = g; rc.beginPath(); rc.arc(now[1] * W, now[2] * H, 18, 0, Math.PI * 2); rc.fill();
      }
      rc.fillStyle = muted; rc.font = '600 11px system-ui, sans-serif';
      rc.fillText(`${((t - from) / 1000).toFixed(1)} s`, 6, H - 8);
    };
    const loop = (ts) => {
      if (!playing || !replay.isConnected) { playing = false; return; }
      t += (ts - last) * rate;
      last = ts;
      if (t >= endAt) { t = endAt; playing = false; setBtn(); }
      draw();
      if (playing) requestAnimationFrame(loop);
    };
    const playBtn = art.querySelector('[data-play]');
    const setBtn = () => { playBtn.innerHTML = playing ? `${icon('pause')}Pause` : `${icon('play')}${t >= endAt ? 'Replay' : 'Play'}`; };
    playBtn.onclick = () => {
      if (!playing && t >= endAt) t = from;
      playing = !playing;
      setBtn();
      if (playing) { last = performance.now(); requestAnimationFrame(loop); }
    };
    art.querySelector('[data-slow]').onclick = (e) => {
      rate = rate === 1 ? 0.5 : 1;
      e.currentTarget.setAttribute('aria-pressed', String(rate === 0.5));
    };
    draw();
    return () => { playing = false; };
  });
  return () => players.forEach((stop) => stop());
}

function dotAt(c, x, y, r, fill) { c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
// "#rrggbb" (or any CSS color the canvas understands) at an opacity.
function withAlpha(color, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
