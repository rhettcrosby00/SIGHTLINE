// Reviews API, served at /api/reviews (functions/api/[name].js), called by
// the website (sightrep.app), so it answers that site's cross-origin requests.
//   GET  ?action=list                                → { reviews, count, average }
//   POST { action: 'submit', name, sport, stars, text, consent, age, website } → { ok }
// Approving happens in Coach tools (the leaderboard's admin, coach PIN).

import { openStore } from './_lib/open-store.js';
import { createReviews, corsOrigin } from './_lib/reviews.js';
import { HttpError } from './_lib/service.js';

const cors = (origin) => {
  const allow = corsOrigin(origin);
  return allow ? { 'Access-Control-Allow-Origin': allow, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : { Vary: 'Origin' };
};

// One request: { method, query, body, ip, origin } and the project settings → { status, body, headers }.
export async function handle({ method, query = {}, body = {}, ip = 'unknown', origin = '' }, env = {}) {
  const headers = cors(origin);
  if (method === 'OPTIONS') return { status: 204, body: null, headers };
  try {
    const store = await openStore(env).catch(() => null);
    if (!store) return { status: 503, body: { error: 'Reviews aren’t available right now.' }, headers };
    const reviews = createReviews(store);
    if (method === 'GET' && query.action === 'list') return { status: 200, body: await reviews.list(), headers: { ...headers, 'Cache-Control': 'no-store' } };
    if (method === 'POST' && body.action === 'submit') return { status: 200, body: await reviews.submit(body, ip), headers };
    return { status: 404, body: { error: 'Not found.' }, headers };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { error: err.message }, headers };
    return { status: 500, body: { error: 'Something went wrong. Try again.' }, headers };
  }
}
