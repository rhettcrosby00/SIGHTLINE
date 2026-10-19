// The app screenshots on the website (site/assets/screens/), taken sharp:
//   DPR=2 node tools/screens/cdp.mjs site-shots && python3 tools/site/screens.py
// Pro Max size, dark theme, a phone that has accepted the waiver and has a key.
export const BASE = { length: 'standard', difficulty: 'normal', sound: 'off', guide: 'full', cue: 'ATTACK', appearance: 'dark' };

const ONE = { sizes: ['pm'], themes: ['dark'] };
const DRILL = (session, only, extra = '') => `autostart=1&session=${session}&only=${only}&autoready=1${extra}`;

export const SHOTS = [
  { name: 'shot-home', ...ONE, last: { focus: 'game:standard', move: 'game:speed' }, player: 'Jordan', expect: ['Run last'] },
  { name: 'shot-focus', ...ONE, steps: [['click', '#btn-focus']], expect: ['Game Speed'] },
  { name: 'shot-drill', ...ONE, params: DRILL('challenge', 'colorcall'),
    steps: [['until', 'document.querySelector(".rx__cue .cue")', 20000], ['wait', 4000], ['until', 'document.querySelector(".rx__cue .cue")', 8000]], expect: ['.pad'] },
  { name: 'shot-breathe', ...ONE, params: DRILL('regulate', 'settle'), steps: [['waitFor', '.breathe__orb', 20000], ['wait', 5000]], expect: ['.breathe'] },
  { name: 'shot-move', ...ONE, params: 'speed=4', cone: { cueType: 'colors' },
    steps: [['click', '#btn-move'], ['click', '[data-run="game:quick"]'], ['waitFor', '.cdf', 15000], ['wait', 200]], expect: ['.cdf'] },
  // A simulated player: taps the right color about 0.4 s after each cue, so the results look real.
  { name: 'shot-done', ...ONE, player: 'Jordan', params: 'speed=2&autoready=1&only=colorcall',
    steps: [['eval', `let seen = null; setInterval(() => { const c = document.querySelector('.rx__cue .cue__label'); if (!c || c === seen) return; seen = c;
      setTimeout(() => document.querySelector('.pad__btn[data-id="' + c.textContent.trim().toLowerCase() + '"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), 200); }, 50);`],
      ['click', '#btn-focus'], ['click', '[data-preset="quick"]'], ['waitFor', '#screen-done.is-active', 110000], ['waitFor', '.lb-inline__line .link-btn', 15000], ['wait', 400]],
    expect: ['for Jordan'] },
];
