# Sightline

A pre-game visual reaction and cognitive warm-up for athletes, in two sides:

**FOCUS: eyes, mind, breath.** The athlete holds the phone; every answer is a tap.
"Game Ready" runs four pillars in 5, 8 or 10 minutes (instructions included, never more):

1. **Regulate**: breathing, matched to the check-in (below). Ready: one rotating pattern (Box
   Breathing, Cyclic Sigh, Resonance, 4-7-8). Wired: 2–3 cyclic
   sighs, then 60–90 s of resonance breathing (in 4, out 6). Flat: a short sigh, then
   energizing breaths.
2. **Activate**: Smooth Pursuit, Saccade Jumps (not in Quick), Peripheral Flash.
3. **Challenge**: Color Call, Go/No-Go. Cue timing is a little slower when Wired and quicker
   when Flat.
4. **Rehearse**: Visualization (scripts for the athlete's sport and position), then
   **My Routine**. It always ends on something that can't be failed, and every scored drill
   ends on a few easy cues.

**Game Day or Training** (the switch at the top of home, remembered on the phone). Game Day:
Game Ready (5 / 8 / 10 min, calm, ends easy) and MOVE Game Day. Training (non-game days):
the Training session (10 / 15 / 20 min: every pillar plus the Visual skills, at a harder
adaptive level, Occlusion allowed if turned on) and MOVE Training (the athlete's cones with
the Decision Layer, 5 × 30 s). Parts run from the FOCUS screen in Training mode are harder
too; Game Ready never is. Home shows this week's training days against 2–4 and a weekly
streak (weeks in a row with 2+ training days; `js/lib/streak.js`, this phone only).

**Focus Check** (optional, Settings; `js/lib/check.js`, `js/stages/focuscheck.js`): about 30
seconds at the start and end of Game Ready and Training, or on its own from the FOCUS screen.
Two warm-up taps, 6 reaction taps (tap when the circle turns green), then 8 go / no-go cues.
Timed from pointer-down events against the frame the cue was drawn in; guesses (< 0.1 s),
lapses (> 1 s) and outliers are dropped and the median is used. Compared only with the last
10 checks on the same phone; noticeably slower (10%+, with 3+ earlier checks) offers the
Quick version. Never medical or diagnostic wording.

**Check-in.** Before Game Ready: "How do you feel right now?" Flat · Ready · Wired, one tap,
plus the cue word (skill words for their sport, energy words, or their own). The first time it
also asks their sport and position. It asks again at the end; the before → after shows on the
summary only and is never saved.

**My Routine.** The athlete's own 20–40 s pre-performance routine: stand still, one breath,
an optional imagery line, their cue word, quiet eye (eyes still on one dot for 2–3 s), then
GO. Built on the FOCUS screen, saved on the phone only, and run as the last step of Game
Ready or on its own with one tap from home.

Each pillar can also run on its own (Breathing only, Eyes only with a standalone **Quiet Eye**
drill, Reaction only, Rehearse only).

**Visual skills** (its own session, 3 / 4 / 5 min, not in Game Ready): Near-Far Focus (look at a
spot 10+ ft away, then back: tap the small letter that showed), Target Capture (a tiny ring with a
gap flashes near an edge: match the gap) and Perception Span (dots flash on a 3×3 to 5×5 grid:
tap the same squares). Object Tracking (follow a few dots among identical moving ones) is in Extras.

**Adaptive difficulty** (`js/lib/adapt.js`): every scored drill gets harder after right answers
and eases off after misses (a weighted staircase that settles at about 80% right), inside a band
set by Normal (levels 0–0.6) or Hard (0.4–1). Each drill's level is remembered on the phone.
**Low contrast** (Settings → Contrast) fades Color Call, Saccade Jumps, Peripheral Flash and Target
Capture toward the background, never below 2.5:1 (`js/lib/contrast.js`).

**Occlusion** (behind the `occlusion` flag; Training only, never Game Ready): in Smooth Pursuit,
Saccade Jumps and Object Tracking the moving target disappears and comes back, never faster than
3 changes a second. Only the target, never the screen. A photosensitivity warning shows the
first time it's turned on. **Extras** (optional): Gaze Stabilization, Stroop, Quick
Math, Quick Questions, Memory Sequence. These are lab-style drills with weaker evidence for sport,
so they're kept out of Game Ready. Instructions are **Auto** by default: the full how-to the
first 3 times a phone runs a drill, then just the rule. How-to cards start on their own, so a
session never runs past its minutes.

**MOVE: react, cut, compete.** The phone sits on a stand facing the athlete; no taps during a
set. Quick Start (4 cones, colors, 5 yd out and back, Training pace, 3 sets), Game Day (the
athlete's own cones, 3 × 20 s at Game Speed with full rest), Custom setup (every Cone Drill
option), and Signals Only (arrows, no cones). The time between cues comes from distance, rep
style (Out and back, First step, Cone to cone) and pace; between sets the athlete answers
"Too fast / Just right / Too slow". Every set ends on a plain cue.

- **Decision Layer** (optional, off by default; `js/cone/decide.js`): about 4 in 10 cues need a
  decision first. Odd / even (a two-digit number: odd → left cone, even → right), Color word
  (a full-screen color with another color's name on it: go to the color), Opposite (a cue in a
  thick frame: go to the opposite cone; this replaces the old Reverse rule), Two cues (1 on top,
  2 below, shown for 1.5 s: go to 1, then 2) and Go / no-go (a real cue under a big HOLD band).
  Each one is carried by something big, so it reads from 10+ yards. Never the first or last cue.
- **Sport** cue type (`js/cone/cues/sport.js`): calls from the sport picked in Focus (DRIVE /
  PASS / SHOOT / BACK for basketball, PRESS / DROP / SWITCH / CHECK for soccer, …), one per
  direction. Longer calls read from closer; the setup shows about how far.
- **Planned vs Reactive** (`js/cone/patterns.js`): Planned runs a known pattern (5-10-5, Square,
  T-drill): GO, then a walk-back countdown. Reactive (the default) is true agility.
- **Partner mode** (behind the `partner` flag; `js/cone/partner.js`, `api/partner.js`): the
  stand phone shows a 4-digit code; a coach's phone types it and taps cones to send cues. The
  phones meet through the server (a room with the setup and the latest cue, gone after 2
  hours); the stand phone checks about 3 times a second.

A short summary follows each session. There are no accounts.

**Keep my music playing** (Settings → Sound): the app plays no sound at all, so the athlete's
own music never pauses. Cues come as vibration where the phone allows it, and on screen.
iPhone doesn't let web apps vibrate.

**Leaderboard**: after a session the athlete enters a name (or 3-letter
initials) and the score joins one online board for everyone: All-time, Best session and This
week, for Focus, Move or both combined. It saves only name, score, side, session settings and
date.

Sightline is a warm-up tool. It is not a medical, diagnostic, or treatment tool.

## Run it locally

No build step. The app is static; only the leaderboard function has a dependency (the Neon
database driver, installed by Vercel). Serve the folder with any static server:

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173.

## Put it on a phone

The phone needs the app served over **HTTPS** for offline use, installing, and keeping the
screen awake. Any static host works:

- **Netlify Drop:** drag this folder onto https://app.netlify.com/drop.
- **GitHub Pages:** push this folder to a repo, then turn on Pages in the repo settings.

On the phone, open the URL once while online, then install it:

- **iPhone:** Share, then Add to Home Screen.
- **Android:** tap Install.

After that it works with no signal.

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
- `config.js`: options, validation, the Quick Start and Signals Only presets
- `cues/`: one file per cue type
- `plan.js`: balanced, no-repeat cue planning
- `setup.js`, `layout.js`, `run.js`, `ui.js`: the screens

## Leaderboard (js/score/, api/)

- `js/score/scoring.js`: every scoring number (`SCORING`): Focus cue points, speed bonus,
  streaks and penalties; Move points per rep and multipliers; difficulty and finish bonuses.
- `js/score/names.js`: name matching (case and spacing), initials, the offensive-name filter.
- `js/score/board.js`: `submitScore`, `getLeaderboard`, `getPlayerRank`; offline scores wait on
  the phone and post when the connection returns.
- `js/score/ui.js`: name entry, the reveal, the board, coach tools.
- `api/leaderboard.js`: the one Vercel serverless function. It checks every score against the
  most its session could earn, rate-limits, and guards coach tools with `COACH_PIN`.
- Setup (Vercel): Storage → Create Database → Neon (free) → connect to Production and Preview;
  Settings → Environment Variables → `COACH_PIN`. The database address never appears in the app.
- `/api/leaderboard?action=health` shows `{ db, coach }` (true/false only).

## Feature flags

`js/features.js`. `'preview'` means on for Vercel preview links and locally, off on
sightline-psi.vercel.app (add `?flagName` to the live address to see it anyway).
- `newDrills: true` (approved): 4-7-8 Breathing, Memory Sequence.
- `leaderboard: true` (approved): name entry, the online board and coach tools.
- `occlusion: true` (approved with Training Mode): the opt-in Occlusion setting; Training only.
- `partner: true` (approved): MOVE Partner mode (a coach's phone sends the cues).
- `pregame: true` (approved): Full Pre-Game on the Game Day home screen: Focus Game Ready (Quick), then
  "Set your phone down" and Move's Game Day sets, one summary and both scores (`js/pregame.js`). About 10 minutes.

## Saved on the phone

- `sightline.settings.v1`: FOCUS options, theme, cue word, sport and position, music mode, contrast, occlusion, Focus Check, Game Day or Training
- `sightline.routine.v1`: My Routine (breath, imagery line, quiet-eye seconds)
- `sightline.levels.v1`: each drill's adaptive difficulty level
- `sightline.check.v1`: the last 10 Focus Check times
- `sightline.training.v1`: training days (last 120 days), for the weekly streak
- `sightline.cone.v1` / `sightline.signals.v1`: MOVE custom setup / Signals Only setup
- `sightline.tune.v1`: "Too fast / Too slow" answers, per distance and rep style
- `sightline.name.v1`, `sightline.lbqueue.v1`: last leaderboard name; scores waiting to post
- `sightline.last.v2`: "Run last" for each side (upgraded from `last.v1` by `js/migrate.js`)
- `sightline.variety.v1`, `sightline.guideSeen.v2`, `sightline.seen.v1` (drills run, for Auto instructions)

## Randomness and variety

- All randomness comes from one seeded generator, `js/lib/rng.js`. `js/session.js` builds each
  session's drill order and content from it.
- Nothing repeats within a session: math problems, Stroop word/ink pairs, questions, scripts,
  and cue-word suggestions.
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
exports, imports, styles, icons and screens). Vercel runs them before every deploy
(`vercel.json`), so a failing test stops the build and nothing goes live.

## Logo files

`assets/logo/` holds the original brand sheet (`sightline-brand-sheet.webp`) and SVGs traced
from it:
- `logo-mark`, `logo-horizontal` and `logo-wordmark` are for dark backgrounds.
- The `-mono-dark` versions are for light backgrounds.

If the designer provides the original vector files, replace these and regenerate the icons.

## Adding questions

Edit `js/data/questions.js`. Each entry has the question, the right answer, and one to three
wrong answers:

```js
{ q: 'Players per side in water polo, goalie included?', a: '7', w: ['5', '6', '8'] },
```

Keep answers short (about 12 characters or fewer) so they fit on a button.

## Where things live

| File | What it does |
|---|---|
| `js/main.js` | Home, Settings, About, offline support |
| `js/focus.js` | The FOCUS screen and session flow |
| `js/plan.js` | FOCUS pillars, sessions, minutes for each length, and the check-in's changes |
| `js/myroutine.js`, `js/myroutine-ui.js` | My Routine: its parts and timing, the saved copy, the builder screen |
| `js/content/sports.js`, `js/content/scripts.js` | Sports, positions, skill cue words, visualization scripts |
| `js/content/vision.js` | Visual skills content: letters, rings, grids, tracking motion, occlusion timing, scoring |
| `js/lib/adapt.js`, `js/lib/contrast.js` | Adaptive difficulty (and saved levels); Low contrast math |
| `js/cone/decide.js`, `js/cone/patterns.js`, `js/cone/cues/sport.js` | MOVE Decision Layer, planned patterns, sport calls |
| `js/lib/check.js`, `js/stages/focuscheck.js`, `js/lib/streak.js` | Focus Check (plan, timing math, screens) and the weekly training streak |
| `js/cone/partner.js`, `api/partner.js` | Partner mode: the stand phone and the coach's phone, and the room server |
| `js/routine.js` | Maps each FOCUS drill to the code that runs it |
| `js/engine.js` | Runs the steps; progress bar, pause/quit, wake lock |
| `js/stages/*.js` | One file per FOCUS drill group, plus `summary.js` |
| `js/cone/ui.js` | The MOVE screen and drill flow |
| `js/migrate.js` | Upgrades data saved by older versions |
| `js/lib/colors.js` | The 4 FOCUS cue colors and their shapes |
| `js/lib/audio.js` | Tones and vibration (tones off when Sound is off or music mode is on) |

## Testing shortcuts (add to the URL)

- `?only=stroop,lockin` runs just those drills. IDs: `settle`, `sigh`, `resonance`, `breath478`,
  `energize`, `pursuit`, `saccades`, `gaze`, `peripheral`, `quieteye`, `colorcall`, `gonogo`,
  `nearfar`, `capture`, `span`, `stroop`, `math`, `questions`, `memory`, `mot`, `visualize`, `lockin`,
  `myroutine`.
- `?state=wired` (or `flat`, `ready`) builds the session as if that check-in was picked; use it
  with `?autoready=1`, which skips the check-in.
- `?speed=20` fast-forwards time.
- `?autostart=1` starts Game Ready; add `&session=regulate` (or `activate`, `challenge`,
  `vision`, `rehearse`, `extras`, `myroutine`, `training`) for one part; `?autostart=gameday` or
  `training` starts those MOVE drills. `?autostart=quick` (or `custom`, `signals`) starts a MOVE drill.
- `?autoready=1` skips the I'M READY taps on the how-to cards.
- `?noguide=1` skips the first-run "How it works" guide.
- `?sw=1` turns on offline caching on localhost. It is off there by default so edits show
  up right away.

## Research and sources

Sightline is a focus, reaction and readiness warm-up. It isn't a vision, concussion or medical
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
