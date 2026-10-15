// FOCUS sessions as plain data: four pillars, the sessions built from them
// ("Game Ready" plus one pillar on its own), minutes per length, and which
// drills shuffle. Pure module (no DOM), so the tests can build thousands of
// sessions in Node.

const MIN = 60_000;

// Every FOCUS drill, by pillar. `flag` drills only appear when that feature
// flag is on (js/features.js). Lock In is a breathing drill, but Game Ready
// always saves it for the very end.
export const PILLARS = [
  { id: 'regulate', title: 'Regulate', drills: [
    { id: 'settle', title: 'Box Breathing', desc: 'Even 4-count breaths to calm down and focus.' },
    { id: 'sigh', title: 'Physiological Sigh', desc: 'Two breaths in, one long breath out. Fast calm.', flag: 'newDrills' },
    { id: 'breath478', title: '4-7-8 Breathing', desc: 'In for 4, hold for 7, out for 8.', flag: 'newDrills' },
    { id: 'lockin', title: 'Lock In', desc: 'Energizing breaths. Finish ready to compete.', finisher: true },
  ] },
  { id: 'activate', title: 'Activate', drills: [
    { id: 'pursuit', title: 'Smooth Pursuit', desc: 'Follow the moving dot with your eyes.' },
    { id: 'saccades', title: 'Saccade Jumps', desc: 'Snap your eyes to each target as it pops up.' },
    { id: 'gaze', title: 'Gaze Stabilization', desc: 'Eyes on the letter while your head moves.' },
    { id: 'peripheral', title: 'Peripheral Flash', desc: 'Eyes on the center dot. Catch the edges.' },
  ] },
  { id: 'challenge', title: 'Challenge', drills: [
    { id: 'colorcall', title: 'Color Call', desc: 'Match the color as fast as you can.' },
    { id: 'gonogo', title: 'Go / No-Go', desc: 'Green means go. Red means hold still.' },
    { id: 'stroop', title: 'Stroop', desc: 'Respond to the INK color, not the word.' },
    { id: 'math', title: 'Quick Math', desc: 'Solve it. Odd or even?' },
    { id: 'questions', title: 'Quick Questions', desc: 'Pick the right answer.' },
    { id: 'memory', title: 'Memory Sequence', desc: 'Watch the colors light up, then tap them back in order.', flag: 'newDrills' },
  ] },
  { id: 'rehearse', title: 'Rehearse', drills: [
    { id: 'visualize', title: 'Visualization', desc: 'Picture your best play.' },
  ] },
];

const drillById = Object.fromEntries(PILLARS.flatMap((p) => p.drills.map((d) => [d.id, { ...d, pillarId: p.id }])));
const pillarById = Object.fromEntries(PILLARS.map((p) => [p.id, p]));

// The FOCUS menu. Game Ready runs every pillar; the others run one.
//   check: the readiness check (+ cue word) runs before ('before') or before and after ('both').
export const FOCUS_SESSIONS = [
  { id: 'game', title: 'Game Ready', short: 'Regulate → Activate → Challenge → Rehearse', check: 'both' },
  { id: 'regulate', title: 'Breathing only', short: 'Calm down, then lock in' },
  { id: 'activate', title: 'Eyes only', short: 'Tracking, eye jumps, gaze holds, peripheral' },
  { id: 'challenge', title: 'Mind only', short: 'Reaction and brain drills' },
  { id: 'rehearse', title: 'Rehearse only', short: 'Cue word, visualization, lock in', check: 'before' },
];
export const sessionById = Object.fromEntries(FOCUS_SESSIONS.map((s) => [s.id, s]));

// Minutes per length. Game Ready splits time by pillar (Rehearse per drill,
// because Visualization scripts run a fixed ~45 s); the one-pillar sessions
// give their pillar the whole slot (minus Lock In where it finishes).
const MINUTES = {
  game: {
    quick:    { regulate: 0.75, activate: 1, challenge: 2,    visualize: 0.75, lockin: 0.75 },
    standard: { regulate: 1.25, activate: 2, challenge: 3.5,  visualize: 0.75, lockin: 0.75 },
    full:     { regulate: 1.75, activate: 3, challenge: 5.25, visualize: 0.75, lockin: 1 },
  },
  regulate:  { quick: { regulate: 1.75, lockin: 0.75 }, standard: { regulate: 2.75, lockin: 0.75 }, full: { regulate: 4, lockin: 1 } },
  activate:  { quick: { activate: 2 }, standard: { activate: 3 }, full: { activate: 4 } },
  challenge: { quick: { challenge: 3 }, standard: { challenge: 5 }, full: { challenge: 7 } },
  rehearse:  { quick: { visualize: 0.75, lockin: 0.75 }, standard: { visualize: 0.75, lockin: 0.75 }, full: { visualize: 0.75, lockin: 1 } },
};

const sameOrder = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);

// Drills a pillar can use right now (feature flags), finishers excluded.
function available(pillarId, flags) {
  return pillarById[pillarId].drills.filter((d) => !d.finisher && (!d.flag || flags[d.flag]));
}

// Shuffle, avoiding last session's exact order when there's a choice.
function shuffled(rng, drills, avoid) {
  let order = rng.shuffle(drills);
  for (let i = 0; i < 5 && drills.length > 1 && sameOrder(order.map((d) => d.id), avoid); i++) order = rng.shuffle(drills);
  return order;
}

// The drills a session runs, in order, as [drill, pillar shown in the top bar].
function drillsFor(sessionId, rng, avoid, flags) {
  const step = (id, pillarId) => [drillById[id], pillarById[pillarId ?? drillById[id].pillarId]];
  if (sessionId === 'game') {
    // One breathing pattern (rotating), every eye and brain drill, then
    // Visualization and Lock In to finish.
    const breaths = available('regulate', flags);
    const pool = breaths.length > 1 ? breaths.filter((d) => d.id !== avoid.regulate?.[0]) : breaths;
    return [
      step(rng.pick(pool).id),
      ...shuffled(rng, available('activate', flags), avoid.activate).map((d) => step(d.id)),
      ...shuffled(rng, available('challenge', flags), avoid.challenge).map((d) => step(d.id)),
      step('visualize'),
      step('lockin', 'rehearse'),
    ];
  }
  if (sessionId === 'regulate') {
    return [...shuffled(rng, available('regulate', flags), avoid.regulate).map((d) => step(d.id)), step('lockin')];
  }
  if (sessionId === 'rehearse') return [step('visualize'), step('lockin', 'rehearse')];
  return shuffled(rng, available(sessionId, flags), avoid[sessionId]).map((d) => step(d.id));
}

export function totalMinutes(sessionId, length) {
  const mins = MINUTES[sessionId] ?? MINUTES.game;
  return Object.values(mins[length] ?? mins.standard).reduce((a, b) => a + b, 0);
}

// Ordered steps for one session. `avoid` maps a pillar id to last session's
// drill order, so the shuffle doesn't hand back the exact same order.
// `flags` says which flagged drills are on, e.g. { newDrills: true }.
export function planSteps(sessionId, settings, rng, { avoid = {}, flags = {} } = {}) {
  const table = MINUTES[sessionId] ?? MINUTES.game;
  const mins = table[settings.length] ?? table.standard;
  const list = drillsFor(sessionId, rng, avoid, flags);
  // Time per drill: its own slot if it has one, else an even share of its pillar's.
  const share = (d, pillar) => {
    if (mins[d.id] != null) return mins[d.id];
    const peers = list.filter(([x, p]) => p.id === pillar.id && mins[x.id] == null).length;
    return mins[pillar.id] / peers;
  };
  return list.map(([d, pillar]) => ({
    id: d.id, title: d.title, desc: d.desc,
    pillarId: pillar.id, pillarTitle: pillar.title,
    durationMs: Math.round(share(d, pillar) * MIN),
  }));
}
