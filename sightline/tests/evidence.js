// Evidence cleanup (run by tests/run.js): Game Ready keeps only the drills
// with moderate or strong evidence, Auto instructions get shorter as drills
// get familiar, every session ends on success, and the About screen is honest
// and cites its sources.

import { readFileSync } from 'node:fs';
import { test, assert } from './harness.js';
import { PILLARS, FOCUS_SESSIONS, AUTO_FULL_TIMES, guideChooser, introSeconds } from '../js/plan.js';
import { createSession } from '../js/session.js';
import { finishing } from '../js/stages/reaction.js';
import { createSeen } from '../js/lib/seen.js';
import { parseSettings } from '../js/settings.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const LIMITED = ['gaze', 'stroop', 'math', 'memory', 'mot'];
// Drills nobody can fail (no right or wrong answer)…
const UNFAILABLE = ['settle', 'sigh', 'resonance', 'breath478', 'energize', 'lockin', 'pursuit', 'saccades', 'gaze', 'visualize', 'myroutine'];
// …and scored drills that finish on easy cues (js/stages/reaction.js, memory.js).
const EASY_FINISH = ['colorcall', 'gonogo', 'peripheral', 'quieteye', 'nearfar', 'capture', 'span', 'stroop', 'math', 'memory', 'mot'];

test('Game Ready has no limited-evidence drills; Extras holds exactly those', () => {
  const extras = PILLARS.find((p) => p.id === 'extras').drills.map((d) => d.id).sort();
  assert(extras.join() === LIMITED.slice().sort().join(), `Extras: ${extras}`);
  for (let seed = 0; seed < 300; seed++) {
    for (const length of ['quick', 'standard', 'full']) {
      const s = createSession({ sessionId: 'game', settings: { length, difficulty: 'normal' }, seed });
      const bad = s.steps.filter((x) => LIMITED.includes(x.id));
      assert(!bad.length, `Game Ready includes ${bad.map((x) => x.id)}`);
    }
  }
  assert(FOCUS_SESSIONS.find((s) => s.id === 'extras').extra, 'Extras should be marked optional');
});

test('Auto instructions: the full how-to for the first 3 runs, then just the rule', () => {
  const auto = guideChooser('auto', { colorcall: AUTO_FULL_TIMES - 1, gonogo: AUTO_FULL_TIMES });
  assert(auto('colorcall') === 'full' && auto('gonogo') === 'brief' && auto('stroop') === 'full', 'auto');
  assert(guideChooser('full', { colorcall: 99 })('colorcall') === 'full', 'Full stays full');
  assert(guideChooser('brief', {})('colorcall') === 'brief', 'Brief stays brief');
  assert(introSeconds('colorcall', 'brief') < introSeconds('colorcall', 'full'), 'brief instructions are shorter');
  assert(introSeconds('settle', 'full') === 0, 'breathing has no how-to card');
  // Brief instructions give the time back to the drills; the session length doesn't change.
  const fresh = createSession({ sessionId: 'game', settings: { length: 'standard', guide: 'auto' }, seed: 1 });
  const known = createSession({ sessionId: 'game', settings: { length: 'standard', guide: 'auto' }, seed: 1,
    seen: Object.fromEntries(PILLARS.flatMap((p) => p.drills.map((d) => [d.id, 9]))) });
  const drill = (s) => s.steps.find((x) => x.id === 'colorcall').durationMs;
  assert(drill(known) > drill(fresh), 'familiar drills should get more drill time');
});

test('Drills-seen counts work, and the app works with storage blocked', () => {
  const m = new Map();
  const seen = createSeen({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) });
  seen.add(['colorcall', 'gonogo']);
  seen.add(['colorcall']);
  assert(seen.get().colorcall === 2 && seen.get().gonogo === 1, 'counts');
  const blocked = createSeen({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  blocked.add(['colorcall']);
  assert(JSON.stringify(blocked.get()) === '{}', 'blocked storage should read as empty');
  assert(JSON.stringify(createSeen(null).get()) === '{}', 'no storage at all');
});

test('Every session ends on success: an unfailable last step, or easy last cues', () => {
  for (const d of PILLARS.flatMap((p) => p.drills)) {
    assert(UNFAILABLE.includes(d.id) || EASY_FINISH.includes(d.id), `${d.id} has no easy finish`);
  }
  for (const { id } of FOCUS_SESSIONS) {
    for (let seed = 0; seed < 50; seed++) {
      const s = createSession({ sessionId: id, settings: { length: 'standard' }, seed });
      const lastId = s.steps.at(-1).id;
      if (id === 'game' || id === 'rehearse' || id === 'myroutine') assert(lastId === 'myroutine', `${id} ends on ${lastId}`);
      else if (id === 'regulate') assert(lastId === 'lockin', `${id} ends on ${lastId}`);
      else assert(UNFAILABLE.includes(lastId) || EASY_FINISH.includes(lastId), `${id} ends on ${lastId}`);
    }
  }
  // A scored drill's loop: the last few cues before time runs out are the easy ones.
  for (const [windowMs, hard] of [[1400, false], [1000, true], [3000, false], [7000, false]]) {
    let left = 45000;
    const kinds = [];
    while (true) {
      const easy = finishing(left, windowMs, hard);
      const used = 1200 * (hard ? 0.75 : 1) + windowMs * (easy ? 1.6 : 1) + 450;
      if (left < used) break;
      kinds.push(easy);
      left -= used;
    }
    assert(kinds.at(-1) === true, `window ${windowMs}: the last cue isn't easy`);
    assert(kinds.filter(Boolean).length >= 2, `window ${windowMs}: fewer than 2 easy cues at the end`);
    assert(kinds.slice(0, kinds.indexOf(true)).every((k) => !k), 'easy cues should only be at the end');
  }
});

test('About explains each part, states honest limits, and cites every source', () => {
  const about = html.slice(html.indexOf('id="screen-about"'), html.indexOf('id="screen-check"'));
  for (const url of [
    'link.springer.com/article/10.1007/s44402-026-00147-8', 'mdpi.com/2076-328X/14/10/919', 'PMC12665768',
    'mental-fatigue-and-sport-specific-psychomotor-performance', 'effects-of-voluntary-slow-breathing',
    'brief-structured-respiration-practices', 'Record/4088526', 'Record/4045573', 'Record/4075347',
    'self-talk-interventions-and-sportmotor-performance', 'effects-of-music-in-exercise-and-sport',
    'vision-sensory-and-motor-testing', 'no-transfer-of-3d-multiple-object-tracking', 'PMC12156952',
  ]) assert(about.includes(url), `missing source ${url}`);
  for (const part of ['Regulate', 'Activate', 'Challenge', 'Rehearse', 'What the research says']) assert(about.includes(part), `missing ${part}`);
  assert(/isn't a vision, concussion or medical assessment/.test(about), 'missing the honest-limits line');
  assert(/eye care professional or your athletic trainer/.test(about), 'missing who to see');
  const claims = /improves? (your )?(game|performance)|boosts? performance|diagnoses|treats|cures|prevents concussion|guaranteed/i;
  assert(!claims.test(about.replace(/<a [^>]*>[^<]*<\/a>/g, '')), `About makes a claim: ${about.match(claims)?.[0]}`);
});

test('Instructions setting: Auto is the default, and phones on the old default move to Auto', () => {
  assert(parseSettings({}).guide === 'auto', 'default');
  assert(parseSettings({ guide: 'full' }).guide === 'auto', 'old default Full should become Auto');
  assert(parseSettings({ guide: 'full', guideV: 2 }).guide === 'full', 'a Full picked after the update stays');
  assert(parseSettings({ guide: 'brief' }).guide === 'brief', 'Brief stays');
});
