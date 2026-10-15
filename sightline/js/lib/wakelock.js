// Keeps the screen on during a session. Fails silently where unsupported.

let sentinel = null;
let wanted = false;

async function request() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch {
    sentinel = null;
  }
}

// The browser drops the lock when the tab is hidden; take it back on return.
// (No document when the tests load this in Node.)
globalThis.document?.addEventListener('visibilitychange', () => {
  if (wanted && !sentinel && document.visibilityState === 'visible') request();
});

export function keepAwake() {
  wanted = true;
  request();
}

export async function allowSleep() {
  wanted = false;
  try { await sentinel?.release(); } catch { /* ignore */ }
  sentinel = null;
}
