// One session's plan: the drill order and every content stream, all drawn
// from a single seeded generator. Pure module (no DOM), used by the app and
// by the tests.
//
//   createSession({ sessionId?, settings, seed?, recent? })
//     sessionId  'game' (Game Ready, default) or one pillar: see FOCUS_SESSIONS
//     seed    replay a session exactly (?seed=N); otherwise a fresh one
//     recent  "recently used" records from createVariety().recent(),
//             newest first; their content is skipped where possible
//     seen    drill id → times this phone has run it (Auto instructions)
//     state   'flat' | 'ready' | 'wired' from the check-in (shapes breathing and pacing)
//     routine the athlete's My Routine (js/myroutine.js)
//     levels  drill id → last adaptive level on this phone (js/lib/adapt.js)
// Training: the Training session, or any part run in Training mode (settings.day):
// harder levels, and Occlusion if the athlete turned it on. Never Game Ready.
//
// session.levels() gives each drill's level at the end, to save for next time.
// session.record() lists what this session actually used, for the variety list.

import { createRng, deck } from './lib/rng.js';
import { planSteps, guideChooser, PACING, STATES } from './plan.js';
import { DEFAULT_ROUTINE, cleanRoutine, routineSeconds } from './myroutine.js';
import { colorCallStream, goNoGoStream, stroopStream, peripheralStream, memoryStream, gaps } from './content/reaction.js';
import { mathStream } from './content/math.js';
import { pursuitPlan, saccadeStream, gazeStream, quietEyeStream } from './content/eyes.js';
import { breathingText } from './content/breathing.js';
import { scriptsFor } from './content/scripts.js';
import { CUE_WORDS, CUE_SUGGESTIONS } from './content/cues.js';
import { SKILL_WORDS, cleanSport } from './content/sports.js';
import { nearFarStream, captureStream, spanStream, motField, createOcclusion } from './content/vision.js';
import { createLevel } from './lib/adapt.js';

const setsOf = (recent, field) => recent.map((r) => new Set(r?.[field] ?? []));

export function createSession({ sessionId = 'game', settings, seed, recent = [], seen = {}, state = 'ready', routine = DEFAULT_ROUTINE, levels = {} }) {
  const rng = createRng(seed);
  const last = recent[0]?.order ?? {};
  const mood = STATES.includes(state) ? state : 'ready';
  const myRoutine = cleanRoutine(routine);
  const { sport, position } = cleanSport(settings.sport, settings.position);

  const steps = planSteps(sessionId, settings, rng.fork('order'), {
    avoid: { regulate: last.regulate, activate: last.activate, vision: last.vision, challenge: last.challenge, extras: last.extras },
    guideFor: guideChooser(settings.guide, seen),
    state: mood,
    routineS: routineSeconds(myRoutine),
  });

  // Visualization scripts for this athlete's sport and position.
  const scripts = deck(rng.fork('scripts'), scriptsFor(sport, position), { key: (s) => s.id, recent: setsOf(recent, 'scripts') });
  // Cue words: motivational ones rotate across sessions; skill ones match the sport.
  const cueDeck = deck(rng.fork('cues'), CUE_WORDS, { recent: setsOf(recent, 'cues') });
  const cueSuggestions = Array.from({ length: CUE_SUGGESTIONS }, () => cueDeck.next());
  const cueSkill = rng.fork('skill').shuffle(SKILL_WORDS[sport]).slice(0, CUE_SUGGESTIONS);

  const mathUsed = [];
  const math = mathStream(rng.fork('math'), { recent: setsOf(recent, 'math') });

  let script = null;
  const gapStreams = {};
  const levelOf = {};
  const motRng = rng.fork('mot');
  const training = sessionId === 'training' || (settings.day === 'training' && sessionId !== 'game' && sessionId !== 'myroutine');
  // Occlusion: Training only (opt-in). Never on Game Day.
  const occlusion = settings.occlusion === 'on' && training;

  const content = {
    colorCall: colorCallStream(rng.fork('colorcall')),
    goNoGo: goNoGoStream(rng.fork('gonogo')),
    stroop: stroopStream(rng.fork('stroop')),
    peripheral: peripheralStream(rng.fork('peripheral')),
    memory: memoryStream(rng.fork('memory')),
    math: (opts) => { const p = math(opts); mathUsed.push(p.text); return p; },
    pursuit: pursuitPlan(rng.fork('pursuit')),
    saccades: saccadeStream(rng.fork('saccades')),
    gaze: gazeStream(rng.fork('gaze')),
    quietEye: quietEyeStream(rng.fork('quieteye')),
    // One visualization script per session, picked on first use.
    script: () => (script ??= scripts.next()),
    breathing: breathingText(rng.fork('breathing')),
    cueSuggestions,
    cueSkill,
    routine: myRoutine,
    // Each drill gets its own gap stream so drill order doesn't change timing.
    gaps: (drillId) => (gapStreams[drillId] ??= gaps(rng.fork(`gaps:${drillId}`))),
    nearFar: nearFarStream(rng.fork('nearfar')),
    capture: captureStream(rng.fork('capture')),
    span: spanStream(rng.fork('span')),
    mot: (opts) => motField(motRng, opts),
    // Adaptive difficulty: one staircase per drill, starting where this phone left off.
    level: (drillId) => (levelOf[drillId] ??= createLevel(levels[drillId], settings.difficulty, { training })),
    lowContrast: settings.contrast === 'low',
    occlusion: occlusion ? (drillId) => createOcclusion(rng.fork(`occlusion:${drillId}`)) : null,
  };

  const orderOf = (pillarId) => steps.filter((s) => s.pillarId === pillarId).map((s) => s.id);

  return {
    id: sessionId,
    training,
    state: mood,
    pacing: PACING[mood],
    seed: rng.seed,
    steps,
    content,
    levels: () => Object.fromEntries(Object.entries(levelOf).map(([id, l]) => [id, l.value])),
    record: () => ({
      scripts: script ? [script.id] : [],
      math: mathUsed.slice(),
      cues: cueSuggestions.slice(),
      order: {
        regulate: orderOf('regulate').filter((id) => id !== 'lockin'),
        activate: orderOf('activate'), vision: orderOf('vision'), challenge: orderOf('challenge'), extras: orderOf('extras'),
      },
    }),
  };
}
