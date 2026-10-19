// Gumroad's sale notice ("Ping", Gumroad → Settings → Advanced), served at
// /api/gumroad?k=<PING_SECRET> (functions/api/[name].js). Gumroad posts each sale as a form; we
// check it with Gumroad's own license check and email the buyer "Start Sightrep"
// (api/_lib/purchases.js). A notice without the right k is refused. If sending the email fails
// we answer 500, so Gumroad tries again (once an hour, up to 3 hours); a retry never sends twice.
//   GET ?action=outbox (local test API only, TEST_MAIL=1): the emails that would have gone out.

import { timingSafeEqual } from 'node:crypto';
import { openStore } from './_lib/open-store.js';
import { HttpError } from './_lib/service.js';
import { OUTBOX } from './_lib/mail.js';
import { services } from './license.js';

const sameSecret = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function handle({ method, query = {}, body = {}, host = '' }, env = {}, deps = {}) {
  try {
    if (method === 'GET' && query.action === 'outbox' && env.TEST_MAIL === '1') return { status: 200, body: { mails: OUTBOX } };
    if (method !== 'POST') return { status: 404, body: { error: 'Not found.' } };
    if (!env.PING_SECRET || !env.LINK_SECRET) return { status: 503, body: { error: 'Not set up yet.' } };
    if (!sameSecret(String(query.k ?? ''), env.PING_SECRET)) return { status: 403, body: { error: 'Not allowed.' } };
    const store = await openStore(env).catch(() => null);
    if (!store) return { status: 503, body: { error: 'The server isn’t connected yet.' } };
    const out = await services(store, env, deps, host).purchases.sale(body);
    return { status: 200, body: { ok: out.ok } };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status >= 500 ? 500 : err.status, body: { error: err.message } };
    return { status: 500, body: { error: 'Something went wrong.' } };
  }
}
