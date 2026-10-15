// Cone Drill screens: setup → cone layout → drill (shared session engine) →
// end screen. Nothing is saved except the setup itself.

import { initSetup } from './setup.js';
import { renderLayout } from './layout.js';
import { planDrill } from './plan.js';
import { coneStep } from './run.js';
import { runSession } from '../engine.js';
import { unlock as unlockAudio } from '../lib/audio.js';

const $ = (id) => document.getElementById(id);
const mmss = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// show(name) switches screens; dev = { speed, autoReady, seed } from the URL.
export function initConeDrill({ show, dev = {} }) {
  const setupEl = $('cd-setup');
  const layoutEl = $('cd-layout');
  const doneEl = $('cd-done');
  let setup = null;

  const nav = (where, s = setup) => {
    setup = s;
    if (where === 'menu') return show('start');
    if (where === 'setup') { setupCtl.render(); return show('cone-setup'); }
    if (where === 'layout') { renderLayout(layoutEl, setup); return show('cone-layout'); }
    if (where === 'start') return run();
  };

  const setupCtl = initSetup(setupEl, { onNav: nav });

  layoutEl.addEventListener('click', (e) => {
    const nav2 = e.target.closest('[data-nav]')?.dataset.nav;
    if (nav2) nav(nav2);
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
    const plan = planDrill(setup, dev.seed);
    show('session');
    const { completed, results } = await runSession([coneStep(plan, setup)], setup, { speed: dev.speed, autoReady: dev.autoReady });
    if (!completed) return nav('setup');
    const r = results[0];
    doneEl.innerHTML = `
      <div class="sum">
        <p class="sum__kicker">CONE DRILL COMPLETE</p>
        <h2 class="sum__title">NICE WORK</h2>
        <div class="tiles">
          <div class="tile"><p class="tile__value">${r.reps}</p><p class="tile__label">reps</p></div>
          <div class="tile"><p class="tile__value">${r.sets}</p><p class="tile__label">sets</p></div>
          <div class="tile"><p class="tile__value">${mmss(plan.totalMs)}</p><p class="tile__label">total time</p></div>
        </div>
        ${r.holds ? `<p class="sum__note">Plus <b>${r.holds}</b> fake-out${r.holds > 1 ? 's' : ''} where you held still.</p>` : ''}
        <p class="sum__foot">Nothing is saved — each drill stands alone.</p>
        <p class="sum__seed">Session code ${plan.seed}</p>
      </div>
      <div class="cdone__actions">
        <button type="button" class="btn-big" data-nav="start">RUN AGAIN</button>
        <button type="button" class="btn-ghost" data-nav="setup">Change setup</button>
        <button type="button" class="btn-ghost" data-nav="menu">Main menu</button>
      </div>`;
    show('cone-done');
  }

  doneEl.addEventListener('click', (e) => {
    const where = e.target.closest('[data-nav]')?.dataset.nav;
    if (where) nav(where);
  });

  return { open: () => { setup = setupCtl.get(); nav('setup'); } };
}
