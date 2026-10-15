// Full Pre-Game: Focus first (Game Ready, Quick), then "Set your phone down"
// and Move's Game Day sets, then one check-out, one summary and one
// leaderboard entry. About 10 minutes in all: short beats long on game day.

import { totalMinutes } from './plan.js';

const PREGAME = { focusLength: 'quick', maxMin: 10 };

// Whole Full Pre-Game, in minutes: Focus (Quick) plus Move's Game Day.
export const preGameMinutes = (moveMinutes) => totalMinutes('game', PREGAME.focusLength) + moveMinutes;

// focus.start(…, { pregame }) runs Focus and hands back its part;
// move.runPreGame() runs the Move part ({ skipped } or null if stopped early);
// focus.finishPreGame() asks how they feel now, sums up, and saves the scores.
export function initPreGame({ focus, move }) {
  return {
    // Call from a tap (sound unlock happens inside focus.start).
    async start() {
      const part = await focus.start('game', { pregame: true, length: PREGAME.focusLength });
      if (!part) return;   // stopped during Focus: already back home
      const moved = await move.runPreGame();
      await focus.finishPreGame(part, moved);
    },
  };
}
