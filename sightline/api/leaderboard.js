// Leaderboard API, served at /api/leaderboard (Cloudflare Pages Functions:
// functions/api/[name].js turns each request into the plain object below).
//   GET  ?action=board&side=focus|move|all&tab=total|best|week&name=…
//   GET  ?action=names
//   GET  ?action=health        → { db, coach } (true/false only, no secrets)
//   POST { action: 'submit', name, side, score, settings, clientId }
//   POST { action: 'unlock', pin }                  → { token }
//   POST { action: 'admin', token, task, … }        → coach tools (task: scores, rename, remove-name, remove-score, reset-week, reset-all, reset-key)
// The database address (DATABASE_URL) and COACH_PIN live in Cloudflare's
// project settings (env). LB_MEMORY=1 runs it without a database (local testing only).

import { createService, HttpError, databaseUrl } from './_lib/service.js';
import { openStore, storeProblem } from './_lib/open-store.js';

async function service(env) {
  const store = await openStore(env);
  return store && createService(store, { pin: env.COACH_PIN || '', secret: databaseUrl(env) || 'local' });
}

// One request: { method, query, body, ip } and the project settings → { status, body }.
export async function handle({ method, query = {}, body = {}, ip = 'unknown' }, env = {}) {
  try {
    const svc = await service(env).catch(() => null);
    if (method === 'GET' && query.action === 'health') {
      return { status: 200, body: { db: !!svc, coach: !!env.COACH_PIN, ...(svc ? {} : { problem: storeProblem() }) } };
    }
    if (!svc) return { status: 503, body: { error: 'The leaderboard isn’t connected yet.' } };

    if (method === 'GET') {
      if (query.action === 'board') return { status: 200, body: await svc.board({ side: query.side, tab: query.tab, name: query.name }) };
      if (query.action === 'names') return { status: 200, body: { names: await svc.names() } };
    }
    if (method === 'POST') {
      if (body.action === 'submit') return { status: 200, body: await svc.submit(body, ip) };
      if (body.action === 'unlock') return { status: 200, body: await svc.unlock(body, ip) };
      if (body.action === 'admin') return { status: 200, body: await svc.admin({ ...body, action: body.task }) };
    }
    return { status: 404, body: { error: 'Not found.' } };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { error: err.message } };
    return { status: 500, body: { error: 'Something went wrong. Try again.' } };
  }
}
