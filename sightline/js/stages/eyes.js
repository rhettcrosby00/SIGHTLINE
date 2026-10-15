// Activate pillar: Smooth Pursuit (follow a moving dot), Saccade Jumps
// (targets pop up anywhere on screen) and Gaze Stabilization (eyes stay on a
// letter while the head moves). Eyes only, no scoring. All randomness comes
// from the session (ctx.session).

import { howTo, countdown, animate } from './common.js';
import { tone } from '../lib/audio.js';

const TAU = Math.PI * 2;
const KICKER = 'Activate';

// Where the dot can travel: the stage box minus a margin so it never clips.
function field(el) {
  const r = el.getBoundingClientRect();
  const dot = parseFloat(getComputedStyle(el).getPropertyValue('--dot')) || 40;
  return { cx: r.width / 2, cy: r.height / 2, ax: r.width / 2 - dot * 0.75, ay: r.height / 2 - dot * 0.75 };
}

function board(el, extra = '') {
  el.innerHTML = `
    <div class="eyes">
      <div class="eyes__center" aria-hidden="true"></div>
      ${extra}
    </div>`;
  return el.firstElementChild;
}

// ---- Smooth Pursuit --------------------------------------------------------

// Paths in unit space (-1..1). `round` paths use equal x/y radius.
const PATHS = {
  horizontal: { f: (a) => [Math.sin(a), 0] },
  vertical:   { f: (a) => [0, Math.sin(a)] },
  'diag-down': { f: (a) => [Math.sin(a), Math.sin(a)] },
  'diag-up':  { f: (a) => [Math.sin(a), -Math.sin(a)] },
  circle:     { f: (a) => [Math.sin(a), -Math.cos(a)], round: true },
  'figure-8': { f: (a) => [Math.sin(a), Math.sin(2 * a) * 0.9] },
};

const RAMP_MS = 900;   // dot eases out from / back to center at each path change
const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

export const pursuit = {
  async run(ctx) {
    const { el, settings, session, sleep, now, remaining, hold } = ctx;
    await howTo(ctx, {
      kicker: KICKER,
      title: 'Smooth Pursuit',
      rule: 'Keep your head still. Follow the moving dot with your eyes only.',
      demo: { html: `<div class="mini"><div class="mini__phone mini__phone--eyes"><i class="mini__dot mini__dot--pursuit"></i></div>
        <p class="mini__cap">Head still — just your eyes follow the dot</p></div>` },
    });

    const hard = settings.difficulty === 'hard';
    const root = board(el, '<div class="eyes__dot"></div>');
    const dot = root.querySelector('.eyes__dot');
    const f0 = field(root);
    dot.style.transform = `translate(${f0.cx}px, ${f0.cy}px) translate(-50%, -50%)`;
    await hold(() => countdown(ctx, root, 'GET SET'));

    const avail = remaining();
    const count = Math.max(2, Math.round(avail / 7000));
    const segMs = avail / count;
    const segments = session.content.pursuit(count, hard).map((s) => ({ ...s, ...PATHS[s.id] }));

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

export const saccades = {
  async run(ctx) {
    const { el, settings, session, sleep, remaining, hold } = ctx;
    await howTo(ctx, {
      kicker: KICKER,
      title: 'Saccade Jumps',
      rule: 'Keep your head still. A number pops up somewhere on the screen — snap your eyes to it and say the number out loud.',
      demo: { html: `<div class="mini"><div class="mini__phone mini__phone--eyes"><i class="mini__target"><b>7</b></i></div>
        <p class="mini__cap">Eyes jump to it → say “seven!”</p></div>` },
    });

    const hard = settings.difficulty === 'hard';
    const root = board(el, '<div class="eyes__target" hidden><span></span></div>');
    const target = root.querySelector('.eyes__target');
    const label = target.querySelector('span');
    await hold(() => countdown(ctx, root, 'GET SET'));

    const gap = session.content.gaps('saccades');
    let shown = 0;
    while (remaining() > 0) {
      const p = session.content.saccades();
      const { cx, cy, ax, ay } = field(root);
      target.style.transform = `translate(${cx + p.x * ax}px, ${cy + p.y * ay}px) translate(-50%, -50%)`;
      label.textContent = p.num;
      target.hidden = false;
      tone(660, { dur: 0.08, gain: 0.08 });
      shown++;
      // Irregular timing so the next jump can't be anticipated.
      await sleep(Math.min(remaining(), gap(hard)));
    }
    return { targets: shown };
  },
};

// ---- Gaze Stabilization ----------------------------------------------------
// The letter stays still; the head moves to a soft beat (side to side, then
// up and down). Letters change every couple of seconds and get said aloud.

export const gaze = {
  async run(ctx) {
    const { el, settings, session, sleep, now, remaining, hold } = ctx;
    await howTo(ctx, {
      kicker: KICKER,
      title: 'Gaze Stabilization',
      rule: 'Keep your eyes locked on the letter while you turn your head with the beat. Say each new letter out loud. Go easy — stop if you feel dizzy.',
      demo: { html: `<div class="mini"><div class="mini__phone mini__phone--eyes mini__phone--gaze"><b class="mini__letter">K</b><i class="mini__head"></i></div>
        <p class="mini__cap">Head turns ← → · eyes stay on the letter</p></div>` },
    });

    const hard = settings.difficulty === 'hard';
    const beatMs = hard ? 650 : 1000;
    const letterMs = hard ? 1800 : 2600;
    el.innerHTML = `
      <div class="gaze" data-axis="h">
        <p class="gaze__dir"></p>
        <div class="gaze__field">
          <i class="gaze__beat gaze__beat--a"></i>
          <p class="gaze__letter" aria-live="polite"></p>
          <i class="gaze__beat gaze__beat--b"></i>
        </div>
        <p class="gaze__note">Go easy. Stop if you feel dizzy.</p>
      </div>`;
    const root = el.firstElementChild;
    const dirEl = root.querySelector('.gaze__dir');
    const letterEl = root.querySelector('.gaze__letter');
    letterEl.textContent = session.content.gaze();
    await hold(() => countdown(ctx, root, 'GET SET'));

    const total = remaining();
    const start = now();
    let nextLetter = letterMs;
    let beat = 0;
    let letters = 1;
    while (remaining() > 0) {
      const t = now() - start;
      const vertical = t >= total / 2;
      root.dataset.axis = vertical ? 'v' : 'h';
      dirEl.textContent = vertical ? 'NOD UP AND DOWN  ↑ ↓' : 'TURN SIDE TO SIDE  ← →';
      if (t >= nextLetter) {
        letterEl.textContent = session.content.gaze();
        letters++;
        nextLetter += letterMs;
      }
      root.dataset.beat = String(beat % 2);
      tone(beat % 2 ? 523 : 440, { dur: 0.06, gain: 0.08 });
      beat++;
      await sleep(Math.min(beatMs, remaining()));
    }
    return { letters };
  },
};
