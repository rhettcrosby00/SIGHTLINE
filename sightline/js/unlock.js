// The unlock screen: before anything else, until this phone has a good key (js/license.js).
// There's no way past it without one. Every word: js/content/pro.js and js/content/firstrun.js.
// Three versions:
//   sales  someone who hasn't bought: what's included, the price, Buy, and a box for a key
//   buyer  opened from "Start Sightrep" on the Gumroad page (?start): one big Paste your key
//          (they tapped Copy next to the key there); typing it is behind a small link
//   app    the home-screen app's first open (on iPhone it has its own storage): a 6-digit code
//          to the purchase email first, then Paste; the setup saved with the key comes back
// Every version also offers "Get a code by email" (6.6). Opened from the purchase email's
// "Start Sightrep" link (autoToken) it unlocks by itself; a used or expired link offers a new one.

import { PRO } from './content/pro.js';
import { FIRST } from './content/firstrun.js';
import { cleanKey } from './license.js';
import { logo } from './brand.js';
import { esc } from './lib/text.js';
import { icon } from './lib/icons.js';

// Clipboard text that could be a key: Gumroad's are four groups of 8 letters and digits, joined
// by dashes. Words, sentences and links are not.
export const looksLikeKey = (text) => /^[A-Z0-9][A-Z0-9-]{6,98}[A-Z0-9]$/.test(cleanKey(text)) && /[\d-]/.test(cleanKey(text));

// Resolves with the server's answer ({ ok, moved, free, data, email? }) once this phone unlocks.
// reason: why it's locked (moved, installed, refunded, invalid, expired), shown at the top.
// preview: show the test key. activate: options for unlocking ({ app, restore }).
// autoKey: a key that arrived by itself (a computer's QR code, js/handoff.js): unlock right away.
// autoToken: the purchase email's link (#t=…): unlock right away, or offer a new link.
// note: a problem to show at the top instead of the lead (an expired QR code).
export function showUnlock(el, license, { reason = null, preview = false, mode = 'sales', activate = {}, autoKey = '', autoToken = '', note = '' } = {}) {
  const buyer = mode === 'buyer' || mode === 'app';
  const app = mode === 'app';
  const canPaste = !!globalThis.navigator?.clipboard?.readText;
  const buy = (style) => (PRO.buyUrl
    ? `<a class="btn ${style} btn--block" href="${esc(PRO.buyUrl)}" target="_blank" rel="noopener">${esc(PRO.buy)}</a>`
    : `<button type="button" class="btn ${style} btn--block" disabled>${esc(PRO.buy)}</button><p class="unlock__soon">${esc(PRO.soon)}</p>`);
  const alert = (text) => `<p class="notice" role="alert">${icon('triangle-alert')}<span>${esc(text)}</span></p>`;
  const words = app ? { heading: PRO.app.heading, lead: FIRST.app.lead, help: PRO.app.help } : { heading: FIRST.buyer.heading, lead: FIRST.buyer.lead, help: PRO.help };
  const top = (heading, lead) => `
    <header class="unlock__head">
      <div class="unlock__logo">${logo('horizontal')}</div>
      <h1 id="unlock-title" class="screen-title">${esc(heading)}</h1>
      ${note ? alert(note) : reason ? alert(PRO.locked[reason] ?? PRO.locked.invalid) : `<p class="unlock__lead">${esc(lead)}</p>`}
    </header>`;
  const msgEl = '<p class="lbn__hint unlock__msg" role="status" aria-live="polite"></p>';
  const toggle = (act, text) => `<button type="button" class="link-btn unlock__more" data-act="${act}" aria-expanded="false">${esc(text)}${icon('chevron-down')}</button>`;
  const keyBox = (open) => `
    <section class="unlock__key${buyer ? ' unlock__key--typed' : ''}" aria-labelledby="unlock-key-label"${open ? '' : ' hidden'}>
      <label id="unlock-key-label" class="setting__label" for="unlock-key">${esc(app ? PRO.app.keyLabel : PRO.keyLabel)}</label>
      <div class="unlock__row">
        <input id="unlock-key" class="lbn__input unlock__input" type="text" autocomplete="off" autocapitalize="characters"
          spellcheck="false" enterkeyhint="go" maxlength="100" placeholder="${esc(PRO.keyPlaceholder)}">
        ${canPaste && !buyer ? `<button type="button" class="btn btn--secondary unlock__paste" data-act="paste">${icon('clipboard')}${esc(PRO.paste)}</button>` : ''}
      </div>
      <button type="button" class="btn btn--secondary btn--block" data-act="unlock">${esc(PRO.unlock)}</button>
      ${buyer ? '' : msgEl}
      <p class="unlock__help">${esc(words.help)}</p>
      ${preview ? `<p class="unlock__help">${esc(PRO.previewHint)}</p>` : ''}
    </section>`;
  // A 6-digit code to the purchase email (open by itself in the home-screen app).
  const emailBox = (open) => `
    <section class="unlock__key unlock__email" aria-labelledby="unlock-email-label"${open ? '' : ' hidden'}>
      <label id="unlock-email-label" class="setting__label" for="unlock-email">${esc(FIRST.email.label)}</label>
      <input id="unlock-email" class="lbn__input" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false"
        enterkeyhint="send" maxlength="254" placeholder="${esc(FIRST.email.placeholder)}">
      <button type="button" class="btn ${app ? 'btn--primary' : 'btn--secondary'} btn--block" data-act="code-send">${esc(FIRST.email.send)}</button>
      <div class="unlock__code" hidden>
        <label class="setting__label" for="unlock-code">${esc(FIRST.email.code)}</label>
        <input id="unlock-code" class="lbn__input unlock__codein" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" enterkeyhint="go">
        <button type="button" class="btn btn--primary btn--block" data-act="code-check">${esc(FIRST.email.check)}</button>
      </div>
      <p class="lbn__hint unlock__emsg" role="status" aria-live="polite"></p>
    </section>`;
  const resendBox = autoToken ? `<button type="button" class="btn btn--secondary btn--block unlock__resend" data-act="resend" hidden>${esc(FIRST.link.resend)}</button>` : '';
  // Buyers already bought: buying is one line at the bottom.
  const buySection = `
    <p class="unlock__buyline">${esc(FIRST.buyer.buy)} ${PRO.buyUrl ? `<a href="${esc(PRO.buyUrl)}" target="_blank" rel="noopener">${esc(PRO.buy)} · ${esc(PRO.price)}</a>` : esc(PRO.soon)}</p>`;
  el.innerHTML = app ? `${top(words.heading, words.lead)}
    ${emailBox(true)}
    ${resendBox}
    ${canPaste ? `<button type="button" class="btn btn--secondary btn--block unlock__go" data-act="paste-go">${icon('clipboard')}${esc(FIRST.app.paste)}</button>` : ''}
    ${msgEl}
    ${canPaste ? toggle('enter', FIRST.buyer.enter) : ''}
    ${keyBox(!canPaste)}
    ${buySection}` : buyer ? `${top(words.heading, words.lead)}
    ${canPaste ? `<button type="button" class="btn btn--primary btn--big btn--block unlock__go" data-act="paste-go">${icon('clipboard')}${esc(FIRST.buyer.paste)}</button>` : ''}
    ${msgEl}
    ${resendBox}
    ${canPaste ? toggle('enter', FIRST.buyer.enter) : ''}
    ${keyBox(!canPaste)}
    ${toggle('email', FIRST.email.get)}
    ${emailBox(false)}
    ${buySection}` : `${top(PRO.heading, PRO.lead)}
    <ul class="unlock__list">${PRO.includes.map((x) => `<li>${icon('check', { size: 18 })}<span>${esc(x)}</span></li>`).join('')}</ul>
    <p class="unlock__price"><b>${esc(PRO.price)}</b> ${esc(PRO.priceNote)}</p>
    <div class="unlock__buy">${buy('btn--primary')}</div>
    ${keyBox(true)}
    ${resendBox}
    ${toggle('email', FIRST.email.get)}
    ${emailBox(false)}`;
  const $ = (sel) => el.querySelector(sel);
  const input = $('#unlock-key');
  const msg = $('.unlock__msg');
  const emsg = $('.unlock__emsg');
  const say = (text, bad = false, where = msg) => { where.textContent = text; where.classList.toggle('is-bad', bad); };
  const open = (act, section) => {
    const s = $(section);
    if (!s) return;
    s.hidden = false;
    $(`[data-act="${act}"]`)?.setAttribute('aria-expanded', 'true');
    s.querySelector('input')?.focus();
  };
  const buttons = () => el.querySelectorAll('[data-act="unlock"], [data-act="paste-go"], [data-act="code-check"]');

  return new Promise((resolve) => {
    let busy = false;
    // One way to finish, whichever way the phone unlocked.
    async function finish(attempt, where = msg) {
      if (busy) return;
      busy = true;
      buttons().forEach((b) => { b.disabled = true; });
      const out = await attempt();
      if (out.ok) {
        try { if (out.email) sessionStorage.setItem('sightrep.email', out.email); } catch { /* blocked */ }
        const restoring = !!out.data && Object.keys(out.data).length > 0;
        say(restoring ? PRO.restoring : out.free ? PRO.movedFree : out.moved ? PRO.movedHere : PRO.unlocked, false, where);
        setTimeout(resolve, out.moved && !out.free ? 2200 : 900, out);
        return;
      }
      busy = false;
      buttons().forEach((b) => { b.disabled = false; });
      say(out.said ?? PRO.errors[out.reason] ?? PRO.errors.store, true, where);
      if (out.reason === 'link-expired') $('[data-act="resend"]')?.removeAttribute('hidden');
    }
    const tryKey = (raw, how) => finish(() => license.activate(raw, { ...activate, how }));

    $('[data-act="unlock"]').addEventListener('click', () => tryKey(input.value, 'typed'));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryKey(input.value, 'typed'); });
    // Sales version: Paste fills the box, then unlocks.
    $('[data-act="paste"]')?.addEventListener('click', async () => {
      try { input.value = (await navigator.clipboard.readText()).trim(); } catch { input.focus(); return; }
      if (input.value) tryKey(input.value, 'paste');
    });
    // Buyer and app versions: one Paste your key.
    $('[data-act="paste-go"]')?.addEventListener('click', async () => {
      let text = '';
      try { text = (await navigator.clipboard.readText()).trim(); } catch { say(FIRST.buyer.blocked, true); open('enter', '.unlock__key--typed'); return; }
      if (!looksLikeKey(text)) { say(FIRST.buyer.noKey, true); return; }
      input.value = text;
      tryKey(text, 'paste');
    });
    $('[data-act="enter"]')?.addEventListener('click', () => open('enter', '.unlock__key--typed'));
    $('[data-act="email"]')?.addEventListener('click', () => open('email', '.unlock__email'));

    // A code by email: send it, then type it (or let iPhone fill it in from Mail).
    const email = $('#unlock-email');
    const code = $('#unlock-code');
    const sendCode = async () => {
      say(PRO.checking, false, emsg);
      const out = await license.codeSend(email.value);
      if (!out.ok) { say(out.said ?? PRO.errors[out.reason] ?? PRO.errors.store, true, emsg); return; }
      $('.unlock__code').hidden = false;
      say(FIRST.email.sent, false, emsg);
      $('.unlock__code').scrollIntoView({ block: 'center' });
      code.focus({ preventScroll: true });
    };
    const checkCode = () => finish(() => license.codeCheck(email.value, code.value, activate), emsg);
    $('[data-act="code-send"]').addEventListener('click', sendCode);
    email.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendCode(); });
    $('[data-act="code-check"]').addEventListener('click', checkCode);
    code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 6); if (code.value.length === 6) checkCode(); });

    // A used or expired link: a new one to the purchase email.
    $('[data-act="resend"]')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      const out = await license.resend(autoToken);
      say(out.ok ? FIRST.link.sent : out.said ?? PRO.errors[out.reason] ?? PRO.errors.store, !out.ok);
    });

    if (autoKey) { input.value = autoKey; say(FIRST.buyer.unlocking); tryKey(autoKey, 'qr'); }
    else if (autoToken) { say(FIRST.link.unlocking); finish(() => license.redeem(autoToken, activate)); }
  });
}
