// Cone setup helper: a top-down diagram of where to put the cones for the
// current setup, with a suggested distance. Arrow/mixed setups put each cone
// in its direction; color/number setups use a semicircle in front (2–5 cones)
// or a full circle (6–8).

import { colorById, dirById, DISTANCE_YD } from './config.js';
import { CUES } from './cues/index.js';
import { icon, DIR_ICON } from '../lib/icons.js';

// Where each cone goes, as an angle in degrees (0 = toward the phone, clockwise).
export function coneAngles(setup) {
  const cue = CUES[setup.cueType];
  const targets = cue.targets(setup);
  if (setup.cueType === 'arrows' || setup.cueType === 'mixed') {
    return targets.map((t) => ({ target: t, angle: dirById[t.dir].angle }));
  }
  const n = targets.length;
  const angles = n <= 5
    ? targets.map((_, i) => -90 + (180 * (i + 0.5)) / n)          // semicircle in front
    : targets.map((_, i) => -90 + (360 * i) / n);                  // full circle
  return targets.map((t, i) => ({ target: t, angle: angles[i] }));
}

export function layoutSvg(setup) {
  const W = 320;
  const H = 360;
  const cx = W / 2;
  const cy = 205;
  const R = 112;
  const cones = coneAngles(setup).map(({ target, angle }) => {
    const rad = (angle * Math.PI) / 180;
    const x = cx + R * Math.sin(rad);
    const y = cy - R * Math.cos(rad);
    // Cone colors stay pure; outlines and labels follow the theme.
    let body;
    if (target.color) {
      const c = colorById[target.color];
      body = `<circle cx="${x}" cy="${y}" r="22" fill="${c.hex}" class="lay__cone"/>
        <text x="${x}" y="${y + 7}" text-anchor="middle" font-size="20" fill="${c.ink}">${c.shape}</text>
        <text x="${x}" y="${y + 40}" text-anchor="middle" class="lay__small">${target.dir ? `${dirById[target.dir].label} · ` : ''}${c.label}</text>`;
    } else if (target.num) {
      body = `<circle cx="${x}" cy="${y}" r="22" fill="#fff" class="lay__cone"/>
        <text x="${x}" y="${y + 9}" text-anchor="middle" class="lay__num">${target.num}</text>`;
    } else {
      body = `<circle cx="${x}" cy="${y}" r="22" fill="${colorById.orange.hex}" class="lay__cone"/>
        <g class="lay__arrowglyph" transform="translate(${x - 13} ${y - 13})">${icon(DIR_ICON[target.dir], { size: 26 })}</g>
        <text x="${x}" y="${y + 40}" text-anchor="middle" class="lay__small">${dirById[target.dir].label}</text>`;
    }
    return { x, y, body };
  });
  const ref = cones[0];
  // Label the start→cone line partway out, nudged to its side.
  const a0 = (coneAngles(setup)[0].angle * Math.PI) / 180;
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
      <line x1="${cx + 26 * Math.sin(a0)}" y1="${cy - 26 * Math.cos(a0)}" x2="${ref.x}" y2="${ref.y}" class="lay__line" stroke-dasharray="5 5" stroke-width="2"/>
      <text x="${dist.x}" y="${dist.y}" text-anchor="${dist.anchor}" class="lay__dist">${setup.distance} yd</text>
      <circle cx="${cx}" cy="${cy}" r="24" fill="none" class="lay__ring" stroke-width="3" stroke-dasharray="6 4"/>
      <text x="${cx}" y="${cy + 4}" text-anchor="middle" class="lay__you">START</text>
      ${cones.map((c) => c.body).join('')}
    </svg>`;
}

export function renderLayout(el, setup) {
  const n = CUES[setup.cueType].targets(setup).length;
  el.innerHTML = `
    <div class="clay">
      <header class="nav">
        <button type="button" class="nav__back" data-nav="setup">${icon('chevron-left', { size: 22 })}Setup</button>
        <h2 class="nav__title">Set out ${n} cones</h2>
      </header>
      <p class="clay__how">Place them around your start spot like this. Stand the phone up facing you, where you can see it from every cone.</p>
      ${layoutSvg(setup)}
      <section class="group"><div class="group__rows">
        <div class="setting setting--stack">
          <span class="setting__label">Distance from start</span>
          <div class="slider"><input type="range" data-range="distance" min="${DISTANCE_YD[0]}" max="${DISTANCE_YD[1]}" step="1" value="${setup.distance}" aria-label="Distance from start">
          <output data-out="distance">${setup.distance} yd</output></div>
        </div>
      </div></section>
    </div>
    <div class="screen__foot">
      <button type="button" class="btn btn--primary btn--block" data-nav="start">Cones set</button>
    </div>`;
}
