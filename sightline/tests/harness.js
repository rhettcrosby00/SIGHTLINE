// Tiny test harness shared by the test files (no libraries).
const results = [];

export function test(name, fn) {
  try { fn(); results.push([true, name]); } catch (e) { results.push([false, name, e.message]); }
}

export function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function report() {
  let failed = 0;
  for (const [ok, name, err] of results) {
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    ${err}`}`);
    if (!ok) failed++;
  }
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  return failed;
}
