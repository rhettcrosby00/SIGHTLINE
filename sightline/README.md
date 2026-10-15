# Sightline

A pre-game visual reaction and cognitive warm-up for athletes, in two sides:

**FOCUS: eyes, mind, breath.** The athlete holds the phone; every answer is a tap.
"Game Ready" runs four pillars in 5, 8 or 10 minutes (instructions included, never more):

1. **Regulate**: one breathing pattern, rotating (Box Breathing, Physiological Sigh; 4-7-8
   behind the `newDrills` flag).
2. **Activate**: Smooth Pursuit, Saccade Jumps (not in Quick), Peripheral Flash.
3. **Challenge**: Color Call, Go/No-Go.
4. **Rehearse**: Visualization, then Lock In breathing. It always ends on something that
   can't be failed, and every scored drill ends on a few easy cues.

Each pillar can also run on its own. **Extras** (optional): Gaze Stabilization, Stroop, Quick
Math, Quick Questions, Memory Sequence. These are lab-style drills with weaker evidence for sport,
so they're kept out of Game Ready. Instructions are **Auto** by default: the full how-to the
first 3 times a phone runs a drill, then just the rule. How-to cards start on their own, so a
session never runs past its minutes.

**MOVE: react, cut, compete.** The phone sits on a stand facing the athlete; no taps during a
set. Quick Start (4 cones, colors, 5 yd out and back, Training pace, 3 sets), Custom setup
(every Cone Drill option), and Signals Only (arrows, no cones). The time between cues comes
from distance, rep style (Out and back, First step, Cone to cone) and pace; between sets the
athlete answers "Too fast / Just right / Too slow".

A short summary follows each session. There are no accounts.

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
- `newDrills: 'preview'`: 4-7-8 Breathing, Memory Sequence.
- `leaderboard: true` (approved): name entry, the online board and coach tools.

## Saved on the phone

- `sightline.settings.v1`: FOCUS options, theme, cue word
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
| `js/plan.js` | FOCUS pillars, sessions, and minutes for each length |
| `js/routine.js` | Maps each FOCUS drill to the code that runs it |
| `js/engine.js` | Runs the steps; progress bar, pause/quit, wake lock |
| `js/stages/*.js` | One file per FOCUS drill group, plus `summary.js` |
| `js/cone/ui.js` | The MOVE screen and drill flow |
| `js/migrate.js` | Upgrades data saved by older versions |
| `js/lib/colors.js` | The 4 FOCUS cue colors and their shapes |
| `js/lib/audio.js` | Tones and vibration (off when Sound is off) |

## Testing shortcuts (add to the URL)

- `?only=stroop,lockin` runs just those drills. IDs: `settle`, `sigh`, `breath478`, `pursuit`,
  `saccades`, `gaze`, `peripheral`, `colorcall`, `gonogo`, `stroop`, `math`, `questions`,
  `memory`, `visualize`, `lockin`.
- `?speed=20` fast-forwards time.
- `?autostart=1` starts Game Ready; add `&session=regulate` (or `activate`, `challenge`,
  `rehearse`) for one part. `?autostart=quick` (or `custom`, `signals`) starts a MOVE drill.
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
