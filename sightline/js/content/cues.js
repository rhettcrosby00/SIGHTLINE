// Cue-word suggestions. The before-session screen shows 5, rotated so
// recently shown words rest for a few sessions.

export const CUE_WORDS = [
  'ATTACK', 'COMPETE', 'NEXT PLAY', 'TRUST IT', 'BREATHE', 'SHARP', 'FEARLESS', 'RELENTLESS',
  'CALM', 'LOCKED IN', 'FAST', 'FINISH', 'OWN IT', 'POISE', 'STEADY', 'EXPLODE',
  'SEE IT', 'BE FIRST', 'ONE PLAY', 'GRIT', 'LET IT GO', 'PRESENT', 'BOLD', 'ALL IN',
];

export const CUE_SUGGESTIONS = 5;
export const CUE_MAX = 14;

export const cleanCue = (s) => String(s ?? '')
  .replace(/[^\p{L}\p{N} .!'’-]/gu, '')   // letters, numbers and simple punctuation only
  .replace(/\s+/g, ' ').trim().toUpperCase().slice(0, CUE_MAX);
