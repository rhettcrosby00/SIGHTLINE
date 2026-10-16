// Partner mode on the server: one phone
// on a stand shows cues, a coach's phone sends them. A "room" has a 4-digit
// code, the stand phone's setup (so only its own cones can be called) and the
// latest cue. Rooms last 2 hours. Nothing about the athlete is stored.
// Storage is a store (Postgres in production, memory in tests), so these
// rules are tested without a database.

import { createHash, randomInt } from 'node:crypto';
import { normalize } from '../../js/cone/config.js';
import { CUES } from '../../js/cone/cues/index.js';
import { HttpError } from './service.js';

export const PARTNER = {
  roomS: 7200,          // a room lasts 2 hours
  roomsPerHour: 10,     // new rooms per phone/network per hour
  minGapMs: 350,        // cues closer than this are refused: the stand phone's whole screen
                        // never changes more than about 3 times a second (photosensitivity)
  wrongCodes: 30,       // unknown codes per network…
  wrongWindowS: 600,    // …per 10 minutes, so codes can't be scanned
};
const fail = (status, message) => { throw new HttpError(status, message); };

export function createPartner(store, { secret = 'sightline', now = () => Date.now() } = {}) {
  const hashIp = (ip) => createHash('sha256').update(`${secret}:${ip}`).digest('hex');
  // A room by its code. Too many unknown codes from one network: blocked for a while.
  const room = async (code, ip = 'unknown') => {
    const bucket = `wrong:${hashIp(ip)}`;
    if (await store.hit(bucket, PARTNER.wrongWindowS, now(), { peek: true }) >= PARTNER.wrongCodes) {
      fail(429, 'Too many wrong codes. Wait a few minutes and try again.');
    }
    const r = /^\d{4}$/.test(String(code)) ? await store.get(String(code), now()) : null;
    if (!r) {
      await store.hit(bucket, PARTNER.wrongWindowS, now());
      fail(404, 'No partner session with that code. Check the number on the other phone.');
    }
    return r;
  };
  return {
    // The stand phone opens a room with its setup and gets the code to share.
    async open({ setup }, ip) {
      const s = normalize(setup ?? {});
      if (s.mode === 'planned') fail(400, 'Partner mode needs a reactive setup.');
      const ipHash = hashIp(ip);
      if (await store.roomsSince(ipHash, now() - 3600 * 1000) >= PARTNER.roomsPerHour) fail(429, 'Too many partner sessions from here. Try again in a bit.');
      await store.sweep(now());
      for (let i = 0; i < 25; i++) {
        const code = String(randomInt(1000, 10000));
        if (await store.create({ code, setup: s, ipHash, at: now(), expiresAt: now() + PARTNER.roomS * 1000 })) return { code };
      }
      return fail(503, 'No free codes right now. Try again.');
    },
    // Both phones: the room's setup, and the latest cue if it's newer than `after`.
    async poll({ code, after = -1 }, ip) {
      const r = await room(code, ip);
      return { seq: r.seq, cue: r.seq > Number(after) ? r.cue : null, setup: r.setup };
    },
    // The coach's phone calls a cone, a hold, or clears the screen.
    async send({ code, cue }, ip) {
      const r = await room(code, ip);
      const keys = CUES[r.setup.cueType].targets(r.setup).map((t) => t.key);
      const clean = cue?.kind === 'go' && keys.includes(cue.key) ? { kind: 'go', key: cue.key }
        : cue?.kind === 'hold' ? { kind: 'hold' } : cue?.kind === 'clear' ? { kind: 'clear' } : null;
      if (!clean) fail(400, 'That cue isn’t one of this setup’s cones.');
      if (r.seq > 0 && now() - r.updatedAt < PARTNER.minGapMs) fail(429, 'Too fast. Tap again.');
      return { seq: await store.cue(String(code), clean, now()) };
    },
  };
}
