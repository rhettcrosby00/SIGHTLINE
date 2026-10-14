// The four cue colors. Each one carries a shape and a label as a backup cue
// for color-blind athletes, and a fixed cone direction for Cone mode
// (cross layout: front / right / back / left).

export const CUES = [
  { id: 'green',  label: 'GREEN',  hex: '#12c48b', ink: '#000', shape: '■', dir: 'front', arrow: '↑' },
  { id: 'red',    label: 'RED',    hex: '#ff4d2e', ink: '#000', shape: '▲', dir: 'right', arrow: '→' },
  { id: 'yellow', label: 'YELLOW', hex: '#ffd60a', ink: '#000', shape: '◆', dir: 'back',  arrow: '↓' },
  { id: 'blue',   label: 'BLUE',   hex: '#2f7bff', ink: '#fff', shape: '●', dir: 'left',  arrow: '←' },
];

export const cueById = Object.fromEntries(CUES.map((c) => [c.id, c]));
export const cueByDir = Object.fromEntries(CUES.map((c) => [c.dir, c]));
