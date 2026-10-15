// The one shared randomizer. Every drill draws from its session's generator,
// so a whole session can be replayed from its seed (?seed=N) when debugging.
// Pure module: no DOM, safe to import in Node for the tests.

// FNV-1a: turn any string into a 32-bit seed.
function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function freshSeed() {
  try { return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]; }
  catch { return Math.floor(Math.random() * 2 ** 32) >>> 0; }
}

// Seeded generator (mulberry32). Same seed → same sequence.
export function createRng(seed) {
  const initial = seed == null || seed === ''
    ? freshSeed()
    : (/^\d+$/.test(String(seed)) ? Number(seed) >>> 0 : hashSeed(String(seed)));
  let s = initial;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    seed: initial,
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    // Fisher–Yates on a copy.
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    // An independent stream for one drill. It depends only on the session
    // seed and the label, so drills don't affect each other's draws.
    fork: (label) => createRng(hashSeed(`${initial}:${label}`)),
  };
  return rng;
}

// Spacing rule for repeating cues (colors, sides, letters, numbers):
// never the same one twice in a row, never more than `max` in any `window`.
export function spaced(rng, items, { key = (x) => x, window = 5, max = 2 } = {}) {
  const recent = [];
  return () => {
    const last = recent[recent.length - 1];
    const counts = new Map();
    for (const k of recent.slice(-(window - 1))) counts.set(k, (counts.get(k) ?? 0) + 1);
    let pool = items.filter((it) => key(it) !== last && (counts.get(key(it)) ?? 0) < max);
    if (!pool.length) pool = items.filter((it) => key(it) !== last);
    const it = rng.pick(pool);
    recent.push(key(it));
    if (recent.length > window) recent.shift();
    return it;
  };
}

// Two-way cues (go / no-go, odd / even): strict alternation would be
// predictable, so use a weighted coin with a cap on how long a run can get.
export function binary(rng, { p = 0.5, maxTrue = 3, maxFalse = 3 } = {}) {
  let last = null;
  let run = 0;
  return () => {
    let v = rng.chance(p);
    if (v === last && run >= (v ? maxTrue : maxFalse)) v = !v;
    run = v === last ? run + 1 : 1;
    last = v;
    return v;
  };
}

// Draw without replacement. Items used in recent sessions are skipped while
// enough fresh ones remain; when the pool runs low the oldest history is let
// back in first. Returns null once every item has been used this session,
// so nothing ever repeats within a session.
//   recent: array of Sets of keys, newest session first.
export function deck(rng, items, { key = (x) => x, recent = [], minFresh = 0.25 } = {}) {
  const used = new Set();
  let order = [];
  const refill = () => {
    const fresh = items.filter((it) => !used.has(key(it)));
    const need = Math.min(fresh.length, Math.max(1, Math.ceil(items.length * minFresh)));
    let pool = fresh;
    for (let n = recent.length; n >= 0; n--) {
      const blocked = new Set(recent.slice(0, n).flatMap((s) => [...s]));
      pool = fresh.filter((it) => !blocked.has(key(it)));
      if (pool.length >= need) break;
    }
    order = rng.shuffle(pool);
  };
  return {
    next() {
      if (!order.length) refill();
      if (!order.length) return null;
      const it = order.pop();
      used.add(key(it));
      return it;
    },
    used: () => [...used],
  };
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
