// Readiness, breathing and My Routine (run by tests/run.js): the check-in
// reshapes the routine, the breathing pacer doesn't drift, My Routine saves on
// the phone (and works with storage blocked), scripts are first person with a
// recovery moment, and music mode never starts app audio.

import { test, assert } from './harness.js';
import { planSteps, STATES, PACING, totalMinutes, GAME_DAY_MAX_MIN } from '../js/plan.js';
import { createSession } from '../js/session.js';
import { createRng } from '../js/lib/rng.js';
import { runPhases, oneBreath, breathMs } from '../js/stages/breathe.js';
import {
  DEFAULT_ROUTINE, ROUTINE_BREATHS, QUIET_EYE_S, ROUTINE_RANGE_S, cleanRoutine, routineSeconds, createRoutineStore,
} from '../js/myroutine.js';
import { ALL_SCRIPTS, scriptsFor } from '../js/content/scripts.js';
import { SPORTS, cleanSport } from '../js/content/sports.js';
import { STATE_LABELS } from '../js/stages/readiness.js';
import { setMusicMode, unlock, soundEnabled, isMusicMode } from '../js/lib/audio.js';

const LENGTHS = ['quick', 'standard', 'full'];
const ids = (steps, pillar) => steps.filter((s) => !pillar || s.pillarId === pillar).map((s) => s.id);

test('Check-in: Wired gets 2–3 cyclic sighs, then 60–90 s of slow breathing, and calmer pacing', () => {
  for (const [i, length] of LENGTHS.entries()) {
    for (let seed = 0; seed < 50; seed++) {
      const steps = planSteps('game', { length }, createRng(seed), { state: 'wired' });
      assert(ids(steps, 'regulate').join() === 'sigh,resonance', `wired regulate: ${ids(steps, 'regulate')}`);
      const sigh = steps.find((s) => s.id === 'sigh').durationMs / 1000;
      const slow = steps.find((s) => s.id === 'resonance').durationMs / 1000;
      const sighs = Math.floor((sigh - 6) / 10);
      assert(sighs >= 2 && sighs <= 3, `${length}: ${sighs} sighs`);
      assert(slow >= 60 && slow <= 90, `${length}: ${slow} s of slow breathing`);
      assert(i === 0 || slow >= 75, 'longer calming on longer sessions');
    }
  }
  assert(PACING.wired.window > 1 && PACING.wired.gap > 1, 'wired pacing should be calmer');
  assert(createSession({ settings: { length: 'standard' }, seed: 1, state: 'wired' }).pacing === PACING.wired, 'session pacing');
});

test('Check-in: Flat gets a short calm, then energizing breaths, and quicker pacing', () => {
  for (const length of LENGTHS) {
    const steps = planSteps('game', { length }, createRng(4), { state: 'flat' });
    assert(ids(steps, 'regulate').join() === 'sigh,energize', `flat regulate: ${ids(steps, 'regulate')}`);
    assert(steps[0].durationMs <= 30000, 'the calm part should be short');
  }
  assert(PACING.flat.window < 1 && PACING.flat.gap < 1, 'flat pacing should be quicker');
  const regulate = planSteps('regulate', { length: 'standard' }, createRng(1), { state: 'flat' });
  assert(ids(regulate).at(-1) === 'energize', 'Breathing only on a flat day ends energized');
});

test('Check-in: Ready is the standard routine (one rotating pattern, standard pacing)', () => {
  const seen = new Set();
  for (let seed = 0; seed < 200; seed++) {
    const steps = planSteps('game', { length: 'standard' }, createRng(seed), { state: 'ready' });
    const reg = ids(steps, 'regulate');
    assert(reg.length === 1 && !['energize', 'lockin'].includes(reg[0]), `ready regulate: ${reg}`);
    seen.add(reg[0]);
  }
  assert(seen.size === 3, `patterns: ${[...seen]}`);
  assert(PACING.ready.window === 1 && PACING.ready.gap === 1, 'standard pacing');
  assert(Object.keys(STATE_LABELS).join() === STATES.join(), 'check-in buttons match the states');
});

test('Every check-in state keeps Game Ready within its minutes and ends on My Routine', () => {
  for (const state of STATES) {
    for (const length of LENGTHS) {
      for (const guide of ['full', 'brief']) {
        for (const routine of [DEFAULT_ROUTINE, { breath: 'box', imagery: 'See the ball go in.', quietEyeS: 3 }, { breath: 'energize', imagery: '', quietEyeS: 2 }]) {
          const s = createSession({ settings: { length, guide }, seed: 9, state, routine });
          const ms = s.steps.reduce((a, x) => a + x.durationMs + x.introMs, 0);
          assert(Math.abs(ms - totalMinutes('game', length) * 60000) < 1, `${state} ${length}: ${ms} ms`);
          assert(ms <= GAME_DAY_MAX_MIN * 60000, 'over 10 minutes');
          assert(s.steps.at(-1).id === 'myroutine' && s.steps.at(-1).durationMs === routineSeconds(cleanRoutine(routine)) * 1000, 'My Routine at the end, at its length');
          assert(s.steps.every((x) => x.durationMs >= 10000), `${state} ${length}: a drill under 10 s`);
        }
      }
    }
  }
});

test('Breathing timers stay accurate over 5 minutes (no drift)', async () => {
  // A clock whose timers always fire late, like a busy phone.
  const rng = createRng('drift');
  let t = 0;
  const now = () => t;
  const sleep = async (ms) => { t += ms + 5 + rng.next() * 40; };
  const phases = [];
  while (phases.reduce((a, p) => a + p.ms, 0) < 300000) phases.push(...oneBreath('box'), ...oneBreath('resonance'), ...oneBreath('sigh'));
  const planned = phases.reduce((a, p) => a + p.ms, 0);
  const starts = [];
  await runPhases(phases, { now, sleep, onPhase: (_, start) => starts.push(start) });
  assert(t - planned < 100, `drifted ${Math.round(t - planned)} ms over ${Math.round(planned / 1000)} s`);
  // Each phase starts at its planned time, not after the last one's delay.
  let at = 0;
  phases.forEach((p, i) => { assert(starts[i] === at, `phase ${i} started at ${starts[i]}, planned ${at}`); at += p.ms; });
  // The old way (sleep each phase in turn) would have drifted by seconds.
  let naive = 0;
  for (const p of phases) naive += p.ms + 25;
  assert(naive - planned > 1000, 'sanity check: delays do add up without the fix');
});

test('My Routine: 20–40 s, saves on this phone, and works with storage blocked', () => {
  for (const [breath] of ROUTINE_BREATHS) {
    for (const quietEyeS of QUIET_EYE_S) {
      for (const imagery of ['', 'See the first play.']) {
        const sec = routineSeconds(cleanRoutine({ breath, quietEyeS, imagery }));
        assert(sec >= ROUTINE_RANGE_S[0] && sec <= ROUTINE_RANGE_S[1], `${breath}/${quietEyeS}/${imagery ? 'imagery' : '-'}: ${sec} s`);
      }
    }
  }
  const m = new Map();
  const store = createRoutineStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) });
  store.set({ breath: 'box', imagery: '  See   my first touch. ', quietEyeS: 2 });
  const again = createRoutineStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }).get();
  assert(again.breath === 'box' && again.quietEyeS === 2 && again.imagery === 'See my first touch.', `saved: ${JSON.stringify(again)}`);
  const blocked = createRoutineStore({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  assert(JSON.stringify(blocked.get()) === JSON.stringify(DEFAULT_ROUTINE), 'blocked storage: default routine');
  blocked.set({ breath: 'resonance' });
  assert(blocked.get().breath === 'resonance', 'blocked storage: remembered for this visit');
  assert(JSON.stringify(createRoutineStore(null).get()) === JSON.stringify(DEFAULT_ROUTINE), 'no storage at all');
  const bad = cleanRoutine({ breath: 'hyper', quietEyeS: 9, imagery: '<b>x</b>'.repeat(20) });
  assert(bad.breath === 'sigh' && bad.quietEyeS === 3 && !bad.imagery.includes('<') && bad.imagery.length <= 48, 'bad saved data is cleaned');
  assert(Math.abs(breathMs('resonance') - 10000) < 1, 'one slow breath: 4 in, 6 out');
});

test('Visualization scripts: first person, a recovery moment, every sport and position covered', () => {
  for (const [sport, list] of Object.entries(ALL_SCRIPTS)) {
    for (const s of list) {
      assert(s.lines.some(([, , tag]) => tag === 'recover'), `${s.id}: no recovery moment`);
      // Short fragments ("Short memory. Big heart.") are fine; the script as a
      // whole is told as "I", and never as "you".
      const texts = s.lines.slice(1).flatMap(([t]) => (typeof t === 'string' ? [t] : Object.values(t)));
      const mine = texts.filter((t) => /\b(I|I’m|I'm|my|My|me)\b/.test(t)).length;
      assert(mine >= texts.length * 0.6, `${s.id}: only ${mine} of ${texts.length} lines are first person`);
      for (const t of texts) {
        assert(!/\b(you|your)\b/i.test(t), `${s.id}: second person: "${t}"`);
        assert(t.length <= 110, `${s.id}: line too long`);
      }
      for (const [t] of s.lines) {
        if (typeof t !== 'string') {
          assert(t.default, `${s.id}: position line needs a default`);
          for (const [pos] of SPORTS.find((x) => x.id === sport).positions) assert(t[pos], `${s.id}: no line for ${pos}`);
        }
      }
    }
  }
  for (const sp of SPORTS) {
    for (const pos of ['', ...sp.positions.map(([p]) => p)]) {
      const list = scriptsFor(sp.id, pos);
      assert(list.length >= 2 && list.every((s) => s.lines.every(([t]) => typeof t === 'string' && t.length)), `${sp.id}/${pos}: unresolved lines`);
    }
  }
  assert(cleanSport('rugby', 'prop').sport === 'general' && cleanSport('soccer', 'guard').position === '', 'unknown sport or position falls back');
  const keeper = createSession({ settings: { length: 'standard', sport: 'soccer', position: 'keeper' }, seed: 3 });
  assert(keeper.content.script().id.startsWith('soc-'), 'soccer athletes get soccer scripts');
  assert(keeper.content.cueSkill.length >= 4 && keeper.content.cueSkill.every((w) => w.length <= 14), 'skill cue words');
});

test('Keep my music playing: the app never starts its own audio', () => {
  setMusicMode(true);
  unlock(true, { voice: true });
  assert(isMusicMode() && !soundEnabled(), 'music mode should keep the app silent');
  setMusicMode(false);
  unlock(true);
  assert(soundEnabled(), 'sound comes back when music mode is off');
  unlock(false);
  assert(!soundEnabled(), 'Sound off');
});
