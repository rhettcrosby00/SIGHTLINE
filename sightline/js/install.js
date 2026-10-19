// "Put Sightrep on your home screen". Right after a key first unlocks a phone (never inside the
// home-screen app itself), a full screen shows how, for this phone and browser only:
//   iPhone Safari: Share → Add to Home Screen → Add (iPhone Chrome: its own Share button)
//   Android and computers with Chrome or Edge: one Install button (the browser's own prompt),
//     or that browser's menu steps when it has no prompt
//   anything else (in-app browsers, Firefox on iPhone…): open this page in Safari or Chrome
// "I've added it" ends it. "Remind me later" puts a small banner on the home screen on the next
// REMINDERS visits, then stops. Settings → Install on home screen opens it again any time.
// Why it matters: the home-screen app opens full screen with its own icon, works with no
// signal, and keeps its data (Safari can clear a website's after about a week unused).
// On iPhone the home-screen app keeps its own storage, apart from Safari: it asks for the key
// once (js/unlock.js, welcome), the move there is free (api/_lib/license.js), and the setup
// saved with the key comes back (js/backup.js).

import { icon } from './lib/icons.js';
import { esc } from './lib/text.js';

const KEY = 'sightrep.install.v2';   // { status: 'new' | 'later' | 'added', reminders }
export const REMINDERS = 2;

// Which phone or computer, and which browser: { os: ios | android | desktop, browser }.
// browser: safari | chrome | edge | firefox | samsung | inapp (Instagram, TikTok, Gmail…) | other.
export function detectDevice(ua = '', { touchPoints = 0 } = {}) {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);   // iPads say "Macintosh"
  const android = /Android/.test(ua);
  const os = ios ? 'ios' : android ? 'android' : 'desktop';
  let browser = 'other';
  if (/FBAN|FBAV|FB_IAB|Instagram|Snapchat|TikTok|musical_ly|BytedanceWebview|LinkedInApp|Twitter|Line\/|GSA\/|; wv\)/.test(ua)) browser = 'inapp';
  else if (ios) browser = /CriOS/.test(ua) ? 'chrome' : /FxiOS/.test(ua) ? 'firefox' : /EdgiOS/.test(ua) ? 'edge'
    : /OPiOS|OPT\/|DuckDuckGo/.test(ua) ? 'other' : /Version\/[\d.]+.*Safari\//.test(ua) ? 'safari' : 'other';
  else if (/SamsungBrowser/.test(ua)) browser = 'samsung';
  else if (/Edg(A|iOS)?\//.test(ua)) browser = 'edge';
  else if (/OPR\/|Opera|DuckDuckGo/.test(ua)) browser = 'other';
  else if (/Firefox\//.test(ua)) browser = 'firefox';
  else if (/Chrome\//.test(ua)) browser = 'chrome';
  else if (/Safari\//.test(ua)) browser = 'safari';
  return { os, browser };
}

// The steps for one device: { kind, steps: [{ text, art }], copyLink, note, button }.
// kind: prompt (one Install button) | steps | open (open this page in another browser) | bookmark.
// canPrompt: the browser offered its own install prompt (beforeinstallprompt).
export function installGuide({ os, browser }, { canPrompt = false } = {}) {
  const keyNote = 'Then open Sightrep from your home screen and enter your key once more (it’s in your Gumroad receipt email). That move is free, and your settings come back with it.';
  if (canPrompt && os !== 'ios') {
    return { kind: 'prompt', button: os === 'desktop' ? 'Install app' : 'Install Sightrep', steps: [],
      note: os === 'desktop' ? 'Or bookmark this page.' : '' };
  }
  if (os === 'ios') {
    if (browser === 'safari') {
      return { kind: 'steps', note: keyNote, steps: [
        { text: 'Tap the Share button: the square with an arrow pointing up. Don’t see it? Tap ⋯ first.', art: 'ios-share' },
        { text: 'Scroll down and tap “Add to Home Screen.”', art: 'ios-add' },
        { text: 'If you see “Open as Web App,” leave it on. Tap “Add.”', art: 'ios-confirm' },
      ] };
    }
    if (browser === 'chrome') {
      return { kind: 'steps', note: keyNote, copyLink: 'Don’t see “Add to Home Screen”? Open this page in Safari instead.', steps: [
        { text: 'Tap the Share button in the address bar, at the top right.', art: 'ioschrome-share' },
        { text: 'Tap “Add to Home Screen.”', art: 'ios-add' },
        { text: 'Tap “Add.”', art: 'ios-confirm' },
      ] };
    }
    return { kind: 'open', title: 'Open this page in Safari to install', copyLink: '', steps: [
      { text: 'Tap “Copy link” below.', art: '' },
      { text: browser === 'inapp' ? 'Open Safari (or tap ⋯ here and choose “Open in Safari”), then paste the link in the address bar.' : 'Open Safari and paste the link in the address bar.', art: '' },
      { text: 'Follow the steps there: Share, then “Add to Home Screen.”', art: '' },
    ] };
  }
  if (os === 'android') {
    const menu = {
      chrome: ['Tap ⋮ at the top right.', 'Tap “Add to Home screen” or “Install app.”', 'Tap “Install” (or “Add”).'],
      edge: ['Tap ⋯ at the bottom.', 'Tap “Add to phone.”', 'Tap “Install.”'],
      samsung: ['Tap ≡ at the bottom right.', 'Tap “Add page to,” then “Home screen.”', 'Tap “Add.”'],
      firefox: ['Tap ⋮.', 'Tap “Add app to Home screen” (or “Install”).', 'Tap “Add.”'],
    }[browser];
    if (menu) {
      const arts = ['android-menu', 'android-add', 'android-confirm'];
      return { kind: 'steps', steps: menu.map((text, i) => ({ text, art: browser === 'chrome' ? arts[i] : '' })) };
    }
    return { kind: 'open', title: 'Open this page in Chrome to install', copyLink: '', steps: [
      { text: 'Tap “Copy link” below.', art: '' },
      { text: browser === 'inapp' ? 'Open Chrome (or tap ⋮ here and choose “Open in Chrome”), then paste the link.' : 'Open Chrome and paste the link in the address bar.', art: '' },
      { text: 'Tap ⋮, then “Add to Home screen” or “Install app.”', art: '' },
    ] };
  }
  // Computers
  if (browser === 'chrome') return { kind: 'steps', note: 'Or bookmark this page.', steps: [{ text: 'Click the install icon at the right end of the address bar (or ⋮ → Cast, save and share → Install page as app).', art: 'desktop-install' }, { text: 'Click “Install.”', art: '' }] };
  if (browser === 'edge') return { kind: 'steps', note: 'Or bookmark this page.', steps: [{ text: 'Click ⋯ → Apps → “Install this site as an app.”', art: '' }, { text: 'Click “Install.”', art: '' }] };
  if (browser === 'safari') return { kind: 'steps', note: 'Or bookmark this page.', steps: [{ text: 'In the menu bar, choose File → “Add to Dock.”', art: '' }, { text: 'Click “Add.”', art: '' }] };
  return { kind: 'bookmark', steps: [{ text: 'Bookmark this page: press ⌘D on a Mac or Ctrl+D on Windows.', art: '' }],
    note: 'Sightrep is made for your phone: open sightrep.app on it to put Sightrep on its home screen.' };
}

// What to show now: 'screen' (right after a key first unlocks this phone), 'banner' (after
// "Remind me later", on the next REMINDERS visits), or null. Never in the home-screen app.
export function installPlan(state = {}, { standalone = false, firstUnlock = false } = {}) {
  if (standalone || state.status === 'added') return null;
  if (firstUnlock && (state.status ?? 'new') === 'new') return 'screen';
  if (state.status === 'later' && (state.reminders ?? 0) < REMINDERS) return 'banner';
  return null;
}

// The little pictures beside each step: the part to tap, pulsing.
const hit = (inner) => `<span class="ins-hit">${inner}</span>`;
const ART = {
  'ios-share': () => `<div class="ins-art ins-art--bar">${icon('chevron-left', { size: 18 })}<span class="ins-url">app.sightrep.app</span>${hit(icon('share', { size: 20 }))}<span class="ins-dots">⋯</span></div>`,
  'ioschrome-share': () => `<div class="ins-art ins-art--bar"><span class="ins-url">app.sightrep.app</span>${hit(icon('share', { size: 20 }))}<span class="ins-dots">⋯</span></div>`,
  'ios-add': () => `<div class="ins-art ins-art--list"><span class="ins-row">${icon('copy', { size: 18 })}Copy</span><span class="ins-row">${icon('plus', { size: 18 })}Add to Reading List</span>${hit(`<span class="ins-row">${icon('square-plus', { size: 18 })}Add to Home Screen</span>`)}</div>`,
  'ios-confirm': () => `<div class="ins-art ins-art--dialog"><span class="ins-dialog__top"><span>Cancel</span><b>Add to Home Screen</b>${hit('<b class="ins-blue">Add</b>')}</span><span class="ins-dialog__app"><img src="icons/icon-192.png" alt="" width="36" height="36"><span>Sightrep</span></span></div>`,
  'android-menu': () => `<div class="ins-art ins-art--bar"><span class="ins-url">app.sightrep.app</span>${hit(icon('ellipsis-vertical', { size: 20 }))}</div>`,
  'android-add': () => `<div class="ins-art ins-art--list"><span class="ins-row">${icon('plus', { size: 18 })}New tab</span>${hit(`<span class="ins-row">${icon('square-plus', { size: 18 })}Add to Home screen</span>`)}<span class="ins-row">${icon('download', { size: 18 })}Downloads</span></div>`,
  'android-confirm': () => `<div class="ins-art ins-art--dialog"><span class="ins-dialog__app"><img src="icons/icon-192.png" alt="" width="36" height="36"><span>Install app? <b>Sightrep</b></span></span><span class="ins-dialog__btns"><span>Cancel</span>${hit('<b class="ins-blue">Install</b>')}</span></div>`,
  'desktop-install': () => `<div class="ins-art ins-art--bar"><span class="ins-url">app.sightrep.app</span>${hit(icon('download', { size: 20 }))}</div>`,
};

function screenHtml(guide, { device, fromSettings, standalone, keyLast4 }) {
  const steps = guide.steps.length ? `<ol class="ins-steps">${guide.steps.map((s, i) => `
      <li><span class="ins-num" aria-hidden="true">${i + 1}</span><div class="ins-step"><p>${esc(s.text)}</p>${s.art ? ART[s.art]() : ''}</div></li>`).join('')}</ol>` : '';
  const copyKey = device.os === 'ios' && keyLast4 && !standalone
    ? `<button type="button" class="btn btn--secondary btn--block" data-install="copy-key">${icon('copy')}Copy your key (ending ${esc(keyLast4)})</button>` : '';
  return `
    <header class="ins-head">
      <img class="ins-icon" src="icons/icon-192.png" alt="" width="64" height="64">
      <h1 id="install-title" class="screen-title">${esc(guide.title ?? 'Put Sightrep on your home screen')}</h1>
      <p class="ins-lead">${standalone ? 'You’re in the home-screen app now. These steps are for another phone.' : 'Then it opens like a regular app: full screen, with its own icon, and drills work on the field with no signal.'}</p>
    </header>
    ${guide.kind === 'prompt' ? `<button type="button" class="btn btn--primary btn--big btn--block" data-install="prompt">${icon('download')}${esc(guide.button)}</button>` : ''}
    ${steps}
    ${guide.copyLink != null ? `${guide.copyLink ? `<p class="ins-note">${esc(guide.copyLink)}</p>` : ''}<button type="button" class="btn btn--secondary btn--block" data-install="copy-link">${icon('copy')}Copy link</button>` : ''}
    ${guide.note ? `<p class="ins-note">${esc(guide.note)}</p>` : ''}
    ${copyKey}
    <p class="ins-msg status" role="status" aria-live="polite"></p>
    <div class="screen__foot ins-foot">
      ${fromSettings
        ? '<button type="button" class="btn btn--primary btn--block" data-install="close">Done</button>'
        : `<button type="button" class="btn btn--primary btn--block" data-install="added">I’ve added it</button>
           <button type="button" class="btn btn--secondary btn--block" data-install="later">Remind me later</button>`}
    </div>`;
}

const safeStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };   // blocked: this visit only

export function initInstall({ storage = safeStorage(), license = null, link = 'https://app.sightrep.app' } = {}) {
  let prompt = null;   // the browser's own install prompt, when it offers one (Chrome, Edge, Samsung)
  const read = () => { try { return JSON.parse(storage.getItem(KEY) || '{}'); } catch { return {}; } };
  const write = (v) => { state = v; try { storage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked: this visit only */ } };
  let state = read();
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const device = () => detectDevice(navigator.userAgent, { touchPoints: navigator.maxTouchPoints ?? 0 });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); prompt = e; });
  window.addEventListener('appinstalled', () => { prompt = null; write({ ...state, status: 'added' }); });
  if (standalone() && state.status !== 'added') write({ ...state, status: 'added' });   // opened from the home screen: it's installed

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  return {
    standalone,
    device,
    // After the gate: what to show this visit ('screen' | 'banner' | null). A phone unlocked
    // before 6.4 (no install record yet) gets the banner, not the full screen.
    plan({ firstUnlock = false } = {}) {
      if (!firstUnlock && !state.status && !standalone()) write({ status: 'later', reminders: 0 });
      return installPlan(state, { standalone: standalone(), firstUnlock });
    },
    // The banner was shown on this visit: one of the REMINDERS used.
    bannerShown() { write({ ...state, reminders: (state.reminders ?? 0) + 1 }); },

    // The full screen, in `el` (a .screen). Resolves with 'added' | 'later' | 'close'.
    showScreen(el, { fromSettings = false } = {}) {
      const render = () => {
        const guide = installGuide(device(), { canPrompt: !!prompt });
        el.innerHTML = screenHtml(guide, { device: device(), fromSettings, standalone: standalone(), keyLast4: license?.last4?.() });
      };
      render();
      const msg = () => el.querySelector('.ins-msg');
      return new Promise((resolve) => {
        el.onclick = async (e) => {
          const act = e.target.closest('[data-install]')?.dataset.install;
          if (!act) return;
          if (act === 'prompt') {
            const p = prompt;
            prompt = null;   // a prompt can be used once
            if (!p) { render(); return; }
            p.prompt();
            const choice = await p.userChoice?.catch(() => null);
            if (choice?.outcome !== 'accepted') { render(); return; }   // dismissed: show the menu steps instead
            write({ ...state, status: 'added' });
            msg().textContent = 'Installed. Open Sightrep from your home screen or app list.';
            el.onclick = null;
            setTimeout(resolve, 1800, 'added');
            return;
          }
          if (act === 'copy-link') { msg().textContent = (await copy(link)) ? 'Link copied.' : link; return; }
          if (act === 'copy-key') {
            msg().textContent = (await copy(license?.key?.() ?? '')) ? 'Key copied. In the home-screen app, tap Paste.' : 'Couldn’t copy. Your key is in your Gumroad receipt email.';
            return;
          }
          if (act === 'added') write({ ...state, status: 'added' });
          if (act === 'later') write({ ...state, status: 'later', reminders: state.status === 'later' ? state.reminders ?? 0 : 0 });
          el.onclick = null;
          resolve(act);
        };
      });
    },
  };
}
