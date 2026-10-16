// My Routine: the athlete's own 20–40 second pre-performance routine, to
// repeat right before competing (and before free throws, serves, kicks):
//   stand still → one breath → (optional) one imagery line → cue word →
//   quiet eye (eyes still on one dot for 2–3 s) → GO.
// Saved on this phone only. Pure helpers plus a small store; with storage
// blocked it still runs (the default routine) for this visit.

import { breathMs } from './stages/breathe.js';

export const ROUTINE_BREATHS = [['sigh', 'Cyclic sigh'], ['resonance', 'Slow breath'], ['box', 'Box breath'], ['energize', 'Power breaths']];
export const QUIET_EYE_S = [2, 3];
export const IMAGERY_MAX = 48;
export const DEFAULT_ROUTINE = { breath: 'sigh', imagery: 'See the first play.', quietEyeS: 3 };
export const ROUTINE_RANGE_S = [20, 40];

// Each part's seconds. "still" pads short routines up to 20 s.
const CUE_S = 4;
const GO_S = 2;
const IMAGERY_S = 5;
export function routineParts(r) {
  const breath = breathMs(r.breath) / 1000;
  const rest = breath + (r.imagery ? IMAGERY_S : 0) + CUE_S + r.quietEyeS + GO_S;
  return { still: Math.max(2, ROUTINE_RANGE_S[0] - rest), breath, imagery: r.imagery ? IMAGERY_S : 0, cue: CUE_S, quietEye: r.quietEyeS, go: GO_S };
}
export const routineSeconds = (r) => Object.values(routineParts(r)).reduce((a, b) => a + b, 0);

export function cleanRoutine(raw = {}) {
  const r = { ...DEFAULT_ROUTINE };
  if (ROUTINE_BREATHS.some(([id]) => id === raw?.breath)) r.breath = raw.breath;
  if (QUIET_EYE_S.includes(Number(raw?.quietEyeS))) r.quietEyeS = Number(raw.quietEyeS);
  if (typeof raw?.imagery === 'string') r.imagery = raw.imagery.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, IMAGERY_MAX);
  return r;
}

const KEY = 'sightrep.routine.v1';
function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
export function createRoutineStore(storage = defaultStorage()) {
  let memory = null;   // this visit's copy, used when storage is blocked
  return {
    get() {
      try {
        const raw = storage?.getItem(KEY);
        if (raw) return cleanRoutine(JSON.parse(raw));
      } catch { /* blocked or broken: fall through */ }
      return cleanRoutine(memory ?? {});
    },
    set(r) {
      memory = cleanRoutine(r);
      try { storage?.setItem(KEY, JSON.stringify(memory)); } catch { /* storage blocked: this visit only */ }
      return memory;
    },
  };
}
