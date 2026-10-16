// Keeps the screen on during a session. When the phone can't or won't
// (no Wake Lock support, Low Power Mode or Battery Saver refusing it, or the
// lock dropped while the app is still showing), onProblem() is called so the
// session can show a tip. A web app can't see Low Power Mode itself.

let sentinel = null;
let wanted = false;
let onProblem = null;

const problem = (why) => { if (wanted) onProblem?.(why); };

async function request() {
  if (!('wakeLock' in navigator)) return problem('unsupported');
  if (document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
      // Released while the app is still on screen: the phone took it back.
      if (document.visibilityState === 'visible') problem('released');
    });
  } catch {
    sentinel = null;
    problem('refused');
  }
}

// The browser drops the lock when the tab is hidden; take it back on return.
// (No document when the tests load this in Node.)
globalThis.document?.addEventListener('visibilitychange', () => {
  if (wanted && !sentinel && document.visibilityState === 'visible') request();
});

export function keepAwake(opts = {}) {
  wanted = true;
  onProblem = opts.onProblem ?? null;
  request();
}

export async function allowSleep() {
  wanted = false;
  onProblem = null;
  try { await sentinel?.release(); } catch { /* ignore */ }
  sentinel = null;
}
