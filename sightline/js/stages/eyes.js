// Eye warm-up: Smooth Pursuit (follow a moving dot) and Saccade Jumps
// (targets pop up at random edges). Eyes only, no scoring, works the same in
// Tap and Cone mode; Cone mode just draws everything bigger.

import { intro, animate, INTRO_MS } from './common.js';
import { shuffle, randRange, randInt } from '../lib/rng.js';
import { tone } from '../lib/audio.js';

const TAU = Math.PI * 2;

// Where the dot can travel: the stage box minus a margin so it never clips.
function field(el) {
  const r = el.getBoundingClientRect();
  const dot = parseFloat(getComputedStyle(el).getPropertyValue('--dot')) || 40;
  return { cx: r.width / 2, cy: r.height / 2, ax: r.width / 2 - dot * 0.75, ay: r.height / 2 - dot * 0.75 };
}

function board(el, settings, extra = '') {
  el.innerHTML = `
    <div class="eyes eyes--${settings.mode}">
      <div class="eyes__center" aria-hidden="true"></div>
      ${extra}
    </div>`;
  return el.firstElementChild;
}

// ---- Smooth Pursuit --------------------------------------------------------

// Paths in unit space (-1..1). `round` paths use equal x/y radius.
const PATHS = [
  { id: 'horizontal', f: (a) => [Math.sin(a), 0] },
  { id: 'vertical',   f: (a) => [0, Math.sin(a)] },
  { id: 'diag-down',  f: (a) => [Math.sin(a), Math.sin(a)] },
  { id: 'diag-up',    f: (a) => [Math.sin(a), -Math.sin(a)] },
  { id: 'circle',     f: (a) => [Math.sin(a), -Math.cos(a)], round: true },
  { id: 'figure-8',   f: (a) => [Math.sin(a), Math.sin(2 * a) * 0.9] },
];

const RAMP_MS = 900;   // dot eases out from / back to center at each path change
const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

export const pursuit = {
  async run(ctx) {
    const { el, settings, durationMs, sleep, now } = ctx;
    await intro(ctx, {
      kicker: 'Eye Warm-up',
      title: 'Smooth Pursuit',
      lines: ['Keep your head still.', 'Follow the dot with your eyes only.'],
    });

    const hard = settings.difficulty === 'hard';
    const avail = durationMs - INTRO_MS;
    const count = Math.max(2, Math.round(avail / 7000));
    const segMs = avail / count;
    const segments = shuffle(PATHS).slice(0, count).map((p) => ({
      ...p,
      period: (hard ? 2000 : 3200) * randRange(0.85, 1.15),   // ms per full sweep
      dir: Math.random() < 0.5 ? -1 : 1,
    }));

    const root = board(el, settings, '<div class="eyes__dot"></div>');
    const dot = root.querySelector('.eyes__dot');
    const start = now();

    const stop = animate(now, (t) => {
      const local = t - start;
      const i = Math.min(count - 1, Math.floor(local / segMs));
      const seg = segments[i];
      const st = local - i * segMs;
      const env = smooth(st / RAMP_MS) * smooth((segMs - st) / RAMP_MS);
      const [ux, uy] = seg.f((seg.dir * TAU * st) / seg.period);
      const { cx, cy, ax, ay } = field(root);
      const rx = seg.round ? Math.min(ax, ay) : ax;
      const ry = seg.round ? Math.min(ax, ay) : ay;
      dot.style.transform = `translate(${cx + ux * rx * env}px, ${cy + uy * ry * env}px) translate(-50%, -50%)`;
    });

    try { await sleep(avail); } finally { stop(); }
    return { paths: segments.map((s) => s.id) };
  },
};

// ---- Saccade Jumps ---------------------------------------------------------

// Edge midpoints slide along their edge; corners stay put.
const SPOTS = [
  () => [randRange(-0.5, 0.5), -1], () => [randRange(-0.5, 0.5), 1],
  () => [-1, randRange(-0.5, 0.5)], () => [1, randRange(-0.5, 0.5)],
  () => [-1, -1], () => [1, -1], () => [-1, 1], () => [1, 1],
];

export const saccades = {
  async run(ctx) {
    const { el, settings, durationMs, sleep } = ctx;
    await intro(ctx, {
      kicker: 'Eye Warm-up',
      title: 'Saccade Jumps',
      lines: ['Head still. Snap your eyes to each target.', 'Call out the number.'],
    });

    const hard = settings.difficulty === 'hard';
    const root = board(el, settings, '<div class="eyes__target" hidden><span></span></div>');
    const target = root.querySelector('.eyes__target');
    const label = target.querySelector('span');

    let left = durationMs - INTRO_MS;
    let lastSpot = -1;
    let lastNum = 0;
    let shown = 0;

    while (left > 0) {
      let spot;
      do { spot = randInt(0, SPOTS.length - 1); } while (spot === lastSpot);
      lastSpot = spot;
      let num;
      do { num = randInt(1, 9); } while (num === lastNum);
      lastNum = num;

      const [ux, uy] = SPOTS[spot]();
      const { cx, cy, ax, ay } = field(root);
      target.style.transform = `translate(${cx + ux * ax}px, ${cy + uy * ay}px) translate(-50%, -50%)`;
      label.textContent = num;
      target.hidden = false;
      tone(660, { dur: 0.08, gain: 0.08 });
      shown++;

      // Irregular timing so the next jump can't be anticipated.
      const hold = Math.min(left, (hard ? 650 : 1000) * randRange(0.8, 1.25));
      await sleep(hold);
      left -= hold;
    }
    return { targets: shown };
  },
};
