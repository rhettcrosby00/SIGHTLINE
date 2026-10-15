// Postgres leaderboard store (Neon, connected through Vercel). The database
// address comes from Vercel's settings (DATABASE_URL); it's never in the app.
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
  };
}
