// License keys API, served at /api/license (functions/api/[name].js).
//   POST { action: 'activate', key, device, app?, restore? } → { ok: true, moved, free, data? } | { ok: false, reason }
//   POST { action: 'check', key, device }    → { ok: true } | { ok: false, reason }
//   POST { action: 'save', key, device, data } → { ok: true } | { ok: false, reason } (the setup saved with the key)
//   POST { action: 'verify', key }           → { ok: true } | { ok: false, reason } (real and paid for; binds nothing)
//   POST { action: 'handoff-put', id, blob } → { ok: true }   (a computer's QR code: the key, encrypted, 10 minutes)
//   POST { action: 'handoff-take', id }      → { ok: true, blob } | { ok: false, reason: 'expired' } (once)
//   POST { action: 'redeem', token, device, app?, restore? } → like activate, plus key and email
//        ("Start Sightrep" in the purchase email; once, 7 days) | { ok: false, reason: 'link-expired' }
//   POST { action: 'resend', token }         → { ok } (a new link to the same purchase email)
//   POST { action: 'code-send', email }      → { ok } (a 6-digit code, if that email bought)
//   POST { action: 'code-check', email, code, device, app?, restore? } → like redeem | code-wrong | code-expired
//   reason: invalid | refunded | moved | installed | moves | busy (api/_lib/license.js)
// Gumroad checks each key (GUMROAD_PRODUCT_ID in the project settings); the
// database keeps which phone each key is on. Test keys work only on preview
// builds (api/_lib/build-info.js), or with TEST_KEYS=1 for local runs.

import { openStore } from './_lib/open-store.js';
import { createLicensing, gumroadVerify } from './_lib/license.js';
import { createPurchases, signinLog } from './_lib/purchases.js';
import { createMailer } from './_lib/mail.js';
import { HttpError } from './_lib/service.js';
import { PREVIEW_BUILD } from './_lib/build-info.js';

// Keys and purchases for one request, with the project settings. host: this site's address
// (where email links open; APP_ORIGIN overrides it for local runs).
export function services(store, env = {}, deps = {}, host = '') {
  const testKeys = PREVIEW_BUILD || env.TEST_KEYS === '1';
  const verify = (key) => gumroadVerify(key, { productId: env.GUMROAD_PRODUCT_ID, testKeys, fetch: deps.fetch });
  const keys = createLicensing(store, { verify, now: deps.now, log: signinLog(store, { now: deps.now }) });
  const purchases = createPurchases(store, {
    verify, licensing: keys, testKeys, now: deps.now, secret: env.LINK_SECRET ?? '',
    mail: createMailer({ apiKey: env.RESEND_API_KEY ?? '', fetch: deps.mailFetch, now: deps.now }),
    origin: env.APP_ORIGIN || host || 'https://app.sightrep.app',
  });
  return { keys, purchases };
}

// One request: { method, body, ip, host } and the project settings → { status, body }.
// deps (tests only): stand-in fetches for Gumroad and the email service, and the clock.
export async function handle({ method, body = {}, ip = 'unknown', host = '' }, env = {}, deps = {}) {
  try {
    const KEYS = { activate: 'activate', check: 'check', save: 'save', verify: 'verify', 'handoff-put': 'handoffPut', 'handoff-take': 'handoffTake' };
    const BY_EMAIL = { redeem: 'redeem', resend: 'resend', 'code-send': 'codeSend', 'code-check': 'codeCheck' };
    if (method !== 'POST' || !(KEYS[body.action] || BY_EMAIL[body.action])) return { status: 404, body: { error: 'Not found.' } };
    const store = await openStore(env).catch(() => null);
    if (!store) return { status: 503, body: { error: 'The server isn’t connected yet.' } };
    const { keys, purchases } = services(store, env, deps, host);
    if (BY_EMAIL[body.action]) return { status: 200, body: await purchases[BY_EMAIL[body.action]](body, ip) };
    return { status: 200, body: await keys[KEYS[body.action]](body, ip) };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { error: err.message } };
    return { status: 500, body: { error: 'Something went wrong. Try again.' } };
  }
}
