// Activate pillar: Quiet Eye. A target appears; the athlete holds a steady
// gaze on it until the ring closes ("locks", 2–3 s). Then a small symbol shows
// inside the target for a moment, and they tap which one it was, which only
// works if their eyes stayed put. Hard adds dots drifting around the target.
// The last target is easy (longer look, no distractions), so it ends on a success.
// The symbol's time adapts (js/lib/adapt.js): shorter after right answers.
// The symbol shows once per target (seconds apart): far under 3 flashes a second.
// Eye Check (beta, js/eye/): the ring fills only while the eyes are steady on
// the target and resets if they move; the symbol comes when it's full. Any
// wait past the usual lock time is held (it doesn't use drill time), so the
// number of targets, and so the score, is the same with or without it.

import { howTo, countdown, tapGuard, animate } from './common.js';
import { quietRing } from '../eye/math.js';
import { cues } from '../lib/audio.js';
import { icon } from '../lib/icons.js';
import { QE_SYMBOLS } from '../content/eyes.js';
import { lerp } from '../lib/adapt.js';

const ANSWER_MS = 3000;
const RING = 277;          // the ring's length (styles.css .qe__ring)
const EYE_WAIT_MS = 3000;  // Eye Check: the longest the symbol waits for steady eyes

export const quietEye = {
  async run(ctx) {
    const { el, settings, session, step, sleep, now, remaining, hold } = ctx;
    const hard = settings.difficulty === 'hard';
    const level = session.content.level(step.id);
    const lockMs = hard ? 2000 : 2500;
    const trialMs = 600 + lockMs + 700 + ANSWER_MS / 2 + 900;

    await howTo(ctx, {
      kicker: 'Activate',
      title: 'Quiet Eye',
      rule: 'Look at the dot and keep your eyes perfectly still on it until the ring closes. A small symbol shows inside — then tap the one you saw.',
      demo: { html: `<div class="mini"><div class="mini__phone mini__phone--eyes"><div class="qe qe--mini"><svg class="qe__ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/></svg><span class="qe__dot"></span></div></div>
        <p class="mini__cap">Eyes still until the ring closes</p></div>` },
    });

    el.innerHTML = `
      <div class="rx rx--tap qeq">
        <div class="rx__strip"><span class="rx__rule">EYES STILL · THEN TAP THE SYMBOL</span><span class="rx__count"></span></div>
        <div class="rx__cue"><div class="qe qe--field" hidden>
          <svg class="qe__ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/></svg>
          <span class="qe__dot"><b class="qe__symbol"></b></span>
          <i class="qe__lure qe__lure--a"></i><i class="qe__lure qe__lure--b"></i><i class="qe__lure qe__lure--c"></i>
        </div></div>
        <div class="rx__fb" aria-live="polite"></div>
        <div class="pad pad--colors" role="group" aria-label="Which symbol?">
          ${QE_SYMBOLS.map((sym) => `<button type="button" class="pad__btn pad__btn--plain" data-id="${sym}" disabled><span class="pad__shape">${sym}</span></button>`).join('')}
        </div>
      </div>`;
    const root = el.firstElementChild;
    const box = root.querySelector('.rx__cue');
    const target = root.querySelector('.qe');
    const ring = root.querySelector('.qe__ring circle');
    const symbolEl = root.querySelector('.qe__symbol');
    const fb = root.querySelector('.rx__fb');
    const countEl = root.querySelector('.rx__count');
    const buttons = [...root.querySelectorAll('.pad__btn')];

    let onTap = null;
    const guard = tapGuard();
    root.querySelector('.pad').addEventListener('pointerdown', (e) => {
      const id = e.target.closest('.pad__btn')?.dataset.id;
      if (id && onTap) { e.preventDefault(); if (guard.ok()) onTap(id); }
    });
    const waitTap = (ms) => new Promise((resolve, reject) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; onTap = null; resolve(v); } };
      guard.cue();
      onTap = finish;
      sleep(ms).then(() => finish(null), (err) => { if (!done) { done = true; onTap = null; reject(err); } });
    });
    const say = (cls, html) => { fb.className = `rx__fb ${cls}`; fb.innerHTML = html; };

    const eye = (await session.eye?.open(ctx, { drill: 'quieteye', title: 'Quiet Eye' })) ?? null;
    const stats = { trials: 0, correct: 0, misses: 0, wrong: 0, rts: [] };
    try {
      await hold(() => countdown(ctx, box, 'GET SET'));

      while (remaining() > trialMs) {
        const easy = remaining() < trialMs * 2;   // the last target is the easy one
        const t = session.content.quietEye();
        target.hidden = false;
        target.style.left = `calc(50% + ${t.x.toFixed(3)} * (50% - 70px))`;
        target.style.top = `calc(50% + ${t.y.toFixed(3)} * (50% - 70px))`;
        target.classList.toggle('qe--busy', hard && !easy);
        symbolEl.textContent = '';
        ring.style.animation = 'none';
        void ring.getBoundingClientRect();
        countEl.textContent = `#${stats.trials + 1}`;
        // Eye Check: the ring follows the eyes. Without it (or with tracking paused), it fills on time.
        let look = { progress: 0, runMs: 0, on: false };
        let best = 0;
        let stopRing = null;
        if (eye?.active()) {
          const tgt = eye.at(target);
          eye.mark(tgt);
          eye.expect(tgt);
          const fill = quietRing({ lockMs, aspect: innerHeight / innerWidth });
          stopRing = animate(now, (tt) => {
            look = fill(tt, eye.gaze(), tgt);
            best = Math.max(best, look.runMs);
            ring.style.strokeDashoffset = String(RING * (1 - look.progress));
            target.classList.toggle('is-eyes-on', look.on);
          });
        } else {
          ring.style.animation = `qe-lock ${lockMs}ms linear forwards`;
        }
        await sleep(lockMs);
        if (stopRing && look.progress < 1) {
          await hold(async () => {
            const until = now() + EYE_WAIT_MS;
            while (look.progress < 1 && now() < until && eye.active()) await sleep(50);
          });
        }
        const locked = !!stopRing && look.progress >= 1;
        ring.style.strokeDashoffset = '0';

        // Locked: the symbol shows once, briefly.
        symbolEl.textContent = t.symbol;
        const shownAt = now();
        buttons.forEach((b) => { b.disabled = false; });
        const tap = waitTap(ANSWER_MS);
        await sleep(easy ? 700 : Math.round(lerp(450, 170, level.value))).catch(() => {});
        symbolEl.textContent = '';
        const resp = await tap;
        const rt = now() - shownAt;
        buttons.forEach((b) => { b.disabled = true; });

        stopRing?.();
        target.classList.remove('is-eyes-on');
        ring.style.strokeDashoffset = '';
        if (stopRing) eye.note('locks', locked ? best : 0);
        stats.trials++;
        const ok = resp === t.symbol;
        if (ok) { stats.correct++; stats.rts.push(rt); } else if (resp == null) stats.misses++; else stats.wrong++;
        if (!easy) level.update(ok);
        session.scorer?.trial(ok ? { outcome: 'correct', rtMs: rt } : { outcome: resp == null ? 'missed' : 'wrong' });
        (ok ? cues.correct : cues.wrong)();
        say(ok ? 'is-ok' : 'is-bad', ok ? `${icon('check')}<span>Locked in</span>` : `<span>It was ${t.symbol}</span>`);
        target.hidden = true;
        await sleep(900);
        fb.className = 'rx__fb';
        fb.textContent = '';
      }
      target.hidden = true;
      countEl.textContent = '';
      await sleep(Math.max(0, remaining()));
    } finally {
      eye?.close();   // camera off the moment the drill ends
    }
    const avgRt = stats.rts.length ? Math.round(stats.rts.reduce((a, b) => a + b, 0) / stats.rts.length) : null;
    return {
      trials: stats.trials, correct: stats.correct, misses: stats.misses, wrong: stats.wrong, falseAlarms: 0,
      rtMs: avgRt, rtCount: stats.rts.length, bestRtMs: stats.rts.length ? Math.round(Math.min(...stats.rts)) : null,
    };
  },
};
