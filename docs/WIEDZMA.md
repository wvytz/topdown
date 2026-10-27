# Wiedźma Mopa i Lustrzana komnata — koncept (do oceny właściciela)

Pomysł właściciela (27.10.2026) `#wiedzma-mopa` `#lustrzana-komnata`: pajęczy duet zwalnia jedno piętro, w jego miejsce wchodzą
**dwa piętra** nowego biomu, a na końcu drugiego czeka **wiedźma z mopem**. Podłoga błyszczy jak opalizujący kryształ
i odbija postacie, mury są najbrudniejsze i najbardziej zniszczone w wieży. Walka ma unieruchamiać: poślizg na wodzie,
ściąganie wiadrem, plątanie miotłą.

Status: **tylko grafika i koncept** (generatory i podglądy). Implementacja w grze po akceptacji.

## Biom: Lustrzana komnata (`mirror_hall`)

- **Posadzka:** najjaśniejsza w wieży, chłodny błękit polerowanego kryształu, płyty jak w łaźni. Krótkie ukośne smugi
  połysku z opalizującą iskrą (róż, błękit, liliowy, blada żółć). Bez kurzu w szczelinach, bo ktoś tu ciągle szoruje.
- **Odbicia:** każda postać (bohaterowie, wrogowie, boss) ma pod stopami swoją kopię odwróconą w pionie. Odbicie ma
  50% krycia przy stopach, gaśnie ku dołowi, jest lekko zabarwione na błękit i rysuje się tylko na podłodze. W grze:
  drugi sprite z `flipY` na warstwie pod postaciami, synchronizowany z klatką animacji. Koszt to jeden sprite na postać.
- **Mury:** prawie czarny, brudny kamień z zielonkawobrązowym nalotem. Pęknięte i wyszczerbione warianty losują się
  8× częściej (w Grzybni 4×). Na wierzchu wykruszone spoiny, na licach zacieki brudnej wody. Detale lica: zawalone lico
  z dziurą w głąb muru, zaciek, wybite cegły.
- **Nakładki na podłodze:** odłamki lustra, kałuże brudnej wody, piana mydlin.
- **Kontrast:** zmierzony generatorem. Obrys postaci ma kontrast 8,6 z podłogą, wszystkie cztery postacie testowe są OK.
  Barbarzyńca ma jasne ciało (kontrast 1,2), ale odcina go barwa (Δ 178°) i obrys.

## Boss: Wiedźma Mopa

Zgarbiona staruszka w szerokim, spiczastym kapeluszu z wygiętym szpicem. Spod ronda wystają haczykowaty nos i żółte
ślepia. Ma śliwkową, łataną suknię i brudny fartuch. W lewej ręce trzyma wiadro z mydlinami, w prawej **mopomiotłę**:
kij z mopem na jednym końcu i brzozową miotłą na drugim. Akcenty kolorystyczne: błękit mydlin i żółć oczu.

### Faza 1 — „Wielkie zmywanie” (100–50% HP), mop z przodu

| Atak | Co robi | Telegraf |
|---|---|---|
| **Chlust** | Wylewa wiadro przed siebie: kałuża mydlin rośnie do promienia 44 px i zostaje na ok. 8 s (do strojenia). Na mokrym bohater **ślizga się**: zachowuje pęd, skręca z bezwładnością, dash wydłuża się i trudno go zatrzymać. | Uniesienie i przechył wiadra (0,5 s) |
| **Wiadro na sznurze** | Jedną ręką rzuca wiadro w najbliższego bohatera (pocisk). Trafiony zostaje **ściągnięty** pod jej stopy, a ona od razu zamiata mopem dookoła. Na kałuży ściąganie jest dłuższe. | Zamach wiadrem za plecy, linia celu |
| **Zmywanie** | Krótki zamach mopem w łuku przed sobą: małe obrażenia, odpycha na mokre. | Odchylenie mopa |

### Przejście (50% HP)

Rechocze i obraca kij (klatki 20–23), od teraz miotła jest z przodu. Wszystkie kałuże z fazy 1 zostają na arenie.

### Faza 2 — „Zamiatanie” (50–0% HP), miotła z przodu

| Atak | Co robi | Telegraf |
|---|---|---|
| **Cios miotłą** | Szeroki zamach z boku i uderzenie. Największe obrażenia w walce. | Zamach za plecy (0,6 s) |
| **Plątanie** | Wbija miotłę w posadzkę, a pod stopami bohaterów wyrastają witki i sznurki mopa. Kto stoi w strefie, jest **unieruchomiony** na ok. 1,5 s (może atakować, nie może chodzić ani robić dashu). Wyrwanie się: ok. 3 trafienia w plątaninę albo czas. | Miotła pionowo + jasne kręgi pod bohaterami (0,7 s) |
| **Chlust** i **wiadro** | Zostają, ale rzadsze. | jak w fazie 1 |

To jest „poziom, w którym jesteśmy praktycznie nieruchomi”: kałuże odbierają kontrolę nad ruchem, wiadro przyciąga,
plątanie zatrzymuje. Żeby nie było frustrująco, **nigdy dwa unieruchomienia naraz na tym samym bohaterze** (po
plątaniu krótka odporność, np. 2 s). W co-opie partner może rozplątać drugiego gracza ciosem, tak jak przy wskrzeszaniu
(do decyzji).

### Śmierć

„Topię się!” Krzyczy z rękami w górze i rozpływa się w kałużę brudnej wody. Na kałuży zostaje pływający kapelusz,
obok leży mopomiotła (8 klatek).

## Dwa piętra

- **Piętro A (Lustrzana komnata):** zwykłe piętro biomu, kałuże mogą się pojawiać jako pułapka biomu. Zasada „każde
  piętro kończy boss” wymaga decyzji, kto czeka na końcu (pytanie 2).
- **Piętro B:** to samo plus arena Wiedźmy. Zapowiedź areny: im bliżej, tym więcej piany i mokrych śladów mopa na
  posadzce (`bossHeraldConfig`).

## Sprite'y (gotowe, w repo)

| Plik | Zawartość |
|---|---|
| `mop-witch_walk-spill-bucket-broom-tangle-flip.png` | 128×128, 8 kierunków × 24 klatki: chód, chlust, wiadro, cios miotłą, plątanie, przejście w fazę 2 |
| `mop-witch_death.png` | 128×128, 8 kierunków × 8 klatek śmierci |
| `soap-puddle.png` | 96×96, 8 klatek: kałuża rośnie (promień = strefa poślizgu), 2 klatki połysku w pętli |
| `water-splash.png` | 32×32, 4 klatki chlustu |
| `bucket.png` | 24×24, wiadro w locie (sznur rysuje gra linią) |
| `broom-tangle.png` | 48×48, 8 klatek: witki wyrastają, trzymają, pękają |
| `tilesets/mirror_hall_tileset.{png,json}` | arkusz kafli biomu (134 kafle) |

Generatory: `tools/witch_sprites.py`, `tools/tower_ruins_tiles.py --biome mirror_hall`
(makieta z odbiciami: `--mockup --palettes lustro_opal`).

## Pytania do właściciela

1. **Miejsce w wieży.** Propozycja: duet pająków wchodzi do wspinaczki jako jedno piętro (leże i Grzybnia razem),
   a Lustrzana komnata zajmuje piętra 7–8, po Palarni. To biom najbardziej zniszczony, więc pasuje na koniec kręgu.
   Krąg ma wtedy 8 pięter (`floorsPerLoop`). Ukryta komnata po Królu Pająków idzie razem z duetem.
2. **Boss piętra A.** Co kończy pierwsze piętro: Wiedźma w słabszej wersji (tylko faza 1), nowy mini-boss
   (np. jej pomocnik) czy wyjątek od zasady i piętro bez bossa, ze schodami?
3. **Mopomiotła** (mop i miotła na jednym kiju) czy dwa osobne narzędzia?
4. **Wrogowie biomu.** Na razie żadnych nowych. Propozycja na później: Rusher i Kiter w stylu sprzątania.
