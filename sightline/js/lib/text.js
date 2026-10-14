// Text helpers.

// Escape text before putting it into innerHTML (e.g. a custom cue word).
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
