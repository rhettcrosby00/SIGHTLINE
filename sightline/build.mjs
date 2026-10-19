// Builds dist/: exactly the files athletes' phones load. Cloudflare Pages serves
// only this folder (wrangler.toml), so tests, server code and notes stay private.
// `npm run build` runs the tests first; a failing test stops the deploy.
import { cpSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SERVED = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'assets', 'splash', 'vendor'];

// On Cloudflare (CF_PAGES_BRANCH is set while it builds): mark preview builds,
// so test keys work there and never on the live site (api/_lib/build-info.js).
export function markBuild(branch, root = new URL('./', import.meta.url)) {
  if (!branch) return null;
  const preview = branch !== 'main';
  writeFileSync(new URL('api/_lib/build-info.js', root), `// Written by build.mjs for branch ${JSON.stringify(branch)}.\nexport const PREVIEW_BUILD = ${preview};\n`);
  return preview;
}

export function build(root = new URL('./', import.meta.url)) {
  const out = new URL('dist/', root);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out);
  for (const p of SERVED) cpSync(new URL(p, root), new URL(p, out), { recursive: true });
  return fileURLToPath(out);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const preview = markBuild(process.env.CF_PAGES_BRANCH);
  console.log(`built ${build()}${preview === null ? '' : preview ? ' (preview build: test keys on)' : ' (live build: test keys off)'}`);
}
