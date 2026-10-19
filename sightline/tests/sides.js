// FOCUS / MOVE split (v2.0): the Tap/Cones toggle is gone, each side only has
// its own kind of drill, saved settings survive the update, and every screen
// the code opens exists (run by tests/run.js).

import { readFileSync, readdirSync } from 'node:fs';
import { test, assert } from './harness.js';
import { GROUPS, parseSettings, DEFAULTS } from '../js/settings.js';
import { migrateLast, createLastRuns, LAST_KEY, OLD_LAST_KEY, MOVE_RUN_IDS } from '../js/migrate.js';
import { normalize } from '../js/cone/config.js';
import { FOCUS_SESSIONS } from '../js/plan.js';
import { FEATURES, isOn } from '../js/features.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const walk = (dir) => readdirSync(new URL(`${dir}/`, root), { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
const jsFiles = walk('js');
const html = read('index.html');

// FOCUS code: everything outside js/cone/ except the app shell, shared helpers (js/lib/),
// the leaderboard (js/score/) and what both sides share (settings, presets, install).
const SHARED = ['js/main.js', 'js/guide.js', 'js/migrate.js', 'js/features.js', 'js/settings.js', 'js/presets.js', 'js/install.js'];
const FOCUS_FILES = jsFiles.filter((f) => !f.startsWith('js/cone/') && !f.startsWith('js/lib/') && !f.startsWith('js/score/') && !SHARED.includes(f));
// Code without comments: what can actually reach a screen.
const codeOf = (f) => read(f).replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const MOVE_FILES = jsFiles.filter((f) => f.startsWith('js/cone/'));

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    has: (k) => m.has(k),
  };
}

test('The Tap / Cones mode toggle no longer exists anywhere', () => {
  assert(!GROUPS.flatMap((g) => g.fields).some((f) => f.key === 'mode'), 'Settings still has a mode row');
  for (const f of jsFiles) {
    const code = read(f);
    assert(!/settings\.mode|\.mode === 'cones'|'cones'\]|Cones mode|Cone mode|Tap mode/.test(code), `${f} still refers to the old mode`);
  }
  assert(!/Tap mode|Cone mode|Cones mode/i.test(html), 'index.html still mentions the old mode');
});

test('No FOCUS screen shows cone setup, distance, or cone instructions', () => {
  for (const f of FOCUS_FILES) {
    const hit = /\bcones?\b|distance|\byd\b|run to|ruleCone|stripCone|coneFrames|coneShow|coneReveal/i.exec(codeOf(f));
    assert(!hit, `${f} mentions "${hit?.[0]}"`);
  }
});

test('MOVE has no breathing, eye warm-ups, math or questions', () => {
  for (const f of MOVE_FILES) {
    const imports = [...read(f).matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    const focusOnly = imports.filter((p) => /stages\/(breathe|eyes|brain|reaction|memory|visualize|readiness)|routine|session|plan\.js$/.test(p) && !p.startsWith('./'));
    assert(focusOnly.length === 0, `${f} imports FOCUS drills: ${focusOnly}`);
  }
});

test('Home offers two choices only (FOCUS, MOVE), each with a Run last shortcut', () => {
  for (const id of ['btn-focus', 'btn-move', 'btn-focus-last', 'btn-move-last', 'btn-focus-open', 'btn-move-open', 'btn-settings', 'btn-about', 'btn-board']) {
    assert(html.includes(`id="${id}"`), `home is missing #${id}`);
  }
  const home = html.slice(html.indexOf('id="screen-start"'), html.indexOf('id="screen-focus"'));   // the whole home screen
  assert((home.match(/<article class="side"/g) ?? []).length === 2, 'two sides on home');
  assert(!/data-day=|btn-game|btn-quick|btn-pregame|btn-routine/.test(home), 'nothing else to start from home (Game Day / Training lives on each side)');
  assert(/data-side="focus"[\s\S]*Eyes · Mind · Breath[\s\S]*Hold your phone/.test(html), 'FOCUS card copy');
  assert(/data-side="move"[\s\S]*React · Cut · Compete[\s\S]*Set your phone down/.test(html), 'MOVE card copy');
});

test('Every screen and element the code opens exists in index.html', () => {
  const dynamic = new Set();   // ids created by code (none expected today)
  for (const f of jsFiles) {
    const code = read(f);
    const ids = [
      ...[...code.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]),
      ...[...code.matchAll(/getElementById\('([\w-]+)'\)/g)].map((m) => m[1]),
      ...[...code.matchAll(/show\('([\w-]+)'/g)].map((m) => `screen-${m[1]}`),
    ];
    for (const id of ids) assert(dynamic.has(id) || html.includes(`id="${id}"`), `${f} uses #${id}, which isn't in index.html`);
  }
});

test('Saved FOCUS settings survive the update (the old mode is dropped, nothing else)', () => {
  const old = { mode: 'cones', length: 'full', difficulty: 'hard', guide: 'brief', sound: 'off', appearance: 'outdoor', cue: 'attack!' };
  const now = parseSettings(old);
  assert(!('mode' in now), 'mode should be gone');
  for (const k of ['length', 'difficulty', 'guide', 'sound', 'appearance']) assert(now[k] === old[k], `${k} lost`);
  assert(now.cue === 'ATTACK!', `cue word lost: ${now.cue}`);
  const fresh = parseSettings({});
  assert(JSON.stringify(fresh) === JSON.stringify(DEFAULTS), 'defaults changed for a brand-new phone');
  assert(JSON.stringify(parseSettings(JSON.parse(JSON.stringify(now)))) === JSON.stringify(now), 'settings should save and load unchanged');
});

test('Saved MOVE setup (last cone setup, distance, timing) carries over unchanged', () => {
  const saved = {
    cueType: 'arrows', cones: 5, coloredCones: true, colors: ['blue', 'red', 'green', 'yellow', 'orange', 'purple', 'white', 'pink'],
    directions: ['F', 'FR', 'R', 'L', 'FL'], style: 'conetocone', pace: 'game', distance: 8, distanceMode: 'each',
    coneYards: { F: 10, L: 5, R: 5 }, manual: false, manualS: 2.5, setMode: 'timed', reps: 12, timedSec: 45,
    sets: 6, restMode: 'custom', restSec: 90, position: 'peripheral', display: 'flash', flashMs: 450, fakes: 'low',
    sound: 'off', callouts: false,
  };
  const now = normalize(saved);
  for (const [k, v] of Object.entries(saved)) assert(JSON.stringify(now[k]) === JSON.stringify(v), `${k} changed: ${JSON.stringify(now[k])}`);
  // The Reverse rule (v2.6 and earlier) carries over as the Decision Layer's Opposite cue.
  const reversed = normalize({ ...saved, reverse: true });
  assert(reversed.decision && reversed.decisions.join() === 'opposite' && !('reverse' in reversed), 'Reverse rule should become Opposite');
});

test('Setups saved before distance timing (v2.0) keep their feel', () => {
  const old = (x) => normalize({ cueType: 'colors', cones: 4, distance: 7, reps: 12, sets: 4, ...x });
  const want = { slow: 'learning', medium: 'training', fast: 'game', game: 'game' };
  for (const [speed, pace] of Object.entries(want)) {
    const s = old({ speed, restSec: 30 });
    assert(s.pace === pace && !s.manual && s.style === 'outback', `${speed} → ${s.pace}`);
    assert(s.restMode === 'auto', 'the old default rest (30 s) becomes the suggested rest');
    assert(s.distance === 7 && s.reps === 12 && s.sets === 4, 'distance, reps or sets lost');
    assert(!('speed' in s) && !('customMs' in s), 'old fields left behind');
  }
  const custom = old({ speed: 'custom', customMs: 1700, restSec: 90 });
  assert(custom.manual && custom.manualS === 1.7, 'a custom time becomes the exact time');
  assert(custom.restMode === 'custom' && custom.restSec === 90, 'a chosen rest stays');
});

test('"Run last" moves to the right side; old saves upgrade once and nothing is lost', () => {
  assert(JSON.stringify(migrateLast(null, { type: 'game' })) === '{"focus":"game:standard"}', 'Game Ready → FOCUS, Standard');
  assert(JSON.stringify(migrateLast(null, { type: 'cone' })) === '{"move":"custom"}', 'Cone Drill → MOVE custom setup');
  assert(JSON.stringify(migrateLast(null, null)) === '{}', 'nothing saved');
  assert(JSON.stringify(migrateLast({ focus: 'nope', move: 'signals' }, null)) === '{"move":"signals"}', 'bad values are dropped');

  const store = memoryStorage({ [OLD_LAST_KEY]: JSON.stringify({ type: 'cone' }) });
  const last = createLastRuns(store);
  assert(last.get().move === 'custom', 'old Cone Drill run lost');
  assert(!store.has(OLD_LAST_KEY) && JSON.parse(store.getItem(LAST_KEY)).move === 'custom', 'upgrade not saved');
  // Before the presets (v4.0): main sessions become Standard; Quick Start → Quick, Game Day → Game Speed.
  const v2 = migrateLast({ focus: 'training', move: 'gameday' });
  assert(v2.focus === 'training:standard' && v2.move === 'game:speed', JSON.stringify(v2));
  assert(migrateLast({ move: 'quick' }).move === 'game:quick' && migrateLast({ move: 'training' }).move === 'training:standard', 'old MOVE runs');
  assert(migrateLast({ focus: 'game:speed', move: 'training:quick' }).focus === 'game:speed', 'presets are kept');
  last.set('focus', 'activate');
  const again = createLastRuns(store).get();
  assert(again.focus === 'activate' && again.move === 'custom', 'each side keeps its own last run');

  // Storage blocked (private mode): still works for the visit, no errors.
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  const b = createLastRuns(blocked);
  b.set('move', 'game:quick');
  assert(b.get().move === 'game:quick', 'should remember for this visit');
  for (const id of FOCUS_SESSIONS.map((s) => s.id).filter((x) => x !== 'game' && x !== 'training')) assert(migrateLast({ focus: id }).focus === id, `${id} rejected`);
  for (const id of MOVE_RUN_IDS) assert(migrateLast({ move: id }).move === id, `${id} rejected`);
});

test('Old links and home-screen shortcuts still open the app', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert(manifest.start_url === './' && manifest.scope === './', 'home-screen shortcut points somewhere else');
  assert(/src="js\/main\.js"/.test(html), 'app entry missing');
  // Old dev links (?autostart=1, ?only=…, ?speed=…) are still read by main.js.
  const main = read('js/main.js');
  for (const p of ['autostart', 'only', 'speed', 'autoready', 'seed', 'noguide']) assert(main.includes(`'${p}'`), `?${p} no longer handled`);
});

test('Feature flags: approved features don’t linger as switches; previews stay off live; parked ones are off', () => {
  const stale = Object.entries(FEATURES).filter(([, v]) => v !== 'preview' && v !== false).map(([k]) => k);
  assert(stale.length === 0, `approved flags to remove: ${stale}`);
  for (const host of ['app.sightrep.app', 'feature-x.sightrep.pages.dev', 'localhost']) assert(!isOn('partner', { host, search: '' }), `Partner mode is parked, but on at ${host}`);
  // The Sightrep addresses count as live: preview features stay off there.
  FEATURES.__live = 'preview';
  try {
    for (const host of ['app.sightrep.app', 'sightrep.app', 'sightrep.pages.dev', 'sightrep-a1b.pages.dev']) assert(!isOn('__live', { host, search: '' }), `a preview feature shows on ${host}`);
    for (const host of ['feature-unlock.sightrep.pages.dev', '4f2c9a1e.sightrep.pages.dev']) assert(isOn('__live', { host, search: '' }), `a Cloudflare preview link should show preview features: ${host}`);
  } finally {
    delete FEATURES.__live;
  }
  // The mechanism still works for the next preview feature.
  FEATURES.__test = 'preview';
  try {
    assert(!isOn('__test', { host: 'app.sightrep.app', search: '' }), 'a preview flag is off on the live site');
    assert(isOn('__test', { host: 'feature-x.sightrep.pages.dev', search: '' }) && isOn('__test', { host: 'localhost', search: '' }), 'on in previews');
  } finally {
    delete FEATURES.__test;
  }
});
