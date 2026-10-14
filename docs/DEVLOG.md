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

**Decyzja właściciela:** wyszukiwanie drogi dla wrogów odkładamy na później, bo na razie jest mało istotne.

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

**Decyzje właściciela:**
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

**Decyzje właściciela:**
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

**Decyzje właściciela:**
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

**Cel (decyzja właściciela):** po pokonaniu bossa gra się zatrzymuje, a gracz wybiera jeden z 3 losowych przedmiotów.

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

**Ocena właściciela po teście:** gra wydaje się trudniejsza, co mu się podoba — kierunek jest dobry. Nie łagodzimy trudności przy kolejnych zmianach bez sygnału z testów.

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

**Decyzje właściciela (przed krokiem 16):**
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

**Reguła widoku dla wrogów (decyzja właściciela: zasięg Kiterów w logice AI):**
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

**Decyzje właściciela:**
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

**Decyzje właściciela:**
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
| `spider-queen_move-birth.png` (768×768) | 96×96 · 48,48 | 0–3 chód, 4–7 złożenie pajączka (wylęg 30 px za pivotem w kolumnie 7) |
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

**Decyzje właściciela:**
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
- **ocena właściciela:** miecz wygląda dobrze, zostaje bez zmian.

## Krok 22 — Boss „Matka Pająków” na piętrze 2

**Decyzje właściciela:**
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

**Decyzje właściciela (cały biom, kroki 23a–e):**
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

**Decyzja właściciela (krok 23a):** pająki spadają losowo z sufitu; spadek zapowiada rosnący cień na płytce; przy lądowaniu ranią gracza stojącego w cieniu, potem walczą jak Rusher.

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

**Decyzje właściciela (na starcie kroku):**
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

**Decyzje właściciela:**
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

**Feedback właściciela po testach leża (kroki 23a–e):** biom „zajebisty”, dobry feel, spowolnienie fajne, postacie wyglądają super; spadanie pająków z sufitu to dokładnie ta mechanika, o którą chodziło. Następny krok wskazany przez właściciela: klatki śmierci Matki Pająków (backlog p. 3).

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

**Feedback właściciela po kroku 24:**
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

## Znane ograniczenia i backlog

Stan po domknięciu warstwy wizualnej (kroki 16–19) i sprite'ów łupów (krok 20).

**Ocena właściciela po testach w grze (po kroku 20) — zaakceptowane:**
- [x] **Miecz barbarzyńcy (krok 21):** wygląd chodu i ciosu zaakceptowany.
- [x] **Kitery przy zoomie 2,0:** czytelność i zachowanie w porządku; reguła widoku (krok 18) zostaje.
- [x] **Martwa strefa kamery 60×45 px:** wygodna.
- [x] **Ślady szlamu po Novie:** nie przeszkadzają w odbiorze areny.
- [x] **Przedmioty bazowe bez pulsowania** (krok 20): dobrze widoczne na podłodze.
- [x] **Ogólnie:** gameplay czytelny i w pełni płynny.

**Ocena właściciela po testach leża (po kroku 23e) — zaakceptowane:**
- [x] **Pajęcze leże:** feel, spowolnienie (kokony, pajęczyny), wygląd postaci, pająki z sufitu.

**Ocena właściciela po teście walki z Matką Pająków (po kroku 25):**
- **Plama sieci:** wielkość (promień 60 px) w porządku.
- **Odległość lądowania sieci za bohaterem (85 px) do poprawy.** Na starcie sesji dopytać właściciela, w którą stronę: bliżej (sieć pod nogami / tuż za plecami) czy dalej.
- **Walka dalej „banalnie łatwa”.** Pomysły właściciela (do doprecyzowania na starcie kroku 26):
  - pajączki nie powinny wyskakiwać wszystkie naraz (dziś wylęg 2, po wściekłości 3, w jednej chwili) — może po kolei albo w rozrzucie po arenie;
  - pajączki mogłyby mieć skok do bohatera (doskok z dystansu zamiast samego biegu).
- Zasada „nie łagodzimy trudności” obowiązuje — tu kierunek jest odwrotny: walka ma być trudniejsza.

**1. Plan na kolejną sesję — krok 26: trudniejsza walka z Matką Pająków (nowe okno kontekstu)**
- **Najpierw ustalić z właścicielem:**
  - odległość lądowania sieci (bliżej czy dalej niż 85 px; ewentualnie z wyprzedzeniem ruchu gracza);
  - wylęg: po kolei (odstęp między pajączkami) czy w rozrzucie po arenie (np. z sufitu/ścian, jak zrzuty z kroku 23c);
  - skok pajączka: zasięg, telegraf (np. przykucnięcie + linia skoku), czy skok zastępuje bieg, czy jest dodatkiem przy średnim dystansie; czy wybuch następuje po wylądowaniu.
- **Gdzie w kodzie:** `config/bossConfig.ts` (`SPIDER_QUEEN`: `brood`, `web`, `spiderling`), `ai/bossAttacks.ts` (`planBrood`, `planWeb`), `ai/SpiderlingBrain.ts` (fazy pajączka — skok jako nowa faza), `combat/SpiderlingSwarm.ts` (wykonanie, telegraf), testy `tests/ai/SpiderQueen.test.ts`.
- **Uwaga:** pajączki z kokonów (krok 23d) używają tej samej definicji i `SpiderlingSwarm` — zmiana skoku obejmie też je (ustalić, czy tak ma być).

**Wcześniejsze kandydatury na kolejne kroki** (po kroku 26, wybiera właściciel):
- **Stan po kroku 25:** piętro 2 to Pajęcze leże, gotowe są:
  - arkusz kafli (fiolet, zieleń, biel);
  - Matka Pająków z pajączkami;
  - pająk jaskiniowy (Rusher) i nietoperz z falą (Kiter);
  - pająki spadające z sufitu;
  - kokony;
  - lepkie pajęczyny.
- **Kandydaci na kolejny krok** (wybiera właściciel): powrót do „Mroku” (p. 2), kolejny biom, ewentualne strojenie liczb leża.
- **Szybki start:** `npm run dev`, potem `http://localhost:5173/?seed=7&floor=2`. Parametry `?seed=N&floor=M` działają tylko w trybie dev.
- **Do oceny w testach właściciela:** trudność walki z Matką Pająków po dodaniu rzutu siecią (krok 25). Śmierć Matki Pająków zaakceptowana (krok 24). Liczby leża (kroki 22–23e) zaakceptowane ogólnie; stroimy tylko na sygnał właściciela.
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
- **Mrok — wrócić w innym momencie** (feedback testera: światło na piętrze „Mrok” zbyt jasne, wrogowie mają się pokazywać dopiero w świetle bohatera):
  - próba „pełna czerń poza kręgiem + promień 96 px” została odrzucona przez właściciela po teście w grze i cofnięta;
  - do ustalenia przy powrocie: jak ma wyglądać efekt, czy dotyczy tylko „Mroku”, czy też zwykłych pięter.
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
