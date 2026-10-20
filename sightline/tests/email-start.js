// "Start Sightrep" by email (v6.6), run by tests/run.js: Gumroad's sale notice → our email with a
// one-time link → this phone unlocked with no key typed; 6-digit codes for another phone or the
// home-screen app; a new link when one has expired; every unlock in Coach tools' sign-in log.
// The browser half: tools/screens/scenarios/first-run.mjs (fr-link…, fr-code…).

import { readFileSync } from 'node:fs';
import { test, assert } from './harness.js';
import { createPurchases, signinLog, openKey, maskEmail, tokenHash, newCode, LINKS } from '../api/_lib/purchases.js';
import { createLicensing } from '../api/_lib/license.js';
import { createService } from '../api/_lib/service.js';
import { memoryStore } from '../api/_lib/memory-store.js';
import { OUTBOX } from '../api/_lib/mail.js';
import { handle as gumroad } from '../api/gumroad.js';
import { startEmail, codeEmail } from '../api/_lib/email-words.js';
import { createLicense } from '../js/license.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const DAY = 86400000;
const KEY = 'ABCD1234-EF567890-1234ABCD-5678EF90';
const BUYER = 'Jordan.Lee@Example.com';
const PHONE = 'phone-aaaa-0001';
const OTHER = 'phone-bbbb-0002';

// A sale's world: Gumroad says KEY belongs to BUYER and sale S-1.
function world({ t0 = Date.UTC(2026, 9, 22) } = {}) {
  let t = t0;
  const now = () => t;
  const store = memoryStore({ now });
  const sent = [];
  const mail = { send: async (m) => { sent.push(m); return { ok: true }; } };
  const verify = async (key) => (key === KEY ? { valid: true, refunded: false, email: 'jordan.lee@example.com', saleId: 'S-1' } : { valid: false });
  const licensing = createLicensing(store, { verify, now, log: signinLog(store, { now }) });
  const p = createPurchases(store, { verify, licensing, mail, secret: 'link-secret', origin: 'https://app.sightrep.app', now });
  const linkOf = (m) => /https:\/\/app\.sightrep\.app\/\?start#t=([A-Za-z0-9_-]{43})/.exec(m.text)?.[1];
  return { store, sent, p, licensing, now, tick: (ms) => { t += ms; }, linkOf };
}
const SALE = { sale_id: 'S-1', email: BUYER, license_key: KEY, product_id: 'x' };

test('Sale notice: checked with Gumroad, kept with the key encrypted, one Start Sightrep email per sale', async () => {
  const w = world();
  assert((await w.p.sale(SALE)).ok, 'accepted');
  assert(w.sent.length === 1 && w.sent[0].to === 'jordan.lee@example.com' && w.sent[0].subject === 'Start Sightrep', 'one email, to the buyer');
  const token = w.linkOf(w.sent[0]);
  assert(token && !w.sent[0].text.includes(KEY) && !/jordan/i.test(w.sent[0].text.split('\n').find((l) => l.includes('#t=')) ?? ''), 'the link carries only a random token');
  const row = w.store.purchaseRows()[0];
  assert(row.email === 'jordan.lee@example.com' && !row.keyEnc.includes(KEY) && !row.keyEnc.includes('ABCD1234'), 'the key is stored encrypted');
  assert(await openKey(row.keyEnc, 'link-secret') === KEY, 'and opens with LINK_SECRET');
  let wrong = false;
  try { await openKey(row.keyEnc, 'another-secret'); } catch { wrong = true; }
  assert(wrong, 'not with another secret');
  assert(!JSON.stringify(w.store.tokenRows()).includes(token), 'links are stored only as hashes');
  assert((await w.p.sale(SALE)).again && w.sent.length === 1, 'Gumroad retried: no second email');
  // Mismatches and missing keys: nothing kept, nothing sent, a note for Coach tools (field names only).
  const v = world();
  assert((await v.p.sale({ ...SALE, email: 'someone@else.com' })).reason === 'mismatch' && v.sent.length === 0, 'a key that isn’t this buyer’s: refused');
  assert((await v.p.sale({ ...SALE, sale_id: 'S-2' })).reason === 'mismatch', 'or not this sale');
  assert((await v.p.sale({ sale_id: 'S-9', email: BUYER, product_id: 'x' })).reason === 'no-key', 'no key in the notice');
  const note = JSON.parse(await v.store.getMeta('ping'));
  assert(note.status === 'no license key in the notice' && note.fields.join() === 'email,product_id,sale_id' && !JSON.stringify(note).includes(BUYER), `field names only: ${JSON.stringify(note)}`);
  assert(v.store.purchaseRows().length === 0, 'nothing kept');
  // The email doesn't send (Resend down or the key wrong): noted, and Gumroad's retry sends it.
  const f = world();
  const send = f.sent.push.bind(f.sent);
  let down = true;
  f.sent.push = (m) => { if (down) throw new Error('resend down'); return send(m); };
  let threw = false;
  try { await f.p.sale(SALE); } catch { threw = true; }
  assert(threw && JSON.parse(await f.store.getMeta('ping')).status === 'the email didn’t send (Resend)', 'a failed send is noted for Coach tools');
  down = false;
  assert((await f.p.sale(SALE)).ok && f.sent.length === 1 && f.store.purchaseRows().length === 1, 'Gumroad’s retry sends it');
  assert((await f.p.sale(SALE)).again && f.sent.length === 1, 'once');
});

test('Sale notice endpoint: only with the secret in its address; answers Gumroad as a form', async () => {
  const env = { LB_MEMORY: '1', PING_SECRET: 'ping-secret-123', LINK_SECRET: 'link-secret', TEST_KEYS: '1', APP_ORIGIN: 'http://localhost:5175' };
  const form = { sale_id: 'T-1', email: 'tester@example.com', license_key: 'TEST-OK-PINGTEST1' };
  assert((await gumroad({ method: 'POST', query: {}, body: form }, env)).status === 403, 'no secret: refused');
  assert((await gumroad({ method: 'POST', query: { k: 'ping-secret-12' }, body: form }, env)).status === 403, 'wrong secret: refused');
  assert((await gumroad({ method: 'POST', query: { k: 'x' }, body: form }, { LB_MEMORY: '1' })).status === 503, 'not set up: refused');
  const before = OUTBOX.length;
  const ok = await gumroad({ method: 'POST', query: { k: 'ping-secret-123' }, body: form }, env);
  assert(ok.status === 200 && ok.body.ok && OUTBOX.length === before + 1 && OUTBOX.at(-1).text.includes('http://localhost:5175/?start#t='), 'right secret: the email (to the local outbox without RESEND_API_KEY)');
  assert((await gumroad({ method: 'GET', query: { action: 'outbox' } }, env)).status === 404, 'the outbox only shows with TEST_MAIL=1');
  const adapter = read('functions/api/[name].js');
  assert(/application\\\/x-www-form-urlencoded/.test(adapter) && /gumroad/.test(adapter), 'Gumroad’s form is read; the route exists');
});

test('The link: unlocks this phone with the usual rules, once, for 7 days; then a new link to the same email', async () => {
  const w = world();
  await w.p.sale(SALE);
  const token = w.linkOf(w.sent[0]);
  const out = await w.p.redeem({ token, device: PHONE });
  assert(out.ok && out.key === KEY && out.email === 'jordan.lee@example.com', 'unlocked, and the key handed to this phone');
  assert(w.store.licenseRows()[0].device === PHONE, 'bound to this phone like any key');
  assert((await w.p.redeem({ token, device: OTHER })).reason === 'link-expired', 'once');
  assert((await w.p.redeem({ token: 'x'.repeat(43), device: OTHER })).reason === 'link-expired' && (await w.p.redeem({ token: '<script>', device: OTHER })).reason === 'link-expired', 'made-up links');
  // A new link (the expired-link screen): same purchase email, rate-limited.
  assert((await w.p.resend({ token })).ok && w.sent.length === 2 && w.sent[1].to === 'jordan.lee@example.com', 'a new link');
  const fresh = w.linkOf(w.sent[1]);
  assert(fresh !== token, 'a different one');
  for (let i = 0; i < LINKS.resends - 1; i++) await w.p.resend({ token });
  assert((await w.p.resend({ token })).reason === 'busy', `at most ${LINKS.resends} an hour`);
  assert((await w.p.resend({ token: 'y'.repeat(43) })).ok && w.sent.length === 1 + LINKS.resends, 'an unknown link: a normal answer, no email');
  w.tick(LINKS.linkMs + 1);
  assert((await w.p.redeem({ token: fresh, device: OTHER })).reason === 'link-expired', '7 days');
});

test('The link counts like any unlock: the move limit applies, and a refused unlock keeps the link', async () => {
  const w = world();
  await w.p.sale(SALE);
  const token = w.linkOf(w.sent[0]);
  for (const d of ['phone-a-00000001', 'phone-b-00000002', 'phone-c-00000003', 'phone-d-00000004']) await w.licensing.activate({ key: KEY, device: d });
  assert((await w.p.redeem({ token, device: PHONE })).reason === 'moves', 'a 4th move in 30 days: refused');
  assert(!(await w.store.getToken(tokenHash(token))).usedAt, 'the link still works later');
  w.tick(31 * DAY);
  assert((await w.p.redeem({ token, device: PHONE })).reason === 'link-expired', 'until it expires');
});

test('Codes: 6 digits to the purchase email; same answer for anyone; 10 minutes, 5 tries', async () => {
  const w = world();
  await w.p.sale(SALE);
  w.sent.length = 0;
  for (let i = 0; i < 50; i++) assert(/^\d{6}$/.test(newCode()), 'six digits');
  assert((await w.p.codeSend({ email: 'nobody@example.com' })).ok && w.sent.length === 0, 'an email that never bought: the same answer, nothing sent');
  let bad = 0;
  await w.p.codeSend({ email: 'not an email' }).catch((e) => { bad = e.status; });
  assert(bad === 400, 'a typo in the address says so');
  assert((await w.p.codeSend({ email: ' JORDAN.lee@example.com ' })).ok && w.sent.length === 1, 'any spelling of the buyer’s email');
  const code = /(\d{6}) is your Sightrep code/.exec(w.sent[0].subject)[1];
  assert(!JSON.stringify(w.store.codeRows()).includes(code), 'codes are stored only as hashes');
  assert((await w.p.codeCheck({ email: BUYER, code: '000000' === code ? '111111' : '000000', device: PHONE })).reason === 'code-wrong', 'a wrong code');
  const out = await w.p.codeCheck({ email: BUYER, code, device: PHONE, app: true });
  assert(out.ok && out.key === KEY, 'the right one unlocks');
  assert((await w.p.codeCheck({ email: BUYER, code, device: OTHER })).reason === 'code-expired', 'once');
  await w.p.codeSend({ email: BUYER });
  const code2 = /(\d{6})/.exec(w.sent.at(-1).subject)[1];
  for (let i = 0; i < LINKS.codeTries; i++) await w.p.codeCheck({ email: BUYER, code: code2 === '123456' ? '654321' : '123456', device: OTHER });
  assert((await w.p.codeCheck({ email: BUYER, code: code2, device: OTHER })).reason === 'code-expired', '5 tries, then a new code');
  await w.p.codeSend({ email: BUYER });
  const code3 = /(\d{6})/.exec(w.sent.at(-1).subject)[1];
  w.tick(LINKS.codeMs + 1);
  assert((await w.p.codeCheck({ email: BUYER, code: code3, device: OTHER })).reason === 'code-expired', '10 minutes');
  let busy = '';
  for (let i = 0; i < LINKS.codesPerEmail + 1; i++) busy = (await w.p.codeSend({ email: BUYER })).reason ?? '';
  assert(busy === 'busy', 'codes per email are limited');
});

test('Sign-in log: every unlock, how it happened; Coach tools mask the email and flag 3+ phones', async () => {
  const w = world();
  await w.p.sale(SALE);
  await w.p.redeem({ token: w.linkOf(w.sent[0]), device: PHONE });
  await w.licensing.activate({ key: KEY, device: OTHER, how: 'paste' });
  await w.licensing.activate({ key: KEY, device: 'phone-cccc-0003', how: 'qr' });
  await w.licensing.activate({ key: KEY, device: 'phone-dddd-0004', how: 'nonsense' });
  const svc = createService(w.store, { pin: '2468', now: w.now });
  const { token } = await svc.unlock({ pin: '2468' });
  const out = await svc.admin({ token, action: 'signins' });
  assert(out.signins.map((s) => s.how).sort().join() === 'link,paste,qr,typed', `how: ${out.signins.map((s) => s.how)}`);
  assert(out.signins.every((s) => s.who === 'j•••@example.com' && s.phones === 4), JSON.stringify(out.signins[0]));
  assert(!JSON.stringify(out).includes('jordan') && !JSON.stringify(out).includes(KEY), 'no full email or key leaves the server');
  assert(maskEmail('A@b.co') === 'a•••@b.co', 'masking');
  assert(out.ping?.status === 'ok', 'the last sale notice, for setting up');
  const ui = read('js/score/ui.js');
  assert(/Recent sign-ins/.test(ui) && /is-flagged/.test(ui) && /x\.phones >= 3/.test(ui), 'Coach tools show them, 3+ phones flagged');
});

test('The phone: a link or code saves the key like a pasted one; the link leaves the address bar', async () => {
  const storage = new Map();
  const st = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) };
  const fetch = async (url, opts) => {
    const b = JSON.parse(opts.body);
    const body = b.action === 'redeem' ? { ok: true, moved: false, key: KEY, email: 'jordan.lee@example.com' } : { ok: false, reason: 'code-wrong' };
    return { ok: true, status: 200, json: async () => body };
  };
  const license = createLicense({ storage: st, fetch });
  assert(license.needed(), 'locked');
  assert((await license.redeem('t'.repeat(43))).ok && !license.needed() && license.key() === KEY, 'unlocked by the link, key kept');
  assert((await license.codeCheck('x@y.z', '000000')).reason === 'code-wrong', 'a wrong code says so');
  const main = read('js/main.js');
  assert(/const linkToken = \/\^#t=\//.test(main) && /if \(handoff \|\| linkToken\) history\.replaceState/.test(main), '#t= is read, then cleared from the address');
  const unlock = read('js/unlock.js');
  assert(/autocomplete="one-time-code"/.test(unlock) && /inputmode="numeric"/.test(unlock), 'iPhone can fill the code in from Mail');
  assert(/data-act="resend"/.test(unlock) && /license\.resend\(autoToken\)/.test(unlock), 'an expired link offers a new one');
});

test('The emails: one big Start Sightrep button, install steps, help; the code email; nothing else', () => {
  const s = startEmail({ link: 'https://app.sightrep.app/?start#t=abc' });
  assert(s.subject === 'Start Sightrep' && s.html.includes('href="https://app.sightrep.app/?start#t=abc"') && />Start Sightrep</.test(s.html), 'the button');
  assert(/Add to Home Screen/.test(s.text) && /Install Sightrep/.test(s.text) && /sightrep\.app\/install/.test(s.text) && /once, for 7 days/.test(s.text), 'iPhone, Android, help, and how long it works');
  const c = codeEmail({ code: '482913' });
  assert(c.subject === '482913 is your Sightrep code' && /10 minutes/.test(c.text), 'the code email');
  const mail = read('api/_lib/mail.js');
  assert(/start@sightrep\.app/.test(mail) && /reply_to: REPLY_TO/.test(mail) && /support@sightrep\.app/.test(mail), 'from start@, replies to support@');
  const privacy = read('../site/src/privacy.html');
  assert(/email address you bought with/i.test(privacy) && /Resend/.test(privacy) && /encrypted/i.test(privacy), 'Privacy: the purchase email, the encrypted key, Resend');
});
