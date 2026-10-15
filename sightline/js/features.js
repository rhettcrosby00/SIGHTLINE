// Feature flags. 'preview' = on for Vercel preview links and local testing,
// off on the live site until approved. Set to true to turn on everywhere.

export const FEATURES = {
  coneDrill: 'preview',
};

// The live site's address(es). Anything else (preview links, localhost) is a preview.
export const LIVE_HOSTS = ['sightline-psi.vercel.app'];

export function isOn(name, { host = globalThis.location?.hostname ?? '', search = globalThis.location?.search ?? '' } = {}) {
  const v = FEATURES[name];
  if (v === 'preview') return !LIVE_HOSTS.includes(host) || new URLSearchParams(search).has(name);
  return !!v;
}
