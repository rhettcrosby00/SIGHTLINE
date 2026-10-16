// Activate pillar: Smooth Pursuit (follow a moving dot), Saccade Jumps
// (targets pop up anywhere on screen) and Gaze Stabilization (eyes stay on a
// letter while the head moves). Eyes only, no scoring. All randomness comes
// from the session (ctx.session).
// Occlusion (Training only, opt-in): the dot or number disappears and comes
// back (js/content/vision.js), never faster than 3 changes a second.
// Low contrast: the saccade numbers fade toward the background.
// Eye Check (beta, js/eye/): in Smooth Pursuit the dot stays bright while the
// eyes follow it and dims when they fall behind; in Saccade Jumps a small
// check shows when the eyes moved toward the new number (direction only).
// Never in Gaze Stabilization. Feedback only, and none of it changes timing.

import { howTo, countdown, animate, backdrop } from './common.js';
import { tone } from '../lib/audio.js';
import { icon } from '../lib/icons.js';
import { settled, gap as apart, movedToward, ZONES } from '../eye/math.js';
import { occludedSaccade } from '../content/vision.js';
import { opacityFor, lowContrastAt } from '../lib/contrast.js';

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
    const eye = (await session.eye?.open(ctx, { drill: 'pursuit', title: 'Smooth Pursuit' })) ?? null;
    try {
      await hold(() => countdown(ctx, root, 'GET SET'));

      const avail = remaining();
      const count = Math.max(2, Math.round(avail / 7000));
      const segMs = avail / count;
      const segments = session.content.pursuit(count, hard).map((s) => ({ ...s, ...PATHS[s.id] }));
      const occ = session.content.occlusion?.('pursuit');

      const start = now();
      const onTrack = settled({ initial: true });
      const aspect = innerHeight / innerWidth;
      let marked = -Infinity;
      const stop = animate(now, (t) => {
        const local = t - start;
        if (occ) dot.classList.toggle('is-occluded', !occ.visible(local));
        const i = Math.min(count - 1, Math.floor(local / segMs));
        const seg = segments[i];
        const st = local - i * segMs;
        const env = smooth(st / RAMP_MS) * smooth((segMs - st) / RAMP_MS);
        const [ux, uy] = seg.f((seg.dir * TAU * st) / seg.period);
        const { cx, cy, ax, ay } = field(root);
        const rx = seg.round ? Math.min(ax, ay) : ax;
        const ry = seg.round ? Math.min(ax, ay) : ay;
        dot.style.transform = `translate(${cx + ux * rx * env}px, ${cy + uy * ry * env}px) translate(-50%, -50%)`;
        if (eye) {
          const r = root.getBoundingClientRect();
          const p = [(r.left + cx + ux * rx * env) / innerWidth, (r.top + cy + uy * ry * env) / innerHeight];
          if (t - marked >= 60) { eye.mark(p); marked = t; }
          const g = eye.gaze();
          // No reading: keep it bright (no news isn't bad news).
          dot.classList.toggle('is-behind', !onTrack(t, !g || apart(g, p, aspect) <= ZONES.track));
        }
      });

      try { await sleep(avail); } finally { stop(); }
      return { paths: segments.map((s) => s.id) };
    } finally {
      eye?.close();   // camera off the moment the drill ends
    }
  },
};

// ---- Saccade Jumps ---------------------------------------------------------

export const saccades = {
  async run(ctx) {
    const { el, settings, session, sleep, now, remaining, hold } = ctx;
    await howTo(ctx, {
      kicker: KICKER,
      title: 'Saccade Jumps',
      rule: 'Keep your head still. A number pops up somewhere on the screen — snap your eyes to it and say the number out loud.',
      demo: { html: `<div class="mini"><div class="mini__phone mini__phone--eyes"><i class="mini__target"><b>7</b></i></div>
        <p class="mini__cap">Eyes jump to it → say “seven!”</p></div>` },
    });

    const hard = settings.difficulty === 'hard';
    const root = board(el, `<div class="eyes__target" hidden><span></span><i class="eyes__check" aria-hidden="true">${icon('check', { size: 16 })}</i></div>`);
    const target = root.querySelector('.eyes__target');
    const label = target.querySelector('span');
    const check = target.querySelector('.eyes__check');
    // Low contrast: unscored, so a set level (fainter on Hard).
    if (session.content.lowContrast) {
      const fg = backdrop(target);
      target.style.opacity = String(opacityFor(fg, backdrop(root), lowContrastAt(hard ? 0.8 : 0.3)));
    }
    const occluded = !!session.content.occlusion;
    const eye = (await session.eye?.open(ctx, { drill: 'saccades', title: 'Saccade Jumps' })) ?? null;
    const aspect = innerHeight / innerWidth;
    // Eye Check: waits `ms` as usual, watching for the eyes to move toward the
    // number (in the first 1.2 s). Direction only: no jump speed is measured.
    const watch = async (ms, from, tgt) => {
      const end = now() + ms;
      let seen = false;
      while (now() < end) {
        if (!seen && from && now() < end - ms + 1200 && movedToward(from, eye.gaze(), tgt, aspect)) {
          seen = true;
          check.classList.add('is-on');
        }
        await sleep(Math.min(50, Math.max(1, end - now())));
      }
      if (from) eye.note('checks', seen);
    };
    let shown = 0;
    try {
      await hold(() => countdown(ctx, root, 'GET SET'));
      const gap = session.content.gaps('saccades');
      while (remaining() > 0) {
        const p = session.content.saccades();
        const { cx, cy, ax, ay } = field(root);
        const from = eye?.gaze() ?? null;   // where the eyes were before the jump
        check.classList.remove('is-on');
        target.style.transform = `translate(${cx + p.x * ax}px, ${cy + p.y * ay}px) translate(-50%, -50%)`;
        label.textContent = p.num;
        target.hidden = false;
        const tgt = eye ? eye.at(target) : null;
        eye?.mark(tgt);
        tone(660, { dur: 0.08, gain: 0.08 });
        shown++;
        // Irregular timing so the next jump can't be anticipated.
        if (occluded) {
          // Occlusion: the number shows, then hides before the next jump.
          const o = occludedSaccade(gap(hard));
          await (eye ? watch(Math.min(remaining(), o.showMs), from, tgt) : sleep(Math.min(remaining(), o.showMs)));
          target.hidden = true;
          await sleep(Math.min(remaining(), o.hiddenMs));
        } else {
          const ms = Math.min(remaining(), gap(hard));
          await (eye ? watch(ms, from, tgt) : sleep(ms));
        }
      }
    } finally {
      eye?.close();   // camera off the moment the drill ends
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
