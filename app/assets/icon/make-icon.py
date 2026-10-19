# Rock it app icon: the Zecky Z (same serif as Lock it and Pocket), gold on
# ink, inside a ring with three peers: the node and the network around it.
# Run from the app/ folder: python3 assets/icon/make-icon.py
import math

from PIL import Image, ImageDraw, ImageFont

S = 4096  # supersampled, reduced to each size
INK, GOLD = (0x14, 0x16, 0x1C), (0xD4, 0xA6, 0x57)
OUT = 'assets/icon/icon-1024.png'
SET = 'ios/RockIt/Images.xcassets/AppIcon.appiconset/'
SIZES = {'icon-20@2x.png': 40, 'icon-20@3x.png': 60, 'icon-29@2x.png': 58,
         'icon-29@3x.png': 87, 'icon-40@2x.png': 80, 'icon-40@3x.png': 120,
         'icon-60@2x.png': 120, 'icon-60@3x.png': 180, 'icon-1024@1x.png': 1024}

img = Image.new('RGB', (S, S), INK)
d = ImageDraw.Draw(img)
font = ImageFont.truetype('assets/fonts/Newsreader-Medium.ttf', int(S * 0.56))
l, t, r, b = d.textbbox((0, 0), 'Z', font=font)
d.text(((S - (r - l)) / 2 - l, (S - (b - t)) / 2 - t - S * 0.02), 'Z', font=font, fill=GOLD)

# The ring, a little heavier than it needs at full size so it still shows at
# 40 px, and three peers on it.
c, R, ring, dot = S / 2, S * 0.36, int(S * 0.018), S * 0.036
d.ellipse([c - R, c - R, c + R, c + R], outline=GOLD, width=ring)
for a in (-90, 30, 150):
    x = c + (R - ring / 2) * math.cos(math.radians(a))
    y = c + (R - ring / 2) * math.sin(math.radians(a))
    d.ellipse([x - dot, y - dot, x + dot, y + dot], fill=GOLD)

img.resize((1024, 1024), Image.LANCZOS).save(OUT)
for name, px in SIZES.items():
    img.resize((px, px), Image.LANCZOS).save(SET + name)
print('icons written')
