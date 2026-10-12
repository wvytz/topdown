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
7. **Git i GitHub:** repozytorium prywatne `github.com/wvytz/topdown`, gałąź `main`. Commit i push robimy tylko na prośbę („wrzuć na githuba”). Opis commita po polsku, w stylu „Krok N: …”.

## Decyzje projektowe właściciela

- **Wynik runu = złoto w chwili śmierci.**
  - Ekran śmierci pokazuje top 3 i miejsce bieżącego runu.
  - Ofiara w kapliczce celowo obniża wynik.
- **Pula przedmiotów (krok 10):** 5 bazowych (Ostrze, Serce, Buty, Rękawice, Klepsydra) i 7 rzadszych z efektem broni (Szuriken, Elektryczna strzała, Ognista pięść, Kołczan, Wampirzy kieł, Burzowy pęd, Lodowy odłamek). Łupy i kapliczka losują z całej puli. Kolejne kopie przedmiotu z efektem go wzmacniają (bez ewolucji zmieniających sterowanie — odrzucone na obecnym etapie). Przedmiot za bossa gracz wybiera z 3 kart. **Nie dodawaj nowych rodzajów przedmiotów bez pytania.**
- **Mało przeciwników:** podstawowe archetypy (Rusher, Kiter), 1–2 na pokój. Trudność rośnie przez statystyki.
- **Tempo walki jest zaakceptowane.** Balans stroimy później, gdy będzie gotowe podstawowe środowisko.
- **Gra ma być wymagająca (krok 14).** Po przeglądzie balansu gra jest trudniejsza i właściciel to akceptuje. **Nie łagodź trudności** (HP/obrażenia wrogów, siła bossa, rzadkość leczenia) bez sygnału z testów właściciela.
- **Sprite'y:** właściciel zapisuje je w `OneDrive\Pictures\sprites`; Claude kopiuje je do `public/assets/sprites` i opisuje w `config/spriteConfig.ts`.

## Znane pułapki

- **Projekt leży w OneDrive, a watcher Vite potrafi przegapić zmianę pliku.** Objaw: błąd w przeglądarce sprzeczny z kodem na dysku.
  - Diagnoza: porównaj `curl http://localhost:5173/src/<plik>.ts` z plikiem.
  - Naprawa: `touch` pliku albo restart `npm run dev`.
- **Panel Terminal w aplikacji nie obsługuje interaktywnego logowania `gh` („Press Enter…”).** Przy `gh auth login --web` uruchom komendę w tle i podaj użytkownikowi kod do wpisania na github.com/login/device.
- **W PowerShellu ścieżkę programu w cudzysłowie wywołuje się przez `&`**, np. `& "C:\Program Files\GitHub CLI\gh.exe" …`.
