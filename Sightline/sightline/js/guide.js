// "How Sightline works": three short panels shown on first launch and from
// the start screen's "How it works" link. Only a seen-flag is stored.

const SEEN_KEY = 'sightline.guideSeen.v1';

const PANELS = [
  {
    title: 'Your pre-game warm-up',
    body: `
      <ol class="guide__blocks">
        <li><b>Settle</b><span>Breathe with the circle to calm down and focus.</span></li>
        <li><b>Eyes</b><span>Follow a moving dot. Snap your eyes to targets.</span></li>
        <li><b>Reaction</b><span>React to colors as fast as you can.</span></li>
        <li><b>Brain</b><span>Quick math and quick questions.</span></li>
        <li><b>Lock In</b><span>Energizing breaths. Finish ready to compete.</span></li>
      </ol>`,
  },
  {
    title: 'Two ways to play',
    body: `
      <div class="guide__modes">
        <div><b>TAP</b><p>Hold your phone and tap the answer buttons. Every tap is timed.</p></div>
        <div><b>CONES</b><p>Set 4 colored cones around you and stand the phone up 10–15 ft away. Run to the cone the screen shows.</p></div>
      </div>`,
  },
  {
    title: 'Every drill teaches you first',
    body: `
      <p>Before each drill you’ll see the rule, a quick example, and a short practice. Then it’s for real.</p>
      <p>At the end you’ll see your <b>accuracy</b> (how many you got right) and <b>reaction time</b> in seconds — lower is faster.</p>
      <p class="guide__muted">Nothing is saved. It’s a warm-up, not a medical test.</p>`,
  },
];

export function guideSeen() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}

export function showGuide() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
  const overlay = document.createElement('div');
  overlay.className = 'guide';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'How Sightline works');
  document.body.appendChild(overlay);

  let i = 0;
  const close = () => overlay.remove();
  const render = () => {
    const p = PANELS[i];
    const last = i === PANELS.length - 1;
    overlay.innerHTML = `
      <div class="guide__card">
        <p class="guide__step">${i + 1} of ${PANELS.length}</p>
        <h2 class="guide__title">${p.title}</h2>
        <div class="guide__body">${p.body}</div>
        <div class="guide__nav">
          <button type="button" class="btn-ghost guide__skip">${last ? 'Back' : 'Skip'}</button>
          <button type="button" class="btn-big guide__next">${last ? 'LET’S GO' : 'NEXT'}</button>
        </div>
      </div>`;
    overlay.querySelector('.guide__next').onclick = () => (last ? close() : (i++, render()));
    overlay.querySelector('.guide__skip').onclick = () => (last ? (i--, render()) : close());
    overlay.querySelector('.guide__next').focus();
  };
  render();
}
