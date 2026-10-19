// Foolproof and seamless (v4.0), run by tests/run.js: two choices on home,
// three presets per side that start in two taps, one readiness tap, taps that
// can't count twice or before a cue, MOVE's countdown and touch lock, the
// pause and screen-awake backups, sound unlocked inside the Start tap,
// parked Partner mode, two leaderboard tabs per side, no trivia,
// and cues big enough to read from far away.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { test, assert } from './harness.js';
import { PRESETS, presetById, DAYS, focusPreset, runKey, parseRunKey, runTitle } from '../js/presets.js';
import { totalMinutes, GAME_DAY_MAX_MIN, PILLARS } from '../js/plan.js';
import { normalize, movePreset, countdownMs, GET_SET_S, COUNTDOWN_MS, PRESET_CUES } from '../js/cone/config.js';
import { drillMs } from '../js/cone/timing.js';
import { planDrill } from '../js/cone/plan.js';
import { numberYards, NUMBER_SIZE } from '../js/cone/render.js';
import { parseSettings, DEFAULTS } from '../js/settings.js';
import { tapGuard, TAP_GUARD } from '../js/stages/common.js';
import { HOLD_TO_PAUSE_MS, PAUSE_WHY, AWAKE_TIP } from '../js/engine.js';
import { FEATURES } from '../js/features.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const walk = (dir) => readdirSync(new URL(`${dir}/`, root), { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
// The code of one function, from its name to the first line that closes it.
const body = (src, start) => src.slice(src.indexOf(start), src.indexOf('\n  }\n', src.indexOf(start)));

test('FOCUS presets: Quick, Standard, Game Speed for Game Day and Training', () => {
  assert(PRESETS.map((p) => p.title).join() === 'Quick,Standard,Game Speed', 'three presets');
  const want = { game: [5, 8, 8], training: [10, 15, 15] };
  for (const day of DAYS) {
    PRESETS.forEach((p, i) => {
      const f = focusPreset(p.id, day);
      assert(f.sessionId === (day === 'game' ? 'game' : 'training'), `${day} ${p.id}: session`);
      assert(totalMinutes(f.sessionId, f.length) === want[day][i], `${day} ${p.id}: ${totalMinutes(f.sessionId, f.length)} min`);
      assert(f.difficulty === (p.id === 'speed' ? 'hard' : 'normal'), `${day} ${p.id}: difficulty`);
      if (day === 'game') assert(totalMinutes(f.sessionId, f.length) <= GAME_DAY_MAX_MIN, 'Game Day stays short');
    });
  }
});

test('"Run last" keys: a preset remembers its day; anything else is its own id', () => {
  for (const day of DAYS) for (const p of PRESETS) assert(JSON.stringify(parseRunKey(runKey(day, p.id))) === JSON.stringify({ day, id: p.id }), 'round trip');
  assert(runKey('nap', 'quick') === 'game:quick', 'unknown days are Game Day');
  for (const bad of ['activate', 'custom', 'game', 'game:', 'game:fast', ':quick', null, undefined]) assert(parseRunKey(bad) === null, `${bad} isn’t a preset`);
  assert(runTitle('game:speed') === 'Game Speed' && runTitle('training:quick') === 'Quick · Training' && runTitle('custom') === null, 'titles');
  assert(presetById.speed.title === 'Game Speed', 'presets by id');
});

test('Two taps to start any preset: the side, then the preset (no screen in between)', () => {
  const focus = read('js/focus.js');
  const move = read('js/cone/ui.js');
  // FOCUS: a preset button starts the session straight away, with the readiness tap already on the screen.
  assert(/b\.dataset\.preset\) \{[\s\S]{0,300}start\(p\.sessionId/.test(focus), 'a FOCUS preset calls start()');
  assert(!/askBefore|askAfter/.test(focus), 'no check-in screen between the preset and the session');
  // MOVE: a preset button runs straight into the countdown; presets are always valid, so they never detour to a setup screen.
  assert(/b\.dataset\.run\) run\(b\.dataset\.run\)/.test(move), 'a MOVE preset calls run()');
  assert(/validate\(setup\)\.ok \? go\(\)/.test(move), 'run() goes straight to the drill');
  for (const day of DAYS) for (const p of PRESETS) assert(planDrill(movePreset(p.id, day), 1).sets.length > 0, 'every MOVE preset can run');
  // One tap from home for Run last.
  const main = read('js/main.js');
  assert(/btn-focus-last'\)\.addEventListener\('click', \(\) => focus\.runLast/.test(main) && /btn-move-last'\)\.addEventListener\('click', \(\) => move\.run\(/.test(main), 'Run last starts in one tap');
});

test('Readiness: one tap (Flat / Ready / Wired) on the FOCUS screen; Focus Check in Training mode only', () => {
  const focus = read('js/focus.js');
  assert(/feelSeg\(feel\)/.test(focus) && /let feel = 'ready'/.test(focus), 'the readiness row sits on the FOCUS screen, Ready unless changed');
  assert(/const bookend = meta\.training && settings\.focusCheck === 'on'/.test(focus), 'Focus Check bookends Training only');
  assert(/day === 'training' \? `[\s\S]{0,200}data-nav="check"/.test(focus), 'the Focus Check row shows in Training mode only');
});

test('Taps: a double tap can’t count twice, and a tap in the first 150 ms after a cue is ignored', () => {
  assert(TAP_GUARD.debounceMs === 100 && TAP_GUARD.cueLockMs === 150, 'the numbers');
  let t = 0;
  const g = tapGuard(() => t);
  g.cue();
  t = 120; assert(!g.ok(), 'a tap 120 ms after the cue is a guess');
  t = 260; assert(g.ok(), 'a real reaction counts');
  t = 320; assert(!g.ok(), 'the second tap of a double tap is ignored');
  t = 450; assert(g.ok(), 'the next deliberate tap counts');
  g.cue(); t = 500; assert(!g.ok(), 'the guard resets with every cue');
  // Every FOCUS drill that takes taps uses it.
  for (const f of ['common', 'reaction', 'memory', 'quieteye', 'vision', 'tracking']) {
    const src = read(`js/stages/${f}.js`);
    if (/addEventListener\('pointerdown'/.test(src)) assert(/guard\.ok\(\)/.test(src) && /guard\.cue\(\)/.test(src), `${f}.js taps aren’t guarded`);
  }
});

test('MOVE countdown: 5–10 s before the first set (spoken), 3 s before the others; Settings has it', () => {
  assert(GET_SET_S[0] === 5 && GET_SET_S[1] === 10, 'range');
  assert(normalize({}).getSetS === 7 && normalize({ getSetS: 3 }).getSetS === 5 && normalize({ getSetS: 14 }).getSetS === 10 && normalize({ getSetS: 'x' }).getSetS === 7, 'clamped');
  const s = normalize({ ...movePreset('standard', 'game'), getSetS: 10 });   // the app adds Settings → Countdown at run time
  assert(countdownMs(s, 0) === 10000 && countdownMs(s, 1) === COUNTDOWN_MS, 'first set gets the long one');
  assert(drillMs(normalize({ ...s, getSetS: 10 })) - drillMs(normalize({ ...s, getSetS: 5 })) === 5000, 'the countdown is part of the time shown');
  const plan = planDrill(normalize({ ...s, getSetS: 9 }), 1);
  assert(Math.abs(plan.totalMs - drillMs(normalize({ ...s, getSetS: 9 }))) < plan.totalMs * 0.25, 'planned time includes it');
  assert(DEFAULTS.getSet === '7' && parseSettings({ getSet: '10' }).getSet === '10' && parseSettings({ getSet: '12' }).getSet === '7', 'Settings → Countdown');
  const run = read('js/cone/run.js');
  assert(/say\(String\(n\)\)/.test(run) && /Brightness all the way up/.test(run), 'numbers are spoken; the first countdown reminds about brightness');
  assert(/brightness all the way up/i.test(read('js/cone/ui.js')), 'the MOVE screen says it too');
});

test('MOVE touch lock: taps do nothing during a drill; a 1 s hold pauses; Resume counts back in', () => {
  assert(HOLD_TO_PAUSE_MS === 1000, '1 second');
  const ui = read('js/cone/ui.js');
  assert(/lock: true, resumeLeadS: RESUME_LEAD_S/.test(ui), 'MOVE runs locked, with a count back in');
  const css = read('css/styles.css');
  assert(/\.is-locked \.hud__pause \{ display: none; \}/.test(css) && /touch-action: none/.test(css), 'no pause button to bump; no scrolling');
  assert(/starts on its own/.test(read('js/cone/run.js')), 'rest between sets never waits for a tap');
});

test('Auto-pause with a big Resume: screen lock, app switch, a call or alarm, something over the app', () => {
  const engine = read('js/engine.js');
  for (const ev of ["'visibilitychange'", "'pagehide'", "'freeze'", "'blur'"]) assert(engine.includes(ev), `no ${ev} pause`);
  assert(/onInterrupt\(\(\) => pause\('sound'\)\)/.test(engine), 'a call taking the sound pauses');
  assert(PAUSE_WHY.hidden && PAUSE_WHY.sound && PAUSE_WHY.covered, 'the pause says why');
  assert(/statechange[\s\S]{0,120}'interrupted'/.test(read('js/lib/audio.js')), 'iPhone’s interrupted sound is noticed');
  assert(/\.pause__resume \{ min-height: 96px/.test(read('css/styles.css')), 'Resume is big');
});

test('Screen awake: a failure shows a Low Power Mode tip instead of failing silently', () => {
  assert(/Low Power Mode/.test(AWAKE_TIP) && /Auto-Lock/.test(AWAKE_TIP), AWAKE_TIP);
  const wake = read('js/lib/wakelock.js');
  assert(/problem\('unsupported'\)/.test(wake) && /problem\('refused'\)/.test(wake) && /problem\('released'\)/.test(wake), 'every way it can fail is reported');
  assert(/keepAwake\(\{ onProblem: awakeProblem \}\)/.test(read('js/engine.js')), 'the session listens');
});

test('Sound: unlocked inside the Start tap, plays through the silent switch, every buzz has a backup', () => {
  // Nothing awaits before the unlock, or iPhone would block the sound.
  const start = body(read('js/focus.js'), 'async function start(');
  assert(start.indexOf('unlockAudio(') > -1 && start.indexOf('unlockAudio(') < start.indexOf('await'), 'FOCUS unlocks first');
  const play = body(read('js/cone/ui.js'), 'async function play(');
  assert(play.indexOf('unlockAudio(') > -1 && play.indexOf('unlockAudio(') < play.indexOf('await') && /voice: true/.test(play), 'MOVE unlocks first, voice included');
  assert(/audioSession\.type = type/.test(read('js/lib/audio.js')) && /audioSession\(enabled \? 'playback' : 'ambient'\)/.test(read('js/lib/audio.js')), 'silent switch');
  // iPhone can't vibrate: every buzz comes with a tone, a cue sound, or a change on screen.
  for (const f of walk('js').filter((x) => x !== 'js/lib/audio.js')) {
    const lines = read(f).split('\n');
    lines.forEach((l, i) => {
      if (!/\bbuzz\(/.test(l)) return;
      const near = lines.slice(Math.max(0, i - 3), i + 4).join('\n');
      assert(/tone\(|cues\.\w+\(|on screen|appears/.test(near), `${f}:${i + 1} buzzes with no sound or visual backup`);
    });
  }
  for (const l of read('js/lib/audio.js').split('\n').filter((x) => /^\s+\w+:\s+\(\) => \{.*buzz\(/.test(x))) assert(/tone\(/.test(l), `cue without a tone: ${l.trim()}`);
});

test('Works offline: every app file is precached', () => {
  const sw = read('sw.js');
  for (const f of walk('js')) assert(sw.includes(`'./${f}'`), `${f} isn’t in sw.js ASSETS`);
  assert(/APP_VERSION = '(\d+\.\d+)'/.exec(read('js/main.js'))[1] === /CACHE_VERSION = 'v(\d+\.\d+)'/.exec(sw)[1], 'versions match');
});

test('Removed: trivia, Full Pre-Game, Combined and Best session boards; Partner mode parked', () => {
  assert(!PILLARS.flatMap((p) => p.drills).some((d) => d.id === 'questions'), 'Quick Questions drill');
  assert(!existsSync(new URL('js/data/questions.js', root)) && !existsSync(new URL('js/content/questions.js', root)), 'trivia files');
  assert(!existsSync(new URL('js/pregame.js', root)) && !/pregame/i.test(read('js/main.js') + read('js/focus.js') + read('js/cone/ui.js')), 'Full Pre-Game');
  const lb = read('js/score/ui.js');
  assert(!/Combined|Best session|'best'/.test(lb) && /const TABS = \[\['total', 'All-time'\], \['week', 'This week'\]\];/.test(lb), 'All-time and This week, per side');
  assert(/Offline/.test(lb), 'an Offline note when the board can’t sync');
  assert(/err\.status === 429\) \{\s*store\.set\(QUEUE_KEY/.test(read('js/score/board.js')), 'a busy board keeps the score to post later, never drops it');
  assert(FEATURES.partner === false && /isOn\('partner'\)/.test(read('js/cone/ui.js')), 'Partner mode: code kept, switched off');
});

test('Cues read from far away: presets use colors, arrows or numbers; one digit fills the screen', () => {
  assert(PRESET_CUES.join() === 'colors,arrows,numbers', 'no words in presets');
  assert(numberYards(7) >= 20 && numberYards(27) >= 15, `one digit ${numberYards(7).toFixed(1)} yd, two ${numberYards(27).toFixed(1)} yd on an iPhone SE`);
  const css = read('css/styles.css');
  assert(css.includes(`.cdf--one span { font-size: min(${NUMBER_SIZE.one[0]}vw, ${NUMBER_SIZE.one[1]}dvh); }`), 'CSS matches NUMBER_SIZE.one');
  assert(css.includes(`font-size: min(${NUMBER_SIZE.two[0]}vw, ${NUMBER_SIZE.two[1]}dvh)`), 'CSS matches NUMBER_SIZE.two');
});

test('First-time setup is remembered (the steps themselves: tests/onboarding.js)', () => {
  assert(DEFAULTS.setupDone === false && parseSettings({ setupDone: true }).setupDone === true && parseSettings({ setupDone: 'yes' }).setupDone === false, 'remembered');
  assert(!/showFirstRun/.test(read('js/guide.js') + read('js/main.js')), 'the old three-card setup is gone (js/onboarding.js replaced it)');
});
