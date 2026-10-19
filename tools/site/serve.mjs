// Serves site/dist on :5177 the way Cloudflare Pages does (/privacy → privacy.html,
// unknown paths → 404.html), for the screen checks: node tools/screens/cdp.mjs site
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
const DIST = new URL('../../site/dist/', import.meta.url);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index');
  for (const [file, status] of [[path.slice(1), 200], [`${path.slice(1)}.html`, 200], ['404.html', 404]]) {
    try {
      const body = await readFile(new URL(file, DIST));
      res.writeHead(status, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      return res.end(body);
    } catch { /* try the next */ }
  }
}).listen(5177, () => console.log('site on 5177'));
