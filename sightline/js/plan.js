// The "Game Ready" routine as plain data: four pillars in a fixed order,
// minutes per length, and which drills shuffle. Pure module (no DOM), so the
// tests can build thousands of sessions in Node.

const MIN = 60_000;

// Pillar order never changes. Drills marked `pin` keep their place; the rest
// of a pillar is shuffled every session.
export const PILLARS = [
  { id: 'regulate', title: 'Regulate', drills: [
    { id: 'settle', title: 'Settle', desc: 'Box breathing to calm down and focus.' },
  ] },
  { id: 'activate', title: 'Activate', drills: [
    { id: 'pursuit', title: 'Smooth Pursuit', desc: 'Follow the moving dot with your eyes.' },
    { id: 'saccades', title: 'Saccade Jumps', desc: 'Snap your eyes to each target as it pops up.' },
    { id: 'gaze', title: 'Gaze Stabilization', desc: 'Eyes on the letter while your head moves.' },
  ] },
  { id: 'challenge', title: 'Challenge', drills: [
    { id: 'colorcall', title: 'Color Call', desc: 'Match the color as fast as you can.' },
    { id: 'gonogo', title: 'Go / No-Go', desc: 'Green means go. Red means hold still.' },
    { id: 'stroop', title: 'Stroop', desc: 'Respond to the INK color, not the word.' },
    { id: 'peripheral', title: 'Peripheral Flash', desc: 'Eyes on the center dot. Catch the edges.' },
    { id: 'math', title: 'Quick Math', desc: 'Solve it. Odd or even?' },
    { id: 'questions', title: 'Quick Questions', desc: 'Pick the right answer.' },
  ] },
  { id: 'rehearse', title: 'Rehearse', drills: [
    { id: 'visualize', title: 'Visualization', desc: 'Picture your best play.', pin: true },
    { id: 'lockin', title: 'Lock In', desc: 'Energizing breaths. Finish ready to compete.', pin: true },
  ] },
];

// Minutes for each length. Rehearse is split per drill because Visualization
// scripts are a fixed 45 s.
const MINUTES = {
  quick:    { regulate: 0.75, activate: 0.75, challenge: 2.25, visualize: 0.75, lockin: 0.75 },
  standard: { regulate: 1.25, activate: 1.5,  challenge: 4,    visualize: 0.75, lockin: 0.75 },
  full:     { regulate: 1.75, activate: 2.25, challenge: 6,    visualize: 0.75, lockin: 1 },
};

export function totalMinutes(length) {
  return Object.values(MINUTES[length] ?? MINUTES.standard).reduce((a, b) => a + b, 0);
}

const sameOrder = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);

// Ordered steps for one session. `avoid` maps a pillar id to last session's
// drill order, so the shuffle doesn't hand back the exact same order.
export function planSteps(settings, rng, { avoid = {} } = {}) {
  const mins = MINUTES[settings.length] ?? MINUTES.standard;
  const steps = [];
  for (const pillar of PILLARS) {
    const free = pillar.drills.filter((d) => !d.pin);
    let order = rng.shuffle(free);
    for (let i = 0; i < 5 && free.length > 1 && sameOrder(order.map((d) => d.id), avoid[pillar.id]); i++) {
      order = rng.shuffle(free);
    }
    const drills = [...order, ...pillar.drills.filter((d) => d.pin)];
    for (const d of drills) {
      const ms = mins[d.id] ?? mins[pillar.id] / pillar.drills.length;
      steps.push({ ...d, pillarId: pillar.id, pillarTitle: pillar.title, durationMs: Math.round(ms * MIN) });
    }
  }
  return steps;
}
