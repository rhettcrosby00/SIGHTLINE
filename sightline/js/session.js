// One session's plan: the drill order and every content stream, all drawn
// from a single seeded generator. Pure module (no DOM), used by the app and
// by the tests.
//
//   createSession({ settings, seed?, recent? })
//     seed    replay a session exactly (?seed=N); otherwise a fresh one
//     recent  "recently used" records from createVariety().recent(),
//             newest first; their content is skipped where possible
//
// session.record() lists what this session actually used, for the variety list.

import { createRng, deck } from './lib/rng.js';
import { questionStream } from './content/questions.js';
import { planSteps } from './plan.js';
import { colorCallStream, goNoGoStream, stroopStream, peripheralStream, gaps } from './content/reaction.js';
import { mathStream } from './content/math.js';
import { pursuitPlan, saccadeStream, gazeStream } from './content/eyes.js';
import { breathingText } from './content/breathing.js';
import { SCRIPTS } from './content/scripts.js';
import { CUE_WORDS, CUE_SUGGESTIONS } from './content/cues.js';

const setsOf = (recent, field) => recent.map((r) => new Set(r?.[field] ?? []));

export function createSession({ settings, seed, recent = [] }) {
  const rng = createRng(seed);
  const cone = settings.mode === 'cones';

  const steps = planSteps(settings, rng.fork('order'), {
    avoid: { activate: recent[0]?.order?.activate, challenge: recent[0]?.order?.challenge },
  });

  const questions = questionStream(rng.fork('questions'), { recent: setsOf(recent, 'questions') });
  const scripts = deck(rng.fork('scripts'), SCRIPTS, { key: (s) => s.id, recent: setsOf(recent, 'scripts') });
  const cueDeck = deck(rng.fork('cues'), CUE_WORDS, { recent: setsOf(recent, 'cues') });
  const cueSuggestions = Array.from({ length: CUE_SUGGESTIONS }, () => cueDeck.next());

  const mathUsed = [];
  const math = mathStream(rng.fork('math'), { recent: setsOf(recent, 'math') });

  let script = null;
  const gapStreams = {};

  const content = {
    colorCall: colorCallStream(rng.fork('colorcall'), { cone }),
    goNoGo: goNoGoStream(rng.fork('gonogo')),
    stroop: stroopStream(rng.fork('stroop')),
    peripheral: peripheralStream(rng.fork('peripheral')),
    math: (opts) => { const p = math(opts); mathUsed.push(p.text); return p; },
    questions: () => questions.next(),
    pursuit: pursuitPlan(rng.fork('pursuit')),
    saccades: saccadeStream(rng.fork('saccades')),
    gaze: gazeStream(rng.fork('gaze')),
    // One visualization script per session, picked on first use.
    script: () => (script ??= scripts.next()),
    breathing: breathingText(rng.fork('breathing')),
    cueSuggestions,
    // Each drill gets its own gap stream so drill order doesn't change timing.
    gaps: (drillId) => (gapStreams[drillId] ??= gaps(rng.fork(`gaps:${drillId}`))),
  };

  const orderOf = (pillarId) => steps.filter((s) => s.pillarId === pillarId).map((s) => s.id);

  return {
    seed: rng.seed,
    steps,
    content,
    record: () => ({
      questions: questions.used(),
      scripts: script ? [script.id] : [],
      math: mathUsed.slice(),
      cues: cueSuggestions.slice(),
      order: { activate: orderOf('activate'), challenge: orderOf('challenge') },
    }),
  };
}
