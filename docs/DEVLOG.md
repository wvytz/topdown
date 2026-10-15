# Tower Crawler — dziennik rozwoju

Dokumentacja zmian i procesu tworzenia gry. Aktualizowana po każdym kroku.

- **Projekt gry (GDD):** [`docs/GDD.md`](GDD.md)
- **Zasady kodu:** [`docs/ZASADY_KODU.md`](ZASADY_KODU.md)
- **Instrukcje dla Claude:** [`CLAUDE.md`](../CLAUDE.md), wczytywane automatycznie w każdej sesji
- **Repozytorium:** `github.com/wvytz/topdown` (prywatne)
- **Znaczniki do wyszukiwania** (Ctrl+F albo `grep`):
  - `#ocena` — oceny i feedback właściciela po testach w grze;
  - `#decyzja` — decyzje projektowe właściciela;
  - temat, np. `#matka-pajakow`, `#pajecze-leze`, `#grzybnia`, `#krol-pajakow`, `#mrok`, `#cmentarzysko`, `#wampirzy-lord`, `#ekran-startowy`, `#ekran-smierci` — wszystko o danym bossie albo biomie (łącz z `#ocena`).

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
| Generowanie świata | `src/dungeon/DungeonGenerator.ts`, `EncounterPlanner.ts`, `ShrinePlanner.ts`, `arenaGates.ts`, `lineOfSight.ts`, `rooms.ts` | nie |
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

**Prośba właściciela:** `#decyzja` `#ekran-smierci`
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

## Krok 36 — Ekran startowy: nazwa TOP DOWN i epickie otwarcie

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

## Krok 37 — Ekran startowy: TOP / DOWN i samotna wieża końca

**Ocena i decyzja właściciela:** `#ocena` `#decyzja` `#ekran-startowy`
- wersja z kroku 36 (jedna linia, promienie, połysk) „zupełnie się nie podoba”;
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

**Usunięte z kroków 34/36:** pioruny, promienie, połysk, podtytuł, pająk na nitce, nietoperz, pajęczyny.

**Kod:**
- `core/pixelArt.ts`: `pixelDisc`, `pixelRing` (tarcza i korona zaćmienia);
- `config/splashConfig.ts`: przepisany — `SPLASH_TITLE_LINES`, wieża, zniszczenie, pęknięcia, pożary, popiół, odłamki, nowa oś czasu;
- `systems/splashTimeline.ts`: `splashFrame` (wyłanianie, korona, linie napisu, błysk, żar pęknięć, oczy);
- `scenes/SplashScene.ts`: przepisana; odłamki i pył korzystają ze `stepParticle` z kroku 35.

**Testy:** `splashTimeline.test.ts` (14): dwie linie i ich miejsce na ekranie, wyłanianie, korona przed napisem, kolejność i odbicie, cięższe DOWN, żar pęknięć, oczy, zapas przed wygaszeniem, przejście do gry; `pixelArt.test.ts`: koło i pierścień.

**Weryfikacja:** `npm run build`; przeglądarka — zrzuty uderzenia DOWN (odpadające kamienie) i stanu końcowego, potem aktywne `GameScene`, brak błędów w konsoli.

**Ocena właściciela po wdrożeniu:** `#ocena` `#ekran-startowy` „tak jest znacznie lepiej!!!” — motyw TOP / DOWN z samotną wieżą zaakceptowany; to kierunek dla kolejnych ekranów (mrok, koniec, popiół zamiast „arcade’owego” blasku).

---

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

**Grzybnia (piętro 3) gotowa** `#grzybnia`: paleta, kafle i mgła (28a), płynne światło, zarażony pająk i grzybiec (28b), Król Pająków z paraliżem (29), purchawki (28c). Zostaje animacja śmierci Króla (dziś ginie od razu i zostaje plama).

**Plan właściciela po kroku 28c:** `#decyzja` najpierw powrót do „Mroku” (p. 2 backlogu) — zrobiony w kroku 30, test właściciela: „super” — potem kolejny biom. Krok 31: lekko losowa kolejność ataków bossów.

**Cmentarzysko (piętro 4) w toku** `#cmentarzysko`: krok 32a (paleta C, kafle, dekoracje, mgiełka) i 32b (zarażony i siewca) zrobione. Krok 33: Wampirzy Lord (spiżarnia, uczta, kąsanie, szarża, tasak, zew) — czeka na test właściciela; sprite Lorda do przeróbki.

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

**Kandydatury na kolejne kroki** (wybiera właściciel):
- **Stan po kroku 25:** piętro 2 to Pajęcze leże, gotowe są:
  - arkusz kafli (fiolet, zieleń, biel);
  - Matka Pająków z pajączkami;
  - pająk jaskiniowy (Rusher) i nietoperz z falą (Kiter);
  - pająki spadające z sufitu;
  - kokony;
  - lepkie pajęczyny.
- **Kandydaci na kolejny krok** (wybiera właściciel): powrót do „Mroku” (p. 2), kolejny biom, ewentualne strojenie liczb leża.
- **Szybki start:** `npm run dev`, potem `http://localhost:5173/?seed=7&floor=2`. Parametry `?seed=N&floor=M` działają tylko w trybie dev.
- **Do oceny w testach właściciela:** trudność walki z Matką Pająków po kroku 27 (pościg, smagnięcie, trucizna). Śmierć Matki Pająków zaakceptowana (krok 24). Liczby leża (kroki 22–23e) zaakceptowane ogólnie; stroimy tylko na sygnał właściciela.
- **Exploit z ostrzałem bossa z korytarza zostaje do odwołania** (decyzja właściciela po kroku 21) — poniższy opis tylko do wglądu.
- **Ewentualne uszczelnienie areny przed ostrzałem bossa z korytarza** (otwarte od kroku 9):
  - **Problem:** strzał budzi i rani bossa, zanim gracz wejdzie na arenę, a kraty opadają dopiero wtedy, gdy gracz jest w środku.
  - **Najpierw** sprawdzić w grze, czy da się na tym realnie zyskać (boss podchodzi do gracza).
  - **Jeśli tak, opcje do wyboru przez właściciela:**
    - boss uśpiony jest odporny na obrażenia spoza areny;
    - kraty opadają już przy pierwszym trafieniu bossa;
    - boss przebudzony strzałem od razu idzie do wejścia, z którego padł strzał.
  - Zgodnie z zasadą „nie łagodzimy trudności” — zmiana tylko uszczelnia exploit, nie osłabia bossa.

**2. Do oceny przy okazji**
- **Ekran śmierci (krok 35):** `#ekran-smierci` siła przyciemnienia (62%), tempo i zasięg rozkładu napisu (30% bloków w 7 s), ilość krwi.
- **Ekran startowy (krok 37):** `#ekran-startowy` motyw TOP / DOWN z samotną wieżą **zaakceptowany**; do dostrojenia ewentualnie długość (ok. 4,3 s), siła wstrząsu, czytelność wieży w mroku — do oceny w teście właściciela.
- **Mrok:** krok 30 — wrogowie widoczni dopiero w świetle („Mrok” i mgła Grzybni). Zaakceptowane po teście właściciela.
- **Narzędzie dev:** `?seed=N&floor=M` w adresie startuje run od danego seeda i piętra (tylko `npm run dev`, `BootScene.devStartOverrides`). Np. `?seed=3&floor=2` = piętro z „Mrokiem”.
- **Gęstość dekoracji:** detale lica (10%) i pajęczyny (35%).
- **Jaskrawsza krew** (feedback właściciela po kroku 24): posoka Matki Pająków i plamy mogłyby być bardziej jaskrawe — detal na później.

**3. Brakująca grafika**
- Animacja ciosu barbarzyńcy: zrobiona w kroku 21.
- **Domyślny pocisk wroga** (pomarańczowe kółko z `BootScene`): obecnie nieużywany — mag i boss mają własne sprite'y. Zostaje jako zabezpieczenie.
- Łupy, kapliczka, pocisk gracza i znacznik celowania: zrobione w kroku 20.
- **Boss „Matka Pająków”:** wdrożony w kroku 22, klatki śmierci w kroku 24.
- **Strażnik (Sludge King):** bez animacji śmierci (błysk i plama szlamu) — można dorobić tak samo jak w kroku 24.

**4. Odłożone — tylko za zgodą właściciela**
- **Kolidujące rekwizyty** (kolumny, przewrócona kolumna): zmieniają linię wzroku Kiterów, czyli rozgrywkę.
- **Ozdobna obwódka areny bossa** i **przejścia materiałów** (dual-grid).
- **Wyszukiwanie drogi wrogów:** idą do celu po prostej i mogą zahaczać o rogi.
- **Imię gracza na tablicy rekordów:** dziś tylko wynik, piętro i data.
- **Co-op:** wejście jest już abstrakcyjne (`PlayerActions`).

**5. Odrzucone:** ewolucje przedmiotów (decyzja właściciela). Wzmacnianie kolejnymi kopiami zostaje.

**6. Drobne uwagi techniczne**
- **Boss bez reguły widoku:** arena (11–13 kafli) jest wyższa niż widok w pionie (ok. 8,4 kafla), więc uderzenie może spaść poza kadrem. Ataki są obszarowe i z telegrafem; regułę można dodać, jeśli testy pokażą problem.
- **Pozostałości testów w panelu przeglądarki:** wpisy „0 złota” na tablicy rekordów i dwa stare wpisy w konsoli z przeładowań HMR w kroku 18. Gra działa poprawnie.
