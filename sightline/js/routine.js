// The "Game Ready" routine: blocks, drills and how long each runs per length.

import { settle, lockIn } from './stages/breathe.js';
import { pursuit, saccades } from './stages/eyes.js';
import { colorCall, goNoGo, stroop, peripheral } from './stages/reaction.js';
import { quickMath, quickQuestions } from './stages/brain.js';

const MIN = 60_000;

// Minutes per block for each length.
const BLOCK_MINUTES = {
  quick:    { settle: 1,   eyes: 0.75, reaction: 1.5, brain: 1,   lockin: 0.75 },
  standard: { settle: 1.5, eyes: 1.5,  reaction: 3,   brain: 1.5, lockin: 1 },
  full:     { settle: 2,   eyes: 2,    reaction: 4.5, brain: 2.5, lockin: 1 },
};

// Order matters: reaction drills escalate from simple to hardest.
const BLOCKS = [
  { id: 'settle', title: 'Settle', drills: [
    { id: 'settle', title: 'Settle', desc: 'Box breathing to calm down and focus.', module: settle },
  ] },
  { id: 'eyes', title: 'Eye Warm-up', drills: [
    { id: 'pursuit', title: 'Smooth Pursuit', desc: 'Follow the moving dot with your eyes.', module: pursuit },
    { id: 'saccades', title: 'Saccade Jumps', desc: 'Snap your eyes to each target as it pops up.', module: saccades },
  ] },
  { id: 'reaction', title: 'Reaction', drills: [
    { id: 'colorcall', title: 'Color Call', desc: 'Match the color as fast as you can.', module: colorCall },
    { id: 'gonogo', title: 'Go / No-Go', desc: 'Green means go. Red means hold still.', module: goNoGo },
    { id: 'stroop', title: 'Stroop', desc: 'Respond to the INK color, not the word.', module: stroop },
    { id: 'peripheral', title: 'Peripheral Flash', desc: 'Eyes on the center dot. Catch the edges.', module: peripheral },
  ] },
  { id: 'brain', title: 'Brain', drills: [
    { id: 'math', title: 'Quick Math', desc: 'Solve it. Odd or even?', module: quickMath },
    { id: 'questions', title: 'Quick Questions', desc: 'Pick the right answer.', module: quickQuestions },
  ] },
  { id: 'lockin', title: 'Lock In', drills: [
    { id: 'lockin', title: 'Lock In', desc: 'Energizing breaths. Finish ready to compete.', module: lockIn },
  ] },
];

export function totalMinutes(length) {
  return Object.values(BLOCK_MINUTES[length] ?? BLOCK_MINUTES.standard).reduce((a, b) => a + b, 0);
}

// Flatten into an ordered list of steps; block time is split evenly across its drills.
export function buildRoutine(settings) {
  const mins = BLOCK_MINUTES[settings.length] ?? BLOCK_MINUTES.standard;
  const steps = [];
  for (const block of BLOCKS) {
    const each = Math.round((mins[block.id] * MIN) / block.drills.length);
    for (const d of block.drills) {
      steps.push({ ...d, blockId: block.id, blockTitle: block.title, durationMs: each });
    }
  }
  return steps;
}
