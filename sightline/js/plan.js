// FOCUS sessions as plain data: the pillars, the sessions built from them
// ("Game Ready", one pillar on its own, or the optional Extras), and how a
// session's minutes are shared out. Pure module (no DOM), so the tests can
// build thousands of sessions in Node.
//
// Every length is the whole session, instruction cards and practice
// included: Game Ready is 5, 8 or 10 minutes, never more (research: short
// beats long on game day; long, demanding mental work causes fatigue).

const SEC = 1000;

// intro: seconds the how-to card, practice and 3-2-1 take, with Full or Brief
// instructions (an estimate; the drill's own time is what's left).
// min / weight: a drill's smallest slot, and its share of the rest.
const BREATH = { intro: { full: 0, brief: 0 }, min: 30, weight: 90 };
const EYES = { intro: { full: 13, brief: 6 }, min: 15, weight: 40 };
const SCORED = { intro: { full: 22, brief: 6 }, min: 20, weight: 60 };

// Every FOCUS drill, by pillar. `flag` drills only appear when that feature
// flag is on (js/features.js). Lock In is a breathing drill, but Game Ready
// always saves it for the very end. Extras are optional: the evidence for
// generic brain games and head-turn drills is limited.
export const PILLARS = [
  { id: 'regulate', title: 'Regulate', drills: [
    { id: 'settle', title: 'Box Breathing', ...BREATH },
    { id: 'sigh', title: 'Physiological Sigh', ...BREATH },
    { id: 'breath478', title: '4-7-8 Breathing', ...BREATH, flag: 'newDrills' },
    { id: 'lockin', title: 'Lock In', ...BREATH, min: 35, weight: 45, finisher: true },
  ] },
  { id: 'activate', title: 'Activate', drills: [
    { id: 'pursuit', title: 'Smooth Pursuit', ...EYES },
    { id: 'saccades', title: 'Saccade Jumps', ...EYES },
    { id: 'peripheral', title: 'Peripheral Flash', ...SCORED, weight: 40 },
  ] },
  { id: 'challenge', title: 'Challenge', drills: [
    { id: 'colorcall', title: 'Color Call', ...SCORED },
    { id: 'gonogo', title: 'Go / No-Go', ...SCORED },
  ] },
  { id: 'rehearse', title: 'Rehearse', drills: [
    { id: 'visualize', title: 'Visualization', intro: { full: 10, brief: 4 }, min: 30, weight: 45 },
  ] },
  { id: 'extras', title: 'Extras', drills: [
    { id: 'gaze', title: 'Gaze Stabilization', ...EYES },
    { id: 'stroop', title: 'Stroop', ...SCORED },
    { id: 'math', title: 'Quick Math', ...SCORED },
    { id: 'questions', title: 'Quick Questions', ...SCORED },
    { id: 'memory', title: 'Memory Sequence', ...SCORED, intro: { full: 25, brief: 6 }, flag: 'newDrills' },
  ] },
];

const drillById = Object.fromEntries(PILLARS.flatMap((p) => p.drills.map((d) => [d.id, { ...d, pillarId: p.id }])));
const pillarById = Object.fromEntries(PILLARS.map((p) => [p.id, p]));

// The FOCUS menu. minutes: whole-session length for Quick / Standard / Full.
//   check: the readiness check (+ cue word) runs before ('before') or before and after ('both').
export const FOCUS_SESSIONS = [
  { id: 'game', title: 'Game Ready', short: 'Regulate → Activate → Challenge → Rehearse', check: 'both', minutes: [5, 8, 10] },
  { id: 'regulate', title: 'Breathing only', short: 'Calm down, then lock in', minutes: [2.5, 3.5, 5] },
  { id: 'activate', title: 'Eyes only', short: 'Tracking, eye jumps, side vision', minutes: [2, 3, 4] },
  { id: 'challenge', title: 'Reaction only', short: 'Color Call and Go / No-Go', minutes: [2, 3, 4] },
  { id: 'rehearse', title: 'Rehearse only', short: 'Cue word, visualization, lock in', check: 'before', minutes: [1.5, 1.5, 2] },
  { id: 'extras', title: 'Extras', short: 'Optional: Stroop, math, trivia, memory, head turns', minutes: [4, 6, 8], extra: true },
];
export const sessionById = Object.fromEntries(FOCUS_SESSIONS.map((s) => [s.id, s]));
export const GAME_DAY_MAX_MIN = 10;
const LENGTH_INDEX = { quick: 0, standard: 1, full: 2 };

const sameOrder = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);

// Drills a pillar can use right now (feature flags), finishers excluded.
function available(pillarId, flags) {
  return pillarById[pillarId].drills.filter((d) => !d.finisher && (!d.flag || flags[d.flag]));
}

// Shuffle, avoiding last session's exact order when there's a choice.
function shuffled(rng, drills, avoid) {
  let order = rng.shuffle(drills);
  for (let i = 0; i < 5 && drills.length > 1 && sameOrder(order.map((d) => d.id), avoid); i++) order = rng.shuffle(drills);
  // Still the same (likely with only 2 drills)? Rotate it, which always differs.
  if (drills.length > 1 && sameOrder(order.map((d) => d.id), avoid)) order = [...order.slice(1), order[0]];
  return order;
}

// The drills a session runs, in order, as [drill, pillar shown in the top bar].
function drillsFor(sessionId, length, rng, avoid, flags) {
  const step = (id, pillarId) => [drillById[id], pillarById[pillarId ?? drillById[id].pillarId]];
  if (sessionId === 'game') {
    // One breathing pattern (rotating), the eye drills (Quick skips Smooth
    // Pursuit), the two reaction drills, then Visualization and Lock In: it
    // always ends on something that can't be failed.
    const breaths = available('regulate', flags);
    const pool = breaths.length > 1 ? breaths.filter((d) => d.id !== avoid.regulate?.[0]) : breaths;
    const eyes = available('activate', flags).filter((d) => length !== 'quick' || d.id !== 'pursuit');
    return [
      step(rng.pick(pool).id),
      ...shuffled(rng, eyes, avoid.activate).map((d) => step(d.id)),
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

// Whole-session minutes (instructions included), as shown in the menus.
export function totalMinutes(sessionId, length) {
  const s = sessionById[sessionId] ?? sessionById.game;
  return s.minutes[LENGTH_INDEX[length] ?? 1];
}

// Instructions: Auto shows the full how-to (example + practice) the first few
// times this phone sees a drill, then just the rule.
export const AUTO_FULL_TIMES = 3;
export function guideChooser(mode, seen = {}) {
  return (drillId) => (mode === 'brief' ? 'brief' : mode === 'full' ? 'full'
    : (seen[drillId] ?? 0) < AUTO_FULL_TIMES ? 'full' : 'brief');
}

// Seconds a drill's instructions take ('full' or 'brief').
export const introSeconds = (drillId, guide) => drillById[drillId]?.intro?.[guide] ?? 0;

// Ordered steps for one session, each with its own time and instruction mode.
//   avoid    pillar id → last session's drill order (so the shuffle varies)
//   flags    which flagged drills are on, e.g. { newDrills: true }
//   guideFor drill id → 'full' | 'brief' (Instructions setting; Auto goes
//            Brief once a drill is familiar)
// The session's minutes cover everything: instruction time comes off the top,
// each drill gets its minimum, and the rest is shared by weight.
export function planSteps(sessionId, settings, rng, { avoid = {}, flags = {}, guideFor = () => 'full' } = {}) {
  const length = settings.length in LENGTH_INDEX ? settings.length : 'standard';
  const list = drillsFor(sessionId, length, rng, avoid, flags).map(([d, pillar]) => ({ d, pillar, guide: guideFor(d.id) }));
  const intro = list.reduce((a, x) => a + introSeconds(x.d.id, x.guide), 0);
  const spare = totalMinutes(sessionId, length) * 60 - intro - list.reduce((a, x) => a + x.d.min, 0);
  const weights = list.reduce((a, x) => a + x.d.weight, 0);
  // Whole seconds; the last drill takes the rounding so the total is exact.
  let used = 0;
  const secs = list.map((x, i) => {
    if (i === list.length - 1) return totalMinutes(sessionId, length) * 60 - intro - used;
    const s = Math.round(x.d.min + Math.max(0, spare) * (x.d.weight / weights));
    used += s;
    return s;
  });
  return list.map(({ d, pillar, guide }, i) => ({
    id: d.id, title: d.title, guide,
    pillarId: pillar.id, pillarTitle: pillar.title,
    introMs: introSeconds(d.id, guide) * SEC,
    durationMs: secs[i] * SEC,
  }));
}
