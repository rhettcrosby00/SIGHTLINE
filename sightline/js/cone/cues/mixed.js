// MIXED (advanced): cones are colored AND sit in fixed directions. Each cue is
// randomly a color or an arrow for the same cone.
import { coneColors, OPPOSITE } from '../config.js';
import { colorCue } from './color.js';
import { arrowCue } from './arrow.js';

export const mixedCue = {
  id: 'mixed',
  label: 'Mixed',
  targets: (s) => {
    const colors = coneColors({ ...s, cones: s.directions.length });
    return s.directions.map((dir, i) => ({ key: dir, dir, color: colors[i] }));
  },
  canReverse: (target, s) => s.directions.includes(OPPOSITE[target.dir]),
  // `asArrow` is decided by the planner (from the session's random stream).
  face: (target, { asArrow = false, reverse = false } = {}) =>
    (asArrow ? arrowCue.face(target, { reverse }) : colorCue.face(target)),
  speak: (face) => (face.kind === 'arrow' ? arrowCue.speak(face) : colorCue.speak(face)),
};
