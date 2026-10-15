// Feature flags. 'preview' = on for Vercel preview links and local testing,
// off on the live site until approved. Set to true to turn on everywhere.

export const FEATURES = {
  newDrills: 'preview',   // FOCUS: 4-7-8 Breathing, Memory Sequence (Physiological Sigh is approved and on)
  leaderboard: true,      // approved: name entry, one shared online board, coach tools
  occlusion: 'preview',   // FOCUS: opt-in Occlusion (the target hides and comes back); Training only, never Game Ready
  partner: 'preview',     // MOVE: Partner mode (a coach's phone sends the cues; api/partner.js)
};

// The live site's address(es). Anything else (preview links, localhost) is a preview.
const LIVE_HOSTS = ['sightline-psi.vercel.app'];

export function isOn(name, { host = globalThis.location?.hostname ?? '', search = globalThis.location?.search ?? '' } = {}) {
  const v = FEATURES[name];
  if (v === 'preview') return !LIVE_HOSTS.includes(host) || new URLSearchParams(search).has(name);
  return !!v;
}
