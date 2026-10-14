# Sightline

A pre-game visual reaction and cognitive warm-up for athletes. One preset routine, "Game Ready":
breathing, eye warm-up, reaction drills, and brain drills, followed by a short summary. There
are no accounts and nothing is saved.

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
