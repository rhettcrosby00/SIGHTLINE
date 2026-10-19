# sightrep.app (the website)

Plain pages, no scripts: the home page (from the launch poster), Safety waiver, Privacy, Terms
and a not-found page. Hosted on Cloudflare Pages, project **sightrep-site** (root directory
`site`, build command `npm run build`, output `dist`). Every branch gets a preview at
`https://<branch>.sightrep-site.pages.dev`.

- **Words that must match the app** come from the app's files at build time: the waiver and
  disclaimer (`../sightline/js/content/safety.js`), the price and store link
  (`../sightline/js/content/pro.js`), the logo and icons.
- **Checks:** `build.mjs` stops the build if a page is missing the footer links or the
  disclaimer, a link points nowhere, the Buy buttons don't go to the store, or the waiver
  differs from the app's.
- **Reviews:** `src/reviews.json`, real quotes only, each with the athlete's OK:
  `[{ "quote": "…", "name": "Jordan", "sport": "Wide receiver", "permission": true }]`.
  First name only. With none, the section isn't shown; the build refuses a review without a
  first name, a sport, or `"permission": true`.
- **Type:** Barlow Condensed for the big headline and buttons (it matches the launch poster),
  Barlow for everything else; sentence-case headings.
- **Pictures:** `python3 ../tools/site/pictures.py`. It makes `assets/screens/*.webp` from the app
  screenshots (`DPR=2 node ../tools/screens/cdp.mjs site-shots`) and the poster crop.
- **Look at it locally:** `node build.mjs`, then `node ../tools/site/serve.mjs` (:5177), then
  `node ../tools/screens/cdp.mjs site` for phone and desktop screen checks.
