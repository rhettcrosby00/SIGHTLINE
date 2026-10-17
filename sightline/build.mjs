// Builds dist/: exactly the files athletes' phones load. Cloudflare Pages serves
// only this folder (wrangler.toml), so tests, server code and notes stay private.
// `npm run build` runs the tests first; a failing test stops the deploy.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SERVED = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'assets', 'splash', 'vendor'];

export function build(root = new URL('./', import.meta.url)) {
  const out = new URL('dist/', root);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out);
  for (const p of SERVED) cpSync(new URL(p, root), new URL(p, out), { recursive: true });
  return fileURLToPath(out);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(`built ${build()}`);
