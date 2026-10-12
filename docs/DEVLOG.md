# Tower Crawler — dziennik rozwoju

Dokumentacja zmian i procesu tworzenia gry. Aktualizowana po każdym kroku.

- **Projekt gry (GDD):** [`docs/GDD.md`](GDD.md)
- **Zasady kodu:** [`docs/ZASADY_KODU.md`](ZASADY_KODU.md)
- **Instrukcje dla Claude:** [`CLAUDE.md`](../CLAUDE.md), wczytywane automatycznie w każdej sesji
- **Repozytorium:** `github.com/wvytz/topdown` (prywatne)

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
| Generowanie świata | `src/dungeon/DungeonGenerator.ts`, `EncounterPlanner.ts`, `lineOfSight.ts`, `rooms.ts` | nie |
| Strojenie liczb | `src/config/` | nie |
| Encje (widok + fizyka) | `src/entities/` | tak |
| Koordynacja walki | `src/combat/` (EnemyManager, ProjectileManager, BossFight) | tak |
| Renderowanie mapy, efekty, sceny | `src/dungeon/DungeonView.ts`, `src/effects/`, `src/scenes/` | tak |
| Wejście | `src/input/` (klawiatura i mysz zamieniane na abstrakcyjne `PlayerActions`) | tak |
| Obiekty otoczenia | `src/world/` (kapliczka) | tak |
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

## Znane ograniczenia i backlog

- **Wyszukiwanie drogi:** wrogowie i boss idą do celu po prostej, więc za rogiem mogą zahaczać o ściany.
- **Zamykanie areny:** wejścia do komnaty bossa nie zamykają się w trakcie walki (opcja na później).
- **Imię gracza na tablicy rekordów:** obecnie zapisujemy tylko wynik, piętro i datę.
- **Wybór przedmiotu z bossa:** obecnie losowy. Wybór 1 z 3 dałby graczowi decyzję.
- **Modyfikatory pięter (GDD §2.5):** na razie skalują się tylko statystyki.
- **Atak dystansowy gracza:** system pocisków jest gotowy, brakuje broni.
- **Docelowa grafika:** spritesheety zamiast placeholderów.
- **Co-op:** wejście jest już abstrakcyjne (`PlayerActions`), co ułatwi drugiego gracza.
