// The website's one script. On the home page it shows the approved reviews;
// on /review it sends a new one. Reviews live on the app's server
// (app.sightrep.app/api/reviews) and each waits for the owner's approval.
// Everything from the server goes in as text (textContent), never as HTML.
(() => {
  // Where the reviews API is: the local test server, the matching app preview
  // (same branch name), or the live app.
  const host = location.hostname;
  const API = host === 'localhost' || host === '127.0.0.1' ? '/api/reviews'
    : /^[a-z0-9-]+\.sightrep-site\.pages\.dev$/.test(host) ? `https://${host.split('.')[0]}.sightrep.pages.dev/api/reviews`
    : 'https://app.sightrep.app/api/reviews';
  const SHOWN = 6;   // cards before "Show more"

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const stars = (n, label) => {
    const e = el('span', 'stars', '★'.repeat(n) + '☆'.repeat(5 - n));
    e.setAttribute('role', 'img');
    e.setAttribute('aria-label', label ?? `${n} out of 5 stars`);
    return e;
  };

  // ---- Home page: "What athletes say" ----
  async function showReviews(section) {
    const list = section.querySelector('[data-reviews-list]');
    const status = section.querySelector('[data-reviews-status]');
    const avg = section.querySelector('[data-reviews-avg]');
    const more = section.querySelector('[data-reviews-more]');
    try {
      const res = await fetch(`${API}?action=list`);
      if (!res.ok) throw new Error(String(res.status));
      const { reviews, count, average } = await res.json();
      if (!reviews.length) { status.textContent = 'No reviews yet. Used Sightrep? Be the first.'; return; }
      status.hidden = true;
      if (count >= 3 && average) {
        avg.append(el('b', null, average.toFixed(1)), stars(Math.round(average), `Average ${average.toFixed(1)} out of 5 stars`), el('span', null, `from ${count} reviews`));
        avg.hidden = false;
      }
      reviews.forEach((r, i) => {
        const li = el('li', 'review');
        li.append(stars(r.stars), el('blockquote', null, `“${r.text}”`), el('p', 'review__who', `${r.name} · ${r.sport}`));
        li.hidden = i >= SHOWN;
        list.append(li);
      });
      if (reviews.length > SHOWN) {
        more.hidden = false;
        more.addEventListener('click', () => {
          list.querySelectorAll('.review[hidden]').forEach((li) => { li.hidden = false; });
          more.hidden = true;
        });
      }
    } catch {
      status.textContent = 'Reviews didn’t load. Try again in a moment.';
    }
  }

  // ---- /review: the form ----
  function setUpForm(form) {
    const f = form.elements;
    const msg = form.querySelector('[data-review-msg]');
    const count = form.querySelector('[data-review-count]');
    const send = form.querySelector('button[type="submit"]');
    const done = document.querySelector('[data-review-done]');
    const picker = form.querySelector('.rform__stars');
    const paint = () => {
      const v = Number(f.namedItem('stars').value || 0);
      picker.querySelectorAll('label').forEach((l, i) => l.classList.toggle('is-on', i < v));
    };
    const say = (text, bad = true) => { msg.textContent = text; msg.classList.toggle('is-bad', bad); };
    picker.addEventListener('change', paint);
    f.namedItem('text').addEventListener('input', (e) => { count.textContent = `${e.target.value.length} / 400`; });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        action: 'submit',
        stars: Number(f.namedItem('stars').value || 0),
        name: f.namedItem('name').value.trim(),
        sport: f.namedItem('sport').value.trim(),
        text: f.namedItem('text').value.trim(),
        consent: f.namedItem('consent').checked,
        age: f.namedItem('age').checked,
        website: f.namedItem('website').value,   // the hidden spam trap; people leave it empty
      };
      const problem = !body.stars ? 'Pick 1 to 5 stars.'
        : !body.name ? 'Add your first name.'
        : !body.sport ? 'Add your sport or position.'
        : body.text.length < 10 ? 'Write a sentence or two.'
        : !body.consent ? 'Tick the box to let us show your review.'
        : !body.age ? 'Tick the box about your age or permission.' : '';
      if (problem) { say(problem); return; }
      send.disabled = true;
      say('Sending…', false);
      try {
        const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error || 'Couldn’t send. Try again.');
        form.hidden = true;
        done.hidden = false;
        done.querySelector('h2').focus();
      } catch (err) {
        say(err instanceof TypeError ? 'Couldn’t send. Check your connection and try again.' : err.message);
      } finally {
        send.disabled = false;
      }
    });
  }

  const section = document.querySelector('[data-reviews]');
  if (section) showReviews(section);
  const form = document.querySelector('[data-review-form]');
  if (form) setUpForm(form);
})();
