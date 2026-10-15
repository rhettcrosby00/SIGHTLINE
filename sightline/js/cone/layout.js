// Cone setup helper: a top-down diagram of where to put the cones for the
// current setup, with a suggested distance. Arrow/mixed setups put each cone
// in its direction; color/number setups use a semicircle in front (2–5 cones)
// or a full circle (6–8).

import { colorById, dirById } from './config.js';
import { CUES } from './cues/index.js';
import { ARROW_GLYPH } from './setup.js';

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
    let body;
    if (target.color) {
      const c = colorById[target.color];
      body = `<circle cx="${x}" cy="${y}" r="22" fill="${c.hex}" stroke="${c.dark ? '#fff' : '#000'}" stroke-width="${c.dark ? 3 : 2}"/>
        <text x="${x}" y="${y + 7}" text-anchor="middle" font-size="20" fill="${c.ink}">${c.shape}</text>`;
      if (target.dir) {
        body += `<text x="${x}" y="${y + 40}" text-anchor="middle" class="lay__small">${ARROW_GLYPH[target.dir]} ${c.label}</text>`;
      } else {
        body += `<text x="${x}" y="${y + 40}" text-anchor="middle" class="lay__small">${c.label}</text>`;
      }
    } else if (target.num) {
      body = `<circle cx="${x}" cy="${y}" r="22" fill="#fff"/><text x="${x}" y="${y + 9}" text-anchor="middle" font-size="26" font-weight="900" fill="#000">${target.num}</text>`;
    } else {
      body = `<circle cx="${x}" cy="${y}" r="22" fill="#ff9500"/><text x="${x}" y="${y + 9}" text-anchor="middle" font-size="24" font-weight="900" fill="#000">${ARROW_GLYPH[target.dir]}</text>
        <text x="${x}" y="${y + 40}" text-anchor="middle" class="lay__small">${dirById[target.dir].label}</text>`;
    }
    return { x, y, body };
  });
  const ref = cones[0];
  return `
    <svg class="lay" viewBox="0 0 ${W} ${H}" role="img" aria-label="Top-down cone layout">
      <rect x="${cx - 34}" y="6" width="68" height="26" rx="6" fill="#222" stroke="#666"/>
      <text x="${cx}" y="24" text-anchor="middle" class="lay__small">PHONE</text>
      <text x="${cx}" y="46" text-anchor="middle" class="lay__tiny">facing you</text>
      <line x1="${cx}" y1="${cy}" x2="${ref.x}" y2="${ref.y}" stroke="#777" stroke-dasharray="5 5" stroke-width="2"/>
      <text x="${(cx + ref.x) / 2 + 8}" y="${(cy + ref.y) / 2 - 6}" class="lay__dist">${setup.distance} yd</text>
      <circle cx="${cx}" cy="${cy}" r="24" fill="none" stroke="#B7FF00" stroke-width="3" stroke-dasharray="6 4"/>
      <text x="${cx}" y="${cy + 5}" text-anchor="middle" class="lay__you">START</text>
      ${cones.map((c) => c.body).join('')}
    </svg>`;
}

export function renderLayout(el, setup) {
  const n = CUES[setup.cueType].targets(setup).length;
  el.innerHTML = `
    <div class="clay">
      <button type="button" class="btn-link" data-nav="setup">‹ Setup</button>
      <h2 class="cset__title">SET UP YOUR CONES</h2>
      <p class="clay__how">Put ${n} cones around your start spot like this. Stand the phone up in front of you, facing you, where you can see it from every cone.</p>
      ${layoutSvg(setup)}
      <div class="field"><span class="field__label">Distance from start</span>
        <div class="slider"><input type="range" data-range="distance" min="3" max="10" step="1" value="${setup.distance}">
        <output data-out="distance">${setup.distance} yd</output></div></div>
      <p class="cset__safety">Use a clear, flat area. Warm up before high-speed cuts.</p>
      <button type="button" class="btn-start btn-start--sm" data-nav="start">CONES ARE SET — GO</button>
    </div>`;
}

