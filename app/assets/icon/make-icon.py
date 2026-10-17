# Rock it app icon: the Zecky Z (same mark as Lock it) in copper on ink.
# Run from the app/ folder: python3 assets/icon/make-icon.py
from PIL import Image, ImageDraw, ImageFont

S = 4096  # supersampled, reduced to 1024
INK, COPPER = (0x14, 0x16, 0x1C), (0xC8, 0x7A, 0x4F)
OUT = 'assets/icon/icon-1024.png'
SET = 'ios/RockIt/Images.xcassets/AppIcon.appiconset/'
SIZES = {'icon-20@2x.png': 40, 'icon-20@3x.png': 60, 'icon-29@2x.png': 58,
         'icon-29@3x.png': 87, 'icon-40@2x.png': 80, 'icon-40@3x.png': 120,
         'icon-60@2x.png': 120, 'icon-60@3x.png': 180, 'icon-1024@1x.png': 1024}

img = Image.new('RGB', (S, S), INK)
d = ImageDraw.Draw(img)
font = ImageFont.truetype('assets/fonts/Newsreader-Medium.ttf', int(S * 0.74))
l, t, r, b = d.textbbox((0, 0), 'Z', font=font)
x = (S - (r - l)) / 2 - l
y = (S - (b - t)) / 2 - t - S * 0.035
d.text((x, y), 'Z', font=font, fill=COPPER)
# A short rule under the letter: the "ground line" the brand moves along.
w, h = S * 0.20, S * 0.014
cy = y + b + S * 0.075
d.rounded_rectangle([(S - w) / 2, cy, (S + w) / 2, cy + h], radius=h / 2, fill=COPPER)

img.resize((1024, 1024), Image.LANCZOS).save(OUT)
for name, px in SIZES.items():
    img.resize((px, px), Image.LANCZOS).save(SET + name)
print('icons written')
