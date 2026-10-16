// "Add to Home Screen": a gentle card on the summary, from the first finished
// session on, until the app is installed. Why it matters: Safari can clear a
// website's saved data (levels, My Routine, settings, queued scores) after
// about 7 days without a visit; apps on the home screen keep it, and open
// with no signal. "Not now" hides the card for a week.

import { icon } from './lib/icons.js';

const KEY = 'sightrep.install.v1';
export const SNOOZE_DAYS = 7;

export function shouldOfferInstall({ installed, sessions, snoozedUntil = 0, now = Date.now() }) {
  return !installed && sessions >= 1 && now >= snoozedUntil;
}

const IPHONE = `<li><b>iPhone</b><span>In Safari, tap Share ${icon('share', { size: 18, label: 'Share' })}, then <b>Add to Home Screen</b>.</span></li>`;
const ANDROID = `<li><b>Android</b><span>In Chrome, tap ${icon('ellipsis-vertical', { size: 18, label: 'Menu' })}, then <b>Install app</b> (or <b>Add to Home screen</b>).</span></li>`;

export function initInstall(storage = globalThis.localStorage) {
  let prompt = null;   // Chrome / Android's own install prompt, when it offers one
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); prompt = e; });
  window.addEventListener('appinstalled', () => { prompt = null; });
  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const iphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const read = () => { try { return JSON.parse(storage.getItem(KEY) || '{}'); } catch { return {}; } };
  const write = (v) => { try { storage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked */ } };
  let visit = read();   // also counts this visit when storage is blocked

  return {
    // A session just finished: count it, and offer the card in `slot` if it's time.
    finished(slot) {
      visit = { ...visit, sessions: (visit.sessions ?? 0) + 1 };
      write(visit);
      if (!slot) return;
      if (!shouldOfferInstall({ installed: installed(), sessions: visit.sessions, snoozedUntil: visit.snoozedUntil })) { slot.innerHTML = ''; return; }
      slot.innerHTML = `
        <section class="install-card" aria-label="Add Sightrep to your home screen">
          <p class="install-card__title">${icon('download')}Add Sightrep to your home screen</p>
          <p class="install-card__why">Keeps your progress safe (iPhone can clear website data after about a week unused) and works with no signal.</p>
          <ol class="install-card__steps">${iphone ? IPHONE + ANDROID : ANDROID + IPHONE}</ol>
          <div class="cdone__row">
            <button type="button" class="btn btn--secondary" data-install="later">Not now</button>
            ${prompt ? '<button type="button" class="btn btn--primary" data-install="go">Install</button>' : ''}
          </div>
        </section>`;
      slot.onclick = async (e) => {
        const act = e.target.closest('[data-install]')?.dataset.install;
        if (!act) return;
        if (act === 'go' && prompt) { const p = prompt; prompt = null; p.prompt(); await p.userChoice?.catch(() => null); }
        if (act === 'later') { visit = { ...visit, snoozedUntil: Date.now() + SNOOZE_DAYS * 86400000 }; write(visit); }
        slot.innerHTML = '';
      };
    },
  };
}
