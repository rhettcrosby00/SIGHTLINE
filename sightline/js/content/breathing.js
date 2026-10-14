// Rotating wording for the breathing screens. The breathing patterns never
// change (box 4-4-4-4 for Settle; power breaths + one steady breath for Lock
// In); only the words around them do, so each session reads a little fresh.

import { spaced } from '../lib/rng.js';

const SETTLE_INTRO = [
  'Stand tall. Drop your shoulders.<br>Breathe with the circle.',
  'Feet planted. Soft jaw.<br>Follow the circle.',
  'Find a still spot.<br>Let the circle set your pace.',
  'Shoulders down, chest open.<br>Breathe with the circle.',
  'Let your hands hang loose.<br>Match the circle.',
];

const SETTLE_TIPS = {
  in: ['In through your nose', 'Fill up slowly', 'Slow breath in', 'Fill your belly first', 'Easy and full'],
  hold: ['Hold it, relaxed', 'Stay still', 'Soft shoulders', 'Quiet hold', 'Easy hold'],
  out: ['Out through your mouth', 'Let it all go', 'Slow and long', 'Empty out', 'Long exhale'],
  rest: ['Pause', 'Stay loose', 'Still', 'Rest here', 'Wait for it'],
};

const LOCKIN_INTRO = [
  'Quick, sharp breaths.<br>In through the nose, out through the mouth.',
  'Short, strong breaths.<br>Sharp in, push out.',
  'Wake it up.<br>Fast in through the nose, fast out.',
  'Bring the energy.<br>Snap in, snap out.',
];

const LOCKIN_STEADY = ['One steady breath', 'One long, full breath', 'Slow it all down', 'Last breath — make it count'];

const LOCKIN_FINAL = [
  'You’re ready. Go compete.',
  'Ready. Go play fast.',
  'Locked in. Trust your work.',
  'You’re set. Go be first.',
];

// One set of wording for a session. tip(kind) rotates without back-to-back repeats.
export function breathingText(rng) {
  const tips = Object.fromEntries(Object.entries(SETTLE_TIPS).map(([k, list]) => [k, spaced(rng, list, { max: 1 })]));
  return {
    settleIntro: rng.pick(SETTLE_INTRO),
    lockInIntro: rng.pick(LOCKIN_INTRO),
    lockInSteady: rng.pick(LOCKIN_STEADY),
    lockInFinal: rng.pick(LOCKIN_FINAL),
    tip: (kind) => tips[kind](),
  };
}
