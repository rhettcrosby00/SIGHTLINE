// The website (sightrep.app) at phone and desktop sizes: node tools/screens/cdp.mjs site
// Needs `node site/build.mjs` and `node tools/site/serve.mjs` (:5177).
export const BASE = {};
const SITE = 'http://localhost:5177';
const ALL = { sizes: ['se', 'pm', 'desk'], themes: ['dark'] };
export const SHOTS = [
  // The whole home page, top to bottom: look at every section, not just the first screen.
  { name: 'site-full', url: `${SITE}/`, ...ALL, fullPage: true,
    // Scroll down gradually, like a person would, so every picture loads; then back to the top.
    steps: [['until', '(window.__y = (window.__y || 0) + 300, scrollTo(0, window.__y), window.__y > document.documentElement.scrollHeight)', 30000],
      ['wait', 800], ['eval', 'scrollTo(0, 0)'], ['wait', 300]],
    expect: ['js:[...document.images].every((i) => i.complete && i.naturalWidth > 0)'] },
  { name: 'site-how', url: `${SITE}/`, ...ALL, steps: [['scrollTo', '#how-title'], ['wait', 600]],
    expect: ['How it works', 'js:[...document.querySelectorAll(".steps li")].every((li) => li.getBoundingClientRect().height < 120)'] },
  { name: 'site-home', url: `${SITE}/`, ...ALL, expect: ['Pre-game focus and reaction warm-up.', 'Get Sightrep · $35.50', 'Already have a key?', 'js:document.querySelector(".hero__poster").naturalWidth > 0'] },
  // Reviews right under the top, filled in from the API (empty or not, depending on what ran before).
  { name: 'site-reviews', url: `${SITE}/`, ...ALL, steps: [['scrollTo', '#reviews-title'], ['until', 'document.querySelector("[data-reviews-status]").textContent || document.querySelector(".review")', 8000], ['wait', 300]],
    expect: ['What athletes say', 'Write a review', 'js:document.querySelector("[data-reviews]").compareDocumentPosition(document.querySelector("#sides-title")) & Node.DOCUMENT_POSITION_FOLLOWING', 'js:!/didn’t load/.test(document.body.innerText)'] },
  { name: 'site-review', url: `${SITE}/review`, ...ALL, expect: ['Write a review', 'Your rating', 'First name', 'Sport or position', 'Your review', 'OK to show my first name', '16 or older', 'Send review'] },
  { name: 'site-inside', url: `${SITE}/`, ...ALL, steps: [['scrollTo', '#inside-title'], ['wait', 400]], expect: ['What’s inside'] },
  { name: 'site-why', url: `${SITE}/`, ...ALL, steps: [['scrollTo', '#why-title'], ['wait', 400]], expect: ['Why it works'] },
  { name: 'site-sides', url: `${SITE}/`, ...ALL, steps: [['scrollTo', '#sides-title'], ['wait', 900]], expect: ['Two sides, one warm-up', 'js:[...document.querySelectorAll(".phone img")].filter((i) => { const r = i.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }).every((i) => i.complete && i.naturalWidth > 0)'] },
  { name: 'site-price', url: `${SITE}/`, ...ALL, steps: [['scrollTo', '#price-title'], ['wait', 300]], expect: ['One price. Yours to keep.', 'All sales are final.'] },
  { name: 'site-faq', url: `${SITE}/`, ...ALL, steps: [['scrollEnd'], ['wait', 300]], expect: ['Can I use it on two phones?', 'Safety waiver', 'Privacy', 'Terms'] },
  { name: 'site-waiver', url: `${SITE}/waiver`, ...ALL, expect: ['Safety waiver', 'Assumption of risk', 'Release of liability'] },
  { name: 'site-privacy', url: `${SITE}/privacy`, ...ALL, expect: ['Privacy', 'On your phone', 'Payments'] },
  { name: 'site-terms', url: `${SITE}/terms`, ...ALL, expect: ['Terms', 'All sales are final', 'Your license'] },
  { name: 'site-404', url: `${SITE}/nope`, sizes: ['se'], themes: ['dark'], expect: ['Not found', 'Go to the home page'] },
];
