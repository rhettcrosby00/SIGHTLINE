// Cone Drill screens: setup → cone layout → drill (shared session engine) →
// end screen. Nothing is saved except the setup itself.

import { initSetup } from './setup.js';
import { renderLayout } from './layout.js';
import { planDrill } from './plan.js';
import { coneSession } from './run.js';
import { validate, intervalMs } from './config.js';
import { runSession } from '../engine.js';
import { unlock as unlockAudio, buzz } from '../lib/audio.js';
import { icon } from '../lib/icons.js';
import { SUM_LOGO } from '../stages/summary.js';

const $ = (id) => document.getElementById(id);
const mmss = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const CUE_NAME = { colors: 'Colors', arrows: 'Arrows', numbers: 'Numbers', mixed: 'Mixed' };

// "Cone Drill · Arrows · 4 directions · 2.0 s · 3 sets" for "Run last setup".
export function describeSetup(s) {
  const what = s.cueType === 'arrows' || s.cueType === 'mixed' ? `${s.directions.length} directions` : `${s.cones} cones`;
  return `Cone Drill · ${CUE_NAME[s.cueType]} · ${what} · ${(intervalMs(s) / 1000).toFixed(1)} s · ${s.sets} set${s.sets > 1 ? 's' : ''}`;
}

// show(name, {back}) switches screens; dev = { speed, autoReady, seed } from the URL;
// onRun() fires when a drill starts (for "Run last setup").
export function initConeDrill({ show, dev = {}, onRun = () => {} }) {
  const setupEl = $('cd-setup');
  const layoutEl = $('cd-layout');
  const doneEl = $('cd-done');
  let setup = null;

  // Screens further along slide in from the right; going back slides from the left.
  const nav = (where, s = setup, { back = false } = {}) => {
    setup = s;
    if (where === 'menu') return show('start', { back: true });
    if (where === 'setup') { setupCtl.render(); return show('cone-setup', { back }); }
    if (where === 'layout') { renderLayout(layoutEl, setup); return show('cone-layout'); }
    if (where === 'start') return run();
  };

  const setupCtl = initSetup(setupEl, { onNav: nav });

  layoutEl.addEventListener('click', (e) => {
    const where = e.target.closest('[data-nav]')?.dataset.nav;
    if (where) nav(where, setup, { back: where === 'setup' });
  });
  layoutEl.addEventListener('input', (e) => {
    if (e.target.dataset.range !== 'distance') return;
    // Update the labels only, so the slider keeps working while dragged.
    setupCtl.set({ distance: Number(e.target.value) });
    setup = setupCtl.get();
    layoutEl.querySelector('[data-out="distance"]').textContent = `${setup.distance} yd`;
    layoutEl.querySelector('.lay__dist').textContent = `${setup.distance} yd`;
  });

  async function run() {
    unlockAudio(setup.sound === 'on', { voice: setup.callouts });   // inside the tap
    onRun();
    const plan = planDrill(setup, dev.seed);
    // Just the drill — no breathing or other Game Ready drills.
    const { steps, session, totalMs } = coneSession(plan, setup);
    show('session');
    const { completed, results } = await runSession(steps, setup, { session, speed: dev.speed, autoReady: dev.autoReady });
    if (!completed) return nav('setup', setup, { back: true });
    buzz([60, 80, 120]);   // drill complete
    const r = results.find((x) => x.id === 'conedrill');
    doneEl.innerHTML = `
      <div class="sum">
        <div class="sum__top"><p class="sum__kicker">Cone Drill complete</p>${SUM_LOGO}</div>
        <h2 class="sum__title">Nice work</h2>
        <div class="tiles">
          <div class="tile"><p class="tile__value">${r.reps}</p><p class="tile__label">reps</p></div>
          <div class="tile"><p class="tile__value">${r.sets}</p><p class="tile__label">sets</p></div>
          <div class="tile"><p class="tile__value">${mmss(totalMs)}</p><p class="tile__label">total time</p></div>
        </div>
        ${r.holds ? `<p class="sum__note">Plus <b>${r.holds}</b> fake-out${r.holds > 1 ? 's' : ''} where you held still.</p>` : ''}
        <p class="sum__foot">Nothing is saved. Each drill stands alone.</p>
        <p class="sum__seed">Session code ${plan.seed}</p>
      </div>
      <div class="screen__foot">
        <button type="button" class="btn btn--primary btn--block" data-nav="start">${icon('rotate-ccw')}Run it back</button>
        <div class="cdone__row">
          <button type="button" class="btn btn--secondary" data-nav="setup">Change setup</button>
          <button type="button" class="btn btn--secondary" data-nav="menu">Home</button>
        </div>
      </div>`;
    show('cone-done');
  }

  doneEl.addEventListener('click', (e) => {
    const where = e.target.closest('[data-nav]')?.dataset.nav;
    if (where) nav(where, setup, { back: where === 'setup' });
  });

  return {
    open: () => { setup = setupCtl.get(); nav('setup'); },
    describe: () => describeSetup(setupCtl.get()),
    // "Run last setup": cones are already out, so go straight to the drill.
    // Must be called from a tap (sound unlock).
    runLast: () => {
      setup = setupCtl.get();
      return validate(setup).ok ? nav('start') : nav('setup');
    },
  };
}
