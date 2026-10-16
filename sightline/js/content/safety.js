// Every word of the safety waiver, the disclaimer and the safety notes, in one
// place. To change the waiver: edit the text and raise `version` by one. Every
// device then shows the new waiver once and asks for acceptance again
// (js/waiver.js).

export const WAIVER = {
  version: 1,
  effective: 'October 16, 2026',
  heading: 'Before you start.',
  intro: 'Please read this waiver. You need to accept it before you can use Sightrep.',
  sections: [
    {
      heading: 'Assumption of risk',
      body: 'Sightrep includes physical activity, such as sprinting, cutting, changing direction and balance work, and visual drills, such as rapid eye movements, head turns and flashing visuals. These activities carry a risk of injury, including falls, strains, sprains, dizziness and other harm. You understand these risks and choose to take part.',
    },
    {
      heading: 'Your responsibility',
      body: 'You are responsible for using Sightrep safely. Use a clear, flat, safe space free of obstacles. Warm up before any high-speed movement. Wear proper footwear. Stop right away if you feel pain, dizziness, nausea, eye strain or any discomfort. Never use Sightrep while driving or in unsafe surroundings.',
    },
    {
      heading: 'Health and medical',
      body: 'Talk to a doctor before you start if you have any injury, medical condition, history of seizures or sensitivity to flashing lights, vision condition, or a recent head injury or concussion. Sightrep is a training and warm-up tool. It is not medical advice and does not diagnose, treat or prevent any condition, including concussion.',
    },
    {
      heading: 'Release of liability',
      body: 'To the fullest extent allowed by law, you agree that you use Sightrep voluntarily and at your own risk, and you release the creator of Sightrep from any claims for injury, loss or damage arising from your use of the app.',
    },
    {
      heading: 'Supervision of minors',
      body: 'If you are under 18, use Sightrep only with the permission and supervision of a parent, guardian or coach.',
    },
    {
      heading: 'Changes',
      body: 'This waiver may be updated from time to time. If it changes, you will be asked to read and accept the new version before you continue.',
    },
  ],
  checks: {
    risks: 'I have read and understand this waiver. I accept the risks of physical activity and agree that I use Sightrep at my own risk.',
    age: 'I am 16 years of age or older, or I have permission from a parent, guardian, or coach.',
  },
  button: 'Agree and continue',
  viewFull: 'View full waiver',
};

export const DISCLAIMER = 'Sightrep is a training and warm-up tool. It is not medical advice and does not diagnose or treat any condition.';

// Always on screen where they apply: MOVE's hub, cone layout, Custom setup and
// Partner mode (move); the head-turn and near-far eye drills (dizzy); drills
// with flashing visuals (flashing).
export const SAFETY = {
  move: 'Use a clear, flat area. Warm up before high-speed cuts.',
  dizzy: 'Stop if you feel dizzy.',
  flashing: 'Contains brief flashing visuals.',
};

// Which drills show which note, on the how-to card and along the top while the
// drill runs (js/stages/common.js howTo, js/engine.js). Flashing: these always;
// Smooth Pursuit, Saccade Jumps and Object Tracking only with Occlusion on (the
// target blinks out); a MOVE run only with Display set to Flash.
const DRILL_NOTES = {
  gaze: ['dizzy'], nearfar: ['dizzy'],
  peripheral: ['flashing'], capture: ['flashing'], quieteye: ['flashing'], span: ['flashing'],
};
const FLASHES_WHEN = { pursuit: 'occlusion', saccades: 'occlusion', mot: 'occlusion', conedrill: 'flash' };
export function drillSafety(id, { occlusion = false, flash = false } = {}) {
  const when = FLASHES_WHEN[id];
  const flashing = (when === 'occlusion' && occlusion) || (when === 'flash' && flash);
  return [...(DRILL_NOTES[id] ?? []), ...(flashing ? ['flashing'] : [])].map((k) => SAFETY[k]);
}

// MOVE setup screens: the move note, plus flashing when Display is Flash.
export const moveSafety = (setup = {}) => [SAFETY.move, ...(setup.display === 'flash' ? [SAFETY.flashing] : [])];
