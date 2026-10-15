# Sightline

A pre-game visual reaction and cognitive warm-up for athletes. One preset routine, "Game Ready",
in four pillars that always run in this order:

1. **Regulate**: Settle breathing.
2. **Activate**: Smooth Pursuit, Saccade Jumps, Gaze Stabilization (shuffled each session).
3. **Challenge**: Color Call, Go/No-Go, Stroop, Peripheral Flash, Quick Math, Quick Questions
   (shuffled each session).
4. **Rehearse**: Visualization, then Lock In breathing.

A short summary follows. There are no accounts and no saved results.

Sightline is a warm-up tool. It is not a medical, diagnostic, or treatment tool.

## Run it locally

No build step and no dependencies. Serve the folder with any static server:

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

## Cone Drill (feature flag)

Cone Drill is a standalone change-of-direction drill. Its code lives in `js/cone/`:
- `config.js`: options and validation
- `cues/`: one file per cue type
- `plan.js`: balanced, no-repeat cue planning
- `setup.js`, `layout.js`, `run.js`, `ui.js`: the screens

It's controlled by `js/features.js`:
- `coneDrill: true` (approved) turns it on everywhere.
- Setting it back to `'preview'` hides it on sightline-psi.vercel.app but keeps it on preview
  links and locally; `?coneDrill` on the live address shows it anyway.

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

The tests simulate 1,000 sessions and check the variety rules. Vercel runs them before every
deploy (`vercel.json`), so a failing test stops the build and nothing goes live.

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

Keep answers short (about 12 characters or fewer) so they fit on a button and can be read
from 10–15 ft.

## Where things live

| File | What it does |
|---|---|
| `js/routine.js` | Drill order and minutes per block for each length |
| `js/engine.js` | Runs the steps; progress bar, pause/quit, wake lock |
| `js/stages/*.js` | One file per drill group, plus `summary.js` |
| `js/lib/colors.js` | The 4 cue colors, their shapes, and cone directions |
| `js/lib/audio.js` | Tones and vibration (off when Sound is off) |

## Testing shortcuts (add to the URL)

- `?only=stroop,lockin` runs just those drills. IDs: `settle`, `pursuit`, `saccades`,
  `colorcall`, `gonogo`, `stroop`, `peripheral`, `math`, `questions`, `lockin`.
- `?speed=20` fast-forwards time.
- `?autostart=1` skips the Start tap.
- `?autoready=1` skips the I'M READY taps on the how-to cards.
- `?noguide=1` skips the first-run "How it works" guide.
- `?sw=1` turns on offline caching on localhost. It is off there by default so edits show
  up right away.
