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
  cocoon.png             32x32, bez kierunków (krok 23d); 0–1 spoczynek (puls szwu), 2–3 drżenie (telegraf),
                         4–7 rozdarcie; klatka 7 = strzępy, które zostają na podłodze
  sticky-web_small.png   32x32 (1 kafel), sticky-web_large.png 64x64 (2x2 kafle), krok 23e: lepka pajęczyna
                         na podłodze; 4 klatki = błysk przesuwa się po zielonych kroplach kleju. Pełna, okrągła
                         sieć z obrysem i kroplami — celowo inna niż narożne pajęczyny-dekoracje (trójkąt, bez obrysu)
  boss-web.png           128x128 (krok 25): sieć rzucona przez Matkę Pająków; 0–5 rozrost (promień 20→60 px),
                         6–7 błysk kropli przy pełnym rozmiarze
  web-ball.png           16x16: kłąb sieci w locie, 4 klatki obrotu

Paleta leża (krok 23a): fiolet, zieleń, biel. Pająk ma ciemną chitynę Matki Pająków, białe pręgi i zielone
oczy — bez worka-bomby, żeby nie mylił się z pajączkiem-kamikaze. Nietoperz: ciemna błona, białe kości
palców, zielone oczy i zielona fala.
"""
import argparse
import math
import os
import random
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


# ---------------- kokon (32x32, krok 23d) ----------------
COCOON = 32
# Jedwab kokonu: rampa bieli leża (bez czystej bieli), pasmowe cieniowanie jak u postaci.
SILK = (ok(.46, .030, 305), ok(.58, .030, 305), ok(.71, .026, 305), ok(.83, .020, 305), ok(.92, .014, 305))
COCOON_CY = 18  # stopa kokonu przy dolnej krawędzi strefy, środek ciała lekko pod pivotem


def silk_body(img, cx, cy, rx, ry, seam):
    """Owalny kokon z ukośnymi pasmami oplotu i świecącym szwem (zieleń leża: w środku coś żyje)."""
    shade = band_shade(SILK)
    ellipse(img, cx, cy, rx, ry, shade)
    for y in range(img.h):
        for x in range(img.w):
            nx, ny = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            if nx * nx + ny * ny > .9:
                continue
            if (x - cx + (y - cy) * .7) % 4.5 < 1:  # oplot nici
                img.put(x, y, SILK[1])
    if seam is not None:
        for y in range(int(cy - ry * .45), int(cy + ry * .4)):
            img.put(int(cx), y, GREEN[seam])
    # Nici kotwiczące kokon do podłogi
    for dx in (-rx - 1, rx + 1):
        stroke(img, [(cx + dx * .6, cy + ry * .7), (cx + dx, cy + ry + 1)], 1.2, SILK[2])


def cocoon_frame(f):
    img = Img(COCOON, COCOON)
    cx = COCOON / 2
    if f < 2:  # spoczynek: szew pulsuje
        silk_body(img, cx, COCOON_CY, 6.5, 9, 0 if f == 0 else 1)
    elif f < 4:  # telegraf: drży i pęcznieje, szew jaśnieje
        silk_body(img, cx + (-1 if f == 2 else 1), COCOON_CY, 7.2, 9.4, 2 if f == 2 else 3)
    elif f == 4:  # pęknięcie: szew rozchodzi się w zieloną szczelinę
        silk_body(img, cx, COCOON_CY, 7.5, 9.5, None)
        for y in range(COCOON_CY - 6, COCOON_CY + 5):
            w = 1 if abs(y - COCOON_CY) > 3 else 2
            for x in range(int(cx) - w + 1, int(cx) + w):
                img.put(x, y, GREEN[2] if abs(x - cx + .5) < 1 else GREEN[1])
    else:  # połówki odpadają, strzępy; klatka 7 to płaskie resztki na podłodze
        spread = (3, 5, 6)[f - 5]
        lift = (2, 1, 0)[f - 5]
        for side in (-1, 1):
            hx = cx + side * spread
            ry = (7, 5, 3)[f - 5]
            ellipse(img, hx, COCOON_CY + 5 - ry + 4 - lift, 4, ry, band_shade(SILK))
        if f < 7:  # zielona maź w środku
            ellipse(img, cx, COCOON_CY + 6, 3, 2, lambda nx, ny: GREEN[0] if ny > 0 else GREEN[1])
        r = random.Random(2300 + f)
        for _ in range((6, 5, 4)[f - 5]):  # nitki
            a = r.uniform(0, math.tau)
            d = r.uniform(5, 6 + spread)
            px, py = cx + math.cos(a) * d, COCOON_CY + 3 + math.sin(a) * d * .6
            stroke(img, [(px, py), (px + math.cos(a) * 2, py + math.sin(a))], 1.2, SILK[3])
    return img


# ---------------- lepka pajęczyna (krok 23e) ----------------
def line(img, p0, p1, color):
    """Linia 1 px (Bresenham) — nici pajęczyny."""
    x0, y0 = int(round(p0[0])), int(round(p0[1]))
    x1, y1 = int(round(p1[0])), int(round(p1[1]))
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        img.put(x0, y0, color)
        if (x0, y0) == (x1, y1):
            return
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def sticky_web_frame(size, spokes, rings, seed, radius_of=None):
    """Sieć: szprychy i pierścienie (wielokąty) z jedwabiu leża, krople kleju na przecięciach.
    radius_of(f) = promień sieci w klatce f (rozrost sieci bossa); domyślnie cała komórka."""
    def frame(f):
        img = Img(size, size)
        c = size / 2
        r = random.Random(seed)
        radius = radius_of(f) if radius_of else size / 2 - 2.5
        f = f % 4
        angles = [(i + r.uniform(-.25, .25)) * math.tau / spokes for i in range(spokes)]
        lengths = [radius * r.uniform(.86, 1) for _ in range(spokes)]
        pt = lambda i, k: (c - .5 + math.cos(angles[i]) * lengths[i] * k, c - .5 + math.sin(angles[i]) * lengths[i] * k)
        for i in range(spokes):
            line(img, (c - .5, c - .5), pt(i, 1), SILK[3])
        for k in rings:
            for i in range(spokes):
                line(img, pt(i, k), pt((i + 1) % spokes, k), SILK[2])
        drops = [pt(i, k) for k in rings[1:] for i in range(spokes) if (i + int(k * 10)) % 2 == 0]
        for j, (x, y) in enumerate(drops):
            col = GREEN[3] if j % 4 == f else GREEN[1]
            img.put(int(round(x)), int(round(y)), col)
            img.put(int(round(x)) + 1, int(round(y)), GREEN[0] if col != GREEN[3] else GREEN[2])
        outline(img, OUT)
        return img
    return frame


# ---------------- sieć Matki Pająków (krok 25) ----------------
BOSS_WEB = 128
# Promienie klatek rozrostu = webPatchRadius w grze (bossConfig.web: startRadius 20 → maxRadius 60).
BOSS_WEB_RADII = (20, 28, 36, 44, 52, 60, 60, 60)


def web_ball_frame(f):
    """Kłąb sieci w locie (16x16): zwinięty jedwab z kroplą kleju, obraca się klatkami co 90°."""
    img = Img(16, 16)
    ellipse(img, 8, 8, 4.5, 4.5, band_shade(SILK))
    for k in range(3):
        a = f * math.pi / 2 + k * math.tau / 3
        line(img, (8 + math.cos(a) * 1.5, 8 + math.sin(a) * 1.5), (8 + math.cos(a + 1) * 4, 8 + math.sin(a + 1) * 4), SILK[1])
    img.put(9, 6, GREEN[2])
    return img


def strip_sheet(size, frame_fn, cols):
    sheet = Img(size * cols, size)
    frames = []
    for col in range(cols):
        img = frame_fn(col)
        outline(img, OUT)
        sheet.blit(img, col * size, 0)
        frames.append((f'c{col}', img))
    return sheet, frames


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
    cocoon, cf = strip_sheet(COCOON, cocoon_frame, 8)
    web_s, wsf = strip_sheet(32, sticky_web_frame(32, 7, (.5, 1), 2310), 4)
    web_l, wlf = strip_sheet(64, sticky_web_frame(64, 12, (.25, .5, .75, 1), 2320), 4)
    boss_web, bwf = strip_sheet(BOSS_WEB, sticky_web_frame(BOSS_WEB, 14, (.25, .5, .75, 1), 2330,
                                                           radius_of=lambda f: BOSS_WEB_RADII[f]), 8)
    ball, bbf = strip_sheet(16, web_ball_frame, 4)
    return {
        'cave-spider_walk.png': (spider, sf, CELL, MARGIN),
        'bat_fly-screech.png': (bat, bf, CELL, MARGIN),
        'bat_wave.png': (wave, wf, WAVE, 1),
        'cocoon.png': (cocoon, cf, COCOON, 2),
        'sticky-web_small.png': (web_s, wsf, 32, 1),
        'sticky-web_large.png': (web_l, wlf, 64, 1),
        'boss-web.png': (boss_web, bwf, BOSS_WEB, 1),
        'web-ball.png': (ball, bbf, 16, 1),
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
