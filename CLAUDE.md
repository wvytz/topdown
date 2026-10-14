# Tower Crawler — instrukcje dla Claude

Top-down action RPG / dungeon crawler w przeglądarce: TypeScript (strict), Phaser 3 (Arcade), Vite, Vitest.
Rozmawiamy i dokumentujemy **po polsku**, komentarze w kodzie też są po polsku.

## Przeczytaj na start sesji

- `docs/DEVLOG.md`: stan projektu, kroki 1–N, decyzje i backlog. Zacznij od ostatniego kroku i backlogu.
- `docs/GDD.md`: projekt gry (pętla rozgrywki, systemy).
- `docs/ZASADY_KODU.md`: zasady pisania kodu od właściciela projektu.

## Zasady pracy (obowiązkowe)

1. **Izolacja od silnika.**
   - Zasady gry (statystyki, obrażenia, AI, generowanie, łupy, ranking) piszemy w czystym TS, bez importu Phasera: `src/core`, `src/systems`, `src/ai`, `src/config` oraz wybrane pliki w `src/dungeon`.
   - Phaser (`entities`, `combat`, `world`, `scenes`, `effects`, `input`) tylko wykonuje decyzje i rysuje.
   - Pilnuje tego test `tests/architecture.test.ts`. Nowy czysty plik w `src/dungeon/` trzeba dopisać do jego listy `PURE_FILES`.
2. **Najpierw warstwa czysta z testami Vitest** w `tests/` (struktura jak w `src/`), potem warstwa Phasera.
3. **Liczby do balansu tylko w `src/config/`**, nigdy w logice.
4. **Losowość deterministyczna** (`core/random.ts`): każdy system ma własny strumień RNG (sól + seed piętra). `Math.random` tylko do efektów czysto wizualnych.
5. **Weryfikacja kroku:**
   - `npm run build` (typy + testy + build);
   - sprawdzenie w przeglądarce: `window.__game` w trybie dev, ręczne `game.step()`, gdy panel jest w tle.
6. **Po każdym kroku dopisz sekcję „Krok N” do `docs/DEVLOG.md`**: co powstało, decyzje, testy, weryfikacja. Zaktualizuj backlog.
   - Wpisy właściciela oznaczaj znacznikami (legenda na górze DEVLOG): `#ocena` (feedback po testach), `#decyzja` (decyzje projektowe) i temat, np. `#matka-pajakow`, `#pajecze-leze`; nowy biom albo boss dostaje własny znacznik tematu.
7. **Git i GitHub:** repozytorium prywatne `github.com/wvytz/topdown`, gałąź `main`. Commit i push robimy tylko na prośbę („wrzuć na githuba”). Opis commita po polsku, w stylu „Krok N: …”.

## Decyzje projektowe właściciela

- **Wynik runu = złoto w chwili śmierci.**
  - Ekran śmierci pokazuje top 3 i miejsce bieżącego runu.
  - Ofiara w kapliczce celowo obniża wynik.
- **Pula przedmiotów (krok 10):** 5 bazowych (Ostrze, Serce, Buty, Rękawice, Klepsydra) i 7 rzadszych z efektem broni (Szuriken, Elektryczna strzała, Ognista pięść, Kołczan, Wampirzy kieł, Burzowy pęd, Lodowy odłamek). Łupy i kapliczka losują z całej puli. Kolejne kopie przedmiotu z efektem go wzmacniają (bez ewolucji zmieniających sterowanie — odrzucone na obecnym etapie). Przedmiot za bossa gracz wybiera z 3 kart. **Nie dodawaj nowych rodzajów przedmiotów bez pytania.**
- **Mało przeciwników:** podstawowe archetypy (Rusher, Kiter), 1–2 na pokój. Trudność rośnie przez statystyki.
- **Tempo walki jest zaakceptowane.** Balans stroimy później, gdy będzie gotowe podstawowe środowisko.
- **Gra ma być wymagająca (krok 14).** Po przeglądzie balansu gra jest trudniejsza i właściciel to akceptuje. **Nie łagodź trudności** (HP/obrażenia wrogów, siła bossa, rzadkość leczenia) bez sygnału z testów właściciela.
- **Biomy (krok 28):** na razie każdy biom to jedno piętro zakończone swoim bossem (1 ruiny, 2 Pajęcze leże z Matką Pająków, 3 Grzybnia z Królem Pająków). Biomy-„fillery” później. Każdy kolejny biom jest mroczniejszy i „pełniejszy” od poprzedniego.
- **Grafika (krok 28):** domyślnie wszystko generujemy generatorami w `tools/` (kafle, postacie, bossowie, efekty); właściciel ocenia podglądy. Ręczny rysunek tylko, gdy animacja z generatora wyjdzie za słabo.
- **Sprite'y:** właściciel zapisuje je w `OneDrive\Pictures\sprites`; Claude kopiuje je do `public/assets/sprites` i opisuje w `config/spriteConfig.ts`.
- **Kafle (krok 16):**
  - generator `tools/tower_ruins_tiles.py` (Pillow, `tools/requirements.txt`) eksportuje do `public/assets/tilesets/`;
  - arkusza nie edytujemy ręcznie, tylko przez generator;
  - łupy, kapliczka, pocisk gracza i znacznik celowania: `tools/loot_sprites.py` → atlas `public/assets/sprites/loot.{png,json}` (krok 20);
  - zasady pikseli są w `docs/STYLEGUIDE.md`.
- **Warstwa wizualna (krok 16):**
  - paleta C „jasny piaskowiec”: czytelność walki ma pierwszeństwo, a mrok daje światło i winieta;
  - zoom 2,0 pixel-perfect;
  - schody 2×2;
  - cienie środowiska ze stałą alfą 0,4;
  - światło (mrok, mgła, pochodnie) przechodzi płynnie — bez twardych pasm (decyzja z kroku 28a, odwołuje pasma z 19a);
  - dekoracje bez kolizji (kolidujące rekwizyty tylko za zgodą, bo zmieniają linię wzroku Kiterów).

## Znane pułapki

- **Projekt leży w OneDrive, a watcher Vite potrafi przegapić zmianę pliku.** Objaw: błąd w przeglądarce sprzeczny z kodem na dysku.
  - Diagnoza: porównaj `curl http://localhost:5173/src/<plik>.ts` z plikiem.
  - Naprawa: `touch` pliku albo restart `npm run dev`.
- **Panel Terminal w aplikacji nie obsługuje interaktywnego logowania `gh` („Press Enter…”).** Przy `gh auth login --web` uruchom komendę w tle i podaj użytkownikowi kod do wpisania na github.com/login/device.
- **W PowerShellu ścieżkę programu w cudzysłowie wywołuje się przez `&`**, np. `& "C:\Program Files\GitHub CLI\gh.exe" …`.
