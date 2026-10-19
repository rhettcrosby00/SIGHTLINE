// The unlock screen: after the safety waiver and before anything else, until
// this phone has a good key (js/license.js). Buy on Gumroad, or enter a key;
// there's no way past it without one. Every word: js/content/pro.js.
// welcome: the home-screen app's first open (on iPhone it has its own storage):
// "Welcome to the Sightrep app", the key box first, buying below.

import { PRO } from './content/pro.js';
import { logo } from './brand.js';
import { esc } from './lib/text.js';
import { icon } from './lib/icons.js';

// Resolves with the server's answer ({ ok, moved, free, data }) once a key unlocks this phone.
// reason: why it's locked (moved, installed, refunded, invalid, expired), shown at the top.
// preview: show the test key. activate: options for license.activate ({ app, restore }).
export function showUnlock(el, license, { reason = null, preview = false, welcome = false, activate = {} } = {}) {
  const buy = PRO.buyUrl
    ? `<a class="btn btn--primary btn--block" href="${esc(PRO.buyUrl)}" target="_blank" rel="noopener">${esc(PRO.buy)}</a>`
    : `<button type="button" class="btn btn--primary btn--block" disabled>${esc(PRO.buy)}</button>
       <p class="unlock__soon">${esc(PRO.soon)}</p>`;
  const canPaste = !!globalThis.navigator?.clipboard?.readText;
  const keyBox = `
    <section class="unlock__key${welcome ? ' unlock__key--first' : ''}" aria-labelledby="unlock-key-label">
      <label id="unlock-key-label" class="setting__label" for="unlock-key">${esc(welcome ? PRO.app.keyLabel : PRO.keyLabel)}</label>
      <div class="unlock__row">
        <input id="unlock-key" class="lbn__input unlock__input" type="text" autocomplete="off" autocapitalize="characters"
          spellcheck="false" enterkeyhint="go" maxlength="100" placeholder="${esc(PRO.keyPlaceholder)}">
        ${canPaste ? `<button type="button" class="btn btn--secondary unlock__paste" data-act="paste">${icon('clipboard')}${esc(PRO.paste)}</button>` : ''}
      </div>
      <button type="button" class="btn ${welcome ? 'btn--primary' : 'btn--secondary'} btn--block" data-act="unlock">${esc(PRO.unlock)}</button>
      <p class="lbn__hint unlock__msg" role="status" aria-live="polite"></p>
      <p class="unlock__help">${esc(welcome ? PRO.app.help : PRO.help)}</p>
      ${preview ? `<p class="unlock__help">${esc(PRO.previewHint)}</p>` : ''}
    </section>`;
  el.innerHTML = welcome ? `
    <header class="unlock__head">
      <div class="unlock__logo">${logo('horizontal')}</div>
      <h1 id="unlock-title" class="screen-title">${esc(PRO.app.heading)}</h1>
      <p class="unlock__lead">${esc(PRO.app.lead)}</p>
    </header>
    ${keyBox}
    <section class="unlock__key" aria-label="${esc(PRO.app.noKey)}">
      <p class="setting__label">${esc(PRO.app.noKey)}</p>
      <p class="unlock__price"><b>${esc(PRO.price)}</b> ${esc(PRO.priceNote)}</p>
      <div class="unlock__buy">${buy.replace('btn--primary', 'btn--secondary')}</div>
    </section>` : `
    <header class="unlock__head">
      <div class="unlock__logo">${logo('horizontal')}</div>
      <h1 id="unlock-title" class="screen-title">${esc(PRO.heading)}</h1>
      ${reason
        ? `<p class="notice" role="alert">${icon('triangle-alert')}<span>${esc(PRO.locked[reason] ?? PRO.locked.invalid)}</span></p>`
        : `<p class="unlock__lead">${esc(PRO.lead)}</p>`}
    </header>
    <ul class="unlock__list">${PRO.includes.map((x) => `<li>${icon('check', { size: 18 })}<span>${esc(x)}</span></li>`).join('')}</ul>
    <p class="unlock__price"><b>${esc(PRO.price)}</b> ${esc(PRO.priceNote)}</p>
    <div class="unlock__buy">${buy}</div>
    ${keyBox}`;
  const input = el.querySelector('#unlock-key');
  const btn = el.querySelector('[data-act="unlock"]');
  const msg = el.querySelector('.unlock__msg');
  return new Promise((resolve) => {
    async function tryKey() {
      if (btn.disabled) return;
      btn.disabled = true;
      msg.classList.remove('is-bad');
      msg.textContent = PRO.checking;
      const out = await license.activate(input.value, activate);
      if (out.ok) {
        const restoring = !!out.data && Object.keys(out.data).length > 0;
        msg.textContent = restoring ? PRO.restoring : out.free ? PRO.movedFree : out.moved ? PRO.movedHere : PRO.unlocked;
        setTimeout(resolve, out.moved && !out.free ? 2200 : 900, out);
        return;
      }
      btn.disabled = false;
      msg.classList.add('is-bad');
      msg.textContent = PRO.errors[out.reason] ?? PRO.errors.store;
    }
    btn.addEventListener('click', tryKey);
    el.querySelector('[data-act="paste"]')?.addEventListener('click', async () => {
      try { input.value = (await navigator.clipboard.readText()).trim(); } catch { input.focus(); return; }
      if (input.value) tryKey();
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryKey(); });
  });
}
