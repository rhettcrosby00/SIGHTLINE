// How many times this phone has run each drill, for Auto instructions (the
// full how-to the first few times, then just the rule). Device only; with
// storage blocked every drill just counts as new.

const KEY = 'sightline.seen.v1';

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function createSeen(storage = defaultStorage()) {
  const read = () => {
    try {
      const v = JSON.parse(storage?.getItem(KEY) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  };
  return {
    get: read,
    add(ids) {
      const all = read();
      for (const id of ids) all[id] = (all[id] ?? 0) + 1;
      try { storage?.setItem(KEY, JSON.stringify(all)); } catch { /* storage blocked */ }
    },
  };
}
