// Serves site/dist on :5177 the way Cloudflare Pages does (/privacy → privacy.html,
// unknown paths → 404.html), for the screen checks: node tools/screens/cdp.mjs site
// /api/… goes to the local test API (tools/screens/apiserver.mjs, :5176), so
// the reviews work locally the way they do against app.sightrep.app.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
const DIST = new URL('../../site/dist/', import.meta.url);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try {
      const api = await fetch(`http://localhost:5176${req.url}`, {
        method: req.method, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : raw,
        headers: { 'Content-Type': req.headers['content-type'] ?? 'application/json', 'X-Forwarded-For': req.headers['x-forwarded-for'] ?? '127.0.0.1' },
      });
      res.writeHead(api.status, { 'Content-Type': api.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' });
      return res.end(await api.text());
    } catch {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'The local API (tools/screens/apiserver.mjs, :5176) isn’t running.' }));
    }
  }
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index');
  for (const [file, status] of [[path.slice(1), 200], [`${path.slice(1)}.html`, 200], ['404.html', 404]]) {
    try {
      const body = await readFile(new URL(file, DIST));
      res.writeHead(status, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      return res.end(body);
    } catch { /* try the next */ }
  }
}).listen(5177, () => console.log('site on 5177'));
