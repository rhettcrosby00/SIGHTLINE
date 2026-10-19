// First-time setup (6.5): after a key first unlocks a phone, one guided path to the first drill.
//   Step 1  Safety waiver (js/waiver.js): required, no Back, nothing else reachable before it
//   Step 2  You're in: a check mark, then on by itself after 1.5 s (or Continue)
//   Step 3  Make it yours: sport, position, leaderboard name; Skip for now always there
//   Step 4  Home screen (js/install.js, compact): skipped in the home-screen app or once added
//   Finish  "Let's try it. 3 minutes.": Start runs the first session; or Explore on my own
// Progress is saved after every step (sightrep.onboard.v1): closing the app midway resumes
// there, and finished steps never repeat. Phones set up before 6.5 never see it. Each step
// reached is counted once per phone on the server, as a total for the day (no ID, nothing else).
// Every word: js/content/firstrun.js.

import { FIRST, SETUP_STEPS } from './content/firstrun.js';
import { SPORTS, sportById } from './content/sports.js';
import { cleanName, nameProblem } from './score/names.js';
import { esc } from './lib/text.js';
import { icon } from './lib/icons.js';

const KEY = 'sightrep.onboard.v1';   // { step: 'ready' | 'yours' | 'install' | 'finish' | 'done', sent: [step…] }
const SETTINGS_KEY = 'sightrep.settings.v1';
export const ORDER = ['ready', 'yours', 'install', 'finish'];
export const READY_MS = 1500;        // "You're in" moves on by itself
const SHORT = { general: 'Other', baseball: 'Baseball / Softball' };   // sport tiles

// Where this phone is in the setup: the step to show, or 'done'. A phone that finished setup
// before 6.5 (setupDone) starts at 'done'.
export function nextStep(record, { setupDone = false } = {}) {
  if (record?.step === 'done') return 'done';
  if (!record?.step) return setupDone ? 'done' : 'ready';
  return ORDER.includes(record.step) ? record.step : 'ready';
}

// "Step n of N": the waiver is 1; the home-screen step drops out where it's skipped.
export function stepLabel(id, { installStep = true } = {}) {
  const list = ['waiver', 'ready', 'yours', ...(installStep ? ['install'] : [])];
  const n = list.indexOf(id) + 1;
  return n ? FIRST.progress(n, list.length) : '';
}

const safeStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function createOnboarding({ storage = safeStorage(), skip = false, install, lastName, updateSetting = () => {}, fetch: fetchFn = (...a) => fetch(...a) } = {}) {
  const read = () => { try { return JSON.parse(storage.getItem(KEY) ?? 'null'); } catch { return null; } };
  let record = read() ?? {};
  const save = (patch) => { record = { ...record, ...patch }; try { storage.setItem(KEY, JSON.stringify(record)); } catch { /* blocked: this visit only */ } };
  const saved = () => { try { return JSON.parse(storage.getItem(SETTINGS_KEY) ?? '{}') ?? {}; } catch { return {}; } };
  const installStep = () => !install || !(install.standalone() || install.added());

  // Counted once per phone: today's total for that step goes up by 1 on the server.
  function track(step) {
    if (!Object.hasOwn(SETUP_STEPS, step) || (record.sent ?? []).includes(step)) return;
    save({ sent: [...(record.sent ?? []), step] });
    fetchFn('/api/leaderboard', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'step', step }) }).catch(() => {});
  }

  // The views. Each one fits a phone screen; big buttons sit at the bottom.
  const head = (id, back) => `
    <header class="ob__head">
      ${back ? `<button type="button" class="nav__back" data-ob="back">${icon('chevron-left', { size: 22 })}${esc(FIRST.back)}</button>` : '<span></span>'}
      ${stepLabel(id, { installStep: installStep() }) ? `<p class="ob__progress">${esc(stepLabel(id, { installStep: installStep() }))}</p>` : ''}
    </header>`;
  const VIEWS = {
    ready: () => `${head('ready', false)}
      <div class="ob__body ob__body--center">
        <svg class="ob__check" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29"/><path d="M19 33l9 9 17-18"/></svg>
        <h1 id="onboard-title" class="screen-title">${esc(FIRST.ready.title)}</h1>
        <p class="ob__lead">${esc(FIRST.ready.line)}</p>
      </div>
      <div class="screen__foot ob__foot"><button type="button" class="btn btn--primary btn--big btn--block" data-ob="next">${esc(FIRST.ready.next)}</button></div>`,
    yours: (pick) => {
      const sp = sportById[pick.sport];
      const tiles = [...SPORTS.filter((s) => s.id !== 'general'), sportById.general];
      return `${head('yours', true)}
      <div class="ob__body">
        <h1 id="onboard-title" class="screen-title">${esc(FIRST.yours.title)}</h1>
        <p class="ob__lead">${esc(FIRST.yours.lead)}</p>
        <fieldset class="ob__field">
          <legend class="setting__label">${esc(FIRST.yours.sport)}</legend>
          <div class="ob__tiles" role="radiogroup" aria-label="${esc(FIRST.yours.sport)}">
            ${tiles.map((s) => `<button type="button" class="ob__tile" role="radio" aria-checked="${s.id === pick.sport}" data-sport="${s.id}">${esc(SHORT[s.id] ?? s.label)}</button>`).join('')}
          </div>
          ${sp?.positions.length ? `<select class="lb-select ob__position" data-pick="position" aria-label="${esc(FIRST.yours.position)}">
            <option value="">${esc(FIRST.yours.position)}</option>
            ${sp.positions.map(([id, label]) => `<option value="${id}"${id === pick.position ? ' selected' : ''}>${esc(label)}</option>`).join('')}
          </select>` : ''}
        </fieldset>
        <div class="ob__field">
          <label class="setting__label" for="ob-name">${esc(FIRST.yours.name)}</label>
          <input id="ob-name" class="lbn__input" type="text" maxlength="12" value="${esc(pick.name)}" placeholder="${esc(FIRST.yours.namePlaceholder)}"
            autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="words" enterkeyhint="done">
          <p class="lbn__hint" aria-live="polite"></p>
        </div>
      </div>
      <div class="screen__foot ob__foot">
        <button type="button" class="btn btn--primary btn--block" data-ob="next">${esc(FIRST.yours.next)}</button>
        <button type="button" class="link-btn ob__skip" data-ob="skip">${esc(FIRST.yours.skip)}</button>
      </div>`;
    },
    install: () => `${head('install', true)}
      <div class="ob__body">
        <h1 id="onboard-title" class="screen-title ob__title--sm">${esc(FIRST.install.title)}</h1>
        <div class="ob__install"></div>
      </div>
      <div class="screen__foot ob__foot">
        <button type="button" class="btn btn--primary btn--block" data-ob="next">${esc(FIRST.install.done)}</button>
        <button type="button" class="btn btn--secondary btn--block" data-ob="later">${esc(FIRST.install.later)}</button>
      </div>`,
    finish: () => `${head('finish', true)}
      <div class="ob__body ob__body--center">
        <h1 id="onboard-title" class="screen-title">${esc(FIRST.finish.title)}</h1>
        <p class="ob__lead">${esc(FIRST.finish.lead)}</p>
      </div>
      <div class="screen__foot ob__foot">
        <button type="button" class="btn btn--primary btn--big btn--block" data-ob="start">${icon('play')}${esc(FIRST.finish.start)}</button>
        <button type="button" class="link-btn ob__skip" data-ob="explore">${esc(FIRST.finish.explore)}</button>
      </div>`,
  };

  return {
    // Steps left on this phone after the key (not with ?noguide or a direct drill link).
    active: () => !skip && nextStep(record, { setupDone: saved().setupDone === true }) !== 'done',
    // "Step 1 of 4" for the waiver screen.
    waiverLabel: () => stepLabel('waiver', { installStep: installStep() }),
    track,

    // Steps 2 to 4 and the finish, in `el` (a .screen). Resolves with 'start' or 'explore'.
    // onStart runs inside the Start tap (sound has to start from a tap).
    async run(el, { onStart = () => {} } = {}) {
      await null;   // after main.js has set everything up
      let step = nextStep(record, { setupDone: saved().setupDone === true });
      if (step === 'done') return 'explore';
      const s = saved();
      const pick = { sport: s.sportAsked ? s.sport : '', position: s.position ?? '', name: lastName?.get() ?? '' };
      let timer = null;

      return new Promise((resolve) => {
        const go = (id, { back = false } = {}) => {
          clearTimeout(timer);
          if (id === 'install' && !installStep()) {
            if (!back) track('install-skip');
            id = back ? 'yours' : 'finish';
          }
          step = id;
          save({ step: id });
          el.innerHTML = VIEWS[id](pick);
          if (id === 'ready') {
            track('ready');
            if (!back) timer = setTimeout(() => go('yours'), READY_MS);
          }
          if (id === 'install') install.embed(el.querySelector('.ob__install'), { onAdded: () => { track('install'); go('finish'); } });
          el.querySelector('[data-ob="next"], [data-ob="start"]')?.focus({ preventScroll: true });
        };
        const keepYours = () => {
          const typed = el.querySelector('#ob-name')?.value.trim() ?? '';
          if (typed) {
            const problem = nameProblem(typed);
            if (problem) { const h = el.querySelector('.lbn__hint'); h.className = 'lbn__hint is-bad'; h.textContent = problem; return false; }
            lastName?.set(cleanName(typed));
          }
          if (pick.sport) {
            updateSetting('sport', pick.sport);
            updateSetting('position', pick.position);
            updateSetting('sportAsked', true);
          }
          updateSetting('setupDone', true);
          return true;
        };
        const back = { yours: 'ready', install: 'yours', finish: 'install' };

        el.onchange = (e) => { if (e.target.dataset.pick === 'position') pick.position = e.target.value; };
        el.oninput = (e) => { if (e.target.id === 'ob-name') pick.name = e.target.value; };
        el.onclick = (e) => {
          const tile = e.target.closest('[data-sport]');
          if (tile) {
            pick.sport = tile.dataset.sport;
            pick.position = '';
            el.innerHTML = VIEWS.yours(pick);
            return;
          }
          const act = e.target.closest('[data-ob]')?.dataset.ob;
          if (!act) return;
          // One tap, one action: each step's buttons are read for that step only.
          const at = `${step}:${act}`;
          if (act === 'back') go(back[step], { back: true });
          else if (at === 'ready:next') go('yours');
          else if (at === 'yours:next') { if (keepYours()) { track('yours'); go('install'); } }
          else if (at === 'yours:skip') { updateSetting('setupDone', true); track('yours-skip'); go('install'); }
          else if (at === 'install:next') { install.markAdded(); track('install'); go('finish'); }
          else if (at === 'install:later') { install.markLater(); track('install-later'); go('finish'); }
          else if (at === 'finish:start' || at === 'finish:explore') {
            save({ step: 'done' });
            track(act);
            el.onclick = null;
            if (act === 'start') onStart();
            resolve(act);
          }
        };
        go(step);
      });
    },
  };
}
