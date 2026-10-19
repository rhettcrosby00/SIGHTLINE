// Checks every Sightrep web address from the outside: HTTPS works, redirects
// are permanent and land on the right page, the app is served by Cloudflare
// Pages and is the version we expect, the server is connected, and email DNS
// is right (Cloudflare forwarding, exactly one SPF record, DMARC).
// usage: node tools/domains/check.mjs [expected app version]
import { resolveMx, resolveTxt } from 'node:dns/promises';
import { connect } from 'node:tls';

const want = process.argv[2];
const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass, detail });

async function head(url) {
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  return { status: res.status, location: res.headers.get('location'), server: res.headers.get('server'), vercel: res.headers.has('x-vercel-id') };
}
function cert(host) {
  return new Promise((resolve) => {
    const s = connect({ host, port: 443, servername: host, timeout: 10000 }, () => {
      const c = s.getPeerCertificate();
      resolve({ authorized: s.authorized, until: c.valid_to, names: c.subjectaltname });
      s.end();
    });
    s.on('error', (e) => resolve({ authorized: false, error: e.message }));
  });
}

const OPTIONAL = process.env.GETSIGHTREP ? ['getsightrep.com', 'www.getsightrep.com'] : [];
// Each address: what it should do. One app address (app.sightrep.app), so a
// phone's saved data and its key live in one place; sightrep.app is the
// website (site/), www goes to it, and the old address goes to the app.
const APP = 'https://app.sightrep.app/';
const SITE = 'https://sightrep.app/';
const SITES = [
  { url: APP, expect: 200, cloudflare: true },
  { url: SITE, expect: 200, cloudflare: true, says: 'Reps for your eyes.' },
  { url: 'https://www.sightrep.app/', expect: [301, 308], to: SITE },
  { url: 'http://app.sightrep.app/', expect: [301, 308], to: APP },
  { url: 'http://sightrep.app/', expect: [301, 308], to: SITE },
  { url: 'https://sightline-psi.vercel.app/', expect: [301, 308], to: APP },
  ...OPTIONAL.map((h) => ({ url: `https://${h}/`, expect: [301, 308], to: SITE })),
];

for (const s of SITES) {
  try {
    const r = await head(s.url);
    const codes = [].concat(s.expect);
    const lands = !s.to || (r.location && [].concat(s.to).includes(new URL(r.location, s.url).href));
    ok(`${s.url} → ${[].concat(s.to ?? 'page')[0]}`, codes.includes(r.status) && lands, `${r.status}${r.location ? ` → ${r.location}` : ''}`);
    if (s.cloudflare) ok(`${s.url} is served by Cloudflare Pages`, r.server === 'cloudflare' && !r.vercel, `server: ${r.server}${r.vercel ? ', still Vercel' : ''}`);
    if (s.says) {
      const text = await (await fetch(s.url, { cache: 'no-store' })).text();
      ok(`${s.url} is the website`, text.includes(s.says), text.includes(s.says) ? `says "${s.says}"` : 'not the website yet');
    }
  } catch (e) {
    ok(s.url, false, e.message);
  }
}
for (const host of ['app.sightrep.app', 'sightrep.app', 'www.sightrep.app', ...OPTIONAL]) {
  const c = await cert(host);
  ok(`HTTPS certificate for ${host}`, c.authorized, c.error ?? `valid until ${c.until}`);
}
if (want) {
  const js = await (await fetch('https://app.sightrep.app/js/main.js', { cache: 'no-store' })).text();
  const v = /APP_VERSION = '([\d.]+)'/.exec(js)?.[1];
  ok(`app.sightrep.app runs version ${want}`, v === want, `found ${v}`);
}
const health = await fetch(`${APP}api/leaderboard?action=health`, { cache: 'no-store' }).then((r) => r.json()).catch((e) => ({ error: e.message }));
ok('Leaderboard server connected (database and coach PIN)', health.db === true && health.coach === true, JSON.stringify(health));
const mx = (await resolveMx('sightrep.app').catch(() => [])).map((m) => m.exchange);
ok('Email: Cloudflare forwarding (MX)', mx.length > 0 && mx.every((m) => m.endsWith('mx.cloudflare.net')), mx.join(', '));
const spf = (await resolveTxt('sightrep.app').catch(() => [])).map((t) => t.join('')).filter((t) => t.startsWith('v=spf1'));
ok('Email: exactly one SPF record', spf.length === 1, spf.join(' | '));
const dmarc = (await resolveTxt('_dmarc.sightrep.app').catch(() => [])).map((t) => t.join(''));
ok('Email: DMARC record (added with the sending service)', dmarc.some((t) => t.startsWith('v=DMARC1')), dmarc.join(' | ') || 'none yet');

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
