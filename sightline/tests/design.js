// Design system + offline checks (run by tests/run.js): every text color
// passes contrast in light, dark and outdoor; banned fonts and effects stay
// out; the offline file list matches what's on disk.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { test, assert } from './harness.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const tokensCss = read('css/tokens.css');
const stylesCss = read('css/styles.css');
const indexHtml = read('index.html');
const swJs = read('sw.js');

// ---- Theme colors, straight from css/tokens.css ----
function block(startMarker) {
  const at = tokensCss.indexOf(startMarker);
  assert(at >= 0, `tokens.css is missing ${startMarker}`);
  const open = tokensCss.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < tokensCss.length; i++) {
    if (tokensCss[i] === '{') depth++;
    if (tokensCss[i] === '}' && --depth === 0) return tokensCss.slice(open + 1, i);
  }
  throw new Error(`unclosed block ${startMarker}`);
}
const colors = (css) => Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));

const light = colors(block(':root {'));
const darkMedia = colors(block('@media (prefers-color-scheme: dark)'));
const dark = { ...light, ...colors(block(':root[data-appearance="dark"]')) };
const outdoor = { ...light, ...colors(block(':root[data-appearance="outdoor"]')) };
const THEMES = { light, dark, outdoor };

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum ratio]. 4.5:1 is WCAG AA for body text.
const PAIRS = [
  ['text', 'bg', 4.5], ['text', 'surface', 4.5], ['text', 'raised', 4.5],
  ['muted', 'bg', 4.5], ['muted', 'surface', 4.5], ['muted', 'raised', 4.5],
  ['accent-ink', 'accent', 4.5],
  ['accent-text', 'bg', 4.5], ['accent-text', 'surface', 4.5],
  ['good', 'bg', 4.5], ['good', 'surface', 4.5],
  ['bad', 'bg', 4.5], ['bad', 'surface', 4.5],
  ['warn-text', 'warn-bg', 4.5],
  ['cue-fg', 'cue-bg', 7], ['cue-muted', 'cue-bg', 4.5], ['cue-accent', 'cue-bg', 7],
];

for (const [name, t] of Object.entries(THEMES)) {
  test(`${name} theme: every text color passes contrast`, () => {
    const fails = PAIRS.filter(([fg, bg, min]) => {
      assert(t[fg] && t[bg], `${name} is missing --${fg} or --${bg}`);
      return contrast(t[fg], t[bg]) < min;
    }).map(([fg, bg, min]) => `--${fg} on --${bg}: ${contrast(t[fg], t[bg]).toFixed(2)} (needs ${min})`);
    assert(fails.length === 0, fails.join('; '));
  });
}

test('dark theme is the same whether it comes from the phone or the setting', () => {
  const diff = Object.keys(darkMedia).filter((k) => darkMedia[k] !== dark[k]);
  assert(diff.length === 0, `differs: ${diff.join(', ')}`);
});

test('no banned fonts, gradients, glass or glow', () => {
  const banned = ['Inter', 'Roboto', 'Poppins', 'Montserrat', 'Open Sans', 'Space Grotesk', 'Bebas Neue', 'Orbitron', 'Press Start 2P'];
  const all = tokensCss + stylesCss + indexHtml;
  const fonts = banned.filter((f) => new RegExp(`["'\\s,=+]${f.replace(/ /g, '[ +]')}\\b`).test(all));
  assert(fonts.length === 0, `banned fonts: ${fonts.join(', ')}`);
  // A one-color "gradient" is just a drawn line (the cone diagram's crosshair); real fades are out.
  const fades = [...stylesCss.matchAll(/(?:linear|radial|conic)-gradient\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)]
    .filter((m) => new Set(m[1].split(',').map((x) => x.trim()).filter((x) => !/^(to |\d+deg|circle)/.test(x))).size > 1);
  assert(fades.length === 0, `no gradients: ${fades.map((m) => m[0]).join(' ')}`);
  assert(!/backdrop-filter/.test(stylesCss), 'no glassmorphism');
  assert(!/(text|drop)-shadow|filter:\s*blur/.test(stylesCss), 'no glow');
});

test('type scale has 6 sizes, all in tokens.css', () => {
  const sizes = [...tokensCss.matchAll(/--text-[\w-]+:/g)];
  assert(sizes.length === 6, `found ${sizes.length}`);
});

test('no emoji in the app', () => {
  const files = [indexHtml, ...walk('js').map(read)];
  const hit = files.find((f) => /\p{Extended_Pictographic}/u.test(f.replace(/[▲▼●■◆★✚✖♥▶◀]/g, '')));
  assert(!hit, 'emoji found');
});

// ---- Offline file list ----
function walk(dir) {
  return readdirSync(new URL(`${dir}/`, root), { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
}
const assets = [...swJs.matchAll(/^\s+'\.\/([^']*)',$/gm)].map((m) => m[1]);

test('offline list has every app file, and every listed file exists', () => {
  const needed = [...walk('js'), ...walk('css'), ...walk('icons'), ...walk('assets/logo').filter((f) => f.endsWith('.svg'))];
  const missing = needed.filter((f) => !assets.includes(f));
  const gone = assets.filter((f) => f && !existsSync(new URL(f, root)));
  assert(missing.length === 0, `not in sw.js ASSETS: ${missing.join(', ')}`);
  assert(gone.length === 0, `listed but missing: ${gone.join(', ')}`);
});

test('font link and versions match between files', () => {
  const link = /href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/.exec(indexHtml)?.[1];
  const sw = /const FONT_CSS = '([^']+)'/.exec(swJs)?.[1];
  assert(link && link.replace(/&amp;/g, '&') === sw, 'FONT_CSS in sw.js must equal the font <link> in index.html');
  const cacheV = /CACHE_VERSION = 'v([\d.]+)'/.exec(swJs)?.[1];
  const appV = /APP_VERSION = '([\d.]+)'/.exec(read('js/main.js'))?.[1];
  assert(cacheV && cacheV === appV, `sw.js v${cacheV} vs main.js v${appV}`);
});
