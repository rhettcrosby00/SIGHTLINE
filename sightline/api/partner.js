// Partner mode API, served at /api/partner (Cloudflare Pages Functions:
// functions/api/[name].js turns each request into the plain object below).
//   POST { action: 'open', setup }        → { code }      the stand phone opens a room
//   GET  ?action=poll&code=1234&after=N   → { seq, cue, setup }
//   POST { action: 'cue', code, cue }     → { seq }       the coach's phone calls a cue
// Uses the same database as the leaderboard (DATABASE_URL in the project
// settings); LB_MEMORY=1 runs it without one (local testing only).

import { createPartner } from './_lib/partner.js';
import { partnerMemory, partnerSql } from './_lib/partner-store.js';
import { HttpError } from './_lib/service.js';

let ready = null;
let readyFor = null;
function service(env) {
  const url = env.DATABASE_URL || env.POSTGRES_URL;
  const key = [url, env.LB_MEMORY].join('|');
  if (key !== readyFor) { readyFor = key; ready = null; }
  ready ??= (async () => {
    let store;
    if (url) store = await partnerSql(url);
    else if (env.LB_MEMORY === '1') store = partnerMemory();
    else return null;
    await store.init();
    return createPartner(store, { secret: url || 'local' });
  })().catch((err) => { ready = null; throw err; });
  return ready;
}

// One request: { method, query, body, ip } and the project settings → { status, body }.
export async function handle({ method, query = {}, body = {}, ip = 'unknown' }, env = {}) {
  try {
    const svc = await service(env).catch(() => null);
    if (!svc) return { status: 503, body: { error: 'Partner mode isn’t connected yet.' } };
    if (method === 'GET' && query.action === 'poll') return { status: 200, body: await svc.poll(query, ip) };
    if (method === 'POST' && body.action === 'open') return { status: 200, body: await svc.open(body, ip) };
    if (method === 'POST' && body.action === 'cue') return { status: 200, body: await svc.send(body, ip) };
    return { status: 404, body: { error: 'Not found.' } };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { error: err.message } };
    return { status: 500, body: { error: 'Something went wrong. Try again.' } };
  }
}
