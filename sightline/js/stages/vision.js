// Vision pillar: Near-Far Focus and Perception Span. (Target Capture shares
// the reaction drills' runner, in reaction.js.) Both are scored, adapt to the
// athlete (js/lib/adapt.js, about 80% right) and end on an easy round. Each
// shows its letter or pattern once per round, seconds apart: far under the
// 3-flashes-a-second limit.

import { howTo, countdown, practiceLeft, tapper, tapGuard } from './common.js';
import { cues, buzz } from '../lib/audio.js';
import { icon } from '../lib/icons.js';
import { nearFarAt, spanAt, scoreSpan } from '../content/vision.js';

const KICKER = 'Vision';
const FB_MS = 900;

// Shared bits: the feedback line and the scored-trial bookkeeping.
function results(session) {
  const stats = { trials: 0, correct: 0, misses: 0, wrong: 0, falseAlarms: 0, rts: [] };
  return {
    stats,
    add({ ok, resp, rt }) {
      stats.trials++;
      if (ok) { stats.correct++; if (rt != null) stats.rts.push(rt); } else if (resp == null) stats.misses++; else stats.wrong++;
      session.scorer?.trial(ok ? { outcome: 'correct', rtMs: rt } : { outcome: resp == null ? 'missed' : 'wrong' });
      (ok ? cues.correct : cues.wrong)();
    },
    done(extra = {}) {
      const avg = stats.rts.length ? Math.round(stats.rts.reduce((a, b) => a + b, 0) / stats.rts.length) : null;
      return {
        trials: stats.trials, correct: stats.correct, misses: stats.misses, wrong: stats.wrong, falseAlarms: 0,
        rtMs: avg, rtCount: stats.rts.length, bestRtMs: stats.rts.length ? Math.round(Math.min(...stats.rts)) : null, ...extra,
      };
    },
  };
}
const feedback = (fb) => ({
  say(ok, text) { fb.className = `rx__fb ${ok ? 'is-ok' : 'is-bad'}`; fb.innerHTML = `${icon(ok ? 'check' : 'x')}<span>${text}</span>`; },
  clear() { fb.className = 'rx__fb'; fb.textContent = ''; },
});

// ---- Near-Far Focus -----------------------------------------------------------
// FAR: look at a spot 10+ feet away. At the beep (and buzz), look back: a
// small letter shows for a moment. Tap it from 4. Quicker switches and
// smaller letters as the level rises.

const ANSWER_MS = 3000;

export const nearFar = {
  async run(ctx) {
    const { el, settings, session, step, sleep, now, remaining, hold } = ctx;
    const level = session.content.level(step.id);
    await howTo(ctx, {
      kicker: KICKER,
      title: 'Near-Far Focus',
      rule: 'Hold the phone at arm’s length and pick a spot 10+ feet away, like a sign or a door. On FAR, look at your spot. At the beep, look back: a small letter shows for a moment. Tap the one you saw. Stop if you feel dizzy.',
      demo: { html: `<div class="mini"><div class="mini__phone mini__phone--eyes mini__phone--nf"><b class="mini__far">FAR</b><b class="mini__near">K</b></div>
        <p class="mini__cap">Look far → back → tap the letter</p></div>` },
    });

    el.innerHTML = `
      <div class="rx rx--tap nf">
        <div class="rx__strip"><span class="rx__rule">LOOK FAR, THEN BACK · TAP THE LETTER</span><span class="rx__count"></span></div>
        <div class="rx__cue">
          <p class="nf__far" hidden>${icon('arrow-up', { size: 36 })}<b>FAR</b><span>Look at your spot</span></p>
          <b class="nf__letter" hidden></b>
          <p class="nf__note">Stop if you feel dizzy.</p>
        </div>
        <div class="rx__fb" aria-live="polite"></div>
        <div class="pad pad--plain" role="group" aria-label="Which letter?"></div>
      </div>`;
    const root = el.firstElementChild;
    const ruleEl = root.querySelector('.rx__rule');
    const countEl = root.querySelector('.rx__count');
    const box = root.querySelector('.rx__cue');
    const far = root.querySelector('.nf__far');
    const letter = root.querySelector('.nf__letter');
    const pad = root.querySelector('.pad');
    const wait = tapper(ctx, pad);
    const fb = feedback(root.querySelector('.rx__fb'));
    const blanks = () => { pad.innerHTML = Array.from({ length: 4 }, () => '<button type="button" class="pad__btn pad__btn--plain" disabled></button>').join(''); };

    // One round. easy: the easiest numbers (practice and the last round).
    const round = async (easy) => {
      const p = nearFarAt(easy ? 0 : level.value);
      const t = session.content.nearFar();
      blanks();
      far.hidden = false;
      await sleep(p.farMs);
      far.hidden = true;
      cues.go();
      buzz(40);
      letter.style.fontSize = `${easy ? 52 : p.sizePx}px`;
      letter.textContent = t.answer;
      letter.hidden = false;
      const shownAt = now();
      await sleep(easy ? 1100 : p.showMs);
      letter.hidden = true;
      pad.innerHTML = t.choices.map((l) => `<button type="button" class="pad__btn pad__btn--plain" data-id="${l}"><span class="pad__shape">${l}</span></button>`).join('');
      const resp = await wait(ANSWER_MS);
      return { ok: resp === t.answer, resp, rt: resp == null ? null : now() - shownAt, answer: t.answer };
    };
    const roundMs = (lv) => { const p = nearFarAt(lv); return p.farMs + p.showMs + ANSWER_MS + FB_MS; };

    blanks();
    if ((step.guide ?? settings.guide) !== 'brief' && practiceLeft(ctx) >= roundMs(0)) {
      await hold(async () => {
        ruleEl.textContent = 'PRACTICE · LOOK FAR, THEN BACK';
        const r = await round(true);
        fb.say(r.ok, r.ok ? 'Got it' : `It was ${r.answer}`);
        (r.ok ? cues.correct : cues.wrong)();
        await sleep(FB_MS);
        fb.clear();
      });
    }
    ruleEl.textContent = 'LOOK FAR, THEN BACK · TAP THE LETTER';
    await hold(() => countdown(ctx, box, 'GET SET'));

    const res = results(session);
    while (remaining() > roundMs(level.value)) {
      const easy = remaining() < roundMs(level.value) + roundMs(0);   // the last round is the easy one
      countEl.textContent = `#${res.stats.trials + 1}`;
      const r = await round(easy);
      res.add(r);
      if (!easy) level.update(r.ok);
      fb.say(r.ok, r.ok ? 'Got it' : `It was ${r.answer}`);
      blanks();
      await sleep(FB_MS);
      fb.clear();
      if (easy) break;
    }
    countEl.textContent = '';
    await sleep(Math.max(0, remaining()));
    return res.done();
  },
};

// ---- Perception Span ----------------------------------------------------------
// A grid (3×3 up to 5×5) flashes a pattern of dots once; tap the same
// squares. Bigger grids, more dots and shorter flashes as the level rises.

export const span = {
  async run(ctx) {
    const { el, settings, session, step, sleep, now, remaining, hold } = ctx;
    const level = session.content.level(step.id);
    await howTo(ctx, {
      kicker: KICKER,
      title: 'Perception Span',
      rule: 'Dots flash on the grid for a moment. Then tap the same squares.',
      demo: { html: `<div class="mini"><div class="mini__phone mini__phone--eyes"><i class="mini__grid">${'<i></i>'.repeat(9)}</i></div>
        <p class="mini__cap">See the dots → tap the same squares</p></div>` },
    });

    el.innerHTML = `
      <div class="rx rx--tap sp">
        <div class="rx__strip"><span class="rx__rule">WATCH, THEN TAP THE SAME SQUARES</span><span class="rx__count"></span></div>
        <div class="rx__cue"><div class="sp__grid" role="group" aria-label="Grid"></div></div>
        <div class="rx__fb" aria-live="polite"></div>
        <p class="rx__hint sp__state">&nbsp;</p>
      </div>`;
    const root = el.firstElementChild;
    const ruleEl = root.querySelector('.rx__rule');
    const countEl = root.querySelector('.rx__count');
    const box = root.querySelector('.rx__cue');
    const grid = root.querySelector('.sp__grid');
    const stateEl = root.querySelector('.sp__state');
    const fb = feedback(root.querySelector('.rx__fb'));

    // Taps toggle squares while it's the athlete's turn.
    let onTap = null;
    const guard = tapGuard();
    grid.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('[data-cell]');
      if (cell && onTap) { e.preventDefault(); if (guard.ok()) onTap(Number(cell.dataset.cell), cell); }
    });

    const round = async (easy) => {
      const p = spanAt(easy ? 0 : level.value);
      const pattern = session.content.span(p.grid, p.dots);
      grid.style.setProperty('--n', p.grid);
      const side = Math.min(box.clientWidth, box.clientHeight);   // as big a square as fits
      grid.style.width = grid.style.height = `${side}px`;
      grid.innerHTML = Array.from({ length: p.grid * p.grid }, (_, i) => `<button type="button" class="sp__cell" data-cell="${i}" aria-label="Square ${i + 1}"></button>`).join('');
      const cells = [...grid.children];
      stateEl.textContent = 'Watch';
      await sleep(600);
      for (const i of pattern) cells[i].classList.add('is-lit');
      await sleep(easy ? 1100 : p.flashMs);
      for (const i of pattern) cells[i].classList.remove('is-lit');
      stateEl.textContent = `Tap ${p.dots} squares`;
      const shownAt = now();
      const picks = new Set();
      await new Promise((resolve, reject) => {
        let over = false;
        const end = (v) => { if (!over) { over = true; onTap = null; resolve(v); } };
        guard.cue();
        onTap = (i, cell) => {
          if (picks.has(i)) picks.delete(i); else picks.add(i);
          cell.classList.toggle('is-picked', picks.has(i));
          if (picks.size === p.dots) sleep(250).then(() => end(true), () => end(false));
        };
        sleep(3000 + 900 * p.dots).then(() => end(false), (err) => { if (!over) { over = true; onTap = null; reject(err); } });
      });
      const s = scoreSpan(pattern, [...picks]);
      // Show the answer: found dots, missed ones, wrong taps.
      for (const i of pattern) cells[i].classList.add(picks.has(i) ? 'is-right' : 'is-missed');
      for (const i of picks) if (!pattern.includes(i)) cells[i].classList.add('is-wrong');
      stateEl.textContent = ' ';
      return { ok: s.ok, resp: picks.size ? 'tapped' : null, rt: s.ok ? now() - shownAt : null, hits: s.hits, dots: p.dots };
    };
    const roundMs = (lv) => { const p = spanAt(lv); return 600 + p.flashMs + 3000 + 900 * p.dots + FB_MS; };

    if ((step.guide ?? settings.guide) !== 'brief' && practiceLeft(ctx) >= roundMs(0) * 0.7) {
      await hold(async () => {
        ruleEl.textContent = 'PRACTICE · WATCH, THEN TAP';
        const r = await round(true);
        fb.say(r.ok, r.ok ? 'Got it' : `${r.hits} of ${r.dots}`);
        (r.ok ? cues.correct : cues.wrong)();
        await sleep(FB_MS);
        fb.clear();
      });
    }
    ruleEl.textContent = 'WATCH, THEN TAP THE SAME SQUARES';
    grid.innerHTML = '';
    await hold(() => countdown(ctx, box, 'GET SET'));

    const res = results(session);
    let biggest = null;
    while (remaining() > roundMs(level.value)) {
      const easy = remaining() < roundMs(level.value) + roundMs(0);
      const p = spanAt(easy ? 0 : level.value);
      countEl.textContent = `${p.grid}×${p.grid} · ${p.dots} dots`;
      const r = await round(easy);
      res.add(r);
      if (!easy) level.update(r.ok);
      if (r.ok && (!biggest || p.dots > biggest.dots)) biggest = p;
      fb.say(r.ok, `${r.hits} of ${p.dots}`);
      await sleep(FB_MS);
      fb.clear();
      if (easy) break;
    }
    grid.innerHTML = '';
    countEl.textContent = '';
    stateEl.textContent = ' ';
    await sleep(Math.max(0, remaining()));
    return res.done({ note: biggest ? `Best ${biggest.dots} dots on ${biggest.grid}×${biggest.grid}` : '' });
  },
};
