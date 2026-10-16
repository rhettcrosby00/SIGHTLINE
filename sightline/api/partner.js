// Partner mode API (a Vercel serverless function at /api/partner).
//   POST { action: 'open', setup }        → { code }      the stand phone opens a room
//   GET  ?action=poll&code=1234&after=N   → { seq, cue, setup }
//   POST { action: 'cue', code, cue }     → { seq }       the coach's phone calls a cue
// Uses the same database as the leaderboard (DATABASE_URL); LB_MEMORY=1 runs
// it without one (local testing only).

import { createPartner } from './_lib/partner.js';
import { partnerMemory, partnerSql } from './_lib/partner-store.js';
import { HttpError } from './_lib/service.js';

let ready = null;
function service() {
  ready ??= (async () => {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    let store;
    if (url) store = await partnerSql(url);
    else if (process.env.LB_MEMORY === '1') store = partnerMemory();
    else return null;
    await store.init();
    return createPartner(store, { secret: url || 'local' });
  })().catch((err) => { ready = null; throw err; });
  return ready;
}

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

export default async function handler(req, res) {
  try {
    const query = req.query ?? Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
    const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    const svc = await service().catch(() => null);
    if (!svc) return send(res, 503, { error: 'Partner mode isn’t connected yet.' });
    if (req.method === 'GET' && query.action === 'poll') return send(res, 200, await svc.poll(query, ip));
    if (req.method === 'POST' && body.action === 'open') return send(res, 200, await svc.open(body, ip));
    if (req.method === 'POST' && body.action === 'cue') return send(res, 200, await svc.send(body, ip));
    return send(res, 404, { error: 'Not found.' });
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message });
    if (err instanceof SyntaxError) return send(res, 400, { error: 'Bad request.' });
    return send(res, 500, { error: 'Something went wrong. Try again.' });
  }
}
