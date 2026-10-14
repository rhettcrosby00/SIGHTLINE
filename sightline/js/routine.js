// The "Game Ready" routine: maps the session plan (js/plan.js) to the drill
// modules that run each step. Order and timing come from the session.

import { settle, lockIn } from './stages/breathe.js';
import { pursuit, saccades, gaze } from './stages/eyes.js';
import { colorCall, goNoGo, stroop, peripheral } from './stages/reaction.js';
import { quickMath, quickQuestions } from './stages/brain.js';
import { visualize } from './stages/visualize.js';

export { totalMinutes } from './plan.js';

const MODULES = {
  settle, pursuit, saccades, gaze,
  colorcall: colorCall, gonogo: goNoGo, stroop, peripheral, math: quickMath, questions: quickQuestions,
  visualize, lockin: lockIn,
};

// Steps for the engine: the session's planned order plus each drill's module.
export function buildRoutine(session) {
  return session.steps.map((s) => ({
    ...s,
    module: MODULES[s.id],
    blockId: s.pillarId,
    blockTitle: s.pillarTitle,
  }));
}
