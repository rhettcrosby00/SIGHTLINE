// Cone Drill: palettes, directions, timing options, the default setup, and
// setup validation. Pure module (no DOM) so the tests can use it.

// Nine cone colors, each with a shape so color-blind athletes have a backup cue.
// Red, blue, green and yellow match the rest of Sightline.
export const CONE_COLORS = [
  { id: 'red',    label: 'RED',    hex: '#ff4d2e', ink: '#000', shape: '▲' },
  { id: 'blue',   label: 'BLUE',   hex: '#2f7bff', ink: '#fff', shape: '●' },
  { id: 'green',  label: 'GREEN',  hex: '#12c48b', ink: '#000', shape: '■' },
  { id: 'yellow', label: 'YELLOW', hex: '#ffd60a', ink: '#000', shape: '◆' },
  { id: 'orange', label: 'ORANGE', hex: '#ff9500', ink: '#000', shape: '▼' },
  { id: 'purple', label: 'PURPLE', hex: '#9b5cff', ink: '#fff', shape: '★' },
  { id: 'white',  label: 'WHITE',  hex: '#ffffff', ink: '#000', shape: '✚' },
  { id: 'pink',   label: 'PINK',   hex: '#ff6fb5', ink: '#000', shape: '♥' },
  { id: 'black',  label: 'BLACK',  hex: '#000000', ink: '#fff', shape: '✖', dark: true },
];
export const colorById = Object.fromEntries(CONE_COLORS.map((c) => [c.id, c]));

// Directions as seen by the athlete facing the phone. Angle 0 = forward
// (toward the phone), clockwise.
export const DIRECTIONS = [
  { id: 'F',  label: 'FORWARD',       angle: 0 },
  { id: 'FR', label: 'FORWARD-RIGHT', angle: 45 },
  { id: 'R',  label: 'RIGHT',         angle: 90 },
  { id: 'BR', label: 'BACK-RIGHT',    angle: 135 },
  { id: 'B',  label: 'BACK',          angle: 180 },
  { id: 'BL', label: 'BACK-LEFT',     angle: 225 },
  { id: 'L',  label: 'LEFT',          angle: 270 },
  { id: 'FL', label: 'FORWARD-LEFT',  angle: 315 },
];
export const dirById = Object.fromEntries(DIRECTIONS.map((d) => [d.id, d]));
export const OPPOSITE = { F: 'B', B: 'F', L: 'R', R: 'L', FL: 'BR', BR: 'FL', FR: 'BL', BL: 'FR' };
export const DIRECTION_PRESETS = {
  2: ['L', 'R'],
  3: ['L', 'R', 'F'],
  4: ['L', 'R', 'F', 'B'],
  5: ['L', 'R', 'F', 'FL', 'FR'],
  8: ['F', 'FR', 'R', 'BR', 'B', 'BL', 'L', 'FL'],
};

export const CUE_TYPES = ['colors', 'arrows', 'numbers', 'mixed'];
export const MIN_CONES = 2;
export const MAX_CONES = 8;

// Time between cues. Each gap varies ±JITTER so the rhythm can't be predicted.
export const SPEEDS = { slow: 3000, medium: 2000, fast: 1500, game: 1000 };
export const CUSTOM_MS = [800, 5000];
export const JITTER = 0.15;
export const REPS = [5, 30];
export const TIMED_SECONDS = [15, 20, 30, 45];
export const SETS = [1, 10];
export const REST_SECONDS = [15, 30, 45, 60, 90, 120];
export const FLASH_MS = [300, 1000];
export const FAKE_RATES = { off: 0, low: 0.1, medium: 0.2 };
export const REVERSE_RATE = 0.2;   // share of eligible arrow cues shown as "reverse"
export const COUNTDOWN_MS = 3000;
export const DISTANCE_YD = [3, 10];

export const DEFAULT_SETUP = {
  cueType: 'colors',
  cones: 4,
  coloredCones: true,
  colors: ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'white', 'pink'],
  directions: ['L', 'R', 'F', 'B'],
  speed: 'medium',
  customMs: 2000,
  setMode: 'reps',
  reps: 10,
  timedSec: 30,
  sets: 3,
  restSec: 30,
  position: 'center',     // center | random | peripheral
  display: 'hold',        // hold | flash
  flashMs: 500,
  fakes: 'off',           // off | low | medium
  reverse: false,
  sound: 'on',
  callouts: false,
  distance: 5,
};

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

// Base time between cues for a setup, in ms.
export const intervalMs = (s) => (s.speed === 'custom' ? clamp(s.customMs, CUSTOM_MS) : SPEEDS[s.speed] ?? SPEEDS.medium);

// The cone colors in use: the athlete's picks (Colored cones: Yes) or the
// default order (No), one per cone.
export function coneColors(s) {
  const base = s.coloredCones ? s.colors : DEFAULT_SETUP.colors.concat('black');
  return base.slice(0, s.cones);
}

// Fill in anything missing or out of range from a saved setup.
export function normalize(raw = {}) {
  const s = { ...DEFAULT_SETUP, ...raw };
  if (!CUE_TYPES.includes(s.cueType)) s.cueType = DEFAULT_SETUP.cueType;
  s.cones = clamp(Math.round(Number(s.cones) || 4), [MIN_CONES, MAX_CONES]);
  const valid = new Set(CONE_COLORS.map((c) => c.id));
  s.colors = Array.isArray(s.colors) ? s.colors.filter((c) => valid.has(c)) : DEFAULT_SETUP.colors.slice();
  // keep picks unique, then top up with unused colors so every cone has one
  s.colors = [...new Set(s.colors)];
  for (const c of CONE_COLORS) if (s.colors.length < MAX_CONES && !s.colors.includes(c.id)) s.colors.push(c.id);
  s.directions = Array.isArray(s.directions) ? DIRECTIONS.map((d) => d.id).filter((id) => s.directions.includes(id)) : DEFAULT_SETUP.directions.slice();
  if (s.directions.length < 2) s.directions = DIRECTION_PRESETS[2].slice();
  if (!(s.speed in SPEEDS) && s.speed !== 'custom') s.speed = 'medium';
  s.customMs = clamp(Number(s.customMs) || 2000, CUSTOM_MS);
  s.setMode = s.setMode === 'timed' ? 'timed' : 'reps';
  s.reps = clamp(Math.round(Number(s.reps) || 10), REPS);
  if (!TIMED_SECONDS.includes(s.timedSec)) s.timedSec = 30;
  s.sets = clamp(Math.round(Number(s.sets) || 3), SETS);
  if (!REST_SECONDS.includes(s.restSec)) s.restSec = 30;
  if (!['center', 'random', 'peripheral'].includes(s.position)) s.position = 'center';
  s.display = s.display === 'flash' ? 'flash' : 'hold';
  s.flashMs = clamp(Number(s.flashMs) || 500, FLASH_MS);
  if (!(s.fakes in FAKE_RATES)) s.fakes = 'off';
  s.reverse = !!s.reverse;
  s.sound = s.sound === 'off' ? 'off' : 'on';
  s.callouts = !!s.callouts;
  s.distance = clamp(Math.round(Number(s.distance) || 5), DISTANCE_YD);
  return s;
}

// Problems that block starting (errors) and things to double-check (warnings).
export function validate(s) {
  const errors = [];
  const warnings = [];
  const usesColors = s.cueType === 'colors' || s.cueType === 'mixed';
  const usesArrows = s.cueType === 'arrows' || s.cueType === 'mixed';
  if (usesColors) {
    const picked = coneColors(s);
    if (new Set(picked).size !== picked.length) errors.push('Each cone needs a different color.');
  }
  if (usesArrows) {
    if (s.directions.length < 2) errors.push('Pick at least 2 directions.');
    if (s.directions.length !== s.cones) {
      const msg = `You picked ${s.directions.length} directions but ${s.cones} cones — they should match.`;
      (s.cueType === 'mixed' ? errors : warnings).push(msg);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
