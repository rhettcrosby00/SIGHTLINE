// Low contrast: cues fade toward the background, like poor light, shadow or
// glare. A cue is drawn at partial opacity over its background, and the
// opacity is worked out so the cue lands on a set contrast ratio, the same for
// every color. The faintest level stays at LOW_CONTRAST_FLOOR, which is still
// easy to see on a phone outdoors (with the brightness up).

const LOW_CONTRAST = [4, 2.5];             // contrast ratio at level 0 → level 1
export const LOW_CONTRAST_FLOOR = LOW_CONTRAST[1];

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const linear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (rgb) => {
  const [r, g, b] = rgb.map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// What the eye sees: fg at `opacity` over bg (browsers blend in sRGB).
const blend = (fg, bg, opacity) => channels(fg).map((c, i) => opacity * c + (1 - opacity) * channels(bg)[i]);

// Contrast of fg drawn at `opacity` over bg (1 = full color).
export const contrastAt = (fg, bg, opacity = 1) => ratio(blend(fg, bg, opacity), channels(bg));

// The opacity that gives fg the contrast `target` against bg. Colors that are
// already fainter than that stay at full strength.
export function opacityFor(fg, bg, target) {
  if (contrastAt(fg, bg, 1) <= target) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (contrastAt(fg, bg, mid) < target) lo = mid; else hi = mid;
  }
  return Math.round(hi * 1000) / 1000;   // rounded up, so never below target
}

// Contrast ratio for a level (0 easiest … 1 faintest).
export const lowContrastAt = (level) => LOW_CONTRAST[0] + (LOW_CONTRAST[1] - LOW_CONTRAST[0]) * Math.min(1, Math.max(0, level));

// "#abc", "#aabbcc" or "rgb(1, 2, 3)" (from getComputedStyle) → "#aabbcc".
export function toHex(color) {
  const s = String(color).trim();
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
  if (rgb) return `#${rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`.toLowerCase();
  return s.toLowerCase();
}
