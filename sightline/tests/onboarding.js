// A buyer's first minute (v6.5), run by tests/run.js: "Start Sightrep" → Paste your key (no
// typing) → the waiver (step 1) → You're in → Make it yours → Home screen → the 3-minute first
// session. Progress is saved and resumed, finished steps never repeat, phones set up before
// never see it. On a computer, a QR code hands the unlock to the phone (the server can't read
// the key). The server counts how many people reach each step: totals only.
// The browser half: tools/screens/scenarios/first-run.mjs.

import { readFileSync } from 'node:fs';
import { test, assert } from './harness.js';
import { createOnboarding, nextStep, stepLabel, ORDER, READY_MS } from '../js/onboarding.js';
import { sealKey, openKey, handoffLink } from '../js/handoff.js';
import { qrMatrix } from '../js/lib/qr.js';
import { looksLikeKey } from '../js/unlock.js';
import { FIRST, SETUP_STEPS } from '../js/content/firstrun.js';
import { FOCUS_SESSIONS, sessionById, planSteps, totalMinutes } from '../js/plan.js';
import { createLicensing, HANDOFF_MS } from '../api/_lib/license.js';
import { memoryStore } from '../api/_lib/memory-store.js';
import { createService } from '../api/_lib/service.js';
import { createRng } from '../js/lib/rng.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const verifyAll = async (key) => ({ valid: key !== 'BAD-KEY-0000', refunded: false });

test('Setup order: the waiver is step 1, then You’re in, Make it yours, Home screen, then Let’s try it', () => {
  assert(ORDER.join() === 'ready,yours,install,finish', ORDER.join());
  assert(stepLabel('waiver') === 'Step 1 of 4' && stepLabel('ready') === 'Step 2 of 4' && stepLabel('yours') === 'Step 3 of 4' && stepLabel('install') === 'Step 4 of 4', 'four numbered steps');
  assert(stepLabel('yours', { installStep: false }) === 'Step 3 of 3' && stepLabel('install', { installStep: false }) === '', 'the home-screen step drops out in the home-screen app');
  assert(stepLabel('finish') === '', 'the finish has no number');
  assert(READY_MS === 1500, '“You’re in” moves on by itself after 1.5 seconds');
  const src = read('js/onboarding.js');
  assert(/back: \{ yours: 'ready', install: 'yours', finish: 'install' \}/.test(src.replace(/const back = /, 'back: ')), 'Back on every step after You’re in');
  assert(/head\('ready', false\)/.test(src) && !/showWaiver/.test(src), 'no Back to the waiver (it’s accepted once)');
  assert(/data-ob="skip"[^]*FIRST\.yours\.skip/.test(src) && FIRST.yours.skip === 'Skip for now', 'Skip for now on Make it yours');
  assert(/data-ob="later"[^]*FIRST\.install\.later/.test(src) && FIRST.install.later === 'Remind me later' && FIRST.install.done === 'Done', 'Done and Remind me later');
  assert(FIRST.finish.title === 'Let’s try it. 3 minutes.' && FIRST.finish.start === 'Start' && FIRST.finish.explore === 'Explore on my own', 'the finish');
  assert(/if \(id === 'install' && !installStep\(\)\)/.test(src) && /install\.standalone\(\) \|\| install\.added\(\)/.test(src), 'step 4 is skipped in the home-screen app, or once it’s added');
});

test('Resume and never repeat: progress saved after every step; phones set up before go straight home', () => {
  assert(nextStep(null) === 'ready' && nextStep({}) === 'ready', 'a new phone starts after the waiver');
  for (const step of ['yours', 'install', 'finish']) assert(nextStep({ step }) === step, `closed at ${step}: back there`);
  assert(nextStep({ step: 'done' }) === 'done' && nextStep(null, { setupDone: true }) === 'done', 'done, and phones set up before 6.5');
  assert(nextStep({ step: 'nonsense' }) === 'ready', 'a broken record starts over, not stuck');
  const was = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body).step); return { ok: true }; };
  try {
    const storage = memory();
    const install = { standalone: () => false, added: () => false };
    const a = createOnboarding({ storage, install });
    assert(a.active(), 'a new phone sets up');
    a.track('waiver');
    a.track('waiver');
    a.track('nonsense');
    const again = createOnboarding({ storage, install });
    again.track('waiver');
    again.track('ready');
    assert(sent.join() === 'waiver,ready', `each step counted once per phone: ${sent}`);
    storage.setItem('sightrep.onboard.v1', JSON.stringify({ step: 'done', sent }));
    assert(!createOnboarding({ storage, install }).active(), 'finished: never again');
    const old = memory({ 'sightrep.settings.v1': JSON.stringify({ setupDone: true }) });
    assert(!createOnboarding({ storage: old, install }).active(), 'set up before 6.5: never');
    assert(!createOnboarding({ storage: memory(), install, skip: true }).active(), 'not with ?noguide or a direct drill link');
    assert(createOnboarding({ storage: memory(), install: { standalone: () => true, added: () => true } }).waiverLabel() === 'Step 1 of 3', 'in the home-screen app: 3 steps');
  } finally {
    globalThis.fetch = was;
  }
});

test('Paste your key: no typing; a clipboard without a key says what to do; typing is still there', () => {
  for (const ok of ['ABCD1234-EF567890-1234ABCD-5678EF90', ' abcd1234-ef567890-1234abcd-5678ef90 ', 'TEST-OK-1234', 'TEST-OK-ABCDEFGH', 'ABCDEFGH-ABCDEFGH-ABCDEFGH-ABCDEFGH']) assert(looksLikeKey(ok), `${ok} is a key`);
  for (const no of ['', 'hello', 'https://crosby91.gumroad.com/l/sightrep', 'Your license key is below', 'ABCDEFGH', 'Thanks for buying Sightrep!']) assert(!looksLikeKey(no), `“${no}” is not a key`);
  const unlock = read('js/unlock.js');
  assert(/data-act="paste-go"/.test(unlock) && /FIRST\.buyer\.paste/.test(unlock) && FIRST.buyer.paste === 'Paste your key', 'one big Paste your key');
  assert(/if \(!looksLikeKey\(text\)\) \{ say\(FIRST\.buyer\.noKey, true\); return; \}/.test(unlock) && /Tap Copy next to your key/.test(FIRST.buyer.noKey), 'the clipboard has no key: what to do');
  assert(/FIRST\.buyer\.enter/.test(unlock) && FIRST.buyer.enter === 'Have a license key? Enter it here' && /keyBox\(!canPaste\)/.test(unlock), 'typing it, behind a small link (open when Paste can’t work)');
  assert(/mode: standalone \? 'app' : fromStart \|\| handoff \|\| token \? 'buyer' : 'sales'/.test(read('js/main.js')), 'buyers from “Start Sightrep” (?start, or the email link), the home-screen app, and everyone else');
  assert(/license\.activate\(raw, \{ \.\.\.activate, how \}\)/.test(unlock), 'the same activation, limits and moves as typing it');
});

test('Computer to phone: the QR link carries the key sealed; the server can’t read it; once, 10 minutes', async () => {
  const KEY = 'ABCD1234-EF567890-1234ABCD-5678EF90';
  const sealed = await sealKey(KEY);
  assert(/^[A-Za-z0-9_-]{22}$/.test(sealed.id) && /^[A-Za-z0-9_-]{43}$/.test(sealed.secret), 'random id and secret');
  assert(!sealed.blob.includes(KEY) && !sealed.blob.includes(KEY.slice(0, 8)), 'the blob is scrambled');
  assert(await openKey(sealed.secret, sealed.blob) === KEY, 'and opens with the secret');
  const other = await sealKey(KEY);
  assert(await openKey(other.secret, sealed.blob) === '' && await openKey(sealed.secret, 'junk.junk') === '', 'not with another secret, nor junk');
  const link = handoffLink('https://app.sightrep.app', sealed);
  assert(link === `https://app.sightrep.app/?start#h=${sealed.id}.${sealed.secret}` && !link.includes(KEY), 'the secret sits after #, which browsers never send');
  assert(qrMatrix(link).version <= 7, `fits a small QR code (version ${qrMatrix(link).version})`);

  let t = Date.UTC(2026, 9, 21);
  const store = memoryStore({ now: () => t });
  const keys = createLicensing(store, { verify: verifyAll, now: () => t });
  assert((await keys.verify({ key: KEY })).ok && (await keys.verify({ key: 'BAD-KEY-0000' })).reason === 'invalid', 'the computer checks the key first (nothing bound)');
  assert(store.licenseRows().length === 0, 'checking binds no phone');
  assert((await keys.handoffPut({ id: sealed.id, blob: sealed.blob })).ok, 'left on the server');
  assert(!JSON.stringify(store.handoffRows()).includes(sealed.id) && !JSON.stringify(store.handoffRows()).includes(KEY), 'stored by a hash of the id, never the key');
  const took = await keys.handoffTake({ id: sealed.id });
  assert(took.ok && await openKey(sealed.secret, took.blob) === KEY, 'the phone takes it and opens it');
  assert((await keys.handoffTake({ id: sealed.id })).reason === 'expired', 'once');
  await keys.handoffPut({ id: other.id, blob: other.blob });
  t += HANDOFF_MS + 1;
  assert((await keys.handoffTake({ id: other.id })).reason === 'expired', '10 minutes');
  let bad = 0;
  await keys.handoffPut({ id: 'x', blob: 'y' }).catch((e) => { bad = e.status; });
  assert(bad === 400, 'nonsense is refused');
  const busy = createLicensing(memoryStore(), { verify: verifyAll });
  let reason = '';
  for (let i = 0; i < 40 && reason !== 'busy'; i++) reason = (await busy.handoffPut({ id: (await sealKey(KEY)).id, blob: sealed.blob }, 'ip-1')).reason ?? '';
  assert(reason === 'busy', 'rate-limited');
  const src = read('js/handoff.js');
  assert(/history\.replaceState/.test(read('js/main.js')) && /takeHandoff\(handoff\)/.test(read('js/main.js')), 'the phone clears the secret from the address bar and unlocks by itself');
  assert(/FIRST\.desktop\.here/.test(src) && FIRST.desktop.here === 'Continue on this computer' && FIRST.desktop.heading === 'Sightrep works best on your phone', 'or keep going on the computer');
});

test('The first session: about 3 minutes, breathing then Color Call with its example and practice, unscored, on no menu', () => {
  const first = sessionById.first;
  assert(first && first.unscored && first.first && totalMinutes('first', 'standard') === 3, 'three minutes, off the board');
  const steps = planSteps('first', { length: 'standard' }, createRng(7), { guideFor: () => 'full' });
  assert(steps.map((s) => s.id).join() === 'settle,colorcall', steps.map((s) => s.id).join());
  assert(steps.every((s) => s.guide === 'full') && steps.reduce((a, s) => a + s.durationMs + s.introMs, 0) === 180000, 'full how-to (example and practice), 3 minutes exactly');
  const focus = read('js/focus.js');
  assert(/!s\.first\)/.test(focus) && /if \(meta\.first\) settings\.guide = 'full';[^\n]*\n\s*else onRun/.test(focus), 'not on the FOCUS menu or Run last; every example and practice');
  assert(/startFirst = \(\) => focus\.start\('first', \{ from: 'start' \}\)/.test(read('js/main.js')), 'Start runs it, inside the tap');
  assert(FOCUS_SESSIONS.filter((s) => s.first).length === 1, 'one first session');
});

test('Step totals: known steps only, nothing that identifies anyone, shown in Coach tools; Privacy says so', async () => {
  let t = Date.UTC(2026, 9, 21, 12);
  const store = memoryStore({ now: () => t });
  const svc = createService(store, { pin: '2468', now: () => t });
  for (const step of ['opened', 'unlocked', 'unlocked', 'waiver']) await svc.step({ step }, 'ip-9');
  let status = 0;
  await svc.step({ step: 'secret-data' }).catch((e) => { status = e.status; });
  assert(status === 400, 'unknown steps are refused');
  const rows = store.funnelRows();
  assert(rows.every(([k]) => /^\d{4}-\d{2}-\d{2}\|[a-z-]+$/.test(k)), `only day and step: ${rows.map(([k]) => k)}`);
  assert(!JSON.stringify(rows).includes('ip-9'), 'no network address kept with it');
  let denied = 0;
  await svc.admin({ action: 'setup-steps' }).catch((e) => { denied = e.status; });
  assert(denied === 401, 'Coach tools only');
  const { token } = await svc.unlock({ pin: '2468' });
  const out = await svc.admin({ token, action: 'setup-steps' });
  assert(out.steps.map((s) => s.step).join() === Object.keys(SETUP_STEPS).join(), 'every step, in the setup’s order');
  assert(out.steps.find((s) => s.step === 'unlocked').count === 2 && out.steps.find((s) => s.step === 'start').count === 0, 'with its total');
  t += 31 * 86400000;
  const later = (await svc.unlock({ pin: '2468' })).token;
  assert((await svc.admin({ token: later, action: 'setup-steps' })).steps.every((s) => s.count === 0), 'the last 30 days');
  assert(/data-act="setup-steps"|setup-steps/.test(read('js/score/ui.js')), 'Coach tools show them');
  assert(/totals of first-time setup steps/i.test(read('../site/src/privacy.html')), 'Privacy: the one line about it');
});
