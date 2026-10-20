// Settings every shot starts from (sightrep.settings.v1), plus the shots.
// A shot: { name, set?, cone?, last?, player?, firstRun?, params?, steps?, expect?, combos? }
//   last: Run last ({ focus, move }); player: the remembered leaderboard name;
//   firstRun: show the first-time setup (otherwise ?noguide=1 skips it)
//   steps run in the page: ['click', sel] | ['wait', ms] | ['waitFor', sel, ms]
//     | ['scrollEnd'] | ['scrollTo', sel] | ['eval', js] | ['type', sel, text] | ['select', sel, value]
//     | ['hold', sel, ms] (a finger held down on sel for ms) | ['until', jsExpression, ms]
//   expect: text that must be on screen, a selector ('#…' / '.…') that must match, or 'js:expression' that must be true
//   reopen: close and reopen the app (saved data kept) at /?<reopen>, then run the `after` steps
//   combos: 'few' = SE dark and Pro Max light only; sizes: ['pm'] / themes: ['dark'] pick exact ones
//   url: open that page as it is (the website) instead of the app
//   ua: pretend to be that phone and browser; init: JavaScript run before the page's own
//   offline: no network for the reopen; installable: Chrome's installability check
//   media: CSS media to pretend ([{ name, value }]); settle: ms to let the page restart itself, then `after`
export const BASE = { length: 'standard', difficulty: 'normal', sound: 'off', guide: 'full', cue: 'ATTACK' };

const LAST = { focus: 'game:standard', move: 'game:speed' };
const FAST = 'speed=40&autoready=1';
const MOVE_QUICK = [['click', '#btn-move'], ['click', '[data-run="game:quick"]'], ['waitFor', '.count--move', 8000]];

export const SHOTS = [
  // Home: two choices only, each with Run last once something has run.
  { name: 'home', expect: ['#btn-focus-open:not([hidden])', '#btn-move-open:not([hidden])', 'Choose a preset', 'Your eyes move first.', 'js:document.title === "Sightrep"', 'js:!/sightline/i.test(document.body.innerText)'] },
  // A phone with Sightline-era saved data: everything carries over under the new keys.
  { name: 'home-migrated', params: 'legacy=1', set: { appearance: 'dark', cue: 'EYES UP' }, last: { focus: 'game:standard', move: 'game:speed' }, player: 'Jordan',
    expect: ['Run last', 'Standard · 8 min', 'js:document.documentElement.dataset.appearance === JSON.parse(localStorage.getItem("sightrep.settings.v1")).appearance', 'js:JSON.parse(localStorage.getItem("sightrep.name.v1")) === "Jordan"',
      'js:JSON.parse(localStorage.getItem("sightrep.settings.v1")).cue === "EYES UP"', 'js:!Object.keys(localStorage).some((k) => k.startsWith("sightline."))'], combos: 'few' },
  // The splash (put back from index.html after the app has started, to see it).
  { name: 'splash', steps: [['eval', "fetch('index.html').then((r) => r.text()).then((t) => document.body.insertAdjacentHTML('afterbegin', /<div id=\"splash\"[\\s\\S]*?<\\/div>/.exec(t)[0]))"], ['wait', 600]], expect: ['#splash .splash__logo'] },
  { name: 'home-last', last: LAST, expect: ['Run last', 'Standard · 8 min', 'Game Speed · 5 min', '#btn-focus-open[hidden]'] },
  { name: 'home-last-long', last: { focus: 'training:speed', move: 'training:speed' }, expect: ['Game Speed · Training · 15 min'], combos: 'few' },
  // Each side: Game Day / Training, presets, Advanced.
  { name: 'focus', steps: [['click', '#btn-focus']], expect: ['How do you feel?', 'Quick', 'Standard', 'Game Speed', '5 min', '8 min', 'Advanced'] },
  { name: 'focus-training', set: { day: 'training' }, steps: [['click', '#btn-focus']], expect: ['15 min', 'training days'] },
  { name: 'focus-advanced', set: { day: 'training' }, steps: [['click', '#btn-focus'], ['click', '.adv__head'], ['scrollTo', '[data-nav="check"]']], expect: ['Breathing only', 'Focus Check', 'Build My Routine'] },
  { name: 'move', steps: [['click', '#btn-move']], expect: ['brightness all the way up', 'Quick', 'Game Speed', 'Change cones'] },
  { name: 'move-advanced', steps: [['click', '#btn-move'], ['click', '.adv__head'], ['scrollEnd']], expect: ['Custom setup', 'Signals Only', '7s'] },
  // Two taps to start; one for Run last.
  { name: 'tap2-focus', steps: [['click', '#btn-focus'], ['click', '[data-preset="standard"]'], ['waitFor', '#screen-session.is-active', 8000], ['wait', 600]], expect: ['#screen-session.is-active'], combos: 'few' },
  { name: 'tap2-move', steps: [...MOVE_QUICK, ['wait', 300]], expect: ['GET SET', 'Brightness all the way up', '#screen-session.is-locked'] },
  { name: 'tap1-runlast', last: LAST, steps: [['click', '#btn-move-last'], ['waitFor', '.count--move', 8000]], expect: ['GET SET'], combos: 'few' },
  // MOVE during a set: a big number cue; taps do nothing; a 1 s hold pauses; Resume counts back in.
  { name: 'move-cue', params: 'speed=4', cone: { cueType: 'numbers' }, steps: [['click', '#btn-move'], ['click', '[data-run="game:quick"]'], ['waitFor', '.cdf', 15000], ['wait', 200]], combos: 'few' },
  { name: 'move-tap-ignored', steps: [...MOVE_QUICK, ['click', '#stage'], ['wait', 400]], expect: ['#pause-overlay[hidden]'], combos: 'few' },
  { name: 'move-hold-ring', steps: [...MOVE_QUICK, ['hold', '#stage', 500]], expect: ['#hold-ring:not([hidden])'], combos: 'few' },
  { name: 'move-hold-pause', steps: [...MOVE_QUICK, ['hold', '#stage', 1400]], expect: ['#pause-overlay:not([hidden])', 'Resume'] },
  { name: 'move-resume-count', steps: [...MOVE_QUICK, ['hold', '#stage', 1400], ['click', '#btn-resume'], ['wait', 200]], expect: ['Back to your start spot', '.pause.is-counting'], combos: 'few' },
  // Auto-pause when the app is left.
  { name: 'auto-pause', steps: [['click', '#btn-focus'], ['click', '[data-preset="quick"]'], ['waitFor', '#screen-session.is-active'], ['wait', 500], ['eval', "window.dispatchEvent(new Event('pagehide'))"], ['wait', 300]], expect: ['You left the app or the screen locked.', 'Resume'] },
  // Finishing: the score saves on its own under the remembered name; Next: Move.
  { name: 'focus-done', player: 'Jordan', params: `${FAST}&only=colorcall`, steps: [['click', '#btn-focus'], ['click', '[data-preset="quick"]'], ['waitFor', '#screen-done.is-active', 90000], ['waitFor', '.lb-inline__line .link-btn', 15000], ['wait', 300]], expect: ['Next: Move', 'for Jordan', 'js:!/home screen/i.test(document.querySelector("#screen-done").innerText)'] },
  { name: 'focus-done-end', player: 'Jordan', params: `${FAST}&only=colorcall`, steps: [['click', '#btn-focus'], ['click', '[data-preset="quick"]'], ['waitFor', '#screen-done.is-active', 90000], ['waitFor', '.lb-inline__line .link-btn', 15000], ['scrollEnd']], combos: 'few' },
  { name: 'focus-done-first', params: `${FAST}&only=colorcall`, steps: [['click', '#btn-focus'], ['click', '[data-preset="quick"]'], ['waitFor', '#screen-name.is-active', 90000], ['wait', 1200]], expect: ['Your name'], combos: 'few' },
  { name: 'move-done', player: 'Jordan', params: FAST, steps: [['click', '#btn-move'], ['click', '[data-run="game:quick"]'], ['waitFor', '#screen-cone-done.is-active', 90000], ['waitFor', '.lb-inline__line .link-btn', 15000], ['wait', 300]], expect: ['Quick complete', 'for Jordan', 'How was the pace?'] },
  // Leaderboard, Settings, About.
  { name: 'board', steps: [['click', '#btn-board'], ['wait', 600]], expect: ['All-time', 'This week'] },
  // Coach tools (PIN 2468 on the local test API): website reviews wait here for the owner.
  // Pending ones come from the site-reviews set (run it first to see them listed).
  { name: 'coach-reviews', steps: [['click', '#btn-board'], ['click', '.lb-coach'], ['type', '#lb-pin', '2468'], ['click', '[data-act="unlock"]'], ['waitFor', '.lb-review', 8000], ['wait', 300]],
    expect: ['Website reviews', 'Waiting for you', 'Approve every honest review, good or bad. Reject only spam, abuse, or reviews not about Sightrep.', 'On the website', 'Got it free or knows the team', 'Add the “Got it free” label', 'First-time setup (last 30 days)', 'Unlocked a new phone', 'Recent sign-ins', 'Last sale notice from Gumroad'] },
  { name: 'settings', steps: [['click', '#btn-settings']], expect: ['Cue word', 'Sounds'] },
  { name: 'settings-end', steps: [['click', '#btn-settings'], ['scrollEnd']], expect: ['Countdown before the first set'], combos: 'few' },
  { name: 'about', steps: [['click', '#btn-about']] },
  { name: 'guide', steps: [['click', '#btn-about'], ['click', '#btn-about-guide']], expect: ['Two sides, one warm-up'], combos: 'few' },
  // Focus Check: Training only.
  { name: 'check', set: { day: 'training', focusCheck: 'on' }, steps: [['click', '#btn-focus'], ['click', '[data-preset="standard"]'], ['waitFor', '.fc-intro', 8000], ['wait', 300]], expect: ['Focus Check', 'About 30 seconds'], combos: 'few' },
  // First-run setup, step by step.
  // The first-time setup (6.5): scenarios/first-run.mjs.
];
