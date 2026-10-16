// The brand in one place. Change the tagline here and the home screen follows
// (the marketing site will read it too). index.html and manifest.webmanifest
// can't read JavaScript, so they repeat the name and tagline for link previews
// and the home-screen icon; tests/brand.js fails if they ever disagree.

export const BRAND = {
  name: 'Sightrep',
  tagline: 'Reps for your eyes.',
};

// Where the app lives now, and its old address. Opened at an old address, home
// shows "Sightrep has a new home" (index.html #moved) so installed copies move over.
export const APP_URL = 'https://app.sightrep.app/';
export const OLD_HOSTS = ['sightline-psi.vercel.app'];
export const movedFrom = (host) => OLD_HOSTS.includes(String(host ?? '').toLowerCase());

// The logo, in one place. Files live in assets/logo/ (built from two masters by
// tools/brand/make.py, so swapping the logo is one change there). Each logo is
// two images: the dark-background version and the light one (black + deep
// lime); the theme shows the right one (styles.css .on-dark / .on-light;
// outdoor uses the light one). The splash in index.html uses the same files.
//   kind: 'icon' (reticle + SR) | 'horizontal' (icon + wordmark) | 'stacked'
export const LOGO_DIR = 'assets/logo';
export const LOGO_SIZE = { icon: [277, 253], horizontal: [1139, 253], stacked: [582, 340] };   // the files' shapes
export function logo(kind = 'icon', { cls = '' } = {}) {
  const [w, h] = LOGO_SIZE[kind];
  const img = (suffix, side) => `<img class="logo logo--${kind} ${side}${cls ? ` ${cls}` : ''}" src="${LOGO_DIR}/logo-${kind}${suffix}.svg" alt="${BRAND.name} logo" width="${w}" height="${h}">`;
  return img('', 'on-dark') + img('-light', 'on-light');
}
// Fills every <… data-logo="kind" data-logo-class="…"> on the page (home, About).
export function hydrateLogos(root = document) {
  root.querySelectorAll('[data-logo]').forEach((el) => { el.innerHTML = logo(el.dataset.logo, { cls: el.dataset.logoClass ?? '' }); });
}
