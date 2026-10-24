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
7. **Git i GitHub:** repozytorium **publiczne** `github.com/wvytz/topdown`, gałąź `main`.
   - Od kroku 32a commit i push po każdym skończonym kroku (po buildzie i DEVLOG), bez pytania. Opis commita po polsku, w stylu „Krok N: …”.
   - Commity tylko z adresem noreply `10197578+wvytz@users.noreply.github.com` (historia przepisana — właściciel nie chce, by jego e-mail był publiczny).
   - Gra dla testerów: https://wvytz.github.io/topdown/ (GitHub Pages z gałęzi `gh-pages`). Nową wersję wdraża `npm run deploy:pages` (build + nadpisanie `gh-pages`).

## Decyzje projektowe właściciela

- **Wynik runu = złoto w chwili śmierci.**
  - Ekran śmierci pokazuje top 3 i miejsce bieżącego runu.
  - Ofiara w kapliczce celowo obniża wynik.
- **Pula przedmiotów (krok 10):** 5 bazowych (Ostrze, Serce, Buty, Rękawice, Klepsydra) i 7 rzadszych z efektem broni (Szuriken, Elektryczna strzała, Ognista pięść, Kołczan, Wampirzy kieł, Burzowy pęd, Lodowy odłamek). Łupy i kapliczka losują z całej puli. Kolejne kopie przedmiotu z efektem go wzmacniają (bez ewolucji zmieniających sterowanie — odrzucone na obecnym etapie). Przedmiot za bossa gracz wybiera z 3 kart. **Nie dodawaj nowych rodzajów przedmiotów bez pytania.**
- **Bohaterowie (krok 37, łucznik — krok 82):** barbarzyńca, Czarodziejka i łucznik (`config/heroConfig.ts`). Czarodziejka ma mniej HP i wolniejszy chód; LPM — 3 kule energii na orbicie, atak wypuszcza jedną; rzut ostatniej wyzwala falę uderzeniową wokół niej i kule wracają naraz po 0,6 s (krok 97); PPM — ciągły promień spowalniający ją samą, puszczenie blokuje go na ok. 1 s. Wybór na ekranie wyboru po ekranie startowym (krok 38); `?hero=sorceress` go pomija. Kula ma rozprysk (krok 50): 35% obrażeń w promieniu 24 px, bez efektów przedmiotów. **Łucznik (krok 82):** 85 HP, najszybszy chód; LPM — ciągły ostrzał przy przytrzymaniu, co 3. strzała mocna i przebija (krok 97, wcześniej naciąganie), PPM — salwa 3 strzał na ładunkach strzału; `?hero=archer`. Broń bohatera to pole `kit` (`melee`/`sorcery`/`archery`). Strzały trafiają upiory (domyślnie, czeka na ocenę).
- **Mało przeciwników:** podstawowe archetypy (Rusher, Kiter), 1–2 na pokój. Trudność rośnie przez statystyki.
- **Elity (krok 42):** co kilka pokojów wróg z cechą (Szybki, Tarczownik, Wampiryczny, Wybuchowy, Ognisty; `config/eliteConfig.ts`), w kolejnych kręgach wieży o cechę więcej.
- **Pułapki i urny (krok 48):** tylko w ruinach (pasy kolców, strzałki z murów, urny i skrzynie; `BiomeDefinition.traps`/`breakables`); beczki z prochem odrzucone. Czekają na ocenę właściciela.
- **Zasadzki (krok 49):** co 1–2 piętra (harmonogram z seeda runu) pusty pokój z przedmiotem na środku; wejście → kraty, mrok, dwie fale upiorów (`EnemyVariant.Ghost`, przenika); po falach przedmiot do wzięcia (`config/ambushConfig.ts`). Zasadzka to nagroda o niskim ryzyku, ale intensywna walka (krok 49a): upiory liczne, kruche i słabe. Magia Czarodziejki (kule, promień) trafia upiory zawsze, także bezcielesne (krok 49b); pokój zasadzki zwykle ma krótszy bok 7, czasem 6. Zasadzka to „jackpot, nie kłopot” (krok 50a): upiory rosną z piętrem wolno (`ghostScaling`), bez modyfikatorów piętra.
- **Areny bossów (krok 90, tryb testowy):** pozycja w menu / zakładka na ekranie wyboru (albo `?mode=arenas`); arena N = arena bossa piętra N, bez reszty piętra; po bossie i pomocnikach 1 z 3 kart i teleport dalej (`systems/BossRush.ts`, `config/bossRushConfig.ts`). **Od kroku 91a (decyzja właściciela) osobna tablica wyników aren** — lokalna i wspólna (`/arena-scores` w workerze, tabela `arena_scores`); ranking: najpierw osiągnięta arena, potem złoto (`compareArenaScores`).
- **Menu główne, zapis gry i wybór piętra (krok 91, czeka na ocenę):** menu na tle ekranu startowego (`scenes/MenuScene.ts`); zapis = punkt kontrolny z wejścia na piętro — autozapis „Kontynuuj” (znika po śmierci) i 3 sloty z pauzy (`config/saveConfig.ts`); trzeci tryb **Wybór piętra** (pomysł właściciela): nowy run od piętra z pokonanym bossem (`RunMode.FloorSelect`, `persistence/BossProgress.ts`). Na środku menu (krok 94) top 3 wspinaczki i aren z własnym rekordem i ostrzeżeniem „ktoś cię wyprzedził”. Run ze slotu i z wyboru piętra **nie trafia na tablicę** (decyzja właściciela po kroku 91: wybór piętra bez tablicy i bez bonusu na start — pierwsze piętra to miejsce do farmienia przed end game).
- **Pad i wersja mobilna (kroki 95–96, decyzja właściciela):** pad działa w wersji PC (`config/gamepadConfig.ts`, `systems/gamepadInput.ts`). Wersja mobilna to osobna strona `mobile.html` z kodem w `src/mobile/` na wspólnej logice i scenach; wspólny kod jej nie importuje (pilnuje `tests/architecture.test.ts`). Sterowanie podstawia gniazdo `input/playerInput.ts`, wersję rozpoznaje `core/platform.ts`. Telefon: dotyk ze stuknięciem celującym samo (jak w Brawl Stars), skala ułamkowa, własna lokalna tablica wyników. **Nowa akcja, bohater albo ekran potrzebuje obsługi myszy/klawiatury, pada i dotyku.**
- **Tempo walki jest zaakceptowane.** Balans stroimy później, gdy będzie gotowe podstawowe środowisko.
- **Gra ma być wymagająca (krok 14).** Po przeglądzie balansu gra jest trudniejsza i właściciel to akceptuje. **Nie łagodź trudności** (HP/obrażenia wrogów, siła bossa, rzadkość leczenia) bez sygnału z testów właściciela.
- **Biomy (krok 28):** na razie każdy biom to jedno piętro zakończone swoim bossem (1 ruiny, 2 Pajęcze leże z Matką Pająków, 3 Grzybnia z Królem Pająków, 4 Cmentarzysko z Grzybowym Pożeraczem, 5–6 Piekło — krok 41, dwa piętra, paleta A „krwawy bazalt”, paleniska częstsze na 6; bossowie: 5 Strażnik Bram, 6 Kat Otchłani). **Piętro 7 (krok 83): Zadymiona palarnia z Baronem Dymu** (smuga dymu przywołuje czarnego doga — boss-pomocnika; własny arkusz kafli `--biome smoke_den`). Od piętra 8 kolejny krąg wieży powtarza biomy 1–7 (krok 43, wariant B; od kroku 83 siedem pięter w kręgu); finałowego bossa jeszcze nie ma. **Arena na końcu piętra (krok 45):** arena ma jedno wejście i może prowadzić najwyżej do jednego, ślepego pokoju końcowego — to ukryta komnata (krok 46: widać ją z 2 kafli, kokony skarbu, w jednym losowy przedmiot) — od kroku 51 **tylko w Grzybni** (nagroda za Króla Pająków, też w kolejnych kręgach), na innych piętrach arena nie ma pokoju końcowego; dodatkowe sekretne komnaty po innych bossach — do rozważenia osobno; **zapowiedź bossa (kroki 52–54):** im bliżej areny, tym więcej pajęczyn (leże, Grzybnia), lica z czaszkami/okowami (Cmentarzysko, Piekło), ślady wleczenia i krwi z podłogi, odcień światła, drżenie ekranu i iskry w Piekle (`config/dressingConfig.ts` `nest`, `config/bossHeraldConfig.ts`); wyjątek — piętro 1 (`bossRoomAtEnd`, walidator `dungeon/bossRoomRule.ts`). Biomy-„fillery” później. Każdy kolejny biom jest mroczniejszy i „pełniejszy” od poprzedniego.
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

## Diagnostyka (krok 55)

- Gra zapisuje błędy i niespotykane zdarzenia w `localStorage` (`systems/Diagnostics.ts`, `diagnostics/`); **F9** otwiera raport do skopiowania. Wyjątek w pętli gry jest łapany w `game.step` (inaczej Phaser zamiera). Nowe istotne zdarzenia gry zgłaszaj przez `diag.note(...)` z `diagnostics/DiagnosticsHub`.
- **Krok 56:** wejścia gracza są nagrywane od początku piętra (F9 → „Kopiuj nagranie”; w trybie dev `__replay(nagranie)` odtwarza), wykrywacze zawieszeń w `systems/AnomalyDetectors.ts`, błędy ładowania zasobów w dzienniku. **Przed wdrożeniem na Pages uruchom `npm run smoke`** (bot przechodzi piętra wszystkimi bohaterami w prawdziwej przeglądarce; Chrome albo `SMOKE_CHROMIUM`).
- **Krok 57:** F9 → „Wyślij autorowi” wysyła zgłoszenie do workera (`POST /reports`, koperta wersji 1, limity i retencja w `worker/src/reports.js`, opis w `worker/README.md` i DEVLOG); odczyt tylko z `REPORTS_TOKEN`. Worker zgłoszeń **wdrożony** (krok 58; odczyt: nagłówek `X-Reports-Token`, wartość tylko u właściciela).
- **Krok 58:** przy awarii (błędy `error:*`, utrata WebGL, urwana poprzednia sesja) gra — **tylko za zgodą gracza** (pytanie raz, zmiana w F9) — wysyła zgłoszenie `crash` z nagraniem wejść, najwyżej 1 na sesję (`systems/AutoReport.ts`).
- Prośba o diagnozę „wyrzuciło mnie z gry”: poproś o raport z F9 (albo z `localStorage` klucz `tower-crawler.diagnostics.v1`).

## Znane pułapki

- **Projekt leży w OneDrive, a watcher Vite potrafi przegapić zmianę pliku.** Objaw: błąd w przeglądarce sprzeczny z kodem na dysku.
  - Diagnoza: porównaj `curl http://localhost:5173/src/<plik>.ts` z plikiem.
  - Naprawa: `touch` pliku albo restart `npm run dev`.
- **Panel Terminal w aplikacji nie obsługuje interaktywnego logowania `gh` („Press Enter…”).** Przy `gh auth login --web` uruchom komendę w tle i podaj użytkownikowi kod do wpisania na github.com/login/device.
- **W PowerShellu ścieżkę programu w cudzysłowie wywołuje się przez `&`**, np. `& "C:\Program Files\GitHub CLI\gh.exe" …`.
