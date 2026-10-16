// Focus Check and Training Mode (run by tests/run.js): the check is short,
// drops outliers and only compares with this phone; its wording stays
// non-medical; Training is 10–20 minutes, harder and the only place for
// Occlusion; Game Day stays short; the weekly streak counts training days.

import { readFileSync } from 'node:fs';
import { test, assert } from './harness.js';
import { CHECK, checkPlan, planMs, robustMs, summarize, compare, createCheckLog } from '../js/lib/check.js';
import { WEEK_GOAL, dayKey, weekKey, streakOf, createTrainingLog } from '../js/lib/streak.js';
import { LEVEL_RANGE, TRAINING_RANGE, createLevel } from '../js/lib/adapt.js';
import { createSession } from '../js/session.js';
import { totalMinutes, sessionById, GAME_DAY_MAX_MIN } from '../js/plan.js';
import { normalize, movePreset, MOVE_PRESETS } from '../js/cone/config.js';
import { decisionsFor } from '../js/cone/decide.js';
import { drillMs } from '../js/cone/timing.js';
import { parseSettings } from '../js/settings.js';
import { focusScore } from '../js/score/scoring.js';
import { createRng } from '../js/lib/rng.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

test('Focus Check: about 30 seconds, warm-ups first, every cue seconds apart', () => {
  for (let seed = 0; seed < 200; seed++) {
    const plan = checkPlan(createRng(`check:${seed}`));
    assert(plan.warmups.length === CHECK.warmups && CHECK.warmups >= 2, 'warm-up taps first');
    assert(plan.reactions.length === CHECK.reactions && plan.gonogo.length === CHECK.gonogo, 'trial counts');
    assert(planMs(plan) <= 34000 && planMs(plan) >= 20000, `a typical check takes ${Math.round(planMs(plan) / 1000)} s`);
    assert(planMs(plan, 1000) <= 45000, `the slowest possible check takes ${Math.round(planMs(plan, 1000) / 1000)} s`);
    assert([...plan.warmups, ...plan.reactions].every((w) => w >= CHECK.foreperiodMs[0] && w <= CHECK.foreperiodMs[1]), 'random waits, so the cue can’t be timed');
    assert(plan.gonogo[0].go, 'go / no-go starts with a go');
    const gos = plan.gonogo.filter((t) => t.go).length;
    assert(gos >= 4 && gos < plan.gonogo.length, `${gos} go cues`);
    // A cue shows at most once every 0.7 s: far under 3 changes a second.
    assert(plan.gonogo.every((t) => t.gapMs >= 700) && CHECK.foreperiodMs[0] >= 700, 'cues are spaced out');
  }
});

test('Focus Check: guesses, lapses and outliers are dropped; the median is used', () => {
  assert(robustMs([250, 260, 270, 280, 290, 300]) === 275, 'median');
  assert(robustMs([250, 260, 270, 280, 290, 40]) === 270, 'a guess (under 0.1 s) is dropped');
  assert(robustMs([250, 260, 270, 280, 290, 1400, null]) === 270, 'a lapse (over 1 s) or a miss is dropped');
  assert(robustMs([250, 255, 260, 265, 270, 900]) === 260, 'a far-off tap is dropped');
  assert(robustMs([250, null, null, 1500, 30]) === null, 'too few clean taps: no time');
  const r = summarize({ reactionRts: [300, 310, 320, 330], gngRts: [400, 420], gngRight: 7, gngTotal: 8, early: 1 });
  assert(r.rtMs === 315 && r.gngRtMs === 410 && r.gngRight === 7 && r.early === 1, JSON.stringify(r));
});

test('Focus Check: today vs this phone’s last 10; "slower" only with enough history', () => {
  const hist = (ms) => ms.map((rtMs) => ({ rtMs }));
  assert(compare(300, hist([290, 300])).avgMs === null, 'two checks are too few to compare');
  const same = compare(305, hist([300, 290, 310, 300]));
  assert(same.avgMs === 300 && !same.slower && same.diffPct === 2, JSON.stringify(same));
  assert(compare(340, hist([300, 300, 300])).slower, '13% slower is noticeably slower');
  assert(!compare(320, hist([300, 300, 300])).slower, '7% isn’t');
  assert(compare(330, hist([...Array(20).fill(500), 300, 300, 300, 300, 300, 300, 300, 300, 300, 300])).avgMs === 300, 'only the last 10 count');
  assert(!compare(null, hist([300, 300, 300])).slower, 'no time today: no flag');
  const log = createCheckLog(memory());
  for (let i = 0; i < 14; i++) log.add({ rtMs: 300 + i, phase: 'check', at: i });
  assert(log.get().length === CHECK.history && log.get()[0].rtMs === 304, 'keeps the last 10');
  assert(Object.keys(log.get()[0]).every((k) => ['at', 'rtMs', 'gngRtMs', 'phase'].includes(k)), 'saves only times');
  const off = createCheckLog(blocked);
  off.add({ rtMs: 300 });
  assert(off.get().length === 1, 'storage blocked: remembered this visit');
});

test('Focus Check wording: a readiness check, never medical or diagnostic', () => {
  const ui = read('js/stages/focuscheck.js') + read('js/lib/check.js');
  const text = [...ui.matchAll(/`([^`]*)`|'([^'\n]*)'/g)].map((m) => m[1] ?? m[2]).join(' ').toLowerCase();
  for (const bad of ['diagnos', 'impair', 'concussion', 'fatigue', 'injur', 'symptom', 'brain health', 'abnormal']) {
    assert(!text.includes(bad), `the Focus Check says "${bad}"`);
  }
  assert(/not a medical test/i.test(ui), 'says it isn’t a medical test');
  assert(/on this phone/i.test(ui), 'says results are only compared on this phone');
});

test('Training: 10 / 15 / 20 minutes exactly, every pillar plus visual skills, ends on My Routine', () => {
  assert(sessionById.training.minutes.join() === '10,15,20' && sessionById.training.training, 'Training minutes');
  for (const length of ['quick', 'standard', 'full']) {
    for (const guide of ['full', 'brief']) {
      for (const state of ['flat', 'ready', 'wired']) {
        for (let seed = 0; seed < 10; seed++) {
          const s = createSession({ sessionId: 'training', settings: { length, guide }, seed, state });
          const ms = s.steps.reduce((a, x) => a + x.durationMs + x.introMs, 0);
          assert(Math.abs(ms - totalMinutes('training', length) * 60000) < 1, `training ${length}: ${ms} ms`);
          const pillars = [...new Set(s.steps.map((x) => x.pillarId))];
          assert(pillars.join() === 'regulate,activate,vision,challenge,rehearse', `pillars ${pillars}`);
          assert(s.steps.at(-1).id === 'myroutine', 'ends on My Routine');
          assert(!s.steps.some((x) => ['gaze', 'stroop', 'math', 'memory', 'mot'].includes(x.id)), 'no limited-evidence drills');
          assert(s.steps.every((x) => x.durationMs >= 15000), 'every drill gets at least 15 s');
        }
      }
    }
  }
  // Game Day stays as it was: never over 10 minutes.
  for (const length of ['quick', 'standard', 'full']) assert(totalMinutes('game', length) <= GAME_DAY_MAX_MIN, 'Game Ready over 10 minutes');
});

test('Training is harder, and the only place Occlusion can run', () => {
  assert(TRAINING_RANGE.normal[0] > LEVEL_RANGE.normal[0] && TRAINING_RANGE.normal[1] > LEVEL_RANGE.normal[1], 'a higher band');
  assert(TRAINING_RANGE.hard[0] > LEVEL_RANGE.hard[0] && TRAINING_RANGE.hard[1] <= 1, 'Hard too');
  assert(createLevel(undefined, 'normal', { training: true }).value > createLevel(undefined, 'normal').value, 'new drills start harder in Training');
  const on = { length: 'standard', occlusion: 'on' };
  const s = (sessionId, day) => createSession({ sessionId, settings: { ...on, day }, seed: 1 });
  assert(s('training', 'game').training && s('training', 'game').content.occlusion, 'the Training session');
  assert(s('vision', 'training').training && s('vision', 'training').content.occlusion, 'a part in Training mode');
  assert(!s('game', 'training').training && !s('game', 'training').content.occlusion, 'Game Ready never, even in Training mode');
  assert(!s('vision', 'game').content.occlusion && !s('myroutine', 'training').training, 'Game Day mode and My Routine: never');
  assert(!createSession({ sessionId: 'training', settings: { length: 'standard' }, seed: 1 }).content.occlusion, 'off unless turned on');
  assert(s('training', 'game').content.level('capture').value >= TRAINING_RANGE.normal[0], 'Training levels');
  assert(focusScore({ points: 0, sessionId: 'training', difficulty: 'normal' }) === focusScore({ points: 0, sessionId: 'game', difficulty: 'normal' }), 'Training earns the full finish bonus');
  assert(parseSettings({}).day === 'game' && parseSettings({ day: 'training' }).day === 'training' && parseSettings({ day: 'nap' }).day === 'game', 'mode saved');
  assert(parseSettings({}).focusCheck === 'off', 'Focus Check is optional (off by default)');
});

test('MOVE Training: more decision work, 5 × 30 s; Game Day stays short', () => {
  for (const custom of [{ cueType: 'colors', cones: 4 }, { cueType: 'arrows', directions: ['L', 'R', 'F', 'B'], cones: 4 }, { cueType: 'numbers', cones: 7 }, { mode: 'planned' }, { cueType: 'sport' }]) {
    const t = movePreset('standard', 'training', normalize(custom));
    const want = MOVE_PRESETS.training.standard;
    assert(t.mode === 'reactive' && t.decision && decisionsFor(t).length >= 2, `decisions on for ${custom.cueType ?? custom.mode}`);
    assert(t.setMode === 'timed' && t.sets === want.sets && t.timedSec === want.timedSec && t.pace === want.pace, 'preset');
    assert(drillMs(t) <= 12 * 60000 && drillMs(t) > drillMs(movePreset('speed', 'game', normalize(custom))), 'longer than Game Day, still short');
  }
});

test('Weekly streak: training days this week, and weeks in a row with at least 2', () => {
  assert(WEEK_GOAL[0] === 2 && WEEK_GOAL[1] === 4, 'goal: 2–4 days a week');
  assert(weekKey(new Date(2026, 9, 15)) === '2026-10-12' && weekKey(new Date(2026, 9, 12)) === '2026-10-12' && weekKey(new Date(2026, 9, 18)) === '2026-10-12', 'weeks start Monday');
  assert(dayKey(new Date(2026, 0, 5)) === '2026-01-05', 'day keys');
  const today = new Date(2026, 9, 15);   // a Thursday
  assert(streakOf([], today).streak === 0 && streakOf([], today).thisWeek === 0, 'nothing yet');
  const days = ['2026-09-29', '2026-10-01', '2026-10-06', '2026-10-08', '2026-10-09', '2026-10-13'];
  assert(JSON.stringify(streakOf(days, today)) === '{"thisWeek":1,"streak":2}', 'two full weeks before this one');
  assert(streakOf([...days, '2026-10-15', '2026-10-15'], today).streak === 3 && streakOf([...days, '2026-10-15'], today).thisWeek === 2, 'this week counts once it hits 2; a day counts once');
  assert(streakOf(['2026-09-22', '2026-09-23', '2026-10-06', '2026-10-07'], today).streak === 1, 'a missed week breaks it');
  let now = new Date(2026, 9, 13, 9);
  const log = createTrainingLog(memory(), { now: () => now });
  log.add();
  log.add();
  now = new Date(2026, 9, 15, 18);
  log.add();
  assert(log.get().join() === '2026-10-13,2026-10-15' && log.summary().thisWeek === 2, 'days, not sessions');
  const off = createTrainingLog(blocked, { now: () => now });
  off.add();
  assert(off.summary().thisWeek === 1, 'storage blocked: counts this visit');
});
