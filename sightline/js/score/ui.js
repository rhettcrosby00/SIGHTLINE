// Leaderboard screens: name entry the first time (score counting up), then
// the reveal (new all-time total and rank change); after that, scores save on
// their own under the remembered name and the result shows on the summary
// ("Not you?" changes the name). The board itself (Focus or Move, All-time or
// This week) and the coach tools. Arcade spirit through motion and ranking,
// in the app's own design system.

import { submitScore, getLeaderboard, getNames, lastName, flushQueue, coach } from './board.js';
import { cleanName, nameKey, nameProblem, similarNames } from './names.js';
import { icon } from '../lib/icons.js';
import { buzz } from '../lib/audio.js';
import { esc } from '../lib/text.js';
import { logo } from '../brand.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString('en-US');
const SIDE = { focus: ['eye', 'Focus'], move: ['move', 'Move'] };
const TABS = [['total', 'All-time'], ['week', 'This week']];
const offline = () => globalThis.navigator?.onLine === false;
const RETRY_MS = 2 * 60 * 1000;   // a busy board: post the saved score again after this
const sideTag = (side) => `<p class="side-tag">${icon(SIDE[side][0], { size: 18 })}${SIDE[side][1]}</p>`;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Count a number up (ease-out, ~0.9 s). Instant with Reduce Motion.
function countUp(el, from, to, ms = 900) {
  if (reduced() || from === to) { el.textContent = fmt(to); return Promise.resolve(); }
  return new Promise((done) => {
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      el.textContent = fmt(Math.round(from + (to - from) * (1 - (1 - p) ** 3)));
      if (p < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
}

// show(name, {back}); getSettings() for the name style (name or initials).
export function initLeaderboard({ show, getSettings }) {
  const nameEl = $('lb-name');
  const boardEl = $('lb-board');
  const coachEl = $('lb-coach');
  const view = { side: 'focus', tab: 'total', from: 'start' };
  const cache = new Map();   // last board per side/tab, shown instantly while refreshing
  let token = null;          // coach tools unlocked for 30 minutes

  // Scores saved while offline post when the connection comes back.
  flushQueue();
  window.addEventListener('online', () => flushQueue());

  // ---- After a session --------------------------------------------------------
  // Name known: save straight away and show the result in `slot` on the
  // summary (no extra taps). First time: the name screen, which resolves when
  // the athlete taps Continue (or Skip).
  function afterSession(entry, { slot = null } = {}) {
    const name = lastName.get();
    if (slot) slot.innerHTML = '';
    if (!name || !slot) return nameScreen(entry);
    inline(slot, entry, name);
    return Promise.resolve();
  }

  async function inline(slot, { side, score, settings }, name) {
    slot.innerHTML = `<p class="lb-inline__line">${icon('trophy')}<span>Saving <b>+${fmt(score)}</b> as <b>${esc(name)}</b></span></p>`;
    const res = await submitScore({ name, side, score, settings });
    const change = `<button type="button" class="link-btn" data-act="rename">Not you?</button>`;
    if (res.queued || res.error) {
      slot.innerHTML = `<p class="lb-inline__line">${icon(res.busy ? 'trophy' : res.queued ? 'wifi-off' : 'triangle-alert')}<span>${
        res.busy ? `The board is busy: <b>+${fmt(score)}</b> is saved on this phone and posts in a couple of minutes.`
          : res.queued ? `Offline: <b>+${fmt(score)}</b> is saved on this phone and posts when you’re back online.` : esc(res.error)}</span></p>`;
      if (res.busy) setTimeout(() => flushQueue(), RETRY_MS);
      return;
    }
    const moved = res.prevRank != null && res.prevRank > res.rank ? ` · up ${res.prevRank - res.rank}` : '';
    slot.innerHTML = `<p class="lb-inline__line">${icon('trophy')}<span><b>+${fmt(score)}</b> for <b>${esc(res.name)}</b> · #${res.rank} on the ${SIDE[side][1]} board${moved}${res.newBest ? ' · <b>New best</b>' : ''}</span>${change}</p>`;
    buzz(res.newBest ? [80, 60, 160] : 40);   // shown on screen too
    slot.onclick = (e) => { if (e.target.closest('[data-act="rename"]')) rename(); };
  }

  // "Not you?": a new name for next time (this score stays where it was saved).
  function rename() {
    const style = getSettings().nameStyle === 'initials' ? 'initials' : 'name';
    const back = document.querySelector('.screen.is-active')?.id.replace('screen-', '') ?? 'start';
    $('screen-name').dataset.side = 'focus';
    nameEl.innerHTML = `
      <div class="lbn">
        <h2 class="nav__title">Change your name</h2>
        <p class="setting__hint">Scores from now on go to this name.</p>
        <label class="setting__label" for="lb-rename">${style === 'initials' ? 'Your initials' : 'Your name'}</label>
        <input id="lb-rename" class="lbn__input" type="text" maxlength="${style === 'initials' ? 3 : 12}" autocomplete="off" autocorrect="off"
          spellcheck="false" enterkeyhint="done" autocapitalize="${style === 'initials' ? 'characters' : 'words'}" value="">
        <p class="lbn__hint" aria-live="polite"></p>
      </div>
      <div class="screen__foot">
        <button type="button" class="btn btn--primary btn--block" data-act="save">Save</button>
        <button type="button" class="btn btn--secondary btn--block" data-act="cancel">Cancel</button>
      </div>`;
    const input = nameEl.querySelector('input');
    const hint = nameEl.querySelector('.lbn__hint');
    show('name');
    nameEl.onclick = (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel') { nameEl.onclick = null; show(back, { back: true }); }
      if (act !== 'save') return;
      const problem = nameProblem(input.value, style);
      if (problem) { hint.className = 'lbn__hint is-bad'; hint.textContent = problem; input.focus(); return; }
      lastName.set(cleanName(input.value, style));
      nameEl.onclick = null;
      document.querySelectorAll('[data-act="rename"]').forEach((b) => b.remove());
      show(back, { back: true });
    };
  }

  // First time on this phone: name entry, then the reveal.
  function nameScreen({ side, score, detail, settings }) {
    return new Promise((finish) => {
      const style = getSettings().nameStyle === 'initials' ? 'initials' : 'name';
      let names = [];
      getNames().then((n) => { names = n; suggest(); });
      $('screen-name').dataset.side = side;

      nameEl.innerHTML = `
        <div class="lbn">
          ${sideTag(side)}
          <p class="lbn__label">Session score</p>
          <p class="lbn__score">0</p>
          <p class="lbn__detail">${detail}</p>
          <label class="setting__label" for="lb-name-input">${style === 'initials' ? 'Your initials' : 'Your name'}</label>
          <input id="lb-name-input" class="lbn__input" type="text" maxlength="${style === 'initials' ? 3 : 12}"
            autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done"
            autocapitalize="${style === 'initials' ? 'characters' : 'words'}" value="${esc(cleanName(lastName.get(), style))}">
          <div class="lbn__suggest" aria-label="Names already on the board"></div>
          <p class="lbn__hint" aria-live="polite"></p>
          <p class="caption">Your name and score will be visible on the leaderboard.</p>
        </div>
        <div class="screen__foot">
          <button type="button" class="btn btn--primary btn--block" data-act="save">Save score</button>
          <button type="button" class="btn btn--secondary btn--block" data-act="skip">Skip</button>
        </div>`;
      const input = nameEl.querySelector('.lbn__input');
      const hint = nameEl.querySelector('.lbn__hint');
      const box = nameEl.querySelector('.lbn__suggest');
      show('name');
      countUp(nameEl.querySelector('.lbn__score'), 0, score);

      // Matching names to pick from, so "Jordn" doesn't become a new player.
      function suggest() {
        const typed = input.value;
        const same = names.find((n) => nameKey(n) === nameKey(typed));
        box.innerHTML = (typed ? similarNames(typed, names, 3) : names.slice(0, 3))
          .map((n) => `<button type="button" class="chip" data-name="${esc(n)}">${esc(n)}</button>`).join('');
        hint.className = 'lbn__hint';
        hint.textContent = same ? `Adds to ${same}’s total.` : typed.trim() ? 'New on the board.' : '';
      }
      input.addEventListener('input', () => {
        if (style === 'initials') input.value = cleanName(input.value, 'initials');
        suggest();
      });
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-name]');
        if (!b) return;
        input.value = cleanName(b.dataset.name, style);
        suggest();
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

      async function save() {
        const problem = nameProblem(input.value, style);
        if (problem) { hint.className = 'lbn__hint is-bad'; hint.textContent = problem; input.focus(); return; }
        const name = cleanName(input.value, style);
        nameEl.querySelectorAll('[data-act]').forEach((b) => { b.disabled = true; });
        nameEl.querySelector('[data-act="save"]').textContent = 'Saving';
        lastName.set(name);
        reveal(await submitScore({ name, side, score, settings }));
      }

      async function reveal(res) {
        const foot = `
          <div class="screen__foot">
            <div class="cdone__row">
              <button type="button" class="btn btn--secondary" data-act="board">${icon('trophy')}Board</button>
              <button type="button" class="btn btn--primary" data-act="continue">Continue</button>
            </div>
          </div>`;
        if (res.queued || res.error) {
          nameEl.innerHTML = `
            <div class="lbn">
              ${sideTag(side)}
              <p class="lbn__score">${fmt(score)}</p>
              <p class="notice">${icon(res.queued ? 'download' : 'triangle-alert')}${res.busy
                ? 'The board is busy. Saved on this phone; it posts in a couple of minutes.'
                : res.queued ? 'Saved on this phone. It’ll post to the leaderboard when you’re back online.' : esc(res.error)}</p>
            </div>${foot}`;
          if (res.busy) setTimeout(() => flushQueue(), RETRY_MS);
          return;
        }
        const moved = res.prevRank == null ? 'New on the board'
          : res.prevRank > res.rank ? `${icon('arrow-up', { size: 18 })}${res.prevRank - res.rank} spot${res.prevRank - res.rank > 1 ? 's' : ''}`
            : 'Holding your spot';
        nameEl.innerHTML = `
          <div class="lbn lbr">
            ${sideTag(side)}
            <h2 class="lbr__name">${esc(res.name)}</h2>
            <p class="lbr__add">+${fmt(score)}</p>
            <p class="lbn__label">All-time total</p>
            <p class="lbr__total">${fmt(res.prevTotal)}</p>
            <p class="lbr__rank" hidden><span class="lbr__pos">#${res.rank}</span> on the ${SIDE[side][1]} board
              <span class="lbr__move${res.prevRank != null && res.prevRank > res.rank ? ' is-up' : ''}">${moved}</span></p>
            ${res.newBest ? '<p class="lbr__best" hidden>New best</p>' : ''}
          </div>${foot}`;
        await countUp(nameEl.querySelector('.lbr__total'), res.prevTotal, res.total, 1100);
        nameEl.querySelectorAll('[hidden]').forEach((n) => { n.hidden = false; });
        buzz(res.newBest ? [80, 60, 160] : 40);   // a new best gets the long buzz (shown on screen too)
      }

      nameEl.onclick = (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'save') save();
        else if (act === 'skip' || act === 'continue') { nameEl.onclick = null; finish(); }
        else if (act === 'board') openBoard('name', { side });
      };
      suggest();
    });
  }

  // ---- The board -------------------------------------------------------------
  function openBoard(from = 'start', { side } = {}) {
    view.from = from;
    if (side) view.side = side;
    renderBoard();
    show('board');
  }

  function rowHtml(r, me) {
    return `<li class="lb-row${r.rank <= 3 ? ` lb-row--${r.rank}` : ''}${me ? ' is-me' : ''}">
      <span class="lb-row__rank">${r.rank}</span>
      <span class="lb-row__name">${esc(r.name)}<small>${r.sessions} session${r.sessions === 1 ? '' : 's'}</small></span>
      <span class="lb-row__score">${fmt(r.score)}</span>
    </li>`;
  }

  async function renderBoard() {
    if (!SIDE[view.side]) view.side = 'focus';
    if (!TABS.some(([v]) => v === view.tab)) view.tab = 'total';
    const { side, tab } = view;
    const key = `${side}:${tab}`;
    const backTo = { start: 'Home', name: 'Back', done: 'Back', 'cone-done': 'Back' }[view.from] ?? 'Back';
    $('screen-board').dataset.side = side;
    boardEl.innerHTML = `
      <header class="nav lb-nav">
        <button type="button" class="nav__back" data-act="back">${icon('chevron-left', { size: 22 })}${backTo}</button>
        ${logo('icon', { cls: 'lb-title__logo' })}
        <h2 class="nav__title">Leaderboard</h2>
      </header>
      <div class="seg seg--fill" role="radiogroup" aria-label="Side">
        ${Object.entries(SIDE).map(([v, [, t]]) =>
          `<button type="button" role="radio" data-side="${v}" aria-checked="${v === side}">${t}</button>`).join('')}
      </div>
      <div class="seg seg--fill" role="radiogroup" aria-label="Board">
        ${TABS.map(([v, t]) => `<button type="button" role="radio" data-tab="${v}" aria-checked="${v === tab}">${t}</button>`).join('')}
      </div>
      <p class="lb-offline" ${offline() ? '' : 'hidden'}>${icon('wifi-off')}Offline. Showing the last board this phone saw; new scores post when you’re back online.</p>
      <p class="caption lb-note">${{ total: 'Total of every session.', week: 'Since Monday. Resets every week; all-time never does.' }[tab]}
        ${side === 'move' ? ' Move scores are honor system.' : ''}</p>
      <div class="lb-body" aria-live="polite">${cache.has(key) ? listHtml(cache.get(key)) : '<p class="lb-empty">Loading the board</p>'}</div>
      <button type="button" class="link-btn lb-coach" data-act="coach">${icon('settings-2')}Coach tools</button>`;
    try {
      const data = await getLeaderboard({ side, tab, name: lastName.get() });
      cache.set(key, data);
      if (view.side === side && view.tab === tab) boardEl.querySelector('.lb-body').innerHTML = listHtml(data);
    } catch (err) {
      if (err.offline) boardEl.querySelector('.lb-offline').hidden = false;
      if (!cache.has(key)) {
        boardEl.querySelector('.lb-body').innerHTML = `<p class="lb-empty">${err.offline
          ? 'Can’t reach the leaderboard. Check your connection.' : esc(err.message)}</p>`;
      }
    }
  }

  function listHtml(data) {
    if (!data.rows.length) return '<p class="lb-empty">No scores yet. Finish a session and enter your name.</p>';
    const mine = nameKey(lastName.get());
    return `<ol class="lb-list">${data.rows.map((r) => rowHtml(r, mine && nameKey(r.name) === mine)).join('')}</ol>
      ${data.me ? `<ol class="lb-list lb-list--me">${rowHtml(data.me, true)}</ol>` : ''}`;
  }

  boardEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.side) { view.side = b.dataset.side; renderBoard(); }
    else if (b.dataset.tab) { view.tab = b.dataset.tab; renderBoard(); }
    else if (b.dataset.act === 'back') show(view.from, { back: true });
    else if (b.dataset.act === 'coach') { renderCoach(); show('coach'); }
  });

  // ---- Coach tools (PIN) ------------------------------------------------------
  const coachState = { players: [], player: '', panel: '', msg: '', bad: false, scores: [], reviews: { pending: [], approved: [] } };

  async function renderCoach() {
    const s = coachState;
    const head = `
      <header class="nav">
        <button type="button" class="nav__back" data-act="back">${icon('chevron-left', { size: 22 })}Leaderboard</button>
        <h2 class="nav__title">Coach tools</h2>
      </header>`;
    const status = `<p class="lbn__hint${s.bad ? ' is-bad' : ''}" aria-live="polite">${esc(s.msg)}</p>`;
    if (!token) {
      coachEl.innerHTML = `${head}
        <section class="group"><div class="group__rows">
          <div class="setting setting--stack">
            <label class="setting__label" for="lb-pin">Coach PIN</label>
            <input id="lb-pin" class="lbn__input" type="password" inputmode="numeric" autocomplete="off" maxlength="12">
          </div>
        </div></section>
        ${status}
        <div class="screen__foot"><button type="button" class="btn btn--primary btn--block" data-act="unlock">Unlock</button></div>`;
      return;
    }
    const confirmRow = (panel, label, phrase, act) => `
      <div class="setting setting--stack">
        <span class="setting__label">${label}</span>
        <p class="setting__hint">Type <b>${phrase}</b> to confirm.</p>
        <input class="lbn__input" data-confirm-for="${panel}" autocomplete="off" autocapitalize="characters" spellcheck="false">
        <button type="button" class="btn btn--secondary btn--block" data-act="${act}">${label}</button>
      </div>`;
    // Website reviews (sightrep.app): each waits here until approved.
    const review = (r, buttons) => `
      <li class="lb-review">
        <span class="lb-review__stars" role="img" aria-label="${r.stars} of 5 stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span>
        <p class="lb-review__text">${esc(r.text)}</p>
        <p class="setting__hint">${esc(r.name)} · ${esc(r.sport)} · ${new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
        ${r.connected ? '<p class="lb-review__tag">Got it free or knows the team</p>' : ''}
        <div class="lb-review__acts">${buttons}</div>
        <button type="button" class="link-btn" data-act="review-connected" data-id="${r.id}" data-on="${r.connected ? '' : '1'}">${r.connected ? 'Take off the “Got it free” label' : 'Add the “Got it free” label'}</button>
      </li>`;
    const { pending, approved } = s.reviews;
    coachEl.innerHTML = `${head}
      <section class="group"><h3 class="group__title">Website reviews</h3><div class="group__rows">
        <div class="setting setting--stack">
          <span class="setting__label">Waiting for you (${pending.length})</span>
          <p class="setting__hint">Approve every honest review, good or bad. Reject only spam, abuse, or reviews not about Sightrep.</p>
          <p class="setting__hint">If a reviewer got Sightrep free or knows you (like a teammate) and didn’t tick the box, add the “Got it free” label.</p>
          ${pending.length ? `<ul class="lb-reviews">${pending.map((r) => review(r, `
            <button type="button" class="btn btn--secondary" data-act="review-approve" data-id="${r.id}">Approve</button>
            <button type="button" class="btn btn--secondary" data-act="review-reject" data-id="${r.id}">Reject</button>`)).join('')}</ul>`
            : '<p class="setting__hint">Nothing waiting.</p>'}
        </div>
        <div class="setting setting--stack">
          <span class="setting__label">On the website (${approved.length})</span>
          ${approved.length ? `<ul class="lb-reviews">${approved.map((r) => review(r, `
            <button type="button" class="link-btn" data-act="review-remove" data-id="${r.id}">Remove</button>`)).join('')}</ul>`
            : '<p class="setting__hint">None yet.</p>'}
        </div>
      </div></section>
      <section class="group"><h3 class="group__title">Player</h3><div class="group__rows">
        <div class="setting setting--stack">
          <label class="setting__label" for="lb-player">Name</label>
          <select id="lb-player" class="lb-select">
            <option value="">Pick a player</option>
            ${s.players.map((n) => `<option${n === s.player ? ' selected' : ''}>${esc(n)}</option>`).join('')}
          </select>
        </div>
        ${s.player ? `
        <div class="setting setting--stack">
          <label class="setting__label" for="lb-rename">Rename, or merge into another name</label>
          <input id="lb-rename" class="lbn__input" maxlength="12" autocomplete="off" value="${esc(s.player)}">
          <button type="button" class="btn btn--secondary btn--block" data-act="rename">Save name</button>
        </div>
        ${confirmRow('remove', 'Remove player', 'REMOVE', 'remove-name')}
        <div class="setting setting--stack">
          <span class="setting__label">Scores</span>
          ${s.scores.length ? `<ul class="lb-scores">${s.scores.map((x) => `
            <li><span>${new Date(x.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${x.side === 'focus' ? 'Focus' : 'Move'}</span>
              <b>${fmt(x.score)}</b><button type="button" class="link-btn" data-act="remove-score" data-id="${x.id}">Remove</button></li>`).join('')}</ul>`
            : '<p class="setting__hint">No scores.</p>'}
        </div>` : ''}
      </div></section>
      <section class="group"><h3 class="group__title">Keys</h3><div class="group__rows">
        <div class="setting setting--stack">
          <label class="setting__label" for="lb-key">Free a key for a new phone</label>
          <p class="setting__hint">For a lost or reset phone. The key then unlocks the next phone it’s entered on.</p>
          <input id="lb-key" class="lbn__input" autocomplete="off" autocapitalize="characters" spellcheck="false">
          <button type="button" class="btn btn--secondary btn--block" data-act="reset-key">Free this key</button>
        </div>
      </div></section>
      <section class="group"><h3 class="group__title">Boards</h3><div class="group__rows">
        ${confirmRow('week', 'Reset this week', 'RESET WEEK', 'reset-week')}
        ${confirmRow('all', 'Reset everything', 'RESET ALL', 'reset-all')}
      </div></section>
      ${status}`;
  }

  async function coachDo(task, data, done) {
    try {
      await coach.run(token, task, data);
      cache.clear();
      coachState.msg = done;
      coachState.bad = false;
    } catch (err) {
      if (err.status === 401) token = null;
      coachState.msg = err.message;
      coachState.bad = true;
    }
    await loadPlayers();
    renderCoach();
  }

  async function loadPlayers() {
    coachState.players = await getNames();
    if (!coachState.players.includes(coachState.player)) coachState.player = '';
    coachState.scores = coachState.player && token ? (await coach.run(token, 'scores', { name: coachState.player }).catch(() => ({ scores: [] }))).scores : [];
    if (token) coachState.reviews = await coach.run(token, 'reviews').catch(() => coachState.reviews);
  }

  coachEl.addEventListener('change', async (e) => {
    if (e.target.id !== 'lb-player') return;
    coachState.player = e.target.value;
    coachState.msg = '';
    await loadPlayers();
    renderCoach();
  });

  coachEl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const s = coachState;
    const typed = (panel) => coachEl.querySelector(`[data-confirm-for="${panel}"]`)?.value.trim().toUpperCase() ?? '';
    if (b.dataset.act === 'back') { renderBoard(); show('board', { back: true }); return; }
    if (b.dataset.act === 'unlock') {
      try {
        token = (await coach.unlock(coachEl.querySelector('#lb-pin').value)).token;
        s.msg = '';
        await loadPlayers();
      } catch (err) {
        s.msg = err.message;
        s.bad = true;
      }
      renderCoach();
      return;
    }
    if (b.dataset.act === 'rename') {
      const to = coachEl.querySelector('#lb-rename').value;
      await coachDo('rename', { name: s.player, to }, `Saved as ${cleanName(to)}.`);
      s.player = cleanName(to);
      await loadPlayers();
      renderCoach();
    }
    if (b.dataset.act === 'remove-name') {
      if (typed('remove') !== 'REMOVE') { s.msg = 'Type REMOVE to confirm.'; s.bad = true; renderCoach(); return; }
      await coachDo('remove-name', { name: s.player }, 'Player removed.');
    }
    if (b.dataset.act === 'remove-score') await coachDo('remove-score', { name: s.player, id: Number(b.dataset.id) }, 'Score removed.');
    if (b.dataset.act === 'reset-week') await coachDo('reset-week', { confirm: typed('week') }, 'This week’s board is reset.');
    if (b.dataset.act === 'reset-all') await coachDo('reset-all', { confirm: typed('all') }, 'Every score is removed.');
    if (b.dataset.act === 'review-approve') await coachDo('review-approve', { id: Number(b.dataset.id) }, 'Approved. It’s on the website now.');
    if (b.dataset.act === 'review-reject') await coachDo('review-reject', { id: Number(b.dataset.id) }, 'Rejected. It won’t show.');
    if (b.dataset.act === 'review-connected') {
      const on = b.dataset.on === '1';
      await coachDo('review-connected', { id: Number(b.dataset.id), on }, on ? 'Label added. The review now says “Got it free or knows the team.”' : 'Label taken off.');
    }
    if (b.dataset.act === 'review-remove') await coachDo('review-remove', { id: Number(b.dataset.id) }, 'Removed from the website.');
    if (b.dataset.act === 'reset-key') {
      await coachDo('reset-key', { key: coachEl.querySelector('#lb-key').value }, 'That key is free. It unlocks the next phone it’s entered on.');
    }
  });

  return { afterSession, openBoard };
}
