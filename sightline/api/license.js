// License keys API, served at /api/license (functions/api/[name].js).
//   POST { action: 'activate', key, device, app?, restore? } → { ok: true, moved, free, data? } | { ok: false, reason }
//   POST { action: 'check', key, device }    → { ok: true } | { ok: false, reason }
//   POST { action: 'save', key, device, data } → { ok: true } | { ok: false, reason } (the setup saved with the key)
//   reason: invalid | refunded | moved | installed | moves | busy (api/_lib/license.js)
// Gumroad checks each key (GUMROAD_PRODUCT_ID in the project settings); the
// database keeps which phone each key is on. Test keys work only on preview
// builds (api/_lib/build-info.js), or with TEST_KEYS=1 for local runs.

import { openStore } from './_lib/open-store.js';
import { createLicensing, gumroadVerify } from './_lib/license.js';
import { HttpError } from './_lib/service.js';
import { PREVIEW_BUILD } from './_lib/build-info.js';

// One request: { method, body, ip } and the project settings → { status, body }.
// deps (tests only): a stand-in fetch for Gumroad, and the clock.
export async function handle({ method, body = {}, ip = 'unknown' }, env = {}, deps = {}) {
  try {
    if (method !== 'POST' || !['activate', 'check', 'save'].includes(body.action)) return { status: 404, body: { error: 'Not found.' } };
    const store = await openStore(env).catch(() => null);
    if (!store) return { status: 503, body: { error: 'The server isn’t connected yet.' } };
    const testKeys = PREVIEW_BUILD || env.TEST_KEYS === '1';
    const verify = (key) => gumroadVerify(key, { productId: env.GUMROAD_PRODUCT_ID, testKeys, fetch: deps.fetch });
    const keys = createLicensing(store, { verify, now: deps.now });
    return { status: 200, body: await keys[body.action](body, ip) };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { error: err.message } };
    return { status: 500, body: { error: 'Something went wrong. Try again.' } };
  }
}
