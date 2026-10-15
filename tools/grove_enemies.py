"""
Generator wrogów Grzybni (krok 28b): zarażony pająk (wariant Rushera), grzybiec (wariant Kitera)
i jego kula zarodników. Narzędzia i rampy z tower_ruins_tiles.py / spider_sprites.py / lair_enemies.py.

Użycie (z katalogu głównego repozytorium):
  python tools/grove_enemies.py                       # arkusze do public/assets/sprites/
  python tools/grove_enemies.py --preview tools/out   # dodatkowo podglądy 4x na podłodze Grzybni

Arkusze (STYLEGUIDE §2, §8, §10; wiersze = 8 kierunków N..NW z obrotu, obrys po obrocie):
  infected-spider_walk.png  48x48; kolumny 0–3 chód (klatka 0 = stanie)
  fungoid_walk-spit.png     48x48; kolumny 0–3 chód, 4–7 plucie (kula wylatuje w kolumnie 7)
  spore-ball.png            16x16, bez kierunków; 4 klatki pulsowania kuli zarodników
  mycelium-patch.png        96x96, bez kierunków (krok 29): płat trującej grzybni Króla Pająków; 0–5 rozrost
                            (promień 14→40 px = hitbox płatu), 6–7 pulsowanie świecących bulw
  puffball.png              32x32, bez kierunków (krok 28c): purchawka; 0–1 spoczynek (pory dymią), 2–3 nabrzmiewa
                            i drży (telegraf), 4–7 pęka; klatka 7 to sflaczała skórka zostająca na podłodze
  poison-cloud.png          96x96, bez kierunków (krok 28c): trująca chmura purchawki; 0–5 rozrost
                            (promień 20→44 px = hitbox chmury), 6–7 kłębienie

Zarażony pająk to pająk leża porośnięty grzybem: na odwłoku kościste kapelusze zamiast białych pręg,
oczy w cyjanie bioluminescencji. Grzybiec: rdzawy kapelusz z bladymi łatkami i jasnym rondem blaszek
(kontrast z fioletową podłogą), za nim wloką się korzenie, cyjanowe oczy pod przednim rondem. Kula zarodników:
jadowicie zielony rdzeń w bladym obłoku — ten sam kolor co zielona barwa zatrutego gracza.
"""
import argparse
import math
import os
import random
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import Img, ok
from spider_sprites import CHITIN, band_shade, ellipse, mirror, stroke
from lair_enemies import SPIDER_LEGS, LEG_SCALE, directional_sheet, strip_sheet, validate

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 48
MARGIN = 8
SPORE = 16

GROVE = trt.PALETTES['grzybnia']
BONE = GROVE.bone        # kościste kapelusze: cień → blask
GLOW = GROVE.flame       # bioluminescencja: ciemny cyjan → blask
SPORE_DUST = GROVE.ash   # zarodniki: jasny, cień
# Kapelusz grzybca: rdzawa ochra — barwa daleko od fioletu podłogi (czytelność, STYLEGUIDE §6a).
CAP = (ok(.30, .080, 35), ok(.39, .100, 40), ok(.48, .115, 45), ok(.58, .115, 55), ok(.70, .090, 70))
STEM = (ok(.62, .030, 300), ok(.74, .025, 305))
# Jad: zieleń trucizny (jak STATUS_TINTS.poison w grze), ciemna → jasna.
VENOM = (ok(.55, .150, 140), ok(.70, .180, 138), ok(.84, .150, 135))


def shroom_cap(img, cx, cy, rx, ry):
    """Mały kościsty kapelusz w rzucie z góry: jasna górna połowa, cień od dołu, plamka blasku."""
    ellipse(img, cx, cy, rx, ry, lambda nx, ny: BONE[2] if nx + ny < -.6 else (BONE[1] if ny < .35 else BONE[0]))


# ---------------- zarażony pająk (Rusher) ----------------
def infected_spider_frame(f):
    img = Img(CELL, CELL)
    c = CELL / 2
    step = (0, -2, 0, 2)[f]
    for side in (1, -1):
        for i, (a, k, t) in enumerate(SPIDER_LEGS):
            group = (i + (0 if side > 0 else 1)) % 2
            dy = step if group == 0 else -step
            pts = [a, (k[0], k[1] + dy * .5), (t[0], t[1] + dy)]
            pts = [(c + (x - c) * LEG_SCALE, c + (y - c) * LEG_SCALE) for x, y in pts]
            if side < 0:
                pts = [mirror(p, c) for p in pts]
            stroke(img, pts[:2], 2.6, CHITIN[2], edge=CHITIN[3])
            stroke(img, pts[1:], 2.2, CHITIN[2])
    # Odwłok porośnięty grzybem: trzy kościste kapelusze (zamiast białych pręg pająka leża).
    ellipse(img, c, c + 5, 7, 8, band_shade(CHITIN))
    shroom_cap(img, c - 2, c + 3, 3.2, 2.6)
    shroom_cap(img, c + 3, c + 7, 2.6, 2.2)
    shroom_cap(img, c - 2, c + 10, 2.2, 1.8)
    # Strzępki wychodzące spod kapeluszy.
    for x, y in ((c + 5, c + 2), (c - 6, c + 7), (c + 1, c + 12)):
        img.put(int(x), int(y), SPORE_DUST[1])
    # Głowotułów, kły i cyjanowe oczy.
    ellipse(img, c, c - 5, 5.5, 5, band_shade(CHITIN, light=(-.4, -.7)))
    img.put(int(c) - 2, int(c) - 11, BONE[1])
    img.put(int(c) + 1, int(c) - 11, BONE[1])
    for ex in (-2, 1):
        img.put(int(c) + ex, int(c) - 8, GLOW[3])
    for ex in (-4, 3):
        img.put(int(c) + ex, int(c) - 7, GLOW[2])
    return img


# ---------------- grzybiec (Kiter) ----------------
def fungoid_frame(f):
    """Grzybiec w rzucie z góry (przód = N): rdzawy kapelusz z jasnym rondem blaszek, za nim wloką się
    blade korzenie (pełznie jak ślimak), cyjanowe oczy pod przednim rondem.
    f 0–3: pełzanie (korzenie falują, kapelusz kołysze się o 1 px); f 4–7: plucie (kapelusz nabrzmiewa,
    przed pyskiem rośnie zielony obłok zarodników)."""
    img = Img(CELL, CELL)
    c = CELL / 2
    walk = f < 4
    swell = 0 if walk else (0, 1, 2, 0)[f - 4]
    bob = (0, 1, 0, 1)[f] if walk else 0
    wave = (0, 1, 0, -1)[f] if walk else 0
    cy = c - 1 + bob
    rx, ry = 9 + swell, 8.5 + swell
    # Korzenie wlokące się za kapeluszem (S): cztery cienkie, falujące pasma.
    for i, x0 in enumerate((-5, -2, 2, 5)):
        sway = wave if i % 2 == 0 else -wave
        pts = [(c + x0, cy + ry - 2), (c + x0 * 1.2 + sway, cy + ry + 2.5 - swell), (c + x0 * 1.3 - sway, cy + ry + 5.5 - swell)]
        stroke(img, pts, 1.6, STEM[0])
    # Rondo blaszek: jasny pierścień trzonu wystający spod kapelusza.
    ellipse(img, c, cy, rx + 1.2, ry + 1.2, lambda nx, ny: STEM[1] if ny < .2 else STEM[0])
    # Kapelusz z łatkami.
    ellipse(img, c, cy, rx, ry, band_shade(CAP))
    for sx, sy, sr in ((-4, -2, 1.6), (3, -3, 1.3), (2, 3, 1.8), (-3, 4, 1.2), (5, 1, 1.0)):
        ellipse(img, c + sx, cy + sy, sr, sr, lambda nx, ny: BONE[2] if nx + ny < -.5 else BONE[1])
    # Oczy pod przednim rondem.
    front = cy - ry - 1
    for ex in (-3, 2):
        img.put(int(c) + ex, int(front), GLOW[3])
        img.put(int(c) + ex + (1 if ex > 0 else 1), int(front), GLOW[2])
    if not walk and f >= 5:  # obłok zarodników przed pyskiem (kolumny 5–7)
        r = (0, 1.6, 2.2, 2.6)[f - 4]
        ellipse(img, c, front - .5 - r * .6, r + .8, r, lambda nx, ny: VENOM[2] if nx + ny < -.4 else VENOM[1])
    return img


# ---------------- kula zarodników (16x16) ----------------
def spore_ball_frame(f):
    """Kula zarodników: jadowicie zielony rdzeń w bladym obłoku zarodników; pulsuje o 1 px."""
    img = Img(SPORE, SPORE)
    c = SPORE / 2
    r = (4.4, 4.8, 4.4, 4.0)[f]
    ellipse(img, c, c, r, r, lambda nx, ny: SPORE_DUST[0] if nx + ny < -.6 else SPORE_DUST[1])
    ellipse(img, c, c, r - 1.6, r - 1.6, lambda nx, ny: VENOM[2] if nx + ny < -.5 else (VENOM[1] if nx + ny < .5 else VENOM[0]))
    return img


# ---------------- płat grzybni Króla (96x96, krok 29) ----------------
PATCH = 96
# Promienie klatek rozrostu = webPatchRadius w grze (bossConfig.SPIDER_KING.bloom: startRadius 14 → maxRadius 40).
PATCH_RADII = (14, 19, 24, 30, 35, 40, 40, 40)
# Zieleń zakażenia Króla (jak bulwy na jego odwłoku): ciemna masa → świecące bulwy.
KING_MOSS = (ok(.30, .060, 140), ok(.38, .080, 136), ok(.48, .100, 132))
KING_BULB = (ok(.62, .140, 126), ok(.76, .160, 122), ok(.90, .130, 115))


def mycelium_patch_frame(f):
    """Płat grzybni: postrzępiona plama zielonej masy z promieniście rozchodzącymi się strzępkami na brzegu,
    świecące bulwy w środku. Zasięg rysunku = promień płatu w tej klatce (hitbox)."""
    img = Img(PATCH, PATCH)
    c = PATCH / 2
    rad = PATCH_RADII[f]
    r = random.Random(2900)  # ten sam kształt w każdej klatce — rośnie, a nie skacze
    lobes = [r.uniform(.78, 1.0) for _ in range(16)]
    for y in range(PATCH):
        for x in range(PATCH):
            dx, dy = x + .5 - c, y + .5 - c
            d = math.hypot(dx, dy)
            a = (math.atan2(dy, dx) + math.pi) / (2 * math.pi) * 16
            i0 = int(a) % 16
            edge = rad * (lobes[i0] + (lobes[(i0 + 1) % 16] - lobes[i0]) * (a - int(a)))
            if d > edge - 1:
                continue
            t = d / edge
            img.put(x, y, KING_MOSS[2] if t < .45 else (KING_MOSS[1] if t < .8 else KING_MOSS[0]))
    for k in range(10):  # strzępki od środka do brzegu
        ang = r.uniform(0, 2 * math.pi)
        for j in range(int(rad * .55), int(rad)):
            img.put(int(c + math.cos(ang) * j), int(c + math.sin(ang) * j), SPORE_DUST[1])
    pulse = f >= 6
    for k in range(3 + min(f, 5)):  # bulwy — więcej, im większy płat
        ang, dist = r.uniform(0, 2 * math.pi), r.uniform(0, rad * .6)
        br = r.uniform(1.6, 2.8) + (.5 if pulse and (k + f) % 2 else 0)
        ellipse(img, c + math.cos(ang) * dist, c + math.sin(ang) * dist, br, br,
                lambda nx, ny: KING_BULB[2] if nx + ny < -.6 else (KING_BULB[1] if nx + ny < .5 else KING_BULB[0]))
    return img


# ---------------- purchawka (32x32, krok 28c) ----------------
PUFF = 32
PUFF_CY = 18
# Skórka purchawki: blady beż (jak dojrzała purchawka) — jasna plama na fioletowej podłodze, inna niż biały kokon.
PUFF_SKIN = (ok(.42, .035, 70), ok(.54, .040, 75), ok(.66, .040, 80), ok(.78, .035, 85), ok(.88, .025, 90))
# Brodawki i por: brąz dojrzałych zarodników.
PUFF_WART = (ok(.34, .040, 55), ok(.45, .045, 60))


def puffball_body(img, cx, cy, rx, ry, pore_glow, seed):
    """Kulista purchawka (z góry, lekko spłaszczona): skórka z brodawkami, ciemny por na szczycie."""
    ellipse(img, cx, cy, rx, ry, band_shade(PUFF_SKIN))
    r = random.Random(seed)
    for _ in range(7):  # brodawki
        a, d = r.uniform(0, math.tau), r.uniform(.25, .75)
        img.put(int(cx + math.cos(a) * rx * d), int(cy + math.sin(a) * ry * d), PUFF_WART[1])
    # Por na szczycie (lekko z tyłu): ciemny krąg; w telegrafie jarzy się jadem.
    ellipse(img, cx, cy - ry * .35, 1.8, 1.4, lambda nx, ny: VENOM[1] if pore_glow else PUFF_WART[0])
    if pore_glow:
        img.put(int(cx), int(cy - ry * .35), VENOM[2])


def puffball_frame(f):
    img = Img(PUFF, PUFF)
    cx = PUFF / 2
    if f < 2:  # spoczynek: z poru unosi się pojedynczy obłoczek zarodników
        puffball_body(img, cx, PUFF_CY, 7, 6, False, 2800)
        y = PUFF_CY - 6 - f * 2
        img.put(int(cx) + f, y, SPORE_DUST[1])
        img.put(int(cx) - 1 + f, y - 1, VENOM[1])
    elif f < 4:  # telegraf: nabrzmiewa, drży, por świeci
        shake = -1 if f == 2 else 1
        puffball_body(img, cx + shake, PUFF_CY - 1, 8.5, 7.5, True, 2800)
    elif f == 4:  # pęknięcie: por rozdziera się, tryska jad
        puffball_body(img, cx, PUFF_CY - 1, 9, 7.8, True, 2800)
        ellipse(img, cx, PUFF_CY - 6, 4, 3, lambda nx, ny: VENOM[2] if nx + ny < -.3 else VENOM[1])
    else:  # skórka flaczeje; klatka 7 to płaskie resztki z rozdartym szczytem
        ry = (5.5, 4.2, 3.4)[f - 5]
        rx = (8.5, 8.8, 9)[f - 5]
        cy = PUFF_CY + (1, 2, 3)[f - 5]
        puffball_body(img, cx, cy, rx, ry, False, 2800)
        # rozdarty szczyt: postrzępiona dziura z ciemnym wnętrzem
        ellipse(img, cx, cy - ry * .2, rx * .45, ry * .5, lambda nx, ny: PUFF_WART[0] if ny > -.2 else PUFF_SKIN[0])
        if f < 7:  # resztki obłoku nad dziurą
            ellipse(img, cx, cy - ry - 2, 2.5 - (f - 5), 1.8 - (f - 5) * .5, lambda nx, ny: VENOM[1])
    return img


# ---------------- trująca chmura purchawki (96x96, krok 28c) ----------------
CLOUD = 96
# Promienie klatek rozrostu = poisonCloudRadius w grze (biomeConfig Grzybni: startRadius 20 → maxRadius 44).
CLOUD_RADII = (20, 25, 30, 34, 39, 44, 44, 44)


def poison_cloud_frame(f):
    """Chmura: kłęby jadowitej zieleni (kilka nakładających się kul), jaśniejsze czubki kłębów i blade
    zarodniki. Zasięg rysunku = promień chmury w tej klatce (hitbox). W grze rysowana półprzezroczyście."""
    img = Img(CLOUD, CLOUD)
    c = CLOUD / 2
    rad = CLOUD_RADII[f]
    r = random.Random(2810)  # ten sam układ kłębów w każdej klatce — chmura rośnie, a nie skacze
    swirl = (f - 5) * .35 if f >= 6 else 0  # kłębienie: kłęby obracają się wokół środka
    puffs = []
    for k in range(9):
        a = r.uniform(0, math.tau) + swirl
        d = r.uniform(.25, .55)
        pr = r.uniform(.42, .55)
        puffs.append((math.cos(a) * d, math.sin(a) * d, pr))
    puffs.append((0, 0, .6))
    # Jedna sylwetka (suma kłębów) z ciemnym brzegiem; na każdym kłębie tylko jasny półksiężyc od lewej-góry
    # (czubek kłębu), bez obwódek w środku — gaz, a nie kiść kul. Przedni (niższy) kłąb decyduje o świetle.
    front_first = sorted(puffs, key=lambda p: -p[1])
    for y in range(CLOUD):
        for x in range(CLOUD):
            nx, ny = (x + .5 - c) / rad, (y + .5 - c) / rad
            if nx * nx + ny * ny > 1:
                continue
            qs = [math.hypot(nx - px, ny - py) / pr for px, py, pr in puffs]
            if min(qs) > 1:
                continue
            if min(qs) > .88:
                img.put(x, y, VENOM[0])
                continue
            px, py, pr = next(p for p in front_first if math.hypot(nx - p[0], ny - p[1]) <= p[2])
            # półksiężyc: w kłębie, ale poza tym samym kłębem przesuniętym w prawo-dół
            crescent = math.hypot(nx - px - pr * .22, ny - py - pr * .26) > pr * .92
            img.put(x, y, VENOM[2] if crescent else VENOM[1])
    for k in range(14):  # blade zarodniki w chmurze
        a, d = r.uniform(0, math.tau) + swirl * 1.5, r.uniform(.1, .8)
        img.put(int(c + math.cos(a) * d * rad), int(c + math.sin(a) * d * rad), SPORE_DUST[0])
    return img


def build():
    spider, sf = directional_sheet(CELL, infected_spider_frame, 4)
    fungoid, ff = directional_sheet(CELL, fungoid_frame, 8)
    spore, spf = strip_sheet(SPORE, spore_ball_frame, 4)
    patch, pf = strip_sheet(PATCH, mycelium_patch_frame, 8)
    puff, puf = strip_sheet(PUFF, puffball_frame, 8)
    cloud, cf = strip_sheet(CLOUD, poison_cloud_frame, 8)
    return {
        'puffball.png': (puff, puf, PUFF, 2),
        'poison-cloud.png': (cloud, cf, CLOUD, 1),
        'mycelium-patch.png': (patch, pf, PATCH, 1),
        'infected-spider_walk.png': (spider, sf, CELL, MARGIN),
        'fungoid_walk-spit.png': (fungoid, ff, CELL, MARGIN),
        'spore-ball.png': (spore, spf, SPORE, 1),
    }


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator wrogów Grzybni')
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
            bg = Image.new('RGBA', im.size, GROVE.floor[2])
            bg.alpha_composite(im)
            bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(
                os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
