// Settings every shot starts from (sightline.settings.v1), plus the shots.
// A shot: { name, set?, cone?, last?, params?, steps?, expect?, combos? }
//   steps run in the page: ['click', sel] | ['wait', ms] | ['waitFor', sel, ms]
//     | ['scrollEnd'] | ['scrollTo', sel] | ['eval', js] | ['type', sel, text] | ['select', sel, value]
//   expect: text that must be on screen, or a selector ('#…') that must match
//   combos: 'few' = SE dark and Pro Max light only
export const BASE = { mode: 'tap', length: 'standard', difficulty: 'normal', sound: 'off', guide: 'full', cue: 'ATTACK' };

const ME = ['eval', "localStorage.setItem('sightline.name.v1', JSON.stringify('Jordan'))"];
const PG = [ME, ['click', '#btn-pregame'], ['waitFor', '[data-pg="start"]', 60000]];
export const SHOTS = [
  { name: 'pg-home', expect: ['#btn-pregame:not([hidden])', 'Full Pre-Game'] },
  { name: 'pg-home-training', set: { day: 'training' }, expect: ['#btn-pregame[hidden]'], combos: 'few' },
  { name: 'pg-transition', params: 'speed=40&autoready=1', steps: [...PG, ['wait', 400]], expect: ['Set your phone down', 'With cones', 'Start Move'] },
  { name: 'pg-transition-nocones', params: 'speed=40&autoready=1', steps: [...PG, ['click', '[data-cones="0"]'], ['wait', 300]], expect: ['Cut or shuffle'], combos: 'few' },
  { name: 'pg-full', params: 'speed=40&autoready=1', combos: 'few', steps: [...PG,
      ['click', '[data-pg="start"]'], ['waitFor', '#screen-name.is-active[data-side="move"], #screen-name.is-active', 90000],
      ['waitFor', '#screen-name[data-side="focus"].is-active', 5000], ['click', '[data-act="save"]'], ['waitFor', '.lbr__rank:not([hidden])', 15000],
      ['click', '[data-act="continue"]'], ['waitFor', '#screen-name[data-side="move"].is-active .lbn__input', 15000], ['wait', 1200]],
    expect: ['Move', 'honor system'] },
  { name: 'pg-done', params: 'speed=40&autoready=1', combos: 'few', steps: [...PG,
      ['click', '[data-pg="start"]'], ['waitFor', '#screen-name[data-side="focus"].is-active', 90000], ['click', '[data-act="save"]'],
      ['waitFor', '.lbr__rank:not([hidden])', 15000], ['click', '[data-act="continue"]'], ['waitFor', '#screen-name[data-side="move"].is-active .lbn__input', 15000],
      ['click', '[data-act="save"]'], ['waitFor', '.lbr__rank:not([hidden])', 15000], ['click', '[data-act="continue"]'],
      ['waitFor', '#screen-done.is-active', 15000], ['scrollTo', '.sum__move'], ['wait', 400]],
    expect: ['Full Pre-Game', 'Move · Game Day'] },
];

