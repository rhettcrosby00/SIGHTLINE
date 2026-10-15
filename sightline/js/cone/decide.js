// Decision Layer (optional): some cues need a quick decision before the cut.
// Pure module (no DOM), so the tests can check every mapping.
//   parity    a two-digit number: odd → the LEFT cone, even → the RIGHT cone
//   stroop    the screen is one cone's color with a different color's name
//             on it: go to the color you see, not the word
//   opposite  a cue in a thick frame: go to the opposite cone
//   pair      two cues at once (1 on top, 2 below): go to 1, then 2
//   nogo      a real cue under a big HOLD band: don't move
// Every decision is carried by something big (a number, a full-screen color,
// a frame, a band) so it reads in under a second from 10+ yards.
// Which decisions a setup can use depends on its cones (decisionsFor).

import { OPPOSITE, DECISIONS, coneColors, colorById } from './config.js';
import { CUES } from './cues/index.js';

export const DECISION_LABEL = {
  parity: 'Odd / even', stroop: 'Color word', opposite: 'Opposite', pair: 'Two cues', nogo: 'Go / no-go',
};
export const DECISION_HINT = {
  parity: 'A number: odd → left cone, even → right cone.',
  stroop: 'A color with a different color’s name on it: go to the color, not the word.',
  opposite: 'A cue in a thick frame: go to the opposite cone.',
  pair: 'Two cues at once: go to the top one, then the bottom one.',
  nogo: 'A cue under a big HOLD band: stay put.',
};
export const DECISION_RATE = 0.4;   // share of cues (after the first) that need a decision
const DIRECTIONAL = new Set(['arrows', 'mixed', 'sport']);

// The cone on the athlete's left and right, if the layout has a clear pair.
// Directions: LEFT and RIGHT. Colors (2–5 cones, a semicircle in front): the
// end cones. Numbers use their own digits, so they skip odd / even.
export function leftRight(setup, targets = CUES[setup.cueType].targets(setup)) {
  if (DIRECTIONAL.has(setup.cueType)) {
    const keys = targets.map((t) => t.key);
    return keys.includes('L') && keys.includes('R') ? { left: 'L', right: 'R' } : null;
  }
  if (setup.cueType === 'colors' && targets.length <= 5) return { left: targets[0].key, right: targets.at(-1).key };
  return null;
}

// Each target's opposite cone. Directions: the opposite direction, if in use.
// Cones in a semicircle (2–5): left and right swap (the middle one has none).
// Cones in a full circle (6 or 8): straight across.
export function mirrors(setup, targets = CUES[setup.cueType].targets(setup)) {
  const keys = targets.map((t) => t.key);
  const out = {};
  if (DIRECTIONAL.has(setup.cueType)) {
    for (const t of targets) if (keys.includes(OPPOSITE[t.dir])) out[t.key] = OPPOSITE[t.dir];
    return out;
  }
  const n = keys.length;
  keys.forEach((k, i) => {
    const j = n <= 5 ? n - 1 - i : n % 2 === 0 ? (i + n / 2) % n : -1;
    if (j >= 0 && j !== i) out[k] = keys[j];
  });
  return out;
}

// Color cones that a color word can be about (black can't be shown on the dark screen's word).
const stroopTargets = (setup, targets) => (setup.cueType === 'colors' || setup.cueType === 'mixed'
  ? targets.filter((t) => t.color && t.color !== 'black') : []);

// Decisions this setup supports, out of the ones picked.
export function decisionsFor(setup) {
  if (setup.mode === 'planned' || !setup.decision) return [];
  const targets = CUES[setup.cueType].targets(setup);
  const ok = {
    parity: !!leftRight(setup, targets),
    stroop: stroopTargets(setup, targets).length >= 2,
    opposite: Object.keys(mirrors(setup, targets)).length > 0,
    pair: targets.length >= 2,
    nogo: true,
  };
  return DECISIONS.filter((d) => setup.decisions.includes(d) && ok[d]);
}

// Can decision `kind` be used for a cue to `target`?
export function fitsTarget(kind, setup, target, targets) {
  if (kind === 'parity') { const lr = leftRight(setup, targets); return !!lr && (target.key === lr.left || target.key === lr.right); }
  if (kind === 'stroop') return stroopTargets(setup, targets).some((t) => t.key === target.key);
  if (kind === 'opposite') return !!mirrors(setup, targets)[target.key];
  return true;
}

// Where each decision cue sends the athlete, from what's on screen. The
// planner builds faces; this reads one back (the tests check every cue with it).
export function answerFor(face, setup, targets = CUES[setup.cueType].targets(setup)) {
  const byFace = (f) => targets.find((t) => (f.kind === 'color' ? t.color === f.color
    : f.kind === 'arrow' || f.kind === 'word' ? t.dir === f.dir : f.kind === 'number' ? t.num === f.num : false))?.key;
  if (face.nogo) return null;
  if (face.kind === 'parity') { const lr = leftRight(setup, targets); return face.num % 2 ? lr.left : lr.right; }
  if (face.kind === 'stroop') return targets.find((t) => t.color === face.ink)?.key;
  if (face.kind === 'pair') return face.faces.map((f) => byFace(f));
  if (face.opposite) return mirrors(setup, targets)[byFace(face)];
  return byFace(face);
}

// A color word for a Stroop cue to `ink`: another cone color's name.
export function stroopWord(rng, setup, ink) {
  const others = coneColors(setup).filter((c) => c !== ink);
  return colorById[rng.pick(others.length ? others : ['red'])].label;
}
