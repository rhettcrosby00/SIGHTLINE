// The three presets each side opens with (v4.0): Quick, Standard and Game
// Speed. The Game Day / Training switch at the top of each side picks what
// they run. Starting any preset takes two taps from home (the side, then the
// preset); "Run last" on home takes one. Pure module, so the tests can check
// every preset.
//
//   FOCUS  Game Day: Game Ready 5 min · 8 min · 8 min on Hard
//          Training: Training 10 min · 15 min · 15 min on Hard
//   MOVE   js/cone/config.js (MOVE_PRESETS)

export const PRESETS = [
  { id: 'quick', title: 'Quick' },
  { id: 'standard', title: 'Standard' },
  { id: 'speed', title: 'Game Speed' },
];
export const presetById = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
export const DAYS = ['game', 'training'];
const DAY_LABEL = { game: 'Game Day', training: 'Training' };
const dayOf = (day) => (day === 'training' ? 'training' : 'game');

// FOCUS: the session, length and difficulty a preset runs.
export function focusPreset(id, day) {
  return {
    sessionId: dayOf(day) === 'training' ? 'training' : 'game',
    length: id === 'quick' ? 'quick' : 'standard',
    difficulty: id === 'speed' ? 'hard' : 'normal',
  };
}

// What "Run last" remembers: a preset as "game:speed" or "training:quick";
// anything else (a single FOCUS part, a MOVE setup) by its own id.
export const runKey = (day, id) => `${dayOf(day)}:${id}`;
export function parseRunKey(key) {
  const [day, id] = String(key ?? '').split(':');
  return DAYS.includes(day) && presetById[id] ? { day, id } : null;
}
// "Game Speed", or "Game Speed · Training" when it isn't a Game Day preset.
export function runTitle(key) {
  const p = parseRunKey(key);
  return p ? `${presetById[p.id].title}${p.day === 'training' ? ' · Training' : ''}` : null;
}

// The Game Day / Training switch at the top of each side (one setting, shared).
export const dayToggle = (day) => `
  <div class="seg seg--fill day-seg" role="radiogroup" aria-label="Today">
    ${DAYS.map((d) => `<button type="button" role="radio" data-day="${d}" aria-checked="${d === dayOf(day)}">${DAY_LABEL[d]}</button>`).join('')}
  </div>`;
// Under the switch. week = { thisWeek, streak, goal: [2, 4] } (js/lib/streak.js).
export function dayNote(day, { thisWeek = 0, streak = 0, goal = [2, 4] } = {}) {
  if (dayOf(day) === 'game') return 'Short and calm, ends easy. Before you compete.';
  return `Longer and harder, on days without a game. This week: <b>${thisWeek}</b> of ${goal[0]}–${goal[1]} training days${
    streak ? ` · <b>${streak}</b>-week streak` : ''}.`;
}
