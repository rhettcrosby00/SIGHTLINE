// FOCUS sessions as plain data: the pillars, the sessions built from them
// ("Game Ready", one pillar on its own, or the optional Extras), and how a
// session's minutes are shared out. Pure module (no DOM), so the tests can
// build thousands of sessions in Node.
//
// Every length is the whole session, instruction cards and practice
// included: Game Ready is 5, 8 or 10 minutes, never more (research: short
// beats long on game day; long, demanding mental work causes fatigue).
//
// Training (non-game days) is 10, 15 or 20 minutes: every pillar plus the
// Visual skills, harder (js/lib/adapt.js), Occlusion allowed. It still ends
// with My Routine.
//
// The readiness check-in shapes it (STATES):
//   wired  2–3 cyclic sighs, then 60–90 s of slow breathing (6 a minute), calmer cue pacing
//   flat   a short calm, then energizing breaths, quicker cue pacing
//   ready  one breathing pattern, rotating; standard pacing
// Game Ready always ends with My Routine (the athlete's own 20–40 s routine).

const SEC = 1000;

// intro: seconds the how-to card, practice and 3-2-1 take, with Full or Brief
// instructions (an estimate; the drill's own time is what's left).
// min / weight: a drill's smallest slot, and its share of the rest.
const BREATH = { intro: { full: 0, brief: 0 }, min: 30, weight: 90 };
const EYES = { intro: { full: 13, brief: 6 }, min: 15, weight: 40 };
const SCORED = { intro: { full: 22, brief: 6 }, min: 20, weight: 60 };

// Every FOCUS drill, by pillar. Finishers and special drills never join a
// shuffle: Lock In and Energize are placed on purpose, Quiet Eye isn't in Game
// Ready (My Routine has its own quiet-eye moment), and My Routine runs last.
// Vision (sports-vision skills) runs as its own session, not in Game Ready.
// Extras are optional: the evidence for generic brain games, head-turn drills
// and object tracking on its own is limited.
export const PILLARS = [
  { id: 'regulate', title: 'Regulate', drills: [
    { id: 'settle', title: 'Box Breathing', ...BREATH },
    { id: 'sigh', title: 'Cyclic Sigh', ...BREATH },
    { id: 'resonance', title: 'Resonance Breathing', ...BREATH },
    { id: 'breath478', title: '4-7-8 Breathing', ...BREATH },
    { id: 'energize', title: 'Energize', ...BREATH, min: 35, weight: 45, special: true },
    { id: 'lockin', title: 'Lock In', ...BREATH, min: 35, weight: 45, special: true },
  ] },
  { id: 'activate', title: 'Activate', drills: [
    { id: 'pursuit', title: 'Smooth Pursuit', ...EYES },
    { id: 'saccades', title: 'Saccade Jumps', ...EYES },
    { id: 'peripheral', title: 'Peripheral Flash', ...SCORED, weight: 40 },
    { id: 'quieteye', title: 'Quiet Eye', ...SCORED, intro: { full: 18, brief: 6 }, weight: 50, notInGame: true },
  ] },
  { id: 'challenge', title: 'Challenge', drills: [
    { id: 'colorcall', title: 'Color Call', ...SCORED },
    { id: 'gonogo', title: 'Go / No-Go', ...SCORED },
  ] },
  { id: 'vision', title: 'Vision', drills: [
    { id: 'nearfar', title: 'Near-Far Focus', ...SCORED, intro: { full: 24, brief: 6 }, min: 30 },
    { id: 'capture', title: 'Target Capture', ...SCORED },
    { id: 'span', title: 'Perception Span', ...SCORED, min: 30 },
  ] },
  { id: 'rehearse', title: 'Rehearse', drills: [
    { id: 'visualize', title: 'Visualization', intro: { full: 10, brief: 4 }, min: 30, weight: 45 },
    { id: 'myroutine', title: 'My Routine', intro: { full: 0, brief: 0 }, min: 0, weight: 0, special: true },
  ] },
  { id: 'extras', title: 'Extras', drills: [
    { id: 'gaze', title: 'Gaze Stabilization', ...EYES },
    { id: 'stroop', title: 'Stroop', ...SCORED },
    { id: 'math', title: 'Quick Math', ...SCORED },
    { id: 'memory', title: 'Memory Sequence', ...SCORED, intro: { full: 25, brief: 6 } },
    { id: 'mot', title: 'Object Tracking', ...SCORED, intro: { full: 14, brief: 6 }, min: 30 },
  ] },
];

const drillById = Object.fromEntries(PILLARS.flatMap((p) => p.drills.map((d) => [d.id, { ...d, pillarId: p.id }])));
const pillarById = Object.fromEntries(PILLARS.map((p) => [p.id, p]));

// The FOCUS menu. minutes: whole-session length for Quick / Standard / Full.
//   check: the readiness check-in (+ cue word) runs before ('before') or before and after ('both').
//   unscored: no leaderboard entry. timedByRoutine: as long as the athlete's routine.
export const FOCUS_SESSIONS = [
  { id: 'game', title: 'Game Ready', short: 'Regulate → Activate → Challenge → Rehearse', check: 'both', minutes: [5, 8, 10] },
  { id: 'training', title: 'Training', short: 'Every pillar plus visual skills, harder', check: 'both', minutes: [10, 15, 20], training: true },
  { id: 'regulate', title: 'Breathing only', short: 'Calm down or wake up, matched to how you feel', check: 'before', minutes: [2.5, 3.5, 5] },
  { id: 'activate', title: 'Eyes only', short: 'Tracking, eye jumps, side vision, quiet eye', minutes: [2.5, 3.5, 4.5] },
  { id: 'vision', title: 'Visual skills', short: 'Near-far focus, target capture, perception span', minutes: [3, 4, 5] },
  { id: 'challenge', title: 'Reaction only', short: 'Color Call and Go / No-Go', minutes: [2, 3, 4] },
  { id: 'rehearse', title: 'Rehearse only', short: 'Cue word, visualization, My Routine', check: 'before', minutes: [1.5, 1.5, 2] },
  { id: 'extras', title: 'Extras', short: 'Optional: Stroop, math, memory, head turns, object tracking', minutes: [4, 6, 8], extra: true },
  { id: 'myroutine', title: 'My Routine', short: 'Your 20–40 second pre-performance routine', minutes: [0.5, 0.5, 0.5], unscored: true, timedByRoutine: true },
];
export const sessionById = Object.fromEntries(FOCUS_SESSIONS.map((s) => [s.id, s]));
export const GAME_DAY_MAX_MIN = 10;
const LENGTH_INDEX = { quick: 0, standard: 1, full: 2 };

// The readiness check-in. Pacing scales the reaction drills' answer window
// and the gap between cues (calmer when wired, snappier when flat).
export const STATES = ['flat', 'ready', 'wired'];
export const PACING = { flat: { window: 0.9, gap: 0.85 }, ready: { window: 1, gap: 1 }, wired: { window: 1.15, gap: 1.2 } };
// Wired breathing, by length (Quick / Standard / Full): seconds of cyclic sighs, then resonance.
const WIRED_SIGH = [26, 36, 36];
const WIRED_RESONANCE = [60, 75, 90];
const FLAT_CALM = 26;   // seconds of calm before Energize (2 sighs)
// If a short session can't fit everything, these drop first (Game Ready).
const DROP_ORDER = ['pursuit', 'gonogo', 'peripheral'];

const sameOrder = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);

// Drills a pillar can shuffle, special drills excluded.
function available(pillarId) {
  return pillarById[pillarId].drills.filter((d) => !d.special);
}

// Shuffle, avoiding last session's exact order when there's a choice.
function shuffled(rng, drills, avoid) {
  let order = rng.shuffle(drills);
  for (let i = 0; i < 5 && drills.length > 1 && sameOrder(order.map((d) => d.id), avoid); i++) order = rng.shuffle(drills);
  // Still the same (likely with only 2 drills)? Rotate it, which always differs.
  if (drills.length > 1 && sameOrder(order.map((d) => d.id), avoid)) order = [...order.slice(1), order[0]];
  return order;
}

// The drills a session runs, in order: { d, pillar (shown in the top bar), fixed? (seconds) }.
function drillsFor(sessionId, length, rng, avoid, state, routineS) {
  const i = LENGTH_INDEX[length];
  const step = (id, pillarId, fixed) => ({ d: drillById[id], pillar: pillarById[pillarId ?? drillById[id].pillarId], fixed });
  const calmPool = available('regulate');
  // Regulate, matched to the check-in.
  const regulate = () => {
    if (state === 'wired') return [step('sigh', null, WIRED_SIGH[i]), step('resonance', null, WIRED_RESONANCE[i])];
    if (state === 'flat') return [step('sigh', null, FLAT_CALM), step('energize')];
    const pool = calmPool.length > 1 ? calmPool.filter((d) => d.id !== avoid.regulate?.[0]) : calmPool;
    return [step(rng.pick(pool).id)];
  };
  if (sessionId === 'game') {
    // Regulate, the eye drills (Quick skips Smooth Pursuit), the two reaction
    // drills, Visualization, then My Routine: it always ends on something
    // that can't be failed.
    const eyes = available('activate').filter((d) => !d.notInGame && (length !== 'quick' || d.id !== 'pursuit'));
    return [
      ...regulate(),
      ...shuffled(rng, eyes, avoid.activate).map((d) => step(d.id)),
      ...shuffled(rng, available('challenge'), avoid.challenge).map((d) => step(d.id)),
      step('visualize'),
      step('myroutine', null, routineS),
    ];
  }
  if (sessionId === 'training') {
    // Every pillar plus the Visual skills, each shuffled; then Visualization and My Routine.
    return [
      ...regulate(),
      ...shuffled(rng, available('activate'), avoid.activate).map((d) => step(d.id)),
      ...shuffled(rng, available('vision'), avoid.vision).map((d) => step(d.id)),
      ...shuffled(rng, available('challenge'), avoid.challenge).map((d) => step(d.id)),
      step('visualize'),
      step('myroutine', null, routineS),
    ];
  }
  if (sessionId === 'regulate') {
    if (state === 'wired') return [step('sigh', null, WIRED_SIGH[i]), step('resonance')];
    if (state === 'flat') return [step('sigh', null, FLAT_CALM), step('energize')];
    return [...shuffled(rng, calmPool, avoid.regulate).map((d) => step(d.id)), step('lockin')];
  }
  if (sessionId === 'rehearse') return [step('visualize'), step('myroutine', null, routineS)];
  if (sessionId === 'myroutine') return [step('myroutine', null, routineS)];
  return shuffled(rng, available(sessionId), avoid[sessionId]).map((d) => step(d.id));
}

// Whole-session minutes (instructions included), as shown in the menus.
// My Routine on its own runs as long as the routine (routineS seconds).
export function totalMinutes(sessionId, length, routineS = 30) {
  const s = sessionById[sessionId] ?? sessionById.game;
  return s.timedByRoutine ? routineS / 60 : s.minutes[LENGTH_INDEX[length] ?? 1];
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
//   guideFor drill id → 'full' | 'brief' (Instructions setting; Auto goes
//            Brief once a drill is familiar)
//   state    'flat' | 'ready' | 'wired' from the check-in (default ready)
//   routineS My Routine's length in seconds
// The session's minutes cover everything: instruction time comes off the top,
// fixed parts (set breathing, My Routine) take their seconds, each other drill
// gets its minimum, and the rest is shared by weight.
export function planSteps(sessionId, settings, rng, { avoid = {}, guideFor = () => 'full', state = 'ready', routineS = 30 } = {}) {
  const length = settings.length in LENGTH_INDEX ? settings.length : 'standard';
  const total = totalMinutes(sessionId, length, routineS) * 60;
  let list = drillsFor(sessionId, length, rng, avoid, STATES.includes(state) ? state : 'ready', routineS)
    .map((x) => ({ ...x, guide: guideFor(x.d.id) }));
  const need = (l) => l.reduce((a, x) => a + introSeconds(x.d.id, x.guide) + (x.fixed ?? x.d.min), 0);
  // Too much for a short session (e.g. Wired + Quick)? Drop the least essential drills.
  for (const id of DROP_ORDER) if (need(list) > total) list = list.filter((x) => x.d.id !== id);
  // A one-part session with full instructions (e.g. Quick Extras): the last
  // drill in the shuffle sits this one out. Finishers always stay.
  while (need(list) > total && list.length > 2 && list.at(-1).fixed == null && !list.at(-1).d.special) list = list.slice(0, -1);

  const intro = list.reduce((a, x) => a + introSeconds(x.d.id, x.guide), 0);
  const fixed = list.reduce((a, x) => a + (x.fixed ?? 0), 0);
  const flexible = list.filter((x) => x.fixed == null);
  const spare = total - intro - fixed - flexible.reduce((a, x) => a + x.d.min, 0);
  const weights = flexible.reduce((a, x) => a + x.d.weight, 0) || 1;
  // Whole seconds; the last flexible drill takes the rounding so the total is exact.
  const lastFlex = flexible.at(-1);
  let used = intro + fixed;
  const secs = new Map();
  for (const x of flexible) {
    if (x === lastFlex) continue;
    const s = Math.round(x.d.min + Math.max(0, spare) * (x.d.weight / weights));
    secs.set(x, s);
    used += s;
  }
  if (lastFlex) secs.set(lastFlex, total - used);
  return list.map((x) => ({
    id: x.d.id, title: x.d.title, guide: x.guide,
    pillarId: x.pillar.id, pillarTitle: x.pillar.title,
    introMs: introSeconds(x.d.id, x.guide) * SEC,
    durationMs: (x.fixed ?? secs.get(x)) * SEC,
  }));
}
