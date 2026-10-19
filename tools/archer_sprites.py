"""
Generator sprite'ów łucznika, trzeciego bohatera (krok 82): arkusz postaci i strzała.

Użycie (z katalogu głównego repozytorium, wymaga Pillow — tools/requirements.txt):
  python tools/archer_sprites.py                       # arkusze do public/assets/sprites/
  python tools/archer_sprites.py --preview tools/out   # dodatkowo podglądy 4x na podłodze palety C

Postać rysujemy z brył raz, zwróconą na N; 8 kierunków powstaje z obrotu co 45° (najbliższy sąsiad),
a obrys #1b1a22 nakładamy po obrocie — STYLEGUIDE §1, §3. Światło z lewej-przodu, płaskie pasma (§5).

archer_walk-draw.png (384x384, komórka 48x48, pivot 24,24):
  kolumny 0–3 chód (0 = stanie): łuk w lewej ręce przy boku, peleryna i stopy w kroku;
  kolumny 4–7 łuk: nałożenie strzały, pół naciągnięcia, pełne naciągnięcie, zwolnienie cięciwy.
  Etap naciągania wybiera gra według siły (BowDraw); strzała wylatuje FORWARD px przed pivotem.

archer_arrow.png (32x128, komórka 16x16, pivot 8,8): wiersz = kierunek lotu (0 = N … 7 = NW),
  kolumna 0 zwykła strzała, kolumna 1 strzała z pełnego naciągnięcia (jaśniejszy grot i lotki).
  Strzałę rysujemy osobno dla każdego kierunku (linia 1 px po obrocie najbliższym sąsiadem by się rwała).
"""
import argparse
import math
import os
import sys

from PIL import Image

import tower_ruins_tiles as trt
from tower_ruins_tiles import OUT, Img, hexes, outline
from loot_sprites import rotate45

PALETTE = trt.PALETTES['piaskowiec']
SPRITES = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
SHEET_NAME = 'archer_walk-draw.png'
ARROW_NAME = 'archer_arrow.png'
CELL = 48
ARROW_CELL = 16
CENTER = (CELL - 1) / 2
MAX_RADIUS = 21.5
# Odległość wylotu strzały od pivota (grot w pełnym naciągnięciu) — do heroConfig (bow.forwardOffset).
FORWARD = 14
HEAD_R = 4.8

# Rampy: ciemny → jasny.
CLOAK = hexes('#1f3a24', '#2c5232', '#3f6e3f', '#5b8f4f', '#86b866')  # deep, D, baza, L, H
LEATHER = hexes('#3a2616', '#5a3c22', '#7a5530')                      # D, baza, L
WOOD = hexes('#4a3020', '#6e4a2a', '#9a6a3a')                         # D, baza, L
STRING = hexes('#d8d0b8')
METAL = hexes('#8a94a4', '#c8d0dc')                                    # baza, blask
FLETCH = hexes('#a8352c', '#d65a48')                                   # baza, L
SKIN = hexes('#b9805e', '#e8b892')                                     # cień, baza
PALETTE_COLORS = {OUT, *CLOAK, *LEATHER, *WOOD, *STRING, *METAL, *FLETCH, *SKIN}

# Klatki: stopy (przesunięcie lewej/prawej w y, − = do przodu), wychylenie rąbka peleryny (x),
# łuk ('side' = przy boku, 'aim' = przed sobą), naciągnięcie cięciwy (y lokalne cięciwy) i strzała.
FRAMES = [
    {'feet': (0, 0), 'hem': 0, 'bow': 'side'},                                # 0: stanie
    {'feet': (-3, 2), 'hem': 1, 'bow': 'side'},                               # 1: krok lewą
    {'feet': (0, 0), 'hem': 0, 'bow': 'side'},                                # 2: przejście
    {'feet': (2, -3), 'hem': -1, 'bow': 'side'},                              # 3: krok prawą
    {'feet': (-1, 1), 'hem': 0, 'bow': 'aim', 'string': -9, 'arrow': True},   # 4: nałożenie strzały
    {'feet': (-1, 1), 'hem': 0, 'bow': 'aim', 'string': -6, 'arrow': True},   # 5: pół naciągnięcia
    {'feet': (-1, 1), 'hem': 0, 'bow': 'aim', 'string': -3, 'arrow': True},   # 6: pełne naciągnięcie
    {'feet': (-1, 1), 'hem': 0, 'bow': 'aim', 'string': -10, 'arrow': False}, # 7: zwolnienie cięciwy
]
# Łuk przed sobą: łęczysko łukiem od (−BOW_HALF, BOW_TIPS_Y) przez (0, BOW_Y) do (BOW_HALF, BOW_TIPS_Y).
BOW_Y = -16
BOW_TIPS_Y = -9
BOW_HALF = 8


def local(x, y):
    """Środek piksela względem pivota (y ujemne = przód postaci)."""
    return x + .5 - CELL / 2, y + .5 - CELL / 2


def to_px(dx, dy):
    return int(math.floor(dx + CELL / 2)), int(math.floor(dy + CELL / 2))


def in_ellipse(dx, dy, cx, cy, rx, ry):
    return ((dx - cx) / rx) ** 2 + ((dy - cy) / ry) ** 2 <= 1


def line(img, a, b, color, width=1):
    (ax, ay), (bx, by) = a, b
    n = max(2, int(math.hypot(bx - ax, by - ay) * 3))
    for i in range(n + 1):
        t = i / n
        px, py = ax + (bx - ax) * t, ay + (by - ay) * t
        for ox in range(width):
            for oy in range(width):
                img.put(*to_px(px + ox, py + oy), color)


def feet(img, left, right):
    """Buty wystające spod peleryny: lewa i prawa stopa, krok przesuwa je w przód i w tył."""
    for fx, fy in ((-4, left), (3, right)):
        for y in range(CELL):
            for x in range(CELL):
                dx, dy = local(x, y)
                if in_ellipse(dx, dy, fx + .5, fy - 4, 2.2, 3):
                    img.put(x, y, LEATHER[1] if dy > fy - 5 else LEATHER[2])


def cloak(img, hem):
    """Peleryna z góry: elipsa na plecach, rąbek z tyłu w D, światło z lewej-przodu, fałda środkowa."""
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = local(x, y)
            sx = dx - hem if dy > 4 else dx  # w kroku kołysze się tylny rąbek
            if not in_ellipse(sx, dy, 0, 2.5, 9.5, 8.5):
                continue
            inner = in_ellipse(sx, dy, 0, 2.5, 8, 7)
            c = CLOAK[1]
            if not inner and dy > 3:
                c = CLOAK[0]
            elif not inner and sx < 0:
                c = CLOAK[2]
            elif sx > 5:
                c = CLOAK[0]
            if abs(sx) < .5 and dy > 4:
                c = CLOAK[0]  # fałda
            img.put(x, y, c)
    img.put(*to_px(-6, -1), CLOAK[4])
    img.put(*to_px(-5, -2), CLOAK[4])


def quiver(img):
    """Kołczan na plecach (po prawej, skośnie), lotki strzał wystają ku tyłowi."""
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = local(x, y)
            # oś kołczanu skośnie od (2, 0) do (6, 9)
            ux, uy = 4 / math.hypot(4, 9), 9 / math.hypot(4, 9)
            t = (dx - 2) * ux + dy * uy
            s = (dx - 2) * uy - dy * ux
            if -1 <= t <= 9 and abs(s) <= 2:
                img.put(x, y, LEATHER[0] if s > .8 else LEATHER[1] if s > -.8 else LEATHER[2])
            elif 9 < t <= 11 and abs(s) <= 2:
                img.put(x, y, FLETCH[1] if s < 0 else FLETCH[0])  # lotki strzał w kołczanie


def jerkin(img):
    """Ramiona w skórzanym kaftanie (oddzielają kaptur od zielonej peleryny), światło z lewej."""
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = local(x, y)
            if in_ellipse(dx, dy, 0, -1, 8.5, 4.2):
                img.put(x, y, LEATHER[2] if dx < -2 else LEATHER[1] if dx < 4 else LEATHER[0])


def hood(img):
    """Kaptur z góry: zielony, szpic z tyłu, skrawek twarzy z przodu, światło z lewej."""
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = local(x, y)
            d = math.hypot(dx, dy + 1)
            tip = abs(dx) < 1.2 and 3.5 < dy < 6.5  # szpic kaptura opada na plecy
            if d > HEAD_R and not tip:
                continue
            c = CLOAK[3]
            if dx < -1 and dy < 0:
                c = CLOAK[4]
            elif dx > 2 or tip:
                c = CLOAK[2]
            if d > HEAD_R - .9 and dy > -3 and not tip:
                c = CLOAK[1]  # brzeg kaptura na tle kaftana
            if dy < -HEAD_R + .6 and -2 < dx < 1.5:
                c = SKIN[1]
            img.put(x, y, c)
    img.put(*to_px(-3, -4), CLOAK[4])


def bow_side(img):
    """Łuk w lewej ręce przy boku: łęczysko pionowo, wygięte na zewnątrz, cięciwa po wewnętrznej stronie."""
    pts = []
    for i in range(13):
        v = i / 12 * 2 - 1  # −1..1 wzdłuż łęczyska
        pts.append((-10 - 2.5 * (1 - v * v), 7 * v))
    for i in range(len(pts) - 1):
        line(img, pts[i], pts[i + 1], WOOD[1] if i < 6 else WOOD[0], 2)
    line(img, (-9.5, -7), (-9.5, 7), STRING[0])
    # dłoń na środku łęczyska
    for x, y in ((-12, 0), (-11, 0), (-12, 1), (-11, 1)):
        img.put(*to_px(x, y), SKIN[1] if y == 0 else SKIN[0])
    line(img, (-7.5, -1), (-10.5, 0), LEATHER[2], 2)  # rękaw


def bow_aim(img, string_y, arrow):
    """Łuk przed sobą: łęczysko poziomym łukiem, cięciwa (w kształcie V przy naciągnięciu) i strzała."""
    draw = max(0, string_y - BOW_TIPS_Y)  # 0 = luźna cięciwa, 6 = pełne naciągnięcie
    tips = BOW_TIPS_Y + draw / 3  # końce łęczyska zginają się ku łucznikowi
    pts = []
    for i in range(13):
        u = i / 12 * 2 - 1  # −1..1
        x = u * (BOW_HALF - draw / 6)
        y = BOW_Y + (tips - BOW_Y) * u * u
        pts.append((x, y))
    for i in range(len(pts) - 1):
        line(img, pts[i], pts[i + 1], WOOD[2] if pts[i][0] < 0 else WOOD[1], 2)
    left, right = pts[0], pts[-1]
    nock = (0, string_y)
    line(img, (left[0] + .5, left[1] + 1), nock, STRING[0])
    line(img, (right[0] + .5, right[1] + 1), nock, STRING[0])
    if arrow:
        line(img, (0, string_y - .5), (0, -FORWARD + 2), WOOD[2])
        for x, y in ((0, -FORWARD + 1), (0, -FORWARD), (-1, -FORWARD + 2), (1, -FORWARD + 2)):
            img.put(*to_px(x, y), METAL[0] if x else METAL[1])
        for x, y in ((-1, string_y + .5), (1, string_y + .5)):
            img.put(*to_px(x, y), FLETCH[1] if x < 0 else FLETCH[0])
    # lewa ręka trzyma łęczysko, prawa cięciwę przy nocku
    for x, y in ((-1, BOW_Y + 1), (0, BOW_Y + 1)):
        img.put(*to_px(x, y), SKIN[1])
    line(img, (-5, -2), (-1, BOW_Y + 2.5), LEATHER[2], 2)
    line(img, (5, -2), (1, string_y + 1.5), LEATHER[1], 2)
    for x, y in ((0, string_y + 1), (1, string_y + 1)):
        img.put(*to_px(x, y), SKIN[0])


def body_frame(f):
    img = Img(CELL, CELL)
    feet(img, *f['feet'])
    cloak(img, f['hem'])
    quiver(img)
    jerkin(img)
    hood(img)
    if f['bow'] == 'side':
        bow_side(img)
    else:
        bow_aim(img, f['string'], f['arrow'])
    return img


def arrow_frame(row, full):
    """Strzała w kierunku `row` (0 = N, zgodnie z zegarem co 45°): grot, drzewce 1 px, lotki."""
    img = Img(ARROW_CELL, ARROW_CELL)
    a = math.radians(45 * row)
    ux, uy = math.sin(a), -math.cos(a)  # przód strzały
    px, py = -uy, ux  # w poprzek
    c = (ARROW_CELL - 1) / 2

    def put(t, s, color):
        img.put(int(round(c + ux * t + px * s)), int(round(c + uy * t + py * s)), color)

    for i in range(-8, 9):
        put(i * .5, 0, WOOD[1] if full else WOOD[0])
    tip = METAL[1] if full else METAL[0]
    for t, s in ((4.5, 0), (5.5, 0), (3.5, -1), (3.5, 1)):
        put(t, s, tip)
    put(4.5, 0, METAL[1])
    fl = FLETCH[1] if full else FLETCH[0]
    for t in (-4, -3.5, -3):
        put(t, -1, fl)
        put(t, 1, FLETCH[0])
    outline(img, OUT)
    return img


def build():
    local_frames = [body_frame(f) for f in FRAMES]
    sheet = Img(CELL * 8, CELL * 8)
    frames = []
    for col, base in enumerate(local_frames):
        for row in range(8):
            img = rotate45(base, row)
            outline(img, OUT)
            sheet.blit(img, col * CELL, row * CELL)
            frames.append((f'r{row}c{col}', img))
    arrows = Img(ARROW_CELL * 2, ARROW_CELL * 8)
    arrow_frames = []
    for row in range(8):
        for col, full in enumerate((False, True)):
            img = arrow_frame(row, full)
            arrows.blit(img, col * ARROW_CELL, row * ARROW_CELL)
            arrow_frames.append((f'arrow r{row}c{col}', img))
    return sheet, local_frames, frames, arrows, arrow_frames


def validate(local_frames, frames, arrow_frames):
    errors = []
    for col, img in enumerate(local_frames):
        for y in range(CELL):
            for x in range(CELL):
                if img.p[y][x][3] and math.hypot(x - CENTER, y - CENTER) > MAX_RADIUS:
                    errors.append(f'kolumna {col}: piksel ({x},{y}) dalej niż {MAX_RADIUS} px od pivota')
    for name, img in frames + arrow_frames:
        opaque = [c for row in img.p for c in row if c[3]]
        if not opaque:
            errors.append(f'{name}: pusta klatka')
        if any(c[3] != 255 for c in opaque):
            errors.append(f'{name}: półprzezroczyste piksele')
        extra = {c for c in opaque if c not in PALETTE_COLORS}
        if extra:
            errors.append(f'{name}: kolory spoza palety {sorted(extra)[:3]}')
        n = img.w
        if any(img.p[y][x][3] for y in range(n) for x in (0, n - 1)) or \
                any(img.p[y][x][3] for y in (0, n - 1) for x in range(n)):
            errors.append(f'{name}: sprite dotyka krawędzi komórki')
    return errors


def save_preview(img, path):
    im = img.pil()
    bg = Image.new('RGBA', im.size, PALETTE.floor[2])
    bg.alpha_composite(im)
    bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(path)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator sprite\'ów łucznika')
    ap.add_argument('--out', default=SPRITES)
    ap.add_argument('--preview', default=None, help='katalog na podglądy 4x')
    a = ap.parse_args()
    sheet, local_frames, frames, arrows, arrow_frames = build()
    errors = validate(local_frames, frames, arrow_frames)
    if errors:
        for e in errors[:30]:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    sheet.pil().save(os.path.join(a.out, SHEET_NAME))
    arrows.pil().save(os.path.join(a.out, ARROW_NAME))
    print(f'zapisano {SHEET_NAME} {sheet.w}x{sheet.h}: {len(frames)} klatek; {ARROW_NAME} {arrows.w}x{arrows.h}')
    if a.preview:
        os.makedirs(a.preview, exist_ok=True)
        save_preview(sheet, os.path.join(a.preview, SHEET_NAME.replace('.png', '_preview.png')))
        save_preview(arrows, os.path.join(a.preview, ARROW_NAME.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
