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


def build():
    spider, sf = directional_sheet(CELL, infected_spider_frame, 4)
    fungoid, ff = directional_sheet(CELL, fungoid_frame, 8)
    spore, spf = strip_sheet(SPORE, spore_ball_frame, 4)
    patch, pf = strip_sheet(PATCH, mycelium_patch_frame, 8)
    return {
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
