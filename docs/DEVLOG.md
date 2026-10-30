# TOP DOWN — dziennik rozwoju

Dokumentacja zmian i procesu tworzenia gry. Aktualizowana po każdym kroku.

- **Projekt gry (GDD):** [`docs/GDD.md`](GDD.md)
- **Zasady kodu:** [`docs/ZASADY_KODU.md`](ZASADY_KODU.md)
- **Instrukcje dla Claude:** [`CLAUDE.md`](../CLAUDE.md), wczytywane automatycznie w każdej sesji
- **Repozytorium:** `github.com/wvytz/topdown` (prywatne)
- **Znaczniki do wyszukiwania** (Ctrl+F albo `grep`):
  - `#ocena` — oceny i feedback właściciela po testach w grze;
  - `#decyzja` — decyzje projektowe właściciela;
  - temat, np. `#matka-pajakow`, `#pajecze-leze`, `#grzybnia`, `#krol-pajakow`, `#mrok`, `#cmentarzysko`, `#wampirzy-lord`, `#grzybowy-pozeracz`, `#ekran-startowy`, `#ekran-smierci`, `#czarodziejka`, `#lucznik`, `#pieklo`, `#kat-otchlani`, `#baron-dymu`, `#zadymiona-palarnia`, `#nazwa`, `#elity`, `#wieza`, `#ruiny`, `#zasadzka`, `#hud`, `#areny-bossow`, `#balans`, `#sterowanie`, `#coop`, `#wydajnosc`, `#dzwiek`, `#obraz`, `#gniazdownik`, `#czyhacz`, `#sprzataczki`, `#lustrzana-komnata`, `#feedback`, `#ikonka`, `#brudna-wiedzma`, `#bociani-ogrod` — wszystko o danym bossie albo biomie (łącz z `#ocena`).

---

## Jak pracujemy

### Cykl jednego kroku

1. **Wybór kroku** z pętli rozgrywki opisanej w GDD. Najpierw solidne podstawy, potem rozbudowa i balans.
2. **Warstwa czysta.** Najpierw powstają typy, zasady i decyzje w czystym TypeScripcie, bez importu Phasera.
3. **Testy logiki (Vitest, `tests/`).** Każdy nowy czysty moduł dostaje testy. Dla generatorów piszemy testy właściwości („dla każdego z setek pięter…”).
4. **Warstwa Phasera.** Encje i menedżery tylko *wykonują* decyzje i rysują.
5. **Weryfikacja w przeglądarce.** Sterujemy grą skryptem przez `window.__game` (tylko w trybie dev): teleport, wymuszone akcje, ręczne kroki pętli. Do tego zrzuty ekranu.
6. **Sprawdzenie i budowanie:** `npm run build`, czyli `tsc --noEmit`, testy i `vite build`. Build nie przejdzie, jeśli testy nie przechodzą.
7. **Wpis w tym pliku.**

### Architektura: izolacja od silnika

| Warstwa | Foldery | Zależy od Phasera? |
|---|---|---|
| Typy domenowe | `src/core/` | nie |
| Zasady i obliczenia | `src/systems/` (HP, cooldowny, dash, geometria walki, skalowanie) | nie |
| Decyzje AI | `src/ai/` (maszyny stanów, plany ataków bossa) | nie |
| Generowanie świata | `src/dungeon/DungeonGenerator.ts`, `EncounterPlanner.ts`, `ShrinePlanner.ts`, `ThronePlanner.ts`, `arenaGates.ts`, `lineOfSight.ts`, `rooms.ts` | nie |
| Strojenie liczb | `src/config/` | nie |
| Encje (widok + fizyka) | `src/entities/` | tak |
| Koordynacja walki | `src/combat/` (EnemyManager, ProjectileManager, BossFight) | tak |
| Renderowanie mapy, efekty, sceny | `src/dungeon/DungeonView.ts`, `src/effects/`, `src/scenes/` | tak |
| Wejście | `src/input/` (klawiatura i mysz zamieniane na abstrakcyjne `PlayerActions`) | tak |
| Obiekty otoczenia | `src/world/` (kapliczka, kraty areny) | tak |
| Zapis danych | `src/persistence/` (rekordy w `localStorage`, magazyn wstrzykiwany) | nie, ale korzysta z API przeglądarki |

**Zasady:**
- Logika zwraca *decyzje*: wektor ruchu, „zacznij atak”, plan ataku. Encja Phasera je wykonuje.
- Czas przekazujemy jawnie jako `now` (ms), więc logika nie zna zegara silnika i da się ją testować.
- Losowość jest deterministyczna (`core/random.ts`, mulberry32): seed runu, z niego seed piętra, z niego osobne seedy dla spotkań i bossa. Ten sam seed daje to samo piętro.
- Wszystkie liczby do balansu siedzą w `src/config/`, nie w logice.
- Grafika to placeholdery geometryczne generowane w `BootScene`.
- TypeScript w trybie strict, łącznie z `noUncheckedIndexedAccess` i `exactOptionalPropertyTypes`.
- **Izolację pilnuje test** `tests/architecture.test.ts`. Plik z warstwy czystej, który zaimportuje Phasera albo moduł silnika (także pośrednio), wywala testy.
  - Warstwa czysta to `core/`, `systems/`, `ai/`, `config/` oraz pliki `dungeon/DungeonGenerator.ts`, `EncounterPlanner.ts`, `lineOfSight.ts` i `rooms.ts`.
  - Nowy czysty plik w `dungeon/` trzeba dopisać do listy w tym teście.

### Uruchamianie

```
npm install
npm run dev          # serwer deweloperski (Vite)
npm test             # testy jednorazowo
npm run test:watch   # testy w trybie obserwacji (przy pracy nad logiką)
npm run build        # typy + testy + build produkcyjny
```

Debug (tylko `npm run dev`): klawisz **B** pokonuje bossa, `window.__game` daje dostęp do gry z konsoli.

---

## Krok 1 — Szkielet projektu

*(Zrobiony w osobnej sesji. Tu tylko podsumowanie stanu, który zastaliśmy.)*

- Vite, TypeScript i Phaser 3 (fizyka Arcade), rozdzielczość logiczna 960×540, skalowanie FIT.
- Gracz (kwadrat) chodzi na WASD i strzałkach. Ruch po skosie ma tę samą prędkość (`MovementSystem`).
- Kamera z interpolacją, zoomem i martwą strefą.
- **Poprawka:** instalacja zależności w tamtej sesji się przerwała (pusty `node_modules`). Zrobiliśmy ponownie `npm install`.

## Krok 2 — Generator pięter

**Cel (GDD §3):** siatka kafli, pokoje łączone korytarzami, punkt startowy i komnata bossa.

- **`DungeonGenerator` (czysty):**
  - Losowe rozmieszczenie pokojów bez nakładania się, z odstępem między nimi.
  - Połączenia: minimalne drzewo rozpinające (algorytm Prima) gwarantuje, że całe piętro jest spójne. Do tego około 25% dodatkowych korytarzy, które tworzą pętle.
  - Korytarze w kształcie litery L, szerokie na 2 kafle.
- Komnata bossa ma schody na środku, najpierw zamknięte (kraty), potem otwarte (złote).
- **`DungeonView`:** tilemapa Phasera z danych, kolizja ze ścianami, podmiana kafla schodów.
- **Przejście piętra:** wejście na otwarte schody, potem wyciemnienie i `scene.restart` z kolejnym numerem piętra.
- **Skalowanie z piętrem:** mapa i liczba pokojów rosną (limit na piętrze 7).
- `HudScene` to osobna scena nakładki, więc nie podlega zoomowi kamery.
- **Weryfikacja:** 500 pięter (piętra 1–10). Każde pole podłogi jest osiągalne ze startu, a start i boss to różne pokoje. W grze potwierdziliśmy kolizje ze ścianami w 4 kierunkach i przejście piętra.

## Krok 3 — Walka (podstawy)

**Cel (GDD §3):** HP, obrażenia, cooldowny, hitboxy, AI jako maszyna stanów, archetypy wręcz i dystansowy.

**Gracz:**
- Cios wręcz w łuku 110° w stronę kursora (LPM).
- Dash na Spacji lub PPM, w trakcie nietykalny.
- Nietykalność po trafieniu (miganie) i odrzut.
- Śmierć, potem R zaczyna nowy run (nowy seed, piętro 1).

**Czyste systemy:**
- `Timer`, `Health`, `AttackCycle` (zamach, potem uderzenie dokładnie raz, potem odnowienie), `DashController`.
- `CombatMath` (łuk ciosu z uwzględnieniem promienia celu, odrzut, skalowanie).
- `EnemyScaling`, `lineOfSight`, `EncounterPlanner`.

**AI (`EnemyBrain`):**
- Stany IDLE, CHASE i ATTACK. Gracza wykrywa tylko w linii wzroku.
- Po jej utracie idzie do ostatniej znanej pozycji gracza, a potem wraca do IDLE. Trafiony wróg rusza do pościgu.
- **Rusher:** podchodzi, przed ciosem świeci na pomarańczowo, trafienie sprawdzane jest dopiero w chwili uderzenia, więc da się uciec.
- **Kiter:** utrzymuje dystans, ucieka z bliska, strzela pociskami.

**Pozostałe:**
- Pociski zatrzymują się na ścianach. Dash przelatuje przez nie bez obrażeń.
- HUD: pasek HP, pasek gotowości dasha, liczba wrogów, ekran śmierci.

**Decyzje:**
- **Mało wrogów:** 1–2 na pokój. Pokój startowy i komnata bossa są puste. Trudność rośnie przez statystyki: +15% HP i +10% obrażeń na piętro.
- **Brak kolizji gracz–zwykły wróg:** gracz nie jest przepychany ani blokowany przez tłum.

**Weryfikacja:**
- Testy logiki przeszły. Wykryły błąd: AI zgłaszało stan sprzed decyzji o rezygnacji z pościgu (poprawione).
- W grze potwierdziliśmy pościg, telegraf, trafienia w obie strony, unik dashem, śmierć i restart.

**Odczucia gracza:** tempo i walka w porządku. Balans robimy później, gdy będzie gotowe podstawowe środowisko.

## Krok 4 — Boss i zamknięcie pętli piętra

**Cel (GDD §2 i §3):** komnata bossa z zablokowanym wyjściem, boss z sekwencyjnymi atakami obszarowymi, a jego pokonanie odblokowuje schody na kolejne piętro.

**Generator:**
- Arena bossa jest teraz umieszczana jako pierwsza i jest duża (11–13 kafli).
- Start to pokój najdalszy od areny, liczony po ścieżce.
- Wcześniej boss trafiał do „najdalszego” pokoju, który bywał mały (5×5).

**Boss „Strażnik Piętra”:**
- **`BossBrain` (czysty):** uśpiony, dopóki gracz nie wejdzie na arenę (albo go nie uderzy). Potem w kółko wykonuje sekwencję **Uderzenie → Nova → Ostrzał**.
- W trakcie ataku stoi w miejscu. Między atakami powoli podchodzi do gracza.
- **Wściekłość** poniżej 50% HP: telegrafy ×0,75, przerwy ×0,6, dodatkowa fala Novy i dodatkowa strefa Ostrzału.

**Plan ataku (`bossAttacks.ts`, czysta funkcja):**
- Cały atak jest rozpisany z góry w czasie: strefy (`AreaStrike`) i fale pocisków (`ProjectileBurst`).
- **Uderzenie:** strefa wokół bossa.
- **Nova:** pierścień 12 pocisków, kolejne fale obrócone o pół kroku, żeby nie było bezpiecznych linii.
- **Ostrzał:** 4 strefy wybuchające kolejno. Pierwsza celuje dokładnie w gracza, pozostałe losowo wokół niego.

**Wykonanie (`BossFight`, Phaser):**
- Rysuje telegrafy: czerwony okrąg z rosnącym wypełnieniem, pulsujący pierścień przed Novą.
- W chwili uderzenia rozstrzyga trafienie (`isHitByAreaStrike`) i wystrzeliwuje pociski.
- Po zwycięstwie otwiera schody.

**Pozostałe:**
- **Wspólny `MeleeResolver`:** cios gracza trafia wszystko, co implementuje `MeleeTarget` (zwykłych wrogów i bossa), bez powielania logiki.
- Boss jest ciężki: nie da się go przepchnąć ani odrzucić, a gracz nie przechodzi przez niego.
- HUD: pasek HP bossa u dołu ekranu, oznaczenie wściekłości, podpowiedź w trakcie walki.
- Skalowanie bossa z piętrem tymi samymi współczynnikami co zwykłych wrogów.
- `ProjectileSpec` przyjmuje teraz kierunek zamiast celu (potrzebne do pierścienia Novy).
- Klawisz B w trybie dev pokonuje bossa, czyli przechodzi tę samą ścieżkę co prawdziwe zwycięstwo.

**Weryfikacja:**
- 480 pięter: arena zawsze co najmniej 11×11, całe piętro spójne, start ≠ arena.
- Testy `BossBrain`:
  - kolejność sekwencji;
  - stanie w miejscu w trakcie ataku;
  - przestrzeganie przerw;
  - wściekłość;
  - czasy i skrócone telegrafy;
  - rozrzut stref;
  - skalowanie z piętrem.
- **W grze:**
  - Boss budzi się po wejściu gracza na arenę i wykonuje wszystkie 3 ataki.
  - Stojący w miejscu gracz traci 56 HP w 9 s.
  - Wściekłość zaczyna się przy 144/300 HP.
  - Po pokonaniu bossa schody się otwierają.
  - Piętro 2 ma silniejszego bossa (345 HP).

## Krok 5 — Testy w repozytorium (Vitest)

**Cel:** testy logiki zapisane na stałe w projekcie. Mają pilnować, żeby kolejne zmiany (balans, nowe mechaniki) niczego po cichu nie zepsuły.

**Narzędzia:**
- **Vitest 4.1.11** w `vitest.config.ts`. Dziedziczy aliasy `@/` z konfiguracji Vite i działa w środowisku Node, bez przeglądarki i bez Phasera.
- **Dlaczego nie Vitest 3:** najpierw zainstalował się Vitest 3, ale `npm audit` pokazał w nim znane podatności (m.in. krytyczną w `tinypool`). Wersja 4.1.11 jest poza zakresem podatności i wspiera Vite 6. Wynik: `found 0 vulnerabilities`.

**Skrypty i konfiguracja:**
- `npm test` i `npm run test:watch`.
- `npm run build` uruchamia teraz także testy.
- `tsconfig.json` obejmuje `tests/`, więc testy też są sprawdzane typami.

**Zestaw testów: 98 testów w 9 plikach.**

| Plik | Co sprawdza |
|---|---|
| `core/random` | determinizm, zakresy, rozróżnianie seedów pięter |
| `dungeon/DungeonGenerator` | 240 pięter: spójność, rodzaje pokojów, rozmiar areny, schody w arenie, ściany na krawędzi, determinizm, skalowanie, błąd przy za małej mapie |
| `dungeon/lineOfSight` | precyzyjne przypadki na mapie z rysunku ASCII |
| `dungeon/EncounterPlanner` | wrogowie tylko w zwykłych pokojach, limity, brak dwóch wrogów na jednym kaflu, proporcje typów |
| `systems/timing` | Timer, AttackCycle (fazy, uderzenie raz), DashController |
| `systems/combat` | Health, CombatMath (łuk przez ±π, promień celu), skalowanie, MeleeResolver |
| `ai/EnemyBrain` | wszystkie przejścia IDLE/CHASE/ATTACK, telegraf, szukanie gracza, `alert`, kiting |
| `ai/BossBrain` | uśpienie, sekwencja, przerwy, stanie w trakcie ataku, wściekłość, plany 3 ataków, trafienie strefą, skalowanie |
| `architecture` | izolacja warstwy czystej od Phasera |

**Pomocnik:** `tests/helpers/floors.ts` buduje piętro z rysunku ASCII, liczy osiągalne pola i daje zestaw wygenerowanych pięter.

**Weryfikacja, że testy łapią błędy:** celowo psuliśmy kod w dwóch miejscach, potem przywróciliśmy pliki.
- Import Phasera w `systems/Timer.ts` wyłapał test architektury.
- Wyłączenie korytarzy w generatorze wyłapały 2 testy spójności pięter.

**Przy pisaniu testów** dwa testy padły z powodu błędów w samych testach, nie w grze:
- Kierunek `-0` zamiast `0` (matematycznie to samo). Kierunki porównujemy teraz po składowych.
- Źle dobrana para punktów w teście linii wzroku: odcinek faktycznie przechodził przez ścianę. Zamieniliśmy go na osobny test zasłonięcia po skosie.

## Krok 6 — Łupy i postęp runu

**Cel (GDD §2):** zbieranie złota i przedmiotów w trakcie eksploracji i walki.

**Co wypada:**

| Źródło | Złoto | Mikstura (+HP) | Przedmiot |
|---|---|---|---|
| Rusher | 1–3 (80%) | 15 HP (12%) | 4% |
| Kiter | 2–4 (80%) | 15 HP (12%) | 5% |
| Boss | 15–25 (zawsze) | 30 HP (zawsze) | zawsze |

Złota przybywa o +20% na każde piętro.

**Przedmioty pasywne** (kumulują się, losowane według wag):

| Przedmiot | Efekt |
|---|---|
| Ostrze | +3 obrażeń |
| Serce | +20 maks. HP |
| Buty | +10% prędkości |
| Rękawice | -12% czasu ataku |
| Klepsydra | -20% odnowienia dasha |

**Limity statystyk:** cooldowny nie spadną poniżej 50% bazowych, a prędkość ruchu nie przekroczy +60%.

**Run przenoszony między piętrami:** `RunSnapshot` (złoto, przedmioty, HP) trafia do `scene.restart`.
- Wcześniej każde piętro zaczynało się od pełnego HP. Teraz HP się przenosi, więc mikstury i Serce mają znaczenie.
- Śmierć zaczyna run od zera.

**Warstwa czysta (bez Phasera, z testami):**
- `core/lootTypes.ts` — typy łupów i postępu.
- `systems/Loot.ts`:
  - `rollLoot`: każdy rodzaj łupu losowany niezależnie;
  - `pickWeightedItem`: losowanie ważone;
  - `splitGold`: podział złota na monety, suma zawsze się zgadza.
- `systems/PlayerLoadout.ts` — `computeLoadout`: bazowe statystyki + przedmioty → finalne statystyki, z limitami.
- `systems/RunState.ts` — złoto, przedmioty, migawka do przeniesienia.
- `Health` umie wystartować z przeniesionym HP i zmienić maksimum. Wzrost maksimum leczy o tę samą wartość.
- Liczby do strojenia są w `config/lootConfig.ts`.

**Warstwa Phasera:**
- `entities/Pickup.ts` i `combat/LootManager.ts`:
  - łupy rozsypują się z miejsca śmierci;
  - po 0,3 s przyciąga je magnes, gdy gracz jest bliżej niż 80 px;
  - zbierają się przy dotknięciu.
- **Mikstury zostają na ziemi, gdy gracz ma pełne HP**, więc można po nie wrócić.
- **Przedmiot:** natychmiastowa podmiana statystyk gracza (`Player.applyLoadout`) i komunikat na ekranie, np. „Ostrze: +3 obrażeń”.
- **Unoszące się napisy:** „+3” przy złocie, „+15 HP” przy miksturze.
- **HUD:** złoto, lista przedmiotów (z krotnością) i podsumowanie po śmierci („Piętro N · złoto X”).
- **Podpięcie:** `EnemyManager` ma callback `onEnemyKilled`, a `BossFight.onDefeated` przekazuje miejsce śmierci bossa. RNG łupów to osobny strumień od seeda piętra.

**Testy: +33, razem 131.**
- Zakresy i szanse zrzutów, w tym statystycznie na 5000 losowaniach.
- Proporcje wag przedmiotów.
- `splitGold` dla wielu kwot.
- Poprawność konfiguracji.
- Każdy przedmiot zmienia właściwą statystykę, kumulowanie, limity, brak mutacji bazowych obiektów.
- Przenoszenie HP i `setMax`.
- `RunState` i migawki.
- Test architektury objął nowe pliki automatycznie.

**Weryfikacja w grze:**
- 7 złota → 5 monet, zebrane.
- Mikstura ignorowana przy pełnym HP, zebrana po obrażeniach (70 → 85).
- Ostrze: obrażenia 12 → 15. Serce: 85/100 → 105/120.
- Zabity wróg zostawia łupy z tabeli.
- Boss: 5 monet, mikstura i przedmiot.
- Przejście na piętro 2 zachowuje złoto, 3 przedmioty i HP 95/120.
- Śmierć pokazuje podsumowanie, R zaczyna czysty run.

**Problem środowiska:** serwer Vite raz nie zauważył zmiany pliku (`BootScene.ts`), prawdopodobnie przez synchronizację OneDrive. Przeglądarka dostała starą wersję modułu (`ITEM_POOL is not defined`), mimo że kod na dysku i typy były poprawne.
- **Obejście:** `touch` pliku albo restart `npm run dev`.
- **Gdyby się powtarzało:** w `vite.config.ts` można włączyć `server.watch.usePolling: true` (kosztem CPU) albo przenieść projekt poza folder OneDrive.

## Krok 7 — Wynik, tablica rekordów i kapliczka

**Decyzje gracza (właściciela projektu):**
- Złoto jest końcowym wynikiem runu.
- Na ekranie śmierci jest skrócona tablica rekordów: top 3, a pod nią miejsce tego runu, jeśli nie trafił na podium.
- Kapliczka daje losowy bonus w zamian za ofiarę złota.
- Bonusy pochodzą z tej samej puli 5 bazowych przedmiotów (trzymamy się tego podejścia).
- Tempo gry ocenione jako przyjemne.

**Konsekwencja projektowa:** ofiara w kapliczce *zmniejsza wynik*. To świadomy wybór „moc teraz kontra punkty na koniec”. Gdyby wynik miał liczyć całe zebrane złoto, wystarczy zmiana w jednym miejscu: `handlePlayerDeath` w `GameScene`.

**Tablica rekordów:**
- **`systems/Highscores.ts` (czysty):**
  - ranking: wynik, przy remisie wyższe piętro; przy pełnym remisie starszy rekord zachowuje miejsce;
  - `insertScore` zwraca prawdziwe miejsce, także gdy wynik wypada poza zapisywane 50;
  - `buildScoreboard` daje podium i osobny wiersz dla runu spoza podium.
- **`persistence/HighscoreStorage.ts`:** nowa warstwa wejścia-wyjścia, bez Phasera.
  - Zapis w `localStorage` pod kluczem `tower-crawler.highscores.v1`.
  - Magazyn jest wstrzykiwany, więc w testach to atrapa.
  - Odporny na brak magazynu (tryb prywatny), uszkodzony JSON i błąd zapisu. Wtedy działa w pamięci, a gra toczy się dalej.
- **Panel śmierci w HUD:** wynik, piętro, miejsce, podium. Bieżący run jest wyróżniony (`► … ◄`, złoty kolor). Run spoza podium pojawia się pod `· · ·`.

**Kapliczka:**
- **`systems/Shrine.ts` (czysty):**
  - koszt: 15 złota na piętrze 1, +30% na każde kolejne;
  - `makeOffering` rozstrzyga ofiarę: odmowa przy użytej kapliczce, braku złota albo pustej puli, w przeciwnym razie losowy przedmiot z wagami jak przy łupach.
- **`dungeon/ShrinePlanner.ts` (czysty):** jedna kapliczka na piętro, na środku losowego zwykłego pokoju. Dopisany do listy warstwy czystej w teście architektury.
- **`world/ShrineSite.ts` (Phaser) i `entities/Shrine.ts`:**
  - w promieniu 40 px pojawia się podpowiedź: `[E] Ofiara: X złota` albo na czerwono `potrzeba X złota`;
  - **E** składa ofiarę;
  - po użyciu kula gaśnie (jedna ofiara na piętro);
  - na ekranie pojawia się komunikat z otrzymanym bonusem.
- `PlayerActions` ma nowe pole `interact` (klawisz E). Obsługuje je scena, nie gracz.
- **Nowy folder `world/`:** obiekty otoczenia, z którymi gracz wchodzi w interakcję. GameScene dostaje gotowy obiekt, zamiast rosnąć o kolejną logikę.

**Testy: +26, razem 157.**
- **Ranking:**
  - kolejność, remisy;
  - miejsce poza limitem zapisu;
  - brak mutacji listy wejściowej.
- **Widok tablicy:** run na podium, run poza podium, mniej wyników niż 3.
- **Magazyn:**
  - trwałość między instancjami;
  - podium i miejsce runu;
  - uszkodzone dane, brak magazynu, błąd zapisu.
- **Kapliczka:**
  - koszt rośnie z piętrem;
  - granica „dokładnie tyle złota, ile kosztuje”;
  - jedna ofiara na piętro, pusta pula;
  - z czasem wypada każdy z 5 przedmiotów;
  - kapliczka stoi tylko w zwykłym pokoju, a bez zwykłych pokojów jej nie ma.
- `RunState.spendGold`.

**Weryfikacja w grze:**
- **Kapliczka:**
  - przy 0 złota pokazuje „potrzeba 15 złota” i E nic nie robi;
  - przy 40 złota E zabiera 15 i daje przedmiot (komunikat „Kapliczka: Klepsydra — -20% odnowienia dasha”), a kula gaśnie;
  - druga ofiara na tym samym piętrze nic nie robi;
  - podpowiedź znika po odejściu.
- **Tablica rekordów (5 runów: 25, 80, 50, 10, 65 złota):**
  - miejsca 1, 1, 2, 4, 2;
  - run z 10 złota wyświetla się pod podium jako „► 4. … ◄”;
  - wyniki przetrwały przeładowanie strony.
- Testowe wpisy usunęliśmy z przeglądarki po weryfikacji.

---

## Krok 8 — Zamykanie areny bossa

**Cel:** walka z bossem bez odwrotu. Po rozpoczęciu walki wejścia do areny zamykają kraty, a po zwycięstwie kraty się podnoszą.

**Decyzja właściciela:** `#decyzja` wyszukiwanie drogi dla wrogów odkładamy na później, bo na razie jest mało istotne.

**Warstwa czysta: `dungeon/arenaGates.ts`** (dopisany do `PURE_FILES` w teście architektury):
- **`findRoomEntrances(floor, room)`:** kafle podłogi w pierścieniu tuż za obrysem pokoju, łącznie z narożnikami (przejście po skosie). To są miejsca na kraty.
- **`isDeepInsideRoom(room, tile, margin)`:** czy kafel leży co najmniej `margin` kafli od krawędzi pokoju.
- **`ArenaGateLock`:** maszyna stanów `Open → Sealed → Released`. `update()` zwraca zmianę do wykonania (`'seal'`, `'release'` albo `null`).
  - Kraty opadają, gdy boss walczy, a gracz stoi w głębi areny (margines 1 kafla). Dzięki temu krata nigdy nie spada na gracza stojącego w przejściu. Boss budzi się już na krawędzi areny, więc przez chwilę da się jeszcze wycofać.
  - Po pokonaniu bossa kraty podnoszą się na stałe.
  - Boss pokonany przed zamknięciem krat (np. klawisz B) nie zamyka ich już nigdy.

**Warstwa Phasera:**
- Nowy kafel `TileType.Gate`: żelazne pręty z pomarańczową obwódką, celowo inne niż czerwone kraty zamkniętych schodów.
  - `DungeonView` nadaje kolizję ścianom i kratom.
  - Krata blokuje gracza, wrogów, bossa, łupy i pociski, bo wszystkie zderzają się z tą samą warstwą.
- **`world/ArenaGates.ts`:** wykonuje decyzje `ArenaGateLock`.
  - Przy zamknięciu: podmiana kafli, błysk na każdej kracie, wstrząs kamery i komunikat „Kraty opadły — nie ma odwrotu!”.
  - Przy otwarciu: przywraca kafle z danych piętra.
- `BossFight` wystawia `isFighting` i `isDefeated`.
- Liczby (margines, wstrząs) są w `ARENA_GATES` w `config/bossConfig.ts`.
- `.claude/launch.json`: druga konfiguracja `dev-alt` na porcie 5174, gdy 5173 zajmuje inny serwer.

**Testy: +12, razem 169.**
- Wejścia na mapach ASCII: korytarze z dwóch stron, pokój bez wejść, wejście po skosie przez narożnik.
- **Test właściwości na 240 piętrach:** arena zawsze ma co najmniej jedno wejście, żadne nie leży w środku areny. Po zamknięciu wejść da się dojść tylko do kafli areny.
- `isDeepInsideRoom`: granice przy marginesie 1 i 0.
- `ArenaGateLock`:
  - śpiący boss nie zamyka krat;
  - kraty czekają, aż gracz zejdzie z krawędzi;
  - zamknięcie następuje tylko raz;
  - otwarcie po zwycięstwie jest trwałe;
  - zwycięstwo przed zamknięciem.

**Weryfikacja w grze (port 5174, ręczne `game.step()`):**
- Gracz na skrajnym kaflu areny budzi bossa, ale kraty zostają otwarte. W głębi areny kraty opadają (2 kafle, kolizja włączona) i pojawia się komunikat.
- Próba ucieczki: gracz pchany w stronę kraty zatrzymuje się na niej (y = 21,4 przy kracie na y = 20). Po zwycięstwie ten sam ruch wyprowadza go z areny (y = 18,5).
- Po pokonaniu bossa kafle wracają do podłogi, stan `released`.

**Znane ograniczenie:** jeśli zwykły wróg stoi w przejściu dokładnie w chwili opadnięcia krat, fizyka wypycha go na jedną ze stron. Zdarza się rzadko i nie psuje gry.

---

## Krok 9 — Atak dystansowy gracza (PPM)

**Cel:** druga broń gracza pod PPM, z własnym ograniczeniem niezależnym od ciosu wręcz.

**Decyzje właściciela:** `#decyzja`
- Strzał ma **ładunki odnawiające się z czasem**: 3 ładunki, każdy wraca po 1,4 s.
- Odrzucone warianty: osobny cooldown (za mało decyzji) i amunicja z łupów (zmieniałaby ekonomię łupów).

**Konsekwencja w sterowaniu:** PPM był dotąd drugim klawiszem dasha. Teraz dash jest tylko pod Spacją, a PPM to strzał. Zgadza się to z GDD, gdzie PPM to „dash lub umiejętność”. README jest zaktualizowane.

**Warstwa czysta:**
- **`systems/ChargePool.ts`:** pula ładunków liczona leniwie z jawnego `now`.
  - Ładunki wracają po jednym.
  - Zużycie w trakcie ładowania nie zeruje postępu kolejnego ładunku.
  - Po napełnieniu odliczanie startuje od następnego strzału.
- **`systems/ShotResolver.ts`:** `resolvePlayerShot` trafia najbliższy cel stykający się z pociskiem, tylko jeden.
  - Odrzut działa w kierunku lotu.
  - Źródłem alarmu dla wroga jest miejsce wystrzału, więc trafiony wróg odwraca się do strzelca.
  - Korzysta z tego samego interfejsu `MeleeTarget` co cios wręcz, więc trafia zwykłych wrogów i bossa bez powielania logiki.
- **`RangedConfig` w `PLAYER_COMBAT.ranged`:** 7 obrażeń (cios wręcz zadaje 12), prędkość 460 px/s, lot 650 ms (ok. 300 px), odstęp między strzałami 200 ms.
  - Strzał celowo jest słabszy od ciosu: ma uzupełniać walkę (Kitery, dobijanie), a nie ją zastępować.
  - Test pilnuje tej relacji.

**Warstwa Phasera:**
- **`InputController`:** nowe pole `shoot`. Przytrzymanie PPM daje serię co 200 ms, dopóki są ładunki. Krótki klik jest zapamiętywany do najbliższej klatki.
- **`Player.tick`:** zwraca teraz `{ struck, shot }` zamiast samego `boolean`.
  - Ładunki przetrwają zdobycie przedmiotu.
  - Przedmioty na razie nie wpływają na strzał.
- **`combat/PlayerShotManager.ts`:** lot pocisków gracza, rozbijanie o ściany i kraty areny, wygasanie.
  - Trafienia rozstrzyga resolver przekazany przez scenę: najpierw wrogowie, potem boss.
  - `EnemyManager` i `BossFight` mają metodę `resolvePlayerShot`.
- **Wygląd:**
  - Pocisk gracza jest turkusowy, odróżnia się od pomarańczowych pocisków wrogów.
  - W HUD pod paskiem dasha są 3 segmenty ładunków w tym samym kolorze. Ładowany segment wypełnia się stopniowo.
  - Linia pomocy u dołu ekranu jest zaktualizowana.

**Testy: +14, razem 183.**
- `ChargePool`:
  - seria do opróżnienia;
  - odnawianie po jednym;
  - limit przy długiej przerwie;
  - zużycie w trakcie ładowania;
  - start odliczania po napełnieniu;
  - gotowość pełnej puli.
- `resolvePlayerShot`:
  - pudło;
  - trafienie na styku promieni;
  - tylko najbliższy cel;
  - kierunek odrzutu i źródło alarmu;
  - zabicie;
  - strzał słabszy od ciosu.

**Weryfikacja w grze (port 5174, ręczne `game.step()`):**
- Przytrzymanie PPM przez ok. 1 s daje dokładnie 3 strzały, potem pula jest pusta i się ładuje.
- Rusher: 30 → 23 HP. Boss: 300 → 293 HP, a strzał go budzi.
- Strzał w ścianę z 1 kafla znika po ok. 130 ms, nie leci przez całe 650 ms.
- HUD pokazuje 1 pełny ładunek, 1 ładowany i 1 pusty.

**Otwarte pytania (balans):**
- **Boss z korytarza:** strzał budzi i rani bossa, zanim gracz wejdzie na arenę, a kraty opadają dopiero wtedy, gdy gracz jest w środku. Teoretycznie da się więc ostrzeliwać bossa z korytarza. Boss podchodzi do gracza, więc w praktyce to trudne, ale warto to sprawdzić w grze.
- **Przedmioty a strzał:** czy Ostrze albo Rękawice mają wzmacniać strzał? Na razie nie wzmacniają.

---

## Krok 10 — Przedmioty z efektem broni

**Cel:** 7 nowych, rzadszych przedmiotów, które zmieniają działanie broni, a nie tylko liczby.

**Decyzje właściciela:** `#decyzja`
- **Zmiana zasady puli.** Do 5 bazowych przedmiotów dochodzi 7 z efektem. Pula ma teraz 12 pozycji i jest opisana w CLAUDE.md.
- **Przedmioty:**
  - trzy zamówione przez właściciela: Szuriken, Elektryczna strzała, Ognista pięść;
  - wszystkie 4 propozycje Claude'a: Kołczan, Wampirzy kieł, Burzowy pęd, Lodowy odłamek.
- **Kumulacja:** kolejne kopie wzmacniają efekt.
- **Elektryczna strzała** działa na wszystkich. Bossa ogłusza krócej i po ogłuszeniu daje mu odporność.
- **Ewolucje przedmiotów** (np. stały ognisty promień, grad ciosów wręcz) to następny krok, do zaprojektowania razem.

**Przedmioty** (pierwsza kopia / każda kolejna; wszystkie liczby w `ITEM_EFFECTS` w `config/lootConfig.ts`):

| Przedmiot | Efekt | Kolejna kopia |
|---|---|---|
| Szuriken | strzał przebija 1 wroga (wiruje w locie) | +1 przebity wróg |
| Elektryczna strzała | strzał ogłusza na 900 ms (boss: 40% czasu, potem 3 s odporności) | +300 ms |
| Ognista pięść | cios podpala: 3 obrażenia co 0,5 s przez 2 s | +2 obrażenia na tyknięcie |
| Kołczan | +1 ładunek strzału (limit 6) | +1 ładunek |
| Wampirzy kieł | cios, który trafi, leczy 2 HP (raz na cios) | +2 HP |
| Burzowy pęd | dash zadaje 10 obrażeń dotkniętym wrogom (każdemu raz na dash) | +6 |
| Lodowy odłamek | strzał spowalnia o 40% na 1,5 s (boss: połowa siły) | +10%, limit 70% |

- **Rzadkość:** każdy przedmiot z efektem ma wagę 3, bazowe mają 5–10. Test pilnuje, żeby przedmiot z efektem był rzadszy od każdego bazowego.
- **Wygląd na ziemi:** przedmiot z efektem to gwiazda ze złotym obrysem, bazowy to romb.

**Warstwa czysta:**
- **`systems/StatusEffects.ts`:** podpalenie, spowolnienie i ogłuszenie na celu.
  - Ten sam status się nie sumuje. Silniejszy lub dłuższy zastępuje słabszy, a ponowne podpalenie odświeża czas, ale nie przyspiesza tykania.
  - Odporność celu (`StatusResistance`) skraca ogłuszenie, osłabia spowolnienie i po ogłuszeniu daje okno odporności.
  - Wrogowie mają `ENEMY_STATUS_RESISTANCE`, a boss `BOSS_STATUS_RESISTANCE`.
- **`systems/WeaponEffects.ts`:** `computeWeaponEffects` zamienia listę przedmiotów na `WeaponEffects`, czyli przebicie, statusy strzału i ciosu, leczenie i obrażenia dasha.
- **`PlayerLoadout`:** niesie teraz `effects`. Kołczan działa jako zwykły modyfikator (`rangedCharges`) z limitem w `STAT_LIMITS`.
- **`Hit`:** ma opcjonalne `status`. Cios, strzał i dash korzystają z tego samego interfejsu `MeleeTarget`.
- **`resolveMeleeSwing`:** zwraca `{ hit, killed }`, bo Wampirzy kieł potrzebuje wiedzieć, czy cios trafił.
- **`resolvePlayerShot`:** pomija cele z `ignore`, czyli już przebite.
- **Nowy `systems/DashStrike.ts`:** `resolveDashSweep` rani dotknięte cele raz na dash.
- **Pozostałe:**
  - `ChargePool.resize`: nowe miejsca od Kołczanu przychodzą naładowane, a trwające ładowanie nie jest przerywane;
  - `AttackCycle.interrupt`: ogłuszenie przerywa zamach wroga;
  - `BossBrain.delay`: ogłuszenie odsuwa kolejny atak bossa. Atak już rozpisany w czasie, z widocznymi telegrafami, dobiega końca.

**Warstwa Phasera:**
- **Wróg:** ogłuszony stoi i nie atakuje, spowolniony chodzi wolniej. Podpalenie tyka w `EnemyManager.update`, a śmierć od ognia przechodzi tą samą ścieżką co zabicie, łącznie z łupami.
- **Boss:**
  - ogłuszony stoi;
  - każdy kolejny atak przesuwa się o czas ogłuszenia;
  - podpalenie może go dobić, wtedy otwierają się schody i kraty.
- **Kolory statusów** (`effects/statusTints.ts`): ogłuszenie żółte, podpalenie migocze pomarańczowo, spowolnienie błękitne. Obrażenia od ognia i od dasha pokazują się jako unoszące się liczby.
- **`PlayerShotManager`:** pocisk pamięta trafione cele i liczbę pozostałych przebić.
- **`GameScene`:** podaje statusy do ciosu, leczy po trafionym ciosie i śledzi trafienia Burzowym pędem osobno dla każdego dasha.
- **HUD:** lista przedmiotów zawija się, bo nazwy są teraz dłuższe.

**Testy: +26, razem 209.**
- Pula: 5 + 7, unikalne id, przedmiot z efektem rzadszy od bazowego, każdy przedmiot ma realne działanie.
- `computeWeaponEffects`:
  - brak efektów bez przedmiotów;
  - każdy przedmiot daje swój efekt;
  - kumulacja;
  - limit spowolnienia;
  - ogłuszenie i spowolnienie naraz.
- Kołczan: limit ładunków, `resize`.
- `StatusEffects`:
  - tykanie podpalenia;
  - odświeżanie;
  - silniejsze podpalenie wygrywa;
  - spowolnienie;
  - odporność bossa;
  - pełne ogłuszenie zwykłego wroga.
- Trafienia przenoszą statusy, przebicie pomija trafione cele, dash rani raz na dash.
- `AttackCycle.interrupt`, `BossBrain.delay`.

**Weryfikacja w grze (port 5174, ręczne `game.step()`, nieśmiertelność gracza podmieniona w konsoli tylko na czas testu):**
- **Szuriken:** strzał trafia dwóch ustawionych w linii wrogów (30 → 23 obaj). Bez Szurikena dostaje tylko pierwszy.
- **Elektryczna i lodowa strzała:** wróg ogłuszony i stoi w miejscu, prędkość ×0,6. Po 900 ms ogłuszenie mija, a spowolnienie jeszcze trwa.
- **Ognista pięść:** cios 30 → 18, potem podpalenie 18 → 6 (4 tyknięcia po 3).
- **Wampirzy kieł:** trafiony cios leczy +2 HP.
- **Kołczan:** 3 → 4 ładunki.
- **Burzowy pęd:** dash przez wroga 30 → 20, kolejny dash 20 → 10.
- **Boss:** ogłuszony na 360 ms, następny atak przesunięty o 360 ms. Druga strzała w czasie odporności trafia, ale nie ogłusza.
- Testowy wpis rekordów (śmierć gracza w pierwszej próbie testu) został usunięty z `localStorage`.

---

## Krok 11 — Modyfikatory pięter

**Cel (GDD §2.5):** piętra różnią się nie tylko liczbami. Każde piętro od drugiego ma jeden modyfikator.

**Decyzje właściciela:** `#decyzja`
- Pula 6 modyfikatorów zaakceptowana w całości, razem z Mrokiem.
- **Ewolucje przedmiotów odrzucone na obecnym etapie.** Nie komplikujemy sterowania ani działania broni, a wzmacnianie kolejnymi kopiami zostaje. Zmiana jest zapisana w CLAUDE.md i w backlogu.

| Modyfikator | Efekt |
|---|---|
| Gorączka | wrogowie szybsi o 20% |
| Twarda skóra | wrogowie mają +30% HP |
| Złota żyła | +50% złota z wrogów, ale zadają +15% obrażeń |
| Mrok | widać tylko krąg o promieniu 150 px wokół gracza |
| Wyczerpanie | dash i ładunki strzału odnawiają się o 30% wolniej |
| Kapliczka łaski | ofiara kosztuje o połowę mniej |

**Zasady:**
- **Piętro 1 jest zawsze czyste.** Od piętra 2 (`FLOOR_MODIFIER_CONFIG.firstFloor`) każde piętro ma jeden modyfikator.
- **Ten sam modyfikator nigdy nie wypada dwa piętra z rzędu.**
  - Losowanie jest deterministyczne z seeda runu.
  - `floorModifierFor` liczy kolejne piętra od pierwszego z modyfikatorem, więc nie trzeba przenosić stanu między piętrami.
- **„Wrogowie” to zwykli przeciwnicy.** Boss ma własną krzywą trudności i modyfikatory go nie zmieniają.

**Warstwa czysta:**
- `core/floorModifierTypes.ts`: typy.
- `config/floorModifierConfig.ts`: pula i liczby.
- `systems/FloorModifiers.ts`:
  - `floorModifierFor` losuje modyfikator piętra;
  - `floorEffectsOf` uzupełnia brakujące pola wartościami neutralnymi;
  - funkcje `applyFloorTo*` nakładają efekty na wroga, łupy wroga, loadout gracza i kapliczkę.

**Warstwa Phasera:**
- `GameScene` wybiera modyfikator w `create()` i przekazuje efekty:
  - do `EnemyManager` (definicje wrogów);
  - do łupów wrogów;
  - do `currentLoadout()` (Wyczerpanie);
  - do `ShrineSite`, który dostaje teraz `config` zamiast stałej.
- **`effects/DarknessOverlay.ts`:** tekstura canvas 1800×1800 z gradientem radialnym (miękka krawędź kręgu), przesuwana za graczem. Leży nad encjami i telegrafami, pod liczbami obrażeń. Działa czysto wizualnie.
- **HUD:** nazwa i opis modyfikatora obok numeru piętra. Na start piętra pojawia się komunikat (4,5 s).

**Testy: +14.**
- Piętro 1 jest czyste, od piętra 2 zawsze jest modyfikator.
- Determinizm.
- Brak powtórzeń dwa piętra z rzędu (200 runów × 8 pięter).
- Każdy modyfikator z czasem wypada; pusta pula nic nie daje.
- Efekt każdego modyfikatora z osobna; brak modyfikatora nic nie zmienia.

**Weryfikacja w grze (port 5174):** seedy z każdym modyfikatorem na piętrze 2 znalezione przez import modułu w konsoli.
- **Mrok:** krąg widoczności z miękką krawędzią, opis w HUD (zrzut ekranu).
- **Gorączka:** prędkość Rushera 115 → 138.
- **Twarda skóra:** HP 35 → 46.
- **Złota żyła:** obrażenia 11 → 13.
- **Wyczerpanie:** dash 700 → 910 ms, ładunek 1400 → 1820 ms.
- **Kapliczka łaski:** koszt bazowy 15 → 7,5.

---

## Krok 12 — Karty nagrody za bossa

**Cel (decyzja właściciela):** `#decyzja` po pokonaniu bossa gra się zatrzymuje, a gracz wybiera jeden z 3 losowych przedmiotów.

**Zasady:**
- **Karty:**
  - 3 różne przedmioty (`BOSS_REWARD.choices`) losowane z wagami z całej puli 12;
  - przedmioty z efektem pojawiają się rzadziej, zgodnie z wagami;
  - losowanie jest deterministyczne z seeda piętra (osobna sól).
- **Łup bossa:** boss zostawia już tylko złoto i miksturę (`BOSS_LOOT.itemChance = 0`). Przedmiot pochodzi wyłącznie z kart.
- **Opis karty:** ikona, nazwa i efekt, rodzaj („przedmiot bazowy” albo złoty „efekt broni”) oraz „nowy” albo „masz już: ×N (wzmocni)”.

**Warstwa czysta:** `systems/RewardChoice.ts`, czyli `rollItemChoices`: losowanie z wagami bez powtórzeń, nie zmienia puli wejściowej.

**Warstwa Phasera:**
- **Nowa scena `scenes/RewardScene.ts`:** przyciemnione tło i 3 karty z podświetleniem po najechaniu.
  - Wybór kliknięciem albo klawiszem 1–3.
  - Wybór następuje na *puszczenie* przycisku, żeby klik nie zamienił się w cios po wznowieniu gry.
- **`GameScene.offerBossReward`:** `scene.pause()` wstrzymuje grę (fizykę, wrogów, pociski i czas sceny), a `scene.launch(Reward)` otwiera karty. Po wyborze gra rusza dalej, a przedmiot dodaje wspólna metoda `grantItem` (ta sama co przy podniesieniu łupu).
- Schody otwierają się jeszcze przed wyświetleniem kart, a złoto i mikstura leżą na ziemi.

**Testy: +8, razem 231.**
- `rollItemChoices`:
  - 3 różne karty;
  - determinizm;
  - mała i pusta pula;
  - brak mutacji puli;
  - częstsze przedmioty częściej, a każdy przedmiot czasem trafia na kartę.
- Test łupów bossa zaktualizowany: tylko złoto i mikstura.

**Weryfikacja w grze (port 5174):**
- Klawisz B (pokonanie bossa) wstrzymuje GameScene i pokazuje 3 karty (Ostrze, Serce, Elektryczna strzała; zrzut ekranu).
- Prawdziwy klawisz „3”: Elektryczna strzała dodana, efekt aktywny, komunikat widoczny, gra wznowiona, schody otwarte.
- Kliknięcie myszą w kartę 1 na innym piętrze: Buty dodane, gra wznowiona.

---

## Krok 13 — Sprite'y postaci i ochrona kart nagrody

**Zgłoszenie właściciela z testów:** na pierwszych piętrach karty nagrody mignęły i zniknęły. Przypadkowe kliknięcie LPM wybrało przedmiot mimochodem. Gracz zwykle trzyma LPM w walce, gdy boss pada, a stara wersja wybierała kartę już na samo *puszczenie* przycisku nad kartą.

**Ochrona kart (`RewardScene`):**
- **Uaktywnienie po czasie:** przez `BOSS_REWARD.armDelayMs` (900 ms) karty są przygaszone i nie reagują. Rozjaśniają się, a aktywne stają się dokładnie po zakończeniu rozjaśniania. Podpowiedź „Wybierz nagrodę…” pojawia się dopiero wtedy.
- **Pełne kliknięcie:** wciśnięcie *i* puszczenie przycisku na tej samej karcie, po uaktywnieniu. Puszczenie przycisku trzymanego od walki niczego nie wybiera, a zjechanie z karty kasuje wciśnięcie.
- **Klawisze 1–3:** liczą się tylko wtedy, gdy zostały wciśnięte po uaktywnieniu kart.

**Sprite'y (paczka „Long-handed arcade slasher”, handoff właściciela):**
- **Pliki** są w `public/assets/sprites/`:
  - `blond-barbarian_walk.png`: bohater;
  - `trashcan-man_walk.png`: Rusher;
  - `demon-mage_float-cast.png`: Kiter;
  - `demon-mage_orb.png`: pocisk maga.
- **Format:** komórka 48×48 z pivotem w środku, postać ma ok. 32 px. Wiersze to 8 kierunków (N, NE, … NW), animacje mają 6 fps.
- **Boss** zostaje na razie geometryczny, bo nie ma dla niego sprite'a.
- **`config/spriteConfig.ts` (czysty):**
  - opis arkuszy przepisany z `sprites.json`;
  - przypisanie wyglądu do archetypów (`ENEMY_VISUALS`, `PLAYER_VISUAL`);
  - parametry pocisku maga;
  - `animationKey`.
- **`systems/Facing.ts` (czysty):**
  - `facingDirection` zamienia wektor na wiersz arkusza wg reguły z handoffu `round(kąt/45) % 8`, gdzie 0° to góra, a kąt rośnie zgodnie z zegarem;
  - wektor zerowy zachowuje kierunek;
  - `sheetFrameIndex` liczy indeks klatki w arkuszu.
- **Phaser:**
  - `effects/spriteAnimations.ts`: ładowanie arkuszy w `BootScene.preload` i rejestracja animacji, osobnej dla każdej pary (animacja, kierunek).
  - `entities/DirectionalAnimator.ts`: encja mówi tylko, dokąd patrzy i co robi. Zmiana kierunku w trakcie chodu zachowuje klatkę, a ta sama animacja nie restartuje się co klatkę.
- **Zachowanie postaci:**
  - **Barbarzyńca:** patrzy tam, gdzie celuje mysz, i idzie, gdy się porusza. Ciało fizyczne zostaje 24×24 pośrodku klatki 48×48, więc kolizje są bez zmian.
  - **Wrogowie:** ciało okrągłe o promieniu z definicji, wyśrodkowane w klatce. Patrzą w kierunku ruchu, a stojąc — na widocznego gracza.
  - **Rusher:** chodzi albo stoi. Pomarańczowy telegraf zamachu zostaje.
  - **Mag:** cały czas się unosi. W zamachu odwraca się do gracza i rzuca; animacja rzutu trwa dokładnie `windupMs`, więc kula wylatuje razem z końcem rzutu. Logika walki zostaje nadrzędna, a animacja tylko się do niej dopasowuje.
- **Pocisk maga:** animowana zielona kula (`Projectile` jest teraz animowalnym sprite'em). Startuje 13 px przed magiem, jak w handoffie. Ciało ma ten sam promień co wcześniej, wyśrodkowane w klatce 16×16.
- **Porządki:** usunięte geometryczne placeholdery gracza i wrogów (`TextureKey.Player`, `enemyTextureKey`, `PLAYER_COLOR`).

**Testy: +16, razem 247.**
- `facingDirection`: 8 kierunków, zaokrąglanie do najbliższego, wektor zerowy.
- `sheetFrameIndex`.
- Arkusze:
  - każdy plik PNG istnieje, a jego wymiary odczytane z nagłówka zgadzają się z konfiguracją;
  - wiersze to kierunki, a klatki animacji mieszczą się w wierszu;
  - gracz i wrogowie używają istniejących animacji;
  - klucze animacji są unikalne.

**Weryfikacja w grze (port 5174):**
- **Sprite'y:** barbarzyńca, Rusher i mag używają swoich arkuszy i animacji (zrzut ekranu). Ciała fizyczne: gracz 24×24 z przesunięciem 12, Rusher okrąg 22 px.
- **Rzut maga:** zaczyna się razem z zamachem, 100 ms na klatkę (4 × 100 = 400 ms = `windupMs`). Kula wylatuje po 25 klatkach (400 ms), 13 px przed magiem, z wyśrodkowanym ciałem.
- **Karty:**
  - prawdziwy klik w kartę w pierwszej chwili jest ignorowany;
  - rozjaśnianie trwa 0 → 0,87 s, a karty uaktywniają się przy pełnej widoczności;
  - samo puszczenie przycisku nad kartą jest ignorowane;
  - prawdziwy klik po uaktywnieniu wybiera kartę (Wampirzy kieł) i wznawia grę.
- **Uwaga do testów w panelu w tle:** menedżer tweenów Phasera liczy czas z zegara ściennego, więc przy ręcznym `game.step()` trzeba robić prawdziwe przerwy między krokami.

---

## Krok 14 — Balans: przegląd liczb i testy balansu

**Zlecenie właściciela:** „popraw balans”, bez konkretnych objawów z testów. Właściciel przygotowuje w tym czasie sprite bossa.

**Podejście:** zamiast zgadywać, przeliczyliśmy liczby z `config/` dla pięter 1–10 przy typowym przebiegu runu: ile ciosów potrzeba na wroga i bossa, ile złota daje piętro, ile daje każdy przedmiot z efektem. Zmieniamy tylko to, co wyraźnie odstaje. Resztę stroimy po testach właściciela.

**Wnioski z przeglądu (bez zmian):**
- **Krzywa wrogów jest w porządku:**
  - na piętrze 1 Rusher pada od 3 ciosów, a Kiter od 2;
  - na piętrze 10 bez przedmiotów potrzeba 6 ciosów;
  - z Ostrzami wybieranymi z kart zostaje ok. 3 ciosów, więc trudność zależy od wyborów gracza.
- **Boss na piętrze 1:** 25 ciosów bez przedmiotów, czyli walka, a nie formalność.
- **Ekonomia:** ofiara w kapliczce kosztuje przez cały run ok. 40–45% oczekiwanego złota z piętra, więc wybór „moc teraz kontra wynik” pozostaje realny.
- **Strzał** zostaje bez zmian, bo właściciel ocenił go dobrze. Pełna seria ładunków (3 × 7) zabija Kitera z piętra 1.

**Poprawki (dwa przedmioty z kroku 10 odstawały):**

| Co | Przed | Po | Dlaczego |
|---|---|---|---|
| Wampirzy kieł | 2 HP za każdy trafiony cios (co 0,32 s) = 6,25 HP/s | najwyżej raz na 0,7 s = ok. 2,9 HP/s | wcześniej ok. 60% obrażeń Rushera (10/s); kieł unieważniał zagrożenie zwykłych wrogów |
| Elektryczna strzała na zwykłych wrogach | ogłuszenie 0,9 s + odporność 0,5 s = do 64% czasu w ogłuszeniu | odporność 1,2 s = najwyżej ok. 43% | przy 3 ładunkach dało się trzymać wroga w ogłuszeniu bez przerwy |

**Kod:**
- `ITEM_EFFECTS.vampireFang.cooldownMs`, w `WeaponEffects` jako `meleeHealCooldownMs` (0 bez kła).
- `GameScene` pilnuje odstępu `Timer`em, który resetuje się z piętrem.
- `ENEMY_STATUS_RESISTANCE.stunImmunityMs`: 500 → 1200. Odporność bossa się nie zmienia.

**Nowe testy `tests/balance/balance.test.ts` (+9, razem 256).** Mają szerokie progi: pilnują kształtu krzywej, a nie dokładnych liczb.
- Piętro 1: Rusher od 3 ciosów, Kiter od 2. Piętro 10 bez przedmiotów: ≤ 7 ciosów.
- HP i obrażenia wrogów i bossa nie maleją z piętrem.
- Boss na piętrze 1: 20–30 ciosów.
- Strzał słabszy od ciosu, ale seria ładunków zabija Kitera z piętra 1.
- Ofiara w kapliczce kosztuje 25–60% oczekiwanego złota z piętra, na każdym piętrze 1–10.
- Przedmioty z efektem:
  - Wampirzy kieł leczy ≤ ~1/3 DPS Rushera;
  - Elektryczna strzała (1–2 kopie) ogłusza ≤ 50% czasu;
  - podpalenie daje < 50% DPS ciosów.
- **Sprawdzone:** na starych wartościach testy kła i strzały nie przechodzą, a na nowych przechodzą.

**Korekta w trakcie pracy:** pierwsze szacunki w rozmowie z właścicielem były zawyżone. Podałem ~7,4 obrażeń/s Rushera, a jest 10/s, bo cooldown liczy się od początku zamachu. Podałem też „ponad 150 HP” leczenia w walce z bossem, a jest najwyżej ok. 50 HP, bo leczenie ogranicza liczba trafień, nie czas walki. Wniosek o poprawce się nie zmienił, liczby w tabeli powyżej są poprawne.

**Weryfikacja w grze (port 5174):** gracz z kłem bije wroga bez przerwy. Leczenie pada co 960 ms (pierwszy cios po upływie 0,7 s), czyli co trzeci cios.

**Do decyzji właściciela (backlog):** ostrzał bossa z korytarza przed opadnięciem krat.

**Ocena właściciela po teście:** `#ocena` gra wydaje się trudniejsza, co mu się podoba — kierunek jest dobry. Nie łagodzimy trudności przy kolejnych zmianach bez sygnału z testów.

---

## Krok 15 — Sprite bossa (Sludge King)

**Materiał od właściciela:** `sludge-king_move-spit.png` (768×768) i `sludge-king_glob.png` (64×16), zapisane w `OneDrive\Pictures\sprites`. Tym razem bez `sprites.json`, więc układ odczytaliśmy z obrazu (powiększone wiersze N i S):
- komórka 96×96, czyli dwa razy więcej niż u zwykłych postaci;
- 8 wierszy kierunków jak w pierwszej paczce (0 = N, zgodnie z zegarem);
- kolumny 0–3 to ruch (kołysanie), a kolumny 4–7 plucie (nadymanie, otwarcie paszczy, w kolumnie 7 wylatuje kula);
- kula ma 4 klatki 16×16.

**Zasady ustalone z właścicielem (zapisane w CLAUDE.md):**
- **Sprite'y:** właściciel zapisuje je w `OneDrive\Pictures\sprites`, a Claude kopiuje je do `public/assets/sprites` i opisuje w `config/spriteConfig.ts`. Najlepiej z krótkim opisem układu klatek; bez niego układ odczytujemy z obrazu.
- **Trudność:** gra ma być wymagająca. Nie łagodzimy trudności bez sygnału z testów właściciela (notatka do kroku 14).

**Przypisanie animacji (decyzja Claude'a, do korekty przez właściciela):**
- **Ruch** gra w pętli, także w miejscu, bo działa jak oddech.
- **Uśpiony boss** patrzy w kamerę (S). W walce zawsze patrzy na gracza.
- **Plucie przed Novą i Ostrzałem.** Animacja trwa do pierwszego wystrzału albo wybuchu (`attackLeadTimeMs`, czyli telegraf, krótszy przy wściekłości), a ostatnia klatka trzyma się do końca ataku.
- **Uderzenie bez plucia,** bo strefa wokół bossa jest czytelna sama w sobie.
- **Fale Novy** to animowane kule szlamu zamiast pomarańczowych kółek.
- **Ogłuszony boss** zamiera w bieżącej klatce.

**Kod:**
- `config/spriteConfig.ts`: arkusze `sludgeKing` i `sludgeGlob`, `BOSS_VISUAL` (z listą ataków z pluciem), `BOSS_PROJECTILE_VISUAL`.
- `ai/bossAttacks.ts` (czysty): `attackLeadTimeMs(plan, now)`, czyli czas do pierwszego wystrzału lub wybuchu.
- `entities/Boss.ts`:
  - sprite z arkusza;
  - ciało o promieniu z definicji wyśrodkowane w klatce 96×96, więc kolizje bez zmian;
  - `updateAnimation` wybiera animację.
- `DirectionalAnimator.restart`: kolejne plucie w tym samym kierunku zaczyna się od pierwszej klatki.
- Usunięta geometryczna tekstura bossa (`TextureKey.Boss`).

**Testy: +5, razem 261.**
- `attackLeadTimeMs`: Nova, Uderzenie, Ostrzał, skrócenie przy wściekłości, plan, który już minął, pusty plan.
- Test arkuszy sam objął nowe pliki: wymiary PNG, wiersze i klatki.
- Boss dopisany do testu „używane animacje istnieją”.

**Weryfikacja w grze (port 5174):**
- Uśpiony boss: `move-4` (S), ciało 52 px z przesunięciem 22 w klatce 96×96.
- W walce, z graczem po lewej, kolejno:
  - Uderzenie bez plucia;
  - plucie przed Novą w 3600 ms;
  - 12 kul szlamu w 4304 ms (+700 ms = telegraf Novy);
  - powrót do ruchu w 4608 ms (+300 ms regeneracji);
  - plucie przed Ostrzałem.
- Zrzut ekranu: boss zwrócony do gracza w trakcie plucia, kule Novy, opuszczone kraty.

---

## Krok 16 — Warstwa wizualna: generator kafli v2 i paleta „jasny piaskowiec”

**Zlecenie właściciela:** docelowa warstwa wizualna (tło, głębia, kafelkowanie). Właściciel dostarczył arkusz kafli, JSON, generator w Pythonie i `STYLEGUIDE.md`. Najpierw analiza i plan na kroki 16–19, potem realizacja kroku 16.

**Pomiary z analizy (podstawa decyzji):**
- **Czytelność na podłodze v1:**
  - podłoga v1 ma średnią jasność Y ≈ 0,033;
  - ciało Demon Mage'a ma kontrast z podłogą 1,08:1, czyli praktycznie tę samą jasność;
  - fuga płyt `#1f1c25` ma prawie kolor obrysu postaci `#1b1a22`, więc nawet obrys barbarzyńcy daje tylko 1,4:1;
  - barwa podłogi (~258°) jest w rodzinie fioletu obu ciemnych wrogów.
- **Ściany na wygenerowanych mapach** (20 seedów, piętra 1 i 7):
  - ściany to 75% mapy, a 2/3 z nich leży dalej niż 2 kafle od podłogi;
  - cztery proste maski (7, 11, 13, 14) to ~82% widocznych ścian;
  - ~9% to narożniki, czyli maska 15 z podłogą po skosie, których 4-bitowy autotile nie odróżnia;
  - warianty zniszczeń v1 trafiły w maski 0, 5 i 10, które prawie nie występują.

**Decyzje właściciela (przed krokiem 16):** `#decyzja`
- **Zoom 2,0 (pixel-perfect)** zamiast 1,5. Zasięg Kiterów dostosujemy w logice AI, nie skalowaniem. Wdrożenie w kroku 18.
- **Schody 2×2** (64×64 px). Wdrożenie w generatorze pięter i widoku w krokach 17–18.
- **Cienie środowiska z jedną stałą alfą** — dopisane do STYLEGUIDE.
- **Bez kolidujących obiektów** w krokach 16–19: tylko dekoracje bez wpływu na fizykę i linię wzroku.
- **Paleta C, „jasny piaskowiec”**, wybrana z 4 makiet. Uzasadnienie: gwarancja czytelności walki (WCAG) w centrum akcji; mrok odzyskamy w kroku 19 oświetleniem i winietą.

**Porządki w plikach:**
- generator jest w `tools/tower_ruins_tiles.py`, a jego zależność (Pillow 11.0.0) w `tools/requirements.txt`;
- styleguide jest w `docs/STYLEGUIDE.md`;
- materiały v1 są w `tools/reference/`;
- makiety i robocze arkusze trafiają do `tools/out/` (w `.gitignore`).

**Generator v2:**
- **Paleta to dane:** klasa `Palette` z rolami (podłoga, wierzch, lico i pasma muru, kurz, plamy). Rampy są budowane w OKLCH. Kolory wspólne obsady (złoto, kość, żelazo, błoto) pochodzą ze STYLEGUIDE. Funkcje rysujące nie znają żadnych hexów.
- **Manifest i układ:** arkusz układa się sam (first-fit w 16 kolumnach). Układ jest wspólny dla wszystkich palet, więc zmiana palety lub biomu w grze to tylko inna tekstura przy tych samych indeksach.
- **Stabilne seedy:** `crc32(biom/nazwa)`. Eksport jest deterministyczny: dwa uruchomienia dają identyczne pliki.
- **JSON v2:**
  - indeks klatki, części elementów wielokaflowych (`frames`), warstwa, waga, `flipX`;
  - grupy wariantów;
  - autotile jako dane: maska 4-bit, kafle narożników, pasma odległości, ściany „nad postaciami”, maska cieni.
- **Walidator:**
  - alfa tylko 0 lub 255, poza cieniami o stałej alfie;
  - wszystkie kolory należą do palety;
  - brak czystej czerni i bieli;
  - podłoga nie używa barw zarezerwowanych (fiolet wrogów, zieleń magii).
- **Tryb `--mockup`:**
  - makieta pokoju z korytarzami w zoomie 2,0 z prawdziwymi sprite'ami: mag na zwykłej podłodze, w cieniu pod ścianą i przy kracie;
  - zestawienie palet z wyliczonym kontrastem;
  - pokazuje też przyszłe warstwy, łącznie ze ścianami rysowanymi nad postaciami.
- **Fuga** jest o ton ciemniejsza od płyty, nie w kolorze obrysu. Światło z północy, więc odbijamy kafle tylko w poziomie.

**Arkusz** `public/assets/tilesets/tower_ruins_tileset.{png,json}`: 99 kafli, siatka 16×8 (512×256 px):
- **podłoga:**
  - 8 baz: płyty 16 px, płyty 32 px, płyty mieszane, wytarty środek;
  - 2 wzory 2×2 („wiatraczek”), które łamią siatkę 32 px;
- **nakładki** (przezroczyste, na dowolną bazę): pęknięcia (także 2×1 i 1×2, przez krawędź kafla), wyłomy, gruz, plamy, okruchy, kurz pod ścianami w 3 kierunkach;
- **ściany:**
  - 16 masek;
  - dla masek 7, 11, 13 i 14: drugi wariant oraz pęknięcie i wyłom;
  - maska 15: 4 warianty i 15 kafli narożników wewnętrznych;
  - pasma „przygaszone” (2 kafle od podłogi) i „głębia” (3+);
- **cienie środowiska:** 7 kafli, alfa 0,4;
- **krata:** pozioma i pionowa, każda otwarta, opadająca i zamknięta;
- **schody 2×2** zapieczętowane i otwarte, pieczęć 2×2;
- **rekwizyty z v1:** kolumny, przewrócona kolumna, gruz, kości;
- `floor_pit` usunięty: wyglądał jak przepaść, a w grze nie ma spadania.

**Paleta C — wynik (kontrast WCAG względem średniej jasności podłogi Y = 0,113):**

| Postać | Obrys | Ciało | Δ barwy |
|---|---|---|---|
| Barbarzyńca | 2,68 | 2,58 | 5° |
| Trashcan Man | 2,68 | 2,15 | 176° |
| Demon Mage | 3,01 | 2,10 | 73° |
| Sludge King | 2,68 | 1,53 | 97° |

**STYLEGUIDE:**
- §6: wyjątek dla cieni środowiska (kolor obrysu, stała alfa 0,4, bez gradientów);
- nowa §6a „Kafle otoczenia”: światło z północy, tylko `flipX`, fuga ≠ obrys, barwy zarezerwowane, progi czytelności.

**Testy: +208, razem 469** (`tests/assets/tileset.test.ts` i pomocniczy dekoder `tests/helpers/png.ts`, sam `node:zlib`):
- **Zgodność JSON z PNG:**
  - wymiary arkusza;
  - indeks klatki i części każdego kafla;
  - brak nachodzenia kafli;
  - zawartość zgodna z warstwą: baza podłogi w pełni kryjąca, cienie tylko z alfą 0/0,4, reszta bez półprzezroczystości;
  - grupy i autotile wskazują istniejące kafle;
  - `flipX` tylko dla podłogi i nakładek.
- **Czytelność (progi ze STYLEGUIDE §6a):**
  - każda postać ma obrys ≥ 2:1 oraz ciało ≥ 1,5:1 albo różnicę barwy ≥ 60° przy nasyceniu ≥ 25%;
  - obrys i ciało test wykrywa z obrazu: obrys to najczęstszy kolor krawędzi sylwetki;
  - kontrolnie arkusz v1 z `tools/reference` nie spełnia progów dla żadnej postaci, więc test faktycznie rozróżnia.
- Wartości z testu TS pokrywają się z wyliczeniami generatora.

**Weryfikacja:**
- `npm run build`: typy, 469 testów i build przechodzą;
- makiety obejrzane w powiększeniu: narożniki wewnętrzne domykają obrys, krata, pasy cienia i przejście w głębię działają;
- w grze jeszcze bez zmian, bo arkusz nie jest ładowany — to krok 18.

**Uwaga techniczna:** generator wymaga Pillow (`python -m pip install -r tools/requirements.txt`).

---

## Krok 17 — FloorDressing: czyste dekorowanie piętra i schody 2×2

**Zlecenie właściciela:** czysty moduł FloorDressing z testami jednostkowymi (plan kroków 16–19). Commit kroku 16 wypchnięty jako `cf575f4`.

**`dungeon/FloorDressing.ts` (czysty, w `PURE_FILES`):**
- **Wejście:** `dressFloor(floor, tileset, config, seed)`.
  - Opis arkusza (`TilesetMeta`, typy w `core/tilesetTypes.ts`) dostaje jako obiekt. Plik JSON wczyta warstwa silnika, więc moduł nie robi żadnego wejścia/wyjścia.
  - Seed podaje wywołujący. W kroku 18 będzie to własna sól w `GameScene`, jak przy innych systemach.
- **Wynik:** warstwy do narysowania, każda z indeksami klatek arkusza i flagą odbicia na kafel (`EMPTY_TILE` = nic):
  - `floorBase`, `floorDecal`, `floorFeature`, `envShadow`, `walls`, `overhead`;
  - schody (zamknięte klatki w warstwie elementów, otwarte do podmiany);
  - kraty z orientacją i klatkami trzech stanów.
- **Ściany:**
  - maska 4-bit (brzeg mapy liczy się jako ściana, kraty i schody nie);
  - narożniki: maska 15 z podłogą po skosie dostaje kafel `wall_15_dXX`;
  - pasma odległości Czebyszewa liczone BFS-em w 8 kierunkach: brzeg (1), przygaszone (2), głębia (3+);
  - warianty losujemy wg wag, bez zakazu powtórzeń, bo zakaz zawyżałby udział zniszczeń.
- **Nad postaciami:** `walls` zawiera wszystkie ściany, a `overhead` to kopie murów brzegowych z podłogą od północy, rysowane drugi raz nad postaciami.
- **Podłoga:**
  - najpierw wzory 2×2 w wolnych blokach (odbicie dotyczy całego wzoru, z zamianą części);
  - potem bazy 1×1 pod każdą nie-ścianą, także pod schodami i kratami;
  - sąsiednie bazy (lewa i górna) nigdy nie są tym samym kafelkiem.
- **Nakładki:**
  - tylko na zwykłej podłodze, poza strefą `clearRadius` wokół spawnu, schodów i krat;
  - długie pęknięcia 2×1 i 1×2 kładziemy tylko, gdy oba kafle są wolne;
  - zwykłe nakładki wg wag grup;
  - kurz tylko od strony faktycznego muru (pierwszeństwo: północ, zachód, wschód).
- **Cienie środowiska:** maska N/E/W sąsiednich ścian, zgodnie z arkuszem.
- **Kraty:** na wejściach do areny z `findRoomEntrances`, tych samych co w `ArenaGates`. Wejście z północy lub południa daje kratę poziomą, z boku pionową.
- **Bezpieczniki:** sprawdza zgodność bitów masek z arkuszem i obecność grup oraz kafli. Rozmiar kafla schodów musi być równy `STAIRS_SIZE`. Każda rozbieżność kończy się czytelnym błędem.

**`config/dressingConfig.ts`:**
- gęstości: wzory 2×2 4%, nakładki 10%, długie pęknięcia 1,2%, kurz 35/25/25%, odbicie 50%;
- strefa wolna od nakładek: promień 1;
- nazwy grup i kafli schodów oraz krat.

**Schody 2×2 (decyzja z kroku 16):**
- `STAIRS_SIZE = 2` w `config/gameConfig.ts`;
- generator stawia blok wyśrodkowany w arenie, a `DungeonFloor.stairs` to lewy górny róg bloku;
- czysty `dungeon/stairs.ts` (w `PURE_FILES`): `stairsTiles`, `isStairsTile`, `stairsCenter`;
- `GameScene`: odblokowanie otwiera 4 kafle, wejście na dowolny kafel bloku prowadzi wyżej;
- `BossFight`: boss budzi się na środku bloku;
- do kroku 18 schody rysuje stary tileset, czyli 4 małe schodki.

**Testy: +30, razem 499.**
- **`FloorDressing` (22):**
  - pasma odległości, grupy masek 11, 14, 13, 7 i 4 narożniki;
  - ściany i bazy dokładnie na właściwych kaflach;
  - warstwa nad postaciami;
  - cienie;
  - zakaz powtórzeń baz;
  - kompletne, także odbite, wzory 2×2;
  - nakładki poza strefą wolną;
  - kurz od strony muru;
  - długie pęknięcia;
  - umiarkowana gęstość na wygenerowanych piętrach;
  - schody i kraty z orientacją;
  - determinizm (inny seed = inna podłoga);
  - dane piętra nietknięte;
  - klatki istnieją, a odbite są tylko kafle z `flipX`;
  - konfiguracja wskazuje istniejące grupy;
  - czytelne błędy przy niezgodnym arkuszu.
- **Pozostałe:**
  - `stairs` (3);
  - generator: 4 kafle schodów w arenie i wyśrodkowanie;
  - architektura: +4 czyste pliki.
- **Pomocniki:**
  - `floorFromAscii` rozumie `S` (schody) i `@` (spawn);
  - `tests/helpers/tileset.ts` wczytuje arkusz;
  - test arkusza używa typu z `core/`.
- **Testy mutacyjne (ręcznie, kod przywrócony):** każde z 5 celowych uszkodzeń wywraca właściwy test:
  - wyłączony zakaz powtórzeń baz;
  - zła maska `overhead`;
  - kraty bez strefy wolnej;
  - zły bit narożnika;
  - odbicie wzoru 2×2 bez zamiany części.

**Weryfikacja w grze (port 5174):**
- schody to 4 kafle `StairsLocked` w arenie 11×11, a boss stoi dokładnie na środku bloku (1152, 320);
- po odblokowaniu wszystkie 4 kafle są otwarte;
- wejście na prawy dolny kafel bloku przenosi na piętro 2;
- brak błędów w konsoli.

---

## Krok 18 — Wielowarstwowy DungeonView, arkusz w grze i zoom 2,0

**Zlecenie właściciela:** wielowarstwowy `DungeonView`, ładowanie PNG i JSON arkusza w grze, stały zoom 2,0. Commit kroku 17 wypchnięty jako `8dc81bf`.

**Głębokości rysowania (`config/renderLayers.ts`):**
- `RENDER_DEPTH` to jedno źródło prawdy dla całej sceny;
- wszystkie dotychczasowe liczby w `setDepth` zastąpione nazwami, a wartości rozgrywki bez zmian (telegraf 5 … cios 12);
- tło 0–3,5: podłoga, nakładki, elementy, cienie, ściany, kraty;
- `overhead` 13: nad rozgrywką, pod mrokiem (15) i napisami (20).

**Arkusz w grze:**
- `config/tilesetConfig.ts` opisuje zasób: klucze, ścieżki i wersję formatu;
- `BootScene` ładuje PNG i JSON z `public/assets/tilesets/`;
- geometryczny tileset z `BootScene` i `TILESET_FRAMES` usunięte;
- `GameScene` wywołuje `dressFloor` z solą `DRESSING_SEED_SALT` i przekazuje wynik do widoku.

**`DungeonView` (przepisany):**
- **Warstwy obrazu:** sześć warstw TilemapLayer z FloorDressing (z odbiciem `flipX`) plus warstwa krat, każda na swojej głębokości.
- **Kolizja:** osobna, niewidoczna warstwa logiczna (ściany) z jedną klatką kolizji, więc `putTileAt` nadaje kolizję także kratom opuszczanym w trakcie gry. Menedżery walki i łupów dostają `collisionLayer`.
- **Kraty:**
  - `sealGate` i `releaseGate`: kolizja zmienia się od razu;
  - obraz przechodzi przez klatkę „opada” do „zamknięta” albo „otwarta” (`ARENA_GATES.frameMs` = 90 ms);
  - przed walką widać szczelinę w posadzce.
- **Schody:** `openStairs` podmienia 4 klatki bloku 2×2 na otwarte.
- **`TileType`:** usunięte `StairsOpen` i `Gate`. Stan schodów i krat to stan widoku i kolizji, a dane piętra są stałe.
- **Kontrola arkusza:** niezgodna wersja albo rozmiar kafla kończy się błędem przy starcie piętra.

**Zoom 2,0 (pixel-perfect):**
- **Kamera:** `CAMERA_CONFIG.zoom` = 2. Phaser przy całkowitym zoomie i `roundPixels` przewija kamerę o pełne piksele świata.
- **Martwa strefa:** przeliczona z 80×60 na 60×45 px świata, czyli ta sama część ekranu co przy zoomie 1,5.
- **Skala płótna (`systems/pixelScale.ts`, czysty):**
  - `pixelPerfectScale` dobiera skalę CSS tak, by piksel świata był całkowitą liczbą pikseli urządzenia, z uwzględnieniem `devicePixelRatio`, np. przy skalowaniu Windows 125%;
  - `main.ts` używa `Scale.NONE` i `setZoom` przy każdej zmianie rozmiaru okna;
  - przykłady: 1920×1080 → skala 2 (4 px na piksel świata), 1600×900 → 1,5 (3 px; FIT dałby 1,667 i nierówne piksele);
  - kosztem są cienkie czarne pasy przy krawędziach okna.
- **Mrok:** promień widoczności 150 → 112 px świata, czyli na ekranie tyle samo co wcześniej. To przeliczenie, a nie zmiana trudności.

**Reguła widoku dla wrogów (decyzja właściciela: zasięg Kiterów w logice AI):** `#decyzja`
- **Problem:** przy zoomie 2 widać tylko 480×270 px świata, a Kiter strzela z 280 px (już przy 1,5 mógł strzelać spoza ekranu w pionie).
- **`GUARANTEED_VIEW_HALF`** (`config/gameConfig.ts`): prostokąt wokół gracza, który zawsze jest na ekranie, czyli widok minus luz martwej strefy (210 × 112,5 px).
- **`ENEMY_VIEW_RULE`** (`config/combatConfig.ts`, typ `EnemyViewRule`): margines 16 px i zapas ucieczki 8 px.
- **`EnemyBrain`:**
  - wróg atakuje tylko z tego prostokąta, a spoza niego podchodzi;
  - kiting zeruje składową ucieczki, która wyprowadziłaby go poza ekran, więc nie drga na krawędzi;
  - bez reguły (parametr opcjonalny) zachowanie jest jak dawniej.
- **Liczby wrogów bez zmian** (zasięgi, obrażenia, aggro). Boss bez zmian, bo jego ataki są obszarowe i z telegrafem.

**Drobne:** podpowiedź w HUD „czerwone kraty” → „zakratowane schody”.

**Testy: +17, razem 516.**
- `pixelScale` (5): 1920×1080, 1600×900, DPR 1,25, płótno zawsze w oknie z całkowitym pikselem świata, minimum 1 px.
- `EnemyBrain` (5): poza ekranem w pionie nie strzela, tylko podchodzi; w prostokącie strzela; bez reguły jak dawniej; ucieczka zatrzymana przy krawędzi, także po skosie.
- `RENDER_DEPTH` (3): kolejność tła, tło pod rozgrywką, `overhead` między rozgrywką a mrokiem.
- Arkusz (1): ścieżki z `TILESET_ASSET`, wersja formatu i `TILE_SIZE`.
- Architektura: +3 czyste pliki.

**Weryfikacja w grze** (port 5174, emulowane okno 1600×900, panel w tle, więc ręczne `game.step()`):
- **Skala i kamera:** płótno 1440×810 px wyśrodkowane (skala 1,5), zoom 2, `renderRoundPixels`, przewijanie i widok świata w pełnych pikselach.
- **Warstwy na piętrze 1:**

  | Warstwa | Głębokość | Kafle |
  |---|---|---|
  | floorBase | 0 | 649 (336 odbitych) |
  | floorDecal | 0,5 | 119 |
  | floorFeature | 1 | 4 |
  | envShadow | 2 | 248 |
  | walls | 3 | 1751 |
  | gates | 3,5 | 7 |
  | overhead | 13 | 98 |
  | collision (niewidoczna) | — | 1751 |

- **Kraty:** po wejściu na arenę 7 krat (6 pionowych przy prawej ścianie, 1 pozioma) przechodzi w klatkę „zamknięta” i dostaje kolizję. Po pokonaniu bossa i wyborze karty wracają do „otwartej” bez kolizji.
- **Schody:** po pokonaniu bossa 4 klatki bloku podmienione na otwarte (zrzut ekranu).
- **Overhead:** gracz przy dolnej ścianie pokoju — kafel overhead (głębokość 13) przykrywa wystający dół sprite'a.
- **Wrogowie** mają regułę widoku 210 × 112,5 px.
- Brak błędów w konsoli.

**Uwaga do weryfikacji:** w trakcie testu gracz zginął od bossa (ręczne kroki), więc w pamięci wbudowanej przeglądarki został wpis 0 złota na tablicy rekordów.

---

## Krok 19a — Światło: mrok z winietą, pochodnie, pyłki, cienie postaci

**Zlecenie właściciela:** realizacja planu technicznego. Commit kroku 18 wypchnięty jako `836a9ae`.

**Decyzje właściciela:** `#decyzja`
- podział kroku 19 na 19a (światło, winieta, pochodnie, pyłki, cienie) i 19b (ślady walki, detale ścian, bruk);
- twarde pasma światła bez ditheringu (bez migotania pikseli);
- pochodnie generowane proceduralnie w palecie C;
- najwyżej 30% przyciemnienia na krawędziach kadru, z obrysem wrogów ≥ 2:1.

**Wynik testu WCAG zmienił profil mroku.**
- Mrok nakładany na GPU miesza kolory w sRGB, a to obniża kontrast obrysu szybciej, niż zakładał mój plan:

  | Przyciemnienie | Najsłabszy obrys |
  |---|---|
  | 20% | 2,11 |
  | 25% | 2,01 |
  | 30% | 1,89 |

- Obu warunków nie da się spełnić naraz w całym kadrze. Rozwiązanie zgodne z celem właściciela:
  - 30% zostaje, ale tylko przy samych krawędziach kadru;
  - w prostokącie, z którego wróg może atakować (`GUARANTEED_VIEW_HALF`, reguła widoku z kroku 18), mrok ma najwyżej 20%;
  - stąd `edgeRadius` = 320 i 3 pasma: 10/20/30%.
- Wróg, który dopiero podchodzi z samej krawędzi kadru, może tam mieć obrys 1,89:1, ale stamtąd nie atakuje.

**Generator:**
- rampa ognia `FLAME` w palecie: czerwień → pomarańcz → żółć → blask, bez bieli;
- kafel `torch_sconce` (warstwa `wallDecor`): obejma na licu, trzon przed murem;
- `torch_flame_0..3`: płomień z kołysaniem i oddechem ±1 px, bez ciemnego obrysu, bo świeci;
- JSON dostał `colors` (mrok, popiół, ogień, obrys) i `torch.flameBaseY`, więc gra nie ma hexów zapisanych na sztywno;
- arkusz ma teraz 104 kafle.

**Warstwa czysta:**
- **`systems/lighting.ts`:**
  - `banded` (twarde pasma), `ambientDarkness` (mrok wokół gracza);
  - `playerLightStrength` i `pointLightStrength` (siła światła do wycierania mroku);
  - `darknessModifierProfile` („Mrok” w pasmach zamiast miękkiej krawędzi);
  - `buildLightStamp` (stempel 2r × 2r z alfą pasm);
  - `flickerRadius`, `lightTouchesView` (pomijanie świateł poza kadrem), `pixelEllipse` (maska cienia).
- **`dungeon/LightPlanner.ts`** (w `PURE_FILES`):
  - pochodnie tylko na prostych odcinkach górnej ściany pokoju (mur z trzech stron, pod spodem zwykła podłoga);
  - tasowanie i zachłanny wybór z odstępem;
  - limit 2 na pokój, 4 w arenie;
  - własna sól `TORCH_SEED_SALT`.
- **`config/lightingConfig.ts`:**
  - profil mroku;
  - pochodnia: promień 72, skoki −3/0/0/+3, 3 pasma, poświata 16%;
  - pyłki: do 36 naraz, życie 3–6 s, alfa 0,55;
  - cień postaci: alfa 0,4;
  - `TORCH_PLACEMENT`.
- **`spriteConfig`:** `groundShadow` dla bohatera i Rushera. Mag ma cień w sprite'cie, a boss kałużę, więc oba bez.
- **`RENDER_DEPTH`:**
  - `actorShadow` 2,5, `wallDecor` 3,2;
  - `motes` 14: pod mrokiem, więc gasną na krawędziach;
  - `darkness` 15;
  - `torchGlow` 15,5 i `torchFlame` 15,6: świecą nad mrokiem.

**Phaser:**
- **`effects/LightingOverlay.ts`** (zastępuje `DarknessOverlay`):
  - jedna RenderTexture w rozdzielczości świata, zakotwiczona w pełnych pikselach wokół gracza i pokrywająca kadr z luzem martwej strefy;
  - co klatkę: `fill(kolor mroku, max)`, potem `erase` stempli gracza i pochodni w kadrze;
  - składana w `POST_UPDATE` (po fizyce), więc światło nie zostaje klatkę za graczem;
  - przy „Mroku” alfa 0,94, a pochodnie nie wycierają mroku, bo to mechanika piętra.
- **`world/Torches.ts`:**
  - uchwyt, animowany płomień (6 kl./s, losowa klatka startowa) i poświata ADD w kolorze ognia z palety;
  - migotanie w rytmie klatek płomienia (`Math.random`, czysto wizualnie);
  - przy „Mroku” poświata wyłączona, a płomienie widać przez mrok jako punkty orientacyjne.
- **`effects/DustMotes.ts`:** jeden emiter, cząstki 1 px w kolorach popiołu; obszar emisji jedzie z kadrem, a cząstki zostają w świecie.
- **`effects/GroundShadow.ts`:** pikselowa elipsa 22×12 w kolorze obrysu z alfą 0,4, idzie za postacią po fizyce i znika razem z nią.
- **`effects/lightTextures.ts`:** tekstury ze stempli, tworzone raz na klucz.
- **`BootScene`** ładuje arkusz także jako arkusz klatek 32×32 i rejestruje animację płomienia.

**STYLEGUIDE:** nowa §6b „Światło i efekty otoczenia” — twarde pasma, rozdzielczość świata, limit mroku i strefa walki, płomienie bez obrysu, migotanie skokowe, dopuszczalna półprzezroczystość efektów.

**Testy: +37, razem 553.**
- **`lighting` (10):**
  - pasma: pełne światło do promienia gracza, wartości nie maleją, nie przekraczają 30%, dokładnie 3 poziomy;
  - siła światła gracza odwraca mrok;
  - profil „Mroku”;
  - pochodnia z 3 pasmami;
  - stempel: wymiary i tylko poziomy pasm 0/85/170/255;
  - migotanie tylko o wartości z konfiguracji;
  - pomijanie świateł poza kadrem;
  - symetryczna elipsa.
- **`LightPlanner` (4):**
  - dokładne kolumny na prostym odcinku muru obok wejścia;
  - limit na pokój i odstęp;
  - reguły na wygenerowanych piętrach;
  - determinizm, dane piętra nietknięte.
- **Czytelność w mroku (arkusz):**
  - kolor mroku z palety;
  - każda postać ma obrys ≥ 2:1 w całej strefie walki;
  - pełne 30% przy krawędzi kadru;
  - kontrolnie: przy 30% w strefie walki próg by nie przeszedł.
- **Pozostałe:**
  - arkusz: kafle pochodni i kolory;
  - `RENDER_DEPTH`: kolejność nowych warstw;
  - sprite'y: cień tylko dla chodzących;
  - architektura: +3 czyste pliki;
  - testy per kafel dla 5 nowych kafli arkusza (+10).

**Weryfikacja w grze** (port 5174, emulowane okno 1600×900, ręczne `game.step()`):
- **Piętro 1:**
  - 11 pochodni, a promień skacze przy klatkach płomienia (72 → 75);
  - pyłki na głębokości 14;
  - 3 cienie postaci (gracz i Rushery).
- **Piksele warstwy mroku:**

  | Miejsce | Alfa |
  |---|---|
  | środek (gracz) | 0 |
  | górna i dolna krawędź (153 px) | 0,1 |
  | boczne krawędzie (264 px) | 0,3 |

- **Powiększenie płótna 4×:** ostre pasma światła ze schodkowymi krawędziami, płomień i uchwyt w pikselach świata, ciepła poświata.
- **„Mrok”** (seed 3, piętro 2): krawędź 0,94, środek 0, poświaty wyłączone, płomienie widoczne przez mrok.
- **Wydajność:** mediana kroku gry 0,3 ms z oświetleniem wobec 0,2 ms bez (p95: 0,5 / 0,4 ms), czyli ok. 0,1 ms CPU na klatkę przy 11 pochodniach. GPU nie mierzone.
- Brak nowych błędów w konsoli po świeżym przeładowaniu. Dwa stare wpisy pochodzą z HMR w trakcie edycji w kroku 18.

---

## Krok 19b — Ślady walki, bruk, detale lica, łuki i pajęczyny

**Zlecenie właściciela:** krótki plan techniczny, potem wdrożenie. Commit kroku 19a wypchnięty jako `878100b`.

**Wymagania właściciela i jak je spełniliśmy:**
1. **Trwałe ślady walki w buforze kołowym FIFO** (150–200), na własnej głębokości: nad `floorDecal`, pod cieniami postaci.
   - Czysty `systems/RingBuffer.ts`: `push` zwraca wypchnięty element, do tego `isFull` i `oldest`.
   - `effects/CombatDecals.ts`: pula 180 obrazków; po zapełnieniu najstarszy jest używany ponownie (nowa klatka, pozycja i odbicie), więc w trakcie walki nic nie powstaje ani nie znika.
   - Ślady tylko na podłodze, nigdy na ścianie.
   - Głębokość `combatDecal` = 1,5: nad nakładkami (0,5) i schodami (1), pod cieniami środowiska (2), więc mur nadal je przyciemnia, i pod cieniami postaci (2,5).
2. **Wyłomy −60%:** `decal.broken` 1 → 0,4 i `decal.rubble` 0,5 → 0,2. Test pilnuje, żeby ich łączny udział w wagach nakładek był ≤ 10%.
3. **Łuki i pajęczyny tylko nad postaciami, bez kolizji:**
   - w generatorze mają warstwę `overheadDecor`;
   - FloorDressing oddaje osobną warstwę `overheadDecor` (głębokość 13,2) i kładzie ją wyłącznie na kaflach podłogi;
   - kolizję `DungeonView` buduje tylko z `floor.tiles`.
   - **Łuk:** nad przejściem dokładnie 2 kafle szerokim w górnej lub dolnej ścianie pokoju. Nie nad kratami areny, bo nadproże zasłoniłoby pręty.
   - **Pajęczyna:** w górnym narożniku pokoju z murem z dwóch stron, szansa 35%.
4. **Nowe kafle w palecie C:** bruk (3), detale lica (4), łuk 2×1, pajęczyny (2), ślady walki (3 rodzaje po 2). Arkusz ma 120 kafli w siatce 16×9.

**Generator:**
- **`cobble`:** kamienie w siatce 8 px (krawędzie kafla zawsze w fudze, więc bez szwów), ta sama rampa co płyty.
- **`face_detail`:** sztandar (spływa przez krawędź muru), kratka odpływu, wnęka ze świecą, wypadnięta cegła.
- **`arch`:** wierzch muru i lico z łukową dolną krawędzią.
- **`cobweb`:** nici z narożnika, bez wypełnienia.
- **`combat_mark`:**
  - plama: rampa plam;
  - przypalenie: sadza z rampy błota (pierwsza wersja w chłodnej szczelinie podłogi wyglądała jak niebieski pająk);
  - szlam: rampa `SLIME` ze STYLEGUIDE §4.5, z obrysem najciemniejszym tonem.

**FloorDressing:**
- `dressFloor(…, extras)` przyjmuje `torches`: detal lica nigdy nie trafi na kafel z uchwytem pochodni ani obok niego. `GameScene` planuje pochodnie przed dekorowaniem.
- Korytarze (podłoga poza prostokątami pokojów) dostają bruk. Wzory 2×2 tylko w pokojach.
- Nowe warstwy: `wallDecor` (detale lica na prostych odcinkach muru z licem nad podłogą, także na ślepych końcach korytarzy) i `overheadDecor`.

**Podpięcie śladów:**
- `EnemyManager.kill`: plama;
- `BossFight`: przypalenie po uderzeniu obszarowym, szlam po śmierci bossa;
- `ProjectileManager`: pocisk z `impactDecal` zostawia ślad po zderzeniu ze ścianą albo wygaśnięciu, nie przy trafieniu gracza. Kule Novy bossa dostały `impactDecal: 'slime'`.

**Testy: +50, razem 603.**
- **`RingBuffer` (5):** do zapełnienia nic nie wypycha; FIFO; długi przebieg (1000 → zostaje 180 najnowszych); recykling najstarszego jako najnowszego; walidacja pojemności.
- **FloorDressing (8):**
  - bruk w korytarzach i płyty w pokojach;
  - łuk tylko nad przejściem szerokości 2, nie nad szerokim ani bocznym;
  - łuki i pajęczyny nigdy na ścianie;
  - bez łuków nad kratami;
  - pajęczyny w narożnikach;
  - detale lica: reguła na każdym kafelku, dokładne kolumny i pominięcie pochodni;
  - udział wyłomów ≤ 10%;
  - nowe grupy istnieją, warstwy kafli `overheadDecor` i `wallDecor`.
- **Czytelność WCAG na bruku (4):** każda postać spełnia progi także na bruku.
- **Pozostałe:**
  - testy per kafel dla 16 nowych kafli (+32);
  - architektura +1;
  - `flipX` dozwolony także dla śladów walki.
- **Mapy testowe:** `BOX` ma teraz pokój. Nowa mapa `HALLS` (bez areny) ma wejścia szerokości 2 i 3 oraz korytarz.

**Weryfikacja w grze** (port 5174, okno 1600×900, seed 11, piętro 1):
- **Warstwy:** `wallDecor` 4 kafle (3,2), `overheadDecor` 14 kafli (13,2), wszystkie na podłodze i żaden w warstwie kolizji.
- **Recykling puli:**
  - 400 śladów → dokładnie 180 obiektów utworzonych i 220 ponownych użyć;
  - lista obiektów sceny urosła tylko o 180;
  - ślad na ścianie odrzucony;
  - śmierć wroga (prawdziwe zdarzenie) użyła ponownie najstarszego śladu.
- **Zrzuty:**
  - pokój przy pełnej puli (180 śladów, test obciążeniowy);
  - wejście do pokoju startowego: brukowany korytarz, łuk nad przejściem przykrywający górę gracza, dwie pochodnie, pajęczyny w obu górnych narożnikach;
  - powiększenie płótna 4×: ostre kamienie bruku i krzywizna łuku.
- **Wydajność przy pełnej puli:** krok gry 0,4 ms (mediana) i 0,6 ms (p95), wobec 0,3 i 0,5 ms w 19a.
- Brak nowych błędów w konsoli; dwa stare wpisy z HMR pochodzą z kroku 18.

---

## Krok 20 — Sprite'y łupów, kapliczki, pocisku gracza i znacznika celowania

**Zlecenie właściciela:** zastąpić geometryczne placeholdery łupów (monety, mikstury, przedmioty) i kapliczki spójnymi sprite'ami w palecie C. Backlog uporządkowany commitem `87d120f`.

**Decyzje właściciela:** `#decyzja`
- animacje 4 klatki w 6 kl./s (obrót monety, iskra, puls kapliczki);
- do tego samego arkusza także pocisk gracza i znacznik celowania;
- start od razu, równolegle z testami Kiterów i kamery.

**Generator `tools/loot_sprites.py`:**
- korzysta z palety C i narzędzi `tower_ruins_tiles.py` (rampy, obrys, `Img`);
- wynik to atlas `public/assets/sprites/loot.{png,json}` (256×96, 59 nazwanych klatek, format JSON-hash Phasera);
- **ikony przedmiotów** to siatki ASCII 12×12 (łatwe do ręcznej poprawki); rampa 4 tonów z koloru przedmiotu z `lootConfig` (konwersja sRGB → OKLCH). Generator zapisuje kolory w `meta.items`, a test porównuje je z grą;
- **przedmioty z efektem:** złota obwódka i 4 klatki iskry (brak, punkt, krzyżyk, punkt). Bazowe: jedna klatka;
- **moneta:** 4 klatki obrotu (tarcza → skos → krawędź → skos);
- **mikstura:** kolba z korkiem, ciecz `#ff4f5e` — dawny `#d93a5a` miał na piaskowcu tylko 1,44:1 (test WCAG złapał to w trakcie pracy);
- **kapliczka 32×32:** postument z palety C, złota kula z przerywanym pierścieniem blasku (4 klatki, blask bez obrysu), zgasła kula w wersji zużytej;
- **pocisk gracza:** turkusowy orb z krążącym blaskiem (4 klatki). Pocisk przebijający (Szuriken) to gwiazdka obracana klatkami co 45°;
- **znacznik celowania:** 8 klatek kierunku z obrotu co 45° (najbliższy sąsiad, obrys po obrocie — STYLEGUIDE §1);
- **walidator:** brak pustych klatek, tylko alfa 0/255, brak czystej czerni i bieli.

**Usunięte efekty sprzeczne z pixel artem:**
- pulsowanie przedmiotów skalą do 1,25 — przedmioty wyróżniają teraz ikona, obwódka i iskra;
- obrót znacznika celowania o dowolny kąt — teraz klatka wg `facingDirection`;
- wirowanie przebijającego strzału (`setAngularVelocity`) — teraz animacja gwiazdki;
- pulsowanie kapliczki przezroczystością — teraz klatki.

**Kod:**
- `config/spriteConfig.ts`: `LOOT_ATLAS`, `LOOT_FRAMES`, `LOOT_ANIMATIONS`, `lootAnimationKey`, `itemFrames`;
- `effects/spriteAnimations.ts`: ładowanie atlasu i `registerLootAnimations` (także iskry każdego przedmiotu z efektem);
- `Pickup` (teraz Sprite) z animacją wg rodzaju łupu i losową klatką startową; `itemIconFrame` dla kart nagrody;
- `Shrine` (Sprite): puls klatkami, `markUsed` zatrzymuje animację i ustawia klatkę zgasłą;
- `PlayerShotManager`: klatki atlasu, ciało o promieniu z konfiguracji wyśrodkowane w klatce 16×16;
- `Player`: znacznik celowania z klatek kierunku;
- `RewardScene`: ikona z atlasu w skali 3×;
- `BootScene`: usunięte placeholdery (zostaje domyślny pocisk wroga); `TextureKey` bez nieużywanych kluczy.

**STYLEGUIDE:** nowa §6c „Łupy, kapliczka i elementy interfejsu w świecie”.

**Testy: +24, razem 627.**
- **Atlas (`tests/assets/loot.test.ts`):**
  - rozmiar z meta = PNG;
  - każda klatka w obrazie, niepusta, alfa 0/255;
  - gra używa tylko istniejących klatek;
  - animacje po 4 klatki, znacznik 8 kierunków, 6 kl./s.
- **Ikony:** 12 przedmiotów (bazowe 1 klatka, z efektem 4); wszystkie różne; kolory = `lootConfig`; złota obwódka tylko dla przedmiotów z efektem.
- **Czytelność WCAG** monety, mikstury, pocisku, kapliczki i 12 ikon na płytach i na bruku (16 przypadków).
- **Wspólny pomocnik `tests/helpers/readability.ts`:** progi, wykrywanie obrysu i ciała, ocena. Test arkusza kafli korzysta z niego bez zmiany wyników.

**Weryfikacja w grze** (port 5174, okno 1600×900, seed 11):
- **Łupy:** monety z animacją obrotu, mikstura i przedmioty bazowe statyczne w skali 1, przedmioty z efektem z iskrą.
- **Znacznik celowania:** E → `aim_2`, S → `aim_4`, W → `aim_6`, N → `aim_0`, NE → `aim_1`, SW → `aim_5`, obrót zawsze 0.
- **Strzały:** zwykły z animacją orbu, przebijający z gwiazdką; `angularVelocity` 0; ciało: promień 4, przesunięcie 4 w klatce 16×16.
- **Kapliczka:** puls klatkami przy alfie 1; po `markUsed` animacja stoi, klatka `shrine_used_0`.
- **Karta nagrody:** 3 ikony z atlasu w skali 3× (Elektryczna strzała, Serce, Wampirzy kieł).
- **Zrzuty:** rząd łupów w powiększeniu płótna, kapliczka aktywna i zużyta, karty nagrody.
- Brak nowych błędów w konsoli.

## Krok 20b — Sprite'y bossa „Matka Pająków” i pajączków-kamikaze

**Zlecenie właściciela:** zestaw sprite'ów nowego bossa: wielki pająk, który w trakcie walki wypuszcza małe pajączki, a one wybuchają przy graczu. Styl zgodny ze STYLEGUIDE. Tylko grafika, bez logiki.

**Generator `tools/spider_sprites.py`:**
- korzysta z narzędzi `tower_ruins_tiles.py` i `loot_sprites.py` (`Img`, `outline`, `rotate45`, `ok`, rampy `BONE`, `FLAME`, `DIRT`);
- postać rysuje raz na N, 8 kierunków powstaje z obrotu co 45°, obrys `#1b1a22` po obrocie.

**Arkusze w `public/assets/sprites/`:**

| Plik | Komórka · pivot | Kolumny |
|---|---|---|
| `spider-queen_move-birth.png` (768×768; od kroku 27 `spider-queen_move-birth-lash.png`, 1152×768) | 96×96 · 48,48 | 0–3 chód, 4–7 złożenie pajączka (wylęg 30 px za pivotem w kolumnie 7) |
| `spiderling_walk-prime.png` (384×384) | 48×48 · 24,24 | 0–3 bieg, 4–7 zapłon (telegraf wybuchu) |
| `spiderling_burst.png` (192×48) | 48×48 · 24,24 | 0–3 wybuch, bez kierunków |

**Decyzje:**
- **Chityna:** rampa 5 tonów, cień chłodny (granat-fiolet), światło ciepłe (rdzawy brąz).
- **Akcenty, tylko 2:** czerwone oczy oraz rampa ognia pochodni `FLAME` na jajach bossa, worku-bombie pajączka i w wybuchu. Zasada: „co świeci, to wybucha”.
- **Dominująca cecha bossa:** odwłok z kościaną czaszką i wieńcem jaj.
- **Pajączek:** pomarańczowy worek z ciemną klepsydrą. Pierwsza wersja z pręgami wyglądała jak pszczoła, więc ją odrzuciłem.
- **Zapłon:** puls jasnością rampy (pomarańcz → biel kości), bez przezroczystości i bez skalowania.
- **Wybuch:** ogień bez obrysu, z krawędzią w najciemniejszym tonie rampy (§6b). Dym pasmowy z rampy błota, bez ditheringu. Odłamki chityny mają obrys.
- **Cień:** brak wypalonego cienia; cień daje silnik.

**Walidator generatora:**
- brak pustych klatek;
- alfa tylko 0/255;
- brak czystej czerni i bieli;
- sylwetka w marginesie 8 px (wybuch zwolniony z tego warunku).

**Czytelność na płycie palety C:**
- obrys 2,73 : 1 (próg ≥ 2,0);
- ciało `#3c272a` 2,19 : 1 (próg ≥ 1,5).

**Dokumentacja:** artefakt Design System „Matka Pająków” zawiera:
- paletę jako tokeny;
- zasady animacji;
- podglądy animowane z prędkością gry (6 kl./s);
- arkusze i GIF-y.

**Weryfikacja:**
- generator przechodzi walidację;
- podglądy obejrzane w powiększeniu na podłodze palety C;
- kodu TS nie zmieniono, więc w tym kroku nie było `npm run build`.

**Nie zrobione (wymaga decyzji właściciela):**
- logika bossa i pajączków;
- wpisy w `spriteConfig.ts`;
- liczby w `src/config`: czas złożenia i zapłonu, promień wybuchu (ogień w klatce 2 ma ok. 17 px);
- klatki śmierci bossa.

## Krok 21 — Miecz i animacja ciosu barbarzyńcy

**Decyzje właściciela:** `#decyzja`
- klatki z generatora Pythona (jak pochodnie i łupy), nie ręcznie;
- cios: 4 klatki po 80 ms, czyli razem dokładnie `attackCooldownMs` (320 ms);
- miecz zawsze w dłoni, także przy chodzie i staniu.

**Generator `tools/barbarian_sword.py`:**
- źródło: wiersz N arkusza z paczki (`blond-barbarian_walk.png`, „bez miecza”), rozebrany z obrysu;
- obrót tego źródła odtwarza pozostałe wiersze paczki (różnice tylko w pojedynczych pikselach cieniowania, obejrzane w powiększeniu), więc chód wygląda jak dotąd;
- **chód (kolumny 0–3):** miecz w prawej pięści, ostrze 6 px na wprost; pięść wykrywana automatycznie w każdej klatce;
- **cios (kolumny 4–7):** prawe przedramię zastąpione nowym (skóra 3 px, karwasz z futra, pięść), ostrze 7 px; pięść zatacza łuk przed głową od prawej do lewej:
  - 4 zamach z prawej, 5 ostrze na wprost (chwila trafienia), 6 przeciągnięcie w lewo, 7 powrót;
- paleta ostrza ze STYLEGUIDE §4.4 (dotąd „wyłączona”), jelec w kolorze pasa;
- 8 kierunków z obrotu co 45°, obrys po obrocie;
- walidator: alfa 0/255, brak czystej czerni i bieli, cały sprite w promieniu 21,5 px od pivota (nie dotyka krawędzi komórki po obrocie);
- wynik: `public/assets/sprites/blond-barbarian_walk-attack.png` (384×384). Stary arkusz zostaje jako źródło generatora.

**Warstwa czysta:**
- `systems/PlayerAnimation.ts` → `playerAnimationState(fazaAtaku, ruch)`: cios ma pierwszeństwo przed chodem przez cały cykl ataku.

**Konfiguracja:**
- `spriteConfig`: arkusz barbarzyńcy wskazuje nowy plik, animacja `attack` (kolumny 4–7), `PLAYER_VISUAL.attack`.

**Phaser:**
- `Player.updateAnimation`: nowy cios restartuje animację z czasem `attackCooldownMs` z bieżącego wyposażenia, więc przyspiesza razem z przedmiotami;
- obrót celownika w trakcie ciosu zmienia wiersz bez cofania klatki (`DirectionalAnimator`);
- łuk `CombatEffects.slash` zostaje jako telegraf zasięgu.

**STYLEGUIDE:** paleta ostrza włączona; w §11 dopisane wyjątki barbarzyńcy (tempo ciosu, ostrze w marginesie).

**Narzędzie dev:** `?seed=N&floor=M` w adresie startuje run od danego seeda i piętra (tylko `npm run dev`).

**Testy:** `PlayerAnimation.test.ts` (3 testy: wybór animacji, cios trwa dokładnie `attackCooldownMs`, trafienie w pierwszej klatce). Istniejące testy sprawdzają wymiary nowego arkusza, animacje `PLAYER_VISUAL` i czytelność barbarzyńcy na podłodze.

**Weryfikacja:**
- `npm run build`: 631 testów zielonych;
- w grze (ręczne `game.step()`): po kliknięciu klatki 4→7 po ok. 80 ms, potem powrót do stania;
- podgląd arkusza 4x i animowany GIF w `tools/out/`;
- **ocena właściciela:** `#ocena` miecz wygląda dobrze, zostaje bez zmian.

## Krok 22 — Boss „Matka Pająków” na piętrze 2

**Decyzje właściciela:** `#decyzja` `#matka-pajakow`
- boss sam nie zasypuje ekranu pociskami: w stałym rytmie wypluwa pajączki, które są zagrożeniem i żywą tarczą;
- pajączki wybuchają po chwili i zadają obrażenia; giną od jednego uderzenia, a zabite nie wybuchają;
- Matka Pająków tylko na piętrze 2, pozostałe piętra mają Strażnika;
- exploit z ostrzałem bossa z korytarza zostaje do odwołania;
- następny etap: pajęczy biom.

**Warstwa czysta:**
- **`core/bossTypes.ts`:**
  - `BossId` (wygląd i ślady po walce zależą od bossa);
  - atak `BossAttackKind.Brood` z `BroodAttackDefinition`, pajączek `SpiderlingDefinition`;
  - definicje ataków w `BossDefinition` są opcjonalne: wymagane tylko te z `pattern`, brak definicji to głośny błąd konfiguracji;
  - plan ataku ma `spawns` (pajączek, miejsce, chwila).
- **`ai/bossAttacks.ts` → `planBrood`:**
  - pajączki pojawiają się na końcu złożenia, za bossem (po stronie przeciwnej do gracza), w wachlarzu `spreadDeg`;
  - liczba tylko do limitu żywych `maxAlive`; przy pełnym limicie wylęg jest pusty (bez animacji), a boss odczekuje rytm;
  - wściekłość jak u Strażnika: +1 pajączek, krótsze złożenie, krótsza przerwa.
- **`ai/BossBrain.ts`:** wejście `summonsAlive`; boss podchodzi tylko do `engageDistance` (150 px), czyli trzyma dystans.
- **`ai/SpiderlingBrain.ts`:** pościg → zapłon (przy graczu w `primeRange` albo po `fuseMs` od wylęgu) → wybuch po `primeMs`.

**Konfiguracja (`config/bossConfig.ts`):**
- `SPIDER_QUEEN`: 300 HP (piętro 2: 345), wylęg 2 pajączki co ok. 3,2 s, limit 6;
- pajączek: 1 HP, prędkość 135, zapłon przy 36 px albo po 3,5 s, zapłon 667 ms, wybuch 40 px za 12 (skalowane z piętrem);
- `BOSS_BY_FLOOR` / `bossForFloor`: piętro 2 → Matka Pająków, reszta → Strażnik. Pod biom wystarczy rozszerzyć tę mapę;
- `scaleBossForFloor` jest generyczne i skaluje też obrażenia wybuchu pajączków.

**Sprite'y (`spriteConfig`):**
- arkusze z kroku 20b: `spiderQueen` (chód, złożenie), `spiderling` (bieg, zapłon), `spiderlingBurst` (wybuch, 12 kl./s);
- `BOSS_VISUALS` per `BossId` zastępuje `BOSS_VISUAL`; Strażnik bez zmian, Matka Pająków gra złożenie przed wylęgiem;
- `SPIDERLING_VISUAL`: cień od silnika 14×8;
- ślad po śmierci bossa z wyglądu: szlam (Strażnik), plama (Matka Pająków).

**Phaser:**
- `entities/Spiderling.ts`: ciało fizyczne, animacje biegu i zapłonu (czas zapłonu = `primeMs`), każde trafienie zabija;
- `BossFight`:
  - wylęg w zaplanowanej chwili; miejsce poza areną (boss przy ścianie) zastępuje pozycja bossa;
  - telegraf zapłonu: czerwona strefa wybuchu jak przy atakach Strażnika;
  - wybuch: arkusz wybuchu, przypalenie, obrażenia i odrzut gracza;
  - cios, strzał i Burzowy pęd trafiają pajączki i bossa; strzał trafia najbliższy cel, więc pajączek zasłania matkę;
  - zabity pajączek: plama, bez wybuchu; po śmierci bossa giną wszystkie pajączki, a niewyklute się nie pojawiają.

**Testy:**
- `SpiderQueen.test.ts` (13 testów): miejsce i chwila wylęgu, wachlarz, wściekłość, limit żywych, sam rytm wylęgu i dystans, błąd przy brakującej definicji, pościg, zapłon i wybuch pajączka, zapalnik, wybór bossa na piętro, skalowanie;
- czytelność Matki Pająków i pajączka na podłodze i bruku (testy z kroku 16);
- `sprites.test.ts`: animacje wszystkich bossów i pajączka istnieją.

**Weryfikacja:**
- `npm run build`: 658 testów zielonych;
- w grze (`?seed=7&floor=2`, ręczne `game.step()`):
  - złożenie startuje 0,9 s po wejściu na arenę, 2 pajączki pojawiają się na końcu złożenia, rytm ok. 3,2 s;
  - pajączki dobiegają, odpalają zapłon z czerwoną strefą i wybuchają: gracz −13 HP (drugi wybuch w tej samej chwili blokuje nietykalność po trafieniu);
  - cios w podbiegające pajączki zabił oba bez wybuchu, HP gracza bez zmian;
  - zrzut ekranu: boss, pasek HP, pajączki w zapłonie.

**Do oceny w testach właściciela:** rytm wylęgu, limit 6 pajączków, siła wybuchu, czy boss z pustymi rękami (sam nie atakuje) nie jest za łatwy przy grze strzałami z dystansu.

## Krok 23a — Pajęczy biom: config biomów i arkusz „Pajęcze leże”

**Decyzje właściciela (cały biom, kroki 23a–e):** `#decyzja` `#pajecze-leze`
- biom tylko na piętrze 2 (razem z Matką Pająków);
- nowy arkusz kafli (chłodny, szaro-liliowy kamień) i pajęcze dekoracje;
- trzymamy się małej liczby archetypów: pająki to Rushery, nietoperz z falą uderzeniową to wariant Kitera (lecący półksiężyc);
- pająki spadają losowo z sufitu: rosnący cień na płytce, przy lądowaniu ranią stojącego w cieniu;
- kokony wybuchają przy bliskim kontakcie i spowalniają gracza;
- lepkie pajęczyny na podłodze spowalniają tylko gracza; dash przechodzi bez spowolnienia.

**Generator `tools/tower_ruins_tiles.py`:**
- opcja `--biome` (`tower_ruins` domyślnie, `spider_lair`): od niej zależą nazwy plików, ziarna kafli i dodatki manifestu;
- arkusz ruin wygenerowany po zmianach jest identyczny co do piksela, a JSON bez zmian;
- paleta `pajeczy` (po poprawce właściciela: „ma być fioletowo, zielono, biało, jak z mrocznego leża pająków w starej wieży”):
  - fioletowy kamień (barwa 295–320°); podłoga tylko nieco ciemniejsza niż w C, a mury ciemniejsze i mocniej nasycone (mrok bez utraty czytelności walki);
  - zieleń: posoka i plamy (ciemna, daleko od zieleni magii) oraz upiorny zielony ogień pochodni; poświata i mrok biorą barwy z palety;
  - biel: nici, pajęczyny, kurz i zielonkawobiałe jaja;
  - wyjątek biomu od barw zarezerwowanych (fiolet wrogów, zieleń magii): opcja `reserved_hues` w `BIOMES` generatora i zapis w STYLEGUIDE;
  - pierwsza wersja (chłodny, prawie szary kamień) odrzucona przez właściciela;
- dodatki leża, dopisane na końcu manifestu, więc kafle wspólne z ruinami się nie przesuwają:
  - `face_eggs` (skupisko jaj, każde z obrysem) i `face_webdrape` (nici zwisające z krawędzi muru) w grupie `wallFace.lair`;
  - `decal_husk_a/b`: wyblakłe pancerzyki; pierwsza, ciemna wersja wyglądała jak żywe pajączki, więc ją odrzuciłem;
- celowo bez pajęczyn i kokonów na podłodze, bo w krokach 23d–e będą elementami rozgrywki;
- wynik: `public/assets/tilesets/spider_lair_tileset.{png,json}` (124 kafle);
- makieta (`run_mockups`) ma obsadę per biom: w leżu bohater z mieczem, Matka Pająków w trakcie złożenia i pajączki (jeden w zapłonie); Rusher i Kiter to do kroku 23b Trashcan i mag. Pomiar czytelności obejmuje też Matkę Pająków i pajączka (obrys 2,24, ciało 1,8);
- czytelność na fioletowej podłodze (pomiar generatora): bohater obrys 2,24 / ciało 3,08, Rusher 2,24 / 2,57, mag 2,52 / 1,76 (próg 2,0 / 1,5). Sludge King wypada słabo, ale w leżu nie występuje; Kiter piętra 2 stanie się nietoperzem w kroku 23b.

**Warstwa czysta / config:**
- `config/biomeConfig.ts`: `BiomeId`, `BIOMES` (arkusz i dekorowanie), `BIOME_BY_FLOOR` (piętro 2 → leże), `biomeForFloor`;
- `tilesetConfig`: `TilesetAsset` (klucze tekstur, URL-e, animacja pochodni); `TILESET_ASSET` = ruiny, `SPIDER_LAIR_TILESET_ASSET` = leże;
- `dressingConfig`: `SPIDER_LAIR_DRESSING`: pajęczyny w rogach 70% (ruiny 35%), detale lica 18% z grupy leża, pancerzyki na podłodze.

**Phaser:**
- `BootScene` ładuje arkusze wszystkich biomów i rejestruje animację pochodni każdego;
- `GameScene` wybiera biom piętra; `DungeonView`, `CombatDecals` i `Torches` dostają arkusz biomu zamiast stałej;
- usunięty nieużywany `TextureKey.Tileset`.

**Testy:** `tests/assets/biomes.test.ts`:
- wybór biomu per piętro, unikalne klucze;
- każdy arkusz zgodny z formatem i ma wszystkie grupy używane przez swoje dekorowanie;
- dekoracje leża nie udają elementów rozgrywki;
- czytelność postaci piętra 2 (bohater, Rusher, Kiter, Matka Pająków, pajączek) na podłodze i bruku leża.

**Weryfikacja:**
- `npm run build`: 672 testy zielone;
- w grze piętro 2 ma arkusz leża (tekstura warstw, animacja pochodni leża, 13 pochodni), a piętro 1 nadal ruiny; brak błędów w konsoli;
- zrzut ekranu: fioletowy kamień, białe pajęczyny w narożnikach, zielony płomień pochodni, pancerzyki.

## Krok 23b — Pająk (Rusher) i nietoperz z falą (Kiter) w Pajęczym leżu

**Zgodnie z zasadą małej liczby archetypów:** pająk jaskiniowy to wariant Rushera, a nietoperz wariant Kitera. Logika AI bez zmian.

**Generator `tools/lair_enemies.py`** (narzędzia i rampy z `tower_ruins_tiles.py` / `spider_sprites.py`, obrót co 45°, obrys po obrocie):
- `cave-spider_walk.png` (48×48): chód na 4 klatkach;
  - ciemna chityna jak u Matki Pająków, białe szewrony na odwłoku, zielone oczy;
  - bez worka-bomby, żeby nie mylił się z pajączkiem-kamikaze;
  - nogi skrócone, żeby po obrocie po skosie mieściły się w marginesie 8 px;
- `bat_fly-screech.png` (48×48):
  - kolumny 0–3 lot (skrzydła góra → dół), 4–7 skrzek (skrzydła rozpostarte, zielony pysk, zalążek fali w kolumnach 6–7);
  - ciemna błona, białe kości palców, zielone oczy;
- `bat_wave.png` (32×32): zielono-biały półksiężyc; 8 wierszy kierunku lotu zamiast obrotu o dowolny kąt (jak znacznik celowania), 4 klatki migotania;
- walidator: alfa 0/255, bez czystej czerni i bieli, margines.

**Warstwa czysta:**
- `EnemyVariant` (Trashcan, mag, pająk jaskiniowy, nietoperz); `EnemyDefinition.variant`;
- `ProjectileAttackDefinition.wave` (`WaveShape`: połowa szerokości i grubości);
- `systems/EnemyVariants.ts`:
  - `enemyDefinitionFor`: statystyki archetypu z nadpisaniami wariantu; wariant innego archetypu to błąd;
  - `isHitByWave`: trafienie w układzie lotu, szeroko w poprzek, wąsko wzdłuż.

**Konfiguracja:**
- `combatConfig.ENEMY_VARIANTS`:
  - pająk = Rusher z innym kolorem;
  - nietoperz = Kiter (te same obrażenia 8, zasięg, zamach 400 ms, odnowienie 1,5 s) z falą szerokości 26 px i grubości 8 px, wolniejszą (200 zamiast 240), bo trudniej ją ominąć bokiem;
- `biomeConfig`: `enemyVariants` per biom (ruiny: Trashcan i mag, leże: pająk i nietoperz);
- `spriteConfig`:
  - arkusze `caveSpider`, `bat`, `batWave`;
  - `ENEMY_VISUALS` per wariant (nietoperz ma mały cień od silnika 12 px pod sobą, bo lata);
  - `ENEMY_PROJECTILE_VISUALS` zamiast `KITER_PROJECTILE_VISUAL`.

**Phaser:**
- `EnemyManager` tworzy wrogów w wariancie biomu; fala dostaje wiersz kierunku lotu (`facingDirection`);
- `ProjectileManager`: fale trafiają przez `isHitByWave` (nie przez okrągłe ciało fizyczne); dash i nietykalność przepuszczają falę, która leci dalej;
- `Enemy` bierze wygląd z wariantu;
- makieta leża w generatorze kafli pokazuje pająka, nietoperza w trakcie skrzeku i falę.

**Testy:**
- `enemyVariants.test.ts` (9 testów): mapowanie biomów, warianty bez zmian = archetyp, pająk = Rusher, nietoperz = Kiter z wolniejszą falą, błąd przy złym archetypie, wygląd pocisków, kształt i obrót fali;
- czytelność pająka i nietoperza na podłodze i bruku leża (`biomes.test.ts`); pomiar generatora: pająk obrys 2,24 / ciało 1,8, nietoperz 2,24 / 2,16;
- `sprites.test.ts`: wygląd wszystkich wariantów.

**Weryfikacja:**
- `npm run build`: 688 testów zielonych;
- w grze (`?seed=7&floor=2`): 6 pająków i 2 nietoperze;
  - nietoperz skrzeczy 400 ms, fala leci we właściwym kierunku (wiersz 3 = SE), trafienie −9 HP (8 po skalowaniu piętra), rytm ok. 1,5 s;
  - dash w bok: fala mija gracza bez obrażeń; dash prosto przez falę: bez obrażeń, fala leci dalej;
  - dash pod kątem 45° do lotu fali może zostawić gracza na jej torze po końcu nietykalności (150 ms) — wtedy trafia;
- brak błędów w konsoli.

## Krok 23c — Pająki spadające z sufitu (Pajęcze leże)

**Decyzja właściciela (krok 23a):** `#decyzja` `#pajecze-leze` pająki spadają losowo z sufitu; spadek zapowiada rosnący cień na płytce; przy lądowaniu ranią gracza stojącego w cieniu, potem walczą jak Rusher.

**Reguły i liczby (moje, w `biomeConfig`, do strojenia w testach właściciela):**
- tylko w biomie z `ceilingDrops` (leże); tylko w zwykłych pokojach — pokój startowy zostaje spokojny, arena należy do Matki Pająków;
- pierwszy zrzut 2,5 s po wejściu do pokoju, potem co 5–9 s; najwyżej 2 na pokój (powrót do pokoju nie odnawia limitu) i 3 zrzucone żywe naraz;
- miejsce: 0–40 px od gracza, na podłodze tego samego pokoju (6 prób, bez miejsca zrzut przepada);
- telegraf 1,1 s: cień rośnie do promienia 16 px; pająk widoczny na nici w ostatnich 220 ms;
- lądowanie: 12 obrażeń i odrzut 200 dla gracza w cieniu (skalowane z piętrem jak u wrogów), potem zwykły Rusher w wariancie biomu (pająk jaskiniowy), z normalnymi łupami.

**Warstwa czysta:** `systems/CeilingDrops.ts`:
- `CeilingDropPlanner`: kiedy i gdzie; stan per pokój; własny strumień RNG (`CEILING_DROP_SEED_SALT`);
- `dropShadowRadius`: cień do rysowania.

**Phaser:**
- `combat/CeilingDropManager.ts`:
  - pokój pod graczem (tylko `RoomKind.Normal`);
  - cień w kolorze obrysu z alfą cieni 0,4 (elipsa jak cienie postaci) i cienki czerwony obrys strefy, jak inne telegrafy;
  - spadający pająk (klatka S z arkusza wariantu) na białej nici;
  - lądowanie: błysk, trafienie, `EnemyManager.spawnAt`;
- `EnemyManager`: `spawnAt` (wspólne ze `spawnAll`) i `variantOf`;
- `GameScene`: menedżer tylko, gdy biom ma zrzuty.

**Testy:** `ceilingDrops.test.ts` (9 testów):
- pierwsze opóźnienie, rytm i limit na pokój; korytarz bez zrzutów;
- osobne limity pokojów bez odnawiania; limit żywych nie zużywa limitu pokoju;
- miejsce blisko gracza i tylko dozwolone; determinizm;
- wzrost cienia; zrzuty tylko w leżu; telegraf daje czas na ucieczkę (200 px/s × 1,1 s ≫ promień).

**Weryfikacja:**
- `npm run build`: 698 testów zielonych;
- w grze (`?seed=7&floor=2`, zwykły pokój, pozostali wrogowie usunięci):
  - pierwszy zrzut po 2,5 s, lądowanie 1,1 s później, potem pająk atakuje co ~1 s;
  - drugi zrzut po ~5 s, potem limit pokoju;
  - zrzut wprost na gracza: −13 HP przy lądowaniu;
  - spadający pająk widoczny przez ostatnie 220 ms;
  - zrzut ekranu z pająkiem spadającym na cień;
- brak błędów w konsoli.

**Do oceny w testach właściciela:** częstotliwość zrzutów, czy cień 16 px jest wystarczająco czytelny pod bohaterem (cień rysuje się pod postaciami, a obrys strefy przy graczu częściowo zasłania sprite).

---

## Krok 23d — Kokony (Pajęcze leże)

**Decyzje właściciela (na starcie kroku):** `#decyzja` `#pajecze-leze`
- 0–2 kokony w zwykłym pokoju leża;
- wybuch spowalnia i wypuszcza pajączka-kamikaze (sam wybuch nie rani);
- strzał i cios niszczą kokon (z dystansu bez spowolnienia);
- kokon bez kolizji — nie zmienia linii wzroku Kiterów.

**Reguły i liczby (moje, w `biomeConfig.cocoons`, do strojenia w testach właściciela):**
- miejsce: zwykłe pokoje (nie startowy, nie arena), 1 kafel od ścian (nie w przejściu), poza środkiem 3×3 (kapliczka), odstęp ≥ 3 kafle między kokonami;
- budzi go bliski kontakt: gracz ≤ 26 px od środka; telegraf 300 ms (kokon drży, czerwona strefa jak u pajączka);
- wybuch: strefa 48 px, spowolnienie 40% na 2,5 s, 1 pajączek (definicja z Matki Pająków, obrażenia skalowane z piętrem);
- trafienie (cios, strzał, Burzowy pęd) rozrywa kokon od razu; dash i nietykalność chronią przed spowolnieniem, jak przed obrażeniami;
- ostatnia klatka rozdarcia (strzępy) zostaje na podłodze — pęknięty kokon wygląda inaczej niż cały.

**Warstwa czysta:**
- `dungeon/CocoonPlanner.ts`: `planCocoons` (własna sól RNG `COCOON_SEED_SALT`), dopisany do `PURE_FILES`;
- `systems/Cocoons.ts`: `CocoonConfig`, `CocoonState` (śpi → drży → wybuch, tylko raz), `cocoonBlastCatches`.

**Grafika:** `tools/lair_enemies.py` → `cocoon.png` (32×32, bez kierunków): 0–1 spoczynek z pulsującym zielonym szwem, 2–3 drżenie, 4–7 rozdarcie. `SpriteAnimationDef.fps` — własne tempo animacji (drżenie 14 kl./s, rozdarcie 12 kl./s).

**Phaser:**
- `combat/SpiderlingSwarm.ts`: pajączki-kamikaze wydzielone z `BossFight` (pościg, telegraf, wybuch, plamy) — wspólne dla Matki Pająków i kokonów; `BossFight` bez zmian w zachowaniu;
- `entities/Cocoon.ts`: sprite bez ciała fizycznego, cel `MeleeTarget`;
- `combat/CocoonManager.ts`: rozmieszczenie, telegraf, wybuch, rozstrzyganie ciosu/strzału/dasha (kokon nie liczy się do Wampirzego kła);
- `Player`: `StatusEffects` gracza (`PLAYER_STATUS_RESISTANCE`), `applySlow`, mnożnik prędkości chodu (dash bez zmian), niebieska barwa w czasie spowolnienia;
- `GameScene`: menedżer tylko, gdy biom ma kokony.

**Testy:** `CocoonPlanner.test.ts` (3) i `cocoons.test.ts` (8):
- miejsca tylko w zwykłych pokojach, marginesy, środek wolny, odstęp, limit na pokój, część pokojów pusta; determinizm;
- budzenie bliskością, jeden wybuch po telegrafie, trafienie rozrywa od razu (też w trakcie telegrafu), martwy gracz nie budzi;
- balans: po reakcji ~200 ms chód nie wystarcza do ucieczki, dash wystarcza; strzał sięga spoza strefy; spowolnienie < 100%.

**Weryfikacja:**
- `npm run build`: 713 testów zielonych;
- w grze (`?seed=7&floor=2`, ręczne `game.step()`): 6 kokonów na piętrze;
  - zbliżenie: animacja drżenia, wybuch po 300 ms, gracz spowolniony (mnożnik 0,6), pajączek wybucha przy graczu (−13 HP);
  - strzał z 130 px: kokon pęka, pajączek wychodzi, gracz bez spowolnienia;
  - zrzut ekranu: kokony czytelne na podłodze leża;
- brak nowych błędów w konsoli (jedyny wpis to skutek mojej ręcznej ingerencji w listę wrogów w teście, przed przeładowaniem).

**Do oceny w testach właściciela:** zasięg budzenia (26 px) i telegraf 300 ms, siła/czas spowolnienia, czy strzępy po kokonie są czytelne.

---

## Krok 23e — Lepkie pajęczyny (Pajęcze leże)

**Decyzje właściciela:** `#decyzja` `#pajecze-leze`
- z kroku 23a: spowalniają tylko gracza, dash przechodzi bez spowolnienia, wygląd nie może przypominać dekoracji;
- na starcie kroku: 0–2 w zwykłym pokoju, losowo 1×1 albo 2×2 kafle, spowolnienie 50% w środku i jeszcze 0,5 s po wyjściu, pajęczyn nie da się zniszczyć.

**Reguły (moje, w `biomeConfig.stickyWebs`):**
- miejsce: zwykłe pokoje, cała pajęczyna na podłodze, 1 kafel od ścian, poza środkiem 3×3 (kapliczka), przerwa ≥ 2 kafle od innych pajęczyn i od kokonów (dwie pułapki naraz byłyby nieczytelne); szansa na 2×2 = 50%;
- „w pajęczynie” = środek gracza w jej kwadracie; spowolnienie odnawiane co klatkę, więc `durationMs` (0,5 s) to czas klejenia po wyjściu;
- to teren, nie atak: działa także w nietykalności po trafieniu (`Player.applyTerrainSlow`), chroni tylko dash;
- wrogów nie spowalnia, nie ma kolizji.

**Warstwa czysta:**
- `dungeon/StickyWebPlanner.ts`: `planStickyWebs` (sól `STICKY_WEB_SEED_SALT`, omija kafle kokonów), dopisany do `PURE_FILES`;
- `systems/StickyWebs.ts`: `StickyWebConfig`, `webGap` (przerwa między kwadratami kafli), `isInStickyWeb`.

**Grafika:** `tools/lair_enemies.py` → `sticky-web_small.png` (32×32) i `sticky-web_large.png` (64×64), po 4 klatki w 3 kl./s: pełna okrągła sieć z obrysem i zielonymi kroplami kleju, po których wędruje błysk. Narożne pajęczyny-dekoracje to trójkąty bez obrysu przy murach, więc się nie mylą.

**Phaser:**
- `world/StickyWebField.ts`: sprite'y na nowej głębokości `RENDER_DEPTH.floorHazard` (1,6: nad śladami walki, pod cieniami) i spowalnianie gracza;
- `CocoonManager.tiles`: kafle kokonów dla planera pajęczyn;
- `GameScene`: pole pajęczyn tylko, gdy biom je ma.

**Testy:** `StickyWebPlanner.test.ts` (3) i `stickyWebs.test.ts` (4):
- cała pajęczyna na podłodze zwykłego pokoju, marginesy, wolny środek, limit na pokój, przerwy od pajęczyn i kokonów, oba rozmiary, pokoje bez pajęczyn; determinizm;
- strefa na granicach kafli (1×1 i 2×2), `webGap`;
- spowolnienie trwa w pajęczynie i dokładnie 0,5 s po wyjściu;
- przejście przez 2×2 trwa < 1 s (spowalnia, nie przykleja).

**Weryfikacja:**
- `npm run build`: 726 testów zielonych;
- w grze (`?seed=7&floor=2`, ręczne `game.step()`): 3 pajęczyny na piętrze (na tym seedzie wszystkie 1×1);
  - w pajęczynie mnożnik prędkości 0,5;
  - po wyjściu spowolnienie jeszcze po 0,3 s, zniknęło po 0,55 s;
  - dash przez pajęczynę bez spowolnienia;
  - zrzut ekranu: pajęczyna czytelna na podłodze leża, obok spadający pająk;
- brak nowych błędów w konsoli.

**Do oceny w testach właściciela:** siła spowolnienia, czytelność małej pajęczyny 1×1, czy pajęczyn nie jest za mało/za dużo.

---

## Krok 24 — Klatki śmierci Matki Pająków

**Feedback właściciela po testach leża (kroki 23a–e):** `#ocena` `#pajecze-leze` biom „zajebisty”, dobry feel, spowolnienie fajne, postacie wyglądają super; spadanie pająków z sufitu to dokładnie ta mechanika, o którą chodziło. Następny krok wskazany przez właściciela: klatki śmierci Matki Pająków (backlog p. 3).

**Animacja (moje decyzje):** osobny arkusz `spider-queen_death.png` (96×96, 8 kierunków — zostaje kierunek z chwili śmierci), 8 klatek w 8 kl./s = 1 s, bez pętli:
- 0: wzdrygnięcie (nogi rozrzucone, kły rozwarte, jaja rozbłyskują);
- 1–3: nogi się podkulają (klasyczna poza martwego pająka), oczy i jaja gasną, odwłok wiotczeje, pojawia się posoka;
- 4: odwłok flaczeje, jaja pękają (skorupki z kości);
- 5–7: kałuża posoki rośnie, ciało rozpada się blokami 3×3 (pełne piksele, bez przezroczystości);
- po animacji zostaje dotychczasowa plama `splat`. Zwłok nie zostawiam na stałe: boss ginie gdziekolwiek na arenie, a duży sprite nad podłogą mógłby zasłonić schody.
- Posoka ma własną rampę `ICHOR` (ciemna rdzawa czerwień chityny) — nie myli się z ogniem jaj ani z zielenią leża.

**Generator:** `tools/spider_sprites.py` — rysowanie królowej wydzielone do `queen_pose(...)` z parametrami (podkulenie nóg `curl_leg`, zgasłe oczy, przygaszone/pęknięte jaja, kałuża), `queen_frame` korzysta z niego; arkusz chodu i złożenia wychodzi bajt w bajt taki sam jak wcześniej.

**Gra:**
- `BossVisual.death` (opcjonalne): Matka Pająków ma animację, Strażnik dalej ginie od razu (błysk + ślad);
- `BossFight.defeat`: boss znika z walki od razu (bez celów i ataków, pajączki giną), animacja gra w kierunku `Boss.facing` (`DirectionalAnimator.facing`); łupy, odblokowanie schodów, podniesienie krat i karty nagrody dopiero po jej końcu (`isDefeated` = po animacji). Wcześniej karty zatrzymałyby scenę w pierwszej klatce animacji;
- `GameScene`: karty nagrody tylko, jeśli gracz żyje (mógł zginąć w trakcie animacji od pocisku w locie).

**Testy:** `sprites.test.ts` — animacja śmierci bossa jest kierunkowa, jednorazowa i trwa 0,6–1,5 s (nagroda na nią czeka); rozmiar nowego arkusza sprawdza istniejący test arkuszy.

**Weryfikacja:**
- `npm run build`: 729 testów zielonych;
- w grze (`?seed=7&floor=2`, klawisz B / `debugDefeat`):
  - animacja trwa 1000 ms w kierunku z chwili śmierci (S i E);
  - w trakcie: kraty zamknięte, schody zamknięte, bez kart;
  - po niej: plama, 6 łupów, schody otwarte, karty nagrody;
  - zrzut ekranu w trakcie animacji (podkulone nogi);
- Strażnik (`?seed=7&floor=1`): ginie od razu jak dotąd;
- brak nowych błędów w konsoli.

**Do oceny w testach właściciela:** czy 1 s śmierci nie jest za długo przed nagrodą, czy rozpad w posokę się podoba (alternatywa: zwłoki zostają na stałe pod schodami).

---

## Krok 25 — Rzut siecią Matki Pająków

**Feedback właściciela po kroku 24:** `#ocena` `#matka-pajakow`
- animacja śmierci „w sam raz”; krew mogłaby być jaskrawsza, ale to detal na później (backlog);
- walka z Matką Pająków jest za łatwa. Prośba: nowy atak — sieć rzucana za plecy gracza, która się rozprzestrzenia (jak dawny rozrzut wybuchów Strażnika), żeby było mniej czasu na reakcję, a pajączki szybciej dobiegały.

**Atak „Sieć” (`BossAttackKind.Web`, liczby moje w `SPIDER_QUEEN.web`):**
- wzór ataków: wylęg na przemian z rzutem siecią;
- miejsce: 85 px **za graczem** na linii boss → gracz (tam, dokąd gracz ucieka); od razu czerwony znacznik (obrys pełnego zasięgu + środek);
- zamach 300 ms, lot kłębu łukiem 350 ms (skrócone przy strojeniu: test pokazał, że przy dłuższym czasie uciekający gracz przebiega za plamę);
- po wylądowaniu plama rośnie z 20 do 60 px w 700 ms i leży 6 s; w środku spowolnienie 50% + 0,5 s klejenia (jak pajęczyny leża), dash przechodzi; nie zadaje obrażeń;
- wściekłość: dwie sieci w wachlarzu 70° za graczem i krótszy zamach (mnożnik telegrafu);
- miejsce poza areną (gracz przy ścianie) gra dosuwa w stronę gracza, aż trafi na podłogę areny;
- sieci znikają razem z Matką Pająków.

**Warstwa czysta:** `bossTypes` (`WebAttackDefinition`, `WebShot`, `BossAttackPlan.webs`), `bossAttacks.ts`: `planWeb`, `webPatchRadius`, `isInWebPatch`, `webFlightProgress`; `attackLeadTimeMs` uwzględnia rzut.

**Grafika (`tools/lair_enemies.py`):** `boss-web.png` (128×128: 6 klatek rozrostu o promieniach 20→60 px = hitbox plamy, 2 klatki błysku) i `web-ball.png` (16×16, kłąb w locie, 4 klatki obrotu). Sieć ma ten sam styl co lepkie pajęczyny leża — gracz od razu wie, że spowalnia.

**Phaser (`BossFight`):** znacznik, lot po łuku (wysokość 36 px, czysto wizualnie), rozrost w tempie `spreadMs` (frameRate liczony z liczby klatek), błysk w pętli, `Player.applyTerrainSlow` w plamie.

**Testy:**
- `SpiderQueen.test.ts`: wylęg na przemian z siecią w stałym rytmie; lądowanie za graczem i czasy; wściekłość (2 sieci, wachlarz, krótszy zamach); kierunek przy graczu w miejscu bossa; rozrost i wygasanie plamy; balans (uciekający gracz wbiega w plamę, stojącego nie trafia od razu);
- zgodność sprite'a z hitboxem: promień narysowanej sieci w każdej klatce rozrostu = promień plamy (±3 px).

**Weryfikacja:**
- `npm run build`: 739 testów zielonych;
- w grze (`?seed=7&floor=2`, ręczne `game.step()`, gracz 110 px pod bossem):
  - po wylęgu rzut siecią; miejsce 77 px za graczem (dosunięte o 8 px od ściany areny);
  - kłąb w locie nad ziemią; plama rośnie, potem błysk w pętli;
  - gracz w plamie spowolniony; plama znika po 6 s; po pokonaniu bossa sieci znikają;
  - zrzut ekranu: sieć przy wejściu do areny, w drodze ucieczki;
- brak błędów w konsoli.

**Do oceny w testach właściciela:** czy walka jest teraz wystarczająco trudna; odległość za graczem (85 px), rozmiar (60 px) i czas plamy (6 s).

---

## Krok 26 — Królewska Matka Pająków: wylęg z sufitu, królewski skok, plansza

**Feedback właściciela na starcie kroku:** `#ocena` `#matka-pajakow`
- królowa ma być „bardziej królewska”, a walka bardziej wymagająca;
- sieci za plecami są fajne (odległość 85 px zostaje);
- pajączki powinny spadać z sufitu — gracz ma się poczuć osaczony.

**Wylęg z sufitu (zastępuje wylęg za bossem, liczby moje w `SPIDER_QUEEN.brood`):**
- królowa wydaje zew (animacja złożenia, 667 ms), potem pajączki spadają **po kolei** co 160 ms, pierścieniem 64 px wokół gracza;
- kąty równo podzielone od losowego początku, odchylenie ±20° — z każdej strony jest pajączek;
- miejsce każdego cienia liczone wokół **aktualnej** pozycji gracza w chwili jego pojawienia się, więc pierścień „goni” uciekającego;
- cień rośnie 600 ms (bez czerwonego obrysu — lądowanie nie rani, zagrożeniem jest wybuch), pajączek widoczny na nici w ostatnich 220 ms;
- 4 pajączki (wściekłość: 5), limit żywych 8 (wcześniej 2/3 i 6);
- miejsce poza podłogą areny gra dosuwa w stronę gracza (jak sieć);
- kokony leża bez zmian (osobna ścieżka w `SpiderlingSwarm`).

**Królewski skok (`BossAttackKind.Leap`, `SPIDER_QUEEN.leap`):**
- od razu czerwona strefa lądowania (52 px) na miejscu gracza z chwili planu;
- przysiad 650 ms (królowa spłaszczona), lot łukiem 450 ms (44 px w górę, skala 1,18 w szczycie, cień na ziemi), lądowanie: 16 obrażeń (skalowane z piętrem), odrzut 300, wstrząs kamery;
- po lądowaniu królowa stoi 500 ms — okno na kontrę wręcz;
- wściekłość: krótszy przysiad (mnożnik telegrafu);
- w locie ciało fizyczne wyłączone (przelatuje nad graczem); lądowanie przy murze gra dosuwa do środka areny razem ze strefą;
- królowa lądująca na graczu wypycha go poza swoje ciało (kierunek od niej, przy wspólnym środku — kierunek lotu; nigdy w mur, kolejne kierunki co 45°).

**Rytm:** wzór zew → sieć → skok, przerwa między atakami 2200 → 1600 ms.

**Królewskość:**
- `BossDefinition.title` / `enragedLabel`: plansza w HUD przy przebudzeniu („Matka Pająków — Królowa Pajęczego Leża”), przy wściekłości „Królewski gniew!” (plansza i pasek HP zamiast „wściekły!”); Strażnik bez planszy;
- wstrząs kamery przy przebudzeniu i przy wściekłości (`BOSS_PRESENCE_VISUAL`).

**Kod:**
- czysto: `bossTypes` (`LeapAttackDefinition`, `BossLeap`, `BossAttackPlan.leap`, `SummonSpawn` z przesunięciem względem gracza i chwilą cienia), `bossAttacks` (`planBrood` od nowa, `planLeap`, `leapProgress`, `attackLeadTimeMs` liczy od pierwszego cienia/wybicia), `scaleBossForFloor` skaluje skok;
- Phaser: `combat/CeilingFallView.ts` — widok spadania z sufitu wspólny dla zrzutów leża (krok 23c, `CeilingDropManager` przepięty bez zmian w wyglądzie) i wylęgu; `BossFight` (wylęg, skok, wypchnięcie, wstrząsy, wspólne `clampToward`); `HudScene` (plansza); wygląd w `spriteConfig` (`BOSS_LEAP_VISUAL`, `SPIDERLING_DROP_VISUAL`, `BOSS_PRESENCE_VISUAL`).

**Testy (`SpiderQueen.test.ts`):**
- wylęg: czasy cieni i lądowań po kolei, pierścień o promieniu `ringRadius`, brak dużej luki w pierścieniu (20 seedów), wściekłość, limit żywych, balans (lądowanie poza zasięgiem zapłonu, cień daje czas na ucieczkę);
- rytm zew → sieć → skok w `BossBrain`;
- skok: czasy, strefa na miejscu gracza, `leapProgress`, wściekłość, balans (uważny gracz zdąży wyjść ze strefy), skalowanie obrażeń.

**Weryfikacja:**
- `npm run build`: 742 testy zielone;
- w grze (`?seed=7&floor=2`, ręczne `game.step()`):
  - plansza z tytułem przy wejściu, wstrząs;
  - 4 cienie po kolei wokół gracza (co ~150 ms), pajączki zjeżdżają na niciach i otaczają gracza; stojący gracz −13 HP;
  - skok na stojącego gracza: −18 HP, gracz wypchnięty 50 px od środka królowej, ciało bossa znów włączone;
  - skok na gracza w dwóch narożnikach i przy ścianie areny: lądowanie odsunięte od muru, gracz zostaje na podłodze areny;
  - wściekłość: „Królewski gniew!” na planszy i pasku;
  - zrzuty ekranu: pierścień pajączków z siecią za plecami, królowa w locie nad strefą;
- brak błędów w konsoli.
- **Uwaga z testu:** w jednym przebiegu, gdy pętla gry ruszyła na żywo bez sterowania (przed poprawką wypchnięcia), gracz znalazł się w murze poza areną. Po poprawce (wypchnięcie tylko na podłogę areny) nie powtórzyło się w testach przy ścianach — do obserwacji w testach właściciela.

**Do oceny w testach właściciela:** czy walka jest teraz wymagająca; gęstość pierścienia (4/5 pajączków, 64 px, co 160 ms); siła i telegraf skoku (650 ms + 450 ms, 16 obrażeń); czy plansza nie zasłania walki (3 s, nad środkiem ekranu).

---

## Krok 27 — Matka Pająków poluje: sprint, smagnięcie nogami, trucizna

**Feedback właściciela po kroku 26:** `#ocena` `#matka-pajakow` walka dalej za łatwa. Prośba:
- królowa dostaje przyspieszenie, żeby mogła doskoczyć do gracza;
- dostaje atak wręcz nogami z prostą animacją;
- trafienie nakłada truciznę zadającą tyle, co podpalenie z Ognistej pięści.

**Pościg (liczby moje):**
- zamiast trzymać dystans 150 px królowa poluje:
  - dalej niż 110 px od gracza: sprint 150 px/s;
  - bliżej: chód 70 px/s (wcześniej 45);
  - staje 44 px od gracza, czyli tuż przy nim (ciała stykają się przy 40 px);
- sprint jest wolniejszy niż gracz (200), więc biegnący gracz ucieknie. Gracz spowolniony siecią (100) już nie;
- nowe pola `BossDefinition.sprint` i `BossDecision.speed`.

**Smagnięcie nogami (`BossAttackKind.Lash`, `SPIDER_QUEEN.lash`):**
- atak poza wzorem: królowa smaga, gdy gracz jest bliżej niż 56 px i od poprzedniego smagnięcia minęło 900 ms;
- atak ze wzoru (zew, sieć, skok) ma pierwszeństwo, jeśli nadszedł jego czas, a po smagnięciu czeka do jego końca;
- strefa przed królową:
  - środek 34 px w stronę gracza, promień 30, czyli zasięg do 64 px;
  - zamach 420 ms (po wściekłości 315), potem 10 obrażeń (skalowane z piętrem) i odrzut 220;
  - po ciosie 350 ms przerwy;
- zamach wydłużony z 380 ms: test balansu pokazał, że po wściekłości gracz nie zdążyłby wyjść ze strefy z krawędzi zasięgu.

**Trucizna:**
- `StatusApplication.poison` (ten sam kształt co podpalenie), w `StatusEffects` wspólne `DamageOverTime` dla podpalenia i trucizny;
- liczby wzięte wprost z `ITEM_EFFECTS.fireFist`: 3 obrażenia co 500 ms przez 2 s, łącznie 12. Bez skalowania z piętrem;
- `AreaStrike.status`: strefa przekazuje status w trafieniu. `Player.takeHit` nakłada status z trafienia;
- trucizna tyka w `Player.tick` także w nietykalności, bo to status, a nie nowe trafienie, i może zabić (`Player.die`);
- wygląd:
  - gracz migocze na zielono (`STATUS_TINTS.poison`, wspólne `statusTint`; spowolnienie dalej na niebiesko);
  - zielone liczby obrażeń nad graczem.

**Animacja (`tools/spider_sprites.py`):**
- arkusz `spider-queen_move-birth.png` zastąpiony przez `spider-queen_move-birth-lash.png`: 12 kolumn (1152×768), kolumny 0–7 bez zmian;
- kolumny 8–11 to smagnięcie przednimi nogami:
  - zamach szeroko na boki;
  - uniesienie (skrót perspektywy);
  - cios: pazury schodzą przed kły;
  - uderzenie: pazury skrzyżowane przed paszczą;
- w ostatnich dwóch klatkach pazury są wydłużone i mają kolor jadu (zieleń palety leża);
- animacja rozciągnięta na czas zamachu, więc ostatnia klatka wypada w chwili uderzenia;
- pozostałe arkusze generatora wychodzą bajt w bajt takie same;
- `BossVisual.attacks` (mapa rodzaj ataku → animacja) zastępuje `attack` + `attackKinds`. Strażnik: Nova i Barrage → plucie. Królowa: zew → złożenie, smagnięcie → `lash`.

**Testy:**
- `SpiderQueen.test.ts` (krok 27):
  - sprint z daleka i chód z bliska;
  - sprint wolniejszy niż gracz, ale szybszy niż gracz w sieci;
  - plan smagnięcia: strefa przed królową, trucizna równa Ognistej pięści, strefa sięga gracza;
  - odstęp między smagnięciami, a poza zasięgiem brak smagnięcia;
  - pierwszeństwo ataku ze wzoru;
  - balans: uważny gracz zdąży wyjść ze strefy;
  - skalowanie obrażeń smagnięcia bez skalowania trucizny;
- `itemEffects.test.ts`: trucizna tyka jak podpalenie, niezależnie od niego;
- `sprites.test.ts`: animacje wszystkich ataków bossów istnieją.

**Weryfikacja:**
- `npm run build`: 749 testów zielonych;
- w grze (`?seed=7&floor=2`, ręczne `game.step()`, gracz stoi w miejscu, wzór odsunięty):
  - sprint 150 px/s z 133 px, od 108 px chód 70;
  - smagnięcie na 54 px z animacją `lash`: −11 HP i trucizna, tyknięcia po −3;
  - kolejne smagnięcia co ~1,7 s: stojący gracz spadł ze 100 do 40 HP w 6 s;
  - zrzut ekranu: strefa smagnięcia pod nogami królowej, zielone „-3” nad graczem;
- brak błędów w konsoli.

**Do oceny w testach właściciela:**
- czy walka jest teraz wymagająca;
- prędkość sprintu (150) i próg (110 px);
- zasięg, zamach i odstęp smagnięć;
- czytelność animacji smagnięcia (jest prosta; przy 96 px ruch nóg jest subtelny, czytelność daje głównie czerwona strefa).

**Ocena właściciela po teście kroków 26–27:** `#ocena` `#matka-pajakow`
- sprint w porządku; królowa trafia, kiedy gracz się zagapi;
- smagnięcie: da się uciec, ciosy nie padają za często, czerwona strefa w porządku;
- trucizna i obrażenia w porządku;
- animacja smagnięcia „tak średnio” — słabo widać, właściciel dostrzegł ją dopiero przy drugim trafieniu; zostaje na razie;
- wypychanie gracza przy ścianie po skoku niesprawdzone w teście właściciela (nie walczył przy ścianie);
- ogólnie walka „się zagęściła”; **decyzja:** Matkę Pająków odkładamy, wrócimy przy strojeniu.

---

## Krok 28a — Grzybnia: paleta, arkusz kafli i mgła

**Decyzje właściciela (cały biom, kroki 28a–…):** `#decyzja` `#grzybnia`
- na razie proste biomy: **każdy biom to jedno piętro zakończone swoim bossem**; biomy-„fillery” (nawiązujące do poprzednich albo lekko zmodyfikowane) później;
- Grzybnia: biom grzybowy, ciąg dalszy Pajęczego leża; boss to **Król Pająków zainfekowany grzybem**, zanim pożarła go królowa;
- całe piętro porośnięte grzybami, estetyka fioletowa, ale ciemniejsza, z domieszką niebieskiego, unosząca się mgiełka;
- ograniczone pole widzenia jak w „Mroku”, ale ogranicza je mgła;
- boss: większy niż Matka Pająków, odwłok pokryty kościstym grzybem, chodzi na dwóch grubych łapach, pozostałe odnóża zwisają z boku i kłują jak wiele sztyletów;
- wszystko (kafle, pułapki, efekty, wrogowie, boss) generujemy generatorami (decyzja po kroku 27: generator jako domyślna droga, ręczny rysunek tylko dla animacji, które z generatora wyjdą za słabe).

**Moje propozycje, przyjęte bez sprzeciwu (do zmiany na sygnał właściciela):** `#grzybnia`
- piętro 3 (2 — leże z Matką Pająków, 3 — Grzybnia z Królem);
- mgła gęsta, ze świecącymi grzybami-latarniami zamiast pochodni;
- pułapka: purchawki z trującą chmurą (status trucizny z kroku 27);
- wrogowie: zarażony pająk (Rusher) i grzybiec plujący zarodnikami (Kiter).

**Plan biomu:**
- 28a — paleta, arkusz kafli, mgła (ten krok);
- 28b — wrogowie: zarażony pająk i grzybiec;
- 28c — purchawki;
- 29 — Król Pająków (sprite'y, ataki, w tym kłucie sztyletami-odnóżami).

**Generator (`tools/tower_ruins_tiles.py --biome fungal_grove`):**
- paleta `grzybnia`:
  - kamień w ciemnym fiolecie wpadającym w indygo (barwa 278–300°), mury ciemniejsze niż w leżu;
  - plamy i posoka w ciemnym turkusie pleśni, zarodniki i strzępki w bladym liliowobłękitnym;
  - kości i kapelusze w bladej kości z fioletem;
  - „ogień” to bioluminescencja: cyjan zamiast płomienia (poświata latarni w grze też bierze tę barwę);
- pierwsza wersja podłogi była za ciemna: kontrast obrysu postaci 1,92, a bruk 1,97 przy progu 2,0 (STYLEGUIDE §6a). Podłoga i fuga lekko rozjaśnione, teraz 2,14 i test bruku zielony. Mrok daje mgła, nie kafle;
- dodatki: `extras = ('spider', 'fungus')` — biom dziedziczy z leża jaja, nici i pancerzyki, a do tego:
  - `face_shelf` (kościste grzyby półkowe) i `face_hyphae` (strzępki ze świecącymi końcówkami) w grupie `wallFace.fungus`;
  - `decal_mushrooms_a/b`: kępki grzybów z jedną świecącą plamką — punkt orientacyjny w mgle. Pierwsza wersja wyglądała jak iskierki, przerysowałem kapelusze;
  - `decal_mycel_a/b`: grzybnia, cienkie rozgałęzione strzępki;
  - pochodnie w tym biomie to **grzyby-latarnie**: uchwyt to kościsty trzon z lica (`lantern_stalk`), a 4 klatki płomienia to pulsujący, świecący kapelusz (`lantern_cap`);
- arkusze ruin i leża po zmianach są identyczne co do bajtu (PNG i JSON);
- wynik: `public/assets/tilesets/fungal_grove_tileset.{png,json}` (130 kafli).

**Mgła (`config/lightingConfig.ts`, `FUNGAL_FOG`):**
- ta sama warstwa co mrok (`LightingOverlay`), ale w kolorze mgły — głębokie indygo `#272449`, nie czerń;
- wyraźnie ok. 2 kafle wokół bohatera, potem 4 twarde pasma do 88% na ok. 5 kaflach. Grzyby-latarnie rozwiewają mgłę wokół siebie;
- pierwsza wersja (`#3c3a66`, 85%) była mleczna, przyciemniłem;
- `effects/FogWisps.ts`: dryfujące obłoczki (twarde elipsy, stała alfa 0,14, warstwa pod mgłą);
- zarodniki zamiast pyłków: więcej cząstek, wolniejszych;
- `BiomeDefinition.fog` (pozostałe biomy: `null`);
- **piętro z mgłą nie losuje „Mroku”**: `floorModifierFor` dostał filtr per piętro (`allowed`, `limitsVision`); pozostałe piętra losują dokładnie tak samo jak bez filtra (test). Na seedzie 7 piętro 3 miało wcześniej „Mrok”, teraz „Złotą żyłę”.

**Config:** `FUNGAL_GROVE_TILESET_ASSET`, `FUNGAL_GROVE_DRESSING`:
- kępki grzybów, grzybnia, mniej pancerzyków;
- detale lica 22%;
- pajęczyny w rogach 50%;

`BIOME_BY_FLOOR[3] = FungalGrove`. Do kroku 28b wrogowie z leża (pająk, nietoperz), do kroku 29 na piętrze 3 walczy Strażnik.

**Testy:**
- `biomes.test.ts`:
  - wybór piętra (2 leże, 3 Grzybnia);
  - dekoracje Grzybni;
  - mgła: jasny ton, a nie czerń, wyraźny widok przy bohaterze, gęstsza niż zwykły mrok i rzadsza niż „Mrok”;
  - inne biomy bez mgły;
  - czytelność bohatera, pająka, nietoperza i pajączka na podłodze i bruku Grzybni;
- `floorModifiers.test.ts`: filtr per piętro.

**Weryfikacja:**
- `npm run build`: 759 testów zielonych;
- w grze (`?seed=7&floor=3`): biom `fungal-grove`, 13 grzybów-latarni, modyfikator „Złota żyła”;
- zrzuty ekranu:
  - mgła w pasmach wokół bohatera, z poświatą latarni;
  - grzyb-latarnia na licu, kępka grzybów, pajęczyna w rogu;
  - pająk wyłaniający się z mgły;
- brak błędów w konsoli.

**Do oceny w testach właściciela:** `#grzybnia`
- gęstość i kolor mgły (czy nie za mleczna/za ciemna, czy widok 2 kafli to nie za mało);
- czy grzyby-latarnie i kępki grzybów czytają się jako grzyby;
- czy obłoczki mgły są widoczne.
- **Znane ograniczenie:** Kitery mogą strzelać z mgły, zza granicy widoku — to część wyzwania biomu, do oceny w teście.

---

## Krok 28a (cd.) — Płynne światło zamiast kręgów

**Ocena właściciela po teście Grzybni:** `#ocena` `#grzybnia` biom „uznajmy, że jest OK”. Do poprawy światło: „nie możemy mieć takich kręgów dookoła”. Po czasie irytuje, bo niezależnie od biomu efekt jest ten sam — „jakbyśmy byli jakąś tęczą światła”. Ma być płynne przejście.

**Decyzja właściciela:** `#decyzja` światło przechodzi płynnie. Odwołuje decyzję z kroku 19a („twarde pasma, bez ditheringu”). Bez ditheringu zostaje.

**Zmiana:**
- `systems/lighting.ts`: `banded` zastąpione przez `smoothFalloff` (smoothstep — łagodny start przy bohaterze i łagodne wejście w pełny mrok);
- wspólna krzywa dla mroku otoczenia (winieta 30%), mgły Grzybni, modyfikatora „Mrok” i świateł pochodni/latarni;
- `bands` usunięte z `AmbientProfile`, `TorchLightConfig`, profilu „Mroku” i mgły; klucze tekstur stempli bez liczby pasm;
- STYLEGUIDE §6b zaktualizowany (płynne światło, mgła biomu).

**Testy (`lighting.test.ts`):**
- zamiast „dokładnie N pasm” sprawdzam płynność:
  - sąsiednie piksele różnią się najwyżej o największą stromość smoothstep;
  - setki poziomów mroku;
  - stempel pochodni ma ponad 100 poziomów alfy;
- limity czytelności bez zmian: w strefie walki obrys ≥ 2:1, pełne 30% tylko w narożnikach kadru (teraz 29,9%, porównanie przybliżone).

**Weryfikacja:**
- `npm run build`: 759 testów zielonych;
- zrzuty ekranu bez widocznych pierścieni:
  - Grzybnia: mgła i latarnie (`?seed=7&floor=3`);
  - leże: winieta (`?seed=7&floor=2`);
  - „Mrok”: miękka krawędź (`?seed=3&floor=2`);
- brak błędów w konsoli.

**Do oceny w testach właściciela:** `#grzybnia` czy przejście jest wystarczająco miękkie. Ewentualnie: szerszy pas przejścia albo inna krzywa.

---

## Krok 28b — Zarażony pająk i grzybiec (Grzybnia)

**Zgodnie z zasadą małej liczby archetypów:** `#grzybnia` zarażony pająk to wariant Rushera, a grzybiec wariant Kitera. Logika AI bez zmian. Wyróżnik biomu: obaj zatruwają (status z kroku 27).

**Generator `tools/grove_enemies.py`** (nowy; narzędzia z `lair_enemies.py`, `spider_sprites.py`, paleta `grzybnia`):
- `infected-spider_walk.png` (48×48, 4 klatki chodu): pająk leża, na odwłoku trzy kościste kapelusze zamiast białych pręg, strzępki, cyjanowe oczy;
- `fungoid_walk-spit.png` (48×48):
  - kolumny 0–3 pełzanie, 4–7 plucie;
  - rdzawy kapelusz z bladymi łatkami i jasnym rondem blaszek, za nim wloką się korzenie, cyjanowe oczy pod przednim rondem;
  - przy pluciu kapelusz nabrzmiewa, a przed pyskiem rośnie zielony obłok;
  - pierwsza wersja (nóżki po bokach) wyglądała jak żółw albo biedronka, więc ją przerobiłem;
- `spore-ball.png` (16×16, 4 klatki): zielony rdzeń jadu w bladym obłoku. Ta sama zieleń co zatruty gracz;
- pierwsza wersja kuli była szara i bez jadu, a obłok i korzenie wchodziły w margines — poprawione, walidator czysty.

**Liczby (moje, `combatConfig.ENEMY_VARIANTS`, do strojenia w teście):**
- zarażony pająk: walka Rushera (10 obrażeń) plus trucizna 2 co 0,5 s przez 1,5 s (6), słabsza niż Ognista pięść;
- grzybiec: rytm i zachowanie Kitera; kula za 5 (mag 8), wolniejsza (170 zamiast 240), zamach 450 ms, odnowienie 1,6 s. Trucizna jak Ognista pięść: 3 co 0,5 s przez 2 s (12). Wolniejsza i z dłuższym zamachem, żeby w mgle dało się ją zobaczyć i ominąć.

**Kod:**
- `BaseAttackDefinition.status`: status z trafienia wroga;
- `EnemyManager`: przenosi status w ugryzieniu i w pocisku;
- `ProjectileSpec.status` → `Projectile.status`: trafienie pociskiem nakłada status;
- `EnemyVariant.InfectedSpider` / `Fungoid`, arkusze, `ENEMY_VISUALS` (grzybiec ma płaski, szeroki cień), `ENEMY_PROJECTILE_VISUALS`;
- `biomeConfig`: Grzybnia → zarażony pająk + grzybiec;
- makieta generatora kafli mierzy czytelność nowych wrogów:
  - bohater 2,18 / 3,17;
  - pająk 2,18 / 1,75;
  - grzybiec 2,18 / 1,16 — ciało czytelne dzięki barwie (rdza na fiolecie, Δ 132°).

**Testy:**
- `enemyVariants.test.ts`:
  - mapowanie Grzybni;
  - pająk = Rusher z trucizną słabszą niż Ognista pięść;
  - grzybiec = Kiter ze słabszą i wolniejszą kulą, trucizna równa Ognistej pięści, wygląd pocisku;
- `biomes.test.ts`: czytelność bohatera, zarażonego pająka i grzybca na podłodze i bruku Grzybni.

**Weryfikacja:**
- `npm run build`: 767 testów zielonych;
- w grze (`?seed=7&floor=3`): 9 zarażonych pająków, 1 grzybiec;
  - grzybiec gra animację plucia, kula `spore-ball` leci 170 px/s, trafienie −7 (5 po skalowaniu piętra i Złotej żyle) i trucizna po −3;
  - ugryzienie pająka −14 z trucizną;
  - zrzut ekranu: zatruty bohater migocze na zielono, zielone „-3”, grzybiec w mgle;
- brak błędów w konsoli.

**Do oceny w testach właściciela:** `#grzybnia`
- czy grzybiec czyta się jako grzyb;
- siła trucizny obu wrogów (biom jest teraz wyraźnie trudniejszy od leża);
- czy kulę zarodników widać w mgle.

---

## Krok 28b (cd.) — Mrok na krańcach kadru i klimat Grzybni

**Ocena właściciela po teście (nagranie z gry):** `#ocena` `#grzybnia`
- „kolejny raz problem z oświetleniem”: w pewnym momencie krańce ekranu się rozjaśniają; „może chodzi o jakieś granice”;
- biomy powinny być tym mroczniejsze i pełniejsze, im głębiej wchodzimy;
- podstawowe płytki upstrzone grzybem, naleciałością — „brakuje podstawowego klimatu”, nie chodzi o detale;
- mury bardziej uszkodzone.

**Decyzja:** `#decyzja` każdy kolejny biom jest mroczniejszy od poprzedniego (Grzybnia ciemniejsza niż leże).

**Przyczyna rozjaśniania (błąd od kroku 19a, we wszystkich biomach):**
- z nagrania (klatki 41–45 s i 49–53 s): warstwa mgły kończyła się ostrą krawędzią w 2/3 ekranu, dalej podłoga była odsłonięta;
- warstwa mroku była wyśrodkowana na bohaterze, z zapasem tylko na martwą strefę kamery;
- przy brzegu mapy kamera staje, a przy szybkim ruchu i dashu (lerp 0,12) zostaje w tyle — bohater schodził ze środka kadru i warstwa nie sięgała przeciwnego brzegu;
- w zwykłym mroku (30%) błąd był ledwo widoczny, w gęstej mgle bije w oczy.

**Poprawka:**
- `systems/lighting.ts`: `overlayOrigin`. Warstwa jest wyśrodkowana na kadrze kamery (z poprzedniej klatki) i przycięta do granic świata jak kamera;
- zapas 24 px na ruch kamery w jednej klatce (`LightingOverlay.MARGIN`); stempel światła bohatera nadal w jego pozycji;
- test (`lighting.test.ts`): kadr po ruchu kamery o mniej niż zapas leży w całości pod warstwą — w środku mapy, przy brzegach i w narożnikach;
- w grze: bohater pędzący 900 px/s od środka mapy przez wszystkie 4 narożniki — warstwa pokrywa kadr w 542 z 542 klatek.

**Klimat Grzybni (generator kafli, tylko biom `fungal_grove`; arkusze ruin i leża identyczne co do bajtu):**
- **podłoga zarośnięta:**
  - kafle bazowe: pleśń w fugach (20%), zarodniki, rzadkie świecące drobiny (`overgrow`);
  - duże, nieregularne plamy pleśni z prześwitami (`decal.mold`, 3 warianty, waga 5) i dwa razy więcej nakładek (`decalChance` 0,2);
  - zamiast kurzu przy murach — pleśń wpełzająca z muru, gęsta przy ścianie, dalej strzępiaste języki (`decal.dust*`, szansa 80/70/70%);
  - pierwsza wersja kładła plamy na każdym kaflu bazowym i wyszedł z tego powtarzalny wzór kropek (do tego za jasny turkus) — przeniosłem plamy do nakładek i wyciszyłem kolor pleśni;
- **mury bardziej zniszczone:**
  - pęknięte i wyszczerbione warianty losują się 4× częściej;
  - pleśń w spoinach, plamy na blokach, zacieki na licu;
  - mury ciemniejsze o ok. 0,04 jasności;
- czytelność postaci bez zmian (obrys 2,16 ≥ 2,0).

**Weryfikacja:**
- `npm run build`: 769 testów zielonych;
- w grze piętro 3 z pleśnią przy murach i na płytach. Panel przeglądarki był zbyt wąski na dokładną ocenę szczegółów — ocena w teście właściciela.

**Do oceny w testach właściciela:** `#grzybnia`
- czy krańce już się nie rozjaśniają;
- czy podłoga i mury mają wystarczająco klimatu (ilość pleśni, zniszczenia);
- czy biom jest wystarczająco mroczny.

---

## Krok 29 — Król Pająków: wygląd, ciosy i paraliż

**Ocena i decyzje właściciela:** `#ocena` `#decyzja` `#grzybnia` `#krol-pajakow`
- klimat Grzybni po kroku 28b (cd.) „bardzo na plus — właśnie o coś takiego chodziło”;
- właściciel przygotował własny szkic Króla (ilustracja z ukosa, z przodu) i poprosił o niezależną propozycję Claude'a;
- po porównaniu wybrał połączenie: generator i rzut z góry od Claude'a, wygląd ze szkicu. Ocena: „połączony król jest zajebisty”;
- ciosy zostawił Claude'owi: „to pająk”, pamiętać o ciosach Królowej, użyć grzybów i konkretnych ograniczeń terenu — „żebyśmy czuli strach przed spotkaniem z nim”;
- nowy status: **paraliż**, np. po rzuceniu kokonem albo po mocnym uderzeniu.

**Wygląd (`tools/king_sprites.py` → `spider-king_walk-stab.png`, 128×128, 8 kierunków):**
- z generatora: rzut z góry, chód na dwóch grubych łapach, po dwa zwisające odnóża-sztylety na stronę (opis właściciela z kroku 28), animacje;
- ze szkicu właściciela:
  - zielona, świecąca masa grzybni na odwłoku z bulwami zarodników;
  - pomarańczowe grzyby półkowe na obrzeżu;
  - jasnolawendowy pancerz z kępami mchu;
  - dwa uniesione przednie odnóża-kosy z zakrzywionym, zakażonym ostrzem;
  - osiem zielonych oczu;
- kolumny 0–3 chód, 4–7 atak: zamach, lewe sztylety, prawe, uderzenie (kosy zbiegają się, wszystkie sztylety naprzód);
- wcześniejsze wersje:
  - moja pierwsza propozycja (kościste grzyby jak łuski szyszki, szara);
  - druga (rdzawe brzegi, korona z kolców);
  - pierwsza wersja połączona miała za krótkie ostrza kos;
- pancerz rozjaśniony, bo test czytelności pokazał, że ciemny fiolet zlewa się z podłogą Grzybni (kontrast 1,06).

**Paraliż (nowy status, `StatusApplication.paralysis`):**
- gracz nie chodzi, nie atakuje, nie strzela i nie robi dasha; odrzut z trafienia nadal działa;
- po paraliżu 2 s odporności (`PLAYER_STATUS_RESISTANCE.paralysisImmunityMs`), żeby Król nie zamknął gracza serią; nowy paraliż nie przedłuża trwającego;
- wygląd: bladozielona barwa bohatera (`STATUS_TINTS.paralysis`) i napis „Paraliż!”.

**Ciosy Króla (moje, `bossConfig.SPIDER_KING`, do strojenia w teście):**
- **ścięcie kosami** (mechanika smagnięcia Królowej, `LashAttackDefinition.status` zamiast samej trucizny):
  - z bliska (< 70 px), strefa do 80 px przed Królem;
  - zamach 650 ms, 18 obrażeń, odrzut 320, paraliż 0,7 s;
  - odstęp 1,4 s;
- **grad sztyletów** (`BossAttackKind.Flurry`): 6 ukłuć (po wściekłości 8) w linii w stronę gracza, co 22 px i co 110 ms, każde 8;
- **rzut kokonem** (`CocoonThrow`):
  - kokon leci łukiem 650 ms na miejsce gracza; strefa lądowania widoczna od razu;
  - 6 obrażeń i paraliż 1,2 s;
  - po wściekłości drugi kokon 80 px za graczem, w drodze ucieczki (jak sieć Królowej);
- **wysyp grzybni** (`Bloom`, teren):
  - 3 płaty (po wściekłości 4): pierwszy pod graczem, reszta 55–100 px wokół;
  - telegraf 800 ms, płat rośnie 14 → 40 px i leży 14 s;
  - w płacie trucizna (2 co 0,5 s) i spowolnienie 35%; chroni tylko dash;
  - arena z czasem zarasta (w teście do 6 płatów naraz);
- wzór: grzybnia → sztylety → kokon; ścięcie poza wzorem, gdy gracz jest blisko;
- Król cięższy od Królowej: promień 34, 420 HP (piętro 3: 546), chód 55, staje 52 px od gracza;
- plansza: „Król Pająków — Zainfekowany Władca Grzybni”, przy wściekłości „Gniew Grzybni!”;
- `BOSS_BY_FLOOR[3] = SPIDER_KING`.

**Kod:**
- czysto: `bossTypes` (`FlurryAttackDefinition`, `CocoonThrowDefinition`, `BloomAttackDefinition`, `ThrownObject`, `WebShot.look/status`, `BossAttackPlan.throws`), `bossAttacks` (`planFlurry`, `planCocoonThrow`, `planBloom`), `StatusEffects` (paraliż);
- grafika: `tools/grove_enemies.py` → `mycelium-patch.png` (96×96, rozrost = hitbox płatu, pulsowanie bulw);
- Phaser:
  - `BossFight`: płaty sieci albo grzybni (`BOSS_PATCH_VISUALS`), trucizna terenu (`Player.applyTerrainStatus`);
  - kokon w locie z klatek kokonu leża, pęka przy lądowaniu;
  - napis paraliżu;
- `Player`: paraliż blokuje ruch, dash, cios i strzał.

**Testy:**
- `SpiderKing.test.ts`:
  - piętro 3 → Król;
  - większy od Królowej;
  - skalowanie;
  - plany ścięcia, sztyletów, kokonu i grzybni;
  - balans (z płatu pod sobą da się wyjść);
  - wzór ataków;
  - paraliż z odpornością, bez przedłużania;
  - sprite płatu zgodny z hitboxem;
- `biomes.test.ts`: czytelność Króla na podłodze Grzybni.

**Weryfikacja:**
- `npm run build`: 786 testów zielonych;
- w grze (`?seed=7&floor=3`, gracz stoi 150 px od Króla):
  - kolejno grzybnia, ścięcie (paraliż), sztylety, kokon;
  - do 6 płatów grzybni naraz;
  - paraliż po ścięciu;
  - zrzut ekranu: strefa lądowania kokonu na bohaterze, kokon w locie, „Paraliż!”;
- brak nowych błędów w konsoli (dwa stare wpisy z przeładowań HMR w trakcie zmian).

**Uwagi z testu:** `#krol-pajakow`
- gracz stojący blisko dostaje ścięcie z paraliżem co ok. 3 s, w przerwach między atakami ze wzoru — ostro, do oceny w teście właściciela;
- kokon w 2 s odporności po ścięciu nie paraliżuje (zgodnie z zasadą);
- Król nie ma jeszcze animacji śmierci (ginie od razu, plama) — kandydat na później.

**Do oceny w testach właściciela:** `#krol-pajakow`
- czy czuć strach (gęstość ciosów, zarastanie areny);
- długość paraliżu (0,7 s / 1,2 s) i 2 s odporności;
- siła ścięcia;
- czy grad sztyletów i rzut kokonem są czytelne.

---

## Krok 28c — Purchawki (Grzybnia)

**Decyzja właściciela:** `#decyzja` `#grzybnia` „skończ purchawki”. Potem kolejno: powrót do „Mroku” i następny biom. Pomysł z kroku 28a (purchawki z trującą chmurą) przyjęty bez zmian.

**Reguły (moje, `biomeConfig` → Grzybnia `puffballs`, do strojenia w teście):**
- miejsce:
  - 1–3 purchawki w zwykłym pokoju (biom „pełniejszy” od leża);
  - te same reguły co kokony: 1 kafel od ścian, wolny środek 3×3 (kapliczka), odstęp ≥ 3 kafle;
  - bez kolizji, więc linia wzroku Kiterów bez zmian;
- zapalnik jak u kokonu:
  - gracz ≤ 22 px od środka budzi purchawkę;
  - telegraf 500 ms: purchawka nabrzmiewa i drży, por świeci jadem, czerwona strefa ma pełny zasięg chmury;
- pęknięcie zostawia **trującą chmurę**:
  - rośnie z 20 do 44 px w 400 ms i wisi 4 s;
  - to teren: liczy się środek gracza, trucizna 2 co 0,5 s, odnawiana w chmurze, po wyjściu trwa jeszcze 1,5 s;
  - chroni tylko dash, nietykalność po trafieniu nie chroni;
  - przez ostatnie 600 ms chmura się rozwiewa (tylko wizualnie, truje do końca);
- cios, strzał i Burzowy pęd rozrywają purchawkę od razu:
  - z dystansu da się ją rozbroić, ale chmura i tak zostaje i na chwilę zamyka przejście;
  - nie liczy się do Wampirzego kła;
- chmura nie truje wrogów, bo to ich biom;
- sflaczała skórka zostaje na podłodze jako ślad (jak strzępy kokonu).

**Warstwa czysta:**
- `systems/Puffballs.ts`:
  - `PuffballConfig`, `PoisonCloudConfig`;
  - `poisonCloudRadius` (rozrost i wygasanie), `isInPoisonCloud`;
- zapalnik: `CocoonState` przyjmuje teraz tylko `triggerRadius` i `fuseMs`, więc służy obu pułapkom;
- rozmieszczenie: `planCocoons` (te same reguły miejsca), własna sól RNG `PUFFBALL_SEED_SALT`.

**Grafika (`tools/grove_enemies.py`):**
- `puffball.png` (32×32, 8 klatek):
  - 0–1 spoczynek: blady beż z brodawkami, z poru ulatuje obłoczek;
  - 2–3 nabrzmiewanie i drżenie;
  - 4–7 pęknięcie i sflaczała skórka;
  - barwa celowo inna niż biały kokon leża;
- `poison-cloud.png` (96×96, 8 klatek):
  - 0–5 rozrost, promień 20→44 px, czyli hitbox chmury;
  - 6–7 kłębienie;
  - w grze rysowana z alfą 0,6 nad podłogą i pod postaciami;
- dwie wcześniejsze wersje chmury odrzuciłem:
  - ukośne „odłamki” zamiast kłębów;
  - „kiść winogron” z obwódką każdego kłębu;
  - obecna to jedna sylwetka z ciemnym brzegiem i jasnymi czubkami kłębów;
- pozostałe arkusze generatora wychodzą bajt w bajt takie same.

**Phaser:**
- `entities/Puffball.ts` (cel `MeleeTarget`, bez ciała fizycznego);
- `combat/PuffballManager.ts`: telegraf, pęknięcie, chmury, trucizna przez `Player.applyTerrainStatus`;
- `GameScene`: menedżer tylko, gdy biom ma purchawki; cios, strzał i dash rozstrzygane jak przy kokonach;
- `spriteConfig`: `puffball`, `poisonCloud`, `PUFFBALL_VISUAL`.

**Testy (`tests/systems/puffballs.test.ts`):**
- purchawki tylko w Grzybni; rozmieszczenie na podłodze zwykłych pokojów, limit, >90% pokojów ma purchawkę;
- zapalnik: budzenie, jedno pęknięcie po `fuseMs`, trafienie od razu;
- chmura: rozrost, czas, zniknięcie, środek gracza; trucizna odnawiana co klatkę tyka równo i trwa po wyjściu;
- balans:
  - uważny gracz (reakcja 200 ms) wyjdzie chodem, zanim chmura urośnie;
  - dash przelatuje przez całą chmurę;
  - strzał sięga spoza chmury;
  - trucizna nie mocniejsza niż u zarażonego pająka;
- sprite chmury zgodny z hitboxem (±3 px).

**Weryfikacja:**
- `npm run build`: 802 testy zielone;
- w grze (`?seed=7&floor=3`), 13 purchawek na piętrze:
  - gracz stojący przy purchawce: pęknięcie po ok. 0,5 s, a w chmurze trucizna po −2 co 0,5 s;
  - chmura znika po 4 s;
  - cios z 20 px rozrywa purchawkę i zostawia chmurę, bez leczenia z kła;
  - zrzut ekranu: chmura obok bohatera, skórka w środku;
- brak błędów w konsoli.

**Do oceny w testach właściciela:** `#grzybnia`
- czy chmura czyta się jak gaz (kolor, alfa 0,6);
- zasięg budzenia (22 px) i telegraf 500 ms;
- czas chmury (4 s) i siła trucizny;
- czy purchawek nie jest za dużo (1–3 na pokój).

---

## Krok 30 — „Mrok”: wrogowie widoczni dopiero w świetle

**Punkt wyjścia (backlog p. 2):** `#mrok`
- feedback testera: światło na piętrze „Mrok” jest zbyt jasne, a wrogowie mają się pokazywać dopiero w świetle bohatera;
- próba „pełna czerń poza kręgiem + promień 96 px” została wcześniej odrzucona.
- Stan przed krokiem (`?seed=3&floor=2`): krąg światła 112 px, mrok 94%. Wróg wchodzący w miękką krawędź kręgu był od razu widoczny.

**Decyzje właściciela (na starcie kroku):** `#decyzja` `#mrok` `#grzybnia`
- krąg światła zostaje; **wrogowie poza światłem są całkiem niewidoczni**, bez świecących oczu (odrzucona opcja z oczami jako ostrzeżeniem i opcja „mniejszy krąg”);
- pociski i czerwone strefy ataków zostają widoczne;
- efekt działa w modyfikatorze „Mrok” **i w mgle Grzybni**.

**Reguły (moje, do oceny w teście):**
- widoczność wroga = najsilniejsze światło w jego miejscu:
  - zawsze światło bohatera;
  - w mgle także latarnie;
  - w „Mroku” pochodnie nie rozświetlają mroku (mechanika z kroku 19a), więc nie odsłaniają wrogów;
- od połowy siły światła (`LIGHTING.enemyReveal.revealStrength` = 0,5) wróg jest w pełni widoczny, poniżej płynnie znika. Ta sama płynna krzywa co światło (krok 28a), bez skoku;
- w „Mroku” wróg jest w pełni widoczny do ok. 87 px, znika przy 112 px; w mgle do ok. 90 px, znika przy 160 px;
- ukrywani: zwykli wrogowie i wszystkie pajączki (z kokonów i z wylęgu bossa), razem z cieniem. **Boss zostaje widoczny** — moja decyzja, do potwierdzenia;
- pułapki (kokony, pajęczyny, purchawki) się nie chowają.

**Kod:**
- czysto: `systems/lighting.ts` → `actorVisibility` (światło bohatera i punktowe, próg `revealStrength`); config w `lightingConfig.enemyReveal`;
- Phaser:
  - `effects/EnemyVisibility.ts`: co klatkę (po fizyce, razem z warstwą mroku) ustawia alfę wrogów i klucz `lightVisibility`;
  - `GroundShadow`: cień bierze alfę z klucza `lightVisibility` (mruganie gracza nie rusza jego cienia);
  - `EnemyManager.living`, `CocoonManager.spiderlings`, `BossFight.minions`;
  - `GameScene.hideableEnemies`.

**Testy (`lighting.test.ts`, 4 nowe):**
- „Mrok”: pełna widoczność w pełnym świetle, zero od krawędzi widzenia;
- płynne znikanie bez skoków („Mrok” i mgła);
- latarnia w mgle odsłania wroga z dala od bohatera, poza nią wróg niewidoczny;
- balans: wróg atakujący wręcz (największy `hitRange` wśród wariantów) jest zawsze w pełni widoczny.

**Weryfikacja:**
- `npm run build`: 806 testów zielonych;
- w grze:
  - „Mrok” (`?seed=3&floor=2`):
    - pająk podchodzący do bohatera ma alfę 0 do 114 px;
    - przy 99 px alfa 0,35, od 83 px alfa 1;
    - dalecy wrogowie niewidoczni;
  - Grzybnia (`?seed=7&floor=3`):
    - wszyscy wrogowie poza światłem ukryci;
    - wróg przy latarni widoczny (1761 px od bohatera), a 90 px od latarni znów ukryty;
    - zrzut ekranu: pająk 150 px od bohatera niewidoczny w mgle, purchawka obok widoczna;
- w konsoli jeden wpis 500 z chwili, gdy HMR przeładował plik przed zapisaniem nowego modułu; po przeładowaniu strony brak błędów.

**Do oceny w testach właściciela:** `#mrok` `#grzybnia`
- czy wróg wyłania się z ciemności w dobrym momencie (próg 0,5);
- czy ukryci Kitery strzelający z ciemności to dobre wyzwanie, czy za dużo;
- czy boss też ma się chować.

---

## Krok 31 — Lekko losowa kolejność ataków bossów

**Ocena i prośba właściciela:** `#ocena` `#mrok` `#krol-pajakow`
- test „Mroku” (krok 30) „jest super”;
- boss „wydaje się fajny”, ale nie powinien zawsze używać umiejętności po kolei — kolejność ma być „drobinę losowa”.

**Reguła („worek”, moja, dla wszystkich trzech bossów):** `#decyzja`
- w każdej rundzie boss używa każdego ataku ze wzoru dokładnie raz, w losowej kolejności. Żaden atak nie znika na długo, a gracz nie zna kolejności;
- ten sam atak nigdy nie pada dwa razy z rzędu, także na styku rund;
- pierwszy atak walki zostaje stały — „podpis” bossa:
  - Strażnik: uderzenie;
  - Królowa: wylęg;
  - Król: grzybnia;
- losowanie z RNG bossa (deterministyczne dla seeda);
- smagnięcie Królowej i ścięcie Króla działają jak dotąd, poza wzorem;
- rytm (przerwy, wściekłość) bez zmian.

**Kod:**
- `core/bossTypes`: `PatternOrder` (`Fixed`, `Shuffled`), `BossDefinition.patternOrder` (brak = po kolei);
- `ai/attackPattern.ts`: `AttackPattern`, czyli kolejka ataków (po kolei albo „worek”);
- `BossBrain` bierze z niej kolejny atak zamiast liczyć indeks wzoru;
- `bossConfig`: `patternOrder: Shuffled` u Strażnika, Matki Pająków i Króla.

**Testy:**
- `attackPattern.test.ts` (7):
  - po kolei;
  - każda runda ma każdy atak;
  - pierwszy atak stały, bez powtórzeń z rzędu (50 seedów);
  - pojawia się wszystkie 6 możliwych kolejności rundy;
  - determinizm;
  - wzór pusty i jednoelementowy;
  - wszyscy bossowie mają losową kolejność;
- testy rytmu Strażnika, Królowej i Króla sprawdzają teraz pierwszy atak i komplet ataków w rundzie zamiast stałej kolejności.

**Weryfikacja:**
- `npm run build`: 814 testów zielonych;
- w grze (`?seed=7&floor=3`, Król, gracz 150 px od niego, 45 s), ataki ze wzoru po rundach:
  1. grzybnia, kokon, sztylety;
  2. kokon, grzybnia, sztylety;
  3. grzybnia, sztylety, kokon;
  4. sztylety, kokon, grzybnia;
  5. sztylety, grzybnia, kokon;
- między nimi ścięcia kosami (Król podchodzi do gracza);
- w konsoli dwa wpisy z chwili przeładowania HMR w trakcie zmian (moduł bez dopisanego jeszcze importu); po przeładowaniu walka działa.

**Do oceny w testach właściciela:** `#krol-pajakow` `#matka-pajakow`
- czy to wystarczająco losowe;
- alternatywa: w pełni losowy wybór bez powtórzeń z rzędu, ale wtedy atak może nie wystąpić przez kilka rund.

---

## Krok 32a — Cmentarzysko (piętro 4): paleta, kafle i mgiełka

**Decyzje właściciela:** `#decyzja` `#cmentarzysko`
- nowy biom to **cmentarzysko**: zatruci zaczęli tu umierać — jedni upadli i się rozkładają, inni zmieniają się w grzybowe zombie;
- „ludzki biom”, ale przemieniony w grzybowe zombie;
- grzybnia **dużo mniej intensywna** niż piętro niżej — grzyb ledwo tu dociera, grasują raczej zarażeni ludzie;
- boss jeszcze nieustalony („pomyślimy”); ten krok to ogólny klimat;
- z trzech kandydatek palety wybrana **C „trupia zieleń”**. Odrzucone:
  - A „zimny popiół” (moja rekomendacja);
  - B „ziemia grobowa”.

**Klimat (moje propozycje, przyjęte razem z paletą):**
- płyty nagrobne w posadzce: wyryty krzyż, zatarty napis, zgnilizna u stóp;
- zwłoki zatrutych w łachmanach (wyciągnięte albo zwinięte): szarozielona skóra, żebra, plama rozkładu, kilka strzępek i grzybków;
- rozrzucone kości z czaszkami i świeczki wotywne;
- na licach nisze grobowe z czaszkami, kostnica (rząd czaszek) i epitafia; świece w uchwytach zamiast pochodni;
- grzybnia tylko jako nikłe strzępki (w fugach 4% i jako rzadka nakładka) — bez pleśni i kępek Grzybni;
- **mgiełka:**
  - prawie czarny opar w trupiej zieleni (`#121812`), a nie fioletowa mgła;
  - pełny widok 72 px (Grzybnia 64), mrok do 92% (Grzybnia 88%), czyli szerszy widok przy bohaterze, ale ciemniej dalej;
  - rzadkie, płaskie smugi przy ziemi i opadający kurz grobowy;
- zgodnie z krokiem 30 wrogowie chowają się w mgiełce i wychodzą dopiero w świetle; piętro z mgiełką nie losuje „Mroku”;
- wrogowie do czasu własnych (zarażeni ludzie, krok 32b): zarażony pająk i grzybiec z Grzybni; boss: Strażnik.

**Generator (`tools/tower_ruins_tiles.py --biome graveyard`):**
- palety `cmentarz_popiol`, `cmentarz_ziemia`, `cmentarz_trupi` (biom bierze `cmentarz_trupi`). Jasność podłogi jak w Grzybni, mury ciemniejsze;
- nowe pola palety `flesh` (zgniła skóra) i `mycel` (resztki grzybni), puste w innych biomach;
- dodatki `grave`:
  - `grave_decal`: płyta 1×2, zwłoki 2×1 w dwóch pozach, kości, świeczki, nikła grzybnia;
  - `grave_face`: nisza, epitafium, czaszki;
  - `overgrow_grave`: strzępki w fugach, zacieki zgnilizny na licach;
- pierwsza wersja miała zwłoki pionowe (1×2) — z rzutu z góry wyglądały jak stojąca postać, którą łatwo pomylić z wrogiem. Wszystkie zwłoki leżą teraz w poprzek;
- makieta: obsada zastępcza (`MOCKUP_ACTORS_GRAVE`), nakładki i lica biomu (`MOCKUP_BIOME_DECALS`, `MOCKUP_BIOME_FACES`);
- wynik: `public/assets/tilesets/graveyard_tileset.{png,json}` (132 kafle); arkusze ruin, leża i Grzybni identyczne co do bajtu.

**Czytelność (makieta, palety A/B/C):**
- bohater i zarażony pająk czytelni na wszystkich;
- grzybiec słaby na B i C (ciało 1,13, Δbarwy 49° na C);
- grzybiec zostaje tylko do czasu wrogów biomu — ich czytelność na palecie C sprawdzimy w kroku 32b.

**Gra:**
- `BiomeId.Graveyard`, `BIOME_BY_FLOOR[4]`;
- `GRAVEYARD_TILESET_ASSET`, `GRAVEYARD_DRESSING` (nakładki 14%, kości, świeczki, nikła grzybnia, lica 30%, pajęczyny 30%), `GRAVEYARD_MIST`;
- `FloorDressing`: nowe `largeDecals` — duże nakładki biomu (płyty 1,2%, zwłoki 1% na kafel), kładzione tylko w całości na wolnej podłodze. Biomy bez nich nie zużywają losowań, więc ich dekorowanie się nie zmienia.

**Testy:**
- `biomes.test.ts`:
  - piętro 4 to Cmentarzysko;
  - dekoracje biomu, zwłoki zawsze 2×1;
  - grzyb ledwo dociera (bez pleśni i kępek, grzybnia < 15% wag);
  - mgiełka ciemniejsza niż mgła Grzybni, z szerszym widokiem, słabsza niż „Mrok”;
  - czytelność bohatera i zarażonego pająka;
- `FloorDressing.test.ts`: duże nakładki w całości na podłodze; pusta lista nie zmienia dekorowania.

**Weryfikacja:**
- `npm run build`: 824 testy zielone;
- w grze (`?seed=7&floor=4`):
  - biom `graveyard`, 11 świec, 13 wrogów, modyfikator „Kapliczka łaski”;
  - zrzuty: płyty nagrobne i świeczki w trupiej zieleni, mrok mgiełki za pokojem;
  - świece w uchwytach, kostnica i nisza na licu, kości;
- brak nowych błędów w konsoli.

**Do oceny w testach właściciela:** `#cmentarzysko`
- klimat: czy to już cmentarzysko i czy grzyba jest wystarczająco mało;
- gęstość zwłok, płyt i świeczek;
- mgiełka (kolor, zasięg widoku);
- czy zwłoki czytają się jako zwłoki.

---

## Krok 32b — Zarażeni i siewcy (Cmentarzysko)

**Decyzje właściciela:** `#decyzja` `#cmentarzysko` „działać według twojego planu” — najpierw zwykłe zombie, potem Wampirzy Lord (z tasakiem); po każdym kroku commit i push.

**Wrogowie (zasada małej liczby archetypów — logika AI bez zmian):**
- **zarażony** (`EnemyVariant.Zombie`, Rusher):
  - człowiek w rdzawych łachmanach, blada, zimna skóra, ręce wyciągnięte przed siebie;
  - na barku i ciemieniu grzybki, a ze strzępek świeci grzybnia;
  - zamach pazurami: ręce cofnięte, uniesione szeroko, cios do środka, skrzyżowane dłonie w chwili trafienia;
- **siewca** (`EnemyVariant.Sower`, Kiter):
  - zombie, któremu zamiast głowy wyrósł wielki fioletowy kapelusz z blaszkami, ręce zwisają;
  - przy pluciu kapelusz nabrzmiewa, a przed blaszkami rośnie obłok jadu;
  - pluje kulą zarodników grzybca.

**Liczby (moje, `combatConfig.ENEMY_VARIANTS`, do strojenia w teście):**
- zarażony:
  - 11 obrażeń (pająk Grzybni 10), zamach 420 ms (350), odnowienie 1,1 s;
  - trucizna jak u zarażonego pająka (2 co 0,5 s przez 1,5 s);
  - cięższy, ale czytelniejszy cios;
- siewca: atak identyczny jak grzybca (5 obrażeń, kula 170 px/s, trucizna jak Ognista pięść).

**Czytelność na palecie C:** barwy celowo daleko od oliwkowej podłogi: rdza i blada skóra, fiolet kapelusza.
Makieta generatora:
- zarażony: obrys 2,24, ciało 1,97, Δbarwy 131°;
- siewca: obrys 2,24, ciało 1,11, ale Δbarwy 151° — czytelny barwą;
- grzybiec z kroku 32a znika z biomu.

**Kod:**
- `tools/grave_enemies.py` (nowy):
  - `zombie_walk-claw.png`, `sower_walk-spit.png` (48×48, 8 kierunków, kolumny 0–3 chód, 4–7 atak);
  - walidator czysty;
- `spriteConfig`: arkusze `zombie`, `sower`, `ENEMY_VISUALS` (zarażony ma zamach `claw`), pocisk siewcy = `sporeBall`;
- `biomeConfig`: Cmentarzysko → zarażony + siewca;
- generator kafli: makieta i miary czytelności Cmentarzyska z nowymi wrogami.

**Testy:**
- `enemyVariants.test.ts`:
  - mapowanie biomu;
  - zarażony mocniejszy od pająka, z dłuższym zamachem i tą samą trucizną;
  - siewca = atak grzybca, własny wygląd;
  - 4 klatki zamachu;
- `biomes.test.ts`: czytelność bohatera, zarażonego i siewcy na podłodze i bruku Cmentarzyska.

**Weryfikacja:**
- `npm run build`: 833 testy zielone;
- w grze (`?seed=7&floor=4`), na piętrze 9 zarażonych i 4 siewców:
  - zarażony gra zamach `claw` i trafia z odrzutem;
  - siewca gra `spit`, a kula zatruwa;
  - zrzut ekranu: zarażony gryzie bohatera (−12, trucizna −2), zwłoki na posadzce;
- brak nowych błędów w konsoli.

**Do oceny w testach właściciela:** `#cmentarzysko`
- czy zarażony i siewca wyglądają jak ludzie zmieniający się w grzybowe zombie;
- siła i tempo zamachu zarażonego;
- czy siewca nie jest za bardzo podobny do grzybca.

---

## Krok 33 — Wampirzy Lord: spiżarnia, uczta i ciosy

**Decyzje właściciela:** `#decyzja` `#wampirzy-lord`
- broń: tasak; mechanika z mojej propozycji przyjęta;
- po pierwszym podglądzie wyglądu: „będziemy musieli zmodyfikować tego sprite'a, ale póki co pójść dalej” — dołożyć kokony i brakujące elementy, właściciel przetestuje.

**Wygląd (`tools/lord_sprites.py` → `vampire-lord_walk-cleave-bite.png`, 112×112, 8 kierunków) — do przeróbki:**
- wychudzony arystokrata w winnym płaszczu z wysokim kołnierzem, czarny surdut ze złotym obszyciem;
- zamiast głowy szczęka-paszcza z kłami, a na karku grzybnia ze świecącymi końcówkami;
- tasak w prawej ręce, szponiasta lewa dłoń;
- kolumny: 0–3 chód, 4–7 tasak (za bark, zamach, cięcie, wybrzmienie), 8–11 kąsanie (też uczta i zew);
- pierwsza wersja (sztywny prostokątny płaszcz w paski i mały tasak) poprawiona przed pokazaniem.

**Spiżarnia i uczta (moje liczby, `bossConfig.VAMPIRE_LORD.feast`, do strojenia w teście):**
- 4–6 kokonów z zarażonymi przy ścianach areny (`dungeon/LarderPlanner.ts`, własna sól RNG):
  - 1 kafel od muru, poza środkiem 7×7, z odstępem ≥ 3 kafle;
  - bez kolizji;
- pierwsza uczta po 7 s walki, potem co 11 s (po wściekłości „Głód!” co 6,5 s):
  - Lord idzie do najbliższego kokonu, zostawiając gracza w spokoju;
  - stoi przy nim 1 s i pożera go — to okno na kontrę;
- uczta daje +40 HP i stos wzmocnienia: +15% obrażeń stref i +10% chodu, najwyżej 4 stosy;
- stos przyznaje się tylko, jeśli kokon jeszcze był — gracz może go zniszczyć w trakcie;
- kokon trafiony przez gracza (cios, strzał, dash) pęka i wypuszcza **zarażonego** (zwykły Rusher biomu); nie liczy się do Wampirzego kła;
- po śmierci Lorda kokony pękają bez zarażonych.

**Ciosy (wzór losowy jak w kroku 31: tasak → szarża → zew; pierwszy zawsze tasak):**
- **kąsanie szczęką** (poza wzorem, mechanika smagnięcia):
  - z bliska (< 62 px), zamach 450 ms, 12 obrażeń, odstęp 1,3 s;
  - trafienie **leczy Lorda o 12** (nowe `AreaStrike.healOnHit`);
- **szarża z kłapnięciem** (mechanika królewskiego skoku): przysiad 600 ms, lot 400 ms, strefa 46 px, 15 obrażeń;
- **tasak** (`BossAttackKind.Cleave`): strefa 46 px przed Lordem, zamach 800 ms, 22 obrażenia, odrzut 340;
- **zew spiżarni** (`BossAttackKind.Call`): wybrane kokony drżą 700 ms, potem pęka 1 (po wściekłości 2) i wychodzą zarażeni;
- Lord: 460 HP (piętro 4: 667), promień 28, chód 60, sprint 135 z daleka (> 150 px);
- plansza: „Wampirzy Lord — Ucztujący w Kryptach”, wściekłość „Głód!”.

**Kod:**
- czysto:
  - `bossTypes`: `Cleave`, `Call`, `Feast`, `BossId.VampireLord`, `CleaveAttackDefinition`, `CallAttackDefinition`, `FeastDefinition`, `FeastBite`, `LarderRelease`, `LashAttackDefinition.healOnHit` (status smagnięcia opcjonalny);
  - `bossAttacks`: `planCleave`, `planCall`, `planFeast`; czas wiodący animacji obejmuje ucztę i zew;
  - `BossBrain`: pora uczty, marsz do najbliższego kokonu, stosy (`feasted`, `feastStacks`), mnożniki obrażeń i chodu;
  - `LarderPlanner` (dopisany do `PURE_FILES`);
- grafika: `tools/grave_enemies.py` → `larder-cocoon.png` (48×48): szary oplot grzybni z twarzą w szczelinie i wystającą dłonią; oddech, drżenie, rozdarcie, pusty oplot na podłodze;
- Phaser:
  - `entities/LarderCocoon.ts`;
  - `BossFight`: kokony jako cele gracza, uczta, zew, leczenie z kąsania, sprzątanie po śmierci;
  - `Boss`: `heal`, `feasted`, kokony w `tick`;
  - `GameScene.spawnRusher`.

**Testy (`VampireLord.test.ts`, 17):**
- piętro 4 → Lord; wzór; skalowanie tasaka;
- planer kokonów: pierścień przy ścianach, podłoga, odstęp, środek wolny, determinizm;
- uczta:
  - marsz do najbliższego kokonu; bez kokonów idzie do gracza;
  - plan uczty i czasy; odstęp, częściej po wściekłości;
  - limit stosów, wzmocnienie obrażeń i chodu;
- ciosy:
  - geometria tasaka; balans (uważny gracz ucieknie spod tasaka także po wściekłości);
  - leczenie z kąsania; zew 1/2 kokony;
  - szarża; uczta nie jest atakiem ze wzoru;
- testy Królowej i Króla: piętro 4 nie ma już Strażnika.

**Weryfikacja:**
- `npm run build`: 855 testów zielonych;
- w grze (`?seed=7&floor=4`, wrogowie usunięci, nieśmiertelny bohater stoi przy Lordzie, 25 s):
  - 5 kokonów, plansza z tytułem;
  - kolejno: tasak, kąsanie, szarża, kąsanie, zew (kokon pęka, wychodzi zarażony), uczta po 8,5 s (kokon znika, +40 HP, 1 stos) i dalej;
  - kąsania leczą Lorda;
  - zrzut: Lord z uniesionym tasakiem, obok wypuszczony zarażony;
- brak nowych błędów w konsoli.

**Uwagi z testu (do oceny w teście właściciela):** `#wampirzy-lord`
- zew co rundę szybko opróżnia spiżarnię (5 kokonów w ok. 20 s, a uczta zdążyła raz). Może zew powinien wypuszczać zarażonego bez niszczenia kokonu, albo być rzadszy;
- leczenie z kąsania (12) przy graczu, który stoi przy Lordzie — czy nie za dużo;
- tempo uczty (pierwsza po 7 s, co 11 s) i siła stosów;
- wygląd do przeróbki (decyzja właściciela).

---

## Publikacja dla testerów — GitHub Pages

**Decyzje właściciela:** `#decyzja`
- repozytorium publiczne, gra w przeglądarce na GitHub Pages dla testerów;
- e-mail właściciela nie może być publiczny.

**Zrobione:**
- historia przepisana:
  - wszystkie commity mają autora `wvytz` z adresem noreply GitHuba (`10197578+wvytz@…`);
  - kopia zapasowa starej historii: `tools/out/topdown-przed-zmiana-emaila.bundle` (lokalnie, poza gitem);
  - globalny `git config` na Kuźni też na noreply;
- `npm run deploy:pages` (`tools/deploy-pages.mjs`): build (typy + testy + Vite) i nadpisanie gałęzi `gh-pages` zawartością `dist/` (z `.nojekyll`). Bez GitHub Actions, bo token `gh` nie ma uprawnienia `workflow`;
- repozytorium publiczne, Pages włączone z `gh-pages`;
- gra: **https://wvytz.github.io/topdown/**.

**Weryfikacja:** strona zbudowana (`built`), wszystkie zasoby 200, gra startuje na piętrze 1 bez błędów w konsoli.

**Ograniczenie:** `?seed=N&floor=M` działa tylko w `npm run dev` — testerzy zaczynają od piętra 1.

## Wspólna lista wyników — Cloudflare Worker `#highscore`

**Decyzja właściciela:** `#decyzja` `#highscore`
- GitHub Pages tylko serwuje pliki, więc wspólna lista wyników stoi na osobnej usłudze: **Cloudflare Worker + baza D1** (wybór właściciela po porównaniu Supabase / Firebase / Cloudflare).
- **Imię gracza (decyzja właściciela): wpisywane po śmierci.** Przy pierwszej śmierci panel prosi o imię (max 12 znaków: litery, cyfry, spacja, `_`, `-`; Enter zapisuje, Esc pomija). Gra je zapamiętuje i kolejne wyniki idą już z nim.

**Zrobione:**
- `persistence/SharedHighscores.ts`: obudowuje dotychczasowy `HighscoreStorage` (interfejs bez zmian):
  - zapis lokalny od razu, panel śmierci pokazuje go natychmiast;
  - wspólna lista dochodzi asynchronicznie i podmienia podium i miejsce;
  - bez sieci wynik czeka w kolejce (`localStorage`, max 20) i leci przy następnej śmierci.
- `persistence/remoteScores.ts`: adapter workera (`GET/POST /scores`); adres z `VITE_SCORES_URL`. Bez adresu gra działa jak dawniej (lista lokalna).
- `worker/`: kod workera, schemat D1 i instrukcja wdrożenia (`worker/README.md`). Walidacja wpisu, zapis tylko ze strony gry i `localhost:5173`, limit 10 wpisów / 10 min z jednego IP (IP jako skrót).
- Panel śmierci: nagłówek „łączenie…” / „WSZYSCY GRACZE”; wiersze z imieniem („—” dla wpisów bez imienia).
- Imię: `sanitizePlayerName` / `isNameChar` w `systems/Highscores.ts` (czyste), zapamiętane w `persistence/PlayerName.ts`; worker sprawdza je tymi samymi zasadami.
- Liczby (limit czasu 5 s, kolejka 20) w `HIGHSCORE_CONFIG`.

**Testy:** `tests/persistence/sharedHighscores.test.ts` (miejsce na wspólnej liście, kolejka offline, limit kolejki, uszkodzone dane), `tests/persistence/remoteScores.test.ts` (adapter HTTP, imię null), `tests/persistence/playerName.test.ts`, czyszczenie imienia w `tests/systems/highscores.test.ts`. Worker sprawdzony skryptem z atrapą D1 (walidacja wpisu i imienia, 403 z obcej strony, 429 po limicie).

**Weryfikacja w przeglądarce:** `npm run dev` z `VITE_SCORES_URL` na lokalnym serwerze z kodem workera i atrapą D1. Śmierć → panel imienia (wpisane „Wi<c>io” daje „Wicio”) → Enter → wpis trafia do bazy, panel pokazuje „WSZYSCY GRACZE” i miejsce 2 za wpisem z bazy. Bez błędów w konsoli gry.

**Wdrożenie (zrobione):**
- Konto Cloudflare właściciela, subdomena workers.dev `wvytz`.
- Baza D1 `tower-crawler-scores` (id w `worker/wrangler.toml`), schemat nałożony `--remote`.
- Worker: https://tower-crawler-scores.wvytz.workers.dev (`GET/POST /scores`).
- `.env.production` z `VITE_SCORES_URL` jest w repozytorium (adres nie jest tajny); gra na GitHub Pages wdrożona z nim przez `npm run deploy:pages`.

**Ograniczenie:** wynik liczy przeglądarka, więc da się go sfałszować; worker odsiewa tylko oczywiste bzdury.

---

## Krok 34 — Ekran startowy w stylu automatów

**Prośba właściciela:** `#decyzja` `#ekran-startowy`
- krótki ekran startowy przed pierwszą planszą: tylko duży napis na środku, widoczny przez chwilę;
- klimat automatów (arcade), w tle ruiny wieży i potwory, ale tak, żeby nie odciągały uwagi; „mocne otwarcie”;
- projekt pokazany na kanwie Claude Design (paleta z systemu „Matka Pająków”), właściciel zaakceptował kierunek: „tak zrób, dopasuj do gry”.

**Co widać (960×540, ok. 2,8 s):**
- z czerni wychodzi tło: zrujnowana wieża z wyszczerbionym szczytem, łamane kolumny, pajęczyny w rogach, pająk na nitce, nietoperz, pajączki z pulsującymi workami-bombami na gruzie;
- tło tylko w tonach chityny 0–2 i obrysu; akcenty to pojedyncze piksele: czerwone oczy (Matka w bramie wieży, coś w oknach) i okno z pochodnią;
- 0,4 s: **CRAWLER** uderza ze skali 2,6, odbija się (0,94 → 1,04 → 1) — błysk, wstrząs kamery, ciepła poświata za logo;
- litery z własnego fontu 5×7 (piksel = 16 px ekranu), lico w pasach rampy ognia (egg-3 → egg-1), ognista warga egg-0, obrys i 4-stopniowe wytłoczenie w dół (chityna) — jak logotypy z automatów;
- 0,8 s: **TOWER** opada w 4 skokach (pikselowo) między ozdobnikami z rombem ognia;
- 1,2 s: zapalają się oczy (druga grupa 0,7 s później), potem mrugają;
- 1,5 s: wpisuje się „— PIĘTRO 1 · RUINY WIEŻY —” (nazwa biomu z `biomeConfig`);
- 2,4 s: wygaszenie do czerni i start piętra 1; do tego iskry, winieta i delikatne linie CRT.

**Decyzje:**
- ekran rysujemy wyłącznie prostokątami (`Graphics`) i dwiema teksturami z gradientem (poświata, winieta) — bez plików graficznych i bez fontu z sieci; logo to piksele, nie tekst;
- zasoby gry ładują się **pod** ekranem: `SplashScene` startuje pierwsza i uruchamia `BootScene`; jeśli ładowanie trwa dłużej, tytuł po prostu trzyma się na ekranie (wygaszenie nigdy przed gotowością gry);
- dowolny klawisz albo klik pomija resztę ekranu (od razu wygaszenie);
- czas liczony od czasu pętli, nie z sumy delt — Phaser wygładza i przycina deltę, więc na wolnym sprzęcie ekran trwałby dłużej;
- restart po śmierci nie pokazuje ekranu ponownie (restart idzie prosto do `GameScene`).

**Kod:**
- czysto:
  - `core/pixelArt.ts`: font 5×7 (`pixelText`, litery logo) i linia Bresenhama (`pixelLine`, pajęczyny);
  - `config/splashConfig.ts`: oś czasu, układ, paleta, rysunek tła (prostokąty w siatce 240×135, detale w 480×270);
  - `systems/splashTimeline.ts`: `splashFrame` (stan ekranu w chwili t) i `splashFadeStart` (kiedy przejść do gry);
- Phaser:
  - `scenes/SplashScene.ts` — tylko rysuje klatkę;
  - `BootScene`: gdy ekran startowy trwa, zostawia dane startu w rejestrze (`BOOT_START_DATA_KEY`) i się zatrzymuje;
  - `SceneKey.Splash`, `main.ts` (SplashScene pierwsza);
- dev: `?nosplash` w adresie pomija ekran.

**Testy:**
- `tests/core/pixelArt.test.ts` (7): kształt znaków, szerokość napisu, odstępy, nieznany znak, ciągłość linii;
- `tests/systems/splashTimeline.test.ts` (12): wejście z czerni, uderzenie i odbicie, błysk, skokowe opadanie TOWER, oczy i mruganie, wpisywanie podtytułu, kolejność przed wygaszeniem, koniec ekranu; czekanie na załadowanie, pominięcie.

**Weryfikacja:**
- `npm run build`: typy, 877 testów, build;
- przeglądarka (Chromium, zrzuty klatek): logo, tło i podtytuł na miejscu, po ok. 2,8 s aktywne `GameScene` i `HudScene`, brak błędów w konsoli.

---

## Krok 35 — Ekran śmierci: rozkładający się napis i krew

**Prośba właściciela:** `#decyzja` `#highscore` `#ekran-smierci`
- ekran po śmierci dopasowany do ekranu startowego (krok 34);
- gra pod spodem przyciemniona, ale dalej widać animacje przeciwników;
- napis POLEGŁEŚ zostaje, ale z efektem rozkładu i drobinkami krwi;
- na środku dalej wynik i tablica rekordów;
- po zrzucie: „wszystko OK, deployuj i lecimy dalej”.

**Co widać:**
- gra nie staje — przyciemnienie narasta do 62% w 0,6 s, krawędzie w winiecie zakrzepłej krwi; wrogowie dalej się ruszają pod spodem;
- 0,25 s: **POLEGŁEŚ** uderza (skala 2,2 → 1 z odbiciem), czerwony błysk, wstrząs, chmura kropel krwi;
- napis z fontu pikselowego jak CRAWLER (nowe litery P, G, S, Ł i Ś z akcentem), lico w pasach rampy oczu (od eye-2 do ciemnej krwi), obrys i wytłoczenie;
- **rozkład** od 1,2 s przez 7 s:
  - piksele liter rozbite na bloki 2×2; blok najpierw ciemnieje („gnije”, 0,6 s), potem odpada i spada;
  - najpierw kruszą się krawędzie, wnętrze później i rzadziej;
  - odpada najwyżej 30% bloków, więc napis zostaje czytelny; w dziurach prześwituje ciemne wnętrze litery;
- **krew:** 7 źródeł na dolnych krawędziach liter — kropla nabrzmiewa i spada co 1,4–2,8 s;
- wynik, ozdobnik, „NAJLEPSZE WSPINACZKI” i wiersze tablicy wchodzą po kolei jak na automacie; „R — NOWA WSPINACZKA” miga;
- przyciemnienie przykrywa też resztę HUD, więc nic nie nachodzi na tablicę.

**Kod:**
- czysto:
  - `core/pixelArt.ts`: nowe litery, akcenty nad literą (`PIXEL_ACCENTED`, pole `top` napisu);
  - `config/deathScreenConfig.ts`: oś czasu, rozkład, fizyka kropel, układ, paleta krwi;
  - `systems/deathScreen.ts`: `deathFrame`, `splitIntoBlocks`, `planCrumble` (własna sól RNG), `planDrips`, `dripsReleased`, `stepParticle`;
- Phaser: `effects/DeathScreen.ts` zastępuje panel śmierci w `HudScene`; restart (R) chowa ekran i czyści krople.

**Testy (`tests/systems/deathScreen.test.ts`, 11):** litery i akcent Ś; przyciemnienie nigdy nie zasłania gry; uderzenie i błysk; kolejność wyniku, wierszy i komunikatu; rozkład deterministyczny, limit 30%, okno czasu, wnętrze później; krople z dolnych krawędzi (nie z akcentu), rytm kropel; grawitacja.

**Weryfikacja:**
- `npm run build`: typy, 890 testów, build;
- przeglądarka (`?nosplash&seed=7&floor=2`, śmierć wymuszona przez `window.__game`): zrzuty po 0,35–8 s — gra widoczna pod spodem, napis kruszy się i krwawi, tablica czytelna; R startuje nowy run; brak błędów w konsoli;
- wdrożone na GitHub Pages razem z krokiem 34.

---

## Kroki 34–35 + wspólna lista wyników — scalenie `#highscore` `#ekran-smierci`

**Problem (zgłoszenie właściciela):** na GitHub Pages nie było ekranu startowego, a ekran śmierci był stary. Kroki 34–35 leżały na osobnej gałęzi (`claude/beautiful-knuth-7datv1`) i nie trafiły do `main`; wdrożenie wspólnej listy wyników z `main` nadpisało `gh-pages` wersją bez nich.

**Co zrobiono:**
- `main` scalony z gałęzią kroków 34–35; jedyny konflikt w `HudScene` — zostaje nowy `DeathScreen`, stary panel śmierci usunięty;
- `effects/DeathScreen.ts` obsługuje wspólną listę:
  - przy pierwszej śmierci bez zapamiętanego imienia: „TWOJE IMIĘ NA TABLICY WYNIKÓW”, pole z kursorem, „ENTER — ZAPISZ · ESC — BEZ IMIENIA”; bez miejsca w wyniku i bez „R — NOWA WSPINACZKA”;
  - wiersze tablicy z imieniem; nagłówek zależny od źródła (lokalna / łączenie… / wszyscy gracze);
  - nowy obiekt tej samej śmierci (litera imienia, przyjście wspólnej tablicy) odświeża tylko tekst — animacja rozkładu nie startuje od nowa.

**Uwaga:** na gałęzi `claude/vibrant-thompson-o7nlmz` był inny „Krok 34” (Grzybowy Pożeracz) — po scaleniu to krok 39.

**Weryfikacja:** `npm run build` (903 testy); przeglądarka: ekran startowy, śmierć wymuszona przez `window.__game`, wpisanie imienia i tablica z imieniem.

---

## Krok 36 — Czarodziejka: sprite'y drugiej bohaterki `#czarodziejka`

**Decyzja właściciela:** `#decyzja` `#czarodziejka`
- Plan palety i klatek przedstawiony na płótnie (Design) i zaakceptowany przed implementacją.
- Suknia **szafirowa** (szkarłat odpadł: na piaskowcu ma ok. 1,36 : 1 i za małą różnicę barwy, więc nie spełnia §6a).
- **Kule energii wypuszcza atak** (kolumna 7 rzutu zaklęcia), a nie tylko krążą wokół postaci.

**Zrobione:**
- Generator `tools/sorceress_sprites.py` (Pillow, `rotate45` i `outline` z istniejących narzędzi). Postać z brył na N, 8 kierunków z obrotu, obrys `#1b1a22` po obrocie, cieniowanie płaskie bez ditheringu.
- `sorceress_walk-cast.png` (384×384, komórka 48×48, pivot 24,24):
  - 0–3 chód: suknia prawie nieruchoma (przód rąbka ±1 px), włosy falują mocno (koniec ±3 px, w klatce 2 wydłużone i rozdzielone na 2 pasma);
  - 4–7 rzut zaklęcia: zamach (kostur −1 px, kryształ ciemnieje), pchnięcie (+2 px), rozbłysk (najjaśniejszy ton i 5 iskier bez obrysu), powrót; kula wylatuje w kolumnie 7, 17 px przed pivotem.
- `sorceress_orb.png` (64×16, komórka 16×16, `rotate: false`): kula 10 px w rampie kryształu, blask okrąża obwód co 90°.
- Paleta: włosy `#282a3c` `#353b55` `#48516f` `#63708f`; suknia `#1c1f5a` `#23378f` `#2d56b9` `#3d7bd3` `#7fb4ec`; skóra `#b9805e` `#e8b892`; kostur `#4a3020` `#5a3a22` `#5b3e27`; kryształ i kule `#1d7f9c` `#39c0d8` `#8ae6ef` `#e4fbfb`.
- Wyjątek od marginesu jak u barbarzyńcy (§11): ciało mieści się w promieniu 21,5 px, iskry w 22,5 px. Pilnuje tego walidator generatora.
- Wpisy `sorceress` (walk, idle, cast) i `sorceressOrb` (fly) w `SPRITE_SHEETS`. **Bez logiki bohaterki i bez wyboru postaci.**

**Testy:** `tests/assets/sorceress.test.ts` (tylko kolory palety, piksele pełne, brak `#000`, `#fff`, `#9cff57`, `#d4a83a`; czytelność postaci w 8 kierunkach i kuli na płytach według §6a). Wymiary arkuszy sprawdza `tests/systems/sprites.test.ts`.

**Weryfikacja:** `npm run build` (875 testów), podgląd 4× z `--preview tools/out`. Bez sprawdzenia w grze, bo bohaterka nie ma jeszcze logiki.

**Do oceny właściciela:** podgląd arkusza (czytelność głowy i włosów przy 1×, siła fali włosów, wielkość kryształu).

**Poprawka po ocenie właściciela:** `#ocena` `#czarodziejka`
- Kostur zasłaniał głowę: przesunięty w prawo (oś 4,5 px od pivota, `STAFF_X`), razem z dłońmi, kryształem i iskrami.
- Głowa powiększona (promień 6 px zamiast 5,1, `HEAD_R`), grzywa u nasady szersza; nadal mieści się w promieniu 21,5 px.

---

## Krok 37 — Czarodziejka: mechanika (kule i promień) `#czarodziejka`

**Decyzja właściciela:** `#decyzja` `#czarodziejka`
- **LPM — kule energii:** 3 kule krążą wokół Czarodziejki; atak wypuszcza jedną w stronę celownika (przytrzymanie = seria), pusta orbita odnawia się po ok. 1,5 s.
- **PPM — ciągły promień:** świeci, póki przycisk jest wciśnięty, i spowalnia Czarodziejkę; puszczenie blokuje go na ok. 1,5 s.
- **Profil:** mniej HP i wolniejszy chód niż barbarzyńca.

**Zrobione (warstwa czysta):**
- `core/heroTypes.ts`: `HeroId` (barbarzyńca, Czarodziejka), konfiguracja kul i promienia, definicja bohatera.
- `config/heroConfig.ts`: `HERO_DEFINITIONS` (Czarodziejka: 75 HP, chód 175; kule: 14 obrażeń, 3 kule, odnowienie 1500 ms, rzut 320 ms z wylotem po 240 ms; promień: 150 px, 5 obrażeń co 200 ms, ruch ×0,5, najdłużej 2,5 s, blokada 1500 ms) i `heroFromParam`.
- `systems/Sorcery.ts`: przedmioty u Czarodziejki, orbita kul, `BeamChannel` (świecenie, ticki obrażeń, limit, blokada, przerwanie), zasięg promienia do ściany, trafienia na odcinku, punkt kryształu.
- Bohater jest w `RunSnapshot`: przechodzi między piętrami, a „R” po śmierci zaczyna nowy run tym samym bohaterem.
- `computeHeroLoadout`; modyfikator piętra wydłuża też odnawianie kul i blokadę promienia.

**Zrobione (Phaser):**
- `Player`: wygląd bohatera z `HERO_VISUALS`. U Czarodziejki LPM rzuca kulę (animacja rzutu, kula wylatuje z kryształu w klatce 7), PPM świeci promieniem (animacja `channel`, klatki 5–6). Dash i paraliż przerywają promień, w trakcie promienia nie rzuca kul. Gotowe kule krążą wokół postaci.
- `GameScene`: kule lecą przez `PlayerShotManager` (sprite `sorceress_orb`), promień rysuje grafika w kolorach kryształu i rani przez `resolvePlayerBeam` we wszystkich menedżerach celów (wrogowie, boss, kokony, purchawki); promień kończy się na ścianie i kracie.
- HUD: segmenty pod paskiem dasha to kule; pod nimi pasek promienia (świeci: pozostały czas, blokada: odnowienie). Podpowiedź sterowania zależy od bohatera.
- **Przedmioty u Czarodziejki** (bez nowych przedmiotów): kule są jej bronią główną, więc biorą Ostrze (+obrażenia), Rękawice (szybszy rzut), Kołczan (+1 kula, ten sam limit 6), Szuriken (przebicie), Elektryczną strzałę, Lodowy odłamek, Ognistą pięść (statusy) i Wampirzy kieł (leczenie za trafienie kulą). Promień to umiejętność bazowa, bez efektów przedmiotów.
- **Wybór bohatera na razie z adresu:** `?hero=sorceress` (działa też na GitHub Pages). Ekran wyboru to kolejny krok.

**Testy:** `tests/systems/sorcery.test.ts` (profil bohaterów, bohater w `RunSnapshot`, przedmioty, limit kul, modyfikator piętra, orbita, promień: ticki, puszczenie, limit, przerwanie, ściana, trafienia, punkt kryształu, parametr adresu). `npm run build`: 896 testów.

**Weryfikacja w przeglądarce** (Playwright na `npm run dev`, `?hero=sorceress&seed=7`): 75/75 HP, chód 175, 3 kule na orbicie; seria LPM zużywa kule, które wracają po jednej; kula zabiera wrogowi 14 HP; promień w 0,45 s zadaje 3 × 5 obrażeń, zatrzymuje się na ścianie, a po puszczeniu ponowne wciśnięcie w trakcie blokady nic nie robi. Barbarzyńca bez zmian (cios, 3 strzały). Bez błędów w konsoli.

**Do oceny właściciela:** tempo i siła kul i promienia (wszystkie liczby w `config/heroConfig.ts`), limit promienia 2,5 s (mój dodatek — bez niego promień świeciłby bez końca), czy promień ma brać jakieś efekty przedmiotów.

---

## Krok 38 — Ekran wyboru bohatera `#czarodziejka`

**Prośba właściciela:** `#decyzja` `#czarodziejka` — ekran wyboru postaci, obie postacie grywalne i wdrożone do gry dla testerów.

**Scalenie z `main`:** równolegle powstały kroki 34 (ekran startowy) i 35 (ekran śmierci). Gałąź Czarodziejki scalona z `main`; jej kroki przenumerowane na 36–37. Konflikty: `BootScene` (start przez ekran startowy + bohater), `HudScene` (nowy ekran śmierci + pasek promienia i podpowiedź sterowania), DEVLOG.

**Zrobione:**
- `scenes/HeroSelectScene.ts`: dwie karty (postać w skali 3× idzie przodem do gracza, imię, hasło, życie i chód, opis LPM i PPM). Wybór: strzałki, A/D, najechanie myszą; start: Enter, Spacja, kliknięcie albo klawisz 1/2. Paleta ekranu startowego (`config/heroSelectConfig.ts`).
- Kolejność: ekran startowy → wybór bohatera → piętro 1. Parametr `?hero=sorceress` (albo `barbarian`) pomija wybór.
- Ostatni wybór zapamiętany w przeglądarce (`persistence/LastHero.ts`) i zaznaczony przy kolejnym wejściu.
- Ekran śmierci: „R — nowa wspinaczka” (ten sam bohater) i nowe „C — zmiana bohatera” (wybór z zaznaczonym bohaterem zakończonego runu; HUD znika i wraca z grą).
- Opisy kart w `HERO_DEFINITIONS` (`tagline`, `attacks`), kolejność kart w `HERO_ORDER`.

**Testy:** `tests/systems/heroSelect.test.ts` (wszyscy bohaterowie na kartach, opisy, zawijanie strzałek, zaznaczenie na starcie, linia statystyk, rozpoznawanie identyfikatora), `tests/persistence/lastHero.test.ts`. `npm run build`: 941 testów.

**Weryfikacja w przeglądarce** (Playwright, `?nosplash&seed=7`): start na ekranie wyboru; → i Enter zaczynają run Czarodziejką; śmierć, Esc w polu imienia, C — ekran wyboru; 1 zaczyna run barbarzyńcą. Bez błędów w konsoli.

---

## Krok 39 — Grzybowy Pożeracz: wygląd bossa Cmentarzyska z paczki właściciela

**Decyzja właściciela:** `#decyzja` `#grzybowy-pozeracz` `#cmentarzysko` właściciel przysłał paczkę `grzybowy-pozeracz.zip` (generator, arkusze, podglądy): „tak ma wyglądać, dopasuj go do naszego uniwersum”. Zastępuje wygląd Wampirzego Lorda (krok 33: „sprite do przeróbki”).

**Z paczki (bez zmian w kształtach):**
- ciało dawnego władcy wieży przerośnięte grzybnią: zgarbiony grzbiet pokryty kapeluszami, wyciągnięte ręce we krwi;
- głowa pęka na dwie połowy w paszczę z zębami;
- kokony z ludźmi pod ścianami, tron z grzybni, naklejki krwi i grzybni, efekty krwi i soku.

**Dopasowanie do uniwersum (moje):**
- **kapelusze** z rampy kapelusza siewcy (krok 32b) — ten sam grzyb, który siewcy wyrósł zamiast głowy;
- **sok** (co świeci, tym boss się leczy) w turkusie bioluminescencji Grzybni — tym samym, którym świeci grzybnia zarażonych. Paczka miała magentę (blisko zarezerwowanego fioletu Sludge Kinga, sama to zgłaszała);
- **kość** i mrok z palety Cmentarzyska, rdza kraty z rampy kałuży Sludge Kinga; krew i gnijące ciało jak w paczce;
- **w kokonach śpią zarażeni** z kroku 32b (blada, zimna skóra), bo z rozdartego kokonu wychodzi zarażony;
- nowe klatki pod mechanikę z kroku 33, której paczka nie miała:
  - **zamach łapami** zamiast tasaka (cios `Cleave`): łapy za barki, w górze i szeroko, opadanie, pięści złączone przed sobą w chwili uderzenia;
  - **kokon:** drżenie (zew) i rozdarcie od środka — zarażony wstaje z oplotu, pusty oplot zostaje;
- nazwa z paczki: **„Grzybowy Pożeracz — Ucztujący w Kryptach”**, wściekłość „Głód!”. Mechanika i liczby z kroku 33 bez zmian.

**Generator `tools/devourer_sprites.py`** (port generatora z paczki; Pillow + numpy, `numpy` dopisane do `tools/requirements.txt`):
- `fungal-devourer.png` (96×96, 8 kierunków): 0–3 szuranie, 4–7 pożarcie, 8–11 karmienie kokonem, 12–15 zamach łapami;
- `devourer-cocoon.png` (48×48, wiersze = 3 warianty: twarz, dłoń, skulone ciało): 0–3 oddech, 4–7 zjedzenie, 8–9 drżenie, 10–13 rozdarcie;
- `fungal-throne.png`, `fungal-fx.png` (krew, sok), `throne-decals.png` (kałuża krwi, rozbryzg, ślad wleczenia, grzybnia, kałuża soku, krata);
- walidator z paczki: paleta, brak półprzezroczystości, margines komórki;
- czytelność na podłodze Cmentarzyska: obrys 2,28 : 1, ciało 1,59 : 1, kapelusze czytelne barwą (fiolet vs oliwka);
- usunięte: `tools/lord_sprites.py`, arkusz Lorda i stary kokon spiżarni (`grave_enemies.py` generuje już tylko zarażonego i siewcę — arkusze identyczne co do bajtu).

**Gra:**
- `BossId.FungalDevourer`, `FUNGAL_DEVOURER` (dawniej `VampireLord`); testy `tests/ai/FungalDevourer.test.ts`;
- `spriteConfig`: arkusze Pożeracza; animacje: kąsanie `bite` (kłapnięcie w chwili trafienia), uczta `feed` (przełknięcie w chwili leczenia), zew `roar` (rozdarta głowa), tasak → `smash`. Arkusze mogą mieć 2–3 wiersze wariantów (`directions: 1 | 2 | 3 | 8`);
- **sala tronowa** (`dungeon/ThronePlanner.ts`, czysty, dopisany do `PURE_FILES`, własna sól RNG):
  - tron 3×3 kafle oparciem do północnej ściany areny, najbliżej osi, z dala od wejść z północy (inaczej przesuwa się w bok; brak miejsca = sala bez tronu); dekoracja bez kolizji;
  - 7–10 naklejek podłogi z wag (`THRONE_ROOM` w `dressingConfig`), z odstępem, poza środkiem (schody) i tronem;
  - kokony spiżarni nie stoją w promieniu 2 kafli od tronu;
- kokony: wariant z kolejności (twarz, dłoń, skulone ciało); po uczcie zostaje ogryziona łupina z żebrami i krwią, po zewie i trafieniu — pusty oplot;
- efekty: krew na bohaterze po trafieniu Pożeracza, turkusowy sok nad bossem przy leczeniu (uczta i kąsanie).

**Testy:**
- `ThronePlanner.test.ts` (7): tron na podłodze przy północnej ścianie, z dala od wejść, przesunięcie przez wejście na osi, brak miejsca; kokony z dala od tronu; naklejki (podłoga, odstęp, środek, tron, wagi, determinizm, zgodność z arkuszem);
- `sprites.test.ts`: wymiary nowych arkuszy i animacje bossa.

**Weryfikacja:**
- `npm run build`: 869 testów zielonych;
- w grze (`?seed=7&floor=4`, bohater w arenie, 15 s):
  - plansza „Grzybowy Pożeracz — Ucztujący w Kryptach”, 5 kokonów, tron, kraty i kałuże;
  - kąsanie z krwią na bohaterze i leczeniem (+12), zamach łapami, uczta (zostaje ogryziona łupina);
- brak nowych błędów w konsoli.

**Do oceny w testach właściciela:** `#grzybowy-pozeracz`
- czy dopasowanie kolorów (fiolet siewcy, turkusowy sok zamiast magenty) zostaje, czy wracamy do barw z paczki;
- zamach łapami zamiast tasaka;
- nazwa: „Grzybowy Pożeracz” (z paczki) zamiast „Wampirzy Lord”;
- gęstość naklejek i tron (przy wejściu z północy przesuwa się w bok);
- uwagi z kroku 33 (zew szybko opróżnia spiżarnię, leczenie z kąsania) nadal aktualne.

**Scalenie z `main`** (po kroku 38): krok powstał na osobnej gałęzi jako „Krok 34” i kolidował numerem z ekranem startowym; przenumerowany na 39. Jedyny konflikt: legenda znaczników w DEVLOG.

---

## Krok 40 — Animacje śmierci Króla Pająków i Strażnika `#krol-pajakow` `#grzybnia`

**Prośba właściciela:** `#decyzja` animacje śmierci Króla Pająków i Strażnika (backlog p. 3) — do tej pory ginęli od razu (błysk i plama).

**Animacje (moje decyzje, jak u Matki Pająków w kroku 24):** osobne arkusze, 8 kierunków (zostaje kierunek z chwili śmierci), 8 klatek w 8 kl./s = 1 s, bez pętli; nagroda (łupy, karty, schody, kraty) po końcu animacji — mechanizm z kroku 24 bez zmian.
- **Król Pająków** (`spider-king_death.png`, 128×128): 0 wzdrygnięcie (kosy i sztylety w górę, bulwy rozbłyskują); 1–3 grube łapy i sztylety się podkulają, kosy opadają na ciało, bulwy gasną do tonów mchu, oczy gasną, wycieka sok; 4 pęknięte bulwy — chmura zarodników (pełne piksele bez obrysu, §6c); 5–7 rozpad blokami 3×3 w kałużę soku. Sok grzybni ma własną rampę `SAP` (ciemna, mszysta zieleń). Potem plama `splat`.
- **Strażnik** (`sludge-king_death.png`, 96×96): 0 ryk agonii (otwarta paszcza i uniesione ręce z klatki plucia); 1–3 ciało osiada i rozlewa się, oczy gasną; 4–6 resztka tonie w kałuży szlamu z bąblami; 7 sama kałuża. Kałuża ma nieregularny brzeg, a fiolet przechodzi w brąz ditheringiem Bayera 4×4 (szlam to materiał amorficzny, §5). Potem plama `slime`.

**Generatory:**
- `tools/king_sprites.py`: rysowanie Króla wydzielone do `king_pose(...)` (podkulenie, opadanie kos, zgasłe bulwy i oczy, kałuża soku); arkusz chodu i ataku wychodzi piksel w piksel taki sam jak z poprzedniej wersji generatora. Zapisany w repo arkusz chodu różni się od wyniku generatora o 15 pikseli (stara różnica między systemami) — nie nadpisywałem go.
- `tools/sludge_death.py` (nowy): Strażnik nie ma generatora (sprite z paczki), więc klatki powstają z wiersza N arkusza z paczki — ciało i kałuża błota rozdzielone po rampie kałuży (§4.5), ciało skalowane w dół i osiadające, kałuża szlamu rośnie; 8 kierunków z obrotu, obrys po obrocie.

**Gra:** `BOSS_VISUALS` — Król i Strażnik dostali `death` (arkusze `spiderKingDeath`, `sludgeKingDeath`).

**Testy:** `sprites.test.ts` — animację śmierci mają Matka Pająków, Król Pająków i Strażnik; każda kierunkowa, jednorazowa, 0,6–1,5 s; wymiary nowych arkuszy. `npm run build`: 959 testów.

**Weryfikacja w przeglądarce** (`?seed=7&floor=1` i `floor=3`, `debugDefeat`): animacja gra w kierunku z chwili śmierci, w trakcie bez kart; po niej plama, karty nagrody (`RewardScene`). Bez błędów w konsoli.

**Do oceny w testach właściciela:** czy zarodniki Króla są wystarczająco widoczne na podłodze Grzybni i czy kałuża Strażnika nie jest za duża.

---

## Krok 41a — Piekło (piętro 5): paleta, kafle i żar `#pieklo`

**Decyzje właściciela:** `#decyzja` `#pieklo`
- kolejny biom: krwisty, demoniczny, „z czerwonym przejściem” i pomarańczowymi wstawkami; paleniska na środku, które ranią z bliska (krok 41b);
- z trzech kandydatek palety wybrana **A „krwawy bazalt”** (moja rekomendacja). Odrzucone: B „zaschnięta krew”, C „rozżarzony popiół”;
- paleniska buchają w niezbyt szybkim tempie, a na kolejnym, „gorętszym” poziomie częściej;
- boss ma być zupełnie inny od dotychczasowych i utrudniać grę postaci dystansowej (Czarodziejce) — propozycja „Kat Otchłani” czeka na akceptację.

**Generator (`tools/tower_ruins_tiles.py --biome infernal`):**
- palety `pieklo_bazalt`, `pieklo_krew`, `pieklo_popiol`; biom bierze `pieklo_bazalt`. Posadzka jasności Cmentarzyska (pierwsza wersja była za ciemna — obrys 1,88 : 1 < 2,0), mury i głębia ciemniejsze;
- nowe pole palety `ember` (żar: czerwień, pomarańcz, rozgrzany środek), puste w innych biomach; „popiół” palety to iskry (pomarańcz i czerwień), więc pyłki w powietrzu i drobiny na posadzce żarzą się; czerwieńszy ogień pochodni;
- dodatki `infernal`: szczeliny z żarem (bez ciemnego obrysu — świecą, §6b), plamy krwi, pieczęć 2×2 (krąg i pentagram z krwi, żar w wierzchołkach), kości z Cmentarzyska; na licach okowy na łańcuchach, czaszka na kolcu i szczelina z żarem; żar w fugach (2,5%) i sadza na licach;
- makieta z obojgiem bohaterów (`MOCKUP_ACTORS_INFERNAL`), czytelność na palecie A: obrys 2,19, wszyscy OK;
- wynik `public/assets/tilesets/infernal_tileset.{png,json}` (130 kafli); arkusz Cmentarzyska identyczny co do piksela.

**Gra:**
- `BiomeId.Infernal`, `BIOME_BY_FLOOR[5]`; `INFERNAL_TILESET_ASSET`, `INFERNAL_DRESSING` (nakładki 15%: żar, krew, kości; pieczęć 0,6% na kafel; lica 30%; bez pajęczyn — za gorąco);
- `INFERNAL_HAZE`: czerwonawa, prawie czarna duchota (`#1c0a0a`), mrok do 93% (Cmentarzysko 92%), widok przy bohaterze jak na Cmentarzysku; iskry szybciej i w górę;
- wrogowie zastępczy do czasu własnych: zarażony (Rusher) i mag demonów (Kiter); boss zastępczy: Strażnik.

**Testy:** `biomes.test.ts` — piętro 5 to Piekło; dekoracje biomu, pieczęć 2×2; bez pajęczyn; mrok ciemniejszy niż Cmentarzysko i słabszy niż „Mrok”, iskry w górę; czytelność barbarzyńcy, Czarodziejki, zarażonego i maga na podłodze i bruku. `npm run build`: 968 testów.

**Weryfikacja w przeglądarce** (`?hero=sorceress&seed=7&floor=5`): biom `infernal`, 13 wrogów, czerwonawy mrok, żar i krew na posadzce; bez błędów w konsoli.

**Do oceny w testach właściciela:** gęstość żaru i krwi, kolor mroku, widoczność iskier.

---

## Krok 41b — Paleniska Piekła `#pieklo`

**Decyzje właściciela:** `#decyzja` `#pieklo` paleniska na środku pokojów ranią z bliska i buchają „w niezbyt szybkim tempie”; na kolejnym, gorętszym poziomie buchają częściej.

**Zasady (czysto: `systems/Braziers.ts`, planer `dungeon/BrazierPlanner.ts`, liczby w `biomeConfig` → `braziers`):**
- **rozmieszczenie:** na środku zwykłych pokojów (nie startowego, nie areny) z szansą 80%; w pokoju o dłuższym boku ≥ 9 kafli dwa — na 1/3 i 2/3 długości; pomija pokój kapliczki (jej miejsce liczone tym samym ziarnem co `ShrineSite`) i pokoje węższe niż 5 kafli (trzeba móc obejść strefę);
- **cykl:** tlenie 4,2 s → ostrzeżenie 1 s (czerwona strefa wypełnia się jak telegrafy ataków) → buchnięcie 0,7 s; każde palenisko ma własne przesunięcie cyklu (RNG piętra), więc nie buchają razem;
- **obrażenia:** buchnięcie 12 w promieniu 46 px (najwyżej raz na buchnięcie — trwa dłużej niż nietykalność po trafieniu); sama rozżarzona misa parzy stale (4 w promieniu 14 px). Przez `takeHit`, więc dash i nietykalność chronią jak przed atakiem. Wrogów nie parzy — to ich biom;
- **„gorętsze” piętra:** przerwa ×0,7 na każde piętro powyżej 5 (najmniej 1,8 s); ostrzeżenie zostaje 1 s, żeby dało się uciec. Dziś Piekło to tylko piętro 5 — liczby czekają na decyzję, czy biom ma dwa piętra.

**Wygląd:**
- generator `tools/brazier_sprites.py` → `brazier.png` (48×48, 12 klatek): żelazna misa z obrysem i węglami; tlenie, rosnący płomień w ostrzeżeniu, słup ognia w buchnięciu; płomień bez obrysu (§6b), rampa ognia palety „krwawy bazalt”;
- w buchnięciu silnik rysuje strefę: dwa koła ognia (mieszanie ADD, stała alfa 0,3, migotanie skokowe);
- paleniska świecą jak pochodnie (rozjaśniają mrok i odsłaniają wrogów): 40 px przy tleniu, 64 w ostrzeżeniu, 96 przy buchnięciu. Stałe promienie — płynny rozrost tworzyłby nową teksturę światła co klatkę.

**Testy:** `tests/systems/braziers.test.ts` — tylko w Piekle; rozmieszczenie (podłoga zwykłych pokojów, 1–2 na pokój, środek), pokój kapliczki i wąskie pokoje bez palenisk, determinizm; kolejność faz, przesunięcie, jedno trafienie na buchnięcie, tempo na piętrze 5 i szybsze wyżej przy stałym ostrzeżeniu; strefy obrażeń. `BrazierPlanner` w `PURE_FILES`. `npm run build`: 980 testów.

**Weryfikacja w przeglądarce** (`?seed=7&floor=5`): 7 palenisk; Czarodziejka 30 px od paleniska traci 12 HP raz na buchnięcie, 62 px dalej — nic; zrzuty ostrzeżenia (czerwona strefa) i buchnięcia (koła ognia, światło); bez błędów w konsoli.

**Do oceny w testach właściciela:** tempo (4,2 s przerwy), promień i siła buchnięcia, wygląd ognia w strefie.

---

## Krok 41c — Piekło na dwóch piętrach `#pieklo`

**Decyzje właściciela (po kroku 41b):** `#decyzja` `#pieklo` `#kat-otchlani`
- propozycja bossa **Kat Otchłani** zaakceptowana (tarcza odbijająca pociski od frontu, hak przyciągający z dystansu, wirowanie łańcuchem, zawężający się pierścień ognia, oddech palenisk);
- Piekło ma **dwa piętra** (5 i 6); na 6, „gorętszym”, paleniska buchają częściej (przerwa 4,2 s → 2,9 s, ostrzeżenie zostaje 1 s — liczby z kroku 41b);
- wrogowie biomu: do mojej propozycji.

**Zrobione:** `BIOME_BY_FLOOR[6] = Infernal`; od piętra 7 dalej ruiny. Bossowie bez zmian do czasu Kata (na obu piętrach Strażnik). Test `biomes.test.ts` zaktualizowany.

---

## Krok 41d — Wrogowie Piekła: piekielny ogar i kultysta popiołu `#pieklo`

**Decyzje właściciela:** `#decyzja` `#pieklo` `#kat-otchlani`
- moja propozycja wrogów przyjęta: **piekielny ogar** (Rusher) i **kultysta popiołu** (Kiter);
- piętro 5 kończy mniejszy boss — **Strażnik Bram** (opcja A: wariant Kata z samą tarczą i wirującym łańcuchem, uczy obchodzenia tarczy); Kat Otchłani na końcu piętra 6.

**Zasady (`systems/HellAttacks.ts`, liczby w `combatConfig` → `ENEMY_VARIANTS`):**
- nowe rodzaje ataku wrogów: `Pounce` (skok) i `Lob` (rzut łukiem); wariant może mieć własną prędkość (`moveSpeed`);
- **ogar:** chód 150 (zwykły Rusher 115). Z odległości ≤ 110 px zamach 450 ms — przysiad, czerwona linia do miejsca gracza z początku zamachu; potem skok po prostej (460 px/s, najdalej 140 px). Trafia raz (12 obrażeń); dash i nietykalność = chybienie, a chybiony ogar stoi 0,7 s (okno na kontrę). Skoku nie przerywa trafienie. Za skokiem co 14 px zostaje **smuga żaru** (1,5 s, parzy po 4);
- **kultysta:** z odległości ≤ 230 px zamach 550 ms, potem bomba smolna leci łukiem 750 ms w miejsce gracza z chwili rzutu; **strefa upadku** wypełnia się przez cały lot; wybuch 10 obrażeń w promieniu 30 px, potem **płonąca kałuża** (2,5 s, parzy po 4) — odcina drogę i zagania na paleniska;
- płonące ślady to teren: parzą gracza, którego środek jest w środku (przez trafienie z nietykalnością — najwyżej raz na jej czas); wrogów nie.

**Wygląd (`tools/infernal_enemies.py`):**
- `hellhound_run-pounce.png` — popielata sierść (jaśniejsza od podłogi), żarząca się szczelina wzdłuż grzbietu, czerwone oczy; 0–3 bieg, 4 przysiad (oczy rozbłyskują), 5–6 lot, 7 lądowanie;
- `cultist_walk-throw.png` — szaty z wypłowiałego popiołu, czerwona szarfa, ciemny kaptur z żarzącymi się oczami, żelazne naczynie ze smołą; 4–7 rzut;
- `tar-bomb.png` — garnek ze smołą, iskra lontu; w locie unosi się łukiem nad swoim cieniem;
- ogień na podłodze rysuje silnik (koła żaru, ADD, stała alfa — jak paleniska);
- czytelność na palecie A: ogar obrys 2,19 / ciało 1,68, kultysta 2,19 / 1,85 (testy i makieta).

**Testy:** `tests/systems/hellAttacks.test.ts` (warianty w Piekle, szybszy ogar, rodzaje ataku, czas na reakcję; lądowanie i czas skoku, punkty smugi; łuk rzutu; płonące ślady), `biomes.test.ts` — czytelność ogara i kultysty. `npm run build`: 995 testów.

**Weryfikacja w przeglądarce** (`?seed=7&floor=5`): ogar celuje (linia, zamach), skacze i zostawia żar; bomby kultysty lecą łukiem, strefa upadku się wypełnia, po wybuchu płonie kałuża; bez błędów w konsoli.

**Ograniczenie:** obrażenia smugi i kałuży nie rosną z piętrem (rośnie tylko cios/wybuch, jak u innych wrogów).

**Do oceny w testach właściciela:** zasięg i tempo skoku, czas postoju po chybieniu, częstotliwość bomb, czas palenia się kałuż.

---

## Krok 41e — Strażnik Bram (boss piętra 5) i tarcza `#pieklo` `#kat-otchlani`

**Decyzja właściciela:** `#decyzja` piętro 5 kończy mniejszy boss (opcja A) — **Strażnik Bram**, wariant Kata Otchłani z samą tarczą i wirującym łańcuchem; uczy obchodzenia tarczy przed walką z Katem.

**Tarcza (czysto: `systems/Shield.ts`, definicja `BossDefinition.shield`; wspólna z Katem):**
- chroni stożek 120° przed bossem;
- **pociski z przodu odbija** — wracają w stronę strzelca jako pociski wroga (prędkość ×0,8, te same obrażenia): kule Czarodziejki i strzały barbarzyńcy;
- **promień z przodu nie rani** bossa (zatrzymuje się na żelazie);
- **cios wręcz (i Burzowy pęd) w tarczę** zadaje połowę obrażeń;
- tarcza obraca się do gracza 110°/s — wolniej, niż gracz okrąża bossa z bliska (~360°/s przy 80 px); na początku ataku boss zwraca się do gracza, a w trakcie ataku i przerwy po nim stoi — wtedy można go zajść;
- przed bossem rysowany jest cienki pomarańczowy łuk chronionego stożka.

**Strażnik Bram (`GATE_WARDEN`, liczby moje):** 420 HP bazowo (skalowane z piętrem: 672 na 5.), chód 62, wzór w „worku”: **wirujący łańcuch** (strefa 92 px dookoła — karze stanie za plecami, telegraf 0,9 s) i **uderzenie tarczą** przed sobą (telegraf 0,65 s, potem 0,8 s postoju). Plansza: „Strażnik Bram — Odźwierny Otchłani”, wściekłość „Żar w żyłach!”. Piętro 6 do czasu Kata ma Strażnika Piętra.

**Wygląd (`tools/gatekeeper_sprites.py` → `gate-warden_walk-spin-bash.png`, 96×96):** demon w okopconym pancerzu, rogaty hełm ze szparą żaru, tarcza-wrota z żarzącą się runą zawsze z przodu (dominująca cecha), łańcuch z hakiem w prawej ręce; 0–3 chód, 4–7 wirowanie (hak okrąża bossa), 8–11 uderzenie tarczą (pchnięcie, rozbłysk runy, iskry). Bez animacji śmierci (błysk i plama).

**Testy:** `tests/systems/shield.test.ts` (stożek, różnica kątów, obrót krótszą drogą, odbicie), `tests/ai/GateWarden.test.ts` (piętro 5, tarcza do obejścia, wzór, animacje); testy wyboru bossa pięter zaktualizowane. `npm run build`: 1006 testów.

**Weryfikacja w przeglądarce** (`?hero=sorceress&seed=7&floor=5`): plansza bossa, łuk tarczy w stronę gracza; kula od frontu — boss bez obrażeń, odbita kula trafia Czarodziejkę (−14); kula od tyłu — −14 bossowi; promień od frontu — bez obrażeń; telegraf wirowania; bez błędów w konsoli.

**Do oceny w testach właściciela:** szerokość stożka, prędkość obrotu tarczy, czy odbite pociski nie są za mocne, tempo ataków.

---

## Krok 41f — Kat Otchłani (boss piętra 6) `#pieklo` `#kat-otchlani`

**Decyzja właściciela:** `#decyzja` `#kat-otchlani` propozycja przyjęta — boss zupełnie inny od dotychczasowych, utrudniający grę postaci dystansowej; koniec dwupiętrowego Piekła.

**Mechanika (czysto: `ai/bossAttacks.ts`, `ai/BossBrain.ts`, `systems/Shield.ts`, `dungeon/BrazierPlanner.ts`; liczby w `ABYSS_EXECUTIONER`):**
- **tarcza** jak u Strażnika Bram (stożek 120°, odbija pociski, połowa ciosu), obrót 120°/s; **promień w tarczę ją rozgrzewa** — po 6 tickach (ok. 1,2 s) Kat odpowiada wybuchem żaru wokół siebie (telegraf 0,6 s, promień 96 px);
- **hak** (poza wzorem): gdy gracz stoi 130–260 px od Kata i minęło 4,5 s — linia stref od Kata w stronę gracza (telegraf 0,65 s); trafienie przyciąga gracza tuż przed tarczę („Hak!”), a 0,45 s później uderzenie tarczą przed sobą. Dash w bok = unik. Pierwszy hak najwcześniej w połowie otwarcia walki;
- wzór w „worku”: **uderzenie tarczą**, **wirujący łańcuch** (dookoła) i **oddech palenisk** — cztery paleniska w ćwiartkach areny rosną przez 1 s i buchają naraz (promień 56 px);
- **wściekłość („Otchłań płonie!”):** brzeg areny płonie, wolne koło w środku kurczy się od połowy krótszego boku areny do 110 px przez 25 s; poza kołem ogień parzy (8, przez trafienie z nietykalnością) i odpycha do środka;
- 520 HP bazowo (910 na piętrze 6); skalowanie obejmuje też hak, uderzenie po haku, oddech, pierścień i wybuch żaru.

**Wygląd:** wariant generatora Strażnika (`tools/gatekeeper_sprites.py` → `abyss-executioner_walk-spin-bash-hook-kindle.png`, 96×96, 20 kolumn): czerniejsze żelazo, korona z sześciu rogów, żarzące się serce w napierśniku; 12–15 rzut hakiem, 16–19 oddech (serce i wizjer rozbłyskują). Arkusz Strażnika Bram bez zmian. Pierścień ognia: pas czworokątów (ADD, stała alfa) i jasna krawędź koła — gruba linia okręgu rysowała się w klinowe paski. Bez animacji śmierci.

**Testy:** `tests/ai/GateWarden.test.ts` — Kat na piętrze 6, tarcza z rozgrzaniem; hak (linia do gracza, przyciągnięcie pod tarczę, uderzenie po haku), hak tylko z dystansu i po otwarciu walki; oddech na wszystkich paleniskach naraz; paleniska areny w ćwiartkach; kurczenie pierścienia. `npm run build`: 1014 testów.

**Weryfikacja w przeglądarce** (`?hero=sorceress&seed=7&floor=6`): plansza „Kat Otchłani — Pan Łańcuchów”; Czarodziejka 171 px od Kata — hak przyciąga ją na 45 px, potem uderzenie tarczą; oddech palenisk; po zbiciu HP poniżej połowy pierścień ognia; bez błędów w konsoli.

**Do oceny w testach właściciela:** zasięg i odstęp haka, siła odbić i wybuchu żaru, tempo kurczenia pierścienia, trudność całego Piekła.

---

## Krok 41g — Run testowy z adresu na Pages `#pieklo`

Właściciel chce testować od razu ostatnie piętro na Pages. `?floor=N` i `?seed=N` działają teraz także w buildzie produkcyjnym, ale taki run jest **testowy**: wynik nie trafia ani na lokalną, ani na wspólną tablicę.

- `systems/startOverrides.ts` (czysty): `parseStartOverrides(search)` → `{ runSeed?, floor?, practice }`; `practice` = podany seed albo piętro > 1 (`?floor=1` to zwykły run). Zastępuje `BootScene.devStartOverrides`.
- `RunSnapshot.practice` (opcjonalne) przechodzi przez `newRun(hero, practice)`, ekran wyboru bohatera (`HeroSelectData.practice`) i kolejne piętra (`RunState.snapshot`).
- `GameScene.handlePlayerDeath`: run testowy pomija zapis i pytanie o imię; ekran śmierci ma źródło `practice` — nagłówek „RUN TESTOWY — WYNIK NIE TRAFIA NA TABLICĘ”, bez miejsca. R/C po śmierci zaczynają zwykły run.
- HUD: „Złoto: N (run testowy — bez wyniku)”; komunikat na start piętra, gdy nie ma modyfikatora.

**Testy:** `tests/systems/startOverrides.test.ts` (parsowanie, błędne wartości, znacznik przez piętra). Build: 1019 testów.

**Weryfikacja:** build produkcyjny `?floor=6&hero=sorceress` — od razu piętro 6; dev `?floor=5` → wybór bohatera → piętro 5, po śmierci panel „RUN TESTOWY”, `death.source = 'practice'`, bez błędów w konsoli.

Adresy dla testerów: `https://wvytz.github.io/topdown/?floor=5` (Strażnik Bram), `?floor=6` (Kat Otchłani); `&hero=sorceress` pomija wybór bohatera.

## Krok 42 — Elity z cechami `#elity`

**Decyzja właściciela** `#decyzja` `#elity`: z propozycji wzbogacenia rozgrywki (elity, pokoje ryzyka, kupiec, synergie, koniec wieży) najpierw elity; koniec wieży — wariant B (pętla: po piętrze 6 kolejny krąg biomów 1–6, mocniejszy). Finałowego bossa jeszcze nie ma.

Co kilka pokojów jeden zwykły wróg jest **elitą**: 2,5× HP, 1,3× obrażenia, cecha zmieniająca walkę i lepszy łup. Bez nowych wrogów i sprite'ów — elitę wyróżnia pulsujący pierścień w kolorze cechy pod stopami i nazwa nad głową (gasną w mroku razem z wrogiem).

| Cecha | Od piętra | Działanie |
|---|---|---|
| Szybki | 1 | chód ×1,35, zamach ×0,8, przerwa ×0,7 |
| Tarczownik | 1 | tarcza od frontu (140°): z przodu 30% obrażeń, szary błysk; obraca się 100°/s — obejście albo dash za plecy |
| Wampiryczny | 2 | trafienie gracza (cios, pocisk, skok) leczy go o 2× zadane obrażenia (zielone „+N”) |
| Wybuchowy | 2 | po śmierci strefa (52 px) wypełnia się 0,9 s i wybucha |
| Ognisty | 3 | smuga żaru za nim (co 16 px, 2,2 s), po śmierci płonąca kałuża |

- Szansa na elitę w pokoju: piętro 1 — 20%, 2 — 30%, dalej 40%; najwyżej jedna na pokój. Liczba cech: 1 (w kolejnych kręgach wieży więcej — krok 43).
- Łup elity: złoto ×3 i pewne, mikstura +20 pkt proc., przedmiot 25%.
- Obrażenia żaru i wybuchu rosną z piętrem jak ciosy wrogów (`ENEMY_SCALING`).

**Pliki:** `systems/Elites.ts` (czyste: `rollElites`, `applyElite`, `eliteLoot`, `lifestealHeal`, `eliteTitle`), `config/eliteConfig.ts`, `core/combatTypes` (`EliteAffix`, `EnemyDefinition.affixes`), `EncounterPlanner` (spawn zna pokój), `Enemy` (tarcza), `EnemyManager` (smuga, wybuchy, wampiryzm), `ProjectileManager` (`onHit`), `effects/EliteMarker.ts`, `ELITE_VISUAL`. Elity mają własny strumień RNG (sól `0xe117`) — rozmieszczenie wrogów się nie zmienia.

**Testy:** `tests/systems/elites.test.ts` (najwyżej jedna elita na pokój, liczba cech bez powtórzeń, odblokowanie z piętrem, statystyki, łup, wampiryzm, napis). Build: 1029 testów.

**Weryfikacja w przeglądarce:** `?floor=3&seed=11` — Ognisty grzybiec z pierścieniem i napisem; na piętrze 5 elity postawione obok gracza: Tarczownik przyjmuje 6 z 20 obrażeń od frontu i 20 od tyłu; Wybuchowy po śmierci — strefa i wybuch, Ognisty zostawia kałużę; wampir leczy się z ciosu (65 → 93) i z pocisku Kitera (35 → 75); bez błędów w konsoli.

**Do oceny w testach właściciela** `#elity`: częstość elit, siła cech (zwłaszcza Tarczownik na Czarodziejkę i Wampiryczny), czytelność napisów.

## Krok 43 — Pętla wieży (koniec wieży, wariant B) `#wieza`

**Decyzja właściciela** `#decyzja` `#wieza`: po Kacie Otchłani wspinaczka trwa dalej (wariant B); finałowego bossa jeszcze nie ma.

- Krąg wieży = 6 pięter. Od piętra 7 biomy i bossowie wracają od początku (7 ruiny, 8 leże z Matką Pająków … 12 Piekło z Katem). Wcześniej po piętrze 6 były już tylko ruiny ze Strażnikiem.
- Trudność dalej rośnie z numerem piętra (HP i obrażenia wrogów i bossów — `ENEMY_SCALING`), paleniska w drugim kręgu buchają najczęściej (minimum przerwy).
- Elity: w każdym kolejnym kręgu o cechę więcej (1 → 2 → 3, limit 3).
- HUD: „Piętro 8 · Krąg II”.

**Pliki:** `config/towerConfig.ts`, `systems/TowerLoop.ts` (czyste: `towerLoop`, `floorInLoop`, `eliteAffixCount`, `floorLabel`, `toRoman`); `biomeForFloor` i `bossForFloor` liczą piętro w kręgu.

**Testy:** `tests/systems/towerLoop.test.ts`; test biomów zaktualizowany (piętro 9 to Grzybnia, 13 — ruiny). Build: 1035 testów.

**Weryfikacja w przeglądarce:** `?floor=8&seed=4&hero=sorceress` — Pajęcze leże, boss Matka Pająków, HUD „Piętro 8 · Krąg II”, elity „Wampiryczny · Szybki” i „Ognisty · Wybuchowy”; bez błędów w konsoli.

**Do decyzji później:** finałowy boss (koniec kręgu albo osobne piętro), ewentualne dodatkowe utrudnienia kręgu poza skalowaniem i cechami elit.

## Krok 44 — Galerie za kratami u Strażnika Bram; wyraźniejsze elity `#elity` `#pieklo`

**Ocena właściciela po krokach 42–43** `#ocena` `#elity` `#pieklo`: „nie zauważyłem żadnego potwora elity”; „Tarczownik jest mega wolny i może niech tak zostanie” — chodzi o Strażnika Bram (boss z tarczą, piętro 5; tylko arena bossa ma kraty). Pomysł właściciela `#decyzja`: z 3 stron jego pokoju magowie rzucający bombami zza krat, które otwierają się dopiero po jego pokonaniu. Prędkość Strażnika bez zmian.

**Galerie areny** (`dungeon/ArenaGalleries.ts`, czyste, bez RNG):
- `carveArenaGalleries(floor, 3, 2)` wykuwa w litej skale za ścianą areny wnęki głębokie na 2 kafle, w ścianach bez wejść (najpierw), jak najbliżej środka ściany. Ściana bez miejsca (np. przy krawędzi mapy) jest pomijana — w próbce średnio ponad 2,5 galerii na arenę.
- Kafel ściany przed wnęką staje się przejściem w pierścieniu wokół areny, więc dostaje zwykłą kratę (`findRoomEntrances`): opada z resztą, gdy zaczyna się walka, i podnosi się po śmierci bossa. Krata blokuje kule, strzały i promień; z wnęki (2 kafle) nie sięga cios wręcz.
- Gdy kraty opadną, w każdej wnęce staje Kiter piętra (w Piekle kultysta) i rzuca bomby łukiem ponad kratą. Po śmierci Strażnika wychodzi z galerii. Wrogowie galerii nie znikają w półmroku (za kratą byliby niewidzialnym działem).
- `BossDefinition.galleries` (`ArenaGalleryDefinition`): Strażnik Bram `{ sides: 3, depth: 2, enemy: Kiter }`.

**Elity — wyraźniej:**
- Co najmniej jedna elita na piętrze (`ELITE_CONFIG.minPerFloor = 1`) — wcześniej na piętrze 1 ok. 35% pięter nie miało żadnej.
- Gdy elita pierwszy raz widzi gracza z bliska (220 px), komunikat z podpowiedzią, np. „Elita! Tarczownik — z przodu tarcza, obejdź go”.

**Testy:** `tests/dungeon/ArenaGalleries.test.ts` (wnęki tylko w skale, nowe wejścia areny, różne ściany, determinizm), `elites.test.ts` (minimum elit, komunikat); `ArenaGalleries.ts` w `PURE_FILES`. Build: 1040 testów.

**Weryfikacja w przeglądarce:** `?floor=5&seed=7&hero=sorceress` — dwie galerie (północ przy krawędzi mapy), kraty galerii zamknięte w walce (kafle kolizji), kultyści widoczni za kratami i rzucają bomby; `?floor=1&seed=5` — komunikat o Tarczowniku; bez błędów w konsoli.

## Krok 45 — Arena bossa na końcu piętra `#wieza`

**Decyzja właściciela** `#decyzja` `#wieza`: nowa reguła dla wszystkich aren bossów — arena może prowadzić do najwyżej jednego dodatkowego pomieszczenia i ma to być końcowe pomieszczenie przed końcem poziomu. Wyjątek: piętro 1 (szybsze przejście do drugiego biomu).

Wcześniej korytarze łączyły pokoje drzewem rozpinającym z pętlami, a korytarz w kształcie „L” mógł przeciąć arenę — przez arenę dało się przechodzić między częściami piętra.

**Generator** (`DungeonGenerator`, `bossRoomAtEnd` w konfiguracji piętra; piętro 1 — wyłączone):
- Reszta piętra (bez areny i pokoju końcowego) łączy się drzewem i pętlami jak dotąd, ale korytarze omijają arenę i pokój końcowy z kaflem zapasu: najpierw jedno z dwóch „L”, a gdy oba zahaczają — najkrótsza droga BFS dookoła.
- Arena ma jedno wejście: korytarz z najbliższego pokoju reszty piętra.
- Pokój końcowy (szansa 50%, `endRoomChance`): najbliższy arenie, połączony tylko z nią korytarzem, który nie styka się z niczym innym. `DungeonFloor.endRoomId`. Zwykły pokój (wrogowie, może być kapliczka); schody zostają na środku areny.
- Start nie może być pokojem końcowym.
- Każde piętro sprawdza czysty walidator `dungeon/bossRoomRule.ts` (`checkBossRoomAtEnd`): składowe podłogi z wyciętą areną; arena ma dokładnie jedno wejście z reszty piętra i najwyżej jedno do ślepego pokoju, żadnych pętli ani kikutów. Nieudana próba → kolejna z RNG pochodnym od seeda (do 12); awaryjnie stary układ (w testach nie wystąpił).

**Galerie Strażnika (krok 44)** dalej działają — wnęki powstają po wygenerowaniu i nie łączą się z niczym.

**Testy:** `tests/dungeon/bossRoomRule.test.ts` — 280 pięter (2–7, 12): reguła spełniona, pokój końcowy w 25–75% pięter, piętro 1 wyłączone; walidator wykrywa pętlę przez arenę i rozpoznaje ślepy pokój. `bossRoomRule.ts` w `PURE_FILES`. Build: 1044 testy.

**Weryfikacja w przeglądarce:** `?floor=3&seed=7` — mapa z gry: arena z jednym korytarzem wejściowym i ślepym pokojem końcowym obok, reszta piętra omija arenę; bez błędów w konsoli.

**Pokój końcowy:** ukryta komnata z kokonami skarbu (krok 46).

## Krok 46 — Ukryta komnata za areną `#wieza`

**Pomysł właściciela** `#decyzja` `#wieza`: w pokoju końcowym za areną (krok 45) ukryta komnata — pokazuje się dopiero, gdy do niej podejdziesz (widać ją z 2 kratek w każdym kierunku). W środku kokony do rozbicia, które nie zachowują się jak inne kokony; tylko z jednego wypada losowy przedmiot.

- Pokój końcowy ma nowy rodzaj `RoomKind.Secret` — planery (wrogowie, kapliczka, kokony leża, purchawki, paleniska, pajęczyny) go pomijają.
- **Przebranie** (`dungeon/SecretRoom.ts`, czyste): `secretArea` — komnata i korytarz do areny; `disguiseFloor` — te kafle jako mur. Piętro rysujemy z przebrania (także pochodnie planowane na przebraniu), kolizja i reszta logiki używa prawdziwych kafli. Krata wejścia do komnaty działa jak każda krata areny, ale jej obraz jest ukryty do odsłonięcia (`DungeonView.hiddenGates`, stan pamiętany).
- **Odsłonięcie:** gdy gracz stanie na kaflu najwyżej 2 kafle (Czebyszew) od komnaty (`revealMask`), `DungeonView.revealSecret` podmienia obraz w prostokącie komnaty z zapasem 3 kafli tylko tam, gdzie prawdziwy obraz różni się od przebrania; błysk, lekki wstrząs, komunikat „Ukryta komnata! Rozbij kokony — w jednym jest skarb.”
- **Kokony skarbu** (`entities/TreasureCocoon.ts`, `combat/SecretRoomManager.ts`): 4–6 na losowych kaflach komnaty (z odstępem od ścian), wygląd kokonu leża, nie budzą się i nic z nich nie wyskakuje; każde trafienie (cios, kula, strzał, promień, dash) rozbija kokon. Z jednego wypada losowy przedmiot z całej puli (wagi jak łupy), pozostałe — „pusto”. Własny strumień RNG (sól `0x5ec7`).
- Liczby: `SECRET_ROOM_CONFIG` (`config/lootConfig.ts`), wygląd: `SECRET_ROOM_VISUAL`.

**Testy:** `tests/dungeon/SecretRoom.test.ts` — obszar (cała komnata i korytarz, bez areny, styka się z areną), przebranie, maska 2 kafli, brak wrogów i kapliczki w komnacie, plan kokonów (zakres, różne kafle, odstęp od ścian, jeden z przedmiotem); `SecretRoom.ts` w `PURE_FILES`. Build: 1049 testów.

**Weryfikacja w przeglądarce:** `?floor=3&seed=7` — z areny w miejscu komnaty lity mur; 2 kafle od niej mur znika, widać korytarz z kratą i komnatę, komunikat; 4 kokony, po rozbiciu z jednego wypadł przedmiot (Elektryczna strzała), reszta „pusto”; bez błędów w konsoli.

## Krok 47 — Schody na klawisz E `#wieza`

**Ocena właściciela** `#ocena` `#wieza`: „zbyt często przypadkowo spadam na dół, nie zbieram nagród” — w teście kroku 46 wszedł na schody przypadkiem, zanim znalazł ukrytą komnatę z gwarantowaną nagrodą.

- Samo wejście na otwarte schody nie przenosi już wyżej. Gracz musi stać na schodach i nacisnąć **E** (ten sam klawisz co kapliczka).
- Gdy stoi na schodach: napis nad nimi „[E] Wejdź wyżej” i w HUD „Naciśnij E, aby wspiąć się wyżej”; poza nimi HUD: „Schody otwarte — stań na nich i naciśnij E, aby wspiąć się wyżej”. Linia pomocy: „E — kapliczka, schody”.
- `HudData.onStairs`; `GameScene.checkStairs(interact)`.

**Weryfikacja w przeglądarce:** `?floor=2&seed=7` — po pokonaniu Matki Pająków i wyborze nagrody: obok schodów nic się nie dzieje, na schodach napis i podpowiedź, bez E piętro się nie zmienia, po E przejście na piętro 3; bez błędów w konsoli. Build: 1049 testów (zmiana tylko w warstwie Phasera).

## Krok 48 — Pułapki i urny w ruinach `#ruiny`

**Ocena i decyzja właściciela** `#ocena` `#decyzja` `#ruiny`: „pierwszy poziom wydaje się całkowicie pusty i nie ma w nim żadnego wyzwania”. Z propozycji (pułapki, rzeczy do rozbicia, zasadzka, życie w tle) — pułapki i rzeczy do rozbicia („najwyżej potem usuniemy”), **bez beczek z prochem** („nie chcę odtrącać na początku graczy”). Na razie tylko biom ruin (piętro 1, w pętli 7, 13…).

**Płyty z kolcami** (`systems/Traps.ts`, `dungeon/TrapPlanner.ts → planSpikeStrips`):
- w 35% zwykłych pokojów (krótszy bok ≥ 5) pas płyt w poprzek pokoju przez jego środek — żeby przejść, trzeba go przekroczyć;
- dwie grupy naprzemiennie (pół cyklu przesunięcia): nigdy obie naraz w górze, więc zawsze jest przejście w rytmie;
- cykl 1,6 s schowane → 0,6 s ostrzeżenie (płyta drży, groty w otworach, czerwona ramka) → 0,9 s wysunięte; 10 obrażeń (rośnie z piętrem), raz na wysunięcie; **ranią też wrogów** — można ich wciągać.

**Strzałki** (`planDartTraps`, `DartTrapState`):
- w 30% zwykłych pokojów otwór w litym murze (nie w wejściu) i linia strzału przez cały pokój (≥ 6 kafli); płyta naciskowa 2–3 kafle od muru;
- nadepnięcie → otwór się żarzy i widać linię strzału (0,45 s) → salwa 3 strzałek co 0,16 s (9 obrażeń, rosną z piętrem) → 2,5 s odpoczynku i zejście z płyty; ranią tylko gracza, dash przelatuje jak przez każdy pocisk.

**Urny i skrzynie** (`planBreakables`, `combat/BreakableManager.ts`): w 90% pokojów (zwykłych i startowym) 1–3 przy ścianach, nie przed wejściami i nie na pułapkach; bez kolizji; każde trafienie rozbija; szczątki zostają; łup `BREAKABLE_LOOT`: 60% na 1–2 złota (skaluje się z piętrem), 6% na małą miksturę (10 HP), bez przedmiotów.

**Grafika:** generator `tools/ruins_props.py` → `ruins-traps.png` (płyta z kolcami: schowane, 2 klatki ostrzeżenia, w połowie, wysunięte; płyta naciskowa i wciśnięta; otwór i otwór uzbrojony), `dart.png`, `ruins-breakables.png` (2 urny, skrzynia, szczątki). Kamień płyt chłodniejszy i ciemniejszy od piaskowca — pułapka czytelna.

**Kod:** `combat/TrapManager.ts`, `BiomeDefinition.traps`/`breakables` (ruiny; reszta `null`), `ProjectileSpec.rotation` (strzałka grotem do przodu), własne sole RNG (kolce `0x5b1e`, strzałki `0xda27`, urny `0xb7ea`); kolejne planery omijają kapliczkę i wcześniejsze kafle.

**Testy:** `tests/systems/traps.test.ts` (tylko ruiny, cykl kolców, grupy nigdy razem w górze, jedno trafienie na cykl, stany pułapki ze strzałkami), `tests/dungeon/TrapPlanner.test.ts` (pas w zwykłych pokojach, naprzemienne grupy, otwór w murze, linia po podłodze z płytą, z dala od kolców; urny przy ścianach, nie przed wejściami, deterministycznie); `TrapPlanner.ts` w `PURE_FILES`. Build: 1066 testów.

**Weryfikacja w przeglądarce:** `?floor=1&seed=3` — dwa pasy kolców wysuwające się na zmianę z ostrzeżeniem; pułapka ze strzałkami: nadepnięcie, żar w otworze, salwa strzałek przez pokój (gracz 90 → 71 HP); urny przy ścianach; bez błędów w konsoli.

**Decyzja właściciela po kroku 48** `#decyzja` `#ruiny`: pułapki i urny na razie tylko w ruinach; właściciel przetestuje i da znać.

**Do oceny w testach właściciela** `#ruiny`: częstość i siła pułapek, ilość urn i łupu.

## Krok 49 — Pokoje zasadzki i upiór `#zasadzka`

**Decyzja właściciela** `#decyzja` `#zasadzka`: pokój z kratami pojawiający się losowo co 1–2 biomy — zasadzka: przedmiot na środku pustego pokoju; po wejściu światło przygasa i nadciąga fala duchów; nowy rodzaj potwora do takich zdarzeń. Pułapki i urny zostają tylko w ruinach.

**Harmonogram** (`systems/Ambush.ts → hasAmbush`): z seeda runu — pierwsza zasadzka na piętrze 1 albo 2, każda kolejna 1–2 piętra później (biom = piętro; Piekło ma dwa). W pętli wieży harmonogram trwa dalej.

**Pokój** (`dungeon/AmbushPlanner.ts`): losowy zwykły pokój o krótszym boku ≥ 6 dostaje rodzaj `RoomKind.Ambush` — planery wrogów, kapliczki, pułapek, urn, kokonów i palenisk go pomijają. Wejścia dostają kraty (`dressGates`: arena + pokój zasadzki). Na środku leży **przynęta: losowy przedmiot z puli** — nie da się go podnieść, dopóki zasadzka trwa.

**Przebieg** (`AmbushState`, `combat/AmbushManager.ts`): gracz ≥ 2 kafle w głąb pokoju → kraty opadają, wstrząs, „Zasadzka! Światło gaśnie…”, mrok narasta przez 0,9 s → po 1,1 s fala 3 upiorów → po jej wybiciu przerwa i fala 4 upiorów → światło wraca, kraty się podnoszą, „Upiory rozwiały się — nagroda jest twoja.”, przedmiot do podniesienia. Upiory nie zostawiają łupu.

**Mrok zasadzki** (`LightingOverlay.setDread`): druga warstwa ciemności (0,86) z małym kręgiem światła wokół gracza (pełne światło 40 px, brzeg 120 px), płynnie narasta i opada; pochodnie jej nie rozjaśniają. Upiory są rysowane nad mrokiem — świecą w ciemności.

**Upiór** (`EnemyVariant.Ghost`, wariant Rushera — nowy potwór do zdarzeń): 24 HP, 100 px/s; **przenika**: 2,4 s cielesny, 0,9 s bezcielesny (przezroczysty, nietykalny, nie atakuje, ale dalej płynie do gracza); fazy upiorów w fali rozłożone na cały cykl; przy pojawieniu **wynurza się** 0,9 s (nietykalny, bierny, rośnie przezroczystość); dotyk 8 obrażeń + spowolnienie 30% na 1,2 s. Grafika: generator `tools/ghost_sprites.py` → `ghost_float-grasp.png` (8 kierunków, 0–3 unoszenie z falującym trenem, 4–7 chwyt), blady błękit całunu, puste oczodoły z lodowym blaskiem.

**Liczby:** `config/ambushConfig.ts` (`AMBUSH_CONFIG`), upiór w `ENEMY_VARIANTS`, wygląd `GHOST_VISUAL`. Sole RNG: pokój `0xa3b0`, przebieg `0xa3b1`, harmonogram `0xa3b5`.

**Testy:** `tests/systems/ambush.test.ts` — harmonogram (pierwsza na 1–2, odstępy 1–2, determinizm), pokój (rozmiar, bez wrogów i kapliczki), miejsca upiorów (w pokoju, z dala od gracza), przebieg (kraty → fale po kolei → koniec), upiór (przenikanie, spowolnienie, wygląd); `AmbushPlanner.ts` w `PURE_FILES`. Build: 1076 testów.

**Weryfikacja w przeglądarce:** `?floor=1&seed=3&hero=sorceress` — pokój zasadzki z Ostrzem na środku; wejście: kraty, mrok z kręgiem światła, upiory wynurzają się i świecą, przenikające są półprzezroczyste; po dwóch falach światło wraca, kraty w górę, Ostrze podniesione; bez błędów w konsoli.

**Do oceny w testach właściciela** `#zasadzka`: częstość, liczba upiorów w falach, siła mroku, wygląd upiora.

## Krok 49a — Słabsze upiory: zasadzka jako nagroda o niskim ryzyku `#zasadzka`

**Decyzja właściciela** `#decyzja` `#zasadzka`: „uczyń jego ataki słabszymi, by nie był to pokój kojarzony z łatwą śmiercią, a bardziej z nagrodą o niskim ryzyku, jednak intensywniejszej walce”. To świadome złagodzenie tylko upiorów (zasada „nie łagodź trudności” dotyczy reszty gry).

- Upiór: dotyk **8 → 4** obrażeń, zamach 420 → 500 ms (łatwiej uskoczyć), odrzut 120 → 90, spowolnienie 30%/1,2 s → **15%/0,8 s**, HP 24 → **20** (padają szybciej).
- Intensywniej: fale **3 + 4 → 4 + 5** upiorów.
- Przenikanie, mrok i przebieg bez zmian.

**Weryfikacja:** build (1076 testów); `?floor=1&seed=3` — fala 4 upiorów, po dwóch falach przynęta do wzięcia; bez błędów w konsoli.

## Krok 49b — Magia trafia upiory; większe pokoje zasadzki `#zasadzka` `#czarodziejka`

**Test botem (5 zasadzek, przed zmianą)** `#zasadzka`: Barbarzyńca czyścił zasadzkę w 8–14 s, tracąc 0–14% HP; Czarodziejka na piętrze 1 w 31 s (−27% HP), na piętrze 6 w ciasnym pokoju 9×6 w 45 s, schodząc do 9/75 HP. Kule Czarodziejki ginęły na bezcielesnych upiorach bez obrażeń.

**Decyzje właściciela** `#decyzja` `#zasadzka` `#czarodziejka`:
1. „Czarodziejka używa magii — trafia zawsze”: kule i promień ranią upiory także bezcielesne i wynurzające się (`Hit.magic`, `PlayerShot.magic`, `ShotLook.magic`; promień zawsze magiczny). Ciosy i strzały barbarzyńcy dalej przez nie przenikają.
2. „Pokój w większości przypadków 7 kratek, czasem 6”: `planAmbushRoom` z szansą 80% wybiera spośród pokojów o krótszym boku ≥ 7 (gdy są), inaczej ≥ 6 (`preferredSide`, `preferredChance` w `AMBUSH_CONFIG`).

**Test botem po zmianach (te same seedy, bohaterowie i piętra; bot bez uników i dasha):**

| Bohater | Piętro | Czas | HP | Trafienia |
|---|---|---|---|---|
| Barbarzyńca | 1 | — | 100 → 96 | 1 |
| Czarodziejka | 1 | 24 s | 75 → 59 | 4 |
| Barbarzyńca | 4 | — | 100 → 95 | 1 |
| Czarodziejka | 6 | 38 s | 75 → 45 | 5 |
| Barbarzyńca | 9 | 13,5 s | 100 → 72 | 4 |

(— = czas walki nie zarejestrował się w skrypcie; zasadzka zakończona.) Czarodziejka na piętrze 6: z 9 HP na 45 HP i 7 s krócej; nikt nie zginął.

**Testy:** promień i kula z magią przekazują znacznik do trafienia (`sorcery.test.ts`), pokój ≥ 7 w > 75% pięter, które go mają (`ambush.test.ts`). Build: 1079 testów.

## Krok 50 — Rozprysk kuli Czarodziejki `#czarodziejka`

**Decyzja właściciela** `#decyzja` `#czarodziejka`: z trzech propozycji delikatnego AoE (rozprysk kuli, ładunek trzeciej kuli, parząca orbita) — **rozprysk**. Opcja defensywna (parząca orbita) do rozważenia innym razem.

- Kula po trafieniu rozpryskuje się w promieniu **24 px**: wrogowie dotykający koła rozprysku (poza głównym celem) dostają **35% obrażeń kuli** (14 → 5), jako magię (trafia też bezcielesne upiory), **bez efektów przedmiotów** (statusy tylko na głównym celu) i bez odrzutu.
- Działa na zwykłych wrogów, pajączki i kokony z walk z bossem oraz na bossa (tarcza jak przy ciosie).
- Wygląd: pierścień energii w kolorze kul (`ORB_SPLASH_VISUAL`).
- Kod: `OrbConfig.splash` (`config/heroConfig.ts`), czyste `resolveSplash`, `splashDamage` (`systems/Sorcery.ts`), `EnemyManager/BossFight.resolveSplash`, `CombatEffects.splash`.

**Testy:** rozprysk rani sąsiada, pomija główny cel i dalekich, magia bez statusów, obrażenia ≥ 1 (`sorcery.test.ts`). Build: 1080 testów.

**Test botem (10 zasadzek, ten sam seed i pokój dla obu postaci; bot bez uników i dasha; czas od krat do końca):**

| Piętro | Pokój | Barbarzyńca | Czarodziejka |
|---|---|---|---|
| 1 | 7×9 | 11,9 s, 100 → 100 | 18,1 s, 75 → 55 |
| 2 | 9×9 | 8,0 s, 100 → 96 | 21,3 s, 75 → 71 |
| 4 | 8×8 | 12,5 s, 100 → 80 | 30,2 s, 75 → 45 |
| 6 | 7×9 | 9,4 s, 100 → 100 | 29,0 s, 75 → 39 |
| 9 (krąg II) | 9×7 | 12,1 s, 100 → 79 | **śmierć** (11 trafień) |

Średnio na piętrach 1–6: Barbarzyńca ok. 10,5 s, Czarodziejka ok. 24,7 s. Względem kroku 49b Czarodziejka szybsza (piętro 1: 24,3 → 18,1 s; piętro 6: 37,9 → 29,0 s). W drugim kręgu upiory mają ok. 44 HP i 7 obrażeń — Czarodziejka (bot bez uników) nie wytrzymuje; do oceny po teście właściciela.

## Krok 50a — Upiory rosną wolno: zasadzka to jackpot, nie kłopot `#zasadzka`

**Decyzja właściciela** `#decyzja` `#zasadzka`: „upiory nie rosną tak szybko jak inni przeciwnicy. Zostawiamy zamysł tego zdarzenia jako jackpot, a nie kłopot.”

- Upiory mają własne skalowanie z piętrem `AMBUSH_CONFIG.ghostScaling`: HP +5%/piętro, obrażenia +3%/piętro (zwykli wrogowie +15% / +10%) i **nie dotyczą ich modyfikatory piętra** (np. „Twarda skóra”). Piętro 9: ok. 28 HP i 5 obrażeń zamiast 44 i 7.
- `EnemyManager.spawnAt(..., { scaling })` — własne skalowanie bez modyfikatora piętra.

**Test botem (Czarodziejka, bez uników):** piętro 9 — przedtem śmierć, teraz 25,2 s, 75 → 55 HP (4 trafienia); piętro 6 — 29,0 s / 39 HP → 22,9 s / 60 HP. Build: 1081 testów.

## Krok 51 — Ukryta komnata tylko po Królu Pająków `#wieza` `#grzybnia`

**Decyzja właściciela** `#decyzja` `#wieza`: ukryta komnata z kokonami (krok 46) ma być tylko nagrodą za pokonanie Króla Pająków. Dodatkowe sekretne komnaty po innych bossach — do rozważenia w innym terminie.

- `endRoomChance` w `getDungeonConfigForFloor` zależy od biomu: **1** w Grzybni (`SECRET_ROOM_BIOME`, `config/gameConfig.ts`; piętro 3 i powtórzenia w kolejnych kręgach: 9, 15…), **0** gdzie indziej (dawniej 50% od piętra 2). Reguła „arena na końcu piętra” (krok 45) bez zmian — arena nadal ma jedno wejście, tylko bez pokoju końcowego poza Grzybnią.
- Piętro Grzybni ma zawsze pokój końcowy (o ile generator zmieści układ; przy nieudanej próbie jak dotąd kolejna z RNG).

**Testy:** `bossRoomRule.test.ts` — szansa 0/1 według biomu, pokój końcowy zawsze na piętrze 3 i nigdy na 4; udział pokoi końcowych w badanych piętrach 10–20%. Build: 1082 testy.

## Krok 52 — Gniazdo pająków: coraz więcej pajęczyn ku arenie `#decyzja` `#pajecze-leze` `#grzybnia`

**Prośba właściciela** `#decyzja`: więcej pajęczyn w bliskim otoczeniu komnaty bossów pająków, żeby gracz wyczuł, że zbliża się do gniazda. Przy okazji sprawdzenie w przeglądarce ukrytej komnaty z kroku 51.

- `FloorDressingConfig.nest` (`config/dressingConfig.ts`, `SPIDER_NEST`): tylko Pajęcze leże (Matka Pająków) i Grzybnia (Król Pająków). Siła gniazda spada liniowo od 1 w arenie do 0 na **22 kafle** od jej krawędzi (`DressingContext.nestStrength`).
- Pajęczyna w górnym narożniku pokoju: szansa rośnie ku arenie do 100% (zwykle 70% w leżu, 50% w Grzybni). Przy arenie dochodzą też nici i jaja na licu muru (`wallFace.lair`, do 55%). Same dekoracje — bez kolizji i bez zmian w rozgrywce (lepkie pajęczyny-pułapki bez zmian).

**Testy:** `FloorDressing.test.ts` — narożniki przy arenie mają pajęczyny przy zerowej szansie bazowej, daleki pokój nie; lico muru tylko w zasięgu; gniazdo tylko w leżu i Grzybni; łącznie więcej pajęczyn niż bez gniazda.

**Weryfikacja w przeglądarce (`?hero=sorceress&seed=7`):** piętro 3 — wejście do ukrytej komnaty: odsłonięcie z 2 kafli i komunikat, kokony, pajęczyny w narożnikach; piętro 2 — pokój przy arenie ma pajęczyny w obu górnych narożnikach, pokój daleko od niej bez. Bez błędów w konsoli (poza 404 pliku pomocniczego). Build: 1086 testów.

## Krok 53 — Pajęczyny w korytarzach i „zapowiedź bossa” na pozostałych piętrach `#decyzja` `#pajecze-leze` `#grzybnia`

**Prośba właściciela** `#decyzja`: pajęczyny także w korytarzach przed areną; przemyśleć i przygotować dodatkowe elementy wizualne, które na pozostałych piętrach wskażą bliskość pokoju bossa.

- **Korytarze:** `NestDressing.corridorCobwebChance` (`SPIDER_NEST`: 0,6 ku arenie, malejąco z odległością). Pajęczyna w narożniku kafla korytarza przy murze (górnym albo bocznym), bez dwóch sąsiadujących (`dressCorridorCobwebs`). Korytarze do aren są krótkie, więc efekt jest subtelny — zapowiedź robią głównie pokoje.
- **Pozostałe piętra (gotowe z istniejącej grafiki, bez nowych kafli):** to samo „gniazdo” (`FloorDressingConfig.nest`) ma teraz Cmentarzysko (gęstnieją nisze z czaszkami, kostnica, epitafia — `wallFace.grave`) i Piekło (okowy, czaszki na kolcach, żar — `wallFace.infernal`). Bez pajęczyn. Ruiny bez zmian (piętro 1).
- **Pomysły na dalej (wymagają nowej grafiki lub decyzji — do wyboru przez właściciela):**
  - ślady wleczenia i krew prowadzące do wejścia areny (naklejki na podłodze, jak ślady tronu z kroku 39);
  - Ruiny: smugi szlamu i kałuże ku arenie Strażnika (Sludge King);
  - Cmentarzysko: stosy kości i ślady pazurów na podłodze;
  - Piekło: żarzące się szczeliny na posadzce, iskry unoszące się z podłogi;
  - światło: lekki odcień światła pochodni (cieplejszy / czerwieńszy) w pobliżu areny;
  - dźwięk i kamera: ledwo wyczuwalne drżenie ekranu w promieniu kilku kafli od areny.

**Testy:** korytarz — pajęczyny pod murem blisko areny, daleko brak, dolny rząd bez; konfiguracja gniazd (pająki z pajęczynami, Cmentarzysko i Piekło tylko lico). Build: 1087 testów.

## Krok 54 — Zapowiedź bossa: ślady wleczenia, odcień światła, drżenie, iskry `#decyzja` `#zapowiedz-bossa`

**Prośba właściciela** `#decyzja`: ślady krwi i wleczenia prowadzące do areny, a do tego wszystkie pomysły z kroku 53 („idealne”) — wdrożone, ile się dało; efekt do oceny po powrocie.

- **Ślady wleczenia i krwi (wszystkie biomy):** nowe kafle `decal_trail_{h,v}_{a,b}` (smuga przez cały kafel, łączy się z sąsiednimi) i `decal_trail_drops_{a,b}` (ciąg kropli) — generator `tools/tower_ruins_tiles.py` (`trail_decal`, dopisane na końcu manifestu, więc nic się nie przesuwa; wszystkie 5 arkuszy zregenerowane). Kolor = płyn biomu (`stain`): zaschnięta krew w ruinach i na Cmentarzysku, zielony ichor w leżu, błękit w Grzybni, krew w Piekle. `FloorDressing.dressTrail`: najkrótsza droga po podłodze od startu do wejścia areny (BFS), ostatnie 18 kafli, szansa 85% tuż przy wejściu → 20% na końcu; kierunek smugi wg kierunku marszu; bez areny, krat i okolic spawnu. `TrailDressing` w `NestDressing` (`config/dressingConfig.ts`).
- **Nakładki ku arenie** (`NestDressing.decals`): Ruiny — plamy (`decal.stain`), Cmentarzysko — stosy kości, Piekło — żarzące się szczeliny; gęstsze ku arenie, nie w samej arenie.
- **Ruiny dostały gniazdo** (tylko ślady i plamy; bez pajęczyn i lica), Cmentarzysko i Piekło — ślady i nakładki w dodatku do lica z kroku 53.
- **Odcień światła** (`effects/BossHerald.ts`, `config/bossHeraldConfig.ts`): ledwo widoczna poświata (ADD, alfa ≤ 0,07) rosnąca ku arenie — ciepła w ruinach, zielona w leżu, fioletowa w Grzybni, blada na Cmentarzysku, czerwona w Piekle.
- **Drżenie ekranu:** powyżej siły 0,35 co 4,2 s (daleko) → 1,7 s (blisko), 420 ms, intensywność ≤ 0,0011 (`HERALD_RUMBLE`; uszczelnienie krat to 0,004).
- **Iskry z posadzki** (tylko Piekło): cząstki w kolorach żaru, gęstsze ku arenie.
- Zapowiedź milknie w samej arenie, w trakcie walki i po niej. Siła zapowiedzi = czysta `systems/BossHerald.roomProximity` (linia prosta od krawędzi areny, liniowy spadek do zasięgu 16–20 kafli wg biomu).
- Same efekty wizualne, bez wpływu na rozgrywkę. Liczby do strojenia: `TRAIL`, `NestDressing`, `BOSS_HERALD`, `HERALD_RUMBLE`.

**Nie zrobione (za mało pewne bez oceny właściciela):** stosy kości i ślady pazurów jako osobna grafika (są tylko stosy kości), smugi szlamu w Ruinach jako osobny rodzaj (ślad ma kolor krwi/płynu biomu).

**Testy:** `systems/bossHerald.test.ts` (siła, odstępy drżeń, konfiguracja); `FloorDressing.test.ts` (ślady tylko na podłodze, nie w arenie ani przy spawnie, kończą się blisko areny; kości gęstnieją ku arenie; konfiguracja gniazd).

**Weryfikacja w przeglądarce (`?hero=sorceress&seed=7`):** piętro 4 — smuga krwi w korytarzu prowadzącym do areny Pożeracza; piętro 1 — plamy i ślady ku arenie; piętro 5 — czerwona poświata i iskra; bez błędów w konsoli (poza 404 pliku pomocniczego). Build: 1107 testów.

## Krok 55 — Dziennik błędów i niespotykanych zdarzeń `#decyzja` `#diagnostyka`

**Powód** `#ocena`: właściciel i tester („Mycha”) zgłaszają, że gra czasem „wyrzuca” w trakcie rozgrywki (druga rozgrywka). Nie udało się tego odtworzyć (testy botem: wspinaczki do piętra 9, wszystkie przedmioty, śmierć i restarty, 60 restartów sceny, build produkcyjny — bez błędów), a gra nie miała żadnej obsługi błędów: wyjątek w pętli gry zatrzymuje Phasera na stałe (`RequestAnimationFrame` planuje następną klatkę dopiero po udanej obsłudze bieżącej), więc obraz zamiera bez śladu.

**Co powstało** (`systems/Diagnostics.ts` czyste, `config/diagnosticsConfig.ts`, `persistence/DiagnosticStorage.ts`, `diagnostics/*`):
- **Błędy:** `window.onerror`, odrzucone obietnice i wyjątki w pętli gry (`game.step` owinięte w try/catch — gra gra dalej, błąd trafia do dziennika zamiast zamrażać grę); deduplikacja (ten sam błąd liczy się jako ×N, po 4 wpisach nie spamuje).
- **Niespotykane zdarzenia:** zacięcia klatek (≥ 600 ms) i długie mulenie (średni FPS < 20 przez 5 s), utrata/przywrócenie kontekstu WebGL, ukrycie karty, wysoka sterta (≥ 700 MB), „niemożliwy” stan gracza (NaN, poza mapą, HP poza zakresem — kontrola co sekundę).
- **Okruchy z gry:** nowe piętro (seed, bohater, biom), kraty areny, start/koniec walki z bossem, nagroda, ofiara w kapliczce, schody, śmierć.
- **Puls co 5 s** ze stanem gry (piętro, seed, bohater, HP, złoto, kafel, walka z bossem…), FPS i stertą. Sesja bez zgłoszonego zamknięcia (`pagehide`) jest oznaczana jako **urwana** — przy następnym uruchomieniu dziennik zapisuje „poprzednia sesja urwała się” razem z ostatnim stanem. To jedyny ślad po twardym wyrzuceniu karty (zabicie przez przeglądarkę, awaria).
- **Raport:** ostatnie 3 sesje w `localStorage` (limit ~120 kB, najstarsze zdarzenia wypadają). Klawisz **F9** otwiera pole z raportem do skopiowania; po pierwszym błędzie pokazuje się dyskretna nakładka „Wystąpił błąd w grze — raport zapisano” z przyciskami Kopiuj / Pokaż / Zamknij. Tester wkleja raport autorowi.
- Dziennik nigdy nie rzuca wyjątków (zepsuty magazyn, zepsuty dostawca stanu są połykane).

**Testy:** `tests/systems/diagnostics.test.ts` (opis błędów, ring i deduplikacja, sesja urwana, limit rozmiaru, uszkodzony zapis, monitor klatek, kontrola stanu, raport, hub z fałszywym magazynem). **Weryfikacja w przeglądarce:** celowo rzucony wyjątek w każdej klatce — pętla żyje dalej (153 klatki w 2,5 s), nakładka błędu się pokazuje, dziennik ma `error:loop ×332` i puls ze stanem, F9 otwiera raport. Build: 1121 testów.

## Krok 56 — Diagnostyka, część 2: nagrywanie wejść, wykrywacze zawieszeń, smoke test, błędy ładowania `#decyzja` `#diagnostyka`

**Decyzja właściciela** `#decyzja`: z propozycji po kroku 55 wybrane punkty 2, 3, 8 i 5; reszta (wysyłka raportów do workera, czasy systemów, telemetria balansu, zrzut obrazu) na później.

- **Nagrywanie wejść (2):** `systems/InputRecorder.ts` zapisuje od początku piętra tylko zmiany wejścia (ruch, atak, strzał, jednorazowe dash/E, celowanie co 24 px) w zwartym tekście; do 2500 wpisów na piętro (potem najstarsze wypadają, nagranie jest „przycięte” i nie do odtworzenia). Meta: seed, piętro, bohater, złoto, przedmioty i HP na starcie piętra. Zapis ostatnich 3 pięter w `localStorage` (`persistence/InputRecordingStorage.ts`, klucz `tower-crawler.inputs.v1`) przy pulsie, błędzie i zamknięciu. F9: przycisk „Kopiuj nagranie”, w raporcie lista nagrań. **Odtwarzanie (tylko tryb dev):** `__replay(nagranie)` w konsoli restartuje piętro z tym samym seedem i stanem runu i podaje zapisane wejścia zamiast klawiatury (`InputReplay`, `devTools.ts`). Odtworzenie jest **przybliżone** — seed i układ piętra te same, ale czas klatek i zachowanie wrogów mogą się różnić (w teście ruch wyszedł inny, bo nagranie zostało zablokowane przez wroga).
- **Wykrywacze (3):** `systems/AnomalyDetectors.ts` — gracz trzyma klawisze ruchu 4 s i stoi w miejscu (`player-stuck`, poza paraliżem, dashem i śmiercią), HP bossa stoi 90 s (`boss-stalled`), przekroczone limity (obiekty sceny > 3000, żywi wrogowie > 60), schody odblokowane, ale nieosiągalne (`stairs-unreachable`) i **spójność piętra na starcie** (pokój albo schody nieosiągalne ze spawnu → `floor-disconnected`, BFS). Próbkowanie co 500 ms, odstępy między zgłoszeniami; wszystko do dziennika z kroku 55.
- **Test dymny (8):** `npm run smoke` (`tools/smoke.mjs`) — sam startuje serwer dev (port 5199) i bot w prawdziwej przeglądarce przechodzi obiema postaciami piętra: faza 1 wchodzi na każde piętro × seed, faza 2 to pełna wspinaczka (wszystkie pokoje, arena, boss, nagroda, schody klawiszem E). Szuka wyjątków strony, błędów konsoli i zdarzeń `error` z dziennika gry; kod wyjścia 1 przy błędach. Opcje: `--floors 8 --seeds 2 --heroes both|barbarian|sorceress --room-seconds 1.5 --sweep-only`; przeglądarka: zainstalowany Chrome albo `SMOKE_CHROMIUM=<ścieżka>`. Nowa zależność dev: `playwright-core` (bez pobierania przeglądarek). Uruchamiać przed wdrożeniem na Pages.
- **Błędy ładowania zasobów (5):** `BootScene` zapisuje `asset-load-error` (klucz, typ, URL) do dziennika.

**Testy:** `inputRecorder.test.ts` (zapis zmian, limit/przycięcie, odtwarzanie w czasie, jednorazowe dash/E, uszkodzone nagranie, zapis nagrań, hub), `anomalyDetectors.test.ts` (utknięcie, boss, limity, osiągalność, spójność — także na wygenerowanych piętrach 1–12). **Weryfikacja:** w przeglądarce nagranie i `__replay` działają, przytrzymanie ruchu w ścianę daje `player-stuck`; `npm run smoke` (Czarodziejka, piętra 1–4) — OK. Build: 1138 testów.

## Krok 57 — Endpoint zgłoszeń diagnostycznych w workerze `#decyzja` `#diagnostyka`

**Decyzja właściciela** `#decyzja`: osobny endpoint z limitami, przygotowany na późniejsze, bardziej złożone raportowanie błędów; logika i proces opisane w DEVLOG. Pytanie o koszty: przy skali testerów wysyłka mieści się z dużym zapasem w darmowym planie Cloudflare (orientacyjnie: raport to jedno żądanie i jeden zapis w D1; limity niżej chronią przed zalewem). **Limity planu darmowego do potwierdzenia w dokumentacji Cloudflare — podane z pamięci.**

### Logika i proces

**1. Koperta zgłoszenia (kontrakt gry ↔ worker, wersja 1)** — `systems/ReportEnvelope.ts` (gra), `worker/src/reports.js` (worker):
`{ v, kind, app{build}, client{id, sessionId}, summary{errors, warnings, floor, hero, seed, abnormalPrev}, text, attachments[] }`.
- `kind`: `diagnostic` (ręczne z F9), `crash` i `feedback` (zarezerwowane na kolejne kroki).
- `summary` trafia do osobnych kolumn D1 — po nich filtruje się listę (piętro, bohater, seed, liczba błędów, „poprzednia sesja urwana”) bez parsowania tekstu.
- `text` to raport z F9; `attachments` — dziś nagranie wejść (`input-recording`), docelowo np. zrzut obrazu, czasy systemów.
- `client.id`: anonimowy losowy identyfikator przeglądarki (`persistence/ClientId.ts`, localStorage) — składa zgłoszenia jednego testera w całość i służy deduplikacji; to nie dane osobowe. IP worker zapisuje wyłącznie jako skrót SHA-256 (do limitów).
- **Rozszerzalność:** nieznane pola są ignorowane (zgodność w przód); nowy rodzaj zgłoszenia = wpis w `REPORT_LIMITS.kinds` + deploy; nowa wersja koperty = podbicie `v` i obsługa obu wersji w `validateReport`; nowy typ załącznika = wpis w `attachmentTypes`.

**2. Droga zgłoszenia:**
1. Tester w F9 klika „Wyślij autorowi” (z opcją dołączenia nagrania wejść; panel opisuje, co jest wysyłane). `DiagnosticsHub.sendReport` → limity w grze (`SendThrottle`: minuta odstępu, 3 na sesję) → `buildEnvelope` (podsumowanie z bieżącej sesji, tekst przycięty do 80 000 znaków z zachowaniem początku i końca, nagranie dołączone w całości albo wcale) → `ReportSink` (`persistence/remoteReports.ts`, adapter workera, `POST <VITE_SCORES_URL>/reports`, limit czasu 15 s, bez wyjątków).
2. Worker (`index.js` → `processReport`): origin z `ALLOWED_ORIGINS` (403) → rozmiar po nagłówku i po wczytaniu (413) → JSON (400) → **walidacja koperty** (400 z `reason`) → **deduplikacja** (200 `duplicate`, bez zapisu i bez zużycia limitu) → **limity** (429 + `Retry-After`; 503 przy globalnym bezpieczniku) → zapis w D1 (`201 {id}`).
3. Autor odczytuje przez `GET /reports…` z `Authorization: Bearer <REPORTS_TOKEN>` (bez sekretu trasy zwracają 404); `DELETE /reports/:id` usuwa. Nagranie z załącznika wkleja do `__replay` w trybie dev (krok 56).
4. Retencja: cron codziennie 03:17 UTC kasuje zgłoszenia starsze niż 30 dni (plus sprzątanie co ok. 50. zapis).

**3. Limity** (`REPORT_LIMITS`): całość ≤ 262 144 znaków, tekst ≤ 80 000, ≤ 2 załączniki po ≤ 150 000; 5/godz. i 20/dobę z adresu; 1000/dobę globalnie; dedup 24 h; retencja 30 dni. Limity gry (rozmiary, wersja koperty) nie mogą przekraczać limitów workera — pilnuje tego test kontraktu.

**4. Co przygotowane na później (nie zrobione):** automatyczna wysyłka przy błędzie krytycznym (`kind: 'crash'` z limitem 1 na sesję i zgodą testera), formularz „opisz, co się stało” (`feedback`), załączniki z krokiem 56+ (zrzut obrazu, czasy systemów, telemetria balansu), panel administratora zamiast `curl`, powiadomienie o nowych zgłoszeniach.

**5. Wdrożenie (wykonane w kroku 58, patrz niżej; pierwotnie czekało na właściciela):** `cd worker`; `npx wrangler d1 execute tower-crawler-scores --remote --file=schema.sql`; `npx wrangler secret put REPORTS_TOKEN`; `npx wrangler deploy`; potem `npm run smoke` i `npm run deploy:pages`. Szczegóły i przykłady `curl` w `worker/README.md`.

**Testy:** `tests/worker/reports.test.ts` (walidacja koperty, limity i `processReport` na atrapie repozytorium, deduplikacja, globalny bezpiecznik, kontrakt gra ↔ worker), `tests/worker/index.test.ts` (routing, CORS, 403/400/413/429, odczyt tylko z tokenem, usuwanie, cron — na atrapie D1), `tests/persistence/remoteReports.test.ts` (adapter, błędy sieci, koperta, throttling, identyfikator klienta). **Weryfikacja w przeglądarce** (z lokalnym atrapą workera): w F9 pojawia się „Wyślij autorowi”, wysyłka z nagraniem kończy się „Wysłano”, druga w ciągu minuty — „Za często”. Build: 1180 testów.

## Krok 58 — Wdrożenie workera zgłoszeń, automatyczna wysyłka przy awarii, publikacja `#decyzja` `#diagnostyka`

**Decyzja właściciela** `#decyzja`: wykonać wszystko, co w kroku 57 było „po stronie właściciela”, przygotować wysyłkę przy błędzie krytycznym, wgrać całość do głównej wersji i uzupełnić DEVLOG.

### Wdrożenie workera (Cloudflare, konto właściciela, 2026-10-16)
- Migracja bazy: `wrangler d1 execute tower-crawler-scores --remote --file=schema.sql` — dopisała tabelę `reports` i 4 indeksy (tabela `scores` bez zmian, istniejące wyniki nietknięte).
- Sekret `REPORTS_TOKEN` ustawiony przez `wrangler secret put` (losowe 48 znaków hex). **Wartość nie jest w repozytorium ani w DEVLOG** — została przekazana właścicielowi w rozmowie; do odczytu zgłoszeń potrzebny jest nagłówek `X-Reports-Token: <token>` (albo `Authorization: Bearer <token>`).
- `wrangler deploy`: worker `tower-crawler-scores` (https://tower-crawler-scores.wvytz.workers.dev) + cron czyszczący `17 3 * * *`.
- **Odkrycie podczas weryfikacji:** pośrednik w środowisku, w którym pracował Claude, dopisuje własny nagłówek `Authorization` do żądań na `*.workers.dev`, przez co `Bearer` nie działał. Dodano nagłówek **`X-Reports-Token`** z pierwszeństwem przed `Authorization` (worker, README, test) — przydatny też przy innych pośrednikach.
- Weryfikacja na żywym workerze: `GET /scores` działa jak dawniej; `GET /reports` bez tokena i z błędnym — 404; `POST /reports` bez `Origin` — 403, z `Origin` gry — 201; ponowienie tej samej treści — 200 `duplicate` bez zapisu; lista i pełny wpis z tokenem; usunięcie testowego zgłoszenia (`DELETE`), baza po teście bez zgłoszeń.

### Automatyczne zgłoszenie przy awarii (`kind: 'crash'`)
- **Krytyczne zdarzenia** (`systems/AutoReport.isCriticalEvent`): błędy `error:*` (okno, obietnice, pętla gry), utrata kontekstu WebGL i **urwana poprzednia sesja** („wyrzuciło mnie z gry” — wykrywane przy następnym starcie).
- **Zgoda gracza** (`persistence/AutoReportConsent`, localStorage): bez zgody nic nie jest wysyłane. Przy pierwszej awarii (jeśli worker jest skonfigurowany) gra raz pyta: *Tak, wysyłaj* / *Tylko ten raz* / *Nie* — treść pytania mówi wprost, co jest wysyłane (przeglądarka, ekran, zdarzenia i stan gry, nagranie ruchów i kliknięć z ostatniego piętra; bez imienia i IP). Zgodę zmienia się w F9 (pole „wysyłaj raporty o awariach automatycznie”).
- **Polityka** (`AutoReportPolicy`): po pierwszym krytycznym zdarzeniu 4 s zbierania kolejnych (raport pełniejszy), potem wysyłka; **najwyżej 1 automatyczne zgłoszenie na sesję**; bez decyzji pytanie raz na sesję. Do tego limity workera (5/godz., 20/dobę z IP, deduplikacja treści, globalny bezpiecznik) — awaria w pętli nie zaleje workera ani darmowego planu.
- Wysyłka automatyczna nie jest blokowana minutowym odstępem ręcznych wysyłek (`sendReport(kind, withRecording, automatic)`); po sukcesie krótka nakładka „Raport o awarii wysłano autorowi”.
- **Znane ograniczenie:** dwie karty z grą naraz dzielą jeden dziennik w localStorage — druga może uznać pierwszą za „urwaną” i zgłosić fałszywą awarię (przy zgodzie: jedno zbędne zgłoszenie, które dedup/limity ograniczają). Do rozważenia przy kolejnym kroku diagnostyki (identyfikator karty w kluczu).

### Publikacja
- Zmiany z gałęzi roboczej wprowadzone do `main` (fast-forward) i wdrożone na GitHub Pages (`npm run deploy:pages`, commit z adresem noreply właściciela); przed wdrożeniem `npm run build` i `npm run smoke` (Czarodziejka i barbarzyńca, piętra 1–4) — bez błędów.

**Testy:** `tests/systems/autoReport.test.ts` (krytyczne zdarzenia, polityka: zgoda/brak/pytanie/limit/zaległe zgłoszenie, magazyn zgody, hub: automatyczne omija ręczny odstęp, wykrycie urwanej sesji), rozszerzone `tests/worker/index.test.ts` (nagłówek `X-Reports-Token`). **Weryfikacja w przeglądarce** (lokalna atrapa workera): awaria bez zgody → pytanie → „Tak” → `crash` z załączonym nagraniem trafia do workera, zgoda zapisana; po urwanej sesji z zgodą „tak” raport wysyłany automatycznie bez pytania. Build: 1189 testów; smoke OK.
## Krok 59 — Ekran startowy: nazwa TOP DOWN i epickie otwarcie

**Decyzja właściciela:** `#decyzja` `#ekran-startowy`
- na ekranie startowym ma być oryginalna nazwa gry: **TOP DOWN** (zamiast „Tower Crawler”);
- klimat zostaje, ale otwarcie ma być „jeszcze bardziej doniosłe, bardziej epickie”.

**Sekwencja (ok. 3,9 s, dalej do pominięcia klawiszem lub klikiem):**
- 0,15 s i 0,33 s: dwa błyski pioruna w ciemności — na moment odsłaniają sylwetkę wieży, potem znowu czerń;
- 0,5 s: ruiny wychodzą z mroku;
- 0,7 s: uderza **TOP** (skala 3 → 1 z odbiciem), lżejszy błysk i wstrząs;
- 1,05 s: uderza **DOWN** — mocniejszy błysk i dwa razy silniejszy wstrząs; od tej chwili pełna poświata;
- po ostatnim uderzeniu zza ruin wychodzą wolno obracające się promienie ciepłego światła (sylwetki ruin je zasłaniają, więc światło bije zza wieży);
- 1,5 s: po literach przechodzi ukośny połysk (kość i blask ognia), jak po rozgrzanym metalu;
- litery głębiej wytłoczone (6 stopni), pod napisem ozdobnik z rombami ognia, więcej iskier (20);
- 1,7 s: oczy w ruinach, 2,0 s: „— PIĘTRO 1 · RUINY WIEŻY —”, 3,4 s: wygaszenie i start piętra 1.

**Kod:**
- `core/pixelArt.ts`: litery D i N;
- `config/splashConfig.ts`: `SPLASH_TITLE_WORDS`, nowa oś czasu (pioruny, uderzenia słów z własnym błyskiem i wstrząsem, promienie, połysk), układ;
- `systems/splashTimeline.ts`: `splashFrame` zwraca stan pioruna, każdego słowa, promieni i połysku; `splashImpacts` zamiast jednego uderzenia;
- `scenes/SplashScene.ts`: słowa w osobnych kontenerach, warstwa połysku, tekstura promieni (mieszanie ADD), piorun.

**Testy:** `splashTimeline.test.ts` przepisany (14): nazwa składa się z fontu, piorun odsłania tło, kolejność i odbicie słów, mocniejsze ostatnie uderzenie, poświata i promienie, połysk, oczy, podtytuł, zapas przed wygaszeniem, przejście do gry.

**Weryfikacja:** `npm run build` (892 testy); przeglądarka — zrzuty uderzenia DOWN, promieni z połyskiem i stanu końcowego, potem aktywne `GameScene`, brak błędów w konsoli.

---

## Krok 60 — Ekran startowy: TOP / DOWN i samotna wieża końca

**Ocena i decyzja właściciela:** `#ocena` `#decyzja` `#ekran-startowy`
- wersja z kroku 59 (jedna linia, promienie, połysk) „zupełnie się nie podoba”;
- napis w **dwóch liniach**: TOP i DOWN;
- motyw **jednej wieży**, obok **mrok i destrukcja**;
- „nasza gra jest metaforą końca — być może świata, być może życia”.

**Kompozycja (960×540):**
- **TOP** nad szczytem wieży, **DOWN** u jej podstawy — wieża stoi między nimi, od góry do dołu;
- samotna wieża na środku: wyszczerbiony szczyt, wyrwa w prawym boku, pęknięcie przez mur, jedno ostatnie okno ze światłem, brama z oczami w środku;
- za szczytem **zaćmione słońce**: czarna tarcza z dogasającą koroną (egg-2, egg-0, eye-0) i ciemnoczerwoną poświatą;
- po bokach mrok i zniszczenie: kikuty kolumn, przechylone resztki murów, złamane łuki, odłamy muru na ziemi, odległe pożary migoczące na horyzoncie;
- z nieba **opada popiół** (zamiast unoszących się iskier) — ruch w dół jak w nazwie;
- litery z popiołu i kości (bone-2 → bone-0) z żarzącą się krawędzią egg-0 i głębokim wytłoczeniem w czerń.

**Sekwencja (ok. 4,3 s, dalej do pominięcia klawiszem lub klikiem):**
- 0,2 s: korona zaćmienia powoli się rozżarza; 0,3–1,2 s: wieża wyłania się z ciemności;
- 0,9 s: uderza **TOP** — lekki błysk, wstrząs, od wyrwy odpadają kamienie;
- 1,5 s: uderza **DOWN** — cięższy błysk i wstrząs, pył z ziemi, więcej kamieni, pęknięcia w ziemi zaczynają się żarzyć; potem wieża dalej się sypie (pojedyncze kamienie);
- 2,0 s: oczy w mroku (brama wieży, ciemność po bokach);
- 3,7 s: wygaszenie i start piętra 1.

**Usunięte z kroków 34/59:** pioruny, promienie, połysk, podtytuł, pająk na nitce, nietoperz, pajęczyny.

**Kod:**
- `core/pixelArt.ts`: `pixelDisc`, `pixelRing` (tarcza i korona zaćmienia);
- `config/splashConfig.ts`: przepisany — `SPLASH_TITLE_LINES`, wieża, zniszczenie, pęknięcia, pożary, popiół, odłamki, nowa oś czasu;
- `systems/splashTimeline.ts`: `splashFrame` (wyłanianie, korona, linie napisu, błysk, żar pęknięć, oczy);
- `scenes/SplashScene.ts`: przepisana; odłamki i pył korzystają ze `stepParticle` z kroku 35.

**Testy:** `splashTimeline.test.ts` (14): dwie linie i ich miejsce na ekranie, wyłanianie, korona przed napisem, kolejność i odbicie, cięższe DOWN, żar pęknięć, oczy, zapas przed wygaszeniem, przejście do gry; `pixelArt.test.ts`: koło i pierścień.

**Weryfikacja:** `npm run build`; przeglądarka — zrzuty uderzenia DOWN (odpadające kamienie) i stanu końcowego, potem aktywne `GameScene`, brak błędów w konsoli.

**Ocena właściciela po wdrożeniu:** `#ocena` `#ekran-startowy` „tak jest znacznie lepiej!!!” — motyw TOP / DOWN z samotną wieżą zaakceptowany; to kierunek dla kolejnych ekranów (mrok, koniec, popiół zamiast „arcade’owego” blasku).

---

## Krok 61 — Ekran śmierci w tonie TOP / DOWN: popiół zamiast krwi

**Decyzja właściciela:** `#decyzja` `#highscore` `#ekran-smierci`
- po akceptacji ekranu startowego (krok 60): „przerób w podobnym tonie ekran końcowy” i od razu wdróż.

**Co się zmieniło względem kroku 35:**
- POLEGŁEŚ ma lico z popiołu i kości jak TOP / DOWN (te same pasy kolorów) i żarzącą się krawędź egg-0;
- **rozkład to wypalanie, nie gnicie:** kawałek litery rozżarza się na 0,6 s (egg-0), potem odpada jako popiół; w ubytkach prześwituje czerń z żarem;
- zamiast kropli krwi z dolnych krawędzi liter **sypią się strużki popiołu** (wolniej spadają);
- uderzenie napisu wzbija **chmurę pyłu** zamiast krwi; błysk w kolorze kości (słabszy, 0,3);
- nad całą sceną **opada popiół** — jak na ekranie startowym;
- winieta czarna zamiast krwistej;
- w ozdobniku między wynikiem a tablicą **małe zaćmione słońce** (znak z ekranu startowego) zamiast czerwonych rombów;
- tablica: wiersz bieżącego runu w kolorze żaru (egg-2), reszta w kości.

**Bez zmian:** przyciemniona gra pod spodem (wrogowie dalej się ruszają), kolejność wejścia wyniku i wierszy, plan rozkładu (`planCrumble`, limit 30%), R — nowa wspinaczka.

**Kod:** `config/deathScreenConfig.ts` (paleta z ekranu startowego, `DEATH_EMBER_COLOR`, `DEATH_ASH_COLORS`, popiół, ozdobnik), `effects/DeathScreen.ts` (kolory, grawitacja cząstek per rodzaj, popiół nad sceną, zaćmienie w ozdobniku). Czysta logika i testy z kroku 35 bez zmian.

**Weryfikacja:** `npm run build`; przeglądarka (śmierć wymuszona przez `window.__game`) — zrzuty po 0,5 / 2,2 / 7 s: napis się wypala i osypuje, popiół opada, tablica czytelna; R startuje nowy run; brak błędów w konsoli. Wdrożone na GitHub Pages.

---

## Krok 62 — Ekran śmierci: napis ociekający krwią na plamie

**Ocena i decyzja właściciela:** `#ocena` `#decyzja` `#highscore` `#ekran-smierci`
- rozpadające się słowo (kroki 35 i 38) „nie podoba się zupełnie”; wersja na czerwonym tle „jakoś wyglądała”;
- napis ma raczej **ociekać krwią**, dookoła **plama**, całość **bardziej przyciemniona**.

**Co widać:**
- gra pod spodem przyciemniona do 80% (było 62%), krawędzie w winiecie zakrzepłej krwi; wrogowie dalej się ruszają, ale ledwo prześwitują;
- 0,25 s: **POLEGŁEŚ** uderza (skala 2,2 → 1), czerwony błysk, wstrząs, chmura kropel;
- w tej samej chwili za napisem **rozpryskuje się plama krwi**: zwarty eliptyczny rdzeń, nieregularny brzeg, oderwane krople i smugi rozbryzgu; brzeg ciemniejszy (blood-0), wnętrze blood-1 z połyskiem świeżej krwi;
- litery czerwone (od eye-2 do ciemnej krwi), z obrysem i wytłoczeniem w zakrzepłą krew — napis zostaje cały, **nie rozpada się**;
- **krew spływa z liter:** 13 strug z dolnych krawędzi, każda zaczyna w innej chwili (0,5–1,7 s), rośnie 1,5–4,5 s do 18–84 px i zwalnia; na czubku kropla; z pełnej strugi co 1,3–3,2 s odrywa się kropla i spada;
- wynik, czerwony ozdobnik, „NAJLEPSZE WSPINACZKI” i wiersze tablicy jak wcześniej, niżej (pod strugami); „R — NOWA WSPINACZKA” miga.

**Usunięte:** rozkład napisu (wypalanie, `planCrumble`, `splitIntoBlocks`), popiół, zaćmienie w ozdobniku.

**Kod:**
- `config/deathScreenConfig.ts`: paleta krwi (`blood0–2`), `DEATH_DRIPS`, `DEATH_SPLAT`, przyciemnienie 0,8, układ niżej;
- `systems/deathScreen.ts`: `deathFrame` (+ `splatScale`), `planDrips` (strugi: start, czas, długość, okres kropel), `dripLength`, `dropsReleased`, `planSplat` (plama w komórkach z tonem brzeg/wnętrze/połysk);
- `effects/DeathScreen.ts`: plama rysowana raz do tekstury, strugi w kontenerze napisu (skalują się z nim), krople.

**Testy (`deathScreen.test.ts`, 15):** litery; przyciemnienie 0,75–0,9; uderzenie i błysk; rozprysk plamy; kolejność tablicy; strugi deterministyczne, z dolnych krawędzi, w granicach configu, rosną i stają, krople dopiero z pełnej strugi; plama deterministyczna, szersza niż napis i w ekranie, brzeg = komórki z pustym sąsiadem, rozbryzg wokół; grawitacja.

**Weryfikacja:** `npm run build` (898 testów); przeglądarka (śmierć przez `window.__game`) — zrzuty po 0,6 / 2,5 / 7 s; R startuje nowy run; brak błędów w konsoli. Wdrożone na GitHub Pages.

---

## Krok 63 — Ekran śmierci w stylu Dark Souls / Castlevanii

**Ocena i decyzja właściciela:** `#ocena` `#decyzja` `#highscore` `#ekran-smierci`
- krew z kroku 62 „wygląda sztucznie”; ma być „mniej banalnie, a bardziej mrocznie — w stylu Castlevanii lub Dark Souls”.

**Kierunek:** cisza i ciężar zamiast efektów. Żadnej krwi, plamy, uderzenia, wstrząsu ani cząstek.

**Co widać (wszystko powoli, płynnie):**
- 0–1,5 s: gra **tonie w ciemności** do 85% (wrogowie dalej ruszają się pod spodem, ledwo widoczni), czarna winieta;
- 0,3–1,5 s: przez środek ekranu **czarny pas** na całą szerokość, rozmyty u góry i u dołu (jak „YOU DIED”);
- 0,6–2,2 s: **POLEGŁEŚ wyłania się** — przygaszona czerwień (eye-0 → ciemna krew), cienki czarny obrys, płytki cień, szeroko rozstawione litery; za nim ledwo widoczna ciemnoczerwona poświata;
- przez 5 s napis **bardzo wolno rośnie** (skala 1 → 1,1) i staje;
- 2,6 s: wynik w kolorze kości; gotycki ozdobnik — cienkie linie i mały krzyż; 3,0 s: wiersze tablicy wyłaniają się po kolei;
- 3,8 s: „R — NOWA WSPINACZKA” wolno pulsuje.

**Usunięte:** plama, strugi i krople krwi, uderzenie napisu, błysk, wstrząs (`planDrips`, `planSplat`, `dripLength`, `dropsReleased`).

**Kod:**
- `config/deathScreenConfig.ts`: nowa oś czasu (bez uderzeń), układ, pasy czerwieni;
- `systems/deathScreen.ts`: `deathFrame(t, rows)` — przyciemnienie, pas, napis (pojawianie i wzrost), wynik, wiersze po kolei, puls komunikatu; `stepParticle` zostaje (używa go ekran startowy);
- `effects/DeathScreen.ts`: przepisany — pas i poświata jako tekstury z gradientem, napis bez wytłoczenia, ozdobnik z krzyżem.

**Testy (`deathScreen.test.ts`, 8):** napis mieści się po urośnięciu; płynne przyciemnienie bez skoków, gra nie znika; napis wyłania się powoli (≥ 1 s); wzrost monotoniczny i staje; pas przed napisem; tablica po napisie, wiersze po kolei; puls komunikatu.

**Weryfikacja:** `npm run build`; przeglądarka (śmierć przez `window.__game`) — zrzuty po 1,5 / 3 / 7 s, brak błędów w konsoli. Wdrożone na GitHub Pages.

---

## Krok 64 — Ekran śmierci: czerwień spływająca przez litery

**Prośba właściciela:** `#decyzja` `#highscore` `#ekran-smierci`
- do ekranu z kroku 63: „animowany efekt w stylu spływającego w dół gradientu czerwieni wypełnienia liter”.

**Co widać:**
- lico liter POLEGŁEŚ to pasy czerwieni (od jasnej eye-1 przez eye-0 i blood-2 do zakrzepłej blood-1 i z powrotem), które **powoli i bez końca spływają w dół** (18 px/s) — jak krew przepływająca przez litery;
- rampa jest cykliczna, więc pętla nie ma szwu (cykl 64 px ≈ wysokość litery, ok. 3,6 s);
- kolor zmienia się skokowo, paskami po 2 px — pixel art bez rozmycia;
- obrys i cień liter zostają nieruchome; reszta ekranu bez zmian (pojawianie się, wolny wzrost, pas, tablica).

**Kod:**
- `config/deathScreenConfig.ts`: `DEATH_TITLE_FLOW` (rampa, wysokość tonu, pasek, prędkość) zamiast stałych pasów;
- `systems/deathScreen.ts`: `titleFlowIndex(y, t)` — ton rampy dla paska na wysokości `y` w chwili `t`;
- `effects/DeathScreen.ts`: lico przerysowywane co klatkę paskami po 2 px; obrys i cień w osobnej, statycznej grafice.

**Testy (+4):** indeks zawsze w rampie (także dla ujemnych przesunięć); wzór przesuwa się w dół; pętla bez szwu w przestrzeni i w czasie; w literze widać kilka tonów naraz.

**Weryfikacja:** `npm run build`; przeglądarka — dwa zrzuty w odstępie 1 s pokazują jasny pas przesunięty w dół; brak błędów w konsoli. Wdrożone na GitHub Pages.

---

## Krok 65 — Ekran śmierci: spływanie osobno dla grup liter

**Ocena i prośba właściciela:** `#ocena` `#ekran-smierci`
- spływająca czerwień z kroku 64: „o coś takiego mi chodziło”;
- prośba o podgląd: spływanie rozdzielone dla grup 2–3 liter, „by bardziej zaimitować tempo spływania w różnych miejscach”.

**Wariant:**
- POLEGŁEŚ w trzech grupach: **PO** (13 px/s), **LEG** (24 px/s), **ŁEŚ** (17 px/s), każda z innym przesunięciem startowym (0 / 27 / 46 px) — fale krwi nie idą równo przez napis;
- grupy, tempa i przesunięcia w `DEATH_TITLE_FLOW.groups` (`config/deathScreenConfig.ts`).

**Kod:** `DeathFlowGroup`, `flowGroupOf(letter)` i parametry tempa/przesunięcia w `titleFlowIndex` (`systems/deathScreen.ts`); `DeathScreen.drawTitleFill` wybiera grupę po indeksie litery.

**Testy (+3):** grupy pokrywają napis po 2–3 litery; litery trafiają do właściwych grup; grupy mają różne tempo i po chwili inny wzór.

**Weryfikacja:** `npm run build`; animacja nagrana z gry (czas ekranu ustawiany klatka po klatce co 70 ms) — GIF na kanwie projektu.

**Status:** właściciel zaakceptował wariant („wdrażaj na pages”) `#decyzja` — wdrożony na GitHub Pages.

---

## Krok 66 — Ekran śmierci: szerszy czarny pas

**Prośba właściciela:** `#decyzja` `#highscore` `#ekran-smierci`
- przyciemniony pas za napisem rozszerzyć w górę **tuż do dolnego końca HUD-u** i **o połowę w stronę tablicy rekordów**.

**Zmiana:**
- pełna czerń zaczyna się na y = 128 (koniec listy przedmiotów w HUD), nad nią tylko 12 px rozmycia;
- dół pasa 271 → 346 px (o połowę dawnej wysokości 150 px), z 46 px rozmycia — pas obejmuje teraz także wynik i ozdobnik;
- napis i tablica bez zmian.

**Kod:** `DEATH_LAYOUT.band` = `top`, `bottom`, `fadeTopPx`, `fadeBottomPx` zamiast środka i wysokości; tekstura pasa z osobnym rozmyciem góry i dołu.

**Testy (+2):** pełna czerń od dołu HUD-u i obejmuje napis po urośnięciu; dół pasa 346 px, poniżej wyniku.

**Weryfikacja:** `npm run build`; zrzut z przeglądarki po 7 s. Wdrożone na GitHub Pages.

**Uwaga:** gdy lista przedmiotów w HUD zawinie się do drugiej linii (wiele przedmiotów), jej dół zejdzie pod 128 px i wejdzie w rozmycie pasa — rozwiązane w kroku 67 (ikony w jednym rzędzie, pas od y = 147 po scaleniu).

---

## Krok 67 — HUD: przedmioty jako ikony

**Decyzja właściciela:** `#decyzja` `#hud`
- z dwóch makiet na kanwie (A: ikony pod złotem, B: pasek na dole) wybrany **wariant A**;
- przy zdobyciu przedmiotu pokazywać jego **nazwę i efekt mniejszą złotą czcionką**; od razu wdrożyć.

**Co widać:**
- zamiast tekstowej listy przedmiotów — rząd slotów 28 px pod złotem (y = 114–142): ikona z atlasu łupów (16 px, 1:1), ramka **kości** dla przedmiotów bazowych i **złota** dla rzadszych z efektem broni, licznik kopii ×2, ×3 w rogu;
- slot na każdy rodzaj przedmiotu (najwyżej 12, kolejność zdobywania);
- po zdobyciu przedmiotu (podniesienie, kapliczka, nagroda za bossa) pod ikonami przez 3 s: „Nazwa — efekt” (12 px, złoto #f5c542), wygasa w ostatnich 0,8 s;
- duży komunikat na środku ekranu zostaje dla innych zdarzeń (modyfikator piętra, kraty areny) — przedmioty już go nie używają;
- pas na ekranie śmierci zaczyna się teraz tuż pod rzędem ikon (pełna czerń od y = 142).

**Kod:**
- `core/types.ts`: `HudItem.frame`, `HudItem.rare`, `HudItemNotice`, `HudData.itemNotice`;
- `GameScene`: klatka ikony (`itemFrames`), `rare` = `ItemKind.Effect`, `showItemNotice` zamiast toastu przy przedmiotach;
- `HudScene`: sloty (ramka, ikona, licznik) budowane raz, przerysowywane tylko przy zmianie listy; podpis pod ikonami;
- `config/deathScreenConfig.ts`: góra pasa 116 → 130.

**Testy:** pas ekranu śmierci zaczyna się na dole rzędu ikon (142). Ikony korzystają z klatek sprawdzanych w `tests/assets/loot.test.ts`.

**Weryfikacja:** `npm run build` (900 testów); przeglądarka — 12 przedmiotów przez `window.__game` (8 rodzajów, liczniki ×2/×3), podpis „Kołczan — +1 ładunek strzału”, ekran śmierci z pasem pod ikonami; brak błędów w konsoli. Wdrożone na GitHub Pages.

---

## Scalenie z main po krokach 59–67 (dwa razy) `#ekran-startowy` `#ekran-smierci` `#hud`

**Problem:** kroki ekranu startowego, ekranu śmierci i HUD-u z tej sesji powstawały na gałęzi `claude/beautiful-knuth-7datv1` równolegle z `main` (kroki 36–50a: Czarodziejka, Piekło, elity, pętla wieży, zasadzki). Wdrożenie z `main` nadpisało `gh-pages` wersją bez nich.

**Co zrobiono:**
- `main` scalony z gałęzią; kroki tej gałęzi 36–44 **przenumerowane na 51–59** (numery 36–50a są zajęte przez `main`);
- `SplashScene`: przejście do gry przez `startFirstFloor` z `main` (ekran wyboru bohatera);
- `DeathScreen` (wersja Dark Souls ze spływającą czerwienią) przejął z `main` wspólną listę wyników: pole na imię po pierwszej śmierci, imiona w wierszach, nagłówek zależny od źródła (lokalna / łączenie / wszyscy gracze / run testowy), „C — ZMIANA BOHATERA”; podczas wpisywania imienia komunikat o nowej wspinaczce ukryty;
- `HudScene`: ikony przedmiotów (krok 67) razem z paskiem promienia Czarodziejki, podpowiedzią zależną od bohatera i złotem w runie testowym;
- pasek promienia przesunął HUD o 5 px w dół — rząd ikon kończy się na y = 147, więc pas ekranu śmierci zaczyna się od 147.

**Weryfikacja:** `npm run build`; przeglądarka (ekran startowy → wybór bohatera, ikony w HUD, śmierć z polem na imię). Wdrożone na GitHub Pages.

---
## Drugie scalenie z main (17.10) `#ekran-startowy` `#ekran-smierci` `#hud`

**Problem (zgłoszenie właściciela):** na Pages znowu był stary ekran startowy i tekst zamiast ikon. Inna sesja wdrożyła 16.10 grę z `main` (kroki 51–58 tam: gniazdo pająków, zapowiedź bossa, diagnostyka) — `main` nadal nie miał zmian z tej gałęzi, więc wdrożenie je nadpisało.

**Co zrobiono:** `main` scalony ponownie; kroki tej gałęzi przenumerowane drugi raz — teraz **59–67** (51–58 zajął `main`); w `GameScene` zostaje notatka diagnostyczna kapliczki z `main` (`diag.note`) i podpis przedmiotu pod ikonami. Wdrożone na GitHub Pages.

**Na przyszłość:** dopóki ta gałąź nie trafi do `main`, każde wdrożenie z `main` cofnie ekran startowy, ekran śmierci i ikony w HUD.

---


## Krok 59 — Przegląd bezpieczeństwa repozytorium i workera `#decyzja` `#bezpieczenstwo`

**Przegląd (repozytorium jest publiczne):** w repo nie ma haseł, kluczy ani prywatnego e-maila; `REPORTS_TOKEN` jest tylko u właściciela. Publiczne i niegroźne: adres workera, `database_id` D1, nazwa konta.

**Zmiany**
- `.env.production` wyszedł z gita (wpis w `.gitignore`); wzór w `.env.production.example`. Po świeżym klonie trzeba skopiować wzór do `.env.production`, inaczej build nie zna adresu workera i gra używa tylko listy lokalnej.
- Pliki `__pycache__`/`*.pyc` usunięte z gita, dopisane do `.gitignore` (razem z `.env.local`, `.dev.vars`, `.wrangler/`).
- Worker: skrót IP z sekretną solą `IP_SALT` (`npx wrangler secret put IP_SALT`). Wcześniej sól była w publicznym kodzie, więc skróty z bazy dało się odwrócić dla każdego IPv4. Bez sekretu worker działa jak dawniej. Po ustawieniu soli liczniki limitów zaczynają od zera (bez szkody).

- Globalny dobowy bezpiecznik dla `/scores`: najwyżej 500 wpisów na dobę łącznie (503 + `Retry-After`), obok limitu 10 wpisów/10 min z jednego IP; chroni darmowy limit zapisów D1 wspólny z `/reports`. Dwa testy w `tests/worker/index.test.ts`. Gra przy 503 zachowuje się jak przy każdym błędzie sieci: wynik czeka w kolejce wysyłki (`SharedHighscores.flushOutbox`) i idzie przy następnej próbie.

**Uwaga:** sprawdzenie `Origin` chroni tylko przed przeglądarkami, skrypt może je podać sam.

**Testy:** 1191 przechodzi. **Wdrożenie workera wykonane** (sekret `IP_SALT` ustawiony, `wrangler deploy`; sprawdzone na żywo: `GET /scores` 200, `GET /reports` bez tokena 404, `POST /scores` bez `Origin` 403).

## Krok 68 — Minimapa `#hud` `#decyzja`

**Prośba właściciela:** dodać minimapę.

**Co widać:**
- w prawym górnym rogu HUD: mapa piętra z **mgłą wojny** — odkrywa się to, do czego gracz dojdzie po podłodze w promieniu 6 kafli (plus sąsiadujące ściany), więc mapa nie zdradza pokoi za murem;
- znaczniki: zielony migający punkt — gracz, złoty — schody, czerwony — arena bossa (oba dopiero po odkryciu kafla; czerwony znika po pokonaniu bossa);
- ukryta komnata (krok 46) nie pojawia się na mapie: minimapa używa piętra w przebraniu muru;
- 3 px na kafel; tło półprzezroczyste.

**Kod:** `systems/Minimap.ts` (czysty `MinimapExplorer`: odkrywanie BFS-em po podłodze, licznik `version`), `config/minimapConfig.ts` (promień, rozmiar, kolory), `HudData.minimap` (`MinimapHudData`), `GameScene.minimapData()`, `HudScene.drawMinimap()` (tło i kafle przerysowywane tylko przy zmianie `version`, znaczniki co klatkę).

**Testy (+5, `tests/systems/minimap.test.ts`):** pusta mgła na starcie, promień odkrywania, osiągalność odkrytej podłogi i ściany tylko przy podłodze, wersja rośnie tylko przy zmianie, pozycje poza mapą ignorowane.

**Weryfikacja:** `npm run build`.

**Do oceny w testach właściciela:** rozmiar (3 px/kafel), promień odkrywania (6), czy chcemy klawisz do powiększenia/ukrycia mapy.

---

## Krok 69 — Wampiryczni i strzelcy-elity, wdrożenie minimapy `#elity` `#hud` `#ocena`

**Zgłoszenie właściciela:** minimapy nie widać (na Pages była jeszcze wersja bez niej); wampiryczne potwory wydają się za mocne; strzelcy (Kitery) nie mogą mieć cechy Tarczownika.

**Wampiryczny `#elity` `#ocena`:**
- przyczyna: `vampiric.lifesteal` było **2**, czyli elita leczyła się o 200% zadanych obrażeń (komentarz w kodzie mówił o „ułamku”), przy 2,5× HP i 1,3× obrażeń każde trafienie wyleczało ją o więcej, niż jej zadało;
- teraz **0,5** (połowa zadanych obrażeń, co najmniej 1). Obrażenia ciosów elity (1,3×) bez zmian — do oceny, czy to wystarczy.

**Strzelcy bez Tarczownika `#decyzja` `#elity`:**
- pierwsza wersja (nietoperz jako „latający”) była błędnie zrozumiana — właściciel miał na myśli **jednostki strzelające, czyli Kitery**;
- Tarczownik ma teraz `types: [Rusher]` w `config/eliteConfig.ts` (istniejący mechanizm `EliteAffixDefinition.types`); Kitery losują z 4 pozostałych cech (Szybki, Wampiryczny, Wybuchowy, Ognisty); dodatkowa obsługa „latających” usunięta.

**Testy (+2):** pełna czerń od dołu HUD-u i obejmuje napis po urośnięciu; dół pasa 346 px, poniżej wyniku.

**Weryfikacja:** `npm run build`; zrzut z przeglądarki po 7 s. Wdrożone na GitHub Pages.

**Uwaga:** gdy lista przedmiotów w HUD zawinie się do drugiej linii (wiele przedmiotów), jej dół zejdzie pod 128 px i wejdzie w rozmycie pasa — rozwiązane w kroku 67 (ikony w jednym rzędzie, pas od y = 147 po scaleniu).

---

## Krok 67 — HUD: przedmioty jako ikony

**Decyzja właściciela:** `#decyzja` `#hud`
- z dwóch makiet na kanwie (A: ikony pod złotem, B: pasek na dole) wybrany **wariant A**;
- przy zdobyciu przedmiotu pokazywać jego **nazwę i efekt mniejszą złotą czcionką**; od razu wdrożyć.

**Co widać:**
- zamiast tekstowej listy przedmiotów — rząd slotów 28 px pod złotem (y = 114–142): ikona z atlasu łupów (16 px, 1:1), ramka **kości** dla przedmiotów bazowych i **złota** dla rzadszych z efektem broni, licznik kopii ×2, ×3 w rogu;
- slot na każdy rodzaj przedmiotu (najwyżej 12, kolejność zdobywania);
- po zdobyciu przedmiotu (podniesienie, kapliczka, nagroda za bossa) pod ikonami przez 3 s: „Nazwa — efekt” (12 px, złoto #f5c542), wygasa w ostatnich 0,8 s;
- duży komunikat na środku ekranu zostaje dla innych zdarzeń (modyfikator piętra, kraty areny) — przedmioty już go nie używają;
- pas na ekranie śmierci zaczyna się teraz tuż pod rzędem ikon (pełna czerń od y = 142).

**Kod:**
- `core/types.ts`: `HudItem.frame`, `HudItem.rare`, `HudItemNotice`, `HudData.itemNotice`;
- `GameScene`: klatka ikony (`itemFrames`), `rare` = `ItemKind.Effect`, `showItemNotice` zamiast toastu przy przedmiotach;
- `HudScene`: sloty (ramka, ikona, licznik) budowane raz, przerysowywane tylko przy zmianie listy; podpis pod ikonami;
- `config/deathScreenConfig.ts`: góra pasa 116 → 130.

**Testy:** pas ekranu śmierci zaczyna się na dole rzędu ikon (142). Ikony korzystają z klatek sprawdzanych w `tests/assets/loot.test.ts`.

**Weryfikacja:** `npm run build` (900 testów); przeglądarka — 12 przedmiotów przez `window.__game` (8 rodzajów, liczniki ×2/×3), podpis „Kołczan — +1 ładunek strzału”, ekran śmierci z pasem pod ikonami; brak błędów w konsoli. Wdrożone na GitHub Pages.

---

## Scalenie z main po krokach 59–67 (dwa razy) `#ekran-startowy` `#ekran-smierci` `#hud`

**Problem:** kroki ekranu startowego, ekranu śmierci i HUD-u z tej sesji powstawały na gałęzi `claude/beautiful-knuth-7datv1` równolegle z `main` (kroki 36–50a: Czarodziejka, Piekło, elity, pętla wieży, zasadzki). Wdrożenie z `main` nadpisało `gh-pages` wersją bez nich.

**Co zrobiono:**
- `main` scalony z gałęzią; kroki tej gałęzi 36–44 **przenumerowane na 51–59** (numery 36–50a są zajęte przez `main`);
- `SplashScene`: przejście do gry przez `startFirstFloor` z `main` (ekran wyboru bohatera);
- `DeathScreen` (wersja Dark Souls ze spływającą czerwienią) przejął z `main` wspólną listę wyników: pole na imię po pierwszej śmierci, imiona w wierszach, nagłówek zależny od źródła (lokalna / łączenie / wszyscy gracze / run testowy), „C — ZMIANA BOHATERA”; podczas wpisywania imienia komunikat o nowej wspinaczce ukryty;
- `HudScene`: ikony przedmiotów (krok 67) razem z paskiem promienia Czarodziejki, podpowiedzią zależną od bohatera i złotem w runie testowym;
- pasek promienia przesunął HUD o 5 px w dół — rząd ikon kończy się na y = 147, więc pas ekranu śmierci zaczyna się od 147.

**Weryfikacja:** `npm run build`; przeglądarka (ekran startowy → wybór bohatera, ikony w HUD, śmierć z polem na imię). Wdrożone na GitHub Pages.

---
## Drugie scalenie z main (17.10) `#ekran-startowy` `#ekran-smierci` `#hud`

**Problem (zgłoszenie właściciela):** na Pages znowu był stary ekran startowy i tekst zamiast ikon. Inna sesja wdrożyła 16.10 grę z `main` (kroki 51–58 tam: gniazdo pająków, zapowiedź bossa, diagnostyka) — `main` nadal nie miał zmian z tej gałęzi, więc wdrożenie je nadpisało.

**Co zrobiono:** `main` scalony ponownie; kroki tej gałęzi przenumerowane drugi raz — teraz **59–67** (51–58 zajął `main`); w `GameScene` zostaje notatka diagnostyczna kapliczki z `main` (`diag.note`) i podpis przedmiotu pod ikonami. Wdrożone na GitHub Pages.

**Na przyszłość:** dopóki ta gałąź nie trafi do `main`, każde wdrożenie z `main` cofnie ekran startowy, ekran śmierci i ikony w HUD.

---


## Krok 59 — Przegląd bezpieczeństwa repozytorium i workera `#decyzja` `#bezpieczenstwo`

**Przegląd (repozytorium jest publiczne):** w repo nie ma haseł, kluczy ani prywatnego e-maila; `REPORTS_TOKEN` jest tylko u właściciela. Publiczne i niegroźne: adres workera, `database_id` D1, nazwa konta.

**Zmiany**
- `.env.production` wyszedł z gita (wpis w `.gitignore`); wzór w `.env.production.example`. Po świeżym klonie trzeba skopiować wzór do `.env.production`, inaczej build nie zna adresu workera i gra używa tylko listy lokalnej.
- Pliki `__pycache__`/`*.pyc` usunięte z gita, dopisane do `.gitignore` (razem z `.env.local`, `.dev.vars`, `.wrangler/`).
- Worker: skrót IP z sekretną solą `IP_SALT` (`npx wrangler secret put IP_SALT`). Wcześniej sól była w publicznym kodzie, więc skróty z bazy dało się odwrócić dla każdego IPv4. Bez sekretu worker działa jak dawniej. Po ustawieniu soli liczniki limitów zaczynają od zera (bez szkody).

- Globalny dobowy bezpiecznik dla `/scores`: najwyżej 500 wpisów na dobę łącznie (503 + `Retry-After`), obok limitu 10 wpisów/10 min z jednego IP; chroni darmowy limit zapisów D1 wspólny z `/reports`. Dwa testy w `tests/worker/index.test.ts`. Gra przy 503 zachowuje się jak przy każdym błędzie sieci: wynik czeka w kolejce wysyłki (`SharedHighscores.flushOutbox`) i idzie przy następnej próbie.

**Uwaga:** sprawdzenie `Origin` chroni tylko przed przeglądarkami, skrypt może je podać sam.

**Testy:** 1191 przechodzi. **Wdrożenie workera wykonane** (sekret `IP_SALT` ustawiony, `wrangler deploy`; sprawdzone na żywo: `GET /scores` 200, `GET /reports` bez tokena 404, `POST /scores` bez `Origin` 403).

## Krok 68 — Minimapa `#hud` `#decyzja`

**Prośba właściciela:** dodać minimapę.

**Co widać:**
- w prawym górnym rogu HUD: mapa piętra z **mgłą wojny** — odkrywa się to, do czego gracz dojdzie po podłodze w promieniu 6 kafli (plus sąsiadujące ściany), więc mapa nie zdradza pokoi za murem;
- znaczniki: zielony migający punkt — gracz, złoty — schody, czerwony — arena bossa (oba dopiero po odkryciu kafla; czerwony znika po pokonaniu bossa);
- ukryta komnata (krok 46) nie pojawia się na mapie: minimapa używa piętra w przebraniu muru;
- 3 px na kafel; tło półprzezroczyste.

**Kod:** `systems/Minimap.ts` (czysty `MinimapExplorer`: odkrywanie BFS-em po podłodze, licznik `version`), `config/minimapConfig.ts` (promień, rozmiar, kolory), `HudData.minimap` (`MinimapHudData`), `GameScene.minimapData()`, `HudScene.drawMinimap()` (tło i kafle przerysowywane tylko przy zmianie `version`, znaczniki co klatkę).

**Testy (+5, `tests/systems/minimap.test.ts`):** pusta mgła na starcie, promień odkrywania, osiągalność odkrytej podłogi i ściany tylko przy podłodze, wersja rośnie tylko przy zmianie, pozycje poza mapą ignorowane.

**Weryfikacja:** `npm run build`.

**Do oceny w testach właściciela:** rozmiar (3 px/kafel), promień odkrywania (6), czy chcemy klawisz do powiększenia/ukrycia mapy.

---

## Krok 69 — Wampiryczni i strzelcy-elity, wdrożenie minimapy `#elity` `#hud` `#ocena`

**Zgłoszenie właściciela:** minimapy nie widać (na Pages była jeszcze wersja bez niej); wampiryczne potwory wydają się za mocne; strzelcy (Kitery) nie mogą mieć cechy Tarczownika.

**Wampiryczny `#elity` `#ocena`:**
- przyczyna: `vampiric.lifesteal` było **2**, czyli elita leczyła się o 200% zadanych obrażeń (komentarz w kodzie mówił o „ułamku”), przy 2,5× HP i 1,3× obrażeń każde trafienie wyleczało ją o więcej, niż jej zadało;
- teraz **0,5** (połowa zadanych obrażeń, co najmniej 1). Obrażenia ciosów elity (1,3×) bez zmian — do oceny, czy to wystarczy.

**Latające moby bez Tarczownika `#decyzja` `#elity`:**
- `EnemyVariantDefinition.flying` (na razie nietoperz), `EliteAffixDefinition.groundedOnly` (Tarczownik), `RoomSpawn.flying`; `availableAffixes`/`rollElites` pomijają takie cechy dla latających;
- `GameScene` oznacza spawny z wariantu biomu.

**Testy (+2):** Kiter nigdy nie dostaje Tarczownika (50 seedów), lifesteal ≤ 1.

**Wdrożenie:** minimapa (krok 68) i ten krok idą na GitHub Pages z tej gałęzi (zawiera `main` po scaleniu z kroków 51–58).

---

## Krok 70 — Ekran pauzy `#decyzja` `#hud`

**Decyzja właściciela:** `#decyzja` pauza ma być (wcześniej jej nie było, a nie była to świadoma decyzja), **dostępna zawsze** i **uruchamiana automatycznie po utracie fokusu**.

**Co widać:**
- **Esc albo P** wstrzymuje grę (także w walce z bossem); ten sam klawisz, kliknięcie myszą lub drugi z klawiszy wznawia. Ekran: przyciemnienie, „PAUZA”, powód (ręczna / utrata fokusu), lista sterowania;
- **auto-pauza:** gdy okno traci fokus (`blur`) albo karta zostaje ukryta (`hidden`), gra staje na pauzie; po powrocie trzeba ją świadomie wznowić;
- pauza nie włącza się na ekranie śmierci (tam wpisuje się imię — litera P!), podczas przejścia między piętrami ani przy wyborze nagrody za bossa;
- wznowienie kliknięciem następuje po **puszczeniu** przycisku, więc kliknięcie wracające do okna nie staje się atakiem; po wznowieniu klawisze są resetowane (puszczone w pauzie nie „zostają wciśnięte”).

**Pułapka: czas gry.** `scene.pause()` zatrzymuje scenę, ale zegar Phasera płynie dalej — po wznowieniu wszystkie czasy odnowienia, zamachy bossów i komunikaty uznałyby, że minęły (pauza = darmowe odnowienie). Rozwiązanie: `systems/PauseClock.ts` — `main.ts` owija `game.step`, a zegar przekazuje scenom czas „zamrożony” na pauzie i ciągnięty dalej od miejsca zatrzymania po wznowieniu. Dziennik diagnostyczny widzi surowy czas (owija zewnętrznie). Nagroda za bossa (krok 9) zostaje bez zmian — ma tweeny, którym zamrożony czas by zaszkodził, a trwa krótko.

**Auto-pauza a narzędzia:** w trybie dev (panel narzędzi zabiera fokus, a `game.step()` ręczny przy wstrzymanej scenie nic by nie dał) i dla bota (`navigator.webdriver`, `npm run smoke`) jest **domyślnie wyłączona**; `?autopause=1` włącza ją zawsze, `?autopause=0` wyłącza zawsze.

**Kod:** `config/pauseConfig.ts` (klawisze, teksty, parametr adresu), `systems/PauseClock.ts` (czysty `PauseClock`, `autoPauseEnabled`), `scenes/PauseScene.ts` (nakładka, bez tweenów), `GameScene.setupPause/pauseGame/resumeGame`, `main.ts` (zegar w `game.registry`), `SceneKey.Pause`. Zdarzenie `pause` w diagnostyce.

**Testy (+6, `tests/systems/pauseClock.test.ts`):** czas stoi w pauzie i płynie od miejsca zatrzymania, sumowanie kolejnych pauz, podwójne begin/end, polityka auto-pauzy.

**Do oceny w testach właściciela:** czy auto-pauza po utracie fokusu nie przeszkadza (np. przy klikaniu poza oknem), czy pokazać na pauzie powiększoną minimapę.

---

## Krok 71 — Wzmocnienie bossów: Król Pająków `#decyzja` `#grzybnia` `#boss`

Prośba właściciela: wzmocnić bossów, zaczynając od drugiego pająka (Król Pająków, piętro 3) — dodatkowy cios albo większa prędkość. Zrobione **oba** (tylko Król; reszta czeka na ocenę):
- **Tupnięcie** (`slam`, mechanika Slam): fala dookoła Króla, promień 90, telegraf 850 ms, obrażenia 16 — czwarty cios w wzorze (worek losowej kolejności: każdy atak raz na rundę). Animacja „stab” jak przy pozostałych ciosach.
- **Chód** 55 → 66, do tego **sprint** z daleka (120 px/s od 130 px; gracz ma 200, więc nadal da się uciec).
- Testy: `tests/ai/SpiderKing.test.ts` (wzór 4 ciosów, tupnięcie, skalowanie, prędkości). `npm run build` zielony.
- **Skrót `?boss=1`** (narzędzie dev, działa też na Pages jako run testowy): gracz startuje w arenie bossa piętra, 2 kafle od lewej ściany. Np. `?seed=7&floor=3&boss=1` = od razu walka z Królem. Parametr działa tylko na pierwsze piętro runu (`FloorSceneData.atBoss`). Test w `tests/systems/startOverrides.test.ts`; sprawdzone w przeglądarce.
- Kolejni kandydaci do wzmocnienia (po ocenie Króla): Grzybowy Pożeracz, Strażnik Bram, Kat Otchłani, a także Matka Pająków i Strażnik Piętra.

## Krok 72 — Wzmocnienie bossów: Grzybowy Pożeracz `#decyzja` `#cmentarzysko` `#boss`

Ciąg dalszy prośby z kroku 71, kolejny boss (piętro 4). Tak samo jak u Króla Pająków, **oba** wzmocnienia:
- **Zgniecenie** (`slam`, mechanika Slam): fala dookoła Pożeracza, promień 88, telegraf 850 ms, obrażenia 18; czwarty cios w wzorze, animacja „smash”.
- **Chód** 60 → 70, **sprint** 135 → 150 (gracz 200).
- Testy: `tests/ai/FungalDevourer.test.ts`; `npm run build` zielony. Test w przeglądarce: `?seed=7&floor=4&boss=1`.
- Dalej: Strażnik Bram, Kat Otchłani, Matka Pająków, Strażnik Piętra.

## Krok 73 — Wzmocnienie bossów: Strażnik Bram `#decyzja` `#piekło` `#boss`

Kolejny boss z prośby z kroku 71 (piętro 5). Oba wzmocnienia:
- **Skok** (`leap`, mechanika skoku Pożeracza): doskok na miejsce gracza z czerwoną strefą lądowania (promień 50, telegraf 700 ms, lot 420 ms, obrażenia 18), po lądowaniu 700 ms okna na kontrę; trzeci cios w wzorze (obok łańcucha i uderzenia tarczą). Karze kitowanie z dystansu, bez animacji (przysiad jak u Pożeracza).
- **Chód** 62 → 72 i **sprint** 140 z odległości 150 px (gracz 200).
- Testy: `tests/ai/GateWarden.test.ts`; test w przeglądarce: `?seed=7&floor=5&boss=1`.
- Dalej: Kat Otchłani, Matka Pająków, Strażnik Piętra.

## Krok 74 — Strażnik Bram: tarcza z wytrzymałością `#ocena` `#decyzja` `#piekło` `#boss`

`#ocena` właściciela: walka ze Strażnikiem Bram sprowadza się do krążenia dookoła i szukania luki w tarczy.
- **Rozwiązanie (moje, do oceny):** tarcza dostała **wytrzymałość** (`shield.guard`: `hp: 90`, `breakMs: 3500`). Ciosy wręcz w tarczę z przodu zbijają ją pełnymi obrażeniami (boss nadal dostaje `frontMeleeMultiplier` ×0,5); po wyzerowaniu tarcza **pęka na 3,5 s** — łuk znika, boss przyjmuje pełne obrażenia z każdej strony, pociski i promień go trafiają. Potem tarcza wraca z pełną wytrzymałością.
- Łuk tarczy blednie i cienieje w miarę zużycia (czytelność bez dodatkowego paska); pęknięcie = błysk i wstrząs.
- Obejście bossa zostaje opcją (cios w plecy = pełne obrażenia), ale nie jest konieczne.
- **Kat Otchłani** nie ma `guard` (tarcza niezniszczalna jak dotąd) — czeka na decyzję właściciela, czy też zmienić.
- Czysta logika: `ShieldGuard` w `systems/Shield.ts`; testy w `tests/ai/GateWarden.test.ts`. Do strojenia: `guard.hp`, `breakMs`.
- Test: `?seed=7&floor=5&boss=1`.

## Krok 75 — Schody przy krawędzi areny `#decyzja` `#schody`

Prośba właściciela: zmiana rozmieszczenia schodów; wybrana opcja — **przy krawędzi areny** (zamiast pośrodku, pod bossem).
- Schody 2×2 stoją teraz w **narożniku areny najdalszym od wejść** (`planStairs` w `dungeon/stairs.ts`; wejścia = także przejście do ukrytej komnaty), odsunięte od ścian o 1 kafel (`STAIRS_WALL_INSET`). Narożnik przy samych drzwiach odpada; remis rozstrzyga kolejność NW, NE, SE, SW. Deterministyczne (bez RNG).
- **Boss** staje i budzi się w środku areny (`arenaCenter`), nie na schodach; punkt odniesienia skoku (clamp lądowania) też jest środkiem areny. `stairsCenter` usunięte.
- Planery (kokony spiżarni, tron, naklejki, rekwizyty) pomijają schody, bo wybierają tylko kafle podłogi, a schody to `StairsLocked`.
- Testy: `tests/dungeon/stairs.test.ts` (planStairs, arenaCenter), `tests/dungeon/DungeonGenerator.test.ts` (narożnik, odstęp od wejść) — dotychczasowy test „schody wyśrodkowane” zastąpiony. `npm run build` zielony; sprawdzone w przeglądarce (piętra 3, 4, 6 bez błędów).
- Do oceny: czy narożnik (a nie np. środek ściany) wygląda dobrze i czy po walce nie jest za daleko od gracza.

## Krok 76 — Wzmocnienie bossów: Kat Otchłani `#decyzja` `#piekło` `#boss`

Kolejny boss z prośby z kroku 71 (piętro 6):
- **Skok** (`leap`): doskok na miejsce gracza, strefa promień 54, telegraf 700 ms, lot 420 ms, obrażenia 20, 700 ms okna na kontrę; czwarty cios w wzorze (obok oddechu palenisk, łańcucha i uderzenia tarczą; hak nadal poza wzorem).
- **Chód** 66 → 76, **sprint** 145 od 150 px (gracz 200).
- Tarcza Kata zostaje niezniszczalna (bez `guard` z kroku 74) — czeka na decyzję właściciela.
- Testy: `tests/ai/GateWarden.test.ts`; test w przeglądarce: `?seed=7&floor=6&boss=1`.
- Dalej: Matka Pająków, Strażnik Piętra.

## Krok 77 — Wzmocnienie bossów: Matka Pająków `#decyzja` `#pajecze-leze` `#boss`

Kolejny boss z prośby z kroku 71 (piętro 2):
- **Tupnięcie** (`slam`): fala dookoła Matki, promień 84, telegraf 800 ms, obrażenia 14; czwarty cios w wzorze (obok wylęgu, sieci i skoku), bez osobnej animacji.
- **Chód** 70 → 80, **sprint** 150 → 165 (nadal wolniejszy od gracza, 200, i szybszy od gracza spowolnionego siecią, 100 — test balansu).
- Testy: `tests/ai/SpiderQueen.test.ts` (wzór 4 ciosów, skalowanie tupnięcia, prędkości); test w przeglądarce: `?seed=3&floor=2&boss=1`.
- Dalej: Strażnik Piętra (piętro 1 i 7+).

## Krok 78 — Wzmocnienie bossów: Strażnik Piętra `#decyzja` `#boss`

Ostatni boss z prośby z kroku 71 (piętro 1 oraz piętra bez własnego bossa, np. 7):
- **Skok** (`leap`): doskok na miejsce gracza, strefa promień 56, telegraf 750 ms, lot 450 ms, obrażenia 16, 700 ms okna na kontrę; czwarty cios w wzorze (obok uderzenia, pierścienia pocisków i ostrzału stref).
- **Chód** 55 → 65, **sprint** 130 od 160 px (gracz 200). Strażnik pierwszego piętra jest wciąż najłagodniejszy z bossów (nauka gry).
- Testy: `tests/ai/attackPattern.test.ts`, `tests/ai/BossBrain.test.ts` (długość rundy ze wzoru zamiast stałej 3); test w przeglądarce: `?seed=7&floor=1&boss=1`.
- **Prośba „wzmocnij bossów” zrobiona dla wszystkich sześciu** (kroki 71–78; tarcza Strażnika Bram z wytrzymałością w kroku 74, tarcza Kata bez zmian). Do oceny właściciela w testach; nie łagodzimy bez sygnału.

## Krok 79 — Kat Otchłani: pękająca tarcza `#ocena` `#decyzja` `#piekło` `#boss`

Decyzja właściciela: tarcza Kata ma działać jak u Strażnika Bram (krok 74).
- `ABYSS_EXECUTIONER.shield.guard`: `hp: 110`, `breakMs: 3500` (Kat ma więcej HP niż Strażnik, więc nieco wytrzymalsza tarcza). Ciosy wręcz w tarczę ją zbijają, po wyzerowaniu pęka na 3,5 s i Kat jest odsłonięty ze wszystkich stron, potem wraca pełna.
- Rozgrzewanie żelaza promieniem (wybuch żaru po 6 tickach) i odbijanie pocisków zostają, dopóki tarcza stoi; pęknięta nie rozgrzewa się i nie odbija.
- Test: `?seed=7&floor=6&boss=1`. Do strojenia: `guard.hp`, `breakMs`.

## Krok 80 — Świta bossów (pomocnicy w walce) `#decyzja` `#boss`

Druga runda wzmacniania bossów; wybór właściciela: **pomocnicy w walce** — bossowie przywołują zwykłych wrogów biomu, żeby gracz nie skupiał się tylko na bossie.
- **Mechanika** (`BossDefinition.retinue`, czysta logika `systems/BossRetinue.ts`): po `firstAfterMs` (9 s) od początku walki, potem co `everyMs` (16 s; po wściekłości 11 s) na arenie pojawia się pulsujący znacznik w kolorze kości (nie czerwony — to nie strefa obrażeń), po 1 s wychodzi z niego wróg biomu (0,5 s wynurzania: nietykalny i nie atakuje). 1 na wezwanie (po wściekłości 2), **najwyżej 2 żywe naraz**; wezwanie przy pełnym limicie przepada. Miejsca: podłoga areny, kafel od muru, ≥ 3 kafle od gracza, 2 od siebie (własny strumień RNG).
- **Kto kogo woła:** Strażnik Piętra — Rusher ruin (rzadziej: 18/13 s); Matka Pająków — nietoperz (Kiter); Król Pająków — Rusher Grzybni; Grzybowy Pożeracz — siewca (Kiter; zarażonych ma już ze spiżarni); Strażnik Bram — Rusher Piekła (strzelców ma w galeriach); Kat Otchłani — Rusher Piekła (częściej: 14/9 s).
- Po śmierci bossa znaczniki znikają, a świta na arenie walczy dalej.
- Liczby w `config/bossConfig.ts` (`RETINUE_BASE` + nadpisania), wygląd znacznika `RETINUE_MARKER_VISUAL` w `spriteConfig.ts`.
- Testy: `tests/systems/BossRetinue.test.ts` (rytm, wściekłość, limit, miejsca, determinizm, konfiguracja). Przeglądarka: piętra 2 i 3 z `?boss=1` — po ok. 10 s walki przybywa jeden wróg, bez błędów. Znacznik w mroku/mgle bywa słabo widoczny — do oceny.

## Krok 81 — Mocniejsza wściekłość bossów `#decyzja` `#boss`

Trzecia runda wzmacniania; wybór właściciela: **mocniejsza wściekłość** (wyraźna druga faza walki).
- **Ryk** (`BossAttackKind.Roar`, `enrage.roar`): przy wejściu we wściekłość (poniżej 50% HP) boss kończy bieżący atak i ryczy — czerwona strefa wokół niego (promień 110, telegraf 600 ms, stały — wściekłość go nie skraca), fala odrzuca gracza (knockback 420) i lekko rani (6, skaluje się z piętrem), napis „Ryk!”. Raz na walkę; nie ma go, gdy walka zaczyna się od wściekłości. Do tego dotychczasowy baner i drżenie ekranu.
- **Serie** (`enrage.comboLength: 2`, `comboGapMs: 300`): we wściekłości ataki ze wzoru idą parami — między atakami pary tylko 0,3 s luki, pełna (skrócona wściekłością) przerwa dopiero po parze. Telegrafy zostają (czytelność), ale presja rośnie wyraźnie.
- Wspólne dla wszystkich sześciu bossów (`ENRAGE_FURY` w `config/bossConfig.ts`).
- Testy: `tests/ai/enrageFury.test.ts` (ryk raz i we właściwej chwili, brak ryku przy starcie we wściekłości, pary i przerwy, skalowanie). Przeglądarka: Strażnik Bram z HP zbitym poniżej progu — ryk, potem uderzenie tarczą i łańcuch z krótką luką, bez błędów.

## Notka z sesji (17.10) `#ocena`

Właściciel zgłosił, że w trakcie tej sesji jest **naćpany**. Zapis na jego prośbę — na wypadek, gdyby dziwne decyzje projektowe z tego dnia wymagały przeglądu na trzeźwo.

## Krok 82 — Łucznik, trzeci bohater `#decyzja` `#lucznik`

Wybór właściciela po przeglądzie stanu gry: **nowy bohater — łucznik**. Połowa puli przedmiotów to efekty strzału (Szuriken, Elektryczna strzała, Lodowy odłamek, Kołczan); u łucznika są bronią główną.
- **Statystyki** (`config/heroConfig.ts`): 85 HP (między barbarzyńcą a Czarodziejką), chód 215 (najszybszy).
- **LPM — łuk z naciąganiem** (czysta logika `systems/Archery.ts`, `BowDraw`): przytrzymanie naciąga cięciwę przez 0,7 s, puszczenie wypuszcza strzałę. Siła rośnie liniowo: kliknięcie 5 obrażeń, pełne naciągnięcie 24, szybsza i z mocniejszym odrzutem; **pełne naciągnięcie przebija 1 wroga** (sumuje się z Szurikenem), a znacznik celowania świeci wtedy na złoto. W trakcie naciągania łucznik idzie wolniej (×0,6). Po strzale 0,25 s przerwy. Dash, paraliż i salwa zwalniają cięciwę bez strzału.
- **PPM — salwa:** wachlarz 3 strzał (30°) po 8 obrażeń, na ładunkach strzału (`combat.ranged`: 2 ładunki, odnowienie 2,2 s). Z bliska wszystkie trzy trafiają jeden cel.
- **Przedmioty:** Ostrze dodaje obrażenia łuku, Rękawice skracają naciąganie i przerwę, Kołczan dokłada ładunek salwy, a wyczerpanie (modyfikator piętra) wydłuża jej odnowienie. Strzały niosą wszystkie efekty broni (strzał + cios, jak kule Czarodziejki): Ognista pięść podpala, Wampirzy kieł leczy (z dotychczasowym cooldownem).
- **Upiory zasadzek:** strzały łucznika trafiają je zawsze, jak magia Czarodziejki — **domyślna decyzja, do potwierdzenia przez właściciela** (bez tego zasadzki byłyby dla łucznika karą).
- **Refaktor:** `HeroDefinition.sorcery` zastąpiło jedno pole `kit` (`melee` / `sorcery` / `archery`, `core/heroTypes.ts` z `sorceryOf`/`archeryOf`); tak samo `PlayerLoadout`. Kolejny bohater dopisuje tylko swój wariant.
- **Grafika:** generator `tools/archer_sprites.py` — arkusz `archer_walk-draw.png` (chód 0–3; łuk 4–7: nałożenie strzały, pół, pełne naciągnięcie, zwolnienie cięciwy; etap wybiera gra według siły) i `archer_arrow.png` (8 kierunków, druga kolumna jaśniejsza dla pełnego naciągnięcia). Zielona peleryna z kapturem, skórzany kaftan i kołczan. **Czeka na ocenę właściciela.**
- **Ekran wyboru:** trzy karty (272 px, odstęp 24), mniejsza czcionka opisów, żeby długie linie mieściły się w karcie. `?hero=archer` pomija wybór.
- **Smoke:** `npm run smoke` domyślnie przechodzi piętra wszystkimi trzema bohaterami (`--heroes archer` tylko łucznikiem).
- Testy: `tests/systems/archery.test.ts` (siła strzały, naciąganie, przerwa, przerwanie, wachlarz, przedmioty, wyczerpanie), `tests/assets/archer.test.ts` (paleta, wymiary, czytelność na płytach). Build: 1261 testów zielonych. Smoke (piętra 1–6, seed 1): łucznik, barbarzyńca i Czarodziejka bez błędów. Przeglądarka: pełne naciągnięcie — strzała 24 obrażeń z przebiciem, kliknięcie — 7; salwa — 3 strzały w wachlarzu, HUD pokazuje ładunki; ekran wyboru z trzema kartami, bez błędów.
- **Wdrożenie (19.10):** PR #4 scalony, gra wdrożona na Pages z `7838a20`. Poprzednie wdrożenie (z `c87b072`) zbudowano bez `.env.production`, więc gra na Pages nie miała wspólnej listy wyników (tylko lokalna); to wdrożenie znów ma `VITE_SCORES_URL`. **Przed `npm run deploy:pages` sprawdź, że `.env.production` istnieje** (wzór: `.env.production.example`).
- **Do oceny w testach właściciela:** liczby łuku (czas naciągania, obrażenia, spowolnienie), siła salwy, wygląd postaci i strzały, trafianie upiorów.

---

## Krok 83 — Baron Dymu i dog: boss piętra 7 `#decyzja` `#baron-dymu` `#zadymiona-palarnia` `#boss`

Prośba właściciela: **boss następnego poziomu** — gruby ziomek z wysokim czołem i wielkim brzuchem, puszką napoju energetycznego w lewej ręce i fajką w prawej (druga fajka w ustach, dym stale przy twarzy), z wielkim czarnym psem (dog) jako osobnym sprite'em i osobnym bossem-pomocnikiem. Prawy atak: smuga dymu; trafienie przywołuje doga, który wypada z rogu ekranu.
- **Założenia (do potwierdzenia):** „następny poziom” = piętro 7 po Kacie Otchłani, więc wieża ma teraz **7 pięter w kręgu** (`TOWER_CONFIG.floorsPerLoop` 6 → 7); kolejny krąg zaczyna się od piętra 8 (ruiny). Imię: **Baron Dymu** („Pan Puszki i Fajki”), do zmiany, jeśli wolisz inne.
- **Biom: Zadymiona palarnia** (`BiomeId.SmokeDen`): osobny arkusz kafli (paleta `dymna_palarnia` — nikotynowa szarość, `python tools/tower_ruins_tiles.py --biome smoke_den`), gęsty szary dym zamiast mroku (`SMOKE_HAZE`, widok 96–220 px, mrok do 80%), zapowiedź bossa w szarym odcieniu. Wrogowie: ogar (Rusher) i kultysta (Kiter) z Piekła. Dekoracje jak w ruinach (bez pułapek).
- **Baron Dymu** (`config/bossConfig.ts` `SMOKE_BARON`, 640 HP, chód 62, sprint 130 < gracz 200, promień 34). Wzór (losowa kolejność): **smuga dymu**, **uderzenie brzuchem** (Slam, promień 92), **salwa puszek** (Barrage 4 stref; każda strefa to puszka lecąca łukiem 0,45 s i lądująca w chwili uderzenia). Wściekłość jak u innych bossów (ryk + serie po dwa); ryk to animacja łyku z puszki.
- **Smuga dymu** (`BossAttackKind.Smoke`, `ai/bossAttacks.ts` `planSmoke`): ciąg stref od krawędzi bossa do 280 px w stronę gracza, promień rośnie 14 → 34 px, wszystkie uderzają naraz po 0,8 s (szary telegraf; dash w bok = unik). Strefa niesie `summonsDog` i `look: 'smoke'`; po uderzeniu kłęby dymu pęcznieją i gasną (`smoke-puff.png`).
- **Dog — osobny boss-pomocnik** (`BossDogDefinition`, czysty mózg `ai/BossDogBrain.ts`, encja `entities/BossDog.ts`, zarządza nim `combat/BossFight.ts`). Fazy: u boku Barona (`Heel`, trzyma miejsce z boku względem linii do gracza), gracz w promieniu 90 px → pościg i **kłapnięcie** (telegraf 0,38 s, strefa przed psem); **trafienie smugą** → dog znika z boku Barona i **wypada z najdalszego od gracza rogu widoku** (kamera, dosunięty do areny): przysiad 0,7 s, kierunek szarży blokuje się 0,25 s przed wybiciem (da się go ominąć, jedno trafienie na szarżę, dash = unik), szarża 460 px/s przez 0,85 s, potem 0,9 s stania (okno na kontrę) i pościg. Kolejne przywołanie najwcześniej 9 s po skoku. Ma własne HP (150, skaluje się z piętrem jak wrogowie) i pasek nad głową; jest celem ciosu, strzału, promienia, rozprysku i dasha. Zabity wraca do boku Barona po 15 s; ginie razem z Baronem.
- **Grafika** (generator `tools/smoker_sprites.py`, STYLEGUIDE: 8 kierunków z obrotu, obrys `#1b1a22`, 6 kl./s): `smoke-baron_walk-puff-slam-throw-drink.png` (2560×1024, komórka 128), `black-dog_run-lunge.png` (640×640, komórka 80), `smoke-puff.png`, `energy-can.png`. Dominująca cecha Barona: brzuch w brudnym podkoszulku + jasna, łysa kopuła czoła + dym przy twarzy; jedyny jaskrawy akcent to neonowa zieleń puszki i żar fajek. Dog to czarna sierść z chłodnym odblaskiem, obroża z ćwiekami. Podgląd: tablica Design „Boss: Baron Dymu i Dog” w Artifactach. **Czeka na ocenę właściciela.**
- **Strój (poprawka właściciela):** niebieskie spodnie jeansowe i ciemnoszary T-shirt z białymi paskami na ramionach, napisem „G2” na brzuchu i „BAX” nad numerem „4” na plecach (czcionka 3×5 w generatorze; ciało koszulki ciemniejsze od podłogi, żeby spełnić próg czytelności).
- Zmiany wymuszone przez 7 pięter w kręgu: testy pętli (`towerLoop`, `biomes`, `bossRoomRule`, `SpiderKing`, `SpiderQueen`) przeliczone (ukryta komnata Grzybni na piętrach 3, 10, 17…).
- Testy: `tests/ai/SmokeBaron.test.ts` (plan smugi, puszki, skalowanie, mózg psa: bok, pościg, kłapnięcie, skok z blokadą kierunku, odstęp przywołania), `tests/assets/smoker.test.ts` (wymiary, piksele pełne, czytelność Barona i doga na podłodze palarni). Build: 1288 testów zielonych. Smoke (piętra 1–8, barbarzyńca): bez błędów. Przeglądarka (`?seed=7&floor=7`): Baron walczy, dog trzyma bok, smuga → telegraf → przywołanie z rogu → szarża → pościg → kłapnięcia; zabity dog wraca, po `debugDefeat` znika razem z Baronem.
- **Do oceny w testach właściciela:** czy imię, wygląd (czoło, brzuch, dym), liczby smugi i psa, zasięg i szybkość szarży, odstęp przywołania, zasięg „pilnowania” psa (90 px — pies atakuje, gdy podejdzie się do boku Barona), czytelność w szarym dymie. Do rozważenia: osobne kafle z rekwizytami palarni (stoły, popielnice) i animacja śmierci Barona (na razie błysk i ślad).

---

## Krok 84 — Zadymiona palarnia: popielniczki, pies w ścianie, śmieci `#decyzja` `#zadymiona-palarnia` `#baron-dymu`

Prośba właściciela: piętro Barona ma mieć **dymne pułapki w stylu popielniczki**, **wielkiego czarnego psa przegryzającego się przez ścianę, gdy zbliżysz się do krawędzi pokoju**, oraz **porozrzucane puszki po energetykach i opakowania KFC**.
- **Popielniczki** (`BiomeDefinition.puffballs` z `look: 'ashtray'`): to mechanika purchawek Grzybni (podejście budzi, telegraf 0,6 s, chmura 20 → 44 px wisi 4,5 s i truje jak kaszel, cios/strzał/dash przewraca ją od razu), ale z własnym arkuszem `ashtray.png` (szklana miska z popiołem i petami, żar w telegrafie, przewrócona po wybuchu) i szarą chmurą dymu `smoke-cloud.png`. 1–2 w zwykłym pokoju. Wygląd wybiera `PUFFBALL_VISUALS[config.look]`.
- **Pies w ścianie** (czysto: `systems/WallDogs.ts` — zapalnik `WallDogState`, `dungeon/WallDogPlanner.ts`; Phaser: `combat/WallDogManager.ts`): w ok. 30% zwykłych pokoi (najwyżej 3 na piętro, pokój min. 5 kafli, nie przy wejściu) w murze jest ledwo widoczna rysa (`wall-hole.png`). Gracz bliżej niż 52 px od niej → mur pęka 0,9 s (rysa rośnie, drży, wstrząs kamery), potem dziura i pies wypada na podłogę przed nią. Dziura zostaje (kolizja bez zmian). Pies to zwykły Rusher biomu.
- **Wielki czarny dog jako wróg palarni** (`EnemyVariant.BlackDog`, Rusher biomu zamiast ogara): promień 14, 45 HP, chód 140, gryzie 12 (zamach 0,4 s, hitRange 48); sprite doga z kroku 83. Wariant może teraz zmieniać promień ciała (`EnemyVariantDefinition.radius`). Pies Barona zostaje osobnym bossem-pomocnikiem.
- **Śmieci** (generator kafli `--biome smoke_den`, dodatek `smoke`, paleta `litter`): nakładki bez kolizji `decal.cans` (puszki, zgniecione, w kupkach), `decal.kfc` (czerwono-białe wiaderko z kośćmi i tłuszczem, pudełka z frytkami — bez logo) i `decal.butts` (pety i popiół); `SMOKE_DEN_DRESSING` ze zwiększoną gęstością (18% kafli), a ku arenie Barona gęstnieją opakowania.
- **Poprawka puszek (feedback właściciela, krok 84a):** zielone puszki wyglądały jak wskaźniki albo „kryptonit”. Teraz to **brązowe, zgniecione puszki** (wgniecenie, jedno srebrne denko, urwana zawleczka), a **jedna jest wyprostowana** (wariant `decal_can_b`) — klimat pokoju kogoś, kto siedzi przy komputerze i pije energetyki. Puszka w ręce Barona i rzucane puszki zostają zielone (to postać i pocisk, nie dekoracja).
- **Poprawka puszek nr 2 (krok 84b):** brązowe wyszły „tragicznie”. Teraz granatowa puszka w stylu coli (srebrne denka, biały pas z czerwoną kreską pośrodku — celowo bez logo żadnej marki); jedna wyprostowana, reszta leży, część zgnieciona.
- Testy: `tests/dungeon/WallDogPlanner.test.ts` (planer w murze, zapalnik, popielniczka), `tests/assets/smoker.test.ts` (nowe arkusze, grupy śmieci). Przeglądarka (`?seed=7&floor=7`): 3 psy w ścianach i 16 popielniczek na piętrze; zbliżenie do rysy → pękanie → dziura → nowy dog atakuje gracza.
- **Do oceny:** zasięg budzenia psa, gęstość psów i śmieci, siła popielniczek (kaszel jak purchawki), czytelność dziury (czarna plama), gęstość psów-Rusherów (teraz wszyscy Rusherzy palarni to dogi).

---

## Krok 85 — Śmierć Barona Dymu `#decyzja` `#baron-dymu` `#boss`

Prośba właściciela: animacja śmierci Barona w brązowej plamie jak u Sludge Kinga, a znad plamy unosi się dym.
- **Grafika** (`tools/smoker_sprites.py` → `smoke-baron_death.png`, 1024×1024, komórka 128, 8 kierunków, 8 klatek bez pętli, 6 kl./s): 0 ryk agonii, 1–3 ciało osiada i rozlewa się, 4–6 tonie w brązowej plamie z bąblami, 7 sama plama. Brąz i dithering brzegu jak szlam Sludge Kinga (STYLEGUIDE §4.5).
- **Plama zostaje**: `BossVisual.death.keepCorpse` — ostatnia klatka nie znika, tylko ląduje na głębokości śladów walki (pod postaciami).
- **Dym znad plamy**: `death.risingSmoke` + `SMOKE_VISUAL.rise` — przez 20 s co 0,32 s kłąb (klatka `smoke-puff`) pojawia się nad plamą, unosi o 52 px, rośnie i gaśnie; zaczyna się już w trakcie topnienia (`BossFight.startRisingSmoke`).
- Test `SmokeBaron.test.ts` (wygląd śmierci), `smoker.test.ts` (arkusz). Przeglądarka: po pokonaniu Barona plama brązowa na podłodze i kłęby dymu unoszące się nad nią, nagroda i schody jak zwykle.
- Uwaga poboczna (poza zakresem): plansza nagrody mówi „Strażnik pokonany” po każdym bossie (stary tekst).
- **Do oceny:** tempo animacji, wielkość plamy (promień 30 px), ilość i długość dymu.

---

## Krok 86 — Boss nietykalny z zewnątrz areny (koniec ostrzału zza krat) `#decyzja` `#boss`

Prośba właściciela po przeglądzie nagrania: naprawić **ostrzał bossa z zewnątrz areny** (stary punkt backlogu z kroku 9/21, „exploit zostaje do odwołania” — odwołany).
- **Reguła:** gdy gracz stoi poza prostokątem areny bossa, jego cios, strzał, promień, rozprysk kuli i dash **nie ranią** bossa, doga, pajączków ani kokonów spiżarni i **nie budzą bossa** (`BossFight.playerOutsideArena`, `roomContainsTile` jak przy aktywacji). Przy próbie pojawia się napis „Wejdź na arenę!” (najwyżej raz na sekundę). Walka zaczyna się dopiero z wnętrza areny, gdzie opadają kraty — to jedyna zmiana; sam boss ani jego liczby nie są łagodzone.
- Dotyczy wszystkich bossów (kod wspólny). Podpalenie nałożone wcześniej dalej zadaje obrażenia.
- Przeglądarka (`?seed=7&floor=7`): ze kafla tuż poza areną cios 360° o zasięgu 900 px → 0 trafień, HP bossa bez zmian, walka nie startuje; z wnętrza areny → 2 trafienia (boss i dog), HP spada, walka startuje.
- **Rozrzut puszek (feedback):** puszki to teraz pojedyncze kafle (leżąca, wyprostowana, zgnieciona, para) o większej wadze (4), więc są rozrzucone po wielu kaflach zamiast w kupkach.

---

## Krok 87 — Osłabienie łucznika (LPM) `#ocena` `#decyzja` `#lucznik`

Feedback właściciela: łucznik jest za mocny — obniżyć obrażenia i tempo ataku na LPM.
- **Obrażenia łuku:** kliknięcie 5 → 4, pełne naciągnięcie 24 → 18 (−25%; salwa PPM bez zmian).
- **Tempo LPM:** czas pełnego naciągnięcia 0,7 → 0,9 s, przerwa po strzale 0,25 → 0,4 s (łącznie najszybszy strzał pełny co ok. 1,3 s zamiast 0,95 s). Liczby moje — do potwierdzenia w testach właściciela.
- Testy łuku liczą z konfiguracji, więc przechodzą bez zmian.

---

## Krok 88 — Wyrównanie startowych obrażeń bohaterów `#ocena` `#decyzja` `#lucznik`

Feedback właściciela: obniżyć obrażenia po pełnym naciągnięciu i wyrównać startowy poziom obrażeń wszystkich bohaterów.
- **Punkt odniesienia — pojedyncze trafienie broni głównej:** cios barbarzyńcy 12, kula Czarodziejki 14 (bez zmian). Przed krokiem pełna strzała łucznika miała 18 (na Pages jeszcze 24 — krok 87 nie był wdrożony).
- **Łucznik:** pełne naciągnięcie 18 → 14 (jak kula), kliknięcie 4 → 3, strzała salwy 8 → 7 (jak strzał barbarzyńcy). Tempo z kroku 87 zostaje (0,9 s naciągu + 0,4 s przerwy).
- **Barbarzyńca i Czarodziejka bez zmian:** ich liczby już leżą w paśmie 12–14.
- **Obrażenia na sekundę celowo nie są równe:** barbarzyńca bije częściej (co 0,32 s), ale z bliska; łucznik ma ok. 11/s z pełnych strzał, za to z dystansu i z przebiciem; kule Czarodziejki to seria 3×14, potem 1 kula na 1,5 s, plus promień 25/s. Gdyby łucznik wydawał się za słaby, pierwszym pokrętłem jest `drawMs`, nie obrażenia.
- Testy łuku liczą z konfiguracji, więc przechodzą bez zmian. Build zielony (1307 testów). Liczby do potwierdzenia w testach właściciela.
- **Wdrożenie (22.10.2026, na prośbę właściciela):** PR #5 scalony (po scaleniu z main do kroku 90), smoke OK, gra na Pages z a94309d.

---

## Krok 89 — Bohater przy wpisie na liście wyników, testowo top 5 `#decyzja` `#highscore` `#ekran-smierci`

Prośba właściciela: oznaczyć przy wyniku bohatera, którym go osiągnięto (pomysł z backlogu), i testowo pokazać 5 najlepszych zamiast 3. (Numer 88 zajmuje równoległy krok wyrównania obrażeń w PR #5.)
- **Dane:** `ScoreEntry.hero` (opcjonalne, `HeroId` jako tekst). Gra zapisuje bohatera runu lokalnie, w kolejce offline i wysyła go do workera. Zgodność wstecz: stare wpisy (lokalne, w kolejce i z workera) nie mają pola i są wyświetlane bez oznaczenia; `null` z workera to brak pola; nieznany bohater (z nowszej wersji gry) zostaje w danych bez oznaczenia. Porównanie „ten sam wpis” na wspólnej liście pomija bohatera, bo stary worker go nie zwraca (bez tego wynik liczyłby się dwa razy).
- **Oznaczenie:** pełna nazwa małymi literami między imieniem a wynikiem — „2. Wicio · łucznik · 120 złota · piętro 4” (`DEATH_HERO_LABELS` w `config/deathScreenConfig.ts`, formatowanie w czystym `systems/deathScreen.ts` → `formatScoreRow`). Wybrałem nazwę zamiast skrótu albo ikony: czytelna bez legendy, a wiersz i tak mieści się w szerokości ekranu.
- **Top 5 (testowo):** `HIGHSCORE_CONFIG.podiumSize` 3 → 5; tablica ma teraz 7 wierszy (podium + „· · ·” + bieżący run), więc wiersze są gęstsze (krok 22 → 18 px, czcionka 14 → 13 px), a komunikat R / C zjechał o 6 px niżej (496 → 502). Test pilnuje, żeby ostatni wiersz nie wchodził na komunikat.
- **Worker (zmiana wymaga wdrożenia — jeszcze niewdrożony):** `POST /scores` przyjmuje opcjonalne `hero` (wzorzec `^[a-z_]{1,16}$`, żeby nowy bohater nie wymagał nowego workera), zapisuje je w nowej kolumnie `hero`, `GET /scores` je zwraca. Kolejność wdrożenia: najpierw migracja `worker/migrations/0002_scores_hero.sql`, potem `npx wrangler deploy` (opis w `worker/README.md`). Do tego czasu nowa gra działa ze starym workerem — wspólna lista po prostu nie ma oznaczeń.
- **Testy:** worker (walidacja i zapis bohatera, wpis bez bohatera), adapter workera (wysyłka, `null` → brak pola), wspólna lista (brak podwójnego liczenia przy starym workerze), wiersz tablicy (z bohaterem, bez, nieznany) i układ 7 wierszy. Build zielony (1316 testów).
- **Weryfikacja w przeglądarce:** Playwright z przygotowaną listą (mieszane wpisy z bohaterem i bez) i śmiercią łucznikiem, okna 1280×720, 800×450 i 640×400 — układ się nie rozjeżdża; w małych oknach całość jest tylko mniejsza (skala pixel-perfect, jak dotąd).
- **Wdrożenie (20.10.2026, na prośbę właściciela):** migracja bazy (kolumna `hero`), worker (sekrety i cron zachowane; `GET /scores` zwraca `hero`, zły bohater → 400), smoke OK, gra na Pages z 3e31fb8 (zawiera też niewdrożone wcześniej kroki 85–87; bez kroku 88 z PR #5).
- **Do oceny właściciela:** czy zostajemy przy top 5, czy oznaczenie ma być nazwą, skrótem czy ikoną.

---

## Krok 89a — Miniaturka bohatera zamiast nazwy `#ocena` `#highscore` `#ekran-smierci`

Feedback właściciela po kroku 89: przy wyniku ma być miniaturka wskazująca bohatera, nie pełne słowo.
- **Miniaturka:** pierwsza klatka chodu z arkusza bohatera zwrócona w dół (jak na ekranie wyboru), kadr 32×32 z klatki 48×48 zmniejszony z wygładzaniem do 22×22 px (skalowanie najbliższym sąsiadem gubiło piksele). Tekstura powstaje raz na bohatera z płótna (`DeathScreen.heroIcon`), bez nowej grafiki i generatora; liczby w `DEATH_HERO_ICON` (`config/deathScreenConfig.ts`).
- **Układ:** miniaturki stoją w jednej kolumnie przed najszerszym wierszem (wiersze są wyśrodkowane, więc ikony przy każdym wierszu osobno skakałyby w poziomie). Wpis bez bohatera i separator „· · ·” są bez ikony. Wiersz tekstu wrócił do postaci sprzed kroku 89 („2. Wicio · 120 złota · piętro 4”); `DEATH_HERO_LABELS` usunięte, `knownHero` w `systems/deathScreen.ts` odsiewa wpisy bez bohatera i z nieznanym bohaterem.
- **Testy:** wiersz bez nazwy bohatera, `knownHero`, miniaturka mieści się w wierszu i kadr w klatce. Build zielony.
- **Weryfikacja:** zrzuty Playwright 1280×720, 800×450, 640×400 — kolumna miniaturek równa, układ bez zmian; postacie rozpoznawalne po kolorach (blond barbarzyńca, niebieska Czarodziejka, zielony łucznik).

---

## Krok 90 — Tryb testowy „Areny bossów” `#decyzja` `#areny-bossow` `#boss`

Prośba właściciela: dodatkowy, na razie testowy moduł, w którym walczymy tylko z bossami i ich pomocnikami — od razu na arenie bossa, po pokonaniu bossa i przeciwników wybór jednego przedmiotu i teleport na kolejną arenę.
- **Wybór trybu:** na ekranie wyboru bohatera, pod kartami, dwie zakładki: „WSPINACZKA” i „ARENY BOSSÓW · TEST” (↑ ↓ / W, S / Tab albo kliknięcie), pod nimi jednolinijkowy opis trybu. Wybrałem ten ekran zamiast animacji tytułowej, bo to pierwszy ekran z wyborem — tryb nie dokłada zwykłej grze ani jednego kliknięcia (domyślnie zaznaczona wspinaczka). `?mode=arenas` (z `?hero=…`) wchodzi od razu w areny, `&floor=N` zaczyna od areny N.
- **Arena N = arena bossa piętra N:** ten sam generator, biom, boss i skalowanie co we wspinaczce (także kolejne kręgi od areny 8). Gracz startuje w arenie (jak `?boss=1`), kraty opadają od razu. Na piętrze nie ma wrogów w pokojach, kapliczki, pułapek, urn, zasadzki, ukrytej komnaty, pająków z sufitu, kokonów, pajęczyn, purchawek, psów w ścianach, palenisk spoza areny, zapowiedzi bossa ani modyfikatora piętra. Wszystko, co należy do walki z bossem (pajączki, spiżarnia, świta, dog, galerie Strażnika Bram, paleniska Kata), działa bez zmian.
- **Przebieg areny** (czysta maszyna stanów `systems/BossRush.ts`): walka → (jeśli zostali pomocnicy, np. z galerii albo świty: komunikat „Pokonaj pozostałych przeciwników!”) → karty nagrody (te same co za bossa, 1 z 3) → 2 s odliczania (czas na zebranie łupu z bossa; to, co zostanie, gracz dostaje przy teleporcie) → fioletowe wygaszenie i kolejna arena. HP i przedmioty przechodzą dalej jak między piętrami. Liczby w `config/bossRushConfig.ts`.
- **Wyniki:** areny **nie zapisują wyniku** (ani lokalnie, ani na wspólnej liście) i nie pytają o imię. HUD: „Arena 3 · Król Pająków” i „Złoto: N (areny bossów — bez wyniku)”; ekran śmierci: „N ZŁOTA · ARENA 5”, „ARENY BOSSÓW — WYNIK NIE TRAFIA NA TABLICĘ”, R — areny od nowa, C — ekran wyboru z zaznaczonymi arenami. Wspinaczka i lista wyników bez zmian (`RunSnapshot.mode` pojawia się tylko w arenach).
- **Testy:** maszyna stanów areny (nagroda od razu albo po pomocnikach, odliczanie od pierwszej klatki po wyborze, brak nagrody po śmierci), tryb z adresu, przenoszenie trybu między arenami i zgodność wsteczna zwykłego runu, napis areny, układ zakładek na ekranie wyboru. Build zielony (1329 testów).
- **Weryfikacja w przeglądarce (Playwright):** ekran wyboru z zakładkami; areny 1→6 po kolei (pokonanie bossa, karty, teleport, przedmioty się sumują), arena 5 — galerie: faza dobijania, nagroda dopiero po ostatnim; arena 7 (Baron Dymu z dogiem) startuje; śmierć — panel bez tablicy, brak zapisu w `localStorage`, R wraca na arenę 1. `npm run smoke` (wspinaczka, 3 piętra, wszyscy bohaterowie) — OK.
- **Wdrożenie (22.10.2026, na prośbę właściciela):** PR #8 scalony, smoke (piętra 1–7, wszyscy bohaterowie) OK, gra na Pages z 30138f4.
- **Do oceny właściciela:** czy HP ma się odnawiać między arenami (teraz przechodzi jak między piętrami — tylko mikstury z łupu bossa leczą), czy dodać złoto/wynik i osobną tablicę dla aren, czy kolejność aren ma być losowa, czy wybór trybu ma trafić na samą animację tytułową.

---

## Krok 86a — Napis „Wejdź na arenę!” tylko przy ataku na bossa `#ocena` `#boss`

Zgłoszenie właściciela z nagraniem: napis „Wejdź na arenę!” pojawia się non stop podczas zwykłej walki na piętrze, daleko od areny.
- **Przyczyna (błąd kroku 86):** `BossFight` żyje przez całe piętro i dostaje każdy cios, promień i pocisk gracza. Poza areną `warnUntouchable` wyświetlał napis przy każdym ataku (co sekundę), niezależnie od tego, czy atak w ogóle sięgał bossa — u łucznika i Czarodziejki pocisk w locie wywoływał go w każdej klatce.
- **Poprawka:** napis pojawia się tylko wtedy, gdy atak spoza areny naprawdę dotknąłby bossa albo jego pomocnika (doga, pajączka, kokonu). Zasięg sprawdzają nowe czyste predykaty bez zadawania obrażeń: `swingReaches` (`systems/MeleeResolver.ts`), `beamReaches` (`systems/Sorcery.ts`), `shotTouches` (`systems/ShotResolver.ts`); rozstrzyganie trafień korzysta z tych samych funkcji, więc warunki się nie rozjadą. Reguła nietykalności z kroku 86 bez zmian.
- **Testy:** `tests/systems/attackReach.test.ts` (cios, promień, pocisk; predykat zgodny z `resolveMeleeSwing`, nie rani celu). Build zielony (1319 testów).
- **Przeglądarka (`?seed=7&floor=2`, 40 ataków LPM/PPM w pierwszych pokojach):** przed poprawką 16–21 napisów (Czarodziejka, barbarzyńca, łucznik), po poprawce 0.
- **Wdrożenie (22.10.2026, na prośbę właściciela):** PR #7 scalony (po scaleniu z krokiem 90), smoke OK, gra na Pages z efdd2e0.

## Krok 91 — Menu główne, zapis gry i wybór piętra `#ekran-startowy` `#zapis-gry` `#wybor-pietra`

Prośba właściciela: „ekran startowy z prawdziwego zdarzenia”, trzeci tryb i save/load. Trzeci tryb wg właściciela: **swobodny wybór poziomu** — nowy run od piętra, którego bossa gracz pokonał, żeby szybciej dojść do kolejnych kręgów.
- **Menu główne (`scenes/MenuScene.ts`, `systems/mainMenu.ts`, `config/menuConfig.ts`):** po intrze ekran startowy nie gaśnie — wieża, zaćmienie, popiół i żarzące się pęknięcia zostają jako tło (`SplashScene.holdForMenu`), a na nim lewy panel z pozycjami i prawy z opisem zaznaczonej. Pozycje: Kontynuuj, Nowa wspinaczka, Areny bossów · test, Wybór piętra, Wczytaj grę, Sterowanie. ↑ ↓ / W S / mysz, Enter / Spacja / klik, Esc wraca. Pominięcie intra przeskakuje od razu do menu. Powrót z gry (pauza → M, ekran śmierci → M) i z ekranu wyboru bohatera (Esc) otwiera menu bez intra i bez ponownego ładowania. `?hero=` w adresie dalej pomija menu i wybór (testy, smoke).
- **Zapis gry (`systems/SaveGame.ts`, `persistence/SaveStorage.ts`, `config/saveConfig.ts`):** zapis to **punkt kontrolny z wejścia na piętro** (seed runu, piętro, bohater, złoto, przedmioty, HP, tryb) — piętra są deterministyczne, więc wczytanie odtwarza piętro od początku. Stan w trakcie piętra nie jest zapisywany (wymagałoby to serializacji całego świata).
  - **Autozapis „Kontynuuj”:** przy wejściu na każde piętro (arenę); **znika po śmierci**; run z autozapisu zachowuje miejsce na tablicy (to ten sam run).
  - **Ręczne sloty 1–3:** w pauzie klawisze 1 / 2 / 3 albo klik wiersza; w menu „Wczytaj grę” (X / Delete dwa razy usuwa). Run wczytany ze slotu dostaje znacznik `fromSave` i **nie trafia na tablicę** (`SAVE_CONFIG.manualLoadRanked = false`, inaczej wystarczy wczytywać przed trudnym piętrem) — do decyzji właściciela.
  - Uszkodzony albo obcy wpis w magazynie = pusty slot; zablokowany magazyn — zapis w pamięci sesji. Odtwarzanie nagrania (`__replay`) nie rusza zapisów.
- **Wybór piętra (`RunMode.FloorSelect`, `systems/FloorSelect.ts`, `persistence/BossProgress.ts`, `config/floorSelectConfig.ts`):** pokonanie bossa we wspinaczce (albo w wyborze piętra; nie w runie testowym z adresu ani w arenach) zapisuje najwyższe pokonane piętro. W menu ← → wybiera piętro 1…najwyższe (z kręgiem, biomem i bossem w opisie), potem zwykły ekran wyboru bohatera i zwykła wspinaczka od tego piętra, z pustymi rękami i pełnym HP. R po śmierci zaczyna od tego samego piętra. **Wynik nie trafia na tablicę** (`FLOOR_SELECT_CONFIG.ranked = false`: wyższe piętra dają więcej złota) — do decyzji właściciela.
- **Pauza:** sekcja zapisu (sloty z opisem: bohater, piętro, złoto, przedmioty, data) i „M — menu główne”.
- **Testy:** `tests/systems/saveGame.test.ts` (zapis↔odczyt, odrzucanie uszkodzonych danych, ranking autozapisu i slotu, opis, odmiana „przedmiot”), `tests/persistence/saveStorage.test.ts`, `tests/systems/mainMenu.test.ts`, `tests/systems/floorSelect.test.ts`. Build zielony (1371 testów).
- **Przeglądarka (Playwright, Chromium):** intro → menu; nowa wspinaczka → wybór bohatera → Esc → menu; gra → pauza → zapis w slocie 2 → M → menu z aktywnym „Kontynuuj”; wybór piętra (postęp 9) → piętro 8 · Krąg II, tryb `floor-select`; śmierć → autozapis usunięty, nagłówek „WYBÓR PIĘTRA — WYNIK NIE TRAFIA NA TABLICĘ”, R → znów piętro 8; M → menu → wczytanie slotu 1 → piętro 8 z `fromSave`. `B` (pokonaj bossa) w zwykłym runie zapisuje postęp, w runie testowym `?floor=3` — nie. Smoke (`--floors 2 --seeds 1`, trzech bohaterów) OK.

## Krok 91a — Osobna tablica wyników aren bossów `#areny-bossow` `#decyzja` `#wybor-pietra`

Decyzje właściciela po kroku 91: `#decyzja`
- **Wybór piętra:** start od wyższego piętra **nie daje niczego** — pierwsze piętra mają służyć do wyfarmienia się przed end game; tryb na razie **bez tablicy wyników**.
- **Areny bossów:** osobna tablica wyników, „by pogromcy bossów mogli mierzyć swoje wyniki”.

Co powstało:
- **Ranking aren (`compareArenaScores` w `systems/Highscores.ts`):** najpierw osiągnięta arena (`floor` wpisu), przy remisie więcej złota. `insertScore` i `buildScoreboard` przyjmują porządek tablicy (domyślnie wspinaczka).
- **Lokalnie i wspólnie:** `HighscoreStorage` i `SharedHighscores` z własnym kluczem, kolejką i porządkiem; tablice opisuje `HIGHSCORE_BOARDS` (`config/lootConfig.ts`). Adapter workera dostał trasę (`/arena-scores`).
- **Worker:** `GET/POST /arena-scores`, tabela `arena_scores` (`schema.sql`, migracja `migrations/0003_arena_scores.sql`), te same zasady wpisu, limity liczone osobno dla każdej tablicy. **Wymaga migracji i wdrożenia workera** — do tego czasu gra trzyma wyniki aren lokalnie (kolejka wyśle je później).
- **Ekran śmierci w arenach:** imię jak we wspinaczce, nagłówek „NAJLEPSZE ARENY” (· WSZYSCY GRACZE), wynik „ARENA N · X ZŁOTA · MIEJSCE M”, wiersze „arena N · X złota”. Run aren ze slotu albo testowy z adresu dalej bez tablicy.
- Teksty trybu (menu, ekran wyboru, HUD, toast) mówią o tablicy aren zamiast „bez wyniku”.
- **Testy:** `tests/systems/arenaHighscores.test.ts` (porządek, miejsce, rozdzielne magazyny i kolejki, trasa adaptera), `tests/worker/index.test.ts` (tabela i kolejność aren, osobne limity). Build zielony (1379 testów).
- **Przeglądarka:** menu z `?mode=arenas` → Łucznik → śmierć na arenie 3 z 450 złota przy tablicy [Ala: arena 4 / 120, Zbyszek: arena 2 / 900] → miejsce 2 (przed Zbyszkiem mimo mniejszego złota); tablica wspinaczki nietknięta.

---

## Krok 92 — Kliknięcia poza planszą nie blokują ruchu `#ocena`

Zgłoszenie właściciela (test w MS Edge): PPM w ciemne pole obok planszy i bohater utknął w narożniku, ciągle idąc w prawo. `#ocena`

Przyczyna: Phaser wyłącza menu kontekstowe tylko na płótnie. PPM obok płótna otwierał menu przeglądarki, menu przejmowało klawiaturę i puszczenie klawisza ruchu nie docierało do gry — klawisz zostawał „wciśnięty”. Do tego Phaser przetwarza kliknięcia poza płótnem (nasłuch na `window`), więc taki klik był też strzałem w ciemne pole.

Co powstało:
- **`systems/PageInputGuard.ts`** (bez Phasera i bez DOM-u wprost, podpięty w `main.ts`):
  - menu kontekstowe zablokowane na całej stronie gry (tło, kontener, płótno); nakładki DOM (raport F9) zachowują zwykłe menu;
  - klik myszą poza płótnem (nie w nakładkę) jest anulowany w fazie przechwytywania — gra go nie widzi, nie ma też zmiany fokusu ani zaznaczenia;
  - gdy menu mimo to się otworzy (nad nakładką) albo karta zostanie ukryta, wszystkie sceny dostają `resetKeys()`; zdarzenie `input-released` trafia do diagnostyki. Utratę fokusu okna (`blur`) Phaser obsługuje sam.
- **Testy:** `tests/systems/PageInputGuard.test.ts` (menu nad grą/płótnem/nakładką, klik poza płótnem, ukrycie karty, zdjęcie strażnika). Build zielony (1385 testów).
- **Przeglądarka (Chromium, dev):** w grze `contextmenu` i `mousedown` na tle strony są anulowane, PPM obok płótna nie wciska przycisku wskaźnika; trzymany D po ukryciu karty jest puszczony. Natywnego menu Edge nie da się sprawdzić w automacie — czeka na test właściciela.

## Krok 93 — Balans Wampirzego kła i Ognistej pięści `#decyzja` `#ocena` `#balans`

Zgłoszenie właściciela: tester po raz kolejny wbił najwyższe piętro i najwyższy wynik na combo kieł + podpalenie — oba efekty rosły liniowo z każdą kopią i bez sufitu (5 kłów: ok. 14 HP/s, 5 pięści: 22 DPS na każdego podpalonego, bossowie bez odporności). `#ocena`

Decyzja właściciela: zestaw A + B + C + F z propozycji (dokument „Balans: Wampirzy kieł + Ognista pięść”), jednym krokiem, ale w osobnych commitach (93a–93d), bez cięcia bazowych obrażeń gracza. `#decyzja`

Co powstało:
- **93a — malejące przyrosty** (`systems/WeaponEffects.ts`, `stackDecay: 0.5` w `ITEM_EFFECTS`): każda kolejna kopia dodaje połowę przyrostu poprzedniej. Kieł: 2 / 4 / 5 / 6 / 6 HP (było do 10), pięść: tyknięcie 3 / 5 / 6 / 7 / 7 (było do 11). Pierwsze dwie kopie bez zmian.
- **93b — sufit leczenia kła** (`systems/HealBudget.ts`, `vampireFang.maxHpPctPerSec: 0.04`): wiadro żetonów, najwyżej 4% maks. HP na sekundę (zapas na 1 s). Barbarzyńca 100 HP: 4 HP/s, Czarodziejka 75 HP: 3 HP/s. Jedna kopia (2,9 HP/s) mieści się pod sufitem; Serce podnosi sufit.
- **93c — kieł tylko za wrogów** (`GameScene`): cios i pocisk leczą tylko po trafieniu wroga lub bossa (pajączki, dog, pomocnicy też), nie kokonu (również spiżarni), purchawki, urny czy skrzyni.
- **93d — odporność bossów na ogień** (`StatusResistance.burnMultiplier`, `BOSS_STATUS_RESISTANCE`: 0,5): tyknięcie na bossie ma połowę siły (co najmniej 1 HP), spójnie z odpornością na ogłuszenie i spowolnienie.
- **Odłożone (w odwodzie, jeśli tester dalej wygrywa tym samym):** D — podpalenie pełne tylko na głównym celu, E — bez stałego odświeżania ognia, G — „gnilizna” od 2. kręgu (leczenie −25% na krąg).
- **Testy:** `tests/systems/healBudget.test.ts` (sufit, zapas, jedna kopia pod sufitem), w `itemEffects.test.ts` malejące przyrosty i odporność bossa na ogień. Build zielony (1394 testy). `npm run smoke -- --floors 3 --seeds 1` (wszyscy bohaterowie) bez błędów.
- **Czeka na test właściciela / testera:** czy combo dalej łamie późną grę; czy 4% to nie za mało (alternatywa 6%).

---

## Krok 94 — Najlepsze wyniki na ekranie startowym `#ekran-startowy` `#areny-bossow`

Propozycja właściciela: na środku ekranu startowego mniejsza lista najlepszych wyników wspinaczki i aren, „tak by przy włączeniu można było zobaczyć, czy ktoś nie pobił twojego poprzedniego wyniku”.

Co powstało:
- **Środkowy panel menu (`effects/StartScoresPanel.ts`, `MENU_LAYOUT.scores`, `MENU_SCORES` w `config/menuConfig.ts`):** między panelem pozycji a panelem opisu, przezroczystszy od bocznych (wieża prześwituje). Dwie sekcje: **WSPINACZKA** i **ARENY BOSSÓW**, po 3 najlepsze wpisy (`topCount`); imiona wyrównane w kolumnie, wiersz aren: „arena N · X zł”. Za długi wiersz jest zwężany, nie wychodzi poza panel.
- **Własne wyniki:** „własny” = wpis z lokalnej listy tej przeglądarki (rozpoznany po złocie, piętrze, czasie i imieniu). Na wspólnej liście własne wiersze świecą na złoto; najlepszy własny rekord spoza top 3 dochodzi wierszem „Ty: 7. Wicio  340 zł · piętro 3”.
- **„Ktoś cię wyprzedził”:** menu pamięta miejsce najlepszego własnego rekordu z ostatniego wejścia (`persistence/SeenRankStorage.ts`, klucze `seenKey` w `HIGHSCORE_BOARDS`). Gdy ten sam rekord spadł — czerwony wiersz „▼ ktoś cię wyprzedził: 2. → 4.” (albo „wyprzedzili cię: było 2. miejsce”, gdy wypadł z listy 50). Nowy, lepszy rekord nie liczy się jako spadek. Zdarzenie `highscore-overtaken` trafia do diagnostyki.
- **Ładowanie:** od razu lista lokalna (nagłówek „· ŁĄCZENIE…”), po odpowiedzi workera wspólna („· WSZYSCY GRACZE”). Przy okazji leci zaległa kolejka wyników (`SharedHighscores.fetchShared`). Bez sieci zostaje lista lokalna bez oznaczeń i bez ostrzeżeń. Spóźniona odpowiedź po wyjściu z menu nie rysuje się.
- **Czysta logika:** `systems/startScoreboard.ts` (`buildStartBoard`, `startBoardLines`); `isSameEntry` przeniesione do `systems/Highscores.ts`. Tworzenie obu tablic w jednym miejscu: `persistence/highscoreBoards.ts` (`createBoardHighscores`, `BOARD_ORDER`) — używa go ekran śmierci i menu.
- **Testy:** `tests/systems/startScoreboard.test.ts` (top, własne, wiersz „Ty”, spadek, nowy rekord, wypadnięcie z listy, porządek aren, format wierszy), `tests/persistence/startScores.test.ts` (`fetchShared` z kolejką i bez sieci, `localEntries`, pamięć miejsca). Build zielony (1400 testów).
- **Przeglądarka (Playwright, Chromium, worker podstawiony):** intro → menu; najpierw „ŁĄCZENIE…” z wynikami lokalnymi, potem wspólna lista: Zbyszek / Ala / Ola, „Ty: 4. Wicio”, „▼ ktoś cię wyprzedził: 2. → 4.”; areny: Wicio na 1. miejscu na złoto. Po przeładowaniu ostrzeżenie znika (zapamiętane 4. miejsce). Smoke (`--floors 1 --seeds 1`, trzech bohaterów) OK.
- **Czeka na ocenę właściciela:** położenie panelu (zasłania wieżę), liczba wpisów (3), ostrzeżenie pokazywane raz.

### Krok 94a — Wyniki bez panelu `#ocena` `#ekran-startowy`

Ocena właściciela: „nie pasuje mi ten widok” — usunąć obramowanie, wyniki przezroczyste, bez dopisku „wszyscy gracze” w tytule. `#ocena`
- Środek menu bez tła i ramki: same wiersze tekstu z ciemnym cieniem (`MENU_PALETTE.textShadow`, `MENU_LAYOUT.scores.shadowBlur`), wieża widoczna w całości.
- Nagłówki listy wspólnej to po prostu „WSPINACZKA” i „ARENY BOSSÓW”; „· ŁĄCZENIE…” zostaje na czas pobierania. Ekran śmierci bez zmian.
- Build zielony (1409 testów); zrzut z Playwrighta: tekst czytelny na tle wieży.

### Krok 94b — Wyśrodkowane tytuły i miniaturki bohaterów `#ocena` `#ekran-startowy`

Prośba właściciela: tytuły list na środku i miniaturki postaci, którymi ustalono wyniki. `#ocena`
- Tytuły „WSPINACZKA” i „ARENY BOSSÓW” (i wiersze bez wyniku: brak wyników, ostrzeżenie) wyśrodkowane; wiersze wyników to wyśrodkowany blok z kolumną miniaturek po lewej (16 px, ten sam kadr co na ekranie śmierci, `MENU_LAYOUT.scores.icon`). Wpis bez bohatera (sprzed kroku 89) albo z nieznanym bohaterem — bez miniaturki, wiersz w tej samej kolumnie.
- Rysowanie miniaturki wydzielone do `effects/heroIcon.ts` (`heroIconTexture`) — korzystają z niego ekran śmierci i menu. `StartBoardLine.hero` niesie bohatera wiersza (`knownHero`).
- **Numeracja:** równoległy wątek balansu też użył numeru 93, więc ten krok (dawniej 93/93a) to **94/94a/94b**.

## Krok 95 — Gniazda wejścia i pad w wersji PC `#sterowanie` `#decyzja`

**Decyzja właściciela (24.10.2026):** wersja mobilna będzie osobną grą w tym samym repozytorium (`src/mobile/`, `mobile.html`), dzieląc logikę z wersją PC. Ocena wcześniejszych prób sterowania dotykowego (gałąź `claude/bold-tesla-xr76xu`, jej kroki „49–49d” to **nie** te same kroki co zasadzki w main) i zgoda na plan: najpierw „gniazda” wejścia w kodzie PC i pad, potem przeniesienie dotyku na aktualny main. `#decyzja`

Co powstało:
- **Pad w walce (`input/InputController.ts`):** lewa gałka albo krzyżak — ruch (analogowy, z martwą strefą), prawa gałka — celowanie, RT — atak LPM (cios, kule, naciąganie łuku), LT albo RB — atak PPM (strzał, promień, salwa), A albo LB — dash, X — interakcja (E). Pad i klawiatura się sumują; celowanie bierze ostatnio używane urządzenie (ruch lub klik myszy oddaje cel myszy, użycie pada — padowi). Bez prawej gałki cel idzie za ruchem, a gdy bohater stoi — zostaje ostatni kierunek. Encje nadal dostają tylko `PlayerActions`; nagrywanie wejść (F9) działa bez zmian.
- **Pad poza walką:** wspólne komendy menu (`MenuCommand`: góra/dół/lewo/prawo, potwierdź, wstecz, dodatkowa, pauza). Menu główne i wybór bohatera tłumaczą klawisze na te same komendy (`menuCommandFromKey`), więc klawiatura działa jak dotąd, a pad (krzyżak lub gałka z powtarzaniem, A, B, Y) dochodzi bez osobnej logiki. Ekran startowy: dowolny przycisk pomija. Pauza: Start — pauza i wznowienie, B — wznów, ↑ ↓ + A — zapis w slocie (znacznik ▶), Y — menu główne. Nagroda za bossa: ← → zaznacza kartę, A wybiera (tylko po uaktywnieniu kart). Ekran śmierci: A — nowa wspinaczka (R), Y — zmiana bohatera (C), B — menu (M); przy wpisywaniu imienia A zapisuje wpisane z klawiatury, B pomija.
- **Ochrona przed przypadkowym wyborem:** przycisk trzymany przy wejściu na ekran liczy się dopiero po puszczeniu (`ButtonEdges`), więc A z wyboru bohatera nie robi dasha, a spust z walki nie wybiera nagrody. Na ekranie śmierci pad czeka `deathInputDelayMs` (1,5 s), żeby dash wciskany w chwili śmierci nie restartował runu. R / C / M i pad nie mogą już wywołać dwóch akcji naraz.
- **Odczyt pada:** prosto z Gamepad API przeglądarki (`input/padSnapshot.ts`), bez wtyczki pada Phasera (jej stan żyje osobno w każdej scenie). Przeglądarka pokazuje pad dopiero po pierwszym wciśnięciu przycisku. Podłączenie i odłączenie pada trafia do dziennika diagnostyki (`gamepad-connected` z nazwą i układem).
- **Liczby w `config/gamepadConfig.ts`:** martwe strefy (ruch 0,2, celowanie 0,35), próg spustów, przyciski akcji, powtarzanie w menu, opóźnienie po śmierci. Standardowy układ W3C (Xbox; na PlayStation A = ✕, B = ○, X = □, Y = △).
- **Pauza:** dwie linie z układem pada, sloty i dolne napisy przesunięte niżej.
- **Czysta logika:** `systems/gamepadInput.ts` (`stickVector`, `ButtonEdges`, `PadGameplayReader`, `padAimDirection`, `combineMovement`, `menuCommandFromKey`, `PadMenuReader`).
- **Testy:** `tests/systems/gamepadInput.test.ts` (20 przypadków: martwa strefa, zbocza i trzymany przycisk, spusty, dash jednorazowy, kierunek celowania, komendy z klawiszy, powtarzanie i próg gałki w menu). Build zielony (1432 testy).
- **Przeglądarka (Playwright, Chromium, wirtualny pad podstawiony pod `navigator.getGamepads`):** menu ↓ ↑ A → wybór bohatera → → A → gra; lewa gałka przesuwa bohatera, prawa obraca cel o 180°, sama lewa gałka obraca cel za ruchem; Start → pauza, ↓ zaznacza slot, B → wznowienie; ruch myszy odbiera celowanie padowi. Nagroda: A przed uaktywnieniem nic nie robi, → → A bierze kartę. Śmierć: A po 0,5 s nic nie robi, Y po 2 s otwiera wybór bohatera. Bez błędów w dzienniku.
- **Następny krok (plan):** wersja mobilna jako osobna strona (`mobile.html`, `src/mobile/`) z dotykiem przeniesionym z gałęzi testowej na te same gniazda; łucznik na dotyku, przycisk pauzy; osobna tablica wyników dla telefonu (wspomaganie celowania).
- **Czeka na ocenę właściciela:** układ przycisków pada, martwe strefy, cel za ruchem bez prawej gałki, 1,5 s na ekranie śmierci. Podpowiedzi na ekranach (HUD, śmierć, wybór bohatera) są nadal klawiaturowe — do decyzji, czy zmieniać je zależnie od urządzenia.

## Krok 96 — Wersja mobilna jako osobna strona `#sterowanie` `#decyzja`

**Decyzja właściciela (24.10.2026):** „Test [pada] odkładam na później, wdrażać wersję mobilną”. Dotyk z gałęzi testowej `claude/bold-tesla-xr76xu` przeniesiony na aktualny kod jako osobna gra w tym samym repozytorium, bez scalania starej gałęzi. `#decyzja`

Co powstało:
- **Dwie strony, jeden kod:** `index.html` → `src/main.ts` (PC), `mobile.html` → `src/mobile/main.mobile.ts` (telefon). Obie startują przez `src/bootstrap.ts` (`startGame`: sceny, zegar pauzy, diagnostyka, strażnik wejścia, pad, skala). Build Vite robi obie strony; gra PC nie zawiera kodu mobilnego (osobny plik `mobile-*.js`). `npm run dev:phone` otwiera `/mobile.html` z dostępem z sieci lokalnej.
- **Gniazda we wspólnym kodzie (niewidoczne na PC):** `input/playerInput.ts` (źródło sterowania; domyślnie `InputController`, telefon podstawia `TouchInput`), `core/platform.ts` (`pc`/`mobile`), w `GameScene`: cele automatycznego celowania (widoczni wrogowie, boss, pies, pajączki), `requestPause()`, `deathChoice` / `deathCommand()` / `submitPlayerName()` dla przycisków śmierci, `heroKit`; `HudData.canInteract` (schody pod bohaterem albo kapliczka, na którą go stać; `ShrineSite.canOffer`), `BossFight.aimTargets`. Napis „M — menu główne” na pauzie da się kliknąć także na PC. `InputController` dostał opcję `mouse: false` (telefon udaje kliknięcia myszą po dotyku).
- **Dotyk (`src/mobile/`, z kroków „49–49d” gałęzi testowej):** pływające gałki — lewa część ekranu ruch, prawa atak (przeciągnięcie celuje, stuknięcie celuje samo w najbliższego widocznego wroga); przycisk STRZAŁ / PROMIEŃ / **SALWA** (łucznik) działa jak gałka: przytrzymaj i przeciągnij w stronę celu, przytrzymanie bez przeciągania celuje samo; ZRYW; E tylko tam, gdzie coś zrobi; **nowy przycisk pauzy** (II pod minimapą, działa po puszczeniu palca). Łucznik: przeciągnięta gałka ataku napina łuk, puszczenie strzela. Dotyk działa też w czarnych pasach obok płótna. Ekran śmierci: przyciski NOWA WSPINACZKA / ZMIEŃ BOHATERA / MENU, a przy pierwszej śmierci PODAJ IMIĘ (okno przeglądarki) / BEZ IMIENIA; napisy klawiszy na telefonie ukryte. Menu, wybór bohatera, nagroda i pauza działają stukaniem (Phaser). Pauza ma opis dotyku zamiast klawiszy.
- **Skala ułamkowa tylko w wersji mobilnej** (`pixelPerfectScale({ fractional })`, wyjątek dopisany do STYLEGUIDE §2), wysokość z `visualViewport`, centrowanie płótna przez CSS, przeliczenie po obrocie i pełnym ekranie; pierwszy dotyk prosi o pełny ekran w poziomie; w pionie plansza „Obróć telefon poziomo”.
- **Osobna tablica wyników telefonu:** tylko lokalna (klucze `….mobile` w `localStorage`, bez workera), bo stuknięcie celujące samo ułatwia grę. Wspólna tablica telefonów — do decyzji.
- **Czysta logika:** `systems/touchAim.ts` (`stickState`, `stickToMovement`, `assistAimDirection`, `touchAimDirection`, `autoAimDirection`), liczby w `config/touchConfig.ts` (`TOUCH_AUTO_AIM_RANGE: 0` wyłącza celowanie samo).
- **Testy:** `tests/systems/touchAim.test.ts` (gałki, wspomaganie w stożku, kolejność gałek, celowanie samo, zasięg 0), skala ułamkowa w `pixelScale.test.ts`, test architektury: żaden plik poza `src/mobile/` nie importuje `@/mobile/`. Build zielony (1664 testy).
- **Przeglądarka (Playwright, emulacja Pixel 7 w poziomie):** płótno 640×360 na pełną wysokość ekranu 863×360 (pasy po bokach); gałka ruchu w lewym pasie rusza bohatera; gałka ataku obraca cel o 180°; SALWA przeciągnięta w dół strzela w dół i zużywa ładunki; przycisk pauzy → pauza, stuknięcie → wznowienie; menu → NOWA WSPINACZKA → karta bohatera → gra stukaniem; śmierć → PODAJ IMIĘ (okno) → wynik w `tower-crawler.highscores.v1.mobile`; ZMIEŃ BOHATERA → wybór bohatera. Wersja PC: test z wirtualnym padem i smoke bez zmian.
- **Czeka na ocenę właściciela (na prawdziwym telefonie):** układ i wielkość przycisków, celowanie samo (zasięg 280 px), opóźnienie 150 ms strzału, pauza pod minimapą, tablica tylko lokalna. Nie wdrożone na Pages.

### Krok 96a — Nowy układ przycisków na telefonie `#ocena` `#sterowanie`

Ocena właściciela po teście na telefonie: sterowanie „lekko kalekie”, nie widać ataku. Prośba: wielkie kółko ataku podstawowego, wyżej i bardziej w prawo atak z PPM, po lewej od kółka dash. „Gra lekko przycina” — do sprawdzenia później. `#ocena`
- **Prawa ręka:** duże kółko ataku LPM (ATAK / KULA / ŁUK) w prawym dolnym rogu, nad nim i w prawo przycisk PPM (STRZAŁ / PROMIEŃ / SALWA), po lewej od kółka ZRYW, nad zrywem E (tylko gdy coś zrobi). Pauza bez zmian. Liczby w `TOUCH_BUTTONS` (`config/touchConfig.ts`).
- **Oba przyciski ataku działają tak samo:** przeciągnięcie w stronę celu celuje ręcznie i atakuje (łucznik: napina łuk, puszczenie strzela), przytrzymanie bez przeciągania po 150 ms atakuje z celowaniem samym, stuknięcie to jeden atak w najbliższego wroga. Niewidoczna strefa ataku na prawej połowie ekranu zniknęła; ruch nadal pływającą gałką po lewej.
- Przy nakładających się strefach dotyku wygrywa przycisk najbliżej kciuka. Opis sterowania na pauzie zaktualizowany.
- **Przeglądarka (emulacja Pixel 7):** kółko przeciągnięte w lewo obraca cel o 180° i tnie; PPM przeciągnięty w górę strzela w górę; ZRYW robi dash; stuknięcie kółka bez wroga w zasięgu atakuje w bieżącym kierunku. Build zielony.
- **Do sprawdzenia:** przycinanie na telefonie (emulacja bez karty graficznej nie da miarodajnego pomiaru).

## Krok 97 — Ciągły atak LPM dla każdego bohatera `#ocena` `#balans` `#czarodziejka` `#lucznik`

**Raport testera (przekazany przez właściciela 24.10.2026):** gra „powtarzalna”, ale „świetna i sprawia kupę frajdy”. Barbarzyńca OP, bo przytrzymanie LPM tnie bez przerwy; Czarodziejka „tragiczna” — kule na LPM mają za długi cooldown, promień słabszy, niż się oczekuje; łucznik „w ogóle tragedia” przez naciąganie. Właściciel się zgadza: łucznik ma strzelać w kółko, kule Czarodziejki do zmiany (pomysły: czwarta kula wybuchowa albo po trzech kulach fala uderzeniowa wokół niej). `#ocena` `#decyzja`

Co powstało:
- **Łucznik — ciągły ostrzał zamiast naciągania:** przytrzymanie LPM strzela od razu i potem co 0,34 s (`BowRepeater` w `systems/Archery.ts`). Co 3. strzała serii jest **mocna** (14 zamiast 8, mocniejszy odrzut, szybsza, przebija; wygląd dawnej strzały z pełnego naciągnięcia), celownik żółknie przed mocną. Puszczenie LPM, dash, paraliż i salwa zaczynają serię od nowa. W trakcie ostrzału 80% prędkości (wcześniej 60% przy naciąganiu). Ostrze dodaje obrażenia obu strzał, Rękawice skracają odstęp. Ok. 29 obrażeń/s w jeden cel (wcześniej ok. 11/s), barbarzyńca ok. 37/s wręcz. Salwa (PPM) bez zmian. Dotyk i pad bez zmian w kodzie: przytrzymany przycisk ataku = ostrzał. Klatki naciągania zostają w arkuszu, gra ich już nie używa.
- **Czarodziejka — seria kul z falą uderzeniową (wariant „po trzech kulach fala”):** przytrzymanie LPM rzuca kule jak dotąd; **rzut ostatniej kuli wyzwala falę uderzeniową wokół niej** (promień 56 px, 16 obrażeń, mocny odrzut, magia — trafia upiory, bez efektów przedmiotów) i wszystkie kule wracają **naraz po 0,6 s** (`OrbSeries` w `systems/Sorcery.ts`). Rytm przy trzymanym LPM: kula, kula, kula + fala, krótki powrót — ok. 1,6 s na serię (wcześniej po trzech kulach jedna kula co 1,5 s). Seria przerwana w połowie odnawia się po jednej kuli co 0,9 s. Ostrze dodaje też obrażenia fali, Rękawice skracają powrót, Kołczan wydłuża serię o kulę. Wygląd: rozchodzący się pierścień (`NOVA_VISUAL`, `CombatEffects.nova`).
- **Promień mocniejszy:** 5 → 8 obrażeń na tick (40/s), zasięg 150 → 170 px, szerokość 8 → 10 px, do 3 s (było 2,5), blokada 1,5 → 1 s, spowolnienie łagodniejsze (0,5 → 0,6).
- **Barbarzyńca bez zmian** — raport mówił, że jest OP, bo tylko on atakuje bez przerwy; teraz każdy bohater ma ciągły LPM. Osłabienie barbarzyńcy do decyzji po teście.
- Modyfikator piętra wydłużający odnawianie działa też na powrót serii kul. Opisy ataków na ekranie wyboru zaktualizowane.
- **Testy:** `tests/systems/archery.test.ts` (strzała zwykła i mocna, `BowRepeater`: od razu i co odstęp, co 3. mocna, reset serii, `strongEvery: 0`, przedmioty, DPS łucznika poniżej barbarzyńcy), `tests/systems/sorcery.test.ts` (`OrbSeries`: fala przy ostatniej kuli, powrót naraz, odnawianie po jednej, Kołczan i nowe czasy; fala rani i odpycha od środka; przedmioty i modyfikator piętra). Build zielony (1668 testów).
- **Przeglądarka (Playwright, Chromium):** łucznik z trzymanym LPM przez 3 s — 9 strzał co ok. 0,37 s, co trzecia 14 obrażeń z przebiciem; Czarodziejka — 6 kul i 2 fale. Bez błędów.
- **Czeka na ocenę właściciela i testera:** tempo ostrzału i siła mocnej strzały, promień i obrażenia fali, czas powrotu kul (0,6 s), czy barbarzyńca dalej odstaje. Pomysł z czwartą, wybuchową kulą — nie zrobiony, do rozważenia, jeśli fala się nie sprawdzi. Zarzut „gra powtarzalna” zapisany w backlogu — do osobnego kroku, właściciel przekaże więcej uwag testera.

## Krok 98 — Ultimate pod R `#decyzja` `#balans` `#czarodziejka` `#lucznik`

**Wrażenia właściciela po kroku 97 (25.10.2026):** test „spoko”, ale walka zrobiła się monotonna — potrzebna kolejna mechanika zabijania. Pomysł: klawisz R jako ultimate. Barbarzyńca — szał (seria ataków, żeby szybko wykończyć bossa, z jakąś niewrażliwością); Czarodziejka — tarcza albo „gigawybuch”; łucznik — totem, który pokazuje się zamiast niego i zawsze przejmuje aggro. `#decyzja`

Co powstało:
- **Pasek mocy** (`UltimateGauge` w `systems/Ultimate.ts`, liczby w `config/ultimateConfig.ts`): pełny na starcie piętra i areny, potem ładuje się sam w 50 s, a każdy zabity wróg dokłada 5%. W trakcie działania ultimate pasek stoi. HUD: kwadrat z literą R za liczbą HP — wypełnia się od dołu, pełny świeci złotem i pulsuje.
- **Barbarzyńca — Szał** (5 s): ciosy co 0,65 dawnego czasu i ×1,35 obrażeń (strzał też), chód ×1,2, nietykalność, czerwona poświata. Loadout przelicza scena (`applyRage`), więc przedmioty zdobyte w szale też działają.
- **Czarodziejka — Supernowa i tarcza:** wybuch wokół niej (130 px, 70 obrażeń, mocny odrzut, magia — trafia upiory), potem 3 s tarczy (nie przyjmuje trafień, błękitna poświata).
- **Łucznik — Totem** (7 s): stawia totem w miejscu, w którym stoi. Zwykli wrogowie, boss i dog Barona celują w totem zamiast w łucznika (`aggroTarget` w `EnemyManager` i `BossFight`). Totem strzela co 0,4 s w najbliższego widocznego wroga w zasięgu 240 px (10 obrażeń, magia, bez statusów i leczenia z przedmiotów). Wygląd: geometryczny placeholder (słup z jarzącym się okiem, pasek czasu).
- **Sterowanie:** klawiatura **R** (na ekranie śmierci R nadal restartuje — tam gracz nie żyje), pad **Y**, telefon: przycisk SZAŁ / NOVA / TOTEM nad dużym kółkiem (`TOUCH_BUTTONS.ultimate`), złoty, gdy pasek jest pełny. Nagrywanie wejść zapisuje R jako jednorazowe wciśnięcie. Opisy: linia R na kartach wyboru bohatera, pomoc w HUD, pauza (klawiatura, pad, dotyk).
- **Diagnostyka:** `diag.note('ultimate', { kind })`.
- **Testy:** `tests/systems/ultimate.test.ts` (pasek: czas, zabicia, użycie, stoi w trakcie działania, pełny na starcie; różne ultimate i opis R u każdego; nietykalność szału i tarczy, totem bez; szał mnoży loadout; cel totemu), nagrywanie R w `inputRecorder.test.ts` (test złapał błąd: rejestrator gubił samo wciśnięcie R), ekran wyboru: LPM, PPM i R. Build zielony (1682 testy).
- **Przeglądarka (Playwright, arena 1):** R przy pełnym pasku — barbarzyńca: odnowienie ciosu 320 → 208 ms i nietykalność; Czarodziejka: boss 300 → 230 HP, tarcza; łucznik: totem przejmuje cel bossa i oddaje 9 strzał w ok. 3 s. Telefon (emulacja Pixel 7): przycisk TOTEM świeci. Bez błędów. Opisy na kartach wyboru skrócone, żeby mieściły się w karcie.
- **Czeka na ocenę właściciela:** czas ładowania (50 s, 5% za wroga, pełny na starcie piętra), siła szału i nietykalność przez cały szał, obrażenia Supernowej, czas i siła totemu, wygląd totemu (placeholder — do generatora, jeśli się przyjmie), miejsce przycisku na telefonie. Pomocnicy bossa (pajączki, kokony spiżarni) nie ładują paska.

---

### Krok 98a — Gracz nie wypada poza zamkniętą arenę `#ocena` `#straznik-bram`

**Zgłoszenie właściciela (25.10.2026, Arena 5, Czarodziejka):** dash w trakcie, gdy Strażnik Bram na niego szarżował (chyba razem z pomocnikiem) — gracza przerzuciło za kratę, do korytarza. Stamtąd jego kule nie trafiały (boss jest nietykalny spoza areny, krok 86), a ciosy bossa tak — zginął. Zrzuty: gracz w korytarzu pod opuszczoną kratą. `#ocena`

Przyczyna: krata to jeden kafel kolizji, a Arcade rozdziela ciało z kaflem tylko z ograniczonym zapasem (`TILE_BIAS`). Gdy w jednej klatce zsumują się dash, odrzut i napór ciała bossa (kolizja gracz–boss rozpycha oba ciała), środek gracza przechodzi przez kafel i fizyka wypycha go już po drugiej stronie.

Co powstało:
- **Bezpiecznik położenia gracza** (`systems/PlayerContainment.ts`, czysty): co klatkę sprawdza kafel pod środkiem ciała gracza. Dozwolony zapamiętuje; z niedozwolonego cofa gracza na ostatnie dozwolone miejsce (`body.reset`). Niedozwolone są kafle kolizji (mur, opuszczona krata), a przy opuszczonych kratach areny — wszystko poza areną.
- `ArenaGates.sealed` mówi scenie, czy kraty są opuszczone; `GameScene.keepPlayerContained` woła bezpiecznik po kratach, przed pociskami.
- Bezpiecznik działa na całym piętrze, więc łapie też przepchnięcie przez zwykły mur.
- **Diagnostyka:** każde cofnięcie to `diag.note('player-unstuck', { floor, sealed }, 'warn')` — w raporcie F9 widać, jak często fizyka przepuszcza gracza.
- Pociski i ataki bossa nie zmieniły się: Strażnik bije strefami na arenie, a bomby kultystów celowo lecą zza krat galerii. Problem „jego ataki przechodzą, moje nie” znika, bo gracz nie może już znaleźć się za kratą.
- **Testy:** `tests/systems/PlayerContainment.test.ts` (dozwolony kafel, cofnięcie po przerzuceniu za kratę, brak punktu odniesienia, zmiana reguły przy opadnięciu krat). Build zielony (1688 testów).
- **Przeglądarka (Playwright, piętro 5, `?seed=7&floor=5&boss=1&hero=sorceress`):** kraty opadają, gracz przerzucony na kafel korytarza za kratą wraca na kafel areny tuż przy kracie; w dzienniku jedno `player-unstuck`. Bez błędów.
- **Czeka na test właściciela:** czy sytuacja z Areny 5 się nie powtarza.

---

### Krok 97a — Areny bossów bez minimapy `#decyzja` `#areny`

**Właściciel (25.10.2026):** „Na arenie nie potrzebujemy widoku minimapy. Minimapa na arenie ma być wyłączona.” `#decyzja`

Co powstało:
- W trybie **Areny bossów** gra nie tworzy minimapy (`GameScene`: `minimap = null`, gdy `bossRush`), więc HUD jej nie rysuje — ani mgły, ani znaczników. Na zwykłych piętrach (wspinaczka, wybór piętra, sloty) minimapa bez zmian.
- Na telefonie przycisk pauzy zostaje na swoim miejscu (pod pustym rogiem).
- **Testy:** zmiana tylko w scenie Phasera, bez nowej logiki czystej. Build zielony (1668 testów). Przeglądarka (Playwright): `?mode=arenas` — HUD minimapy pusty, zwykłe piętro — minimapa rysowana, bez błędów.
- **Czeka na test właściciela.**

---

## Krok 99 — Tarczownik szarżuje zamiast skakać `#ocena` `#balans` `#elity`

**Ocena właściciela (25.10.2026):** Tarczownik to najtrudniejszy i „antyludzki” wróg, psuje przyjemność z gry („byle nie on”) — nie challenge, tylko irytacja. Nie da się go zajść od boku: skacze i od razu obraca się w stronę gracza. Pomysł `#decyzja`: zamiast skakać niech szarżuje z cooldownem; po uniku wbija się w ścianę. Bomby rzucane przez innych wrogów mają go ranić. Na później: czytelniejsze animacje eksplozji (rozmyły się).

Co powstało:
- **Szarża** (`systems/ShieldCharge.ts`, czysta logika; liczby w `ELITE_CONFIG.shield.charge`): gdy gracz jest 70–220 px przed tarczą (w stożku ±30°), Tarczownik staje na 0,75 s i pokazuje tor (czerwony pas szerokości wroga, ucięty na ścianie, `SHIELD_CHARGE_VISUAL`), potem pędzi po prostej (400 px/s, do 300 px) w kierunku zapamiętanym na początku zamachu.
  - Trafienie: obrażenia ciosu ×1,2 i mocny odrzut (320), potem 0,5 s postoju. Dash i nietykalność chronią — wtedy biegnie dalej.
  - Unik i ściana: **ogłuszenie 1,8 s** (wstrząs, napis „Ogłuszony!”, chłodny odcień), tarcza zostaje skierowana w ścianę — plecy odsłonięte. Wybieg bez ściany: 0,9 s postoju. Kolejna szarża po 2,6 s od końca postoju.
  - W biegu trafienia go nie zatrzymują (jak skok ogara); bliżej niż 70 px zostaje zwykły cios.
- **Wolniejszy obrót:** 100 → 55°/s, a w trakcie szarży (zamach, bieg, ogłuszenie, postój) tarcza stoi w miejscu. Gracz za plecami nie dostaje szarży od razu — Tarczownik musi się najpierw powoli obrócić.
- **Koniec skakania:** ogar z Piekła z cechą Tarczownika traci skok — dostaje zwykły cios (`applyElite`, `ELITE_CONFIG.shield.bash`); jedyny „doskok” to szarża z telegrafem.
- **Bomby ranią Tarczownika:** bomba smolna kultysty i wybuch Wybuchowej elity zadają mu podwójne obrażenia (`bombDamageMultiplier: 2`), tarcza ich nie zatrzymuje (`Hit.unblockable` — wybuch z góry). Wciągnięcie go pod bombę się opłaca. Innym wrogom bomby nadal nie szkodzą.
- Podpowiedź przy pierwszym spotkaniu: „szarżuje — uskocz, wbije się w ścianę”.
- **Testy:** `tests/systems/shieldCharge.test.ts` (start tylko w zasięgu i przed tarczą, telegraf, ściana → ogłuszenie i odnowienie od jego końca, wybieg, blokada przez innego wroga, trafienie, balans obrotu; ogar z tarczą bez skoku; obrażenia bomby). Build zielony (1693 testy).
- **Przeglądarka (Playwright, `?seed=7&floor=5&hero=archer`, Tarczownik postawiony w pokoju):** gracz stoi — szarża trafia; gracz uskakuje w trakcie zamachu — Tarczownik wbija się w ścianę, ogłuszony 1,8 s, cios od tyłu wchodzi w całości (20 z 20); wybuch obok — 2× obrażeń. Bez błędów w konsoli.
- **Czeka na ocenę właściciela:** czas telegrafu (0,75 s), długość ogłuszenia (1,8 s), siła szarży, obrót 55°/s.
- **Na później (zanotowane):** czytelniejsze animacje eksplozji (bomby kultystów, wybuch elity, kokony) — `#ocena`.

---

## Krok 100 — Nowa nazwa gry: TOP DOWN `#decyzja` `#nazwa`

**Decyzja właściciela (2026-10-25):** gra nie nazywa się już „Tower Crawler”, tylko **TOP DOWN**. Nazwa podkreśla cykl gry — najpierw w górę wieży, potem w dół — a „down” ma też drugie znaczenie (największy upadek).

**Co się zmieniło:**
- tytuł karty przeglądarki w `index.html` i `mobile.html` („TOP DOWN”, „TOP DOWN — telefon”);
- nagłówek raportu F9 (`systems/Diagnostics.ts`) i przykładowy raport w `tests/worker/reports.test.ts`;
- nagłówki `README.md`, `docs/GDD.md` (już bez „tytuł roboczy”), `docs/DEVLOG.md`, `CLAUDE.md`; nazwa pakietu `top-down` w `package.json`;
- ekran startowy już wcześniej pokazywał napis TOP / DOWN (`config/splashConfig.ts`).

**Celowo bez zmian:** klucze `localStorage` `tower-crawler.*` (zapisy, wyniki, imię, postęp bossów, diagnostyka), adres workera `tower-crawler-scores.wvytz.workers.dev` i baza D1 `tower-crawler-scores`. Zmiana tych nazw skasowałaby graczom zapisy i odcięła wspólną tablicę wyników.

**Weryfikacja:** `npm run build` (typy + testy + build).

## Krok 101 — Co-op, etap C0: drużyna zamiast gracza `#decyzja` `#coop`

**Decyzje właściciela (2026-10-26)** po planie co-opu (dokument „TOP DOWN — plan co-opu dla 2 graczy”):
1. tylko **lokalny** co-op; online teraz nie interesuje;
2. **wspólny ekran ze smyczą** (kamera na środku między bohaterami);
3. **powalenie i wskrzeszanie** przez partnera — run kończy się, gdy leżą obaj;
4. trudność w co-opie: **więcej HP** wrogów i bossów **oraz 1 wróg więcej na pokój** (tylko w co-opie; solo dalej 1–2 na pokój);
5. **każdy zbiera przedmioty dla siebie**;
6. **bohaterowie muszą być różni**;
7. **osobna tablica wyników** co-op;
8. co-op **tylko w domyślnej wspinaczce** (bez aren bossów i wyboru piętra);
9. **wersja mobilna pominięta**.
Otwarte drobiazgi (rozstrzygniemy w trakcie): mikstura leczy jednego czy obu, HP po wskrzeszeniu, karty za bossa naraz czy po kolei.

**Praca na osobnej gałęzi** (decyzja właściciela: co-op nie może zepsuć gry). Etapy C0–C8 z planu; C0 to przebudowa bez zmiany zachowania gry solo.

**Co powstało:**
- `systems/Party.ts` (czysty): żywi członkowie, koniec runu (`isPartyDown`), najbliższy żywy bohater i cel wroga (`targetMember`: najbliższy żywy, a gdy nikt nie żyje — pierwszy gracz, jak dotąd w solo); testy `tests/systems/party.test.ts`;
- `entities/Party.ts`: drużyna bohaterów w scenie (`leader`, `living`, `isDown`, `nearestLiving`, `targetFor`); solo = `new Party([player])` w `GameScene`;
- menedżerowie walki dostają `party` zamiast `player`: wrogowie (`EnemyManager`), boss (`BossFight`), pajączki, pociski, pułapki, paleniska, kokony, purchawki, pajęczyny, psy w ścianach, pająki z sufitu, zasadzka, ukryta komnata, kraty areny, łupy;
- zasada: **zagrożenia ranią każdego żywego bohatera w zasięgu**, **wrogowie i boss celują w najbliższego żywego**, wyzwalacze (kokony, purchawki, psy, płyty strzałek, ukryta komnata, zasadzka, start walki z bossem) reagują na **dowolnego** żywego bohatera; `onPlayerHit` dostaje trafionego bohatera;
- łup zbiera najbliższy żywy bohater, który może go wziąć (`canCollect(drop, collector)`; mikstura — tylko ranny); na razie wszystko trafia do wspólnego runu jak dotąd (podział — etap C4).

**Celowo na później (oznaczone w kodzie „etap C…”):** ataki bohatera i nietykalność bossa spoza areny sprawdzają pierwszego gracza (C2: atakujący bohater), kraty areny i pająki z sufitu pilnują pierwszego żywego (C3), kapliczka, ultimate, światło/mrok, minimapa, kamera i HUD zostają przy pierwszym graczu (C2–C5).

**Testy:** 7 nowych (`party.test.ts`), razem 1703.

**Weryfikacja:** `npm run build` (typy + testy + build); `npm run smoke -- --floors 8 --seeds 1` — wszyscy trzej bohaterowie przechodzą piętra 1–8 bez błędów.

## Krok 102 — Co-op, etap C1: sterowanie dla dwóch graczy `#coop` `#sterowanie`

**Co powstało:**
- `config/coopConfig.ts`: `maxPlayers` (2), przyciski dołączania (A, Start) i wyjścia (B) na padzie;
- `systems/coopDevices.ts` (czysty): urządzenie gracza (`InputDevice`: klawiatura z myszą albo pad o indeksie), sterowanie bohatera (`PlayerDevices`; solo `SOLO_DEVICES` — klawiatura, mysz i pierwszy pad naraz, jak od kroku 95), drużyna przed startem (`CoopRoster`: pierwsze urządzenie = P1, drugie = P2, wyjście P1 przesuwa P2 na jego miejsce) i odczyt dołączania (`CoopJoinReader`: zbocza przycisków na każdym padzie osobno, trzymany przycisk liczy się po puszczeniu);
- `input/padSnapshot.ts`: odczyt pada o danym indeksie i wszystkich padów naraz;
- `InputController` dostaje `devices`: gracz z padem nie czyta klawiatury ani myszy, gracz z klawiaturą — żadnego pada; bez `devices` działa jak dotąd (solo);
- `createPlayerInput(scene, devices?)` — gniazdo sterowania przyjmuje urządzenia bohatera (wersja mobilna je pomija);
- `input/CoopJoinInput.ts`: nasłuch dołączania w scenie (pady + Enter/Spacja, Esc) — użyje go ekran wyboru co-op w etapie C5.

**Gra solo bez zmian:** scena gry dalej tworzy sterowanie bez `devices`.

**Testy:** 10 nowych (`coopDevices.test.ts`), razem 1718.

**Weryfikacja:** `npm run build`; w przeglądarce z podstawionymi dwoma padami: sterowanie z `padDevice(1)` czyta tylko drugi pad (ruch z jego gałki), z klawiatury — żadnego pada, solo — pierwszy pad; `npm run smoke -- --floors 3 --seeds 1`.

## Krok 103 — Co-op, etap C2: drugi bohater, kamera ze smyczą, światło dla obu `#coop`

**Co powstało:**
- **tryb testowy co-op:** `?hero=barbarian&coop=archer` (z `?seed=`/`?floor=` też) — P1 gra klawiaturą z myszą, P2 pierwszym padem; tylko wspinaczka (decyzja właściciela); run jest testowy (bez tablicy) do czasu tablicy co-op w etapie C7; ekran dołączania i wyboru dla dwóch — etap C5;
- **różni bohaterowie** (decyzja właściciela): `systems/Coop.ts` `partnerHero` — gdy P2 chce tego samego bohatera co P1, dostaje następnego z ekranu wyboru; `freshCoop` — partner bez przedmiotów i z pełnym HP;
- `FloorSceneData.coop` (`CoopSceneData`: partner — bohater, przedmioty, HP — i urządzenia graczy) przechodzi na kolejne piętro i do nowego runu po śmierci;
- `combat/HeroCombat.ts`: walka jednego bohatera wydzielona z `GameScene` (cios, strzał, kule, strzały i salwa, promień, fala, Burzowy pęd, Wampirzy kieł, ultimate, loadout) — solo jeden, co-op po jednym na gracza; cele ataków podaje scena (`HeroStrikeTargets`) w tej samej kolejności co wcześniej;
- **nietykalność bossa spoza areny** (krok 86) liczy się dla atakującego bohatera: metody `BossFight` dostają `attacker`, pociski gracza pamiętają strzelca (`PlayerShotManager`, także strzały totemu); kieł i rozprysk kuli działają dla strzelca;
- **wspólna kamera ze smyczą** (decyzja właściciela): `systems/CoopCamera.ts` — kamera idzie za środkiem między żywymi bohaterami (`partyFocus`), smycz (`leashPair`) nie pozwala im się rozejść poza kadr: cofa tego, kto się oddala (partner nie jest ciągnięty), przy ruchu obu dzieli nadmiar; zapas na sylwetki `COOP_CONFIG.leashMarginPx` (48×40 px, przy zoomie 2 odstęp do 384×190 px); zoom zostaje 2,0;
- **światło dla obu:** `LightingOverlay.render` wyciera krąg światła każdego żywego bohatera (też mrok zasadzki), `EnemyVisibility` liczy najjaśniejsze światło (`partyVisibility` w `systems/lighting.ts`);
- minimapę odkrywają obaj; run kończy się, gdy padną obaj (`party.isDown`) — wskrzeszanie w etapie C4.

**Celowo na później:** HUD pokazuje tylko P1 (etap C5); schody i kapliczka reagują na P1, łupy idą do runu P1 (etap C4); powalony partner wchodzi na kolejne piętro z 1 HP (zasady wskrzeszania — C4); balans co-opu (C6).

**Gra solo bez zmian:** jedna `HeroCombat`, kamera za graczem jak dotąd; testy i smoke.

**Testy:** 18 nowych (`coopCamera.test.ts`, `coop.test.ts`, `partyVisibility` w `lighting.test.ts`), razem 1736.

**Weryfikacja:** `npm run build`; w przeglądarce `?seed=7&hero=barbarian&coop=archer` z podstawionym padem — dwóch bohaterów, P2 chodzi i strzela padem, P1 klawiaturą, kamera między nimi, smycz cofa odsuniętego o 600 px partnera do 384 px; `npm run smoke -- --floors 8 --seeds 1` (solo, wszyscy bohaterowie).

## Krok 104 — Co-op, etap C3: kraty, zasadzki i pająki z sufitu dla dwóch `#coop`

**Co powstało:**
- **kraty areny i zasadzki:** opadają, gdy w głąb pokoju wejdzie którykolwiek żywy bohater; partnera spoza pokoju (także powalonego) gra przenosi wtedy obok bohatera w środku, z błyskiem w obu miejscach (`gatherParty` w `GameScene`, czyste `straysOutside` i `spotBeside` w `systems/Party.ts`, zapas `COOP_CONFIG.gatherMarginTiles`); nikt nie zostaje odcięty od walki ani zamknięty na zewnątrz;
- **pająki z sufitu:** pokój wyznacza pierwszy żywy bohater w zwykłym pokoju, a kolejne zrzuty celują na zmianę w każdego bohatera z tego pokoju (`CeilingDropManager`); obrażenia przy lądowaniu dostaje każdy w cieniu;
- **aggro** było gotowe od etapu C0: wróg i boss celują w najbliższego żywego bohatera, totem łucznika wabi wszystkich.

**Gra solo bez zmian:** jedyny bohater zawsze jest kotwicą, nikogo nie trzeba ściągać, zrzuty celują w niego.

**Testy:** 2 nowe w `party.test.ts`.

## Krok 105 — Co-op, etap C4: powalenie i wskrzeszanie, łupy dla każdego `#coop`

**Co powstało:**
- **powalenie i wskrzeszanie** (decyzja właściciela): bohater z zerowym HP leży (wrogowie go ignorują), nad nim pulsuje krąg zasięgu; partner stojący w kręgu (30 px) przez 3 s podnosi go z 40% HP i 1,5 s nietykalności, bez statusów; odejście cofa postęp trzy razy wolniej (`systems/Revive.ts`, `COOP_CONFIG.revive`, `Player.revive`, `Health.revive`); run kończy się, gdy padną obaj; kamera i smycz trzymają żywego przy powalonym, powalony ma swój krąg światła;
- **łupy dla każdego** (decyzja właściciela): mikstura leczy i przedmiot trafia do tego, kto go podniósł; złoto idzie do wspólnej sakiewki runu (wynik drużyny); przedmioty partnera jadą z nim na kolejne piętro (`partnerItems`, `CoopPartnerSnapshot.items`);
- **kapliczka:** ofiarę składa najbliższy żywy bohater przy kapliczce swoim E, ze wspólnego złota, i to on dostaje przedmiot (`ShrineSite` na drużynie);
- **nagroda za bossa:** każdy bohater wybiera swoją kartę — najpierw P1, potem P2 (napis „P2 — Łucznik wybiera”, `RewardSceneData.picker`), każdy z osobnego losowania;
- **schody:** wchodzi żywy bohater, który na nich stoi, swoim E; gdy partner leży, napis „Najpierw podnieś partnera” i schody czekają;
- komunikat przedmiotu w co-opie z numerem gracza („P2: Buty”).

**Decyzje w trakcie (do oceny właściciela):** mikstura leczy tego, kto ją podniósł; 40% HP po wskrzeszeniu; karty bossa po kolei.

**Gra solo bez zmian:** jedyny bohater zbiera wszystko do runu, kapliczka i schody reagują na niego, jedna karta nagrody.

**Testy:** 4 nowe (`revive.test.ts`), razem 1744.

**Weryfikacja:** w przeglądarce (`?seed=7&hero=barbarian&coop=archer`): powalony P2 nie kończy runu, P1 obok podnosi go po 3 s z 34/85 HP; buty podniesione przez P2 trafiają do jego przedmiotów; dwie karty bossa po kolei — Serce dla P1, Ostrze dla P2, gra rusza dalej.

## Krok 106 — Co-op, etap C5: menu co-op, ekran dołączania i HUD dla dwóch `#coop`

**Co powstało:**
- **menu główne:** nowa pozycja „CO-OP · 2 GRACZY” pod nową wspinaczką (`MenuEntry.Coop`; na telefonie wygaszona — decyzja właściciela: bez wersji mobilnej); odstęp wierszy menu 31 px, żeby siedem pozycji zmieściło się w panelu;
- **ekran co-opu** (`scenes/CoopSelectScene.ts`, czyste `systems/coopLobby.ts`): gracz dołącza swoim urządzeniem — Enter na klawiaturze albo A na padzie (każdy pad osobno), wybiera bohatera ← → i potwierdza gotowość; bohaterowie są zawsze różni (wybór przeskakuje bohatera partnera — decyzja właściciela); Esc / B cofa gotowość, potem zwalnia miejsce, bez graczy — powrót do menu; gdy obaj są gotowi, zaczyna się wspinaczka od piętra 1 (tylko domyślny tryb); karty w kolorach graczy (P1 zielony, P2 niebieski), pod kartami urządzenie i stan każdego gracza;
- **HUD dla dwóch:** przy pasku P1 napis „P1 · Barbarzyńca”, w prawym dolnym rogu panel P2 — imię, HP, dash, ultimate, przedmioty; powalony P2 — czerwony napis „POWALONY” i zielony pasek wskrzeszania; na minimapie niebieska kropka P2;
- na ekranie śmierci C (zmiana bohatera) w co-opie wraca na ekran co-opu.

**Gra solo bez zmian:** HUD bez napisu P1 i bez panelu P2; ekran wyboru bohatera jak dotąd.

**Testy:** 4 nowe (`coopLobby.test.ts`) i poprawiony `mainMenu.test.ts`.

**Weryfikacja:** w przeglądarce z podstawionym padem: menu z pozycją co-op; na ekranie co-opu Enter (P1, klawiatura) i A (P2, pad 1), P2 przechodzi na łucznika, obaj gotowi — gra startuje z barbarzyńcą (klawiatura z myszą) i łucznikiem (pad 0); panel P2 z przedmiotami i stanem powalenia.

## Krok 107 — Co-op, etap C6: więcej HP i jeden wróg więcej na pokój `#coop` `#balans`

**Co powstało (decyzja właściciela z kroku 101, p. 4):**
- `COOP_CONFIG.balance`: wrogowie ×1,4 HP (także elity i upiory zasadzki), bossowie ×1,7 HP, w każdym pokoju 1 wróg więcej (1–2 → 2–3);
- czyste `systems/CoopBalance.ts` (`withHpMultiplier`, `withExtraEnemies`, `SOLO_BALANCE`); `EnemyManager` i `BossFight` dostają mnożnik w zależnościach, `GameScene` dokłada wroga w planie spotkań tylko w co-opie;
- obrażenia wrogów bez zmian — dwóch bohaterów to też dwa cele.

**Uzasadnienie liczb:** dwóch bohaterów zadaje mniej więcej dwa razy więcej obrażeń, a wrogów jest o połowę więcej, więc HP rośnie mniej niż dwukrotnie — walka ma trwać podobnie jak solo; boss jest jeden, więc rośnie mocniej. Do strojenia po teście właściciela (zasada „nie łagodź trudności” zostaje).

**Gra solo bez zmian:** mnożniki 1 i bez dodatkowych wrogów (test `coopBalance.test.ts`).

**Testy:** 3 nowe (`coopBalance.test.ts`).

## Krok 108 — Co-op, etap C7: osobna tablica co-op i zapis z partnerem `#coop` `#decyzja`

**Co powstało:**
- **osobna tablica co-op** (decyzja właściciela): `HIGHSCORE_BOARDS.coop` (lokalnie `tower-crawler.coop-highscores.v1`, wspólnie `/coop-scores`); wynik drużyny = wspólne złoto w chwili, gdy padną obaj; wpis ma bohatera P1 (`hero`) i P2 (`partner`, nowe pole `ScoreEntry`); ekran śmierci — nagłówek „NAJLEPSZE DRUŻYNY”; na środku menu trzecia lista „CO-OP”;
- run co-op z menu trafia na tablicę co-op (nigdy na tablicę wspinaczki); tryb testowy z adresu `?coop=` zostaje bez tablicy;
- **worker:** trasa `/coop-scores` (tabela `coop_scores` z kolumną `partner`, migracja `worker/migrations/0004_coop_scores.sql`, `schema.sql`); `validate` przyjmuje `partner` tym samym wzorcem co bohater; **worker czeka na wdrożenie** — do tego czasu tablica co-op działa lokalnie, a wpisy czekają w kolejce wysyłki;
- **zapis gry:** punkt kontrolny i sloty pamiętają partnera (`SaveData.coop`: bohater, przedmioty, HP); uszkodzony partner unieważnia zapis; opis zapisu „Barbarzyńca + Łucznik · Piętro 3”; wczytany co-op startuje z P1 na klawiaturze z myszą i P2 na padzie.

**Gra solo bez zmian:** wpisy bez `partner`, zapisy bez `coop`, tablice wspinaczki i aren jak dotąd.

**Testy:** 2 nowe w `saveGame.test.ts`, 2 asercje w `tests/worker/index.test.ts`.

## Krok 109 — Co-op, etap C8: smoke z dwoma botami i wersja testowa w podkatalogu `#coop` `#diagnostyka`

**Co powstało:**
- `npm run smoke -- --coop`: każdy bohater gra z następnym z listy jako P2 (barbarzyńca + Czarodziejka, Czarodziejka + łucznik, łucznik + barbarzyńca); P2 steruje podstawionym padem (losowy ruch, celowanie, RT/LT/A), obaj bohaterowie lecą do każdego pokoju i na arenę, obie karty bossa są wybierane po kolei, schody — gdy obaj stoją obok; na starcie każdego piętra bot powala P2 i sprawdza, że P1 obok go podnosi; sweep pięter przenosi co-op;
- `npm run deploy:pages -- --subdir coop`: wersja testowa z gałęzi w podkatalogu `gh-pages` (`/topdown/coop/`) — klon obecnej gałęzi, wymiana tylko podkatalogu, zwykły push; główna gra zostaje bez zmian (uwaga: zwykłe `npm run deploy:pages` nadpisuje całą gałąź i usuwa podkatalog);
- `worker/README.md`: kolejność wdrożenia tablicy co-op (migracja `0004`, potem `wrangler deploy`).

**Weryfikacja:** `npm run smoke -- --floors 8 --seeds 1 --coop` (trzy pary, 8 pięter, wskrzeszanie na każdym piętrze) i solo `npm run smoke -- --floors 8 --seeds 1`.

## Krok 110 — Hitboxy ataków bossów zgodne z grafiką, nowe telegrafy i wybuchy `#ocena` `#balans`

**Ocena właściciela i testerów (26.10.2026):** dwie osoby dostały obrażenia od bossa, stojąc poza czerwonym kołem; właściciel też miał takie wrażenie. Prośba: skorygować hitboxy i poprawić wygląd ataków bossów. Połączone z zanotowaną w kroku 99 oceną „eksplozje nieczytelne, rozmyte”.

**Przyczyny (zbadane w kodzie):**
- **Strefa łapała 12 px za czerwonym obrysem.** Trafienie liczyło przecięcie koła strefy z kołem o promieniu połowy ciała fizycznego gracza (`PLAYER_SIZE / 2` = 12 px), mierzonym od środka sprite'a. Gracz, którego postać i cień stały wyraźnie za kreską, nadal był trafiony. Przy małych strefach (hak Kata ma promień 14, grad sztyletów — 18) faktyczny zasięg był prawie dwa razy szerszy niż rysunek.
- **Mierzone od środka postaci, nie od stóp.** Strefy leżą na ziemi, a gracz ocenia swoje położenie po cieniu. Głowa postaci stojącej pod kołem „wchodzi” w czerwień w rzucie z góry, choć stopy są poza nią — i odwrotnie.
- **Pociski trafiały róg prostokąta 24×24.** Ciało fizyczne gracza to kwadrat, a postać ma ok. 16 px szerokości; kula przelatująca obok ramienia (po skosie) trafiała.
- Czas trafienia i środki stref były zgodne z telegrafem (sprawdzone: skok, hak, smuga, kokony) — problem był wyłącznie w kształcie strefy trafienia gracza.

**Co powstało:**
- **Strefa trafienia bohatera** (`HERO_HURTBOX` w `config/combatConfig.ts`, czysta logika `systems/Hurtbox.ts`): strefy na ziemi (ataki bossów, wybuchy pajączków, bomby kultystów, wybuch Wybuchowej elity, pająki z sufitu) łapią **ślad stóp** — środek cienia (4 px pod środkiem) z promieniem 5 px; czerwień musi przykryć cień. Pociski i skok doga trafiają **tułów** (koło 8 px); prostokąt fizyki zostaje tylko do ruchu i ścian. Teren i pułapki (paleniska, plamy ognia, chmury purchawek, kolce) oraz spowolnienie z kokonów leża bez zmian.
- **Telegraf** (`effects/AreaTelegraph.ts`, wspólny dla bossów, pajączków, kokonów, palenisk, purchawek, bomb i wybuchów elit; wygląd w `AREA_TELEGRAPH_VISUAL`): czerwony brzeg w całości wewnątrz strefy, tuż za nim ciemna obwódka w kolorze obrysu postaci — styk to dokładny zasięg, czytelny także na czerwonym bazalcie Piekła; przez ostatnie 180 ms brzeg miga jasno (zaraz uderzy).
- **Obrys sumy kół** (`systems/AreaOutline.ts`): hak Kata i smuga Barona to łańcuchy nachodzących kół — telegraf i wybuch rysują jeden zewnętrzny obrys zamiast plątaniny okręgów.
- **Wybuch zamiast rozmytego błysku** (`CombatEffects.blast`, `BLAST_VISUAL`): 4 klatki skokowo co 60 ms — jasny błysk do samego brzegu, ogień, pierścień fali, iskry; nic nie wychodzi poza promień obrażeń. Używają go ataki bossów, wybuchy pajączków, bomby kultystów i wybuch Wybuchowej elity (kokony, kraty, łupy zostają przy starym błysku).
- `isHitByAreaStrike` (stara reguła) usunięty.
- **Testy:** `tests/systems/hurtbox.test.ts` (ślad stóp pod cieniem każdego bohatera, brzeg strefy, stopy vs głowa, róg prostokąta), `tests/systems/areaOutline.test.ts` (łańcuch kół, łuk przez kąt 0, koło w kole); balans tasaka Pożeracza liczony ze śladem stóp. Build zielony (1772 testy).
- **Przeglądarka (Playwright, `?seed=3&floor=1|6|7`, gracz nieśmiertelny na arenie):** zrzuty telegrafów i wybuchów Strażnika, Kata Otchłani (hak, oddech palenisk, żar) i Barona Dymu (puszki, smuga) — obrys łańcucha haka jest jeden, wybuch kończy się na kresce. Smoke wszystkimi bohaterami bez błędów.

**Uwaga o trudności:** ataki nie są słabsze (obrażenia, czasy i promienie stref bez zmian), ale uniki są teraz uczciwe: przy stałym promieniu strefy skuteczny zasięg spadł o ok. 7 px. Gdyby po testach bossowie wydali się łatwiejsi, można powiększyć same strefy — wtedy rysunek urośnie razem z nimi.

**Czeka na ocenę właściciela:** wielkość śladu stóp (5 px) i tułowia (8 px), siła błysku wybuchu (60% alfy w pierwszej klatce), czas migania brzegu (180 ms).

## Krok 111 — Grzybowy Pożeracz: szybszy, celny, wyrzut zarodników i ślad grzybów `#ocena` `#grzybowy-pozeracz` `#cmentarzysko` `#balans`

**Ocena właściciela (26.10.2026):** „Grzybowy Pożeracz jest tragicznym bossem. Zero wyzwania. Jest za wolny. Nie trafia. Dołóż mu nowe umiejętności. Niech zostawia za sobą ślad grzybów.” Chwilę później: „Musimy tutaj też dodać jakieś dodatkowe animacje, ponieważ wygląda tragicznie. Ta scena.”

**Przyczyny „nie trafia” (zbadane w kodzie):** skok i zamach celowały w miejsce gracza z chwili planu; gracz w ruchu był już daleko, zanim telegraf się skończył. Do tego wolny chód (70, sprint 150) i długie przerwy (1,5 s) — boss rzadko w ogóle stał przy graczu.

**Co powstało (liczby w `config/bossConfig.ts` `FUNGAL_DEVOURER`):**
- **Tempo:** chód 70 → 88, sprint 150 → 178 od 110 px (gracz ma 200), przerwa 1500 → 1050 ms, otwarcie 1200 → 900 ms; krótsze telegrafy: zamach 800 → 680, zgniecenie 850 → 720, skok 600 → 520, kąsanie 450 → 400 ms (odstęp 1300 → 1000).
- **Wyprzedzenie celu** (`AimLead`, `aimPoint` w `ai/bossAttacks.ts`): mózg bossa śledzi prędkość celu (wygładzona, skok celu — zmiana bohatera w co-opie, totem — zeruje ją). Skok ląduje tam, gdzie gracz będzie za 420 ms (najwyżej 90 px dalej), zamach celuje 250 ms naprzód. Innych bossów to nie dotyczy (pole opcjonalne).
- **Podwójny zamach:** drugi cios łapami 300 ms po pierwszym, krok dalej (środek 92 px, promień 40); jego telegraf pojawia się w połowie pierwszego. Kto cofa się prosto, ucieka (test balansu), kto cofnął się o krok — dostaje.
- **Wyrzut zarodników** (`BossAttackKind.SporeVolley`, nowy cios ze wzoru): 3 strąki (we wściekłości 4) lecą łukiem — pierwszy tam, dokąd biegnie gracz (600 ms naprzód), reszta w wachlarzu dalej za nim, co 160 ms. Lądowanie rani (strefa 34 px) i zostawia płat grzybów. Kara za trzymanie dystansu. Strąk poza podłogą areny dosuwany w stronę gracza.
- **Ślad grzybów** (`systems/FungalTrail.ts`, `trail`): co 30 px drogi pod stopami Pożeracza wyrasta płat grzybów (promień 6 → 18 px w 0,5 s, leży 6,5 s; we wściekłości 9 s). Najwyżej 14 płatów (we wściekłości 20), najstarszy znika. W płacie trucizna (3 co 0,5 s) i spowolnienie 35% — teren, więc chroni tylko dash. Skok też zostawia płat w miejscu lądowania.
- **Hitbox zgodny z rysunkiem (krok 110):** płat grzybów łapie ślad stóp bohatera (`isCaughtByGroundArea`), a rysunek maty kończy się dokładnie na promieniu płatu (brzeg świeci sokiem). Sieć Matki Pająków i grzybnia Króla bez zmian (środek postaci).

**Animacje i wygląd sceny** (`tools/devourer_sprites.py`, bez ręcznych poprawek):
- arkusz Pożeracza: nowe klatki 16–19 **wyrzut** (odchylenie, nabrzmienie soku, strąk w paszczy, chmura zarodników) i 20–23 **skok** (przysiad, głęboki przysiad, wybicie, lot z rozłożonymi łapami — trzyma się do lądowania); dotąd skok był bez animacji;
- `mushroom-trail.png`: płat grzybów — rozrost, puls soku, **więdnięcie** przez ostatnie 0,6 s (gracz widzi, że płat zaraz zniknie);
- `spore-pod.png`: strąk w locie (puls);
- wybuch strąka w barwach soku (`SPORE_BLAST_VISUAL`, ten sam układ klatek co wybuch z kroku 110) i rozprysk soku;
- zarodniki unoszą się z grzbietu Pożeracza (we wściekłości dwa razy gęściej; czysto wizualnie).

**Testy:** `tests/ai/FungalDevourer.test.ts` (wzór, wyprzedzenie skoku z limitem, mózg śledzący bieg gracza, zerowanie przy skoku celu, podwójny zamach i jego balans, wyrzut zarodników, skalowanie), `tests/systems/fungalTrail.test.ts` (odstęp, stojący boss, wściekłość, skok bez śladu, brzeg płatu vs ślad stóp). Build zielony.

**Przeglądarka (Playwright, `?hero=archer&seed=3&floor=4&boss=1`, gracz nieśmiertelny, chodzi w kółko):** wszystkie ciosy w użyciu, ślad za bossem widoczny (turkusowy brzeg na posadzce), trucizna z płatu działa, strąki lądują w arenie, wściekłość z 4 strąkami; bez błędów w konsoli. Smoke wszystkimi bohaterami.

**Czeka na ocenę właściciela:** czy teraz jest wyzwanie (tempo, wyprzedzenie, gęstość śladu), wygląd grzybów i nowych animacji. Gdyby było za ciężko: najpierw krótszy czas płatów albo mniejsze wyprzedzenie skoku.

## Krok 112 — Pajęczy duet na arenie: Król i Matka Pająków naraz `#decyzja` `#areny-bossow` `#matka-pajakow` `#krol-pajakow`

**Pomysł właściciela (26.10.2026):** połączyć obu bossów pająków w jedną walkę — na razie w arenach bossów, jako utrudnienie („to nie jest najtrudniejszy boss”).

**Decyzja (wariant domyślny, do potwierdzenia przez właściciela):** duet stoi na **arenie 3** (Grzybnia): Król Pająków + Matka Pająków, obaj z pełnym HP i wszystkimi atakami. Arena 2 zostaje z samą Matką — gracz poznaje ją sam na sam, potem dostaje ją w parze z Królem. Numeracja aren i tablica wyników bez zmian. Duet wraca w każdym kręgu (arena 10, 17…), partner skalowany do bieżącego piętra. We wspinaczce bez zmian.

**Co powstało:**
- `systems/BossDuet.ts` (czyste): `duetForFloor` (duet na piętrze kręgu), `duetStatus` (wspólny pasek: suma HP obu, pokonany liczy się jako 0, wściekłość od pierwszego wściekłego), `pushApart` (rozpychanie ciał).
- `BOSS_RUSH_DUETS` w `config/bossRushConfig.ts`: arena, partner, rozstawienie (±2,5 kafla od środka: Król po lewej, Matka po prawej), odstęp ciał (4 px), mnożnik HP (1), świta partnera (wyłączona — przywołuje tylko Król; dwie świty to za duży tłok), napisy („Matka i Król Pająków”, plansza „Pajęczy duet”).
- `combat/BossEncounter.ts`: scena widzi jedną walkę — jeden boss albo dwie niezależne `BossFight` na tej samej arenie. Walka trwa, gdy walczy którykolwiek; łup, karty i teleport dopiero po drugim (w miejscu jego śmierci). Pocisk gracza trafia najpierw bliższego bossa (z jego pajączkami). Oba ciała są nieruchome dla fizyki, więc duet rozpycha się sam (skok Matki przelatuje nad Królem, rozsuwają się po lądowaniu).
- `BossFight`: opcjonalne `bossFloor` (boss innego piętra, skalowany do bieżącego), `spawnOffset`, `seed` (partner losuje inaczej niż gospodarz); gettery `hp`, `maxHp`, `position`, `grounded`, `nudge`.
- Napis areny w HUD: „Arena 3 · Matka i Król Pająków”.
- **Hitboxy z kroku 110 obowiązują obu** — każda walka używa wspólnych stref (`systems/Hurtbox.ts`) i telegrafu.

**Testy:** `tests/systems/bossDuet.test.ts` (duet na arenie 3 w każdym kręgu, brak na innych, pełne HP, pasek, rozpychanie). Build zielony (1783 testy).

**Weryfikacja:** Playwright, `?mode=arenas&seed=3&floor=3` barbarzyńcą, łucznikiem i Czarodziejką: oba bossy walczą i atakują, pasek 936/936 (420 + 300 przeskalowane do piętra 3, razem), rozpychanie działa, po pokonaniu obu — łup i karty nagrody (`RewardScene`), bez błędów w konsoli. `npm run smoke -- --floors 4 --seeds 1` bez błędów (wspinaczka bez zmian).

**Czeka na ocenę właściciela:** trudność duetu (HP obu, czy dwie świty), rozstawienie, czy duet przenieść do wspinaczki.

## Krok 113 — Osłabienie Tarczownika i bossów z tarczą `#ocena` `#balans` `#elity` `#boss` `#pieklo`

**Ocena właściciela (26.10.2026):** Tarczownik „dalej jest broken”: odbite podstawowe ataki zawsze wracają w gracza, za często się obraca, nie ma momentu, w którym staje i można wyładować pełne combo, ma za dużo życia (był wzmacniany). Pociski odbijają tylko bossowie z tarczą, więc na pytanie „elita czy Strażnik Bram?” właściciel wybrał `#decyzja`: **osłabić oba**.

**Elita Tarczownik** (`ELITE_CONFIG.shield`):
- **Obrót** 55 → 35°/s.
- **Opuszczona tarcza po ciosie** (`guardDownMs: 1600`): po każdym ciosie tarczą stoi 1,6 s, nie obraca się, nie szarżuje i przyjmuje pełne obrażenia z każdej strony (ok. 5 ciosów barbarzyńcy). Łuk tarczy znika na ten czas (czytelny sygnał „teraz”).
- **Ogłuszony po wbiciu w ścianę** (krok 99) też jest bez tarczy — wcześniej odsłaniał tylko plecy.
- **HP** ×2,5 → ×1,8 podstawowego wroga (`shield.hpMultiplier`, zastępuje ogólny mnożnik elit; tarcza i tak mnoży jego wytrzymałość).

**Strażnik Bram i Kat Otchłani** (`config/bossConfig.ts`):
- **Odbicia w losowych kierunkach** (`shield.reflectSpread`, `reflectDirection` w `systems/Shield.ts`): odbity pocisk odchyla się w lewo albo w prawo o 30–80° od kierunku „z powrotem” — nigdy prosto w strzelca. Losowanie z własnego strumienia RNG walki (`REFLECT_SEED_SALT`).
- **Obrót** Strażnik 110 → 70°/s, Kat 120 → 80°/s.
- **Okno na combo** (`shield.loweredAfterAttackMs`, `isGuardLowered`): po końcu każdego ataku boss stoi z opuszczoną tarczą (Strażnik 1,2 s, Kat 1 s) — pełne obrażenia z każdej strony, pociski i promień przechodzą, łuk tarczy znika. Okno jest krótsze niż odpoczynek między atakami; we wściekłości kolejny atak może je skrócić.
- **HP** Strażnik 420 → 340, Kat 520 → 430.

**Testy:** `tests/systems/shield.test.ts` (rozrzut odbicia: długość wektora, kąt 30–80°, obie strony; okno opuszczonej tarczy), `tests/systems/elites.test.ts` (HP Tarczownika niższe niż innych elit, obrót i okno), `tests/ai/GateWarden.test.ts` (okno krótsze niż odpoczynek, rozrzut). Build zielony (1777 testów; po scaleniu z krokami 111–112 — 1806).

**Czeka na ocenę właściciela:** długość okien (1,6 s elita, 1,2/1 s bossowie), rozrzut odbicia, nowe HP. Gdyby było za łatwo — najpierw skrócić okna, potem HP.

## Krok 114 — Pad: jeden układ przycisków i celniejsze celowanie `#ocena` `#decyzja` `#sterowanie`

**Ocena właściciela (26.10.2026, pad Xbox):** sterowanie padem „mało precyzyjne”, ataki na spustach zamiast na X/Y/B, a drugi atak raz na górnym, raz na dolnym przycisku zależnie od bohatera (RB i LT robiły to samo, co wyglądało na różny układ). Zacinanie gry bada osobny wątek.

**Układ przycisków (`GAMEPAD_CONFIG.actions`), jeden dla wszystkich bohaterów:**
- **X** — atak podstawowy (LPM), **B** — drugi atak (PPM: strzał, promień, salwa), **A** — dash, **Y** — E (kapliczka, schody), **RB** — ultimate.
- Spusty powtarzają ataki (**RT** = X, **LT** = B) dla grających prawą gałką; **LB** powtarza dash. RB nie strzela już drugim atakiem.
- Menu bez zmian (A — potwierdź, B — wstecz, Y — akcja dodatkowa, Start — pauza). Na ekranie śmierci przyciski działają dopiero po 1,5 s, a wciśnięty w walce B nie liczy się bez puszczenia (zbocza).

**Celowanie (`PadAimTracker` w `systems/gamepadInput.ts`, liczby w `GAMEPAD_CONFIG.aim`):**
- **Prawa gałka** celuje ręcznie z lekkim dociąganiem do wroga w stożku ±10° (jak gałka na telefonie); martwa strefa 0,35 → 0,25.
- **Po puszczeniu gałki** jej kierunek trzyma się 0,3 s — szybkie pstryknięcie nie ucieka już w stronę ruchu.
- **Atak bez prawej gałki** (kciuk na X/B) celuje sam: wróg w stożku ±50° przed bohaterem (do 300 px), a gdy tam pusto — najbliższy wróg do 260 px. Bez wrogów — kierunek ruchu. Cele jak na telefonie: tylko wrogowie widoczni w świetle i boss.
- Wcześniej bez prawej gałki cios zawsze leciał w stronę ruchu, więc odchodząc od wroga nie dało się go trafić.

**Testy:** `tests/systems/gamepadInput.test.ts` — nowy układ (X/B/Y/RB, RB nie strzela, LB = dash), `PadAimTracker` (gałka wygrywa, dociąganie tylko w wąskim stożku, trzymanie kierunku po puszczeniu, samo celowanie: najpierw stożek przed bohaterem, potem najbliższy w zasięgu). Build zielony (1810 testów), smoke OK (1 piętro, wszyscy bohaterowie).

**Weryfikacja w przeglądarce (wirtualny pad, Playwright):** każdy bohater — X przy ruchu w lewo od wroga po prawej celuje we wroga (0°); B z prawą gałką w górę celuje w górę (−90°).

**Do decyzji właściciela:** samo celowanie ułatwia grę padem względem myszy (na telefonie dlatego jest osobna tablica). Na razie pad zostaje na wspólnej tablicy. **Czeka na test właściciela:** układ przycisków, siła samego celowania (stożek, zasięg), czas trzymania kierunku gałki.

## Krok 114a — Animacja płonących śladów na podłodze `#ocena` `#pieklo`

**Prośba właściciela (26.10.2026):** poprawić animację ognistych śladów zostawianych przez przeciwników na piętrach z Tarczownikiem (Piekło, 5–6: smuga skoku ogara, kałuża smoły po bombie kultysty, żar Ognistej elity i plama po jej śmierci). Hitbox ma się zgadzać z rysunkiem (jak strefy w kroku 110).

**Było:** dwa półprzezroczyste koła ADD (czerwone i pomarańczowe) z migotaniem o 1 px. Nachodzące plamy smugi rozjaśniały się na stykach, brzeg był rozmyty, a plama parzyła, gdy w kole był **środek postaci** — przy stopach poza ogniem głowa „wchodziła” w plamę i parzyło.

**Co powstało:**
- **Parzenie przy stopach** (`isStandingInGroundArea` w `systems/Hurtbox.ts`, `FirePatchField.update`): plama parzy, gdy środek śladu stóp (cień, 4 px pod środkiem) leży w kole. Bez promienia stóp, więc zasięg plamy jest taki sam jak wcześniej, tylko liczony tam, gdzie gracz widzi swoją postać na ziemi. Obrażenia, promienie i czasy plam bez zmian.
- **Nowy wygląd** (`effects/FirePatchRenderer.ts`, liczby w `FIRE_PATCH_VISUAL`):
  - wypalona podłoga i czerwona poświata jako dwie warstwy kadru (koła kryjące przeniesione na `RenderTexture` ze stałą alfą) — cała smuga to jedna równa plama, bez soczewek na stykach;
  - **brzeg = zasięg:** 2 px najciemniejszego tonu rampy ognia w całości wewnątrz koła (§6b — płomienie bez czarnego obrysu); smuga ma jeden obrys sumy kół (`exposedArcs` z kroku 110, liczony tylko po zmianie listy plam — `FirePatchField.version`);
  - w środku żar: mała plama ma jedną kulę, duża (kałuża smoły, plama po elicie) kilka nieregularnych, drgających o piksel; między plamami smugi pulsująca żyła żaru;
  - języki ognia (słupki pikseli, wysokość skacze co klatkę, czubek nigdy nie wychodzi za brzeg) i iskry wznoszące się z żaru;
  - etapy (`firePatchStage`): **rozbłysk** przy zapłonie (120 ms, całe koło jasne — od razu widać pełny zasięg), **płonięcie**, **dogasanie** (ostatnie 500 ms: bez języków, żar przygasa, brzeg miga skokowo — plama nadal parzy aż do końca);
  - wszystko skokowo w rytmie 6 kl./s, w pełnych pikselach świata; wygląd plamy stały (hash z pozycji, bez losowania co klatkę).
- **Testy:** `tests/systems/hellAttacks.test.ts` — parzenie przy stopach (postać nad plamą, stopy za brzegiem, brzeg ±1 px), etapy plamy, wersja listy. Build zielony (1810 testów po scaleniu z krokami 111–113).
- **Przeglądarka (Playwright, `?seed=3&floor=5`):** smuga ogara, smuga elity, kałuża smoły i plama po elicie obok siebie; klatki zapłonu, płonięcia, dogasania i zgaśnięcia (ręczne `game.step()`). Zrzut: `screens/krok114-slady-ognia.png` w plikach projektu. `npm run smoke` wszystkimi bohaterami, piętra 1–7 — bez błędów.

**Czeka na ocenę właściciela:** siła rozbłysku przy zapłonie, liczba języków ognia, czas migania przed zgaśnięciem (500 ms).

## Krok 115 — Płynność: fizyka krokiem klatki obrazu (zacinanie na monitorach 120/144 Hz) `#ocena` `#wydajnosc`

**Ocena właściciela (26.10.2026, co-op na padzie po krokach 110–113):** „Gra strasznie zacina.”

**Pomiary (Playwright, Chromium, `?seed=3`, piętra 1, 4 i 6, solo i co-op, gracz nieśmiertelny, atak i ruch w kółko):**
- **Procesor nie jest wąskim gardłem:** logika ok. 2 ms na klatkę (p95 ok. 5 ms), rysowanie ok. 1 ms; co-op dokłada ok. 0,3 ms. Liczba obiektów sceny stała (ok. 150 w walce z Pożeraczem), bez przecieku grafik telegrafów i wybuchów z kroków 110–111.
- **Karta graficzna — lekko:** 13–26 wywołań rysowania na klatkę (najwięcej w Piekle), 2–4 małe aktualizacje tekstur (napisy HUD), oświetlenie w rozdzielczości świata.
- **Dziennik diagnostyczny:** zapis co 5 s z pełnym nagraniem wejść (pad zmienia ruch co klatkę) ok. 2–4 ms — bez znaczenia.
- **Przyczyna zacinania:** Arcade liczył fizykę stałym krokiem 60 razy na sekundę (domyślne `fixedStep` Phasera), a obraz rysuje się z częstotliwością monitora. Symulacja (ręczne `game.step` z deltą monitora, bohater idzie w prawo): przy 120 Hz co druga klatka bez ruchu (3,33 / 0 px), przy 144 i 165 Hz ponad połowa klatek bez ruchu, przy 75 Hz co piąta. Kamera idzie za bohaterem, więc szarpał cały obraz — w co-opie jeszcze bardziej (kamera między dwoma bohaterami).

**Co powstało:**
- `systems/PhysicsStep.ts` (czyste): `physicsSteps(delta, maxStepMs, maxSteps)` dzieli czas klatki na równe kroki nie dłuższe niż 1/60 s.
- `world/SmoothPhysics.ts`: przed aktualizacją świata (PRE_UPDATE sceny, ta sama delta) ustawia długość kroku i akumulator Arcade tak, by klatka zrobiła dokładnie tyle kroków. Przy 60 Hz — jak dotąd jeden krok 1/60 s; przy 144 Hz — jeden krok 1/144 s w każdej klatce. Krok nigdy nie jest dłuższy niż dotąd (szybkie ciała nie przenikają ścian). Po długim zacięciu najwyżej 8 kroków na klatkę (gra na chwilę zwalnia zamiast nadrabiać).
- `PHYSICS_STEP_CONFIG` w `config/gameConfig.ts`. Włączone w `GameScene` (też w wersji mobilnej i aren).
- **Testy:** `tests/systems/physicsStep.test.ts` (60 Hz bez zmian, 75–240 Hz — ruch w każdej klatce, wolne klatki, limit, klatka zerowa). Build zielony (1819 testów).
- **Weryfikacja:** ta sama symulacja po zmianie — 75, 120, 144 i 165 Hz: 0 klatek bez ruchu, równe przesunięcie co klatkę (np. 1,39 px przy 144 Hz). `npm run smoke -- --floors 4 --seeds 1` wszystkimi bohaterami bez błędów. Smoke co-op przechodzi piętra, ale sprawdzenie wskrzeszania („P2 nie wstał”) w tym środowisku (Chromium bez karty graficznej, ok. 20 FPS) zawodzi dla części par **także bez tej zmiany** (sprawdzone z wyłączonym krokiem 115) — do osobnego zbadania.

**Czeka na ocenę właściciela:** czy gra jest płynna na jego monitorze (warto podać częstotliwość monitora i przeglądarkę). Jeśli dalej zacina — raport z F9 (puls zapisuje FPS) i opis, kiedy: cały czas czy tylko w walce/przy efektach.

## Krok 116 — Dźwięk: efekty i muzyka z syntezy, głośność i wyciszenie `#decyzja` `#dzwiek` `#coop`

**Decyzja właściciela (26.10.2026):** „skąd weźmiemy dźwięki?” → propozycja: darmowe paczki CC0 (Kenney, OpenGameArt, Freesound), efekty generowane (jsfxr / Web Audio) i po jednym klimatycznym utworze na wieżę i zaświaty; właściciel: „dawaj”.

**Wybór źródła:** z kontenera, w którym powstał ten krok, strony z paczkami (kenney.nl, opengameart.org) są zablokowane, więc wszystko powstaje **w kodzie** — efekty z syntezy w stylu jsfxr, muzyka składana z akordów. Zalety: zero plików i zero licencji z zewnątrz (dźwięki należą do projektu), mały build, liczby do strojenia w configu jak reszta balansu. Paczki CC0/CC-BY można dołożyć później — zasady i tabela przypisów w `docs/AUDIO.md`.

**Co powstało:**
- **Warstwa czysta (testy):** `core/audioTypes.ts` (`SoundCue` — 35 dźwięków, pętla promienia, przepisy, ustawienia, nuty); `systems/SfxSynth.ts` (przepis → próbki, deterministycznie, bez przesterowania); `systems/SoundGate.ts` (ten sam dźwięk w odstępie < `minGapMs` gra raz + limit 14 efektów / 100 ms — co-op i fale upiorów bez ściany hałasu); `systems/SoundSpace.ts` (stereo i ściszanie dalekich zdarzeń względem środka kamery); `systems/AudioSettings.ts` (głośność muzyki i efektów 0–100% co 10%, wyciszenie, kwadratowa krzywa głośności); `systems/MusicComposer.ts` (takt utworu: pad, bas, dzwonki z seeda, bęben-serce).
- **Config:** `config/audioConfig.ts` — przepisy wszystkich efektów, limity powtórzeń, przestrzeń, dwa utwory (wieża: d-moll dorycki 72 BPM; zaświaty: e frygijski 60 BPM z pulsem serca), klimat biomu (`MUSIC_BY_BIOME`: piętra 1–3 wieża, 4–7 zaświaty), miks muzyki, teksty.
- **Odtwarzanie:** `audio/SoundBoard.ts` — jeden obiekt `sound` na grę (jak `diag`): kontekst Web Audio po pierwszym geście (klawisz, klik, dotyk, przycisk pada w menu), bufory liczone raz, pętle z licznikiem właścicieli (dwie Czarodziejki = jeden promień), samo-wygasanie pętli bez odświeżenia (pauza); `audio/MusicPlayer.ts` — planowanie nut z wyprzedzeniem na zegarze Web Audio, przenikanie utworów, tryb walki z bossem. Błędy dźwięku trafiają do dziennika F9 (`audio-unavailable`, `audio-error`), nigdy nie psują gry. `persistence/AudioSettingsStorage.ts` — ustawienia w `localStorage`.
- **Podpięte:** cios, strzały, salwa, kule, rozprysk, fala, promień (pętla), dash, ultimate; bohater trafiony / pada / wstaje; trafienie i śmierć wroga, pocisk wroga, tarcza; wybuchy (w `CombatEffects.blast` — wszystkie naraz), tąpnięcia; boss: trafienie, ryk na start walki i „Ryk!”, śmierć; złoto, mikstura, przedmiot, karta, kapliczka, schody; kraty, zasadzka, ukryta komnata, urny/kokony, kolce (tylko z bliska), strzałki. Menu, wybór bohatera, co-op, pauza, karty — dźwięki interfejsu. Pełna lista: `docs/AUDIO.md`.
- **Muzyka w grze:** menu — wieża; piętro — klimat biomu; walka z bossem — bęben i gęstsza melodia; pauza — ciszej (40%); śmierć drużyny — muzyka milknie.
- **Ustawienia (wszystkie wejścia):** pauza ma wiersze „Muzyka − 60% +” i „Efekty − 70% +” — klik/stuknięcie w − i +, strzałki albo pad (↑ ↓ wybór — także sloty zapisu, ← → głośność, A — wycisz); **N** wycisza w grze, w menu i na pauzie (nie przy wpisywaniu imienia); stuknięcie napisu pod suwakami wycisza na telefonie. Układ pauzy przesunięty (sloty wyżej, suwaki pod nimi).

**Testy:** `tests/systems/sfxSynth.test.ts` (każdy przepis słyszalny, ≤ 2 s, w zakresie; pętla bez dziury), `soundGate`, `soundSpace`, `audioSettings`, `musicComposer`, `tests/persistence/audioSettingsStorage.test.ts`. Build zielony (1892 testy).

**Weryfikacja (Playwright, Chromium, `?seed=3&floor=5&hero=sorceress`):** po kliknięciu kontekst `running`, utwór zaświatów gra (RMS ok. 0,02), ataki i wybuch słychać na wyjściu (RMS do 0,11–0,13), pauza: strzałki zmieniają głośność muzyki, N wycisza (zrzut ekranu pauzy sprawdzony), bez błędów w konsoli; to samo w co-opie (`?hero=barbarian&coop=sorceress`). `npm run smoke -- --floors 3 --seeds 1` — wszyscy bohaterowie bez błędów.

**Czeka na ocenę właściciela (na słuchawkach / głośnikach):** brzmienie efektów (zwłaszcza cios, trafienie, wybuch, złoto), czy muzyka pasuje i nie męczy (pętla ok. 27 s wieży, ok. 48 s zaświatów), proporcje muzyka/efekty (domyślnie 60% / 70%), czy czegoś brakuje albo coś jest za głośne. Strojenie — liczby w `config/audioConfig.ts`. Do rozważenia później: utwory z plików (CC0/CC-BY) zamiast syntezy, osobny utwór bossa, kroki bohatera, dźwięki otoczenia biomów.

## Krok 116a — Dźwięk niżej i łagodniej, muzyka mniej męcząca `#ocena` `#dzwiek`

**Ocena właściciela (26.10.2026, po wdrożeniu kroku 116):** „dźwięki są zbyt wysokie i ogółem zbyt ostre. muzyka lekko psychodeliczna jak najbardziej na plus, ale po 20 minutach grania czułem lekki dyskomfort”.

**Co się zmieniło:**
- **Efekty:** wspólna barwa `SFX_TONE` (`config/audioConfig.ts`, czyste `systems/SfxTone.ts`): wszystkie przepisy grają o ok. 30% niżej (`pitchScale` 0,7), filtr każdej warstwy najwyżej 3 kHz, a cała szyna efektów ma łagodny filtr 4,2 kHz. Przepisy bez zmian — barwę stroi się jednym miejscem.
- **Muzyka (klimat zostaje):** dzwonki oktawę niżej (`bellTranspose` 12 zamiast 24), z harmonicznym alikwotem 2× zamiast metalicznego 2,76× i za filtrem 2,5 kHz; rzadsze (wieża 0,22 → 0,16, zaświaty 0,14 → 0,10); **oddech** — w każdych 8 taktach ostatnie 2 (zaświaty: 3) bez dzwonków; pad ciemniejszy (filtr 900 → 700 Hz) i słabiej rozstrojony (8 → 5 centów — mniej „pływania”, które męczy przy długim słuchaniu). Domyślna głośność muzyki 60% → 50% (zapisane ustawienia gracza zostają).

**Testy:** `tests/systems/sfxTone.test.ts` (niżej, filtr, długość bez zmian, każdy efekt dalej słyszalny), oddech melodii w `musicComposer.test.ts`. Build zielony (1935 testów). Przeglądarka: dźwięk i muzyka grają, bez błędów.

**Czeka na ocenę właściciela:** czy efekty są już dość niskie i miękkie (jeśli nie — `pitchScale` 0,6, filtr 2,5 kHz), czy muzyka da się słuchać dłużej.

## Krok 117 — Balans: Szał barbarzyńcy, tempo ataku, Wampirzy kieł, krótszy dash `#ocena` `#balans` `#coop`

**Ocena właściciela (26.10.2026, nagranie z runu barbarzyńcą do piętra 16):** „barbarzyńca dalej jest kompletnie broken z kilkoma przedmiotami, a jego ultimate tym bardziej; dash wydaje się zbyt długi na rozmiar pomieszczeń; lifesteal i attack speed mocno się skalują i wydają jedyny słuszny wybór”.

**Co pokazało nagranie (piętro 16):** Ostrze ×11, Buty ×9, Serce ×8, Klepsydra ×5, Kieł ×5, Elektryczna strzała ×5, Rękawice ×3, Ognista pięść ×2. Szał mnożył czas ciosu już po limicie z przedmiotów (3 Rękawice: 205 ms → 133 ms, z Ostrzami kilkaset obrażeń/s w łuku przy nietykalności); sufit leczenia kła rósł z Sercami (260 HP → 10,4 HP/s); 3 kopie Butów i 2 Klepsydry nic nie dawały (statystyki na limicie).

**Zmiany (liczby w configu):**
- **Szał** (`heroConfig.ts`): 5 → 4 s, ciosy ×0,65 → ×0,8, obrażenia ×1,35 → ×1,2; nietykalność zostaje. Pasek barbarzyńcy za zabicie 5% → 3% (nowe pole `HeroDefinition.ultimateGauge`, `gaugeConfigFor`); Czarodziejka i łucznik bez zmian.
- **Tempo ataku** (`lootConfig.ts`, `systems/StatScaling.ts`): Rękawice „+12% tempa ataku” (`attackSpeedPct`) zamiast −12% czasu. Czas = bazowy / (1 + tempo), limit +60% (`STAT_LIMITS.maxAttackSpeedBonus`, 5 kopii). Każda kopia daje tyle samo ciosów na sekundę (dawniej 5 kopii = ×2). Z pełnymi Rękawicami szał dochodzi dokładnie do 50% bazowego czasu (160 ms) — niżej nie zejdzie. Dotyczy też kul Czarodziejki i ostrzału łucznika.
- **Wampirzy kieł:** leczenie 2 / 3 / 4 / 4 HP raz na 1 s (było 2 / 4 / 5 / 6 co 0,7 s); sufit 4% **bazowego** HP bohatera na sekundę (`WeaponEffects.meleeHealMaxPerSec`): barbarzyńca 4 HP/s, łucznik 3,4, Czarodziejka 3 — Serca go nie podnoszą.
- **Dash (wszyscy bohaterowie):** 620 px/s × 150 ms ≈ 93 px → 500 px/s × 140 ms = 70 px (ok. 2 kafle przy pokojach 5–10 kafli). Nietykalność dasha = czas trwania, więc spada tylko o 10 ms.
- **Przedmioty na limicie** (`systems/ItemUsefulness.ts`): karty za bossa i kapliczka losują tylko z przedmiotów, które bohaterowi coś zmienią (porównanie loadoutu z kopią i bez). Znikają Buty, Klepsydra, Rękawice na limicie, Kieł po 3 kopiach, Lodowy odłamek po 4, Ognista pięść po 5. Łupy z ziemi bez zmian. W co-opie pula liczona osobno dla każdego gracza.

**Testy:** `tests/systems/itemUsefulness.test.ts` (nowy), `progression` (równy przyrost tempa, limit), `ultimate` (szał nie schodzi poniżej limitu, pasek barbarzyńcy), `healBudget` (sufit z bazowego HP), `itemEffects`, `archery`. Build zielony (1908 testów). `npm run smoke` — wszyscy bohaterowie bez błędów. `npm run smoke -- --coop`: wspinaczka co-op przechodzi, ale smoke zgłasza „P2 nie wstał po wskrzeszaniu” na piętrze 1 — **ten sam błąd jest na `main` przed tym krokiem** (sprawdzone), więc to osobna sprawa do zbadania.

**Czeka na ocenę właściciela:** czy barbarzyńca z przedmiotami i Szał są teraz w porządku, długość dasha (70 px), czy kieł nie stał się bezużyteczny, czy limit tempa +60% nie jest za niski. Do rozważenia, jeśli dalej za mocno: malejący przyrost Ostrza (dziś liniowo +3, ×11 = 45 obrażeń przy HP wrogów ×3,25 na piętrze 16).

## Krok 118 — Większy obraz: pełny ekran i „Wypełnij okno” `#decyzja` `#obraz`

**Pytanie właściciela (26–27.10.2026):** „czy możemy zwiększyć okno gry nie psując tego, co zbudowaliśmy?”. Przyczyna czarnych pasów: na PC płótno 960×540 skaluje się tylko o całkowite krotności piksela świata (`systems/pixelScale.ts`, STYLEGUIDE §2), więc na 1080p w oknie przeglądarki obraz ma ok. 1440×810, a przy Windows 125% (okno ok. 1536×730) tylko 1152×648. Opcje: pełny ekran, skala ułamkowa „Wypełnij okno”, większe pole widzenia. **Decyzja:** pełny ekran + „Wypełnij okno”; **pole widzenia bez zmian** (większe zmieniłoby balans: więcej widać z pokoju i areny, Kiterzy strzelają z dalej — `ENEMY_VIEW_RULE` liczy się z kadru — mrok, zapowiedź bossa, smycz co-opu, czytelność postaci, porównywalność wyników). Właściciel: „wdróż proponowane przez Ciebie zmiany”.

**Co powstało:**
- **Warstwa czysta (testy):** `core/displayTypes.ts`, `systems/DisplaySettings.ts` (odczyt ustawień z magazynu, przełącznik, reguła klawisza pełnego ekranu: bez Ctrl/Alt/Meta, bez autopowtórzenia, nie w polu tekstowym raportu F9), `config/displayConfig.ts` (domyślnie ostre piksele, klawisze F i O, teksty), `persistence/DisplaySettingsStorage.ts` (`localStorage`, klucz `tower-crawler.display.v1`).
- **`input/DisplayControls.ts`** — obiekt `display`: „Wypełnij okno” (zapamiętane między sesjami) i pełny ekran całej strony; po zmianie skala płótna liczy się od nowa (`rescaleOn` w `main.ts`). **F** działa wszędzie w wersji PC (menu, gra, pauza); wersja mobilna bez zmian (już ma skalę ułamkową i pełny ekran po pierwszym dotyku).
- **Pauza (tylko PC):** wiersz „O — Wypełnij okno: TAK/NIE” i „F — Pełny ekran / Wyjdź z pełnego ekranu” — klik, klawisz albo pad (↑ ↓ wybór, A). Przeglądarka nie uznaje przycisku pada za gest użytkownika, więc pełny ekran z pada może się nie włączyć — wtedy pauza podpowiada F albo kliknięcie. Układ pauzy: komunikat zapisu pod suwakami, wiersz obrazu nad „M — menu główne”.
- „Wypełnij okno” daje skalę ułamkową jak na telefonie: obraz zawsze na całe okno, ale na monitorze 100% niektóre piksele są o włos szersze (widać przy ruchu kamery). Zoom kamery 2,0 i 960×540 bez zmian — rozgrywka, zasięgi, HUD i tablice wyników nietknięte.

**Testy:** `tests/systems/displaySettings.test.ts`, `tests/persistence/displaySettingsStorage.test.ts`. Build zielony (1911 testów).

**Weryfikacja (Playwright, Chromium):** okno 1536×730 przy skali 1,25: ostre piksele 1152×648 → „Wypełnij okno” 1298×730 (pełna wysokość), ustawienie zostaje po przeładowaniu; F włącza pełny ekran; pauza: kursor strzałkami na wierszu obrazu, zrzut ekranu sprawdzony; bez błędów w konsoli. `npm run smoke -- --floors 2 --seeds 1` — wszyscy bohaterowie bez błędów.

**Czeka na ocenę właściciela:** czy pełny ekran (F) wystarcza, czy „Wypełnij okno” jest potrzebne na co dzień i czy nierówne piksele przeszkadzają.

## Krok 119 — Co-op: wskrzeszanie bez przepychania ciała `#ocena` `#coop`

**Zgłoszenie właściciela (27.10.2026):** „udało mi się raz wskrzesić drugiego gracza, ale też przesuwać jego ciało podczas ultimate barbarzyńcy”. Do tego kilka wątków widziało w `npm run smoke -- --coop` błąd „P2 nie wstał po wskrzeszaniu”.

**Przyczyna:** ciało powalonego bohatera dalej brało udział w kolizjach Arcade (partner, boss). Żywy partner, idąc do ciała, wypychał je przed sobą (w Szale szybciej, ale działo się to zawsze), a ciała 24×24 px nie pozwalały stanąć bliżej niż na ok. 24 px — podejście po skosie zatrzymywało partnera na krawędzi zasięgu 30 px, więc pasek rósł i opadał. Do tego smycz przy ściągnięciu bohaterów (np. po zebraniu drużyny w pokoju) mogła przesunąć ciało o połowę nadmiaru.

**Co się zmieniło:**
- `entities/Player.ts`: powalony bohater ma wyłączone kolizje ciała (`checkCollision.none`), po wstaniu wracają. Partner może stanąć na ciele, nikt go nie przepchnie, pociski wrogów przelatują.
- `systems/CoopCamera.ts`: `leashAxis`/`leashPair` dostały `anchored` — smycz nigdy nie rusza powalonego, cały nadmiar cofa żywy (`GameScene.applyLeash`).
- `tools/smoke.mjs`: sprawdzenie wskrzeszania czeka do 6 s **czasu gry** (nie zegara ściany — wolna przeglądarka bez GPU daje mniej klatek) i przy błędzie podaje postęp i odstęp bohaterów. Wskrzeszający staje na ciele (poza kolizją), bo obok ciała przy murze bezpiecznik areny z kroku 98a cofał go na poprzednie miejsce.

**Testy:** `tests/systems/coopCamera.test.ts` — smycz nie rusza powalonego. Build zielony.

**Weryfikacja:** Playwright (Chromium): powalony P2, barbarzyńca w Szale idzie prosto na ciało — przed poprawką ciało jechało razem z nim (1576 → 1590 px), po poprawce stoi, a barbarzyńca przechodzi przez nie. `npm run smoke -- --coop` (wszystkie pary, piętra 1–8, 2 seedy) bez błędów.

**Czeka na ocenę właściciela:** czy wskrzeszanie w grze z drugim graczem działa za każdym razem.

## Krok 120 — Prostszy ekran pauzy, gra domyślnie wyciszona `#decyzja` `#pauza` `#dzwiek`

**Prośba właściciela (27.10.2026):** „musimy przerobić ten ekran pauzy. jest za dużo tekstu. sam się gubię” oraz „gra ma być domyślnie wyciszona. na pierwszym ekranie w jednym z narożników dołóż ikonę głośniczka dla tych, którzy chcą audio. przeglądarka musi pamiętać ustawienie”.

**Pauza (`scenes/PauseScene.ts`, zasady w `systems/pauseMenu.ts`):**
- Strona główna to krótka lista w ramce: **Wznów · Zapisz grę · Dźwięk i obraz · Sterowanie · Menu główne** i jedna linijka podpowiedzi. Pod listą szara notka tylko przy „Zapisz grę” (stan z wejścia na piętro) i „Menu główne” (autozapis zostaje).
- Podstrony: **Zapis gry** (3 sloty, Wróć), **Dźwięk i obraz** (Muzyka − / +, Efekty − / +, Dźwięk: WŁĄCZONY / WYCISZONY, Wypełnij okno, Pełny ekran — tylko PC, Wróć), **Sterowanie** (klawiatura z myszą, pad, skróty w pauzie; na telefonie opis dotyku).
- Mysz: najechanie wybiera, kliknięcie potwierdza; kliknięcie obok listy na stronie głównej wznawia (jak dotąd, np. powrót do okna). Klawiatura: strzałki / WASD i Enter, **Esc — wstecz** (na głównej wznów), P — wznów. Skróty 1 / 2 / 3, M, N, O i F działają na każdej stronie. Pad: ↑ ↓ + A, ← → głośność, B — wstecz, Start — wznów, Y — menu.
- Zapis niedostępny (odtwarzanie nagrania): „Zapisz grę” znika z listy.

**Dźwięk:** `AUDIO_SETTINGS_RULES.defaults.muted = true` — nowa przeglądarka startuje bez dźwięku. Głośnik w prawym górnym rogu ekranu startowego i menu (`effects/SpeakerButton.ts`, rysowany w kodzie, liczby w `SPEAKER_BUTTON`): przekreślony na czerwono, gdy wyciszone; kliknięcie/stuknięcie przełącza, po najechaniu podpis. To samo ustawienie co N i pauza, zapis w `localStorage` (`tower-crawler.audio.v1`). Kliknięcie głośnika nie przewija intra. Gracz, który już zmieniał głośność (zapisane ustawienia), zostaje przy swoim.

**Testy:** `tests/systems/pauseMenu.test.ts` (pozycje stron, kursor, „wstecz”, sloty), `audioSettings.test.ts` (domyślne wyciszenie). Build zielony.

**Weryfikacja:** Playwright (Chromium, dev): pusty `localStorage` → głośnik przekreślony; kliknięcie → `{"muted":false}` w magazynie i po przeładowaniu; pauza: strona główna, zapis do slotu 1, „Dźwięk i obraz”, „Sterowanie”, Esc wraca, drugie Esc wznawia grę. Bez błędów w konsoli.

**Czeka na ocenę właściciela:** układ pauzy i miejsce głośnika.

## Krok 121 — Bez zapisu w walce z bossem `#ocena` `#zapis-gry` `#areny-bossow`

**Zgłoszenie właściciela (27.10.2026):** „zapisanie stanu gry nie powinno go resetować do początkowego stanu na arenie bo daje to darmową drugą szansę”.

**Przyczyna:** zapis to punkt kontrolny z wejścia na piętro (krok 91). W arenach bossów piętro to sama arena, a we wspinaczce arena jest na końcu piętra — zapis w slocie albo wyjście do menu w przegranej walce i „Kontynuuj” cofało na początek, z pełnym HP sprzed walki. Przy autozapisie run nadal liczył się do tablicy.

**Zmiana (`BossSaveLock` w `systems/SaveGame.ts`, użycie w `scenes/GameScene.ts`):**
- od przebudzenia bossa do jego śmierci nie ma zapisu: „Zapisz grę” znika z pauzy (skróty 1 / 2 / 3 też), a autozapis „Kontynuuj” jest usuwany — wyjście do menu, zamknięcie karty czy awaria w trakcie walki kończy run (bez wpisu na tablicę);
- w arenach bossów blokada trwa od wejścia na arenę (stary autozapis poprzedniej areny też znika);
- po zwycięstwie zapis wraca (nadal stan z wejścia na piętro / arenę — wczytanie powtarza wygraną walkę, nic nie daje);
- boss, który na chwilę wypadnie z fazy walki, nie zdejmuje blokady; śmierć drużyny nie przywraca autozapisu;
- notka pauzy przy „Menu główne” w walce: „Walka z bossem — bez zapisu, wyjście kończy run” (`PAUSE_CONFIG.notes.quitBossFight`); okruch diagnostyki `save-lock`.
- Ręczny slot zapisany przed walką (we wspinaczce, przed areną) dalej działa jak dotąd — run z niego i tak nie trafia na tablicę.

**Testy:** `tests/systems/saveGame.test.ts` — blokada we wspinaczce, w arenach, przy chwilowym wyjściu bossa z walki i po zwycięstwie. Build zielony.

**Weryfikacja:** Playwright (Chromium, dev): `?mode=arenas` i `?boss=1` — w walce brak autozapisu w `localStorage`, pauza bez zapisu (`saveLocked`); po pokonaniu bossa autozapis wraca.

**Czeka na ocenę właściciela:** czy wyjście z gry w walce ma kończyć run bez wpisu na tablicę (teraz tak), czy liczyć się jak śmierć.

## Krok 122 — Gniazdownik, trzeci archetyp wroga `#decyzja` `#gniazdownik`

**Prośba właściciela (27.10.2026):** „chciałbym teraz dodać trzeci rodzaj kanonicznego potwora. nasze lokacje są zbyt puste”. Z trzech propozycji (Gniazdownik-przywoływacz, Osiłek-tank, Czyhacz udający dekorację) właściciel wybrał **Gniazdownika**.

**Zasada:** `#decyzja` wyjątek od „1–2 wrogów na pokój” — Gniazdownik zastępuje jednego z nich (liczba wrogów w pokoju bez zmian), a jego kruche czerwie są poza limitem. Pokój żyje, a nie dokładamy silnych wrogów.

**Mechanika:**
- **Gniazdownik** (`EnemyType.Nester`, wariant `BroodSac`): pękaty worek z jajami na krótkich nóżkach. Wolny (45 px/s), trzyma dystans jak Kiter (170 / 120 px), 35 HP. Sam nie rani. Gdy widzi gracza (z reguły widoku Kiterów), co 4,5 s zamach 0,8 s (worek pęcznieje, pomarańczowy odcień) i wypluwa 2 czerwie wachlarzem w stronę gracza.
- **Limity:** najwyżej 4 żywe czerwie jednego gniazda i 10 na całe jego życie. Bez miejsca gniazdo nie zaczyna zamachu. Gniazda nie da się farmić, a pokój w końcu cichnie.
- **Czerw** (`EnemyVariant.Grub`, wariant Rushera): 8 HP (cios barbarzyńcy zabija), szybki (145 px/s), gryzie za 4 z krótkim zamachem. Wykluwa się 0,4 s (nietykalny i bierny).
- **Kontra:** czerwie giną razem z gniazdem, więc szybkie dobicie gniazda ucisza pokój. W co-opie jeden gracz zajmuje się czerwiami, drugi biegnie do gniazda.
- **Łup:** gniazdo 3–5 złota (90%), czerwie nic i nie ładują ultimate.
- **Rozmieszczenie** (`assignNesters` w `dungeon/EncounterPlanner.ts`, własna sól RNG `0x6e57`): w zwykłych pokojach o boku ≥ 6 kafli, szansa 20% na piętrze 1 i 30% dalej, najwyżej 3 na piętro. Rozmieszczenie pozostałych wrogów bez zmian. Może zostać elitą (bez Tarczownika — ten jest tylko dla Rusherów). W arenach bossów brak.
- **Wygląd:** pierwsza wersja dla wszystkich biomów — generator `tools/brood_sprites.py` (worek: pełzanie i wylęg; czerw: pełzanie i ugryzienie, 8 kierunków). Dźwięk wylęgu `SoundCue.Brood` (mokre „blurp”).

**Kod:** czysto — `systems/Brood.ts` (`broodCapacity`, `broodSpawnPoints`, `BroodLedger` — kto kogo wykluł), `BroodAttackDefinition` / `EnemyAttackKind.Brood` w `core/combatTypes.ts`, liczby w `config/combatConfig.ts` i `lootConfig.ts`; Phaser — `Enemy` pyta menedżera o miejsce przed zamachem i woła `brood` po nim; `EnemyManager` wykluwa czerwie (miejsce za ścianą → w samym gnieździe), zabija je ze śmiercią gniazda i pilnuje podwójnej śmierci w jednej klatce.

**Testy:** `tests/systems/brood.test.ts` (konfiguracja, limity, wachlarz, rejestr gniazd), `tests/dungeon/EncounterPlanner.test.ts` (zamiana bez zmiany liczby i miejsc, limity, determinizm, częstość). Balans: gniazdo na piętrze 10 pada od 7 ciosów (stąd 35 HP, nie 40). Build zielony (2006 testów).

**Weryfikacja:** Playwright (Chromium, dev, `?seed=1&floor=2`): gniazdo wypluwa 2 czerwie, po 4,5 s kolejne 2 i staje przy limicie 4; śmierć gniazda zabija wszystkie czerwie. `npm run smoke -- --floors 7 --seeds 1` (3 bohaterów) i `--coop --floors 3` bez błędów.

**Czeka na ocenę właściciela:** częstość gniazd (20/30% pokojów), rytm wylęgu (4,5 s, 2 czerwie, limit 4/10), siła czerwi, wygląd. **Następnie:** wersje gniazda dla biomów — zrobione w kroku 122a.

## Krok 122a — Gniazdownicy biomów `#ocena` `#gniazdownik`

**Ocena właściciela po kroku 122 (27.10.2026):** „zrób odpowiedniki do reszty biomów jest ok”. Wersja z ruin (worek z czerwiami) zaakceptowana.

**Wersje biomów** (gniazdo / stworek; rytm wylęgu, limity i statystyki jak w kroku 122):
- **Ruiny:** worek z jajami / czerw (bez zmian).
- **Pajęcze leże:** pajęczyca z jedwabnym kokonem jaj (zielone jaja prześwitują) / pajęczak — ugryzienie spowalnia 15% na 0,8 s (jak pajęczyny leża).
- **Grzybnia:** omszała, zielona purchawa na korzeniach grzybni z cyjanowymi porami / grzybek-zarodnik na nóżkach — lekka trucizna (2 + 2). Zieleń zamiast beżu, żeby nie mylić z purchawami-pułapkami biomu.
- **Cmentarzysko:** nekromanta w rdzawych łachmanach z kosturem (kula grzybni świeci przy wylęgu) / pełzająca dłoń — lekka trucizna.
- **Piekło (piętra 5–6):** rozdęta czarcica z żarem w pęknięciach brzucha / chochlik ze skrzydełkami i ogonem; bez statusu.
- **Zadymiona palarnia:** żywa fajka wodna na mosiężnych nóżkach (żar w główce, kłąb dymu przy wylęgu) / dymek z żarem oczu; bez statusu.

**Kod:** `EnemyVariant` — 10 nowych wariantów; `config/combatConfig.ts` — `broodAttack(minion)` (wylęg archetypu z innym stworkiem) i `broodling(kolor, status)` (wspólne statystyki stworków); `biomeConfig` — gniazdo każdego biomu; `spriteConfig` — `broodSheet`, `nestVisual`, `broodlingVisual`. Grafika: `tools/brood_sprites.py` (12 arkuszy, 48×48, 8 kierunków).

**Testy:** `tests/systems/brood.test.ts` — każdy biom ma własne gniazdo i własnego stworka, ten sam rytm wylęgu i statystyki, arkusze 8-kierunkowe; `enemyVariants.test.ts` — mapowanie biomów. Build zielony (2027 testów).

**Weryfikacja:** Playwright (Chromium, dev): na piętrach 2, 3, 4, 5 i 7 gniazdo biomu wypluwa swoje stworki (pajęczaki, zarodniki, dłonie, chochliki, dymki), bez błędów. `npm run smoke -- --floors 7 --seeds 1` (3 bohaterów) bez błędów.

**Czeka na ocenę właściciela:** wygląd wersji biomów, statusy stworków (spowolnienie w leżu, trucizna w Grzybni i na Cmentarzysku).

## Krok 123 — Czyhacz, czwarty archetyp wroga `#decyzja` `#czyhacz`

**Prośba właściciela (27.10.2026):** „bierz się za czyhacza, który respi się jeszcze rzadziej i wyskakuje z trumny albo ze ściany. proponuj”. Propozycja (osobny dokument w plikach projektu `projekty/czyhacz-propozycja.md`) zaakceptowana; z trzech wariantów widoczności kryjówki właściciel wybrał **subtelny znak** `#decyzja`.

**Mechanika:**
- **Czyhacz** (`EnemyType.Lurker`) zastępuje jednego wroga w pokoju (liczba wrogów bez zmian) i czeka w **kryjówce pod północnym murem** pokoju (kafel podłogi z murem nad sobą, co najmniej kafel od wejść). W kryjówce jest niewidoczny i nieruchomy.
- **Subtelny znak:** co 2,6 s kryjówka na 0,38 s drgnie i błysną w niej dwa ślepia (rytm przesunięty między kryjówkami). Uważny gracz ją wypatrzy; w „Mroku” trudniej.
- **Przebudzenie:** bohater bliżej niż 3 kafle (96 px) i w linii wzroku → 0,6 s ostrzeżenia (kryjówka trzęsie się coraz mocniej i błyska na czerwono, skrobanie `SoundCue.LurkWake`) i czerwona strefa lądowania (promień 26 px) w miejscu bohatera z chwili przebudzenia (najwyżej 120 px od kryjówki). Potem **doskok** (420 px/s, trzask `SoundCue.LurkBurst`, gruz) — strefa rani w chwili lądowania za ×1,3 ciosu Czyhacza. Kto z niej zejdzie, nie dostaje.
- **Kontra:** trafienie kryjówki czymkolwiek (cios, strzała, kula, promień, ultimate) wywabia go od razu — **bez doskoku i ogłuszonego na 1 s**, a obrażenia trafienia wchodzą. Automatyczne celowanie (dotyk, pad) go nie zdradza.
- **Walka:** szybszy od Rushera (132 px/s, +15%), 35 HP (ok. ×1,2 — przy 45 HP łamał regułę „≤ 7 ciosów na piętrze 10”), cios 10. Tnie **seriami po 2 ciosy** (drugi 0,22 s po pierwszym), po serii **0,8 s zadyszki** (stoi, przygaszony odcień) — okno na kontrę. Nie wraca do kryjówki. Nie bywa elitą.
- **Łup:** zawsze złoto (4–7), 15% mikstury, 6% przedmiotu — nagroda za ryzyko.
- **Co-op:** budzi go bliższy z bohaterów, doskok celuje w niego; strefa rani każdego, kto w niej stoi; HP ×1,4 jak inni wrogowie.
- **Rozmieszczenie** (`assignLurkers` w `dungeon/EncounterPlanner.ts`, po gniazdach, własna sól RNG `0x1c4e`): zwykłe pokoje o boku ≥ 5, szansa 12% na pokój (gniazdo: 20–30%), najwyżej **1 na piętro w pierwszym kręgu wieży, 2 w kolejnych**; pokój z Gniazdownikiem go nie dostaje. Pułapki i urny ruin omijają kryjówki. W arenach bossów brak.
- **Kryjówki biomów:** ruiny — wysunięty, pęknięty blok muru; leże — kokon przyklejony nićmi; Grzybnia — kopiec z grzybami; Cmentarzysko — **stojąca trumna** (uchylone wieko przy znaku); Piekło — bazaltowa płyta z żarzącą się szczeliną; palarnia — beczka ze smużką dymu. Po wyjściu zostaje rozbita (otwarta trumna, gruz, rozdarty kokon, klepki).

**Kod:** czysto — `systems/Lurk.ts` (maszyna stanów kryjówki: ukryty → budzi się → poza; wywabienie; znak), `config/lurkerConfig.ts`, seria ciosów w `AttackCycle` (`AttackSeries` w `MeleeAttackDefinition`), `lurkerDens`/`assignLurkers`; Phaser — `Enemy` (ukrycie, doskok `leapFromDen`, ogłuszenie po wywabieniu w `takeHit`, zadyszka), `EnemyManager` (budzenie przez najbliższego bohatera, strefy lądowania, `diag.note('lurker-out')`), `effects/LurkHideout.ts` (klatki i drganie kryjówki). Grafika: `tools/lurker_sprites.py` — 6 arkuszy Czyhaczy (48×48, 8 kierunków, chód i cięcie) i pas kryjówek `lurker-hideouts.png` (18 klatek 32×48: spokój, znak, rozbita).

**Testy:** `tests/systems/lurk.test.ts` (budzenie, strefa z chwili przebudzenia, limit doskoku, wywabienie, rytm znaku, archetyp i biomy, seria w `AttackCycle`), `tests/dungeon/EncounterPlanner.test.ts` (kryjówka pod murem, bez pokoi z gniazdem, limit, determinizm, rzadziej niż gniazda), `tests/assets/lurker.test.ts` (arkusze). Build zielony (2070 testów).

**Weryfikacja:** Playwright (Chromium, dev, piętro 4): trumna stoi pod murem, drga ze ślepiami, przy podejściu czerwona strefa i doskok, po wyjściu otwarta trumna; trafienie kryjówki strzałem wywabia go ogłuszonego (bez doskoku). `npm run smoke -- --floors 7 --seeds 1` (3 bohaterów) bez błędów. `npm run smoke -- --coop --floors 3`: przejście pięter bez błędów, ale sprawdzenie wskrzeszania na piętrze 1 zgłasza „P2 nie wstał” (P1 odsuwa się ok. 68 px od ciała w trakcie) — **to samo dzieje się na `main` sprzed tego kroku**, więc to osobny problem smoke'a albo wskrzeszania, do zbadania.

**Czeka na ocenę właściciela:** częstość (12%, 1/2 na piętro), widoczność znaku, czas ostrzeżenia i siła doskoku, rytm serii i zadyszki, wygląd Czyhaczy i kryjówek (placeholdery z generatora).

## Krok 124 — Lustrzana komnata, biom pięter 8–9 `#decyzja` `#lustrzana-komnata` `#sprzataczki`

**Pomysł właściciela (27.10.2026):** pajęczy duet zwalnia jedno piętro, a w jego miejsce wchodzą dwa piętra nowego biomu z dwiema sprzątaczkami-bossami. Pierwszy koncept (wiedźma z mopem) odrzucony; drugi — młode sprzątaczki, blondynka na piętrze A i brunetka na piętrze B — zaakceptowany („niech tak będzie”) `#decyzja`, razem z propozycjami z `docs/SPRZATACZKI.md` (miejsce w wieży, podział ataków, teksty okrzyków). Dodatkowa zmiana właściciela: gdy blondynka spadnie do 1/3 HP, w północnej ścianie otwiera się winda i sprzątaczka ucieka na górne piętro (krok 125).

**Plan wdrożenia:** 124 — biom; 125 — blondynka z ucieczką windą; 126 — brunetka (blondynka wraca windą w trakcie walki); 127 — pajęczy duet jako jedno piętro wspinaczki, Lustrzana komnata przechodzi na piętra 7–8. Do kroku 127 krąg ma 9 pięter, a do kroków 125–126 piętra 8–9 kończy Strażnik Piętra.

**Co powstało:**
- **Biom `BiomeId.MirrorHall`** na piętrach 8–9 (`TOWER_CONFIG.floorsPerLoop` 7 → 9): arkusz `mirror_hall_tileset` (generator `--biome mirror_hall`, paleta `lustro_opal`), dekoracje `MIRROR_HALL_DRESSING` — mało nakładek (odłamki lustra, kałuże brudnej wody, piana), rzadki kurz, lica muru „zawalone/zaciek/wybite cegły” w 35% (ku arenie 60%) i piana mydlin gęstniejąca ku arenie. Zapowiedź bossa: zimny, opalizujący odcień; muzyka zaświatów.
- **Bez mgły** — posadzka jest jasna mimo braku światła (zwykły mrok 30% na krawędziach kadru).
- **Odbicia postaci** (`effects/MirrorFloor.ts`): każda postać z ciałem fizycznym (bohaterowie, wrogowie, bossowie) ma pod sobą kopię z tą samą klatką, odwróconą w pionie, z błękitnym odcieniem; krycie 45% przy postaci, 8% na końcu. Oś odbicia to dolny nieprzezroczysty wiersz klatki (liczony raz na klatkę z jednego odczytu płótna) — od ciała fizycznego odbicie odstawało albo chowało się pod postacią. Odbicia leżą pod murami (głębokość 2,3), więc rysują się tylko na podłodze; wróg ukryty w mroku chowa też odbicie.
- **Błyski polerowania:** co 90–260 ms na losowym kaflu podłogi w kadrze miga błysk (`polish-sparkle.png`, mieszanie ADD nad warstwą mroku — świeci), najwyżej 14 naraz.
- **Wrogowie biomu:** na razie z ruin (Rusher, Kiter, gniazdo, Czyhacz) — pytanie o własnych wrogów zostaje otwarte. Testy „każdy biom ma własne gniazdo/Czyhacza” pomijają ten biom do decyzji.
- Liczby w `config/lightingConfig.ts` (`MIRROR_FLOOR`) i `config/dressingConfig.ts` — moje, do oceny.

**Testy:** `tests/assets/biomes.test.ts` (piętra 8–9 i 17 to Lustrzana komnata, arkusz ma grupy dekoracji, odbicie tylko w tym biomie i gaśnie ku dołowi). Testy pętli wieży, aren, wyboru piętra, zapisów, ukrytej komnaty i Czyhacza liczą teraz piętra z `TOWER_CONFIG.floorsPerLoop` zamiast stałej 7. Build zielony (2077 testów).

**Weryfikacja:** Playwright (Chromium, dev, `?floor=8`, `?floor=9`, `?boss=1`): posadzka jasna, odbicia barbarzyńcy, łucznika, Czarodziejki i Strażnika pod stopami, błyski na podłodze, bez błędów w konsoli.

**Czeka na ocenę właściciela:** siła odbić (45% → 8%), gęstość błysków, jasność posadzki, gęstość dekoracji muru.

## Krok 125 — Blond sprzątaczka „Mokra Podłoga” i ucieczka windą `#sprzataczki` `#lustrzana-komnata`

**Co powstało:** boss piętra 8 (`CLEANER_BLONDE`, `BossId.CleanerBlonde`) według zaakceptowanego konceptu (`docs/SPRZATACZKI.md`) i pomysłu właściciela z ucieczką windą.

**Walka:**
- **Chlust z wiadra** (nowy atak `BossAttackKind.Spill`, we wzorze): po zamachu (0,75 s) woda uderza w miejsce gracza (strefa 34 px, 6 obrażeń, odrzut) i rozlewa się w **kałuże mydlin** — pierwsza pod graczem, druga za nim (we wściekłości trzy). Kałuża rośnie do 44 px i leży 8 s.
- **Poślizg** (`SlipEffect`, `systems/Slip.ts`, `Player.applyTerrainSlip`): na mokrym prędkość bohatera dąży do zamierzonej powoli (siła 2,2/s) — sunie po puszczeniu klawiszy, skręca z bezwładnością, pęd z odrzutu i dasha wygasa długo. Trzyma jeszcze 0,45 s po zejściu z kałuży. Dash nie chroni (po dashu na mokrym sunie się dalej). Kałuża łapie ślad stóp (jak grzyby Pożeracza). Przy wejściu na mokre napis „Ślisko!” (najwyżej co 2,5 s).
- **Wiadro na sznurze** (hak z `look: 'bucket'`, poza wzorem, gdy gracz stoi 110–240 px od niej): linia stref, wiadro leci na sznurze, trafiony ląduje pod jej stopami, a 0,45 s później zamach miotłą przed sobą.
- **Cios miotłą** (cleave, we wzorze): krótki zamach przed sobą, 16 obrażeń.
- **Polerowanie:** stojąc (także przed walką) gra animację polerowania i sypie błyskami spod miotły (nad mrokiem — świecą).
- **Okrzyki** (`BossShoutDefinition`, `systems/BossShouts.ts`): napis nad głową (biały z obrysem, 1,3 s) i piskliwy dźwięk `SoundCue.Shout`. Na początku ataku: chlust — „Nie chodź po mokrym!”/„Uwaga, ślisko!”, wiadro — „Do wiadra z tobą!”, miotła — „Zaraz cię wymiotę!”, ryk wściekłości — „Kto tu nabłocił?!”; co 5–9 s linia z listy konceptu. Nowy napis zastępuje poprzedni. Teksty w `config/bossConfig.ts`.
- **Wściekłość** przy 60% HP (serie po dwa ataki, krótsze telegrafy), żeby przed ucieczką było jej trochę.
- Świta: Rusher biomu (na razie śmieciarz z ruin).

**Ucieczka windą** (pomysł właściciela `#decyzja`, `BossEscapeDefinition`, `systems/BossEscape.ts`):
- Winda stoi w północnym murze areny od początku (zamknięta) — `dungeon/ElevatorPlanner.ts` wybiera dwa kafle muru nad podłogą areny najbliżej osi, z odstępem od wejść. Sprite `service-elevator.png` (generator `tools/cleaner_sprites.py`): stalowa rama, rozsuwane drzwi, lampka ze strzałką w górę.
- Przy **1/3 HP** drzwi się otwierają (dzwonek `SoundCue.Elevator`), sprzątaczka krzyczy „Sprzątaj sobie sam!”, przerywa walkę i biegnie do windy (×2,2 chodu) — w tym czasie jest nietykalna; zaplanowane strefy i kałuże działają do końca, nowa świta już nie wychodzi. Przy drzwiach wsiada (0,7 s), drzwi się zamykają (0,6 s) i odjeżdża.
- Odjazd = pokonanie piętra: łupy przed windą, karty (napis „SPRZĄTACZKA UCIEKŁA!” zamiast „STRAŻNIK POKONANY”), schody, kraty. Do progu trafienia nie zbijają jej poniżej 1 HP, więc ucieczka zawsze nastąpi (nie da się jej zabić jednym potężnym ciosem).
- Działa też w arenach bossów (arena 8).

**Grafika:** arkusze z kroku konceptu podpięte w `spriteConfig` (`cleanerBlonde`, `soapPuddle`, `waterSplash`, `plasticBucket`, `serviceElevator`), wygląd w `BOSS_VISUALS` (chlust, wiadro, miotła, krzyk; `idle: 'polish'`) i `CLEANER_FX_VISUAL`. Dźwięki z syntezy: okrzyk, plusk, winda.

**Testy:** `tests/ai/Cleaners.test.ts` (piętro 8, chlust i kałuże, ślad stóp, wiadro i miotła, hak z dystansu w `BossBrain`, skalowanie, okrzyki z odstępem i bez powtórzeń, deterministyczne, próg ucieczki, limit obrażeń, etapy odjazdu, poślizg niezależny od klatek), `tests/dungeon/ElevatorPlanner.test.ts`, `tests/assets/cleaners.test.ts`. Testy „reszta pięter ma Strażnika” liczą piętro z `floorsPerLoop`. Build zielony (2132 testy).

**Weryfikacja:** Playwright (Chromium, dev, `?floor=8&boss=1`): kałuże pod i za bohaterem, „Ślisko!”, okrzyki nad głową, odbicie sprzątaczki w posadzce; po zbiciu HP do 1/3 drzwi windy się otwierają, sprzątaczka biegnie, wsiada, drzwi się zamykają, pojawiają się karty nagrody. Bez błędów w konsoli.

**Czeka na ocenę właściciela:** siła poślizgu (2,2/s, 0,45 s), wielkość i czas kałuż, częstość okrzyków, próg wściekłości (60%), HP (600 przed skalowaniem; walka trwa do 1/3), wygląd windy i kałuży.

## Krok 126 — Czarnowłosa sprzątaczka „Twarda Miotła” i powrót blondynki windą `#sprzataczki` `#lustrzana-komnata`

**Co powstało:** boss piętra 9 (`CLEANER_DARK`, `BossId.CleanerDark`) na wspólnym modelu sprzątaczek oraz pierwszy duet we wspinaczce: w połowie walki z brunetką z windy wraca blondynka, która uciekła piętro niżej.

**Walka brunetki:**
- **Cios miotłą** (cleave): szerszy i mocniejszy niż u blondynki (42 px, 19 obrażeń, mocny odrzut).
- **Plątanie** (nowy atak `BossAttackKind.Tangle`, `TangleAttackDefinition`): wbija miotłę w posadzkę, po 0,8 s pod graczem wyrasta czarne włosie (strefa 26 px, 4 obrażenia). Trafiony jest **unieruchomiony** na 1,1 s (`RootEffect`, `systems/Root.ts`, `Player.applyRoot`): nie chodzi i nie robi dasha, ale atakuje dalej. Potem przez 2,2 s jest odporny — nigdy dwa unieruchomienia pod rząd. Włosie (`broom-tangle.png`: wyrasta, trzyma, pęka) idzie za bohaterem przy odrzucie, napis „Zaplątany!”. Dash i nietykalność po trafieniu chronią jak przed każdym atakiem. We wściekłości dwie strefy, druga tam, dokąd bohater biegnie.
- **Chlust** jak u blondynki, ale z jedną kałużą (mniej poślizgu, więcej plątania).
- Okrzyki: wspólna lista plus „Stój, nie depcz!”/„Ani kroku dalej!” przy plątaniu. Wściekłość przy 50% HP. Zwłoki zostają (bez roztapiania). Świta: Rusher biomu.

**Powrót blondynki** (decyzja z karty w wątku: opcja polecana „wraca w walce z brunetką”, właściciel zostawił wybór mnie `#decyzja`):
- `CLIMB_DUETS` w `config/bossConfig.ts` — duet z wejściem (`DuetArrival` w `systems/BossDuet.ts`: `shouldPartnerArrive`, `arrivalWounds`). Wspinaczka i areny bossów używają go tak samo; pajęczy duet zostaje tylko w arenach.
- Do progu blondynki nie ma na arenie: niewidoczna, bez ciała, nie jest celem, pasek pokazuje samą brunetkę. Gdy brunetka spadnie do **50% HP** (albo padnie wcześniej), drzwi windy w północnym murze się otwierają, blondynka wychodzi z nich (0,7 s, nietykalna) z **1/3 HP** — tyle, z ilu uciekła — krzyczy „Znowu ty?!” i walczy do końca (bez ponownej ucieczki). Pasek zmienia się na wspólny „Sprzątaczki — Wielkie sprzątanie”.
- Nagroda, łupy i schody dopiero po obu.

**Testy:** `tests/systems/root.test.ts` (czas, brak przedłużania, odporność), `tests/systems/bossDuetArrival.test.ts` (próg wejścia, rany, duet na piętrze 9 w każdym kręgu, HP powrotu = HP ucieczki), brunetka w `tests/ai/Cleaners.test.ts` (piętro 9, plątanie i wściekłość z wyprzedzeniem, jedna kałuża, skalowanie, wygląd), jej arkusze w `tests/assets/cleaners.test.ts`. Build zielony.

**Weryfikacja:** Playwright (`?floor=9&boss=1`): brunetka walczy sama, pasek „Sprzątaczka”; po zbiciu jej HP do połowy winda się otwiera, blondynka wychodzi z 1/3 HP z okrzykiem „Znowu ty?!”, pasek „Sprzątaczki”; po pokonaniu obu — nagroda. Plątanie: bohater stoi mimo wciśniętego klawisza, włosie na stopach, po 1,1 s rusza. Znaleziony i naprawiony błąd: unieruchomienie sprawdzało nietykalność, którą przed chwilą włączyło samo trafienie. Test dymny kroku 125 (piętra 1–9, trzej bohaterowie) zielony.

**Czeka na ocenę właściciela:** długość unieruchomienia (1,1 s) i odporności (2,2 s), próg powrotu blondynki (50% HP brunetki), HP brunetki (700 przed skalowaniem), wygląd włosia.

## Krok 127 — Pajęczy duet we wspinaczce, Lustrzana komnata na piętrach 7–8 `#decyzja` `#lustrzana-komnata` `#sprzataczki`

**Co powstało:** układ wieży z zaakceptowanego konceptu sprzątaczek (`docs/SPRZATACZKI.md`, punkt 1): pajęczy duet zwalnia piętro, a Lustrzana komnata zajmuje koniec kręgu.

**Nowy krąg (8 pięter, `TOWER_CONFIG.floorsPerLoop` 9 → 8):** 1 ruiny · 2 Grzybnia — Król i Matka Pająków w duecie (od początku, oboje z pełnym HP, świtę przywołuje tylko Król) · 3 Cmentarzysko — Grzybowy Pożeracz · 4–5 Piekło — Strażnik Bram, Kat Otchłani · 6 Palarnia — Baron Dymu · 7 Lustrzana komnata — blondynka (ucieka windą) · 8 Lustrzana komnata — brunetka (blondynka wraca windą). Od piętra 9 kolejny krąg.

**Decyzje:**
- Piętro duetu to **Grzybnia** (arena Króla, ukryta komnata po nim zostaje — reguła jest przypięta do biomu). **Pajęcze leże** wypada na razie ze wspinaczki (biom i kafle zostają w kodzie, do użycia jako filler albo w przyszłym kręgu) — `#decyzja` do potwierdzenia przez właściciela.
- Duety mają jedną listę `BOSS_DUETS` (`config/bossConfig.ts`) dla wspinaczki i aren bossów; `BOSS_RUSH_DUETS` usunięte. Partner duetu wskazany przez `BossId` (`bossById`), bo Matka Pająków nie ma już własnego piętra.
- Wybór piętra pokazuje nazwę duetu („Matka i Król Pająków”).
- Areny bossów idą za wspinaczką: arena 2 to pajęczy duet, 7–8 sprzątaczki.
- Uwaga: zapisy i postęp „Wybór piętra” pamiętają numer piętra — po zmianie układu stary zapis z piętra 3+ wczyta nowy biom tego numeru.

**Testy:** testy bossów i biomów przepięte na nowy układ (piętra, krąg 8, ukryta komnata na piętrze 2, duet na piętrze 2 w każdym kręgu, Matka bez własnego piętra). Build zielony (2158 testów).

**Weryfikacja:** Playwright, `?floor=2&boss=1`: pasek „Matka i Król Pająków”, oboje walczą od wejścia, po pokonaniu obojga — nagroda. Bez błędów w konsoli.

## Krok 128 — Generator: bez równoległych korytarzy i pięter-okrążeń `#ocena` `#decyzja`

**Skąd:** ocena właściciela po testach (27.10.2026): „często spotykałem równolegle biegnące do siebie korytarze albo mapy będące jednym wielkim okrążeniem dookoła”. Właściciel poprosił o przegląd generatora przy okazji nowego biomu i bossów, wdrożenie bez pytania.

**Pomiar (480 pięter: piętra 1–8 kręgu × 60 seedów).** Narzędzie analizy w scratchpadzie, te same miary w `tests/dungeon/corridorLayout.test.ts`.
- **Równoległy bieg:** dwa pasy korytarza rozdzielone 1–3 kaflami muru na długości ≥ 6 kafli.
- **Czysty pierścień:** cykl pokojów bez skrótów obejmujący co najmniej połowę piętra.

| | przed | po |
|---|---|---|
| pięter z równoległymi korytarzami | 31% (piętro 8: 48%) | 5% |
| czysty pierścień ≥ połowy piętra | 7% | 1% |
| cykli na piętro (średnio) | 1,76 | 1,06 |

**Przyczyny:**
- Każdy korytarz był niezależnym „L” od środka do środka, więc korytarze z sąsiednich pokojów biegły obok siebie, czasem zlewając się w szeroki pas.
- Dodatkowe połączenia (pętle) łączyły losowe pary pokojów. Gdy para była już połączona, drugie „L” w drugą stronę tworzyło prostokąt z dwóch równoległych korytarzy. Gdy pokoje były daleko, powstawało okrążenie całego piętra.

**Zmiana (`dungeon/DungeonGenerator.ts`, liczby w `BASE_DUNGEON_CONFIG.routing`):**
- **Korytarz to najtańsza droga** (Dijkstra ze stanem kierunku):
  - krok kosztuje 1, zakręt +4, więc korytarze zostają proste jak dawne „L”;
  - krok po istniejącej podłodze kosztuje 0,5, więc korytarze łączą się w skrzyżowania;
  - krok, którego pędzel dotyka muru do 2 kafli od cudzej podłogi, kosztuje +6, więc korytarz nie biegnie wzdłuż innego ani nie ociera się o ściany pokojów.
  - Ograniczenia z kroku 45 (arena na końcu, ukryta komnata) działają jak dotąd.
- **Pętle to lokalne skróty.** Kandydaci to pary pokojów od najbliższych w przestrzeni (z lekkim losowym rozrzutem). Pętla:
  - musi obejmować co najmniej 3 pokoje, więc nie dubluje połączenia dwóch sąsiadów;
  - może objąć najwyżej połowę pokojów piętra, więc nie ma okrążenia;
  - musi być w co najmniej połowie nowym korytarzem, a nie przejściem po starych.
  - Liczba pętli bez zmian (`extraConnectionRatio`), ale część kandydatów odpada, stąd mniej cykli. Tracimy głównie te zbędne: równoległe duble i okrążenia.
- Rozmiary map, liczba i wielkość pokojów, arena i reguła końca piętra bez zmian. Te same seedy dają teraz inne mapy.

**Testy:** `tests/dungeon/corridorLayout.test.ts` (200 pięter):
- równoległe korytarze na mniej niż 10% pięter;
- pierścień na mniej niż 3%;
- na dużych piętrach średnio co najmniej 1 pętla;
- każde piętro spójne.

Dotychczasowe testy generatora i planerów (arena na końcu, ukryta komnata, zasadzki, kapliczki, pułapki…) przechodzą bez zmian.

**Czeka na ocenę właściciela:** czy mapy są ciekawsze i czy pętli nie jest za mało (do podkręcenia przez `extraConnectionRatio` albo `routing.loops.maxRoomsRatio`).

## Krok 129 — Spacja nie zatwierdza wyborów w menu `#ocena`

**Skąd:** karteczka testera (29.10.2026), uwaga 1: „spacja nie może służyć do zatwierdzania wyboru w menu — gracz stracił przez to zapis gry”. Spacja to dash, więc gracz wciska ją odruchowo w biegu; gdy w tej chwili otwierała się pauza albo menu, spacja wybierała podświetloną opcję.

**Zmiana:**
- `menuCommandFromKey` (`systems/gamepadInput.ts`) nie zamienia już spacji na `MenuCommand.Confirm`. Funkcja obsługuje klawiaturę w menu głównym, pauzie (z podstronami zapisu), wyborze bohatera i wyborze co-op, więc wszędzie tam zatwierdza tylko **Enter** (i kliknięcie, i A na padzie).
- Dołączanie do co-opu z klawiatury (`input/CoopJoinInput.ts`): tylko Enter, bez spacji — ta sama zasada.
- Bez zmian: spacja jako dash w grze, spacja w imieniu na ekranie śmierci, karty nagród (cyfry), dowolny klawisz na ekranie startowym (tylko pomija animację).

**Testy:** `tests/systems/gamepadInput.test.ts` — spacja daje `null`, Enter zatwierdza. `npm run build`: 131 plików, 2162 testy.

**Weryfikacja w przeglądarce:** w menu głównym trzy wciśnięcia spacji nic nie zmieniają, Enter przechodzi do wyboru bohatera.

## Krok 130 — Odliczanie 3-2-1 po wznowieniu z pauzy `#ocena` `#sterowanie`

**Skąd:** karteczka testera (29.10.2026), uwaga 3: „po wstrzymaniu gry w jakimkolwiek trybie musimy dać chwilę na przypomnienie graczowi, w jakiej sytuacji zatrzymał rozgrywkę — krótkie odliczanie 3-2-1”.

**Co powstało:**
- `systems/ResumeCountdown.ts` (czysty): odliczanie na surowym czasie klatek (`delta`), bo czas gry stoi w pauzie (`PauseClock`). Pojedyncza klatka liczy się najwyżej 100 ms, więc po zacięciu karty odliczanie nie przeskakuje.
- `scenes/PauseScene.ts`: „Wznów” (Enter, P, Esc na stronie głównej, Start, kliknięcie obok listy, stuknięcie na telefonie) nie zamyka już pauzy od razu:
  - panel menu znika, nakładka jaśnieje (alfa 0,22 zamiast 0,72), więc widać planszę, wrogów i HUD;
  - nad bohaterem (nie na nim) duża cyfra 3 → 2 → 1 z pulsem i podpis „Przygotuj się…”, piknięcie na każdą cyfrę, na start gry dźwięk potwierdzenia;
  - czas gry przez cały czas zamrożony, gra rusza dokładnie po 3 s;
  - Esc / P / Start / B w trakcie odliczania wraca do menu pauzy; utrata fokusu (inne okno, ukryta karta) też;
  - inne klawisze (zapis 1/2/3, M, kursor) w trakcie odliczania nic nie robią.
- Liczby i wygląd w `PAUSE_CONFIG.countdown` (`config/pauseConfig.ts`).
- Działa wszędzie, gdzie jest pauza: wspinaczka, areny, wybór piętra, co-op i telefon (ta sama `PauseScene`). Wyjście do menu z pauzy — bez odliczania.

**Testy:** `tests/systems/resumeCountdown.test.ts` — kolejność 3/2/1 i koniec po 3 s, jedna zmiana na krok, długa klatka nie przeskakuje, domyślne 3 s.

**Weryfikacja:** `npm run build`; w przeglądarce (Playwright): Esc → pauza, Enter → odliczanie z widoczną planszą, czas gry stoi (`time.now` bez zmian), Esc w trakcie → z powrotem menu, P → po 3 s gra rusza; `npm run smoke` solo i `--coop`.

**Czeka na ocenę właściciela:** długość (3 s), jasność nakładki, czy podpis „Przygotuj się…” jest potrzebny.

## Krok 131 — Bossowie nie pojawiają się bohaterowi na twarzy `#ocena` `#boss` `#areny-bossow` `#coop`

**Skąd:** karteczka testera (29.10.2026, przekazana przez właściciela), uwaga 2: „nasze pająki i inne bosy respią się bohaterowi na twarzy — nie może tak być”.

**Przyczyna:**
- Boss stawał zawsze na środku areny, a w duecie — 2,5 kafla po bokach środka (Król z lewej, Matka z prawej).
- W arenach bossów i przy `&boss=1` bohater startuje 2 kafle od lewego muru areny, czyli ok. 3 kafle od środka. Król Pająków stawał wtedy pół kafla od niego (seed 7, piętro 2: 1,5 kafla między środkami ciał).
- We wspinaczce Król w duecie mógł stać ok. 3,5 kafla od wejścia areny, gdy wejście było z lewej.
- Świta liczyła odstęp tylko od jednego bohatera — w co-opie mogła wyjść tuż przy drugim.

**Zmiana:**
- Nowy czysty planer `dungeon/BossSpawnPlanner.ts` (`planBossSpawn`, `spawnKeepOuts`): wymarzone miejsce (środek, w duecie bok środka) zostaje, jeśli trzyma odstęp od wszystkich bohaterów, od wejść areny i od drugiego bossa duetu. W przeciwnym razie boss staje na najbliższym kaflu areny, który odstęp trzyma (ciało mieści się na arenie); gdy takiego nie ma — tam, gdzie brakuje go najmniej.
- Liczby w `BOSS_SPAWN_SAFETY` (`config/bossConfig.ts`): 5 kafli od bohatera i od wejścia, 4 kafle między bossami duetu.
- `BossFight` planuje start przy tworzeniu walki (`spawnPoint`); `BossEncounter` rozstawia duet: gospodarz omija miejsce partnera, partner — miejsce gospodarza. Partner wchodzący windą (sprzątaczki) startuje poza areną, więc gospodarz go nie omija.
- Wyjście sprzątaczki z windy: bohater stojący przed drzwiami zostaje odsunięty poza jej ciało (+24 px), zanim się pojawi.
- Świta: odstęp od **każdego** żywego bohatera (co-op) i 4 zamiast 3 kafli (`RETINUE_BASE.minPlayerDistanceTiles`).
- Wspinaczka: boss pojedynczy nadal stoi na środku (wejścia są ok. 6 kafli od środka); trudność walki bez zmian.

**Testy:** `tests/dungeon/BossSpawnPlanner.test.ts` (środek zostaje, gdy bohater daleko; areny — odsunięcie na 5 kafli; duet z dwoma bohaterami i wejściem; ciało na arenie; brak pełnego odstępu; determinizm), świta w co-opie w `tests/systems/BossRetinue.test.ts`; planer dopisany do `PURE_FILES`.

**Weryfikacja w przeglądarce** (pozycje startu w kaflach):
- duet, piętro 2, `&boss=1`: bohater (48,5; 13,5), Król (51,5; 9,5) — 5 kafli, wcześniej 1,5; Matka (55; 13,5);
- to samo w co-opie: obaj bohaterowie co najmniej 5 kafli od obu bossów;
- areny bossów, arena 2: Król 5 kafli od bohatera;
- Grzybowy Pożeracz, piętro 3, `&boss=1`: 5,1 kafla (wcześniej ok. 4);
- wspinaczka bez `&boss=1`: miejsca bez zmian.
- `npm run build`, `npm run smoke` i `npm run smoke -- --coop`.

**Czeka na ocenę właściciela:** czy 5 kafli wystarcza i czy boss odsunięty od środka areny w arenach nie przeszkadza.

## Krok 132 — Wrogowie czekają za kratami `#ocena` `#zasadzka`

**Skąd:** ocena właściciela (29.10.2026): w zasadzce z upiorami, po opuszczeniu krat, wróg z korytarza próbował atakować i przebić się przez kratę. Właściciel: wrogowie spoza zamkniętego pokoju mają stanąć tuż przy kracie i czekać, a po podniesieniu krat ruszyć na ułamek sekundy szybciej („nabuzowani i wygłodniali”).

**Reguła (`systems/GateWait.ts`, liczby w `config/gateWaitConfig.ts`)** — wspólna dla zasadzki i areny bossa, bo obie opuszczają te same kraty:
- Kraty opadają → pokój trafia do rejestru razem z miejscami czekania: środek kraty przesunięty o 0,85 kafla na zewnątrz (`gatePosts`; krata z murem za plecami nie ma miejsca).
- Wróg spoza pokoju, którego cel stoi w środku, a który już ściga (albo widzi cel w zasięgu aggro), idzie do najbliższego miejsca czekania widocznego z jego pozycji i stoi przodem do celu. Nie atakuje (dotyczy też strzelców i szarży Tarczownika); zaczęty zamach przepada. Wróg bezczynny daleko od pokoju zostaje bezczynny.
- Czekając, przebiera nogami w miejscu (animacja chodu) — widać, że się rwie.
- Kraty się podnoszą → każdy czekający dostaje zryw: 450 ms z prędkością ×1,8, potem zwykły pościg.
- Wyjątki: strzelcy w galeriach areny Strażnika Bram (krok 44 — ostrzał zza krat jest ich zadaniem) i Czyhacz w kryjówce. Upiory zasadzki i świta bossa są w środku, więc reguła ich nie dotyczy.

**Phaser:** `EnemyPerception.holdAt` / `speedMultiplier` (wróg wykonuje rozkaz w `Enemy.waitAtGate`), `EnemyManager` pyta `GateWait` o rozkaz w każdej klatce, `AmbushManager` i `ArenaGates` zgłaszają opuszczenie i podniesienie krat.

**Testy:** `tests/systems/gateWait.test.ts` — miejsca czekania po stronie korytarza, krata z murem za plecami, wróg w pokoju i wróg bezczynny nie czekają, wybór najbliższej kraty, powrót do pościgu, gdy cel wyjdzie, zryw tylko dla czekających i tylko przez `durationMs`, miejsca czekania aren na prawdziwych piętrach.

**Weryfikacja:** `npm run build`; scenariusz w przeglądarce (seed 1, piętro 2): Rusher wpuszczony do korytarza nad zasadzką podszedł pod kratę, stanął 11 px od niej i stał przez całą falę; po podniesieniu krat ruszył z prędkością 248 px/s (bazowo 138) i po ok. 0,45 s wrócił do 138. `npm run smoke` solo i `--coop` bez błędów.

**Czeka na ocenę właściciela:** długość i siła zrywu, odległość od kraty, czy wrogowie z dalszych korytarzy mają dołączać (dziś tylko ci, którzy już ścigają albo widzą bohatera).

## Krok 133 — Czat „Napisz do autora” i ukryta tablica współtwórców `#decyzja` `#feedback`

**Skąd:** pomysł właściciela (29.10.2026): F9 jest ukryte (na laptopie to Fn+F9, w Firefoksie skrót czytnika, na telefonie go nie ma) i działa w jedną stronę. Właściciel chce czegoś „jak okienko w Messengerze”: Enter w grze i piszesz, co cię gryzie. Publiczne GitHub Issues i Discord odpadają (prywatność, za dużo). Do tego `#decyzja`: **ukryta tablica zasłużonych testerów** — kiedyś osiągnięcie albo lista w menu; punkty to gwiazdki przyznawane ręcznie przez autora, a ogólna liczba zgłoszeń jest zapisywana obok, tylko informacyjnie (nie jest wiążąca). Tester rozpoznawany anonimowym identyfikatorem przeglądarki (jak w F9) i imieniem z tablicy wyników.

**Gra:**
- **Enter w grze** (PC, solo i co-op) pauzuje i otwiera okienko „Napisz do autora”; po wysłaniu (Enter) okienko dziękuje i gra wraca z odliczaniem 3-2-1. Shift+Enter — nowa linia, Esc — zamknij.
- **Pauza:** pozycja „💬 Napisz do autora” (przed „Menu główne”) — tak samo na padzie (A — wyślij, B — zamknij; pisze się z klawiatury) i na telefonie (stuknięcie otwiera pole z klawiaturą ekranową). Pozycja jest tylko wtedy, gdy gra zna adres workera (`VITE_SCORES_URL`).
- Okienko to warstwa DOM (`diagnostics/FeedbackBox.ts`), bo tylko prawdziwe pole tekstowe pozwala wygodnie pisać, także na telefonie. Klawisze w okienku nie docierają do Phasera (inaczej P wznawiałoby grę, M wychodziło do menu).
- Wiadomość: słowa testera, a pod kreską kontekst (piętro, bohater, HP, złoto, walka z bossem, PC/telefon, wersja) i podpis imieniem z tablicy wyników (`systems/Feedback.ts`). Bez dziennika i nagrania — to nie raport błędu.
- Limity gry: 2–600 znaków, co najmniej 10 s odstępu, 12 wiadomości na sesję (`config/feedbackConfig.ts`). Zgłoszenia F9 też dostają imię gracza.

**Worker (`worker/src/reports.js`, `index.js`, `inbox.js`):**
- Wiadomości to zgłoszenia rodzaju `feedback` (koperta wersji 1 przewidziała go od kroku 57; nowe pole `client.name`). **Nie są kasowane po 30 dniach** (retencja dotyczy tylko raportów F9) i mają osobne limity z adresu: 12 na godzinę, 40 na dobę (raporty F9 bez zmian: 5 i 20).
- Tabela `contributors`: na identyfikator przeglądarki — imię, liczba wiadomości, liczba raportów F9, suma gwiazdek, pierwsza i ostatnia data. Przy każdym zgłoszeniu licznik rośnie.
- `PATCH /reports/:id {stars: 0–3}` (token autora) — gwiazdki za wiadomość; suma przeliczana w `contributors` (także po usunięciu wiadomości). `GET /contributors` (token) — ukryta tablica: najpierw gwiazdki, potem liczba wiadomości.
- **Skrzynka autora: `GET /inbox`** — strona w workerze: token wpisuje się raz (zostaje w tej przeglądarce), zakładki Wiadomości (treść, kontekst, ★ 1–3, usuń), Współtwórcy, Raporty F9. Sama strona nic nie zdradza bez tokena; treść testerów wstawiana tylko jako tekst.
- Lista `/reports` zwraca też początek treści (`preview`, 700 znaków), imię i gwiazdki.
- Migracja `worker/migrations/0005_feedback.sql` (kolumny `player_name`, `stars`, tabela `contributors`) — **przed wdrożeniem workera**.

**Testy:** `tests/systems/feedback.test.ts` (porządkowanie wiadomości, kontekst, imię w kopercie zgodne z walidacją workera), `tests/systems/pauseMenu.test.ts` (pozycja w pauzie), `tests/worker/reports.test.ts` i `index.test.ts` (osobne limity, imię, licznik współtwórcy, gwiazdki tylko z tokenem i 0–3, suma po usunięciu, cron nie rusza wiadomości, `/inbox` bez danych).

**Weryfikacja:** `npm run build`; w przeglądarce (worker podstawiony przez Playwright): PC — Enter w grze otwiera okienko w pauzie, wpisane „P”, „M”, „N” zostają w polu (gra dalej w pauzie), Enter wysyła kopertę `feedback` z imieniem i kontekstem, okienko znika, gra wraca z odliczaniem; telefon (`mobile.html`) — stuknięcie pozycji w pauzie otwiera pole z fokusem, „Wyślij” wysyła. `npm run smoke` (piętra 1–2, trzej bohaterowie) bez błędów.

**Wdrożenie (29.10.2026, zgoda właściciela):** migracja `0005_feedback.sql` na produkcyjnej D1, tabela `contributors` uzupełniona z dotychczasowych zgłoszeń (3 przeglądarki, 8 raportów F9), worker wdrożony; próbna wiadomość przyjęta (201, imię i licznik zapisane) i usunięta. Skrzynka: `https://tower-crawler-scores.wvytz.workers.dev/inbox`.

**Na później:** osiągnięcie „Współtwórca TOP DOWN” albo lista zasłużonych w menu (gra zapyta worker o swoje gwiazdki), odpowiedzi autora i statusy widoczne dla testera („zrobione w wersji X”), kod testera do przeniesienia historii na inne urządzenie.

## Krok 134 — Jeden tarczownik i jedno piętro Piekła `#decyzja` `#boss` `#balans`

**Skąd:** decyzja właściciela (30.10.2026): „scalamy tarczowników, jeden wystarczy, tak samo jeden poziom z ich biomu”. Dwaj bossowie z tarczą (Strażnik Bram, Kat Otchłani) na dwóch piętrach Piekła to za dużo tego samego.

**Zmiana:**
- **Piekło ma jedno piętro (4)** i jednego bossa z tarczą — **Kata Otchłani**. Kat ma już wszystkie ciosy Strażnika (tarcza ze zbijaną osłoną, wirujący łańcuch, uderzenie tarczą, skok), a do tego hak, oddech palenisk, rozgrzewanie tarczy promieniem i pierścień ognia — jest „scalonym” tarczownikiem. Galerie z kultystami (Strażnik) nie przechodzą na Kata — wybór właściciela na karcie decyzji (Kat bez galerii).
- **Strażnik Bram** wypada ze wspinaczki i aren bossów; definicja, sprite'y i galerie zostają w kodzie (jak Pajęcze leże), gdyby miał wrócić.
- **Krąg wieży: 8 → 7 pięter** (`TOWER_CONFIG.floorsPerLoop`): 1 ruiny, 2 Grzybnia (pajęczy duet), 3 Cmentarzysko, 4 Piekło (Kat), 5 Zadymiona palarnia (Baron Dymu), 6–7 Lustrzana komnata (sprzątaczki). Duet sprzątaczek (`BOSS_DUETS`) przeniesiony na `floorInLoop: 7`. Areny bossów idą za `BOSS_BY_FLOOR` — arena 4 to Kat, arena 5 Baron itd.
- Paleniska: `heatBaseFloor` zostaje 5 — na piętrze 4 tempo bazowe, w kolejnych kręgach przyspieszają jak dotąd.
- Elita Tarczownik (szarża, kroki 99 i 113) bez zmian — to cecha elity, nie boss.

**Skutki uboczne (świadome):** zapis gry i postęp wyboru piętra trzymają numer piętra, więc stary zapis z piętra 5–8 wczyta się w nowym układzie (np. dawne piętro 5 z Katem to teraz palarnia, dawne 8 — ruiny drugiego kręgu). Klucze `tower-crawler.*` bez zmian; wyniki na tablicach bez zmian.

**Testy:** zaktualizowane `GateWarden`, `SmokeBaron`, `Cleaners`, `biomes`, `bossDuet`, `bossDuetArrival`, `towerLoop`; nowy test: Strażnik Bram nie kończy żadnego piętra kręgu.

**Weryfikacja:** `npm run build` (2205 testów); w przeglądarce `?seed=7&floor=N&boss=1`: piętro 4 — Piekło, Kat Otchłani z paleniskami; 5 — palarnia; 7 — Lustrzana komnata; 8 — ruiny (drugi krąg). Bez błędów w konsoli.

## Krok 135 — Ikonka gry: wieża, czarne słońce i zaświaty `#decyzja` `#ikonka`

**Skąd:** prośba właściciela (30.10.2026) o ikonkę w motywie zniszczonej wieży z czarnym słońcem (ekran startowy, krok 60). Trzy propozycje w pikselach (A „Zaćmienie”, B „Czarne Słońce”, C „Góra i dół”) i na życzenie właściciela C2 — wersja C bez żółtej linii między światami. **Wybór właściciela: C2.**

**Co powstało:**
- Generator `tools/game_icon.py` (Pillow): rysunek 32×32 z palety `SPLASH_PALETTE` — wyszczerbiona wieża przed czarnym słońcem, pod spękaną ziemią jej czerwone odbicie w zaświatach z czerwonym słońcem (TOP i DOWN bez słów). Granicą światów jest ciemny pas gruzu z żarzącymi się pęknięciami.
- Eksport do `public/icons/`: `favicon.svg` (ostre piksele, `crispEdges`), `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`. PNG powiększane całkowicie (najbliższy sąsiad); przy 180 px margines powtarza skrajne piksele.
- `index.html` i `mobile.html`: favicon SVG z zapasowym PNG i ikona dla iOS. Wersja na telefon dostała też `manifest.webmanifest` (ikony 192/512, pełny ekran, poziomo) — „Dodaj do ekranu głównego” pokazuje ikonkę gry.

**Testy i weryfikacja:** `npm run build` (typy, 2205 testów, build); w `dist/` linki ikon mają ścieżki względne (`./icons/…`, działa pod `/topdown/` na Pages), pliki ikon i manifest są w buildzie. Podglądy 16/32/64/192 px ocenił właściciel.

**Na później:** ikonka może trafić na ekran wyboru, do plakatów i na kartę udostępniania (Open Graph).

## Krok 136 — Paski HP duetu i strzałka do bossa poza kadrem `#ocena` `#boss` `#areny-bossow`

**Skąd:** prośba właściciela (30.10.2026): „każdy z bossów pająków musi mieć swój własny pasek HP widoczny na ekranie. Poprawmy też minimalnie widoczność na arenach bossów — frustrujące, gdy boss zostanie daleko w narożniku i zatrzyma się na dłuższej animacji”.

**Co powstało:**
- **Osobne paski duetu.** `duetStatus` (`systems/BossDuet.ts`) oddaje oprócz sumy HP listę `members` (imię, HP, wściekłość, pokonany). HUD rysuje w duecie dwa paski obok siebie w szerokości dawnego jednego (2 × 200 px), z imieniem nad każdym: wściekły — pomarańczowe imię, pokonany — pusty pasek i wyszarzone imię. Plansza walki („Pajęczy duet”) bez zmian. Działa też dla sprzątaczek (krok 126): do wejścia blondynki jeden pasek, potem dwa.
- **Strzałka do bossa poza kadrem.** Zamiast oddalać kamerę (pole widzenia zmienia balans, krok 118) HUD pokazuje przy krawędzi ekranu pulsujący czerwony grot w stronę każdego walczącego bossa, którego środek jest poza kadrem albo przy samym brzegu. Geometria w czystym `systems/OffscreenPointer.ts` (`edgePointer`), liczby w `BOSS_POINTER_CONFIG` (`config/gameConfig.ts`), pozycje walczących bossów — `BossEncounter.fightingPositions`. Działa we wszystkich walkach z bossem, solo i w co-opie, na PC i telefonie.

**Decyzje:** najlżejsza poprawka widoczności — bez zmiany zoomu i kamery; boss „uśpiony” w windzie nie dostaje strzałki.

**Testy i weryfikacja:** `tests/systems/offscreenPointer.test.ts` (w kadrze — brak, krawędź, skos), nowy test pasków w `tests/systems/bossDuet.test.ts`; `npm run build` (typy, 2211 testów, build). W przeglądarce (`?floor=2&boss=1`): dwa paski „Król Pająków” / „Matka Pająków”, po odsunięciu bossów poza kadr — dwie strzałki przy dolnej krawędzi w ich stronę.

**Do oceny:** wielkość i miejsce strzałki (przy dolnej krawędzi zahacza o linię podpowiedzi sterowania), czy wystarcza, czy jednak lekko oddalić kamerę na arenie.

## Krok 137 — Brudna Wiedźma i Bociani Ogród `#decyzja` `#boss` `#brudna-wiedzma` `#bociani-ogrod`

**Skąd:** szkic właściciela (30.10.2026, „WITCH?”): wyszczerzona wiedźma z długimi czarnymi włosami w pomarańczowo-czarnej sukni z zielonym obrąbkiem, z czerwonym kwiatem, wokół bociany, ptaszek i żuk. Pytanie: bohaterka czy boss? Moja rekomendacja — boss (bohaterka może się odblokować po jego pokonaniu, później), projekt w Claude Doc „Wiedźma — bohaterka czy boss?”. `#decyzja` Właściciel: boss, nazwa **Brudna Wiedźma**, nowe piętro na końcu kręgu, przejście z Lustrzanej komnaty uzasadnione fabułą — „oczyszczenie, złudna czystość, potem totalny mrok, a następnie portal i wędrówka przez jeszcze gorsze odmęty”.

**Co powstało:**
- **Piętro 8 — Bociani Ogród** (`BiomeId.StorkGarden`): zarośnięty taras na szczycie kręgu nocą. Krąg ma znów 8 pięter (`floorsPerLoop` 8). Kafle `tools/tower_ruins_tiles.py --biome stork_garden` (paleta `bociani_noc`: płyty w barwie mokrej ziemi — z dala od fioletu Czarodziejki i zieleni łucznika, sprawdzone metryką czytelności; mury z chłodnego kamienia, trawa w fugach i mech), lica: bluszcz, gniazda, mech; nakładki: kępy trawy, błoto z tropami ptaków, czerwone kwiatki, pióra. Noc `GARDEN_NIGHT` — najgęstszy mrok kręgu (0,94). Ku arenie więcej piór i gniazd, zielonkawa poświata. Wrogowie na razie z ruin (jak w Lustrzanej komnacie).
- **Zapowiedź na piętrze 7:** pióra na lustrzanej posadzce (`decal.feathers` także w arkuszu Lustrzanej komnaty) i nowe okrzyki sprzątaczek „Znowu te ptaszyska!”, „Kto tu napierzył?!”.
- **Brudna Wiedźma** (`DIRTY_WITCH`, „Pani Bocianich Gniazd”), ataki w czystym `ai/witchAttacks.ts` (wspólne pomocniki planów przeniesione do `ai/planHelpers.ts`):
  - **klucz bocianów** — 3 równoległe pasy cieni (we wściekłości 4) w kierunku wiedźma → bohater, jeden przez bohatera, między pasami 44 px przejścia; potem bocian przelatuje pas i strefy uderzają po kolei pod nim;
  - **pikowanie** — miejsca wokół bohatera (pierwsze na nim), w każde po kolei spada ptak z góry;
  - **kwiat-oko** — nasiona lecą łukiem, wyrastają czerwone kwiaty z okiem i 3 razy pulsują pierścieniem 8 kul pyłku (kolejne pulsy obrócone o pół kroku), potem więdną;
  - **wir sukni** — fala wokół niej i pierścień liści;
  - **druga faza** (od połowy HP, nowe pole `enragedPattern` w `BossDefinition`, obsługa w `BossBrain`): dochodzi rój żuków-kamikaze (zachowanie pajączków, własny wygląd — `SpiderlingDefinition.look`, `spiderlingVisual`) i lot na bocianach (skok na miejsce bohatera); serie ataków jak u innych bossów we wściekłości. Nie mówi — chichocze i krzyczy krótko („Hi hi hi!”, „Lećcie, ptaszki!”, „Dziobać!”, „Kwitnij!”, „Bzzz!”).
- **Grafika:** `tools/witch_sprites.py` — wiedźma (128×128, 8 kierunków: chód, czar, wir, lot na bocianach, chichot; śmierć — suknia opada, ptaki odlatują, zostaje kwiat), bocian w locie (obracany w kierunku lotu), pikujący ptak, kwiat-oko, pyłek, liść, nasiono, żuk i jego wybuch. **Dźwięk:** nowy `SoundCue.WingFlap` (trzepot skrzydeł) przy kluczu i pikowaniu.

**Decyzje (moje, do oceny):** liczby ataków; kwiaty na razie nie do zniszczenia (więdną same po 3 pulsach); pas bocianów przy uderzeniu tylko lekko błyska (stref jest kilkadziesiąt — bez huku wybuchu); trzecia faza z koncepcji (żywa tarcza z ptaków) i odblokowanie wiedźmy jako bohaterki — osobne kroki; przejazd windą sprzątaczek na dach (z koncepcji) — na razie tylko w fabule, schody jak zwykle.

**Testy i weryfikacja:** `tests/ai/DirtyWitch.test.ts` (piętro 8 i krąg 16, pasy bocianów i przejścia między nimi, kolejność uderzeń, pikowanie, kwiaty i pulsy, wir, druga faza w `BossBrain`, skalowanie, animacje), testy biomów (Bociani Ogród, pióra w Lustrzanej komnacie); `npm run build` (typy, 2254 testy, build). W przeglądarce (`?floor=8&boss=1&hero=archer`): wszystkie ataki, przejście w drugą fazę z rykiem i żukami, bez błędów w konsoli. `npm run smoke` i `npm run smoke -- --coop` — patrz niżej.

**Do oceny właściciela:** wygląd wiedźmy i bocianów, czytelność pasów bocianów (dużo czerwonych kółek), trudność, czy noc w ogrodzie nie jest za ciemna.
## Krok 139 — Muzyka: dwa style — Lucent i Horror (minimalny house) `#ocena` `#decyzja` `#dzwiek`

**Skąd:** prośba właściciela (30.10.2026): „zmień ten ambient na prosty house'owy bit z kategorii horror minimal tech”, a potem `#decyzja`: „dodaj to jako drugi preset. Nazwij pierwszy Lucent, a ten — horror”.

**Co powstało:**
- **Nowy kompozytor** (`systems/MusicComposer.ts`, czysty TS): pętla 4/4 w 16 krokach na takt. Stopa na każdą ćwierćnutę, otwarty hi-hat na offbeat, klask na 2 i 4, toczący się bas na akordzie z progresji, krótki ciemny stab co drugi takt, pod spodem dron (prima + interwał grozy) i rzadki „ping” w echu (deterministyczny seed). Fraza 16 taktów kończy się 2-taktowym przełamaniem (bez stopy, basu i klasku); pierwsze 4 takty utworu bez klasku i staba — muzyka się rozkręca.
- **Dwa klimaty tej samej pętli** (`MUSIC_THEMES`): wieża i menu — a-moll, 122 BPM, dron z małą sekundą; zaświaty — e frygijski, 118 BPM, dron z trytonem, gęstsze pingi, inny rytm basu.
- **Walka z bossem** (`setMusicIntense`): szesnastkowe zamknięte hi-haty, stab w każdym takcie, częstsze pingi, bez przełamań.
- **Nowe głosy odtwarzacza** (`audio/MusicPlayer.ts`): stopa (sinus z opadającą wysokością), hi-haty i klask (szum za filtrem), bas-piła z zamykającym się filtrem, stab z dwóch rozstrojonych pił, dron z dwóch sinusów, ping; stab i ping idą do echa (kropkowana ósemka ze sprzężeniem). Barwy i głośności w `MUSIC_MIX`.
- **Dwa zestawy muzyki** (`MusicPreset`, `MUSIC_PRESETS`): **Lucent** — dawny ambient z kroku 116 (pad, bas, dzwonki, bęben-serce; bez zmian w brzmieniu) i **Horror** — nowy house. Pauza → „Dźwięk i obraz” → pierwsza pozycja „Styl muzyki: LUCENT / HORROR” (← →, Enter, klik albo stuknięcie; pad tak samo). Wybór zapisuje się w ustawieniach dźwięku (`AudioSettings.preset`, ten sam klucz w `localStorage`; stare zapisy bez pola dostają Lucent), a bieżący utwór przechodzi płynnie w nowy styl. Domyślnie Lucent.
- Kanał muzyki, głośność z pauzy, N, wyciszenie na starcie i przyciszanie na pauzie — bez zmian (te same `SoundBoard` i szyna muzyki).

**Decyzje:** dalej synteza w kodzie, bez plików audio. Hi-haty celowo ciche i krótkie (pamiątka po kroku 116a: zmęczenie ucha po 20 minutach).

**Testy i weryfikacja:** `tests/systems/musicComposer.test.ts` (Horror: stopa i przełamanie, wstęp, tryb bossa, dron z interwałem grozy, pingi; Lucent: dawne testy bębna i oddechu dzwonków; każdy zestaw gra swoimi głosami; determinizm dla obu zestawów i klimatów), `tests/systems/audioSettings.test.ts` (zapis zestawu, zawijanie), `pauseMenu.test.ts`; `npm run build` (typy, 2221 testów, build). W przeglądarce: pauza pokazuje „Styl muzyki: LUCENT”, → zmienia na HORROR i zapisuje `preset: "horror"`, bez błędów w konsoli. W Chromium wyrenderowane próbki (OfflineAudioContext, prawdziwy `MusicPlayer`): wieża 40 s, zaświaty 40 s, boss 20 s — szczyt ok. 0,31 przed głośnością kanału, bez przesterowania, brak błędów w konsoli.

**Do oceny:** czy klimat trafiony; tempo (122/118), głośność stopy względem efektów, czy pingi i dron nie męczą po dłuższej grze.

## Krok 140 — Czytelny przycisk pauzy na telefonie `#ocena` `#mobile`

**Skąd:** `#ocena` właściciela (30.10.2026): przy rozmowie z nowym testerem sam nie wiedział, gdzie jest pauza — dwie kreski „II” w małym kółku nic nie mówią. Pauza na telefonie jest ważna, bo prowadzi też do opcji i czatu „Napisz do autora”.

**Co powstało:**
- Przycisk pauzy w wersji mobilnej (`mobile/TouchScene.ts`, `drawPauseButton`) to teraz podłużna pigułka 92×32 px pod minimapą: ciemne tło, złota obwódka, rysowana ikonka ⏸ i podpis **PAUZA** (16 px, złoty) — widać ją od razu i odróżnia się od szarych kółek walki.
- Strefa dotyku prostokątna (`onPauseButton`): wymiary × `hitSlop`, w pionie jeszcze +8 px.
- Wymiary i położenie w `TOUCH_BUTTONS.pause` (`config/touchConfig.ts`), napis w `TOUCH_LABELS.pause`.

**Decyzje:** podpis „PAUZA”, nie „STOP” ani „MENU” — „stop” brzmi jak koniec gry, a „menu” myli się z menu głównym. Wersja PC bez zmian (pauza pod Esc/P i padem Start).

**Testy i weryfikacja:** `npm run build` (typy, 2221 testów, build). W Chromium z emulacją telefonu (Pixel 7 poziomo, `mobile.html`): przycisk widoczny pod minimapą, stuknięcie przy jego krawędzi otwiera pauzę.

**Do oceny:** czy przycisk jest dość widoczny i nie zasłania minimapy na dużych piętrach.

## Krok 141 — Wygodniejsze sterowanie na telefonie `#ocena` `#mobile` `#sterowanie`

**Skąd:** `#ocena` testera przekazana przez właściciela (30.10.2026): sterowanie na telefonie „bardzo ciężkie i niewygodne”; ma być naturalne dla gry zręcznościowej.

**Co było nie tak (emulacja Pixel 7 poziomo):**
- Płótno 16:9 na szerokim telefonie zostawia po bokach czarne pasy (ok. 90 px CSS), a przyciski były rysowane na płótnie — kciuk musiał sięgać daleko od krawędzi ekranu, a przyciski zasłaniały walkę. Rozmiar przycisków zależał od skali płótna (na mniejszym telefonie mniejsze).
- Gałka ruchu stała tam, gdzie kciuk dotknął: po odjechaniu kciukiem daleko zawrócenie wymagało cofnięcia przez cały dawny środek.
- Duże kółko ataku czekało 150 ms (przytrzymanie) albo na puszczenie (stuknięcie) — cios zawsze spóźniony.

**Co powstało:**
- **Przyciski i gałka przy krawędzi ekranu** (`systems/touchLayout.ts`, czysta geometria): pozycje i promienie w pikselach CSS ekranu, liczone od prawego dolnego rogu bezpiecznego obszaru (wcięcie, pasek „home”). Na szerokim telefonie przyciski leżą w czarnym pasie obok gry. Rysuje je nowa warstwa `mobile/TouchOverlay.ts` (przezroczyste płótno 2D na całym ekranie, bez łapania dotyku). Układ właściciela z kroku 96a zostaje: duże kółko w rogu, PPM wyżej po prawej, zryw po lewej, E nad zrywem, ultimate nad kółkiem.
- **Gałka idzie za kciukiem** (`followStickOrigin`): mniejszy promień (44 px CSS), mniejsza martwa strefa (0,18); blada podpowiedź gałki w lewym dolnym rogu, gdy kciuk jej nie trzyma.
- **Atak od razu:** dotknięcie dużego kółka to natychmiastowy cios z celowaniem samym w najbliższego wroga; przeciągnięcie przejmuje cel. PPM bez zmian (ładunki są cenne: przeciągnij albo stuknij).
- Większe strefy dotyku (`hitSlop` 1,25), większy zryw.
- Pauza (krok 140) i przyciski ekranu śmierci zostają na płótnie gry, pod minimapą.

**Decyzje:** bez automatycznego ataku (gra zręcznościowa — o ciosach decyduje gracz) i bez dasha gestem (ryzyko przypadkowego zrywu przy szybkim ruchu kciuka); oba do rozważenia po teście.

**Testy i weryfikacja:** `tests/systems/touchLayout.test.ts` (położenie od krawędzi ekranu, przyciski mieszczą się na 640×360 i nie nachodzą na siebie, strefa dotyku i najbliższy środek, gałka za kciukiem). `npm run build` (2232 testy). Chromium z emulacją Pixel 7: przyciski w czarnym pasie, gałka po cofnięciu kciuka o 60 px od razu zawraca, przeciągnięcie kółka i PPM celuje, zryw, pauza otwiera się, na pauzie przyciski znikają.

**Do oceny właściciela i testera:** położenie i wielkość przycisków na prawdziwym telefonie, czułość gałki, czy cios od razu nie marnuje ataków.

## Krok 143 — Złoto samo leci do bohatera, mniejsze i słabsze chmury trucizny `#ocena` `#decyzja` `#balans` `#feel`

**Ocena właściciela (30.10.2026):** gra jest fajna, ale brakuje „feelu”. Trzy zarzuty: cofanie się po monety od wroga, który padł wcześniej; błąkanie po nieokreślonych lokacjach; plamy z wybuchających pułapek (trujące chmury) „za szybkie, za duże i biorą za dużo”. `#decyzja` kierunek: głównym zagrożeniem ma być **natłok mobów**, a nie bossowie i pułapki. Ten krok to szybkie wygrane; reszta planu (fale mobów, mniejsze piętra, strzałka do celu, lżejsi bossowie) jest w dokumencie-wizji i czeka na decyzje właściciela.

**Co powstało:**
- **Złoto leci samo** (`LootManager.homeGold`, czysto: `goldHomingSpeed`, `goldArrives` w `systems/Loot.ts`, liczby w `PICKUP_CONFIG.goldHoming`): po 0,3 s rozsypania każda moneta leci do najbliższego żywego bohatera z dowolnej odległości, przez ściany (w locie bez kolizji), od 160 px/s z przyspieszeniem 1600 px/s² do 900 px/s. Moneta z 340 px wpada w ok. 1 s. Przy niskim FPS moneta nie krąży wokół celu (zebranie, gdy przeleciałaby bohatera w jednej klatce). Mikstury i przedmioty bez zmian (magnes 80 px) — to decyzja gracza. Co-op: złoto do wspólnej sakiewki, leci do bliższego.
- **Chmury purchawek (Grzybnia) i popielniczek (Palarnia)** (`biomeConfig`): 0–2 na pokój (było 1–3 i 1–2), promień 14 → 30 px (było 20 → 44; pole −54%), rozrost 0,9 s (było 0,4 s), zapalnik 0,7 / 0,8 s (było 0,5 / 0,6), chmura wisi 3 / 3,5 s (było 4 / 4,5), trucizna 1 co 0,5 s (było 2) i 0,5 s po wyjściu (było 1,5 s). Pole chmur na pokój spada średnio o ok. 75%.
- **Arkusze chmur** `poison-cloud.png` i `smoke-cloud.png` wygenerowane na nowo (`CLOUD_RADII` w `tools/grove_enemies.py` i `tools/smoker_sprites.py`) — rysunek dalej równa się zasięgowi trucizny; pozostałe arkusze tych generatorów bajt w bajt bez zmian.

**Pomiary przed zmianą** (szczegóły w dokumencie-wizji):
- Generator, 60 pięter × piętra 1–7: piętro rośnie z 7 do 13 pokojów i z 558 do 1100 kafli podłogi, a wrogów z 7,5 do 16,2. Pełne przejście to 23 → 52 s samego marszu najkrótszą trasą, ok. 3 s marszu na jednego wroga na każdym piętrze; z boku drogi do areny leży 2–6 pokojów.
- Bot-gracz (Playwright, nieśmiertelny, walczy w każdym pokoju i 45 s z bossem; obrażenia przypisane po stosie wywołań): 3 bohaterów, 31 przejść pięter 1–7, 61 min walki. W pokojach 3,5 HP/s, w arenie 6,4 HP/s (Grzybnia 7,9, Cmentarzysko 10,1). W pokojach 91% obrażeń to wrogowie, chmury 2% ogółem, ale 11% w Grzybni; paleniska 3%. Bot wygrał 13 z 31 walk z bossem w 45 s. Bot nie unika telegrafów — liczby to kierunek. Skrypt nie trafił do repozytorium (jednorazowy pomiar).

**Testy:** `tests/systems/loot.test.ts` (przyspieszenie i sufit, moneta z 800 px w < 1,5 s, brak przelotu przy 30 FPS), `tests/systems/puffballs.test.ts` (0–2 na pokój: 50–80% pokojów ma purchawkę; telegraf, dash i strzał dalej wystarczają), `tests/dungeon/WallDogPlanner.test.ts` (chmura popielniczki = chmura purchawki), test zgodności arkusza z promieniem chmury. `npm run build` zielony.

**Weryfikacja:** Playwright (Chromium, dev, `?hero=archer&seed=3&floor=2`): 9 złota wyrzucone 340 px od bohatera, za ścianą — po ok. 1 s w sakiewce, mikstura została na ziemi; bez błędów w konsoli. `npm run smoke -- --floors 7 --seeds 1` (3 bohaterów) bez błędów.

**Czeka na ocenę właściciela:** tempo lotu złota (czy nie za szybkie — da się zwolnić w `goldHoming`), wielkość i siła chmur, czy „plamy z kokonów” to na pewno chmury purchawek i popielniczek. **Następnie:** etap 1 planu — fale słabszych mobów zamiast „1–2 wrogów na pokój” (po decyzji właściciela).

## Krok 145 — Przeliczenie balansu: mocniejsze ciosy bohaterów, wolniej rosnące HP bossów `#ocena` `#decyzja` `#balans` `#brudna-wiedzma`

**Skąd:** `#ocena` Wicio po nagraniach walki z Brudną Wiedźmą (30.10.2026): „za mały damage, przeskaluj HP… wiem, że duża zmiana”. Rachunek: HP bossa rosło o 15% na piętro, obrażenia bohatera tylko z przedmiotami — wiedźma na piętrze 8 miała ok. 1560 HP (2× bazowe), samo bicie barbarzyńcą bez przedmiotów ok. 42 s, z unikami ok. 2 min; w drugim kręgu 2470 HP. `#decyzja` Na karcie wybrał „Cała gra: bossowie i bohaterowie”.

**Co się zmieniło (tylko `src/config/`):**
- Obrażenia bohaterów ×1,25: cios barbarzyńcy 12 → 15, jego strzał 7 → 9; kula Czarodziejki 14 → 18, fala 16 → 20, promień 8 → 10 na tik, Supernowa 70 → 88; strzała łucznika 8 → 10, mocna 14 → 18, salwa 7 → 9, totem 10 → 12. Szał bez zmian (mnożnik).
- Nowe `BOSS_SCALING` (`combatConfig.ts`): HP bossów +6% na piętro zamiast +15%, obrażenia jak u wrogów (+10%). Używa go `BossFight`; czarny dog Barona też.
- Bazowe HP bossów w górę, żeby pierwsze piętra zostały równie trudne: Strażnik Piętra 300 → 380, Król 420 → 465, Matka 300 → 335, Pożeracz 460 → 670, Kat 430 → 640, Strażnik Bram 340 → 500, Baron 640 → 760, blondynka 600 → 720, czarnowłosa 700 → 660, wiedźma 760 → 860.
- Zwykli wrogowie: `ENEMY_SCALING` bez zmian; Rusher 30 → 33 HP, by dalej padał od 3 ciosów na piętrze 1. Reszta mobów ginie szybciej — ich liczbę i fale stroi wątek „Przebudować feel i trudność gry” (uzgodnione).
- Siła ataków bossów bez zmian (nie łagodzimy).

**Samo bicie barbarzyńcą bez przedmiotów (przed → po):** piętro 1: 8 → 8 s; 2–4: 16–22 → 15–18 s; Baron, blondynka: 28 → 20 s; piętro 7 i wiedźma: 42–46 → 26 s; wiedźma w drugim kręgu: 67 → 35 s.

**Testy:** `tests/balance/balance.test.ts` — boss rośnie wolniej niż wrogowie, samo bicie bossa 5–35 s w pierwszym kręgu i ≤ 45 s w drugim; `npm run build`.

## Znane ograniczenia i backlog

Stan po domknięciu warstwy wizualnej (kroki 16–19) i sprite'ów łupów (krok 20).

**Ocena właściciela po testach w grze (po kroku 20) — zaakceptowane:** `#ocena`
- [x] **Miecz barbarzyńcy (krok 21):** wygląd chodu i ciosu zaakceptowany.
- [x] **Kitery przy zoomie 2,0:** czytelność i zachowanie w porządku; reguła widoku (krok 18) zostaje.
- [x] **Martwa strefa kamery 60×45 px:** wygodna.
- [x] **Ślady szlamu po Novie:** nie przeszkadzają w odbiorze areny.
- [x] **Przedmioty bazowe bez pulsowania** (krok 20): dobrze widoczne na podłodze.
- [x] **Ogólnie:** gameplay czytelny i w pełni płynny.

**Ocena właściciela po testach leża (po kroku 23e) — zaakceptowane:** `#ocena` `#pajecze-leze`
- [x] **Pajęcze leże:** feel, spowolnienie (kokony, pajęczyny), wygląd postaci, pająki z sufitu.

**Ocena właściciela po teście walki z Matką Pająków (po kroku 25):** `#ocena` `#matka-pajakow`
- **Plama sieci:** wielkość (promień 60 px) w porządku.
- **Odległość lądowania sieci za bohaterem (85 px):** po kroku 26 zostaje — właściciel: „pajęczyny za naszymi plecami są fajne”.
- **Walka dalej „banalnie łatwa”.** Pomysły właściciela (do doprecyzowania na starcie kroku 26):
  - pajączki nie powinny wyskakiwać wszystkie naraz — zrobione w kroku 26 (spadają po kolei z sufitu pierścieniem wokół gracza);
  - pajączki mogłyby mieć skok do bohatera (doskok z dystansu zamiast samego biegu).
- Zasada „nie łagodzimy trudności” obowiązuje — tu kierunek jest odwrotny: walka ma być trudniejsza.

**Ocena właściciela po teście kroków 26–27:** `#ocena` `#matka-pajakow` walka „się zagęściła”; sprint, smagnięcie, strefa i trucizna w porządku. Matka Pająków **odłożona** — wracamy przy strojeniu. Szczegóły na końcu sekcji „Krok 27”.

**Matka Pająków — do zrobienia przy powrocie** `#matka-pajakow`:
- animacja smagnięcia jest słabo widoczna (właściciel zauważył ją przy drugim trafieniu) — wyraźniejszy ruch nóg albo błysk pazurów;
- sprawdzić wypychanie gracza przy ścianie po skoku (raz w moich testach gracz trafił w mur, przed poprawką);
- niezrealizowany pomysł: skok pajączka do bohatera;
- jaskrawsza krew (feedback po kroku 24).

**1. Następny etap (decyzja właściciela po kroku 27):** `#decyzja` nowe biomy i kolejne piętra — większy zbiór mechanik i poziomów tematycznych; strojenie wszystkiego później.

**Grzybnia (piętro 3) gotowa** `#grzybnia`: paleta, kafle i mgła (28a), płynne światło, zarażony pająk i grzybiec (28b), Król Pająków z paraliżem (29), purchawki (28c). Animacja śmierci Króla: krok 40.

**Plan właściciela po kroku 28c:** `#decyzja` najpierw powrót do „Mroku” (p. 2 backlogu) — zrobiony w kroku 30, test właściciela: „super” — potem kolejny biom. Krok 31: lekko losowa kolejność ataków bossów.

**Cmentarzysko (piętro 4) w toku** `#cmentarzysko`: krok 32a (paleta C, kafle, dekoracje, mgiełka) i 32b (zarażony i siewca) zrobione. Krok 33: Wampirzy Lord (spiżarnia, uczta, kąsanie, szarża, tasak, zew). Krok 39: wygląd z paczki właściciela — boss to teraz **Grzybowy Pożeracz** (zamach łapami zamiast tasaka, tron, kokony z zarażonymi); czeka na test właściciela.

**Boss Cmentarzyska — pomysł właściciela (po kroku 32a):** `#decyzja` `#cmentarzysko` `#wampirzy-lord`
- „wampirzy lord”, ale nie typowy wampir: zainfekowany człowiek, który **zjada mniejsze zombiaki**;
- zombiaki trzyma w **kokonach w swojej sali**; gdy przechodzi obok, kokony go **wzmacniają**;
- w ręce tasak albo nóż i widelec (do wyboru);
- zamiast głowy **wielka szczęka**, którą próbuje kąsać gracza;
- **decyzja właściciela:** broń to **tasak**; moja propozycja mechaniki przyjęta („działać według twojego planu”):
  - **Uczta:** 4–6 kokonów z zombiakami w sali; Lord co jakiś czas pożera kokon (ok. 1 s, zapowiedziane — okno na kontrę), leczy się i dostaje kumulujące się wzmocnienie (ciosy, chód); gracz może zniszczyć kokon wcześniej, ale wypuszcza wtedy małego zombiaka; po wściekłości („Głód!”) ucztuje częściej;
  - **kąsanie szczęką** z bliska (poza wzorem, jak smagnięcie Królowej) — trafienie leczy Lorda;
  - **szarża z kłapnięciem** — doskok do miejsca gracza z czerwoną strefą lądowania;
  - **cios tasakiem** — szeroki, ciężki zamach łukiem, wolny i bolesny;
  - **zew spiżarni** — jeden zombiak wychodzi z kokonu i zagania gracza;
- kolejność: najpierw zwykłe zombie (32b), potem Lord;
- właściciel: commit i push po każdym kroku („wrzucaj wszystko na GitHuba i lecimy dalej”).

**Nowy kierunek po kroku 143 — natłok mobów i zero błąkania** `#decyzja` `#feel`: wizja i plan w dokumencie „TOP DOWN — czym ma być gra” (Claude Docs, 30.10.2026). Etap 0 (złoto samo leci, słabsze chmury) zrobiony w kroku 143. Czekają na decyzje właściciela: etap 1 — fale słabszych mobów zamiast „1–2 wrogów na pokój” (limit ok. 25 żywych, pomiar na telefonie), etap 2 — piętra maks. 8–9 pokojów i strzałka do najbliższej walki/areny, etap 3 — krótsze trwałe plamy bossów i mniej obrażeń w zamian za świtę w falach.

**Kandydatury na kolejne kroki** (wybiera właściciel):
- **Stan po kroku 25:** piętro 2 to Pajęcze leże, gotowe są:
  - arkusz kafli (fiolet, zieleń, biel);
  - Matka Pająków z pajączkami;
  - pająk jaskiniowy (Rusher) i nietoperz z falą (Kiter);
  - pająki spadające z sufitu;
  - kokony;
  - lepkie pajęczyny.
- **Kandydaci na kolejny krok** (wybiera właściciel): powrót do „Mroku” (p. 2), kolejny biom, ewentualne strojenie liczb leża.
- **Schody:** od kroku 47 wejście wyżej klawiszem E na schodach.
- **Szybki start:** `npm run dev`, potem `http://localhost:5173/?seed=7&floor=2`. Parametry `?seed=N&floor=M` działają też na Pages jako run testowy (bez zapisu wyniku, krok 41g).
- **Do oceny w testach właściciela:** trudność walki z Matką Pająków po kroku 27 (pościg, smagnięcie, trucizna). Śmierć Matki Pająków zaakceptowana (krok 24). Liczby leża (kroki 22–23e) zaakceptowane ogólnie; stroimy tylko na sygnał właściciela.
- **Exploit z ostrzałem bossa z korytarza naprawiony w kroku 86** (boss nietykalny z zewnątrz areny) — poniższy opis tylko historyczny.
- **Ewentualne uszczelnienie areny przed ostrzałem bossa z korytarza** (otwarte od kroku 9):
  - **Problem:** strzał budzi i rani bossa, zanim gracz wejdzie na arenę, a kraty opadają dopiero wtedy, gdy gracz jest w środku.
  - **Najpierw** sprawdzić w grze, czy da się na tym realnie zyskać (boss podchodzi do gracza).
  - **Jeśli tak, opcje do wyboru przez właściciela:**
    - boss uśpiony jest odporny na obrażenia spoza areny;
    - kraty opadają już przy pierwszym trafieniu bossa;
    - boss przebudzony strzałem od razu idzie do wejścia, z którego padł strzał.
  - Zgodnie z zasadą „nie łagodzimy trudności” — zmiana tylko uszczelnia exploit, nie osłabia bossa.

**2. Do oceny przy okazji**
- **Paski duetu i strzałka do bossa (krok 136):** `#boss` `#ocena` dwa paski HP w duecie, strzałka do bossa poza kadrem — czeka na test właściciela.
- **Odliczanie po pauzie (krok 130):** `#ocena` 3-2-1 nad widoczną planszą po „Wznów” — długość, jasność nakładki, podpis.
- **Bezpieczny start bossów (krok 131):** `#boss` `#ocena` boss i świta z dala od bohaterów (5 kafli od bohatera i wejścia, świta 4 kafle od każdego bohatera), odsunięcie przed windą sprzątaczki — czeka na test właściciela i testera.
- **Wrogowie za kratami (krok 132):** `#zasadzka` wróg spoza zamkniętego pokoju czeka pod kratą, po jej podniesieniu zryw (450 ms, ×1,8) — długość i siła zrywu czekają na test właściciela.
- **Lustrzana komnata (kroki 124–127):** `#lustrzana-komnata` piętra 7–8; odbicia postaci, błyski polerowania, mury, blondynka z ucieczką windą, brunetka z plątaniem i powrót blondynki — czekają na test właściciela. Pajęczy duet na piętrze 2 we wspinaczce; Pajęcze leże poza wspinaczką (do decyzji, gdzie wraca). Otwarte: własni wrogowie biomu.
- **Czyhacz (krok 123):** `#czyhacz` czwarty archetyp — kryjówki biomów pod murem, subtelny znak, doskok z 0,6 s ostrzeżeniem, serie po 2 ciosy z zadyszką; częstość, czasy i wygląd czekają na test właściciela.
- **Gniazdownik (kroki 122–122a):** `#gniazdownik` trzeci archetyp; wersja ruin zaakceptowana, wersje biomów (122a) — wygląd i statusy stworków, częstość i rytm wylęgu — czekają na test właściciela.
- **Większy obraz (krok 118):** `#obraz` pełny ekran (F) i „Wypełnij okno” w pauzie — czeka na test właściciela (czy nierówne piksele przy „Wypełnij okno” przeszkadzają).
- **Dźwięk (krok 116):** `#dzwiek` brzmienie efektów, muzyka wieży i zaświatów, proporcje głośności (60% / 70%), czy coś przeszkadza w co-opie — czeka na test właściciela; lista i licencje w `docs/AUDIO.md`.
- **Tarczownik (kroki 99, 113):** `#elity` `#balans` szarża z telegrafem zamiast skoku, ogłuszenie po wbiciu w ścianę (bez tarczy), bomby go ranią; od kroku 113 obrót 35°/s, 1,6 s bez tarczy po każdym ciosie, HP ×1,8 — czeka na test właściciela.
- **Jeden tarczownik (krok 134):** `#boss` `#decyzja` Kat Otchłani (bez galerii — wybór właściciela) jedynym bossem Piekła (piętro 4), krąg 7 pięter — czeka na test.
- **Bossowie z tarczą (krok 113):** `#boss` `#balans` odbicia w losową stronę (30–80°), wolniejszy obrót, okno bez tarczy po ataku, mniej HP — czeka na test właściciela.
- **Pajęczy duet (krok 112):** `#areny-bossow` Król i Matka Pająków naraz na arenie 3 — trudność, świta tylko Króla; potem decyzja o wspinaczce — czeka na test właściciela.
- **Hitboxy i wybuchy (krok 110):** `#ocena` `#balans` strefy łapią ślad stóp (5 px), pociski tułów (8 px); nowy telegraf i wybuch w promieniu strefy (bomby kultystów, wybuch elity, ataki bossów) — czeka na test właściciela.
- **Wypadanie za kratę areny (krok 98a):** `#ocena` bezpiecznik cofa gracza przepchniętego przez mur lub kratę; czy w teście właściciela sytuacja z Areny 5 się nie powtarza (F9: `player-unstuck`).
- **Ultimate (krok 98):** `#balans` czas ładowania paska mocy, siła szału (osłabiony w kroku 117: 4 s, ×0,8 czasu, ×1,2 obrażeń, 3% za zabicie), Supernowej i totemu, wygląd totemu (placeholder).
- **Balans przedmiotów (krok 117):** `#balans` `#ocena` tempo ataku (limit +60%), kieł (2/3/4 HP, sufit z bazowego HP), dash 70 px, przedmioty na limicie poza kartami i kapliczką — czeka na test właściciela.
- **Bohaterowie po kroku 97:** `#balans` `#czarodziejka` `#lucznik` ciągły ostrzał łucznika (co 0,34 s, co 3. mocna), fala uderzeniowa i powrót kul Czarodziejki (0,6 s), mocniejszy promień; czy barbarzyńca dalej jest OP.
- **Raport testera (24.10.2026): gra powtarzalna** `#ocena` — do osobnego kroku; właściciel przekaże więcej uwag.
- **HUD z ikonami (krok 67):** `#hud` rozmiar ikon (16 px 1:1 w slocie 28 px), czytelność liczników, czas podpisu (3 s).
- **Ekran śmierci (kroki 63–65):** `#ekran-smierci` styl Dark Souls / Castlevanii, czerwień spływająca przez litery (prędkość 18 px/s); tempo (napis po 0,6–2,2 s, tablica po 2,6 s), siła przyciemnienia (85%), wielkość napisu.
- **Ekran startowy (krok 60):** `#ekran-startowy` motyw TOP / DOWN z samotną wieżą **zaakceptowany**; do dostrojenia ewentualnie długość (ok. 4,3 s), siła wstrząsu, czytelność wieży w mroku — do oceny w teście właściciela.
- **Mrok:** krok 30 — wrogowie widoczni dopiero w świetle („Mrok” i mgła Grzybni). Zaakceptowane po teście właściciela.
- **Narzędzie dev:** `?seed=N&floor=M` w adresie startuje run od danego seeda i piętra (także na Pages jako run testowy bez zapisu wyniku, `systems/startOverrides.ts`, krok 41g). Np. `?seed=3&floor=2` = piętro z „Mrokiem”.
- **Gęstość dekoracji:** detale lica (10%) i pajęczyny (35%).
- **Jaskrawsza krew** (feedback właściciela po kroku 24): posoka Matki Pająków i plamy mogłyby być bardziej jaskrawe — detal na później.

**3. Brakująca grafika**
- **Czarodziejka (kroki 36–38):** sprite'y, mechanika i ekran wyboru gotowe. Bohater przy wpisie na liście wyników: krok 89. Do rozważenia: strojenie liczb po testach.
- **Łucznik (krok 82):** sprite'y z generatora, mechanika i trzecia karta wyboru gotowe; czekają na ocenę właściciela (wygląd, liczby, upiory).
- Animacja ciosu barbarzyńcy: zrobiona w kroku 21.
- **Domyślny pocisk wroga** (pomarańczowe kółko z `BootScene`): obecnie nieużywany — mag i boss mają własne sprite'y. Zostaje jako zabezpieczenie.
- Łupy, kapliczka, pocisk gracza i znacznik celowania: zrobione w kroku 20.
- **Boss „Matka Pająków”:** wdrożony w kroku 22, klatki śmierci w kroku 24.
- **Strażnik (Sludge King) i Król Pająków:** animacje śmierci zrobione w kroku 40. Grzybowy Pożeracz nadal ginie bez animacji (krok 111 dodał mu animacje skoku i wyrzutu zarodników).

**4. Odłożone — tylko za zgodą właściciela**
- **Kolidujące rekwizyty** (kolumny, przewrócona kolumna): zmieniają linię wzroku Kiterów, czyli rozgrywkę.
- **Ozdobna obwódka areny bossa** i **przejścia materiałów** (dual-grid).
- **Wyszukiwanie drogi wrogów:** idą do celu po prostej i mogą zahaczać o rogi.
- **Imię gracza na tablicy rekordów:** zrobione (wspólna lista wyników). Do rozważenia: zmiana zapamiętanego imienia z poziomu gry i filtr wulgaryzmów.
- **Co-op (od kroku 101, osobna gałąź):** `#coop` lokalny, wspólny ekran ze smyczą; decyzje właściciela w kroku 101. Zrobione: C0 (drużyna zamiast gracza, krok 101), C1 (urządzenia graczy i dołączanie, krok 102), C2 (drugi bohater, kamera ze smyczą, światło dla obu, krok 103; test: `?hero=barbarian&coop=archer`), C3 (kraty, zasadzki, pająki z sufitu dla dwóch, krok 104), C4 (powalenie i wskrzeszanie, łupy, kapliczka, karty i schody dla każdego, krok 105), C5 (menu co-op, ekran dołączania z różnymi bohaterami, HUD dla dwóch, krok 106), C6 (HP ×1,4 wrogów, ×1,7 bossów, +1 wróg na pokój, krok 107), C7 (tablica co-op, worker `/coop-scores` do wdrożenia, zapis z partnerem, krok 108), C8 (smoke z dwoma botami, wersja testowa `/coop/`, krok 109). Krok 119: powalone ciało bez kolizji i smyczy (wskrzeszanie działa za każdym razem, ciała nie da się przepchnąć). Co-op czeka na test właściciela; do strojenia: mnożniki HP, 40% HP po wskrzeszeniu, mikstura dla podnoszącego, karty bossa po kolei.
- **Pad (krok 114):** `#sterowanie` nowy układ (X/B ataki, A dash, Y — E, RB ultimate) i samo celowanie przy ataku bez prawej gałki — czeka na test właściciela; otwarte: czy pad z samym celowaniem zostaje na wspólnej tablicy.
- **Wersja mobilna (krok 96):** gotowa w `mobile.html`, czeka na test na telefonie i decyzję o wdrożeniu na Pages. Do rozważenia: wspólna tablica wyników telefonów (worker), usuwanie slotów i wybór piętra dotykiem (wiersze menu działają, X — tylko klawiatura), podpowiedzi zależne od urządzenia także na PC (pad). `#sterowanie`

**Menu, zapis i wybór piętra (krok 91)** `#ekran-startowy` `#zapis-gry` `#wybor-pietra`: czeka na ocenę właściciela. Rozstrzygnięte (91a): wybór piętra bez tablicy i bez bonusu na start. Otwarte: większe nagrody i trudność w kolejnych kręgach (endless loop, pomysł właściciela).

**Najlepsze wyniki na ekranie startowym (krok 94, propozycja właściciela)** `#ekran-startowy`: zrobione — top 3 wspinaczki i aren na środku menu, własny rekord i ostrzeżenie „ktoś cię wyprzedził”. Bez panelu, z miniaturkami (94a–94b). Czeka na ocenę: liczba wpisów.

**Areny bossów (krok 90, tryb testowy)** `#areny-bossow`: osobna tablica wyników zrobiona w kroku 91a (worker czeka na wdrożenie). Czeka na ocenę: leczenie między arenami, losowa kolejność aren.

**Wzbogacenie rozgrywki (propozycje po kroku 41g)** `#decyzja`: elity (krok 42) i pętla wieży (krok 43) zrobione. Czekają: **pokoje ryzyka** (zasadzka zrobiona w kroku 49; przeklęta skrzynia), **kupiec** między piętrami (zakup za złoto obniża wynik), **synergie przedmiotów** (tylko za zgodą właściciela), **finałowy boss**. Po kroku 93: nowe przedmioty z ceną/warunkiem i kupiec — następny krok po ocenie balansu (lista do akceptacji właściciela).

**5. Odrzucone:** ewolucje przedmiotów (decyzja właściciela). Wzmacnianie kolejnymi kopiami zostaje.

**6. Drobne uwagi techniczne**
- **Boss bez reguły widoku:** arena (11–13 kafli) jest wyższa niż widok w pionie (ok. 8,4 kafla), więc uderzenie może spaść poza kadrem. Ataki są obszarowe i z telegrafem. Od kroku 136 strzałka przy krawędzi ekranu pokazuje bossa poza kadrem; oddalenie kamery na arenie — tylko jeśli to nie wystarczy.
- **Pozostałości testów w panelu przeglądarki:** wpisy „0 złota” na tablicy rekordów i dwa stare wpisy w konsoli z przeładowań HMR w kroku 18. Gra działa poprawnie.
