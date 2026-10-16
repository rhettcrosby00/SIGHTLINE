// Partner mode (run by tests/run.js; preview, behind the `partner` flag): the
// stand phone opens a room, the coach's phone sends its own cones only, rooms
// expire, and the server keeps no athlete info.

import { test, assert } from './harness.js';
import { createPartner, PARTNER } from '../api/_lib/partner.js';
import { partnerMemory } from '../api/_lib/partner-store.js';
import { partnerFace, pollDelay, POLL, MIN_CHANGE_MS } from '../js/cone/partner.js';
import { normalize } from '../js/cone/config.js';
import { CUES } from '../js/cone/cues/index.js';

const status = async (p) => { try { await p; return 200; } catch (e) { return e.status ?? 500; } };

test('Partner mode: open a room, send a cue, the stand phone sees it once', async () => {
  let t = 1_000_000;
  const svc = createPartner(partnerMemory(), { now: () => t });
  const setup = normalize({ cueType: 'colors', cones: 4 });
  const { code } = await svc.open({ setup }, '1.2.3.4');
  assert(/^\d{4}$/.test(code), `code ${code}`);
  const first = await svc.poll({ code, after: 0 });
  assert(first.seq === 0 && first.cue === null && first.setup.cueType === 'colors', 'a new room has no cue yet');
  const key = CUES.colors.targets(setup)[2].key;
  t += 1000;
  assert((await svc.send({ code, cue: { kind: 'go', key } })).seq === 1, 'first cue is #1');
  const seen = await svc.poll({ code, after: 0 });
  assert(seen.seq === 1 && seen.cue.kind === 'go' && seen.cue.key === key, 'the cue arrives');
  assert((await svc.poll({ code, after: 1 })).cue === null, '…once');
  t += 100;
  assert(await status(svc.send({ code, cue: { kind: 'hold' } })) === 429, 'a double tap is ignored');
  t += 200;
  assert(await status(svc.send({ code, cue: { kind: 'hold' } })) === 429, 'still under the 3-a-second limit');
  t += PARTNER.minGapMs;
  assert((await svc.send({ code, cue: { kind: 'hold' } })).seq === 2, 'hold');
  t += PARTNER.minGapMs;
  assert(await status(svc.send({ code, cue: { kind: 'go', key: 'purple-elephant' } })) === 400, 'only this setup’s cones');
  assert(await status(svc.send({ code, cue: { kind: 'go', key, name: 'Jordan', extra: 'x' } })) === 200, 'extra fields are dropped');
  assert(JSON.stringify((await svc.poll({ code, after: 2 })).cue) === JSON.stringify({ kind: 'go', key }), 'only the cue is kept');
  assert(await status(svc.poll({ code: '12a4' })) === 404 && await status(svc.poll({ code: '0000' })) === 404, 'unknown codes');
  t += PARTNER.roomS * 1000;
  assert(await status(svc.poll({ code })) === 404, 'rooms expire after 2 hours');
});

test('Partner mode: limits, and planned setups can’t be called', async () => {
  const t = 5_000_000;
  const svc = createPartner(partnerMemory(), { now: () => t });
  for (let i = 0; i < PARTNER.roomsPerHour; i++) await svc.open({ setup: { cueType: 'arrows' } }, '9.9.9.9');
  assert(await status(svc.open({ setup: { cueType: 'arrows' } }, '9.9.9.9')) === 429, 'rooms per hour');
  assert(await status(svc.open({ setup: { cueType: 'arrows' } }, '8.8.8.8')) === 200, 'another network is fine');
  assert(await status(svc.open({ setup: { mode: 'planned' } }, '7.7.7.7')) === 400, 'planned drills have no cues to call');
});

test('Partner mode: the stand phone draws each cue like the drill does', () => {
  for (const cueType of ['colors', 'arrows', 'numbers', 'mixed', 'sport']) {
    const s = normalize({ cueType, cones: 4, directions: ['L', 'R', 'F', 'B'] });
    for (const t of CUES[cueType].targets(s)) {
      const f = partnerFace(s, { kind: 'go', key: t.key });
      const want = { colors: 'color', arrows: 'arrow', numbers: 'number', mixed: 'color', sport: 'word' }[cueType];
      assert(f.kind === want, `${cueType}: ${f.kind}`);
    }
    assert(partnerFace(s, { kind: 'hold' }).kind === 'hold' && partnerFace(s, { kind: 'clear' }) === null, 'hold and clear');
    assert(partnerFace(s, { kind: 'go', key: 'nope' }) === null, 'unknown cone: blank');
  }
});

test('Partner mode: wrong codes are limited per network, so codes can’t be scanned', async () => {
  let t = 9_000_000;
  const store = partnerMemory();
  const svc = createPartner(store, { now: () => t });
  const { code } = await svc.open({ setup: { cueType: 'colors' } }, '1.1.1.1');
  for (let i = 0; i < PARTNER.wrongCodes; i++) assert(await status(svc.poll({ code: String(1000 + i) }, '6.6.6.6')) === 404, 'unknown code');
  assert(await status(svc.poll({ code }, '6.6.6.6')) === 429, 'scanner blocked, even for a real code');
  assert(await status(svc.send({ code, cue: { kind: 'hold' } }, '6.6.6.6')) === 429, 'and can’t send cues');
  assert(await status(svc.poll({ code }, '1.1.1.1')) === 200, 'other networks are fine');
  for (let i = 0; i < 5; i++) await svc.poll({ code }, '5.5.5.5');
  assert(await status(svc.poll({ code }, '5.5.5.5')) === 200, 'right codes never count against you');
  t += PARTNER.wrongWindowS * 1000 + 1;
  assert(await status(svc.poll({ code }, '6.6.6.6')) === 200, 'the limit wears off');
  await store.sweep(t + PARTNER.roomS * 1000);
  assert(await status(svc.poll({ code }, '1.1.1.1')) === 404, 'swept rooms are gone');
});

test('Partner mode: whole-screen changes stay at 3 a second or less; checking eases off when quiet', () => {
  assert(1000 / MIN_CHANGE_MS <= 3 && 1000 / PARTNER.minGapMs <= 3, 'more than 3 changes a second possible');
  assert(pollDelay(0) === POLL.fastMs && pollDelay(POLL.quietMs - 1) === POLL.fastMs, 'quick while cues are coming');
  assert(pollDelay(POLL.quietMs) === POLL.slowMs && pollDelay(10 * 60_000) === POLL.slowMs, 'slower when quiet');
  assert(POLL.slowMs <= 1000, 'a quiet phone still answers within a second');
});
