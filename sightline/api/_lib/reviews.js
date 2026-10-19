// Reviews on sightrep.app: anyone can leave one (stars + a few words); each
// waits for the owner to approve it in Coach tools before it shows. The rule
// the owner follows (US FTC review rule): approve every honest review, good or
// bad; reject only spam, abuse, or reviews that aren't about Sightrep.
// A reviewer who got Sightrep free (the team code, a gift) or knows the people
// who make it ticks a box, and the review says so ("Got it free or knows the
// team"): FTC endorsement rules. The owner can add that label in Coach tools too.
// Kept: first name, sport or position, stars, the text, that box, and when. No email,
// no key, no IP address (rate limits count requests per network for an hour).

import { isBlocked } from '../../js/score/names.js';
import { HttpError } from './service.js';

export const REVIEWS = {
  textMin: 10, textMax: 400,
  nameMax: 20, sportMax: 40,
  perHour: 3,       // submissions per network per hour
  shown: 30,        // newest approved reviews returned to the website
};

const fail = (status, message) => { throw new HttpError(status, message); };
const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Why a submission can't be saved, or '' when it's fine.
export function reviewProblem({ name, sport, stars, text, consent, age, website } = {}) {
  if (website) return 'spam';   // the hidden field people never see; bots fill it in
  const n = clean(name, 100);
  if (!/^\p{L}[\p{L}'’-]{0,19}$/u.test(n)) return 'Use your first name only (letters).';
  if (isBlocked(n)) return 'Pick a different name.';
  const s = clean(sport, 100);
  if (s.length < 2 || s.length > REVIEWS.sportMax) return 'Add your sport or position.';
  if (isBlocked(s)) return 'Check your sport or position.';
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return 'Pick 1 to 5 stars.';
  const t = clean(text, 1000);
  if (t.length < REVIEWS.textMin) return 'Write a sentence or two.';
  if (t.length > REVIEWS.textMax) return `Keep it under ${REVIEWS.textMax} characters.`;
  if (consent !== true) return 'Tick the box to let us show your review.';
  if (age !== true) return 'Tick the box about your age or permission.';
  return '';
}

export function createReviews(store, { now = () => Date.now() } = {}) {
  return {
    // A new review from the website: saved as pending.
    async submit(body = {}, ip = 'unknown') {
      const problem = reviewProblem(body);
      if (problem === 'spam') return { ok: true };   // look normal to the bot, save nothing
      if (problem) fail(400, problem);
      if (await store.hit(`review:${ip}`, 3600) > REVIEWS.perHour) fail(429, 'Thanks! That’s plenty of reviews for now. Try again later.');
      const name = clean(body.name, REVIEWS.nameMax);
      await store.addReview({
        name: name.charAt(0).toUpperCase() + name.slice(1), sport: clean(body.sport, REVIEWS.sportMax),
        stars: body.stars, text: clean(body.text, REVIEWS.textMax), connected: body.connected === true, at: new Date(now()),
      });
      return { ok: true };
    },

    // What the website shows: approved reviews, newest first, with their count and average.
    async list() {
      const rows = await store.reviewsBy('approved', REVIEWS.shown);
      const { count, average } = await store.reviewStats();
      return { reviews: rows.map(({ name, sport, stars, text, connected, at }) => ({ name, sport, stars, text, connected, at })), count, average };
    },
  };
}

// Which websites may call the reviews API (CORS): sightrep.app, its preview
// links, and the local site server. Returns the origin to echo back, or ''.
export function corsOrigin(origin) {
  const o = String(origin ?? '');
  return /^https:\/\/sightrep\.app$|^https:\/\/([a-z0-9-]+\.)?sightrep-site\.pages\.dev$|^http:\/\/localhost:5177$/.test(o) ? o : '';
}
