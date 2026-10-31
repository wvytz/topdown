"""Mieszkanie nałogowego gracza (krok 138): kafle piętra 5 zamiast kamiennej palarni.

Moduł pomocniczy generatora `tower_ruins_tiles.py` (biom `smoke_den`, dodatek `gamer`). Podmienia rysowanie kafli
wspólnych (podłoga, mury, lica, nakładki ruin) i dopisuje własne nakładki: pudełka po pizzy, chipsy, ubrania,
pady, kable, papiery, butelki, sterty śmieci.

Zasada „ma się zlewać” (prośba właściciela): śmieci w przygaszonych barwach, obrysowane najciemniejszym tonem
wykładziny zamiast czarnego obrysu postaci i z cieniem w tonie fugi — tworzą z podłogą jedną warstwę, a postacie
z ciemnym obrysem dalej odcinają się od tła.

Generator wywołuje `apply(manifest, Entry, kit)`; `kit` podaje płótno, obrys i stałe arkusza (bez importu
w drugą stronę, bo `tower_ruins_tiles` uruchamia się jako skrypt).
"""
import dataclasses
import math
import random

K = None  # zestaw z generatora: Img, outline, T, FACE, CLR, flame_base_y

# Indeksy rampy `Palette.junk` (kolejność jak w palecie `mieszkanie_gracza`).
CB0, CB1, CB2 = 0, 1, 2          # karton: cień, karton, jasny
GREASE = 3                       # tłuszcz na kartonie
RED0, RED1 = 4, 5                # sos, salami
CHEESE, CRUST = 6, 7             # ser, skórka
CL0, CL1, CL2 = 8, 9, 10         # szara tkanina
DN0, DN1 = 11, 12                # dżins
WH0, WH1 = 13, 14                # brudna biel, jej cień
PL0, PL1, PL2 = 15, 16, 17       # czarny plastik: cień, plastik, blask
BR, BG, BB, BY = 18, 19, 20, 21  # przyciski pada
OR0, OR1 = 22, 23                # torebka chipsów
FOIL = 24                        # folia, srebro
GL0, GL1 = 25, 26                # szkło butelki
BLT = 27                         # jasny plastik butelki
SCREEN, TEAL = 28, 29            # ekran, plakat
WD0, WD1, WD2 = 30, 31, 32       # drewno (listwy, półki, futryny)
RUG0, RUG1, RUGB, RUGN = 33, 34, 35, 36  # dywan: bordo cień, bordo, beż, granat
GR0, GR1, GR2 = 37, 38, 39       # tłuszcz: cień, bursztyn, połysk (krok 138a)
SL0, SL1, SL2 = 40, 41, 42       # śluz
MO0, MO1, MO2 = 43, 44, 45       # grzyb: plama, nalot, meszek


# ---------------- prymitywy ----------------
def canvas(w=1, h=1):
    return K.Img(w * K.T, h * K.T)


def box(img, x0, y0, w, h, c):
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            img.put(x, y, c)


def line(img, x0, y0, x1, y1, c):
    n = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(n + 1):
        img.put(round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n), c)


def ellipse(img, cx, cy, rx, ry, fn):
    """Wypełniona elipsa; fn(nx, ny) zwraca kolor (nx, ny w −1..1) albo None."""
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            nx, ny = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            if nx * nx + ny * ny <= 1:
                c = fn(nx, ny)
                if c:
                    img.put(x, y, c)


def lit3(dark, mid, hi):
    """Cieniowanie pasmowe kształtu oświetlonego z północy (bez gradientu)."""
    return lambda nx, ny: hi if ny < -.45 else (dark if ny > .5 else mid)


def finish(tile, item, p, ox=0, oy=0, shadow=True):
    """Obrys najciemniejszym tonem wykładziny i cień w tonie fugi — śmieć wtapia się w podłogę."""
    K.outline(item, p.floor[0])
    if shadow:
        add = []
        for y in range(item.h):
            for x in range(item.w):
                if item.p[y][x][3]:
                    for dx, dy in ((0, 1), (1, 1)):
                        n = item.get(x + dx, y + dy)
                        if n is not None and n[3] == 0:
                            add.append((x + dx, y + dy))
        for x, y in add:
            item.put(x, y, p.floor[1])
    tile.blit(item, ox, oy)


def wavy(img, r, x0, y0, x1, y1, c, hi=None, amp=2.0, waves=1.5, width=1):
    """Kabel: sinusoida między punktami, z blaskiem na górnej krawędzi."""
    n = int(math.hypot(x1 - x0, y1 - y0) * 2) + 1
    ph = r.uniform(0, math.pi * 2)
    nx, ny = -(y1 - y0), (x1 - x0)
    ln = math.hypot(nx, ny) or 1
    nx, ny = nx / ln, ny / ln
    pts = []
    for i in range(n + 1):
        t = i / n
        o = amp * math.sin(ph + t * waves * 2 * math.pi)
        pts.append((round(x0 + (x1 - x0) * t + nx * o), round(y0 + (y1 - y0) * t + ny * o)))
    for x, y in pts:
        for k in range(width):
            img.put(x, y + k, c)
    if hi:
        for x, y in pts[::5]:
            img.put(x, y, hi)
    return pts


# ---------------- śmieci (każdy rysuje na własnym płótnie i kończy `finish`) ----------------
def pizza_box(tile, p, r, x0, y0, w=17, h=15, opened=False):
    J, it = p.junk, K.Img(tile.w, tile.h)
    if opened:  # wieko odchylone na płasko nad pudełkiem: od środka jaśniejsze, z tłustym odciskiem
        box(it, x0, y0 - h + 2, w, h - 2, J[CB2])
        box(it, x0, y0 - 1, w, 1, J[CB0])
        ellipse(it, x0 + w / 2 + r.uniform(-2, 2), y0 - h / 2 + 1, w * .3, h * .22, lambda nx, ny: J[GREASE])
    box(it, x0, y0, w, h, J[CB1])
    box(it, x0, y0, w, 1, J[CB2])
    box(it, x0, y0 + h - 1, w, 1, J[CB0])
    box(it, x0 + w - 1, y0, 1, h, J[CB0])
    if opened:  # wnętrze: tłuszcz i skórki
        box(it, x0 + 1, y0 + 1, w - 2, h - 2, J[CB2])
        ellipse(it, x0 + w / 2, y0 + h / 2, w * .38, h * .36, lambda nx, ny: J[GREASE] if r.random() < .55 else None)
        for _ in range(r.randint(2, 3)):  # zjedzone kawałki zostawiają łuki skórki
            cx, cy = x0 + r.randint(3, w - 4), y0 + r.randint(3, h - 4)
            for a in range(0, 180, 30):
                it.put(round(cx + 2.5 * math.cos(math.radians(a + r.randint(0, 90)))),
                       round(cy + 1.5 * math.sin(math.radians(a))), J[CRUST])
            it.put(cx, cy, J[CB0])
    else:  # wieko: rowek wieczka, tłusta plama i blade logo pizzerii
        for x in range(x0 + 2, x0 + w - 2):
            it.put(x, y0 + 2, J[CB0])
        ellipse(it, x0 + r.uniform(5, w - 5), y0 + r.uniform(6, h - 4), r.uniform(2.5, 4), r.uniform(2, 3),
                lambda nx, ny: J[GREASE])
        lx, ly = x0 + w // 2 - 2, y0 + 5
        ellipse(it, lx + 2, ly + 2, 2.4, 2.2, lambda nx, ny: J[RED0] if nx * nx + ny * ny > .3 else J[CB1])
    finish(tile, it, p)


def pizza_slice(tile, p, r, cx, cy, flip=False):
    J, it = p.junk, K.Img(tile.w, tile.h)
    for i in range(10):  # trójkąt ostrzem w dół, skórka u góry
        half = 5 - i // 2
        for x in range(cx - half, cx + half + 1):
            if i < 2:
                c = J[CRUST] if i == 1 else J[CB2]
            else:
                c = J[CHEESE] if (x + i) % 5 else J[CB2]
            it.put(x, cy + i, c)
    for dx, dy in ((-2, 3), (1, 4), (0, 7)):  # salami
        it.put(cx + dx, cy + dy, J[RED1])
        it.put(cx + dx + 1, cy + dy, J[RED0])
    finish(tile, it, p)


def chip_bag(tile, p, r, cx, cy):
    J, it = p.junk, K.Img(tile.w, tile.h)
    w, h = r.randint(9, 11), r.randint(7, 8)
    for y in range(h):
        for x in range(w):
            if (x in (0, w - 1) and y in (0, h - 1)) or (x == w - 1 and r.random() < .4):
                continue
            c = J[OR1]
            if y == 0:
                c = J[FOIL] if x % 2 else J[WH1]  # zgrzew z ząbkami
            elif y == h - 1 or (x + y * 3) % 7 == 0:
                c = J[OR0]  # zmięcia
            it.put(cx - w // 2 + x, cy - h // 2 + y, c)
    it.put(cx - 1, cy, J[FOIL])
    it.put(cx + 2, cy + 1, J[CHEESE])
    finish(tile, it, p)
    for _ in range(r.randint(5, 9)):  # okruchy chipsów obok torebki
        tile.put(cx + r.randint(-9, 9), cy + r.randint(3, 9), J[r.choice((CHEESE, OR0, CRUST))])


def noodle_cup(tile, p, r, cx, cy):
    """Przewrócony kubek zupki: walec z czerwonym paskiem i rozlany wywar."""
    J, it = p.junk, K.Img(tile.w, tile.h)
    ellipse(tile, cx + 7, cy + 2, 5.5, 3.2, lambda nx, ny: p.stain[1] if nx * nx + ny * ny < .4 else p.stain[0])
    for i in range(9):
        half = 3 + i // 4
        for k in range(-half, half + 1):
            c = J[WH0] if k < half - 1 else J[WH1]
            if i in (3, 4):
                c = J[RED1] if k < half - 1 else J[RED0]
            it.put(cx - 4 + i, cy + k, c)
    for k in range(-5, 6):  # otwarty wylot, w środku makaron
        it.put(cx + 5, cy + k, J[CB0] if abs(k) < 5 else J[WH1])
    it.put(cx + 6, cy - 1, J[CHEESE])
    it.put(cx + 7, cy + 1, J[CHEESE])
    it.put(cx + 8, cy, J[CHEESE])
    finish(tile, it, p)


def sock(tile, p, r, cx, cy, flip=False):
    """Brudna skarpeta: wygięta rurka z szarą piętą i palcami."""
    J, it = p.junk, K.Img(tile.w, tile.h)
    s = -1 if flip else 1
    for i in range(10):
        a = math.radians(i * 9)  # łuk od cholewki do palców
        x, y = cx + s * 4 * (1 - math.cos(a)), cy + i
        for k in range(3):
            c = J[WH0] if k == 0 else (J[WH1] if k == 1 else J[CL2])
            if i >= 8:
                c = J[CL1] if k else J[CL2]  # przybrudzone palce
            elif i == 0:
                c = J[CL2]  # ściągacz
            it.put(x + s * k, y, c)
    finish(tile, it, p)


def tshirt(tile, p, r, cx, cy, ramp=(CL0, CL1, CL2)):
    J, it = p.junk, K.Img(tile.w, tile.h)
    d, m, h = (J[i] for i in ramp)
    for y in range(12):
        for x in range(-7, 8):
            body = abs(x) <= 4 and y >= 1
            sleeve = y <= 4 and abs(x) <= 7 - (1 if y > 2 else 0)
            if not (body or sleeve) or (y == 0 and abs(x) <= 1):  # dekolt
                continue
            c = h if y <= 1 else (d if y >= 10 or (x + y) % 9 == 0 else m)
            it.put(cx + x + (1 if y > 6 and r.random() < .15 else 0), cy + y, c)
    finish(tile, it, p)


def jeans(tile, p, r, cx, cy):
    J, it = p.junk, K.Img(tile.w, tile.h)
    for y in range(4):  # pas
        for x in range(-6, 7):
            it.put(cx + x, cy + y, J[DN1] if y else J[DN0])
    for leg, bend in ((-1, -1), (1, 2)):
        for y in range(4, 18):
            off = (y - 4) * bend // 6
            for k in range(5):
                x = cx + (leg * 3 if leg > 0 else -6) + k + off
                it.put(x, cy + y, J[DN0] if k == 4 or y == 17 else J[DN1])
    it.put(cx - 4, cy + 1, J[FOIL])
    finish(tile, it, p)


def controller(tile, p, r, cx, cy, broken=False):
    J, it = p.junk, K.Img(tile.w, tile.h)
    ellipse(it, cx, cy, 7.5, 4.2, lit3(J[PL0], J[PL1], J[PL2]))
    for side in (-1, 1):  # uchwyty
        ellipse(it, cx + side * 5, cy + 4, 2.6, 3.2, lit3(J[PL0], J[PL1], J[PL1]))
    for d in (-1, 0, 1):  # krzyżak
        it.put(cx - 5 + d, cy - 1, J[PL0])
        it.put(cx - 5, cy - 1 + d, J[PL0])
    for dx, dy, b in ((4, -2, BY), (3, -1, BB), (5, -1, BR), (4, 0, BG)):
        it.put(cx + dx, cy + dy, J[b])
    it.put(cx - 2, cy + 1, J[PL0])
    it.put(cx + 2, cy + 1, J[PL0])
    if broken:  # pęknięty po rage-quicie: szczelina przez obudowę, brak przycisku, gałka obok
        line(it, cx, cy - 4, cx + 1, cy + 5, J[PL0])
        it.put(cx + 5, cy - 1, J[PL0])
        ellipse(it, cx + 10, cy + 6, 1.4, 1.2, lambda nx, ny: J[PL1])
        it.put(cx - 9, cy + 7, J[BR])
    else:
        wavy(it, r, cx, cy - 4, cx + r.randint(-6, 6), cy - 12, J[PL0], amp=1.5)
    finish(tile, it, p)


def headset(tile, p, r, cx, cy):
    J, it = p.junk, K.Img(tile.w, tile.h)
    for a in range(180, 361, 6):  # pałąk
        for rr in (6, 7):
            it.put(round(cx + rr * math.cos(math.radians(a))), round(cy + rr * .8 * math.sin(math.radians(a))), J[PL1])
    for side in (-1, 1):
        ellipse(it, cx + side * 6.5, cy + 1, 2.4, 3, lit3(J[PL0], J[PL1], J[PL2]))
        it.put(cx + side * 6, cy + 1, J[CL0])
    wavy(it, r, cx + 6, cy + 4, cx + 10, cy + 10, J[PL0], amp=1)
    finish(tile, it, p)


def paper_ball(tile, p, r, cx, cy, rad=None):
    J, it = p.junk, K.Img(tile.w, tile.h)
    rad = rad or r.uniform(2.2, 3.2)
    ellipse(it, cx, cy, rad, rad * .9, lambda nx, ny: J[WH1] if (ny > .4 or (nx - ny) > .9) else J[WH0])
    it.put(cx, cy, J[WH1])
    finish(tile, it, p)


def receipt(tile, p, r, x0, y0, n=None, vertical=None):
    J, it = p.junk, K.Img(tile.w, tile.h)
    n = n or r.randint(7, 11)
    vertical = r.random() < .5 if vertical is None else vertical
    for i in range(n):
        for k in range(3):
            c = J[WH1] if (i % 2 and k == 1) else J[WH0]
            it.put(x0 + (k if vertical else i), y0 + (i if vertical else k), c)
    finish(tile, it, p)


def bottle(tile, p, r, cx, cy, glass=False, flip=False):
    """Butelka leży na boku: plastikowa z etykietą albo szklana po piwie."""
    J, it = p.junk, K.Img(tile.w, tile.h)
    s = -1 if flip else 1
    body = (J[GL0], J[GL1], J[GL1]) if glass else (J[WH1], J[BLT], J[WH0])
    for i in range(13):
        half = 2 if i < 9 else 1
        for k in range(-half, half + 1):
            c = body[2] if k == -half else (body[0] if k == half else body[1])
            if not glass and 3 <= i <= 6:
                c = J[TEAL] if k < half else J[PL1]  # etykieta
            it.put(cx + s * (i - 6), cy + k, c)
    it.put(cx + s * 7, cy, J[RED1] if not glass else J[FOIL])  # nakrętka / kapsel
    finish(tile, it, p)


def can(tile, p, r, cx, cy, vertical=False):
    """Puszka energetyka (kolory puszek z palarni, krok 84): granat, biały pas, czerwona kreska."""
    L, it = p.litter, K.Img(tile.w, tile.h)
    for i in range(11):
        for k in range(-2, 3):
            c = L[2] if k == -2 else (L[0] if k == 2 else L[1])
            if i in (0, 10):
                c = L[4] if k < 2 else L[3]
            elif i in (4, 6):
                c = L[7] if k < 2 else L[4]
            elif i == 5:
                c = L[6] if k < 2 else L[5]
            it.put(cx + (k if vertical else i - 5), cy + (i - 5 if vertical else k), c)
    finish(tile, it, p)


def crumbs(tile, p, r, n, x0=2, y0=2, x1=29, y1=29):
    J = p.junk
    for _ in range(n):
        tile.put(r.randint(x0, x1), r.randint(y0, y1), J[r.choice((CRUST, CB0, OR0, WH1, CHEESE, CB1))])


def hair(tile, p, r, n):
    for _ in range(n):
        x, y, a = r.uniform(4, 27), r.uniform(4, 27), r.uniform(0, 2 * math.pi)
        for _ in range(r.randint(5, 9)):
            a += r.uniform(-.5, .5)
            x, y = x + math.cos(a), y + math.sin(a)
            tile.put(int(x), int(y), p.floor[0])


def mush(tile, p, r, cx, cy, rx, ry, lumps=3):
    """Hałda śmieci bez rozpoznawalnych przedmiotów (krok 138b: „atmosfera, nie detale”): kilka nachodzących garbów
    z grudkowatej mazi przygaszonych barw; każdy garb oświetlony od północy, przy ziemi ciemny."""
    J, it = p.junk, K.Img(tile.w, tile.h)
    tones = (J[CB0], J[CB0], J[CL0], J[CL1], J[GR0], J[DN0], J[MO0], J[PL1], p.stain[0], p.floor[1], p.floor_alt)
    bumps = [(cx, cy, rx, ry)] + [(cx + r.uniform(-rx, rx) * .6, cy + r.uniform(-ry, ry) * .5,
                                   rx * r.uniform(.45, .7), ry * r.uniform(.45, .7)) for _ in range(lumps)]
    for bx, by, brx, bry in sorted(bumps, key=lambda b: b[1]):
        clump = {}
        for y in range(int(by - bry) - 1, int(by + bry) + 2):
            for x in range(int(bx - brx) - 1, int(bx + brx) + 2):
                nx, ny = (x + .5 - bx) / brx, (y + .5 - by) / bry
                d = nx * nx + ny * ny
                if d > 1 + r.uniform(-.25, .05):
                    continue
                key = (x // 3, (y + x // 3) // 3)  # grudki ok. 3×3
                c = clump.setdefault(key, r.choice(tones))
                if ny < -.5 and r.random() < .5:  # oświetlona góra garbu
                    c = J[CB1] if r.random() < .5 else p.floor[3]
                elif ny > .55:  # przy ziemi ciemniej
                    c = J[GR0] if r.random() < .5 else J[PL0]
                it.put(x, y, c)
    for _ in range(int(rx * ry / 14)):  # rzadkie jaśniejsze skrawki na wierzchu
        x, y = cx + r.uniform(-rx, rx) * .7, cy + r.uniform(-ry, ry * .3) * .7
        if it.get(x, y) and it.get(x, y)[3]:
            it.put(x, y, J[r.choice((WH1, CB1))])
    finish(tile, it, p)


# ---------------- brud (krok 138a: „brudne w każdym calu”) ----------------
def blob(img, r, cx, cy, rad, squash=.75):
    """Nieregularna plama: zbiór pikseli (brzeg poszarpany)."""
    pts = set()
    for y in range(int(cy - rad) - 2, int(cy + rad) + 3):
        for x in range(int(cx - rad) - 2, int(cx + rad) + 3):
            if 0 <= x < img.w and 0 <= y < img.h and math.hypot(x - cx, (y - cy) / squash) < rad + r.uniform(-1.2, .8):
                pts.add((x, y))
    return pts


def grease_puddle(img, p, r, cx, cy, rad):
    """Kałuża tłuszczu: ciemny brzeg, bursztynowy środek i połysk od północy — z daleka „lepkie”."""
    J, pts = p.junk, blob(img, r, cx, cy, rad)
    for x, y in pts:
        edge = any((x + dx, y + dy) not in pts for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        img.put(x, y, J[GR0] if edge else J[GR1])
    top = sorted(pts, key=lambda q: (q[1], q[0]))
    for x, y in top[len(top) // 5: len(top) // 5 + max(1, int(rad))]:
        if (x, y - 1) in pts and (x, y + 1) in pts:
            img.put(x, y, J[GR2])


def slime_puddle(img, p, r, cx, cy, rad):
    """Śluz: zielonkawa, błyszcząca plama z nitką i kropelkami."""
    J, pts = p.junk, blob(img, r, cx, cy, rad, squash=.6)
    for x, y in pts:
        edge = (x, y + 1) not in pts or (x + 1, y) not in pts
        img.put(x, y, J[SL0] if edge else J[SL1])
    xs = sorted(pts)
    if xs:
        x, y = xs[len(xs) // 3]
        img.put(x, y, J[SL2])
        img.put(x + 1, y, J[SL2])
    for _ in range(r.randint(2, 4)):
        img.put(cx + r.randint(-int(rad) - 3, int(rad) + 3), cy + r.randint(-3, 4), J[SL0])


def mold_patch(img, p, r, cx, cy, rad):
    """Grzyb: skupisko ciemnych kropek, w środku nalot, na brzegu jasny meszek."""
    J = p.junk
    for _ in range(int(rad * rad * 2.2)):
        a, d = r.uniform(0, 2 * math.pi), abs(r.gauss(0, rad * .55))
        x, y = cx + math.cos(a) * d, cy + math.sin(a) * d * .8
        c = J[MO1] if d < rad * .35 else (J[MO0] if r.random() < .75 else J[MO2])
        img.put(x, y, c)


def grime(img, p, r, amount=1.0):
    """Brud na każdym kaflu podłogi: zbite, ciemne zabrudzenia, tłuste plamki, kropki grzyba i lepkie smugi.
    Drobne i w tonach bliskich podłodze (gęsto, ale się zlewa); duże kałuże to osobne nakładki."""
    F, J = p.floor, p.junk
    area = img.w * img.h / 1024
    for _ in range(int(r.randint(3, 5) * area * amount)):  # zbity brud: ciemne skupiska
        cx, cy, rad = r.uniform(0, img.w), r.uniform(0, img.h), r.uniform(2, 4.5)
        for x, y in blob(img, r, cx, cy, rad):
            if r.random() < .45:
                img.put(x, y, F[1] if r.random() < .7 else F[0])
    for _ in range(int(r.randint(1, 3) * area * amount)):  # tłuste plamki z połyskiem
        grease_puddle(img, p, r, r.uniform(3, img.w - 3), r.uniform(3, img.h - 3), r.uniform(1, 2.2))
    for _ in range(int(r.randint(0, 2) * area * amount)):
        mold_patch(img, p, r, r.uniform(3, img.w - 3), r.uniform(3, img.h - 3), r.uniform(1.5, 3))
    if r.random() < .5 * amount:  # lepka smuga (rozmazany ślad buta)
        x, y = r.uniform(4, img.w - 12), r.uniform(4, img.h - 4)
        for i in range(r.randint(6, 11)):
            img.put(x + i, y + (i // 4), J[GR0] if i % 3 else F[0])
    for _ in range(int(12 * area * amount)):  # pojedyncze plamki
        img.put(r.randrange(img.w), r.randrange(img.h), r.choice((J[GR0], F[0], J[MO0], p.stain[0])))


# ---------------- podłoga: wykładzina w pokojach, panele w korytarzach, dywany PRL ----------------
def carpet(p, r, w=1, h=1, clutter=0, worn=False):
    """Wykładzina: drobne pętelki (szum 1 px bez fug, więc kafle łączą się bez szwów), przetarcia i okruchy."""
    F, img = p.floor, canvas(w, h)
    for y in range(img.h):
        for x in range(img.w):
            v = r.random()
            c = F[2] if v < .62 else (p.floor_alt if v < .86 else (F[3] if v < .94 else F[1]))
            img.put(x, y, c)
    for _ in range(r.randint(1, 3) * w * h):  # zbite, ciemniejsze placki (stara wykładzina)
        cx, cy, rad = r.uniform(4, img.w - 4), r.uniform(4, img.h - 4), r.uniform(2.5, 5)
        for y in range(int(cy - rad), int(cy + rad) + 1):
            for x in range(int(cx - rad), int(cx + rad) + 1):
                if math.hypot(x - cx, y - cy) < rad and r.random() < .55 and img.get(x, y) is not None:
                    img.put(x, y, p.floor_alt if r.random() < .7 else F[1])
    if worn:  # wydeptana ścieżka: jaśniejsze, sfilcowane pętelki
        for _ in range(60):
            x, y = r.randint(2, img.w - 3), r.randint(10, 22)
            img.put(x, y, F[3])
    crumbs(img, p, r, clutter, 1, 1, img.w - 2, img.h - 2)
    return img


def scraps(img, p, r, n):
    """Spłaszczone strzępy (papierki, folie, karton, okruchy) w tonach bliskich wykładzinie: z daleka podłoga
    wygląda na zasłaną śmieciami, z bliska nie konkuruje z postaciami."""
    J = p.junk
    tones = (J[CB0], J[CB0], J[GREASE], J[CL0], J[CL1], J[DN0], J[OR0], J[WH1], p.stain[0], p.floor[3])
    for _ in range(n):
        x, y = r.randint(1, img.w - 6), r.randint(1, img.h - 5)
        w, h = r.randint(2, 5), r.randint(1, 3)
        c = r.choice(tones)
        for yy in range(h):
            for xx in range(w):
                if (xx, yy) in ((0, 0), (w - 1, h - 1)) and w > 2:
                    continue
                img.put(x + xx + (yy if r.random() < .3 else 0), y + yy, c)
        img.put(x + 1, y + h, p.floor[1])


def carpet_tile(clutter, worn=False, stain=False, seam=False, scrap=False):
    def gen(p, r):
        img = carpet(p, r, clutter=clutter, worn=worn)
        grime(img, p, r)
        scraps(img, p, r, r.randint(5, 9) + clutter)
        if stain:  # stara, wyblakła plama po coli
            ellipse(img, r.uniform(11, 21), r.uniform(11, 21), r.uniform(5, 8), r.uniform(4, 6),
                    lambda nx, ny: p.stain[0] if r.random() < .5 else None)
        if seam:  # łączenie dwóch pasów wykładziny, lekko odklejone
            y = r.randint(8, 24)
            for x in range(32):
                img.put(x, y, p.floor[1])
                if x % 7 == 3:
                    img.put(x, y - 1, p.floor[3])
        if scrap:
            hair(img, p, r, 2)
        return img
    return gen


def rug(kind):
    """Dywan 2×2 na wykładzinie (wzór „PRL”: romby i bordiura albo pasy), poplamiony i przypalony."""
    def gen(p, r):
        J = p.junk
        img = carpet(p, r, 2, 2, clutter=6)
        x0, y0, x1, y1 = 4, 6, 59, 57
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                lx, ly = x - x0, y - y0
                bx = min(lx, x1 - x, ly, y1 - y)
                if kind == 'a':
                    if bx < 2:
                        c = J[RUGN]
                    elif bx < 4:
                        c = J[RUGB] if (lx + ly) % 4 < 2 else J[RUGN]
                    else:
                        d = (abs((lx - 27) % 12 - 6) + abs((ly - 25) % 12 - 6))
                        c = J[RUGB] if d == 5 else (J[RUG1] if d < 5 else J[RUG0])
                        if abs(lx - 27) + abs(ly - 25) < 8:  # medalion
                            c = J[RUGN] if abs(lx - 27) + abs(ly - 25) < 4 else J[RUGB]
                else:
                    band = (ly // 5) % 4
                    c = (J[RUGN], J[RUGB], J[RUG0], J[RUGB])[band]
                    if bx < 2:
                        c = J[RUG0]
                if r.random() < .12:  # przetarte włókno
                    c = p.floor_alt
                img.put(x, y, c)
        for x in range(x0, x1 + 1, 2):  # frędzle
            img.put(x, y0 - 1, J[RUGB])
            img.put(x, y1 + 1, J[RUGB])
            img.put(x, y0 - 2, J[WH1])
            img.put(x, y1 + 2, J[WH1])
        if kind == 'b':  # podwinięty róg
            for i in range(9):
                for k in range(9 - i):
                    img.put(x1 - k, y1 - i, J[RUGB] if k > 0 else J[RUG0])
        ellipse(img, r.uniform(20, 44), r.uniform(18, 46), 6, 4.5,
                lambda nx, ny: p.stain[1] if nx * nx + ny * ny < .35 else (p.stain[0] if r.random() < .8 else None))
        burn(img, p, r, r.uniform(14, 50), r.uniform(14, 50), 1.6)
        grime(img, p, r, .8)
        scraps(img, p, r, 14)
        crumbs(img, p, r, 10, 4, 6, 59, 57)
        return img
    return gen


def laminate(p, r):
    """Panele w korytarzu: deski 32×8 z przesuniętymi łączeniami, słoje w tonach wykładziny (ta sama jasność)."""
    F, img = p.floor, canvas()
    for row in range(4):
        joint = r.randint(6, 26)
        base = p.floor_alt if row % 2 else F[2]
        for y in range(8):
            for x in range(32):
                yy = row * 8 + y
                if y == 7 or x == joint:
                    c = F[1]
                elif y == 0:
                    c = F[3]
                else:
                    c = base
                    if (x * 3 + y * 7 + row * 5) % 23 == 0 or (y == 3 and (x + row * 9) % 11 < 3):
                        c = F[1] if r.random() < .5 else F[3]  # słoje
                img.put(x, yy, c)
    for _ in range(r.randint(1, 3)):  # rysa
        x, y = r.randint(2, 24), r.randint(1, 30)
        line(img, x, y, x + r.randint(3, 6), y + r.randint(-1, 1), F[0])
    grime(img, p, r, 1.2)
    scraps(img, p, r, r.randint(4, 8))
    crumbs(img, p, r, r.randint(2, 6), 1, 1, 30, 30)
    return img


# ---------------- nakładki wspólnych grup (zamiast pęknięć i gruzu ruin) ----------------
def burn(img, p, r, cx, cy, rad):
    """Przypalenie od peta: zwęglony środek, brązowa obwódka, popiół."""
    ellipse(img, cx, cy, rad + 1.2, rad + .8, lambda nx, ny: p.stain[0])
    ellipse(img, cx, cy, rad, rad * .8, lambda nx, ny: p.floor[0])
    img.put(int(cx + rad + 1), int(cy - 1), p.ash[0])


def common_decal(kind):
    def gen(p, r):
        J = p.junk
        if kind in ('crack_2x1', 'crack_1x2'):  # długie pęknięcie → kabel przez pokój (z wtyczką)
            vertical = kind == 'crack_1x2'
            img = canvas(1, 2) if vertical else canvas(2, 1)
            it = K.Img(img.w, img.h)
            a, b = ((16, 3), (15, 60)) if vertical else ((3, 15), (60, 17))
            col = J[r.choice((PL0, CL1))]
            pts = wavy(it, r, *a, *b, col, J[PL2] if col == J[PL0] else J[CL2], amp=3, waves=1.2)
            ex, ey = pts[-1]
            box(it, ex - 2, ey - 2, 4, 4, J[WH0])  # wtyczka
            it.put(ex + (0 if vertical else 2), ey + (2 if vertical else 0), J[FOIL])
            finish(img, it, p)
            return img
        img = canvas()
        if kind in ('crack_a', 'crack_b', 'crack_c'):  # okruchy, włosy, skrawki
            crumbs(img, p, r, r.randint(8, 16))
            hair(img, p, r, r.randint(1, 2))
        elif kind == 'broken_a':  # przypalenia od petów
            burn(img, p, r, r.uniform(9, 22), r.uniform(9, 22), 2.2)
            burn(img, p, r, r.uniform(6, 26), r.uniform(6, 26), 1.3)
        elif kind == 'broken_b':  # dziura w wykładzinie: widać deski pod spodem
            hole = set()
            for y in range(32):
                for x in range(32):
                    if math.hypot(x - 16, (y - 17) * 1.2) < 7 + r.uniform(-1.3, 1.3):
                        hole.add((x, y))
            for x, y in hole:
                img.put(x, y, J[WD1] if (y // 4) % 2 else J[WD0])
            for x, y in hole:
                if (x, y - 1) not in hole:
                    img.put(x, y, p.floor[0])
                if (x, y + 1) not in hole:
                    img.put(x, y + 1, p.floor[3])
        elif kind == 'rubble':  # kupka okruchów i popcornu
            for _ in range(28):
                x, y = 16 + r.gauss(0, 4), 16 + r.gauss(0, 3.5)
                img.put(int(x), int(y), J[r.choice((CRUST, CHEESE, CB0, WH0))])
            for _ in range(4):
                ellipse(img, 16 + r.gauss(0, 4), 16 + r.gauss(0, 3), 1.3, 1.1, lambda nx, ny: J[WH0] if ny < .3 else J[CHEESE])
        elif kind in ('stain_a', 'stain_b'):  # rozlana cola / kawa, ślad po kubku
            cx, cy = r.uniform(12, 20), r.uniform(12, 20)
            ellipse(img, cx, cy, r.uniform(6, 9), r.uniform(4, 6),
                    lambda nx, ny: p.stain[1] if nx * nx + ny * ny < .3 else (p.stain[0] if r.random() < .9 else None))
            if kind == 'stain_a':
                for a in range(0, 360, 20):
                    img.put(round(cx + 7 + 3 * math.cos(math.radians(a))), round(cy - 6 + 2.5 * math.sin(math.radians(a))),
                            p.stain[1])
        elif kind in ('debris_a', 'debris_b'):  # kapsle, sreberka, papierki
            for _ in range(r.randint(2, 3)):
                ellipse(img, r.uniform(5, 27), r.uniform(5, 27), 1.3, 1.1, lambda nx, ny: J[r.choice((RED1, FOIL, BY))])
            for _ in range(r.randint(1, 2)):
                x, y = r.randint(4, 24), r.randint(4, 24)
                box(img, x, y, 4, 3, J[r.choice((OR1, FOIL, WH0))])
                img.put(x + 3, y + 2, J[WH1])
            crumbs(img, p, r, 6)
        elif kind.startswith('dust_'):  # kłęby kurzu, włosy i okruchy zmiecione pod ścianę
            side = kind[-1]
            if side == 'n':  # pod licem: tłuszcz kapie z muru i zbiera się w kałużki
                for _ in range(r.randint(2, 3)):
                    grease_puddle(img, p, r, r.uniform(4, 28), r.uniform(2.5, 5), r.uniform(1.8, 3.2))
                for _ in range(r.randint(3, 6)):
                    x, y = r.randrange(1, 31), r.randint(0, 3)
                    img.put(x, y, J[GR1]); img.put(x, y + 1, J[GR0])
            for y in range(32):
                for x in range(32):
                    d = {'n': y, 'w': x, 'e': 31 - x}[side]
                    if d < 7 and r.random() < .42 - d * .055:
                        img.put(x, y, p.ash[0] if r.random() < .6 else p.ash[1])
            for _ in range(3):  # kłęby
                along = r.uniform(4, 27)
                cx, cy = {'n': (along, 3), 'w': (3, along), 'e': (28, along)}[side]
                ellipse(img, cx, cy, 2.4, 1.8, lambda nx, ny: p.ash[0] if ny < .2 else p.ash[1])
            crumbs(img, p, r, 5, *{'n': (2, 1, 29, 8), 'w': (1, 2, 8, 29), 'e': (23, 2, 30, 29)}[side])
        else:
            raise ValueError(kind)
        return img
    return gen


# ---------------- nowe nakładki biomu ----------------
def junk_decal(kind):
    def gen(p, r):
        img = canvas()
        if kind == 'pizza_a':
            pizza_box(img, p, r, r.randint(5, 9), r.randint(7, 10))
        elif kind == 'pizza_b':
            pizza_box(img, p, r, r.randint(5, 9), r.randint(15, 16), opened=True)
        elif kind == 'slice':
            pizza_slice(img, p, r, 12, 9)
            crumbs(img, p, r, 5)
            paper_ball(img, p, r, 24, 23)
        elif kind == 'chips':
            chip_bag(img, p, r, 15, 13)
        elif kind == 'noodles':
            noodle_cup(img, p, r, 12, 15)
        elif kind == 'socks':
            sock(img, p, r, 8, 6)
            sock(img, p, r, 20, 13, flip=True)
        elif kind == 'shirt':
            tshirt(img, p, r, 15, 9, ramp=r.choice(((CL0, CL1, CL2), (DN0, DN1, DN1))))
        elif kind == 'pad':
            controller(img, p, r, 15, 18)
        elif kind == 'pad_broken':
            controller(img, p, r, 13, 14, broken=True)
        elif kind == 'headset':
            headset(img, p, r, 14, 14)
        elif kind == 'papers':
            for _ in range(r.randint(2, 3)):
                paper_ball(img, p, r, r.uniform(6, 26), r.uniform(6, 26))
            receipt(img, p, r, r.randint(4, 18), r.randint(4, 22))
        elif kind in ('mush_a', 'mush_b', 'mush_c'):  # bezkształtna kupka śmieci
            mush(img, p, r, r.uniform(13, 19), r.uniform(13, 19), r.uniform(6, 9), r.uniform(4.5, 6.5), lumps=r.randint(1, 3))
            crumbs(img, p, r, 5)
        elif kind in ('grease', 'grease_b'):  # rozlany tłuszcz z patelni
            grease_puddle(img, p, r, r.uniform(12, 20), r.uniform(12, 20), r.uniform(5, 7.5))
            for _ in range(r.randint(2, 4)):
                grease_puddle(img, p, r, r.uniform(4, 28), r.uniform(4, 28), r.uniform(1, 2))
        elif kind == 'slime':  # śluz niewiadomego pochodzenia
            slime_puddle(img, p, r, r.uniform(12, 20), r.uniform(12, 20), r.uniform(4.5, 7))
        elif kind in ('mold', 'mold_b'):  # grzyb wyrastający z wilgotnej wykładziny
            mold_patch(img, p, r, r.uniform(11, 21), r.uniform(11, 21), r.uniform(5, 8))
            mold_patch(img, p, r, r.uniform(5, 27), r.uniform(5, 27), r.uniform(2, 3.5))
        elif kind == 'bottle':
            bottle(img, p, r, 15, 14, glass=r.random() < .5, flip=r.random() < .5)
            crumbs(img, p, r, 4)
        else:
            raise ValueError(kind)
        return img
    return gen


def heap(kind):
    """Sterty 2×2 i 2×1: śmieci zachodzą na siebie, więc podłoga wygląda jak chodzenie po śmieciach."""
    def gen(p, r):
        if kind == 'boxes':  # stos pudełek po pizzy (2×1) i jedno otwarte obok
            img = canvas(2, 1)
            for i in range(3):
                pizza_box(img, p, r, 6 + r.randint(-2, 2), 14 - i * 4, w=18, h=15)
            pizza_box(img, p, r, 38, 16, w=17, h=13, opened=True)
            crumbs(img, p, r, 6, 2, 2, 61, 29)
            return img
        if kind == 'keyboard':  # klawiatura z wybitymi klawiszami (2×1)
            img, J = canvas(2, 1), p.junk
            it = K.Img(img.w, img.h)
            box(it, 10, 10, 42, 13, J[PL1])
            box(it, 10, 10, 42, 1, J[PL2])
            box(it, 10, 22, 42, 1, J[PL0])
            missing = {(r.randint(0, 12), r.randint(0, 3)) for _ in range(5)}
            for ky in range(4):
                for kx in range(13):
                    x, y = 12 + kx * 3, 12 + ky * 3 - (0 if kx < 13 else 0)
                    if (kx, ky) in missing:
                        it.put(x, y, J[PL0]); it.put(x + 1, y, J[PL0])
                        continue
                    it.put(x, y, J[PL2]); it.put(x + 1, y, J[PL2])
                    it.put(x, y + 1, J[PL0]); it.put(x + 1, y + 1, J[PL0])
            box(it, 22, 21, 14, 1, J[PL2])  # spacja
            wavy(it, r, 31, 9, 40, 1, J[PL0], amp=1.5)
            finish(img, it, p)
            for _ in range(3):  # wybite klawisze obok
                x, y = r.randint(2, 60), r.choice((r.randint(2, 6), r.randint(25, 29)))
                img.put(x, y, J[PL2]); img.put(x + 1, y, J[PL1]); img.put(x, y + 1, J[PL0])
            return img
        img = canvas(2, 2)
        if kind == 'laundry':  # kupka prania
            jeans(img, p, r, 22, 20)
            tshirt(img, p, r, 38, 16)
            tshirt(img, p, r, 26, 34, ramp=(DN0, DN1, DN1))
            sock(img, p, r, 44, 34)
            tshirt(img, p, r, 40, 38, ramp=(CL0, CL1, CL2))
            sock(img, p, r, 14, 42, flip=True)
            return img
        if kind == 'cables':  # splątane kable i listwa z czerwonym włącznikiem
            J = p.junk
            it = K.Img(img.w, img.h)
            for (x1, y1) in ((4, 8), (60, 12), (6, 56), (58, 54), (32, 3)):
                wavy(it, r, 32, 34, x1, y1, J[r.choice((PL0, PL0, WH1))], J[PL2], amp=4, waves=1.3)
            for _ in range(2):  # pętla zwiniętego kabla
                cx, cy = r.uniform(16, 48), r.uniform(18, 48)
                for a in range(0, 360, 8):
                    it.put(round(cx + 5 * math.cos(math.radians(a))), round(cy + 3.5 * math.sin(math.radians(a))), J[PL0])
            box(it, 22, 30, 22, 7, J[WH0])
            box(it, 22, 36, 22, 1, J[WH1])
            for x in (26, 31, 36):
                box(it, x, 32, 2, 2, J[PL1])
            box(it, 40, 31, 3, 3, J[BR])
            finish(img, it, p)
            return img
        if kind.startswith('mound'):  # hałda 2×2 (krok 138b): sama maź śmieci, bez rozpoznawalnych przedmiotów
            mush(img, p, r, 32 + r.uniform(-3, 3), 33 + r.uniform(-3, 3), r.uniform(22, 26), r.uniform(17, 21), lumps=6)
            for _ in range(2):
                mush(img, p, r, r.uniform(12, 52), r.uniform(44, 56), r.uniform(5, 8), r.uniform(3.5, 5), lumps=1)
            grease_puddle(img, p, r, r.uniform(8, 56), r.uniform(52, 60), 3)
            crumbs(img, p, r, 20, 2, 2, 61, 61)
            return img
        # sterta śmieci: grube elementy na dole, drobne na wierzchu, gęstsze w środku
        r2 = random.Random(r.random())
        pizza_box(img, p, r2, 10, 22, w=20, h=17)
        pizza_box(img, p, r2, 30, 12, w=18, h=15, opened=kind == 'trash_b')
        tshirt(img, p, r2, 42, 36, ramp=(CL0, CL1, CL2) if kind == 'trash_a' else (DN0, DN1, DN1))
        chip_bag(img, p, r2, 22, 44)
        can(img, p, r2, 34, 30)
        can(img, p, r2, 46, 22, vertical=True)
        bottle(img, p, r2, 20, 16, glass=kind == 'trash_b')
        paper_ball(img, p, r2, 38, 47)
        paper_ball(img, p, r2, 12, 42)
        if kind == 'trash_a':
            controller(img, p, r2, 50, 48)
            noodle_cup(img, p, r2, 18, 52)
        else:
            headset(img, p, r2, 52, 46)
            pizza_slice(img, p, r2, 26, 26)
        crumbs(img, p, r2, 18, 4, 4, 59, 59)
        return img
    return gen


# ---------------- mury: tynk z wierzchu, tapeta z listwą na licu ----------------
def plaster(img, r, base, alt, dark, light, seams=True):
    """Wierzch ściany: tynk (szum) i łączenia płyt co 16 px — „wielka płyta”."""
    for y in range(img.h):
        for x in range(img.w):
            v = r.random()
            img.put(x, y, base if v < .7 else (alt if v < .9 else (light if v < .96 else dark)))
    if seams:  # rzadkie, przerywane rysy tynku zamiast siatki bloków
        y = r.randint(6, 26)
        for x in range(img.w):
            if r.random() < .6:
                img.put(x, y, alt)


def wallpaper(img, p, r, y0, y1, x0=0, x1=None):
    """Tapeta w pasy na licu (wyblakła musztarda), na dole drewniana listwa przypodłogowa."""
    wf, D = p.wall_face, p.junk
    x1 = img.w if x1 is None else x1
    for y in range(y0, y1):
        ly = y - y0
        for x in range(x0, x1):
            if y >= y1 - 2:
                c = D[WD1] if y == y1 - 2 else D[WD0]
            elif x % 6 in (2, 3):
                c = wf[2] if ly % 3 else wf[1]
            else:
                c = wf[1] if (x % 6 != 5 or ly % 2) else wf[0]
            img.put(x, y, c)


def greasy_top(img, p, r, y_end):
    """Wierzch muru (krok 138a): tłusta, zakopcona warstwa — plamy sadzy i tłuszczu, smugi ściekające na południe."""
    wt, J = p.wall_top, p.junk
    for _ in range(r.randint(3, 5)):  # zakopcone plamy
        for x, y in blob(img, r, r.uniform(0, img.w), r.uniform(0, y_end), r.uniform(3, 6)):
            if y < y_end and r.random() < .6:
                img.put(x, y, wt[1] if r.random() < .6 else p.stain[0])
    for _ in range(r.randint(2, 4)):  # tłuste plamy z połyskiem
        cx, cy = r.uniform(3, img.w - 3), r.uniform(3, max(4, y_end - 4))
        for x, y in blob(img, r, cx, cy, r.uniform(1.5, 3)):
            if y < y_end:
                img.put(x, y, J[GR0] if r.random() < .55 else J[GR1])
        img.put(cx, cy - 1, J[GR2])
    for _ in range(r.randint(4, 7)):  # smugi spływające ku licu
        x, y = r.randrange(1, img.w - 1), r.uniform(0, y_end * .6)
        for yy in range(int(y), min(y_end, int(y) + r.randint(4, 12))):
            img.put(x, yy, J[GR0] if r.random() < .7 else wt[1])


def greasy_face(img, p, r, fy, bottom):
    """Lico (krok 138a): z krawędzi muru cieknie tłuszcz jak z okapu nad kuchenką — gęste zacieki z kroplą na końcu,
    tapeta przesiąknięta, przy listwie zebrany brud. Krawędź muru to tłusty, błyszczący nawis."""
    J = p.junk
    for x in range(img.w):  # tłusty nawis na krawędzi
        img.put(x, fy - 1, J[GR2] if r.random() < .25 else J[GR1])
    for y in range(fy, fy + 3):  # przesiąknięty pas pod krawędzią
        for x in range(img.w):
            if r.random() < .55 - (y - fy) * .15:
                img.put(x, y, J[GR0] if r.random() < .7 else p.stain[0])
    x = r.randint(0, 3)
    while x < img.w:  # zacieki różnej długości: większość krótka, co któryś do samej listwy
        length = r.choice((1, 2, 2, 3, 4, bottom - fy - 2, bottom - fy - 1))
        width = 2 if length > 3 and r.random() < .6 else 1
        for y in range(fy, fy + length):
            for k in range(width):
                img.put(x + k, y, J[GR1] if k == 0 else J[GR0])
        tip = fy + length
        img.put(x, tip, J[GR1])  # kropla na końcu zacieku, z połyskiem
        if width == 2:
            img.put(x + 1, tip, J[GR0])
            img.put(x, tip + 1, J[GR0])
        if length > 2:
            img.put(x, tip - 1, J[GR2])
        x += r.randint(3, 7)
    for _ in range(r.randint(4, 8)):  # przesiąknięte plamy na tapecie
        img.put(r.randrange(img.w), r.randint(fy, bottom - 3), p.stain[r.randint(0, 1)])
    for x in range(img.w):  # brud zebrany na listwie
        if r.random() < .5:
            img.put(x, bottom - 2, J[GR0] if r.random() < .6 else J[MO0])


def wall_tile(mask, dmg=None, diag=0):
    def gen(p, r):
        T, FACE, O, CLR = K.T, K.FACE, p.outline, K.CLR
        wt = p.wall_top
        img = K.Img(T, T)
        plaster(img, r, wt[2], p.wall_block_alt, wt[1], wt[3])
        S, N, E, Wo = not mask & 4, not mask & 1, not mask & 2, not mask & 8
        fy = T - FACE
        greasy_top(img, p, r, fy - 1 if S else T)
        if S:
            wallpaper(img, p, r, fy, T - 1)
            greasy_face(img, p, r, fy, T - 1)
            for x in range(T):
                img.put(x, T - 1, O)
        if N:
            for x in range(T):
                img.put(x, 0, O)
                img.put(x, 1, wt[5] if x % 9 == 3 else wt[4])
        if Wo:
            for y in range(T):
                img.put(0, y, O)
                if y > 0:
                    img.put(1, y, p.wall_face[1] if (S and y >= fy) else wt[3])
        if E:
            for y in range(T):
                img.put(T - 1, y, O)
                img.put(T - 2, y, p.wall_face[0] if (S and y >= fy) else wt[1])
        if N and Wo: img.put(0, 0, CLR); img.put(1, 1, O)
        if N and E: img.put(T - 1, 0, CLR); img.put(T - 2, 1, O)
        if S and Wo: img.put(0, T - 1, CLR); img.put(1, T - 2, O)
        if S and E: img.put(T - 1, T - 1, CLR); img.put(T - 2, T - 2, O)
        if diag & 2:
            for y in range(fy - 1, T): img.put(T - 1, y, O); img.put(T - 2, y, wt[1])
        if diag & 4:
            for y in range(fy - 1, T): img.put(0, y, O); img.put(1, y, wt[3])
        if diag & 1: img.put(T - 1, 0, O)
        if diag & 8: img.put(0, 0, O)
        y0, y1 = (3 if N else 1), (fy - 1 if S else T - 1)
        x0, x1 = (3 if Wo else 1), (T - 3 if E else T - 1)
        inside = lambda x, y: x0 <= x < x1 and y0 <= y < y1
        if dmg == 'crack':  # rysa w tynku
            x, y = x0 + 3, y0 + 1
            for _ in range(24):
                if inside(x, y):
                    img.put(x, y, wt[0])
                x += r.choice((0, 1, 1)); y += r.choice((0, 1))
        elif dmg == 'chunk':  # odpadnięty tynk: widać ciemniejszą płytę
            cx, cy = (x0 + x1) // 2 + r.randint(-4, 4), (y0 + y1) // 2
            for y in range(T):
                for x in range(T):
                    if inside(x, y) and math.hypot(x - cx, y - cy) < 4.5 + r.uniform(-1, 1):
                        img.put(x, y, wt[1] if (x + y) % 3 else wt[0])
        elif dmg == 'ash':  # żółte plamy nikotyny na tynku
            for _ in range(30):
                x, y = r.randint(x0, x1 - 1), r.randint(y0, y1 - 1)
                img.put(x, y, p.stain[r.randint(0, 1)])
        return img
    return gen


def wall_band(band):
    def gen(p, r):
        img = canvas()
        if band == 'fade':
            plaster(img, r, p.wall_fade[1], p.wall_fade[1], p.wall_fade[0], p.wall_fade[2])
            for _ in range(r.randint(3, 5)):  # zakopcone zacieki także w dalszej masie muru
                for x, y in blob(img, r, r.uniform(0, 32), r.uniform(0, 32), r.uniform(3, 6)):
                    if r.random() < .5:
                        img.put(x, y, p.wall_fade[0])
        else:
            plaster(img, r, p.deep[1], p.deep[1], p.deep[0], p.deep[1], seams=False)
        return img
    return gen


def face(kind):
    """Detale na tapecie: plakaty, gniazdko z wtyczkami, półka z grami, dziura po pięści, okno z żaluzją, kalendarz."""
    def gen(p, r):
        T, FACE, O, J = K.T, K.FACE, p.outline, p.junk
        img, fy = K.Img(T, T), T - FACE
        if kind in ('poster_a', 'poster_b'):  # plakat gry: przyklejony taśmą, zachodzi na krawędź muru
            x0, y0, w, h = 9, fy - 6, 14, 12
            bg = J[PL0] if kind == 'poster_a' else J[TEAL]
            box(img, x0, y0, w, h, bg)
            if kind == 'poster_a':  # miecz i czerwony księżyc (bez znaków towarowych)
                ellipse(img, x0 + 9.5, y0 + 4, 2.6, 2.6, lambda nx, ny: J[RED0])
                line(img, x0 + 3, y0 + 9, x0 + 8, y0 + 2, J[FOIL])
                line(img, x0 + 3, y0 + 7, x0 + 5, y0 + 9, J[WD1])
            else:  # sylwetka potwora na turkusie
                ellipse(img, x0 + 7, y0 + 6, 3.5, 4, lambda nx, ny: J[PL0])
                img.put(x0 + 6, y0 + 5, J[BY]); img.put(x0 + 8, y0 + 5, J[BY])
            for x in range(x0, x0 + w):
                img.put(x, y0 + h - 1, J[WH1])  # tytuł
            img.put(x0 + w - 1, y0, J[WH0])  # odklejony róg
            img.put(x0 + w - 2, y0, J[WH1])
            outline(img, O)
            img.put(x0, y0, J[WH0]); img.put(x0 + w - 1, y0 + h - 1, J[WH0])  # taśma
        elif kind == 'socket':  # gniazdko z dwiema wtyczkami i kablami w dół lica
            box(img, 13, fy + 1, 7, 4, J[WH0])
            box(img, 13, fy + 4, 7, 1, J[WH1])
            box(img, 14, fy + 2, 2, 2, J[PL1])
            box(img, 17, fy + 2, 2, 2, J[PL0])
            for x in (15, 18):
                for y in range(fy + 4, T - 1):
                    img.put(x + (1 if y > fy + 5 and x == 18 else 0), y, J[PL0])
        elif kind == 'shelf':  # półka z pudełkami gier i figurką
            box(img, 6, fy + 1, 20, 1, J[WD2])
            box(img, 6, fy + 2, 20, 1, J[WD0])
            spines = (J[RED0], J[DN1], J[PL1], J[TEAL], J[OR0], J[CL2], J[BB])
            for i in range(7):
                hgt = 5 if i % 3 else 6
                for y in range(fy + 1 - hgt, fy + 1):
                    img.put(8 + i * 2, y, spines[(i * 3 + r.randint(0, 1)) % 7])
            ellipse(img, 23, fy - 2, 1.6, 2.6, lit3(J[BG], J[BG], J[WH0]))  # figurka
            outline(img, O)
        elif kind == 'hole':  # dziura po pięści w ścianie (rage quit)
            pts = set()
            for y in range(fy - 3, T - 2):
                for x in range(9, 24):
                    if math.hypot(x - 16, (y - (fy + 1.5)) * 1.3) < 4.8 + r.uniform(-1, 1):
                        pts.add((x, y))
            for x, y in pts:
                img.put(x, y, p.deep[0] if (x, y - 1) in pts else O)
            for _ in range(4):
                x, y = 16, fy + 1
                a = r.uniform(0, 2 * math.pi)
                for i in range(7):
                    x += math.cos(a); y += math.sin(a) * .7
                    if (int(x), int(y)) not in pts:
                        img.put(int(x), int(y), p.wall_face[0])
        elif kind == 'window':  # okno z żaluzją, przez szpary sączy się zimne światło
            box(img, 8, fy - 5, 16, 11, J[WH1])
            for y in range(fy - 4, fy + 5):
                for x in range(9, 23):
                    img.put(x, y, J[WH0] if (y - fy) % 2 else J[SCREEN] if x % 5 else J[WH1])
            box(img, 15, fy - 4, 1, 9, J[WH1])
            outline(img, O)
        elif kind == 'calendar':  # kalendarz sprzed lat, dni skreślone
            box(img, 12, fy - 3, 9, 10, J[WH0])
            box(img, 12, fy - 3, 9, 2, J[RED0])
            for y in range(fy, fy + 6, 2):
                for x in range(13, 20, 2):
                    img.put(x, y, J[RED1] if r.random() < .6 else J[WH1])
            outline(img, O)
        return img
    return gen


def outline(img, color):
    K.outline(img, color)


def lintel(p, r):
    """Nadproże nad przejściem: tynk i tapeta jak mur, z drewnianą futryną zamiast kamiennego łuku."""
    T, O, J = K.T, p.outline, p.junk
    img = K.Img(2 * T, T)
    plaster(img, r, p.wall_top[2], p.wall_block_alt, p.wall_top[1], p.wall_top[3], seams=False)
    for y in range(9, img.h):
        for x in range(img.w):
            img.put(x, y, K.CLR)
    for x in range(2 * T):
        img.put(x, 0, O)
        img.put(x, 1, p.wall_top[4])
    wallpaper(img, p, r, 9, 13)
    for x in range(2 * T):  # tłusty nawis i krótkie zacieki
        img.put(x, 8, J[GR1] if x % 4 else J[GR2])
        if r.random() < .3:
            img.put(x, 9, J[GR0]); img.put(x, 10, J[GR1])
    for y in range(13, 16):  # futryna
        for x in range(2 * T):
            img.put(x, y, J[WD2] if y == 13 else J[WD1] if y == 14 else J[WD0])
    for x in range(2 * T):
        img.put(x, 16, O)
    for y in range(9, 17):  # pionowe ościeżnice na brzegach
        for x in (0, 1, 2 * T - 2, 2 * T - 1):
            img.put(x, y, O if x in (0, 2 * T - 1) else J[WD1])
    return img


# ---------------- lampa zamiast pochodni ----------------
def lamp_sconce(p, r):
    """Kinkiet: płytka na licu, ramię i brudny abażur; świecąca żarówka to klatki „płomienia”."""
    T, J, O, by = K.T, p.junk, p.outline, K.flame_base_y
    img = K.Img(T, T)
    box(img, 14, 25, 4, 4, J[FOIL])
    box(img, 14, 28, 4, 1, J[WH1])
    for y in range(by + 3, 25):
        img.put(15, y, J[PL1]); img.put(16, y, J[PL2])
    for i in range(6):  # abażur: trapez rozszerzony ku dołowi
        half = 3 + i // 2
        for x in range(16 - half, 16 + half):
            c = J[CB2] if i < 2 else (p.stain[0] if (x + i) % 5 == 0 else J[WH1])
            img.put(x, by - 6 + i, c)
    outline(img, O)
    return img


def lamp_glow(frame):
    """Żarówka pod abażurem w 4 klatkach; w ostatniej przygasa (stara żarówka mruga)."""
    def gen(p, r):
        T, Fl, by = K.T, p.flame, K.flame_base_y
        img = K.Img(T, T)
        dim = frame == 3
        ellipse(img, 16, by + 1, 2.6, 2, lambda nx, ny: Fl[1] if dim else (Fl[3] if nx * nx + ny * ny < .4 else Fl[2]))
        for x in range(12, 20):  # poświata na dolnym brzegu abażuru
            img.put(x, by - 1, Fl[0] if dim or x in (12, 19) else Fl[1])
        if frame == 1:
            img.put(16, by + 3, Fl[2])
        return img
    return gen


# ---------------- podmiana i dopisanie kafli ----------------
CARPET = {
    'floor_slab16_a': carpet_tile(2), 'floor_slab16_b': carpet_tile(5), 'floor_slab16_c': carpet_tile(3, scrap=True),
    'floor_slab32_a': carpet_tile(4, stain=True), 'floor_slab32_b': carpet_tile(3, seam=True),
    'floor_mixed_h': carpet_tile(7), 'floor_mixed_v': carpet_tile(4, scrap=True), 'floor_worn': carpet_tile(3, worn=True),
}
FACES = (('poster_a', 3), ('poster_b', 2), ('socket', 3), ('shelf', 3), ('hole', 2), ('window', 2), ('calendar', 1))
JUNK_1x1 = (('pizza_a', 'decal.pizza'), ('pizza_b', 'decal.pizza'), ('slice', 'decal.pizza'),
            ('chips', 'decal.snacks'), ('noodles', 'decal.snacks'),
            ('socks', 'decal.clothes'), ('shirt', 'decal.clothes'),
            ('pad', 'decal.gear'), ('pad_broken', 'decal.gear'), ('headset', 'decal.gear'),
            ('papers', 'decal.papers'), ('bottle', 'decal.bottles'),
            ('grease', 'decal.grease'), ('grease_b', 'decal.grease'), ('slime', 'decal.slime'), ('mold', 'decal.mold'),
            ('mold_b', 'decal.mold'), ('mush_a', 'decal.mush'), ('mush_b', 'decal.mush'), ('mush_c', 'decal.mush'))
HEAPS = (('mound_a', 2, 2, 'decal.mound'), ('mound_b', 2, 2, 'decal.mound'), ('mound_c', 2, 2, 'decal.mound'),
         ('trash_a', 2, 2, 'decal.heap'), ('trash_b', 2, 2, 'decal.heap'), ('laundry', 2, 2, 'decal.laundry'),
         ('cables', 2, 2, 'decal.cables'), ('boxes', 2, 1, 'decal.boxes'), ('keyboard', 2, 1, 'decal.keyboard'))


def replacement(name):
    if name in CARPET:
        return CARPET[name]
    if name in ('floor_macro_a_2x2', 'floor_macro_b_2x2'):
        return rug(name[12])
    if name.startswith('floor_cobble_'):
        return laminate
    if name.startswith('decal_') and not name.startswith(('decal_trail', 'decal_can', 'decal_bucket', 'decal_box',
                                                          'decal_butts')):
        kind = name[6:]
        if kind.endswith(('_2x1', '_1x2')) and not kind.startswith('crack'):
            return None
        return common_decal(kind)
    if name.startswith('wall_fade_') or name.startswith('wall_deep_'):
        return wall_band(name.split('_')[1])
    if name.startswith('wall_'):
        parts = name.split('_')
        mask = int(parts[1])
        rest = parts[2] if len(parts) > 2 else None
        if rest and rest.startswith('d') and rest[1:].isdigit():
            return wall_tile(15, diag=int(rest[1:]))
        return wall_tile(mask, rest if rest in ('crack', 'chunk', 'ash') else None)
    if name == 'arch_2x1':
        return lintel
    if name == 'torch_sconce':
        return lamp_sconce
    if name.startswith('torch_flame_'):
        return lamp_glow(int(name[-1]))
    return None


def apply(entries, Entry, kit):
    """Podmienia rysowanie wspólnych kafli i dopisuje kafle mieszkania (na końcu, first-fit)."""
    global K
    K = kit

    class Canvas(kit.Img):  # współrzędne zaokrąglane — rysunki liczą pozycje w ułamkach
        def put(self, x, y, c):
            super().put(int(round(x)), int(round(y)), c)

        def get(self, x, y):
            return super().get(int(round(x)), int(round(y)))
    K = dataclasses.replace(kit, Img=Canvas)
    out = []
    for e in entries:
        gen = replacement(e.name)
        out.append(dataclasses.replace(e, gen=gen) if gen else e)
    for kind, weight in FACES:
        out.append(Entry(f'face_{kind}', face(kind), 'wallDecor', group='wallFace.gamer', weight=weight))
    for kind, group in JUNK_1x1:
        out.append(Entry(f'decal_{kind}', junk_decal(kind), 'floorDecal', group=group, weight=1, flip_x=True))
    for kind, w, h, group in HEAPS:
        out.append(Entry(f'decal_{kind}_{w}x{h}', heap(kind), 'floorDecal', w, h, group=group, weight=1, flip_x=True))
    return out
