// Draws one Cone Drill cue full-screen: a color fill, a giant arrow, a giant
// number, a sport call, or a gray HOLD screen. Random/peripheral cues are
// drawn smaller at their spot. Decision cues (js/cone/decide.js):
//   parity    a giant two-digit number
//   stroop    the cone's color, full-screen, with another color's name on it
//   opposite  the cue inside a thick black-and-white frame, "OPPOSITE" on top
//   pair      two cues stacked: 1 on top, 2 below
//   nogo      a real cue under a big HOLD band
// Planned drills show GO with the pattern, then the walk back. Nothing on
// these screens flashes or blinks.

import { colorById, dirById } from './config.js';
import { PATTERNS } from './patterns.js';
import { icon, DIR_ICON } from '../lib/icons.js';

// Thick, high-contrast arrow pointing up; rotated per direction.
const ARROW_PATH = 'M50 3 L97 50 H68 V97 H32 V50 H3 Z';

// Words fill the width: about 0.55 em per letter in the narrow display font.
const WORD_VW = 160;
const WORD_DVH = 34;
const wordSize = (text) => `font-size:min(${Math.round(WORD_VW / Math.max(2, text.length))}vw, ${WORD_DVH}dvh)`;

// About how far away a word reads at a glance (capital letters at 8 arcmin,
// a bit over 1.5× the 20/20 letter) on a small phone held upright: 375 × 667
// CSS px, about 0.16 mm each. Short calls read farther.
const yardsAt = (fontPx) => (fontPx * 0.72 * 0.16) / 1000 / Math.tan(((8 / 60) * Math.PI) / 180) / 0.9144;
export function readableYards(text, { width = 375, height = 667 } = {}) {
  return yardsAt(Math.min((Math.round(WORD_VW / Math.max(2, text.length)) * width) / 100, (WORD_DVH * height) / 100));
}
// Numbers (styles.css .cdf--number): one digit as big as the screen allows,
// two digits as wide as fits. Keep in step with the CSS.
export const NUMBER_SIZE = { one: [150, 62], two: [80, 52] };   // [vw, dvh]
export function numberYards(num, { width = 375, height = 667 } = {}) {
  const [vw, dvh] = String(num).length === 1 ? NUMBER_SIZE.one : NUMBER_SIZE.two;
  return yardsAt(Math.min((vw * width) / 100, (dvh * height) / 100));
}

function base(face) {
  switch (face.kind) {
    case 'color': {
      const c = colorById[face.color];
      return { cls: `cdf--color${c.dark ? ' cdf--dark' : ''}`, style: `--c:${c.hex};--ink:${c.ink}`, label: c.label,
        body: `<span class="cdf__shape" aria-hidden="true">${c.shape}</span><span class="cdf__label">${c.label}</span>` };
    }
    case 'arrow': {
      const d = dirById[face.dir];
      return { cls: 'cdf--arrow', label: d.label,
        body: `<svg class="cdf__arrow" viewBox="0 0 100 100" style="transform:rotate(${d.angle}deg)" aria-hidden="true"><path d="${ARROW_PATH}"/></svg>` };
    }
    case 'number':
      return { cls: `cdf--number${String(face.num).length === 1 ? ' cdf--one' : ''}`, label: String(face.num), body: `<span>${face.num}</span>` };
    case 'word':
      return { cls: 'cdf--word', label: face.word, body: `<span style="${wordSize(face.word)}">${face.word}</span>` };
    case 'parity':
      return { cls: 'cdf--number cdf--parity', label: String(face.num), body: `<span>${face.num}</span>` };
    case 'stroop': {
      const c = colorById[face.ink];
      return { cls: `cdf--color cdf--stroop${c.dark ? ' cdf--dark' : ''}`, style: `--c:${c.hex};--ink:${c.ink}`, label: `${face.word} on ${c.label}`,
        body: `<span class="cdf__word" style="${wordSize(face.word)}">${face.word}</span>` };
    }
    case 'planned': {
      const p = PATTERNS[face.pattern];
      return { cls: 'cdf--planned', label: `Go: ${p.name}`,
        body: `<span class="cdf__go">GO</span><span class="cdf__legs">${p.legs.map(([d, yd]) => `<span>${yd}${icon(DIR_ICON[d], { size: 28 })}</span>`).join('')}</span>` };
    }
    case 'recover':
      return { cls: 'cdf--hold cdf--recover', label: 'Walk back',
        body: `<span>Walk back</span><b class="cdf__secs">${face.secs}</b>` };
    case 'hold':
      return { cls: 'cdf--hold', label: 'Hold', body: `${icon('hand', { size: 96 })}<span>Hold</span>` };
    default:
      return { cls: '', label: '', body: '' };
  }
}

export function faceHtml(face) {
  if (face.kind === 'pair') {
    return `<div class="cdf cdf--pair" aria-label="First ${base(face.faces[0]).label}, then ${base(face.faces[1]).label}">
      ${face.faces.map((f, i) => { const b = base(f); return `<div class="cdf cdf__half ${b.cls}" style="${b.style ?? ''}"><b class="cdf__n">${i + 1}</b>${b.body}</div>`; }).join('')}
    </div>`;
  }
  const b = base(face);
  const extra = face.opposite ? '<b class="cdf__tag">OPPOSITE</b>'
    : face.nogo ? `<div class="cdf__band">${icon('hand', { size: 64 })}<span>HOLD</span></div>` : '';
  const aria = face.opposite ? `Opposite of ${b.label}` : face.nogo ? `Hold (${b.label})` : b.label;
  return `<div class="cdf ${b.cls}${face.opposite ? ' is-opposite' : ''}${face.nogo ? ' is-nogo' : ''}" style="${b.style ?? ''}" aria-label="${aria}">${b.body}${extra}</div>`;
}

// Place a cue at a spot (-1..1), keeping it fully on screen.
export function spotStyle(pos) {
  if (!pos) return '';
  const k = (v) => `calc(50% + ${v} * (50% - var(--cd-size) / 2 - 14px))`;   // 14px margin from the edges
  return `left:${k(pos.x)};top:${k(pos.y)};`;
}
