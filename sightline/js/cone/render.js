// Draws one Cone Drill cue full-screen: a color fill, a giant arrow, a giant
// number, or a gray HOLD screen. Random/peripheral cues are drawn smaller at
// their spot. Reverse cues get a thick border that blinks slowly (once a
// second, under the 3-changes-a-second flash limit).

import { colorById, dirById } from './config.js';
import { icon } from '../lib/icons.js';

// Thick, high-contrast arrow pointing up; rotated per direction.
const ARROW_PATH = 'M50 3 L97 50 H68 V97 H32 V50 H3 Z';

export function faceHtml(face) {
  switch (face.kind) {
    case 'color': {
      const c = colorById[face.color];
      return `<div class="cdf cdf--color ${c.dark ? 'cdf--dark' : ''}" style="--c:${c.hex};--ink:${c.ink}">
        <span class="cdf__shape" aria-hidden="true">${c.shape}</span><span class="cdf__label">${c.label}</span></div>`;
    }
    case 'arrow': {
      const d = dirById[face.dir];
      return `<div class="cdf cdf--arrow ${face.reverse ? 'is-reverse' : ''}" aria-label="${d.label}${face.reverse ? ' (reverse)' : ''}">
        <svg class="cdf__arrow" viewBox="0 0 100 100" style="transform:rotate(${d.angle}deg)" aria-hidden="true"><path d="${ARROW_PATH}"/></svg></div>`;
    }
    case 'number':
      return `<div class="cdf cdf--number"><span>${face.num}</span></div>`;
    case 'hold':
      return `<div class="cdf cdf--hold">${icon('hand', { size: 96 })}<span>Hold</span></div>`;
    default:
      return '';
  }
}

// Place a cue at a spot (-1..1), keeping it fully on screen.
export function spotStyle(pos) {
  if (!pos) return '';
  const k = (v) => `calc(50% + ${v} * (50% - var(--cd-size) / 2 - 14px))`;   // 14px margin from the edges
  return `left:${k(pos.x)};top:${k(pos.y)};`;
}
