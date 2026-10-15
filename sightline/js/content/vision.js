// Content for the Visual skills drills (Near-Far Focus, Target Capture,
// Perception Span), Object Tracking, and the Occlusion schedule. Pure (no
// DOM), so the tests can check scoring, motion and flash limits in Node.
// Each drill turns its adaptive level (js/lib/adapt.js, 0 easiest … 1
// hardest) into numbers with the *At(level) helpers below.

import { spaced, dist } from '../lib/rng.js';
import { lerp } from '../lib/adapt.js';

// ---- Near-Far Focus ------------------------------------------------------------
// Look far, then back at the phone: a small letter shows for a moment. Sloan
// letters (the ones eye charts use); 3 other letters are the decoys.
export const NEAR_LETTERS = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z'];
export const nearFarAt = (level) => ({
  farMs: Math.round(lerp(2400, 1300, level)),   // how long to look far
  showMs: Math.round(lerp(900, 300, level)),    // how long the letter shows once back
  sizePx: Math.round(lerp(46, 18, level)),      // letter height
});
export function nearFarStream(rng) {
  const letter = spaced(rng, NEAR_LETTERS);
  return () => {
    const answer = letter();
    const decoys = rng.shuffle(NEAR_LETTERS.filter((l) => l !== answer)).slice(0, 3);
    return { answer, choices: rng.shuffle([answer, ...decoys]) };
  };
}

// ---- Target Capture ------------------------------------------------------------
// A tiny ring with a gap (a Landolt C, the eye-test symbol) flashes near an
// edge; the athlete taps which way the gap faced. Never the same edge twice
// in a row, and well away from the last spot.
export const GAP_DIRS = ['up', 'right', 'down', 'left'];
export const captureAt = (level) => ({
  flashMs: Math.round(lerp(600, 150, level)),
  sizePx: Math.round(lerp(40, 24, level)),
});
const EDGE = 0.9;
const edgePoint = (side, t) => ({ top: { x: t, y: -EDGE }, bottom: { x: t, y: EDGE }, left: { x: -EDGE, y: t }, right: { x: EDGE, y: t } }[side]);
export function captureStream(rng) {
  const gap = spaced(rng, GAP_DIRS);
  const side = spaced(rng, ['top', 'right', 'bottom', 'left']);
  let last = null;
  return () => {
    const s = side();
    let p;
    for (let i = 0; i < 25; i++) {
      p = edgePoint(s, rng.range(-0.85, 0.85));
      if (!last || dist(p, last) >= 0.6) break;
    }
    last = p;
    return { ...p, side: s, gap: gap() };
  };
}

// ---- Perception Span -----------------------------------------------------------
// A grid flashes a pattern of dots once; the athlete taps the same cells.
export const spanAt = (level) => ({
  grid: level < 0.35 ? 3 : level < 0.7 ? 4 : 5,
  dots: Math.round(lerp(3, 8, level)),
  flashMs: Math.round(lerp(1000, 300, level)),
});
export function spanStream(rng) {
  let last = '';
  return (grid, dots) => {
    let cells = [];
    for (let i = 0; i < 10; i++) {
      cells = rng.shuffle([...Array(grid * grid).keys()]).slice(0, dots).sort((a, b) => a - b);
      if (cells.join() !== last) break;
    }
    last = cells.join();
    return cells;
  };
}
// Right only if every dot was found and nothing else was tapped.
export function scoreSpan(pattern, picks) {
  const want = new Set(pattern);
  const got = new Set(picks);
  const hits = [...got].filter((c) => want.has(c)).length;
  return { hits, wrong: got.size - hits, missed: want.size - hits, ok: hits === want.size && got.size === want.size };
}

// ---- Object Tracking -----------------------------------------------------------
// Identical dots; a few light up, then all move and bounce; tap the ones you
// followed. Kept short: it's a warm-up, not the core.
export const motAt = (level) => ({
  dots: Math.round(lerp(6, 10, level)),
  targets: level < 0.34 ? 2 : level < 0.67 ? 3 : 4,
  speed: lerp(0.28, 0.6, level),            // field widths per second
  moveMs: Math.round(lerp(5000, 8000, level)),
});

// Dots of radius r in a w × h box, moving at speed·w px/s, bouncing off the
// walls and off each other (equal masses: they trade the push along the line
// between them). advance(ms) moves them on in small fixed steps, so the
// motion is the same on every phone.
export function motField(rng, { w, h, n, r, speed }) {
  const dots = [];
  for (let i = 0; i < n; i++) {
    let p = { x: w / 2, y: h / 2 };
    for (let k = 0; k < 300; k++) {
      p = { x: rng.range(r, w - r), y: rng.range(r, h - r) };
      if (dots.every((d) => Math.hypot(d.x - p.x, d.y - p.y) >= 2.6 * r)) break;
    }
    const a = rng.range(0, Math.PI * 2);
    dots.push({ x: p.x, y: p.y, vx: Math.cos(a) * speed * w, vy: Math.sin(a) * speed * w });
  }
  const walls = (d) => {
    if (d.x < r) { d.x = r; d.vx = Math.abs(d.vx); }
    if (d.x > w - r) { d.x = w - r; d.vx = -Math.abs(d.vx); }
    if (d.y < r) { d.y = r; d.vy = Math.abs(d.vy); }
    if (d.y > h - r) { d.y = h - r; d.vy = -Math.abs(d.vy); }
  };
  const step = (dt) => {
    for (const d of dots) { d.x += d.vx * dt; d.y += d.vy * dt; walls(d); }
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const a = dots[i];
        const b = dots[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dd = Math.hypot(dx, dy);
        if (dd >= 2 * r || dd === 0) continue;
        const nx = dx / dd;
        const ny = dy / dd;
        const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (closing > 0) {   // moving together: trade the push along the line
          a.vx -= closing * nx; a.vy -= closing * ny;
          b.vx += closing * nx; b.vy += closing * ny;
        }
        const push = (2 * r - dd) / 2;   // and step apart so they don't stick
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        walls(a); walls(b);
      }
    }
  };
  const STEP_S = 1 / 120;
  let carry = 0;
  return {
    dots,
    advance(ms) {
      carry += ms / 1000;
      while (carry >= STEP_S) { step(STEP_S); carry -= STEP_S; }
    },
  };
}
export function scoreMot(targets, picks) {
  const want = new Set(targets);
  const hits = picks.filter((p) => want.has(p)).length;
  return { hits, ok: hits === want.size && picks.length === want.size };
}

// ---- Occlusion (Training only, opt-in) -----------------------------------------
// The moving target disappears and comes back, so the brain has to predict
// where it went. Only the target, never the screen. Visible 700–1100 ms,
// hidden 400–600 ms: no two changes closer than 400 ms, so never more than 3
// changes in any second (the WCAG flash limit).
export const OCCLUSION_MS = { visible: [700, 1100], hidden: [400, 600] };
export function createOcclusion(rng) {
  const edges = [];   // times the target switches (hide, show, hide…)
  let end = 0;
  const extend = (t) => {
    while (end <= t) {
      const shown = end + rng.range(...OCCLUSION_MS.visible);
      end = shown + rng.range(...OCCLUSION_MS.hidden);
      edges.push(shown, end);
    }
  };
  return {
    // Is the target showing at t ms into the drill?
    visible(t) {
      extend(t);
      let i = 0;
      while (i < edges.length && edges[i] <= t) i++;
      return i % 2 === 0;
    },
    // Every switch up to t ms (for the tests).
    changes(t) { extend(t); return edges.filter((x) => x <= t); },
  };
}
// Saccade Jumps with occlusion: each number shows, then hides before the next
// jump. Gaps stretch so both windows stay at least 400 ms.
export function occludedSaccade(gapMs) {
  const gap = Math.max(gapMs, 1100);
  const hiddenMs = 450;
  return { showMs: gap - hiddenMs, hiddenMs };
}
