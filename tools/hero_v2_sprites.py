"""
Postacie 2.0 (krok U5a, STYLEGUIDE §13.9): nowe stany bohaterów — bezruch, trafienie, dash i śmierć —
oraz akcent barwy klasy (karwasze i rzemień, ok. 10% sylwetki). Pilot: barbarzyńca.

Użycie (z katalogu głównego repozytorium, wymaga Pillow — tools/requirements.txt):
  python tools/hero_v2_sprites.py                       # arkusz do public/assets/sprites/
  python tools/hero_v2_sprites.py --preview tools/out   # dodatkowo podgląd 4x na podłodze palety C

Źródło: klatki N z `barbarian_sword.py` (chód z mieczem i cios). Nowe klatki powstają na N z przesunięć
części ciała (barki, przedramiona, głowa) i rysunku leżącej postaci, a 8 kierunków — z obrotu co 45°
z obrysem po obrocie, jak w kroku 21. Stary arkusz `blond-barbarian_walk-attack.png` zostaje bez zmian.

Arkusz blond-barbarian_v2.png (1008x384, komórka 48x48, pivot 24,24), kolumny:
  0–3 chód, 4–7 cios (jak w kroku 21, z akcentem), 8–10 bezruch (oddech), 11–12 trafienie,
  13–14 dash, 15–20 śmierć (ostatnia klatka zostaje na podłodze).
"""
import argparse
import colorsys
import math
import os
import sys

from PIL import Image

import barbarian_sword as bs
from barbarian_sword import CELL, SKIN, SKIN_HI, SKIN_SH, FUR, LEATHER, BLADE_HI, BLADE_SH
from tower_ruins_tiles import OUT, Img, hx, outline
from loot_sprites import rotate45

OUT_NAME = 'blond-barbarian_v2.png'
COLUMNS = 21

# Włosy barbarzyńcy (z paczki) — po nich rozpoznajemy głowę.
HAIR = {hx('#f2d064'), hx('#c99a2e'), hx('#fbeaa6'), hx('#7a5418')}
HAIR_DARK, HAIR_MID, HAIR_HI = hx('#7a5418'), hx('#c99a2e'), hx('#f2d064')
BOOT = hx('#3b2a1e')


def hsl(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h / 360, l, s)
    return (round(r * 255), round(g * 255), round(b * 255), 255)


# Barwa klasy (config/heroColorConfig.ts: HERO_HUES 38°, rola dominująca) — rampa barwionej skóry.
CLASS_HUE = 38
ACCENT = (hsl(CLASS_HUE, .62, .26), hsl(CLASS_HUE, .66, .42), hsl(CLASS_HUE, .72, .58))


def accent(img):
    """Futro karwaszy i rzemienie → barwiona skóra w barwie klasy (ciemna / średnia / jasna)."""
    for y in range(CELL):
        for x in range(CELL):
            c = img.p[y][x]
            if c == FUR:
                img.p[y][x] = ACCENT[1] if (x + y) % 3 else ACCENT[2]
            elif c == LEATHER:
                img.p[y][x] = ACCENT[0]
    return img


def copy(img):
    out = Img(CELL, CELL)
    out.blit(img, 0, 0)
    return out


def move(img, region, dx, dy):
    """Przesuwa piksele, dla których `region(x, y, c)` jest prawdą; reszta zostaje pod spodem."""
    out = Img(CELL, CELL)
    moved = []
    for y in range(CELL):
        for x in range(CELL):
            c = img.p[y][x]
            if not c[3]:
                continue
            if region(x, y, c):
                moved.append((x + dx, y + dy, c))
            else:
                out.put(x, y, c)
    for x, y, c in moved:
        out.put(x, y, c)
    return out


def left_arm(x, y, c):
    return x < 19 and c not in HAIR


def right_arm(x, y, c):
    return x >= 29 and c not in HAIR


def forearm(x, y, c):
    return (x < 19 or x >= 29) and y < 19 and c not in HAIR


def head(x, y, c):
    return c in HAIR


def idle_frames(base):
    """Oddech: barki rozchodzą się o piksel, potem miecz unosi się o piksel."""
    f0 = copy(base)
    f1 = move(move(base, left_arm, -1, 0), right_arm, 1, 0)
    f2 = move(f1, forearm, 0, -1)
    return [f0, f1, f2]


def hit_frames(base):
    """Trafienie: cała postać odskakuje do tyłu, głowa odchyla się mocniej, ramiona rozrzucone."""
    back = move(base, lambda x, y, c: True, 0, 1)
    h0 = move(move(move(back, left_arm, -2, 1), right_arm, 2, 1), head, 0, 1)
    h1 = move(move(back, left_arm, -1, 0), right_arm, 1, 0)
    return [h0, h1]


def dash_frames(base):
    """Dash: głowa w przód, przedramiona odrzucone w tył i do ciała, plecy ciągną się za postacią."""
    lean = move(base, head, 0, -1)
    d0 = move(move(lean, lambda x, y, c: x < 19 and y < 22 and c not in HAIR, 1, 4),
              lambda x, y, c: x >= 29 and y < 22 and c not in HAIR, -1, 4)
    d1 = move(d0, lambda x, y, c: y >= 27 and 18 <= x < 30, 0, 1)
    return [d0, d1]


def ellipse(img, cx, cy, rx, ry, fn):
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            if dx * dx + dy * dy <= 1:
                c = fn(x, y, dx, dy)
                if c:
                    img.put(x, y, c)


def limb(img, a, b, half, fn):
    ax, ay = a
    bx, by = b
    length = math.hypot(bx - ax, by - ay)
    ux, uy = (bx - ax) / length, (by - ay) / length
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = x + .5 - ax, y + .5 - ay
            t = dx * ux + dy * uy
            s = -dx * uy + dy * ux
            if -.4 <= t <= length + .4 and abs(s) <= half:
                img.put(x, y, fn(t / length, s))


def skin(t, s):
    return SKIN_HI if s < -.6 else SKIN_SH if s > .6 else SKIN


def prone(spread, sword_off):
    """Leżący twarzą w dół (głowa na N): plecy z futrem, ramiona rozrzucone, nogi, miecz obok."""
    img = Img(CELL, CELL)
    # nogi w skórzanych spodniach i buty
    for lx in (21.5, 26.5):
        limb(img, (lx, 27), (lx + (lx - 24) * .5, 36.5), 1.6,
             lambda t, s: BOOT if t > .78 else ACCENT[0] if s > .5 else LEATHER)
    # ramiona — od barków na boki i w przód
    hands = ((18 - 7 * spread, 19 - 3 * spread), (30 + 7 * spread, 21 + 3 * spread))
    limb(img, (19, 20), hands[0], 1.5, skin)
    limb(img, (29, 20), hands[1], 1.5, skin)
    for fx, fy in hands:
        ellipse(img, fx, fy, 1.6, 1.6, lambda x, y, dx, dy: SKIN_HI if dx + dy < -.4 else SKIN)
    # plecy: futrzana narzuta na skórze, rzemień w barwie klasy po skosie
    ellipse(img, 24, 23, 6.2, 6.8, lambda x, y, dx, dy: FUR if dy < .35 else LEATHER)
    ellipse(img, 24, 21.5, 4.6, 4, lambda x, y, dx, dy: SKIN_SH if dy > .3 else SKIN)
    limb(img, (20.5, 19.5), (27.5, 27.5), .6, lambda t, s: ACCENT[1])
    # głowa (potylica, włosy)
    ellipse(img, 24, 14.5, 4.4, 4.2,
            lambda x, y, dx, dy: HAIR_HI if dx + dy < -.5 else HAIR_DARK if dx + dy > .9 else HAIR_MID)
    # miecz wypadł z ręki — leży obok
    ox, oy = sword_off
    limb(img, (ox, oy), (ox - 2, oy + 8), .9, lambda t, s: BLADE_HI if s < 0 else BLADE_SH)
    limb(img, (ox - .6, oy - 1.2), (ox + .4, oy - 1.6), 1.6, lambda t, s: LEATHER)
    return accent(img)


def death_frames(base, hit):
    """Śmierć: trafienie, osunięcie na kolana, pad w przód i leżąca postać (ostatnia klatka zostaje)."""
    kneel = move(move(move(hit, left_arm, 0, 2), right_arm, 0, 2), head, 0, 1)
    slump = move(kneel, head, 0, -2)
    return [hit, kneel, slump, prone(.55, (39, 23)), prone(.85, (40, 24)), prone(1, (40, 24))]


def build():
    _, local, _ = bs.build()
    base = [accent(copy(f)) for f in local]  # 0–3 chód, 4–7 cios
    walk0 = base[0]
    hits = hit_frames(walk0)
    columns = base + idle_frames(walk0) + hits + dash_frames(walk0) + death_frames(walk0, hits[0])
    assert len(columns) == COLUMNS
    sheet = Img(CELL * COLUMNS, CELL * 8)
    frames = []
    for col, img_n in enumerate(columns):
        for row in range(8):
            img = rotate45(img_n, row)
            outline(img, OUT)
            sheet.blit(img, col * CELL, row * CELL)
            frames.append((f'r{row}c{col}', img))
    return sheet, columns, frames


# ---------------- Czarodziejka i łucznik (krok U5b) ----------------
# Kolumny 0–7 kopiujemy z dotychczasowych arkuszy bez zmian (chód, rzut / łuk), a nowe stany dopisujemy
# w tym samym układzie co u barbarzyńcy: 8–10 bezruch, 11–12 trafienie, 13–14 dash, 15–20 śmierć.
# Barwa klasy jest już na sylwetce (fioletowa suknia z kroku 181, zielona peleryna łucznika) — bez nowych akcentów.
import sorceress_sprites as ss  # noqa: E402
import archer_sprites as ar  # noqa: E402


def shift(img, dx, dy):
    return move(img, lambda x, y, c: True, dx, dy)


def colored(colors):
    colors = set(colors)
    return lambda x, y, c: c in colors


def sorc(staff=0, hem=0, hair=(0, 0, 0), crystal='rest'):
    return ss.body_frame({'staff': staff, 'hem': hem, 'hair': hair, 'crystal': crystal})


SORC_HEAD = colored([*ss.HAIR, *ss.SKIN])


def sorceress_prone(spread, staff_off):
    """Czarodziejka leży twarzą w dół (głowa na N): suknia rozłożona, włosy rozsypane, kostur obok, kryształ zgasł."""
    img = Img(CELL, CELL)
    # suknia — wydłużona plama od talii w tył
    ellipse(img, 24, 27, 8.5, 9.5, lambda x, y, dx, dy: ss.DRESS[1] if dy > .55 or dx > .6 else
            ss.DRESS[3] if dx < -.55 and dy < 0 else ss.DRESS[2])
    for k in (-1, 1):  # fałdy
        limb(img, (24 + 2 * k, 24), (24 + 5 * k, 34), .45, lambda t, s: ss.DRESS[0])
    ellipse(img, 24, 19.5, 6, 3.4, lambda x, y, dx, dy: ss.DRESS[3] if dx < .3 else ss.DRESS[2])
    # ramiona w rękawach wyciągnięte w przód
    hands = ((18 - 3 * spread, 12 - 2 * spread), (30 + 3 * spread, 13 - spread))
    for sx, (hx_, hy_) in zip((19.5, 28.5), hands):
        limb(img, (sx, 19), (hx_, hy_), 1.1, lambda t, s: ss.DRESS[3] if s < 0 else ss.DRESS[2])
        ellipse(img, hx_, hy_, 1.3, 1.3, lambda x, y, dx, dy: ss.SKIN[1] if dx + dy < 0 else ss.SKIN[0])
    # włosy rozsypane wokół głowy
    ellipse(img, 24, 14.5, 5.2 + spread, 5.2,
            lambda x, y, dx, dy: ss.HAIR[2] if dx + dy < -.6 else ss.HAIR[0] if dx + dy > .8 else ss.HAIR[1])
    for k in (-1, 1):
        limb(img, (24 + 3 * k, 13), (24 + (6 + 2 * spread) * k, 9 + spread), .9, lambda t, s: ss.HAIR[1])
    # kostur upuszczony z prawej, kryształ przygasły
    ox, oy = staff_off
    limb(img, (ox, oy), (ox - 3, oy + 13), .8, lambda t, s: ss.WOOD[2] if s < 0 else ss.WOOD[1])
    ellipse(img, ox + .6, oy - 1.6, 1.6, 2.1, lambda x, y, dx, dy: ss.CRYSTAL[1] if dx < 0 else ss.CRYSTAL[0])
    return img


def sorceress_columns():
    idle = [sorc(hair=(1, 0, 0)), sorc(hair=(0, 1, 0), crystal='charge'), sorc(hair=(-1, 0, 0), crystal='bright')]
    h0 = shift(sorc(staff=2, hair=(0, -2, 1), crystal='charge'), 0, 1)
    h1 = sorc(staff=1, hair=(0, -1, 0))
    dash = [sorc(staff=-1, hair=(0, 4, 0), crystal='bright'), sorc(staff=-1, hair=(1, 5, 1), crystal='bright')]
    kneel = move(shift(sorc(staff=3, hair=(0, -1, 0), crystal='charge'), 0, 1), SORC_HEAD, 0, 1)
    slump = move(kneel, SORC_HEAD, 0, -3)
    death = [h0, kneel, slump, sorceress_prone(0, (35, 15)), sorceress_prone(.6, (37, 17)),
             sorceress_prone(1, (37, 17))]
    return idle + [h0, h1] + dash + death


def arch(feet=(0, 0), hem=0):
    return ar.body_frame({'feet': feet, 'hem': hem, 'bow': 'side'})


ARCH_HOOD = colored([ar.CLOAK[2], ar.CLOAK[3], ar.CLOAK[4], *ar.SKIN])


def arch_bow(x, y, c):
    """Łuk przy boku i ręka z nim — wszystko na lewo od kaftana."""
    return x < 15


def archer_prone(spread, bow_off):
    """Łucznik leży twarzą w dół: peleryna na plecach, kołczan wysypany, łuk obok."""
    img = Img(CELL, CELL)
    for lx in (21.5, 26.5):  # nogi i buty
        limb(img, (lx, 28), (lx + (lx - 24) * .4, 37), 1.5, lambda t, s: ar.LEATHER[0] if t > .75 else ar.LEATHER[1])
    hands = ((17 - 5 * spread, 18 - 4 * spread), (31 + 5 * spread, 19 + 2 * spread))
    for sx, (hx_, hy_) in zip((19.5, 28.5), hands):
        limb(img, (sx, 20), (hx_, hy_), 1.2, lambda t, s: ar.LEATHER[2] if s < 0 else ar.LEATHER[1])
        ellipse(img, hx_, hy_, 1.3, 1.3, lambda x, y, dx, dy: ar.SKIN[1] if dx + dy < 0 else ar.SKIN[0])
    ellipse(img, 24, 24, 7.5, 8, lambda x, y, dx, dy: ar.CLOAK[0] if dy > .6 else ar.CLOAK[2] if dx < -.5 else ar.CLOAK[1])
    limb(img, (24, 23), (24, 31), .45, lambda t, s: ar.CLOAK[0])
    # kołczan i rozsypane strzały
    limb(img, (27, 21), (30, 29), 1.6, lambda t, s: ar.LEATHER[0] if s > .6 else ar.LEATHER[1])
    for i in range(2 + int(2 * spread)):
        ax, ay = 32 + i * 1.6, 27 + i * 1.3
        limb(img, (ax, ay), (ax + 4, ay + 1.5), .5, lambda t, s: ar.WOOD[2])
        img.put(int(ax), int(ay), ar.FLETCH[1])
    # kaptur
    ellipse(img, 24, 15, 4.6, 4.4, lambda x, y, dx, dy: ar.CLOAK[4] if dx + dy < -.6 else ar.CLOAK[2] if dx + dy > .7 else ar.CLOAK[3])
    # łuk upuszczony z lewej
    ox, oy = bow_off
    pts = [(ox - 2.5 * (1 - v * v), oy + 7 * v) for v in [i / 6 - 1 for i in range(13)]]
    for a, b in zip(pts, pts[1:]):
        limb(img, a, b, .8, lambda t, s: ar.WOOD[1])
    limb(img, (ox + .5, oy - 7), (ox + .5, oy + 7), .4, lambda t, s: ar.STRING[0])
    return img


def archer_columns():
    base = arch()
    idle = [base, arch(hem=1), move(arch(hem=1), arch_bow, 0, 1)]
    h0 = move(move(shift(base, 0, 1), arch_bow, -2, 1), ARCH_HOOD, 0, 1)
    h1 = move(base, arch_bow, -1, 0)
    lean = move(arch(feet=(-4, 3), hem=2), ARCH_HOOD, 0, -1)
    dash = [move(lean, arch_bow, 1, 3), move(move(lean, arch_bow, 1, 4), lambda x, y, c: y >= 30, 0, 1)]
    kneel = move(move(shift(arch(feet=(2, 2)), 0, 1), ARCH_HOOD, 0, 1), arch_bow, -1, 2)
    slump = move(kneel, ARCH_HOOD, 0, -3)
    death = [h0, kneel, slump, archer_prone(0, (12, 22)), archer_prone(.6, (11, 23)), archer_prone(1, (11, 23))]
    return idle + [h0, h1] + dash + death


def extended_sheet(old_png, new_columns, palette):
    """Stare kolumny 0–7 bez zmian + nowe klatki obrócone na 8 kierunków z obrysem."""
    old = Image.open(old_png).convert('RGBA')
    columns = 8 + len(new_columns)
    sheet = Img(CELL * columns, CELL * 8)
    for y in range(old.height):
        for x in range(old.width):
            c = old.getpixel((x, y))
            if c[3]:
                sheet.put(x, y, c)
    frames = []
    for i, img_n in enumerate(new_columns):
        col = 8 + i
        for row in range(8):
            img = rotate45(img_n, row)
            outline(img, OUT)
            sheet.blit(img, col * CELL, row * CELL)
            frames.append((f'r{row}c{col}', img))
    errors = bs.validate(new_columns, frames)
    for name, img in frames:
        extra = {c for r in img.p for c in r if c[3] and c not in palette}
        if extra:
            errors.append(f'{name}: kolory spoza palety {sorted(extra)[:3]}')
    return sheet, errors


SHEETS_V2 = {
    'sorceress_v2.png': (lambda: os.path.join(bs.SPRITES, ss.SHEET_NAME), sorceress_columns, ss.PALETTE_COLORS),
    'archer_v2.png': (lambda: os.path.join(bs.SPRITES, ar.SHEET_NAME), archer_columns, ar.PALETTE_COLORS),
}


def save_preview(sheet, path):
    im = sheet.pil()
    bg = Image.new('RGBA', im.size, bs.PALETTE.floor[2])
    bg.alpha_composite(im)
    bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(path)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator arkuszy bohaterów 2.0 (kroki U5a–U5b)')
    ap.add_argument('--out', default=bs.SPRITES)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 4x')
    a = ap.parse_args()
    sheets = []
    sheet, local, frames = build()
    sheets.append((OUT_NAME, sheet, bs.validate(local, frames)))
    for name, (source, columns, palette) in SHEETS_V2.items():
        sheet, errors = extended_sheet(source(), columns(), palette)
        sheets.append((name, sheet, errors))
    failed = False
    for name, sheet, errors in sheets:
        for e in errors[:30]:
            print(f'BŁĄD {name}:', e)
        failed = failed or bool(errors)
    if failed:
        return 1
    os.makedirs(a.out, exist_ok=True)
    for name, sheet, _ in sheets:
        sheet.pil().save(os.path.join(a.out, name))
        print(f'zapisano {name} {sheet.w}x{sheet.h}')
        if a.preview:
            os.makedirs(a.preview, exist_ok=True)
            save_preview(sheet, os.path.join(a.preview, name.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
