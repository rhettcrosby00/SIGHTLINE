// Sightrep license keys (sold on Gumroad): one phone at a time per key.
// Gumroad answers whether a key is real and still paid for; the database keeps
// which phone it's on (a hash of the key, never the key). Entering a key on a
// new phone moves it there, at most KEYS.moves times in KEYS.moveDays days; the
// old phone locks at its next daily check (js/license.js).

import { cleanKey } from '../../js/license.js';
import { keyHash } from './keys.js';
import { HttpError } from './service.js';

export const KEYS = {
  moves: 3,            // moves to a new phone…
  moveDays: 30,        // …per 30 days
  tries: 40,           // key attempts per network (a whole team on one school Wi-Fi)…
  checks: 120,         // …and daily checks…
  windowS: 600,        // …per 10 minutes
};
const DAY = 86400000;
const PHONE = /^[A-Za-z0-9-]{8,64}$/;

// Gumroad's public license check: no secret needed, and it never counts a use.
// Test keys (TEST-OK-…, TEST-REFUNDED-…) answer only when testKeys is on.
export async function gumroadVerify(key, { productId, testKeys = false, fetch = (...a) => globalThis.fetch(...a) } = {}) {
  if (key.startsWith('TEST-')) {
    if (!testKeys) return { valid: false };
    return { valid: /^TEST-(OK|REFUNDED)-[A-Z0-9]+$/.test(key), refunded: key.startsWith('TEST-REFUNDED-') };
  }
  if (!productId) throw new HttpError(503, 'The store isn’t set up yet.');
  let res;
  try {
    res = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ product_id: productId, license_key: key, increment_uses_count: 'false' }).toString(),
    });
  } catch {
    throw new HttpError(503, 'The store didn’t answer.');
  }
  if (res.status === 404) return { valid: false };
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new HttpError(503, 'The store didn’t answer.');
  if (!body.success) return { valid: false };
  const p = body.purchase ?? {};
  return { valid: true, refunded: !!(p.refunded || p.chargebacked || p.disputed) };
}

// verify(key) → { valid, refunded }. Answers { ok: true, moved? } or { ok: false, reason }:
// invalid | refunded | moved (the key is on another phone) | moves (moved too often) | busy.
export function createLicensing(store, { verify, now = () => Date.now() }) {
  const read = ({ key, device } = {}) => {
    if (!PHONE.test(String(device ?? ''))) throw new HttpError(400, 'Bad request.');
    return { key: cleanKey(key), device: String(device) };
  };
  async function paid(key) {
    if (!key) return 'invalid';
    const g = await verify(key);
    if (!g.valid) return 'invalid';
    return g.refunded ? 'refunded' : null;
  }

  return {
    // A key entered on this phone: it unlocks here, moving from any other phone.
    async activate(input, ip = 'unknown') {
      const { key, device } = read(input);
      if (await store.hit(`key:${ip}`, KEYS.windowS) > KEYS.tries) return { ok: false, reason: 'busy' };
      const problem = await paid(key);
      if (problem) return { ok: false, reason: problem };
      const hash = keyHash(key);
      const rec = await store.getLicense(hash);
      const t = now();
      if (!rec) await store.putLicense({ hash, device, boundAt: t, moves: [] });
      if (!rec || rec.device === device) return { ok: true, moved: false };
      const moves = rec.moves.filter((m) => m > t - KEYS.moveDays * DAY);
      if (moves.length >= KEYS.moves) return { ok: false, reason: 'moves' };
      await store.putLicense({ hash, device, boundAt: t, moves: [...moves, t] });
      return { ok: true, moved: true };
    },

    // The daily check: still paid for, and still on this phone?
    async check(input, ip = 'unknown') {
      const { key, device } = read(input);
      if (await store.hit(`check:${ip}`, KEYS.windowS) > KEYS.checks) return { ok: false, reason: 'busy' };
      const problem = await paid(key);
      if (problem) return { ok: false, reason: problem };
      const hash = keyHash(key);
      const rec = await store.getLicense(hash);
      if (!rec) {   // freed in Coach tools: it stays on this phone
        await store.putLicense({ hash, device, boundAt: now(), moves: [] });
        return { ok: true };
      }
      return rec.device === device ? { ok: true } : { ok: false, reason: 'moved' };
    },
  };
}
