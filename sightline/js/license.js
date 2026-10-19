// The Sightrep key (sold on Gumroad) on this phone: one phone at a time.
// Saved here: the key, when the server last said it's good, and this phone's
// random ID. Checks run at most once a day when online; with no signal the app
// keeps working for 30 days after the last good check. With saved data blocked,
// an unlock lasts for this visit. The key is also the login for the setup saved
// with it (js/backup.js): no accounts, no email.

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
  async function call(action, key, extra = {}) {
    let res;
    try {
      res = await fetch(api, {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, key, device: device(), ...extra }), signal: AbortSignal.timeout?.(LICENSE.timeoutMs),
      });
    } catch {
      return { ok: false, reason: 'offline' };
    }
    if (res.status === 429) return { ok: false, reason: 'busy' };
    const body = await res.json().catch(() => null);
    if (res.status < 500 && !res.ok && body?.error) return { ok: false, reason: 'said', said: body.error };   // a form mistake, in the server's words
    return res.ok && body ? body : { ok: false, reason: 'store' };
  }

  return {
    // True until this phone has a key the server called good in the last 30 days.
    needed() {
      const r = record();
      return !(r?.state === 'ok' && now() - r.checkedAt < LICENSE.graceMs);
    },
    // Why this phone is locked: moved | installed (moved into the home-screen app) | refunded |
    // invalid | expired (no check in 30 days), or null.
    lockedFor() {
      const r = record();
      if (r?.state === 'locked') return r.reason;
      return r?.state === 'ok' && this.needed() ? 'expired' : null;
    },
    last4: () => (record()?.state === 'ok' ? record().key.slice(-4) : ''),
    key: () => (record()?.state === 'ok' ? record().key : ''),   // for "Copy your key" (js/install.js)
    // False on a phone (or a home-screen app, which has its own storage on iPhone) where no key was ever entered.
    hasRecord: () => !!record(),

    // A key typed on the unlock screen → { ok, moved, free, data } or { ok: false, reason }.
    // app: this is the home-screen app (its first move there is free). restore: send back the
    // setup saved with the key (data), for a phone that has none of its own yet.
    // how: paste | typed | qr, for the sign-in log in Coach tools.
    async activate(raw, { app = false, restore = false, how = 'typed' } = {}) {
      const key = cleanKey(raw);
      if (!key) return { ok: false, reason: 'empty' };
      const out = await call('activate', key, { app, restore, how });
      if (out.ok) save({ key, state: 'ok', checkedAt: now() });
      return out;
    },

    // Sign in by email (6.6): the "Start Sightrep" link (#t=…), or a 6-digit code to the purchase
    // email. The server unlocks this phone with the same rules and hands the key back, kept here
    // like a typed one. Answers like activate, plus email; or link-expired | code-wrong | code-expired.
    async redeem(token, { app = false, restore = false } = {}) {
      const out = await call('redeem', '', { token, app, restore });
      if (out.ok && out.key) save({ key: cleanKey(out.key), state: 'ok', checkedAt: now() });
      return out;
    },
    resend: (token) => call('resend', '', { token }),
    codeSend: (email) => call('code-send', '', { email }),
    async codeCheck(email, code, { app = false, restore = false } = {}) {
      const out = await call('code-check', '', { email, code, app, restore });
      if (out.ok && out.key) save({ key: cleanKey(out.key), state: 'ok', checkedAt: now() });
      return out;
    },

    // Save this phone's setup with the key (js/backup.js). True when the server kept it.
    async backup(data) {
      const r = record();
      if (r?.state !== 'ok') return false;
      return (await call('save', r.key, { data })).ok === true;
    },

    // The daily check (or now, with force). Resolves to why it locked
    // (moved | refunded | invalid), or null when it's fine or can't tell yet.
    async recheck({ force = false } = {}) {
      const r = record();
      if (!r?.key || r.state !== 'ok' || (!force && now() - r.checkedAt < LICENSE.recheckMs)) return null;
      const out = await call('check', r.key);
      if (out.ok) { save({ ...r, checkedAt: now() }); return null; }
      if (!['moved', 'installed', 'refunded', 'invalid'].includes(out.reason)) return null;   // offline or busy: next time
      save({ ...r, state: 'locked', reason: out.reason });
      return out.reason;
    },
  };
}
