// Adaptive difficulty for the scored FOCUS drills. A weighted up/down
// staircase (Kaernbach, 1991): a right answer nudges the level up a little, a
// miss eases it off four times as much, so it settles where the athlete gets
// about 80% right (the research aim: 75–85%, challenged but not crushed).
//
// A level runs 0 (easiest) to 1 (hardest) inside the band for the Difficulty
// setting (higher in Training mode); each drill turns it into its own numbers
// (answer time, flash time, grid size…). Levels are remembered per drill on
// this phone, so the next session starts where the last one ended. With storage blocked every drill
// starts fresh.

export const TARGET = 0.8;
export const LEVEL_RANGE = { normal: [0, 0.6], hard: [0.4, 1] };
export const TRAINING_RANGE = { normal: [0.2, 0.8], hard: [0.5, 1] };   // Training: harder
const EASE = 0.1;                                   // step down after a miss
const PUSH = (EASE * (1 - TARGET)) / TARGET;        // step up after a right answer (0.025)
const START = 0.25;                                 // a new drill starts a quarter of the way up its band

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// saved: this drill's last level (or undefined). Returns the live staircase.
export function createLevel(saved, difficulty = 'normal', { training = false } = {}) {
  const bands = training ? TRAINING_RANGE : LEVEL_RANGE;
  const [lo, hi] = bands[difficulty] ?? bands.normal;
  let level = Number.isFinite(saved) ? clamp(saved, lo, hi) : lo + START * (hi - lo);
  return {
    get value() { return level; },
    // ok: was the answer right? Only ordinary cues count (not the gentle
    // first cues or the easy finish).
    update(ok) { level = clamp(level + (ok ? PUSH : -EASE), lo, hi); },
  };
}

// a + (b − a) × level, for turning a level into a drill's numbers.
export const lerp = (a, b, level) => a + (b - a) * level;

const KEY = 'sightline.levels.v1';
function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

// Drill id → last level, kept on this phone only.
export function createLevelStore(storage = defaultStorage()) {
  const read = () => {
    try {
      const v = JSON.parse(storage?.getItem(KEY) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  };
  return {
    get: read,
    save(levels) {
      const all = { ...read() };
      for (const [id, v] of Object.entries(levels)) if (Number.isFinite(v)) all[id] = Math.round(v * 1000) / 1000;
      try { storage?.setItem(KEY, JSON.stringify(all)); } catch { /* storage blocked */ }
    },
  };
}
