"""
Generator ognia (krok 144, `#ogien`): wspólne efekty płomieni dla wybuchów, ataku bocianów Brudnej Wiedźmy
i płonących plam. Ogień świeci, więc bez ciemnego obrysu (jak płomień pochodni); dym ma własny, ciemny brzeg.

Użycie (z katalogu głównego repozytorium):
  python tools/fire_sprites.py                       # arkusze do public/assets/sprites/
  python tools/fire_sprites.py --preview tools/out   # dodatkowo podgląd 4x na ciemnej posadzce

fire-burst-32.png (256x32, komórka 32) i fire-burst-64.png (512x64, komórka 64): kula ognia w 8 klatkach bez pętli —
  0 biały błysk, 1–2 kula ognia z językami, 3–4 kłęby unoszą się i ciemnieją, 5–7 dym z żarem rozwiewa się.
  Gra wybiera arkusz i całkowitą skalę po promieniu strefy (pełne piksele).
fire-flame.png (128x24, komórka 16x24): płomień na podłodze — 0–1 zapłon, 2–5 płonie (pętla), 6–7 gaśnie.
  Podstawa płomienia w wierszu 21 (gra ustawia go stopą w punkcie podłogi).
"""
import argparse
import math
import os
import random
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import Img, ok

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')

# Rampa ognia od żaru do blasku (OKLCH; bez czystej bieli — STYLEGUIDE).
FIRE = (ok(.34, .130, 25), ok(.48, .190, 30), ok(.63, .200, 42), ok(.76, .170, 62), ok(.87, .140, 88), ok(.95, .060, 100))
SMOKE = (ok(.20, .012, 20), ok(.27, .014, 30), ok(.35, .014, 45), ok(.43, .012, 55))
EMBER = (FIRE[3], FIRE[4])
DARK_FLOOR = ok(.24, .020, 60)  # tło podglądu


def hash01(*a):
    """Stały „szum” 0..1 z liczb całkowitych — ten sam wynik przy każdym uruchomieniu."""
    h = 2166136261
    for v in a:
        h = ((h ^ (int(v) & 0xffffffff)) * 16777619) & 0xffffffff
    h ^= h >> 13
    h = (h * 0x5bd1e995) & 0xffffffff
    return ((h ^ (h >> 15)) % 10007) / 10007


def noise(x, y, scale, seed):
    """Szum wartości z interpolacją (gładkie, nieregularne brzegi kłębów)."""
    gx, gy = x / scale, y / scale
    x0, y0 = math.floor(gx), math.floor(gy)
    tx, ty = gx - x0, gy - y0
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    v00, v10 = hash01(x0, y0, seed), hash01(x0 + 1, y0, seed)
    v01, v11 = hash01(x0, y0 + 1, seed), hash01(x0 + 1, y0 + 1, seed)
    return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty


# Kolejne klatki kuli: promień kuli (ułamek komórki/2), uniesienie środka (ułamek), temperatura jądra (0..1),
# udział dymu (0..1), ile rozpada się na strzępy (0..1), liczba żarzących się drobin.
BURST = (
    dict(r=.50, lift=.00, heat=1.00, smoke=.00, tatter=.00, embers=0),
    dict(r=.86, lift=.02, heat=.90, smoke=.00, tatter=.05, embers=4),
    dict(r=.98, lift=.06, heat=.70, smoke=.05, tatter=.12, embers=8),
    dict(r=.94, lift=.12, heat=.50, smoke=.25, tatter=.22, embers=10),
    dict(r=.88, lift=.18, heat=.32, smoke=.50, tatter=.34, embers=10),
    dict(r=.82, lift=.24, heat=.18, smoke=.75, tatter=.48, embers=8),
    dict(r=.76, lift=.30, heat=.08, smoke=.90, tatter=.62, embers=6),
    dict(r=.70, lift=.36, heat=.00, smoke=1.00, tatter=.78, embers=4),
)


def burst_frame(size):
    def gen(f):
        img = Img(size, size)
        k = BURST[f]
        c = size / 2
        R = c * k['r'] - 1
        cy = c - size * k['lift'] * .5
        sc = max(2.0, size / 8)
        for y in range(size):
            for x in range(size):
                dx, dy = x + .5 - c, y + .5 - cy
                # Kłęby: promień zależy od kąta (szum po obwodzie), u góry dłuższe języki ognia.
                ang = math.atan2(dy, dx)
                rim = noise(math.cos(ang) * 6 + 7, math.sin(ang) * 6 + 7, 2.2, 31 + f // 2)
                up = max(0.0, -dy / max(1, R))
                reach = R * (.72 + .38 * rim + .18 * up * (k['heat'] > .3))
                d = math.hypot(dx, dy)
                if d > reach:
                    continue
                t = d / max(1, reach)
                n = noise(x, y - f * size * .06, sc, 7 + f)
                # Strzępy: w późnych klatkach kłąb się rozpada (dziury od brzegu).
                # Temperatura punktu: najgorętsze jądro, chłodniejszy brzeg, szum zaburza pasma.
                heat = k['heat'] * (1.15 - t) + (n - .5) * .35
                if t > .45 and heat < .6 and n < k['tatter'] * (.55 + .7 * t):
                    continue
                smoke = k['smoke'] * (.6 + .6 * t) + (n - .5) * .4
                if smoke > .55 and heat < .55:
                    img.put(x, y, SMOKE[min(3, max(0, int((1 - t) * 2.4 + n * 1.6)))])
                    continue
                idx = int(max(0.0, min(.999, heat)) * len(FIRE))
                img.put(x, y, FIRE[idx])
        # Ciemny brzeg dymu (tylko na dymie — ogień świeci bez obrysu).
        edge = []
        for y in range(size):
            for x in range(size):
                if img.p[y][x][3] == 0:
                    for ddx, ddy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        n_ = img.get(x + ddx, y + ddy)
                        if n_ and n_[3] and n_ in SMOKE[1:]:
                            edge.append((x, y))
                            break
        for x, y in edge:
            img.put(x, y, SMOKE[0])
        # Żarzące się drobiny wylatują z kuli ku górze i na boki.
        r = random.Random(1000 + f * 17 + size)
        for i in range(k['embers'] * size // 32):
            a = r.uniform(-math.pi, 0) if r.random() < .75 else r.uniform(0, math.pi)
            d = R * (.7 + .25 * f / 7 + r.random() * .25)
            x, y = int(c + math.cos(a) * d), int(cy + math.sin(a) * d)
            if 1 <= x < size - 1 and 1 <= y < size - 1:
                img.put(x, y, EMBER[i % 2])
        return img
    return gen


FLAME_W, FLAME_H, FLAME_BASE = 16, 24, 21
# Płomień: wysokość, szerokość podstawy, wychył czubka, czy ma jasne jądro.
FLAME = (
    dict(h=5, w=3.0, sway=0, core=True),
    dict(h=11, w=4.5, sway=1, core=True),
    dict(h=17, w=5.5, sway=-1, core=True),
    dict(h=19, w=6.0, sway=1, core=True),
    dict(h=16, w=5.5, sway=2, core=True),
    dict(h=18, w=6.0, sway=-2, core=True),
    dict(h=10, w=5.0, sway=1, core=False),
    dict(h=5, w=3.5, sway=0, core=False),
)


def flame_frame(f):
    img = Img(FLAME_W, FLAME_H)
    k = FLAME[f]
    cx = FLAME_W / 2
    for i in range(k['h']):
        t = i / max(1, k['h'] - 1)
        # Kształt kropli: najszerszy tuż nad podstawą, czubek zwęża się i wychyla.
        half = k['w'] * (math.sin(min(1.0, t * 3.2 + .25) * math.pi / 2) * (1 - t) ** .8 + .12)
        x0 = cx + k['sway'] * t * t
        y = FLAME_BASE - i
        for x in range(FLAME_W):
            d = abs(x + .5 - x0)
            if d > half:
                continue
            u = d / max(.5, half)
            n = hash01(x, y, f)
            if not k['core']:
                c = FIRE[1] if u > .5 or n < .4 else FIRE[2]
            elif u > .72:
                c = FIRE[1]
            elif u > .42 or t > .7:
                c = FIRE[2] if t > .35 or n < .5 else FIRE[3]
            else:
                c = FIRE[4] if t < .45 else FIRE[3]
            img.put(x, y, c)
    # Odrywające się iskry nad czubkiem.
    if k['core']:
        for j in range(2):
            x = int(cx + k['sway'] + (hash01(f, j, 5) - .5) * 6)
            y = FLAME_BASE - k['h'] - 1 - int(hash01(j, f, 9) * 3)
            img.put(x, y, EMBER[j])
    # Żar u podstawy — płomień „stoi” na podłodze.
    for x in range(int(cx - k['w']), int(cx + k['w']) + 1):
        img.put(x, FLAME_BASE + 1, FIRE[0])
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
    sheets = {}
    for size in (32, 64):
        sheets[f'fire-burst-{size}.png'] = strip(size, size, burst_frame(size), 8)
    sheets['fire-flame.png'] = strip(FLAME_W, FLAME_H, flame_frame, 8)
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
    return errors


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator ognia: kule wybuchu i płomienie na podłodze')
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
            bg = Image.new('RGBA', im.size, DARK_FLOOR)
            bg.alpha_composite(im)
            bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(
                os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
