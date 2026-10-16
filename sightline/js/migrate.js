// Saved-data upgrades: the rename to Sightrep (v5.0), the FOCUS / MOVE split
// (v2.0) and the presets (v4.0). Nothing an athlete saved before the update is lost:
//   sightline.*            → sightrep.* (every key, once: renameSavedData, below)
//   sightrep.settings.v1  FOCUS options + theme + cue word (same key; the old
//                          Tap/Cones "mode" is simply dropped, see settings.js)
//   sightrep.cone.v1      MOVE custom setup, distance included (unchanged)
//   sightrep.last.v1      → sightrep.last.v2, below
// Pure helpers plus a small store, so the tests can check the upgrade.

import { FOCUS_SESSIONS } from './plan.js';
import { parseRunKey } from './presets.js';

// v5.0: Sightline became Sightrep. Every key the app saved as "sightline.…"
// moves to "sightrep.…" before anything reads it (main.js runs this first), so
// settings, My Routine, drill levels, setups and the leaderboard name all carry
// over. A key already saved under the new name wins. The old key is removed
// only once the new one is safely written. Returns how many moved.
export const OLD_PREFIX = 'sightline.';
export const PREFIX = 'sightrep.';
export function renameSavedData(storage = safeStorage()) {
  let moved = 0;
  let keys = [];
  try {
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
  } catch {
    return 0;   // storage blocked: nothing saved, nothing to move
  }
  for (const key of keys.filter((k) => k?.startsWith(OLD_PREFIX))) {
    try {
      const to = PREFIX + key.slice(OLD_PREFIX.length);
      if (storage.getItem(to) === null) {
        storage.setItem(to, storage.getItem(key));
        moved++;
      }
      if (storage.getItem(to) !== null) storage.removeItem(key);
    } catch { /* full or blocked: the old key stays, so nothing is lost */ }
  }
  return moved;
}

export const LAST_KEY = 'sightrep.last.v2';
export const OLD_LAST_KEY = 'sightrep.last.v1';
export const MOVE_RUN_IDS = ['custom', 'signals'];
// Single FOCUS parts (the main sessions run as presets now).
const FOCUS_IDS = FOCUS_SESSIONS.map((s) => s.id).filter((id) => id !== 'game' && id !== 'training');
// Before v4.0 the main sessions had no preset: they become Standard (MOVE's
// Quick Start becomes Quick, its Game Day becomes Game Speed).
const OLD_FOCUS = { game: 'game:standard', training: 'training:standard' };
const OLD_MOVE = { quick: 'game:quick', gameday: 'game:speed', training: 'training:standard' };

// v1 remembered one "last run" for the whole app: { type: 'game' | 'cone' }.
// v2 remembers one per side: { focus, move }, each a preset ("game:speed",
// js/presets.js), a FOCUS part id, or 'custom' | 'signals' for MOVE.
export function migrateLast(v2, v1) {
  if (v2 && typeof v2 === 'object') {
    const out = {};
    const focus = OLD_FOCUS[v2.focus] ?? v2.focus;
    const move = OLD_MOVE[v2.move] ?? v2.move;
    if (FOCUS_IDS.includes(focus) || parseRunKey(focus)) out.focus = focus;
    if (MOVE_RUN_IDS.includes(move) || parseRunKey(move)) out.move = move;
    return out;
  }
  if (v1?.type === 'game') return { focus: 'game:standard' };
  if (v1?.type === 'cone') return { move: 'custom' };   // the Cone Drill is MOVE's custom setup
  return {};
}

function safeStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
const parse = (raw) => { try { return JSON.parse(raw || 'null'); } catch { return null; } };

// "Run last" memory for both sides. Upgrades a v1 record the first time it's read.
export function createLastRuns(storage = safeStorage()) {
  let cache = null;
  const read = () => {
    if (cache) return cache;
    try {
      const v2 = parse(storage?.getItem(LAST_KEY));
      const v1 = v2 ? null : parse(storage?.getItem(OLD_LAST_KEY));
      cache = migrateLast(v2, v1);
      if (v1) {
        storage.setItem(LAST_KEY, JSON.stringify(cache));
        storage.removeItem(OLD_LAST_KEY);
      }
    } catch {
      cache = {};
    }
    return cache;
  };
  return {
    get: () => ({ ...read() }),
    set(side, run) {
      cache = { ...read(), [side]: run };
      try { storage?.setItem(LAST_KEY, JSON.stringify(cache)); } catch { /* storage blocked: remembered this visit */ }
    },
  };
}
