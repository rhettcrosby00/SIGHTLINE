// Partner mode (behind the `partner` flag, approved): a coach's phone sends
// the cues, for coach-led reaction games. This phone either shows the cues
// (on the stand, with the Custom setup's cones) or sends them.
// The phones meet through /api/partner with a 4-digit code. The stand phone
// checks for a new cue about 3 times a second, so a cue shows up within
// about half a second of the tap. Nothing about the athlete is sent.

import { faceHtml } from './render.js';
import { CUES } from './cues/index.js';
import { colorById, dirById } from './config.js';
import { tone, buzz, unlock } from '../lib/audio.js';
import { keepAwake, allowSleep } from '../lib/wakelock.js';
import { icon, DIR_ICON } from '../lib/icons.js';
import { esc } from '../lib/text.js';

const API = 'api/partner';
const POLL_MS = 300;

async function call(method, params) {
  let res;
  try {
    res = method === 'GET'
      ? await fetch(`${API}?${new URLSearchParams(params)}`, { cache: 'no-store' })
      : await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  } catch {
    throw new Error('No connection. Check the signal and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

// What the stand phone shows for a cue from the coach (null: a blank screen).
export function partnerFace(setup, cue) {
  if (!cue || cue.kind === 'clear') return null;
  if (cue.kind === 'hold') return { kind: 'hold' };
  const cueType = CUES[setup.cueType];
  const t = cueType.targets(setup).find((x) => x.key === cue.key);
  return t ? cueType.face(t, { asArrow: setup.cueType === 'arrows' }) : null;
}

// The coach's button for one cone: its color, arrow, number or call.
function coneButton(setup, t) {
  const c = t.color ? colorById[t.color] : null;
  const inner = setup.cueType === 'sport' ? `<b>${esc(t.call)}</b>`
    : c ? `<b>${c.shape}</b><span>${c.label}</span>`
      : t.dir ? `${icon(DIR_ICON[t.dir], { size: 40 })}<span>${dirById[t.dir].label}</span>`
        : `<b>${t.num}</b>`;
  const label = setup.cueType === 'sport' ? t.call : c ? c.label : t.dir ? dirById[t.dir].label : String(t.num);
  return `<button type="button" class="ppad__btn" data-act="cue" data-key="${t.key}" data-label="${esc(label)}"${c ? ` style="--c:${c.hex};--ink:${c.ink}"` : ''}>${inner}</button>`;
}

// el: the Partner screen. getSetup(): the Custom setup. onBack(): to the MOVE screen.
export function initPartner(el, { getSetup, onBack }) {
  let stop = () => {};
  let send = null;   // the coach side: { code, setup }

  function menu() {
    stop();
    el.innerHTML = `
      <header class="nav">
        <button type="button" class="nav__back" data-act="back">${icon('chevron-left', { size: 22 })}Move</button>
        <h2 class="nav__title">Partner mode</h2>
        <p class="cset__sub">A coach’s phone sends the cues.</p>
      </header>
      <section class="group"><div class="group__rows">
        <button type="button" class="hub-row" data-act="show">
          <span class="hub-row__text"><strong>Show cues on this phone</strong><small>Stand it up facing you. Uses your Custom setup’s cones.</small></span>${icon('chevron-right')}
        </button>
        <button type="button" class="hub-row" data-act="send">
          <span class="hub-row__text"><strong>Send cues from this phone</strong><small>For the coach: tap a cone and it shows on the other phone.</small></span>${icon('chevron-right')}
        </button>
      </div></section>
      <p class="notice">${icon('triangle-alert')}Use a clear, flat area. Warm up before high-speed cuts.</p>
      <p class="setting__hint">Both phones need a signal. A cue takes up to about half a second to arrive.</p>`;
  }

  // ---- This phone shows the cues (on the stand) ----
  async function showHere() {
    const setup = getSetup();
    unlock(setup.sound === 'on');   // inside the tap
    el.innerHTML = '<p class="partner__wait">Opening a partner session…</p>';
    let code;
    try {
      ({ code } = await call('POST', { action: 'open', setup }));
    } catch (e) {
      el.innerHTML = `<p class="cerr">${esc(e.message)}</p><button type="button" class="btn btn--secondary btn--block" data-act="menu">Back</button>`;
      return;
    }
    el.innerHTML = `
      <div class="partner">
        <p class="partner__label">Partner code</p>
        <p class="partner__code">${code}</p>
        <p class="clay__how">On the coach’s phone: Move → Partner mode → Send cues → ${code}. Then stand this phone up facing you.</p>
        <p class="partner__status" aria-live="polite">Waiting for the first cue…</p>
        <button type="button" class="btn btn--secondary btn--block" data-act="end">End</button>
      </div>`;
    keepAwake();
    let seq = 0;
    let alive = true;
    let timer = 0;
    let cueEl = null;
    stop = () => { alive = false; clearTimeout(timer); allowSleep(); stop = () => {}; };
    const status = (t) => { const s = el.querySelector('.partner__status'); if (s) s.textContent = t; };
    const show = (cue) => {
      if (!cueEl) {
        // First cue: the whole screen becomes the cue (like a drill).
        el.innerHTML = `
          <div class="cd pstand">
            <div class="cd__stage"><div class="cd__cue" aria-live="assertive"></div></div>
            <button type="button" class="pstand__end" data-act="end">End · ${code}</button>
          </div>`;
        cueEl = el.querySelector('.cd__cue');
      }
      const face = partnerFace(setup, cue);
      cueEl.innerHTML = face ? faceHtml(face) : '';
      if (face) {
        tone(face.kind === 'hold' ? 330 : 880, { dur: 0.12, gain: 0.14 });
        buzz(face.kind === 'hold' ? [20, 40, 20] : 30);
      }
    };
    const tick = async () => {
      if (!alive) return;
      try {
        const r = await call('GET', { action: 'poll', code, after: seq });
        if (alive && r.cue && r.seq > seq) { seq = r.seq; show(r.cue); }
        if (!cueEl) status('Connected. Waiting for the first cue…');
      } catch (e) {
        if (!cueEl) status(e.message);
      }
      if (alive) timer = setTimeout(tick, POLL_MS);
    };
    tick();
  }

  // ---- This phone sends the cues (the coach) ----
  function codeForm(error = '') {
    stop();
    el.innerHTML = `
      <header class="nav">
        <button type="button" class="nav__back" data-act="menu">${icon('chevron-left', { size: 22 })}Partner</button>
        <h2 class="nav__title">Send cues</h2>
        <p class="cset__sub">Type the code showing on the athlete’s phone.</p>
      </header>
      <input class="lbn__input pcode" inputmode="numeric" maxlength="4" pattern="[0-9]*" autocomplete="off" placeholder="1234" aria-label="Partner code">
      ${error ? `<p class="cerr">${esc(error)}</p>` : ''}
      <div class="screen__foot"><button type="button" class="btn btn--primary btn--block" data-act="join">Connect</button></div>`;
  }
  async function join() {
    const code = el.querySelector('.pcode')?.value.trim() ?? '';
    if (!/^\d{4}$/.test(code)) return codeForm('The code is 4 numbers.');
    try {
      const r = await call('GET', { action: 'poll', code, after: 1e9 });
      send = { code, setup: r.setup };
    } catch (e) {
      return codeForm(e.message);
    }
    const targets = CUES[send.setup.cueType].targets(send.setup);
    el.innerHTML = `
      <header class="nav">
        <button type="button" class="nav__back" data-act="menu">${icon('chevron-left', { size: 22 })}Partner</button>
        <h2 class="nav__title">Partner ${code}</h2>
        <p class="cset__sub">Tap a cone: it shows on the athlete’s phone right away.</p>
      </header>
      <div class="ppad">${targets.map((t) => coneButton(send.setup, t)).join('')}</div>
      <div class="ppad ppad--two">
        <button type="button" class="ppad__btn ppad__btn--hold" data-act="hold">${icon('hand', { size: 32 })}<span>Hold</span></button>
        <button type="button" class="ppad__btn ppad__btn--clear" data-act="clear"><span>Clear</span></button>
      </div>
      <p class="partner__status" aria-live="polite">Connected.</p>`;
  }
  async function sendCue(cue, label) {
    const status = el.querySelector('.partner__status');
    try {
      const { seq } = await call('POST', { action: 'cue', code: send.code, cue });
      status.textContent = `Sent ${label} · #${seq}`;
      buzz(15);
    } catch (e) {
      status.textContent = e.message;
    }
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'back') { stop(); onBack(); } else if (act === 'menu') menu();
    else if (act === 'show') showHere();
    else if (act === 'end') menu();
    else if (act === 'send') codeForm();
    else if (act === 'join') join();
    else if (act === 'cue') sendCue({ kind: 'go', key: b.dataset.key }, b.dataset.label);
    else if (act === 'hold') sendCue({ kind: 'hold' }, 'Hold');
    else if (act === 'clear') sendCue({ kind: 'clear' }, 'Clear');
  });

  return { open: menu, stop: () => stop() };
}
