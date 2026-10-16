// Saved-data upgrades for the FOCUS / MOVE split (v2.0) and the presets
// (v4.0). Nothing an athlete saved before the update is lost:
//   sightline.settings.v1  FOCUS options + theme + cue word (same key; the old
//                          Tap/Cones "mode" is simply dropped, see settings.js)
//   sightline.cone.v1      MOVE custom setup, distance included (unchanged)
//   sightline.last.v1      → sightline.last.v2, below
// Pure helpers plus a small store, so the tests can check the upgrade.

import { FOCUS_SESSIONS } from './plan.js';
import { parseRunKey } from './presets.js';

export const LAST_KEY = 'sightline.last.v2';
export const OLD_LAST_KEY = 'sightline.last.v1';
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
