// Cloudflare Pages Functions: /api/leaderboard, /api/partner, /api/license and
// /api/reviews (the website's; it answers sightrep.app's cross-origin calls). Turns
// Cloudflare's request into the plain { method, query, body, ip } that the
// handlers in api/ take, with the project settings (DATABASE_URL, COACH_PIN)
// from Cloudflare (context.env). Everything else on the site is plain files.
import { handle as leaderboard } from '../../api/leaderboard.js';
import { handle as partner } from '../../api/partner.js';
import { handle as license } from '../../api/license.js';
import { handle as reviews } from '../../api/reviews.js';

const ROUTES = { leaderboard, partner, license, reviews };

const json = (status, body, extra = {}) => new Response(body === null ? null : JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
});

export async function onRequest({ request, env = {}, params = {} }) {
  const route = ROUTES[params.name];
  if (!route) return json(404, { error: 'Not found.' });
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') ?? '';
  if (request.method === 'OPTIONS') {
    const out = await route({ method: 'OPTIONS', origin }, env);
    return json(out.status ?? 404, null, out.headers ?? {});
  }
  let body = {};
  if (request.method === 'POST') {
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return json(400, { error: 'Bad request.' });
    }
  }
  const ip = request.headers.get('CF-Connecting-IP')
    || (request.headers.get('X-Forwarded-For') ?? '').split(',')[0].trim() || 'unknown';
  const out = await route({ method: request.method, query: Object.fromEntries(url.searchParams), body, ip, origin }, env);
  return json(out.status, out.body, out.headers ?? {});
}
