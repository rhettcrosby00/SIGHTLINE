// FOCUS sessions: maps the session plan (js/plan.js) to the drill modules that
// run each step. Order and timing come from the session.

import { settle, sigh, resonance, breath478, energize, lockIn } from './stages/breathe.js';
import { pursuit, saccades, gaze } from './stages/eyes.js';
import { colorCall, goNoGo, stroop, peripheral, capture } from './stages/reaction.js';
import { nearFar, span } from './stages/vision.js';
import { tracking } from './stages/tracking.js';
import { quickMath } from './stages/brain.js';
import { memory } from './stages/memory.js';
import { quietEye } from './stages/quieteye.js';
import { myRoutine } from './stages/myroutine.js';
import { visualize } from './stages/visualize.js';

export const MODULES = {
  settle, sigh, resonance, breath478, energize, lockin: lockIn,
  pursuit, saccades, gaze, peripheral, quieteye: quietEye,
  nearfar: nearFar, capture, span, mot: tracking,
  colorcall: colorCall, gonogo: goNoGo, stroop, math: quickMath, memory,
  visualize, myroutine: myRoutine,
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
