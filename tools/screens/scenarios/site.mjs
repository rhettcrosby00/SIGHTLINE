// The website (sightrep.app) at phone and desktop sizes: node tools/screens/cdp.mjs site
// Needs `node site/build.mjs` and `node tools/site/serve.mjs` (:5177).
export const BASE = {};
const SITE = 'http://localhost:5177';
const ALL = { sizes: ['se', 'pm', 'desk'], themes: ['dark'] };
export const SHOTS = [
  { name: 'site-home', url: `${SITE}/`, ...ALL, expect: ['Reps for your eyes.', 'Get Sightrep · $35.50', 'Already have a key?', 'js:document.querySelector(".hero__poster").naturalWidth > 0'] },
  { name: 'site-sides', url: `${SITE}/`, ...ALL, steps: [['scrollTo', '#sides-title'], ['wait', 900]], expect: ['Two sides, one warm-up', 'js:[...document.querySelectorAll(".phone img")].filter((i) => { const r = i.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }).every((i) => i.complete && i.naturalWidth > 0)'] },
  { name: 'site-price', url: `${SITE}/`, ...ALL, steps: [['scrollTo', '#price-title'], ['wait', 300]], expect: ['One price. Yours to keep.', 'All sales are final.'] },
  { name: 'site-faq', url: `${SITE}/`, ...ALL, steps: [['scrollEnd'], ['wait', 300]], expect: ['Can I use it on two phones?', 'Safety waiver', 'Privacy', 'Terms'] },
  { name: 'site-waiver', url: `${SITE}/waiver`, ...ALL, expect: ['Safety waiver', 'Assumption of risk', 'Release of liability'] },
  { name: 'site-privacy', url: `${SITE}/privacy`, ...ALL, expect: ['Privacy', 'On your phone', 'Payments'] },
  { name: 'site-terms', url: `${SITE}/terms`, ...ALL, expect: ['Terms', 'All sales are final', 'Your license'] },
  { name: 'site-404', url: `${SITE}/nope`, sizes: ['se'], themes: ['dark'], expect: ['Not found', 'Go to the home page'] },
];
