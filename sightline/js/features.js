// Feature flags. 'preview' = on for Vercel preview links and local testing,
// off on the live site until approved. Set to true to turn on everywhere.

export const FEATURES = {
  // Every approved feature is simply part of the app now. Add new ones here as
  // 'preview' while they're being built; set them to true once approved.
  // false = parked: the code stays, but it's off everywhere.
  partner: false,   // MOVE Partner mode (a coach's phone sends the cues), parked in v4.0
};

// The live site's addresses. Anything else (preview links, localhost) is a preview.
// app.sightrep.app is the app; sightrep.app the marketing site; the vercel.app
// address is Vercel's own name for the project.
const LIVE_HOSTS = ['app.sightrep.app', 'sightrep.app', 'sightline-psi.vercel.app'];

export function isOn(name, { host = globalThis.location?.hostname ?? '', search = globalThis.location?.search ?? '' } = {}) {
  const v = FEATURES[name];
  if (v === 'preview') return !LIVE_HOSTS.includes(host) || new URLSearchParams(search).has(name);
  return !!v;
}
