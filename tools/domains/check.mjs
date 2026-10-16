// Checks every Sightrep web address from the outside: HTTPS works, redirects
// are permanent and land on the right page, the app is the one we expect, and
// email DNS is right (Cloudflare forwarding, exactly one SPF record, DMARC).
// usage: node tools/domains/check.mjs [expected app version]
import { resolveMx, resolveTxt } from 'node:dns/promises';
import { connect } from 'node:tls';

const want = process.argv[2];
const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass, detail });

async function head(url) {
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  return { status: res.status, location: res.headers.get('location') };
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
// Each address: what it should do.
const SITES = [
  { url: 'https://app.sightrep.app/', expect: 200 },
  { url: 'https://sightrep.app/', expect: 200 },
  { url: 'https://www.sightrep.app/', expect: [301, 308], to: 'https://sightrep.app/' },
  { url: 'http://app.sightrep.app/', expect: [301, 308], to: 'https://app.sightrep.app/' },
  { url: 'http://sightrep.app/', expect: [301, 308], to: 'https://sightrep.app/' },
  ...OPTIONAL.map((h) => ({ url: `https://${h}/`, expect: [301, 308], to: 'https://sightrep.app/' })),
];

for (const s of SITES) {
  try {
    const r = await head(s.url);
    const codes = [].concat(s.expect);
    const lands = !s.to || (r.location && new URL(r.location, s.url).href === s.to);
    ok(`${s.url} → ${s.to ?? 'page'}`, codes.includes(r.status) && lands, `${r.status}${r.location ? ` → ${r.location}` : ''}`);
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
