// Computer to phone (6.5). A buyer who opens "Start Sightrep" on a computer pastes their key
// there and gets a QR code; their phone's camera opens Sightrep on the phone, unlocked.
// The computer encrypts the key (AES-GCM) with a random secret and leaves only the scrambled
// copy on the server, under a random id, for 10 minutes. The QR link carries the id and the
// secret after the "#", which browsers never send to a server, so the server can't read the
// key and nothing readable is in the link. The phone takes the copy once and decrypts it.
// "Continue on this computer" unlocks the computer instead. Words: js/content/firstrun.js.
// The purchase email's "Start Sightrep" link opened on a computer (6.6): the QR code is that same
// link (still unused), so the phone uses it; or the computer does, with Continue on this computer.

import { FIRST } from './content/firstrun.js';
import { PRO } from './content/pro.js';
import { cleanKey } from './license.js';
import { looksLikeKey } from './unlock.js';
import { qrSvg } from './lib/qr.js';
import { logo } from './brand.js';
import { esc } from './lib/text.js';
import { icon } from './lib/icons.js';

const API = '/api/license';
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

// The key, sealed: { id, secret, blob }. Only blob (and id) go to the server.
export async function sealKey(key) {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(cleanKey(key))));
  return { id: b64u(crypto.getRandomValues(new Uint8Array(16))), secret: b64u(raw), blob: `${b64u(iv)}.${b64u(ct)}` };
}

// The key back from its sealed copy, or '' when it doesn't open.
export async function openKey(secret, blob) {
  try {
    const [iv, ct] = blob.split('.').map(unb64u);
    const k = await crypto.subtle.importKey('raw', unb64u(secret), 'AES-GCM', false, ['decrypt']);
    return cleanKey(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, ct)));
  } catch {
    return '';
  }
}

const post = (body, fetchFn) => fetchFn(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then((r) => r.json()).catch(() => ({ ok: false, reason: 'offline' }));

// The link a QR code opens on the phone.
export const handoffLink = (origin, { id, secret }) => `${origin}/?start#h=${id}.${secret}`;

// On the phone: the key from a QR link's "#h=id.secret" part → { key } or { problem } (words to show).
export async function takeHandoff(part, { fetch: fetchFn = (...a) => fetch(...a) } = {}) {
  const [id, secret] = String(part).split('.');
  if (!id || !secret) return { problem: FIRST.desktop.expired };
  const out = await post({ action: 'handoff-take', id }, fetchFn);
  const key = out.ok ? await openKey(secret, out.blob) : '';
  return key ? { key } : { problem: out.reason === 'offline' ? PRO.errors.offline : FIRST.desktop.expired };
}

// On a computer: paste the key → a QR code for the phone, or Continue on this computer.
// Resolves with license.activate's answer when this computer is unlocked.
export function showDesktopStart(el, license, { activate = {}, preview = false, origin = location.origin, token = '', fetch: fetchFn = (...a) => fetch(...a) } = {}) {
  if (token) return linkOnDesktop(el, license, { activate, origin, token });
  const canPaste = !!globalThis.navigator?.clipboard?.readText;
  el.innerHTML = `
    <header class="unlock__head">
      <div class="unlock__logo">${logo('horizontal')}</div>
      <h1 id="unlock-title" class="screen-title">${esc(FIRST.desktop.heading)}</h1>
      <p class="unlock__lead">${esc(FIRST.desktop.lead)}</p>
    </header>
    ${canPaste ? `<button type="button" class="btn btn--primary btn--big btn--block unlock__go" data-act="paste-go">${icon('clipboard')}${esc(FIRST.buyer.paste)}</button>` : ''}
    <section class="unlock__key" aria-labelledby="unlock-key-label"${canPaste ? ' hidden' : ''}>
      <label id="unlock-key-label" class="setting__label" for="unlock-key">${esc(PRO.keyLabel)}</label>
      <input id="unlock-key" class="lbn__input unlock__input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="100" placeholder="${esc(PRO.keyPlaceholder)}">
      <button type="button" class="btn btn--secondary btn--block" data-act="make">${esc(FIRST.desktop.make)}</button>
    </section>
    ${canPaste ? `<button type="button" class="link-btn unlock__more" data-act="enter" aria-expanded="false">${esc(FIRST.buyer.enter)}${icon('chevron-down')}</button>` : ''}
    <p class="lbn__hint unlock__msg" role="status" aria-live="polite"></p>
    <figure class="handoff" hidden>
      <div class="handoff__code"></div>
      <figcaption class="unlock__help">${esc(FIRST.desktop.qr)}</figcaption>
      <button type="button" class="link-btn" data-act="again">${esc(FIRST.desktop.again)}</button>
    </figure>
    <button type="button" class="btn btn--secondary btn--block" data-act="here" disabled>${esc(FIRST.desktop.here)}</button>
    ${preview ? `<p class="unlock__help">${esc(PRO.previewHint)}</p>` : ''}`;
  const msg = el.querySelector('.unlock__msg');
  const input = el.querySelector('#unlock-key');
  const fig = el.querySelector('.handoff');
  const here = el.querySelector('[data-act="here"]');
  const say = (text, bad = false) => { msg.textContent = text; msg.classList.toggle('is-bad', bad); };
  let key = '';

  async function makeCode(raw) {
    if (!looksLikeKey(raw)) { say(FIRST.buyer.noKey, true); return; }
    say(PRO.checking);
    const ok = await post({ action: 'verify', key: cleanKey(raw) }, fetchFn);
    if (!ok.ok) { say(PRO.errors[ok.reason] ?? PRO.errors.store, true); return; }
    key = cleanKey(raw);
    here.disabled = false;
    const sealed = await sealKey(key);
    const put = await post({ action: 'handoff-put', id: sealed.id, blob: sealed.blob }, fetchFn);
    if (!put.ok) { say(PRO.errors[put.reason] ?? PRO.errors.store, true); return; }
    fig.querySelector('.handoff__code').innerHTML = qrSvg(handoffLink(origin, sealed), { label: 'QR code: opens Sightrep on your phone, unlocked' });
    fig.hidden = false;
    say('');
  }

  return new Promise((resolve) => {
    el.querySelector('[data-act="paste-go"]')?.addEventListener('click', async () => {
      try { await makeCode((await navigator.clipboard.readText()).trim()); } catch {
        say(FIRST.buyer.blocked, true);
        el.querySelector('.unlock__key').hidden = false;
      }
    });
    el.querySelector('[data-act="enter"]')?.addEventListener('click', () => { el.querySelector('.unlock__key').hidden = false; input.focus(); });
    el.querySelector('[data-act="make"]').addEventListener('click', () => makeCode(input.value));
    el.querySelector('[data-act="again"]').addEventListener('click', () => makeCode(key));
    here.addEventListener('click', async () => {
      here.disabled = true;
      say(PRO.checking);
      const out = await license.activate(key, activate);
      if (out.ok) { say(PRO.unlocked); setTimeout(resolve, 900, out); return; }
      here.disabled = false;
      say(PRO.errors[out.reason] ?? PRO.errors.store, true);
    });
  });
}

// The email link on a computer: a QR code of the same link, or Continue on this computer.
function linkOnDesktop(el, license, { activate, origin, token }) {
  el.innerHTML = `
    <header class="unlock__head">
      <div class="unlock__logo">${logo('horizontal')}</div>
      <h1 id="unlock-title" class="screen-title">${esc(FIRST.desktop.heading)}</h1>
    </header>
    <figure class="handoff">
      <div class="handoff__code">${qrSvg(`${origin}/?start#t=${token}`, { label: 'QR code: opens your Start Sightrep link on your phone' })}</div>
      <figcaption class="unlock__help">${esc(FIRST.link.qr)}</figcaption>
    </figure>
    <button type="button" class="btn btn--secondary btn--block" data-act="here">${esc(FIRST.desktop.here)}</button>
    <p class="lbn__hint unlock__msg" role="status" aria-live="polite"></p>
    <button type="button" class="btn btn--secondary btn--block" data-act="resend" hidden>${esc(FIRST.link.resend)}</button>`;
  const msg = el.querySelector('.unlock__msg');
  const say = (text, bad = false) => { msg.textContent = text; msg.classList.toggle('is-bad', bad); };
  return new Promise((resolve) => {
    el.querySelector('[data-act="here"]').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      say(FIRST.link.unlocking);
      const out = await license.redeem(token, activate);
      if (out.ok) {
        try { if (out.email) sessionStorage.setItem('sightrep.email', out.email); } catch { /* blocked */ }
        say(PRO.unlocked);
        setTimeout(resolve, 900, out);
        return;
      }
      e.currentTarget.disabled = false;
      say(out.said ?? PRO.errors[out.reason] ?? PRO.errors.store, true);
      if (out.reason === 'link-expired') el.querySelector('[data-act="resend"]').hidden = false;
    });
    el.querySelector('[data-act="resend"]').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      const out = await license.resend(token);
      say(out.ok ? FIRST.link.sent : out.said ?? PRO.errors[out.reason] ?? PRO.errors.store, !out.ok);
    });
  });
}
