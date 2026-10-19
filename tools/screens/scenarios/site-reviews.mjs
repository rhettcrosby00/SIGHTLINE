// The website's reviews with reviews on it, and sending one:
//   node tools/screens/cdp.mjs site-reviews   (after the `site` set, which sees them empty)
// Needs the local site (:5177) and the local test API (:5176, in memory). Loading
// this set first adds 8 approved SAMPLE reviews to the local test API only (never
// a real server), so the section can be checked full: cards, average, Show more.
export const BASE = {};
const SITE = 'http://localhost:5177';
const API = 'http://localhost:5176/api';
const ALL = { sizes: ['se', 'pm', 'desk'], themes: ['dark'] };

const post = (path, body, ip = '127.0.0.1') => fetch(`${API}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify(body) }).then((r) => r.json());
const SAMPLES = [
  ['Sample', 'Wide receiver', 5, 'Sample review for the screen check. A short one.'],
  ['Test', 'Point guard', 4, 'Sample review for the screen check, a little longer, to see how two or three lines of words wrap inside a card on a small phone.', true],
  ['Demo', 'Goalkeeper', 5, 'Sample review for the screen check.'],
  ['Sample', 'Midfield', 3, 'Sample review for the screen check, with a middle rating.'],
  ['Test', 'Shortstop', 5, 'Sample review for the screen check, number five.'],
  ['Demo', 'Libero', 4, 'Sample review for the screen check, number six.'],
  ['Sample', 'Defensive back', 2, 'Sample review for the screen check: a low rating shows the same as a high one.'],
  ['Test', 'Pitcher', 5, 'Sample review for the screen check, number eight (behind Show more).'],
];
const before = await fetch(`${API}/reviews?action=list`).then((r) => r.json());
if (before.count < SAMPLES.length) {
  for (const [i, [name, sport, stars, text, connected = false]] of [...SAMPLES.entries()].reverse()) {   // the first sample ends up newest, shown first
    await post('reviews', { action: 'submit', name, sport, stars, text, connected, consent: true, age: true, website: '' }, `10.9.0.${i + 1}`);
  }
  const { token } = await post('leaderboard', { action: 'unlock', pin: '2468' });
  const { pending } = await post('leaderboard', { action: 'admin', token, task: 'reviews' });
  for (const r of pending.filter((x) => x.text.startsWith('Sample review'))) await post('leaderboard', { action: 'admin', token, task: 'review-approve', id: r.id });
}

// Each send comes from its own made-up network, so the 3-an-hour limit doesn't stop the check.
const OWN_NETWORK = "{ const f = window.fetch; window.fetch = (u, o = {}) => f(u, { ...o, headers: { ...(o.headers || {}), 'X-Forwarded-For': '10.8.' + Math.floor(Math.random() * 250) + '.' + Math.floor(Math.random() * 250) } }); }";

export const SHOTS = [
  { name: 'reviews-full', url: `${SITE}/`, ...ALL, steps: [['scrollTo', '#reviews-title'], ['until', 'document.querySelector(".review")', 8000], ['wait', 300]],
    expect: ['What athletes say', 'from 8 reviews', 'Show more reviews', 'Write a review', 'Wide receiver', 'js:document.querySelectorAll(".review__tag").length === 1 && /Point guard/.test(document.querySelector(".review__tag").parentElement.innerText)',
      'js:document.querySelectorAll(".review:not([hidden])").length === 6', 'js:document.querySelector(".reviews__avg b").textContent === "4.1"'] },
  { name: 'reviews-more', url: `${SITE}/`, sizes: ['se'], themes: ['dark'], steps: [['until', 'document.querySelector(".review")', 8000], ['click', '[data-reviews-more]'], ['scrollTo', '.review:last-child']],
    expect: ['behind Show more', 'js:document.querySelectorAll(".review:not([hidden])").length === 8', 'js:document.querySelector("[data-reviews-more]").hidden'] },
  { name: 'review-missing', url: `${SITE}/review`, sizes: ['se'], themes: ['dark'], steps: [['click', 'button[type="submit"]'], ['scrollTo', '.rform__msg']],
    expect: ['Pick 1 to 5 stars.'] },
  { name: 'review-filled', url: `${SITE}/review`, ...ALL, steps: [['click', 'input[name="stars"][value="4"]'], ['type', '#r-name', 'Jordan'], ['type', '#r-sport', 'Wide receiver'],
    ['type', '#r-text', 'Sample review typed by the screen check.'], ['click', 'input[name="connected"]'], ['click', 'input[name="consent"]'], ['click', 'input[name="age"]'], ['scrollTo', 'input[name="connected"]']],
    expect: ['40 / 400', 'js:document.querySelectorAll(".rform__stars label.is-on").length === 4', 'js:!document.querySelector("[data-review-done]").offsetParent'] },
  { name: 'review-sent', url: `${SITE}/review`, ...ALL, steps: [['eval', OWN_NETWORK], ['click', 'input[name="stars"][value="5"]'], ['type', '#r-name', 'Jordan'], ['type', '#r-sport', 'Wide receiver'],
    ['type', '#r-text', 'Sample review sent by the screen check.'], ['click', 'input[name="connected"]'], ['click', 'input[name="consent"]'], ['click', 'input[name="age"]'], ['click', 'button[type="submit"]'],
    ['waitFor', '[data-review-done]:not([hidden])', 8000], ['eval', 'scrollTo(0, 0)']],
    expect: ['Thanks!', 'Your review appears once it’s checked.', 'js:!document.querySelector("[data-review-form]").offsetParent'] },
];
