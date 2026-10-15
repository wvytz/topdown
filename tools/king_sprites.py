"""
Generator bossa Grzybni „Król Pająków” (krok 29): pająk zainfekowany grzybem, zanim pożarła go Matka Pająków.
Narzędzia i rampy z tower_ruins_tiles.py / spider_sprites.py (obrót co 45°, obrys po obrocie).

Użycie (z katalogu głównego repozytorium):
  python tools/king_sprites.py                       # arkusz do public/assets/sprites/
  python tools/king_sprites.py --preview tools/out   # dodatkowo podgląd 4x na podłodze Grzybni

Arkusz (STYLEGUIDE §2, §8, §10):
  spider-king_walk-stab.png  128x128, 8 kierunków; kolumny 0–3 chód na dwóch grubych łapach,
                             4–7 atak: zamach (4: kosy w górę i na boki, sztylety unoszą się),
                             5 lewe sztylety kłują, 6 prawe, 7 uderzenie (kosy schodzą przed paszczę, wszystkie
                             sztylety naprzód)
  spider-king_death.png      128x128, 8 kierunków (krok 40); 0 wzdrygnięcie, 1–3 podkulanie łap i opadanie kos,
                             gasnące bulwy i oczy, 4 pęknięte bulwy (zarodniki), 5–7 rozpad w kałużę soku

Wygląd = połączenie (decyzja właściciela, krok 29): technika i rzut z góry z generatora Claude, a z koncepcji
właściciela: zielona, świecąca masa grzybni na odwłoku z bulwami zarodników, pomarańczowe grzyby półkowe na obrzeżu,
fioletowy pancerz z kępami mchu, dwa uniesione przednie odnóża-kosy z zakażonym ostrzem, wiele zielonych oczu.
Z opisu właściciela (krok 28): chód na dwóch grubych łapach, pozostałe odnóża zwisają i kłują jak sztylety.
"""
import argparse
import math
import os
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import OUT, Img, ok, outline
from loot_sprites import rotate45
import random

from spider_sprites import band_shade, curl_leg, ellipse, lerp, mirror, stroke

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
KING = 128
MARGIN = 8

GROVE = trt.PALETTES['grzybnia']
BONE = GROVE.bone
# Fioletowy pancerz (jak na koncepcji właściciela): korpus i zwisające odnóża.
CHITIN = (ok(.24, .050, 300), ok(.31, .058, 302), ok(.40, .066, 305), ok(.50, .068, 308), ok(.62, .060, 312))
# Grube łapy i kosy: jasna lawenda (jak na koncepcji właściciela) — główne kończyny. Wyraźnie jaśniejsza
# od podłogi Grzybni: ciało czytelne mimo bliskiej barwy (STYLEGUIDE §6a, test czytelności).
ARMOR = (ok(.34, .060, 300), ok(.45, .070, 303), ok(.57, .076, 306), ok(.67, .072, 309), ok(.78, .060, 313))
# Grzybnia na odwłoku: mszysta zieleń (ciemna → jasna) i świecące bulwy zarodników.
MOSS = (ok(.28, .060, 140), ok(.37, .080, 136), ok(.47, .100, 132), ok(.58, .120, 128), ok(.70, .130, 124))
BULB = (ok(.60, .140, 126), ok(.74, .160, 122), ok(.88, .140, 115))
# Pomarańczowe grzyby półkowe: brzeg ciemny → pas jasny.
SHELF = (ok(.48, .110, 48), ok(.62, .135, 60), ok(.76, .130, 75), ok(.86, .090, 88))
# Kępy mchu na łapach: oliwkowe włókna.
FIBER = (ok(.45, .060, 115), ok(.58, .070, 112))
# Śmierć: sok grzybni — ciemna, mszysta zieleń (kałuża pod ciałem), zgasłe bulwy w tonach mchu, zarodniki.
SAP = (ok(.22, .050, 136), ok(.29, .065, 132), ok(.36, .080, 128))
DIM_BULB = (MOSS[1], MOSS[2], MOSS[3])
SPORE = (BULB[1], BULB[2])

C = KING / 2


# ---------------- elementy ----------------
def moss_tuft(img, x, y, length=4):
    """Kępa mchu zwisająca z pancerza: kilka oliwkowych włókien."""
    for i, dx in enumerate((-1, 0, 1, 2)):
        for k in range(length - (i % 2)):
            img.put(int(x + dx), int(y + k), FIBER[(i + k) % 2])


def thick_leg(img, pts, tufts=True):
    """Gruba, pancerna łapa (udo 11 px, golenie 8 px), krawędź światła, płytki pancerza, kępy mchu, szpon."""
    hip, knee, foot = pts
    claw = lerp(knee, foot, .78)
    stroke(img, [hip, knee], 11, ARMOR[2], edge=ARMOR[3])
    stroke(img, [knee, claw], 8, ARMOR[2], edge=ARMOR[3])
    stroke(img, [claw, foot], 5, ARMOR[1])
    ellipse(img, knee[0], knee[1], 6, 6, band_shade(ARMOR))  # staw kolana
    for t in (.3, .55):  # płytki pancerza
        px, py = lerp(hip, knee, t)
        img.put(int(px), int(py), ARMOR[0])
        img.put(int(px) + 1, int(py), ARMOR[0])
    if tufts:
        moss_tuft(img, *lerp(hip, knee, .45))
        moss_tuft(img, *lerp(knee, claw, .4), length=3)
    ellipse(img, knee[0] - 1, knee[1] - 1, 1.6, 1.6, lambda nx, ny: SHELF[2])  # mały grzyb na kolanie


def scythe(img, hip, knee, tip, bend, bulbs=BULB):
    """Odnóże-kosa: pancerne ramię, potem zakrzywione ostrze porośnięte zieloną grzybnią z pomarańczowymi
    plamkami. `bend` = strona wygięcia ostrza (±1)."""
    stroke(img, [hip, knee], 7, ARMOR[2], edge=ARMOR[3])
    ellipse(img, knee[0], knee[1], 4.5, 4.5, band_shade(ARMOR))
    # ostrze: łuk Béziera knee → tip, wygięty na zewnątrz
    mid = ((knee[0] + tip[0]) / 2 + bend * 9, (knee[1] + tip[1]) / 2)
    n = 18
    for i in range(n + 1):
        t = i / n
        x = (1 - t) ** 2 * knee[0] + 2 * (1 - t) * t * mid[0] + t * t * tip[0]
        y = (1 - t) ** 2 * knee[1] + 2 * (1 - t) * t * mid[1] + t * t * tip[1]
        w = 6 - 5 * t
        stroke(img, [(x, y), (x, y)], w, MOSS[2] if t < .25 else (MOSS[3] if t < .8 else bulbs[1]))
        if i in (3, 7, 11, 14):  # zarodniki i grzybki na ostrzu
            img.put(int(x), int(y), bulbs[2] if i % 2 else SHELF[2])
    img.put(int(tip[0]), int(tip[1]), bulbs[2])


def dagger_leg(img, pts, glow=False):
    """Zwisające odnóże zakończone kościstym, zakażonym ostrzem: chitynowy człon, ostrze zwęża się do szpica."""
    base, knee, tip = pts
    blade = lerp(knee, tip, .45)
    stroke(img, [base, knee], 3.4, CHITIN[2], edge=CHITIN[3])
    stroke(img, [knee, blade], 2.8, CHITIN[2])
    n = 12
    for i in range(n + 1):
        t = i / n
        x, y = lerp(blade, tip, t)
        stroke(img, [(x, y), (x, y)], 3 - 2 * t, BULB[1] if glow and t > .5 else BONE[1])
    img.put(int(tip[0]), int(tip[1]), BULB[2] if glow else BONE[2])


def shelf(img, cx, cy, rx, ry, angle):
    """Pomarańczowy grzyb półkowy (rzut z góry) wyrastający w kierunku `angle`: pasy przyrostu, ciemny brzeg."""
    cap = Img(KING, KING)
    ca, sa = math.cos(angle), math.sin(angle)
    span = int(max(rx, ry)) + 2
    for y in range(int(cy) - span, int(cy) + span + 1):
        for x in range(int(cx) - span, int(cx) + span + 1):
            dx, dy = x + .5 - cx, y + .5 - cy
            u, v = dx * ca + dy * sa, -dx * sa + dy * ca
            nx, ny = u / rx, v / ry
            if ny < -.1 or nx * nx + ny * ny > 1:
                continue
            d = nx * nx + ny * ny
            c = SHELF[0] if d > .8 else (SHELF[2] if d > .55 else (SHELF[1] if d > .3 else SHELF[3]))
            cap.put(x, y, c)
    outline(cap, OUT)
    img.blit(cap, 0, 0)


def bulb(img, cx, cy, r, bulbs=BULB):
    """Świecąca bulwa zarodników: jasny blask od lewej-góry, ciemniejszy dół."""
    ellipse(img, cx, cy, r, r, lambda nx, ny: bulbs[2] if nx + ny < -.6 else (bulbs[1] if nx + ny < .5 else bulbs[0]))


# ---------------- pozy (prawa strona na N; lewa z odbicia) ----------------
THICK = ((C + 13, C - 6), (C + 32, C - 9), (C + 36, C - 27))       # grube łapy: biodro, kolano, stopa
SCYTHE_REST = ((C + 9, C - 22), (C + 21, C - 27), (C + 11, C - 51))   # kosy uniesione nad głową
SCYTHE_RAISE = ((C + 9, C - 22), (C + 23, C - 25), (C + 35, C - 41))  # zamach: w górę i na boki
SCYTHE_STRIKE = ((C + 9, C - 22), (C + 18, C - 31), (C + 3, C - 52))  # uderzenie: ostrza zbiegają się
SCYTHE_DEAD = ((C + 9, C - 22), (C + 17, C - 15), (C + 9, C - 5))     # śmierć: kosy opadają na ciało
HANG = [   # zwisające sztylety: wzdłuż boku odwłoka, szpice w tył
    ((C + 16, C + 2), (C + 29, C + 12), (C + 29, C + 33)),
    ((C + 16, C + 9), (C + 28, C + 24), (C + 22, C + 43)),
]
RAISE = [  # unoszą się w bok
    ((C + 16, C + 2), (C + 33, C + 2), (C + 47, C - 6)),
    ((C + 16, C + 9), (C + 35, C + 12), (C + 49, C + 6)),
]
STAB = [   # wyrzucone do przodu, obok głowy
    ((C + 16, C + 2), (C + 32, C - 12), (C + 27, C - 38)),
    ((C + 16, C + 9), (C + 36, C - 2), (C + 35, C - 30)),
]


def king_frame(f):
    """f 0–3: chód; f 4 zamach, 5 lewe sztylety, 6 prawe, 7 uderzenie (kosy i wszystkie sztylety)."""
    walk = f < 4
    if walk:
        return king_pose(step=(0, -4, 0, 4)[f], bob=(0, 1, 0, 1)[f], sway=(0, 1, 0, -1)[f])
    legs = {4: (RAISE, RAISE), 5: (STAB, RAISE), 6: (HANG, STAB), 7: (STAB, STAB)}[f]
    scythes = {4: SCYTHE_RAISE, 5: SCYTHE_RAISE, 6: SCYTHE_RAISE, 7: SCYTHE_STRIKE}[f]
    return king_pose(legs=legs, glow=f >= 5, scythes=scythes)


def king_pose(step=0, bob=0, sway=0, legs=None, glow=False, scythes=SCYTHE_REST,
              curl=0.0, droop=0.0, bulbs=BULB, eyes=True, sap=0):
    """Poza Króla na N. legs: (lewa, prawa) pozy sztyletów, None = zwisające z kołysaniem `sway` (chód);
    curl 0–1: podkulenie łap i sztyletów (śmierć); droop 0–1: kosy opadają na ciało; bulbs: rampa bulw
    (zgasłe = mech); eyes False = zgasłe; sap: promień kałuży soku pod ciałem (0 = brak)."""
    img = Img(KING, KING)
    if sap:
        ellipse(img, C, C + 8, sap, sap * .85,
                lambda nx, ny: SAP[0] if nx * nx + ny * ny > .6 else (SAP[2] if nx < -.2 and ny < -.2 else SAP[1]))

    # 1. grube łapy (pod ciałem)
    for side in (1, -1):
        dy = step if side > 0 else -step
        hip, knee, foot = THICK
        pts = [hip, (knee[0], knee[1] + dy * .5), (foot[0], foot[1] + dy)]
        if curl:
            pts = curl_leg(pts, curl, C)
        thick_leg(img, [mirror(p, C) for p in pts] if side < 0 else pts)

    # 2. odwłok: zielona masa grzybni z bulwami, pomarańczowe grzyby półkowe na obrzeżu
    ab_cx, ab_cy = C, C + 16 + bob
    ellipse(img, ab_cx, ab_cy, 23, 25, band_shade(MOSS))
    for dx, dy in ((-8, -6), (6, -10), (-2, 8), (10, 6), (-12, 12)):  # żyłki grzybni (ciemne)
        stroke(img, [(ab_cx, ab_cy), (ab_cx + dx, ab_cy + dy)], 1.4, MOSS[0])
    for deg, dist, rx, ry in ((200, 19, 9, 6), (-20, 19, 9, 6), (150, 21, 10, 6.5), (30, 21, 10, 6.5),
                              (110, 23, 9, 6), (70, 23, 9, 6), (180, 14, 6, 4), (0, 14, 6, 4)):
        a = math.radians(deg)
        shelf(img, ab_cx + math.cos(a) * dist, ab_cy + math.sin(a) * dist, rx, ry, a - math.pi / 2)
    for dx, dy, r in ((-6, -8, 3.6), (5, -4, 4.2), (-3, 5, 3.2), (8, 9, 2.8), (-9, 14, 2.4), (2, 16, 3),
                      (-12, 0, 2.2), (12, -12, 2.4), (-1, -15, 2.4), (6, 20, 2)):
        bulb(img, ab_cx + dx, ab_cy + dy, r, bulbs)
    for dx, dy in ((-15, -12), (15, 2), (-4, -2), (10, 15), (-14, 8)):  # świecące drobiny
        img.put(int(ab_cx + dx), int(ab_cy + dy), bulbs[2])

    # 3. zwisające odnóża-sztylety
    for side in (1, -1):
        if legs is None:
            pose = [(a, (k[0], k[1] + sway), (t[0] + sway * .5, t[1] + sway)) for a, k, t in HANG]
        else:
            pose = legs[0] if side < 0 else legs[1]
        for pts in pose:
            pts = curl_leg(list(pts), curl, C) if curl else pts
            dagger_leg(img, [mirror(p, C) for p in pts] if side < 0 else pts, glow=glow)

    # 4. głowotułów: fioletowy pancerz, kępy mchu, wiele zielonych oczu, kły
    ce_cy = C - 15 + bob
    ellipse(img, C, ce_cy, 15, 13, band_shade(CHITIN, light=(-.4, -.7)))
    for x, y in ((C - 10, ce_cy + 2), (C + 8, ce_cy + 4)):
        moss_tuft(img, x, y, 3)
    shelf(img, C + 7, ce_cy + 7, 5, 3.5, math.radians(30) - math.pi / 2)  # grzybek na karku
    for s_ in (1, -1):  # kły
        bx = C + s_ * 4.5
        stroke(img, [(bx, ce_cy - 10), (bx + s_ * 2, ce_cy - 17)], 3.4, BONE[1])
        img.put(int(bx + s_ * 2), int(ce_cy - 18), BONE[0])
    for ex, ey in ((-3, -7), (2, -7), (-6, -5), (5, -5), (-8, -2), (7, -2), (-4, -3), (3, -3)):  # osiem oczu
        img.put(int(C + ex), int(ce_cy + ey), BULB[2] if eyes else CHITIN[1])
        img.put(int(C + ex), int(ce_cy + ey) + 1, BULB[0] if eyes else CHITIN[0])

    # 5. kosy (nad głową, rysowane na końcu)
    for side in (1, -1):
        hip, knee, tip = (lerp(a, b, droop) for a, b in zip(scythes, SCYTHE_DEAD)) if droop else scythes
        lift = sway if side > 0 else -sway
        pts = [hip, (knee[0], knee[1] + lift), (tip[0], tip[1] + lift)]
        if side < 0:
            pts = [mirror(p, C) for p in pts]
        scythe(img, *pts, bend=-side, bulbs=bulbs)
    return img


# ---------------- śmierć ----------------
def crumble(img, amount, seed):
    """Rozpad ciała: znikają całe bloki 3×3 sylwetki (bez półprzezroczystości), kałuża soku zostaje."""
    r = random.Random(seed)
    for by in range(0, img.h, 3):
        for bx in range(0, img.w, 3):
            if r.random() >= amount:
                continue
            for y in range(by, min(by + 3, img.h)):
                for x in range(bx, min(bx + 3, img.w)):
                    p = img.get(x, y)
                    if p and p[3] and p not in SAP:
                        img.put(x, y, SAP[1] if r.random() < .35 else (0, 0, 0, 0))
    return img


def king_death_frame(f):
    """Śmierć Króla Pająków (8 klatek, bez pętli): 0 wzdrygnięcie z rozbłyskiem bulw; 1–3 łapy i sztylety się
    podkulają, kosy opadają na ciało, bulwy i oczy gasną, wycieka sok; 4 bulwy pękają (chmura zarodników);
    5–7 rozpad w kałużę soku. Potem plama `splat`."""
    if f == 0:
        return king_pose(legs=(RAISE, RAISE), glow=True, scythes=SCYTHE_RAISE, bulbs=(BULB[1], BULB[2], BULB[2]))
    if f <= 3:
        t = (.35, .7, 1)[f - 1]
        return king_pose(curl=t, droop=t, bulbs=DIM_BULB if f >= 2 else BULB, eyes=f < 3, sap=(0, 18, 25)[f - 1])
    img = king_pose(curl=1, droop=1, bulbs=DIM_BULB, eyes=False, sap=(30, 34, 37, 39)[f - 4])
    return crumble(img, (0, .3, .6, .85)[f - 4], 2900 + f) if f > 4 else img


def death_spores(f):
    """Zarodniki z pękających bulw (klatki 3–6): pełne piksele bez obrysu (§6c), rozlatują się od odwłoka."""
    img = Img(KING, KING)
    if not 3 <= f <= 6:
        return img
    r = random.Random(2950 + f)
    spread = (12, 22, 30, 36)[f - 3]
    for _ in range((14, 24, 18, 10)[f - 3]):
        a = r.uniform(0, math.tau)
        d = r.uniform(spread * .5, spread)
        img.put(int(C + math.cos(a) * d), int(C + 16 + math.sin(a) * d * .9), SPORE[r.random() < .4])
    return img


def directional_sheet(size, frame_fn, cols, overlay_fn=None):
    sheet = Img(size * cols, size * 8)
    frames = []
    for col in range(cols):
        base = frame_fn(col)
        extra = overlay_fn(col) if overlay_fn else None
        for row in range(8):
            img = rotate45(base, row)
            outline(img, OUT)
            if extra:
                img.blit(rotate45(extra, row), 0, 0)
            sheet.blit(img, col * size, row * size)
            frames.append((f'r{row}c{col}', img))
    return sheet, frames


def validate(sheet_frames, size):
    errors = []
    for name, img in sheet_frames:
        opaque = [(x, y, c) for y, row in enumerate(img.p) for x, c in enumerate(row) if c[3]]
        if any(c[3] != 255 for _, _, c in opaque):
            errors.append(f'{name}: półprzezroczyste piksele')
        if any(c[:3] in ((0, 0, 0), (255, 255, 255)) for _, _, c in opaque):
            errors.append(f'{name}: czysta czerń/biel')
        lo, hi = MARGIN - 1, size - MARGIN
        if any(not (lo <= x <= hi and lo <= y <= hi) for x, y, _ in opaque):
            errors.append(f'{name}: sylwetka wchodzi w margines {MARGIN} px')
    return errors


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description="Generator Króla Pająków (Grzybnia)")
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 4x')
    a = ap.parse_args()
    sheets = {
        'spider-king_walk-stab.png': directional_sheet(KING, king_frame, 8),
        # Śmierć (krok 40): 8 klatek, kierunek z chwili śmierci.
        'spider-king_death.png': directional_sheet(KING, king_death_frame, 8, death_spores),
    }
    errors = [e for _, frames in sheets.values() for e in validate(frames, KING)]
    if errors:
        for e in errors[:30]:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    for fname, (sheet, frames) in sheets.items():
        sheet.pil().save(os.path.join(a.out, fname))
        print(f'zapisano {fname} {sheet.w}x{sheet.h}: {len(frames)} klatek')
        if a.preview:
            from PIL import Image
            os.makedirs(a.preview, exist_ok=True)
            im = sheet.pil()
            bg = Image.new('RGBA', im.size, GROVE.floor[2])
            bg.alpha_composite(im)
            bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(
                os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
