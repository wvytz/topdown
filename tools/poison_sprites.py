"""
Purchawka Grzybni i jej trująca chmura — poziom detalu 3 „jak ogień” (krok 173, wybór właściciela z makiet
w screens/kokony-trucizna/). Arkusze zapisuje generator Grzybni (`tools/grove_enemies.py`), który bierze stąd
klatki; ten moduł nie ma własnego `main`.

puffball.png      32x32, 8 klatek: 0–1 spoczynek (łuskowata skórka, grzybnia u stóp, obłoczek z poru),
                  2–3 telegraf (szwy i por jarzą się jadem, drży), 4 pęknięcie (słup zarodników z kłębem
                  i krople), 5–7 sflaczała, rozdarta skórka z resztkami jadu (7 zostaje na podłodze).
poison-cloud.png  96x96, 8 klatek: 0–5 rozrost (promień 14→30 px = hitbox chmury), 6–7 kłębienie.
                  Kłęby cieniowane pasmami ze światłem z lewej-góry, toksyczny wyrzut jaśnieje w pierwszych
                  klatkach, miękki brzeg gazu (Bayer 4×4 — STYLEGUIDE §5, substancja amorficzna), bąble.
spore-burst.png   96x96, 5 klatek: wyrzut zarodników w chwili pęknięcia — błysk i pierścień kropel lecący
                  do brzegu zasięgu (r 30), żeby od pierwszej klatki było widać, dokąd sięgnie trucizna.
poison-stain.png  96x96, 1 klatka: skażona posadzka pod chmurą — dokładny zasięg trucizny (r 30).
"""
import math
import random

import tower_ruins_tiles as trt
from tower_ruins_tiles import Img, hx, ok, outline
from fire_sprites import hash01, noise

OUTL = hx('#1b1a22')
GROVE = trt.PALETTES['grzybnia']
SPORE_DUST = GROVE.ash
# Skórka purchawki: 7 tonów bladego beżu (cień → blask) — jasna plama na fioletowej podłodze.
SKIN = (ok(.30, .030, 60), ok(.40, .035, 65), ok(.50, .040, 72), ok(.60, .040, 78), ok(.70, .038, 84),
        ok(.80, .032, 88), ok(.90, .022, 92))
WART = (ok(.30, .040, 50), ok(.40, .045, 58))
# Jad: 7 tonów zieleni trucizny (ciemny brzeg → blady opar).
VEN = (ok(.30, .075, 155), ok(.42, .115, 148), ok(.54, .150, 142), ok(.65, .175, 139), ok(.75, .180, 136),
       ok(.85, .150, 132), ok(.93, .080, 125))
# Skażona posadzka: ciemny, bagnisty turkus (gra rysuje ją półprzezroczyście).
STAIN = (ok(.24, .045, 175), ok(.30, .060, 165), ok(.37, .080, 155))
CLR = (0, 0, 0, 0)

BAYER = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))
_L = (-.48, -.58, .66)
LIGHT = tuple(v / math.sqrt(sum(c * c for c in _L)) for v in _L)

PUFF = 32
PUFF_CY = 18
CLOUD = 96
# Promienie klatek rozrostu = poisonCloudRadius w grze (biomeConfig Grzybni: startRadius 14 → maxRadius 30).
CLOUD_RADII = (14, 17, 20, 23, 27, 30, 30, 30)
STAIN_RADIUS = 30
# „Toksyczność” chmury w kolejnych klatkach (jak temperatura w kuli ognia): od jasnego wyrzutu do mętnej mgły.
TOX = (1.0, .85, .7, .6, .5, .42, .4, .4)


def fbm(x, y, scale, seed, octaves=3):
    v, a, tot = 0.0, 1.0, 0.0
    for o in range(octaves):
        v += noise(x, y, scale / (2 ** o), seed + o * 31) * a
        tot += a
        a *= .5
    return v / tot


def band(v, n, x=0, y=0, dither=0.0):
    """Kwantyzacja 0..1 na n pasm; dither > 0 = Bayer 4×4 tylko na przejściach (gaz)."""
    v = max(0.0, min(.999, v))
    if dither:
        v = max(0.0, min(.999, v + (BAYER[y % 4][x % 4] / 16 - .47) * dither / n))
    return int(v * n)


def sphere_light(nx, ny):
    nz = math.sqrt(max(0.0, 1 - nx * nx - ny * ny))
    return max(0.0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2])


# ---------------- purchawka ----------------
def plates(nx, ny, seed, density=1.9):
    """Łuski skórki (Voronoi): (id łuski, odległość do szwu)."""
    gx, gy = nx * density, ny * density
    best, second, bid = 9, 9, 0
    for j in range(math.floor(gy) - 1, math.floor(gy) + 2):
        for i in range(math.floor(gx) - 1, math.floor(gx) + 2):
            d = math.hypot(gx - i - hash01(i, j, seed), gy - j - hash01(j, i, seed + 7))
            if d < best:
                second, best, bid = best, d, i * 97 + j
            elif d < second:
                second = d
    return bid, second - best


def puff_body(img, cx, cy, rx, ry, glow=0.0, seed=2800):
    """Gruszkowata purchawka z łuskami; glow 0..1 = jad jarzy się w szwach i porze (telegraf)."""
    for y in range(img.h):
        for x in range(img.w):
            nx, ny = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            nx /= 1 + .12 * max(0, ny)  # szersza u dołu — siedzi na podłodze
            if nx * nx + ny * ny > 1:
                continue
            li = sphere_light(nx, ny)
            pid, seam = plates(nx, ny, seed)
            li2 = li + (hash01(pid, 3, seed) - .5) * .08
            tone = 1 + band(li2, 6)
            c = SKIN[min(6, tone)]
            if seam < .11:
                # szew: najciemniejszy ton materiału (STYLEGUIDE §3), w telegrafie prześwieca jad
                c = SKIN[max(0, tone - 2)]
                if glow > 0 and hash01(pid, 11, seed) < .25 + glow * .6:
                    c = VEN[2 + int(glow * 3.9)]
            elif seam < .2 and li2 > .6:
                c = SKIN[min(6, tone + 1)]  # jasny brzeg łuski od strony światła
            img.put(x, y, c)
    r = random.Random(seed)
    for _ in range(11):  # brodawki z pikselem blasku
        a, d = r.uniform(0, math.tau), r.uniform(.2, .78)
        wx, wy = int(cx + math.cos(a) * rx * d), int(cy + math.sin(a) * ry * d)
        img.put(wx, wy, WART[1])
        if math.sin(a) > -.2:
            img.put(wx - 1, wy - 1, SKIN[6])
    pr = 2.4  # por na szczycie
    pcx, pcy = cx, cy - ry * .42
    for y in range(int(pcy - 3), int(pcy + 4)):
        for x in range(int(pcx - 4), int(pcx + 5)):
            nx, ny = (x + .5 - pcx) / pr, (y + .5 - pcy) / (pr * .75)
            if nx * nx + ny * ny <= 1:
                img.put(x, y, (VEN[4] if ny < 0 else VEN[2]) if glow else (WART[0] if ny < .3 else SKIN[1]))
    if glow:
        img.put(int(pcx), int(pcy), VEN[6])
    else:
        img.put(int(pcx), int(pcy + pr * .75), SKIN[5])  # jasna warga poru


def mycelium(img, cx, cy, seed=91):
    """Strzępki grzybni rozchodzą się po podłodze spod purchawki."""
    r = random.Random(seed)
    for _ in range(8):
        a = r.uniform(-.3, math.pi + .3) if r.random() < .8 else r.uniform(0, math.tau)
        x, y = cx, cy
        n = r.uniform(5, 9)
        for i in range(int(n)):
            a += r.uniform(-.5, .5)
            x += math.cos(a)
            y += math.sin(a) * .6
            img.put(int(x), int(y), SPORE_DUST[1] if i < n * .6 else GROVE.stain[1])


def puffball_frame(f):
    img = Img(PUFF, PUFF)
    cx, cy = PUFF / 2, PUFF_CY
    base = Img(PUFF, PUFF)
    mycelium(base, cx, cy + 5)
    body = Img(PUFF, PUFF)
    if f < 2:  # spoczynek: lekkie „oddychanie”
        puff_body(body, cx, cy, 7, 6 + f * .4)
    elif f < 4:  # telegraf: nabrzmiewa, drży, szwy jarzą się
        puff_body(body, cx + (-1 if f == 2 else 1), cy - 1, 8.5, 7.5, glow=.5 if f == 2 else 1.0)
    elif f == 4:
        puff_body(body, cx, cy - 1, 9, 7.8, glow=1)
    else:  # sflaczała skórka z rozdartym szczytem; klatka 7 zostaje na podłodze
        ry = (5.5, 4.2, 3.4)[f - 5]
        rx = (8.5, 8.8, 9)[f - 5]
        ccy = cy + (1, 2, 3)[f - 5]
        puff_body(body, cx, ccy, rx, ry)
        for y in range(body.h):
            for x in range(body.w):
                nx, ny = (x + .5 - cx) / (rx * .5), (y + .5 - (ccy - ry * .2)) / (ry * .55)
                edge = .75 + .3 * hash01(int(math.atan2(ny, nx) * 4), f, 3)
                if nx * nx + ny * ny <= edge:
                    body.put(x, y, VEN[1] if ny > .2 else (WART[0] if ny > -.2 else SKIN[1]))
        r = random.Random(5 + f)
        for _ in range(6):  # resztki jadu ściekają po skórce
            a = r.uniform(.3, math.pi - .3)
            body.put(int(cx + math.cos(a) * rx * .7), int(ccy + math.sin(a) * ry * .5), VEN[3])
    outline(body, OUTL)
    img.blit(base, 0, 0)
    img.blit(body, 0, 0)
    if f < 2:  # obłoczek zarodników z poru
        py = int(cy - 6) - f * 2
        for i in range(3):
            img.put(int(cx) + (f + i) % 3 - 1, py - i * 2, VEN[2 + (i + f) % 3])
    if f == 4:  # pęknięcie: słup zarodników z kłębem na czubku i krople wokół
        jet = 7
        for y in range(PUFF):
            for x in range(PUFF):
                dx, dy = x + .5 - cx, y + .5 - (cy - 6)
                w = 1.6 + max(0, -dy) * .12
                cap = math.hypot(dx / 4.2, (dy + jet) / 3)
                if (-jet <= dy <= 2 and abs(dx) <= w) or cap <= 1 + .2 * hash01(x, y, 4):
                    img.put(x, y, VEN[6] if (abs(dx) < w * .5 and cap > .6) or cap < .45 else VEN[4])
        r = random.Random(77)
        for i in range(10):
            a = r.uniform(0, math.tau)
            d = r.uniform(9, 13)
            img.put(int(cx + math.cos(a) * d), int(cy - 2 + math.sin(a) * d * .7), VEN[5 if i % 2 else 3])
    return img


# ---------------- chmura ----------------
def billows(f):
    """Kłęby chmury: 9 + środkowy + 8 drobnych na brzegu (wypełniają zasięg aż do hitboxu); w pętli wirują."""
    r = random.Random(2810)
    sw = (f - 5) * .35 if f >= 6 else 0
    out = []
    for k in range(9):
        a = r.uniform(0, math.tau) + sw
        d = r.uniform(.25, .55)
        out.append((math.cos(a) * d, math.sin(a) * d, r.uniform(.42, .55), k))
    out.append((0, 0, .6, 9))
    for k in range(8):
        a = k * math.tau / 8 + .4 + sw * 1.3
        out.append((math.cos(a) * .72, math.sin(a) * .72, .3, 10 + k))
    return out


def poison_cloud_frame(f):
    img = Img(CLOUD, CLOUD)
    c = CLOUD / 2
    rad = CLOUD_RADII[f]
    sw = (f - 5) * .35 if f >= 6 else 0
    front = sorted(billows(f), key=lambda p: -p[1])  # przedni (niższy) kłąb decyduje o świetle
    for y in range(CLOUD):
        for x in range(CLOUD):
            nx, ny = (x + .5 - c) / rad, (y + .5 - c) / rad
            if nx * nx + ny * ny > 1:
                continue
            hit = None
            for px, py, pr, k in front:
                dx, dy = nx - px, ny - py
                ang = math.atan2(dy, dx)
                wob = noise(math.cos(ang) * 3 + k * 5, math.sin(ang) * 3 + f * .4, 1.2, 40 + k)
                prr = pr * (.9 + .16 * wob)
                if math.hypot(dx, dy) <= prr:
                    hit = (dx / prr, dy / prr, k)
                    break
            if hit is None:
                continue
            bx, by, k = hit
            li = sphere_light(bx * .95, by * .95) + (fbm(x + k * 30, y - f * 1.5, 6, 88) - .5) * .3
            li = li * .8 + (1 - math.hypot(nx, ny)) * TOX[f] * .4 - .08
            img.put(x, y, VEN[min(6, 2 + band(li, 6, x, y, 1.0))])
    # obrys sylwetki najciemniejszym tonem jadu (gaz bez czarnego obrysu)
    edge = []
    for y in range(CLOUD):
        for x in range(CLOUD):
            if img.p[y][x][3] == 0 and math.hypot(x + .5 - c, y + .5 - c) <= rad + .5:
                for ddx, ddy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nb = img.get(x + ddx, y + ddy)
                    if nb and nb[3] and nb != VEN[0]:
                        edge.append((x, y))
                        break
    for x, y in edge:
        img.put(x, y, VEN[0])
    # miękki brzeg gazu: Bayer 4×4 wycina piksele w pasie 3 px od sylwetki
    drop = []
    for y in range(CLOUD):
        for x in range(CLOUD):
            if not img.p[y][x][3]:
                continue
            dmin = 4
            for ddy in range(-3, 4):
                for ddx in range(-3, 4):
                    nb = img.get(x + ddx, y + ddy)
                    if nb is not None and nb[3] == 0:
                        dmin = min(dmin, max(abs(ddx), abs(ddy)))
            if dmin <= 3 and BAYER[y % 4][x % 4] < (4 - dmin) * 3:
                drop.append((x, y))
    for x, y in drop:
        img.put(x, y, CLR)
    r = random.Random(2813)
    for _ in range(6):  # smugi: krótkie łuki jasnego oparu wirujące w chmurze
        a0 = r.uniform(0, math.tau) + sw * 2
        rr = rad * r.uniform(.3, .7)
        for i in range(9):
            a = a0 + i * .09
            img.put(int(c + math.cos(a) * rr), int(c + math.sin(a) * rr), VEN[6])
    for _ in range(20):  # blade zarodniki unoszą się
        a, d = r.uniform(0, math.tau) + sw * 1.5, r.uniform(.05, .8)
        x, y = int(c + math.cos(a) * d * rad), int(c + math.sin(a) * d * rad - f * .6)
        if img.get(x, y) and img.get(x, y)[3]:
            img.put(x, y, SPORE_DUST[0])
    for k in range(4):  # bąble wypływają i pękają
        a, d = r.uniform(0, math.tau), r.uniform(.15, .6)
        bx = int(c + math.cos(a) * d * rad)
        by = int(c + math.sin(a) * d * rad) - (f * 2 + k) % 7
        if not (img.get(bx, by) and img.get(bx, by)[3]):
            continue
        if (f + k) % 4 == 3:
            for ox, oy in ((2, 0), (-2, 0), (0, 2), (0, -2)):
                img.put(bx + ox, by + oy, VEN[6])
        else:
            for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                img.put(bx + ox, by + oy, VEN[1])
            img.put(bx - 1, by - 1, VEN[6])
    return img


# ---------------- wyrzut zarodników i skażona posadzka ----------------
BURST_RADII = (10, 18, 25, 29, 30)


def spore_burst_frame(f):
    img = Img(CLOUD, CLOUD)
    c = CLOUD / 2
    rr = BURST_RADII[f]
    if f < 2:  # błysk
        for y in range(CLOUD):
            for x in range(CLOUD):
                d = math.hypot(x + .5 - c, y + .5 - c)
                if d < rr * (.85 + .15 * noise(x, y, 3, 9 + f)):
                    img.put(x, y, VEN[6] if d < rr * .5 else VEN[5])
    r = random.Random(500)
    for i in range(36):  # pierścień kropel ze smugą
        a = r.uniform(0, math.tau)
        d = rr * r.uniform(.88, 1.0)
        img.put(int(c + math.cos(a) * d), int(c + math.sin(a) * d), VEN[6] if (i + f) % 3 == 0 else VEN[4])
        if f < 3:
            img.put(int(c + math.cos(a) * (d - 2)), int(c + math.sin(a) * (d - 2)), VEN[3])
    return img


def poison_stain_frame(_f=0, seed=5):
    img = Img(CLOUD, CLOUD)
    c = CLOUD / 2
    for y in range(CLOUD):
        for x in range(CLOUD):
            dx, dy = x + .5 - c, y + .5 - c
            d = math.hypot(dx, dy)
            ang = math.atan2(dy, dx)
            reach = STAIN_RADIUS * (.93 + .07 * noise(math.cos(ang) * 5 + 3, math.sin(ang) * 5 + 3, 1.5, seed))
            if d > reach:
                continue
            t = d / reach
            nn = noise(x, y, 6, seed + 1)
            if t > .9:
                img.put(x, y, STAIN[2])  # jaśniejszy brzeg: granica trucizny
            elif nn > .62:
                img.put(x, y, STAIN[1])
            elif t > .55 or nn > .4:
                img.put(x, y, STAIN[0])
    return img
