// FOCUS: eyes, mind and breathing with the phone in hand. Every answer is a
// tap. Game Ready runs all four pillars; the other sessions run one pillar.

import { buildRoutine } from './routine.js';
import { runSession } from './engine.js';
import { createSession } from './session.js';
import { FOCUS_SESSIONS, sessionById, totalMinutes } from './plan.js';
import { renderSummary } from './stages/summary.js';
import { askBefore, askAfter } from './stages/readiness.js';
import { describe } from './settings.js';
import { unlock as unlockAudio, buzz } from './lib/audio.js';
import { icon } from './lib/icons.js';
import { isOn } from './features.js';

const $ = (id) => document.getElementById(id);

// show(name, {back}) switches screens; dev = { speed, autoReady, seed, only }
// from the URL; onRun(sessionId) fires when a session starts (for "Run last").
export function initFocus({ show, dev = {}, variety, getSettings, updateSetting, onRun = () => {}, onOptions = () => {} }) {
  const hubEl = $('focus-hub');
  const flags = { newDrills: isOn('newDrills') };
  let from = 'start';   // where Done (or quitting) goes back to

  // Whole minutes, or halves under 2 minutes ("1.5 min").
  const minutes = (id) => {
    const m = totalMinutes(id, getSettings().length);
    return m < 2 ? Math.round(m * 2) / 2 : Math.round(m);
  };

  function renderHub() {
    const parts = FOCUS_SESSIONS.filter((s) => s.id !== 'game');
    hubEl.innerHTML = `
      <header class="nav">
        <button type="button" class="nav__back" data-nav="home">${icon('chevron-left', { size: 22 })}Home</button>
        <p class="side-tag">${icon('eye', { size: 18 })}Focus</p>
        <h2 class="nav__title">Eyes · Mind · Breath</h2>
        <p class="cset__sub">Hold your phone. Every answer is a tap.</p>
      </header>
      <section class="group"><h3 class="group__title">One part</h3><div class="group__rows">
        ${parts.map((s) => `
          <button type="button" class="hub-row" data-run="${s.id}">
            <span class="hub-row__text"><strong>${s.title}</strong><small>${s.short}</small></span>
            <span class="hub-row__meta">${minutes(s.id)} min</span>${icon('play')}
          </button>`).join('')}
      </div></section>
      <section class="group"><div class="group__rows">
        <button type="button" class="hub-row" data-nav="options">
          <span class="hub-row__text"><strong>Options</strong><small>${describe(getSettings())}</small></span>${icon('chevron-right')}
        </button>
      </div></section>
      <div class="screen__foot">
        <p class="cset__est">${sessionById.game.short} · ${minutes('game')} min</p>
        <button type="button" class="btn btn--primary btn--block" data-run="game">${icon('play')}Game Ready</button>
      </div>`;
  }

  hubEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.run) start(b.dataset.run, { from: 'focus' });
    else if (b.dataset.nav === 'home') show('start', { back: true });
    else if (b.dataset.nav === 'options') onOptions();
  });

  // Runs one FOCUS session. Call from a tap (sound unlock).
  async function start(sessionId, opts = {}) {
    const meta = sessionById[sessionId] ?? sessionById.game;
    from = opts.from ?? 'start';
    const settings = getSettings();
    unlockAudio(settings.sound === 'on');   // must happen inside the tap
    onRun(meta.id);
    // Every session is freshly shuffled; content from the last few sessions rests.
    const session = createSession({
      sessionId: meta.id, settings, seed: dev.seed, recent: dev.seed ? [] : variety.recent(), flags,
    });
    const steps = buildRoutine(session).filter((s) => !dev.only || dev.only.includes(s.id));

    // Readiness + cue word before; readiness again after Game Ready. Not timed, not saved.
    const readiness = { before: null, after: null };
    if (meta.check && !dev.autoReady) {
      show('check');
      const pick = await askBefore($('check'), { cue: settings.cue, suggestions: session.content.cueSuggestions });
      readiness.before = pick.level;
      settings.cue = pick.cue;
      updateSetting('cue', pick.cue);
    }

    $('screen-session').dataset.side = 'focus';
    show('session');
    const { completed, results } = await runSession(steps, settings, { session, speed: dev.speed, autoReady: dev.autoReady });
    if (!dev.seed) variety.add(session.record());   // also after a quit: they saw it
    if (!completed) { back(); return; }
    buzz([60, 80, 120]);   // session complete

    if (meta.check === 'both' && !dev.autoReady) {
      show('check');
      readiness.after = await askAfter($('check'), { cue: settings.cue });
    }
    $('check').innerHTML = '';

    const totalMs = steps.reduce((a, s) => a + s.durationMs, 0);
    renderSummary($('summary'), { title: meta.title, results, settings, totalMs, readiness, seed: session.seed });
    show('done');
  }

  const back = () => {
    if (from === 'focus') renderHub();
    show(from, { back: true });
  };

  // Nothing is kept: clear the summary and go back.
  $('btn-done').addEventListener('click', () => { $('summary').innerHTML = ''; back(); });

  return {
    openHub: () => { renderHub(); show('focus'); },
    renderHub,
    start,
    minutes,
    title: (id) => sessionById[id]?.title ?? '',
  };
}
