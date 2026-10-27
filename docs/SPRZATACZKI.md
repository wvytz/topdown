# Sprzątaczki i Lustrzana komnata — koncept (do oceny właściciela)

Pomysł właściciela (27.10.2026) `#sprzataczki` `#lustrzana-komnata`: pajęczy duet zwalnia jedno piętro, a w jego miejsce
wchodzą **dwa piętra** nowego biomu. Każde piętro kończy **sprzątaczka-boss**: na piętrze A blondynka, na piętrze B
brunetka. Posadzka jest wypolerowana do opalizującego blasku i odbija postacie. Mury są najbrudniejsze i najbardziej
zniszczone w wieży. Walka ma unieruchamiać: poślizg na wodzie, ściąganie wiadrem i plątanie miotłą.

Poprawki właściciela po pierwszej wersji (wiedźma z mopem odrzucona):
- młode, szczupłe sprzątaczki, a nie stara wiedźma;
- czarne legginsy i obcisły strój, bez szat i kapeluszy;
- zwykła miotła z czarnym włosiem i plastikowe wiadro w ręce;
- wspólny model, blondynka trochę wyższa;
- po śmierci się nie roztapiają;
- krzyczą, a nad nimi pojawiają się napisy.

Status: **tylko grafika i koncept** (generatory i podglądy). Implementacja w grze po akceptacji.

## Bossowie

Obie sprzątaczki mają wspólny model: obcisła czarna bluzka, czarne legginsy, białe trampki i żółte gumowe rękawice
(akcent). Różnią je włosy, skala i kolory sprzętu:

| | Blondynka (piętro A) | Brunetka (piętro B) |
|---|---|---|
| Włosy | jasny kucyk z gumką | czarny warkocz |
| Wzrost | skala 1,10 względem brunetki („ciut wyższa”) | bazowa |
| Miotła | czerwony plastikowy trzonek, czarne włosie | drewniany trzonek, czarne włosie |
| Wiadro | niebieskie, plastikowe | czerwone, plastikowe |

Animacje (wspólne dla obu, 8 kierunków × 28 klatek): chód, polerowanie (miotła zamiata na boki, spod włosia lecą
błyski), chlust z wiadra, wiadro na sznurze, cios miotłą, plątanie, krzyk. Śmierć ma 8 klatek: poślizg na własnej
mokrej podłodze, upadek na plecy, przewrócone wiadro rozlewa wodę, miotła leży obok.

### Blondynka — „Mokra podłoga” (piętro A)

Pierwszy kontakt z mechaniką: woda i ściąganie.

| Atak | Co robi | Telegraf |
|---|---|---|
| **Chlust** | Wylewa wiadro przed siebie: kałuża mydlin rośnie do promienia 44 px i zostaje na ok. 8 s (do strojenia). Na mokrym bohater **ślizga się**: zachowuje pęd, skręca z bezwładnością, dash wydłuża się i trudno go zatrzymać. | Zamach i przechył wiadra (0,5 s) |
| **Wiadro na sznurze** | Jedną ręką rzuca wiadro w najbliższego bohatera. Trafiony zostaje **ściągnięty** pod jej stopy, a ona od razu zamiata miotłą dookoła. Na kałuży ściąganie jest dłuższe. | Zamach wiadrem za plecy, linia celu |
| **Polerowanie** | Między atakami poleruje posadzkę: zostawia błyski, a pod nią podłoga świeci jaśniej. | — |

### Brunetka — „Zamiatanie” (piętro B)

Trudniejsza wersja: miotła i plątanie, a do tego chlust od blondynki.

| Atak | Co robi | Telegraf |
|---|---|---|
| **Cios miotłą** | Szeroki zamach z boku i uderzenie. Największe obrażenia w obu walkach. | Zamach za plecy (0,6 s) |
| **Plątanie** | Wbija miotłę w posadzkę, a pod stopami bohaterów wyrasta czarne włosie. Kto stoi w strefie, jest **unieruchomiony** na ok. 1,5 s (może atakować, nie może chodzić ani robić dashu). Wyrwać się można ok. 3 trafieniami w plątaninę albo przeczekać. | Miotła pionowo i jasne kręgi pod bohaterami (0,7 s) |
| **Chlust** | Jak u blondynki, rzadziej. Plątanie na mokrym to „praktycznie nieruchomi”. | jak wyżej |

Żeby unieruchamianie nie frustrowało, **ten sam bohater nigdy nie dostaje dwóch unieruchomień naraz**: po plątaniu
lub ściągnięciu ma krótką odporność, np. 2 s. W co-opie partner może rozplątać drugiego gracza ciosem (do decyzji).

### Krzyki z napisami

Przy atakach i co kilka sekund sprzątaczka krzyczy: grana jest klatka krzyku, a nad nią na ok. 1,5 s wyskakuje napis
w stylu zgłoszeń z gry (biały z obrysem). Do tego dźwięk z syntezy (`audioConfig`): krótki, piskliwy okrzyk.
Propozycje tekstów:
- „Nie chodź po mokrym!”
- „Uwaga, ślisko!”
- „Dopiero co myłam!”
- „Wycieraj buty!”
- „Kto tu nabłocił?!”
- „Zaraz cię wymiotę!”
- „Do wiadra z tobą!” (przy ściąganiu)

Teksty wpisuje się w config bossa, więc łatwo je zmienić.

## Biom: Lustrzana komnata (`mirror_hall`)

- **Posadzka:** sprzątaczki polerują ją tak długo, że świeci. Jest najjaśniejsza w wieży: chłodny błękit polerowanego
  kryształu i płyty jak w łaźni, a na nich gęste, ukośne smugi połysku z opalizującymi refleksami (róż, błękit,
  liliowy, blada żółć). **Świeci w mroku:** w grze posadzka tego biomu nie ciemnieje poza zasięgiem światła (wyjątek
  w oświetleniu), ciemne zostają mury i postacie.
- **Odbicia:** każda postać (bohaterowie, wrogowie, bossowie) ma pod stopami swoją kopię odwróconą w pionie. Odbicie ma
  50% krycia przy stopach, gaśnie ku dołowi, jest lekko zabarwione na błękit i rysuje się tylko na podłodze. W grze:
  drugi sprite z `flipY` pod postaciami, z tą samą klatką animacji. Zastępuje cień kontaktowy.
- **Mury:** prawie czarny, brudny kamień z zielonkawobrązowym nalotem. Pęknięte i wyszczerbione warianty losują się
  8× częściej (w Grzybni 4×). Na wierzchu wykruszone spoiny, na licach zacieki brudnej wody. Detale lica: zawalone lico
  z dziurą w głąb muru, zaciek, wybite cegły.
- **Nakładki na podłodze:** odłamki lustra, kałuże brudnej wody, piana mydlin.
- **Kontrast** (zmierzony generatorem): obrys postaci ma kontrast 8,6 z podłogą, wszystkie postacie testowe są OK.
  Barbarzyńca ma jasne ciało (kontrast 1,25), ale odcina go barwa (Δ 178°) i obrys.

## Sprite'y (gotowe, w repo)

| Plik | Zawartość |
|---|---|
| `cleaner-{blonde,dark}_walk-polish-spill-bucket-broom-tangle-shout.png` | 128×128, 8 kierunków × 28 klatek |
| `cleaner-{blonde,dark}_death.png` | 128×128, 8 kierunków × 8 klatek śmierci |
| `soap-puddle.png` | 96×96, 8 klatek: kałuża rośnie (promień = strefa poślizgu), 2 klatki połysku w pętli |
| `water-splash.png` | 32×32, 4 klatki chlustu |
| `plastic-bucket.png` | 24×24, wiadro w locie: niebieskie i czerwone (sznur rysuje gra linią) |
| `broom-tangle.png` | 48×48, 8 klatek: włosie wyrasta, trzyma, pęka |
| `polish-sparkle.png` | 16×16, 4 klatki błysku polerowanej posadzki |
| `tilesets/mirror_hall_tileset.{png,json}` | arkusz kafli biomu (134 kafle) |

Generatory: `tools/cleaner_sprites.py`, `tools/tower_ruins_tiles.py --biome mirror_hall`
(makieta z odbiciami: `--mockup --palettes lustro_opal`).

## Pytania do właściciela

1. **Miejsce w wieży.** Propozycja: duet pająków wchodzi do wspinaczki jako jedno piętro (leże i Grzybnia razem),
   a Lustrzana komnata zajmuje piętra 7–8, po Palarni. To biom najbardziej zniszczony, więc pasuje na koniec kręgu.
   Krąg ma wtedy 8 pięter (`floorsPerLoop`: 7 → 8). Ukryta komnata po Królu Pająków idzie razem z duetem.
2. **Podział ataków.** Blondynka: woda i wiadro, brunetka: miotła i plątanie plus chlust. Czy obie mają mieć wszystko?
3. **Wrogowie biomu.** Na razie żadnych nowych. Na później propozycja: Rusher i Kiter w stylu sprzątania.
4. **Teksty okrzyków.** Zostają te z listy czy masz swoje?
