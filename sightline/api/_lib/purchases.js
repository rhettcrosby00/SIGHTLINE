// Purchases (6.6): from Gumroad's sale notice to a phone unlocked with no key typed.
//   sale()       Gumroad's notice (api/gumroad.js): checked with Gumroad's own license check (the
//                email and sale must match), kept (email, sale, the key encrypted with
//                LINK_SECRET, the key's hash), and the "Start Sightrep" email sent, once per sale.
//   redeem()     the email's link (?start#t=…): once, for 7 days; it unlocks this phone with the
//                same rules as any key (moves, the device limit) and hands the key back to it.
//   resend()     a used or expired link: a new one to the same purchase email (rate-limited).
//   codeSend()   a 6-digit code to a purchase email; the same answer whether or not it bought.
//   codeCheck()  the code: 10 minutes, 5 tries; then the same unlock as a link.
// Links, codes and emails are stored only as hashes; the key itself only encrypted. Every
// unlock is logged (time, how, the key's hash, the start of the phone's random ID) for Coach
// tools' Recent sign-ins, where sharing shows up.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cleanKey } from '../../js/license.js';
import { startEmail, codeEmail } from './email-words.js';
import { keyHash } from './keys.js';
import { HttpError } from './service.js';

const DAY = 86400000;
export const LINKS = {
  linkMs: 7 * DAY,        // a Start Sightrep link works for 7 days, once
  codeMs: 10 * 60000,     // a code works for 10 minutes…
  codeTries: 5,           // …and 5 tries
  windowS: 3600,          // rate limits, per hour:
  resends: 3,             //   new links per purchase
  codesPerEmail: 5,       //   codes per email
  perNetwork: 30,         //   link, code and resend requests per network
};
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const sha = (s) => createHash('sha256').update(s).digest('hex');
export const cleanEmail = (e) => String(e ?? '').trim().toLowerCase().slice(0, 254);
export const tokenHash = (t) => sha(`sightrep-link:${t}`);
export const emailHash = (e) => sha(`sightrep-email:${cleanEmail(e)}`);
export const newToken = () => b64u(crypto.getRandomValues(new Uint8Array(32)));
export function newCode() {
  const r = new Uint32Array(1);
  do crypto.getRandomValues(r); while (r[0] >= 4294000000);   // no bias toward low numbers
  return String(r[0] % 1000000).padStart(6, '0');
}
// j•••@gmail.com, for Coach tools.
export const maskEmail = (e) => { const [u, d] = cleanEmail(e).split('@'); return d ? `${u.slice(0, 1)}•••@${d}` : '•••'; };

// The key, encrypted with LINK_SECRET (AES-GCM), and back.
async function aesKey(secret) {
  if (!secret) throw new HttpError(503, 'Sign-in by email isn’t set up yet.');
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`sightrep-keys:${secret}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function sealKey(key, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), new TextEncoder().encode(cleanKey(key))));
  return `${b64u(iv)}.${b64u(ct)}`;
}
export async function openKey(sealed, secret) {
  const [iv, ct] = String(sealed).split('.').map(unb64u);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await aesKey(secret), ct));
}
const codeHash = (email, code, secret) => createHmac('sha256', `sightrep-code:${secret}`).update(`${cleanEmail(email)}|${code}`).digest('hex');
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// verify(key) → { valid, refunded, email, saleId } (Gumroad); licensing: createLicensing(…)
// (api/_lib/license.js); mail: createMailer(…) (api/_lib/mail.js); origin: where links open.
export function createPurchases(store, { verify, licensing, mail, secret, origin = 'https://app.sightrep.app', testKeys = false, now = () => Date.now() }) {
  const busy = async (bucket, max) => (await store.hit(bucket, LINKS.windowS)) > max;
  const unlock = async (purchase, input, ip, how) => {
    const key = await openKey(purchase.keyEnc, secret);
    const out = await licensing.activate({ ...input, key, how }, ip);
    return out.ok ? { ...out, key, email: purchase.email } : out;
  };
  async function sendLink(purchase) {
    const token = newToken();
    await store.putToken({ hash: tokenHash(token), saleId: purchase.saleId, expiresAt: now() + LINKS.linkMs });
    await mail.send({ to: purchase.email, ...startEmail({ link: `${origin}/?start#t=${token}` }) });
  }

  return {
    // Gumroad's sale notice (form fields). Always answers; problems are noted for Coach tools
    // (field names only, never values) so a setup problem shows without anyone reading the data.
    async sale(form = {}) {
      const note = (status) => store.setMeta('ping', JSON.stringify({ at: now(), status, fields: Object.keys(form).sort() }));
      const saleId = String(form.sale_id ?? '').slice(0, 100);
      const email = cleanEmail(form.email);
      const key = cleanKey(form.license_key);
      if (!saleId || !EMAIL.test(email)) { await note('missing sale or email'); return { ok: false, reason: 'missing' }; }
      if (!key) { await note('no license key in the notice'); return { ok: false, reason: 'no-key' }; }
      const g = await verify(key);
      const test = testKeys && key.startsWith('TEST-');   // previews and local runs only
      if (!g.valid || (!test && (cleanEmail(g.email) !== email || (g.saleId && g.saleId !== saleId)))) {
        await note('the key didn’t match the sale');
        return { ok: false, reason: 'mismatch' };
      }
      const known = await store.getPurchase(saleId);
      if (known?.emailedAt) { await note('ok (already sent)'); return { ok: true, again: true }; }   // Gumroad retried
      const purchase = known ?? { saleId, email, keyEnc: await sealKey(key, secret), keyHash: keyHash(key), at: now() };
      if (!known) await store.putPurchase(purchase);
      // A failed send answers 500 (Gumroad tries again within 3 hours); noted so it shows.
      try { await sendLink(purchase); } catch (err) { await note('the email didn’t send (Resend)'); throw err; }
      await store.markEmailed(saleId, now());
      await note(form.test === 'true' ? 'ok (test sale)' : 'ok');
      return { ok: true };
    },

    // The email's link, on this phone. input: { token, device, app?, restore? }.
    async redeem(input = {}, ip = 'unknown') {
      if (await busy(`link:${ip}`, LINKS.perNetwork)) return { ok: false, reason: 'busy' };
      if (!TOKEN.test(String(input.token ?? ''))) return { ok: false, reason: 'link-expired' };
      const t = await store.getToken(tokenHash(input.token));
      if (!t || t.usedAt || t.expiresAt < now()) return { ok: false, reason: 'link-expired' };
      const purchase = await store.getPurchase(t.saleId);
      if (!purchase) return { ok: false, reason: 'link-expired' };
      const out = await unlock(purchase, input, ip, 'link');
      if (out.ok) await store.useToken(tokenHash(input.token), now());   // a refused unlock (moves) keeps the link
      return out;
    },

    // A used or expired link: a new one, to the same purchase email.
    async resend({ token } = {}, ip = 'unknown') {
      if (await busy(`link:${ip}`, LINKS.perNetwork)) return { ok: false, reason: 'busy' };
      const t = TOKEN.test(String(token ?? '')) ? await store.getToken(tokenHash(token)) : null;
      const purchase = t && await store.getPurchase(t.saleId);
      if (!purchase) return { ok: true };   // nothing to say about links we don't know
      if (await busy(`resend:${purchase.saleId}`, LINKS.resends)) return { ok: false, reason: 'busy' };
      await sendLink(purchase);
      return { ok: true };
    },

    // A 6-digit code to a purchase email. The same answer whether or not it bought.
    async codeSend({ email } = {}, ip = 'unknown') {
      const e = cleanEmail(email);
      if (!EMAIL.test(e)) throw new HttpError(400, 'Check your email address.');
      if (await busy(`link:${ip}`, LINKS.perNetwork) || await busy(`code:${emailHash(e)}`, LINKS.codesPerEmail)) return { ok: false, reason: 'busy' };
      const [latest] = await store.purchasesByEmail(e);
      if (latest) {
        const code = newCode();
        await store.putCode({ emailHash: emailHash(e), saleId: latest.saleId, codeHash: codeHash(e, code, secret), expiresAt: now() + LINKS.codeMs });
        await mail.send({ to: latest.email, ...codeEmail({ code }) });
      }
      return { ok: true };
    },

    // The code back: { email, code, device, app?, restore? } → the same answer as a link.
    async codeCheck(input = {}, ip = 'unknown') {
      const e = cleanEmail(input.email);
      const code = String(input.code ?? '').replace(/\D/g, '');
      if (await busy(`link:${ip}`, LINKS.perNetwork)) return { ok: false, reason: 'busy' };
      const c = EMAIL.test(e) ? await store.getCode(emailHash(e)) : null;
      if (!c || c.expiresAt < now()) return { ok: false, reason: 'code-expired' };
      if (await store.bumpCode(emailHash(e)) > LINKS.codeTries) { await store.deleteCode(emailHash(e)); return { ok: false, reason: 'code-expired' }; }
      if (code.length !== 6 || !same(codeHash(e, code, secret), c.codeHash)) return { ok: false, reason: 'code-wrong' };
      const purchase = await store.getPurchase(c.saleId);
      if (!purchase) return { ok: false, reason: 'code-expired' };
      const out = await unlock(purchase, input, ip, 'code');
      if (out.ok) await store.deleteCode(emailHash(e));
      return out;
    },
  };
}

// Every unlock, for Coach tools (createLicensing's log).
export const signinLog = (store, { now = () => Date.now() } = {}) =>
  ({ hash, device, how }) => store.addSignin({ at: now(), keyHash: hash, device: String(device).slice(0, 8), how });
