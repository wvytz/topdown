"""
Generator skarbca pająków (krok U4f, prośba właściciela 12.11.2026, `#ukryta-komnata`): ukryta komnata za areną
Króla Pająków ma wyglądać jak skarbiec potężnych, niepokonanych pająków — gęsto opleciona nićmi i śluzem,
a kokony skarbu stoją na piedestałach. Pozycje rekwizytów planuje czysty `dungeon/SpiderVault.ts`.

Użycie (z katalogu głównego repozytorium):
  python tools/spider_vault_sprites.py                       # pliki do public/assets/sprites/vault/
  python tools/spider_vault_sprites.py --preview tools/out   # dodatkowo podgląd 3x na posadzce Grzybni

Pliki (klatki w poziomym pasku):
  vault-pedestal.png        32x40 x4: piedestał z kamienia Grzybni, złota opaska z pajęczym znakiem, jedwab
                            spływa z narożników, w klatkach kropla śluzu spływa po licu
  vault-pedestal-grand.png  48x48 x4: wielki piedestał z dwoma stopniami, złota korona-pająk, czaszki pokonanych
  vault-silk.png            48x48 x6: jedwab na posadzce (sieć, mata, rozdarty płat, nici, mata ze śluzem, rzadkie nici)
  vault-slime.png           32x32 x4: kałuże mlecznego śluzu z połyskiem
  vault-corner-web.png      64x64: wielka sieć w narożniku (wzór NW; gra odbija go na inne narożniki)
  vault-curtain.png         32x32 x3: zasłony jedwabiu zwisające z lica północnego muru
  vault-husk.png            32x32 x2: zawinięte w jedwab ciała śmiałków (trofea pająków)
  vault-cocoon.png          64x64 x8: kokon skarbu 2x (własny model): złote taśmy, tętniący szew, złoto w rozdarciu;
                            0–3 spoczynek, 4–7 rozdarcie (klatka 7 = skorupy w gnieździe)

Zasady (STYLEGUIDE §3–4, §13.1): rekwizyty z obrysem 1 px #1b1a22, rampy z przesunięciem odcienia, bez czystej
bieli i czerni, piksele kryjące; cień kontaktowy ma stałą alfę 0,4. Nakładki posadzki (jedwab, śluz, sieć) bez
obrysu, jak pajęczyny-dekoracje.
"""
import argparse
import math
import os
import random
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import OUT, Img, ok, oks, outline
from arena_props import SHADOW, fill_ellipse, line, rect, shadow

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites', 'vault')
GROVE = trt.PALETTES['grzybnia']

# Kamień piedestałów: rampa muru Grzybni, o stopień jaśniejsza, żeby piedestał nie zlał się z murem.
STONE = GROVE.wall_top[1:6] + (GROVE.floor[5],)
# Jedwab: ta sama rampa co kokony leża (tools/lair_enemies.py, SILK) — nici czyta się jako „to samo, co kokon”.
SILK = (ok(.46, .030, 305), ok(.58, .030, 305), ok(.71, .026, 305), ok(.83, .020, 305), ok(.92, .014, 305))
# Śluz: mleczny, lekko zielonkawo-kremowy, z mokrym połyskiem.
SLIME = oks((.64, .024, 120), (.77, .026, 112), (.86, .022, 105), (.93, .014, 100), (.97, .008, 95))
GOLD = trt.GOLD
BONE = GROVE.bone
GLOW = GROVE.flame  # bioluminescencja Grzybni: drobiny w szczelinach piedestału


def lerp(a, b, t):
    return a + (b - a) * t


def thread(img, p0, p1, c, sag=0.0, hi=None, every=5):
    """Nić z ugięciem w dół (krzywa Béziera 2. stopnia), 1 px; co `every` piksel połysk `hi`."""
    (x0, y0), (x1, y1) = p0, p1
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + sag
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 1.5) + 2
    last = None
    k = 0
    for i in range(n + 1):
        t = i / n
        x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1
        y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1
        p = (int(round(x)), int(round(y)))
        if p == last:
            continue
        last = p
        k += 1
        img.put(p[0], p[1], hi if hi and k % every == 0 else c)


def blob_mask(w, h, circles):
    return [[any(((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1 for cx, cy, rx, ry in circles) for x in range(w)] for y in range(h)]


def poly_mask(w, h, poly):
    """Maska wielokąta (parzystość przecięć)."""
    out = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            px, py = x + .5, y + .5
            inside = False
            for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
                if (y0 > py) != (y1 > py) and px < x0 + (py - y0) * (x1 - x0) / (y1 - y0):
                    inside = not inside
            out[y][x] = inside
    return out


def edge_of(mask, x, y):
    h, w = len(mask), len(mask[0])
    return any(not (0 <= x + dx < w and 0 <= y + dy < h and mask[y + dy][x + dx]) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))


def slime_blob(img, circles, rng, sheen=True):
    """Kałuża śluzu: krawędź ciemniejsza, środek jaśniejszy, połysk przy lewej-górnej krawędzi."""
    mask = blob_mask(img.w, img.h, circles)
    for y in range(img.h):
        for x in range(img.w):
            if not mask[y][x]:
                continue
            if edge_of(mask, x, y):
                img.put(x, y, SLIME[0])
            else:
                inner = not edge_of(mask, x - 1, y) and not edge_of(mask, x, y - 1)
                img.put(x, y, SLIME[2] if inner else SLIME[1])
    if sheen:
        for cx, cy, rx, ry in circles:
            hx, hy = int(cx - rx * .35), int(cy - ry * .3)
            if 0 <= hy < img.h and 0 <= hx < img.w and mask[hy][hx]:
                img.put(hx, hy, SLIME[4])
                img.put(hx + 1, hy, SLIME[3])


def silk_sheet(img, mask, rng, weave=3):
    """Płat jedwabiu: tkany wzór ukośnych nici, krawędź jaśniejsza, pojedyncze połyski."""
    for y in range(img.h):
        for x in range(img.w):
            if not mask[y][x]:
                continue
            if edge_of(mask, x, y):
                img.put(x, y, SILK[3])
            elif (x + y) % weave == 0 or (x - y) % (weave + 1) == 0:
                img.put(x, y, SILK[2] if rng.random() < .7 else SILK[3])
            elif rng.random() < .55:
                img.put(x, y, SILK[1])
            if mask[y][x] and rng.random() < .015:
                img.put(x, y, SILK[4])


# ---------------- piedestały ----------------

def spider_glyph(img, cx, cy, big=False):
    """Pajęczy znak w złocie: odwłok, głowa i 8 nóg (na wielkim piedestale z koroną)."""
    fill_ellipse(img, cx + .5, cy + 1.5, 2.2 if big else 1.6, 2.4 if big else 1.8, lambda nx, ny: GOLD[3] if nx < -.2 and ny < -.2 else GOLD[2])
    img.put(cx, cy - 2, GOLD[2])
    if big:
        img.put(cx - 1, cy - 2, GOLD[2])
        img.put(cx + 1, cy - 2, GOLD[2])
    for side in (-1, 1):
        for i, (dx, dy) in enumerate(((3, -3), (4, -1), (4, 1), (3, 3))):
            s = 1.4 if big else 1.0
            x0, y0 = cx + side * 1, cy + i - 1
            line(img, x0, y0, int(round(cx + side * dx * s)), int(round(cy + dy * s)), GOLD[1] if i % 2 else GOLD[2])
    if big:  # korona: trzy zęby nad głową
        for dx in (-2, 0, 2):
            img.put(cx + dx, cy - 4, GOLD[3] if dx == 0 else GOLD[2])
            img.put(cx + dx, cy - 5, GOLD[2])


def stone_block(img, x0, y0, x1, y1, top_h):
    """Blok kamienia z góry pod kątem: jasny wierzch (`top_h` px), lico, oświetlony lewy brzeg, cień po prawej."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if y < y0 + top_h:
                c = STONE[4] if y == y0 else STONE[3]
            else:
                c = STONE[2] if x0 + 1 < x < x1 - 1 else (STONE[3] if x <= x0 + 1 else STONE[1])
            img.put(x, y, c)
    for x in range(x0, x1 + 1):  # krawędź wierzchu
        img.put(x, y0 + top_h, STONE[1])


def drape(img, side, x_edge, y_top, length, width, rng):
    """Jedwab spływający z narożnika: płat zwężający się w dół, poszarpany dół, nici ciągnące się dalej."""
    for dy in range(length):
        w = max(1, int(round(width * (1 - dy / length) + rng.uniform(-.6, .6))))
        for k in range(w):
            x = x_edge + side * k
            c = SILK[3] if k == 0 else (SILK[2] if (dy + k) % 3 else SILK[1])
            img.put(x, y_top + dy, c)
        if dy % 4 == 1:
            img.put(x_edge, y_top + dy, SILK[4])
    tip = (x_edge + side * 1, y_top + length)
    thread(img, tip, (tip[0] + side * rng.randint(1, 3), tip[1] + rng.randint(3, 6)), SILK[2])


def slime_drip(img, x, y_top, y_end, f, frames=4):
    """Kropla śluzu spływająca po licu: smuga do bieżącego miejsca kropli, połysk na kropli."""
    y = int(lerp(y_top, y_end, f / (frames - 1)))
    for yy in range(y_top, y):
        img.put(x, yy, SLIME[1])
    img.put(x, y, SLIME[3])
    img.put(x + 1, y, SLIME[2])
    img.put(x, y + 1, SLIME[2])
    img.put(x, y - 1 if y > y_top else y, SLIME[4])


def pedestal(f):
    w, h = 32, 40
    img = Img(w, h)
    rng = random.Random(9100)
    # Podstawa, smukły trzon, szeroki kapitel — między nimi prześwit, w którym widać nici
    stone_block(img, 4, 32, 27, 36, 2)
    stone_block(img, 10, 14, 21, 32, 0)
    for y in range(17, 31):  # żłobienie trzonu
        img.put(15, y, STONE[1])
    for x in range(10, 22):  # złote opaski
        img.put(x, 18, GOLD[1] if x in (10, 21) else GOLD[2])
        img.put(x, 30, GOLD[1])
    spider_glyph(img, 15, 24)
    stone_block(img, 5, 8, 26, 14, 4)
    for x in range(10, 22):  # cień kapitelu na trzonie
        img.put(x, 15, STONE[0])
    # Gniazdo z jedwabiu na wierzchu (tu stoi kokon)
    fill_ellipse(img, 16, 10, 8.5, 2.4, lambda nx, ny: SILK[3] if ny < 0 else SILK[2])
    fill_ellipse(img, 16, 10.3, 5, 1.3, lambda nx, ny: SILK[1])
    for x, y in ((18, 13), (19, 13), (19, 14)):
        img.put(x, y, SLIME[2])
    outline(img, OUT)
    # Nici bez obrysu: napięte w prześwitach między kapitelem a podstawą, płat jedwabiu z lewego narożnika
    for (a, b, sag) in (((6, 15), (5, 32), 1), ((8, 15), (9, 32), 2), ((25, 15), (26, 32), 1), ((23, 15), (22, 32), 2),
                        ((6, 16), (10, 27), 0), ((25, 16), (21, 25), 0), ((9, 22), (5, 31), 1)):
        thread(img, a, b, SILK[3], sag=sag, hi=SILK[4], every=4)
    drape(img, 1, 5, 13, 12, 3, rng)
    thread(img, (21, 16), (25, 31), SILK[2], sag=-1)
    img.put(22, 34, GLOW[2])  # bioluminescencja w szczelinie podstawy
    img.put(23, 34, GLOW[1])
    # Śluz: kałuże przy podstawie, kropla spływająca po trzonie
    slime_blob(img, [(9, 37, 4.5, 1.8), (13, 38, 2.5, 1.2)], rng)
    slime_blob(img, [(24, 37.5, 3.2, 1.4)], rng, sheen=False)
    slime_drip(img, 19, 15, 29, f)
    shadow(img, 16, 37.5, 14, 2.4)
    return img


def pedestal_grand(f):
    w, h = 48, 48
    img = Img(w, h)
    rng = random.Random(9200)
    stone_block(img, 2, 39, 45, 44, 2)   # dolny stopień
    stone_block(img, 6, 34, 41, 39, 2)   # górny stopień
    stone_block(img, 15, 15, 32, 34, 0)  # trzon
    for x in (18, 29):
        for y in range(19, 32):
            img.put(x, y, STONE[1])
    for x in range(15, 33):
        img.put(x, 19, GOLD[1] if x in (15, 32) else GOLD[2])
        img.put(x, 32, GOLD[1])
    spider_glyph(img, 23, 25, big=True)
    stone_block(img, 6, 7, 41, 15, 4)    # kapitel
    for x in range(7, 41, 3):            # złote ząbki na krawędzi kapitelu
        img.put(x, 13, GOLD[2])
    for x in range(15, 33):
        img.put(x, 16, STONE[0])
    fill_ellipse(img, 24, 9.5, 12, 2.8, lambda nx, ny: SILK[3] if ny < 0 else SILK[2])
    fill_ellipse(img, 24, 9.8, 7, 1.5, lambda nx, ny: SILK[1])
    for x, y in ((27, 14), (28, 14), (28, 15)):
        img.put(x, y, SLIME[2])
    # Czaszki pokonanych na stopniach
    for sx, sy in ((8, 41), (39, 36)):
        fill_ellipse(img, sx, sy, 2.4, 2.1, lambda nx, ny: BONE[2] if nx < 0 and ny < 0 else BONE[1])
        img.put(int(sx - 1), int(sy), OUT)
        img.put(int(sx + 1), int(sy), OUT)
        img.put(int(sx), int(sy + 1), BONE[0])
    outline(img, OUT)
    # Gęsta sieć w prześwitach między kapitelem a stopniem, płaty jedwabiu z obu narożników
    for (a, b, sag) in (((8, 16), (7, 34), 2), ((11, 16), (13, 34), 1), ((39, 16), (40, 34), 2), ((36, 16), (34, 34), 1),
                        ((7, 17), (15, 29), 0), ((40, 17), (32, 27), 0), ((13, 24), (7, 33), 1), ((34, 23), (41, 33), 1),
                        ((9, 26), (14, 18), 0), ((38, 26), (33, 18), 0)):
        thread(img, a, b, SILK[3], sag=sag, hi=SILK[4], every=4)
    drape(img, 1, 6, 14, 15, 4, rng)
    drape(img, -1, 41, 14, 12, 3, rng)
    for x, y in ((19, 36), (20, 36), (31, 42)):
        img.put(x, y, GLOW[2])
    slime_blob(img, [(13, 45, 6, 2), (19, 46, 3, 1.3)], rng)
    slime_blob(img, [(36, 45.5, 4.5, 1.6)], rng)
    slime_blob(img, [(27, 36, 3, 1.1)], rng, sheen=False)
    slime_drip(img, 28, 16, 31, f)
    slime_drip(img, 20, 17, 30, (f + 2) % 4)
    shadow(img, 24, 45.5, 22, 2.4)
    return img


# ---------------- nakładki posadzki ----------------

SILK_CELL = 48  # płat większy od kafla: gra kładzie go ze środkiem na kaflu i przesunięciem — bez widocznej siatki


def silk_floor(v):
    S = SILK_CELL
    img = Img(S, S)
    rng = random.Random(9300 + v)
    if v == 0:  # fragment sieci: szprychy i ugięte pierścienie
        cx, cy = rng.uniform(19, 29), rng.uniform(19, 29)
        spokes = [rng.uniform(0, math.tau) for _ in range(7)]
        spokes.sort()
        for a in spokes:
            thread(img, (cx, cy), (cx + math.cos(a) * 30, cy + math.sin(a) * 30), SILK[2], hi=SILK[3], every=3)
        for r in (5, 9, 14, 19):
            for a0, a1 in zip(spokes, spokes[1:] + spokes[:1]):
                p0 = (cx + math.cos(a0) * r, cy + math.sin(a0) * r)
                p1 = (cx + math.cos(a1) * r, cy + math.sin(a1) * r)
                thread(img, p0, p1, SILK[3], sag=-r * .12)
        img.put(int(cx), int(cy), SILK[4])
    elif v in (1, 2, 4):  # płat sieci: nieregularny wielokąt z dwiema rodzinami nici, zaczepy do krawędzi kafla
        cx, cy = rng.uniform(21, 27), rng.uniform(21, 27)
        n = rng.randint(6, 8)
        poly = []
        for k in range(n):
            a = math.tau * (k + rng.uniform(-.25, .25)) / n
            rad = rng.uniform(13, 22)
            poly.append((cx + math.cos(a) * rad, cy + math.sin(a) * rad * .85))
        mask = poly_mask(S, S, poly)
        if v == 2:  # rozdarcia
            for _ in range(3):
                hx_, hy_, hr = rng.uniform(12, 36), rng.uniform(12, 36), rng.uniform(3, 6)
                for y in range(S):
                    for x in range(S):
                        if (x + .5 - hx_) ** 2 + (y + .5 - hy_) ** 2 <= hr * hr:
                            mask[y][x] = False
        a0 = rng.uniform(0, math.pi)
        for ang, col in ((a0, SILK[2]), (a0 + math.radians(rng.uniform(55, 80)), SILK[3])):
            dx, dy = math.cos(ang), math.sin(ang)
            for off in range(-34, 35, 4):
                px_, py_ = S / 2 - dy * off, S / 2 + dx * off
                for t in range(-34, 35):
                    x, y = int(round(px_ + dx * t)), int(round(py_ + dy * t))
                    if 0 <= x < S and 0 <= y < S and mask[y][x]:
                        img.put(x, y, col)
        for a, b in zip(poly, poly[1:] + poly[:1]):  # obrzeże płata (bez rozdarć)
            thread(img, a, b, SILK[3], sag=rng.uniform(-1.5, 1.5), hi=SILK[4], every=7)
        for a in rng.sample(poly, 3):  # zaczepy do krawędzi kafla — łączą płaty sąsiednich kafli
            ex = 0 if a[0] < S / 2 else S - 1
            ey = 0 if a[1] < S / 2 else S - 1
            end_ = (ex, a[1]) if rng.random() < .5 else (a[0], ey)
            thread(img, a, end_, SILK[2])
        if v == 2:
            for _ in range(4):  # zwisające, zerwane nici przy rozdarciach
                x, y = rng.randint(10, 37), rng.randint(10, 37)
                if mask[y][x]:
                    thread(img, (x, y), (x + rng.randint(-3, 3), y + rng.randint(2, 5)), SILK[3])
        if v == 4:
            slime_blob(img, [(rng.uniform(18, 30), rng.uniform(18, 30), 5, 2.6), (rng.uniform(14, 34), rng.uniform(14, 34), 2.5, 1.5)], rng)
            for _ in range(6):
                img.put(rng.randint(8, 39), rng.randint(8, 39), SLIME[3])
    elif v in (3, 5):  # nici przez kafel (końce na krawędziach — łączą się z sąsiadami)
        n = 7 if v == 3 else 4
        for _ in range(n):
            side = rng.randrange(4)
            e = S - 1
            a = (rng.uniform(0, e), 0) if side == 0 else (0, rng.uniform(0, e)) if side == 1 else (rng.uniform(0, e), e) if side == 2 else (e, rng.uniform(0, e))
            b = (e - a[0], e - a[1]) if rng.random() < .6 else (rng.uniform(0, e), rng.choice((0, e)))
            thread(img, a, b, rng.choice((SILK[2], SILK[3])), sag=rng.uniform(-3, 3), hi=SILK[4], every=6)
        if v == 3:
            for _ in range(3):
                x, y = rng.randint(6, 41), rng.randint(6, 41)
                img.put(x, y, SLIME[3])
    return img


def slime_floor(v):
    img = Img(32, 32)
    rng = random.Random(9400 + v)
    circles = [(rng.uniform(10, 22), rng.uniform(12, 20), rng.uniform(5, 8), rng.uniform(3, 4.5))]
    for _ in range(1 + v % 3):
        cx, cy, _, _ = circles[0]
        circles.append((cx + rng.uniform(-8, 8), cy + rng.uniform(-6, 6), rng.uniform(2.5, 4.5), rng.uniform(1.6, 3)))
    slime_blob(img, circles, rng)
    for _ in range(2 + v):  # krople i nitki śluzu
        cx, cy, rx, ry = rng.choice(circles)
        a = rng.uniform(0, math.tau)
        x, y = cx + math.cos(a) * (rx + rng.uniform(2, 5)), cy + math.sin(a) * (ry + rng.uniform(2, 4))
        thread(img, (cx + math.cos(a) * rx * .8, cy + math.sin(a) * ry * .8), (x, y), SLIME[1])
        img.put(int(x), int(y), SLIME[2])
    if v == 3:  # pęcherzyki
        for _ in range(3):
            cx, cy, rx, ry = circles[0]
            x, y = int(cx + rng.uniform(-rx * .5, rx * .5)), int(cy + rng.uniform(-ry * .4, ry * .4))
            img.put(x, y, SLIME[0])
            img.put(x - 1, y - 1, SLIME[4])
    return img


def corner_web():
    """Wielka sieć w narożniku NW: masa jedwabiu w kącie, szprychy, ugięte pierścienie, krople i zawinięta ofiara."""
    img = Img(64, 64)
    rng = random.Random(9500)
    spokes = [math.radians(a) for a in (0, 14, 29, 45, 61, 76, 90)]
    for i, a in enumerate(spokes):
        r = 62 if 1 <= i <= 5 else 63
        thread(img, (0, 0), (math.cos(a) * r, math.sin(a) * r), SILK[3] if i % 2 else SILK[2], hi=SILK[4], every=4)
    for r in (9, 15, 22, 30, 39, 48, 57):
        for a0, a1 in zip(spokes, spokes[1:]):
            jitter = rng.uniform(-1, 1)
            p0 = (math.cos(a0) * (r + jitter), math.sin(a0) * (r + jitter))
            p1 = (math.cos(a1) * (r - jitter), math.sin(a1) * (r - jitter))
            if r > 50 and rng.random() < .35:
                continue  # rozdarcia na skraju
            thread(img, p0, p1, SILK[2] if r > 30 else SILK[3], sag=-r * .08)
            if rng.random() < .3:
                img.put(int(p0[0]), int(p0[1]), SLIME[3])
    mask = blob_mask(64, 64, [(0, 0, 13, 13), (6, 2, 8, 5), (2, 7, 5, 8)])
    silk_sheet(img, mask, rng)
    slime_blob(img, [(9, 8, 3.2, 2.2)], rng)
    # Zawinięta ofiara zaplątana w sieć
    fill_ellipse(img, 25, 27, 3.2, 5, lambda nx, ny: SILK[3] if nx < -.2 else (SILK[1] if nx > .4 else SILK[2]))
    for y in range(23, 32, 2):
        img.put(24, y, SILK[1])
        img.put(26, y + 1, SILK[4])
    img.put(25, 22, BONE[1])
    return img


def curtain(v):
    """Zasłona jedwabiu zwisająca z wierzchu muru na lico: płaty, poszarpany dół, nici i krople śluzu."""
    img = Img(32, 32)
    rng = random.Random(9600 + v)
    x = rng.randint(0, 4)
    while x < 30:
        w = rng.randint(4, 8)
        length = rng.randint(10, 22) if v != 1 else rng.randint(16, 28)
        for dx in range(w):
            col_len = int(length * (1 - abs(dx - w / 2) / w * .9)) + rng.randint(-2, 1)
            for y in range(col_len):
                c = SILK[3] if dx in (0, w - 1) else (SILK[2] if (y + dx) % 4 else SILK[1])
                img.put(x + dx, y, c)
            if dx == w // 2:
                img.put(x + dx, col_len, SLIME[2])
                img.put(x + dx, col_len + 1, SLIME[3])
        thread(img, (x + w // 2, length - 2), (x + w // 2 + rng.randint(-2, 2), min(31, length + rng.randint(4, 9))), SILK[3])
        x += w + rng.randint(0, 3)
    if v == 2:  # kokon-ofiara na nici
        thread(img, (16, 0), (16, 14), SILK[3])
        fill_ellipse(img, 16.5, 20, 3.5, 6, lambda nx, ny: SILK[3] if nx < -.3 else (SILK[1] if nx > .4 else SILK[2]))
        for y in range(16, 25, 2):
            img.put(15, y, SILK[1])
        img.put(16, 26, BONE[1])
    for y in range(img.h):  # obrys tylko tam, gdzie zasłona dotyka ciemnego lica — kontur czytelny w mroku
        pass
    return img


def husk(v):
    """Śmiałek zawinięty w jedwab: podłużny kokon na posadzce, z jednego końca wystaje czaszka, z boku kość dłoni."""
    img = Img(32, 32)
    rng = random.Random(9700 + v)
    cx, cy = 16, 17
    rx, ry = (11, 4.2) if v == 0 else (4.2, 10)
    fill_ellipse(img, cx, cy, rx, ry, lambda nx, ny: SILK[3] if (nx + ny) < -.6 else (SILK[1] if (nx + ny) > .7 else SILK[2]))
    for k in range(-9, 10, 3):  # pasma oplotu w poprzek
        if v == 0:
            line(img, cx + k, cy - 3, cx + k + 2, cy + 3, SILK[1])
        else:
            line(img, cx - 3, cy + k, cx + 3, cy + k + 2, SILK[1])
    sx, sy = (cx + rx + 1, cy - 1) if v == 0 else (cx, cy - ry - 1)
    fill_ellipse(img, sx, sy, 2.6, 2.3, lambda nx, ny: BONE[2] if nx < 0 and ny < 0 else BONE[1])
    img.put(int(sx) - 1, int(sy), OUT)
    img.put(int(sx) + 1, int(sy), OUT)
    hx_, hy_ = (cx - 3, cy + 5) if v == 0 else (cx + 5, cy + 2)
    for d in range(3):
        img.put(hx_ + d, hy_ + (d % 2), BONE[1])
    outline(img, OUT)
    slime_blob(img, [(cx - rx * .5, cy + ry + 1.5, 4, 1.4)], rng)
    shadow(img, cx, cy + 2, rx + 2, ry + 1)
    return img


# ---------------- kokon skarbu 2x (krok U4f, prośba właściciela: „własny, dwukrotnie większy model”) ----------------
COCOON2 = 64
CX2, CY2, RX2, RY2 = 32, 34, 13, 19  # środek ciała; stopa (CY2 + RY2) 21 px pod środkiem klatki
GLINTS2 = ((-7, -10), (4, -3), (-3, 7), (8, 4))


def egg_shade(nx, ny):
    """Jedwab kokonu skarbu: pasmowe cieniowanie z rampy SILK, światło z lewej-góry."""
    d = (nx + .45) ** 2 + (ny + .5) ** 2
    r = nx * nx + ny * ny
    if r > .8 and (nx > .05 or ny > .3):
        return SILK[0]
    if d < .08:
        return SILK[4]
    if d < .5:
        return SILK[3]
    if d < 1.2:
        return SILK[2]
    return SILK[1]


def egg_body(img, cx, cy, rx, ry, rng):
    # Jajo: szersze u dołu
    for y in range(img.h):
        for x in range(img.w):
            ny = (y + .5 - cy) / ry
            rxx = rx * (1 + .12 * ny)
            nx = (x + .5 - cx) / rxx
            if nx * nx + ny * ny <= 1:
                img.put(x, y, egg_shade(nx, ny))
                if nx * nx + ny * ny < .85:
                    if (x - cx + (y - cy) * .8) % 5 < 1:
                        img.put(x, y, SILK[1])
                    elif (x - cx - (y - cy) * .8) % 7 < 1 and egg_shade(nx, ny) != SILK[0]:
                        img.put(x, y, SILK[3])


def gold_band(img, p0, p1, width=2):
    """Złota taśma oplotu: pas z jaśniejszą górną krawędzią, tylko na ciele kokonu."""
    (x0, y0), (x1, y1) = p0, p1
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for i in range(n + 1):
        t = i / n
        x, y = int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t))
        for k in range(width):
            c = img.get(x, y + k)
            if c and c[3] and c != OUT:
                img.put(x, y + k, GOLD[3] if k == 0 and i % 4 == 0 else (GOLD[2] if k == 0 else GOLD[1]))


def vault_cocoon_frame(f):
    """Kokon skarbu 2x: wielkie jajo z jedwabiu przewiązane złotymi taśmami, złoty szew tętni światłem, a przez
    rozdarcie w oplocie widać złoto w środku. 0–3 spoczynek (puls szwu, wędrujący błysk), 4–7 rozdarcie; klatka 7 =
    skorupy w gnieździe."""
    img = Img(COCOON2, COCOON2)
    rng = random.Random(9800 + f)
    cx, cy, rx, ry = CX2, CY2, RX2, RY2
    if f < 4:
        egg_body(img, cx, cy, rx, ry, rng)
        gold_band(img, (cx - rx, cy - 9), (cx + rx, cy + 1))
        gold_band(img, (cx - rx, cy + 2), (cx + rx, cy - 8))
        gold_band(img, (cx - rx - 1, cy + 9), (cx + rx + 2, cy + 9))
        pulse = (1, 2, 3, 2)[f]
        for y in range(cy - 15, cy + 14):  # szew
            img.put(cx, y, GOLD[pulse])
            if pulse >= 2 and abs(y - cy) < 9:
                img.put(cx - 1, y, GOLD[pulse - 1])
        # Rozdarcie w oplocie: przez nie widać złoto w środku
        fill_ellipse(img, cx + 6.5, cy - 3, 3.4, 2.8, lambda nx, ny: OUT)
        for x, y, c in ((cx + 5, cy - 3, GOLD[2]), (cx + 6, cy - 3, GOLD[3]), (cx + 7, cy - 2, GOLD[2]), (cx + 8, cy - 3, GOLD[1]),
                        (cx + 6, cy - 2, GOLD[1]), (cx + 7, cy - 4, GOLD[3] if f % 2 else GOLD[2])):
            img.put(x, y, c)
        # Węzeł na czubku i nici w górę
        fill_ellipse(img, cx, cy - ry - 1, 3.5, 2.2, lambda nx, ny: SILK[3] if ny < 0 else SILK[2])
        outline(img, OUT)
        for dx in (-3, 0, 4):
            thread(img, (cx + dx * .5, cy - ry - 2), (cx + dx * 2, 1), SILK[3], sag=1, hi=SILK[4], every=4)
        for side in (-1, 1):  # nici kotwiczące do gniazda
            thread(img, (cx + side * rx * .7, cy + ry * .75), (cx + side * (rx + 5), cy + ry + 3), SILK[3], sag=1)
        gx, gy = GLINTS2[f]
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            img.put(cx + gx + dx, cy + gy + dy, SILK[4] if (dx, dy) != (0, 0) else GOLD[3])
        return img
    if f == 4:  # pęknięcie: szew rozchodzi się w złotą szczelinę, promienie
        egg_body(img, cx, cy, rx + 1, ry + 1, rng)
        for y in range(cy - 16, cy + 15):
            w = 1 if abs(y - cy) > 11 else (2 if abs(y - cy) > 5 else 3)
            for x in range(cx - w + 1, cx + w):
                img.put(x, y, GOLD[3] if abs(x - cx) < 1 else GOLD[2])
        outline(img, OUT)
        for a in range(8):
            ang = a * math.tau / 8 + .2
            for d in range(rx + 4, rx + 9, 2):
                img.put(int(cx + math.cos(ang) * d), int(cy + math.sin(ang) * d * 1.2), GOLD[3] if d < rx + 7 else GOLD[2])
        return img
    k = f - 5  # 0..2: połówki skorupy rozchylają się i opadają do gniazda, w środku widać pusty, ciemny środek
    spread = (6, 10, 12)[k]
    for side in (-1, 1):
        hx_ = cx + side * spread
        ry_ = (16, 12, 8)[k]
        cy_ = cy + ry - ry_
        fill_ellipse(img, hx_, cy_, 8, ry_, lambda nx, ny, s=side: SILK[1] if nx * s > .35 else (SILK[3] if ny < -.3 else SILK[2]))
        # wnętrze skorupy od strony środka (ciemne, ze złotym pyłem)
        fill_ellipse(img, hx_ - side * 3.5, cy_ - 1, 4.2, ry_ * .75, lambda nx, ny: SILK[0])
        for _ in range(3):
            img.put(int(hx_ - side * 3.5 + rng.randint(-2, 2)), int(cy_ + rng.randint(-ry_ // 2, ry_ // 2)), GOLD[2])
        gold_band(img, (hx_ - 7, cy_ + ry_ // 3), (hx_ + 7, cy_ + ry_ // 3))
    if k < 2:  # złoty pył w środku
        for _ in range(10 - k * 4):
            img.put(cx + rng.randint(-4, 4), cy + rng.randint(-6, 12), GOLD[rng.randint(2, 3)])
    outline(img, OUT)
    for _ in range((8, 6, 4)[k]):  # nitki, część złota
        a = rng.uniform(0, math.tau)
        d = rng.uniform(10, 14 + spread)
        px_, py_ = cx + math.cos(a) * d, cy + 6 + math.sin(a) * d * .6
        thread(img, (px_, py_), (px_ + math.cos(a) * 3, py_ + math.sin(a) * 2), GOLD[1] if rng.random() < .45 else SILK[3])
    return img


SHEETS = {
    'vault-pedestal': (32, 40, [pedestal(f) for f in range(4)]),
    'vault-pedestal-grand': (48, 48, [pedestal_grand(f) for f in range(4)]),
    'vault-silk': (SILK_CELL, SILK_CELL, [silk_floor(v) for v in range(6)]),
    'vault-slime': (32, 32, [slime_floor(v) for v in range(4)]),
    'vault-corner-web': (64, 64, [corner_web()]),
    'vault-curtain': (32, 32, [curtain(v) for v in range(3)]),
    'vault-husk': (32, 32, [husk(v) for v in range(2)]),
    'vault-cocoon': (COCOON2, COCOON2, [vault_cocoon_frame(f) for f in range(8)]),
}


def strip(w, h, frames):
    sheet = Img(w * len(frames), h)
    for i, img in enumerate(frames):
        assert (img.w, img.h) == (w, h)
        for y in range(h):
            for x in range(w):
                sheet.p[y][i * w + x] = img.p[y][x]
    return sheet


def validate():
    errors = []
    for key, (_, _, frames) in SHEETS.items():
        for i, img in enumerate(frames):
            px = [c for row in img.p for c in row if c[3]]
            if not px:
                errors.append(f'{key}[{i}]: pusta klatka')
            if any(c[3] not in (255, SHADOW[3]) for c in px):
                errors.append(f'{key}[{i}]: półprzezroczyste piksele poza cieniem')
            if any(c[:3] in ((0, 0, 0), (255, 255, 255)) for c in px):
                errors.append(f'{key}[{i}]: czysta czerń/biel')
    return errors


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator skarbca pająków (ukryta komnata Grzybni)')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 3x')
    a = ap.parse_args()
    errors = validate()
    if errors:
        for e in errors:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    for key, (w, h, frames) in SHEETS.items():
        strip(w, h, frames).pil().save(os.path.join(a.out, f'{key}.png'))
        print(f'zapisano {key}.png {w}x{h} x{len(frames)}')
    if a.preview:
        from PIL import Image
        os.makedirs(a.preview, exist_ok=True)
        rows = [strip(w, h, frames).pil() for w, h, frames in SHEETS.values()]
        width = max(r.width for r in rows) + 8
        height = sum(r.height + 6 for r in rows) + 6
        bg = Image.new('RGBA', (width, height), GROVE.floor[2])
        y = 4
        for r in rows:
            bg.alpha_composite(r, (4, y))
            y += r.height + 6
        bg.resize((width * 3, height * 3), Image.NEAREST).save(os.path.join(a.preview, 'spider-vault_preview.png'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
