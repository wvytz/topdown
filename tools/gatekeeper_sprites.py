"""
Generator bossa piętra 5 „Strażnik Bram” (krok 41e): demon w pancerzu z wielką żelazną tarczą-wrotami
w lewej ręce i łańcuchem z hakiem w prawej. Mniejszy brat Kata Otchłani — uczy obchodzenia tarczy.

Użycie (z katalogu głównego repozytorium):
  python tools/gatekeeper_sprites.py                       # arkusz do public/assets/sprites/
  python tools/gatekeeper_sprites.py --preview tools/out   # dodatkowo podgląd 4x na podłodze Piekła

gate-warden_walk-spin-bash.png (1152x768, komórka 96x96, pivot 48,48, 8 kierunków z obrotu, obrys po obrocie):
  kolumny 0–3 chód (łańcuch kołysze się), 4–7 wirowanie łańcuchem (hak okrąża bossa co 90°),
  8–11 uderzenie tarczą (cofnięcie, pchnięcie, rozbłysk run, powrót).
Dominująca cecha: tarcza (prostokątne wrota z żelaza z żarzącą się runą) zawsze z przodu — czytelna w sylwetce.
Kolory: żelazo (§4.3), ciemnoczerwona skóra demona, żar palety „krwawy bazalt” na oczach i runie.
"""
import argparse
import math
import os
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import IRON, ok
from spider_sprites import band_shade, ellipse, stroke
from lair_enemies import directional_sheet, validate

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 96
MARGIN = 8
C = CELL / 2

HELL = trt.PALETTES['pieklo_bazalt']
EMBER = HELL.ember
# Skóra demona: ciemna, krwista czerwień (jaśniejsza od podłogi w cieniach barwy).
HIDE = (ok(.30, .080, 22), ok(.37, .095, 24), ok(.44, .105, 27), ok(.52, .105, 30), ok(.62, .095, 35))
# Pancerz i tarcza: ciemne, okopcone żelazo (rampa §4.3 rozszerzona o cień i blask).
STEEL = (ok(.26, .012, 250), IRON[0], IRON[1], IRON[2], ok(.74, .012, 240))
CHAIN = (IRON[0], IRON[2])


def shield(img, cx, cy, w, h, glow):
    """Tarcza-wrota z góry: gruby prostokąt żelaza (krawędź światła z lewej), nity, żarząca się runa."""
    for y in range(int(cy - h / 2), int(cy + h / 2) + 1):
        for x in range(int(cx - w / 2), int(cx + w / 2) + 1):
            edge = x <= cx - w / 2 + 1 or y <= cy - h / 2 + 1
            far = x >= cx + w / 2 - 1 or y >= cy + h / 2 - 1
            img.put(x, y, STEEL[4] if edge else (STEEL[1] if far else STEEL[3]))
    for x in (int(cx - w / 2 + 3), int(cx + w / 2 - 3)):  # nity
        for y in (int(cy - h / 2 + 2), int(cy + h / 2 - 2)):
            img.put(x, y, STEEL[0])
    # runa: odwrócony trójkąt z żaru w środku tarczy
    rune = EMBER[2] if glow else EMBER[1]
    for i in range(5):
        img.put(int(cx - 2 + i), int(cy - 1), rune)
    for i in range(3):
        img.put(int(cx - 1 + i), int(cy), rune)
    img.put(int(cx), int(cy + 1), rune)


def chain(img, a, b, hook=True):
    """Łańcuch: ogniwa naprzemiennie w dwóch tonach żelaza, na końcu hak."""
    n = max(2, int(math.hypot(b[0] - a[0], b[1] - a[1]) / 2))
    for i in range(n + 1):
        t = i / n
        x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        img.put(int(x), int(y), CHAIN[i % 2])
        img.put(int(x) + 1, int(y), CHAIN[(i + 1) % 2])
    if hook:
        ellipse(img, b[0], b[1], 3.2, 3.2, lambda nx, ny: STEEL[4] if nx + ny < -.5 else (STEEL[2] if nx * nx + ny * ny < .5 else STEEL[1]))
        img.put(int(b[0]), int(b[1]), EMBER[1])


def warden_frame(f):
    """Strażnik na N. f 0–3 chód; 4–7 wirowanie łańcuchem; 8–11 uderzenie tarczą."""
    img = trt.Img(CELL, CELL)
    walk = f < 4
    spin = 4 <= f < 8
    bash = f >= 8
    step = (0, 2, 0, -2)[f] if walk else 0
    cy = C + 4
    thrust = (2, -5, -6, 0)[f - 8] if bash else 0

    # nogi (stopy pod ciałem, naprzemiennie)
    for side, dy in ((-1, step), (1, -step)):
        ellipse(img, C + side * 9, cy + 12 + dy, 4.5, 5.5, band_shade(STEEL))
    # łańcuch (pod barkiem) — w wirowaniu hak okrąża bossa
    hand = (C + 19, cy - 2)
    if spin:
        a = math.radians(-60 + (f - 4) * 90)
        tip = (C + math.cos(a) * 34, cy - 2 + math.sin(a) * 34)
        chain(img, hand, tip)
    elif bash:
        chain(img, hand, (C + 18, cy + 14))
    else:
        chain(img, hand, (C + 19 + step * .5, cy + 16 - abs(step)))
    # tułów: pancerz, skóra demona na barkach
    ellipse(img, C, cy, 20, 14, band_shade(HIDE))
    ellipse(img, C, cy + 1, 15, 10.5, band_shade(STEEL))  # napierśnik (z góry: plecy w pancerzu)
    for side in (-1, 1):  # naramienniki z kolcem
        ellipse(img, C + side * 18, cy - 2, 7.5, 7, band_shade(STEEL))
        img.put(int(C + side * 20), int(cy - 6), STEEL[4])
        img.put(int(C + side * 20), int(cy - 7), STEEL[4])
    # prawe ramię do łańcucha
    stroke(img, [(C + 17, cy), hand], 5.5, HIDE[2], edge=HIDE[3])
    # lewe ramię trzyma tarczę przed sobą — pod głową, od barku do lewej krawędzi tarczy
    sy = cy - 26 + thrust
    stroke(img, [(C - 18, cy - 2), (C - 16, sy + 8), (C - 11, sy + 4)], 5.5, HIDE[2], edge=HIDE[3])
    # głowa: hełm z rogami, szpara z żarem
    hy = cy - 11
    for side in (-1, 1):
        stroke(img, [(C + side * 6, hy + 1), (C + side * 11, hy - 4), (C + side * 12, hy - 9)], 3, HELL.bone[0], edge=HELL.bone[1])
    ellipse(img, C, hy, 7.5, 7, band_shade(STEEL, light=(-.4, -.6)))
    for x in range(int(C - 3), int(C + 4)):
        img.put(x, int(hy - 3), EMBER[1])
    img.put(int(C - 2), int(hy - 3), EMBER[2])
    img.put(int(C + 2), int(hy - 3), EMBER[2])
    # tarcza zawsze z przodu (dominująca cecha)
    shield(img, C - 1, sy, 36, 10, glow=bash and f in (9, 10))
    if bash and f == 10:  # rozbłysk przy uderzeniu: iskry przed tarczą
        for dx in (-14, -5, 4, 13):
            img.put(int(C + dx), int(sy - 7), EMBER[2])
            img.put(int(C + dx), int(sy - 8), EMBER[1])
    return img


def build():
    sheet, frames = directional_sheet(CELL, warden_frame, 12)
    return {'gate-warden_walk-spin-bash.png': (sheet, frames, CELL, MARGIN)}


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator Strażnika Bram (Piekło)')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 4x')
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
            im = sheet.pil()
            bg = Image.new('RGBA', im.size, HELL.floor[2])
            bg.alpha_composite(im)
            bg.resize((im.width * 2, im.height * 2), Image.NEAREST).save(
                os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
