// The four FOCUS cue colors. Each one carries a shape and a label as a
// backup cue for color-blind athletes.

export const CUES = [
  { id: 'green',  label: 'GREEN',  hex: '#12c48b', ink: '#000', shape: '■' },
  { id: 'red',    label: 'RED',    hex: '#ff4d2e', ink: '#000', shape: '▲' },
  { id: 'yellow', label: 'YELLOW', hex: '#ffd60a', ink: '#000', shape: '◆' },
  { id: 'blue',   label: 'BLUE',   hex: '#2f7bff', ink: '#fff', shape: '●' },
];

export const cueById = Object.fromEntries(CUES.map((c) => [c.id, c]));
