// Sightrep license keys (sold on Gumroad): one phone at a time per key.
// Gumroad answers whether a key is real and still paid for; the database keeps
// which phone it's on (a hash of the key, never the key). Entering a key on a
// new phone moves it there, at most KEYS.moves times in KEYS.moveDays days; the
// old phone locks at its next daily check (js/license.js).
// The home-screen app: on iPhone it keeps its own storage, apart from Safari, so it
// looks like a new phone. The first move into a home-screen app is free (it doesn't
// count toward the limit), once per key; Safari then hears "installed", not "moved".
// The key also holds the phone's saved setup (js/backup.js): save() keeps it, and
// activate({ restore }) sends it back to a phone that has none yet.

import { cleanKey } from '../../js/license.js';
import { BACKUP_KEYS, BACKUP_MAX } from '../../js/backup.js';
import { keyHash } from './keys.js';
import { HttpError } from './service.js';

export const KEYS = {
  moves: 3,            // moves to a new phone…
  moveDays: 30,        // …per 30 days
  tries: 40,           // key attempts per network (a whole team on one school Wi-Fi)…
  checks: 120,         // …and daily checks…
  saves: 240,          // …and setup saves…
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

// Why a saved setup can't be kept, or '' when it's fine: an object of the BACKUP_KEYS items, as text.
export function backupProblem(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Bad request.';
  if (Object.entries(data).some(([k, v]) => !BACKUP_KEYS.includes(k) || typeof v !== 'string')) return 'Bad request.';
  return JSON.stringify(data).length > BACKUP_MAX ? 'Too much to save.' : '';
}

// verify(key) → { valid, refunded }. Answers { ok: true, moved?, free?, data? } or { ok: false, reason }:
// invalid | refunded | moved (the key is on another phone) | installed (it moved into this
// phone's home-screen app) | moves (moved too often) | busy.
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
    // input.app: this is a home-screen app. input.restore: send back the saved setup.
    async activate(input, ip = 'unknown') {
      const { key, device } = read(input);
      if (await store.hit(`key:${ip}`, KEYS.windowS) > KEYS.tries) return { ok: false, reason: 'busy' };
      const problem = await paid(key);
      if (problem) return { ok: false, reason: problem };
      const hash = keyHash(key);
      const rec = await store.getLicense(hash);
      const t = now();
      const saved = async () => (input.restore === true ? { data: await store.getKeyData(hash) } : {});
      if (!rec) await store.putLicense({ hash, device, boundAt: t, moves: [], appMove: null });
      if (!rec || rec.device === device) return { ok: true, moved: false, ...(await saved()) };
      const moves = rec.moves.filter((m) => m > t - KEYS.moveDays * DAY);
      const free = input.app === true && !rec.appMove;   // the first move into a home-screen app
      if (!free && moves.length >= KEYS.moves) return { ok: false, reason: 'moves' };
      await store.putLicense({ hash, device, boundAt: t, moves: free ? moves : [...moves, t],
        appMove: free ? { at: t, from: rec.device } : rec.appMove ? { at: rec.appMove.at, from: null } : null });
      return { ok: true, moved: true, free, ...(await saved()) };
    },

    // This phone's setup, saved with its key (only by the phone the key is on).
    async save(input, ip = 'unknown') {
      const { key, device } = read(input);
      if (await store.hit(`save:${ip}`, KEYS.windowS) > KEYS.saves) return { ok: false, reason: 'busy' };
      const problem = backupProblem(input.data);
      if (problem) throw new HttpError(400, problem);
      const hash = keyHash(key);
      const rec = await store.getLicense(hash);
      if (!rec || rec.device !== device) return { ok: false, reason: 'moved' };
      await store.putKeyData(hash, input.data, now());
      return { ok: true };
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
        await store.putLicense({ hash, device, boundAt: now(), moves: [], appMove: null });
        return { ok: true };
      }
      if (rec.device === device) return { ok: true };
      return { ok: false, reason: rec.appMove?.from === device ? 'installed' : 'moved' };
    },
  };
}
