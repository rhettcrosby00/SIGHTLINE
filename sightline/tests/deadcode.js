// Dead-code check (run by tests/run.js): no orphan files, unused exports,
// unreachable screens, unused styles, icons or feature flags.

import { readFileSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';
import { test, assert } from './harness.js';
import { FEATURES } from '../js/features.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const walk = (dir) => readdirSync(new URL(`${dir}/`, root), { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
const jsFiles = walk('js');
const testFiles = walk('tests');
const src = Object.fromEntries([...jsFiles, ...testFiles].map((f) => [f, read(f)]));
const html = read('index.html');
const css = read('css/styles.css');
const appCode = jsFiles.map((f) => src[f]).join('\n') + html;

const importsOf = (f) => [...src[f].matchAll(/(?:import|export)\s[^;]*?from\s+'(\.[^']+)'/g)]
  .map((m) => posix.normalize(posix.join(posix.dirname(f), m[1])));

test('Every file is part of the app (reachable from js/main.js)', () => {
  const seen = new Set();
  const visit = (f) => { if (seen.has(f)) return; seen.add(f); importsOf(f).forEach(visit); };
  visit('js/main.js');
  const orphans = jsFiles.filter((f) => !seen.has(f));
  assert(orphans.length === 0, `not used by the app: ${orphans.join(', ')}`);
});

test('Every export is used by another file', () => {
  const unused = [];
  for (const f of jsFiles.filter((x) => x !== 'js/main.js')) {
    const names = [...src[f].matchAll(/export\s+(?:async\s+)?(?:const|function|class|let)\s+(\w+)/g)].map((m) => m[1]);
    for (const n of names) {
      const used = Object.keys(src).some((g) => g !== f && new RegExp(`import\\s*\\{[^}]*\\b${n}\\b[^}]*\\}\\s*from`).test(src[g]));
      if (!used) unused.push(`${f}: ${n}`);
    }
  }
  assert(unused.length === 0, `unused exports: ${unused.join('; ')}`);
});

test('Every import is used', () => {
  const unused = [];
  for (const f of [...jsFiles, ...testFiles]) {
    for (const m of src[f].matchAll(/import\s*\{([^}]*)\}\s*from[^;]*;/g)) {
      const body = src[f].replace(m[0], '');
      for (const raw of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
        const name = raw.split(/\s+as\s+/).pop();
        if (!new RegExp(`\\b${name}\\b`).test(body)) unused.push(`${f}: ${name}`);
      }
    }
  }
  assert(unused.length === 0, `unused imports: ${unused.join('; ')}`);
});

test('Every screen can be reached (no dead routes)', () => {
  const screens = [...html.matchAll(/id="screen-([\w-]+)"/g)].map((m) => m[1]);
  const shown = new Set([...appCode.matchAll(/show\('([\w-]+)'/g)].map((m) => m[1]));
  // MOVE setups are opened by variant: show(run === 'signals' ? 'signals' : 'cone-setup', …)
  for (const m of appCode.matchAll(/show\(\w+ === '\w+' \? '([\w-]+)' : '([\w-]+)'/g)) { shown.add(m[1]); shown.add(m[2]); }
  const dead = screens.filter((s) => !shown.has(s));
  assert(dead.length === 0, `screens nothing opens: ${dead.join(', ')}`);
});

test('Every style in styles.css is used', () => {
  const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{[^}]*\}/g, '{}');
  const classes = new Set([...selectors.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const esc = (x) => x.replace(/-/g, '\\-');
  const unused = [...classes].filter((c) => {
    // Used as a class token: not part of a longer name, not a property (.x), key (x:) or call (x().
    if (new RegExp(`(?<![\\w.-])${esc(c)}(?![\\w-]|\\s*[:=(])`).test(appCode)) return false;
    // Modifiers built in code, like `pad--${spec.pad}`.
    const block = c.match(/^(.*--)/)?.[1];
    return !(block && appCode.includes(`${block}\${`));
  });
  assert(unused.length === 0, `unused styles: ${unused.join(', ')}`);
});

test('Every icon is used', () => {
  const iconsSrc = src['js/lib/icons.js'];
  const names = [...iconsSrc.matchAll(/^\s+'?([\w-]+)'?: '</gm)].map((m) => m[1]);
  const dirIcons = [...iconsSrc.matchAll(/DIR_ICON = \{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/'([\w-]+)'/g)].map((x) => x[1]));
  const rest = appCode.replace(iconsSrc, '');
  const unused = names.filter((n) => !dirIcons.includes(n) && !new RegExp(`(icon\\('${n}'|data-icon="${n}")`).test(rest));
  assert(unused.length === 0, `unused icons: ${unused.join(', ')}`);
});

test('Every feature flag is checked somewhere', () => {
  for (const name of Object.keys(FEATURES)) assert(appCode.includes(`isOn('${name}')`), `flag ${name} is never checked`);
});
