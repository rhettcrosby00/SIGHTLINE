// Sightrep (v5.0), run by tests/run.js: one name and tagline everywhere
// (js/brand.js, the page, the home-screen app), no "Sightline" anywhere an
// athlete could see it, and saved phone data that survives the rename.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { test, assert } from './harness.js';
import { BRAND } from '../js/brand.js';
import { renameSavedData, OLD_PREFIX, PREFIX } from '../js/migrate.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));
const meta = (attr, name) => new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`).exec(html)?.[1];

test('Name and tagline: one source (js/brand.js), and the page and home-screen app agree', () => {
  assert(BRAND.name === 'Sightrep' && BRAND.tagline === 'Reps for your eyes.', JSON.stringify(BRAND));
  assert(/<title>Sightrep<\/title>/.test(html) && meta('name', 'apple-mobile-web-app-title') === BRAND.name, 'page title and iPhone home-screen title');
  assert(manifest.name === BRAND.name && manifest.short_name === BRAND.name, 'manifest name and short_name');
  for (const d of [manifest.description, meta('name', 'description'), meta('property', 'og:description'), meta('name', 'twitter:description')]) {
    assert(d?.includes(BRAND.tagline), `a description without the tagline: ${d}`);
  }
  assert(meta('property', 'og:title') === BRAND.name && meta('property', 'og:site_name') === BRAND.name && meta('name', 'twitter:title') === BRAND.name, 'link previews');
  assert(new RegExp(`id="brand-tagline"[^>]*>${BRAND.tagline.replace('.', '\\.')}<`).test(html), 'the tagline is on the home screen even before the app starts');
  assert(/\$\('brand-tagline'\)\.textContent = BRAND\.tagline/.test(read('js/main.js')), 'and the home screen reads it from js/brand.js');
  assert(/aria-label="Sightrep">Sight<span>rep<\/span>/.test(html), 'the wordmark says Sightrep');
});

// Everything Vercel serves from the app folder, except the face tracker's binaries.
const SHIPPED = [];
(function walk(dir) {
  for (const name of readdirSync(new URL(dir, root))) {
    const p = `${dir}${name}`;
    if (['node_modules', 'tests'].includes(name) || /\.(png|wasm|task|webp|ico)$/.test(name)) continue;
    if (statSync(new URL(p, root)).isDirectory()) walk(`${p}/`);
    else SHIPPED.push(p);
  }
}(''));
// The only places the old name may stay: internal names nobody sees.
const INTERNAL = [
  ['js/migrate.js', /sightline\./g],                          // moving old saved data
  ['index.html', /'sightline\.settings\.v1'/g],                 // the theme before the move runs
  ['sw.js', /'sightline-v1'|'sightline-'/g],                    // clearing the old offline caches
  ['js/features.js', /sightline-psi\.vercel\.app/g],            // today's web address (until the domain switch)
  ['api/_lib/partner.js', /'sightline'/g], ['api/_lib/service.js', /'sightline'/g],   // a server-side default, never shown
  ['README.md', /sightline-psi\.vercel\.app|`sightline\.\*`|sightline\.\*|sightline\.…|Sightline became Sightrep|Sightline/g],   // notes for developers
];
const stripComments = (src) => src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');

test('No "Sightline" anywhere an athlete can see it (the old name only in internal names)', () => {
  const left = [];
  for (const f of SHIPPED) {
    let src = read(f);
    for (const [file, re] of INTERNAL) if (file === f) src = src.replace(re, '');
    if (f !== 'README.md') src = stripComments(src);   // comments are never shown
    if (/sightline/i.test(src)) left.push(`${f}: ${/.{0,40}sightline.{0,40}/i.exec(src)[0]}`);
  }
  assert(left.length === 0, `still says Sightline:\n    ${left.join('\n    ')}`);
  assert(SHIPPED.includes('index.html') && SHIPPED.includes('manifest.webmanifest') && SHIPPED.some((f) => f.startsWith('js/')), 'checked the app');
  // Logo images too: their titles and labels are read aloud.
  for (const f of SHIPPED.filter((x) => x.endsWith('.svg'))) assert(!/sightline/i.test(read(f)), `${f} is labeled Sightline`);
});

// A fake phone storage (with length / key(i), like the real one).
function storage(init = {}, { full = false } = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (full) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

test('Saved phone data survives the rename: settings, routines, levels, setups and the leaderboard name', () => {
  assert(OLD_PREFIX === 'sightline.' && PREFIX === 'sightrep.', 'prefixes');
  const old = {
    'sightline.settings.v1': JSON.stringify({ appearance: 'dark', cue: 'ATTACK', sport: 'soccer', day: 'training' }),
    'sightline.routine.v1': JSON.stringify({ breath: 'box', imagery: 'See the first touch.', quietEyeS: 3 }),
    'sightline.levels.v1': JSON.stringify({ colorcall: 0.4 }),
    'sightline.cone.v1': JSON.stringify({ cones: 5, distance: 8 }),
    'sightline.name.v1': JSON.stringify('Jordan'),
    'sightline.last.v2': JSON.stringify({ focus: 'game:standard', move: 'game:speed' }),
    'sightline.last.v1': JSON.stringify({ type: 'game' }),
    'someone-else': 'keep me',
  };
  const s = storage(old);
  assert(renameSavedData(s) === 7, 'seven keys moved');
  const now = s.dump();
  for (const [k, v] of Object.entries(old)) {
    if (k.startsWith('sightline.')) assert(now[`sightrep.${k.slice(10)}`] === v && !(k in now), `${k} moved unchanged`);
  }
  assert(now['someone-else'] === 'keep me', 'other keys untouched');
  assert(renameSavedData(s) === 0 && JSON.stringify(s.dump()) === JSON.stringify(now), 'running it again changes nothing');
  // Already saved under the new name (a second tab, say): the new value wins; the old key goes.
  const both = storage({ 'sightline.name.v1': '"Old"', 'sightrep.name.v1': '"New"' });
  renameSavedData(both);
  assert(both.dump()['sightrep.name.v1'] === '"New"' && !('sightline.name.v1' in both.dump()), 'newer data wins');
  // A full phone: nothing is lost (the old key stays to try again next time).
  const full = storage({ 'sightline.settings.v1': '{"cue":"GO"}' }, { full: true });
  assert(renameSavedData(full) === 0 && full.dump()['sightline.settings.v1'] === '{"cue":"GO"}', 'kept when the new key can’t be written');
  // Blocked or missing storage (private mode): no error.
  assert(renameSavedData({ get length() { throw new Error('blocked'); } }) === 0 && renameSavedData(null) === 0, 'blocked storage');
  // It runs before anything reads saved data.
  const main = read('js/main.js');
  assert(main.indexOf('renameSavedData();') > 0 && main.indexOf('renameSavedData();') < main.indexOf('initSettings('), 'first thing at startup');
  // Every saved key in the app uses the new prefix.
  for (const f of SHIPPED.filter((x) => x.startsWith('js/') && x !== 'js/migrate.js')) {
    const keys = [...read(f).matchAll(/'(sight\w+)\.[\w.]+'/g)].map((m) => m[1]);
    assert(keys.every((k) => k === 'sightrep'), `${f} saves under ${keys}`);
  }
});
