// The safety waiver (v5.2), run by tests/run.js: the first screen on every
// device, nothing reachable before it's accepted, asked again for a new version
// or when the saved acceptance is gone, and every word of the waiver, the
// disclaimer and the safety notes in one file (js/content/safety.js).
// The browser half (a fresh phone, the disabled button, a direct drill link,
// accept and reopen) is tools/screens/scenarios/waiver.mjs.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { test, assert } from './harness.js';
import { WAIVER, DISCLAIMER, SAFETY, drillSafety, moveSafety } from '../js/content/safety.js';
import { createWaiverStore, WAIVER_KEY } from '../js/waiver.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html');
const main = read('js/main.js');

// A phone's saved data: a Map, or one that refuses everything (private mode, blocked).
const memory = () => {
  const m = new Map();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
const BOTH = { risks: true, age: true };

test('Waiver wording: one content file, six sections, the exact boxes and button', () => {
  assert(Number.isInteger(WAIVER.version) && WAIVER.version >= 1, `version ${WAIVER.version}`);
  assert(WAIVER.heading === 'Before you start.', WAIVER.heading);
  assert(WAIVER.sections.map((s) => s.heading).join('|')
    === 'Assumption of risk|Your responsibility|Health and medical|Release of liability|Supervision of minors|Changes', 'the six sections, in order');
  assert(WAIVER.sections.every((s) => s.body.length > 60), 'every section has its text');
  assert(WAIVER.checks.risks === 'I have read and understand this waiver. I accept the risks of physical activity and agree that I use Sightrep at my own risk.', 'first box');
  assert(WAIVER.checks.age === 'I am 16 years of age or older, or I have permission from a parent, guardian, or coach.', 'second box');
  assert(WAIVER.button === 'Agree and continue' && WAIVER.viewFull === 'View full waiver', 'button and link');
  assert(!/draft|lorem|tbd|todo/i.test(JSON.stringify(WAIVER)), 'final wording, not marked as a draft');
  assert(DISCLAIMER === 'Sightrep is a training and warm-up tool. It is not medical advice and does not diagnose or treat any condition.', 'disclaimer');
  assert(SAFETY.move === 'Use a clear, flat area. Warm up before high-speed cuts.' && SAFETY.dizzy === 'Stop if you feel dizzy.'
    && SAFETY.flashing === 'Contains brief flashing visuals.', 'safety notes');
});

test('No waiver, disclaimer or safety wording outside js/content/safety.js', () => {
  const lines = [...WAIVER.sections.map((s) => s.body), ...Object.values(WAIVER.checks), DISCLAIMER, ...Object.values(SAFETY)];
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(new URL(dir, root))) {
      const p = `${dir}${name}`;
      if (statSync(new URL(p, root)).isDirectory()) { if (name !== 'vendor') walk(`${p}/`); } else if (/\.(js|html)$/.test(name)) files.push(p);
    }
  };
  walk('js/');
  files.push('index.html');
  for (const f of files.filter((x) => x !== 'js/content/safety.js')) {
    const text = read(f);
    for (const line of lines) assert(!text.includes(line), `${f} repeats "${line.slice(0, 40)}…": use js/content/safety.js`);
  }
});

test('A brand-new phone gets the waiver; accepting saves the date and time, the version and both boxes', () => {
  const phone = memory();
  const store = createWaiverStore(phone);
  assert(store.needed(), 'a fresh phone needs it');
  const rec = store.accept(BOTH, new Date('2026-10-16T15:30:00Z'));
  const saved = JSON.parse(phone.m.get(WAIVER_KEY));
  assert(WAIVER_KEY === 'sightrep.waiver.v1', WAIVER_KEY);
  assert(saved.version === WAIVER.version && saved.acceptedAt === '2026-10-16T15:30:00.000Z' && saved.risks === true && saved.age === true,
    JSON.stringify(saved));
  assert(JSON.stringify(rec) === JSON.stringify(saved), 'accept() returns what it saved');
  assert(!store.needed(), 'accepted');
  assert(!createWaiverStore(phone).needed(), 'closed and reopened: not asked again');
  assert(JSON.stringify(createWaiverStore(phone).record()) === JSON.stringify(saved), 'record() reads it back');
});

test('Accepting needs both boxes checked', () => {
  for (const checks of [{}, { risks: true }, { age: true }, { risks: true, age: false }, { risks: 'yes', age: true }]) {
    const phone = memory();
    const store = createWaiverStore(phone);
    let threw = false;
    try { store.accept(checks); } catch { threw = true; }
    assert(threw && !phone.m.has(WAIVER_KEY) && store.needed(), `accepted with ${JSON.stringify(checks)}`);
  }
});

test('A new waiver version asks again', () => {
  const phone = memory();
  createWaiverStore(phone).accept(BOTH);
  assert(createWaiverStore(phone).needed(WAIVER.version + 1), 'the next version shows it again');
  phone.m.set(WAIVER_KEY, JSON.stringify({ version: WAIVER.version - 1, acceptedAt: '2026-01-01T00:00:00.000Z', risks: true, age: true }));
  assert(createWaiverStore(phone).needed(), 'accepted only an older version');
});

test('Cleared, blocked or damaged saved data shows the waiver again', () => {
  const phone = memory();
  createWaiverStore(phone).accept(BOTH);
  phone.m.clear();
  assert(createWaiverStore(phone).needed(), 'storage cleared');
  for (const bad of ['not json', '{}', 'null', JSON.stringify({ version: WAIVER.version, acceptedAt: 'yesterday', risks: true, age: true }),
    JSON.stringify({ version: WAIVER.version, acceptedAt: '2026-10-16T15:30:00.000Z', risks: true }),
    JSON.stringify({ version: String(WAIVER.version), acceptedAt: '2026-10-16T15:30:00.000Z', risks: true, age: true })]) {
    phone.m.set(WAIVER_KEY, bad);
    assert(createWaiverStore(phone).needed(), `counted ${bad}`);
  }
  // Blocked (private mode, storage off): accepted for this visit only.
  const visit = createWaiverStore(blocked);
  assert(visit.needed(), 'blocked storage: asked');
  visit.accept(BOTH);
  assert(!visit.needed(), 'this visit can go on');
  assert(createWaiverStore(blocked).needed(), 'next visit: asked again');
  assert(createWaiverStore(null).needed(), 'no storage at all');
});

test('Nothing is reachable before the waiver is accepted', () => {
  assert(/^<!doctype html>\s*<html lang="en" data-gate="waiver">/i.test(html), 'the page starts gated');
  const head = html.slice(0, html.indexOf('</head>'));
  assert(/:root\[data-gate\] \.screen:not\(#screen-waiver\):not\(#screen-unlock\) \{ display: none !important; \}/.test(head),
    'the gate hides every other screen (all but the waiver and the unlock screen), in the page itself (before any file loads)');
  const first = html.indexOf('<section id="screen-');
  assert(html.indexOf('<section id="screen-waiver"') === first, 'the waiver is the first screen in the page');
  // main.js: the gate lifts only once accepted; the first-run setup and direct links wait.
  const gate = /const accepted = \(async \(\) => \{([^]*?)\n\}\)\(\);/.exec(main)?.[1] ?? '';
  const at = (code) => gate.indexOf(code);
  assert(at("if (waiver.needed())") >= 0 && at("waiver.accept(await showWaiver($('screen-waiver')))") > at("if (waiver.needed())"),
    'the waiver first, accepted before anything goes on');
  assert(at('await unlockScreen(') > at('waiver.accept(') && at("document.documentElement.removeAttribute('data-gate')") > at('await unlockScreen('),
    'then the key (Sightrep Pro); the gate lifts only after both');
  assert((main.match(/removeAttribute\('data-gate'\)/g) ?? []).length === 2 && /async function lockIfDue\(\) \{[^]*?await unlockScreen\(reason\);\s*document\.documentElement\.removeAttribute\('data-gate'\);/.test(main),
    'and nowhere else (the other: after a locked phone is unlocked again)');
  assert(main.indexOf('const accepted') < main.indexOf('initFocus('), 'decided before either side is set up');
  assert(/accepted\.then\(\(\) => \{\s*if \(!getSettings\(\)\.setupDone[^}]*showFirstRun\(/.test(main) && main.split('showFirstRun(').length === 2,
    'the first-run setup waits for it');
  assert(/accepted\.then\(\(\) => \{\s*const auto = params\.get\('autostart'\);[^]*?move\.run\(autoMove\);\s*else if \(auto\) focus\.start\(/.test(main)
    && main.split("params.get('autostart')").length === 2, 'so do direct drill links (?autostart, ?session, ?only)');
  // No way around it on the waiver screen.
  const screen = read('js/waiver.js').slice(read('js/waiver.js').indexOf('export function showWaiver'));
  assert(!/nav__back|decline|skip|cancel|data-nav/i.test(screen), 'no back, decline or skip on the waiver');
  assert(/data-act="agree" disabled>/.test(screen), 'the button starts disabled');
  assert(/agree\.disabled = !\(box\('risks'\)\.checked && box\('age'\)\.checked\)/.test(screen), 'and turns on only with both boxes');
  assert(/if \(!box\('risks'\)\.checked \|\| !box\('age'\)\.checked\) return;/.test(screen), 'a tap without both does nothing');
  assert(!/<input type="checkbox"[^>]*checked/.test(screen), 'both boxes start unchecked');
});

test('Safety notes: on the right drills and MOVE screens, from the content file', () => {
  for (const id of ['gaze', 'nearfar']) assert(drillSafety(id).join() === SAFETY.dizzy, `${id}: dizzy`);
  for (const id of ['peripheral', 'capture', 'quieteye', 'span']) assert(drillSafety(id).join() === SAFETY.flashing, `${id}: flashing`);
  for (const id of ['pursuit', 'saccades', 'mot']) {
    assert(drillSafety(id).length === 0 && drillSafety(id, { occlusion: true }).join() === SAFETY.flashing, `${id}: flashing only with Occlusion`);
  }
  assert(drillSafety('conedrill').length === 0 && drillSafety('conedrill', { flash: true }).join() === SAFETY.flashing, 'MOVE run: flashing only with Display: Flash');
  for (const id of ['settle', 'sigh', 'lockin', 'stroop', 'colorcall', 'gonogo', 'math', 'memory', 'visualize']) assert(drillSafety(id).length === 0, `${id}: no note`);
  assert(moveSafety({ display: 'hold' }).join() === SAFETY.move && moveSafety({ display: 'flash' }).join('|') === `${SAFETY.move}|${SAFETY.flashing}`, 'MOVE setup notes');
  // Where they're drawn.
  assert(/const notes = drillSafety\(step\?\.id/.test(read('js/stages/common.js')) && /notes\.map\(\(n\) => `<p class="safety-note">/.test(read('js/stages/common.js')), 'how-to card');
  assert(/drillSafety\(step\.id, \{ occlusion: [^}]*flash: settings\?\.display === 'flash' \}\)/.test(read('js/engine.js'))
    && /<p id="hud-safety" class="hud__safety" hidden><\/p>/.test(html), 'the drill bar, while the drill runs');
  assert(/\$\{SAFETY\.move\}/.test(read('js/cone/ui.js')), 'MOVE hub');
  assert(/moveSafety\(s\)/.test(read('js/cone/setup.js')), 'Custom setup (and Signals Only)');
  assert(/\$\{SAFETY\.move\}/.test(read('js/cone/partner.js')), 'Partner mode');
  const layout = read('js/cone/layout.js');
  assert(/\$\{SAFETY\.move\}/.test(layout) && /moveSafety\(setup\)/.test(layout), 'Set out your cones (planned and reactive)');
});

test('Disclaimer and waiver links: home, About, Settings and the summary', () => {
  assert(/\$\('disclaimer'\)\.textContent = DISCLAIMER/.test(main) && /<p class="home__foot"><span id="disclaimer"><\/span>/.test(html), 'home footer');
  assert(/\$\('about-disclaimer'\)\.textContent = DISCLAIMER/.test(main) && /<p id="about-disclaimer" class="caption"><\/p>/.test(html), 'About');
  assert(/\$\{DISCLAIMER\}/.test(read('js/stages/summary.js')), 'summary');
  assert(/id="btn-about-waiver"[^>]*><span class="list__label">Safety waiver</.test(html), 'About: Safety waiver row');
  const settings = html.slice(html.indexOf('id="screen-settings"'), html.indexOf('id="screen-about"'));
  assert(/<h3 id="legal-title" class="group__title">Legal<\/h3>/.test(settings) && /id="btn-settings-waiver"[^>]*><span class="list__label">Safety waiver</.test(settings), 'Settings: Legal → Safety waiver');
  assert(/\$\('btn-about-waiver'\)\.addEventListener\('click', \(\) => showFullWaiver\(\)\)/.test(main)
    && /\$\('btn-settings-waiver'\)\.addEventListener\('click', \(\) => showFullWaiver\(\)\)/.test(main), 'both open the full waiver');
});

test('Screen tools seed the current waiver version', () => {
  const server = read('../tools/screens/testserver.py');
  assert(/version: \(\\d\+\)/.test(server) && Number(/version: (\d+)/.exec(read('js/content/safety.js'))[1]) === WAIVER.version,
    'testserver.py reads the version the same way');
});
