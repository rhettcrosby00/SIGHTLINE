// Leaderboard rules on the server: one board for everyone (no teams), names
// as identity, every score checked against what its session could possibly
// earn, rate limits, and coach tools behind the COACH_PIN. Storage is a
// "store" (Postgres in production, memory in tests and local runs), so these
// rules are tested without a database.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { normalize } from '../../js/cone/config.js';
import { FOCUS_SESSIONS } from '../../js/plan.js';
import { focusCap, moveCap } from '../../js/score/scoring.js';
import { cleanName, nameKey, nameProblem } from '../../js/score/names.js';
import { cleanKey } from '../../js/license.js';
import { keyHash } from './keys.js';
import { SETUP_STEPS } from '../../js/content/firstrun.js';
import { maskEmail } from './purchases.js';

export const LIMITS = {
  submitPerWindow: 60,     // score posts per network (a whole team on one school Wi-Fi)…
  submitWindowS: 600,      // …per 10 minutes
  pinTries: 5,             // wrong coach PINs…
  pinWindowS: 900,         // …per 15 minutes
  coachTokenS: 1800,       // coach tools stay unlocked 30 minutes
  top: 10,
};
export const TIMEZONE = 'America/New_York';   // "This week" starts Monday 12:00 a.m. here

const SIDES = { focus: ['focus'], move: ['move'], all: ['focus', 'move'] };
const FOCUS_IDS = FOCUS_SESSIONS.map((s) => s.id);
const LENGTHS = ['quick', 'standard', 'full'];

// The database address from the hosting settings, forgiving paste slips: spaces,
// quotes, a leading "DATABASE_URL=", or a whole pasted block of settings (the
// first database address in it is used). Empty when it isn't set.
export function databaseUrl(env = {}) {
  const raw = String(env.DATABASE_URL || env.POSTGRES_URL || '');
  return /postgres(?:ql)?:\/\/[^\s"']+/.exec(raw)?.[0] ?? raw.trim();
}

// Why the database isn't connected, in words safe to show (never the address).
export function databaseProblem(url, err) {
  if (!url) return 'DATABASE_URL isn’t set';
  if (!/^postgres(ql)?:\/\/[^/\s]+@[^/\s]+\/\S+/.test(url)) {
    if (/^[•*●·\s]+$/.test(url)) return 'DATABASE_URL is hidden dots: copy the real value';
    if (/[•*●·]{4,}/.test(url)) return 'DATABASE_URL was copied while hidden: click Show secret, then copy';
    if (/\n/.test(url.trim())) return 'DATABASE_URL is a block of settings without the database address in it';
    if (/^https?:/i.test(url)) return 'DATABASE_URL is a web address, not the database address';
    if (/neon\.tech/i.test(url)) return 'DATABASE_URL is only part of the database address';
    return 'DATABASE_URL doesn’t look like a database address';
  }
  if (!err) return null;
  if (/password|auth/i.test(err.message ?? '')) return 'the database refused the password';
  if (/ENOTFOUND|fetch failed|getaddrinfo|network/i.test(err.message ?? '')) return 'couldn’t reach the database';
  return `the database didn’t answer (${err.name || 'error'})`;
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

// Monday 12:00 a.m. (in TIMEZONE) of the current week, as a Date.
export function weekStart(nowMs, tz = TIMEZONE) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
  }).formatToParts(new Date(nowMs)).map((p) => [p.type, p.value]));
  const back = (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday));
  // Local wall-clock midnight of that Monday, then correct for the zone's offset.
  const guess = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - back);
  const offset = (ms) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false })
      .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second)) - ms;
  };
  return new Date(guess - offset(guess - offset(guess)));
}

// What a submitted session is allowed to score at most.
export function capFor(side, settings) {
  if (side === 'focus') {
    const { sessionId, length, difficulty } = settings ?? {};
    if (!FOCUS_IDS.includes(sessionId) || !LENGTHS.includes(length) || !['normal', 'hard'].includes(difficulty)) fail(400, 'Unknown session.');
    return focusCap({ sessionId, length, difficulty });
  }
  const setsDone = Number(settings?.setsDone);
  if (!settings?.setup || !Number.isInteger(setsDone) || setsDone < 1) fail(400, 'Unknown drill.');
  return moveCap(normalize(settings.setup), setsDone);
}

const sha = (s) => createHash('sha256').update(String(s)).digest();

export function createService(store, { pin = '', secret = 'sightline', now = () => Date.now() } = {}) {
  const pinHash = pin ? sha(`${secret}:${pin}`) : null;
  const tokenKey = pin ? sha(`token:${secret}:${pin}`) : null;
  const sign = (exp) => createHmac('sha256', tokenKey).update(String(exp)).digest('hex');

  // One player's place on a side's all-time board, plus their best session.
  async function standing(side, key) {
    const list = await store.ranking(SIDES[side], null);
    const i = list.findIndex((r) => r.key === key);
    const bests = await store.bests(SIDES[side]);
    return { rank: i < 0 ? null : i + 1, total: i < 0 ? 0 : list[i].total, best: bests.find((b) => b.key === key)?.score ?? 0 };
  }

  async function since() {
    const reset = await store.getMeta('weekResetAt');
    const start = weekStart(now()).getTime();
    return new Date(Math.max(start, reset ? Number(reset) : 0));
  }

  function checkToken(token) {
    if (!tokenKey) fail(403, 'Coach tools are off. Add COACH_PIN in the hosting settings to turn them on.');
    const [exp, mac] = String(token ?? '').split('.');
    const ok = exp && mac && mac.length === 64 && timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(sign(exp), 'hex'));
    if (!ok || Number(exp) < now()) fail(401, 'Enter the coach PIN again.');
  }

  return {
    // Save one session's score. Returns the new standing for the reveal.
    async submit({ name, side, score, settings, clientId } = {}, ip = 'unknown') {
      if (await store.hit(`submit:${ip}`, LIMITS.submitWindowS) > LIMITS.submitPerWindow) fail(429, 'Too many scores at once. Try again in a few minutes.');
      const problem = nameProblem(name);
      if (problem) fail(400, problem);
      if (!(side in SIDES) || side === 'all') fail(400, 'Unknown side.');
      if (!Number.isInteger(score) || score < 0) fail(400, 'That score isn’t valid.');
      if (score > capFor(side, settings)) fail(422, 'That score is higher than this session allows.');
      const id = clientId == null ? null : String(clientId).slice(0, 64);
      const clean = cleanName(name);
      const key = nameKey(clean);
      if (id && await store.findClient(id)) {
        const s = await standing(side, key);   // already saved (a retry from a phone that was offline)
        return { name: clean, side, score, total: s.total, prevTotal: s.total, rank: s.rank, prevRank: s.rank, best: s.best, newBest: false, duplicate: true };
      }
      const before = await standing(side, key);
      const small = side === 'focus'
        ? { sessionId: settings.sessionId, length: settings.length, difficulty: settings.difficulty }
        : { setsDone: Number(settings.setsDone), setup: normalize(settings.setup) };
      await store.insert({ name: clean, key, side, score, settings: small, clientId: id, at: new Date(now()) });
      const after = await standing(side, key);
      return {
        name: clean, side, score, total: after.total, prevTotal: before.total, rank: after.rank, prevRank: before.rank,
        best: after.best, newBest: before.best > 0 && score > before.best,
      };
    },

    // A board: side 'focus' | 'move' | 'all'; tab 'total' | 'best' | 'week'.
    // Top 10, plus the named player's row if they're further down.
    async board({ side = 'focus', tab = 'total', name = '' } = {}) {
      if (!(side in SIDES)) fail(400, 'Unknown side.');
      const from = tab === 'week' ? await since() : null;
      const list = tab === 'best'
        ? (await store.bests(SIDES[side])).map((b) => ({ key: b.key, name: b.name, score: b.score, sessions: b.sessions }))
        : (await store.ranking(SIDES[side], from)).map((r) => ({ key: r.key, name: r.name, score: r.total, sessions: r.sessions }));
      const rows = list.map((r, i) => ({ rank: i + 1, name: r.name, score: r.score, sessions: r.sessions, key: r.key }));
      const key = name ? nameKey(name) : '';
      const mine = key ? rows.find((r) => r.key === key) ?? null : null;
      const strip = ({ key: _k, ...r }) => r;
      return {
        side, tab, rows: rows.slice(0, LIMITS.top).map(strip), me: mine && mine.rank > LIMITS.top ? strip(mine) : null,
        players: rows.length, weekStart: from ? from.toISOString() : null,
      };
    },

    // Every name on the board (latest spelling), for matching while typing.
    names: () => store.names(),

    // Coach: check the PIN and hand back a 30-minute token.
    // A first-time setup step reached on some phone (js/onboarding.js): add 1 to today's total.
    // Totals only: nothing about the phone or person is kept with it.
    async step({ step } = {}, ip = 'unknown') {
      if (!Object.hasOwn(SETUP_STEPS, step)) fail(400, 'Unknown step.');
      if (await store.hit(`step:${ip}`, 600) > 60) return { ok: true };   // plenty for a team on one Wi-Fi; more is ignored
      await store.countStep(step, now());
      return { ok: true };
    },

    async unlock({ pin: tried } = {}, ip = 'unknown') {
      if (!pinHash) fail(403, 'Coach tools are off. Add COACH_PIN in the hosting settings to turn them on.');
      if (await store.hit(`pin:${ip}`, LIMITS.pinWindowS, { peek: true }) >= LIMITS.pinTries) fail(429, 'Too many wrong PINs. Wait 15 minutes.');
      if (!timingSafeEqual(sha(`${secret}:${tried ?? ''}`), pinHash)) {
        await store.hit(`pin:${ip}`, LIMITS.pinWindowS);
        fail(401, 'Wrong PIN.');
      }
      const exp = now() + LIMITS.coachTokenS * 1000;
      return { token: `${exp}.${sign(exp)}` };
    },

    // Coach tools. Each needs a token from unlock().
    async admin({ token, action, name, to, id, confirm, key, on } = {}) {
      checkToken(token);
      // Reviews from the website: approve every honest review, good or bad;
      // reject only spam, abuse, or ones not about Sightrep (api/_lib/reviews.js).
      if (action === 'reviews') return { pending: await store.reviewsBy('pending', 100), approved: await store.reviewsBy('approved', 100) };
      if (action === 'review-approve' || action === 'review-reject') {
        if (!await store.setReviewStatus(Number(id), action === 'review-approve' ? 'approved' : 'rejected', new Date(now()))) fail(404, 'That review is gone.');
        return { ok: true };
      }
      if (action === 'review-connected') {   // add (or take off) "Got it free or knows the team"
        if (!await store.setReviewConnected(Number(id), on === true)) fail(404, 'That review is gone.');
        return { ok: true };
      }
      if (action === 'signins') {   // the last 40 unlocks: when, how, whose purchase (masked), phones in 30 days
        const rows = await store.recentSignins(40);
        const since = now() - 30 * 86400000;
        const signins = await Promise.all(rows.map(async (r) => {
          const p = await store.purchaseByKeyHash(r.keyHash);
          return { at: r.at, how: r.how, who: p ? maskEmail(p.email) : `key •••${r.keyHash.slice(-4)}`, phones: await store.phonesFor(r.keyHash, since) };
        }));
        const ping = JSON.parse((await store.getMeta('ping')) ?? 'null');
        return { signins, ping };
      }
      if (action === 'setup-steps') {   // the last 30 days, in the order of the setup
        const totals = await store.stepTotals(now() - 30 * 86400000);
        return { steps: Object.entries(SETUP_STEPS).map(([step, label]) => ({ step, label, count: totals[step] ?? 0 })) };
      }
      if (action === 'review-remove') {
        if (!await store.removeReview(Number(id))) fail(404, 'That review is gone.');
        return { ok: true };
      }
      if (action === 'scores') {
        if (!name) fail(400, 'Pick a player.');
        return { scores: await store.scoresFor(nameKey(name)) };
      }
      if (action === 'rename') {
        const problem = nameProblem(to);
        if (problem) fail(400, problem);
        const target = cleanName(to);
        await store.rename(nameKey(name), target, nameKey(target));
        return { ok: true, name: target };
      }
      if (action === 'remove-name') { await store.removeKey(nameKey(name)); return { ok: true }; }
      if (action === 'remove-score') { await store.removeScore(Number(id)); return { ok: true }; }
      if (action === 'reset-week') {
        if (confirm !== 'RESET WEEK') fail(400, 'Type RESET WEEK to confirm.');
        await store.setMeta('weekResetAt', String(now()));
        return { ok: true };
      }
      if (action === 'reset-all') {
        if (confirm !== 'RESET ALL') fail(400, 'Type RESET ALL to confirm.');
        await store.removeAll();
        return { ok: true };
      }
      if (action === 'reset-key') {   // a lost or reset phone: the key unlocks the next phone it's entered on
        if (!cleanKey(key)) fail(400, 'Type or paste the key.');
        if (!await store.resetLicense(keyHash(key))) fail(404, 'No phone uses that key yet.');
        return { ok: true };
      }
      fail(400, 'Unknown coach action.');
    },
  };
}
