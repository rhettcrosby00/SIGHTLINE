// The unlock screen: after the safety waiver and before anything else, until
// this phone has a good key (js/license.js). Buy on Gumroad, or enter a key;
// there's no way past it without one. Every word: js/content/pro.js.

import { PRO } from './content/pro.js';
import { logo } from './brand.js';
import { esc } from './lib/text.js';
import { icon } from './lib/icons.js';

// Resolves once a key unlocks this phone. reason: why it's locked (moved,
// refunded, invalid, expired), shown at the top. preview: show the test key.
export function showUnlock(el, license, { reason = null, preview = false } = {}) {
  const buy = PRO.buyUrl
    ? `<a class="btn btn--primary btn--block" href="${esc(PRO.buyUrl)}" target="_blank" rel="noopener">${esc(PRO.buy)}</a>`
    : `<button type="button" class="btn btn--primary btn--block" disabled>${esc(PRO.buy)}</button>
       <p class="unlock__soon">${esc(PRO.soon)}</p>`;
  el.innerHTML = `
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
    <section class="unlock__key" aria-labelledby="unlock-key-label">
      <label id="unlock-key-label" class="setting__label" for="unlock-key">${esc(PRO.keyLabel)}</label>
      <input id="unlock-key" class="lbn__input unlock__input" type="text" autocomplete="off" autocapitalize="characters"
        spellcheck="false" enterkeyhint="go" maxlength="100" placeholder="${esc(PRO.keyPlaceholder)}">
      <button type="button" class="btn btn--secondary btn--block" data-act="unlock">${esc(PRO.unlock)}</button>
      <p class="lbn__hint unlock__msg" role="status" aria-live="polite"></p>
      <p class="unlock__help">${esc(PRO.help)}</p>
      ${preview ? `<p class="unlock__help">${esc(PRO.previewHint)}</p>` : ''}
    </section>`;
  const input = el.querySelector('#unlock-key');
  const btn = el.querySelector('[data-act="unlock"]');
  const msg = el.querySelector('.unlock__msg');
  return new Promise((resolve) => {
    async function tryKey() {
      if (btn.disabled) return;
      btn.disabled = true;
      msg.classList.remove('is-bad');
      msg.textContent = PRO.checking;
      const out = await license.activate(input.value);
      if (out.ok) {
        msg.textContent = out.moved ? PRO.movedHere : PRO.unlocked;
        setTimeout(resolve, out.moved ? 2200 : 900, out);
        return;
      }
      btn.disabled = false;
      msg.classList.add('is-bad');
      msg.textContent = PRO.errors[out.reason] ?? PRO.errors.store;
    }
    btn.addEventListener('click', tryKey);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryKey(); });
  });
}
