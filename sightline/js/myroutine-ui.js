// The My Routine builder: pick a breath, an optional imagery line, and how long
// to hold the quiet-eye dot. The cue word is the athlete's (from the check-in).
// Every change saves on this phone right away. "Try it" runs the routine.

import { ROUTINE_BREATHS, QUIET_EYE_S, IMAGERY_MAX, createRoutineStore, routineSeconds } from './myroutine.js';
import { icon } from './lib/icons.js';
import { esc } from './lib/text.js';

const IMAGERY_IDEAS = ['See the first play.', 'See the ball go in.', 'See my first touch.', 'See myself win the first rep.'];

// show(name, {back}); getSettings() for the cue word; onTry() runs it; onBack() leaves.
export function initRoutineBuilder({ show, getSettings, onTry, onBack }) {
  const el = document.getElementById('mr-builder');
  const store = createRoutineStore();

  const seg = (key, value, options, cls = '') => `
    <div class="seg seg--fill ${cls}" role="radiogroup">
      ${options.map(([v, label]) => `<button type="button" role="radio" data-set="${key}" data-value="${v}" aria-checked="${String(v) === String(value)}">${label}</button>`).join('')}
    </div>`;

  function render() {
    const r = store.get();
    el.innerHTML = `
      <header class="nav">
        <button type="button" class="nav__back" data-act="back">${icon('chevron-left', { size: 22 })}Focus</button>
        <h2 class="nav__title">My Routine</h2>
        <p class="cset__sub">20–40 seconds to repeat right before you compete, and before free throws, serves or kicks.</p>
      </header>
      <section class="group"><h3 class="group__title">1 · Breath</h3><div class="group__rows">
        <div class="setting setting--stack">${seg('breath', r.breath, ROUTINE_BREATHS, 'seg--two')}
          <p class="setting__hint">${{ sigh: 'Two breaths in, one long breath out. The quickest way to calm down.', resonance: 'In for 4, out for 6.', box: 'In 4, hold 4, out 4, hold 4.', energize: 'Three quick power breaths, to wake up.' }[r.breath]}</p>
        </div>
      </div></section>
      <section class="group"><h3 class="group__title">2 · See it (optional)</h3><div class="group__rows">
        <div class="setting setting--stack">
          <input class="lbn__input" data-imagery maxlength="${IMAGERY_MAX}" autocomplete="off" placeholder="One line, like “See the first play.”" value="${esc(r.imagery)}">
          <div class="chips" role="radiogroup" aria-label="Imagery ideas">${IMAGERY_IDEAS.map((t) => `<button type="button" class="chip" role="radio" aria-checked="${t === r.imagery}" data-idea="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        </div>
      </div></section>
      <section class="group"><h3 class="group__title">3 · Cue word</h3><div class="group__rows">
        <div class="setting"><span class="setting__label">${esc(getSettings().cue || 'COMPETE')}</span><span class="setting__hint">Change it on the check-in screen</span></div>
      </div></section>
      <section class="group"><h3 class="group__title">4 · Quiet eye</h3><div class="group__rows">
        <div class="setting setting--stack">${seg('quietEyeS', r.quietEyeS, QUIET_EYE_S.map((s) => [s, `${s} seconds`]))}
          <p class="setting__hint">Eyes completely still on one dot, then GO. Pick a spot like the rim, the ball or your target.</p>
        </div>
      </div></section>
      <div class="screen__foot">
        <p class="cset__est">About ${Math.round(routineSeconds(r))} seconds · saved on this phone</p>
        <button type="button" class="btn btn--primary btn--block" data-act="try">${icon('play')}Try it</button>
      </div>`;
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const r = store.get();
    if (b.dataset.set) {
      store.set({ ...r, [b.dataset.set]: b.dataset.set === 'quietEyeS' ? Number(b.dataset.value) : b.dataset.value });
      render();
    } else if (b.dataset.idea) {
      store.set({ ...r, imagery: b.dataset.idea });
      render();
    } else if (b.dataset.act === 'try') onTry();
    else if (b.dataset.act === 'back') onBack();
  });
  el.addEventListener('change', (e) => {
    if (!e.target.matches('[data-imagery]')) return;
    store.set({ ...store.get(), imagery: e.target.value });
    render();
  });

  return {
    open() { render(); show('routine'); },
  };
}
