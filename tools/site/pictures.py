"""Pictures for the website (site/assets/), from files already in the project.

  python3 tools/site/pictures.py [poster image]

- screens/*.webp: the app screenshots, from tools/screens/shots/shot-*__pm-dark.png
  (take them first: DPR=2 node tools/screens/cdp.mjs site-shots).
- install/*.webp: the app's install steps for /install, from the install set
  (DPR=2 node tools/screens/cdp.mjs install).
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

INSTALL = {'iphone': 'install-iphone__pm-dark', 'android': 'install-android__pm-dark'}

# Each picture from its screenshot, when that screenshot has been taken (otherwise the last one stays).
os.makedirs(os.path.join(OUT, 'screens'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'install'), exist_ok=True)
for folder, names in (('screens', {n: f'shot-{n}__pm-dark' for n in NAMES}), ('install', INSTALL)):
    for n, shot in names.items():
        src = os.path.join(SHOTS, f'{shot}.png')
        if os.path.exists(src):
            Image.open(src).convert('RGB').save(os.path.join(OUT, folder, f'{n}.webp'), quality=80, method=6)
        else:
            print('kept the last', f'{folder}/{n}.webp', '(no', shot + ')')

if len(sys.argv) > 1:
    poster = Image.open(sys.argv[1]).convert('RGB')
    w, h = poster.size
    keep = round(h * 0.755)   # the headline, the eye and the lime line; not the "Coming soon" lines
    poster.crop((0, 0, w, keep)).save(os.path.join(OUT, 'poster.webp'), quality=84, method=6)

for f in [f'screens/{x}' for x in sorted(os.listdir(os.path.join(OUT, 'screens')))] + [f'install/{x}' for x in sorted(os.listdir(os.path.join(OUT, 'install')))] + ['poster.webp']:
    p = os.path.join(OUT, f)
    if os.path.exists(p):
        im = Image.open(p)
        print(f, im.size, f'{os.path.getsize(p) // 1024} KB')
