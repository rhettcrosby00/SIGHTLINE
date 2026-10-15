// ARROWS: cones sit in fixed directions; the screen shows an arrow.
import { dirById } from '../config.js';

export const arrowCue = {
  id: 'arrows',
  label: 'Arrows',
  targets: (s) => s.directions.map((dir) => ({ key: dir, dir })),
  face: (target) => ({ kind: 'arrow', dir: target.dir }),
  speak: (face) => dirById[face.dir].label.toLowerCase().replace('-', ' '),
};
