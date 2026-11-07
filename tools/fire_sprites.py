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
  Podstawa płomienia w wierszu 21 (gra ustawia go stopą w punkcie podłogi); pod nią owal żaru (krok 177).
fire-flame-big.png (256x40, komórka 32x40): duży płomień szerokiej plamy — trzy języki na wspólnym łożu żaru,
  te same klatki co mały; podstawa w wierszu 34.
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


def draw_tongue(img, cx, base, k, f, seed, scale_h=1.0, scale_w=1.0):
    """Jeden język ognia (kształt kropli) od podstawy `base` w górę. U samej podstawy płomień jest ciemniejszy
    i węższy (wsiąka w żar), nad nią jasne „korzenie” — płomień ma głębię zamiast ciętej poziomo stopy."""
    h = max(3, int(round(k['h'] * scale_h)))
    w = k['w'] * scale_w
    for i in range(h):
        t = i / max(1, h - 1)
        # Kształt kropli: najszerszy tuż nad podstawą, czubek zwęża się i wychyla.
        half = w * (math.sin(min(1.0, t * 3.2 + .25) * math.pi / 2) * (1 - t) ** .8 + .12)
        # Dwa najniższe wiersze węższe: płomień wyrasta z żaru, a nie stoi na kresce.
        if i < 2:
            half *= .72 + .14 * i
        x0 = cx + k['sway'] * scale_h * t * t
        y = base - i
        for x in range(img.w):
            d = abs(x + .5 - x0)
            if d > half:
                continue
            u = d / max(.5, half)
            n = hash01(x, y, f, seed)
            if i == 0:
                # Korzeń: ciemny brzeg, gorący środek (głębia u podstawy).
                c = FIRE[0] if u > .55 else FIRE[2] if u > .25 else FIRE[3]
            elif not k['core']:
                c = FIRE[1] if u > .5 or n < .4 else FIRE[2]
            elif u > .72:
                c = FIRE[1] if i > 1 or n < .6 else FIRE[0]
            elif u > .42 or t > .7:
                c = FIRE[2] if t > .35 or n < .5 else FIRE[3]
            else:
                c = FIRE[4] if t < .45 else FIRE[3]
            img.put(x, y, c)
    # Odrywające się iskry nad czubkiem.
    if k['core']:
        for j in range(2):
            x = int(cx + k['sway'] * scale_h + (hash01(f, j, 5, seed) - .5) * 6 * scale_w)
            y = base - h - 1 - int(hash01(j, f, 9, seed) * 3 * scale_h)
            img.put(x, y, EMBER[j])


def draw_bed(img, cx, base, rx, ry, f, seed, glow=1.0):
    """Łoże żaru pod płomieniem: owal węgli w rzucie z góry (zamiast prostej kreski). Z tyłu i z boków ciemne
    węgle, z przodu (u dołu owalu) okopcona krawędź, w środku żarzące się punkty — owal daje płomieniowi głębię."""
    cy = base + .5
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            dx, dy = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            # Brzeg owalu poszarpany szumem — węgle, nie geometryczna elipsa.
            q = dx * dx + dy * dy - (noise(x, y, 1.6, seed) - .5) * .5
            if q > 1:
                continue
            n = hash01(x, y, f // 2, seed + 3)
            if q > .62:
                # Zewnętrzny pierścień: od dołu (przód) okopcony, u góry (tył) ciemny żar.
                c = SMOKE[1] if dy > .45 and n < .35 else FIRE[0] if n < .8 else FIRE[1]
            elif q > .28:
                c = FIRE[1] if n < .55 else FIRE[0] if n < .8 else FIRE[2]
            else:
                c = FIRE[3] if n < .35 * glow else FIRE[2] if n < .8 else FIRE[1]
            img.put(x, y, c)


def flame_frame(f):
    img = Img(FLAME_W, FLAME_H)
    k = FLAME[f]
    cx = FLAME_W / 2
    draw_bed(img, cx, FLAME_BASE, k['w'] * .9 + 1.5, 2.4, f, 11, glow=1.0 if k['core'] else .4)
    draw_tongue(img, cx, FLAME_BASE, k, f, 0)
    return img


# Duży płomień (krok 177, prośba właściciela): w szerokiej plamie kilka małych płomieni łączy się w jeden „stos” —
# wysoki środkowy język i dwa niższe boczne w innych fazach migotania, na wspólnym łożu żaru.
BIG_W, BIG_H, BIG_BASE = 32, 40, 33


def burn_phase(f, k):
    """Klatka pętli płonięcia przesunięta o `k` (boczne języki migoczą w innym rytmie); zapłon i gaśnięcie bez zmian."""
    return 2 + (f - 2 + k) % 4 if 2 <= f <= 5 else f


def big_flame_frame(f):
    img = Img(BIG_W, BIG_H)
    k = FLAME[f]
    cx = BIG_W / 2
    draw_bed(img, cx, BIG_BASE + 1, k['w'] * 1.7 + 2.5, 4.6, f, 21, glow=1.0 if k['core'] else .4)
    # Boczne języki najpierw — środkowy je przykrywa, sylwetka jest jedna.
    draw_tongue(img, cx - 6.5, BIG_BASE, FLAME[burn_phase(f, 1)], f, 1, scale_h=1.1, scale_w=1.1)
    draw_tongue(img, cx + 6.5, BIG_BASE + 1, FLAME[burn_phase(f, 3)], f, 2, scale_h=.95, scale_w=1.05)
    draw_tongue(img, cx, BIG_BASE, k, f, 3, scale_h=1.6, scale_w=1.35)
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
    sheets['fire-flame-big.png'] = strip(BIG_W, BIG_H, big_flame_frame, 8)
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
