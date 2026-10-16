// Leaderboard (run by tests/run.js): scoring math, names, totals, ranks and
// ties, the weekly board, the cap, offline sync, rate limits and coach PIN.
// The server rules run against the in-memory store (same answers as Postgres).

import { test, assert } from './harness.js';
import { SCORING, createFocusScorer, focusScore, focusCap, moveScore, moveCap, moveMultiplier } from '../js/score/scoring.js';
import { cleanName, nameKey, nameProblem, isBlocked, similarNames, NAME_MAX } from '../js/score/names.js';
import { normalize } from '../js/cone/config.js';
import { createService, weekStart, LIMITS } from '../api/_lib/service.js';
import { memoryStore } from '../api/_lib/memory-store.js';
import { handle } from '../api/leaderboard.js';
import { submitScore, flushQueue, getPlayerRank } from '../js/score/board.js';

const near = (a, b) => Math.abs(a - b) < 1e-6;
const FOCUS = { sessionId: 'game', length: 'standard', difficulty: 'normal' };

// A clock we control, starting Thursday Oct 15 2026, 11 a.m. Eastern.
function setup({ pin = '2468' } = {}) {
  const clock = { t: Date.UTC(2026, 9, 15, 15) };
  const now = () => clock.t;
  const store = memoryStore({ now });
  return { svc: createService(store, { pin, now }), store, clock };
}

test('FOCUS scoring: +100 right, speed bonus to 1.5 s, streaks ×1.5 / ×2, −50 wrong, 0 missed', () => {
  const s = createFocusScorer();
  s.trial({ outcome: 'correct', rtMs: 0 });         // 100 + 100
  s.trial({ outcome: 'correct', rtMs: 750 });       // 100 + 50
  s.trial({ outcome: 'correct', rtMs: 1500 });      // 100 + 0
  s.trial({ outcome: 'correct', rtMs: 2400 });      // 100 + 0 (slower than 1.5 s: no bonus)
  s.trial({ outcome: 'correct' });                  // a correct hold: 100
  assert(near(s.points, 650), `first five: ${s.points}`);
  s.trial({ outcome: 'correct', rtMs: 0 });         // 6th in a row: ×1.5 → 300
  assert(near(s.points, 950), `streak ×1.5: ${s.points}`);
  for (let i = 0; i < 4; i++) s.trial({ outcome: 'correct', rtMs: 1500 });   // 7–10: 150 each
  s.trial({ outcome: 'correct', rtMs: 1500 });      // 11th: ×2 → 200
  assert(near(s.points, 950 + 600 + 200), `streak ×2: ${s.points}`);
  s.trial({ outcome: 'wrong' });                    // −50, streak reset
  s.trial({ outcome: 'correct', rtMs: 1500 });      // back to ×1 → 100
  s.trial({ outcome: 'missed' });                   // 0, streak reset
  assert(near(s.points, 1750 - 50 + 100), `penalties: ${s.points}`);
  assert(s.bestStreak === 11, 'best streak');
  assert(focusScore({ points: 1800, sessionId: 'game', difficulty: 'hard' }) === 3200, 'Hard ×1.5 + 500 for finishing Game Ready');
  assert(focusScore({ points: 1000, sessionId: 'activate', difficulty: 'normal' }) === 1100, 'one-part session bonus');
  assert(focusScore({ points: -300, sessionId: 'game', difficulty: 'normal', completed: false }) === 0, 'never below zero');
  assert(focusScore({ points: 100.4, sessionId: 'game', difficulty: 'normal', completed: false }) === 100, 'whole numbers');
});

test('MOVE scoring: 50 per rep × pace × rep style × distance × cones × extras; only completed sets', () => {
  const base = normalize({ cueType: 'colors', cones: 2, distance: 5, pace: 'learning', style: 'outback' });
  assert(near(moveMultiplier(base), 1), 'plain setup is ×1');
  assert(moveScore(base, { reps: 30, setsDone: 3 }) === 30 * 50 + 500, 'reps × 50 + finish bonus');
  assert(moveScore(base, { reps: 20, setsDone: 2 }) === 1000, 'stopped early: no finish bonus');
  const paces = { learning: 1, training: 1.25, game: 1.5, overdrive: 2 };
  for (const [pace, m] of Object.entries(paces)) assert(near(moveMultiplier({ ...base, pace }), m), `pace ${pace}`);
  for (const [style, m] of Object.entries({ firststep: 0.75, outback: 1, conetocone: 1.2 })) assert(near(moveMultiplier(normalize({ ...base, style })), m), `style ${style}`);
  assert(near(moveMultiplier({ ...base, distance: 9 }), 1.2), '+5% per yard beyond 5');
  assert(near(moveMultiplier({ ...base, distance: 20 }), 1.5), 'distance bonus capped at +50%');
  assert(near(moveMultiplier({ ...base, distance: 3 }), 1), 'no penalty under 5 yds');
  assert(near(moveMultiplier({ ...base, cones: 5 }), 1.3), '+10% per cone above 2');
  const arrows = normalize({ cueType: 'arrows', directions: ['L', 'R', 'F', 'B'], cones: 4, pace: 'learning', decision: true });
  assert(near(moveMultiplier(arrows), 1.2 * 1.3), 'directions count like cones; Decision Layer ×1.3');
  assert(near(moveMultiplier({ ...base, display: 'flash', position: 'random', fakes: 'low' }), 1.2 * 1.2 * 1.2), 'flash, random, fake-outs');
  assert(near(moveMultiplier({ ...base, position: 'peripheral' }), 1.3), 'peripheral ×1.3');
  // An exact time slower than the pace's formula earns no pace bonus.
  const game = normalize({ ...base, pace: 'game' });
  assert(near(moveMultiplier({ ...game, manual: true, manualS: 6 }), 1), 'slow manual: no pace bonus');
  assert(near(moveMultiplier({ ...game, manual: true, manualS: 2 }), 1.5), 'fast manual keeps the pace bonus');
});

test('Names: case and spacing variants are one player; initials; length', () => {
  assert(nameKey('Jordan') === nameKey('JORDAN') && nameKey('JORDAN') === nameKey('  jordan  ') && nameKey('Mary  Ann') === nameKey('mary ann'), 'variants differ');
  assert(cleanName('ABCDEFGHIJKLMNOP').length === NAME_MAX, 'max length');
  assert(cleanName('j.d.!', 'initials') === 'JD' && nameProblem('jd', 'initials') === 'Use 3 letters.' && !nameProblem('jdk', 'initials'), 'initials');
  assert(nameProblem('   ') && nameProblem('123'), 'empty or no letters');
  assert(similarNames('Jordn', ['Jordan', 'Taylor'])[0] === 'Jordan', 'suggests the close spelling');
});

test('Offensive names are blocked (with letter swaps); real names get through', () => {
  for (const bad of ['fuck', 'F u c k', 'sh1t', 'B1tch', 'n1gga', 'asshole', 'Ass', 'kys', 'p0rn star', 'Hitler', 'dick', 'C0CK']) {
    assert(isBlocked(bad), `"${bad}" got through`);
  }
  for (const ok of ['Jordan', 'Yamashita', 'Matsushita', 'Hancock', 'Fagan', 'Sexton', 'Dickson', 'Cassidy', 'Ho', 'Fu', 'Shanalee', 'Essex', 'Pedro']) {
    assert(!isBlocked(ok), `"${ok}" was blocked`);
  }
});

test('Totals add up across many sessions; ties go to whoever got there first', async () => {
  const { svc, clock } = setup();
  const sums = {};
  for (let i = 0; i < 120; i++) {
    const name = ['Jordan', 'JORDAN', ' jordan ', 'Taylor', 'Sam'][i % 5];
    const score = 100 + ((i * 37) % 900);
    clock.t += 60_000;
    await svc.submit({ name, side: 'focus', score, settings: FOCUS }, `ip${i}`);
    sums[nameKey(name)] = (sums[nameKey(name)] ?? 0) + score;
  }
  const board = await svc.board({ side: 'focus', tab: 'total' });
  assert(board.players === 3, `players: ${board.players}`);
  for (const r of board.rows) assert(r.score === sums[nameKey(r.name)], `${r.name}: ${r.score} vs ${sums[nameKey(r.name)]}`);
  assert(board.rows.every((r, i) => i === 0 || board.rows[i - 1].score >= r.score), 'not sorted');

  // Tie: both reach 1,000; Ana got there first.
  const t2 = setup();
  await t2.svc.submit({ name: 'Ana', side: 'move', score: 1000, settings: { setup: {}, setsDone: 3 } }, 'a');
  t2.clock.t += 1000;
  await t2.svc.submit({ name: 'Bo', side: 'move', score: 400, settings: { setup: {}, setsDone: 3 } }, 'b');
  t2.clock.t += 1000;
  await t2.svc.submit({ name: 'Bo', side: 'move', score: 600, settings: { setup: {}, setsDone: 3 } }, 'b');
  const tie = await t2.svc.board({ side: 'move', tab: 'total' });
  assert(tie.rows[0].name === 'Ana' && tie.rows[1].name === 'Bo' && tie.rows[0].score === tie.rows[1].score, 'tie order');
});

test('Boards: Focus, Move and Combined; best session; top 10 with your own rank pinned', async () => {
  const { svc, clock } = setup();
  for (let i = 0; i < 15; i++) {
    clock.t += 1000;
    await svc.submit({ name: `Player ${String.fromCharCode(65 + i)}`, side: 'focus', score: 1000 + i * 100, settings: FOCUS }, `f${i}`);
  }
  await svc.submit({ name: 'Player A', side: 'move', score: 900, settings: { setup: {}, setsDone: 3 } }, 'm');
  await svc.submit({ name: 'Player A', side: 'move', score: 300, settings: { setup: {}, setsDone: 3 } }, 'm');
  const focus = await svc.board({ side: 'focus', tab: 'total', name: 'player a' });
  assert(focus.rows.length === 10 && focus.rows[0].name === 'Player O', 'top 10');
  assert(focus.me && focus.me.rank === 15 && focus.me.name === 'Player A', `pinned row: ${JSON.stringify(focus.me)}`);
  const all = await svc.board({ side: 'all', tab: 'total', name: 'Player A' });
  const a = all.me ?? all.rows.find((r) => r.name === 'Player A');
  assert(a.score === 1000 + 900 + 300 && a.sessions === 3, 'combined adds both sides');
  const best = await svc.board({ side: 'move', tab: 'best' });
  assert(best.rows[0].score === 900 && best.rows[0].sessions === 2, 'best session');
});

test('This week resets every Monday; all-time never resets; coach can reset the week', async () => {
  const { svc, clock } = setup();
  await svc.submit({ name: 'Jordan', side: 'focus', score: 500, settings: FOCUS }, 'a');
  assert((await svc.board({ side: 'focus', tab: 'week' })).rows[0].score === 500, 'this week');
  clock.t = Date.UTC(2026, 9, 19, 3, 59);   // Sunday 11:59 p.m. Eastern: same week
  assert((await svc.board({ side: 'focus', tab: 'week' })).rows.length === 1, 'reset too early');
  clock.t = Date.UTC(2026, 9, 19, 4, 1);    // Monday 12:01 a.m. Eastern: new week
  assert((await svc.board({ side: 'focus', tab: 'week' })).rows.length === 0, 'week didn’t reset');
  assert((await svc.board({ side: 'focus', tab: 'total' })).rows[0].score === 500, 'all-time changed');
  await svc.submit({ name: 'Jordan', side: 'focus', score: 200, settings: FOCUS }, 'a');
  const { token } = await svc.unlock({ pin: '2468' }, 'coach');
  clock.t += 1000;
  await svc.admin({ token, action: 'reset-week', confirm: 'RESET WEEK' });
  assert((await svc.board({ side: 'focus', tab: 'week' })).rows.length === 0, 'coach reset');
  assert((await svc.board({ side: 'focus', tab: 'total' })).rows[0].score === 700, 'coach reset touched all-time');
  // Monday midnight Eastern, across daylight saving changes.
  assert(weekStart(Date.UTC(2026, 9, 15, 15)).toISOString() === '2026-10-12T04:00:00.000Z', 'EDT Monday');
  assert(weekStart(Date.UTC(2026, 10, 4, 15)).toISOString() === '2026-11-02T05:00:00.000Z', 'EST Monday');
  assert(weekStart(Date.UTC(2026, 2, 9, 12)).toISOString() === '2026-03-09T04:00:00.000Z', 'DST-start Monday');
});

test('Scores over what the session allows are rejected (and nothing negative)', async () => {
  const { svc } = setup();
  const cap = focusCap(FOCUS);
  await svc.submit({ name: 'Jordan', side: 'focus', score: cap, settings: FOCUS }, 'a');
  let refused = 0;
  for (const bad of [cap + 1, -5, 1.5]) {
    try { await svc.submit({ name: 'Jordan', side: 'focus', score: bad, settings: FOCUS }, 'a'); } catch (e) { refused++; }
  }
  assert(refused === 3, 'over-cap, negative or fractional score accepted');
  const s = normalize({ cueType: 'colors', cones: 4, reps: 10, sets: 3 });
  const moveMax = moveCap(s, 2);
  assert(moveMax === moveScore(s, { reps: 20, setsDone: 2 }), 'MOVE cap = every rep of the completed sets');
  try { await svc.submit({ name: 'Jordan', side: 'move', score: moveMax + 1, settings: { setup: s, setsDone: 2 } }, 'a'); assert(false, 'accepted'); } catch (e) { assert(e.status === 422, 'wrong error'); }
  // A real session's score is always under its cap.
  const sc = createFocusScorer();
  for (let i = 0; i < 300; i++) sc.trial({ outcome: 'correct', rtMs: 150 });
  assert(focusScore({ points: sc.points, ...FOCUS }) <= cap, 'a perfect session would be rejected');
});

test('Only name, score, side, session settings and date are stored', async () => {
  const { svc, store } = setup();
  await svc.submit({ name: 'Jordan', side: 'focus', score: 900, settings: { ...FOCUS, email: 'x@y.z', age: 20 }, clientId: 'c1', extra: 'nope' }, 'a');
  const [row] = await store.scoresFor('jordan');
  assert(row && Object.keys(row).sort().join() === 'at,id,score,side', 'scores list');
  const board = await svc.board({ side: 'focus', tab: 'total' });
  assert(Object.keys(board.rows[0]).sort().join() === 'name,rank,score,sessions', 'board row fields');
  const saved = JSON.stringify(await store.ranking(['focus'], null));
  assert(!saved.includes('x@y.z') && !saved.includes('nope'), 'extra data stored');
});

test('Rate limit: too many scores from one place in 10 minutes are refused', async () => {
  const { svc, clock } = setup();
  let refused = 0;
  for (let i = 0; i < LIMITS.submitPerWindow + 3; i++) {
    try { await svc.submit({ name: 'Spam', side: 'focus', score: 100, settings: FOCUS }, 'same-ip'); } catch (e) { if (e.status === 429) refused++; }
  }
  assert(refused === 3, `refused ${refused}`);
  clock.t += LIMITS.submitWindowS * 1000 + 1;
  await svc.submit({ name: 'Spam', side: 'focus', score: 100, settings: FOCUS }, 'same-ip');
});

test('A whole team on one school Wi-Fi can post at the same time', async () => {
  const { svc } = setup();
  for (let i = 0; i < 40; i++) await svc.submit({ name: `Player ${i}`, side: 'focus', score: 100, settings: FOCUS }, 'school-wifi');
  assert(LIMITS.submitPerWindow >= 40, 'room for a full roster');
});

test('Coach tools need the PIN; wrong PINs lock out; rename, merge and remove work', async () => {
  const { svc } = setup();
  await svc.submit({ name: 'Jordan', side: 'focus', score: 500, settings: FOCUS }, 'a');
  await svc.submit({ name: 'Jordn', side: 'focus', score: 300, settings: FOCUS }, 'a');
  for (const token of [undefined, '', 'abc', '99999999999999.deadbeef']) {
    try { await svc.admin({ token, action: 'remove-name', name: 'Jordan' }); assert(false, 'worked without the PIN'); } catch (e) { assert(e.status === 401, `status ${e.status}`); }
  }
  for (let i = 0; i < LIMITS.pinTries; i++) {
    try { await svc.unlock({ pin: '0000' }, 'guesser'); } catch (e) { assert(e.status === 401, 'wrong PIN not refused'); }
  }
  try { await svc.unlock({ pin: '2468' }, 'guesser'); assert(false, 'not locked out'); } catch (e) { assert(e.status === 429, 'lockout'); }
  const { token } = await svc.unlock({ pin: '2468' }, 'coach');
  await svc.admin({ token, action: 'rename', name: 'jordn', to: 'Jordan' });   // merge the misspelling
  const b = await svc.board({ side: 'focus', tab: 'total' });
  assert(b.players === 1 && b.rows[0].score === 800 && b.rows[0].sessions === 2, 'merge');
  const { scores } = await svc.admin({ token, action: 'scores', name: 'Jordan' });
  await svc.admin({ token, action: 'remove-score', id: scores[0].id });
  assert((await svc.board({ side: 'focus', tab: 'total' })).rows[0].sessions === 1, 'remove one score');
  try { await svc.admin({ token, action: 'reset-all', confirm: 'reset' }); assert(false, 'reset without typing'); } catch (e) { assert(e.status === 400, 'typed confirmation'); }
  await svc.admin({ token, action: 'reset-all', confirm: 'RESET ALL' });
  assert((await svc.board({ side: 'focus', tab: 'total' })).players === 0, 'reset all');
  const off = createService(memoryStore(), {});
  try { await off.unlock({ pin: '' }, 'x'); assert(false, 'no PIN set'); } catch (e) { assert(e.status === 403, 'coach tools should be off without a PIN'); }
});

test('Offline scores wait on the phone and post when back online', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const { svc } = setup();
  let online = false;
  const posted = [];
  globalThis.fetch = async (url, opts = {}) => {
    if (!online) throw new TypeError('Failed to fetch');
    const body = opts.body ? JSON.parse(opts.body) : null;
    const q = Object.fromEntries(new URL(url, 'http://x').searchParams);
    let data;
    if (body?.action === 'submit') { posted.push(body.clientId); data = await svc.submit(body, 'phone'); }
    else data = await svc.board({ side: q.side, tab: q.tab, name: q.name });
    return { ok: true, status: 200, json: async () => data };
  };
  const r1 = await submitScore({ name: 'Jordan', side: 'focus', score: 400, settings: FOCUS });
  const r2 = await submitScore({ name: 'Jordan', side: 'focus', score: 600, settings: FOCUS });
  assert(r1.queued && r2.queued, 'should wait while offline');
  online = true;
  await flushQueue();
  await flushQueue();   // a second sync posts nothing twice
  assert(posted.length === 2 && new Set(posted).size === 2, `posted ${posted.length}`);
  const me = await getPlayerRank('jordan', { side: 'focus' });
  assert(me && me.score === 1000 && me.rank === 1, 'synced total');
  delete globalThis.fetch;
  delete globalThis.localStorage;
});

test('Server: health check, and a clear message until the database is connected', async () => {
  const call = (method, url, body) => handle({ method, query: Object.fromEntries(new URL(url, 'http://x').searchParams), body }, {});
  const health = await call('GET', '/api/leaderboard?action=health');
  assert(health.status === 200 && health.body.db === false, 'health');
  const off = await call('GET', '/api/leaderboard?action=board&side=focus&tab=total');
  assert(off.status === 503 && /isn’t connected/.test(off.body.error), 'not-connected message');
  assert(!JSON.stringify(health.body).includes('postgres'), 'health leaks settings');
});

test('Scoring numbers live in one config', () => {
  assert(SCORING.focus.correct === 100 && SCORING.focus.wrong === -50 && SCORING.move.perRep === 50 && SCORING.completionBonus.game === 500, 'config');
});

test('Old rate-limit windows are cleared out, so the table stays small', async () => {
  const clock = { t: Date.UTC(2026, 9, 16, 15) };
  const store = memoryStore({ now: () => clock.t });
  for (let i = 0; i < 50; i++) await store.hit(`submit:ip${i}`, 600);
  assert(store.hitCount() === 50, 'one window per network');
  clock.t += 601 * 1000;
  await store.hit('submit:new', 600);
  assert(store.hitCount() === 1, `ended windows should be gone, ${store.hitCount()} left`);
});
