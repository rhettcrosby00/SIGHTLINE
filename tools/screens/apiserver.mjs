// Local stand-in for Cloudflare: runs the app's /api functions through the same
// entry point Cloudflare uses (sightline/functions/api/[name].js), with
// in-memory storage (no database) on :5176. Coach PIN for local testing: 2468.
// Email sign-in (6.6): nothing is sent; GET /api/gumroad?action=outbox shows what would have
// been (TEST_MAIL), links open on the app's test server (APP_ORIGIN), and the sale notice
// answers /api/gumroad?k=test-ping. These are test-only stand-ins, not real secrets.
import http from 'node:http';
const { onRequest } = await import(new URL('../../sightline/functions/api/[name].js', import.meta.url));
const env = { LB_MEMORY: '1', COACH_PIN: '2468', TEST_KEYS: '1',   // test keys (TEST-OK-…) work locally
  TEST_MAIL: '1', APP_ORIGIN: 'http://localhost:5175', PING_SECRET: 'test-ping', LINK_SECRET: 'local-test-only' };
http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const url = new URL(req.url, 'http://localhost:5176');
  const headers = Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string'));
  const request = new Request(url, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : raw });
  const out = await onRequest({ request, env, params: { name: url.pathname.replace(/^\/api\//, '') } });
  res.statusCode = out.status;
  out.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(await out.text());
}).listen(5176, () => console.log('api on 5176'));
