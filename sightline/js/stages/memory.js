// Challenge pillar: Memory Sequence. The 2×2 color pad lights up one color at
// a time; the athlete taps the same colors back in order. Get it right and the
// next sequence is one longer; miss it and the length stays the same.
// Sequences come from the session (js/content/reaction.js), so a seed replays.

import { howTo, countdown, mini } from './common.js';
import { cueById } from '../lib/colors.js';
import { cues, tone } from '../lib/audio.js';
import { icon } from '../lib/icons.js';

const GRID = ['green', 'red', 'blue', 'yellow'];   // same pad as Color Call
const NOTE = { green: 392, red: 440, blue: 523, yellow: 587 };   // each color has its own tone
const START_LEN = 3;
const MAX_LEN = 9;
const FIRST_TAP_MS = 4000;   // time to start answering…
const TAP_MS = 2500;         // …and between taps

export const memory = {
  async run(ctx) {
    const { el, settings, session, sleep, remaining, hold } = ctx;
    const hard = settings.difficulty === 'hard';
    const onMs = hard ? 450 : 600;
    const offMs = hard ? 200 : 300;

    await howTo(ctx, {
      kicker: 'Challenge',
      title: 'Memory Sequence',
      rule: 'Watch the colors light up one at a time. Then tap them back in the same order.',
      demo: {
        pad: 'colors',
        frames: [
          { cue: mini.text('WATCH'), answer: 'red', caption: 'RED lights up first…' },
          { cue: mini.text('WATCH'), answer: 'blue', caption: '…then BLUE' },
          { cue: mini.text('YOUR TURN'), answer: 'red', caption: 'Tap RED, then BLUE' },
        ],
      },
    });

    el.innerHTML = `
      <div class="rx rx--tap memo" data-phase="watch">
        <div class="rx__strip"><span class="rx__rule"></span><span class="rx__count"></span></div>
        <div class="rx__cue"><p class="memo__state"></p><p class="memo__steps" aria-hidden="true"></p></div>
        <div class="rx__fb" aria-live="polite"></div>
        <div class="pad pad--colors" role="group" aria-label="Answer">
          ${GRID.map((id) => { const c = cueById[id]; return `
            <button type="button" class="pad__btn" data-id="${id}" style="--c:${c.hex};--ink:${c.ink}">
              <span class="pad__shape" aria-hidden="true">${c.shape}</span><span class="pad__label">${c.label}</span>
            </button>`; }).join('')}
        </div>
      </div>`;
    const root = el.firstElementChild;
    const ruleEl = root.querySelector('.rx__rule');
    const countEl = root.querySelector('.rx__count');
    const stateEl = root.querySelector('.memo__state');
    const stepsEl = root.querySelector('.memo__steps');
    const fb = root.querySelector('.rx__fb');
    const pad = root.querySelector('.pad');
    const btn = (id) => pad.querySelector(`[data-id="${id}"]`);

    let onTap = null;
    pad.addEventListener('pointerdown', (e) => {
      const id = e.target.closest('.pad__btn')?.dataset.id;
      if (id && onTap) { e.preventDefault(); onTap(id); }
    });
    const waitTap = (ms) => new Promise((resolve, reject) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; onTap = null; resolve(v); } };
      onTap = finish;
      sleep(ms).then(() => finish(null), (err) => { if (!done) { done = true; onTap = null; reject(err); } });
    });

    const light = async (id, ms) => {
      btn(id).classList.add('is-lit');
      tone(NOTE[id], { dur: Math.min(0.3, ms / 1000), gain: 0.12 });
      await sleep(ms);
      btn(id).classList.remove('is-lit');
    };
    const say = (cls, html) => { fb.className = `rx__fb ${cls}`; fb.innerHTML = html; };
    const clearFb = () => { fb.className = 'rx__fb'; fb.textContent = ''; };
    const dots = (done, total) => { stepsEl.textContent = total ? `${done} of ${total}` : ''; };

    // One round: show the sequence, then collect the taps. True if all right.
    const round = async (seq) => {
      root.dataset.phase = 'watch';
      stateEl.textContent = 'WATCH';
      dots(0, 0);
      await sleep(700);
      for (const id of seq) {
        await light(id, onMs);
        await sleep(offMs);
      }
      root.dataset.phase = 'input';
      stateEl.textContent = 'YOUR TURN';
      for (let i = 0; i < seq.length; i++) {
        dots(i, seq.length);
        const tap = await waitTap(i ? TAP_MS : FIRST_TAP_MS);
        if (tap) light(tap, 160).catch(() => {});
        if (tap !== seq[i]) {
          root.dataset.phase = 'watch';
          return { ok: false, slow: tap == null, at: i + 1, want: seq[i] };
        }
      }
      dots(seq.length, seq.length);
      root.dataset.phase = 'watch';
      return { ok: true };
    };
    const roundMs = (len) => 700 + len * (onMs + offMs) + FIRST_TAP_MS + (len - 1) * TAP_MS / 2 + 1200;

    // ---- Practice: one short sequence, unscored ----
    if (settings.guide !== 'brief') {
      await hold(async () => {
        ruleEl.textContent = 'PRACTICE · WATCH, THEN TAP IT BACK';
        const r = await round(session.content.memory(2));
        if (r.ok) { say('is-ok', `${icon('check')}<span>Got it</span>`); cues.correct(); }
        else { say('is-bad', `<span>It was ${cueById[r.want].label} at step ${r.at}</span>`); cues.wrong(); }
        await sleep(1300);
        clearFb();
      });
    }

    ruleEl.textContent = 'WATCH, THEN TAP IT BACK';
    stateEl.textContent = '';
    await hold(() => countdown(ctx, root.querySelector('.rx__cue'), 'GET SET'));

    // ---- Scored ----
    const stats = { trials: 0, correct: 0, longest: 0 };
    let len = START_LEN;
    while (remaining() > roundMs(len)) {
      countEl.textContent = `${len} colors`;
      const r = await round(session.content.memory(len));
      stats.trials++;
      session.scorer?.trial({ outcome: r.ok ? 'correct' : r.slow ? 'missed' : 'wrong' });
      if (r.ok) {
        stats.correct++;
        stats.longest = Math.max(stats.longest, len);
        say('is-ok', `${icon('check')}<span>${len} in a row</span>`);
        cues.correct();
        len = Math.min(MAX_LEN, len + 1);
      } else {
        say('is-bad', `${icon('x')}<span>${r.slow ? 'Too slow' : `It was ${cueById[r.want].label}`} at step ${r.at}</span>`);
        cues.wrong();
      }
      await sleep(1000);
      clearFb();
    }
    // Fill the rest of the slot so the routine stays on schedule.
    stateEl.textContent = '';
    dots(0, 0);
    countEl.textContent = '';
    await sleep(Math.max(0, remaining()));
    return { trials: stats.trials, correct: stats.correct, longest: stats.longest, rtMs: null, rtCount: 0 };
  },
};
