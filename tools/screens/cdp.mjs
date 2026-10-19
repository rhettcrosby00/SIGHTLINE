// Screen review via Chrome DevTools Protocol: exact phone viewports, each shot
// in its own fresh browser context. Writes shots/<name>__<size>-<theme>.png and
// report-<set>.json (sideways scroll, spills, small targets, overlaps, fonts).
// usage: node tools/screens/cdp.mjs <set> [filter]   (sets: scenarios/*.mjs)
// Needs testserver.py on :5175 (and apiserver.mjs on :5176 for the leaderboard).
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'shots');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const SET = process.argv[2] || 'main';
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
const { SHOTS, BASE } = await import(`./scenarios/${SET}.mjs`);
mkdirSync(OUT, { recursive: true });

const SIZES = { se: [375, 667], pm: [430, 932], desk: [1280, 800] };   // desk: only for shots that ask (shot.sizes)
const DPR = Number(process.env.DPR || 1);   // DPR=2 for sharp pictures (the website's app screenshots)
const THEMES = ['light', 'dark', 'outdoor'];

// ---- tiny CDP client ----
let ws, nextId = 1;
const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = nextId++;
  pending.set(id, { res, rej, method });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

async function connect() {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',   // a test-pattern camera, no face (Eye Check)
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(join(HERE, 'prof.'))}`, 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      const v = await (await fetch(`http://localhost:${PORT}/json/version`)).json();
      ws = new WebSocket(v.webSocketDebuggerUrl);
      await new Promise((r) => ws.addEventListener('open', r, { once: true }));
      ws.addEventListener('message', (e) => {
        const m = JSON.parse(e.data);
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        m.error ? p.rej(new Error(`${p.method}: ${m.error.message}`)) : p.res(m.result);
      });
      return chrome;
    } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  throw new Error('chrome did not start');
}

// Runs in the page: layout problems on the active screen (or open overlay).
const CHECK = `(() => {
  const W = innerWidth, out = { docW: document.documentElement.scrollWidth, problems: [] };
  if (out.docW > W) out.problems.push('page scrolls sideways: ' + out.docW + 'px');
  const root = document.querySelector('.waiver-full') || (!document.querySelector('.screen') && document.body) || document.querySelector('.guide') || document.querySelector('.eyecal:not([hidden])') || document.querySelector('.pause:not([hidden])') || document.querySelector('.screen.is-active');
  const desc = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '')) + (el.textContent.trim() ? ' "' + el.textContent.trim().slice(0, 30) + '"' : '');
  const seen = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[hidden]'); };
  for (const el of root.querySelectorAll('*')) {
    if (!seen(el) || el.closest('svg') && el.tagName !== 'svg') continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 0.5 || r.left < -0.5) out.problems.push('sticks out ' + Math.round(r.left) + '..' + Math.round(r.right) + ': ' + desc(el));
    if (/^(BUTTON|P|SPAN|H2|H3|STRONG|LABEL|OUTPUT|B)$/.test(el.tagName) && !el.matches('.switch') && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline')
      out.problems.push('text spills ' + el.scrollWidth + '>' + el.clientWidth + ': ' + desc(el));
  }
  const taps = [...root.querySelectorAll('button, a, input, select, [role=radio], [role=switch]')].filter(seen).filter((el) => !el.matches('.switch, .waiver__check input'))   // switches and waiver boxes have a 48px ::before hit area
    .filter((el) => !(el.tagName === 'A' && getComputedStyle(el).display === 'inline'));   // links inside sentences (accessibility rules exempt them)
  const pinned = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) if (/sticky|fixed/.test(getComputedStyle(n).position)) return true; return false; };
  for (const el of taps) {
    const r = el.getBoundingClientRect();
    if (r.height < 47.5 || r.width < 47.5) out.problems.push('small target ' + Math.round(r.width) + 'x' + Math.round(r.height) + ': ' + desc(el));
  }
  for (let i = 0; i < taps.length; i++) for (let j = i + 1; j < taps.length; j++) {
    const a = taps[i].getBoundingClientRect(), b = taps[j].getBoundingClientRect();
    if (taps[i].contains(taps[j]) || taps[j].contains(taps[i])) continue;
    if (pinned(taps[i]) !== pinned(taps[j])) continue;   // content scrolls under a pinned header or footer
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (x > 1 && y > 1) out.problems.push('overlap: ' + desc(taps[i]) + ' / ' + desc(taps[j]));
  }
  out.fonts = ['Archivo', 'Schibsted Grotesk'].map((f) => f + ':' + document.fonts.check('16px "' + f + '"'));
  out.appearance = document.documentElement.dataset.appearance || 'auto';
  out.screen = document.querySelector('.screen.is-active')?.id;
  return JSON.stringify(out);
})()`;

const STEP = (steps, app = true) => `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (sel, ms = 8000) => { const t = Date.now(); while (!document.querySelector(sel)) { if (Date.now() - t > ms) throw new Error('timeout ' + sel); await wait(50); } };
  await wait(1100);
  // Wait until the app has booted (home rendered) and the splash is gone.
  if (${app}) for (let i = 0; i < 200 && !(document.getElementById('btn-focus') && !document.getElementById('splash')); i++) await wait(100);
  for (const [op, a, b] of ${JSON.stringify(steps)}) {
    if (op === 'click') { await waitFor(a); document.querySelector(a).click(); await wait(320); }
    if (op === 'wait') await wait(a);
    if (op === 'waitFor') await waitFor(a, b);
    if (op === 'scrollEnd') { scrollTo(0, document.documentElement.scrollHeight); await wait(200); }
    if (op === 'scrollTo') { document.querySelector(a).scrollIntoView({ block: 'center' }); await wait(200); }
    if (op === 'eval') (0, eval)(a);
    if (op === 'until') { const t = Date.now(); while (!(0, eval)(a)) { if (Date.now() - t > (b ?? 8000)) throw new Error('timeout until ' + a); await wait(50); } }
    if (op === 'hold') { await waitFor(a); const r = document.querySelector(a).getBoundingClientRect(); document.querySelector(a).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); await wait(b ?? 1300); }
    if (op === 'type') { await waitFor(a); const el = document.querySelector(a); el.value = b; el.dispatchEvent(new Event('input', { bubbles: true })); }
    if (op === 'select') { await waitFor(a); for (let i = 0; i < 40 && ![...document.querySelector(a).options].some((o) => o.value === b); i++) await wait(100); const el = document.querySelector(a); el.value = b; el.dispatchEvent(new Event('change', { bubbles: true })); await wait(400); }
  }
  return 'ok';
})()`;

async function shoot(shot, size, theme) {
  const [w, h] = SIZES[size];
  const { browserContextId } = await send('Target.createBrowserContext');
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  try {
    await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: DPR, mobile: size !== 'desk' });
    const auto = theme === 'auto-dark';
    if (auto) await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    const set = { ...BASE, ...shot.set, appearance: auto ? 'auto' : theme };
    const q = new URLSearchParams(set);
    if (shot.cone) q.set('cone', JSON.stringify(shot.cone));
    if (shot.last) q.set('last', JSON.stringify(shot.last));
    if (shot.player) q.set('name', shot.player);
    // shot.url: any page as it is (the website), instead of the app with seeded settings.
    const url = shot.url ?? `http://localhost:5175/__set?${q}${shot.firstRun ? '' : '&noguide=1'}${shot.params ? `&${shot.params}` : ''}`;
    await s('Page.enable');
    await s('Page.navigate', { url });
    for (let i = 0; i < 100; i++) {   // wait for the app page to finish loading
      const st = await s('Runtime.evaluate', { expression: 'location.href + "|" + document.readyState', returnByValue: true });
      if (st.result.value.startsWith(shot.url ? new URL(shot.url).origin : 'http://localhost:5175') && st.result.value.endsWith('complete')) break;
      await new Promise((res) => setTimeout(res, 100));
    }
    const loaded = async () => {
      for (let i = 0; i < 100; i++) {
        const st = await s('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
        if (st.result.value === 'complete') return;
        await new Promise((res) => setTimeout(res, 100));
      }
    };
    let r = await s('Runtime.evaluate', { expression: STEP(shot.steps || [], !shot.url), awaitPromise: true, returnByValue: true });
    // reopen: close the app and open it again (same phone, saved data kept), then run `after`.
    if (shot.reopen != null && !r.exceptionDetails) {
      await s('Page.navigate', { url: `http://localhost:5175/?${shot.reopen}` });
      await new Promise((res) => setTimeout(res, 300));
      await loaded();
      r = await s('Runtime.evaluate', { expression: STEP(shot.after || []), awaitPromise: true, returnByValue: true });
    }
    const err = r.exceptionDetails?.exception?.description;
    const c = await s('Runtime.evaluate', { expression: CHECK, returnByValue: true });
    const miss = [];
    for (const want of shot.expect ?? []) {
      const ok = await s('Runtime.evaluate', { returnByValue: true, expression: want.startsWith('js:') ? `!!(${want.slice(3)})` : /^[#.[]/.test(want)
        ? `!!document.querySelector(${JSON.stringify(want)})` : `document.body.innerText.toLowerCase().includes(${JSON.stringify(want.toLowerCase())})` });
      if (!ok.result.value) miss.push(want);
    }
    // fullPage: the whole page top to bottom (the website), not just the first screen.
    const tall = shot.fullPage ? (await s('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true })).result.value : 0;
    const png = await s('Page.captureScreenshot', shot.fullPage
      ? { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: tall, scale: 1 } }
      : { format: 'png' });
    const file = `${shot.name}__${size}-${theme}`;
    writeFileSync(join(OUT, `${file}.png`), Buffer.from(png.data, 'base64'));
    const out = { file, error: err, ...JSON.parse(c.result.value) };
    if (miss.length) out.problems.push(`EXPECTED but missing: ${miss.join(' | ')}`);
    return out;
  } finally {
    await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  }
}

const chrome = await connect();
const jobs = [];
for (const shot of SHOTS.filter((x) => !filter || filter.test(x.name)))
  for (const size of shot.sizes ?? ['se', 'pm'])
    for (const theme of shot.themes ?? [...THEMES, ...(shot.name === 'home' ? ['auto-dark'] : [])]) {
      if (shot.combos === 'few' && !((size === 'se' && theme === 'dark') || (size === 'pm' && theme === 'light'))) continue;
      jobs.push([shot, size, theme]);
    }

const report = [];
const LANES = Number(process.env.LANES || 6);
await Promise.all(Array.from({ length: LANES }, async () => {
  while (jobs.length) {
    const [shot, size, theme] = jobs.shift();
    const limit = new Promise((_, rej) => setTimeout(() => rej(new Error('shot timed out (120 s)')), 120000));
    try { report.push(await Promise.race([shoot(shot, size, theme), limit])); } catch (e) { report.push({ file: `${shot.name}__${size}-${theme}`, error: e.message }); }
  }
}));
report.sort((a, b) => a.file.localeCompare(b.file));
writeFileSync(join(HERE, `report-${SET}.json`), JSON.stringify(report, null, 1));
for (const r of report) {
  const probs = (r.problems || []);
  if (r.error || probs.length || (r.fonts && r.fonts.some((f) => f.endsWith('false'))))
    console.log(`${r.file}${r.error ? ` ERROR ${r.error}` : ''} ${r.fonts?.join(' ') ?? ''}\n  ${probs.join('\n  ')}`);
}
console.log(`${report.length} shots`);
chrome.kill();
process.exit(0);
