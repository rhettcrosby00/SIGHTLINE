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
    if (!tokenKey) fail(403, 'Coach tools are off. Add COACH_PIN in Vercel to turn them on.');
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
    async unlock({ pin: tried } = {}, ip = 'unknown') {
      if (!pinHash) fail(403, 'Coach tools are off. Add COACH_PIN in Vercel to turn them on.');
      if (await store.hit(`pin:${ip}`, LIMITS.pinWindowS, { peek: true }) >= LIMITS.pinTries) fail(429, 'Too many wrong PINs. Wait 15 minutes.');
      if (!timingSafeEqual(sha(`${secret}:${tried ?? ''}`), pinHash)) {
        await store.hit(`pin:${ip}`, LIMITS.pinWindowS);
        fail(401, 'Wrong PIN.');
      }
      const exp = now() + LIMITS.coachTokenS * 1000;
      return { token: `${exp}.${sign(exp)}` };
    },

    // Coach tools. Each needs a token from unlock().
    async admin({ token, action, name, to, id, confirm } = {}) {
      checkToken(token);
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
      fail(400, 'Unknown coach action.');
    },
  };
}
