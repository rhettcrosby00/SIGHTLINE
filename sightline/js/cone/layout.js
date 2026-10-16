// Cone setup helper: a top-down diagram of where to put the cones for the
// current setup, drawn at the chosen distances. Arrow/mixed setups put each
// cone in its direction; color/number setups use a semicircle in front (2–5
// cones) or a full circle (6–8). Positions come from js/cone/timing.js, the
// same ones the Cone to cone timing uses. Sport cones are labeled with their
// call. Planned drills draw the pattern and its route.

import { colorById, dirById } from './config.js';
import { CUES } from './cues/index.js';
import { coneSlots, timingSummary, STYLE_LABEL } from './timing.js';
import { PATTERNS } from './patterns.js';
import { RIGHT_HANDED } from './cues/sport.js';
import { icon, DIR_ICON } from '../lib/icons.js';

export function layoutSvg(setup) {
  const W = 320;
  const H = 360;
  const cx = W / 2;
  const cy = 205;
  const R = 112;
  const slots = coneSlots(setup);
  const each = setup.distanceMode === 'each' && setup.style !== 'firststep';
  const far = Math.max(...slots.map((sl) => sl.yards));
  // Same distance: every cone on one ring. Each cone: farther cones sit farther out.
  const radius = (yards) => (each ? 56 + (R - 56) * (yards / far) : R);
  const cones = slots.map(({ target, angle, yards }) => {
    const rad = (angle * Math.PI) / 180;
    const r = radius(yards);
    const x = cx + r * Math.sin(rad);
    const y = cy - r * Math.cos(rad);
    const ydTag = each ? ` · ${yards} YD` : '';
    // Cone colors stay pure; outlines and labels follow the theme.
    let body;
    if (target.color) {
      const c = colorById[target.color];
      body = `<circle cx="${x}" cy="${y}" r="22" fill="${c.hex}" class="lay__cone"/>
        <text x="${x}" y="${y + 7}" text-anchor="middle" font-size="20" fill="${c.ink}">${c.shape}</text>
        <text x="${x}" y="${y + 40}" text-anchor="middle" class="lay__small">${target.dir ? `${dirById[target.dir].label} · ` : ''}${c.label}${ydTag}</text>`;
    } else if (target.num) {
      body = `<circle cx="${x}" cy="${y}" r="22" fill="#fff" class="lay__cone"/>
        <text x="${x}" y="${y + 9}" text-anchor="middle" class="lay__num">${target.num}</text>
        ${each ? `<text x="${x}" y="${y + 40}" text-anchor="middle" class="lay__small">${yards} YD</text>` : ''}`;
    } else {
      body = `<circle cx="${x}" cy="${y}" r="22" fill="${colorById.orange.hex}" class="lay__cone"/>
        <g class="lay__arrowglyph" transform="translate(${x - 13} ${y - 13})">${icon(DIR_ICON[target.dir], { size: 26 })}</g>
        <text x="${x}" y="${y + 40}" text-anchor="middle" class="lay__small">${target.call ? `${target.call} · ` : ''}${dirById[target.dir].label}${ydTag}</text>`;
    }
    return { x, y, rad, body };
  });
  const ref = cones[0];
  // Same distance: one dashed line, labeled partway out and nudged to its side.
  // Each cone: a dashed line to every cone (each label carries its yards).
  const a0 = ref.rad;
  const nx = Math.cos(a0);
  const dist = {
    x: cx + 0.5 * R * Math.sin(a0) + 14 * nx,
    y: cy - 0.5 * R * Math.cos(a0) + 14 * Math.sin(a0) + 5,
    anchor: nx >= 0 ? 'start' : 'end',
  };
  return `
    <svg class="lay" viewBox="0 0 ${W} ${H}" role="img" aria-label="Top-down cone layout">
      <rect x="${cx - 34}" y="6" width="68" height="26" rx="6" class="lay__phone"/>
      <text x="${cx}" y="24" text-anchor="middle" class="lay__small">PHONE</text>
      <text x="${cx}" y="46" text-anchor="middle" class="lay__tiny">facing you</text>
      ${(each ? cones : [ref]).map((c) => `<line x1="${cx + 26 * Math.sin(c.rad)}" y1="${cy - 26 * Math.cos(c.rad)}" x2="${c.x - 24 * Math.sin(c.rad)}" y2="${c.y + 24 * Math.cos(c.rad)}" class="lay__line" stroke-dasharray="5 5" stroke-width="2"/>`).join('')}
      ${each || setup.style === 'firststep' ? '' : `<text x="${dist.x}" y="${dist.y}" text-anchor="${dist.anchor}" class="lay__dist">${setup.distance} yd</text>`}
      <circle cx="${cx}" cy="${cy}" r="24" fill="none" class="lay__ring" stroke-width="3" stroke-dasharray="6 4"/>
      <text x="${cx}" y="${cy + 4}" text-anchor="middle" class="lay__you">START</text>
      ${cones.map((c) => c.body).join('')}
    </svg>`;
}

// A planned pattern from above: its cones, the start, and the route in order
// (toward the phone is up; legs that double back are drawn a little apart).
function patternSvg(id) {
  const p = PATTERNS[id];
  const W = 320;
  const H = 300;
  const xs = p.cones.map((c) => c.x);
  const ys = p.cones.map((c) => c.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = 220 / Math.max(x1 - x0, y1 - y0, 5);
  const px = (c) => ({ x: W / 2 + (c.x - (x0 + x1) / 2) * k, y: 170 - (c.y - (y0 + y1) / 2) * k });
  const STEP = { F: [0, 1], B: [0, -1], L: [-1, 0], R: [1, 0] };
  let at = p.cones[p.start];
  const pts = [px(at)];
  for (const [d, yd] of p.legs) { at = { x: at.x + STEP[d][0] * yd, y: at.y + STEP[d][1] * yd }; pts.push(px(at)); }
  return `
    <svg class="lay" viewBox="0 0 ${W} ${H}" role="img" aria-label="${p.name} from above">
      <rect x="${W / 2 - 34}" y="6" width="68" height="26" rx="6" class="lay__phone"/>
      <text x="${W / 2}" y="24" text-anchor="middle" class="lay__small">PHONE</text>
      <polyline points="${pts.map((q, i) => `${q.x},${q.y + i * 6}`).join(' ')}" fill="none" class="lay__line" stroke-dasharray="5 5" stroke-width="2"/>
      ${p.cones.map((c, i) => { const q = px(c); return `<circle cx="${q.x}" cy="${q.y}" r="16" fill="${colorById.orange.hex}" class="lay__cone"/>${i === p.start ? `<text x="${q.x}" y="${q.y - 24}" text-anchor="middle" class="lay__you">START</text>` : ''}`; }).join('')}
    </svg>`;
}

// Quick Start goes back to the MOVE screen; Custom setup goes back to its
// setup (where distances are set). `tune` is the saved Too fast / Too slow factor.
export function renderLayout(el, setup, { preset = false, tune = 1 } = {}) {
  if (setup.mode === 'planned') {
    const p = PATTERNS[setup.pattern];
    el.innerHTML = `
      <div class="clay">
        <header class="nav">
          <button type="button" class="nav__back" data-nav="setup">${icon('chevron-left', { size: 22 })}Setup</button>
          <h2 class="nav__title">Set out ${p.cones.length} cones</h2>
        </header>
        <p class="clay__how">${p.name}. Stand the phone up where you can see it from the start.</p>
        ${patternSvg(setup.pattern)}
        <p class="clay__how">${p.how} On GO, run it. Then walk back while the phone counts down to the next one.</p>
        <p class="timing__sum">${timingSummary(setup, tune)}</p>
      </div>
      <div class="screen__foot">
        <button type="button" class="btn btn--primary btn--block" data-nav="start">Cones set</button>
      </div>`;
    return;
  }
  const n = CUES[setup.cueType].targets(setup).length;
  el.innerHTML = `
    <div class="clay">
      <header class="nav">
        <button type="button" class="nav__back" data-nav="${preset ? 'menu' : 'setup'}">${icon('chevron-left', { size: 22 })}${preset ? 'Move' : 'Setup'}</button>
        <h2 class="nav__title">Set out ${n} cones</h2>
      </header>
      <p class="clay__how">Place them around your start spot like this. Stand the phone up facing you, where you can see it from every cone.</p>
      ${layoutSvg(setup)}
      <p class="clay__how">${{
        outback: setup.distanceMode === 'each' && !preset ? 'Each cone at the distance shown. Sprint out, plant, come back to the start.'
          : `Each cone ${setup.distance} yards from your start spot. Sprint out, plant, come back to the start.`,
        firststep: 'First step: explode 2–3 steps toward the cone called, then reset. The cones mark the direction.',
        conetocone: `${STYLE_LABEL.conetocone}: go straight from one cone to the next. Start from the middle.`,
      }[setup.style]}</p>
      ${setup.cueType === 'sport' && RIGHT_HANDED.includes(setup.sport) ? '<p class="clay__how">Calls assume a right-hander. Left-handed? Swap the left and right cones.</p>' : ''}
      <p class="timing__sum">${timingSummary(setup, tune)}</p>
    </div>
    <div class="screen__foot">
      <button type="button" class="btn btn--primary btn--block" data-nav="start">Cones set</button>
    </div>`;
}
