// Postgres leaderboard store (Neon). The database address comes from the
// hosting project's settings (DATABASE_URL on Cloudflare); it's never in the app.
// Stores only name, score, side, session settings and date.

import { neon } from '@neondatabase/serverless';

export function sqlStore(url) {
  const sql = neon(url);
  const sideList = (sides) => sides.filter((s) => s === 'focus' || s === 'move');

  return {
    async init() {
      await sql`create table if not exists lb_scores (
        id bigserial primary key,
        name text not null,
        name_key text not null,
        side text not null check (side in ('focus', 'move')),
        score integer not null check (score >= 0),
        settings jsonb not null default '{}',
        client_id text unique,
        created_at timestamptz not null default now())`;
      await sql`create index if not exists lb_scores_key on lb_scores (name_key)`;
      await sql`create table if not exists lb_meta (key text primary key, value text not null)`;
      await sql`create table if not exists lb_hits (bucket text primary key, count integer not null, reset_at timestamptz not null)`;
      // License keys: which phone each key is on. A hash of the key, never the key.
      await sql`create table if not exists lb_licenses (
        key_hash text primary key,
        device text not null,
        bound_at timestamptz not null default now(),
        moves jsonb not null default '[]')`;
      // Website reviews: pending until the owner approves them in Coach tools.
      await sql`create table if not exists site_reviews (
        id bigserial primary key,
        name text not null,
        sport text not null,
        stars smallint not null check (stars between 1 and 5),
        body text not null,
        status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
        created_at timestamptz not null default now(),
        decided_at timestamptz)`;
    },

    async hit(bucket, windowS, { peek = false } = {}) {
      if (peek) {
        const rows = await sql`select count from lb_hits where bucket = ${bucket} and reset_at > now()`;
        return rows[0]?.count ?? 0;
      }
      const rows = await sql`
        insert into lb_hits (bucket, count, reset_at) values (${bucket}, 1, now() + make_interval(secs => ${windowS}::double precision))
        on conflict (bucket) do update set
          count = case when lb_hits.reset_at < now() then 1 else lb_hits.count + 1 end,
          reset_at = case when lb_hits.reset_at < now() then now() + make_interval(secs => ${windowS}::double precision) else lb_hits.reset_at end
        returning count`;
      // A fresh window: also clear out windows that have ended, so the table stays small.
      if (rows[0].count === 1) await sql`delete from lb_hits where reset_at < now()`;
      return rows[0].count;
    },

    async insert({ name, key, side, score, settings, clientId = null, at }) {
      const rows = await sql`
        insert into lb_scores (name, name_key, side, score, settings, client_id, created_at)
        values (${name}, ${key}, ${side}, ${score}, ${JSON.stringify(settings)}::jsonb, ${clientId}, ${at.toISOString()}::timestamptz)
        returning id`;
      return Number(rows[0].id);
    },

    async findClient(clientId) {
      const rows = await sql`select id from lb_scores where client_id = ${clientId}`;
      return rows[0] ?? null;
    },

    async ranking(sides, since) {
      const rows = await sql`
        select name_key as key, (array_agg(name order by created_at desc))[1] as name,
               sum(score)::bigint as total, count(*)::int as sessions, max(created_at) as last
        from lb_scores
        where side = any(${sideList(sides)}::text[]) and created_at >= coalesce(${since ? since.toISOString() : null}::timestamptz, '-infinity')
        group by name_key
        order by total desc, last asc`;
      return rows.map((r) => ({ key: r.key, name: r.name, total: Number(r.total), sessions: r.sessions, last: new Date(r.last).getTime() }));
    },

    async bests(sides) {
      const list = sideList(sides);
      const rows = await sql`
        with b as (
          select distinct on (name_key) name_key, score, created_at from lb_scores
          where side = any(${list}::text[]) order by name_key, score desc, created_at asc),
        n as (
          select name_key, (array_agg(name order by created_at desc))[1] as name, count(*)::int as sessions from lb_scores
          where side = any(${list}::text[]) group by name_key)
        select b.name_key as key, n.name, b.score, b.created_at as at, n.sessions
        from b join n using (name_key)
        order by b.score desc, b.created_at asc`;
      return rows.map((r) => ({ key: r.key, name: r.name, score: r.score, at: new Date(r.at).getTime(), sessions: r.sessions }));
    },

    async names() {
      const rows = await sql`
        select (array_agg(name order by created_at desc))[1] as name from lb_scores
        group by name_key order by max(created_at) desc limit 500`;
      return rows.map((r) => r.name);
    },

    async scoresFor(key) {
      const rows = await sql`select id, side, score, created_at from lb_scores where name_key = ${key} order by created_at desc limit 50`;
      return rows.map((r) => ({ id: Number(r.id), side: r.side, score: r.score, at: new Date(r.created_at).toISOString() }));
    },

    async rename(fromKey, toName, toKey) {
      await sql`update lb_scores set name = ${toName}, name_key = ${toKey} where name_key = ${fromKey} or name_key = ${toKey}`;
    },
    async removeKey(key) { await sql`delete from lb_scores where name_key = ${key}`; },
    async removeScore(id) { await sql`delete from lb_scores where id = ${id}::bigint`; },
    async removeAll() { await sql`delete from lb_scores`; },
    async getMeta(k) {
      const rows = await sql`select value from lb_meta where key = ${k}`;
      return rows[0]?.value ?? null;
    },
    async setMeta(k, v) {
      await sql`insert into lb_meta (key, value) values (${k}, ${v}) on conflict (key) do update set value = excluded.value`;
    },

    async getLicense(hash) {
      const rows = await sql`select device, bound_at, moves from lb_licenses where key_hash = ${hash}`;
      const r = rows[0];
      return r ? { hash, device: r.device, boundAt: new Date(r.bound_at).getTime(), moves: (r.moves ?? []).map(Number) } : null;
    },
    async putLicense({ hash, device, boundAt, moves }) {
      await sql`
        insert into lb_licenses (key_hash, device, bound_at, moves)
        values (${hash}, ${device}, ${new Date(boundAt).toISOString()}::timestamptz, ${JSON.stringify(moves)}::jsonb)
        on conflict (key_hash) do update set device = excluded.device, bound_at = excluded.bound_at, moves = excluded.moves`;
    },
    async addReview({ name, sport, stars, text, at }) {
      const rows = await sql`insert into site_reviews (name, sport, stars, body, created_at)
        values (${name}, ${sport}, ${stars}, ${text}, ${at.toISOString()}::timestamptz) returning id`;
      return Number(rows[0].id);
    },
    async reviewsBy(status, limit = 100) {
      const rows = await sql`select id, name, sport, stars, body, status, created_at, decided_at from site_reviews
        where status = ${status} order by created_at desc, id desc limit ${limit}`;
      return rows.map((r) => ({ id: Number(r.id), name: r.name, sport: r.sport, stars: r.stars, text: r.body, status: r.status,
        at: new Date(r.created_at).toISOString(), decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null }));
    },
    async reviewStats() {
      const rows = await sql`select count(*)::int as count, round(avg(stars)::numeric, 1) as average from site_reviews where status = 'approved'`;
      return { count: rows[0].count, average: rows[0].average == null ? null : Number(rows[0].average) };
    },
    async setReviewStatus(id, status, at = new Date()) {
      const rows = await sql`update site_reviews set status = ${status}, decided_at = ${at.toISOString()}::timestamptz where id = ${id}::bigint returning id`;
      return rows.length > 0;
    },
    async removeReview(id) {
      const rows = await sql`delete from site_reviews where id = ${id}::bigint returning id`;
      return rows.length > 0;
    },
    async resetLicense(hash) {
      const rows = await sql`delete from lb_licenses where key_hash = ${hash} returning key_hash`;
      return rows.length > 0;
    },
  };
}
