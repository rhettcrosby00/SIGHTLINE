# Sightrep

A pre-game visual reaction and cognitive warm-up for athletes. Two sides, each opening with
three presets, so starting anything takes two taps from home (the side, then the preset) and
"Run last" takes one.

| | FOCUS: eyes, mind, breath | MOVE: react, cut, compete |
|---|---|---|
| Phone | In hand; every answer is a tap | On a stand facing the athlete; no taps during a set |
| Where | Locker room, bus, sideline | The field, during warm-up |
| Presets (Game Day) | Quick 5 min · Standard 8 min · Game Speed 8 min on Hard | Quick 2 × 20 s · Standard 3 × 20 s · Game Speed 3 × 20 s at game pace, full rest |
| Presets (Training) | Quick 10 · Standard 15 · Game Speed 15 min on Hard | Quick 2 × 20 s · Standard 5 × 30 s · Game Speed 4 × 30 s at game pace, all with decisions |
| Advanced | My Routine, one part on its own, Extras, Focus Check (Training), options | Countdown length, Custom setup, Signals Only |

Presets live in `js/presets.js` (FOCUS) and `MOVE_PRESETS` in `js/cone/config.js`.
**Game Day or Training** is a switch at the top of each side (one setting, remembered on the
phone). Game Day stays short and calm and ends easy; Training (non-game days) is longer and
harder, and each side shows this week's training days against 2–4 and a weekly streak
(`js/lib/streak.js`, this phone only). Sightrep is a warm-up tool, not a medical, diagnostic or
treatment tool. There are no accounts. The first screen on every phone is the safety waiver
(see "Safety waiver and safety notes").

## FOCUS

**How do you feel?** One tap on the FOCUS screen, above the presets: Flat · Ready · Wired
(Ready unless changed). It shapes the session and shows on the summary; nothing is saved.

Game Ready runs four pillars, instructions included, and never runs past 10 minutes:

1. **Regulate**: breathing, matched to how they feel. Ready: one rotating pattern (Box
   Breathing, Cyclic Sigh, Resonance, 4-7-8). Wired: 2–3 cyclic sighs, then 60–90 s of
   resonance breathing (in 4, out 6) and calmer cue pacing. Flat: a short sigh, then energizing
   breaths and quicker pacing.
2. **Activate**: Smooth Pursuit, Saccade Jumps (not in Quick), Peripheral Flash.
3. **Challenge**: Color Call, Go/No-Go.
4. **Rehearse**: Visualization (scripts for the athlete's sport and position), then
   **My Routine**. It always ends on something that can't be failed, and every scored drill
   ends on a few easy cues.

Training runs every pillar plus the **Visual skills** (Near-Far Focus, Target Capture,
Perception Span) at a harder adaptive level. Under **Advanced**:

- **My Routine**: the athlete's own 20–40 s pre-performance routine (stand still, one breath,
  an optional imagery line, their cue word, quiet eye for 2–3 s, then GO). Built and saved on
  the phone; also the last step of Game Ready.
- **One part on its own**: Breathing only, Eyes only (with a standalone Quiet Eye), Visual
  skills, Reaction only, Rehearse only. In Training mode they run harder too.
- **Extras** (optional): Gaze Stabilization, Stroop, Quick Math, Memory Sequence, Object
  Tracking. Lab-style drills with weaker evidence for sport, so they stay out of Game Ready.
- **Focus Check** (Training mode only; `js/lib/check.js`, `js/stages/focuscheck.js`): about
  30 seconds of taps, on its own or (Settings → Focus Check) at the start and end of a Training
  session. Guesses (< 0.1 s), lapses (> 1 s) and outliers are dropped and the median is used.
  Compared only with the last 10 checks on the same phone; noticeably slower (10%+, with 3+
  earlier checks) offers the Quick version. Never medical or diagnostic wording.
- **Options** (Settings): instructions (Auto by default: the full how-to the first 3 times a
  phone runs a drill, then just the rule), Low contrast, Occlusion, Focus Check.

**Adaptive difficulty** (`js/lib/adapt.js`): every scored drill gets harder after right answers
and eases off after misses (settling at about 80% right), inside a band set by Normal
(0–0.6) or Hard (0.4–1). Each drill's level is remembered on the phone. **Low contrast** fades
Color Call, Saccade Jumps, Peripheral Flash and Target Capture, never below 2.5:1
(`js/lib/contrast.js`). **Occlusion** (opt-in; Training only, never Game Ready): in Smooth
Pursuit, Saccade Jumps and Object Tracking the moving target disappears and comes back, never
faster than 3 changes a second, and never the whole screen. A photosensitivity warning shows the
first time it's turned on.

**Taps that can't be fooled** (`tapGuard` in `js/stages/common.js`, used by every drill that
takes taps): a second tap within 100 ms of the last one is ignored, so a double tap never counts
twice, and so is a tap in the first 150 ms after a cue appears (it was on its way before the cue).

When a Game Day preset finishes, the summary offers **Next: Move** (Game Speed): set the phone
down and the countdown gives time to get to the start.

**Eye Check (beta)** (`js/eye/`; Settings → Eye Check, opt-in and off by default): the front camera estimates where the eyes look during Quiet Eye, Peripheral Flash,
Saccade Jumps and Smooth Pursuit. Never in MOVE or Gaze Stabilization.

- **How**: MediaPipe Face Landmarker (iris landmarks, eye blendshapes, head pose) runs on the
  phone from `vendor/mediapipe/` (served by Sightrep, saved on first use). A 10-second,
  five-dot calibration (center and corners) fits a small model from those to the screen
  (`js/eye/math.js`); live tips first (face in view, light, phone at arm's length,
  sunglasses). The gaze is smoothed (One Euro filter) and treated as a general direction:
  left / center / right, a rough 3 × 3 grid at best. Nothing measures eye-jump speed or eye
  reaction time (the camera runs about 30 frames a second, 15 on older phones).
- **Speed** (v4.2): the face tracker runs on the phone's graphics chip when that works and is
  faster, otherwise the main processor (`delegatePicker`, decided in the first second or so,
  usually during calibration); each new camera frame is read as it arrives
  (`requestVideoFrameCallback`); "where are the eyes" feedback uses lighter smoothing
  (`SMOOTH`), while Quiet Eye's "are the eyes still" and drift use the heavier `CALM`.
  Feedback changes after 0.15 s held, and still never more than about 2.8 times a second.
- **During drills, indirect feedback only** (no cursor): the Quiet Eye ring fills only while
  the eyes are steady on the target and resets if they move, and the symbol waits for it (in
  held time, so the number of targets and the score don't change); in Peripheral Flash the
  center dot turns red and pulses slowly and the edge they glanced toward lights up; in
  Smooth Pursuit the dot dims when the eyes fall behind; in Saccade Jumps a small check shows
  when the eyes moved toward the number. Every change fades and happens at most about 2.5
  times a second.
- **Live view, calibration only**: "See your gaze" shows a large soft circle that follows the
  estimate, with the estimated accuracy and "Looks off? Recalibrate". Recalibrate is also on
  the pause screen during an eye drill, and it runs again on its own before the next eye
  drill if the estimate drifted from where the drill says the eyes should be.
- **After**: the summary shows, per drill, a 15-second replay (play / pause, 0.5×) with a soft
  trail over where the targets were, a heat map, simple stats ("Eyes centered 91%",
  "On track 78%", "Quiet Eye: 2.6 s average", "Moved toward the target 9 of 12") and one tip.
- **Rules**: "estimated" everywhere, no medical or vision claims; eye data never reaches the
  scorer or the leaderboard; if the picture gets unreliable, eye features pause quietly
  ("Eye tracking paused") and the drill carries on; the camera is on only during an eye
  drill, with an indicator, and off the moment it ends; nothing is recorded, saved or sent
  (a 16 × 12 brightness reading is the only pixel access), and the summary's numbers are
  dropped when it closes; tracking slows on older phones and stops if the phone runs slow.
- Testing without a face: `?eyesim=1` (a pretend face that looks where it should), `low`
  (it drops out every other 2.5 s) or `away` (it looks at the right edge).

## MOVE

The MOVE screen shows the cones every preset uses (the Custom setup's cones and distances, as
colors, arrows or numbers; 4 cones at 5 yards if those can't run), a reminder to turn the
brightness all the way up, and the presets. Tap one and:

- **Get-set countdown**: 5–10 s before the first set (Settings → Countdown, 7 by default), one
  big number a second, spoken when Sounds are on, with "Set your phone down facing you.
  Brightness all the way up." Later sets get 3 s.
- **Touch lock**: taps do nothing during the drill (no pause button to bump). Holding a finger
  anywhere for 1 second pauses (a ring fills under the finger). After Resume the phone counts
  3-2-1 so there's time to get back to the start spot.
- **Cues fill the screen**: colors full-screen, arrows at 84% of the width, one digit as big as
  the screen allows (about 22 yards to read at a glance on an iPhone SE; two digits about 16).
  Words are small from far away, so presets never use them; Sport calls (Custom setup) show how
  close to stand.
- **Rest between sets** counts down on its own with "Too fast / Just right / Too slow" for the
  next set; it never waits for a tap.

Under **Advanced**: the countdown length, **Custom setup** (every option: cue types, Decision
Layer, Planned patterns, distances per cone, pace, sets, rest, cue position, flash, fake-outs,
spoken callouts) and **Signals Only** (arrows, no cones). The time between cues comes from
distance, rep style (Out and back, First step, Cone to cone) and pace.

- **Decision Layer** (`js/cone/decide.js`, on in Training presets): about 4 in 10 cues need a
  decision first: Odd / even, Color word, Opposite, Two cues, Go / no-go. Each is carried by
  something big, so it reads from 10+ yards. Never the first or last cue.
- **Sport** cue type (`js/cone/cues/sport.js`): calls from the sport picked in Settings, one per
  direction.
- **Planned vs Reactive** (`js/cone/patterns.js`): Planned runs a known pattern (5-10-5, Square,
  T-drill): GO, then a walk-back countdown. Reactive is true agility.
- **Partner mode** is parked (`partner: false` in `js/features.js`): the code stays
  (`js/cone/partner.js`, `api/partner.js`, with its limits of 10 rooms an hour and 30 wrong codes
  per 10 minutes per network), but it's off everywhere.

## Built for real phones

- **Sound starts in the Start tap.** Every preset, Run last and Next: Move unlocks sound (and
  speech, for MOVE's countdown) before anything else, so cues are never silent because the
  phone hadn't allowed sound yet. With Sounds on, cues play even with the iPhone's silent
  switch on (Audio Session API, where the phone has it); other music pauses while a session
  runs. **Keep my music playing** (Settings → Sound) makes the app silent instead: cues come as
  vibration where the phone allows it, and on screen.
- **iPhone can't vibrate from a web app**, so every buzz comes with a tone or a change on
  screen (a test checks every one).
- **Auto-pause with a big Resume** (`js/engine.js`): when the screen locks, the athlete switches
  apps, a call or alarm takes over the sound, or something covers the app. The pause says why.
  A web app can't see a notification banner on its own.
- **Screen awake** (`js/lib/wakelock.js`): if the phone won't keep the screen on (no support,
  Low Power Mode or Battery Saver refusing it, or the lock dropped), a tip says to turn those off
  or set Auto-Lock to Never. A web app can't see Low Power Mode itself.
- **A buyer's first minute** (6.5, `js/onboarding.js`, words in `js/content/firstrun.js`): the
  Gumroad page has Copy (next to the key) and **Start Sightrep** (`app.sightrep.app/?start`). That
  opens the buyer version of the unlock screen: one big **Paste your key** (typing it is behind
  "Have a license key? Enter it here"). Then the guided setup, with "Step n of 4" and Back on every
  step after the waiver: 1 the safety waiver, 2 You're in (moves on after 1.5 s), 3 Make it yours
  (sport tiles, position, leaderboard name; Skip for now), 4 Home screen (the install steps,
  compact; skipped in the home-screen app), then "Let's try it. 3 minutes." **Start** runs the
  First session (box breathing, then Color Call with its example and practice; unscored, on no
  menu) or "Explore on my own" goes home. Progress is saved after every step
  (`sightrep.onboard.v1`) and resumes there; finished steps never repeat; phones set up before
  6.5 never see it. The key now comes before the waiver (a waiver accepted elsewhere comes back
  with the key); nothing in the app is reachable until both are done.
  - **Computer to phone** (`js/handoff.js`, `js/lib/qr.js`): "Start Sightrep" opened on a
    computer says Sightrep works best on a phone. Paste your key there and a QR code appears; the
    phone's camera opens Sightrep unlocked. The key is encrypted on the computer (AES-GCM) with a
    secret that only the QR link carries after the `#` (browsers never send that part), so the
    server keeps only a scrambled copy it can't read (`lb_handoffs`), for 10 minutes, once.
    "Continue on this computer" unlocks the computer instead.
  - **Step totals:** each setup step reached is counted once per phone, as that day's total
    (`lb_funnel`: day, step, count; nothing else). Coach tools → First-time setup (last 30 days).
- **Install** (`js/install.js`, 6.4): right after a key first unlocks a phone, a full screen shows
  how to put Sightrep on the home screen, for that phone and browser only: iPhone Safari (Share →
  Add to Home Screen → Add), iPhone Chrome (its Share button), Android and computers with Chrome or
  Edge (one Install button: the browser's own prompt; or its menu steps), and "open this page in
  Safari / Chrome" with Copy link for in-app browsers. "I've added it" ends it; "Remind me later"
  puts a small banner on the home screen on the next 2 visits, then stops. Never in the
  home-screen app. Settings → App → Install on home screen opens it any time. The help page is
  sightrep.app/install. Why: full screen with its own icon, works with no signal, and Safari can
  clear a website's saved data after about 7 days without a visit (home-screen apps keep it).
- **Offline**: every file is precached (`sw.js`); scores wait on the phone and post later, and
  the leaderboard shows an Offline note when it can't sync.

**First-run setup** (`js/guide.js`, about 30 seconds, Skip on every step): the two sides, then
sport and cue word, then a leaderboard name (optional). Shown once per phone (`setupDone`);
everything can be changed in Settings. About → How it works shows three short panels.

**Leaderboard**: one board per side (Focus, Move), All-time and This week. The first time, the
athlete enters a name (or 3-letter initials); after that every score saves on its own and the
result shows on the summary ("Not you?" changes the name for next time). It saves only name,
score, side, session settings and date. Up to 60 scores per network per 10 minutes (a whole team
on one school Wi-Fi); when the board is busy or offline, the score waits on the phone and posts
later.

## Run it locally

No build step needed to try it. The app is static; only the server functions have a
dependency (the Neon database driver, installed by Cloudflare). Serve the folder with any
static server:

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173.

## Hosting (Cloudflare Pages)

Sightrep runs on Cloudflare Pages (free plan; it allows a paid app). The project is connected
to this GitHub repo:

- **Settings:** root directory `sightline`, build command `npm run build` (the tests, then
  `build.mjs`, which copies only the app's files into `dist/`). `wrangler.toml` sets the output
  folder and turns on `nodejs_compat` (the server uses `node:crypto`).
- **Server:** `functions/api/[name].js` serves `/api/leaderboard` and `/api/partner`. It turns
  each request into the plain object `handle()` in `api/*.js` takes. Everything else is plain
  files (free, unlimited).
- **Secrets:** Settings → Variables and Secrets → `DATABASE_URL` (the Neon database) and
  `COACH_PIN`, as encrypted secrets. Never in the repo.
- **Previews:** every branch gets its own public link, `https://<branch>.sightrep.pages.dev`.
  `sightrep.pages.dev` is the live site (same as app.sightrep.app).
- **Database:** Neon, first set up through Vercel's Storage tab. If Vercel lists it as
  "Vercel-managed", it keeps working as long as the (free) Vercel account exists.

## Put it on a phone

The phone needs the app served over **HTTPS** for offline use, installing, and keeping the
screen awake: open https://app.sightrep.app.

On the phone, open the URL once while online, then install it (the app shows the steps right
after the key unlocks it; https://sightrep.app/install has them too):

- **iPhone:** in Safari, Share, then Add to Home Screen, then Add. Then open it from the home
  screen and enter the key once more: the home-screen app keeps its own storage, apart from
  Safari. That first move into it is free (it doesn't count toward 3 moves in 30 days), Safari
  then says "Sightrep is on your home screen now", and the setup saved with the key comes back.
- **Android:** tap Install Sightrep (or ⋮ → Install app). It shares Chrome's storage: no key again.

After that it works with no signal. Icons, launch pictures and the link preview are drawn on the
palette's ink (`tools/brand/make.py`); the manifest uses the same color and `id: "/"`.

## Updating

The service worker caches every file. After changing anything, bump `CACHE_VERSION` in
`sw.js` and `APP_VERSION` in `js/main.js` to the same number (for example `1.1` to `1.2`).
If you add a new file, also add it to `ASSETS` in `sw.js`.

Phones download the new version in the background the next time the app is opened online.
A "New version ready — tap to update" banner then appears on the start screen (never during
a session). The version number shows at the bottom of the start screen.

## MOVE (js/cone/)

- `timing.js`: distance-based cue timing. Every number is in `TIMING` at the top:
  `pace × (reaction + yards out × pace per yard + turn + yards back × pace per yard + reset)`,
  First step times, ±10% variation, the 1–12 s limits, the 10% "Too fast / Too slow" step,
  and the suggested work-to-rest ratios.
- `config.js`: options, validation, the presets (`MOVE_PRESETS`, `presetCones`, `movePreset`), Signals Only, the countdown
- `cues/`: one file per cue type
- `plan.js`: balanced, no-repeat cue planning
- `setup.js`, `layout.js`, `run.js`, `ui.js`: the screens

## Leaderboard (js/score/, api/)

- `js/score/scoring.js`: every scoring number (`SCORING`): Focus cue points, speed bonus,
  streaks and penalties; Move points per rep and multipliers; difficulty and finish bonuses.
- `js/score/names.js`: name matching (case and spacing), initials, the offensive-name filter.
- `js/score/board.js`: `submitScore`, `getLeaderboard`, `getPlayerRank`; offline or busy scores
  wait on the phone and post later.
- `js/score/ui.js`: name entry (first time), the result on the summary, the board, coach tools.
  The server still answers `side=all` and `tab=best`; the app no longer asks.
- `api/leaderboard.js`: the leaderboard server (served through `functions/api/[name].js`). It
  checks every score against the most its session could earn, rate-limits, and guards coach
  tools with `COACH_PIN`.
- Setup: `DATABASE_URL` and `COACH_PIN` in Cloudflare's project settings (see Hosting). The
  database address never appears in the app.
- `/api/leaderboard?action=health` shows `{ db, coach }` (true/false only).

## Website reviews

Anyone can leave a review on sightrep.app/review (stars, first name, sport or position, up to
400 characters, and two boxes: OK to show it, and 16+ or permission). It's saved as **pending**
and shows on the website only after the owner approves it in **Coach tools → Website reviews**.
The rule there, from the US FTC's review rule: approve every honest review, good or bad; reject
only spam, abuse, or reviews that aren't about Sightrep.
- **Got it free or knows the team (6.3):** a box on the form for reviewers who got Sightrep free
  (the team code, a gift) or know the people who make it. Their review shows "Got it free or knows
  the team" (FTC endorsement rules). In Coach tools the owner can add or take off that label, for a
  teammate who forgot the box.
- Server: `api/reviews.js` (`/api/reviews`; `GET ?action=list` gives the approved ones, newest
  first, with their count and average; `POST { action: 'submit', … }` sends one), rules in
  `api/_lib/reviews.js`: the same offensive-word check as leaderboard names, a hidden spam-trap
  field, 3 per hour per network. Table `site_reviews` (no email, IP, device or key).
- Only https://sightrep.app, its previews (`*.sightrep-site.pages.dev`) and the local site
  (:5177) may call it from a browser (CORS).
- Approve, Reject and Remove are coach tasks in `api/_lib/service.js`, behind `COACH_PIN`.
- Previews share the live database, so a review sent on a preview is a real pending review.
  The website preview calls the app preview of the same branch.

## Web addresses

| Address | What it is |
|---|---|
| https://app.sightrep.app | the app (Cloudflare Pages custom domain) |
| https://sightrep.app | the website (`../site/`, Cloudflare Pages project "sightrep-site"): what Sightrep is, reviews, Buy, Safety waiver, Privacy, Terms |
| https://www.sightrep.app | permanent (301) redirect to sightrep.app |
| sightrep.pages.dev | Cloudflare's own name for the live app |
| sightline-psi.vercel.app | the old address: a permanent (308) redirect to app.sightrep.app, set in Vercel → Settings → Domains. For that, app.sightrep.app is also listed in the Vercel project, as a name only (it shows "Invalid Configuration"; its DNS points to Cloudflare). Don't remove it there, or the redirect stops. |

DNS is on Cloudflare. `app` and `sightrep.app` are Pages custom domains (Cloudflare manages
those records); the `www` redirect is a Cloudflare Redirect Rule. Cloudflare Email Routing adds
and locks its own MX, SPF and DKIM records (support@ and hello@ forward to the team inbox); leave
them alone. `node ../tools/domains/check.mjs [version]` checks every address from outside: HTTPS
certificates, redirects, that Cloudflare serves the app, the app version, the server's health,
and the email DNS (one SPF record, DMARC).

## Feature flags

`js/features.js` holds switches for work in progress only. Add a new feature as
`name: 'preview'`: on for preview links (`<branch>.sightrep.pages.dev`) and locally, off on
the live addresses (add `?name` to the live address to see it anyway), and check it with `isOn('name')`. Once
it's approved, remove the switch and its "off" path; the tests fail if an approved switch lingers
or a switch is never checked. `false` parks a feature: its code stays, off everywhere. Today:
`partner: false` (Partner mode).

## Saved on the phone

- `sightrep.settings.v1`: the last preset's length and difficulty, instructions, theme, cue word, sport and position, Sounds, music mode, contrast, occlusion, Focus Check, Game Day or Training, the MOVE countdown, whether the first-run setup is done
- `sightrep.routine.v1`: My Routine (breath, imagery line, quiet-eye seconds)
- `sightrep.levels.v1`: each drill's adaptive difficulty level
- `sightrep.check.v1`: the last 10 Focus Check times
- `sightrep.training.v1`: training days (last 120 days), for the weekly streak
- `sightrep.cone.v1` / `sightrep.signals.v1`: MOVE custom setup / Signals Only setup
- `sightrep.tune.v1`: "Too fast / Too slow" answers, per distance and rep style
- `sightrep.name.v1`, `sightrep.lbqueue.v1`: last leaderboard name; scores waiting to post
- `sightrep.last.v2`: "Run last" for each side: a preset (`game:speed`), a FOCUS part or a MOVE setup (older saves upgraded by `js/migrate.js`)
- `sightrep.install.v2`: the home-screen steps: new, later (and reminders shown), or added
- `sightrep.onboard.v1`: where this phone is in the first-time setup, and which steps it has counted
- `sightrep.backup.v1`: a fingerprint of the setup last saved with the key (to skip repeats)
- `sightrep.variety.v1`, `sightrep.seen.v1` (drills run, for Auto instructions)
- `sightrep.waiver.v1`: the accepted safety waiver: its version, the date and time (ISO), and both boxes
- `sightrep.license.v1`, `sightrep.device.v1`: the Sightrep key on this phone (and when the server last called it good, or why it's locked); this phone's random ID

## Sightrep Pro: the key that unlocks the app

On for everyone since 6.0.

- **Buying:** athletes buy on Gumroad. Gumroad is the merchant of record, so it handles card
  details and sales tax, and it emails the license key. The listed price is $35.50, so $30
  reaches us after Gumroad's fees; all the wording, the price and the store link are in
  `js/content/pro.js`.
- **Unlocking:** after the safety waiver, a phone with no good key sees only the unlock screen
  (`js/unlock.js`). It offers Buy on Gumroad, or a box to enter a key. The first-run setup and
  `?autostart` links wait for it.
- **One phone at a time:** the server (`api/license.js`, `api/_lib/license.js`) asks Gumroad's
  public license check whether a key is real and not refunded (`GUMROAD_PRODUCT_ID` in
  Cloudflare's settings; it never counts a use). The database (`lb_licenses`) records which phone
  each key is on, by a hash of the key, never the key itself.
- **Moving phones:** entering the key on another phone moves it there, at most 3 times in 30
  days. The old phone locks at its next check. The first move into a home-screen app (on iPhone it
  has its own storage) is free, once per key; the old Safari copy hears "installed" and says to
  open Sightrep from the home screen.
- **Saved with the key** (`js/backup.js`, 6.4): settings, My Routine, levels, training days, Run
  last, the leaderboard name, MOVE setups, Focus Check results and the waiver acceptance are saved
  under the key's hash (`lb_key_data`), only by the phone the key is on, and only those items.
  Entering the key on a phone with none of its own (the home-screen app, a new phone) brings them
  back and the app restarts with them; a waiver version change still asks again. The home-screen
  app's first open asks for the key first (a welcome screen with Paste), so the waiver acceptance
  can come back with it.
- **Checks:** once a day when online (`js/license.js`). With no signal, the app keeps working for
  30 days after the last good check. A lock only happens on the home screen, never mid-session.
- **Coach tools → Keys → Free a key:** for a lost or reset phone; the key then unlocks the next
  phone it's entered on.
- **Test keys:** `TEST-OK-anything` unlocks and `TEST-REFUNDED-anything` is refused. They work only
  on preview builds (`build.mjs` marks them in `api/_lib/build-info.js` from Cloudflare's branch
  name) and in local runs, never on the live site.

## Safety waiver and safety notes

- **One file holds every word:** `js/content/safety.js` has the waiver (six sections, the two
  boxes, the button), the disclaimer, the three safety notes, which drills show which note, and
  the waiver's `version`.
- **First screen, every phone** (`js/waiver.js`). `index.html` starts with
  `<html data-gate="waiver">`, which hides every other screen until the waiver is accepted; the
  first-run setup and `?autostart` links wait for it. No back button, no decline, and the button
  stays off until both boxes are ticked. "View full waiver" opens the text full screen.
- **Shown again** when the version changes, when the saved acceptance is missing (data cleared),
  or when saved data is blocked (acceptance then lasts for that visit only).
- **To change the waiver:** edit the text in `js/content/safety.js`, update `effective`, and
  raise `version` by one. Every phone shows the new one once.
- **Safety notes**, on the how-to card and along the top while the drill runs: "Stop if you feel
  dizzy." (Gaze Stabilization, Near-Far Focus); "Contains brief flashing visuals." (Peripheral
  Flash, Target Capture, Quiet Eye, Perception Span; Smooth Pursuit, Saccade Jumps and Object
  Tracking with Occlusion on; a MOVE run with Display: Flash). "Use a clear, flat area. Warm up
  before high-speed cuts." is on the MOVE hub, Custom setup, Set out your cones and Partner mode.
- **Links and disclaimer:** About → Safety waiver; Settings → Legal → Safety waiver. The
  disclaimer is on home, About and the session summary. The marketing site (not built yet)
  needs both in its footer.
- **Accounts (later):** save acceptance on the account too, and check it at login (`TODO
  accounts` in `js/waiver.js` and `js/main.js`).

## Randomness and variety

- All randomness comes from one seeded generator, `js/lib/rng.js`. `js/session.js` builds each
  session's drill order and content from it.
- Nothing repeats within a session: math problems, Stroop word/ink pairs, scripts, and
  cue-word suggestions.
- Colors, sides, numbers and letters are never shown back-to-back, and never more than 2 of the
  same in any 5.
- The phone keeps a small "recently used" list (`js/lib/variety.js`, localStorage) of the last
  4 sessions' content ids. That content rests for a few sessions. No results or personal info
  are stored. **About → Reset variety** clears the list.
- `?seed=12345` replays a session exactly, which helps when debugging. The session code is
  shown at the bottom of the summary.

## Running tests

```bash
node tests/run.js
```

The tests simulate 1,000 sessions and check the variety rules, the MOVE planner, contrast in
every theme, the FOCUS / MOVE split and saved-data upgrades, and dead code (unused files,
exports, imports, styles, icons and screens). Cloudflare runs them before every deploy
(`npm run build`), so a failing test stops the build and nothing goes live.

Screen checks (every screen at iPhone SE and Pro Max sizes, light, dark and outdoor, with
layout problems listed) live outside the app in `../tools/screens/`; see its README. The `eye`
set runs Eye Check with Chrome's fake camera, the real face tracker and `?eyesim`.

## Name, tagline and logo

The name and tagline live in `js/brand.js` (`BRAND`); `index.html` and `manifest.webmanifest`
repeat them for link previews and the home-screen icon, and `tests/brand.js` checks they agree.

The logo (traced from the brand board, approved 2026-10-16) is one component, `logo()` in
`js/brand.js`, used on Home (full logo), About (stacked), the summary and the leaderboard
(icon); the splash in `index.html` uses the same files. Every logo shows the dark version on dark
screens and the light one (black + deep lime #3F5C00) on light and outdoor. All files are made
from two masters by `tools/brand/make.py` (run `python3 tools/brand/make.py` from the repo root),
so swapping the logo is one change: replace the masters and run it.

- `assets/logo/logo-icon.svg`, `logo-wordmark.svg`: the masters (lime #B7FF00 and white)
- `logo-{icon,wordmark,horizontal,stacked}{,-light,-white,-black}.svg`: every version
- `logo-reticle(-light).svg`: the browser tab icon (no SR: it's unreadable at 16–32 px)
- `icons/`: app icons 192 / 512 / maskable 512 (inside the safe circle), Apple 180, favicon SVG + 32 / 16
- `assets/share.png`: link previews (1200 × 630, logo + tagline)
- `splash/`: iPhone launch pictures, one per screen size (linked in `index.html`)

Saved data moved from `sightline.*` to `sightrep.*` keys in v5.0 (`renameSavedData` in `js/migrate.js`).

## Where things live

| File | What it does |
|---|---|
| `js/main.js` | Home (two sides, Run last), Settings, About, offline support |
| `functions/api/[name].js`, `api/` | The server on Cloudflare Pages: the entry point, and the leaderboard and Partner handlers |
| `build.mjs`, `wrangler.toml` | What the site serves (`dist/`), and the Cloudflare Pages settings |
| `js/brand.js` | The name, the tagline and the logo component |
| `js/license.js`, `js/unlock.js`, `js/content/pro.js`, `api/license.js` | Sightrep Pro: the key on this phone, the unlock screen, its wording and price, the key check |
| `js/waiver.js`, `js/content/safety.js` | The safety waiver screen and its saved acceptance; every word of the waiver, disclaimer and safety notes |
| `js/presets.js` | Quick / Standard / Game Speed, Run last keys, the Game Day / Training switch |
| `js/guide.js`, `js/install.js` | First-run setup and How it works; the home-screen install steps |
| `js/backup.js` | The setup saved with the key, and bringing it back |
| `js/focus.js` | The FOCUS screen (readiness, presets, Advanced) and session flow |
| `js/plan.js` | FOCUS pillars, sessions, minutes for each length, and how readiness changes them |
| `js/myroutine.js`, `js/myroutine-ui.js` | My Routine: its parts and timing, the saved copy, the builder screen |
| `js/content/sports.js`, `js/content/scripts.js` | Sports, positions, skill cue words, visualization scripts |
| `js/content/vision.js` | Visual skills content: letters, rings, grids, tracking motion, occlusion timing, scoring |
| `js/lib/adapt.js`, `js/lib/contrast.js` | Adaptive difficulty (and saved levels); Low contrast math |
| `js/cone/decide.js`, `js/cone/patterns.js`, `js/cone/cues/sport.js` | MOVE Decision Layer, planned patterns, sport calls |
| `js/lib/check.js`, `js/stages/focuscheck.js`, `js/lib/streak.js` | Focus Check (plan, timing math, screens) and the weekly training streak |
| `js/cone/partner.js`, `api/partner.js` | Partner mode (parked): the stand phone and the coach's phone, and the room server |
| `js/routine.js` | Maps each FOCUS drill to the code that runs it |
| `js/engine.js` | Runs the steps; progress bar, pause/quit, auto-pause, touch lock, wake lock and its tip |
| `js/stages/*.js` | One file per FOCUS drill group, plus `summary.js` |
| `js/cone/ui.js` | The MOVE screen (presets, your cones, Advanced) and drill flow |
| `js/migrate.js` | Upgrades data saved by older versions |
| `js/lib/colors.js` | The 4 FOCUS cue colors and their shapes |
| `js/lib/audio.js` | Tones, speech and vibration; the silent switch and call interruptions |
| `js/eye/` | Eye Check (beta): `math.js` (calibration, smoothing, feedback, stats), `index.js` (camera and tracking), `ui.js` (screens and summary), `sim.js` (`?eyesim`) |
| `vendor/mediapipe/` | The face tracker for Eye Check (see its README) |

## Testing shortcuts (add to the URL)

- `?only=stroop,lockin` runs just those drills. IDs: `settle`, `sigh`, `resonance`, `breath478`,
  `energize`, `pursuit`, `saccades`, `gaze`, `peripheral`, `quieteye`, `colorcall`, `gonogo`,
  `nearfar`, `capture`, `span`, `stroop`, `math`, `memory`, `mot`, `visualize`, `lockin`,
  `myroutine`.
- `?state=wired` (or `flat`, `ready`) builds the session as if that readiness was picked.
- `?speed=20` fast-forwards time.
- `?autostart=1` starts Game Ready; add `&session=regulate` (or `activate`, `challenge`,
  `vision`, `rehearse`, `extras`, `myroutine`, `training`) for one part; `?autostart=game:speed`
  (any MOVE preset key, or `custom`, `signals`) starts a MOVE drill. On a phone that hasn't
  accepted the safety waiver, the waiver comes first and the drill starts after.
- `?autoready=1` skips the I'M READY taps on the how-to cards.
- `?noguide=1` skips the first-run setup.
- `?sw=1` turns on offline caching on localhost. It is off there by default so edits show
  up right away.

## Research and sources

Sightrep is a focus, reaction and readiness warm-up. It isn't a vision, concussion or medical
assessment. The design follows these findings: short game-day sessions, sport-like and
movement-based drills over generic brain games, and the strongest evidence for breathing,
routines, quiet eye, imagery and self-talk. Real gains take repetition (2–4 sessions a week for
4+ weeks).

- Integrated sports vision training batteries, meta-analysis (2026): https://link.springer.com/article/10.1007/s44402-026-00147-8
- Perceptual-cognitive training in team sports, meta-analysis (Zhu et al., 2024): https://www.mdpi.com/2076-328X/14/10/919
- Stroboscopic visual training, meta-analysis (Wang et al., 2025): https://pmc.ncbi.nlm.nih.gov/articles/PMC12665768
- Mental fatigue and sport-specific psychomotor performance (Habay et al., 2021): https://researchportal.rma.ac.be/en/publications/mental-fatigue-and-sport-specific-psychomotor-performance-a-syste/
- Voluntary slow breathing and HRV, meta-analysis (Laborde et al., 2022): https://pure.solent.ac.uk/en/publications/effects-of-voluntary-slow-breathing-on-heart-rate-and-heart-rate-/
- Cyclic sighing RCT (Balban et al., 2023): https://hubermanlab.stanford.edu/publications/brief-structured-respiration-practices-enhance-mood-and-reduce-physiological-arousal
- Pre-performance routines, meta-analysis: https://lida.sport-iat.de/ta/Record/4088526?lng=en
- Quiet eye, meta-analysis (Lebeau et al., 2016): https://lida.sport-iat.de/ta/Record/4045573?lng=en
- Imagery interventions, meta-analysis (Simonsmeier et al., 2021): https://lida.sport-iat.de/ta/Record/4075347?lng=en
- Self-talk interventions, updated meta-analysis: https://pure.solent.ac.uk/en/publications/self-talk-interventions-and-sportmotor-performance-an-updated-sys/
- Music in exercise and sport, meta-analysis (Terry et al., 2020): https://research.usq.edu.au/item/q57x6/effects-of-music-in-exercise-and-sport-a-meta-analytic-review
- Nike/Senaptec Sensory Station and batting performance (Duke, 2018): https://corporate.dukehealth.org/news/vision-sensory-and-motor-testing-could-predict-best-batters-baseball
- No transfer of 3D-MOT training to soccer game play: https://pure.etsmtl.ca/en/publications/no-transfer-of-3d-multiple-object-tracking-training-on-game-perfo/
- Cognitive vs traditional warm-up pilot in basketball (2025): https://pmc.ncbi.nlm.nih.gov/articles/PMC12156952
