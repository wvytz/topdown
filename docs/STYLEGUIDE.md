# STYLEGUIDE — pixel art

Reguły wizualne wyciągnięte z gotowych sprite'ów: **Trashcan Man**, **Blond Barbarian**, **Sludge King** (Demon Mage jako punkt odniesienia dla wyjątków). Każdy nowy asset musi spełniać te reguły, chyba że sekcja *Wyjątki* mówi inaczej.

---

## 1. Rzut i orientacja

- Widok **top-down** (z góry, bez perspektywy izometrycznej).
- Postać rysujemy **raz, zwróconą na północ (N)**. Pozostałe kierunki powstają przez obrót o 45° z próbkowaniem nearest-neighbor, a obrys nakłada się **po** obrocie.
- 8 kierunków, kolejność wierszy w arkuszu: `N, NE, E, SE, S, SW, W, NW` (0° = góra, zgodnie z ruchem wskazówek zegara).
- Wybór wiersza w silniku: `row = round(angle_deg / 45) % 8`.
- Cieniowanie jest w przestrzeni lokalnej postaci (obraca się razem z nią). Nie rysujemy światła "ze świata".

## 2. Skala i siatka

| Klasa | Wysokość postaci | Komórka | Pivot |
|---|---|---|---|
| Bohater / zwykły wróg | 32 px | 48×48 | 24,24 |
| Mini-boss (Demon Mage) | 48 px | 48×48 w arkuszu (rysowane w 96×96, by ręce nie wychodziły poza kadr) | 24,24 |
| Boss (Sludge King) | 64 px (≈2× bohatera) | 96×96 | 48,48 |
| Pocisk | 10–14 px | 16×16 | 8,8 |

- Margines w komórce: min. **8 px** wolnego miejsca z każdej strony postaci (miejsce na obrót po przekątnej i animację).
- Pivot zawsze w **geometrycznym środku komórki**. Środek tułowia/masy postaci leży na pivocie.
- Natywna rozdzielczość = 1×. Nie robimy wersji HD; skaluje silnik, tylko całkowite krotności (2×, 3×, 4×).
- Bez subpikseli i antyaliasingu. Każdy piksel jest pełny (alpha 0 albo 255) — jedyny wyjątek to cień (sekcja 6).

## 3. Obrys

- **1 px**, kolor wspólny dla całej obsady: `#1b1a22` (prawie czarny z chłodnym fioletem).
- Obrys zewnętrzny, 4-sąsiedztwo (bez narożników po skosie) — sylwetka wygląda na lekko zaokrągloną.
- Generowany automatycznie po obrocie kierunku, więc nigdy nie rysujemy go ręcznie w grafice źródłowej.
- Wewnętrzne linie podziału (np. pokrywa vs. tułów, ręka vs. korpus) rysujemy **najciemniejszym tonem danego materiału**, nie kolorem obrysu.

## 4. Paleta

### 4.1 Zasady ogólne

- Każdy materiał ma własną **rampę 2–5 tonów** (`D` cień → baza → `L` światło → `H` blask). Mniejsze elementy: 2 tony, duże płaszczyzny: 4–5.
- Rampy przesuwają się w odcieniu: cienie chłodniejsze/bardziej nasycone, światła cieplejsze. Nie robimy rampy przez samo przyciemnienie.
- Wyjątek proceduralny: koszulki Trashcan Mana to dowolny kolor + cień `×0.68` jasności (warianty kolorystyczne wrogów).
- Kolory czystej bieli (`#ffffff`) i czerni (`#000000`) są zakazane. Najjaśniejszy dopuszczalny ton ~`#eef1f4`, najciemniejszy ~`#120c0a`.
- Akcenty (oczy, złoto, pociski) to jedyne jaskrawe, nasycone piksele na sprite'ie. Max 1–2 akcenty na postać.

### 4.2 Kolory wspólne

| Rola | Hex | Użycie |
|---|---|---|
| Obrys | `#1b1a22` | wszystkie postacie |
| Złoto | `#d4a83a` / cień `#9a7424` | jelec barbarzyńcy, korona Sludge Kinga |
| Kość / kieł | `#e8e0c0`, `#d8ccb0` / cień `#9c8f74` | zęby, rogi, pazury |
| Skóra/rzemień | `#5a3a22`, `#4a3020`, `#5b3e27` | pasy, rękojeści, buty |

### 4.3 Trashcan Man

| Materiał | Tony |
|---|---|
| Skóra (zielonkawa) | `#b9c98a` · cień `#8a9c5f` |
| Pazury | `#efe9d2` |
| Pokrywa kosza | `#3a3f4a` · `#646c79` · `#8d96a3` · `#c4cbd4` · `#eef1f4` |
| Skórka banana | `#f2cf4a` · `#b98d24` · `#6b4c1c` |
| Buty | `#4a3428` · `#6e4f3b` |
| Koszulka | dowolna + `×0.68` |

### 4.4 Blond Barbarian

| Materiał | Tony |
|---|---|
| Skóra | `#efb985` · `#d9955f` · `#a8683c` |
| Włosy | `#fbeaa6` · `#f2d064` · `#c99a2e` · `#7a5418` |
| Futro | `#8a6a44` · `#634a2e` |
| Pas / ćwieki | `#5a3a22` · `#c9ccd2` |
| Buty | `#7d5a3c` · `#5b3e27` |
| Ostrze (od kroku 21) | `#d7dde4` · `#8f99a6`, jelec `#5a3a22` |

### 4.5 Sludge King

| Materiał | Tony (deep → hl) |
|---|---|
| Szlam fioletowy | `#1f1420` · `#3b2140` · `#5c3560` · `#83558a` · `#b88ab8` |
| Szlam brązowy | `#1e1510` · `#3a271c` · `#5a3e2a` · `#7e5b3e` · `#b08a64` |
| Kałuża (błoto) | `#120c0a` · `#261a13` · `#37271c` · `#523b29` · `#6e5038` |
| Paszcza / język | `#2a0e14` · `#b8505a` |
| Oczy | `#f2c94a` |

## 5. Cieniowanie i faktura

- Cieniowanie płaskie, **pasmowe** (cel-shading). Bez gradientów i pillow-shadingu (światło nie może iść po obrysie dookoła).
- Na płaskich materiałach (skóra, metal, tkanina) **brak ditheringu**.
- Dithering dozwolony wyłącznie dla substancji amorficznych (szlam, błoto, magia): **macierz Bayera 4×4**, tylko na przejściu między dwiema rampami (u Sludge Kinga: fiolet u góry → brąz u dołu, płynnie w osi lokalnej Y).
- Blask (`H`) to pojedyncze piksele lub krótkie pasma 1–2 px, nigdy duże plamy.
- Kałuża bossa jest **zwarta i ciemniejsza od ciała** — ma czytelnie oddzielać sylwetkę od podłogi, nie konkurować z nią.

## 6. Cienie pod postacią

- Postacie chodzące (Trashcan, Barbarian, Sludge King) — **brak wypalonego cienia**; podstawę daje silnik albo kałuża.
- Postacie lewitujące — cień wypalony w sprite'ie: elipsa `rgba(0,0,0,0.35)`, przesunięta w dół-prawo (+3, +5 px), pulsuje razem z unoszeniem. Wśród sprite'ów postaci to jedyne miejsce z półprzezroczystością.
- **Wyjątek: cienie środowiska** (krok 16, decyzja właściciela). Cień kontaktowy pod licem ściany, przy bocznych ścianach i pod postaciami chodzącymi (rysowany przez silnik) ma kolor obrysu `#1b1a22` i **jedną stałą alfę 0,4** (102/255). Bez gradientów i bez ditheringu: kształt cienia buduje się z pełnych pikseli tej samej alfy.

## 6b. Światło i efekty otoczenia (krok 19a)

- **Płynne przejście światła, bez ditheringu** (krok 28a, decyzja właściciela: twarde pasma z kroku 19a dawały irytujące „kręgi” wokół bohatera). Mrok, mgła i światła pochodni/latarni zmieniają się płynnie (smoothstep, `systems/lighting.ts`). Nadal bez ditheringu: gradient to alfa warstwy, a nie szachownica pikseli.
- Wszystko rysujemy w **rozdzielczości świata** i w pełnych pikselach świata (przy zoomie 2 każdy piksel to blok 2×2, jak w kaflach).
- **Mrok otoczenia:** kolor `deep` z palety biomu (nie czysta czerń). Najwyżej **30%** przyciemnienia na krawędziach kadru. W strefie, z której wróg może atakować, najwyżej 20%, bo tam obrys musi mieć ≥ 2:1 (test WCAG). Modyfikator „Mrok” jest mechaniką piętra i ten limit go nie dotyczy.
- **Płomienie świecą:** bez ciemnego obrysu; krawędź płomienia rysuje najciemniejszy ton rampy ognia. Rysujemy je nad warstwą mroku.
- **Migotanie skokowe** w rytmie animacji (6 kl./s): promień światła przeskakuje między kilkoma wartościami, bez płynnego falowania.
- **Mgła biomu** (krok 28a, Grzybnia): ta sama warstwa co mrok, ale w jasnym kolorze mgły (głębokie indygo, nie czerń); obłoczki mgły to twarde elipsy ze stałą alfą.
- **Dopuszczalna półprzezroczystość efektów:** warstwa mroku i mgły (płynna alfa), ciepła poświata pochodni (mieszanie ADD), pyłki, zarodniki i obłoczki mgły (jedna stała alfa). Sprite'y postaci i kafle nadal tylko 0/255 (poza cieniami środowiska, §6).

## 6c. Łupy, kapliczka i elementy interfejsu w świecie (krok 20)

- **Generator:** `tools/loot_sprites.py` → atlas `public/assets/sprites/loot.{png,json}` (klatki nazwane). Ikony przedmiotów to siatki ASCII 12×12 w generatorze, łatwe do ręcznej poprawki.
- **Rozmiary:** komórka 16×16 (moneta ok. 8 px, mikstura ok. 12 px, ikony przedmiotów ok. 14 px z obrysem), kapliczka 32×32 (jeden kafel). Na kartach nagrody ikona w skali 3× (całkowitej).
- **Kolor przedmiotu** = ten sam co w HUD (`lootConfig`). Rampa 4 tonów z niego: cień chłodniejszy, światło cieplejsze. Test pilnuje zgodności kolorów.
- **Przedmiot z efektem** ma złotą obwódkę `#d4a83a` na zewnątrz obrysu i iskrę. Przedmiot bazowy ma zwykły obrys i jest statyczny.
- **Animacje 4 klatki, 6 kl./s:** obrót monety, iskra, puls kuli kapliczki, orb pocisku gracza. Bez pulsowania skalą i bez przezroczystości — iskry i blask to pełne piksele bez obrysu.
- **Bez obrotu o dowolny kąt:** znacznik celowania ma 8 klatek kierunku (obrót co 45°, obrys po obrocie, jak postacie). Przebijający strzał to gwiazdka obracana klatkami co 45°.
- **Czytelność:** te same progi WCAG co dla postaci (§6a), na płytach i na bruku.

## 6a. Kafle otoczenia

- Kafel 32×32, generator `tools/tower_ruins_tiles.py` (paleta = dane, układ arkusza wspólny dla wszystkich palet).
- Światło pada z **północy** (oświetlone krawędzie południowe, cień pod krawędzią północną). Kafle wolno odbijać tylko w poziomie; odbicie w pionie i obrót psują światło.
- Fuga podłogi jest o jeden ton ciemniejsza od płyty, **nigdy w kolorze obrysu postaci** — inaczej sylwetki przyklejają się do siatki.
- Podłoga nie używa barw zarezerwowanych: fioletu wrogów, zieleni magii `#9cff57`, złota łupów. Pilnuje tego walidator generatora.
  - **Wyjątek: Pajęcze leże** (krok 23a, decyzja właściciela) — ten biom ma być fioletowo-zielono-biały: fioletowy kamień,
    ciemna zielona posoka, upiorny zielony ogień pochodni, białe nici i jaja. Walidator nie sprawdza tam barw zarezerwowanych;
    zostaje warunek czytelności (obrys postaci ≥ 2:1 do jasności podłogi), pilnowany testami.
- Czytelność postaci na podłodze (kontrast WCAG względem średniej jasności podłogi): obrys ≥ 2,0 : 1 oraz ciało ≥ 1,5 : 1 albo różnica barwy ≥ 60° przy nasyceniu ciała ≥ 25%.

## 7. Sylwetka i czytelność

- Postać musi być rozpoznawalna w samej sylwetce przy 1× (test: wypełnij kolorem obrysu).
- Jedna **dominująca cecha** na postać, przeskalowana komediowo: pokrywa kosza i długie pazury (Trashcan), grzywa blond i barki (Barbarian), korona i paszcza (Sludge King).
- Kończyny/ręce min. **2 px** szerokości, żeby przetrwały obrót o 45°.
- Detale 1 px tylko w środku sylwetki (oczy, ćwieki), nigdy na krawędzi — obrót je zgubi.

## 8. Animacja

- **6 fps** globalnie (≈167 ms/klatkę).
- Pętle ruchu: **4 klatki** (chód / pełzanie / unoszenie). Klatka 0 = idle.
- Ataki dystansowe: **4 klatki, bez pętli**, w kolumnach 4–7. Pocisk spawnuje się na **klatce 7**, w odległości `forward` od pivotu, w kierunku patrzenia (Mage: 13 px, Sludge King: 27 px).
- Ruch w klatkach max 1–2 px na krok dla 32 px, 2–3 px dla bossa. Pivot się nie przesuwa — animuje się tylko ciało wokół niego.
- Szlam/magia: kształt "oddycha" (squash & stretch ±1–2 px), nie przemieszcza się.

## 9. Pociski

- Komórka 16×16, pivot 8,8, **4 klatki pętli**, `rotate: false` (okrągłe, nie obracamy).
- Używają rampy właściciela (orb = zieleń magii, glut = fiolet + brąz szlamu) + ten sam obrys `#1b1a22`.
- Jaśniejsze od tła i od ciała właściciela — gracz musi je widzieć jako pierwsze.

## 10. Eksport

- PNG, przezroczyste tło, bez metadanych koloru (sRGB).
- Układ: wiersze = kierunki, kolumny = klatki. Nazwa: `postac_animacje.png` (np. `sludge-king_move-spit.png`).
- Każdy arkusz musi mieć wpis w `sprites.json` (rozmiar, frameSize, pivot, animacje, ewentualny spawn pocisku).
- Silnik: filtrowanie `nearest`, mipmapy wyłączone, pozycja zaokrąglana do całych pikseli ekranu.

## 11. Wyjątki

- **Demon Mage** ma własny, cieplejszy obrys `#140a12` i nasycony zielony akcent `#9cff57` — kolor magii zarezerwowany wyłącznie dla niego.
- Kolor skóry koszulki Trashcan Mana jest zmienną wariantu, nie stałą palety.
- **Barbarzyńca z mieczem** (krok 21, `tools/barbarian_sword.py`):
  - cios trwa tyle, co `attackCooldownMs` (4 × 80 ms przy 320 ms), a nie 6 kl./s — logika walki jest nadrzędna;
  - ostrze może wejść w margines 8 px, ale cały sprite mieści się w promieniu 21,5 px od pivota, więc po obrocie nie wychodzi poza komórkę.

## 12. Checklista nowego sprite'a

- [ ] Narysowany na N, 8 kierunków z obrotu
- [ ] Rozmiar z tabeli w sekcji 2, pivot w środku, margines ≥ 8 px
- [ ] Obrys 1 px `#1b1a22`, 4-sąsiedztwo, po obrocie
- [ ] Rampy 2–5 tonów z przesunięciem odcienia, brak `#000`/`#fff`
- [ ] Dithering tylko na materiałach amorficznych
- [ ] Brak półprzezroczystości (poza cieniem lewitacji)
- [ ] 4 klatki pętli, 6 fps; ataki w kolumnach 4–7, spawn na 7
- [ ] Wpis w `sprites.json`
