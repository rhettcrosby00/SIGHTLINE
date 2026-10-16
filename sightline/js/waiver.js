// The safety waiver: the first thing on every device, before anything else in
// the app (index.html starts gated: <html data-gate="waiver">, and every other
// screen stays hidden until main.js lifts the gate).
//
// It shows when this device has no acceptance of the current version: never
// accepted, the version changed (js/content/safety.js), the saved record is
// missing (storage cleared), or storage is blocked. With storage blocked,
// acceptance lasts for this visit only, so it shows again next time.
// TODO accounts: once athletes sign in, also save acceptance (with their email)
// on the account and check it at login.

import { WAIVER } from './content/safety.js';
import { logo } from './brand.js';
import { esc } from './lib/text.js';
import { icon } from './lib/icons.js';

export const WAIVER_KEY = 'sightrep.waiver.v1';

function safeStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

// The saved record: { version, acceptedAt (ISO 8601), risks: true, age: true }.
export function createWaiverStore(storage = safeStorage()) {
  let thisVisit = null;
  const read = () => {
    try { return JSON.parse(storage.getItem(WAIVER_KEY) ?? 'null'); } catch { return null; }
  };
  const valid = (r, version) => !!r && r.version === version && r.risks === true && r.age === true
    && typeof r.acceptedAt === 'string' && !Number.isNaN(Date.parse(r.acceptedAt));
  return {
    needed: (version = WAIVER.version) => !valid(read(), version) && !valid(thisVisit, version),
    accept({ risks, age }, now = new Date()) {
      if (risks !== true || age !== true) throw new Error('Both boxes must be checked.');
      thisVisit = { version: WAIVER.version, acceptedAt: now.toISOString(), risks: true, age: true };
      try { storage.setItem(WAIVER_KEY, JSON.stringify(thisVisit)); } catch { /* storage blocked: this visit only */ }
      return { ...thisVisit };
    },
    record: () => read(),
  };
}

// The six sections, then the version line.
const body = () => WAIVER.sections.map((x, i) => `
  <section class="waiver__section"><h3>${i + 1}. ${esc(x.heading)}</h3><p>${esc(x.body)}</p></section>`).join('')
  + `<p class="waiver__meta">Version ${WAIVER.version} · effective ${esc(WAIVER.effective)}</p>`;

// The waiver text, full screen (from the waiver itself, About and Settings). Resolves when closed.
export function showFullWaiver() {
  const back = document.activeElement;
  const el = document.createElement('div');
  el.className = 'waiver-full';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'waiver-full-title');
  el.innerHTML = `
    <div class="waiver-full__body">
      <h2 id="waiver-full-title" class="screen-title">Safety waiver</h2>
      ${body()}
    </div>
    <div class="waiver-full__foot"><button type="button" class="btn btn--secondary btn--block" data-act="close">Close</button></div>`;
  document.body.appendChild(el);
  el.querySelector('[data-act="close"]').focus();
  return new Promise((resolve) => {
    const close = () => {
      el.remove();
      document.removeEventListener('keydown', onKey);
      back?.focus?.();
      resolve();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.querySelector('[data-act="close"]').addEventListener('click', close);
  });
}

// The waiver screen in `el`. Resolves with { risks, age } once both boxes are
// checked and "Agree and continue" is tapped. There is no other way out: no
// back button, no decline.
export function showWaiver(el) {
  el.innerHTML = `
    <header class="waiver__head">
      <div class="waiver__logo">${logo('horizontal')}</div>
      <h1 id="waiver-title" class="screen-title">${esc(WAIVER.heading)}</h1>
    </header>
    <div class="waiver__text" tabindex="0" role="region" aria-label="Safety waiver"><p class="waiver__intro">${esc(WAIVER.intro)}</p>${body()}</div>
    <button type="button" class="link-btn waiver__full" data-act="full">${esc(WAIVER.viewFull)}${icon('chevron-right')}</button>
    <div class="waiver__checks">
      <label class="waiver__check"><input type="checkbox" data-check="risks"><span>${esc(WAIVER.checks.risks)}</span></label>
      <label class="waiver__check"><input type="checkbox" data-check="age"><span>${esc(WAIVER.checks.age)}</span></label>
    </div>
    <button type="button" class="btn btn--primary btn--block" data-act="agree" disabled>${esc(WAIVER.button)}</button>`;
  const agree = el.querySelector('[data-act="agree"]');
  const box = (k) => el.querySelector(`[data-check="${k}"]`);
  el.addEventListener('change', () => { agree.disabled = !(box('risks').checked && box('age').checked); });
  el.querySelector('[data-act="full"]').addEventListener('click', () => showFullWaiver());
  return new Promise((resolve) => {
    agree.addEventListener('click', () => {
      if (!box('risks').checked || !box('age').checked) return;
      resolve({ risks: true, age: true });
    });
  });
}
