// Website reviews (v6.2), run by tests/run.js: anyone can send one from
// sightrep.app/review; it waits until the owner approves it in Coach tools;
// only approved ones show. The server rules (api/_lib/reviews.js), the owner's
// tasks (api/_lib/service.js), which sites may call it (CORS), and that the
// website's form and script match. The browser half: tools/screens/scenarios/site.mjs.

import { readFileSync } from 'node:fs';
import { test, assert } from './harness.js';
import { createReviews, reviewProblem, corsOrigin, REVIEWS } from '../api/_lib/reviews.js';
import { memoryStore } from '../api/_lib/memory-store.js';
import { createService } from '../api/_lib/service.js';
import { onRequest } from '../functions/api/[name].js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const GOOD = { name: 'jordan', sport: 'Wide receiver', stars: 5, text: 'Quick and it wakes my eyes up before games.', consent: true, age: true, website: '' };

test('Reviews: a good one passes; each missing or wrong field says what to fix', () => {
  assert(reviewProblem(GOOD) === '', reviewProblem(GOOD));
  const bad = {
    name: ['', 'Jordan Smith', 'J0rdan', 'x'.repeat(21)],
    sport: ['', 'a', 'x'.repeat(41)],
    stars: [0, 6, 4.5, '5', null],
    text: ['', 'Good app', 'x'.repeat(REVIEWS.textMax + 1)],
    consent: [false, 'true', undefined],
    age: [false, undefined],
  };
  for (const [field, values] of Object.entries(bad)) {
    for (const v of values) {
      const p = reviewProblem({ ...GOOD, [field]: v });
      assert(p && p !== 'spam', `${field} = ${JSON.stringify(v)} should be refused`);
    }
  }
  assert(reviewProblem({ ...GOOD, name: 'Zoë' }) === '' && reviewProblem({ ...GOOD, name: 'O’Neil' }) === '', 'names with accents or apostrophes are fine');
  assert(reviewProblem({ ...GOOD, website: 'http://spam.example' }) === 'spam', 'the hidden field catches bots');
  assert(/name/i.test(reviewProblem({ ...GOOD, name: 'Shit' })), 'offensive names are refused (js/score/names.js)');
});

test('Reviews: new ones wait as pending; only approved ones show, newest first, with count and average', async () => {
  let t = Date.parse('2026-10-20T12:00:00Z');
  const store = memoryStore({ now: () => t });
  const reviews = createReviews(store, { now: () => t });
  assert((await reviews.list()).reviews.length === 0, 'starts empty');
  assert((await reviews.submit(GOOD, 'ip-1')).ok, 'saved');
  t += 1000;
  await reviews.submit({ ...GOOD, name: 'Ava', stars: 4, text: '  Short   warm-up,  easy to   use. ' }, 'ip-2');
  t += 1000;
  await reviews.submit({ ...GOOD, name: 'Sam', stars: 2 }, 'ip-3');
  const pending = await store.reviewsBy('pending');
  assert(pending.length === 3 && (await reviews.list()).reviews.length === 0, 'nothing shows before it is approved');
  assert(pending[0].name === 'Sam' && pending[2].name === 'Jordan', 'newest first, first letter capitalized');
  assert(pending[1].text === 'Short warm-up, easy to use.', `spaces tidied: "${pending[1].text}"`);
  for (const r of pending) await store.setReviewStatus(r.id, r.name === 'Sam' ? 'rejected' : 'approved');
  const out = await reviews.list();
  assert(out.reviews.map((r) => r.name).join() === 'Ava,Jordan', out.reviews.map((r) => r.name).join());
  assert(out.count === 2 && out.average === 4.5, `${out.count} reviews, average ${out.average}`);
  assert(Object.keys(out.reviews[0]).sort().join() === 'at,name,sport,stars,text', 'the website gets only what it shows');
});

test('Reviews: the spam trap saves nothing; 3 per hour per network', async () => {
  let t = Date.parse('2026-10-20T12:00:00Z');
  const store = memoryStore({ now: () => t });
  const reviews = createReviews(store, { now: () => t });
  assert((await reviews.submit({ ...GOOD, website: 'x' }, 'ip-bot')).ok, 'bots see a normal answer');
  assert((await store.reviewsBy('pending')).length === 0, 'and nothing is saved');
  for (let i = 0; i < REVIEWS.perHour; i++) await reviews.submit(GOOD, 'ip-busy');
  let status = 0;
  await reviews.submit(GOOD, 'ip-busy').catch((err) => { status = err.status; });
  assert(status === 429, `the 4th in an hour is refused (${status})`);
  await reviews.submit(GOOD, 'ip-other');
  t += 3601 * 1000;
  await reviews.submit(GOOD, 'ip-busy');
  assert((await store.reviewsBy('pending')).length === REVIEWS.perHour + 2, 'other networks, and the next hour, are fine');
  status = 0;
  await reviews.submit({ ...GOOD, stars: 9 }, 'ip-x').catch((err) => { status = err.status; });
  assert(status === 400, 'a bad review is a 400 with words');
});

test('Reviews: the owner approves, rejects or removes in Coach tools, only with the coach PIN', async () => {
  const store = memoryStore();
  const svc = createService(store, { pin: '2468' });
  await createReviews(store).submit(GOOD, 'ip-1');
  await createReviews(store).submit({ ...GOOD, name: 'Ava' }, 'ip-2');
  for (const token of [undefined, '', 'nope', '123.abc']) {
    let status = 0;
    await svc.admin({ token, action: 'reviews' }).catch((err) => { status = err.status; });
    assert(status === 401, `no PIN, no reviews (${token} → ${status})`);
  }
  const { token } = await svc.unlock({ pin: '2468' });
  const first = await svc.admin({ token, action: 'reviews' });
  assert(first.pending.length === 2 && first.approved.length === 0, 'both wait for the owner');
  const [ava, jordan] = first.pending;
  await svc.admin({ token, action: 'review-approve', id: jordan.id });
  await svc.admin({ token, action: 'review-reject', id: ava.id });
  const next = await svc.admin({ token, action: 'reviews' });
  assert(next.pending.length === 0 && next.approved.map((r) => r.name).join() === 'Jordan', 'approved shows; rejected is gone from both lists');
  await svc.admin({ token, action: 'review-remove', id: jordan.id });
  assert((await svc.admin({ token, action: 'reviews' })).approved.length === 0, 'removed');
  let status = 0;
  await svc.admin({ token, action: 'review-approve', id: 999 }).catch((err) => { status = err.status; });
  assert(status === 404, 'a review that is gone says so');
});

test('Reviews: only sightrep.app, its previews and the local site may call the API (CORS)', async () => {
  for (const ok of ['https://sightrep.app', 'https://feature-look-and-reviews.sightrep-site.pages.dev', 'https://sightrep-site.pages.dev', 'http://localhost:5177']) {
    assert(corsOrigin(ok) === ok, `${ok} allowed`);
  }
  for (const no of ['', 'https://evil.example', 'https://sightrep.app.evil.example', 'http://sightrep.app', 'https://x.sightrep-site.pages.dev.evil.example', 'https://app.sightrep.app.evil.example', 'null']) {
    assert(corsOrigin(no) === '', `${no} refused`);
  }
  const preflight = (origin) => onRequest({ request: new Request('http://x/api/reviews', { method: 'OPTIONS', headers: { Origin: origin } }), env: { LB_MEMORY: '1' }, params: { name: 'reviews' } });
  const yes = await preflight('https://sightrep.app');
  assert(yes.status === 204 && yes.headers.get('Access-Control-Allow-Origin') === 'https://sightrep.app' && /POST/.test(yes.headers.get('Access-Control-Allow-Methods')), 'the website’s preflight is answered');
  const no = await preflight('https://evil.example');
  assert(!no.headers.get('Access-Control-Allow-Origin'), 'other sites get no permission');
});

test('Reviews: through Cloudflare’s entry point, a sent review is saved but not shown until approved', async () => {
  const env = { LB_MEMORY: '1' };
  const call = (method, { query = '', body, ip = '203.0.113.9' } = {}) => onRequest({
    request: new Request(`http://x/api/reviews${query}`, { method, headers: { Origin: 'https://sightrep.app', 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }),
    env, params: { name: 'reviews' },
  });
  const before = await (await call('GET', { query: '?action=list' })).json();
  const sent = await call('POST', { body: { action: 'submit', ...GOOD, text: 'Through the front door, end to end.' } });
  assert(sent.status === 200 && sent.headers.get('Access-Control-Allow-Origin') === 'https://sightrep.app', `sent (${sent.status})`);
  const after = await (await call('GET', { query: '?action=list' })).json();
  assert(after.count === before.count && !after.reviews.some((r) => r.text.startsWith('Through the front door')), 'pending reviews never show');
  const wrong = await call('POST', { body: { action: 'submit', ...GOOD, stars: 0 } });
  assert(wrong.status === 400 && (await wrong.json()).error, 'a bad review gets words back');
});

test('Reviews: the website’s form sends what the server checks, as text only, to the right address', () => {
  const form = read('../site/src/review.html');
  const fields = [...form.matchAll(/\bname="(\w+)"/g)].map((m) => m[1]);
  for (const f of ['stars', 'name', 'sport', 'text', 'consent', 'age', 'website']) assert(fields.includes(f), `the form has no ${f} field`);
  assert(/maxlength="400"/.test(form) && /maxlength="20"/.test(form) && /maxlength="40"/.test(form), 'the form’s limits match the server');
  assert(form.includes('OK to show my first name, sport and review on sightrep.app') && form.includes('16 or older'), 'both boxes, in plain words');
  const js = read('../site/src/reviews.js');
  for (const a of ["'/api/reviews'", '.sightrep.pages.dev/api/reviews', "'https://app.sightrep.app/api/reviews'"]) assert(js.includes(a), `reviews.js has no ${a}`);
  assert(!/innerHTML|insertAdjacentHTML|outerHTML/.test(js), 'reviews go on the page as text, never HTML');
  const home = read('../site/src/index.html');
  assert(home.indexOf('data-reviews') < home.indexOf('sides-title'), 'reviews come right after the top of the page');
  assert(home.includes('href="/review"'), 'the home page links to the form');
});

test('Reviews: Coach tools show the honest-reviews rule; the database keeps no email', () => {
  const ui = read('js/score/ui.js');
  assert(ui.includes('Approve every honest review, good or bad. Reject only spam, abuse, or reviews not about Sightrep.'), 'the FTC rule sits beside the buttons');
  for (const a of ['review-approve', 'review-reject', 'review-remove']) assert(ui.includes(`data-act="${a}"`), `no ${a} button`);
  const sql = read('api/_lib/sql-store.js');
  const table = sql.slice(sql.indexOf('create table if not exists site_reviews'), sql.indexOf(')`;', sql.indexOf('site_reviews')));
  assert(table && !/email|ip|device|key/i.test(table.replace(/primary key/, '')), 'no email, IP, device or key in the reviews table');
  assert(/check \(status in \('pending', 'approved', 'rejected'\)\)/.test(table) && /check \(stars between 1 and 5\)/.test(table), 'the database enforces status and stars');
});
