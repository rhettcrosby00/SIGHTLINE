// End-of-session summary. Nothing is saved: it renders once, then resets.
//
// Tap mode: overall accuracy, average and best reaction time (reaction
// drills only; brain drills include thinking time, so they're listed
// separately), and a row per scored drill.
// Cone mode: drills completed, cues called, and time, plus a row per drill.

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const ms = (v) => (v == null ? '—' : `${v}`);

function tile(value, unit, label) {
  return `<div class="tile">
    <p class="tile__value">${value}<span class="tile__unit">${unit}</span></p>
    <p class="tile__label">${label}</p>
  </div>`;
}

function row(name, detail, sub = '') {
  return `<li><span class="row__name">${name}${sub ? `<small>${sub}</small>` : ''}</span><span class="row__val">${detail}</span></li>`;
}

export function renderSummary(el, { results, settings, totalMs }) {
  const cone = settings.mode === 'cones';
  const minutes = Math.round(totalMs / 60000 * 2) / 2;
  const meta = `${cone ? 'Cones' : 'Tap'} · ${settings.length[0].toUpperCase()}${settings.length.slice(1)} · ${
    settings.difficulty === 'hard' ? 'Hard' : 'Normal'} · ${minutes} min`;

  let tiles, rows, note = '';

  if (cone) {
    const cueCount = results.reduce((a, r) => a + (r.cues ?? r.targets ?? 0), 0);
    tiles = tile(results.length, '', 'drills done') + tile(cueCount, '', 'cues called') + tile(minutes, 'min', 'warm-up');
    rows = results.map((r) => row(r.name,
      r.cues != null ? `${r.cues} cues` : r.targets != null ? `${r.targets} targets` : '✓')).join('');
  } else {
    const scored = results.filter((r) => r.trials);
    const reaction = scored.filter((r) => r.blockId === 'reaction' && r.rtCount);
    const trials = scored.reduce((a, r) => a + r.trials, 0);
    const correct = scored.reduce((a, r) => a + r.correct, 0);
    const rtN = reaction.reduce((a, r) => a + r.rtCount, 0);
    const avgRt = rtN ? Math.round(reaction.reduce((a, r) => a + r.rtMs * r.rtCount, 0) / rtN) : null;
    const best = reaction.length ? Math.min(...reaction.map((r) => r.bestRtMs)) : null;

    tiles = tile(pct(correct, trials), '%', 'accuracy') + tile(ms(avgRt), avgRt == null ? '' : 'ms', 'avg reaction') + tile(ms(best), best == null ? '' : 'ms', 'best reaction');

    rows = results.map((r) => {
      if (!r.trials) return row(r.name, '✓');
      const misses = [r.misses && `${r.misses} slow`, r.wrong && `${r.wrong} wrong`, r.falseAlarms && `${r.falseAlarms} on red`]
        .filter(Boolean).join(' · ');
      return row(r.name, `${pct(r.correct, r.trials)}%${r.rtMs == null ? '' : ` · ${r.rtMs} ms`}`, `${r.correct}/${r.trials}${misses ? ` · ${misses}` : ''}`);
    }).join('');

    // One plain-language highlight: the quickest reaction drill.
    const quickest = reaction.slice().sort((a, b) => a.rtMs - b.rtMs)[0];
    if (quickest) note = `Quickest drill today: <b>${quickest.name}</b> at ${quickest.rtMs} ms.`;
  }

  el.innerHTML = `
    <div class="sum">
      <p class="sum__kicker">SESSION COMPLETE</p>
      <h2 class="sum__title">GAME READY</h2>
      <p class="sum__meta">${meta}</p>
      <div class="tiles">${tiles}</div>
      ${note ? `<p class="sum__note">${note}</p>` : ''}
      <ul class="sum__rows">${rows}</ul>
      <p class="sum__foot">Results aren’t saved — each session stands alone. Sightline is a warm-up, not a medical or diagnostic tool.</p>
    </div>`;
}
