// Leaderboard API (a Vercel serverless function at /api/leaderboard).
//   GET  ?action=board&side=focus|move|all&tab=total|best|week&name=…
//   GET  ?action=names
//   GET  ?action=health        → { db, coach } (true/false only, no secrets)
//   POST { action: 'submit', name, side, score, settings, clientId }
//   POST { action: 'unlock', pin }                  → { token }
//   POST { action: 'admin', token, task, … }        → coach tools (task: scores, rename, remove-name, remove-score, reset-week, reset-all)
// The database address (DATABASE_URL) and COACH_PIN live in Vercel's settings.
// LB_MEMORY=1 runs it without a database (local testing only).

import { createService, HttpError } from './_lib/service.js';

let ready = null;
function service() {
  ready ??= (async () => {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    let store;
    if (url) store = (await import('./_lib/sql-store.js')).sqlStore(url);
    else if (process.env.LB_MEMORY === '1') store = (await import('./_lib/memory-store.js')).memoryStore();
    else return null;
    await store.init();
    return createService(store, { pin: process.env.COACH_PIN || '', secret: url || 'local' });
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
    if (req.method === 'GET' && query.action === 'health') {
      return send(res, 200, { db: !!svc, coach: !!process.env.COACH_PIN });
    }
    if (!svc) return send(res, 503, { error: 'The leaderboard isn’t connected yet.' });

    if (req.method === 'GET') {
      if (query.action === 'board') return send(res, 200, await svc.board({ side: query.side, tab: query.tab, name: query.name }));
      if (query.action === 'names') return send(res, 200, { names: await svc.names() });
    }
    if (req.method === 'POST') {
      if (body.action === 'submit') return send(res, 200, await svc.submit(body, ip));
      if (body.action === 'unlock') return send(res, 200, await svc.unlock(body, ip));
      if (body.action === 'admin') return send(res, 200, await svc.admin({ ...body, action: body.task }));
    }
    return send(res, 404, { error: 'Not found.' });
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message });
    if (err instanceof SyntaxError) return send(res, 400, { error: 'Bad request.' });
    return send(res, 500, { error: 'Something went wrong. Try again.' });
  }
}
