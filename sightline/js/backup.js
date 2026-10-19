// Your setup, saved with your key: settings, My Routine, drill levels, training days, Run last,
// your leaderboard name, MOVE's cones and timing, Focus Check results, and the safety-waiver
// acceptance (its version and date). Entering the key on a phone that has none of its own yet,
// such as the home-screen app on iPhone (it keeps its own storage, apart from Safari) or a new
// phone, brings it all back. The server keeps it under a one-way hash of the key, next to which
// phone the key is on (api/_lib/license.js); no email, no account.
// Not saved: the key itself, this phone's ID, install reminders, queued scores.

// The same list on the server (api/_lib/license.js), so this file imports nothing.
export const BACKUP_KEYS = [
  'sightrep.settings.v1', 'sightrep.routine.v1', 'sightrep.levels.v1', 'sightrep.training.v1',
  'sightrep.last.v2', 'sightrep.name.v1', 'sightrep.cone.v1', 'sightrep.signals.v1', 'sightrep.tune.v1',
  'sightrep.check.v1', 'sightrep.seen.v1', 'sightrep.waiver.v1',   // = WAIVER_KEY (js/waiver.js)
];
const WAIVER_KEY = 'sightrep.waiver.v1';
export const BACKUP_MAX = 64 * 1024;   // characters of saved setup per key (a full setup is a few thousand)
const SENT = 'sightrep.backup.v1';    // a fingerprint of the last setup the server kept, to skip repeats

const safeStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

// This phone's setup: { 'sightrep.settings.v1': '<saved text>', … }, only what's there.
export function snapshot(storage = safeStorage()) {
  const out = {};
  for (const k of BACKUP_KEYS) {
    let v = null;
    try { v = storage.getItem(k); } catch { /* blocked */ }
    if (typeof v === 'string' && v) out[k] = v;
  }
  return out;
}

// Puts a saved setup on this phone. keepWaiver: this phone just accepted the current waiver
// itself, so that acceptance stays. Returns how many items came back.
export function restoreBackup(data, { storage = safeStorage(), keepWaiver = false } = {}) {
  let n = 0;
  for (const k of BACKUP_KEYS) {
    if (typeof data?.[k] !== 'string' || (k === WAIVER_KEY && keepWaiver)) continue;
    try { storage.setItem(k, data[k]); n++; } catch { /* blocked */ }
  }
  return n;
}

// A short fingerprint of a text (FNV-1a), to tell whether the setup changed since the last save.
const fingerprint = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
};

// Saves this phone's setup with its key: soon after a change, and when the app goes to the
// background. Only what changed since the last save is sent (nothing, most of the time).
export function createBackup({ license, storage = safeStorage() } = {}) {
  let timer = null;
  async function saveNow() {
    clearTimeout(timer);
    if (!license || license.needed()) return false;
    const json = JSON.stringify(snapshot(storage));
    if (json.length > BACKUP_MAX) return false;
    let sent = null;
    try { sent = storage.getItem(SENT); } catch { /* blocked */ }
    if (sent === fingerprint(json)) return true;
    const ok = await license.backup(JSON.parse(json));
    if (ok) try { storage.setItem(SENT, fingerprint(json)); } catch { /* blocked */ }
    return ok;
  }
  return {
    saveNow,
    saveSoon(ms = 4000) { clearTimeout(timer); timer = setTimeout(saveNow, ms); },
  };
}
