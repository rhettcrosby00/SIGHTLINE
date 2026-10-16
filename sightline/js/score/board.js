// Leaderboard client: the only part of the app that talks to the server.
// Screens call submitScore / getLeaderboard / getPlayerRank, so where scores
// live can change without touching them. With no signal, a score waits on
// this phone and posts when the connection comes back.

const API = '/api/leaderboard';
const QUEUE_KEY = 'sightline.lbqueue.v1';
const NAME_KEY = 'sightline.name.v1';

const store = {
  get(k, fallback) { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};

// The last name used on this phone, so the next entry is one tap.
export const lastName = {
  get: () => store.get(NAME_KEY, ''),
  set: (name) => store.set(NAME_KEY, name),
};

async function call(method, params) {
  const opts = method === 'GET'
    ? {}
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) };
  const url = method === 'GET' ? `${API}?${new URLSearchParams(params)}` : API;
  let res;
  try {
    res = await fetch(url, { ...opts, cache: 'no-store' });
  } catch {
    const err = new Error('No connection.');
    err.offline = true;
    throw err;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || 'Something went wrong.');
    err.status = res.status;
    throw err;
  }
  return body;
}

const newId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// Save a session score. Resolves to the new standing, or { queued: true }
// when offline or the server is busy (it posts later: busy says which), or
// { error } when the server refuses it.
export async function submitScore({ name, side, score, settings }) {
  const entry = { action: 'submit', name, side, score, settings, clientId: newId() };
  try {
    return await call('POST', entry);
  } catch (err) {
    // Offline, busy (a whole team posting at once) or having a moment: keep it and try again later.
    if (err.offline || err.status >= 500 || err.status === 429) {
      store.set(QUEUE_KEY, [...store.get(QUEUE_KEY, []), entry]);
      return { queued: true, busy: !err.offline };
    }
    return { error: err.message };
  }
}

// Post anything saved while offline. Refused scores (e.g. over the cap) are dropped.
let flushing = false;
export async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    for (const entry of store.get(QUEUE_KEY, [])) {
      try {
        await call('POST', entry);
      } catch (err) {
        if (err.offline || err.status >= 500 || err.status === 429) break;   // try again later
      }
      store.set(QUEUE_KEY, store.get(QUEUE_KEY, []).filter((e) => e.clientId !== entry.clientId));
    }
  } finally {
    flushing = false;
  }
}

// side 'focus' | 'move' | 'all'; tab 'total' | 'best' | 'week'.
export function getLeaderboard({ side, tab, name = '' }) {
  return call('GET', { action: 'board', side, tab, name });
}

// One player's row on a board (rank, score, sessions), or null.
export async function getPlayerRank(name, { side = 'all', tab = 'total' } = {}) {
  const board = await getLeaderboard({ side, tab, name });
  return board.me ?? board.rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
}

export async function getNames() {
  try { return (await call('GET', { action: 'names' })).names; } catch { return []; }
}

// Coach tools.
export const coach = {
  unlock: (pin) => call('POST', { action: 'unlock', pin }),
  run: (token, task, data = {}) => call('POST', { action: 'admin', token, task, ...data }),
};
