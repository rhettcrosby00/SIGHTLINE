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
      // 6.4: the free move into a home-screen app ({ at, from }), once per key.
      await sql`alter table lb_licenses add column if not exists app_move jsonb`;
      // 6.4: each key's saved setup (js/backup.js), so it comes back in the home-screen app or on a new phone.
      // 6.5: computer-to-phone QR codes (an encrypted key the server can't read, 10 minutes, once).
      await sql`create table if not exists lb_handoffs (
        id_hash text primary key,
        blob text not null,
        expires_at timestamptz not null)`;
      // 6.5: how many people reach each first-time setup step, per day. Totals only.
      await sql`create table if not exists lb_funnel (
        day date not null,
        step text not null,
        count integer not null default 0,
        primary key (day, step))`;
      // 6.6: purchases from Gumroad's sale notice (the key only encrypted), "Start Sightrep" links
      // and sign-in codes (only hashes), and every unlock (Coach tools: Recent sign-ins).
      await sql`create table if not exists lb_purchases (
        sale_id text primary key,
        email text not null,
        key_enc text not null,
        key_hash text not null,
        created_at timestamptz not null default now(),
        emailed_at timestamptz)`;
      await sql`create index if not exists lb_purchases_email on lb_purchases (email)`;
      await sql`create index if not exists lb_purchases_key on lb_purchases (key_hash)`;
      await sql`create table if not exists lb_tokens (
        token_hash text primary key,
        sale_id text not null,
        expires_at timestamptz not null,
        used_at timestamptz)`;
      await sql`create table if not exists lb_codes (
        email_hash text primary key,
        sale_id text not null,
        code_hash text not null,
        expires_at timestamptz not null,
        tries integer not null default 0)`;
      await sql`create table if not exists lb_signins (
        id bigserial primary key,
        at timestamptz not null default now(),
        key_hash text not null,
        device text not null,
        how text not null)`;
      await sql`create index if not exists lb_signins_key on lb_signins (key_hash, at)`;
      await sql`create table if not exists lb_key_data (
        key_hash text primary key,
        data jsonb not null,
        saved_at timestamptz not null default now())`;
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
      // 6.3: the reviewer got Sightrep free or knows the team (shown on the review, FTC rule).
      await sql`alter table site_reviews add column if not exists connected boolean not null default false`;
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
      const rows = await sql`select device, bound_at, moves, app_move from lb_licenses where key_hash = ${hash}`;
      const r = rows[0];
      return r ? { hash, device: r.device, boundAt: new Date(r.bound_at).getTime(), moves: (r.moves ?? []).map(Number), appMove: r.app_move ?? null } : null;
    },
    async putLicense({ hash, device, boundAt, moves, appMove = null }) {
      await sql`
        insert into lb_licenses (key_hash, device, bound_at, moves, app_move)
        values (${hash}, ${device}, ${new Date(boundAt).toISOString()}::timestamptz, ${JSON.stringify(moves)}::jsonb, ${appMove ? JSON.stringify(appMove) : null}::jsonb)
        on conflict (key_hash) do update set device = excluded.device, bound_at = excluded.bound_at, moves = excluded.moves, app_move = excluded.app_move`;
    },
    async putPurchase({ saleId, email, keyEnc, keyHash, at }) {
      await sql`insert into lb_purchases (sale_id, email, key_enc, key_hash, created_at)
        values (${saleId}, ${email}, ${keyEnc}, ${keyHash}, ${new Date(at).toISOString()}::timestamptz) on conflict (sale_id) do nothing`;
    },
    async getPurchase(saleId) {
      const r = (await sql`select sale_id, email, key_enc, key_hash, created_at, emailed_at from lb_purchases where sale_id = ${saleId}`)[0];
      return r ? { saleId: r.sale_id, email: r.email, keyEnc: r.key_enc, keyHash: r.key_hash, at: new Date(r.created_at).getTime(), emailedAt: r.emailed_at ? new Date(r.emailed_at).getTime() : null } : null;
    },
    async purchasesByEmail(email) {
      const rows = await sql`select sale_id, email from lb_purchases where email = ${email} order by created_at desc limit 5`;
      return rows.map((r) => ({ saleId: r.sale_id, email: r.email }));
    },
    async purchaseByKeyHash(hash) {
      const r = (await sql`select sale_id, email from lb_purchases where key_hash = ${hash} order by created_at desc limit 1`)[0];
      return r ? { saleId: r.sale_id, email: r.email } : null;
    },
    async markEmailed(saleId, at) {
      await sql`update lb_purchases set emailed_at = ${new Date(at).toISOString()}::timestamptz where sale_id = ${saleId}`;
    },
    async putToken({ hash, saleId, expiresAt }) {
      await sql`insert into lb_tokens (token_hash, sale_id, expires_at) values (${hash}, ${saleId}, ${new Date(expiresAt).toISOString()}::timestamptz)`;
    },
    async getToken(hash) {
      const r = (await sql`select sale_id, expires_at, used_at from lb_tokens where token_hash = ${hash}`)[0];
      return r ? { saleId: r.sale_id, expiresAt: new Date(r.expires_at).getTime(), usedAt: r.used_at ? new Date(r.used_at).getTime() : null } : null;
    },
    async useToken(hash, at) {
      await sql`update lb_tokens set used_at = ${new Date(at).toISOString()}::timestamptz where token_hash = ${hash}`;
    },
    async putCode({ emailHash, saleId, codeHash, expiresAt }) {
      await sql`insert into lb_codes (email_hash, sale_id, code_hash, expires_at, tries)
        values (${emailHash}, ${saleId}, ${codeHash}, ${new Date(expiresAt).toISOString()}::timestamptz, 0)
        on conflict (email_hash) do update set sale_id = excluded.sale_id, code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0`;
    },
    async getCode(emailHash) {
      const r = (await sql`select sale_id, code_hash, expires_at, tries from lb_codes where email_hash = ${emailHash}`)[0];
      return r ? { saleId: r.sale_id, codeHash: r.code_hash, expiresAt: new Date(r.expires_at).getTime(), tries: r.tries } : null;
    },
    async bumpCode(emailHash) {
      const r = (await sql`update lb_codes set tries = tries + 1 where email_hash = ${emailHash} returning tries`)[0];
      return r ? r.tries : Infinity;
    },
    async deleteCode(emailHash) { await sql`delete from lb_codes where email_hash = ${emailHash}`; },
    async addSignin({ at, keyHash, device, how }) {
      await sql`insert into lb_signins (at, key_hash, device, how) values (${new Date(at).toISOString()}::timestamptz, ${keyHash}, ${device}, ${how})`;
    },
    async recentSignins(limit = 40) {
      const rows = await sql`select at, key_hash, device, how from lb_signins order by at desc limit ${limit}`;
      return rows.map((r) => ({ at: new Date(r.at).getTime(), keyHash: r.key_hash, device: r.device, how: r.how }));
    },
    async phonesFor(keyHash, sinceAt) {
      const r = (await sql`select count(distinct device)::int as n from lb_signins where key_hash = ${keyHash} and at >= ${new Date(sinceAt).toISOString()}::timestamptz`)[0];
      return r?.n ?? 0;
    },
    async putHandoff(hash, blob, expiresAt) {
      await sql`delete from lb_handoffs where expires_at < now()`;
      await sql`insert into lb_handoffs (id_hash, blob, expires_at) values (${hash}, ${blob}, ${new Date(expiresAt).toISOString()}::timestamptz)
        on conflict (id_hash) do update set blob = excluded.blob, expires_at = excluded.expires_at`;
    },
    async takeHandoff(hash, at = Date.now()) {
      const rows = await sql`delete from lb_handoffs where id_hash = ${hash} and expires_at > ${new Date(at).toISOString()}::timestamptz returning blob`;
      return rows[0]?.blob ?? null;
    },
    async countStep(step, at = Date.now()) {
      const day = new Date(at).toISOString().slice(0, 10);
      await sql`insert into lb_funnel (day, step, count) values (${day}::date, ${step}, 1)
        on conflict (day, step) do update set count = lb_funnel.count + 1`;
    },
    async stepTotals(sinceAt) {
      const since = new Date(sinceAt).toISOString().slice(0, 10);
      const rows = await sql`select step, sum(count)::int as count from lb_funnel where day >= ${since}::date group by step`;
      return Object.fromEntries(rows.map((r) => [r.step, Number(r.count)]));
    },
    async getKeyData(hash) {
      const rows = await sql`select data from lb_key_data where key_hash = ${hash}`;
      return rows[0]?.data ?? null;
    },
    async putKeyData(hash, data, at = Date.now()) {
      await sql`
        insert into lb_key_data (key_hash, data, saved_at) values (${hash}, ${JSON.stringify(data)}::jsonb, ${new Date(at).toISOString()}::timestamptz)
        on conflict (key_hash) do update set data = excluded.data, saved_at = excluded.saved_at`;
    },
    async addReview({ name, sport, stars, text, connected = false, at }) {
      const rows = await sql`insert into site_reviews (name, sport, stars, body, connected, created_at)
        values (${name}, ${sport}, ${stars}, ${text}, ${connected}, ${at.toISOString()}::timestamptz) returning id`;
      return Number(rows[0].id);
    },
    async reviewsBy(status, limit = 100) {
      const rows = await sql`select id, name, sport, stars, body, connected, status, created_at, decided_at from site_reviews
        where status = ${status} order by created_at desc, id desc limit ${limit}`;
      return rows.map((r) => ({ id: Number(r.id), name: r.name, sport: r.sport, stars: r.stars, text: r.body, connected: r.connected === true, status: r.status,
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
    async setReviewConnected(id, connected) {
      const rows = await sql`update site_reviews set connected = ${connected} where id = ${id}::bigint returning id`;
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
