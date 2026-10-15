// Leaderboard scoring for both sides. Pure module (no DOM): the app scores a
// session with it, and the server uses the same rules to cap what it accepts.
// Every number lives in SCORING so it can be tuned in one place.

import { totalMinutes } from '../plan.js';
import { formulaSeconds } from '../cone/timing.js';

export const SCORING = {
  focus: {
    correct: 100,          // right answer (or holding still on a No-Go / red)
    speedBonus: 100,       // up to +100 for a fast tap…
    noBonusAtS: 1.5,       // …nothing at 1.5 s or slower (straight line from 0 s)
    streak: [[10, 2], [5, 1.5]],   // ×2 after 10 correct in a row, ×1.5 after 5
    wrong: -50,            // wrong answer, or tapping on a Hold / No-Go cue
    missed: 0,             // too slow
  },
  move: {
    perRep: 50,
    pace: { learning: 1, training: 1.25, game: 1.5, overdrive: 2 },
    style: { firststep: 0.75, outback: 1, conetocone: 1.2 },
    perYardOver5: 0.05,    // +5% per yard beyond 5, up to +50%
    yardCap: 0.5,
    perConeOver2: 0.10,    // +10% per cone or direction above 2
    extras: { flash: 1.2, random: 1.2, peripheral: 1.3, fakes: 1.2, reverse: 1.3 },
  },
  difficulty: { normal: 1, hard: 1.5 },
  completionBonus: { game: 500, part: 100, move: 500 },   // Game Ready, one-part FOCUS session, MOVE drill
  // Server cap: no session can beat these.
  capFocusTrialS: 0.9,     // shortest possible cue-to-cue time in a FOCUS drill
  capMoveRepS: 1.0,        // shortest possible MOVE rep (the timing floor)
};

// ---- FOCUS: scored cue by cue -------------------------------------------------
// outcome: 'correct' (rtMs for taps; omit for a correct hold), 'wrong', 'missed'.
export function createFocusScorer() {
  let points = 0;
  let streak = 0;
  let best = 0;
  return {
    trial({ outcome, rtMs = null }) {
      const F = SCORING.focus;
      if (outcome === 'correct') {
        const bonus = rtMs == null ? 0 : F.speedBonus * Math.max(0, 1 - rtMs / 1000 / F.noBonusAtS);
        const mult = F.streak.find(([n]) => streak >= n)?.[1] ?? 1;
        points += (F.correct + bonus) * mult;
        streak++;
        best = Math.max(best, streak);
      } else {
        points += outcome === 'wrong' ? F.wrong : F.missed;
        streak = 0;
      }
    },
    get points() { return points; },
    get bestStreak() { return best; },
  };
}

// The FOCUS session score: drill points × difficulty, plus the completion
// bonus. Never below zero; always a whole number.
export function focusScore({ points, sessionId, difficulty, completed = true }) {
  const mult = SCORING.difficulty[difficulty] ?? 1;
  const bonus = completed ? SCORING.completionBonus[sessionId === 'game' ? 'game' : 'part'] : 0;
  return Math.max(0, Math.round(points * mult + bonus));
}

// Most a FOCUS session could possibly score: every cue right, instant, on a
// full streak, as fast as cues can come.
export function focusCap({ sessionId, length, difficulty }) {
  const F = SCORING.focus;
  const trials = Math.ceil((totalMinutes(sessionId, length) * 60) / SCORING.capFocusTrialS);
  const top = (F.correct + F.speedBonus) * Math.max(...F.streak.map(([, m]) => m));
  return Math.round(trials * top * (SCORING.difficulty[difficulty] ?? 1) + SCORING.completionBonus.game);
}

// ---- MOVE: honor system, points per completed rep -----------------------------
export function moveMultiplier(setup) {
  const M = SCORING.move;
  const yards = setup.style === 'firststep' ? 0 : averageYards(setup);
  // An exact (manual) time slower than the chosen pace's formula earns no pace bonus.
  const paceTime = formulaSeconds({ style: setup.style, pace: setup.pace, outYards: yards || setup.distance });
  const slower = setup.manual && setup.manualS > paceTime + 1e-9;
  const pace = slower ? 1 : M.pace[setup.pace] ?? 1;
  const dist = 1 + Math.min(M.yardCap, Math.max(0, yards - 5) * M.perYardOver5);
  const cones = 1 + Math.max(0, targetsOf(setup) - 2) * M.perConeOver2;
  let extras = 1;
  if (setup.display === 'flash') extras *= M.extras.flash;
  if (setup.position === 'random') extras *= M.extras.random;
  if (setup.position === 'peripheral') extras *= M.extras.peripheral;
  if (setup.fakes && setup.fakes !== 'off') extras *= M.extras.fakes;
  if (setup.reverse && (setup.cueType === 'arrows' || setup.cueType === 'mixed')) extras *= M.extras.reverse;
  return pace * (M.style[setup.style] ?? 1) * dist * cones * extras;
}

// Only completed sets count; the bonus only for finishing every set.
export function moveScore(setup, { reps, setsDone }) {
  const bonus = setsDone >= setup.sets ? SCORING.completionBonus.move : 0;
  return Math.max(0, Math.round(reps * SCORING.move.perRep * moveMultiplier(setup) + bonus));
}

// Most a MOVE session could score: every completed set at its most reps.
export function moveCap(setup, setsDone) {
  const perSet = setup.setMode === 'timed' ? Math.ceil(setup.timedSec / SCORING.capMoveRepS) : setup.reps;
  return moveScore(setup, { reps: perSet * Math.min(setsDone, setup.sets), setsDone });
}

function targetsOf(s) {
  return s.cueType === 'arrows' || s.cueType === 'mixed' ? s.directions.length : s.cones;
}
function averageYards(s) {
  if (s.distanceMode !== 'each') return s.distance;
  const slots = s.cueType === 'arrows' || s.cueType === 'mixed' ? s.directions : Array.from({ length: s.cones }, (_, i) => `c${i + 1}`);
  return slots.reduce((a, k) => a + (s.coneYards?.[k] ?? s.distance), 0) / slots.length;
}
