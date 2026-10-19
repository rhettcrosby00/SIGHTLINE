// Builds sightrep.app (the marketing site) into dist/. Cloudflare Pages runs
// `npm run build` here (project "sightrep-site", root directory `site`).
// The words that must match the app come from the app's own files:
//   the waiver and disclaimer: ../sightline/js/content/safety.js
//   the price and store link:  ../sightline/js/content/pro.js
//   the logo and icons:        ../sightline/assets/logo, ../sightline/icons
// Reviews: src/reviews.json, real quotes only, each with the athlete's
// permission: [{ "quote": "…", "name": "Jordan", "sport": "Wide receiver",
// "permission": true }]. With none, the section isn't shown at all.
// Then it checks the result; any problem stops the build (nothing goes live).
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { WAIVER, DISCLAIMER } from '../sightline/js/content/safety.js';
import { PRO } from '../sightline/js/content/pro.js';

const here = new URL('./', import.meta.url);
const app = new URL('../sightline/', import.meta.url);
const out = new URL('dist/', here);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const reviews = JSON.parse(readFileSync(new URL('src/reviews.json', here), 'utf8'));
const reviewProblems = reviews.flatMap((r, i) => [
  !(typeof r.quote === 'string' && r.quote.length >= 10 && r.quote.length <= 300) && `review ${i + 1}: the quote must be 10 to 300 characters`,
  !/^[A-Z][A-Za-z'’-]{1,20}$/.test(r.name ?? '') && `review ${i + 1}: first name only (one word), like "Jordan"`,
  !(typeof r.sport === 'string' && r.sport.trim() && r.sport.length <= 40) && `review ${i + 1}: add the sport or position`,
  r.permission !== true && `review ${i + 1}: needs "permission": true (the athlete said it's OK to quote them)`,
]).filter(Boolean);
const reviewsSection = reviews.length ? `<section class="band reviews" aria-labelledby="reviews-title">
  <h2 id="reviews-title" class="title">What athletes say</h2>
  <ul class="reviews__list">
    ${reviews.map((r) => `<li class="review"><blockquote>“${esc(r.quote.trim().replace(/^["“]|["”]$/g, ''))}”</blockquote><p class="review__who">${esc(r.name)} · ${esc(r.sport.trim())}</p></li>`).join('\n    ')}
  </ul>
</section>
` : '';

const fill = (html) => html
  .replaceAll('{{REVIEWS}}', reviewsSection)
  .replaceAll('{{BUY_URL}}', esc(PRO.buyUrl))
  .replaceAll('{{PRICE}}', esc(PRO.price))
  .replaceAll('{{PRICE_NOTE}}', esc(`${PRO.priceNote.replace(/^\(|\)/g, '').replace(/\. One time, for this phone\.$/, '.')}`))
  .replaceAll('{{DISCLAIMER}}', esc(DISCLAIMER));

const head = ({ title, description, path }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#0A0B08">
  <link rel="canonical" href="https://sightrep.app${path}">
  <link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
  <link rel="icon" href="/icons/favicon-32.png" sizes="32x32" type="image/png">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Sightrep">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="https://sightrep.app${path}">
  <meta property="og:image" content="https://sightrep.app/assets/share.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Barlow:wght@400;500;600;700&display=swap">
  <link rel="stylesheet" href="/site.css">
</head>
<body>
  <header class="top"><div class="wrap">
    <a class="top__logo" href="/" aria-label="Sightrep home"><img src="/assets/logo/logo-horizontal.svg" width="1139" height="253" alt="Sightrep"></a>
    <nav class="top__nav" aria-label="Main">
      <a href="https://app.sightrep.app">Open the app</a>
      <a class="btn btn--buy" href="${esc(PRO.buyUrl)}">Buy</a>
    </nav>
  </div></header>
  <main id="main">
`;

const foot = () => `
  </main>
  <footer class="foot"><div class="wrap">
    <a class="foot__logo" href="/" aria-label="Sightrep home"><img src="/assets/logo/logo-horizontal.svg" width="1139" height="253" alt="Sightrep"></a>
    <nav class="foot__links" aria-label="Footer">
      <a href="/waiver">Safety waiver</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="https://app.sightrep.app">Open the app</a>
      <a href="mailto:support@sightrep.app">support@sightrep.app</a>
    </nav>
    <p class="foot__note">${esc(DISCLAIMER)}</p>
    <p class="foot__note">© ${new Date().getFullYear()} Sightrep</p>
  </div></footer>
</body>
</html>
`;

// A source page starts with <!-- title: … | description: … -->.
function page(file, path) {
  const src = readFileSync(new URL(`src/${file}`, here), 'utf8');
  const [, title, description] = /^<!-- title: (.+?) \| description: (.+?) -->\n/.exec(src) ?? [];
  if (!title) throw new Error(`${file}: missing the title/description line`);
  return head({ title, description, path }) + fill(src.slice(src.indexOf('-->') + 4)) + foot();
}

const waiver = () => head({ title: 'Safety waiver · Sightrep', description: 'The safety waiver every athlete accepts in Sightrep before first use.', path: '/waiver' }) + `
<article class="doc" aria-labelledby="doc-title">
  <h1 id="doc-title" class="display">Safety waiver</h1>
  <p class="doc__meta">Version ${WAIVER.version} · effective ${esc(WAIVER.effective)}</p>
  <p class="lead">The app shows this waiver before first use, and again whenever it changes. ${esc(WAIVER.intro.replace('Please read this waiver. ', ''))}</p>
  ${WAIVER.sections.map((s, i) => `<h2>${i + 1}. ${esc(s.heading)}</h2>\n  <p>${esc(s.body)}</p>`).join('\n  ')}
  <h2>In the app, you confirm</h2>
  <ul>${Object.values(WAIVER.checks).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
</article>
` + foot();

const notFound = () => head({ title: 'Not found · Sightrep', description: 'This page doesn’t exist.', path: '/404' }) + `
<article class="doc"><h1 class="display">Not found</h1><p class="lead">This page doesn’t exist. <a href="/">Go to the home page</a> or <a href="https://app.sightrep.app">open the app</a>.</p></article>
` + foot();

// ---- Build ----
rmSync(out, { recursive: true, force: true });
mkdirSync(new URL('assets/logo/', out), { recursive: true });
mkdirSync(new URL('icons/', out), { recursive: true });
const pages = {
  'index.html': page('index.html', '/'),
  'privacy.html': page('privacy.html', '/privacy'),
  'terms.html': page('terms.html', '/terms'),
  'waiver.html': waiver(),
  '404.html': notFound(),
};
for (const [name, html] of Object.entries(pages)) writeFileSync(new URL(name, out), html);
cpSync(new URL('src/site.css', here), new URL('site.css', out));
cpSync(new URL('assets/screens/', here), new URL('assets/screens/', out), { recursive: true });
cpSync(new URL('assets/poster.webp', here), new URL('assets/poster.webp', out));
cpSync(new URL('assets/share.png', app), new URL('assets/share.png', out));
for (const f of ['logo-horizontal.svg']) cpSync(new URL(`assets/logo/${f}`, app), new URL(`assets/logo/${f}`, out));
for (const f of ['icon.svg', 'favicon-32.png', 'favicon-16.png', 'apple-touch-icon.png']) cpSync(new URL(`icons/${f}`, app), new URL(`icons/${f}`, out));

// ---- Checks: any problem stops the build ----
const problems = [...reviewProblems];
for (const [name, html] of Object.entries(pages)) {
  if (/\{\{|\}\}/.test(html)) problems.push(`${name}: a {{placeholder}} wasn't filled`);
  if (!html.includes(esc(DISCLAIMER))) problems.push(`${name}: the disclaimer is missing`);
  for (const link of ['href="/waiver"', 'href="/privacy"', 'href="/terms"', 'mailto:support@sightrep.app']) {
    if (!html.includes(link)) problems.push(`${name}: footer link ${link} is missing`);
  }
  if (/coming soon|lorem|todo|draft/i.test(html.replace(/<[^>]+>/g, ' '))) problems.push(`${name}: placeholder or "coming soon" wording`);
  if (/<script/i.test(html)) problems.push(`${name}: a script (the site is plain pages)`);
  for (const [, ref] of html.matchAll(/(?:src|href)="(\/[^"#]*)"/g)) {
    const file = ref === '/' ? 'index.html' : /\.[a-z0-9]+$/.test(ref) ? ref.slice(1) : `${ref.slice(1)}.html`;
    if (!existsSync(new URL(file, out))) problems.push(`${name}: links to ${ref}, which isn't built`);
  }
}
const index = pages['index.html'];
if ((index.match(new RegExp(`href="${PRO.buyUrl.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"`, 'g')) ?? []).length < 3) problems.push('index.html: Buy buttons should go to the Gumroad store');
if (!index.includes(PRO.price) || !pages['terms.html'].includes('$30 plus $5.50') || !PRO.priceNote.includes('$30 + $5.50')) problems.push('price wording out of step with js/content/pro.js');
for (const s of WAIVER.sections) if (!pages['waiver.html'].includes(esc(s.body))) problems.push(`waiver.html: section "${s.heading}" differs from the app`);
const screens = readdirSync(new URL('assets/screens/', out));
for (const [, img] of index.matchAll(/src="\/assets\/screens\/([\w-]+\.webp)"/g)) if (!screens.includes(img)) problems.push(`missing screenshot ${img}`);

if (problems.length) {
  console.error(`Site build failed:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`built ${Object.keys(pages).length} pages into site/dist (checks passed)`);
