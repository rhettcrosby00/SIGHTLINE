# Screen checks

Headless Chrome screenshots of Sightrep at exact phone sizes (iPhone SE 375×667 and
Pro Max 430×932) in light, dark and outdoor, each in a fresh browser. Every shot also lists
layout problems: sideways scrolling, text that spills, tap targets under 48 px, overlapping
buttons, and expected text that's missing. Nothing here is served to athletes.

Needs Google Chrome, Node 22+ and Python 3 (Pillow for contact sheets).

```bash
python3 tools/screens/testserver.py      # the app on :5175, with /__set to seed settings
node tools/screens/apiserver.mjs         # leaderboard + Partner API on :5176, in memory
node tools/screens/cdp.mjs main          # every shot in scenarios/main.mjs
node tools/screens/cdp.mjs main move-     # only shots whose name matches
node tools/screens/cdp.mjs eye           # Eye Check: fake camera, real face tracker, ?eyesim
python3 tools/screens/sheet.py home      # sheets/home.png: all sizes and themes side by side
```

Run the servers in their own terminals from the repo root. Shots go to `shots/`, problems
to `report-<set>.json` (both git-ignored). Add a scenario set by copying
`scenarios/main.mjs`; the steps a shot can take are listed at the top of it.
`LANES=3` runs fewer shots at once on a slower Mac.

Every shot starts with the safety waiver already accepted, so it opens where the app
normally would. `params: 'waiver=0'` starts on a brand-new phone (the waiver first);
`waiver=old` pretends only the previous version was accepted (the new one shows).
`nostorage=1` blocks saved data altogether (the waiver shows every visit).
