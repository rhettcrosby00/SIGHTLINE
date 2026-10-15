// COLORS: each cone has a color; the screen shows that color.
import { coneColors, colorById } from '../config.js';

export const colorCue = {
  id: 'colors',
  label: 'Colors',
  targets: (s) => coneColors(s).map((color) => ({ key: color, color })),
  face: (target) => ({ kind: 'color', color: target.color }),
  speak: (face) => colorById[face.color].label.toLowerCase(),
};
