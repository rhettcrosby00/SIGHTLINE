// The unlock screen: before anything else, until this phone has a good key (js/license.js).
// There's no way past it without one. Every word: js/content/pro.js and js/content/firstrun.js.
// Three versions:
//   sales  someone who hasn't bought: what's included, the price, Buy, and a box for a key
//   buyer  opened from "Start Sightrep" on the Gumroad page (?start): one big Paste your key
//          (they tapped Copy next to the key there); typing it is behind a small link
//   app    the home-screen app's first open (on iPhone it has its own storage): the same,
//          welcomed as the app; the setup saved with the key comes back (js/backup.js)

import { PRO } from './content/pro.js';
import { FIRST } from './content/firstrun.js';
import { cleanKey } from './license.js';
import { logo } from './brand.js';
import { esc } from './lib/text.js';
import { icon } from './lib/icons.js';

// Clipboard text that could be a key: Gumroad's are four groups of 8 letters and digits, joined
// by dashes. Words, sentences and links are not.
export const looksLikeKey = (text) => /^[A-Z0-9][A-Z0-9-]{6,98}[A-Z0-9]$/.test(cleanKey(text)) && /[\d-]/.test(cleanKey(text));

// Resolves with the server's answer ({ ok, moved, free, data }) once a key unlocks this phone.
// reason: why it's locked (moved, installed, refunded, invalid, expired), shown at the top.
// preview: show the test key. activate: options for license.activate ({ app, restore }).
// autoKey: a key that arrived by itself (a computer's QR code, js/handoff.js): unlock right away.
// note: a problem to show at the top instead of the lead (an expired QR code).
export function showUnlock(el, license, { reason = null, preview = false, mode = 'sales', activate = {}, autoKey = '', note = '' } = {}) {
  const buyer = mode === 'buyer' || mode === 'app';
  const canPaste = !!globalThis.navigator?.clipboard?.readText;
  const buy = (style) => (PRO.buyUrl
    ? `<a class="btn ${style} btn--block" href="${esc(PRO.buyUrl)}" target="_blank" rel="noopener">${esc(PRO.buy)}</a>`
    : `<button type="button" class="btn ${style} btn--block" disabled>${esc(PRO.buy)}</button><p class="unlock__soon">${esc(PRO.soon)}</p>`);
  const alert = (text) => `<p class="notice" role="alert">${icon('triangle-alert')}<span>${esc(text)}</span></p>`;
  const words = mode === 'app' ? { heading: PRO.app.heading, lead: PRO.app.lead, help: PRO.app.help } : { heading: FIRST.buyer.heading, lead: FIRST.buyer.lead, help: PRO.help };
  const keyBox = (open) => `
    <section class="unlock__key${buyer ? ' unlock__key--typed' : ''}" aria-labelledby="unlock-key-label"${open ? '' : ' hidden'}>
      <label id="unlock-key-label" class="setting__label" for="unlock-key">${esc(mode === 'app' ? PRO.app.keyLabel : PRO.keyLabel)}</label>
      <div class="unlock__row">
        <input id="unlock-key" class="lbn__input unlock__input" type="text" autocomplete="off" autocapitalize="characters"
          spellcheck="false" enterkeyhint="go" maxlength="100" placeholder="${esc(PRO.keyPlaceholder)}">
        ${canPaste && !buyer ? `<button type="button" class="btn btn--secondary unlock__paste" data-act="paste">${icon('clipboard')}${esc(PRO.paste)}</button>` : ''}
      </div>
      <button type="button" class="btn btn--secondary btn--block" data-act="unlock">${esc(PRO.unlock)}</button>
      ${buyer ? '' : '<p class="lbn__hint unlock__msg" role="status" aria-live="polite"></p>'}
      <p class="unlock__help">${esc(words.help)}</p>
      ${preview ? `<p class="unlock__help">${esc(PRO.previewHint)}</p>` : ''}
    </section>`;
  el.innerHTML = buyer ? `
    <header class="unlock__head">
      <div class="unlock__logo">${logo('horizontal')}</div>
      <h1 id="unlock-title" class="screen-title">${esc(words.heading)}</h1>
      ${note ? alert(note) : reason ? alert(PRO.locked[reason] ?? PRO.locked.invalid) : `<p class="unlock__lead">${esc(words.lead)}</p>`}
    </header>
    ${canPaste ? `<button type="button" class="btn btn--primary btn--big btn--block unlock__go" data-act="paste-go">${icon('clipboard')}${esc(FIRST.buyer.paste)}</button>` : ''}
    <p class="lbn__hint unlock__msg" role="status" aria-live="polite"></p>
    ${canPaste ? `<button type="button" class="link-btn unlock__more" data-act="enter" aria-expanded="false">${esc(FIRST.buyer.enter)}${icon('chevron-down')}</button>` : ''}
    ${keyBox(!canPaste)}
    <section class="unlock__key" aria-label="${esc(FIRST.buyer.buy)}">
      <p class="setting__label">${esc(FIRST.buyer.buy)}</p>
      <p class="unlock__price"><b>${esc(PRO.price)}</b> ${esc(PRO.priceNote)}</p>
      <div class="unlock__buy">${buy('btn--secondary')}</div>
    </section>` : `
    <header class="unlock__head">
      <div class="unlock__logo">${logo('horizontal')}</div>
      <h1 id="unlock-title" class="screen-title">${esc(PRO.heading)}</h1>
      ${note ? alert(note) : reason ? alert(PRO.locked[reason] ?? PRO.locked.invalid) : `<p class="unlock__lead">${esc(PRO.lead)}</p>`}
    </header>
    <ul class="unlock__list">${PRO.includes.map((x) => `<li>${icon('check', { size: 18 })}<span>${esc(x)}</span></li>`).join('')}</ul>
    <p class="unlock__price"><b>${esc(PRO.price)}</b> ${esc(PRO.priceNote)}</p>
    <div class="unlock__buy">${buy('btn--primary')}</div>
    ${keyBox(true)}`;
  const input = el.querySelector('#unlock-key');
  const btn = el.querySelector('[data-act="unlock"]');
  const go = el.querySelector('[data-act="paste-go"]');
  const msg = el.querySelector('.unlock__msg');
  const typed = el.querySelector('.unlock__key--typed');
  const say = (text, bad = false) => { msg.textContent = text; msg.classList.toggle('is-bad', bad); };
  const openTyped = () => {
    if (!typed) return;
    typed.hidden = false;
    el.querySelector('[data-act="enter"]')?.setAttribute('aria-expanded', 'true');
    input.focus();
  };
  return new Promise((resolve) => {
    let busy = false;
    async function tryKey(raw = input.value) {
      if (busy) return;
      busy = true;
      btn.disabled = true;
      if (go) go.disabled = true;
      say(autoKey && raw === autoKey ? FIRST.buyer.unlocking : PRO.checking);
      const out = await license.activate(raw, activate);
      if (out.ok) {
        const restoring = !!out.data && Object.keys(out.data).length > 0;
        say(restoring ? PRO.restoring : out.free ? PRO.movedFree : out.moved ? PRO.movedHere : PRO.unlocked);
        setTimeout(resolve, out.moved && !out.free ? 2200 : 900, out);
        return;
      }
      busy = false;
      btn.disabled = false;
      if (go) go.disabled = false;
      say(PRO.errors[out.reason] ?? PRO.errors.store, true);
    }
    btn.addEventListener('click', () => tryKey());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryKey(); });
    // Sales version: Paste fills the box, then unlocks.
    el.querySelector('[data-act="paste"]')?.addEventListener('click', async () => {
      try { input.value = (await navigator.clipboard.readText()).trim(); } catch { input.focus(); return; }
      if (input.value) tryKey();
    });
    // Buyer and app versions: one big Paste your key.
    go?.addEventListener('click', async () => {
      let text = '';
      try { text = (await navigator.clipboard.readText()).trim(); } catch { say(FIRST.buyer.blocked, true); openTyped(); return; }
      if (!looksLikeKey(text)) { say(FIRST.buyer.noKey, true); return; }
      input.value = text;
      tryKey(text);
    });
    el.querySelector('[data-act="enter"]')?.addEventListener('click', openTyped);
    if (autoKey) { input.value = autoKey; tryKey(autoKey); }
  });
}
