# usage: sheet.py <name> [scale] -> sheets/<name>.png : SE light/dark/outdoor, then Pro Max
import sys, os
from PIL import Image, ImageDraw
name = sys.argv[1]; scale = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
here = os.path.dirname(os.path.abspath(__file__))
order = [f'{s}-{t}' for s in ('se', 'pm') for t in ('light', 'dark', 'outdoor', 'auto-dark')]
ims = [(o, Image.open(f'{here}/shots/{name}__{o}.png')) for o in order if os.path.exists(f'{here}/shots/{name}__{o}.png')]
gap = 12; W = sum(i.width for _, i in ims) + gap * (len(ims) - 1); H = max(i.height for _, i in ims) + 22
sheet = Image.new('RGB', (W, H), (90, 90, 90)); d = ImageDraw.Draw(sheet); x = 0
for o, im in ims:
    sheet.paste(im, (x, 22)); d.text((x + 4, 4), o, fill=(255, 255, 255)); x += im.width + gap
os.makedirs(f'{here}/sheets', exist_ok=True)
sheet.resize((int(W * scale), int(H * scale)), Image.LANCZOS).save(f'{here}/sheets/{name}.png')
print(f'{here}/sheets/{name}.png')
