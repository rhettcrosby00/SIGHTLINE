# usage: movie.py <shots/…frames dir> <out.webp|out.gif> [width] -> an animated picture of a recorded
# shot (cdp.mjs, `record: true`): each frame shown as long as the page actually stayed that way
# (long waits trimmed to 2.5 s), scaled to `width` pixels wide.
import json, os, sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 390
times = json.load(open(os.path.join(src, 'times.json')))
files = sorted(f for f in os.listdir(src) if f.endswith('.jpg'))
ims, durs = [], []
for i, f in enumerate(files):
    im = Image.open(os.path.join(src, f)).convert('RGB')
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    d = (times[i + 1] - times[i]) * 1000 if i + 1 < len(times) else 1500
    ims.append(im); durs.append(int(min(max(d, 40), 2500)))
ims[0].save(out, save_all=True, append_images=ims[1:], duration=durs, loop=0, **({'quality': 70} if out.endswith('.webp') else {}))
print(out, len(ims), 'frames', f'{sum(durs) / 1000:.1f} s')
