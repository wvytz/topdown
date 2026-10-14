"""
Generator wrogów Pajęczego leża (krok 23b): pająk jaskiniowy (wariant Rushera), nietoperz (wariant Kitera)
i jego fala uderzeniowa. Narzędzia i rampy z tower_ruins_tiles.py / spider_sprites.py.

Użycie (z katalogu głównego repozytorium):
  python tools/lair_enemies.py                       # arkusze do public/assets/sprites/
  python tools/lair_enemies.py --preview tools/out   # dodatkowo podglądy 4x na podłodze leża

Arkusze (STYLEGUIDE §2, §8, §10; wiersze = 8 kierunków N..NW z obrotu, obrys po obrocie):
  cave-spider_walk.png   48x48; kolumny 0–3 chód (klatka 0 = stanie)
  bat_fly-screech.png    48x48; kolumny 0–3 lot, 4–7 skrzek (fala wylatuje w kolumnie 7)
  bat_wave.png           32x32; kolumny 0–3 migotanie fali, wiersze = kierunek lotu

Paleta leża (krok 23a): fiolet, zieleń, biel. Pająk ma ciemną chitynę Matki Pająków, białe pręgi i zielone
oczy — bez worka-bomby, żeby nie mylił się z pajączkiem-kamikaze. Nietoperz: ciemna błona, białe kości
palców, zielone oczy i zielona fala.
"""
import argparse
import math
import os
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import OUT, Img, ok, outline
from loot_sprites import rotate45
from spider_sprites import CHITIN, band_shade, ellipse, mirror, stroke

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 48
WAVE = 32
MARGIN = 8

LAIR = trt.PALETTES['pajeczy']
WHITE = LAIR.ash        # biel nici: (jasna, cień)
GREEN = LAIR.flame      # upiorna zieleń leża: ciemna → blask
MEMBRANE = (ok(.20, .040, 330), ok(.27, .050, 330), ok(.34, .055, 325))
FUR = (ok(.24, .030, 40), ok(.31, .035, 45))


# ---------------- pająk jaskiniowy (Rusher) ----------------
SPIDER_LEGS = [  # prawa strona na N: przyczep, kolano, stopa
    ((27, 18), (33, 12), (33, 8.5)),
    ((28, 21), (36, 17), (40, 20)),
    ((28, 24), (36, 27), (39.5, 32)),
    ((27, 27), (32, 33), (32, 39)),
]


LEG_SCALE = 0.8


def spider_frame(f):
    img = Img(CELL, CELL)
    c = CELL / 2
    step = (0, -2, 0, 2)[f]
    for side in (1, -1):
        for i, (a, k, t) in enumerate(SPIDER_LEGS):
            group = (i + (0 if side > 0 else 1)) % 2
            dy = step if group == 0 else -step
            pts = [a, (k[0], k[1] + dy * .5), (t[0], t[1] + dy)]
            # Rozpiętość nóg zmniejszona, żeby po obrocie po skosie mieściły się w marginesie 8 px.
            pts = [(c + (x - c) * LEG_SCALE, c + (y - c) * LEG_SCALE) for x, y in pts]
            if side < 0:
                pts = [mirror(p, c) for p in pts]
            stroke(img, pts[:2], 2.6, CHITIN[2], edge=CHITIN[3])
            stroke(img, pts[1:], 2.2, CHITIN[2])
    # Odwłok z białymi pręgami (szewrony) — cecha pająka leża
    ellipse(img, c, c + 5, 7, 8, band_shade(CHITIN))
    for yy, w in ((3, 3), (6, 4), (9, 3)):
        for xx in range(-w, w + 1):
            if abs(xx) >= w - 1:
                img.put(int(c) + xx - (1 if xx < 0 else 0), int(c) + yy + (1 if abs(xx) == w else 0), WHITE[0])
    # Głowotułów, kły i zielone oczy
    ellipse(img, c, c - 5, 5.5, 5, band_shade(CHITIN, light=(-.4, -.7)))
    img.put(int(c) - 2, int(c) - 11, WHITE[1])
    img.put(int(c) + 1, int(c) - 11, WHITE[1])
    for ex in (-2, 1):
        img.put(int(c) + ex, int(c) - 8, GREEN[2])
    for ex in (-4, 3):
        img.put(int(c) + ex, int(c) - 7, GREEN[1])
    return img


# ---------------- nietoperz (Kiter) ----------------
def wing(img, c, side, span, lift, spread):
    """Skrzydło: błona między ramieniem a palcami, kości palców białe. side=1 prawe."""
    sh = (c + side * 3, c - 1)
    tip = (c + side * span, c - 4 - lift)
    fingers = [tip, (c + side * (span - 3), c + 3 - lift * .4 + spread), (c + side * (span * .55), c + 6 + spread)]
    # błona: wypełnienie trójkątów bark–palec–palec
    poly = [sh, *fingers, (c + side * 3, c + 4)]
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    for y in range(int(min(ys)) - 1, int(max(ys)) + 2):
        for x in range(int(min(xs)) - 1, int(max(xs)) + 2):
            px, py = x + .5, y + .5
            inside = False
            j = len(poly) - 1
            for i in range(len(poly)):
                xi, yi = poly[i]
                xj, yj = poly[j]
                if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                    inside = not inside
                j = i
            if inside:
                img.put(x, y, MEMBRANE[1] if py > c else MEMBRANE[2])
    for fpt in fingers:
        stroke(img, [sh, fpt], 1.4, WHITE[1])
    stroke(img, [sh, tip], 1.8, WHITE[0])


def bat_frame(f):
    img = Img(CELL, CELL)
    c = CELL / 2
    if f < 4:  # lot: skrzydła w górze → w dole
        span, lift, spread = ((13, 3, 0), (12, 1, 1), (9.5, -3, 2), (12, 1, 1))[f]
        mouth = 0
    else:  # skrzek: skrzydła rozpostarte, pysk otwarty, fala rośnie przed pyskiem
        span, lift, spread = ((12, 2, 0), (13, 2.5, -1), (13.5, 3, -1), (13, 2.5, 0))[f - 4]
        mouth = f - 3
    for side in (1, -1):
        wing(img, c, side, span, lift, spread)
    ellipse(img, c, c + 1, 3.6, 5, lambda nx, ny: FUR[1] if nx + ny < 0 else FUR[0])
    ellipse(img, c, c - 5, 3, 3, lambda nx, ny: FUR[1] if nx + ny < 0 else FUR[0])
    for s in (1, -1):  # uszy
        img.put(int(c) + (2 if s > 0 else -3), int(c) - 9, FUR[1])
        img.put(int(c) + (2 if s > 0 else -3), int(c) - 8, FUR[0])
    img.put(int(c) - 2, int(c) - 6, GREEN[2])
    img.put(int(c) + 1, int(c) - 6, GREEN[2])
    if mouth:
        img.put(int(c) - 1, int(c) - 8, GREEN[3] if mouth > 1 else GREEN[1])
        img.put(int(c), int(c) - 8, GREEN[3] if mouth > 1 else GREEN[1])
    if mouth >= 3:  # zalążek fali przed pyskiem (kolumny 6–7)
        r = 3 + (mouth - 3) * 2
        for a in range(-60, 61, 8):
            x = c + r * math.sin(math.radians(a))
            y = c - 9 - r * math.cos(math.radians(a))
            img.put(int(x), int(y), GREEN[2])
    return img


# ---------------- fala (32x32) ----------------
def wave_frame(f):
    """Półksiężyc wypukły w stronę lotu (N): 3 px grubości, krawędź zewnętrzna jasna, migotanie bieli."""
    img = Img(WAVE, WAVE)
    c = WAVE / 2
    cx, cy = c, c + 8  # środek łuku za falą
    for y in range(WAVE):
        for x in range(WAVE):
            dx, dy = x + .5 - cx, y + .5 - cy
            d = math.hypot(dx, dy)
            ang = math.degrees(math.atan2(dx, -dy))
            if abs(ang) > 62 or not (9.5 <= d <= 13):
                continue
            taper = abs(ang) > 48 and d < 10.8  # cieńsze rogi
            if taper:
                continue
            col = GREEN[2] if d > 11.8 else GREEN[1]
            if d > 11.8 and int((ang + 70) / 9 + f) % 4 == 0:
                col = WHITE[0]
            img.put(x, y, col)
    return img


def directional_sheet(size, frame_fn, cols):
    sheet = Img(size * cols, size * 8)
    frames = []
    for col in range(cols):
        base = frame_fn(col)
        for row in range(8):
            img = rotate45(base, row)
            outline(img, OUT)
            sheet.blit(img, col * size, row * size)
            frames.append((f'r{row}c{col}', img))
    return sheet, frames


def build():
    spider, sf = directional_sheet(CELL, spider_frame, 4)
    bat, bf = directional_sheet(CELL, bat_frame, 8)
    wave, wf = directional_sheet(WAVE, wave_frame, 4)
    return {
        'cave-spider_walk.png': (spider, sf, CELL, MARGIN),
        'bat_fly-screech.png': (bat, bf, CELL, MARGIN),
        'bat_wave.png': (wave, wf, WAVE, 1),
    }


def validate(sheets):
    errors = []
    for fname, (_, frames, size, margin) in sheets.items():
        for name, img in frames:
            opaque = [(x, y, c) for y, row in enumerate(img.p) for x, c in enumerate(row) if c[3]]
            if not opaque:
                errors.append(f'{fname} {name}: pusta klatka')
                continue
            if any(c[3] != 255 for _, _, c in opaque):
                errors.append(f'{fname} {name}: półprzezroczyste piksele')
            if any(c[:3] in ((0, 0, 0), (255, 255, 255)) for _, _, c in opaque):
                errors.append(f'{fname} {name}: czysta czerń/biel')
            lo, hi = margin - 1, size - margin
            if any(not (lo <= x <= hi and lo <= y <= hi) for x, y, _ in opaque):
                errors.append(f'{fname} {name}: sylwetka wchodzi w margines {margin} px')
    return errors


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator wrogów Pajęczego leża')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podglądy 4x')
    a = ap.parse_args()
    sheets = build()
    errors = validate(sheets)
    if errors:
        for e in errors[:30]:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    for fname, (sheet, frames, _, _) in sheets.items():
        sheet.pil().save(os.path.join(a.out, fname))
        print(f'zapisano {fname} {sheet.w}x{sheet.h}: {len(frames)} klatek')
    if a.preview:
        from PIL import Image
        os.makedirs(a.preview, exist_ok=True)
        for fname, (sheet, _, _, _) in sheets.items():
            im = sheet.pil()
            bg = Image.new('RGBA', im.size, LAIR.floor[2])
            bg.alpha_composite(im)
            bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(
                os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
