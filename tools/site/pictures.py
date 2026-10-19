"""Pictures for the website (site/assets/), from files already in the project.

  python3 tools/site/pictures.py [poster image]

- screens/*.webp: the app screenshots, from tools/screens/shots/shot-*__pm-dark.png
  (take them first: DPR=2 node tools/screens/cdp.mjs site-shots).
- poster.webp: the launch poster, with its bottom "Coming soon" strip cut off
  (the page has a live Buy button). Pass the poster's path the first time;
  later runs reuse site/assets/poster.webp.
"""
import os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
SHOTS = os.path.join(ROOT, 'tools', 'screens', 'shots')
OUT = os.path.join(ROOT, 'site', 'assets')
NAMES = ['home', 'focus', 'drill', 'breathe', 'move', 'done']

os.makedirs(os.path.join(OUT, 'screens'), exist_ok=True)
for n in NAMES:
    src = os.path.join(SHOTS, f'shot-{n}__pm-dark.png')
    Image.open(src).convert('RGB').save(os.path.join(OUT, 'screens', f'{n}.webp'), quality=80, method=6)

if len(sys.argv) > 1:
    poster = Image.open(sys.argv[1]).convert('RGB')
    w, h = poster.size
    keep = round(h * 0.755)   # the headline, the eye and the lime line; not the "Coming soon" lines
    poster.crop((0, 0, w, keep)).save(os.path.join(OUT, 'poster.webp'), quality=84, method=6)

for f in sorted(os.listdir(os.path.join(OUT, 'screens'))) + ['poster.webp']:
    p = os.path.join(OUT, 'screens', f) if f != 'poster.webp' else os.path.join(OUT, f)
    if os.path.exists(p):
        im = Image.open(p)
        print(f, im.size, f'{os.path.getsize(p) // 1024} KB')
