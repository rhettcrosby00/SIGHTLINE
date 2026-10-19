// Sightrep Pro (v6.0, on for everyone), run by tests/run.js: a Gumroad
// key unlocks the app on one phone at a time. The phone side (js/license.js),
// the server rules (api/_lib/license.js), Gumroad's answers, test keys only on
// preview builds, the wording and price in one file, and the startup order:
// waiver, then key, then the app. The browser half: tools/screens/scenarios/unlock.mjs.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { test, assert } from './harness.js';
import { createLicense, cleanKey, LICENSE } from '../js/license.js';
import { createLicensing, gumroadVerify, KEYS } from '../api/_lib/license.js';
import { keyHash } from '../api/_lib/keys.js';
import { memoryStore } from '../api/_lib/memory-store.js';
import { createService } from '../api/_lib/service.js';
import { PREVIEW_BUILD } from '../api/_lib/build-info.js';
import { markBuild } from '../build.mjs';
import { onRequest } from '../functions/api/[name].js';
import { PRO } from '../js/content/pro.js';
import { FEATURES, isLiveHost } from '../js/features.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const DAY = 86400000;
const KEY = 'ABCD1234-EF567890-1234ABCD-5678EF90';
const PHONE_A = 'phone-aaaa-0001';
const PHONE_B = 'phone-bbbb-0002';

const memory = () => {
  const m = new Map();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};
const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
// A stand-in server: answers each call with what `answer` returns, and counts calls.
const fakeServer = (answer) => {
  const calls = [];
  const fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    const out = await answer(body);
    if (out === 'offline') throw new TypeError('Failed to fetch');
    return { ok: (out.status ?? 200) < 400, status: out.status ?? 200, json: async () => out.body ?? out };
  };
  return { fetch, calls };
};

test('Price and wording: one file, $30 reaches us after Gumroad’s fees, every answer has words', () => {
  const listed = Number(PRO.price.replace('$', ''));
  const kept = listed - (0.10 * listed + 0.50) - (0.029 * listed + 0.30);
  assert(listed === 35.5 && kept >= 30, `listed ${listed}, kept about ${kept.toFixed(2)}`);
  assert(/\(\$30 \+ \$5\.50 payment fees\), plus sales tax where it applies\. One time, for this phone\./.test(PRO.priceNote), PRO.priceNote);
  for (const r of ['empty', 'invalid', 'refunded', 'moves', 'busy', 'offline', 'store']) assert(PRO.errors[r], `no words for ${r}`);
  for (const r of ['moved', 'refunded', 'invalid', 'expired']) assert(PRO.locked[r], `no lock words for ${r}`);
  assert(PRO.errors.moves.includes(`${KEYS.moves} times in ${KEYS.moveDays} days`), 'the moves limit matches the server');
  assert(PRO.buyUrl === '' || /^https:\/\/[\w-]+\.gumroad\.com\/l\/[\w-]+$/.test(PRO.buyUrl), `store link: ${PRO.buyUrl}`);
  assert(/^https:\/\/crosby91\.gumroad\.com\/l\/sightrep$/.test(PRO.buyUrl), 'Buy on Gumroad goes to the store');
  assert(!/cone/i.test(JSON.stringify(PRO)), 'no MOVE cone words (the unlock screen is shared)');
});

test('Phone: a new phone needs a key; a good key unlocks it, and it stays unlocked after reopening', async () => {
  const phone = memory();
  const server = fakeServer(() => ({ ok: true, moved: false }));
  const lic = createLicense({ storage: phone, fetch: server.fetch, now: () => 1e12 });
  assert(lic.needed() && lic.lockedFor() === null, 'a new phone');
  assert((await lic.activate('   ')).reason === 'empty' && server.calls.length === 0, 'nothing typed: no call');
  const out = await lic.activate(` ${KEY.toLowerCase()} `);
  assert(out.ok && server.calls[0].action === 'activate' && server.calls[0].key === KEY, `sent cleaned: ${server.calls[0].key}`);
  assert(/^[A-Za-z0-9-]{8,64}$/.test(server.calls[0].device), 'with this phone’s ID');
  assert(!lic.needed() && lic.last4() === KEY.slice(-4), 'unlocked');
  const again = createLicense({ storage: phone, fetch: server.fetch, now: () => 1e12 + DAY / 2 });
  assert(!again.needed(), 'closed and reopened');
  await again.activate(KEY);
  assert(server.calls[1].device === server.calls[0].device, 'the same phone ID every time');
  assert(cleanKey(' ab cd-12 ') === 'ABCD-12', 'one spelling of a key');
});

test('Phone: wrong, refunded, busy and offline answers leave it locked, with the reason', async () => {
  for (const [answer, reason] of [[{ ok: false, reason: 'invalid' }, 'invalid'], [{ ok: false, reason: 'refunded' }, 'refunded'],
    [{ status: 429, body: { error: 'x' } }, 'busy'], ['offline', 'offline'], [{ status: 503, body: { error: 'x' } }, 'store']]) {
    const lic = createLicense({ storage: memory(), fetch: fakeServer(() => answer).fetch });
    const out = await lic.activate(KEY);
    assert(!out.ok && out.reason === reason && lic.needed(), `${reason}: ${JSON.stringify(out)}`);
  }
});

test('Phone: checks once a day; moved or refunded locks it; no signal keeps it open for 30 days', async () => {
  const phone = memory();
  let t = 1e12;
  let answer = { ok: true, moved: false };
  const server = fakeServer(() => answer);
  const lic = createLicense({ storage: phone, fetch: server.fetch, now: () => t });
  await lic.activate(KEY);
  t += LICENSE.recheckMs / 2;
  assert(await lic.recheck() === null && server.calls.length === 1, 'not again within a day');
  t += LICENSE.recheckMs;
  answer = { ok: true };
  assert(await lic.recheck() === null && server.calls.at(-1).action === 'check', 'a day later: checked, still good');
  answer = 'offline';
  t += 20 * DAY;
  assert(await lic.recheck() === null && !lic.needed(), 'no signal at day 20: still open');
  t += 11 * DAY;
  assert(lic.needed() && lic.lockedFor() === 'expired', 'no good check in 30 days: asks to connect');
  answer = { ok: true };
  assert(await lic.recheck({ force: true }) === null && !lic.needed(), 'online again: open again, no key needed');
  t += 2 * DAY;
  answer = { ok: false, reason: 'moved' };
  assert(await lic.recheck() === 'moved' && lic.needed() && lic.lockedFor() === 'moved', 'the key moved to another phone: locked');
  answer = { ok: true, moved: true };
  assert((await lic.activate(KEY)).moved && !lic.needed() && lic.lockedFor() === null, 'entering it again moves it back');
  t += 2 * DAY;
  answer = { ok: false, reason: 'refunded' };
  assert(await lic.recheck() === 'refunded' && lic.lockedFor() === 'refunded', 'refunded: locked');
});

test('Phone: saved data blocked or cleared', async () => {
  const server = fakeServer(() => ({ ok: true, moved: false }));
  const visit = createLicense({ storage: blocked, fetch: server.fetch });
  assert(visit.needed(), 'blocked: needs a key');
  await visit.activate(KEY);
  assert(!visit.needed(), 'this visit goes on');
  assert(createLicense({ storage: blocked, fetch: server.fetch }).needed(), 'next visit: asked again');
  const phone = memory();
  await createLicense({ storage: phone, fetch: server.fetch }).activate(KEY);
  phone.m.clear();
  assert(createLicense({ storage: phone, fetch: server.fetch }).needed(), 'cleared: asked again (the key moves back to this “new” phone)');
});

const verifyAll = async (key) => ({ valid: key !== 'BAD', refunded: key === 'REFUNDED' });

test('Server: one phone at a time; a key moves to a new phone at most 3 times in 30 days', async () => {
  let t = Date.UTC(2026, 9, 18);
  const store = memoryStore({ now: () => t });
  const keys = createLicensing(store, { verify: verifyAll, now: () => t });
  const a = { key: KEY, device: PHONE_A };
  const b = { key: KEY, device: PHONE_B };
  assert(JSON.stringify(await keys.activate(a)) === '{"ok":true,"moved":false}', 'first phone');
  assert(JSON.stringify(await keys.activate(a)) === '{"ok":true,"moved":false}', 'same phone again');
  assert((await keys.check(a)).ok, 'its daily check');
  assert(JSON.stringify(await keys.activate(b)) === '{"ok":true,"moved":true,"free":false}', 'a second phone: the key moves');
  assert(JSON.stringify(await keys.check(a)) === '{"ok":false,"reason":"moved"}', 'the first phone locks at its next check');
  assert((await keys.check(b)).ok, 'the second is fine');
  assert((await keys.activate(a)).moved && (await keys.activate(b)).moved, 'moves 2 and 3');
  assert(JSON.stringify(await keys.activate(a)) === '{"ok":false,"reason":"moves"}', 'a 4th move in 30 days: refused');
  assert((await keys.check(b)).ok, 'and it stays on the last phone');
  t += 31 * 86400000;
  assert((await keys.activate(a)).moved, '30 days later it can move again');
});

test('Server: wrong and refunded keys are refused; keys are never stored, only a hash', async () => {
  const store = memoryStore();
  const keys = createLicensing(store, { verify: verifyAll });
  assert(JSON.stringify(await keys.activate({ key: 'BAD', device: PHONE_A })) === '{"ok":false,"reason":"invalid"}', 'wrong');
  assert(JSON.stringify(await keys.activate({ key: 'REFUNDED', device: PHONE_A })) === '{"ok":false,"reason":"refunded"}', 'refunded');
  assert(JSON.stringify(await keys.activate({ key: '', device: PHONE_A })) === '{"ok":false,"reason":"invalid"}', 'empty');
  let threw = false;
  try { await keys.activate({ key: KEY, device: 'x' }); } catch (e) { threw = e.status === 400; }
  assert(threw, 'a made-up phone ID is a bad request');
  await keys.activate({ key: ` ${KEY.toLowerCase()}`, device: PHONE_A });
  const rows = store.licenseRows();
  assert(rows.length === 1 && rows[0].hash === keyHash(KEY) && /^[0-9a-f]{64}$/.test(rows[0].hash), 'one row, by hash');
  assert(!JSON.stringify(rows).includes(KEY) && !JSON.stringify(rows).includes(KEY.slice(0, 8)), 'the key itself is nowhere');
});

test('Server: tries per network are limited (a whole team fits)', async () => {
  const keys = createLicensing(memoryStore(), { verify: verifyAll });
  for (let i = 0; i < KEYS.tries; i++) assert((await keys.activate({ key: `K${i}`, device: `phone-team-${String(i).padStart(4, '0')}` }, 'school')).ok, `player ${i + 1}`);
  assert((await keys.activate({ key: 'K99', device: PHONE_A }, 'school')).reason === 'busy', 'then: wait a few minutes');
  assert((await keys.activate({ key: 'K99', device: PHONE_A }, 'home')).ok, 'other networks are unaffected');
  assert(KEYS.tries >= 30, 'room for a roster');
});

test('Coach tools free a key for a new phone (PIN only)', async () => {
  const store = memoryStore();
  const keys = createLicensing(store, { verify: verifyAll });
  const svc = createService(store, { pin: '2468', secret: 't' });
  await keys.activate({ key: KEY, device: PHONE_A });
  let msg = '';
  try { await svc.admin({ token: 'nope', action: 'reset-key', key: KEY }); } catch (e) { msg = e.message; }
  assert(/PIN/.test(msg), 'needs the coach PIN');
  const { token } = await svc.unlock({ pin: '2468' });
  assert((await svc.admin({ token, action: 'reset-key', key: KEY.toLowerCase() })).ok, 'freed');
  try { await svc.admin({ token, action: 'reset-key', key: KEY }); } catch (e) { msg = e.message; }
  assert(msg === 'No phone uses that key yet.', msg);
  assert(JSON.stringify(await keys.activate({ key: KEY, device: PHONE_B })) === '{"ok":true,"moved":false}', 'the next phone gets it, without using a move');
});

test('Gumroad: the public check, never counting a use; test keys only on preview builds', async () => {
  const sent = [];
  const gumroad = (status, body) => async (url, opts) => {
    sent.push({ url, form: Object.fromEntries(new URLSearchParams(opts.body)) });
    return { ok: status < 400, status, json: async () => body };
  };
  const good = await gumroadVerify(KEY, { productId: 'prod_123', fetch: gumroad(200, { success: true, uses: 0, purchase: { refunded: false } }) });
  assert(good.valid && !good.refunded, 'a good key');
  assert(sent[0].url === 'https://api.gumroad.com/v2/licenses/verify' && sent[0].form.product_id === 'prod_123'
    && sent[0].form.license_key === KEY && sent[0].form.increment_uses_count === 'false', JSON.stringify(sent[0]));
  for (const flag of ['refunded', 'chargebacked', 'disputed']) {
    const r = await gumroadVerify(KEY, { productId: 'p', fetch: gumroad(200, { success: true, purchase: { [flag]: true } }) });
    assert(r.valid && r.refunded, `${flag} counts as refunded`);
  }
  assert(!(await gumroadVerify(KEY, { productId: 'p', fetch: gumroad(404, { success: false, message: 'That license does not exist for the provided product.' }) })).valid, 'unknown key');
  let status = 0;
  try { await gumroadVerify(KEY, { productId: 'p', fetch: async () => { throw new TypeError('down'); } }); } catch (e) { status = e.status; }
  assert(status === 503, 'Gumroad down: “try again”, never “wrong key”');
  status = 0;
  try { await gumroadVerify(KEY, {}); } catch (e) { status = e.status; }
  assert(status === 503, 'no store set up yet');
  assert(!(await gumroadVerify('TEST-OK-1234', { productId: 'p', fetch: gumroad(200, { success: true }) })).valid, 'test keys refused on live builds');
  const t1 = await gumroadVerify('TEST-OK-1234', { testKeys: true });
  const t2 = await gumroadVerify('TEST-REFUNDED-1', { testKeys: true });
  assert(t1.valid && !t1.refunded && t2.valid && t2.refunded && !(await gumroadVerify('TEST-NOPE', { testKeys: true })).valid, 'test keys on previews');
});

test('Builds: test keys are off unless Cloudflare is building a preview branch', () => {
  assert(PREVIEW_BUILD === false, 'the saved default is a live build');
  assert(markBuild(undefined) === null, 'a local build changes nothing');
  assert(/markBuild\(process\.env\.CF_PAGES_BRANCH\)/.test(read('build.mjs')) && /const preview = branch !== 'main';/.test(read('build.mjs')), 'main is live; other branches preview');
  assert(/const testKeys = PREVIEW_BUILD \|\| env\.TEST_KEYS === '1';/.test(read('api/license.js')), 'the server reads it');
});

test('/api/license through Cloudflare’s entry point', async () => {
  const env = { LB_MEMORY: '1', TEST_KEYS: '1' };
  const call = async (body, e = env) => {
    const res = await onRequest({ request: new Request('https://feature-unlock.sightrep.pages.dev/api/license', { method: 'POST', body: JSON.stringify(body), headers: { 'CF-Connecting-IP': '198.51.100.9' } }), env: e, params: { name: 'license' } });
    return { status: res.status, body: await res.json() };
  };
  const ok = await call({ action: 'activate', key: 'test-ok-route1', device: PHONE_A });
  assert(ok.status === 200 && ok.body.ok, JSON.stringify(ok));
  assert((await call({ action: 'check', key: 'TEST-OK-ROUTE1', device: PHONE_A })).body.ok, 'its check');
  assert((await call({ action: 'activate', key: 'TEST-OK-ROUTE1', device: PHONE_A }, { LB_MEMORY: '1' })).body.reason === 'invalid', 'test keys off without TEST_KEYS (and on live builds)');
  assert((await call({ action: 'nope' })).status === 404 && (await call({ action: 'activate', key: KEY, device: 'x' })).status === 400, 'clear errors');
  const store = await call({ action: 'activate', key: KEY, device: PHONE_A });
  assert(store.status === 503 && /set up/.test(store.body.error), 'a real key before the store exists: “not set up yet”');
});

test('Startup: waiver, then the key, then the app; locks only on the home screen', () => {
  const main = read('js/main.js');
  assert(!('pro' in FEATURES), 'on everywhere: no switch left (approved for 6.0)');
  assert(isLiveHost('sightrep.pages.dev') && !isLiveHost('feature-unlock.sightrep.pages.dev'), 'live and preview addresses');
  assert(/if \(license\.needed\(\)\) \{\s*gated = true;[^]*?unlocked = await unlockScreen\(license\.lockedFor\(\),/.test(main), 'the unlock screen when there’s no good key');
  assert(/if \(license\.lockedFor\(\) === 'expired'\) await license\.recheck\(\{ force: true \}\);/.test(main), 'a phone offline for 30 days checks first, before asking again');
  assert(/^accepted\.then\(\(\) => license\.recheck\(\)\)/m.test(main), 'the daily check runs on every phone');
  assert(!/id="license-group"[^>]*hidden/.test(read('index.html')), 'Settings always shows the license row');
  assert(/if \(!lockReason \|\| !\$\('screen-start'\)\.classList\.contains\('is-active'\)\) return;/.test(main)
    && /onHome = \(\) => \{ renderHome\(\); lockIfDue\(\); \};/.test(main), 'a lock waits for the home screen (never mid-session)');
  const unlock = read('js/unlock.js');
  assert(!/nav__back|skip|data-nav|cancel/i.test(unlock), 'no way around the unlock screen');
  const html = read('index.html');
  assert(html.indexOf('id="screen-waiver"') < html.indexOf('id="screen-unlock"') && html.indexOf('id="screen-unlock"') < html.indexOf('id="screen-start"'), 'screen order');
});

test('Secrets stay on the server: no product ID or Gumroad call in the app', () => {
  const files = [];
  const walk = (dir) => { for (const n of readdirSync(new URL(dir, root))) { const p = `${dir}${n}`; if (statSync(new URL(p, root)).isDirectory()) walk(`${p}/`); else if (p.endsWith('.js')) files.push(p); } };
  walk('js/');
  for (const f of files) {
    const src = read(f);
    assert(!/GUMROAD_PRODUCT_ID|api\.gumroad\.com|TEST_KEYS/.test(src), `${f} talks to Gumroad or knows server settings`);
  }
  assert(!/GUMROAD_PRODUCT_ID\s*=/.test(read('wrangler.toml')), 'not in wrangler.toml either');
});
