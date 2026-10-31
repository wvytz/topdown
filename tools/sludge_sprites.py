"""
Generator szlamu Króla Szlamu (krok 153, `#krol-szlamu`): flegma w locie, rozbryzg przy uderzeniu, kałuże szlamu
na podłodze i bąble. Poziom detalu jak ogień z kroku 144: pasmowe cieniowanie ze światłem z lewej-góry, fiolet
przechodzi w brąz ditheringiem Bayera 4×4 (STYLEGUIDE §4.5 i §5 — szlam to substancja amorficzna), połysk
pojedynczymi pikselami, ciemny obrys najciemniejszym tonem fioletu.

Użycie (z katalogu głównego repozytorium):
  python tools/sludge_sprites.py                       # arkusze do public/assets/sprites/
  python tools/sludge_sprites.py --preview tools/out   # dodatkowo podgląd 4x na posadzce ruin

sludge-phlegm.png (96x24, komórka 24): flegma w locie, 4 klatki w pętli — kluska szlamu faluje (zgniot i rozciąg),
  ciągną się za nią dwie nitki śluzu z kroplami.
sludge-splash-N.png (N = 32, 64, 96, 112; 8 klatek N×N): rozbryzg w 8 klatkach bez pętli — 0 zgnieciona kluska,
  1–2 korona szlamu i krople wyrzucone do brzegu, 3–4 krople opadają, warstwa rozlewa się do brzegu strefy,
  5–7 cienka błona pęka i znika (kałużę rysuje osobny arkusz). Gra wybiera arkusz i całkowitą skalę po promieniu.
sludge-puddle-R.png (R = promień kałuży w px: 14, 30, 44, 56; komórka 2R+8): 11 klatek — 0–5 rośnie od połowy
  do pełnego promienia (rysunek = strefa spowolnienia), 6–8 bąble i połysk w pętli, 9–10 zasycha (brąz, skorupa).
  Rysunek nigdy nie wychodzi poza promień — dokładny zasięg spowolnienia.
sludge-bubble.png (72x12, komórka 12): bąbel na szlamie — 0–2 wzbiera, 3 pęka, 4–5 kropelki i ślad.
"""
import argparse
import math
import os
import random
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import Img, hx

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')

# STYLEGUIDE §4.5 (Sludge King): fiolet i brąz (deep → hl), połysk liliowy tylko pojedynczymi pikselami.
PURPLE = tuple(hx(h) for h in ('#1f1420', '#3b2140', '#5c3560', '#83558a', '#b88ab8'))
BROWN = tuple(hx(h) for h in ('#1e1510', '#3a271c', '#5a3e2a', '#7e5b3e', '#b08a64'))
GLINT = hx('#e6cfe6')
RUINS_FLOOR = hx('#9a8a72')  # tło podglądu (paleta C „jasny piaskowiec”)

# Promienie kałuż — muszą zgadzać się z `SLUDGE_PUDDLE_RADII` w src/config/sludgeConfig.ts.
PUDDLE_RADII = (14, 30, 44, 56)
# Kałuża rośnie od tej części promienia (`puddle.startScale` w src/config/bossConfig.ts).
PUDDLE_START = 0.5

BAYER = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))


def bayer(x, y):
    return (BAYER[y % 4][x % 4] + .5) / 16


def hash01(*a):
    """Stały „szum” 0..1 z liczb całkowitych — ten sam wynik przy każdym uruchomieniu."""
    h = 2166136261
    for v in a:
        h = ((h ^ (int(v) & 0xffffffff)) * 16777619) & 0xffffffff
    h ^= h >> 13
    h = (h * 0x5bd1e995) & 0xffffffff
    return ((h ^ (h >> 15)) % 10007) / 10007


def noise(x, y, scale, seed):
    gx, gy = x / scale, y / scale
    x0, y0 = math.floor(gx), math.floor(gy)
    tx, ty = gx - x0, gy - y0
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    v00, v10 = hash01(x0, y0, seed), hash01(x0 + 1, y0, seed)
    v01, v11 = hash01(x0, y0 + 1, seed), hash01(x0 + 1, y0 + 1, seed)
    return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty


def rim_noise(angle, seed, lobes=6.0):
    """Szum po obwodzie (0..1) — nieregularny, ale zamknięty brzeg plamy."""
    return noise(math.cos(angle) * lobes + 9, math.sin(angle) * lobes + 9, 2.0, seed)


def slime_tone(x, y, shade, brown_mix):
    """
    Kolor szlamu: `shade` 0..1 (ciemny → jasny, pasmowo), `brown_mix` 0..1 — ile brązu (fiolet u góry, brąz u dołu),
    przejście ditheringiem Bayera.
    """
    idx = max(0, min(4, int(shade * 5)))
    use_brown = brown_mix > bayer(x, y)
    return (BROWN if use_brown else PURPLE)[idx]


def outline(img, color):
    edge = []
    for y in range(img.h):
        for x in range(img.w):
            if img.p[y][x][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = img.get(x + dx, y + dy)
                if n and n[3] and n != color:
                    edge.append((x, y))
                    break
    for x, y in edge:
        img.put(x, y, color)


def shaded_blob(img, cx, cy, rx, ry, seed, brown_from=.35, lumpy=.12):
    """Kluska szlamu: elipsa z nierównym brzegiem, światło z lewej-góry, brąz od dołu."""
    for y in range(img.h):
        for x in range(img.w):
            dx, dy = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            ang = math.atan2(dy, dx)
            reach = 1 - lumpy + lumpy * rim_noise(ang, seed)
            d = math.hypot(dx, dy)
            if d > reach:
                continue
            # Oświetlenie: kierunek do światła (-0.7, -0.7); pasma zamiast gradientu.
            light = (-dx * .7 - dy * .7) / max(.01, reach)
            shade = .45 + .45 * light - .25 * (d / reach) ** 3
            shade += (noise(x, y, 3, seed) - .5) * .18
            brown = (dy - brown_from) / .9
            img.put(x, y, slime_tone(x, y, max(.05, min(.79, shade)), brown))
    # Połysk: krótkie pasmo i pojedynczy piksel na lewej-górze.
    hx_, hy = int(cx - rx * .42), int(cy - ry * .48)
    img.put(hx_, hy, GLINT)
    img.put(hx_ + 1, hy, PURPLE[4])
    img.put(hx_, hy + 1, PURPLE[4])


# ---------------- flegma w locie ----------------

PHLEGM = 24
PHLEGM_FRAMES = (
    dict(rx=6.5, ry=5.6, sway=0),
    dict(rx=7.2, ry=5.0, sway=1),
    dict(rx=6.2, ry=6.2, sway=0),
    dict(rx=5.7, ry=6.6, sway=-1),
)


def phlegm_frame(f):
    img = Img(PHLEGM, PHLEGM)
    k = PHLEGM_FRAMES[f]
    cx, cy = 12, 10
    # Nitki śluzu z kroplami (pod kluską, kołyszą się) — rysowane przed kluską, kluska je przykrywa.
    for j, (ox, length) in enumerate(((-3, 3 + f % 2), (2, 2 + (f + 1) % 3))):
        x0 = cx + ox
        for i in range(length):
            t = i / max(1, length - 1)
            x = int(round(x0 + k['sway'] * t * t * (1 if j == 0 else -1)))
            img.put(x, int(cy + 3 + i), PURPLE[2] if i < length - 2 else PURPLE[1])
        tip_x = int(round(x0 + k['sway'] * (1 if j == 0 else -1)))
        tip_y = int(cy + 3 + length)
        for ddx, ddy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            img.put(tip_x + ddx, tip_y + ddy, PURPLE[3] if (ddx, ddy) == (0, 0) else PURPLE[2])
    blob = Img(PHLEGM, PHLEGM)
    shaded_blob(blob, cx, cy, k['rx'], k['ry'], 40 + f)
    # Bąbel w środku kluski.
    bx, by = cx + 2 - f % 2, cy + 1
    blob.put(bx, by, PURPLE[1])
    blob.put(bx + 1, by, PURPLE[3])
    img.blit(blob, 0, 0)
    outline(img, PURPLE[0])
    return img


# ---------------- rozbryzg ----------------

# Klatki rozbryzgu: promień warstwy (ułamek połowy komórki), grubość korony, odległość kropel, ile kropel,
# dziurawienie błony (0..1), jasność (0..1).
SPLASH = (
    dict(r=.42, crown=.00, drop=.00, drops=0, tatter=.00, light=1.00),
    dict(r=.66, crown=.30, drop=.72, drops=10, tatter=.00, light=.90),
    dict(r=.84, crown=.24, drop=.92, drops=12, tatter=.02, light=.80),
    dict(r=.95, crown=.16, drop=.98, drops=10, tatter=.08, light=.65),
    dict(r=.98, crown=.10, drop=.98, drops=8, tatter=.20, light=.52),
    dict(r=.98, crown=.06, drop=.98, drops=6, tatter=.40, light=.42),
    dict(r=.96, crown=.03, drop=.98, drops=4, tatter=.62, light=.34),
    dict(r=.94, crown=.00, drop=.98, drops=2, tatter=.82, light=.28),
)


def splash_frame(size):
    def gen(f):
        img = Img(size, size)
        k = SPLASH[f]
        c = size / 2
        R = (c - 1) * k['r']
        sc = max(2.0, size / 10)
        for y in range(size):
            for x in range(size):
                dx, dy = x + .5 - c, y + .5 - c
                d = math.hypot(dx, dy)
                ang = math.atan2(dy, dx)
                # Brzeg nierówny tylko do środka — rysunek nie wychodzi poza strefę uderzenia.
                reach = R * (.86 + .14 * rim_noise(ang, 70 + f // 2, 7))
                if d > reach:
                    continue
                t = d / max(1, reach)
                n = noise(x, y, sc, 90 + f)
                if t < .9 and n < k['tatter'] * (.5 + .8 * t):
                    continue
                crown = k['crown'] > 0 and t > 1 - k['crown']
                light = (-dx * .7 - dy * .7) / max(1, reach)
                if f == 0:
                    # Zgnieciona kluska: wypukła, jasna, z połyskiem.
                    shade = .5 + .4 * light - .2 * t ** 2
                elif crown:
                    # Korona: wał szlamu na brzegu, jaśniejszy od strony światła.
                    shade = .58 + .3 * light + (n - .5) * .2
                else:
                    # Warstwa w środku: płaska, ciemniejsza, z żyłkami jaśniejszego śluzu.
                    vein = abs(noise(x, y, sc * .8, 120 + f) - .5) < .05
                    shade = .28 + (.2 if vein else 0) + (n - .5) * .16
                shade *= .55 + .45 * k['light']
                img.put(x, y, slime_tone(x, y, max(.05, min(.85, shade)), (dy / max(1, R) - .1) * 1.2))
        # Krople wyrzucone z korony: lecą ku brzegowi i opadają (w późnych klatkach leżą jako plamki).
        rng = random.Random(500 + size)
        drops = [(rng.uniform(0, math.tau), rng.uniform(.75, 1.0), rng.choice((1, 1, 2))) for _ in range(12)]
        for i, (a, reach, s) in enumerate(drops[:k['drops']]):
            d = (c - 2 - s) * min(k['drop'] * reach, .98)
            x, y = int(c + math.cos(a) * d), int(c + math.sin(a) * d)
            for ddx in range(s):
                for ddy in range(s):
                    img.put(x + ddx, y + ddy, PURPLE[3] if f < 4 else PURPLE[2])
            if s == 2 and f < 4:
                img.put(x, y, PURPLE[4])
        # Połysk na zgniecionej klusce i na koronie.
        if f <= 2:
            gx, gy = int(c - R * .45), int(c - R * .5)
            img.put(gx, gy, GLINT)
            img.put(gx + 1, gy, PURPLE[4])
        outline(img, PURPLE[0])
        return img
    return gen


# ---------------- kałuże ----------------

def puddle_cell(radius):
    return 2 * radius + 8


def puddle_frame(radius):
    cell = puddle_cell(radius)

    def gen(f):
        img = Img(cell, cell)
        c = cell / 2
        grow = min(5, f)
        r = radius * (PUDDLE_START + (1 - PUDDLE_START) * grow / 5)
        wither = max(0, f - 8)  # 0, 1, 2
        shimmer = f - 6 if 6 <= f <= 8 else 0
        seed = radius * 7
        sc = max(2.5, radius / 5)
        for y in range(cell):
            for x in range(cell):
                dx, dy = x + .5 - c, y + .5 - c
                d = math.hypot(dx, dy)
                ang = math.atan2(dy, dx)
                reach = r * (.84 + .16 * rim_noise(ang, seed, 5 + radius / 12))
                if d > reach - .5:
                    continue
                t = d / reach
                n = noise(x, y, sc, seed + 3)
                # Zasychanie: od brzegu robi się brąz i skorupa, w środku dziury aż do podłogi.
                if wither and t > .5 and n < .14 * wither * t:
                    continue
                if t > .9:
                    shade = .22  # ciemny wał na brzegu
                elif t > .8:
                    shade = .36
                else:
                    shade = .48 + (n - .5) * .3
                    # Żyłki jaśniejszego śluzu przesuwają się w pętli połysku.
                    vein = abs(noise(x + shimmer * 2, y, sc * 1.6, seed + 11) - .5) < .028
                    if vein:
                        shade = .66
                brown = (t - .72) * 2.6 + (dy / max(1, r)) * .3 + wither * .45
                img.put(x, y, slime_tone(x, y, max(.05, min(.79, shade)), brown))
        # Połysk: łuk liliowy na lewej-górze środka (pasmo 1–2 px), na zasychającej kałuży słabszy.
        if not wither:
            arc_r = r * .5
            for i in range(-3, 4):
                a = math.radians(225 + i * 9 + shimmer * 4)
                x, y = int(c + math.cos(a) * arc_r), int(c + math.sin(a) * arc_r)
                img.put(x, y, PURPLE[4] if abs(i) < 3 else PURPLE[3])
            img.put(int(c - arc_r * .6), int(c - arc_r * .75), GLINT)
        # Bąble: na większych kałużach kilka, w pętli wzbierają w innych miejscach.
        rng = random.Random(radius * 31 + shimmer)
        bubbles = 0 if r < 10 else 1 + int(r // 14)
        for _ in range(bubbles):
            a = rng.uniform(0, math.tau)
            dd = rng.uniform(0, r * .6)
            bx, by = int(c + math.cos(a) * dd), int(c + math.sin(a) * dd)
            if wither:
                img.put(bx, by, BROWN[1])
                continue
            size = 1 + (rng.random() < .5)
            for ddx in range(-size, size + 1):
                for ddy in range(-size, size + 1):
                    if abs(ddx) + abs(ddy) == size:
                        img.put(bx + ddx, by + ddy, PURPLE[3])
            img.put(bx - 1, by - 1, PURPLE[4])
        # Obrys najciemniejszym fioletem (do środka — brzeg kałuży zostaje w promieniu).
        edge = []
        for y in range(cell):
            for x in range(cell):
                if not img.p[y][x][3]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nb = img.get(x + dx, y + dy)
                    if nb is None or not nb[3]:
                        edge.append((x, y))
                        break
        for x, y in edge:
            img.put(x, y, BROWN[0] if wither == 2 else PURPLE[0])
        return img
    return gen


# ---------------- bąbel ----------------

BUBBLE = 12
# Rozmiary arkuszy rozbryzgu — muszą zgadzać się z `SLUDGE_FX.splashSizes` (gra składa z nich średnicę strefy).
SPLASH_SIZES = (32, 64, 96, 112)


def bubble_frame(f):
    img = Img(BUBBLE, BUBBLE)
    c = 6
    if f <= 2:
        r = (2, 3, 4)[f]
        for y in range(BUBBLE):
            for x in range(BUBBLE):
                dx, dy = x + .5 - c, y + .5 - (c + 1 - f * .5)
                d = math.hypot(dx, dy * 1.15)
                if d > r:
                    continue
                shade = .55 + .3 * (-dx - dy) / r if d > r - 1.2 else .38
                img.put(x, y, slime_tone(x, y, max(.05, min(.79, shade)), 0))
        img.put(int(c - r * .4), int(c - r * .5 + 1 - f * .5), GLINT if f == 2 else PURPLE[4])
        outline(img, PURPLE[0])
    elif f == 3:
        # Pęknięcie: postrzępiony pierścień.
        for i in range(10):
            a = i / 10 * math.tau
            x, y = int(c + math.cos(a) * 4), int(c + math.sin(a) * 3.4)
            img.put(x, y, PURPLE[3] if i % 3 else PURPLE[4])
        img.put(c, c, PURPLE[2])
    else:
        # Kropelki odlatują i opadają, został ciemniejszy ślad.
        spread = 5 if f == 4 else 6
        for i, a in enumerate((200, 250, 300, 340, 20)):
            x = int(c + math.cos(math.radians(a)) * spread)
            y = int(c + math.sin(math.radians(a)) * spread * .7 + (f - 4) * 2)
            img.put(x, y, PURPLE[3] if f == 4 else PURPLE[2])
        img.put(c - 1, c + 1, PURPLE[1])
        img.put(c, c + 1, PURPLE[1])
    return img


def strip(w, h, fn, cols):
    sheet = Img(w * cols, h)
    frames = []
    for col in range(cols):
        img = fn(col)
        sheet.blit(img, col * w, 0)
        frames.append((f'c{col}', img))
    return sheet, frames


def build():
    sheets = {'sludge-phlegm.png': strip(PHLEGM, PHLEGM, phlegm_frame, 4)}
    for size in SPLASH_SIZES:
        sheets[f'sludge-splash-{size}.png'] = strip(size, size, splash_frame(size), 8)
    for radius in PUDDLE_RADII:
        cell = puddle_cell(radius)
        sheets[f'sludge-puddle-{radius}.png'] = strip(cell, cell, puddle_frame(radius), 11)
    sheets['sludge-bubble.png'] = strip(BUBBLE, BUBBLE, bubble_frame, 6)
    return sheets


def validate(sheets):
    errors = []
    for fname, (_, frames) in sheets.items():
        for name, img in frames:
            opaque = [c for row in img.p for c in row if c[3]]
            if not opaque:
                errors.append(f'{fname} {name}: pusta klatka')
            if any(c[3] != 255 for c in opaque):
                errors.append(f'{fname} {name}: półprzezroczyste piksele')
            if any(c[:3] in ((0, 0, 0), (255, 255, 255)) for c in opaque):
                errors.append(f'{fname} {name}: czysta czerń/biel')
        # Kałuża: żaden piksel poza promieniem (rysunek = zasięg spowolnienia).
        if fname.startswith('sludge-puddle-'):
            radius = int(fname[len('sludge-puddle-'):-4])
            for name, img in frames:
                c = img.w / 2
                for y in range(img.h):
                    for x in range(img.w):
                        if img.p[y][x][3] and math.hypot(x + .5 - c, y + .5 - c) > radius + .01:
                            errors.append(f'{fname} {name}: piksel ({x},{y}) poza promieniem {radius}')
                            break
    return errors


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator szlamu Króla Szlamu: flegma, rozbryzg, kałuże, bąble')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 4x')
    a = ap.parse_args()
    sheets = build()
    errors = validate(sheets)
    if errors:
        for e in errors[:30]:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    for fname, (sheet, frames) in sheets.items():
        sheet.pil().save(os.path.join(a.out, fname))
        print(f'zapisano {fname} {sheet.w}x{sheet.h}: {len(frames)} klatek')
        if a.preview:
            from PIL import Image
            os.makedirs(a.preview, exist_ok=True)
            im = sheet.pil()
            bg = Image.new('RGBA', im.size, RUINS_FLOOR)
            bg.alpha_composite(im)
            bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(
                os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
