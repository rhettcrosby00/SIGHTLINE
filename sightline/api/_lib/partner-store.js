// Partner rooms (js/cone/partner.js, api/partner.js): Postgres in
// production, memory in the tests and local runs. Same answers from both.

export function partnerMemory() {
  const rooms = new Map();
  const hits = new Map();
  return {
    async init() {},
    // Count a request in a time window ({ peek } reads without counting).
    async hit(bucket, windowS, t, { peek = false } = {}) {
      let h = hits.get(bucket);
      if (!h || h.resetAt <= t) h = { count: 0, resetAt: t + windowS * 1000 };
      if (!peek) h.count++;
      hits.set(bucket, h);
      return h.count;
    },
    async sweep(t) {
      for (const [k, r] of rooms) if (r.expiresAt <= t) rooms.delete(k);
      for (const [k, h] of hits) if (h.resetAt <= t) hits.delete(k);
    },
    async roomsSince(ipHash, since) { return [...rooms.values()].filter((r) => r.ipHash === ipHash && r.at >= since).length; },
    async create({ code, setup, ipHash, at, expiresAt }) {
      if (rooms.has(code) && rooms.get(code).expiresAt > at) return false;
      rooms.set(code, { setup, ipHash, at, expiresAt, seq: 0, cue: null, updatedAt: at });
      return true;
    },
    async get(code, t) {
      const r = rooms.get(code);
      return r && r.expiresAt > t ? { seq: r.seq, cue: r.cue, setup: r.setup, updatedAt: r.updatedAt } : null;
    },
    async cue(code, cue, t) {
      const r = rooms.get(code);
      r.seq++;
      r.cue = cue;
      r.updatedAt = t;
      return r.seq;
    },
  };
}

export async function partnerSql(url) {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  const iso = (t) => new Date(t).toISOString();
  return {
    async init() {
      await sql`create table if not exists partner_rooms (
        code text primary key,
        setup jsonb not null,
        seq integer not null default 0,
        cue jsonb,
        ip_hash text not null,
        created_at timestamptz not null,
        updated_at timestamptz not null,
        expires_at timestamptz not null)`;
      await sql`create table if not exists partner_hits (bucket text primary key, count integer not null, reset_at timestamptz not null)`;
    },
    async hit(bucket, windowS, t, { peek = false } = {}) {
      if (peek) {
        const rows = await sql`select count from partner_hits where bucket = ${bucket} and reset_at > ${iso(t)}::timestamptz`;
        return rows[0]?.count ?? 0;
      }
      const reset = iso(t + windowS * 1000);
      const rows = await sql`
        insert into partner_hits (bucket, count, reset_at) values (${bucket}, 1, ${reset}::timestamptz)
        on conflict (bucket) do update set
          count = case when partner_hits.reset_at <= ${iso(t)}::timestamptz then 1 else partner_hits.count + 1 end,
          reset_at = case when partner_hits.reset_at <= ${iso(t)}::timestamptz then ${reset}::timestamptz else partner_hits.reset_at end
        returning count`;
      return rows[0].count;
    },
    async sweep(t) {
      await sql`delete from partner_rooms where expires_at <= ${iso(t)}::timestamptz`;
      await sql`delete from partner_hits where reset_at <= ${iso(t)}::timestamptz`;
    },
    async roomsSince(ipHash, since) {
      const rows = await sql`select count(*)::int as n from partner_rooms where ip_hash = ${ipHash} and created_at >= ${iso(since)}::timestamptz`;
      return rows[0].n;
    },
    async create({ code, setup, ipHash, at, expiresAt }) {
      const rows = await sql`
        insert into partner_rooms (code, setup, ip_hash, created_at, updated_at, expires_at)
        values (${code}, ${JSON.stringify(setup)}::jsonb, ${ipHash}, ${iso(at)}::timestamptz, ${iso(at)}::timestamptz, ${iso(expiresAt)}::timestamptz)
        on conflict (code) do nothing returning code`;
      return rows.length > 0;
    },
    async get(code, t) {
      const rows = await sql`select seq, cue, setup, updated_at from partner_rooms where code = ${code} and expires_at > ${iso(t)}::timestamptz`;
      const r = rows[0];
      return r ? { seq: r.seq, cue: r.cue, setup: r.setup, updatedAt: new Date(r.updated_at).getTime() } : null;
    },
    async cue(code, cue, t) {
      const rows = await sql`update partner_rooms set seq = seq + 1, cue = ${JSON.stringify(cue)}::jsonb, updated_at = ${iso(t)}::timestamptz where code = ${code} returning seq`;
      return rows[0].seq;
    },
  };
}
