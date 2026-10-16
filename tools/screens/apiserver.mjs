// Local stand-in for Vercel: runs the app's /api functions with in-memory
// storage (no database) on :5176. Coach PIN for local testing: 2468.
import http from 'node:http';
process.env.LB_MEMORY = '1';
process.env.COACH_PIN = '2468';
const api = (name) => import(new URL(`../../sightline/api/${name}.js`, import.meta.url)).then((m) => m.default);
const handlers = { leaderboard: await api('leaderboard'), partner: await api('partner') };
http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const url = new URL(req.url, 'http://localhost');
  const handler = handlers[url.pathname.replace(/^\/api\//, '')];
  if (!handler) { res.statusCode = 404; return res.end('{}'); }
  req.query = Object.fromEntries(url.searchParams);
  req.body = raw ? JSON.parse(raw) : {};
  await handler(req, res);
}).listen(5176, () => console.log('api on 5176'));
