// Extras: Object Tracking. Identical dots; a few light up, then all of them
// move and bounce for 5–8 s. When they stop, tap the ones you followed. More
// dots, more to follow and faster motion as the level rises (adapts to about
// 80% right); the last round is easy. Kept short: on its own, tracking
// training hasn't carried over to game play in studies, so it's an extra.
// Occlusion (Training only, opt-in): the dots disappear and come back while
// they move, never faster than 3 changes a second.

import { howTo, countdown, animate } from './common.js';
import { cues } from '../lib/audio.js';
import { icon } from '../lib/icons.js';
import { motAt, scoreMot } from '../content/vision.js';

const R = 16;            // dot radius, px
const HIT = 40;          // a tap counts within this distance of a dot's center
const SHOW_MS = 2000;    // the dots to follow stay lit this long
const FB_MS = 1000;

export const tracking = {
  async run(ctx) {
    const { el, session, step, sleep, now, remaining, hold } = ctx;
    const level = session.content.level(step.id);
    await howTo(ctx, {
      kicker: 'Extras',
      title: 'Object Tracking',
      rule: 'Some dots light up. Keep your eyes on them while all the dots move. When they stop, tap the ones you followed.',
      demo: { html: `<div class="mini"><div class="mini__phone mini__phone--eyes"><i class="mini__mot"><i></i><i></i><i></i><i></i></i></div>
        <p class="mini__cap">Follow the lit dots → tap them when they stop</p></div>` },
    });

    el.innerHTML = `
      <div class="rx rx--tap mot">
        <div class="rx__strip"><span class="rx__rule">FOLLOW THE LIT DOTS · THEN TAP THEM</span><span class="rx__count"></span></div>
        <div class="rx__cue mot__field"></div>
        <div class="rx__fb" aria-live="polite"></div>
        <p class="rx__hint mot__state">&nbsp;</p>
      </div>`;
    const root = el.firstElementChild;
    const countEl = root.querySelector('.rx__count');
    const box = root.querySelector('.mot__field');
    const stateEl = root.querySelector('.mot__state');
    const fbEl = root.querySelector('.rx__fb');
    const occ = session.content.occlusion?.('mot');

    let onTap = null;
    box.addEventListener('pointerdown', (e) => {
      if (!onTap) return;
      const r = box.getBoundingClientRect();
      onTap(e.clientX - r.left, e.clientY - r.top);
      e.preventDefault();
    });

    const round = async (easy) => {
      const p = motAt(easy ? 0 : level.value);
      const { width: w, height: h } = box.getBoundingClientRect();
      const field = session.content.mot({ w, h, n: p.dots, r: R, speed: p.speed });
      const targets = [...Array(p.targets).keys()];   // dots start in random spots, so the first few will do
      box.innerHTML = field.dots.map((_, i) => `<i class="mot__dot${i < p.targets ? ' is-target' : ''}"></i>`).join('');
      const els = [...box.children];
      const draw = () => field.dots.forEach((d, i) => { els[i].style.transform = `translate(${d.x - R}px, ${d.y - R}px)`; });
      draw();
      stateEl.textContent = `Follow these ${p.targets}`;
      await sleep(SHOW_MS);
      els.forEach((d) => d.classList.remove('is-target'));
      stateEl.textContent = 'Keep following';

      const start = now();
      let last = start;
      const stop = animate(now, (t) => {
        field.advance(Math.min(100, t - last));
        last = t;
        draw();
        if (occ) box.classList.toggle('is-occluded', !occ.visible(t - start));
      });
      try { await sleep(p.moveMs); } finally { stop(); box.classList.remove('is-occluded'); }

      stateEl.textContent = `Tap the ${p.targets} you followed`;
      const picks = [];
      const shownAt = now();
      await new Promise((resolve, reject) => {
        let over = false;
        const end = () => { if (!over) { over = true; onTap = null; resolve(); } };
        onTap = (x, y) => {
          let best = -1;
          let bestD = HIT;
          field.dots.forEach((d, i) => { const dd = Math.hypot(d.x - x, d.y - y); if (dd < bestD) { bestD = dd; best = i; } });
          if (best < 0) return;
          const at = picks.indexOf(best);
          if (at >= 0) picks.splice(at, 1); else picks.push(best);
          els[best].classList.toggle('is-picked', at < 0);
          if (picks.length === p.targets) sleep(250).then(end, end);
        };
        sleep(4000 + 1000 * p.targets).then(end, (err) => { if (!over) { over = true; onTap = null; reject(err); } });
      });
      const s = scoreMot(targets, picks);
      targets.forEach((i) => els[i].classList.add(picks.includes(i) ? 'is-right' : 'is-missed'));
      picks.filter((i) => !targets.includes(i)).forEach((i) => els[i].classList.add('is-wrong'));
      stateEl.textContent = ' ';
      return { ...s, p, picked: picks.length, rt: s.ok ? now() - shownAt : null };
    };
    const roundMs = (lv) => { const p = motAt(lv); return SHOW_MS + p.moveMs + 4000 + 1000 * p.targets + FB_MS; };

    await hold(() => countdown(ctx, box, 'GET SET'));

    const stats = { trials: 0, correct: 0, misses: 0, wrong: 0 };
    while (remaining() > roundMs(level.value)) {
      const easy = remaining() < roundMs(level.value) + roundMs(0);
      countEl.textContent = `#${stats.trials + 1}`;
      const r = await round(easy);
      stats.trials++;
      if (r.ok) stats.correct++; else if (!r.picked) stats.misses++; else stats.wrong++;
      session.scorer?.trial(r.ok ? { outcome: 'correct', rtMs: r.rt } : { outcome: r.picked ? 'wrong' : 'missed' });
      (r.ok ? cues.correct : cues.wrong)();
      if (!easy) level.update(r.ok);
      fbEl.className = `rx__fb ${r.ok ? 'is-ok' : 'is-bad'}`;
      fbEl.innerHTML = `${icon(r.ok ? 'check' : 'x')}<span>${r.hits} of ${r.p.targets}</span>`;
      await sleep(FB_MS);
      fbEl.className = 'rx__fb';
      fbEl.textContent = '';
      if (easy) break;
    }
    box.innerHTML = '';
    countEl.textContent = '';
    await sleep(Math.max(0, remaining()));
    return { trials: stats.trials, correct: stats.correct, misses: stats.misses, wrong: stats.wrong, falseAlarms: 0, rtMs: null, rtCount: 0 };
  },
};
