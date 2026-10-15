// ARROWS: cones sit in fixed directions; the screen shows an arrow.
// Reverse cues show the opposite arrow inside a flashing border, so the
// athlete still ends up at the target cone.
import { OPPOSITE, dirById } from '../config.js';

export const arrowCue = {
  id: 'arrows',
  label: 'Arrows',
  targets: (s) => s.directions.map((dir) => ({ key: dir, dir })),
  // A target can be cued in reverse only if its opposite direction is in use.
  canReverse: (target, s) => s.directions.includes(OPPOSITE[target.dir]),
  face: (target, { reverse = false } = {}) => ({
    kind: 'arrow', dir: reverse ? OPPOSITE[target.dir] : target.dir, reverse,
  }),
  speak: (face) => (face.reverse ? 'reverse' : dirById[face.dir].label.toLowerCase().replace('-', ' ')),
};
