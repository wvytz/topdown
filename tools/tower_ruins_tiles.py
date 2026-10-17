"""
Generator kafli „Tower Ruins” (v2).

Użycie (z katalogu głównego repozytorium, wymaga Pillow — tools/requirements.txt):
  python tools/tower_ruins_tiles.py --out public/assets/tilesets             # arkusz + JSON, paleta domyślna
  python tools/tower_ruins_tiles.py --palette piaskowiec --out ...           # inna paleta
  python tools/tower_ruins_tiles.py --mockup --out tools/out                 # makiety wszystkich kandydatek palet
  python tools/tower_ruins_tiles.py --list                                   # lista palet

Zasady:
  - paleta to dane (role kolorów); funkcje rysujące nie znają żadnych hexów;
  - układ arkusza wynika z manifestu i jest wspólny dla wszystkich palet (zmiana palety = inna tekstura, te same indeksy);
  - seedy są stabilne: crc32(nazwa kafla), więc dopisanie kafla nie zmienia wyglądu pozostałych;
  - światło pada z północy, dlatego kafle wolno odbijać tylko w poziomie (flipX);
  - jedyna półprzezroczystość to cienie środowiska o stałej alfie ENV_SHADOW_ALPHA (STYLEGUIDE §6).
"""
import argparse
import colorsys
import dataclasses
import json
import math
import os
import random
import sys
import zlib
from collections import Counter
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFont

T = 32
FACE = 8  # wysokość lica ściany (południowa, widoczna strona) w pikselach
COLUMNS = 16
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES_DIR = os.path.join(ROOT, 'public', 'assets', 'sprites')
BIOME = 'tower_ruins'  # ustawiany z --biome (krok 23a); od niego zależą nazwy plików i ziarna kafli

Color = tuple


def hx(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def to_hex(c):
    return '#%02x%02x%02x' % c[:3]


def ok(L, C, h):
    """OKLCH -> sRGB (RGBA). Rampy budujemy w OKLCH, bo jasność L jest tam równomierna dla oka."""
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    rgb = (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
           -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
           -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)

    def enc(x):
        x = max(0.0, min(1.0, x))
        return int(round(255 * (12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055)))
    return (enc(rgb[0]), enc(rgb[1]), enc(rgb[2]), 255)


def oks(*specs):
    return tuple(ok(*s) for s in specs)


def hexes(*hs):
    return tuple(hx(h) for h in hs)


def luminance(c):
    def lin(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])


def contrast(y1, y2):
    hi, lo = max(y1, y2), min(y1, y2)
    return (hi + 0.05) / (lo + 0.05)


def hue_sat(c):
    h, _, s = colorsys.rgb_to_hls(c[0] / 255, c[1] / 255, c[2] / 255)
    return h * 360, s


CLR = (0, 0, 0, 0)
OUT = hx('#1b1a22')
ENV_SHADOW_ALPHA = 102  # 0.4
# Kolory wspólne całej obsady (STYLEGUIDE §4.2) — nie zależą od palety biomu.
GOLD = hexes('#5c4418', '#9a7424', '#d4a83a', '#f0d27a')
BONE = hexes('#9c8f74', '#d8ccb0', '#e8e0c0')
IRON = hexes('#3a3f4a', '#646c79', '#8d96a3')  # rampa pokrywy Trashcan Mana
DIRT = hexes('#120c0a', '#261a13', '#37271c', '#523b29', '#6e5038')  # rampa kałuży Sludge Kinga
# Szlam Sludge Kinga (STYLEGUIDE §4.5) — ślady po kulach bossa (krok 19b).
SLIME = hexes('#1f1420', '#3b2140', '#5c3560', '#83558a', '#b88ab8')
# Ogień pochodni (krok 19a): czerwień → pomarańcz → żółć złota → blask. Bez czystej bieli.
FLAME = oks((.48, .150, 35), (.64, .160, 55), (.79, .140, 82), (.91, .075, 95))


# ---------------- palety ----------------
@dataclass(frozen=True)
class Palette:
    key: str
    label: str
    floor: tuple       # 6: szczelina, fuga, płyta, krawędź jasna, blask, blask+
    floor_alt: Color   # druga płyta (ok. 30% płyt)
    wall_top: tuple    # 6: cień, fuga, blok, blok jasny, krawędź, blask
    wall_block_alt: Color
    wall_face: tuple   # 3: linia, lico, lico jasne
    wall_fade: tuple   # 3: fuga, blok, światło — ściany 2 kafle od podłogi
    deep: tuple        # 2: fuga, blok — masa ścian dalej niż 2 kafle od podłogi
    stain: tuple       # 2: plama zewnętrzna, wewnętrzna
    ash: tuple         # 2: kurz/popiół (nie magiczna zieleń)
    dirt: tuple = DIRT
    accent: tuple = GOLD
    bone: tuple = BONE
    iron: tuple = IRON
    flame: tuple = FLAME
    slime: tuple = SLIME
    outline: Color = OUT
    # Cmentarzysko (krok 32a): rozkładające się ciało i resztki grzybni z Grzybni. Puste w innych biomach.
    flesh: tuple = ()  # 3: cień, skóra, jasna
    mycel: tuple = ()  # 2: strzępka, świecąca końcówka
    # Piekło (krok 41a): żar w szczelinach — czerwień, pomarańcz, rozgrzany środek. Puste w innych biomach.
    ember: tuple = ()  # 3: czerwień, pomarańcz, rozgrzany środek


    def colors(self):
        out = set()
        for v in self.__dict__.values():
            if isinstance(v, tuple) and v and isinstance(v[0], tuple):  # rampa (pusta pomijana)
                out.update(v)
            elif isinstance(v, tuple) and len(v) == 4 and isinstance(v[0], int):
                out.add(v)
        return out


PALETTES = {
    # Punkt odniesienia: kolory arkusza v1 w nowej strukturze kafli.
    'v1': Palette(
        key='v1', label='v1 (obecna)',
        floor=hexes('#1f1c25', '#2a2731', '#34313b', '#3f3b44', '#4c4649', '#5e5555'),
        floor_alt=hx('#38343c'),
        wall_top=hexes('#29242f', '#423c48', '#5a525e', '#736971', '#8f8286', '#ae9e98'),
        wall_block_alt=hx('#62595f'),
        wall_face=hexes('#29242f', '#423c48', '#4d4652'),
        wall_fade=hexes('#1d1a22', '#2a2630', '#322d38'),
        deep=hexes('#121016', '#18151c'),
        stain=hexes('#2e1a20', '#3a1f26'),
        ash=hexes('#5a5153', '#4a4448'),
    ),
    # A: neutralny, lekko ciepły szary kamień, podłoga ok. 2x jaśniejsza niż v1.
    'szary_cieply': Palette(
        key='szary_cieply', label='A: ciepły szary',
        floor=oks((.30, .018, 250), (.36, .012, 240), (.42, .010, 70), (.465, .014, 72), (.51, .018, 75), (.56, .022, 78)),
        floor_alt=ok(.405, .010, 65),
        wall_top=oks((.28, .020, 260), (.38, .014, 250), (.52, .012, 70), (.58, .016, 72), (.66, .020, 75), (.74, .024, 78)),
        wall_block_alt=ok(.545, .012, 68),
        wall_face=oks((.25, .020, 265), (.31, .016, 260), (.36, .014, 250)),
        wall_fade=oks((.21, .016, 265), (.27, .014, 260), (.30, .012, 255)),
        deep=oks((.14, .012, 270), (.17, .012, 270)),
        stain=oks((.31, .045, 20), (.35, .050, 22)),
        ash=oks((.47, .012, 60), (.40, .010, 250)),
    ),
    # B: szarość z nutą zieleni — barwa najdalej od fioletu wrogów; ściany ciepłe dla odróżnienia od podłogi.
    'szary_zielony': Palette(
        key='szary_zielony', label='B: zielonkawy szary',
        floor=oks((.30, .018, 230), (.36, .014, 200), (.42, .014, 150), (.465, .016, 140), (.51, .018, 120), (.56, .020, 100)),
        floor_alt=ok(.405, .012, 155),
        wall_top=oks((.28, .020, 260), (.38, .014, 250), (.52, .014, 75), (.58, .018, 75), (.66, .022, 78), (.74, .026, 80)),
        wall_block_alt=ok(.545, .014, 72),
        wall_face=oks((.25, .020, 265), (.31, .016, 255), (.36, .014, 240)),
        wall_fade=oks((.21, .016, 265), (.27, .014, 255), (.30, .012, 245)),
        deep=oks((.14, .012, 260), (.17, .012, 255)),
        stain=oks((.31, .045, 20), (.35, .050, 22)),
        ash=oks((.47, .012, 90), (.40, .010, 220)),
    ),
    # C: jasny, ciepły piaskowiec — najmocniejszy kontrast dla ciemnych wrogów, słabszy dla jasnych.
    'piaskowiec': Palette(
        key='piaskowiec', label='C: jasny piaskowiec',
        floor=oks((.36, .020, 250), (.43, .016, 60), (.49, .024, 70), (.535, .028, 75), (.58, .032, 78), (.63, .034, 82)),
        floor_alt=ok(.47, .022, 65),
        wall_top=oks((.32, .020, 260), (.44, .018, 60), (.60, .024, 72), (.66, .028, 75), (.73, .030, 78), (.80, .030, 82)),
        wall_block_alt=ok(.625, .024, 70),
        wall_face=oks((.28, .020, 265), (.35, .018, 255), (.40, .016, 245)),
        wall_fade=oks((.22, .016, 265), (.29, .014, 260), (.32, .014, 255)),
        deep=oks((.14, .012, 270), (.17, .012, 270)),
        stain=oks((.36, .050, 20), (.41, .050, 22)),
        ash=oks((.55, .016, 65), (.49, .014, 250)),
    ),
    # Pajęcze leże (krok 23a, poprawka właściciela): fiolet, zieleń i biel — mroczne leże w starej wieży.
    # Zasady biomu inne niż w ruinach: fioletowy kamień, zielona posoka i upiorny zielony ogień, białe nici i jaja.
    # Jasność podłogi jak w C — kontrast obrysu postaci zostaje (pilnują testy czytelności).
    'pajeczy': Palette(
        key='pajeczy', label='Pajęcze leże: fiolet, zieleń, biel',
        floor=oks((.32, .066, 300), (.39, .068, 305), (.465, .070, 310), (.51, .072, 312), (.555, .072, 315), (.60, .068, 318)),
        floor_alt=ok(.44, .074, 300),
        wall_top=oks((.24, .070, 295), (.34, .080, 300), (.47, .090, 305), (.53, .092, 310), (.61, .086, 314), (.70, .074, 318)),
        wall_block_alt=ok(.495, .094, 300),
        wall_face=oks((.19, .066, 295), (.25, .076, 300), (.30, .080, 305)),
        wall_fade=oks((.15, .056, 295), (.20, .062, 300), (.23, .066, 305)),
        deep=oks((.10, .040, 300), (.13, .046, 300)),
        # Posoka i plamy: ciemna, trująca zieleń (daleko od jasnej zieleni magii #9cff57).
        stain=oks((.38, .090, 155), (.45, .105, 150)),
        # Nici, kurz i pajęczyny: biel z lekkim fioletem.
        ash=oks((.93, .014, 305), (.80, .022, 305)),
        # Jaja i kości: zielonkawa biel.
        bone=oks((.80, .030, 150), (.89, .022, 145), (.95, .012, 130)),
        # Upiorny zielony ogień pochodni (poświata pochodni też bierze barwę z tej rampy).
        flame=oks((.46, .120, 155), (.62, .150, 150), (.79, .150, 140), (.91, .080, 130)),
    ),
    # Grzybnia (krok 28a): piętro zainfekowanego Króla Pająków — fiolet ciemniejszy niż w leżu, z domieszką
    # błękitu; zarodniki i strzępki bladoliliowe, światło to bioluminescencja grzybów (cyjan zamiast ognia).
    # Podłoga ciemniejsza niż w leżu, ale postacie zachowują kontrast (pilnują testy czytelności).
    'grzybnia': Palette(
        key='grzybnia', label='Grzybnia: ciemny fiolet z błękitem, bioluminescencja',
        floor=oks((.30, .056, 285), (.38, .060, 288), (.445, .062, 290), (.49, .064, 292), (.535, .064, 294), (.58, .060, 296)),
        floor_alt=ok(.435, .066, 282),
        # Mury ciemniejsze niż w leżu (krok 28: im głębiej, tym mroczniej).
        wall_top=oks((.17, .056, 280), (.25, .064, 284), (.36, .072, 288), (.42, .074, 292), (.50, .070, 296), (.58, .060, 300)),
        wall_block_alt=ok(.385, .076, 282),
        wall_face=oks((.13, .050, 278), (.18, .058, 282), (.22, .062, 286)),
        wall_fade=oks((.12, .046, 278), (.17, .052, 282), (.20, .056, 286)),
        deep=oks((.09, .036, 275), (.11, .040, 278)),
        # Pleśń, plamy i posoka zarażonych: przygaszony, ciemny turkus (naleciałość, nie jaskrawa zieleń).
        stain=oks((.31, .040, 225), (.37, .046, 215)),
        # Zarodniki, strzępki, kurz: blady liliowobłękitny.
        ash=oks((.90, .022, 280), (.76, .032, 282)),
        # Kapelusze i kościste grzyby: blada kość z fioletem.
        bone=oks((.72, .030, 310), (.83, .026, 315), (.92, .014, 320)),
        # Bioluminescencja: grzyby-latarnie zamiast pochodni (poświata gry też bierze barwę z tej rampy).
        flame=oks((.48, .090, 230), (.63, .120, 220), (.80, .120, 205), (.92, .060, 195)),
    ),
    # Cmentarzysko (krok 32a): ludzkie miejsce pochówku, gdzie upadli zatruci; grzyb ledwo dociera.
    # Trzy kandydatki do wyboru przez właściciela. Jasność podłogi jak w Grzybni (czytelność postaci),
    # mrok daje światło gry. Mury ciemniejsze niż w Grzybni (każdy biom mroczniejszy).
    # A: zimny popiół z nutą zieleni — kamień nagrobny, chłodny i martwy.
    'cmentarz_popiol': Palette(
        key='cmentarz_popiol', label='A: zimny popiół',
        floor=oks((.29, .014, 200), (.37, .014, 175), (.445, .014, 160), (.49, .016, 158), (.535, .016, 155), (.58, .016, 150)),
        floor_alt=ok(.43, .016, 170),
        wall_top=oks((.15, .016, 220), (.23, .018, 215), (.34, .018, 205), (.40, .018, 200), (.48, .018, 195), (.56, .016, 190)),
        wall_block_alt=ok(.37, .018, 210),
        wall_face=oks((.11, .016, 225), (.16, .018, 220), (.20, .018, 215)),
        wall_fade=oks((.10, .014, 225), (.15, .016, 220), (.18, .016, 215)),
        deep=oks((.08, .012, 225), (.10, .012, 225)),
        # Zgnilizna i zacieki: ciemny brąz rozkładu.
        stain=oks((.29, .035, 60), (.35, .040, 65)),
        # Kurz grobowy: szary popiół.
        ash=oks((.70, .012, 150), (.58, .012, 160)),
        bone=oks((.66, .035, 85), (.77, .036, 88), (.87, .028, 92)),
        # Świeczki wotywne zamiast pochodni: blady, chorobliwy płomień (żółć z nutą zieleni).
        flame=oks((.52, .095, 75), (.68, .115, 88), (.83, .105, 98), (.93, .050, 102)),
        # Zgnilizna: skóra zmarłych w szarozieleni.
        flesh=oks((.40, .030, 135), (.49, .036, 128), (.58, .036, 122)),
        # Grzybnia ledwo tu dociera: przygaszony turkus Grzybni, świecąca końcówka.
        mycel=oks((.55, .045, 215), (.76, .075, 205)),
    ),
    # B: ziemia grobowa — szarobrązowa, ubita posadzka i szare mury grobowców.
    'cmentarz_ziemia': Palette(
        key='cmentarz_ziemia', label='B: ziemia grobowa',
        floor=oks((.29, .022, 50), (.37, .022, 55), (.445, .024, 60), (.49, .026, 62), (.535, .026, 65), (.58, .024, 68)),
        floor_alt=ok(.43, .026, 50),
        wall_top=oks((.15, .012, 250), (.23, .014, 245), (.34, .014, 240), (.40, .014, 235), (.48, .014, 230), (.56, .012, 225)),
        wall_block_alt=ok(.37, .014, 250),
        wall_face=oks((.11, .012, 255), (.16, .014, 250), (.20, .014, 245)),
        wall_fade=oks((.10, .010, 255), (.15, .012, 250), (.18, .012, 245)),
        deep=oks((.08, .010, 255), (.10, .010, 255)),
        stain=oks((.27, .040, 45), (.33, .045, 50)),
        ash=oks((.68, .016, 70), (.57, .016, 65)),
        bone=oks((.66, .035, 85), (.77, .036, 88), (.87, .028, 92)),
        # Świeczki wotywne zamiast pochodni: blady, chorobliwy płomień (żółć z nutą zieleni).
        flame=oks((.52, .095, 75), (.68, .115, 88), (.83, .105, 98), (.93, .050, 102)),
        # Zgnilizna: skóra zmarłych w szarozieleni.
        flesh=oks((.40, .030, 135), (.49, .036, 128), (.58, .036, 122)),
        # Grzybnia ledwo tu dociera: przygaszony turkus Grzybni, świecąca końcówka.
        mycel=oks((.55, .045, 215), (.76, .075, 205)),
    ),
    # C: trupia zieleń — oliwkowy, chorobliwy kamień; rozkład wsiąkł w posadzkę.
    'cmentarz_trupi': Palette(
        key='cmentarz_trupi', label='C: trupia zieleń',
        floor=oks((.29, .028, 125), (.37, .030, 120), (.445, .032, 115), (.49, .034, 112), (.535, .034, 110), (.58, .032, 108)),
        floor_alt=ok(.43, .034, 125),
        wall_top=oks((.15, .020, 150), (.23, .022, 145), (.34, .024, 140), (.40, .024, 135), (.48, .022, 130), (.56, .020, 125)),
        wall_block_alt=ok(.37, .024, 150),
        wall_face=oks((.11, .018, 155), (.16, .020, 150), (.20, .022, 145)),
        wall_fade=oks((.10, .016, 155), (.15, .018, 150), (.18, .020, 145)),
        deep=oks((.08, .012, 155), (.10, .014, 155)),
        stain=oks((.28, .040, 70), (.34, .045, 75)),
        ash=oks((.70, .016, 110), (.58, .016, 115)),
        bone=oks((.66, .035, 85), (.77, .036, 88), (.87, .028, 92)),
        # Świeczki wotywne zamiast pochodni: blady, chorobliwy płomień (żółć z nutą zieleni).
        flame=oks((.52, .095, 75), (.68, .115, 88), (.83, .105, 98), (.93, .050, 102)),
        # Zgnilizna: skóra zmarłych w szarozieleni.
        flesh=oks((.40, .030, 135), (.49, .036, 128), (.58, .036, 122)),
        # Grzybnia ledwo tu dociera: przygaszony turkus Grzybni, świecąca końcówka.
        mycel=oks((.55, .045, 215), (.76, .075, 205)),
    ),
    # Piekło (piętro 5, krok 41a): krwisty, demoniczny biom z pomarańczowym żarem (prośba właściciela).
    # Trzy kandydatki — mury i głębia mroczniejsze niż na Cmentarzysku (każdy biom mroczniejszy).
    # A: krwawy bazalt — prawie czarna, chłodna skała z nutą czerwieni; czerwień niesie krew i żar.
    'pieklo_bazalt': Palette(
        key='pieklo_bazalt', label='A: krwawy bazalt',
        floor=oks((.29, .020, 20), (.37, .024, 22), (.445, .028, 25), (.49, .030, 27), (.535, .030, 30), (.58, .028, 32)),
        floor_alt=ok(.43, .030, 15),
        wall_top=oks((.13, .020, 15), (.20, .028, 18), (.30, .034, 20), (.36, .036, 22), (.44, .034, 25), (.52, .030, 28)),
        wall_block_alt=ok(.33, .036, 12),
        wall_face=oks((.09, .022, 15), (.14, .028, 18), (.18, .032, 20)),
        wall_fade=oks((.08, .018, 15), (.12, .024, 18), (.15, .028, 20)),
        deep=oks((.06, .016, 15), (.08, .018, 15)),
        # Krew: zaschnięta (zewnętrzna) i świeża.
        stain=oks((.27, .090, 22), (.34, .120, 25)),
        # Iskry z palenisk (pyłki w powietrzu i drobiny na posadzce): pomarańcz i czerwień żaru.
        ash=oks((.68, .140, 52), (.54, .150, 32)),
        ember=oks((.46, .160, 28), (.63, .170, 45), (.80, .140, 72)),
        # Pochodnie piekła: czerwieńszy ogień niż w ruinach.
        flame=oks((.44, .160, 28), (.60, .170, 42), (.76, .150, 65), (.90, .080, 85)),
    ),
    # B: zaschnięta krew — rdzawy bordo posadzki, mury z ciemnej, krwistej cegły.
    'pieklo_krew': Palette(
        key='pieklo_krew', label='B: zaschnięta krew',
        floor=oks((.29, .045, 18), (.37, .055, 20), (.445, .062, 22), (.49, .066, 24), (.535, .066, 27), (.58, .062, 30)),
        floor_alt=ok(.43, .066, 14),
        wall_top=oks((.13, .040, 15), (.20, .055, 17), (.30, .068, 19), (.36, .072, 21), (.44, .068, 24), (.52, .060, 27)),
        wall_block_alt=ok(.33, .070, 12),
        wall_face=oks((.09, .035, 15), (.14, .050, 17), (.18, .060, 19)),
        wall_fade=oks((.08, .030, 15), (.12, .042, 17), (.15, .050, 19)),
        deep=oks((.06, .024, 15), (.08, .028, 15)),
        stain=oks((.24, .095, 20), (.31, .125, 24)),
        ash=oks((.60, .016, 45), (.50, .016, 40)),
    ),
    # C: rozżarzony popiół — szaroczarna posadzka jak po pożarze, ciepłe pęknięcia, mury z osmalonego kamienia.
    'pieklo_popiol': Palette(
        key='pieklo_popiol', label='C: rozżarzony popiół',
        floor=oks((.29, .016, 45), (.37, .018, 48), (.445, .020, 50), (.49, .022, 52), (.535, .024, 55), (.58, .024, 58)),
        floor_alt=ok(.43, .022, 40),
        wall_top=oks((.13, .030, 25), (.20, .040, 25), (.30, .048, 28), (.36, .050, 30), (.44, .046, 34), (.52, .040, 38)),
        wall_block_alt=ok(.33, .050, 22),
        wall_face=oks((.09, .028, 22), (.14, .038, 24), (.18, .044, 26)),
        wall_fade=oks((.08, .024, 22), (.12, .032, 24), (.15, .038, 26)),
        deep=oks((.06, .018, 22), (.08, .020, 22)),
        stain=oks((.27, .090, 22), (.34, .120, 25)),
        ash=oks((.64, .012, 60), (.54, .012, 55)),
    ),
}
DEFAULT_PALETTE = 'piaskowiec'  # wybór właściciela, krok 16

# Biomy (krok 23a): paleta domyślna i dodatkowe kafle. Ruiny bez dodatków — arkusz bez zmian.
# `reserved_hues`: czy podłoga omija barwy zarezerwowane (fiolet wrogów, zieleń magii). W leżu nie —
# decyzja właściciela: ten biom ma być fioletowo-zielony.
BIOMES = {
    'tower_ruins': {'palette': 'piaskowiec', 'extras': (), 'reserved_hues': True},
    'spider_lair': {'palette': 'pajeczy', 'extras': ('spider',), 'reserved_hues': False},
    # Grzybnia (krok 28a): dalszy ciąg leża (jaja, nici, pancerzyki) porośnięty grzybem; fiolet z wyboru właściciela.
    'fungal_grove': {'palette': 'grzybnia', 'extras': ('spider', 'fungus'), 'reserved_hues': False},
    # Cmentarzysko (krok 32a): ludzki biom — groby, kości, zwłoki zatrutych; grzybnia ledwo dociera.
    'graveyard': {'palette': 'cmentarz_trupi', 'extras': ('grave',), 'reserved_hues': True},
    # Piekło (krok 41a): krwisty, demoniczny biom z paleniskami; czerwień i pomarańcz z prośby właściciela,
    # więc podłoga może wejść w barwy bliskie złota łupów — czytelność pilnują testy.
    'infernal': {'palette': 'pieklo_bazalt', 'extras': ('infernal',), 'reserved_hues': False},
}


# ---------------- płótno ----------------
class Img:
    def __init__(s, w, h, fill=CLR):
        s.w, s.h = w, h
        s.p = [[fill] * w for _ in range(h)]

    def get(s, x, y):
        return s.p[y][x] if 0 <= x < s.w and 0 <= y < s.h else None

    def put(s, x, y, c):
        if 0 <= x < s.w and 0 <= y < s.h:
            s.p[y][x] = c

    def blit(s, o, ox, oy):
        for y in range(o.h):
            for x in range(o.w):
                c = o.p[y][x]
                if c[3]:
                    s.put(ox + x, oy + y, c)

    def pil(s):
        im = Image.new('RGBA', (s.w, s.h))
        im.putdata([c for row in s.p for c in row])
        return im


def outline(img, color):
    """Obrys 1 px, 4-sąsiedztwo (STYLEGUIDE §3)."""
    add = []
    for y in range(img.h):
        for x in range(img.w):
            if img.p[y][x][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    c = img.get(x + dx, y + dy)
                    if c and c[3] and c != color:
                        add.append((x, y))
                        break
    for x, y in add:
        img.put(x, y, color)


def disc(img, cx, cy, rad, fn):
    for y in range(img.h):
        for x in range(img.w):
            dx, dy = x + .5 - cx, y + .5 - cy
            d = (dx * dx + dy * dy) ** .5
            if d <= rad:
                img.put(x, y, fn(dx, dy, d))


# ---------------- podłoga ----------------
def grid_slabs(w, h, size=16):
    return [(x, y, size, size) for y in range(0, h, size) for x in range(0, w, size)]


SLAB_LAYOUTS = {
    'slab16': grid_slabs(T, T),
    'slab32': [(0, 0, 32, 32)],
    'mixed_h': [(0, 0, 32, 16), (0, 16, 16, 16), (16, 16, 16, 16)],
    'mixed_v': [(0, 0, 16, 32), (16, 0, 16, 16), (16, 16, 16, 16)],
    # Wzory 64x64 („wiatraczek”): płyty przechodzą przez krawędzie kafli i łamią siatkę 32 px.
    'macro_a': [(0, 0, 40, 24), (40, 0, 24, 40), (0, 24, 24, 40), (24, 24, 16, 16), (24, 40, 40, 24)],
    'macro_b': [(0, 0, 16, 48), (16, 0, 48, 16), (16, 16, 32, 32), (48, 16, 16, 48), (0, 48, 48, 16)],
}


def floor_slabs(p, r, slabs, w=T, h=T, img=None, worn=False):
    """Płyty: fuga 1 px o ton ciemniejsza od płyty (nie kolor obrysu postaci!), krawędź oświetlona od północy i zachodu."""
    img = img or Img(w, h)
    F = p.floor
    for (sx, sy, sw, sh) in slabs:
        base = p.floor_alt if r.random() < .3 else F[2]
        for y in range(sh):
            for x in range(sw):
                c = F[1] if (x == 0 or y == 0) else (F[3] if (x == 1 or y == 1) else base)
                img.put(sx + x, sy + y, c)
        img.put(sx + 2, sy + 1, F[4])
        img.put(sx + 3, sy + 1, F[4])
        area = sw * sh / 256
        for _ in range(int(r.randint(4, 8) * area)):
            img.put(sx + r.randint(3, sw - 3), sy + r.randint(3, sh - 3), r.choice([F[1], F[1], F[3]]))
        if worn:  # wytarty środek: jaśniejsze drobiny tam, gdzie się chodzi
            for _ in range(int(10 * area)):
                x, y = sx + r.randint(4, sw - 4), sy + r.randint(4, sh - 4)
                if img.get(x, y) == base:
                    img.put(x, y, F[3])
        for _ in range(r.randint(0, 2)):  # obtłuczone narożniki
            img.put(sx + r.choice([1, sw - 1]), sy + r.choice([1, sh - 1]), F[0])
    return img


def crack(img, r, x, y, n, dx, dy, dark, lit, keep=None, lit_on_clear=False):
    pts = []
    for _ in range(n):
        if keep and not keep(x, y):
            break
        img.put(x, y, dark)
        pts.append((x, y))
        if r.random() < .55:
            x += dx
        if r.random() < .55:
            y += dy
        if r.random() < .25:
            x += r.choice([-1, 1]) if dx == 0 else 0
            y += r.choice([-1, 1]) if dy == 0 else 0
        if r.random() < .08 and n > 6:
            crack(img, r, x, y, r.randint(3, 6), r.choice([-1, 1]), dy or 1, dark, lit, keep, lit_on_clear)
    for (px, py) in pts:  # oświetlona dolna krawędź szczeliny
        b = img.get(px, py + 1)
        if b is not None and b != dark and (b[3] or lit_on_clear):
            img.put(px, py + 1, lit)
    return pts


def hole(img, p, r, cx, cy, rad, pebbles=True):
    """Wyłom w posadzce: cień pod północną krawędzią, oświetlona krawędź południowa."""
    F, D = p.floor, p.dirt
    inside = set()
    for y in range(img.h):
        for x in range(img.w):
            if ((x - cx) ** 2 + (y - cy) ** 2) ** .5 < rad + r.uniform(-1.6, 1.6):
                inside.add((x, y))
    for (x, y) in inside:
        img.put(x, y, D[2] if r.random() < .75 else D[1])
    for (x, y) in inside:
        if (x, y - 1) not in inside:
            img.put(x, y, F[0])
        elif (x, y - 2) not in inside:
            img.put(x, y, D[1])
        if (x, y + 1) not in inside and y + 1 < img.h:
            img.put(x, y + 1, F[4])
    if pebbles and inside:
        pts = sorted(inside)
        for _ in range(r.randint(3, 6)):
            x, y = r.choice(pts)
            if (x, y - 1) in inside and (x + 1, y) in inside and (x, y + 1) in inside:
                img.put(x, y, D[4])
                img.put(x + 1, y, D[3])
                img.put(x, y + 1, D[1])
    return inside


def stain(img, p, r, cx, cy, rad):
    for y in range(img.h):
        for x in range(img.w):
            d = ((x - cx) ** 2 + ((y - cy) * 1.3) ** 2) ** .5
            if d < rad + r.uniform(-1.5, 1.5):
                img.put(x, y, p.stain[1] if d < rad * .6 else p.stain[0])


def pebble(img, x, y, size, pal):
    """Drobny okruch kamienia, oświetlony od góry."""
    for yy in range(size):
        for xx in range(size + (1 if size > 1 else 0)):
            img.put(x + xx, y + yy, pal[3] if yy == 0 else (pal[1] if yy == size - 1 else pal[2]))
    if size > 1:
        img.put(x, y, pal[4])


def floor_base(style):
    def gen(p, r):
        if style == 'worn':
            return floor_slabs(p, r, SLAB_LAYOUTS['slab16'], worn=True)
        if style.startswith('macro'):
            return floor_slabs(p, r, SLAB_LAYOUTS[style], 2 * T, 2 * T)
        return floor_slabs(p, r, SLAB_LAYOUTS[style])
    return gen


def decal(kind):
    """Przezroczyste nakładki na dowolną bazę podłogi."""
    def gen(p, r):
        F, W = p.floor, p.wall_top
        lit = dict(dark=F[0], lit=F[4], lit_on_clear=True)
        if kind == 'crack_a':
            img = Img(T, T); crack(img, r, 3, 6, 26, 1, 1, **lit)
        elif kind == 'crack_b':
            img = Img(T, T); crack(img, r, 28, 2, 30, -1, 1, **lit); crack(img, r, 6, 20, 10, 1, 0, **lit)
        elif kind == 'crack_c':
            img = Img(T, T); crack(img, r, 10, 12, 12, 1, 1, **lit)
        elif kind == 'crack_2x1':
            img = Img(2 * T, T); crack(img, r, 2, 12, 70, 1, 0, keep=lambda x, y: 1 <= y < 30, **lit)
        elif kind == 'crack_1x2':
            img = Img(T, 2 * T); crack(img, r, 14, 1, 70, 0, 1, keep=lambda x, y: 1 <= x < 30, **lit)
        elif kind == 'broken_a':
            img = Img(T, T); hole(img, p, r, 22, 10, 6.5); crack(img, r, 15, 13, 12, -1, 1, **lit)
        elif kind == 'broken_b':
            img = Img(T, T); hole(img, p, r, 15, 17, 10.5)
        elif kind == 'rubble':
            img = Img(T, T); hole(img, p, r, 16, 16, 13.5, pebbles=False)
            for _ in range(9):
                pebble(img, r.randint(3, 26), r.randint(3, 26), r.choice([1, 2, 2, 3]), W)
        elif kind in ('stain_a', 'stain_b'):
            img = Img(T, T); stain(img, p, r, r.randint(12, 18), r.randint(13, 19), r.uniform(6, 9))
        elif kind in ('debris_a', 'debris_b'):
            img = Img(T, T)
            for _ in range(7):
                pebble(img, r.randint(2, 28), r.randint(2, 28), r.choice([1, 1, 2]), W)
        elif kind in ('husk_a', 'husk_b'):  # wyschnięte pancerzyki ofiar pająków (pajęcze leże): odwłok i nóżki
            img = Img(T, T)
            spots = [(10, 11), (21, 20)] if kind == 'husk_a' else [(9, 20), (19, 9), (23, 22)]
            for cx, cy in spots:
                # Wyblakłe (kość + szare nóżki), żeby nie myliły się z żywymi, ciemnymi pająkami.
                for dx, dy in ((-3, -2), (-3, 0), (-3, 2), (3, -2), (3, 0), (3, 2)):
                    img.put(cx + dx, cy + dy, p.ash[1])
                    img.put(cx + dx + (1 if dx < 0 else -1), cy + dy // 2, p.ash[1])
                for dy in range(-2, 3):
                    for dx in range(-1, 2):
                        if abs(dy) < 2 or dx == 0:
                            img.put(cx + dx, cy + dy, p.bone[1] if dy < 0 else p.bone[0])
        elif kind in ('mushrooms_a', 'mushrooms_b'):  # kępka grzybów (Grzybnia): kapelusz-półelipsa na trzonku
            img = Img(T, T)
            # (środek kapelusza x, y podstawy trzonka, promień kapelusza, wysokość trzonka)
            spots = ([(10, 17, 3.5, 3), (16, 14, 2.5, 2), (14, 21, 2, 2)] if kind == 'mushrooms_a'
                     else [(20, 22, 3, 3), (15, 24, 2, 2), (25, 25, 2, 1), (9, 11, 2.5, 2)])
            for cx, base, rad, stem in sorted(spots, key=lambda sp: sp[1]):
                shroom = Img(T, T)
                for y in range(base - stem, base + 1):  # trzonek 2 px
                    shroom.put(cx - 1, y, p.bone[1])
                    shroom.put(cx, y, p.bone[0])
                top = base - stem
                for y in range(T):
                    for x in range(T):
                        nx, ny = (x + .5 - cx) / rad, (y + .5 - top) / (rad * .75)
                        if ny <= .2 and nx * nx + ny * ny <= 1:
                            shroom.put(x, y, p.bone[2] if nx + ny < -.5 else (p.bone[1] if nx < .4 else p.bone[0]))
                outline(shroom, p.outline)
                img.blit(shroom, 0, 0)
            # Świecąca plamka na największym kapeluszu — punkt orientacyjny w mgle.
            cx, base, rad, stem = spots[0]
            img.put(cx, base - stem - 1, p.flame[2])
        elif kind in ('mycel_a', 'mycel_b'):  # grzybnia: cienkie, rozgałęzione strzępki na podłodze (bez wypełnienia)
            img = Img(T, T)
            for _ in range(3 if kind == 'mycel_a' else 4):
                x, y = r.uniform(4, 28), r.uniform(4, 28)
                a = r.uniform(0, 2 * math.pi)
                for i in range(r.randint(10, 16)):
                    a += r.uniform(-.6, .6)
                    x, y = x + math.cos(a), y + math.sin(a)
                    if 1 <= x < T - 1 and 1 <= y < T - 1:
                        img.put(int(x), int(y), p.ash[1] if i % 5 else p.ash[0])
        elif kind.startswith('dust_') and 'fungus' in BIOMES[BIOME]['extras']:
            # Grzybnia: zamiast kurzu pleśń wpełzająca z muru — gęsta przy ścianie, dalej strzępiaste języki.
            img = Img(T, T); side = kind[-1]
            tongues = [r.uniform(6, 15) for _ in range(T)]
            for i in range(1, T):  # języki zmieniają długość płynnie wzdłuż muru
                tongues[i] = tongues[i - 1] * .7 + tongues[i] * .3
            for y in range(T):
                for x in range(T):
                    d, along = {'n': (y, x), 'w': (x, y), 'e': (T - 1 - x, y)}[side]
                    reach = tongues[along]
                    if d < reach and r.random() < 1.05 - d / reach:
                        img.put(x, y, p.stain[0] if d > reach * .45 else p.stain[1])
                    elif d < reach + 3 and r.random() < .12:
                        img.put(x, y, p.ash[1])  # zarodniki na skraju
        elif kind in ('mold_a', 'mold_b', 'mold_c'):  # Grzybnia: duża, nieregularna plama pleśni z prześwitami
            img = Img(T, T)
            blobs = [(r.uniform(11, 21), r.uniform(11, 21), r.uniform(7, 11))]
            blobs += [(r.uniform(6, 26), r.uniform(6, 26), r.uniform(4, 7)) for _ in range(r.randint(1, 3))]
            for y in range(1, T - 1):
                for x in range(1, T - 1):
                    best = min(math.hypot(x + .5 - cx, y + .5 - cy) / rad for cx, cy, rad in blobs)
                    if best > 1 + r.uniform(-.2, .05) or r.random() < .18:
                        continue
                    img.put(x, y, p.stain[1] if best < .5 else p.stain[0])
            for _ in range(r.randint(4, 8)):  # zarodniki na plamie
                x, y = r.randrange(2, T - 2), r.randrange(2, T - 2)
                if img.get(x, y)[3]:
                    img.put(x, y, p.ash[1])
        elif kind.startswith('dust_'):  # kurz nawiany pod ścianę; gęstszy przy samej ścianie
            img = Img(T, T); side = kind[-1]
            for y in range(T):
                for x in range(T):
                    d = {'n': y, 'w': x, 'e': T - 1 - x}[side]
                    if d < 8 and r.random() < .5 - d * .06:
                        img.put(x, y, p.ash[0] if r.random() < .6 else p.ash[1])
        else:
            raise ValueError(kind)
        return img
    return gen


# ---------------- ściany (autotile 4-bit: N1 E2 S4 W8 = sąsiad jest ścianą) ----------------
def ashlar(img, r, mortar, block, lit, block_alt=None, edge_hi=None, specks=None):
    """Ciosy 16x8 w układzie z przesunięciem — wierzch muru."""
    for y in range(T):
        off = 8 if (y // 8) % 2 else 0
        for x in range(T):
            lx, ly = (x + off) % 16, y % 8
            if ly == 0 or lx == 0:
                c = mortar
            elif ly == 1:
                c = lit
            elif ly == 7:
                c = mortar if lx > 1 else block
            else:
                c = block
            img.put(x, y, c)
    for row in range(4):
        off = 8 if row % 2 else 0
        for bx in range(-off, T, 16):
            if block_alt and r.random() < .35:
                for y in range(row * 8 + 2, row * 8 + 7):
                    for x in range(bx + 1, bx + 16):
                        if 0 <= x < T and img.get(x, y) == block:
                            img.put(x, y, block_alt)
            if edge_hi:
                img.put(bx + 2, row * 8 + 1, edge_hi)
    if specks:
        for _ in range(10):
            x, y = r.randint(1, 30), r.randint(1, 30)
            if img.get(x, y) == block:
                img.put(x, y, r.choice(specks))


def wall_tile(mask, dmg=None, diag=0):
    """diag (tylko dla maski 15): podłoga po skosie NE1 SE2 SW4 NW8 — domyka obrys w narożnikach."""
    def gen(p, r):
        wt, wf, O = p.wall_top, p.wall_face, p.outline
        img = Img(T, T)
        ashlar(img, r, wt[1], wt[2], wt[3], p.wall_block_alt, wt[4], (wt[1], wt[3]))
        S, N, E, Wo = not mask & 4, not mask & 1, not mask & 2, not mask & 8
        fy = T - FACE
        if S:  # lico od południa — widoczny bok muru, w cieniu
            for x in range(T):
                img.put(x, fy - 1, wt[4])
            for y in range(fy, T):
                ly = y - fy
                for x in range(T):
                    if ly in (0, 3) or ly >= 6 or (x + (6 if ly > 3 else 0)) % 12 == 0:
                        c = wf[0]
                    elif ly in (1, 4):
                        c = wf[2]
                    else:
                        c = wf[1]
                    img.put(x, y, c)
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
                    img.put(1, y, wf[1] if (S and y >= fy) else wt[3])
        if E:
            for y in range(T):
                img.put(T - 1, y, O)
                img.put(T - 2, y, wf[0] if (S and y >= fy) else wt[1])
        # zaokrąglone narożniki zewnętrzne
        if N and Wo: img.put(0, 0, CLR); img.put(1, 1, O)
        if N and E: img.put(T - 1, 0, CLR); img.put(T - 2, 1, O)
        if S and Wo: img.put(0, T - 1, CLR); img.put(1, T - 2, O)
        if S and E: img.put(T - 1, T - 1, CLR); img.put(T - 2, T - 2, O)
        # narożniki wewnętrzne: krawędź boku muru obok lica sąsiada
        if diag & 2:
            for y in range(fy - 1, T): img.put(T - 1, y, O); img.put(T - 2, y, wt[1])
        if diag & 4:
            for y in range(fy - 1, T): img.put(0, y, O); img.put(1, y, wt[3])
        if diag & 1: img.put(T - 1, 0, O)
        if diag & 8: img.put(0, 0, O)
        # zniszczenia tylko na wierzchu muru, nigdy na licu ani obrysie
        y0, y1 = (3 if N else 1), (fy - 1 if S else T - 1)
        x0, x1 = (3 if Wo else 1), (T - 3 if E else T - 1)
        inside = lambda x, y: x0 <= x < x1 and y0 <= y < y1
        if dmg == 'crack':
            crack(img, r, x0 + 3, y0 + 1, 26, 1, 1, dark=wt[0], lit=wt[3], keep=inside)
        elif dmg == 'chunk':
            cx, cy = (x0 + x1) // 2 + r.randint(-4, 4), (y0 + y1) // 2
            pts = {(x, y) for y in range(T) for x in range(T)
                   if inside(x, y) and ((x - cx) ** 2 + (y - cy) ** 2) ** .5 < 5.5 + r.uniform(-1.4, 1.4)}
            for (x, y) in pts:
                img.put(x, y, wt[1] if r.random() < .7 else wt[0])
            for (x, y) in pts:
                if (x, y - 1) not in pts: img.put(x, y, wt[0])
                if (x, y + 1) not in pts and inside(x, y + 1): img.put(x, y + 1, wt[4])
            for (x, y) in r.sample(sorted(pts), min(4, len(pts))):
                pebble(img, x, y, 1, wt)
        elif dmg == 'ash':  # nawiany popiół, wyblakły — nie magiczna zieleń
            for _ in range(40):
                x, y = r.randint(x0, x1 - 1), r.randint(max(y0, 12), min(y1 - 1, 22))
                img.put(x, y, r.choice(p.ash))
        return img
    return gen


def wall_band(band):
    """Masa muru z dala od podłogi: przygaszona (fade), potem prawie ciemność (deep). Ten sam rytm ciosów."""
    def gen(p, r):
        img = Img(T, T)
        if band == 'fade':
            ashlar(img, r, p.wall_fade[0], p.wall_fade[1], p.wall_fade[2], specks=(p.wall_fade[0],))
        else:
            ashlar(img, r, p.deep[0], p.deep[1], p.deep[1])
        return img
    return gen


def env_shadow(mask):
    """Cień środowiska na podłodze: N1 pas pod licem, E2/W8 wąski pas przy bocznej ścianie. Stała alfa."""
    def gen(p, r):
        img = Img(T, T)
        c = p.outline[:3] + (ENV_SHADOW_ALPHA,)
        for y in range(T):
            for x in range(T):
                if (mask & 1 and y < 5) or (mask & 8 and x < 2) or (mask & 2 and x >= T - 2):
                    img.put(x, y, c)
        return img
    return gen


# ---------------- krata areny ----------------
def gate(orient, state):
    """h = krata w poprzek korytarza N-S (widać pręty od frontu), v = w poprzek korytarza E-W (widać z boku).
    Stany: open (tylko szczelina w posadzce), half (opada), closed."""
    def gen(p, r):
        img, I, F = Img(T, T), p.iron, p.floor
        if orient == 'h':
            if state != 'open':
                bottom = 16 if state == 'closed' else 9
                for bx in range(3, T, 8):
                    for y in range(2, bottom + 1):
                        img.put(bx, y, I[2]); img.put(bx + 1, y, I[1])
                for by in ((5, 12) if state == 'closed' else (5,)):
                    for x in range(T):
                        img.put(x, by, I[2]); img.put(x, by + 1, I[0])
            outline(img, p.outline)
            for x in range(T):  # szczelina w posadzce
                if not img.get(x, 17)[3]: img.put(x, 17, p.outline)
                if not img.get(x, 18)[3]: img.put(x, 18, F[0])
        else:
            if state != 'open':
                for y in range(T):
                    tip = y % 8 in (3, 4)
                    if state == 'closed' or tip:
                        for x in range(14, 18):
                            img.put(x, y, I[2] if tip else (I[1] if x < 16 else I[0]))
            outline(img, p.outline)
            for y in range(T):
                for x, c in ((13, p.outline), (18, F[0])):
                    if not img.get(x, y)[3]: img.put(x, y, c)
        return img
    return gen


# ---------------- duże elementy podłogi (2x2) ----------------
def seal(p, r):
    W, G, F = p.wall_top, p.accent, p.floor
    img = floor_slabs(p, r, grid_slabs(64, 64), 64, 64)
    cx = cy = 32
    for y in range(64):
        for x in range(64):
            dx, dy = x + .5 - cx, y + .5 - cy
            d = (dx * dx + dy * dy) ** .5
            if 25 <= d < 28: img.put(x, y, W[2] if d >= 27 else W[3])
            elif 23.5 <= d < 25: img.put(x, y, G[1] if dy < 6 else G[0])
            elif d < 23.5 and img.get(x, y) == F[0]: img.put(x, y, F[1])
            if d < 23.5 and abs(abs(dx) - abs(dy)) < 1 and 6 < d < 20: img.put(x, y, G[0])
            if d < 6: img.put(x, y, W[3] if d > 4.5 else (G[1] if d > 2 else G[2]))
    img.put(31, 29, G[3]); img.put(32, 28, G[3])
    for a in range(0, 360, 45):
        x, y = int(cx + 26 * math.sin(math.radians(a))), int(cy - 26 * math.cos(math.radians(a)))
        img.put(x, y, W[4]); img.put(x - 1, y, W[4])
    for a in (40, 200, 300):  # wytarte przerwy w złotym pierścieniu
        for k in range(-3, 4):
            ang = math.radians(a + k * 2)
            for rr in (23.6, 24.4):
                img.put(int(cx + rr * math.sin(ang)), int(cy - rr * math.cos(ang)), F[1])
    crack(img, r, 8, 10, 30, 1, 1, F[0], F[4])
    crack(img, r, 56, 40, 18, -1, 1, F[0], F[4])
    return img


def stairs(open_):
    def gen(p, r):
        W, G, I, O = p.wall_top, p.accent, p.iron, p.outline
        img = floor_slabs(p, r, grid_slabs(64, 64), 64, 64)
        x0, x1, y0, y1 = 6, 58, 4, 60
        for y in range(y0, y1):
            for x in range(x0, x1):
                img.put(x, y, W[2])
        for x in range(x0, x1):
            img.put(x, y0, O); img.put(x, y0 + 1, W[4]); img.put(x, y1 - 1, O); img.put(x, y1 - 2, W[1])
        for y in range(y0, y1):
            img.put(x0, y, O); img.put(x0 + 1, y, W[3]); img.put(x1 - 1, y, O); img.put(x1 - 2, y, W[1])
        for (x, y) in ((x0, y0), (x1 - 1, y0), (x0, y1 - 1), (x1 - 1, y1 - 1)):
            img.put(x, y, p.floor[1])
        sx0, sx1, sy0, steps, sh = 11, 53, 9, 6, 8  # stopnie w górę ku północy => wyższe jaśniejsze
        for i in range(steps):
            yt = sy0 + i * sh
            tread = W[4] if i == 0 else (W[3] if i < 3 else W[2])
            riser = W[1] if i < 3 else W[0]
            for y in range(yt, yt + sh):
                ly = y - yt
                for x in range(sx0, sx1):
                    c = tread if ly < 5 else riser
                    if ly == 0: c = W[5] if i < 2 else W[4]
                    if ly == 5: c = W[0]
                    img.put(x, y, c)
            for (x, y) in ((sx0 + 7 + i * 3, yt + 2), (sx1 - 9 - i * 2, yt + 3)):
                img.put(x, y, W[1])
        for y in range(sy0, sy0 + steps * sh):
            img.put(sx0 - 1, y, W[0]); img.put(sx0 - 2, y, W[1]); img.put(sx1, y, W[0]); img.put(sx1 + 1, y, W[0])
        img.put(sx0, sy0 + 2 * sh, W[0]); img.put(sx1 - 1, sy0 + 4 * sh + 1, W[0]); img.put(sx1 - 2, sy0 + 4 * sh, W[0])
        for (x, y) in ((8, 14), (8, 30), (8, 46), (55, 14), (55, 30), (55, 46)):  # runy na obramowaniu
            for k in range(3):
                img.put(x, y + k, G[2] if open_ else G[0])
            if open_: img.put(x, y + 1, G[3])
        if not open_:  # żelazne pręty i pieczęć
            for bx in range(sx0 + 3, sx1, 7):
                for y in range(sy0 - 2, sy0 + steps * sh):
                    img.put(bx, y, O); img.put(bx + 1, y, I[1] if y % 8 == 0 else I[0])
            for by in (sy0 + 10, sy0 + 34):
                for x in range(sx0, sx1):
                    img.put(x, by, O); img.put(x, by + 1, I[1]); img.put(x, by + 2, I[0])
            for y in range(20, 40):
                for x in range(22, 42):
                    d = ((x + .5 - 32) ** 2 + (y + .5 - 30) ** 2) ** .5
                    if d < 9: img.put(x, y, O if d > 8 else (G[1] if d > 6.5 else (G[0] if d > 3 else G[1])))
            for (x, y) in ((31, 28), (32, 29), (31, 30), (32, 31)):
                img.put(x, y, G[2])
        else:
            for x in range(sx0 + 4, sx1 - 4, 6):
                img.put(x, sy0, G[2])
        return img
    return gen


# ---------------- rekwizyty (przezroczyste, z obrysem) ----------------
def pillar(kind):
    def gen(p, r):
        W, img = p.wall_top, Img(T, T)
        for y in range(3, 29):
            for x in range(3, 29):
                c = W[2]
                if y == 3 or x == 3: c = W[3]
                if y == 4 and 4 <= x <= 27: c = W[4]
                if y == 28 or x == 28: c = W[1]
                if y == 27 and x > 3 and c == W[2]: c = W[1]
                img.put(x, y, c)
        for (x, y) in ((5, 5), (26, 5), (5, 26), (26, 26)):
            img.put(x, y, W[1])

        def cap(dx, dy, d):
            if d > 10: return W[1] if dx + dy > 2 else W[4]
            if 9 < d <= 10: return W[1] if dx + dy > 0 else W[3]
            if 6 < d <= 7: return W[1]
            if d <= 2.2: return W[5] if dy < 0 else W[2]
            if d <= 6: return W[4] if dy < -1 else W[3]
            return W[4] if dy < -3 else (W[3] if dy < 4 else W[2])
        disc(img, 16, 16, 11, cap)
        if kind == 'cracked':
            crack(img, r, 9, 6, 22, 1, 1, W[0], W[4], keep=lambda x, y: bool(img.get(x, y) and img.get(x, y)[3]))
            for (x, y) in ((3, 3), (4, 3), (3, 4), (28, 27), (28, 28), (27, 28), (26, 28)):
                img.put(x, y, CLR)
        if kind == 'stump':  # złamany trzon: chropowaty przekrój, brak narożników cokołu
            for y in range(T):
                for x in range(T):
                    if (x < 9 and y > 20) or (x > 23 and y < 8) or (x + y > 52):
                        img.put(x, y, CLR)

            def rough(dx, dy, d):
                v = r.random()
                if d > 9.5: return W[1]
                return W[4] if v < .15 else (W[3] if v < .55 else (W[2] if v < .85 else W[1]))
            disc(img, 16, 15, 10.5, rough)
            crack(img, r, 12, 10, 10, 1, 1, W[0], W[4], keep=lambda x, y: ((x - 16) ** 2 + (y - 15) ** 2) < 90)
            for (px, py, s) in ((3, 24, 2), (8, 27, 3), (25, 22, 2), (27, 6, 1), (2, 13, 1)):
                pebble(img, px, py, s, W)
        outline(img, p.outline)
        return img
    return gen


def rubble_prop(p, r):
    W, img = p.wall_top, Img(T, T)
    chunks = sorted([(r.randint(5, T - 10), r.randint(6, T - 10), r.choice([3, 4, 5, 5, 6])) for _ in range(9)],
                    key=lambda c: c[1])
    for (x, y, s) in chunks:
        sh = r.randint(-1, 1)
        for yy in range(s):
            for xx in range(s + 2):
                if (xx == 0 or xx == s + 1) and (yy == 0 or yy == s - 1):
                    continue
                c = W[3] if yy == 0 else (W[1] if yy >= s - 1 else W[2])
                if xx == s + 1 and yy > 0: c = W[1]
                img.put(x + xx + sh, y + yy, c)
        img.put(x + 1 + sh, y, W[4])
    for _ in range(6):
        pebble(img, r.randint(2, T - 4), r.randint(2, T - 4), 1, W)
    outline(img, p.outline)
    return img


def bones(p, r):
    B, O, img = p.bone, p.outline, Img(T, T)
    for y in range(8, 22):  # czaszka z góry, oczodoły na południe
        for x in range(6, 18):
            dx, dy = (x + .5 - 12) / 6, (y + .5 - 14) / 7
            if dx * dx + dy * dy <= 1:
                yy = y - 14
                img.put(x, y, B[2] if yy < -2 else (B[1] if yy < 3 else B[0]))
    for (x, y) in ((8, 15), (9, 15), (8, 16), (9, 16), (14, 15), (15, 15), (14, 16), (15, 16)):
        img.put(x, y, O)
    img.put(11, 18, B[0]); img.put(12, 18, B[0])
    for x in range(8, 16):
        img.put(x, 20, B[2] if x % 2 else B[0])
    img.put(10, 10, B[2]); img.put(11, 9, B[2])
    img.put(11, 12, B[0]); img.put(12, 13, B[0])
    for i in range(14):  # kość udowa po skosie
        x, y = 15 + i, 26 - i // 2
        img.put(x, y, B[2]); img.put(x, y + 1, B[1]); img.put(x, y + 2, B[0])
    for (x, y) in ((14, 25), (14, 27), (29, 18), (29, 20)):
        img.put(x, y, B[1])
    for (x, y) in ((22, 7), (23, 8), (24, 9), (24, 10)):
        img.put(x, y, B[1]); img.put(x, y + 1, B[0])
    for (x, y) in ((4, 26), (5, 27), (6, 27)):
        img.put(x, y, B[1])
    outline(img, O)
    return img


def fallen_pillar(p, r):
    W, img = p.wall_top, Img(2 * T, T)
    bands = [W[4]] * 2 + [W[3]] * 4 + [W[2]] * 6 + [W[1]] * 4
    for x in range(8, 58):
        for i, c in enumerate(bands):
            if x in (8, 9) and i in (0, 15):
                continue
            img.put(x, 8 + i, c)
    for x in range(10, 57):  # żłobkowanie
        if img.get(x, 12) == W[3]: img.put(x, 12, W[2])
        img.put(x, 18, W[1])
    for jx in (22, 38):
        for y in range(8, 24): img.put(jx, y, W[0] if y > 11 else W[1])
        for y in range(9, 23): img.put(jx + 1, y, W[4] if y < 12 else W[3])
    for y in range(8, 24):  # przekrój z lewej
        for x in range(3, 10):
            dx, dy = (x + .5 - 8) / 4.5, (y + .5 - 16) / 8
            if dx * dx + dy * dy <= 1:
                d = (dx * dx + dy * dy) ** .5
                img.put(x, y, W[3] if d > .75 else (W[4] if d < .3 else W[2]))
    for y in range(8, 24):  # poszarpany koniec z prawej
        cut = 54 + r.randint(0, 4)
        for x in range(cut, 62): img.put(x, y, CLR)
        img.put(cut - 1, y, W[3] if r.random() < .5 else W[4])
    crack(img, r, 30, 9, 12, 1, 1, W[0], W[4], keep=lambda x, y: 9 <= y <= 22)
    pebble(img, 58, 25, 2, W); pebble(img, 61, 19, 1, W); pebble(img, 4, 26, 1, W)
    outline(img, p.outline)
    return img


# ---------------- pochodnie (krok 19a) ----------------
TORCH_FLAME_BASE_Y = 13  # wiersz, w którym płomień styka się z głowicą pochodni (ten sam kafel co uchwyt)


def torch_sconce(p, r):
    """Uchwyt pochodni na licu muru: żelazna obejma na licu, drewniany trzon wystający przed mur.
    W Grzybni (krok 28a): trzon grzyba-latarni wyrastający z lica — świecący kapelusz to „płomień”."""
    if 'fungus' in BIOMES[BIOME]['extras']:
        return lantern_stalk(p, r)
    img, I, D = Img(T, T), p.iron, p.dirt
    for y in range(25, 30):  # obejma na licu (lico zajmuje wiersze 24–31)
        for x in range(13, 19):
            img.put(x, y, I[2] if y == 25 else (I[0] if y == 29 else I[1]))
    for y in range(TORCH_FLAME_BASE_Y + 2, 27):  # trzon
        img.put(15, y, D[4])
        img.put(16, y, D[3])
    for x in range(14, 18):  # owinięta głowica
        img.put(x, TORCH_FLAME_BASE_Y + 1, I[1])
        img.put(x, TORCH_FLAME_BASE_Y + 2, D[2])
    outline(img, p.outline)
    return img


def torch_flame(frame):
    """Płomień w 4 klatkach (6 kl./s): kołysanie i oddech ±1 px. Świeci, więc bez ciemnego obrysu.
    W Grzybni: świecący kapelusz grzyba-latarni, który powoli pulsuje."""
    sway = (0, 1, 0, -1)[frame]
    height = (10, 11, 10, 9)[frame]

    def gen(p, r):
        if 'fungus' in BIOMES[BIOME]['extras']:
            return lantern_cap(p, frame)
        img, Fl = Img(T, T), p.flame
        for i in range(height):  # i = 0 przy głowicy, rośnie ku górze
            t = i / max(1, height - 1)
            half = 3 if t < .35 else (2 if t < .7 else (1 if t < .9 else 0))
            cx = 16 + round(sway * t)
            y = TORCH_FLAME_BASE_Y - i
            for x in range(cx - half - 1, cx + half + 1):
                d = abs(x + .5 - cx)
                if half == 0:
                    c = Fl[1]
                elif d > half - .5:
                    c = Fl[0]
                elif d > half - 1.5:
                    c = Fl[1]
                else:
                    c = Fl[3] if t < .3 else Fl[2]
                img.put(x, y, c)
        return img
    return gen


def lantern_stalk(p, r):
    """Grzyb-latarnia (Grzybnia): kościsty trzon wyrasta z lica i wygina się przed mur, pod kapeluszem."""
    img, B = Img(T, T), p.bone
    for y in range(TORCH_FLAME_BASE_Y + 1, 30):
        x = 15 + (1 if y > 24 else 0)
        img.put(x, y, B[1])
        img.put(x + 1, y, B[0])
    # Strzępki u nasady (w licu) i mały boczny grzybek.
    for x, y in ((13, 28), (14, 29), (18, 29), (19, 28), (12, 27)):
        img.put(x, y, p.ash[1])
    for x, y, c in ((19, 22, B[2]), (20, 22, B[1]), (21, 22, B[0]), (20, 23, B[0])):
        img.put(x, y, c)
    outline(img, p.outline)
    return img


def lantern_cap(p, frame):
    """Świecący kapelusz grzyba-latarni: półelipsa z blaszkami, oddech ±1 px i jaśniejsze plamki (bez obrysu)."""
    Fl = p.flame
    img = Img(T, T)
    rx = (6, 6.5, 6, 5.5)[frame]
    ry = (5, 5.5, 5, 4.5)[frame]
    cx, base = 16, TORCH_FLAME_BASE_Y + .5
    for y in range(T):
        for x in range(T):
            nx, ny = (x + .5 - cx) / rx, (y + .5 - base) / ry
            if ny <= 0 and nx * nx + ny * ny <= 1:
                d = nx * nx + ny * ny
                img.put(x, y, Fl[0] if d > .7 else (Fl[1] if d > .35 else Fl[2]))
    for x in range(int(cx - rx) + 1, int(cx + rx)):  # blaszki pod kapeluszem
        img.put(x, TORCH_FLAME_BASE_Y + 1, Fl[0] if x % 2 else Fl[1])
    for dx, dy in ((-3, -2), (2, -3), (0, -4)):  # świecące plamki — najjaśniejszy ton, migają między klatkami
        if (dx + frame) % 3:
            img.put(cx + dx, TORCH_FLAME_BASE_Y + dy, Fl[3])
    return img


# ---------------- krok 19b: bruk, detale lica, łuki, pajęczyny, ślady walki ----------------
def cobble(p, r):
    """Bruk korytarza: nieregularne kamienie w siatce 8 px (krawędzie kafla zawsze w fudze, więc bez szwów).
    Ta sama rampa co płyty, żeby czytelność postaci (WCAG) była taka sama jak w pokojach."""
    F, img = p.floor, Img(T, T, p.floor[1])
    for cy in range(0, T, 8):
        for cx in range(0, T, 8):
            base = p.floor_alt if r.random() < .4 else F[2]
            w, h = 7 - r.randint(0, 1), 7 - r.randint(0, 1)
            for y in range(h):
                for x in range(w):
                    if x in (0, w - 1) and y in (0, h - 1):
                        continue  # zaokrąglone rogi kamienia
                    c = F[3] if (y == 0 or x == 0) else base
                    if (y == h - 1 or x == w - 1) and r.random() < .5:
                        c = F[1]
                    img.put(cx + 1 + x, cy + 1 + y, c)
            if r.random() < .5:
                img.put(cx + 2, cy + 2, F[4])
    for _ in range(6):  # drobny żwir w fugach
        img.put(r.randint(0, T - 1), r.randrange(0, T, 8), F[0])
    return img


def face_detail(kind):
    """Detale na licu muru (wiersze 24–31 kafla ściany z licem od południa). Przezroczyste nakładki."""
    def gen(p, r):
        img, I, O = Img(T, T), p.iron, p.outline
        fy = T - FACE
        if kind == 'banner':  # sztandar na drążku, spływa przez krawędź muru na lico
            for y in range(fy - 4, T - 1):
                for x in range(12, 20):
                    if y >= T - 3 and abs(x + .5 - 16) < (y - (T - 4)):
                        continue  # wcięcie w kształcie V u dołu
                    c = p.stain[1] if x < 18 else p.stain[0]
                    if y == fy - 3:
                        c = p.accent[1]
                    img.put(x, y, c)
            img.put(15, fy + 1, p.accent[2])
            img.put(16, fy + 1, p.accent[2])
            img.put(15, fy + 2, p.accent[1])
            outline(img, O)
            for x in range(10, 22):
                img.put(x, fy - 5, I[1])
        elif kind == 'grate':  # kratka odpływu
            for y in range(fy + 2, fy + 7):
                for x in range(11, 21):
                    edge = y in (fy + 2, fy + 6) or x in (11, 20)
                    if edge:
                        c = I[2] if y == fy + 2 else I[1]
                    else:
                        c = I[0] if x % 2 else O
                    img.put(x, y, c)
        elif kind == 'alcove':  # wnęka ze świecą
            for y in range(fy + 1, T - 1):
                for x in range(12, 20):
                    img.put(x, y, O if y > fy + 1 else p.wall_face[0])
            for y in range(fy + 4, T - 1):
                img.put(15, y, p.bone[1])
                img.put(16, y, p.bone[0])
            img.put(15, fy + 3, p.flame[2])
            img.put(16, fy + 3, p.flame[1])
            img.put(15, fy + 2, p.flame[3])
        elif kind == 'eggs':  # skupisko jaj przyklejone do lica (pajęcze leże); każde jajo z własnym obrysem
            B = p.bone
            for cx, cy, rx, ry in ((11.5, fy + 4.5, 2.2, 2.6), (16.5, fy + 3.5, 2.4, 2.9), (21.5, fy + 4.5, 2.0, 2.4)):
                egg = Img(T, T)
                for y in range(T):
                    for x in range(T):
                        nx, ny = (x + .5 - cx) / rx, (y + .5 - cy) / ry
                        if nx * nx + ny * ny <= 1:
                            egg.put(x, y, B[2] if nx + ny < -.6 else B[1] if nx + ny < .7 else B[0])
                outline(egg, O)
                img.blit(egg, 0, 0)
        elif kind == 'webdrape':  # pajęczyna zwisająca z krawędzi muru na lico: dwie nici i pasma
            for x in range(4, 29):
                t = (x - 4) / 24
                img.put(x, fy - 1 + round(4 * math.sin(math.pi * t)), p.ash[0])
                if 8 <= x <= 24:
                    img.put(x, fy + 1 + round(3 * math.sin(math.pi * (x - 8) / 16)), p.ash[0])
            for x in (6, 11, 16, 21, 26):
                for y in range(fy - 1, fy + 5 + (x % 3)):
                    if img.get(x, y) == CLR:
                        img.put(x, y, p.ash[1])
        elif kind == 'shelf':  # grzyby półkowe na licu (Grzybnia): trzy kościste półki, każda z obrysem
            B = p.bone
            for cx, cy, rx, ry in ((10.5, fy + 3.5, 4.2, 2.4), (18.5, fy + 2.5, 5.2, 2.8), (14.5, fy + 6, 3.4, 1.8)):
                cap = Img(T, T)
                for y in range(T):
                    for x in range(T):
                        nx, ny = (x + .5 - cx) / rx, (y + .5 - cy) / ry
                        if nx * nx + ny * ny <= 1 and ny > -.95:
                            cap.put(x, y, B[2] if ny < -.35 else (B[1] if ny < .45 else B[0]))
                outline(cap, O)
                img.blit(cap, 0, 0)
            img.put(18, fy + 1, p.flame[2])  # świecąca plamka zarodników
        elif kind == 'hyphae':  # strzępki zwisające z krawędzi muru na lico, ze świecącymi końcówkami
            for x, length in ((6, 5), (9, 7), (13, 4), (17, 8), (20, 5), (24, 6), (27, 3)):
                for i in range(length):
                    xx = x + (1 if i > length // 2 and x % 2 else 0)
                    img.put(xx, fy - 1 + i, p.ash[1] if i else p.ash[0])
                img.put(x + (1 if x % 2 else 0), fy - 1 + length, p.flame[2])
        elif kind == 'brick':  # wypadnięta cegła
            for y in range(fy + 1, fy + 3):
                for x in range(6, 12):
                    img.put(x, y, O)
            img.put(7, T - 2, p.wall_top[2])
            img.put(8, T - 2, p.wall_top[1])
        return img
    return gen


# ---------------- krok 32a: Cmentarzysko ----------------
def thick(img, x0, y0, x1, y1, w, col):
    """Gruba linia (kółka co pół piksela) — kości, kończyny, łachmany."""
    n = max(1, int(math.hypot(x1 - x0, y1 - y0) * 2))
    for i in range(n + 1):
        t = i / n
        cx, cy = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        for y in range(int(cy - w), int(cy + w) + 2):
            for x in range(int(cx - w), int(cx + w) + 2):
                if math.hypot(x + .5 - cx, y + .5 - cy) <= w / 2 + .2:
                    img.put(x, y, col)


def small_skull(img, p, cx, cy, rad=2.6):
    """Czaszka z góry (oczodoły na południe), dla nakładek i lic."""
    B = p.bone
    for y in range(int(cy - rad) - 1, int(cy + rad) + 2):
        for x in range(int(cx - rad) - 1, int(cx + rad) + 2):
            dx, dy = (x + .5 - cx) / rad, (y + .5 - cy) / (rad * 1.1)
            if dx * dx + dy * dy <= 1:
                img.put(x, y, B[2] if dy < -.3 else (B[1] if dy < .5 else B[0]))
    ey = int(cy + rad * .25)
    img.put(int(cx - rad * .45), ey, p.outline)
    img.put(int(cx + rad * .45), ey, p.outline)


def tiny_shroom(img, p, cx, base, rad=1.6):
    """Grzybek wyrastający ze zwłok: blady kapelusz i świecąca plamka grzybni (grzyb ledwo tu dociera)."""
    img.put(int(cx), int(base), p.bone[0])
    for x in range(int(cx - rad), int(cx + rad) + 1):
        img.put(x, int(base) - 1, p.bone[1])
    img.put(int(cx), int(base) - 2, p.bone[2])
    img.put(int(cx), int(base) - 1, p.mycel[1])


def grave_decal(kind):
    """Nakładki Cmentarzyska: płyty nagrobne, kości, zwłoki zatrutych, świeczki, nikła grzybnia."""
    def gen(p, r):
        W, D, O = p.wall_top, p.dirt, p.outline
        if kind == 'slab':  # płyta nagrobna w posadzce (1x2): krzyż wyryty w kamieniu, pęknięcie, zgnilizna u stóp
            img = Img(T, 2 * T)
            x0, x1, y0, y1 = 6, 25, 4, 59
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    c = W[4] if (x == x0 or y == y0) else (W[2] if (x == x1 or y == y1) else W[3])
                    img.put(x, y, c)
            for y in range(14, 41):  # wyryty krzyż: ciemny rowek z oświetloną krawędzią
                img.put(15, y, W[1])
                img.put(16, y, W[2])
            for x in range(10, 22):
                img.put(x, 21, W[1])
                img.put(x, 22, W[4] if x not in (15, 16) else W[1])
            for y in (46, 49, 52):  # zatarty napis
                for x in range(10, 22):
                    if r.random() < .6:
                        img.put(x, y, W[2])
            crack(img, r, 22, 8, 22, -1, 1, dark=W[1], lit=W[4], keep=lambda x, y: x0 < x < x1 and y0 < y < y1)
            for y in range(52, 59):  # zgnilizna wsiąkająca od stóp
                for x in range(x0 + 1, x1):
                    if r.random() < (y - 50) / 14:
                        img.put(x, y, p.stain[0] if r.random() < .6 else p.stain[1])
            outline(img, O)
        elif kind in ('bones_a', 'bones_b'):  # rozrzucone kości: piszczele, żebra, mała czaszka
            img = Img(T, T)
            B = p.bone
            if kind == 'bones_a':
                thick(img, 6, 22, 16, 17, 1.6, B[1])
                img.put(5, 22, B[2])
                img.put(16, 16, B[2])
                for i in range(4):  # żebra
                    thick(img, 18, 8 + i * 3, 25, 10 + i * 3, 1.0, B[0] if i % 2 else B[1])
                small_skull(img, p, 11, 9)
            else:
                thick(img, 8, 9, 21, 13, 1.6, B[1])
                img.put(7, 9, B[2])
                img.put(22, 13, B[2])
                thick(img, 14, 24, 24, 20, 1.4, B[0])
                small_skull(img, p, 24, 26, 2.2)
            outline(img, O)
        elif kind in ('corpse_a', 'corpse_b'):  # zwłoki zatrutego: łachmany, szarozielona skóra, kości, grzybki
            # Zawsze leżą w poprzek (2x1): z rzutu z góry ciało pionowe wyglądałoby jak stojąca postać.
            # b: zwinięte — nogi podkulone, ręka nad głową.
            curled = kind == 'corpse_b'
            horiz = True
            img = Img(2 * T, T)
            Fl, R = p.flesh, D

            def P(a, b):  # (wzdłuż ciała, w poprzek) -> (x, y)
                return (a, b)

            mid = 16
            for side in (-3, 3):  # nogi w łachmanach
                if curled:  # kolana podciągnięte w bok
                    knee = (44, mid + 8 + side * .5)
                    thick(img, 34, mid + side * .6, knee[0], knee[1], 3.2, R[2])
                    thick(img, knee[0], knee[1], 52, mid + 2 + side * .8, 3.0, R[1])
                    img.put(53, int(mid + 2 + side * .8), p.bone[1])
                    continue
                ax, ay = P(34, mid + side * .6)
                bx, by = P(55, mid + side + (1 if side > 0 else -2))
                thick(img, ax, ay, bx, by, 3.2, R[2])
                fx, fy = P(57, mid + side + (1 if side > 0 else -2))
                img.put(int(fx), int(fy), p.bone[1])
            for a in range(14, 36):  # tułów: podarty łachman
                for b in range(mid - 6, mid + 7):
                    if abs(b - mid) <= 6 - (2 if a < 17 or a > 33 else 0):
                        x, y = P(a, b)
                        img.put(x, y, R[3] if b < mid - 2 else (R[2] if b < mid + 3 else R[1]))
            for a in range(20, 30, 3):  # dziury w łachmanie: żebra
                for b in range(mid - 3, mid + 3):
                    x, y = P(a, b)
                    img.put(x, y, p.bone[1] if (b - mid) % 2 else Fl[0])
            # ręce: jedna wzdłuż ciała, druga wyciągnięta (upadł, czołgając się)
            ax, ay = P(18, mid + 7)
            bx, by = P(31, mid + 9)
            thick(img, ax, ay, bx, by, 2.0, Fl[1])
            reach = (3, mid + 9) if curled else (5, mid - 11)  # b: ręka nad głową, a: wyciągnięta naprzód
            ax, ay = P(16, mid + 6) if curled else P(16, mid - 6)
            thick(img, ax, ay, reach[0], reach[1], 2.0, Fl[1])
            img.put(reach[0] - 1, reach[1] + (1 if curled else -1), p.bone[2])
            cx, cy = P(9, mid)  # głowa: wpół zgniła — skóra z odsłoniętą czaszką
            for y in range(int(cy) - 5, int(cy) + 6):
                for x in range(int(cx) - 5, int(cx) + 6):
                    dx, dy = x + .5 - cx, y + .5 - cy
                    if dx * dx + dy * dy <= 20:
                        img.put(x, y, Fl[2] if dx + dy < -3 else (Fl[1] if dx + dy < 2 else Fl[0]))
            small_skull(img, p, cx + (1 if horiz else 0), cy + (0 if horiz else 1), 2.4)
            outline(img, O)
            for _ in range(70):  # plama rozkładu pod ciałem (bez obrysu, wsiąka w posadzkę)
                x, y = P(r.uniform(12, 40), r.uniform(mid - 10, mid + 10))
                if img.get(int(x), int(y)) == CLR:
                    img.put(int(x), int(y), p.stain[0])
            for _ in range(3):  # grzybnia ledwo dociera: kilka strzępek od ciała
                a, b = r.uniform(18, 34), mid + r.choice((-7, 7))
                ang = r.uniform(0, math.tau)
                for i in range(r.randint(5, 9)):
                    ang += r.uniform(-.5, .5)
                    a += math.cos(ang)
                    b += math.sin(ang)
                    x, y = P(a, b)
                    if img.get(int(x), int(y)) == CLR:
                        img.put(int(x), int(y), p.mycel[0])
            for a, b in ((22, mid - 3), (29, mid + 2), (13, mid + 4))[: 3 if curled else 2]:  # grzybki na łachmanie
                x, y = P(a, b)
                tiny_shroom(img, p, x, y)
        elif kind in ('candles_a', 'candles_b'):  # świeczki wotywne: wosk, rozlany wosk, płomyk
            img = Img(T, T)
            spots = [(10, 20, 6), (15, 22, 4), (21, 19, 5)] if kind == 'candles_a' else [(12, 14, 4), (19, 24, 6)]
            for cx, base, h in spots:
                for x in range(cx - 2, cx + 3):
                    img.put(x, base + 1, p.bone[0])
                c = Img(T, T)
                for y in range(base - h, base + 1):
                    c.put(cx, y, p.bone[2])
                    c.put(cx + 1, y, p.bone[1])
                outline(c, O)
                img.blit(c, 0, 0)
                img.put(cx, base - h - 1, p.flame[2])
                img.put(cx, base - h - 2, p.flame[3])
                img.put(cx + 1, base - h - 1, p.flame[1])
        elif kind in ('mycel_faint_a', 'mycel_faint_b'):  # nikła grzybnia: 1–2 cienkie strzępki, świecąca końcówka
            img = Img(T, T)
            for _ in range(1 if kind.endswith('a') else 2):
                x, y = r.uniform(6, 26), r.uniform(6, 26)
                ang = r.uniform(0, math.tau)
                for i in range(r.randint(8, 13)):
                    ang += r.uniform(-.6, .6)
                    x, y = x + math.cos(ang), y + math.sin(ang)
                    if 1 <= x < T - 1 and 1 <= y < T - 1:
                        img.put(int(x), int(y), p.mycel[0])
                img.put(min(T - 2, max(1, int(x))), min(T - 2, max(1, int(y))), p.mycel[1])
        else:
            raise ValueError(kind)
        return img
    return gen


def grave_face(kind):
    """Detale lica muru Cmentarzyska (wiersze 24–31): nisze grobowe, epitafia, czaszki kostnicy."""
    def gen(p, r):
        img, O, W = Img(T, T), p.outline, p.wall_top
        fy = T - FACE
        if kind == 'niche':  # loculus: ciemna wnęka, w środku czaszka i kości
            for y in range(fy + 1, T - 1):
                for x in range(9, 23):
                    img.put(x, y, O if y > fy + 1 else p.wall_face[0])
            small_skull(img, p, 13, T - 4, 2.2)
            for x in range(17, 22):
                img.put(x, T - 3, p.bone[1])
            img.put(21, T - 4, p.bone[2])
        elif kind == 'epitaph':  # tablica z zatartym napisem
            for y in range(fy + 1, T - 1):
                for x in range(8, 24):
                    img.put(x, y, W[4] if y == fy + 1 else (W[3] if y < T - 2 else W[2]))
            for y in (fy + 3, fy + 5):
                for x in range(10, 22):
                    if r.random() < .7:
                        img.put(x, y, W[1])
            outline(img, O)
        elif kind == 'skulls':  # kostnica: rząd czaszek we wnęce
            for y in range(fy + 1, T - 1):
                for x in range(5, 27):
                    img.put(x, y, O)
            for cx in (9, 16, 23):
                small_skull(img, p, cx, fy + 4, 2.6)
        return img
    return gen


def infernal_decal(kind):
    """Nakładki piekła (krok 41a): żarzące się szczeliny, krew, demoniczna pieczęć (2x2)."""
    def gen(p, r):
        E, S = p.ember, p.stain
        if kind in ('ember_a', 'ember_b'):  # szczelina z żarem: ciemny brzeg, czerwień, pomarańczowy rdzeń
            img = Img(T, T)
            x, y = (5, 9) if kind == 'ember_a' else (6, 24)
            dx, dy = (1, .55) if kind == 'ember_a' else (1, -.6)
            pts = []
            for i in range(22):
                x += dx + r.uniform(-.2, .2)
                y += dy + r.uniform(-.9, .9)
                pts.append((int(x), int(y)))
            for i, (px, py) in enumerate(pts):
                hot = 6 < i < 16
                img.put(px, py + 1, p.floor[0])  # cień pod szczeliną
                img.put(px, py, E[2] if hot and i % 3 == 0 else (E[1] if hot else E[0]))
                if hot:
                    img.put(px, py - 1, E[0])
            # żar nie ma ciemnego obrysu (świeci, STYLEGUIDE §6b)
        elif kind in ('blood_a', 'blood_b'):  # plama krwi z kroplami
            img = Img(T, T)
            cx, cy, rad = (15, 17, 6.5) if kind == 'blood_a' else (17, 14, 5)
            for yy in range(T):
                for xx in range(T):
                    d = math.hypot(xx + .5 - cx, (yy + .5 - cy) * 1.25)
                    a = math.atan2(yy - cy, xx - cx)
                    reach = rad * (1 + .18 * math.sin(4 * a + r.uniform(0, .5)))
                    if d < reach:
                        img.put(xx, yy, S[1] if d < reach * .65 else S[0])
            for _ in range(5):
                a, d = r.uniform(0, math.tau), r.uniform(rad + 2, rad + 6)
                img.put(int(cx + math.cos(a) * d), int(cy + math.sin(a) * d), S[0])
            img.put(int(cx) - 2, int(cy) - 2, S[1])
        elif kind == 'sigil':  # pieczęć 2x2: krąg i pentagram wyryte krwią, żar w wierzchołkach
            img = Img(2 * T, 2 * T)
            c, rad = T, 26
            for i in range(720):
                a = i / 720 * math.tau
                img.put(int(c + math.cos(a) * rad), int(c + math.sin(a) * rad), S[1])
                img.put(int(c + math.cos(a) * (rad - 3)), int(c + math.sin(a) * (rad - 3)), S[0])
            star = [(c + math.cos(math.radians(-90 + k * 144)) * (rad - 3), c + math.sin(math.radians(-90 + k * 144)) * (rad - 3))
                    for k in range(6)]
            for (x0, y0), (x1, y1) in zip(star, star[1:]):
                n = int(math.hypot(x1 - x0, y1 - y0) * 2)
                for i in range(n + 1):
                    t = i / n
                    img.put(int(x0 + (x1 - x0) * t), int(y0 + (y1 - y0) * t), S[1])
            for x0, y0 in star[:5]:
                img.put(int(x0), int(y0), E[2])
                for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    img.put(int(x0) + ox, int(y0) + oy, E[1])
        return img
    return gen


def infernal_face(kind):
    """Detale lica muru piekła: okowy na łańcuchach, czaszka na kolcu, szczelina z żarem."""
    def gen(p, r):
        img, O, I = Img(T, T), p.outline, p.iron
        fy = T - FACE
        if kind == 'chains':  # dwa łańcuchy z okowami zwisające z kółek
            for cx in (10, 21):
                img.put(cx, fy, I[2])
                for y in range(fy + 1, T - 2):
                    img.put(cx, y, I[1] if y % 2 else I[2])
                for x in range(cx - 2, cx + 3):
                    img.put(x, T - 2, I[1])
                img.put(cx - 2, T - 3, I[1])
                img.put(cx + 2, T - 3, I[1])
            outline(img, O)
        elif kind == 'skull_spike':  # czaszka nabita na żelazny kolec
            for y in range(fy, T - 1):
                img.put(16, y, I[1] if y > fy + 2 else I[2])
            small_skull(img, p, 16, fy + 4, 2.6)
            img.put(16, fy + 1, p.stain[1])
            img.put(17, fy + 7, p.stain[0])
            outline(img, O)
        elif kind == 'lava_seep':  # pęknięcie lica, przez które sączy się żar
            E = p.ember
            x = 15
            for y in range(fy, T):
                x += r.choice((-1, 0, 0, 1))
                img.put(x, y, E[1] if y > fy + 2 else E[0])
                if y > fy + 4:
                    img.put(x + 1, y, E[0])
            img.put(x, T - 1, E[2])
        return img
    return gen


def overgrow_infernal(e, img, p, r):
    """Piekło (krok 41a): pojedyncze rozżarzone drobiny w fugach posadzki, sadza zaciekająca lica murów."""
    if e.layer == 'floorBase':
        for y in range(img.h):
            for x in range(img.w):
                if img.get(x, y) == p.floor[1] and r.random() < .025:
                    img.put(x, y, p.ember[0])
    elif e.layer == 'wall':
        face_top = T - FACE if img.get(4, T - 1) == p.outline else T
        if face_top < T:
            for _ in range(r.randint(0, 2)):
                x = r.randrange(3, T - 3)
                for y in range(face_top, face_top + r.randint(2, FACE - 2)):
                    if img.get(x, y) not in (None, p.outline, CLR):
                        img.put(x, y, p.deep[0])


def overgrow_grave(e, img, p, r):
    """Cmentarzysko (krok 32a): grzyb ledwo dociera — rzadkie strzępki w fugach podłogi, zacieki zgnilizny
    na licach murów. Dużo skromniej niż w Grzybni."""
    if e.layer == 'floorBase':
        for y in range(img.h):
            for x in range(img.w):
                if img.get(x, y) == p.floor[1] and r.random() < .04:
                    img.put(x, y, p.mycel[0])
    elif e.layer == 'wall':
        face_top = T - FACE if img.get(4, T - 1) == p.outline else T
        if face_top < T:
            for _ in range(r.randint(0, 2)):
                x = r.randrange(3, T - 3)
                for y in range(face_top, face_top + r.randint(2, FACE - 2)):
                    if img.get(x, y) not in (None, p.outline, CLR):
                        img.put(x, y, p.stain[0])


def arch(p, r):
    """Nadproże łuku nad przejściem szerokości 2 kafli: wierzch muru i lico z łukowatą dolną krawędzią.
    Rysowane nad postaciami (overheadDecor) — przejście pod nim zostaje czytelne."""
    W, Fc, O, img = p.wall_top, p.wall_face, p.outline, Img(2 * T, T)
    for y in range(9):
        off = 8 if (y // 4) % 2 else 0
        for x in range(2 * T):
            if y % 4 == 0 or (x + off) % 16 == 0:
                c = W[1]
            else:
                c = W[3] if y % 4 == 1 else W[2]
            img.put(x, y, c)
    for x in range(2 * T):
        img.put(x, 0, O)
        img.put(x, 1, W[4])
        t = (x + .5 - T) / T  # −1..1 przez szerokość łuku
        bottom = 14 + round(8 * (1 - (1 - t * t) ** .5))  # wyżej w środku, niżej przy filarach
        for y in range(9, bottom):
            if y == 9 or (x + (6 if y > 12 else 0)) % 12 == 0:
                c = Fc[0]
            else:
                c = Fc[2] if y in (10, 13) else Fc[1]
            img.put(x, y, c)
        img.put(x, bottom, O)
    return img


def cobweb(corner):
    """Pajęczyna w górnym narożniku pokoju (nad postaciami). Cienkie nici, bez wypełnienia."""
    def gen(p, r):
        img = Img(T, T)
        for a in (0, 22, 45, 68, 90):
            for d in range(17):
                img.put(round(d * math.cos(math.radians(a))), round(d * math.sin(math.radians(a))), p.bone[0])
        for rad in (5, 9, 13):
            for a in range(0, 91, 4):
                x, y = round(rad * math.cos(math.radians(a))), round(rad * math.sin(math.radians(a)))
                if img.get(x, y) == CLR:
                    img.put(x, y, p.ash[0])
        if corner == 'ne':
            img.p = [list(reversed(row)) for row in img.p]
        return img
    return gen


def combat_mark(kind):
    """Trwałe ślady walki (pula w grze, najstarsze znikają): plama, przypalenie, szlam."""
    def gen(p, r):
        img = Img(T, T)
        if kind == 'splat':
            stain(img, p, r, 16, 16, r.uniform(4.5, 6))
            for _ in range(5):
                img.put(r.randint(7, 24), r.randint(7, 24), p.stain[0])
        elif kind == 'scorch':
            for y in range(T):
                for x in range(T):
                    dx, dy = x + .5 - 16, y + .5 - 16
                    d = (dx * dx + dy * dy) ** .5
                    reach = 8 + 3 * math.sin(math.atan2(dy, dx) * 5 + r.uniform(-.3, .3))
                    # Sadza: ciepłe brązy rampy błota (chłodna szczelina podłogi wyglądała jak niebieski pająk).
                    if d < reach * .45:
                        img.put(x, y, p.dirt[1])
                    elif d < reach * .75:
                        img.put(x, y, p.dirt[2] if r.random() < .8 else p.dirt[1])
                    elif d < reach and r.random() < .55:
                        img.put(x, y, p.dirt[3])
            for _ in range(5):
                img.put(r.randint(8, 23), r.randint(8, 23), p.ash[0])
        elif kind == 'slime':
            S = p.slime
            for y in range(T):
                for x in range(T):
                    d = ((x + .5 - 16) ** 2 + ((y + .5 - 16) * 1.35) ** 2) ** .5
                    if d < 6.5 + r.uniform(-1, 1):
                        img.put(x, y, S[2] if d < 4 else S[1])
            img.put(14, 14, S[3])
            img.put(15, 14, S[4])
            for _ in range(3):
                x, y = r.randint(6, 25), r.randint(8, 24)
                img.put(x, y, S[1])
                img.put(x + 1, y, S[2])
            outline(img, S[0])
        return img
    return gen


def trail_decal(kind):
    """Ślady wleczenia i krwi prowadzące do areny bossa (krok 54): smuga przez cały kafel (łączy się z sąsiednimi)
    albo ciąg kropli. Kolor to płyn biomu (`stain`): zaschnięta krew, ichor, grzybnia — bez nowych barw."""
    def gen(p, r):
        S = p.stain
        img = Img(T, T)
        if kind[0] in 'hv':
            thick = 3 if kind.endswith('a') else 5
            phase = r.choice((-1, 1))
            raw = Img(T, T)
            gaps = {r.randint(4, 26) for _ in range(2)}
            for x in range(T):
                yc = 16 + int(round(1.6 * phase * math.sin(2 * math.pi * x / (T - 1))))
                for dy in range(-(thick // 2), thick // 2 + 1):
                    if any(abs(x - g) <= 1 for g in gaps) and abs(dy) == thick // 2:
                        continue  # przerwy: smuga „przerywa” tam, gdzie ciało uniosło się nad ziemię
                    raw.put(x, yc + dy, S[1] if abs(dy) < thick // 2 or thick == 3 else S[0])
            for _ in range(4):  # rozbryzgi obok smugi
                raw.put(r.randint(2, T - 3), 16 + r.choice((-1, 1)) * r.randint(thick // 2 + 2, thick // 2 + 5), S[0])
            for y in range(T):
                for x in range(T):
                    c = raw.get(x, y)
                    if c and c[3]:
                        img.put(x, y, c) if kind[0] == 'h' else img.put(y, x, c)
        else:  # krople: ciąg 5 plamek po lekkim łuku, od większych do mniejszych
            ox, oy = r.randint(2, 6), r.randint(8, 22)
            for i in range(5):
                cx, cy = ox + i * 6 + r.randint(-1, 1), oy + int(3 * math.sin(i * 1.3)) + r.randint(-1, 1)
                rad = 2.4 - i * .3
                for yy in range(T):
                    for xx in range(T):
                        d = math.hypot(xx + .5 - cx, (yy + .5 - cy) * 1.2)
                        if d < rad:
                            img.put(xx, yy, S[1] if d < rad * .55 else S[0])
        return img
    return gen


# ---------------- manifest ----------------
@dataclass(frozen=True)
class Entry:
    name: str
    gen: object
    layer: str
    w: int = 1
    h: int = 1
    group: str = None
    weight: float = 0
    flip_x: bool = False


WALL_COMMON = (7, 11, 13, 14)  # ~82% widocznych ścian na wygenerowanych mapach (pomiar, krok 16)


def manifest():
    m = []
    for name, style, weight in (('floor_slab16_a', 'slab16', 10), ('floor_slab16_b', 'slab16', 10),
                                ('floor_slab16_c', 'slab16', 10), ('floor_slab32_a', 'slab32', 4),
                                ('floor_slab32_b', 'slab32', 4), ('floor_mixed_h', 'mixed_h', 5),
                                ('floor_mixed_v', 'mixed_v', 5), ('floor_worn', 'worn', 3)):
        m.append(Entry(name, floor_base(style), 'floorBase', group='floor', weight=weight, flip_x=True))
    for name, style in (('floor_macro_a_2x2', 'macro_a'), ('floor_macro_b_2x2', 'macro_b')):
        m.append(Entry(name, floor_base(style), 'floorBase', 2, 2, group='floorMacro', weight=1, flip_x=True))
    for kind, group, weight, w, h in (('crack_a', 'decal.crack', 3, 1, 1), ('crack_b', 'decal.crack', 3, 1, 1),
                                      ('crack_c', 'decal.crack', 3, 1, 1), ('crack_2x1', 'decal.crackLong', 1, 2, 1),
                                      ('crack_1x2', 'decal.crackLong', 1, 1, 2), ('broken_a', 'decal.broken', 1, 1, 1),
                                      ('broken_b', 'decal.broken', 1, 1, 1), ('rubble', 'decal.rubble', 1, 1, 1),
                                      ('stain_a', 'decal.stain', 1, 1, 1), ('stain_b', 'decal.stain', 1, 1, 1),
                                      ('debris_a', 'decal.debris', 1, 1, 1), ('debris_b', 'decal.debris', 1, 1, 1),
                                      ('dust_n', 'decal.dustN', 1, 1, 1), ('dust_w', 'decal.dustW', 1, 1, 1),
                                      ('dust_e', 'decal.dustE', 1, 1, 1)):
        suffix = f'_{w}x{h}' if (w, h) != (1, 1) and not kind.endswith(f'{w}x{h}') else ''
        m.append(Entry(f'decal_{kind}{suffix}', decal(kind), 'floorDecal', w, h, group=group, weight=weight,
                       flip_x=not kind.startswith('dust')))
    for mask in range(16):
        m.append(Entry(f'wall_{mask:02d}', wall_tile(mask), 'wall', group=f'wall.{mask}', weight=60))
    for mask in WALL_COMMON:
        m.append(Entry(f'wall_{mask:02d}_b', wall_tile(mask), 'wall', group=f'wall.{mask}', weight=30))
        m.append(Entry(f'wall_{mask:02d}_crack', wall_tile(mask, 'crack'), 'wall', group=f'wall.{mask}', weight=6))
        m.append(Entry(f'wall_{mask:02d}_chunk', wall_tile(mask, 'chunk'), 'wall', group=f'wall.{mask}', weight=4))
    for suffix, dmg, weight in (('b', None, 30), ('crack', 'crack', 4), ('chunk', 'chunk', 3), ('ash', 'ash', 4)):
        m.append(Entry(f'wall_15_{suffix}', wall_tile(15, dmg), 'wall', group='wall.15', weight=weight))
    for diag in range(1, 16):
        m.append(Entry(f'wall_15_d{diag:02d}', wall_tile(15, diag=diag), 'wall', group='wallDiag'))
    for band in ('fade', 'deep'):
        for v in ('a', 'b'):
            m.append(Entry(f'wall_{band}_{v}', wall_band(band), 'wall', group=f'wallBand.{band}', weight=1))
    for mask in (1, 2, 3, 8, 9, 10, 11):
        m.append(Entry(f'shadow_{mask:02d}', env_shadow(mask), 'envShadow', group='envShadow'))
    for orient in ('h', 'v'):
        for state in ('open', 'half', 'closed'):
            m.append(Entry(f'gate_{orient}_{state}', gate(orient, state), 'gate', group=f'gate.{orient}'))
    m.append(Entry('stairs_sealed_2x2', stairs(False), 'floorFeature', 2, 2))
    m.append(Entry('stairs_open_2x2', stairs(True), 'floorFeature', 2, 2))
    m.append(Entry('seal_2x2', seal, 'floorFeature', 2, 2))
    m.append(Entry('torch_sconce', torch_sconce, 'wallDecor', group='torchSconce'))
    for v in ('a', 'b', 'c'):
        m.append(Entry(f'floor_cobble_{v}', cobble, 'floorBase', group='floorCobble', weight=1, flip_x=True))
    for kind, weight in (('banner', 2), ('grate', 2), ('alcove', 1), ('brick', 3)):
        m.append(Entry(f'face_{kind}', face_detail(kind), 'wallDecor', group='wallFace', weight=weight))
    m.append(Entry('arch_2x1', arch, 'overheadDecor', 2, 1, group='overhead.arch'))
    m.append(Entry('cobweb_nw', cobweb('nw'), 'overheadDecor', group='overhead.cobwebNW'))
    m.append(Entry('cobweb_ne', cobweb('ne'), 'overheadDecor', group='overhead.cobwebNE'))
    for kind in ('splat', 'scorch', 'slime'):
        for v in ('a', 'b'):
            m.append(Entry(f'combat_{kind}_{v}', combat_mark(kind), 'combatDecal', group=f'combat.{kind}',
                           weight=1, flip_x=True))
    for frame in range(4):
        m.append(Entry(f'torch_flame_{frame}', torch_flame(frame), 'fx', group='torchFlame'))
    for name, gen, w in (('pillar', pillar('intact'), 1), ('pillar_cracked', pillar('cracked'), 1),
                         ('pillar_stump', pillar('stump'), 1), ('fallen_pillar_2x1', fallen_pillar, 2),
                         ('rubble_a', rubble_prop, 1), ('rubble_b', rubble_prop, 1), ('bones', bones, 1)):
        m.append(Entry(name, gen, 'prop', w, 1, group='prop'))
    if 'spider' in BIOMES[BIOME]['extras']:
        # Pajęcze leże: dopisane na końcu (first-fit), więc nie przesuwają kafli wspólnych z ruinami.
        # Własna grupa lica: w leżu detale ruin (sztandary, wnęki) nie pasują.
        for kind, weight in (('eggs', 3), ('webdrape', 2)):
            m.append(Entry(f'face_{kind}', face_detail(kind), 'wallDecor', group='wallFace.lair', weight=weight))
        for v in ('a', 'b'):
            m.append(Entry(f'decal_husk_{v}', decal(f'husk_{v}'), 'floorDecal', group='decal.husk', weight=1,
                           flip_x=True))
    if 'fungus' in BIOMES[BIOME]['extras']:
        # Grzybnia (krok 28a): grzyby półkowe i strzępki na licu, kępki grzybów i grzybnia na podłodze.
        # Dopisane na końcu, więc kafle wspólne z leżem się nie przesuwają.
        for kind, weight in (('shelf', 3), ('hyphae', 2)):
            m.append(Entry(f'face_{kind}', face_detail(kind), 'wallDecor', group='wallFace.fungus', weight=weight))
        for kind, group in (('mushrooms_a', 'decal.mushrooms'), ('mushrooms_b', 'decal.mushrooms'),
                            ('mycel_a', 'decal.mycel'), ('mycel_b', 'decal.mycel'),
                            ('mold_a', 'decal.mold'), ('mold_b', 'decal.mold'), ('mold_c', 'decal.mold')):
            m.append(Entry(f'decal_{kind}', decal(kind), 'floorDecal', group=group, weight=1, flip_x=True))
        # Mury Grzybni bardziej zniszczone: pęknięte i wyszczerbione warianty losują się 4× częściej.
        m = [dataclasses.replace(e, weight=e.weight * 4)
             if e.layer == 'wall' and e.name.endswith(('_crack', '_chunk')) else e for e in m]
    if 'grave' in BIOMES[BIOME]['extras']:
        # Cmentarzysko (krok 32a): dopisane na końcu (first-fit), kafle wspólne z ruinami się nie przesuwają.
        for kind, weight in (('niche', 4), ('epitaph', 2), ('skulls', 2)):
            m.append(Entry(f'face_{kind}', grave_face(kind), 'wallDecor', group='wallFace.grave', weight=weight))
        m.append(Entry('decal_grave_slab_1x2', grave_decal('slab'), 'floorDecal', 1, 2, group='decal.graveSlab', weight=1))
        m.append(Entry('decal_corpse_2x1', grave_decal('corpse_a'), 'floorDecal', 2, 1, group='decal.corpse', weight=1,
                       flip_x=True))
        m.append(Entry('decal_corpse_b_2x1', grave_decal('corpse_b'), 'floorDecal', 2, 1, group='decal.corpse', weight=1,
                       flip_x=True))
        for kind, group in (('bones_a', 'decal.bones'), ('bones_b', 'decal.bones'),
                            ('candles_a', 'decal.candles'), ('candles_b', 'decal.candles'),
                            ('mycel_faint_a', 'decal.mycelFaint'), ('mycel_faint_b', 'decal.mycelFaint')):
            m.append(Entry(f'decal_{kind}', grave_decal(kind), 'floorDecal', group=group, weight=1, flip_x=True))
    if 'infernal' in BIOMES[BIOME]['extras']:
        # Piekło (krok 41a): dopisane na końcu (first-fit), kafle wspólne z ruinami się nie przesuwają.
        for kind, weight in (('chains', 3), ('skull_spike', 2), ('lava_seep', 2)):
            m.append(Entry(f'face_{kind}', infernal_face(kind), 'wallDecor', group='wallFace.infernal', weight=weight))
        m.append(Entry('decal_sigil_2x2', infernal_decal('sigil'), 'floorDecal', 2, 2, group='decal.sigil', weight=1))
        for kind, group in (('ember_a', 'decal.ember'), ('ember_b', 'decal.ember'),
                            ('blood_a', 'decal.blood'), ('blood_b', 'decal.blood')):
            m.append(Entry(f'decal_{kind}', infernal_decal(kind), 'floorDecal', group=group, weight=1, flip_x=True))
        for kind in ('bones_a', 'bones_b'):
            m.append(Entry(f'decal_{kind}', grave_decal(kind), 'floorDecal', group='decal.bones', weight=1, flip_x=True))
    # Ślady wleczenia i krwi ku arenie bossa (krok 54): na samym końcu (first-fit), nic się nie przesuwa.
    for kind, group in (('h_a', 'decal.trailH'), ('h_b', 'decal.trailH'), ('v_a', 'decal.trailV'), ('v_b', 'decal.trailV'),
                        ('drops_a', 'decal.trailDrop'), ('drops_b', 'decal.trailDrop')):
        m.append(Entry(f'decal_trail_{kind}', trail_decal(kind), 'floorDecal', group=group, weight=1, flip_x=True))
    return m


def seed_of(name):
    return zlib.crc32(f'{BIOME}/{name}'.encode())


def render_tiles(p):
    tiles = {}
    for e in manifest():
        img = e.gen(p, random.Random(seed_of(e.name)))
        if 'fungus' in BIOMES[BIOME]['extras']:  # Grzybnia: porost na podłodze i murach (osobne ziarno)
            overgrow(e, img, p, random.Random(seed_of(e.name + '/porost')))
        if 'grave' in BIOMES[BIOME]['extras']:  # Cmentarzysko: nikła grzybnia i zacieki zgnilizny
            overgrow_grave(e, img, p, random.Random(seed_of(e.name + '/porost')))
        if 'infernal' in BIOMES[BIOME]['extras']:  # Piekło: żar w fugach, sadza na licach
            overgrow_infernal(e, img, p, random.Random(seed_of(e.name + '/porost')))
        tiles[e.name] = img
    return tiles


def overgrow(e, img, p, r):
    """Grzybnia (krok 28): naleciałość na kaflach bazowych. Podłoga tylko delikatnie (pleśń w fugach, zarodniki,
    rzadkie świecące drobiny) — duże plamy to nakładki `decal.mold` i pleśń wpełzająca z murów, bo na kaflu
    bazowym powtarzałyby się jak wzór. Mury: pleśń w spoinach i plamy na wierzchu, zacieki na licu."""
    S, A = p.stain, p.ash
    if e.layer == 'floorBase':
        cells = e.w * e.h
        for y in range(img.h):  # pleśń w fugach
            for x in range(img.w):
                if img.get(x, y) == p.floor[1] and r.random() < .2:
                    img.put(x, y, S[0])
        for _ in range(cells * r.randint(3, 6)):  # zarodniki
            x, y = r.randrange(img.w), r.randrange(img.h)
            if img.get(x, y)[3]:
                img.put(x, y, A[1])
        if r.random() < .2 * cells:  # rzadka świecąca drobina
            img.put(r.randrange(2, img.w - 2), r.randrange(2, img.h - 2), p.flame[1])
    elif e.layer == 'wall':
        wt = p.wall_top
        face_top = T - FACE if img.get(4, T - 1) == p.outline else T  # kafel z licem od południa
        for y in range(face_top):  # pleśń w spoinach wierzchu
            for x in range(T):
                if img.get(x, y) == wt[1] and r.random() < .3:
                    img.put(x, y, S[0])
        for _ in range(r.randint(1, 2)):  # plamy na blokach (z dala od obrysu)
            cx, cy, rad = r.uniform(5, T - 5), r.uniform(5, max(6, face_top - 5)), r.uniform(2, 4)
            for y in range(int(cy - rad) - 1, int(cy + rad) + 2):
                for x in range(int(cx - rad) - 1, int(cx + rad) + 2):
                    c = img.get(x, y)
                    if c is None or c[3] == 0 or c == p.outline or y >= face_top - 1:
                        continue
                    if math.hypot(x + .5 - cx, y + .5 - cy) <= rad and r.random() < .8:
                        img.put(x, y, S[0])
        if face_top < T:  # zacieki pleśni na licu
            for _ in range(r.randint(1, 3)):
                x = r.randrange(3, T - 3)
                for y in range(face_top, face_top + r.randint(2, FACE - 2)):
                    if img.get(x, y) not in (None, p.outline, CLR):
                        img.put(x, y, S[0])


def pack(entries):
    """Pierwsze wolne miejsce w kolejności manifestu (first-fit) — dopisane kafle nie przesuwają starych."""
    used, pos = set(), {}
    for e in entries:
        i = 0
        while True:
            c, r = i % COLUMNS, i // COLUMNS
            cells = [(c + dx, r + dy) for dy in range(e.h) for dx in range(e.w)]
            if c + e.w <= COLUMNS and not any(cell in used for cell in cells):
                used.update(cells)
                pos[e.name] = (c, r)
                break
            i += 1
    rows = max(r for (_, r) in used) + 1
    return pos, rows


def build_sheet(p):
    entries, tiles = manifest(), render_tiles(p)
    pos, rows = pack(entries)
    sheet = Img(COLUMNS * T, rows * T)
    meta = {
        'version': 2, 'biome': BIOME, 'palette': p.key, 'image': f'{BIOME}_tileset.png',
        'tileSize': T, 'columns': COLUMNS, 'rows': rows, 'envShadowAlpha': round(ENV_SHADOW_ALPHA / 255, 3),
        'tiles': {}, 'groups': {},
    }
    for e in entries:
        c, r = pos[e.name]
        sheet.blit(tiles[e.name], c * T, r * T)
        t = {'frame': r * COLUMNS + c, 'col': c, 'row': r, 'w': e.w, 'h': e.h, 'layer': e.layer}
        if e.w > 1 or e.h > 1:  # indeksy części elementu wielokaflowego, wiersz po wierszu
            t['frames'] = [[(r + dy) * COLUMNS + c + dx for dx in range(e.w)] for dy in range(e.h)]
        if e.weight: t['weight'] = e.weight
        if e.flip_x: t['flipX'] = True
        meta['tiles'][e.name] = t
        if e.group:
            meta['groups'].setdefault(e.group, []).append(e.name)
    # Kolory palety dla efektów rysowanych w grze (światło, pyłki) — gra nie zna hexów na sztywno.
    meta['colors'] = {
        'ambient': to_hex(p.deep[0]),
        'ash': [to_hex(c) for c in p.ash],
        'flame': [to_hex(c) for c in p.flame],
        'outline': to_hex(p.outline),
    }
    meta['torch'] = {'flameBaseY': TORCH_FLAME_BASE_Y}
    meta['autotile'] = {
        'wall': {
            'bits': {'N': 1, 'E': 2, 'S': 4, 'W': 8}, 'meaning': 'bit ustawiony = sąsiad jest ścianą (brzeg mapy też)',
            'variants': {str(m): f'wall.{m}' for m in range(16)},
            'diagonal': {'appliesToMask': 15, 'bits': {'NE': 1, 'SE': 2, 'SW': 4, 'NW': 8},
                         'tiles': {str(d): f'wall_15_d{d:02d}' for d in range(1, 16)}},
            'bands': {'edge': 1, 'fade': 2, 'deep': 3, 'meaning': 'odległość Czebyszewa od najbliższej podłogi',
                      'groups': {'fade': 'wallBand.fade', 'deep': 'wallBand.deep'}},
            'overhead': 'ściany bez bitu N (podłoga od północy) rysujemy nad postaciami',
        },
        'envShadow': {'bits': {'N': 1, 'E': 2, 'W': 8}, 'meaning': 'sąsiad podłogi jest ścianą',
                      'tiles': {str(m): f'shadow_{m:02d}' for m in (1, 2, 3, 8, 9, 10, 11)}},
    }
    return sheet, meta, tiles


# ---------------- walidator (STYLEGUIDE) ----------------
def validate(p, tiles):
    errors, warnings = [], []
    allowed = p.colors() | {CLR}
    layer = {e.name: e.layer for e in manifest()}
    for name, img in tiles.items():
        bad_alpha, bad_color = 0, set()
        for row in img.p:
            for c in row:
                if c[3] == 0:
                    continue
                if layer[name] == 'envShadow':
                    if c[3] != ENV_SHADOW_ALPHA: bad_alpha += 1
                    continue
                if c[3] != 255: bad_alpha += 1
                elif c not in allowed: bad_color.add(to_hex(c))
        if bad_alpha: errors.append(f'{name}: {bad_alpha} px z niedozwoloną alfą')
        if bad_color: errors.append(f'{name}: kolory spoza palety {sorted(bad_color)[:5]}')
    for c in p.colors():
        if c[:3] in ((0, 0, 0), (255, 255, 255)):
            errors.append(f'paleta zawiera czystą czerń/biel {to_hex(c)}')
    if not BIOMES[BIOME]['reserved_hues']:
        return errors, warnings
    for c in (p.floor[2], p.floor_alt, p.floor[3]):
        h, s = hue_sat(c)
        if s >= .08 and 255 <= h <= 335:
            warnings.append(f'podłoga {to_hex(c)} (barwa {h:.0f}°, nasycenie {s:.0%}) w rodzinie fioletu wrogów')
        if s >= .4 and 80 <= h <= 130:
            errors.append(f'podłoga {to_hex(c)} za blisko zieleni magii')
    return errors, warnings


# ---------------- makieta ----------------
MOCKUP_MAP = [
    "############################",
    "############################",
    "############################",
    "############################",
    "####......Ss.......#########",
    "####......ss.......#########",
    "####..P......Ll.P..#########",
    "####...............g........",
    "####...............g........",
    "####..Oo...........#########",
    "####..oo........p..#########",
    "####.B...........R.#########",
    "####...............#########",
    "########GG##################",
    "########..##################",
    "########..##################",
    "########..##################",
]
# (arkusz, rozmiar komórki, kolor obrysu z arkusza, kolumna klatki) — klatka 0, wiersze = kierunki N..NW
SPRITES = {
    'barbarian': ('blond-barbarian_walk.png', 48, '#1b1a22', 'Barbarzyńca'),
    'trashcan': ('trashcan-man_walk.png', 48, '#1b1a22', 'Trashcan'),
    'mage': ('demon-mage_float-cast.png', 48, '#140a12', 'Mag'),
    'sludge': ('sludge-king_move-spit.png', 96, '#1b1a22', 'Sludge King'),
    'orb': ('demon-mage_orb.png', 16, None, None),
    'glob': ('sludge-king_glob.png', 16, None, None),
    # Pajęcze leże (krok 23a): bohater z mieczem (krok 21), Matka Pająków i pajączki (krok 20b/22).
    'barbarian_sword': ('blond-barbarian_walk-attack.png', 48, '#1b1a22', 'Barbarzyńca'),
    'queen': ('spider-queen_move-birth-lash.png', 96, '#1b1a22', 'Matka Pająków'),
    'spiderling': ('spiderling_walk-prime.png', 48, '#1b1a22', 'Pajączek'),
    # Wrogowie leża (krok 23b, tools/lair_enemies.py).
    'cave_spider': ('cave-spider_walk.png', 48, '#1b1a22', 'Pająk'),
    'bat': ('bat_fly-screech.png', 48, '#1b1a22', 'Nietoperz'),
    'bat_wave': ('bat_wave.png', 32, None, None),
    # Wrogowie Grzybni (krok 28b, tools/grove_enemies.py).
    'infected_spider': ('infected-spider_walk.png', 48, '#1b1a22', 'Zarażony pająk'),
    'fungoid': ('fungoid_walk-spit.png', 48, '#1b1a22', 'Grzybiec'),
    'spore_ball': ('spore-ball.png', 16, None, None),
    # Wrogowie Cmentarzyska (krok 32b, tools/grave_enemies.py).
    'zombie': ('zombie_walk-claw.png', 48, '#1b1a22', 'Zarażony'),
    'sower': ('sower_walk-spit.png', 48, '#1b1a22', 'Siewca'),
    # Druga bohaterka (krok 36, tools/sorceress_sprites.py).
    'sorceress': ('sorceress_walk-cast.png', 48, '#1b1a22', 'Czarodziejka'),
    'sorceress_orb': ('sorceress_orb.png', 16, None, None),
    # Wrogowie Piekła (krok 41d, tools/infernal_enemies.py).
    'hellhound': ('hellhound_run-pounce.png', 48, '#1b1a22', 'Ogar'),
    'cultist': ('cultist_walk-throw.png', 48, '#1b1a22', 'Kultysta'),
    'tar_bomb': ('tar-bomb.png', 16, None, None),
}
# (sprite, wiersz kierunku, środek x, środek y, chodzi = cień kontaktowy od silnika)
MOCKUP_ACTORS = [
    ('barbarian', 0, 368, 262, True),
    ('trashcan', 6, 492, 296, True),
    ('mage', 4, 232, 236, False),     # na zwykłej podłodze
    ('mage', 3, 452, 150, False),     # w cieniu pod licem górnej ściany
    ('mage', 6, 752, 252, False),     # w korytarzu przy kracie
    ('sludge', 1, 400, 352, False),
    ('orb', 0, 300, 246, False),
    ('glob', 0, 430, 318, False),
]
# Obsada leża: (sprite, wiersz kierunku, środek x, środek y, chodzi, kolumna klatki).
# Rusher = pająk jaskiniowy, Kiter = nietoperz z falą (krok 23b).
MOCKUP_ACTORS_LAIR = [
    ('barbarian_sword', 2, 368, 262, True, 4),       # cios w stronę pajączków
    ('spiderling', 6, 430, 270, True, 0),
    ('spiderling', 7, 452, 236, True, 1),
    ('spiderling', 5, 470, 300, True, 6),            # zapłon
    ('queen', 6, 560, 300, False, 5),                # złożenie pajączka
    ('cave_spider', 1, 300, 330, True, 1),
    ('bat', 2, 232, 236, False, 6),                  # skrzek
    ('bat', 6, 752, 252, False, 1),
    ('bat_wave', 2, 290, 238, False, 0),
]
# Cmentarzysko (krok 32b): zarażeni (Rushery) i siewcy (Kitery).
MOCKUP_ACTORS_GRAVE = [
    ('barbarian_sword', 2, 368, 262, True, 4),
    ('zombie', 6, 452, 236, True, 6),               # cios pazurami
    ('zombie', 1, 300, 330, True, 1),
    ('sower', 2, 232, 236, True, 6),                # plucie
    ('sower', 6, 752, 252, True, 0),
    ('spore_ball', 0, 290, 238, False, 0),
]
# Piekło (krok 41a): obaj bohaterowie; wrogowie biomu z kroku 41d — ogar (Rusher) i kultysta (Kiter).
MOCKUP_ACTORS_INFERNAL = [
    ('barbarian_sword', 2, 368, 262, True, 4),
    ('sorceress', 1, 300, 330, True, 0),
    ('sorceress_orb', 0, 318, 312, False, 0),
    ('hellhound', 6, 452, 236, True, 5),              # skok
    ('cultist', 2, 232, 236, True, 6),                # rzut
    ('cultist', 6, 752, 252, True, 0),
    ('tar_bomb', 0, 262, 230, False, 0),
]
# Nakładki biomu na makiecie: (kafel, x, y) w kaflach.
MOCKUP_BIOME_DECALS = {
    'infernal': [('decal_sigil_2x2', 13, 8), ('decal_ember_a', 6, 7), ('decal_ember_b', 15, 5), ('decal_blood_a', 10, 11),
                 ('decal_blood_b', 17, 11), ('decal_bones_a', 8, 5), ('decal_ember_a', 18, 8)],
    'graveyard': [('decal_corpse_2x1', 9, 12), ('decal_grave_slab_1x2', 15, 5), ('decal_grave_slab_1x2', 17, 5),
                  ('decal_candles_a', 15, 7), ('decal_bones_a', 6, 7), ('decal_bones_b', 12, 6),
                  ('decal_corpse_b_2x1', 13, 9), ('decal_mycel_faint_b', 11, 9), ('decal_candles_b', 18, 11)],
}
# Detale lica biomu na makiecie (rysowane po murach): (kafel, x, y).
MOCKUP_BIOME_FACES = {
    'infernal': [('face_chains', 5, 3), ('face_skull_spike', 7, 3), ('face_lava_seep', 12, 3), ('face_chains', 14, 3),
                 ('torch_sconce', 9, 3), ('torch_flame_0', 9, 3)],
    'graveyard': [('face_niche', 5, 3), ('face_skulls', 7, 3), ('face_niche', 12, 3), ('face_epitaph', 14, 3),
                  ('face_niche', 17, 3), ('torch_sconce', 9, 3), ('torch_flame_0', 9, 3)],
}
# Postacie mierzone pod kątem czytelności na palecie biomu.
METRIC_CAST = {
    'tower_ruins': ('barbarian', 'trashcan', 'mage', 'sludge'),
    'spider_lair': ('barbarian_sword', 'cave_spider', 'bat', 'queen', 'spiderling'),
    # Grzybnia (krok 28b): zarażony pająk i grzybiec; Król Pająków w kroku 29.
    'fungal_grove': ('barbarian_sword', 'infected_spider', 'fungoid'),
    'graveyard': ('barbarian_sword', 'zombie', 'sower'),
    'infernal': ('barbarian_sword', 'sorceress', 'hellhound', 'cultist'),
}


def load_frame(key, row, col=0):
    file, cell, _, _ = SPRITES[key]
    im = Image.open(os.path.join(SPRITES_DIR, file)).convert('RGBA')
    if key in ('orb', 'glob', 'sorceress_orb', 'tar_bomb'):
        row = 0  # bez kierunków
    return im.crop((col * cell, row * cell, (col + 1) * cell, (row + 1) * cell))


def weighted(rng, names, weights):
    return rng.choices(names, weights=weights, k=1)[0]


def compose_mockup(p, tiles, meta, seed=16):
    rng = random.Random(seed)
    grid = MOCKUP_MAP
    H, Wd = len(grid), len(grid[0])
    canvas = Image.new('RGBA', (Wd * T, H * T), p.deep[0])
    pil = {n: img.pil() for n, img in tiles.items()}
    flipped = {}

    def put(name, cx, cy, flip=False):
        im = pil[name]
        if flip:
            im = flipped.setdefault(name, im.transpose(Image.FLIP_LEFT_RIGHT))
        canvas.alpha_composite(im, (cx * T, cy * T))

    def wall(x, y):
        return not (0 <= y < H and 0 <= x < Wd) or grid[y][x] == '#'

    group = lambda g: (meta['groups'][g], [meta['tiles'][n].get('weight', 1) for n in meta['groups'][g]])
    plain = lambda x, y: 0 <= y < H and 0 <= x < Wd and grid[y][x] == '.'

    # 1. baza podłogi: najpierw wzory 2x2, potem ważone warianty bez powtórzeń z sąsiadem
    base, macros = {}, 0
    for _ in range(60):
        x, y = rng.randrange(Wd - 1), rng.randrange(H - 1)
        cells = [(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)]
        if macros < 3 and all(plain(*c) and c not in base for c in cells):
            for c in cells:
                base[c] = '#macro'
            put(weighted(rng, *group('floorMacro')), x, y)
            macros += 1
    names, weights = group('floor')
    for y in range(H):
        for x in range(Wd):
            if wall(x, y) or (x, y) in base:
                continue
            for _ in range(4):
                n = weighted(rng, names, weights)
                if n not in (base.get((x - 1, y)), base.get((x, y - 1))):
                    break
            base[(x, y)] = n
            put(n, x, y, rng.random() < .5)
    # 2. nakładki
    decal_groups = [('decal.crack', 4), ('decal.debris', 2), ('decal.stain', 1.5), ('decal.broken', 1), ('decal.rubble', .5)]
    for y in range(H):
        for x in range(Wd):
            if not plain(x, y):
                continue
            if wall(x, y - 1) and rng.random() < .35: put('decal_dust_n', x, y)
            if wall(x - 1, y) and rng.random() < .25: put('decal_dust_w', x, y)
            if wall(x + 1, y) and rng.random() < .25: put('decal_dust_e', x, y)
            if rng.random() < .10:
                g = weighted(rng, [g for g, _ in decal_groups], [w for _, w in decal_groups])
                put(weighted(rng, *group(g)), x, y, rng.random() < .5)
    put('decal_crack_2x1', 12, 11)
    put('decal_crack_1x2', 22 - 8, 8)
    for name, x, y in MOCKUP_BIOME_DECALS.get(BIOME, []):
        put(name, x, y)
    # 3. elementy podłogi
    for y in range(H):
        for x in range(Wd):
            if grid[y][x] == 'S': put('stairs_sealed_2x2', x, y)
            if grid[y][x] == 'O': put('seal_2x2', x, y)
    # 4. cienie środowiska
    for y in range(H):
        for x in range(Wd):
            if wall(x, y):
                continue
            m = (1 if wall(x, y - 1) else 0) | (2 if wall(x + 1, y) else 0) | (8 if wall(x - 1, y) else 0)
            if m:
                put(f'shadow_{m:02d}', x, y)
    # 5. cienie kontaktowe postaci chodzących (w grze da je silnik)
    shadow_layer = Image.new('RGBA', canvas.size, CLR)
    d = ImageDraw.Draw(shadow_layer)
    for key, row, cx, cy, walks in MOCKUP_ACTORS:
        if walks:
            d.ellipse((cx - 10, cy + 9, cx + 10, cy + 15), fill=p.outline[:3] + (ENV_SHADOW_ALPHA,))
    canvas.alpha_composite(shadow_layer)
    # 6. ściany: pasma odległości, maska, narożniki, ważone warianty
    overhead = []
    for y in range(H):
        for x in range(Wd):
            if not wall(x, y):
                continue
            dist = min([max(abs(dx), abs(dy)) for dy in range(-3, 4) for dx in range(-3, 4)
                        if not wall(x + dx, y + dy)] or [3])
            if dist >= 2:
                put(weighted(rng, *group('wallBand.' + ('fade' if dist == 2 else 'deep'))), x, y)
                continue
            m = (1 if wall(x, y - 1) else 0) | (2 if wall(x + 1, y) else 0) | (4 if wall(x, y + 1) else 0) | (8 if wall(x - 1, y) else 0)
            if m == 15:
                dg = ((1 if not wall(x + 1, y - 1) else 0) | (2 if not wall(x + 1, y + 1) else 0)
                      | (4 if not wall(x - 1, y + 1) else 0) | (8 if not wall(x - 1, y - 1) else 0))
                name = f'wall_15_d{dg:02d}'
            else:
                name = weighted(rng, *group(f'wall.{m}'))
            put(name, x, y)
            if not m & 1:
                overhead.append((name, x, y))
    # 7. kraty i rekwizyty
    props = {'P': 'pillar', 'p': 'pillar_stump', 'B': 'bones', 'R': 'rubble_a', 'L': 'fallen_pillar_2x1', 'G': 'gate_h_closed', 'g': 'gate_v_closed'}
    for y in range(H):
        for x in range(Wd):
            if grid[y][x] in props:
                put(props[grid[y][x]], x, y)
    # 8. postacie (wg y), potem ściany nad postaciami
    actors = (MOCKUP_ACTORS_INFERNAL if BIOME == 'infernal'
              else MOCKUP_ACTORS_GRAVE if BIOME == 'graveyard'
              else MOCKUP_ACTORS_LAIR if BIOME in ('spider_lair', 'fungal_grove')
              else [(*a, 0) for a in MOCKUP_ACTORS])
    for key, row, cx, cy, _, col in sorted(actors, key=lambda a: a[3]):
        fr = load_frame(key, row, col)
        canvas.alpha_composite(fr, (cx - fr.width // 2, cy - fr.height // 2))
    for name, x, y in overhead:
        put(name, x, y)
    for name, x, y in MOCKUP_BIOME_FACES.get(BIOME, []):
        put(name, x, y)
    return canvas


def sprite_metrics(p, tiles):
    """Kontrast WCAG: obrys i dominujący ton ciała postaci względem średniej jasności podłogi."""
    floor_img = tiles['floor_slab16_a']
    px = [c for row in floor_img.p for c in row]
    y_floor = sum(luminance(c) for c in px) / len(px)
    floor_h, _ = hue_sat(p.floor[2])
    res = []
    for key in METRIC_CAST[BIOME]:
        file, cell, out_hex, label = SPRITES[key]
        fr = load_frame(key, 4)
        cnt = Counter(c for c in fr.getdata() if c[3] == 255 and to_hex(c) != out_hex and luminance(c) > .006)
        body = cnt.most_common(1)[0][0]
        c_out = contrast(luminance(hx(out_hex)), y_floor)
        c_body = contrast(luminance(body), y_floor)
        bh, bs = hue_sat(body)
        dh = min(abs(bh - floor_h), 360 - abs(bh - floor_h))
        ok_ = c_out >= 2.0 and (c_body >= 1.5 or (dh >= 60 and bs >= .25))
        res.append((label, c_out, c_body, dh, ok_))
    return y_floor, res


def label_font(size):
    """Czcionka systemowa z polskimi znakami; domyślna Pillow ich nie ma."""
    for path in (r'C:\Windows\Fonts\segoeui.ttf', r'C:\Windows\Fonts\arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def run_mockups(out, keys):
    os.makedirs(out, exist_ok=True)
    panels, report = [], []
    for key in keys:
        p = PALETTES[key]
        sheet, meta, tiles = build_sheet(p)
        errors, warnings = validate(p, tiles)
        mock = compose_mockup(p, tiles, meta)
        mock.resize((mock.width * 2, mock.height * 2), Image.NEAREST).save(os.path.join(out, f'mockup_{key}.png'))
        sheet.pil().save(os.path.join(out, f'sheet_{key}.png'))
        y_floor, res = sprite_metrics(p, tiles)
        line1 = f'{p.label}   (jasność podłogi Y={y_floor:.3f})'
        stats = [f"{lab}: obrys {co:.1f} · ciało {cb:.1f} · Δbarwy {dh:.0f}° · {'OK' if k else 'SŁABO'}"
                 for lab, co, cb, dh, k in res]
        panels.append((mock, line1, '      '.join(stats[:2]) + '\n' + '      '.join(stats[2:])))
        report.append((p, y_floor, res, errors, warnings))
    # zestawienie 2x2 w skali 1x z opisem
    band = 64
    pw, ph = panels[0][0].width, panels[0][0].height + band
    cols = 2
    rows = (len(panels) + cols - 1) // cols
    board = Image.new('RGBA', (pw * cols, ph * rows), (18, 16, 22, 255))
    d = ImageDraw.Draw(board)
    f1, f2 = label_font(18), label_font(13)
    for i, (mock, l1, l2) in enumerate(panels):
        ox, oy = (i % cols) * pw, (i // cols) * ph
        d.text((ox + 10, oy + 4), l1, fill=(238, 241, 244, 255), font=f1)
        d.multiline_text((ox + 10, oy + 28), l2, fill=(200, 200, 210, 255), font=f2, spacing=3)
        board.alpha_composite(mock, (ox, oy + band))
    board.save(os.path.join(out, 'mockup_compare.png'))
    return report


def main():
    sys.stdout.reconfigure(encoding='utf-8')  # konsola Windows domyślnie nie ma polskich znaków
    ap = argparse.ArgumentParser(description='Generator kafli Tower Ruins (v2)')
    ap.add_argument('--out', default=os.path.join(ROOT, 'public', 'assets', 'tilesets'))
    ap.add_argument('--biome', default='tower_ruins', choices=sorted(BIOMES))
    ap.add_argument('--palette', default=None, choices=sorted(PALETTES), help='domyślnie paleta biomu')
    ap.add_argument('--mockup', action='store_true', help='makiety wszystkich (lub --palettes) kandydatek palet')
    ap.add_argument('--palettes', default=','.join(PALETTES), help='lista palet do makiet, rozdzielona przecinkami')
    ap.add_argument('--list', action='store_true')
    a = ap.parse_args()
    global BIOME
    BIOME = a.biome
    a.palette = a.palette or BIOMES[BIOME]['palette']
    if a.list:
        for k, p in PALETTES.items():
            print(f'{k:15s} {p.label}')
        return 0
    if a.mockup:
        report = run_mockups(a.out, [k.strip() for k in a.palettes.split(',')])
        status = 0
        for p, y_floor, res, errors, warnings in report:
            print(f'\n{p.label} [{p.key}]  podłoga Y={y_floor:.3f}')
            for lab, co, cb, dh, k in res:
                print(f"  {lab:12s} obrys {co:4.2f}  ciało {cb:4.2f}  Δbarwy {dh:5.1f}°  {'OK' if k else 'SŁABO'}")
            for w in warnings: print('  uwaga:', w)
            for e in errors: print('  BŁĄD:', e); status = 1
        return status
    p = PALETTES[a.palette]
    sheet, meta, tiles = build_sheet(p)
    errors, warnings = validate(p, tiles)
    for w in warnings: print('uwaga:', w)
    if errors:
        for e in errors: print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    sheet.pil().save(os.path.join(a.out, meta['image']))
    with open(os.path.join(a.out, f'{BIOME}_tileset.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    print(f"zapisano {meta['image']}: {len(meta['tiles'])} kafli, {COLUMNS}x{meta['rows']}, paleta {p.key}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
