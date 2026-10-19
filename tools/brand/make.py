"""Builds every Sightrep logo file and picture from the two masters.

Masters (traced from the brand board, approved 2026-10-16), in sightline/assets/logo/:
  logo-icon.svg      the reticle + SR (lime #B7FF00 and white #FFFFFF paths)
  logo-wordmark.svg  SIGHTREP (lime and white paths), no tagline

To change the logo: replace those two files (same two colors), then run
  python3 tools/brand/make.py
from the repo root. It writes:
  sightline/assets/logo/  icon, wordmark, horizontal and stacked lockups, each
                          dark (as on the board), -light (black + deep lime #3F5C00),
                          -white and -black (one color); reticle (the browser tab icon,
                          no SR: unreadable that small) and reticle-light
  sightline/icons/        app icons 192 / 512 / maskable 512, Apple touch 180,
                          favicon SVG (reticle) + 32 / 16 px PNGs
  sightline/assets/share.png   the link-preview picture, 1200 x 630, with the tagline
  sightline/splash/       iPhone home-screen launch pictures (one per screen size)
With --share, only the link preview (assets/share.png).
With --store, only the Gumroad store pictures, into design/gumroad/ (not shipped):
  gumroad-cover.png       2560 x 1440, the product page's cover (Gumroad: horizontal, at least 1280 x 720)
  gumroad-thumbnail.png   1200 x 1200, the square thumbnail (Gumroad: at least 600 x 600)
Pictures are drawn by headless Chrome (nothing opens on screen).
"""
import json, os, re, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'sightline'))
LOGO = os.path.join(ROOT, 'assets', 'logo')
CHROME = os.environ.get('CHROME', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
LIME, WHITE, BLACK, DEEP_LIME = '#B7FF00', '#FFFFFF', '#050505', '#3F5C00'
# Backgrounds of the app icons, launch pictures and link preview: the palette's ink (css/palette.css),
# the same color as the app's dark theme and the manifest, so the icon, splash and app match.
INK = re.search(r'--p-ink-950:\s*(#[0-9A-Fa-f]{6})', open(os.path.join(ROOT, 'css', 'palette.css')).read()).group(1)
VARIANTS = {'': (LIME, WHITE), '-light': (DEEP_LIME, BLACK), '-white': (WHITE, WHITE), '-black': (BLACK, BLACK)}
TITLE = 'Sightrep logo'
BRAND = re.search(r"tagline: '([^']+)'", open(os.path.join(ROOT, 'js', 'brand.js')).read()).group(1)

# iPhone launch pictures: (pixels wide, high, pixel ratio). Points = pixels / ratio.
SPLASH = [(750, 1334, 2), (1242, 2208, 3), (828, 1792, 2), (1125, 2436, 3), (1170, 2532, 3), (1179, 2556, 3),
          (1206, 2622, 3), (1284, 2778, 3), (1290, 2796, 3), (1320, 2868, 3)]


def master(name):
    s = open(os.path.join(LOGO, f'{name}.svg')).read()
    w, h = map(float, re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', s).groups())
    paths = re.findall(r'<path fill="(#[0-9A-Fa-f]{6})" fill-rule="evenodd" d="([^"]+)"/>', s)
    return w, h, [(fill.upper(), d) for fill, d in paths]


def recolor(paths, lime, white):
    return [({LIME: lime, WHITE: white}[f], d) for f, d in paths]


def group(paths, x=0, y=0, k=1):
    body = ''.join(f'<path fill="{f}" fill-rule="evenodd" d="{d}"/>' for f, d in paths)
    return f'<g transform="translate({x:.2f} {y:.2f}) scale({k:.4f})">{body}</g>' if (x, y, k) != (0, 0, 1) else body


def svg(w, h, inner):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" role="img" aria-label="{TITLE}">'
            f'<title>{TITLE}</title>{inner}</svg>\n')


def reticle(paths, w, h):
    """The icon without the S and R (they sit in the middle; the ring and crosshair marks don't)."""
    keep = []
    for fill, d in paths:
        segs = []
        for seg in re.findall(r'M[^M]*Z', d):
            pts = [tuple(map(float, p.split(','))) for p in re.findall(r'-?[\d.]+,-?[\d.]+', seg)]
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            mx, my = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
            central = abs(mx - w / 2) < w * 0.18 and abs(my - h / 2) < h * 0.18 and max(xs) - min(xs) < w * 0.6
            if not central:
                segs.append(seg)
        keep.append((fill, ''.join(segs)))
    return keep


def write(name, text):
    open(os.path.join(LOGO, name), 'w').write(text)


def logos():
    iw, ih, icon = master('logo-icon')
    ww, wh, word = master('logo-wordmark')
    small = reticle(icon, iw, ih)
    # Horizontal: icon, a thin divider (as on the board), wordmark centered on the icon.
    gap1, gap2, div_w, div_h = 0.10 * iw, 0.16 * iw, 0.012 * iw, 0.62 * ih
    hx_div = iw + gap1
    hx_word = hx_div + div_w + gap2
    hw, hh = hx_word + ww, ih
    # Stacked: icon above the wordmark (wordmark about twice as wide as the icon).
    sk = (2.1 * iw) / ww
    sw, sgap = ww * sk, 0.09 * ih
    sh = ih + sgap + wh * sk
    for suffix, (lime, white) in VARIANTS.items():
        write(f'logo-icon{suffix}.svg', svg(iw, ih, group(recolor(icon, lime, white))))
        write(f'logo-wordmark{suffix}.svg', svg(ww, wh, group(recolor(word, lime, white))))
        divider = f'<rect x="{hx_div:.2f}" y="{(ih - div_h) / 2:.2f}" width="{div_w:.2f}" height="{div_h:.2f}" fill="{white}"/>'
        write(f'logo-horizontal{suffix}.svg', svg(hw, hh, group(recolor(icon, lime, white)) + divider
                                                  + group(recolor(word, lime, white), hx_word, (ih - wh) / 2)))
        write(f'logo-stacked{suffix}.svg', svg(sw, sh, group(recolor(icon, lime, white), (sw - iw) / 2, 0)
                                               + group(recolor(word, lime, white), 0, ih + sgap, sk)))
    write('logo-reticle.svg', svg(iw, ih, group(small)))
    write('logo-reticle-light.svg', svg(iw, ih, group(recolor(small, DEEP_LIME, BLACK))))
    # The browser tab icon: the reticle on a dark rounded square (shows on light and dark tab bars).
    pad = 0.12
    side = max(iw, ih) * (1 + 2 * pad)
    fav = (f'<rect width="{side:.2f}" height="{side:.2f}" rx="{side * 0.22:.2f}" fill="{BLACK}"/>'
           + group(small, (side - iw) / 2, (side - ih) / 2))
    open(os.path.join(ROOT, 'icons', 'icon.svg'), 'w').write(svg(side, side, fav))
    return (iw, ih), (hw, hh), (sw, sh)


def shoot(html, w, h, out, transparent=False):
    """Renders html at exactly w x h CSS pixels into out (PNG), with headless Chrome.
    (Chrome won't draw a window under about 500 px, so small pictures go through square().)"""
    with tempfile.TemporaryDirectory() as tmp:
        page = os.path.join(tmp, 'page.html')
        open(page, 'w').write(html)
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={tmp}/profile',
                        '--allow-file-access-from-files', '--force-device-scale-factor=1', f'--window-size={w},{h}',
                        *(['--default-background-color=00000000'] if transparent else []),
                        '--virtual-time-budget=5000',   # time for images and the web font to load
                        f'--screenshot={out}', f'file://{page}'], check=True, capture_output=True)


def square(img_src, size, share, out, bg=INK):
    """A square picture: the image centered at `share` of the width, drawn at 1024 px and scaled down."""
    from PIL import Image
    big = out + '.big.png'
    shoot(page(f'<img src="{img_src}" width="{1024 * share:.1f}">', bg=bg), 1024, 1024, big, transparent=bg == 'transparent')
    im = Image.open(big)
    im = im.convert('RGBA' if bg == 'transparent' else 'RGB').resize((size, size), Image.LANCZOS)
    im.save(out, optimize=True)
    os.remove(big)


def page(body, bg=INK, extra=''):
    return (f'<!doctype html><html><head><meta charset="utf-8">{extra}<style>html,body{{margin:0;height:100%;background:{bg};}}'
            f'body{{display:flex;flex-direction:column;align-items:center;justify-content:center;}}img{{display:block}}</style></head>'
            f'<body>{body}</body></html>')


def pictures(sizes):
    (iw, ih), (hw, hh), (sw, sh) = sizes
    src = lambda name: f'file://{os.path.join(LOGO, name)}'
    icons = os.path.join(ROOT, 'icons')
    # App icons: the full icon on the brand ink. Maskable keeps it inside the safe circle (phones crop the edges).
    for name, size, part in [('icon-192.png', 192, 0.78), ('icon-512.png', 512, 0.78), ('apple-touch-icon.png', 180, 0.76),
                             ('icon-maskable-512.png', 512, 0.62)]:
        square(src('logo-icon.svg'), size, part, os.path.join(icons, name))
    for name, size in [('favicon-32.png', 32), ('favicon-16.png', 16)]:
        square(f'file://{os.path.join(icons, "icon.svg")}', size, 1.0, os.path.join(icons, name), bg='transparent')
    share()
    # iPhone launch pictures: the stacked logo, centered on the brand ink.
    os.makedirs(os.path.join(ROOT, 'splash'), exist_ok=True)
    for w, h, r in SPLASH:
        shoot(page(f'<img src="{src("logo-stacked.svg")}" width="{w * 0.46:.0f}">'), w, h, os.path.join(ROOT, 'splash', f'launch-{w}x{h}.png'))
    json.dump([{'file': f'splash/launch-{w}x{h}.png', 'width': w // r, 'height': h // r, 'ratio': r} for w, h, r in SPLASH],
              open(os.path.join(ROOT, 'splash', 'sizes.json'), 'w'), indent=1)


def share():
    """The link preview (1200 x 630): the horizontal logo and the tagline, in the app's type (Barlow Condensed)."""
    src = lambda name: f'file://{os.path.join(LOGO, name)}'
    font = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" '
            'href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@800&display=block">')
    shoot(page(f'<img src="{src("logo-horizontal.svg")}" width="760"><p style="margin:44px 0 0;color:#F5F6F0;'
               f'font:800 64px \'Barlow Condensed\',\'Arial Narrow\',sans-serif;text-transform:uppercase;letter-spacing:0.01em">{BRAND}</p>', extra=font),
          1200, 630, os.path.join(ROOT, 'assets', 'share.png'))


def store(out_dir=os.path.join(ROOT, '..', 'design', 'gumroad')):
    """The Gumroad store pictures: a wide cover (logo, tagline, one line on what it is) and a square thumbnail (the icon)."""
    from PIL import Image
    os.makedirs(out_dir, exist_ok=True)
    src = lambda name: f'file://{os.path.join(LOGO, name)}'
    font = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" '
            'href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@800&family=Barlow:wght@500&display=block">')
    cover = os.path.join(out_dir, 'gumroad-cover.png')
    shoot(page(f'<img src="{src("logo-horizontal.svg")}" width="1560">'
               f'<p style="margin:88px 0 0;color:#F5F6F0;font:800 136px \'Barlow Condensed\',\'Arial Narrow\',sans-serif;text-transform:uppercase;letter-spacing:0.01em">{BRAND}</p>'
               f'<p style="margin:30px 0 0;color:#A2A895;font:500 56px \'Barlow\',system-ui,sans-serif">Pre-game focus and reaction warm-up for athletes</p>',
               extra=font), 2560, 1440, cover)
    thumb = os.path.join(out_dir, 'gumroad-thumbnail.png')
    shoot(page(f'<img src="{src("logo-icon.svg")}" width="780">'), 1200, 1200, thumb)
    for f in (cover, thumb):
        Image.open(f).convert('RGB').save(f, dpi=(72, 72), optimize=True)
    return cover, thumb


if __name__ == '__main__':
    if '--store' in sys.argv:
        print('done:', store())
        sys.exit(0)
    if '--share' in sys.argv:   # just the link preview (after a tagline change)
        share()
        print('done: assets/share.png')
        sys.exit(0)
    sizes = logos()
    if '--svg-only' not in sys.argv:
        pictures(sizes)
    print('done:', sizes)
