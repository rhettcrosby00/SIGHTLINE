// NUMBERS: each cone has a number; the screen shows that number.
export const numberCue = {
  id: 'numbers',
  label: 'Numbers',
  targets: (s) => Array.from({ length: s.cones }, (_, i) => ({ key: String(i + 1), num: i + 1 })),
  face: (target) => ({ kind: 'number', num: target.num }),
  speak: (face) => String(face.num),
};
