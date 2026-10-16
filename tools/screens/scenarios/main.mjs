// Settings every shot starts from (sightline.settings.v1), plus the shots.
// A shot: { name, set?, cone?, last?, params?, steps?, expect?, combos? }
//   steps run in the page: ['click', sel] | ['wait', ms] | ['waitFor', sel, ms]
//     | ['scrollEnd'] | ['scrollTo', sel] | ['eval', js] | ['type', sel, text] | ['select', sel, value]
//   expect: text that must be on screen, or a selector ('#…') that must match
//   combos: 'few' = SE dark and Pro Max light only
export const BASE = { mode: 'tap', length: 'standard', difficulty: 'normal', sound: 'off', guide: 'full', cue: 'ATTACK' };

export const SHOTS = [
  { name: 'home' },
  { name: 'home-upgraded', last: 'cone', set: { mode: 'cones', length: 'full' }, expect: ['#btn-move-last:not([hidden])', 'Custom setup', 'Game Ready · 12 min'] },
  { name: 'focus', steps: [['click', '#btn-focus']], expect: ['Breathing only', 'Mind only'] },
  { name: 'move', steps: [['click', '#btn-move']], expect: ['Quick Start', 'Signals Only'] },
  { name: 'settings', steps: [['click', '#btn-settings']] },
  { name: 'about', steps: [['click', '#btn-about']] },
  { name: 'about-end', steps: [['click', '#btn-about'], ['scrollEnd']] },
  { name: 'guide', steps: [['click', '#btn-about'], ['click', '#btn-about-guide']] },
  { name: 'custom', steps: [['click', '#btn-move'], ['click', '#move-hub [data-run="custom"]']] },
  { name: 'signals', steps: [['click', '#btn-move'], ['click', '#move-hub [data-run="signals"]']], expect: ['Signals Only'] },
  { name: 'signals-end', steps: [['click', '#btn-move'], ['click', '#move-hub [data-run="signals"]'], ['scrollEnd']] },
  { name: 'quick-layout', steps: [['click', '#btn-quick']], expect: ['Set out 4 cones', '5 yards'] },
  { name: 'quick-cue', steps: [['click', '#btn-quick'], ['click', '#cd-layout [data-nav="start"]'], ['wait', 4300]], combos: 'few' },
  { name: 'signals-cue', steps: [['click', '#btn-move'], ['click', '#move-hub [data-run="signals"]'], ['click', '#cd-signals [data-nav="start"]'], ['wait', 4300]], combos: 'few' },
  { name: 'quick-done', params: 'speed=40', steps: [['click', '#btn-quick'], ['click', '#cd-layout [data-nav="start"]'], ['waitFor', '#screen-cone-done.is-active', 40000], ['wait', 400]], expect: ['Quick Start complete', '30'] },
  { name: 'check', steps: [['click', '#btn-game'], ['waitFor', '.check__go'], ['wait', 300]] },
  { name: 'memory-howto', params: 'autostart=1&session=challenge&only=memory', steps: [['waitFor', '.btn-ready'], ['wait', 600]], combos: 'few' },
  { name: 'memory', params: 'autostart=1&session=challenge&only=memory&autoready=1', steps: [['waitFor', '.memo'], ['wait', 4200]], combos: 'few' },
  { name: 'sigh', params: 'autostart=1&session=regulate&only=sigh&autoready=1', steps: [['wait', 9000]], combos: 'few' },
  { name: 'pause', params: 'autostart=1&autoready=1&only=colorcall', steps: [['wait', 5000], ['click', '#btn-pause'], ['wait', 300]], combos: 'few' },
  { name: 'game-done', params: 'autostart=1&autoready=1&speed=40', steps: [['waitFor', '#screen-done.is-active', 90000], ['wait', 400]], expect: ['Game Ready', 'accuracy'] },
  { name: 'breath-done', params: 'autostart=1&session=regulate&autoready=1&speed=40', steps: [['waitFor', '#screen-done.is-active', 60000], ['wait', 400]], combos: 'few', expect: ['Breathing only', 'drills done'] },
];

