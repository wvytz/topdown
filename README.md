# Tower Crawler

Przeglądarkowy top-down action RPG / dungeon crawler. Wspinasz się po piętrach wieży: każde piętro ma losowo generowane pokoje, wrogów, łupy, kapliczkę i komnatę bossa. Dopiero pokonanie bossa otwiera schody wyżej. Wynikiem runu jest złoto zebrane do chwili śmierci.

**Stack:** TypeScript (strict) · Phaser 3 (Arcade Physics) · Vite · Vitest

## Uruchomienie

```bash
npm install
npm run dev          # gra w przeglądarce (http://localhost:5173)
npm test             # testy logiki
npm run build        # typy + testy + build produkcyjny do dist/
```

## Sterowanie

| Klawisz | Akcja |
|---|---|
| WASD / strzałki | ruch |
| Mysz | celowanie |
| LPM | atak wręcz |
| PPM | strzał (3 ładunki odnawiające się z czasem) |
| Spacja | dash (krótka nietykalność) |
| E | ofiara w kapliczce |
| R | nowa wspinaczka (po śmierci) |

## Co jest w grze

- **Piętra:** pokoje połączone korytarzami. Mapa i liczba pokojów rosną z każdym piętrem.
- **Wrogowie:**
  - Rusher: walczy wręcz i zapowiada cios;
  - Kiter: trzyma dystans i strzela.

  Gracza widzą tylko w linii wzroku.
- **Boss „Strażnik Piętra”:** w kółko powtarza trzy ataki obszarowe — uderzenie, pierścień pocisków i ostrzał stref. Poniżej 50% HP wpada we wściekłość.
- **Łupy:**
  - złoto;
  - mikstury zdrowia;
  - 5 przedmiotów pasywnych, które się kumulują: Ostrze, Serce, Buty, Rękawice, Klepsydra.
- **Kapliczka:** raz na piętro wymienia złoto na losowy bonus. Uwaga: ofiara obniża wynik.
- **Tablica rekordów:** ekran śmierci pokazuje top 3 i miejsce bieżącego runu. Wyniki zapisują się w przeglądarce.

## Architektura w skrócie

Zasady gry (statystyki, obrażenia, AI, generowanie pięter, łupy) są w czystym TypeScripcie, bez zależności od Phasera. Phaser tylko rysuje i wykonuje decyzje. Izolacji pilnuje test `tests/architecture.test.ts`.

```
src/
  core/        typy domenowe
  systems/     zasady: HP, cooldowny, walka, łupy, ranking
  ai/          maszyny stanów wrogów i bossa
  dungeon/     generator pięter (+ renderowanie w DungeonView)
  config/      wszystkie liczby do balansu
  entities/    encje Phasera (gracz, wrogowie, boss, łupy)
  combat/      koordynacja walki i łupów
  world/       obiekty otoczenia (kapliczka)
  persistence/ zapis rekordów
  scenes/      sceny: Boot, Game, HUD
tests/         testy Vitest
```

## Dokumentacja

- [`docs/DEVLOG.md`](docs/DEVLOG.md): dziennik rozwoju z opisem kolejnych kroków, decyzji i procesu pracy.
- [`docs/GDD.md`](docs/GDD.md): projekt gry.
- [`docs/ZASADY_KODU.md`](docs/ZASADY_KODU.md): zasady pisania kodu.
- [`CLAUDE.md`](CLAUDE.md): instrukcje dla asystenta AI (zasady pracy i decyzje projektowe).
