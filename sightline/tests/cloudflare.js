// Hosting on Cloudflare Pages (v5.3), run by tests/run.js: the one entry point
// for /api (functions/api/[name].js), settings only from Cloudflare (never
// process.env), and a build that serves exactly the app's files.

import { readFileSync, existsSync } from 'node:fs';
import { test, assert } from './harness.js';
import { onRequest } from '../functions/api/[name].js';
import { SERVED } from '../build.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const MEMORY = { LB_MEMORY: '1', COACH_PIN: '2468' };
const call = async (name, { method = 'GET', query = '', body, env = MEMORY, ip = '203.0.113.7' } = {}) => {
  const request = new Request(`https://sightrep.pages.dev/api/${name}${query}`, {
    method, headers: { 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const res = await onRequest({ request, env, params: { name } });
  return { status: res.status, type: res.headers.get('Content-Type'), cache: res.headers.get('Cache-Control'), body: await res.json() };
};

test('Cloudflare entry point: health, the leaderboard and Partner mode, as JSON, never cached', async () => {
  const off = await call('leaderboard', { query: '?action=health', env: {} });
  assert(off.status === 200 && off.body.db === false && off.body.coach === false, `no settings: ${JSON.stringify(off.body)}`);
  const on = await call('leaderboard', { query: '?action=health' });
  assert(on.status === 200 && on.body.db === true && on.body.coach === true, `with settings: ${JSON.stringify(on.body)}`);
  assert(/^application\/json/.test(on.type) && on.cache === 'no-store', 'JSON, no caching');
  const sent = await call('leaderboard', { method: 'POST', body: { action: 'submit', name: 'Cloud', side: 'focus', score: 900, settings: { sessionId: 'game', length: 'standard', difficulty: 'normal', completed: true } } });
  assert(sent.status === 200 || sent.status === 400, `a score goes through to the leaderboard rules: ${sent.status} ${JSON.stringify(sent.body)}`);
  const board = await call('leaderboard', { query: '?action=board&side=all&tab=total' });
  assert(board.status === 200, `board: ${board.status}`);
  const room = await call('partner', { method: 'POST', body: { action: 'open', setup: {} } });
  assert(room.status === 200 && /^\d{4}$/.test(String(room.body.code)), `Partner room: ${JSON.stringify(room.body)}`);
});

test('Cloudflare entry point: unknown routes, bad requests and wrong methods get clear errors', async () => {
  assert((await call('nope')).status === 404, 'unknown function');
  const bad = await call('leaderboard', { method: 'POST', body: '{not json' });
  assert(bad.status === 400 && bad.body.error === 'Bad request.', 'broken JSON');
  assert((await call('leaderboard', { method: 'DELETE' })).status === 404, 'other methods');
  const pin = await call('leaderboard', { method: 'POST', body: { action: 'unlock', pin: '0000' } });
  assert(pin.status >= 400 && pin.status < 500 && !JSON.stringify(pin.body).includes('2468'), 'a wrong PIN is refused and never echoed');
});

test('Server settings come only from Cloudflare (no process.env, no secrets in files)', () => {
  for (const f of ['api/leaderboard.js', 'api/partner.js', 'functions/api/[name].js']) {
    assert(!/process\.env/.test(read(f)), `${f} reads process.env: use the env Cloudflare passes`);
  }
  const toml = read('wrangler.toml');
  assert(/^pages_build_output_dir = "\.\/dist"$/m.test(toml) && /compatibility_flags = \["nodejs_compat"\]/.test(toml), 'serves dist/, with node:crypto');
  assert(!/DATABASE_URL\s*=|COACH_PIN\s*=|postgres(ql)?:\/\//i.test(toml), 'no database address or PIN in wrangler.toml');
  const pkg = JSON.parse(read('package.json'));
  assert(pkg.scripts.build === 'node tests/run.js && node build.mjs', 'the build runs the tests first');
  assert(!existsSync(new URL('vercel.json', root)), 'no Vercel settings left behind');
});

test('The build serves exactly the app: everything it needs, nothing private', () => {
  for (const p of SERVED) assert(existsSync(new URL(p, root)), `missing: ${p}`);
  for (const p of ['tests', 'api', 'functions', 'README.md', 'package.json', 'wrangler.toml', 'build.mjs', 'node_modules']) {
    assert(!SERVED.includes(p), `${p} would be public`);
  }
  // Everything the offline list and the page load is inside SERVED.
  const offline = [...read('sw.js').matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]).filter(Boolean);
  const page = [...read('index.html').matchAll(/(?:src|href)="(?!https?:|#|data:|mailto:)([^"]+)"/g)].map((m) => m[1]);
  for (const p of [...offline, ...page]) {
    assert(SERVED.some((s) => p === s || p.startsWith(`${s}/`)), `${p} is loaded by the app but not served`);
  }
});
