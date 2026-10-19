# sightrep.app (the website)

Plain pages plus one small script for reviews: the home page (from the launch poster), Write a
review, Safety waiver, Privacy, Terms and a not-found page. Hosted on Cloudflare Pages, project **sightrep-site** (root directory
`site`, build command `npm run build`, output `dist`). Every branch gets a preview at
`https://<branch>.sightrep-site.pages.dev`.

- **Words that must match the app** come from the app's files at build time: the waiver and
  disclaimer (`../sightline/js/content/safety.js`), the price and store link
  (`../sightline/js/content/pro.js`), the logo and icons.
- **Checks:** `build.mjs` stops the build if a page is missing the footer links or the
  disclaimer, a link points nowhere, the Buy buttons don't go to the store, or the waiver
  differs from the app's.
- **Reviews:** "What athletes say", right under the top of the home page, and the form at
  `/review`. `src/reviews.js` (the site's only script) loads the approved reviews from the app's
  server (`https://app.sightrep.app/api/reviews`; on a preview, the app preview of the same
  branch; locally, `/api/reviews` through `serve.mjs`) and sends new ones. Reviews go on the
  page as text only. Each new review waits until the owner approves it in the app's Coach tools
  (see "Website reviews" in `../sightline/README.md`). The build refuses any other script, any
  HTML insertion in `reviews.js`, and a wrong API address.
- **Type:** Barlow Condensed for the big headline and buttons (it matches the launch poster),
  Barlow for everything else; sentence-case headings.
- **Pictures:** `python3 ../tools/site/pictures.py`. It makes `assets/screens/*.webp` from the app
  screenshots (`DPR=2 node ../tools/screens/cdp.mjs site-shots`) and the poster crop.
- **Look at it locally:** `node build.mjs`, then `node ../tools/site/serve.mjs` (:5177) and
  `node ../tools/screens/apiserver.mjs` (:5176, for reviews), then
  `node ../tools/screens/cdp.mjs site` for phone and desktop screen checks, and
  `node ../tools/screens/cdp.mjs site-reviews` for the reviews filled in with sample reviews
  (local test server only) and sending one.
