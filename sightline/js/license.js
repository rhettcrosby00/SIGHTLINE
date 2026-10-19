// The Sightrep key (sold on Gumroad) on this phone: one phone at a time.
// Saved here: the key, when the server last said it's good, and this phone's
// random ID. Checks run at most once a day when online; with no signal the app
// keeps working for 30 days after the last good check. With saved data blocked,
// an unlock lasts for this visit.
// TODO accounts: once athletes sign in, the key can live on the account.

const KEY = 'sightrep.license.v1';
const PHONE = 'sightrep.device.v1';
const DAY = 86400000;
export const LICENSE = { recheckMs: DAY, graceMs: 30 * DAY, timeoutMs: 8000 };

// One spelling of a key, on the phone and on the server.
export const cleanKey = (key) => String(key ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 100);

const safeStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;

export function createLicense({ storage = safeStorage(), fetch = (...a) => globalThis.fetch(...a), now = () => Date.now(), api = '/api/license' } = {}) {
  let visit = null;
  let phone = null;
  const read = () => { try { return JSON.parse(storage.getItem(KEY) ?? 'null'); } catch { return null; } };
  const save = (r) => { visit = r; try { storage.setItem(KEY, JSON.stringify(r)); } catch { /* blocked: this visit only */ } };
  const record = () => read() ?? visit;
  const device = () => {
    if (phone) return phone;
    try { phone = storage.getItem(PHONE); } catch { /* blocked */ }
    if (!/^[A-Za-z0-9-]{8,64}$/.test(phone ?? '')) {
      phone = newId();
      try { storage.setItem(PHONE, phone); } catch { /* blocked */ }
    }
    return phone;
  };
  async function call(action, key) {
    let res;
    try {
      res = await fetch(api, {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, key, device: device() }), signal: AbortSignal.timeout?.(LICENSE.timeoutMs),
      });
    } catch {
      return { ok: false, reason: 'offline' };
    }
    if (res.status === 429) return { ok: false, reason: 'busy' };
    const body = await res.json().catch(() => null);
    return res.ok && body ? body : { ok: false, reason: 'store' };
  }

  return {
    // True until this phone has a key the server called good in the last 30 days.
    needed() {
      const r = record();
      return !(r?.state === 'ok' && now() - r.checkedAt < LICENSE.graceMs);
    },
    // Why this phone is locked: moved | refunded | invalid | expired (no check in 30 days), or null.
    lockedFor() {
      const r = record();
      if (r?.state === 'locked') return r.reason;
      return r?.state === 'ok' && this.needed() ? 'expired' : null;
    },
    last4: () => (record()?.state === 'ok' ? record().key.slice(-4) : ''),

    // A key typed on the unlock screen → { ok, moved } or { ok: false, reason }.
    async activate(raw) {
      const key = cleanKey(raw);
      if (!key) return { ok: false, reason: 'empty' };
      const out = await call('activate', key);
      if (out.ok) save({ key, state: 'ok', checkedAt: now() });
      return out;
    },

    // The daily check (or now, with force). Resolves to why it locked
    // (moved | refunded | invalid), or null when it's fine or can't tell yet.
    async recheck({ force = false } = {}) {
      const r = record();
      if (!r?.key || r.state !== 'ok' || (!force && now() - r.checkedAt < LICENSE.recheckMs)) return null;
      const out = await call('check', r.key);
      if (out.ok) { save({ ...r, checkedAt: now() }); return null; }
      if (!['moved', 'refunded', 'invalid'].includes(out.reason)) return null;   // offline or busy: next time
      save({ ...r, state: 'locked', reason: out.reason });
      return out.reason;
    },
  };
}
