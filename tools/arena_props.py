"""
Generator rekwizytów zmiennych aren (krok U6, `#areny-zmienne`): rzeczy, które od kroku 160 rysował kod gry
(`effects/ArenaConditionArt.ts`, figury Phasera), teraz jako pikselowe sprite'y z obrysem i rampami biomów.
Klucze tekstur i rozmiary zostają te same, więc gra kładzie je w tych samych miejscach.

Użycie (z katalogu głównego repozytorium):
  python tools/arena_props.py                       # pliki do public/assets/sprites/arena/
  python tools/arena_props.py --preview tools/out   # dodatkowo arkusz podglądu 3x na posadzkach obu biomów

Lustrzana komnata (piętro 6, sprzątaczki): wiadro i wiadro przewrócone z rozlaną wodą, butla chloru, wózek
sprzątaczki, żółty znak „ślisko”, lustro na stojaku (całe i pęknięte).
Bociani Ogród (piętro 7, Wiedźma): kamienny słup w bluszczu, gniazdo z bocianem (całe i rozbite), żywopłot.

Zasady (STYLEGUIDE §3–4, §13.1): obrys 1 px #1b1a22, rampy z przesunięciem odcienia, bez czystej bieli i czerni,
piksele kryjące; jedynie cień pod rekwizytem ma stałą alfę 0,4 (cienie środowiska, CLAUDE.md).
"""
import argparse
import math
import os
import random
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import CLR, OUT, Img, ok, oks, outline

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites', 'arena')
MIRROR = trt.PALETTES['lustro_opal']
GARDEN = trt.PALETTES['bociani_noc']
SHADOW = (0x1b, 0x1a, 0x22, 102)  # obrys z alfą 0,4

# Plastik sprzątaczek: niebieski (wiadro, wózek) i żółty (znak, kosz) — barwy z kroku 160, w rampach OKLCH.
BLUE = oks((.30, .090, 262), (.40, .120, 258), (.52, .140, 254), (.64, .120, 248), (.76, .080, 240))
YELLOW = oks((.52, .110, 80), (.70, .150, 90), (.84, .160, 98), (.92, .110, 102))
WATER = oks((.62, .070, 230), (.74, .080, 220), (.86, .060, 210), (.93, .030, 200))
CHLORINE = oks((.38, .100, 140), (.52, .140, 135), (.66, .150, 130), (.80, .120, 125))
STEEL = oks((.34, .012, 250), (.48, .014, 245), (.62, .014, 240), (.76, .012, 235), (.86, .010, 230))
GOLD = oks((.36, .060, 70), (.50, .090, 78), (.64, .110, 85), (.78, .100, 92))
WOOD = oks((.26, .040, 55), (.34, .050, 58), (.43, .055, 62), (.52, .055, 66))
INK = ok(.22, .012, 280)
# Ogród: kamień słupa w chłodnych tonach muru ogrodu, bluszcz i liście z rampy trawy, patyki gniazda.
STONE = GARDEN.wall_top[1:6]
LEAF = (ok(.20, .045, 150),) + GARDEN.grass + (ok(.62, .095, 125),)
STICK = oks((.26, .040, 60), (.36, .055, 62), (.47, .060, 66), (.58, .055, 70))
STORK = oks((.62, .010, 250), (.78, .010, 248), (.90, .008, 245))
BEAK = oks((.50, .150, 32), (.62, .170, 36))
BLOOM = GARDEN.bloom

PROPS = {}


def prop(key, w, h):
    def deco(fn):
        PROPS[key] = (w, h, fn)
        return fn
    return deco


def rect(img, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            img.put(x, y, c)


def fill_ellipse(img, cx, cy, rx, ry, color_of):
    for y in range(img.h):
        for x in range(img.w):
            nx, ny = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            if nx * nx + ny * ny <= 1:
                img.put(x, y, color_of(nx, ny))


def line(img, x0, y0, x1, y1, c):
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for i in range(n + 1):
        t = i / n
        img.put(int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t)), c)


def lit(ramp, nx, ny, bias=0.0):
    """Światło z lewej-góry, pasmowo (bez gradientu): indeks rampy z iloczynu z kierunkiem światła."""
    d = -(nx * 0.6 + ny * 0.8) * 0.5 + 0.5 + bias
    return ramp[max(0, min(len(ramp) - 1, int(d * len(ramp))))]


def shadow(img, cx, cy, rx, ry):
    """Cień kontaktowy pod rekwizytem: tylko na pustych pikselach, po obrysie."""
    for y in range(img.h):
        for x in range(img.w):
            nx, ny = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            if nx * nx + ny * ny <= 1 and img.p[y][x][3] == 0:
                img.put(x, y, SHADOW)


# ---------------- Lustrzana komnata ----------------

def bucket_body(img, cx, top, w, h):
    """Wiadro z góry pod kątem: korpus zwężający się w dół, krawędź z obręczą, woda w środku, pałąk."""
    for y in range(top, top + h):
        t = (y - top) / max(1, h - 1)
        half = w / 2 - t * 1.5
        for x in range(int(cx - half), int(cx + half) + 1):
            nx = (x + .5 - cx) / half
            img.put(x, y, lit(BLUE, nx, -0.2 + t * 0.6, 0.1))
    fill_ellipse(img, cx, top, w / 2 + .5, 2.6, lambda nx, ny: BLUE[3] if ny < -0.2 else BLUE[2])
    fill_ellipse(img, cx, top + .4, w / 2 - 1.2, 1.7, lambda nx, ny: WATER[2] if nx < -0.3 else WATER[1])
    img.put(int(cx - w / 4), top, WATER[3])
    for i in range(-5, 6):  # pałąk
        a = i / 5
        img.put(int(round(cx + a * (w / 2 - 1))), int(round(top - 3 + abs(a) ** 2 * 3)), STEEL[3])


@prop('arena-bucket', 20, 20)
def bucket():
    img = Img(20, 20)
    bucket_body(img, 10, 6, 12, 11)
    for x in range(6, 15):  # ciemniejszy pas przy dnie
        img.put(x, 15, BLUE[0])
    outline(img, OUT)
    shadow(img, 10, 17.5, 8, 2.5)
    return img


@prop('arena-bucket-tipped', 24, 20)
def bucket_tipped():
    img = Img(24, 20)
    rng = random.Random(1601)
    # Rozlana woda: płaska plama z kół, jaśniejsza na brzegu od światła.
    blobs = [(15, 13, 6.5, 3.4), (19, 15, 3.6, 2.2), (11, 15, 3.4, 2.0)]
    for (cx, cy, rx, ry) in blobs:
        fill_ellipse(img, cx, cy, rx, ry, lambda nx, ny: WATER[2] if ny < -0.4 else WATER[0])
    for _ in range(4):
        img.put(rng.randint(11, 20), rng.randint(12, 16), WATER[3])
    # Wiadro na boku: korpus poziomo, dno z prawej, otwór (ciemny) z lewej.
    for x in range(3, 15):
        t = (x - 3) / 11
        half = 4.5 - t * 1.2
        for y in range(int(10 - half), int(10 + half) + 1):
            ny = (y + .5 - 10) / half
            img.put(x, y, lit(BLUE, 0.2, ny, 0.05))
    fill_ellipse(img, 3, 10, 1.8, 5, lambda nx, ny: BLUE[0] if abs(ny) < 0.7 else BLUE[3])
    for y in range(7, 14):
        img.put(15, y, BLUE[1])
    outline(img, OUT)
    return img


@prop('arena-bottle', 14, 24)
def bottle():
    img = Img(14, 24)
    for y in range(8, 21):
        for x in range(2, 12):
            nx = (x + .5 - 7) / 5
            img.put(x, y, lit(CHLORINE, nx, -0.1))
    rect(img, 4, 4, 9, 7, CHLORINE[1])
    rect(img, 5, 4, 6, 7, CHLORINE[2])
    rect(img, 4, 1, 9, 3, STEEL[3])
    rect(img, 4, 1, 5, 3, STEEL[4])
    # Etykieta ostrzegawcza: żółty romb z czarnym znakiem.
    rect(img, 3, 12, 10, 16, YELLOW[2])
    rect(img, 3, 16, 10, 16, YELLOW[0])
    for (x, y) in ((6, 13), (7, 13), (6, 14), (7, 14), (6, 15)):
        img.put(x, y, INK)
    outline(img, OUT)
    shadow(img, 7, 21.5, 6, 2)
    return img


@prop('arena-cart', 30, 24)
def cart():
    img = Img(30, 24)
    # Korpus wózka z półką, żółty kosz, wiadro z mopem, spryskiwacz i rączka.
    for y in range(6, 18):
        for x in range(2, 28):
            img.put(x, y, BLUE[2] if y < 9 else (BLUE[1] if y < 17 else BLUE[0]))
    rect(img, 3, 7, 26, 7, BLUE[3])
    rect(img, 4, 10, 11, 16, YELLOW[1])
    rect(img, 4, 10, 11, 10, YELLOW[3])
    rect(img, 14, 10, 20, 16, WATER[1])
    rect(img, 14, 10, 20, 10, WATER[3])
    line(img, 17, 10, 21, 2, WOOD[2])   # trzonek mopa
    rect(img, 23, 9, 25, 15, STEEL[2])  # spryskiwacz
    img.put(24, 8, STEEL[4])
    line(img, 27, 6, 28, 1, STEEL[3])   # rączka
    for wx in (6, 23):
        fill_ellipse(img, wx, 19.5, 2.2, 2.2, lambda nx, ny: STEEL[0] if nx + ny > 0 else STEEL[2])
    outline(img, OUT)
    shadow(img, 15, 21.5, 13, 2.5)
    return img


@prop('arena-sign', 16, 22)
def sign():
    img = Img(16, 22)
    # Żółty znak „ślisko” (rozkładany): trójkąt z grubą krawędzią, czarny ludzik na poślizgu.
    for y in range(1, 20):
        half = (y - 1) * 7 / 18
        for x in range(int(8 - half), int(8 + half) + 1):
            edge = abs(x + .5 - 8) > half - 1.2
            img.put(x, y, YELLOW[1] if edge else (YELLOW[3] if x < 8 else YELLOW[2]))
    rect(img, 1, 19, 14, 19, YELLOW[0])
    for (x, y) in ((8, 7), (7, 9), (8, 9), (8, 10), (9, 11), (7, 12), (10, 12), (6, 13), (11, 13)):
        img.put(x, y, INK)
    rect(img, 7, 15, 9, 16, INK)
    outline(img, OUT)
    shadow(img, 8, 20, 7, 2)
    return img


def mirror(cracked):
    img = Img(32, 48)
    # Rama: złocone drewno, stopki; tafla z opalizującym odbiciem (paleta Lustrzanej komnaty).
    rect(img, 4, 2, 27, 43, WOOD[1])
    rect(img, 5, 3, 26, 42, GOLD[2])
    rect(img, 5, 3, 26, 3, GOLD[3])
    rect(img, 5, 3, 5, 42, GOLD[3])
    rect(img, 26, 3, 26, 42, GOLD[0])
    rect(img, 5, 42, 26, 42, GOLD[0])
    floor = MIRROR.floor
    opal = MIRROR.opal
    for y in range(5, 41):
        for x in range(7, 25):
            band = (x - 7) + (40 - y) * 0.45
            img.put(x, y, floor[5] if band < 7 else floor[4] if band < 15 else floor[3] if band < 22 else floor[2])
    # Tęczowe smugi odbicia (po skosie) i blik.
    for i, c in enumerate(opal[:3]):
        glass = Img(32, 48)
        line(glass, 9 + i * 5, 39, 18 + i * 5, 8, c)
        for y in range(5, 41):
            for x in range(7, 25):
                if glass.p[y][x][3]:
                    img.put(x, y, c)
    rect(img, 9, 7, 10, 15, floor[5])
    img.put(19, 26, opal[3])
    rect(img, 6, 43, 9, 45, WOOD[0])
    rect(img, 22, 43, 25, 45, WOOD[0])
    if cracked:
        # Pajęczyna pęknięć od punktu uderzenia i dwie wypadnięte drzazgi szkła (ciemny podkład ramy).
        ox, oy = 16, 22
        for (tx, ty) in ((9, 7), (24, 11), (8, 38), (23, 37), (24, 25), (12, 22)):
            line(img, ox, oy, tx, ty, MIRROR.wall_top[1])
        for (x, y) in ((15, 21), (16, 21), (17, 22), (15, 23), (19, 30), (20, 30), (20, 31)):
            img.put(x, y, MIRROR.wall_top[0])
    outline(img, OUT)
    shadow(img, 16, 45.5, 13, 2.5)
    return img


@prop('arena-mirror', 32, 48)
def mirror_whole():
    return mirror(False)


@prop('arena-mirror-cracked', 32, 48)
def mirror_cracked():
    return mirror(True)


# ---------------- Bociani Ogród ----------------

@prop('arena-pillar', 32, 52)
def pillar():
    img = Img(32, 52)
    rng = random.Random(1602)
    # Trzon: walec z pasmowym światłem z lewej, bloki co 9 px, głowica i baza szersze.
    for y in range(8, 46):
        for x in range(6, 26):
            nx = (x + .5 - 16) / 10
            c = lit(STONE, nx, -0.1, 0.05)
            if (y - 8) % 9 == 0:
                c = STONE[0]
            img.put(x, y, c)
    for (y0, y1) in ((3, 8), (44, 49)):
        for y in range(y0, y1 + 1):
            for x in range(3, 29):
                nx = (x + .5 - 16) / 13
                img.put(x, y, STONE[3] if y == y0 else lit(STONE, nx, 0.3))
    # Bluszcz pnie się po trzonie: łodyga i liście w trzech tonach.
    sx = 9
    for y in range(46, 9, -1):
        sx += rng.choice((-1, 0, 0, 1))
        sx = max(7, min(22, sx))
        img.put(sx, y, LEAF[0])
        if rng.random() < 0.45:
            for dx, dy in ((1, 0), (0, -1), (1, -1)):
                img.put(sx + dx + (1 if y % 2 else -1), y + dy, LEAF[rng.choice((1, 2, 3))])
    outline(img, OUT)
    shadow(img, 16, 49.5, 15, 3)
    return img


def nest_sticks(img, rng, cx, cy, rx, ry, n, scatter):
    for _ in range(n):
        a = rng.uniform(0, math.tau)
        r = rng.uniform(0.55, 1.0) if not scatter else rng.uniform(0.6, 1.35)
        x, y = cx + math.cos(a) * rx * r, cy + math.sin(a) * ry * r
        b = a + rng.uniform(1.1, 1.8)
        ln = rng.uniform(3, 6)
        line(img, x, y, x + math.cos(b) * ln, y + math.sin(b) * ln * 0.5, STICK[rng.choice((1, 2, 3))])


@prop('arena-nest', 44, 24)
def nest():
    img = Img(44, 24)
    rng = random.Random(1603)
    fill_ellipse(img, 22, 15, 15, 6, lambda nx, ny: STICK[0] if ny > 0.2 else STICK[1])
    nest_sticks(img, rng, 22, 15, 15, 6, 46, False)
    fill_ellipse(img, 22, 13, 9, 3, lambda nx, ny: STICK[0])
    # Bocian w gnieździe: biały tułów, czarne lotki, szyja, głowa z czerwonym dziobem.
    fill_ellipse(img, 21, 10, 7, 4.5, lambda nx, ny: STORK[2] if nx + ny < 0.2 else STORK[1])
    rect(img, 22, 8, 27, 11, INK)
    rect(img, 23, 8, 26, 8, ok(.32, .012, 280))
    line(img, 16, 9, 14, 5, STORK[1])
    fill_ellipse(img, 13.5, 4, 2.6, 2.4, lambda nx, ny: STORK[2] if nx < 0.3 else STORK[1])
    line(img, 11, 4, 5, 5, BEAK[1])
    line(img, 11, 5, 6, 6, BEAK[0])
    img.put(13, 3, INK)
    outline(img, OUT)
    return img


@prop('arena-nest-broken', 44, 24)
def nest_broken():
    img = Img(44, 24)
    rng = random.Random(1604)
    nest_sticks(img, rng, 22, 14, 15, 6, 34, True)
    for (x, y) in ((14, 12), (28, 16), (20, 18)):  # pióra
        line(img, x, y, x + 3, y - 1, STORK[2])
    outline(img, OUT)
    return img


@prop('arena-hedge', 32, 40)
def hedge():
    img = Img(32, 40)
    rng = random.Random(1605)
    # Blok żywopłotu: ciemna bryła, liście kępami (jaśniej z góry i z lewej), kilka czerwonych kwiatów Wiedźmy.
    for y in range(4, 37):
        for x in range(1, 31):
            img.put(x, y, LEAF[0] if y > 30 else LEAF[1])
    for _ in range(110):
        x, y = rng.randint(1, 29), rng.randint(3, 33)
        top = 1 - (y - 3) / 30
        c = LEAF[4] if rng.random() < 0.25 * top + 0.1 * (x < 14) else LEAF[3] if rng.random() < 0.5 else LEAF[2]
        for dx, dy in ((0, 0), (1, 0), (0, 1)):
            if img.p[min(36, y + dy)][min(30, x + dx)][3]:
                img.put(x + dx, y + dy, c)
    # Nierówny wierzch.
    for x in range(1, 31):
        for y in range(3, 3 + rng.choice((0, 1, 1, 2))):
            img.put(x, y, CLR)
    for (x, y) in ((8, 14), (22, 24), (15, 9)):
        img.put(x, y, BLOOM[1])
        img.put(x + 1, y, BLOOM[0])
        img.put(x, y - 1, BLOOM[2])
    outline(img, OUT)
    shadow(img, 16, 37.5, 16, 2.5)
    return img


# ---------------- arkusze ----------------

def build():
    out = {}
    for key, (w, h, fn) in PROPS.items():
        img = fn()
        assert (img.w, img.h) == (w, h), f'{key}: rozmiar {img.w}x{img.h} zamiast {w}x{h}'
        out[key] = img
    return out


def validate(images):
    errors = []
    for key, img in images.items():
        px = [c for row in img.p for c in row if c[3]]
        if not px:
            errors.append(f'{key}: pusty')
        if any(c[3] not in (255, SHADOW[3]) for c in px):
            errors.append(f'{key}: półprzezroczyste piksele poza cieniem')
        if any(c[:3] in ((0, 0, 0), (255, 255, 255)) for c in px):
            errors.append(f'{key}: czysta czerń/biel')
    return errors


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator rekwizytów zmiennych aren (piętra 6–7)')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 3x')
    a = ap.parse_args()
    images = build()
    errors = validate(images)
    if errors:
        for e in errors:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    for key, img in images.items():
        img.pil().save(os.path.join(a.out, f'{key}.png'))
        print(f'zapisano {key}.png {img.w}x{img.h}')
    if a.preview:
        from PIL import Image
        os.makedirs(a.preview, exist_ok=True)
        rows = []
        for floor in (MIRROR.floor[3], GARDEN.floor[2]):
            width = sum(img.w + 4 for img in images.values())
            bg = Image.new('RGBA', (width, 56), floor)
            x = 2
            for img in images.values():
                bg.alpha_composite(img.pil(), (x, 54 - img.h))
                x += img.w + 4
            rows.append(bg)
        sheet = Image.new('RGBA', (rows[0].width, 112))
        sheet.paste(rows[0], (0, 0))
        sheet.paste(rows[1], (0, 56))
        sheet.resize((sheet.width * 3, sheet.height * 3), Image.NEAREST).save(os.path.join(a.preview, 'arena-props_preview.png'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
