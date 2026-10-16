// "Recently used" list, kept on this device only, so content seen in the last
// few sessions is skipped. It holds content ids (question text, script ids,
// math problems, cue words shown, drill order). No results, no personal info.
// If storage isn't available everything still works; sessions are just
// random within themselves.

const KEY = 'sightrep.variety.v1';
const KEEP_SESSIONS = 4;

function defaultStorage() {
  try {
    const s = globalThis.localStorage;
    s.setItem('__sl_test', '1');
    s.removeItem('__sl_test');
    return s;
  } catch {
    return null;
  }
}

export function createVariety(storage = defaultStorage()) {
  const read = () => {
    try {
      const list = JSON.parse(storage?.getItem(KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };
  return {
    available: !!storage,
    // Newest session first.
    recent: () => read().slice(0, KEEP_SESSIONS),
    add(record) {
      try { storage?.setItem(KEY, JSON.stringify([record, ...read()].slice(0, KEEP_SESSIONS))); } catch { /* ignore */ }
    },
    reset() {
      try { storage?.removeItem(KEY); } catch { /* ignore */ }
    },
  };
}
