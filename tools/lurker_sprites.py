"""
Generator Czyhacza i jego kryjówek (krok 123): czwarty archetyp wroga — zasadzka z kryjówki przy ścianie.
Widok z góry, przód = N.

Czyhacz: zgarbiona, chuda postać o długich rękach zakończonych pazurami; dwa świecące ślepia to jedyny jasny akcent
(te same ślepia błyskają w kryjówce — subtelny znak, decyzja właściciela). Wersje biomów różnią się rampą ciała:
kamień ruin, jedwab leża, ziemia Grzybni, trupia skóra Cmentarzyska, węgiel z żarem Piekła, sadza palarni.

Użycie (z katalogu głównego repozytorium):
  python tools/lurker_sprites.py                       # arkusze do public/assets/sprites/
  python tools/lurker_sprites.py --preview tools/out   # dodatkowo podglądy 2x na posadzce ruin

<biom>-lurker_walk-slash.png (384x384, komórka 48x48, 8 kierunków z obrotu, obrys po obrocie):
  kolumny 0–3 chód (ręce wahadłowo, pazury przed sobą), 4–7 cięcie prawą ręką od prawej do lewej (uderzenie w 6).
lurker-hideouts.png (576x48, komórka 32x48, bez kierunków, jeden pas): po 3 klatki na biom (ruiny, leże, Grzybnia,
  Cmentarzysko, Piekło, palarnia): 0 spokój, 1 znak (drgnięcie, ślepia w szczelinie), 2 rozbita (po wyskoku).
  Dół komórki = dół kafla pod murem; górne 16 px zachodzi na lico muru.
"""
import argparse
import os
import sys

from PIL import Image

import tower_ruins_tiles as trt
from tower_ruins_tiles import Img, ok, outline, OUT
from spider_sprites import band_shade, ellipse, mirror, stroke
from lair_enemies import directional_sheet, validate

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 48
MARGIN = 8
C = CELL / 2
HW, HH = 32, 48


def ramp(L0, c, h, step=.1):
    """Pięć tonów jednej barwy co `step` jasności (cień → blask)."""
    return tuple(ok(L0 + i * step, c * (1 - abs(i - 2) * .12), h) for i in range(5))


# Rampa ciała, ślepia i pazury dla każdego biomu.
BIOMES = {
    'stone': dict(body=ramp(.34, .012, 80), eye=ok(.86, .150, 85), claw=ok(.78, .020, 90)),
    'silk': dict(body=ramp(.48, .030, 310, .09), eye=ok(.62, .190, 25), claw=ok(.88, .020, 300)),
    'mound': dict(body=ramp(.30, .045, 60), eye=ok(.84, .150, 120), claw=ok(.72, .030, 75)),
    'coffin': dict(body=ramp(.38, .040, 150), eye=ok(.88, .120, 100), claw=ok(.80, .030, 90)),
    'cinder': dict(body=ramp(.22, .015, 30, .08), eye=ok(.80, .170, 55), claw=ok(.66, .190, 40), ember=ok(.62, .200, 38)),
    'barrel': dict(body=ramp(.28, .030, 55), eye=ok(.76, .170, 50), claw=ok(.70, .030, 70)),
}
ORDER = ('stone', 'silk', 'mound', 'coffin', 'cinder', 'barrel')


# ---------------- Czyhacz ----------------
def lurker_frame(kind):
    p = BIOMES[kind]
    body, eye, claw = p['body'], p['eye'], p['claw']

    def frame(f):
        img = Img(CELL, CELL)
        walking = f < 4
        swing = (0, 2, 0, -2)[f % 4] if walking else 0
        step = (0, -1.5, 0, 1.5)[f % 4] if walking else 0
        # nogi: krótkie, za tułowiem (przygarbiony — widać je od tyłu)
        for side in (1, -1):
            dy = step if side > 0 else -step
            stroke(img, [(C + side * 3, C + 6), (C + side * 3.5, C + 10 + dy)], 2.4, body[0], edge=body[1])
        # ręce: lewa zawsze wahadłowo; prawa przy cięciu zatacza łuk z prawej na lewo
        left_hand = (C - 6, C - 8 - swing * .5) if walking else (C - 8, C - 3)
        if walking:
            right_hand = (C + 6, C - 8 + swing * .5)
        else:
            right_hand = ((C + 10, C - 2), (C + 4, C - 10), (C - 7, C - 8), (C - 3, C - 9))[f - 4]
        for side, hand in ((-1, left_hand), (1, right_hand)):
            shoulder = (C + side * 5, C - 1)
            elbow = ((shoulder[0] + hand[0]) / 2 + side * 2, (shoulder[1] + hand[1]) / 2 + 1)
            stroke(img, [shoulder, elbow, hand], 2.2, body[1], edge=body[2])
            # trzy pazury w kierunku od łokcia do dłoni
            dx, dy = hand[0] - elbow[0], hand[1] - elbow[1]
            n = max(1e-6, (dx * dx + dy * dy) ** .5)
            ux, uy = dx / n, dy / n
            for k in (-1, 0, 1):
                tip = (hand[0] + ux * 2.5 - uy * k * 1.4, hand[1] + uy * 2.5 + ux * k * 1.4)
                stroke(img, [hand, tip], 1.0, claw)
        # smuga cięcia w klatce uderzenia
        if f == 6:
            for x, y in ((C + 6, C - 11), (C + 2, C - 12), (C - 2, C - 12), (C - 6, C - 11)):
                img.put(int(x), int(y), claw)
        # tułów: przygarbiony owal, kręgosłup jako ciemny pas
        ellipse(img, C, C + 2, 6.5, 7.5, band_shade(body))
        for y in range(int(C - 1), int(C + 8)):
            img.put(int(C), y, body[0])
        if 'ember' in p:
            for x, y in ((C - 3, C + 1), (C + 2, C + 4), (C - 1, C + 6)):
                img.put(int(x), int(y), p['ember'])
        # głowa wysunięta do przodu, ślepia
        hy = C - 6 - (1 if not walking and f in (5, 6) else 0)
        ellipse(img, C, hy, 3.6, 3.2, band_shade(body, light=(-.4, -.7)))
        img.put(int(C - 2), int(hy - 1), eye)
        img.put(int(C + 1), int(hy - 1), eye)
        return img

    return frame


# ---------------- Kryjówki ----------------
def rect(img, x0, y0, x1, y1, color):
    for y in range(int(y0), int(y1)):
        for x in range(int(x0), int(x1)):
            img.put(x, y, color)


def eyes(img, x, y, color):
    img.put(x, y, color)
    img.put(x + 3, y, color)


FLOOR_Y = HH - 3  # dół kryjówki (obrys kończy się 1 px wyżej od dołu komórki)


def hide_stone(state):
    pal = trt.PALETTES['piaskowiec']
    stone, light, line = pal.wall_top[2], pal.wall_top[3], pal.wall_top[1]
    img = Img(HW, HH)
    if state == 2:
        # gruz pod murem i ciemna wyrwa w licu
        rect(img, 10, 18, 22, 28, pal.deep[0])
        for x, y, w, h in ((5, 38, 6, 4), (13, 41, 5, 3), (20, 37, 7, 5), (9, 33, 4, 3), (24, 42, 4, 3)):
            rect(img, x, y, x + w, y + h, stone)
            rect(img, x, y, x + w, y + 1, light)
        return img
    # osypany blok muru wysunięty przed lico: płyty z fugami i rysa przez środek
    rect(img, 6, 14, 26, FLOOR_Y, stone)
    rect(img, 6, 14, 26, 16, light)
    for y in (22, 30, 38):
        rect(img, 6, y, 26, y + 1, line)
    for x, y0, y1 in ((15, 16, 22), (11, 23, 30), (19, 31, 38), (13, 39, FLOOR_Y)):
        rect(img, x, y0, x + 1, y1, line)
    crack = [(16, 17), (15, 19), (16, 21), (17, 24), (16, 27)]
    for x, y in crack:
        rect(img, x, y, x + 2, y + 2, pal.deep[0])
    if state == 1:
        rect(img, 13, 24, 21, 27, pal.deep[0])
        eyes(img, 15, 25, BIOMES['stone']['eye'])
    return img


def hide_silk(state):
    silk = ramp(.62, .030, 300, .08)
    img = Img(HW, HH)
    if state == 2:
        # rozdarte połówki kokonu i nici
        ellipse(img, 10, 38, 5, 6, band_shade(silk))
        ellipse(img, 23, 39, 5, 5, band_shade(silk))
        ellipse(img, 10, 37, 2.5, 3.5, lambda nx, ny: silk[0])
        ellipse(img, 23, 38, 2.5, 3, lambda nx, ny: silk[0])
        stroke(img, [(14, 20), (16, 30), (13, 36)], 1.0, silk[3])
        return img
    bulge = 1 if state == 1 else 0
    ellipse(img, 16, 30, 8 + bulge, 15, band_shade(silk))
    for y in (22, 28, 34, 40):
        stroke(img, [(9, y), (16, y + 2), (23, y)], 1.0, silk[1])
    # nici przyklejające kokon do muru
    stroke(img, [(16, 15), (13, 6), (12, 2)], 1.0, silk[3])
    stroke(img, [(18, 15), (21, 7), (23, 2)], 1.0, silk[3])
    if state == 1:
        ellipse(img, 16, 26, 3.5, 2, lambda nx, ny: silk[0])
        eyes(img, 14, 26, BIOMES['silk']['eye'])
    return img


def hide_mound(state):
    pal = trt.PALETTES['grzybnia']
    dirt = ramp(.30, .040, 55, .08)
    cap = ramp(.40, .090, 330, .08)
    img = Img(HW, HH)
    if state == 2:
        ellipse(img, 16, 38, 11, 6, lambda nx, ny: dirt[0])
        for x, y in ((5, 33), (26, 34), (8, 44), (24, 44), (16, 31)):
            ellipse(img, x, y, 2.2, 1.8, band_shade(dirt))
        return img
    swell = 1 if state == 1 else 0
    ellipse(img, 16, 37, 12, 8 + swell, band_shade(dirt))
    # grzyby na kopcu
    for x, y, r in ((9, 31, 3.2), (20, 29, 4), (25, 34, 2.6)):
        stroke(img, [(x, y + 1), (x, y + 4)], 1.6, pal.floor[3])
        ellipse(img, x, y, r, r * .7, band_shade(cap))
    if state == 1:
        rect(img, 12, 37, 21, 40, dirt[0])
        eyes(img, 14, 38, BIOMES['mound']['eye'])
    return img


def hide_coffin(state):
    wood = ramp(.30, .050, 50, .08)
    iron = trt.IRON
    img = Img(HW, HH)
    if state == 2:
        # otwarta trumna pod murem (ciemne wnętrze), wieko odrzucone na bok
        pts_dark = ramp(.16, .020, 40, .03)
        coffin_shape(img, 16, 13, wood)
        coffin_shape(img, 16, 13, pts_dark, inset=2)
        rect(img, 2, 40, 14, 45, wood[2])
        rect(img, 2, 40, 14, 41, wood[3])
        rect(img, 7, 41, 8, 45, wood[0])
        return img
    coffin_shape(img, 16, 13, wood)
    # krzyż na wieku i okucia
    rect(img, 15, 18, 17, 30, wood[4])
    rect(img, 12, 21, 20, 23, wood[4])
    for y in (16, 40):
        rect(img, 11, y, 21, y + 1, iron[1] if len(iron) > 1 else iron[0])
    if state == 1:
        # wieko uchylone: szpara wzdłuż prawego brzegu i ślepia w niej
        rect(img, 21, 18, 23, 40, ramp(.16, .020, 40, .03)[0])
        img.put(21, 26, BIOMES['coffin']['eye'])
        img.put(21, 29, BIOMES['coffin']['eye'])
    return img


def coffin_shape(img, cx, top, ramp_, inset=0):
    """Stojąca trumna (sześciokąt): wąska u góry, najszersza na wysokości ramion, zwężona u stóp."""
    for y in range(top + inset, FLOOR_Y - inset):
        t = (y - top) / (FLOOR_Y - top)
        half = 4 + t / .25 * 4 if t < .25 else 8 - (t - .25) / .75 * 3.5
        half -= inset
        for x in range(int(cx - half), int(cx + half)):
            shade = ramp_[3] if x < cx - half + 2 else ramp_[1] if x >= cx + half - 2 else ramp_[2]
            img.put(x, y, shade)


def hide_cinder(state):
    pal = trt.PALETTES['pieklo_bazalt']
    ember = pal.ember if pal.ember else (ok(.5, .2, 30), ok(.65, .19, 45), ok(.82, .15, 70))
    img = Img(HW, HH)
    rock, light, line = pal.wall_top[2], pal.wall_top[3], pal.wall_top[1]
    if state == 2:
        rect(img, 10, 18, 22, 30, pal.deep[0])
        for x, y in ((12, 28), (17, 25), (20, 29)):
            img.put(x, y, ember[1])
        for x, y, w, h in ((4, 38, 6, 4), (14, 41, 5, 3), (22, 37, 6, 5)):
            rect(img, x, y, x + w, y + h, rock)
            rect(img, x + 1, y + 1, x + 2, y + 2, ember[0])
        return img
    rect(img, 7, 14, 25, FLOOR_Y, rock)
    rect(img, 7, 14, 25, 16, light)
    for y in (24, 34):
        rect(img, 7, y, 25, y + 1, line)
    glow = ember[2] if state == 1 else ember[1]
    for x, y in ((16, 16), (15, 18), (16, 20), (17, 22), (16, 25), (15, 28), (16, 31), (17, 34), (16, 38)):
        rect(img, x, y, x + 1, y + 2, glow)
        img.put(x + 1, y, ember[0])
    if state == 1:
        rect(img, 13, 25, 21, 28, pal.deep[0])
        eyes(img, 15, 26, BIOMES['cinder']['eye'])
    return img


def hide_barrel(state):
    wood = ramp(.32, .060, 55, .08)
    hoop = trt.IRON
    smoke = ramp(.50, .010, 250, .08)
    img = Img(HW, HH)
    if state == 2:
        for x0, y0, x1, y1 in ((5, 44, 12, 38), (14, 45, 20, 42), (22, 39, 28, 45), (9, 34, 15, 36)):
            stroke(img, [(x0, y0), (x1, y1)], 2.2, wood[2], edge=wood[3])
        ellipse(img, 17, 38, 4, 2, band_shade(smoke))
        return img
    # beczka stojąca: brzuchata, z obręczami; nad nią smużka dymu
    for y in range(24, FLOOR_Y):
        t = (y - 24) / (FLOOR_Y - 24)
        half = 8 + 1.5 * (1 - abs(t - .5) * 2)
        for x in range(int(16 - half), int(16 + half)):
            img.put(x, y, wood[3] if x < 16 - half + 2 else wood[1] if x >= 16 + half - 2 else wood[2])
    for y in (27, 40):
        rect(img, 7, y, 25, y + 1, hoop[1] if len(hoop) > 1 else hoop[0])
    lift = 2 if state == 1 else 0
    ellipse(img, 16, 24 - lift, 8, 2.5, band_shade(wood))
    ellipse(img, 13, 19 - lift, 2, 2, band_shade(smoke))
    ellipse(img, 15, 15 - lift, 2.5, 2.2, band_shade(smoke))
    if state == 1:
        rect(img, 9, 25, 23, 27, wood[0])
        eyes(img, 14, 25, BIOMES['barrel']['eye'])
    return img


HIDEOUTS = (hide_stone, hide_silk, hide_mound, hide_coffin, hide_cinder, hide_barrel)


def hideout_sheet():
    sheet = Img(HW * 3 * len(HIDEOUTS), HH)
    frames = []
    for row, fn in enumerate(HIDEOUTS):
        for col in range(3):
            img = fn(col)
            outline(img, OUT)
            sheet.blit(img, (row * 3 + col) * HW, 0)
            frames.append((f'{ORDER[row]}-{col}', img))
    return sheet, frames


def build():
    out = {}
    for kind in ORDER:
        sheet, frames = directional_sheet(CELL, lurker_frame(kind), 8)
        out[f'{kind}-lurker_walk-slash.png'] = (sheet, frames, CELL, MARGIN, CELL)
    sheet, frames = hideout_sheet()
    out['lurker-hideouts.png'] = (sheet, frames, HW, 1, HH)
    return out


def check(sheets):
    """Walidacja jak w generatorach leża (komórki kwadratowe przez `validate`), kryjówki — osobno (32x48)."""
    square = {k: v[:4] for k, v in sheets.items() if v[2] == v[4]}
    errors = validate(square)
    for fname, (_, frames, w, margin, h) in sheets.items():
        if w == h:
            continue
        for name, img in frames:
            opaque = [(x, y, c) for y, row in enumerate(img.p) for x, c in enumerate(row) if c[3]]
            if not opaque:
                errors.append(f'{fname} {name}: pusta klatka')
            elif any(c[3] != 255 for _, _, c in opaque):
                errors.append(f'{fname} {name}: półprzezroczyste piksele')
            elif any(c[:3] in ((0, 0, 0), (255, 255, 255)) for _, _, c in opaque):
                errors.append(f'{fname} {name}: czysta czerń/biel')
            elif any(not (margin - 1 <= x <= w - margin and margin - 1 <= y <= h - margin) for x, y, _ in opaque):
                errors.append(f'{fname} {name}: wychodzi poza komórkę')
    return errors


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator Czyhacza i kryjówek')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podglądy 2x')
    a = ap.parse_args()
    sheets = build()
    errors = check(sheets)
    if errors:
        for e in errors[:30]:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    for fname, (sheet, frames, _, _, _) in sheets.items():
        sheet.pil().save(os.path.join(a.out, fname))
        print(f'zapisano {fname} {sheet.w}x{sheet.h}: {len(frames)} klatek')
        if a.preview:
            os.makedirs(a.preview, exist_ok=True)
            im = sheet.pil()
            bg = Image.new('RGBA', im.size, trt.PALETTES['piaskowiec'].floor[2])
            bg.alpha_composite(im)
            bg.resize((im.width * 2, im.height * 2), Image.NEAREST).save(os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
