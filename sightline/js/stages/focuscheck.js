// Focus Check screens: a short intro, about 30 seconds of taps (reaction,
// then go / no-go), and the result against this phone's usual
// (js/lib/check.js has the plan and the math). Runs outside the session
// clock, with real time: taps are timed from pointer-down events against the
// frame the cue was drawn in. Each cue shows once, seconds apart.

import { CHECK, summarize, compare } from '../lib/check.js';
import { cues } from '../lib/audio.js';
import { icon } from '../lib/icons.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// The time of the frame that draws the change just made (same clock as event.timeStamp).
const drawn = () => new Promise((r) => requestAnimationFrame((t) => r(t)));
const sec = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(2));

// Intro: Start, or Skip (resolves false).
function intro(el, { phase }) {
  el.innerHTML = `
    <div class="check fc-intro">
      <p class="check__kicker">${phase === 'end' ? 'To finish' : 'Before we start'}</p>
      <h2 class="check__title">Focus Check</h2>
      <p class="fc-intro__text">About 30 seconds. Tap anywhere the moment the circle turns <b>green</b>. Then green means tap, <b>red</b> means don’t. A couple of warm-up taps come first.</p>
      <button type="button" class="btn btn--primary btn--block btn--big" data-act="go">Start</button>
      <button type="button" class="link-btn check__skip" data-act="skip">Skip</button>
    </div>`;
  return new Promise((resolve) => {
    el.firstElementChild.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) resolve(act === 'go');
    });
  });
}

// The taps. Resolves the raw result for summarize().
async function taps(el, plan) {
  el.innerHTML = `
    <div class="fc" role="button" aria-label="Tap area">
      <p class="fc__label"></p>
      <div class="fc__circle" aria-hidden="true"></div>
      <p class="fc__msg" aria-live="polite"></p>
    </div>`;
  const root = el.firstElementChild;
  const label = root.querySelector('.fc__label');
  const circle = root.querySelector('.fc__circle');
  const msg = root.querySelector('.fc__msg');
  let onTap = null;
  root.addEventListener('pointerdown', (e) => { e.preventDefault(); onTap?.(e.timeStamp); });
  // Resolves the tap time, or null after `ms`.
  const tapWithin = (ms) => new Promise((resolve) => {
    const timer = setTimeout(() => { onTap = null; resolve(null); }, ms);
    onTap = (t) => { clearTimeout(timer); onTap = null; resolve(t); };
  });
  const set = (state) => { circle.className = state ? `fc__circle ${state}` : 'fc__circle'; };

  const out = { reactionRts: [], gngRts: [], gngRight: 0, gngTotal: plan.gonogo.length, early: 0 };

  // Reaction: wait (a tap now is too soon, and the wait starts over once), then green.
  const reaction = async (foreMs, record) => {
    for (let tries = 0; tries < 2; tries++) {
      set('');
      msg.textContent = '';
      const early = await tapWithin(foreMs);
      if (early == null) break;
      out.early++;
      msg.textContent = 'Too soon. Wait for green.';
      await wait(900);
    }
    set('is-go');
    const onset = await drawn();
    const t = await tapWithin(CHECK.maxRtMs);
    set('');
    if (t != null) { cues.tick(); msg.textContent = sec(t - onset) + ' s'; }
    if (record) out.reactionRts.push(t == null ? null : t - onset);
    await wait(400);
  };

  label.textContent = 'Warm-up';
  for (const fore of plan.warmups) await reaction(fore, false);
  label.textContent = 'Tap on green';
  for (const fore of plan.reactions) await reaction(fore, true);

  label.textContent = 'Green: tap · Red: don’t';
  msg.textContent = '';
  for (const trial of plan.gonogo) {
    set('');
    await wait(trial.gapMs);
    msg.textContent = '';
    set(trial.go ? 'is-go' : 'is-nogo');
    const onset = await drawn();
    const t = await tapWithin(CHECK.gngWindowMs);
    set('');
    if (trial.go && t != null) { out.gngRight++; out.gngRts.push(t - onset); }
    else if (!trial.go && t == null) out.gngRight++;
    msg.textContent = trial.go ? (t == null ? 'Too slow' : '') : (t == null ? 'Held' : 'Red: don’t tap');
  }
  return out;
}

// Runs a whole check: intro, taps, summary. Resolves the result, or null if skipped.
export async function runFocusCheck(el, { plan, phase = 'check' }) {
  if (!(await intro(el, { phase }))) return null;
  const raw = await taps(el, plan);
  return { ...summarize(raw), phase, at: Date.now() };
}

// The result against this phone's usual. If today is noticeably slower and a
// lighter version exists, it's offered. Resolves 'lighter' or 'go'.
export function showCheckResult(el, { result, history = [], before = null, lighter = false }) {
  const cmp = compare(result.rtMs, history);
  const usual = cmp.avgMs == null
    ? `<p class="fc-res__note">From your ${['', '1st', '2nd', '3rd', '4th', '5th'][CHECK.minHistory + 1]} check on this phone, you’ll see today against your usual.</p>`
    : `<p class="fc-res__note">Your usual on this phone: <b>${sec(cmp.avgMs)} s</b> (last ${cmp.n} checks).</p>`;
  const slower = cmp.slower
    ? `<p class="fc-res__flag">${icon('info')}<span>A bit slower than your usual today. That happens some days.${lighter ? ' Want the lighter version?' : ''}</span></p>` : '';
  el.innerHTML = `
    <div class="check fc-res">
      <p class="check__kicker">Focus Check</p>
      <div class="tiles">
        <div class="tile"><p class="tile__value">${sec(result.rtMs)}<span class="tile__unit">${result.rtMs == null ? '' : 's'}</span></p><p class="tile__label">reaction</p></div>
        <div class="tile"><p class="tile__value">${result.gngRight}<span class="tile__unit">/${result.gngTotal}</span></p><p class="tile__label">go / no-go</p></div>
      </div>
      ${before?.rtMs != null && result.rtMs != null ? `<p class="fc-res__note">Start <b>${sec(before.rtMs)} s</b> → end <b>${sec(result.rtMs)} s</b>. Lower is faster.</p>` : ''}
      ${usual}
      ${slower}
      ${result.rtMs == null ? '<p class="fc-res__note">Not enough clean taps to time this one. No problem: try again another time.</p>' : ''}
      ${cmp.slower && lighter ? `
        <button type="button" class="btn btn--primary btn--block" data-act="lighter">Lighter version (Quick)</button>
        <button type="button" class="btn btn--secondary btn--block" data-act="go">Keep going</button>`
      : '<button type="button" class="btn btn--primary btn--block" data-act="go">Continue</button>'}
      <p class="fc-res__foot">Only compared with your own checks on this phone. It’s a readiness check, not a medical test.</p>
    </div>`;
  return new Promise((resolve) => {
    el.firstElementChild.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) resolve(act);
    });
  });
}
