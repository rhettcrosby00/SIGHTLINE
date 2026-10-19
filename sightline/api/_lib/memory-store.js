// In-memory leaderboard store: same answers as the Postgres store, for the
// tests and for running the app locally without a database.

export function memoryStore({ now = () => Date.now() } = {}) {
  let rows = [];
  let nextId = 1;
  const meta = new Map();
  const hits = new Map();
  const licenses = new Map();   // key hash → { hash, device, boundAt, moves, appMove }
  const keyData = new Map();    // key hash → the setup saved with the key (js/backup.js)
  const handoffs = new Map();   // id hash → { blob, expiresAt }
  const funnel = new Map();     // "day|step" → count
  let reviews = [];             // { id, name, sport, stars, text, connected, status, at, decidedAt }
  let nextReview = 1;

  const latestName = (list) => list.reduce((a, b) => (b.at >= a.at ? b : a)).name;
  const groups = (list) => {
    const by = new Map();
    for (const r of list) by.set(r.key, [...(by.get(r.key) ?? []), r]);
    return [...by.entries()];
  };

  return {
    async init() {},

    // Count a request in a time window; { peek } reads without counting.
    async hit(bucket, windowS, { peek = false } = {}) {
      const t = now();
      let h = hits.get(bucket);
      if (!h || h.resetAt < t) h = { count: 0, resetAt: t + windowS * 1000 };
      if (!peek) h.count++;
      hits.set(bucket, h);
      // A fresh window: also clear out windows that have ended (same as Postgres).
      if (h.count === 1 && !peek) for (const [k, v] of hits) if (v.resetAt < t) hits.delete(k);
      return h.count;
    },

    async insert({ name, key, side, score, settings, clientId = null, at = new Date(now()) }) {
      const row = { id: nextId++, name, key, side, score, settings, clientId, at: at.getTime() };
      rows.push(row);
      return row.id;
    },

    async findClient(clientId) { return rows.find((r) => r.clientId === clientId) ?? null; },

    // Totals per player, highest first; ties go to whoever got there first.
    async ranking(sides, since) {
      const from = since ? since.getTime() : -Infinity;
      return groups(rows.filter((r) => sides.includes(r.side) && r.at >= from))
        .map(([key, list]) => ({
          key, name: latestName(list), total: list.reduce((a, r) => a + r.score, 0), sessions: list.length,
          last: Math.max(...list.map((r) => r.at)),
        }))
        .sort((a, b) => b.total - a.total || a.last - b.last);
    },

    // Best single session per player; ties go to whoever scored it first.
    async bests(sides) {
      return groups(rows.filter((r) => sides.includes(r.side)))
        .map(([key, list]) => {
          const top = list.slice().sort((a, b) => b.score - a.score || a.at - b.at)[0];
          return { key, name: latestName(list), score: top.score, at: top.at, sessions: list.length };
        })
        .sort((a, b) => b.score - a.score || a.at - b.at);
    },

    async names() {
      return groups(rows)
        .map(([, list]) => ({ name: latestName(list), last: Math.max(...list.map((r) => r.at)) }))
        .sort((a, b) => b.last - a.last).slice(0, 500).map((x) => x.name);
    },

    async scoresFor(key) {
      return rows.filter((r) => r.key === key).sort((a, b) => b.at - a.at).slice(0, 50)
        .map((r) => ({ id: r.id, side: r.side, score: r.score, at: new Date(r.at).toISOString() }));
    },

    // Rename a player, or merge them into an existing one.
    async rename(fromKey, toName, toKey) {
      for (const r of rows) if (r.key === fromKey || r.key === toKey) { r.key = toKey; r.name = toName; }
    },
    async removeKey(key) { rows = rows.filter((r) => r.key !== key); },
    async removeScore(id) { rows = rows.filter((r) => r.id !== id); },
    async removeAll() { rows = []; },
    async getMeta(k) { return meta.get(k) ?? null; },
    hitCount: () => hits.size,   // for the tests
    async setMeta(k, v) { meta.set(k, v); },

    // License keys: which phone each key is on (by hash).
    async getLicense(hash) { const r = licenses.get(hash); return r ? { ...r, moves: [...r.moves], appMove: r.appMove ? { ...r.appMove } : null } : null; },
    async putLicense(rec) { licenses.set(rec.hash, { ...rec, moves: [...rec.moves], appMove: rec.appMove ? { ...rec.appMove } : null }); },
    async putHandoff(hash, blob, expiresAt) { handoffs.set(hash, { blob, expiresAt }); },
    async takeHandoff(hash, at = now()) {
      const h = handoffs.get(hash);
      handoffs.delete(hash);
      return h && h.expiresAt > at ? h.blob : null;
    },
    handoffRows: () => [...handoffs.entries()],   // for the tests
    async countStep(step, at = now()) { const k = `${new Date(at).toISOString().slice(0, 10)}|${step}`; funnel.set(k, (funnel.get(k) ?? 0) + 1); },
    async stepTotals(sinceAt) {
      const since = new Date(sinceAt).toISOString().slice(0, 10);
      const out = {};
      for (const [k, n] of funnel) { const [day, step] = k.split('|'); if (day >= since) out[step] = (out[step] ?? 0) + n; }
      return out;
    },
    funnelRows: () => [...funnel.entries()],   // for the tests
    async getKeyData(hash) { return keyData.has(hash) ? JSON.parse(keyData.get(hash)) : null; },
    async putKeyData(hash, data) { keyData.set(hash, JSON.stringify(data)); },
    async resetLicense(hash) { return licenses.delete(hash); },
    licenseRows: () => [...licenses.values()],   // for the tests

    // Website reviews (pending until the owner approves).
    async addReview({ name, sport, stars, text, connected = false, at = new Date(now()) }) {
      const row = { id: nextReview++, name, sport, stars, text, connected, status: 'pending', at: at.toISOString(), decidedAt: null };
      reviews.push(row);
      return row.id;
    },
    async reviewsBy(status, limit = 100) {
      return reviews.filter((r) => r.status === status).sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id).slice(0, limit).map((r) => ({ ...r }));
    },
    async reviewStats() {
      const ok = reviews.filter((r) => r.status === 'approved');
      return { count: ok.length, average: ok.length ? Math.round((ok.reduce((a, r) => a + r.stars, 0) / ok.length) * 10) / 10 : null };
    },
    async setReviewStatus(id, status, at = new Date(now())) {
      const r = reviews.find((x) => x.id === id);
      if (!r) return false;
      Object.assign(r, { status, decidedAt: at.toISOString() });
      return true;
    },
    async setReviewConnected(id, connected) {
      const r = reviews.find((x) => x.id === id);
      if (!r) return false;
      r.connected = connected;
      return true;
    },
    async removeReview(id) { const n = reviews.length; reviews = reviews.filter((r) => r.id !== id); return reviews.length < n; },
  };
}
