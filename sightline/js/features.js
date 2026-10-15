// Feature flags. 'preview' = on for Vercel preview links and local testing,
// off on the live site until approved. Set to true to turn on everywhere.

export const FEATURES = {
  newDrills: 'preview',   // FOCUS: Physiological Sigh, 4-7-8 Breathing, Memory Sequence
  leaderboard: 'preview', // Phase 3: name entry, one shared online board, coach tools
};

// The live site's address(es). Anything else (preview links, localhost) is a preview.
const LIVE_HOSTS = ['sightline-psi.vercel.app'];

export function isOn(name, { host = globalThis.location?.hostname ?? '', search = globalThis.location?.search ?? '' } = {}) {
  const v = FEATURES[name];
  if (v === 'preview') return !LIVE_HOSTS.includes(host) || new URLSearchParams(search).has(name);
  return !!v;
}
