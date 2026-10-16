// FOCUS / MOVE split (v2.0): the Tap/Cones toggle is gone, each side only has
// its own kind of drill, saved settings survive the update, and every screen
// the code opens exists (run by tests/run.js).

import { readFileSync, readdirSync } from 'node:fs';
import { test, assert } from './harness.js';
import { GROUPS, parseSettings, DEFAULTS } from '../js/settings.js';
import { migrateLast, createLastRuns, LAST_KEY, OLD_LAST_KEY, MOVE_RUN_IDS } from '../js/migrate.js';
import { normalize } from '../js/cone/config.js';
import { FOCUS_SESSIONS } from '../js/plan.js';
import { isOn } from '../js/features.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const walk = (dir) => readdirSync(new URL(`${dir}/`, root), { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
const jsFiles = walk('js');
const html = read('index.html');

// FOCUS code: everything outside js/cone/ except the app shell, shared helpers (js/lib/)
// and the leaderboard (js/score/, shared by both sides).
const FOCUS_FILES = jsFiles.filter((f) => !f.startsWith('js/cone/') && !f.startsWith('js/lib/') && !f.startsWith('js/score/')
  && !['js/main.js', 'js/guide.js', 'js/migrate.js', 'js/features.js'].includes(f));
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

test('Home offers the two sides, each with a preset and a Run last shortcut', () => {
  for (const id of ['btn-focus', 'btn-move', 'btn-game', 'btn-quick', 'btn-focus-last', 'btn-move-last', 'btn-settings', 'btn-about']) {
    assert(html.includes(`id="${id}"`), `home is missing #${id}`);
  }
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
  assert(JSON.stringify(migrateLast(null, { type: 'game' })) === '{"focus":"game"}', 'Game Ready → FOCUS');
  assert(JSON.stringify(migrateLast(null, { type: 'cone' })) === '{"move":"custom"}', 'Cone Drill → MOVE custom setup');
  assert(JSON.stringify(migrateLast(null, null)) === '{}', 'nothing saved');
  assert(JSON.stringify(migrateLast({ focus: 'nope', move: 'signals' }, null)) === '{"move":"signals"}', 'bad values are dropped');

  const store = memoryStorage({ [OLD_LAST_KEY]: JSON.stringify({ type: 'cone' }) });
  const last = createLastRuns(store);
  assert(last.get().move === 'custom', 'old Cone Drill run lost');
  assert(!store.has(OLD_LAST_KEY) && JSON.parse(store.getItem(LAST_KEY)).move === 'custom', 'upgrade not saved');
  last.set('focus', 'activate');
  const again = createLastRuns(store).get();
  assert(again.focus === 'activate' && again.move === 'custom', 'each side keeps its own last run');

  // Storage blocked (private mode): still works for the visit, no errors.
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  const b = createLastRuns(blocked);
  b.set('move', 'quick');
  assert(b.get().move === 'quick', 'should remember for this visit');
  for (const id of FOCUS_SESSIONS.map((s) => s.id)) assert(migrateLast({ focus: id }).focus === id, `${id} rejected`);
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

test('Feature flag: new FOCUS drills are on everywhere (approved)', () => {
  for (const host of ['sightline-psi.vercel.app', 'sightline-git-feature-x.vercel.app', 'localhost']) {
    assert(isOn('newDrills', { host, search: '' }), `new drills should be on everywhere (approved), but not on ${host}`);
  }
});
