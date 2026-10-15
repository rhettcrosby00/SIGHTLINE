// End-of-session summary for FOCUS. Nothing is saved: it renders once, then resets.
//
// Scored sessions: overall accuracy, average and best reaction time (reaction
// drills only; brain drills include thinking time, so they're listed
// separately), and a row per drill.
// Sessions with nothing scored (Breathing only, Rehearse only): drills done
// and time, plus a row per drill.

import { esc } from '../lib/text.js';
import { LEVELS } from './readiness.js';

// Small logo mark for result screens (white+lime on dark, black on light/outdoor).
export const SUM_LOGO = `<img class="sum__logo on-dark" src="assets/logo/logo-mark.svg" alt="Sightline logo" width="272" height="242">
  <img class="sum__logo on-light" src="assets/logo/logo-mark-mono-dark.svg" alt="Sightline logo" width="272" height="242">`;

const DONE = '<span class="row__val--done">Done</span>';
const REACTION_DRILLS = new Set(['colorcall', 'gonogo', 'stroop', 'peripheral']);
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
// Reaction times read as seconds (0.41) — easier to follow than milliseconds.
const sec = (v) => (v == null ? '—' : (v / 1000).toFixed(2));

function tile(value, unit, label) {
  return `<div class="tile">
    <p class="tile__value">${value}<span class="tile__unit">${unit}</span></p>
    <p class="tile__label">${label}</p>
  </div>`;
}

function row(name, detail, sub = '') {
  return `<li><span class="row__name">${name}${sub ? `<small>${sub}</small>` : ''}</span><span class="row__val">${detail}</span></li>`;
}

export function renderSummary(el, { title, results, settings, totalMs, readiness = {}, seed }) {
  // Whole minutes, or halves under 2 minutes (matches the menus).
  const m = totalMs / 60000;
  const minutes = m < 2 ? Math.round(m * 2) / 2 : Math.round(m);
  const meta = `${settings.length[0].toUpperCase()}${settings.length.slice(1)} · ${
    settings.difficulty === 'hard' ? 'Hard' : 'Normal'} · ${minutes} min`;

  let tiles, rows, note = '';

  // Nothing scored (breathing, visualization): show what was done, not accuracy.
  if (!results.some((r) => r.trials)) {
    const targets = results.reduce((a, r) => a + (r.targets ?? 0), 0);
    tiles = tile(results.length, '', 'drills done') + (targets ? tile(targets, '', 'eye targets') : '') + tile(minutes, 'min', 'warm-up');
    rows = results.map((r) => row(r.name, r.targets != null ? `${r.targets} targets` : DONE)).join('');
  } else {
    const scored = results.filter((r) => r.trials);
    // Headline reaction times come from the reaction drills only (brain drills include thinking time).
    const reaction = scored.filter((r) => REACTION_DRILLS.has(r.id) && r.rtCount);
    const trials = scored.reduce((a, r) => a + r.trials, 0);
    const correct = scored.reduce((a, r) => a + r.correct, 0);
    const rtN = reaction.reduce((a, r) => a + r.rtCount, 0);
    const avgRt = rtN ? Math.round(reaction.reduce((a, r) => a + r.rtMs * r.rtCount, 0) / rtN) : null;
    const best = reaction.length ? Math.min(...reaction.map((r) => r.bestRtMs)) : null;

    tiles = tile(pct(correct, trials), '%', 'accuracy') + tile(sec(avgRt), avgRt == null ? '' : 's', 'avg reaction') + tile(sec(best), best == null ? '' : 's', 'best reaction');

    rows = results.map((r) => {
      if (!r.trials) return row(r.name, r.targets != null ? `${r.targets} targets` : DONE);
      if (r.longest != null) return row(r.name, `${pct(r.correct, r.trials)}%`, `Longest ${r.longest} · ${r.correct}/${r.trials} sequences`);
      const misses = [r.misses && `${r.misses} slow`, r.wrong && `${r.wrong} wrong`, r.falseAlarms && `${r.falseAlarms} on red`]
        .filter(Boolean).join(' · ');
      return row(r.name, `${pct(r.correct, r.trials)}%${r.rtMs == null ? '' : ` · ${sec(r.rtMs)} s`}`, `${r.correct}/${r.trials}${misses ? ` · ${misses}` : ''}`);
    }).join('');

    // One plain-language highlight: the quickest reaction drill.
    const quickest = reaction.slice().sort((a, b) => a.rtMs - b.rtMs)[0];
    if (quickest) note = `Quickest drill today: <b>${quickest.name}</b> at ${sec(quickest.rtMs)} s. Lower is faster.`;
  }

  // Headspace: cue word and the before → after readiness check.
  const { before = null, after = null } = readiness;
  const level = (n) => (n == null ? '—' : `${n} <small>${LEVELS[n - 1]}</small>`);
  const head = [
    settings.cue ? `<div class="head__item"><p class="head__label">Cue word</p><p class="head__value">${esc(settings.cue)}</p></div>` : '',
    before != null || after != null
      ? `<div class="head__item"><p class="head__label">Readiness</p><p class="head__value">${level(before)} → ${level(after)}</p></div>`
      : '',
  ].join('');

  el.innerHTML = `
    <div class="sum">
      <div class="sum__top"><p class="sum__kicker">Session complete</p>${SUM_LOGO}</div>
      <h2 class="sum__title">${esc(title)}</h2>
      <p class="sum__meta">${meta}</p>
      ${head ? `<div class="head">${head}</div>` : ''}
      <div class="tiles">${tiles}</div>
      ${note ? `<p class="sum__note">${note}</p>` : ''}
      <ul class="sum__rows">${rows}</ul>
      <p class="sum__foot">Results aren’t saved — each session stands alone. Sightline is a warm-up, not a medical or diagnostic tool.</p>
      ${seed != null ? `<p class="sum__seed">Session code ${seed}</p>` : ''}
    </div>`;
}
