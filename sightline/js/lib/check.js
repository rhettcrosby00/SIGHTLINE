// Focus Check (optional, about 30 seconds): a quick reaction test (tap when
// the circle turns green) plus go / no-go (green: tap, red: don't). Pure
// module (no DOM) so the tests can check the plan and the math.
//
// Measuring fairly on a phone:
//   - taps are timed from pointer-down events against the moment the cue was
//     drawn, both on the same high-resolution clock;
//   - the first taps are warm-ups and don't count;
//   - taps under 0.1 s (a guess) or over 1 s (a lapse) are dropped, and so is
//     anything far from the rest (3 median absolute deviations), then the
//     median is used;
//   - touch delay differs between phones, so results are only ever compared
//     with earlier checks on this same phone (the last 10).
// It's a readiness check, not a medical test: the wording never says otherwise.

import { binary } from './rng.js';

export const CHECK = {
  warmups: 2,
  reactions: 6,
  gonogo: 8,
  goShare: 0.7,
  foreperiodMs: [800, 1800],   // wait before the circle turns green (random, so it can't be timed)
  gngGapMs: [700, 1200],       // go / no-go: time between cues
  gngWindowMs: 800,            // go / no-go: time to tap a green cue
  minRtMs: 100,
  maxRtMs: 1000,
  history: 10,
  slower: 0.1,                 // 10% slower than this phone's usual counts as "slower today"
  minHistory: 3,
};

// The trials for one check, from the session's random stream.
export function checkPlan(rng) {
  const wait = () => Math.round(rng.range(...CHECK.foreperiodMs));
  const go = binary(rng, { p: CHECK.goShare, maxTrue: 3, maxFalse: 2 });
  return {
    warmups: Array.from({ length: CHECK.warmups }, wait),
    reactions: Array.from({ length: CHECK.reactions }, wait),
    // The first go / no-go cue is always a go.
    gonogo: Array.from({ length: CHECK.gonogo }, (_, i) => ({ go: i === 0 || go(), gapMs: Math.round(rng.range(...CHECK.gngGapMs)) })),
  };
}

// How long a check takes with taps of `rtMs` (about 30 s at a typical 0.3 s;
// the slowest possible run uses the full 1 s every time). For the tests.
export function planMs(plan, rtMs = 300) {
  const rt = Math.min(rtMs, CHECK.maxRtMs) + 400;   // each reaction cue: wait, the tap, a short pause
  return [...plan.warmups, ...plan.reactions].reduce((a, w) => a + w + rt, 0)
    + plan.gonogo.reduce((a, t) => a + t.gapMs + (t.go ? Math.min(rtMs, CHECK.gngWindowMs) : CHECK.gngWindowMs), 0);
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// The typical reaction time from a set of taps, outliers dropped. null if too few are left.
export function robustMs(rts, { minKept = 3 } = {}) {
  const ok = rts.filter((x) => Number.isFinite(x) && x >= CHECK.minRtMs && x <= CHECK.maxRtMs);
  const m = median(ok);
  if (m == null) return null;
  const mad = median(ok.map((x) => Math.abs(x - m))) || 1;
  const kept = ok.filter((x) => Math.abs(x - m) <= 3 * mad * 1.4826);
  return kept.length >= minKept ? Math.round(median(kept)) : null;
}

// One check's result from its raw taps.
export function summarize({ reactionRts = [], gngRts = [], gngRight = 0, gngTotal = CHECK.gonogo, early = 0 }) {
  return { rtMs: robustMs(reactionRts), gngRtMs: robustMs(gngRts, { minKept: 2 }), gngRight, gngTotal, early };
}

// Today against this phone's recent checks: average reaction time of the last
// 10, and whether today is noticeably slower (then the app offers the lighter version).
export function compare(rtMs, history = []) {
  const past = history.map((h) => h.rtMs).filter(Number.isFinite).slice(-CHECK.history);
  if (rtMs == null || past.length < CHECK.minHistory) return { avgMs: null, n: past.length, slower: false, diffPct: null };
  const avgMs = Math.round(past.reduce((a, b) => a + b, 0) / past.length);
  const diffPct = Math.round(((rtMs - avgMs) / avgMs) * 100);
  return { avgMs, n: past.length, diffPct, slower: rtMs >= avgMs * (1 + CHECK.slower) };
}

// The last 10 checks, on this phone only. With storage blocked: this visit only.
const KEY = 'sightrep.check.v1';
function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
export function createCheckLog(storage = defaultStorage()) {
  let memory = [];
  const read = () => {
    try {
      const v = JSON.parse(storage?.getItem(KEY) || 'null');
      if (Array.isArray(v)) return v;
    } catch { /* blocked or broken */ }
    return memory;
  };
  return {
    get: read,
    add(result) {
      const entry = { at: result.at ?? Date.now(), rtMs: result.rtMs, gngRtMs: result.gngRtMs, phase: result.phase ?? 'check' };
      const all = [...read(), entry].slice(-CHECK.history);
      memory = all;
      try { storage?.setItem(KEY, JSON.stringify(all)); } catch { /* storage blocked: this visit only */ }
      return all;
    },
  };
}
