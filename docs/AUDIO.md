# Dźwięk TOP DOWN — lista, źródła i licencje (krok 116)

## Źródła i licencje

**Wszystkie dźwięki i muzyka powstają w kodzie gry** — nie ma w repozytorium ani jednego pliku audio z zewnątrz.

- **Efekty:** synteza w stylu jsfxr/sfxr (`systems/SfxSynth.ts`): warstwy fal (sinus, trójkąt, prostokąt, piła, szum) z przesuwem wysokości, obwiednią i filtrem. Przepisy (liczby) są w `config/audioConfig.ts` (`SOUND_RECIPES`). Bufor liczy się raz, przy pierwszym użyciu.
- **Muzyka:** utwory składane w locie z akordów i skali (`systems/MusicComposer.ts`), grane syntezatorami Web Audio (`audio/MusicPlayer.ts`). Seed melodii jest stały, więc utwór brzmi zawsze tak samo.
- **Licencja:** to nasz własny kod i nasze liczby — dźwięki należą do projektu, bez przypisów i bez ograniczeń (także komercyjnie). Narzędzia, którymi się inspirowaliśmy (jsfxr), nie są dołączone ani wymagane.

**Jeśli kiedyś dodamy pliki z zewnątrz** (np. paczki Kenney.nl, OpenGameArt, Freesound, utwory z itch.io):
- tylko **CC0** albo **CC-BY** (CC-BY — z przypisem w grze i tutaj);
- pliki do `public/assets/audio/`, wpis do tabeli niżej: plik, autor, źródło (link), licencja, data pobrania;
- nie bierzemy CC-BY-NC (zakaz komercji) ani CC-BY-SA bez zgody właściciela.

| Plik | Autor | Źródło | Licencja | Pobrano |
| --- | --- | --- | --- | --- |
| — (brak plików z zewnątrz) | | | | |

## Lista dźwięków

Nazwa w kodzie: `SoundCue` w `core/audioTypes.ts`. Odsłuch w trybie dev z konsoli przeglądarki: `__sound.play('explosion')` (po pierwszym kliknięciu w grę).

| Dźwięk | Kiedy gra | Uwagi |
| --- | --- | --- |
| `ui-move`, `ui-confirm`, `ui-back` | menu, wybór bohatera, co-op, pauza, karty nagrody | |
| `sword-swing` | cios barbarzyńcy | |
| `arrow-shot`, `arrow-strong`, `volley` | strzały łucznika (co 3. mocna), salwa; rzut barbarzyńcy | |
| `orb-throw`, `orb-splash`, `nova` | kule Czarodziejki, rozprysk, fala uderzeniowa i Supernowa | `orb-splash` także pęknięcie purchawki |
| pętla `beam` | promień Czarodziejki, dopóki trzymany | w co-opie jedna pętla na wszystkich |
| `dash` | każdy dash | |
| `ultimate` | użycie ultimate | |
| `hero-hurt`, `hero-death`, `hero-revive` | bohater trafiony, pada (także powalenie w co-opie), wstaje | |
| `enemy-hit`, `enemy-death` | trafienie i śmierć wroga (też pajączki) | |
| `enemy-shot` | pocisk wroga lub bossa | celowo cichy |
| `shield-block` | cios w tarczę (Tarczownik, bossowie z tarczą), odbity pocisk | |
| `explosion` | każdy wybuch strefy (bomby, elita Wybuchowa, ataki bossów, pajączki) | |
| `impact` | lądowanie, uderzenie w ścianę, spadające pająki, dog Barona | |
| `boss-hit`, `boss-roar`, `boss-death` | trafienie bossa, początek walki i „Ryk!”, śmierć | |
| `coin`, `heal`, `item-pickup` | złoto, mikstura, przedmiot (też karta za bossa) | |
| `shrine` | ofiara w kapliczce | |
| `stairs` | wejście na kolejne piętro | |
| `gates-slam` | kraty areny i zasadzki | |
| `break` | urny, skrzynie, kokony, mur z dogiem, rozbita tarcza bossa | |
| `spikes`, `dart` | pułapki ruin | kolce słychać tylko z bliska |
| `ambush` | zasadzka: światło gaśnie | |
| `secret` | ukryta komnata się odsłania | |

**Muzyka:** wieża (piętra 1–3 i menu) — d-moll dorycki, 72 BPM; zaświaty (piętra 4–7: Cmentarzysko, Piekło, Palarnia) — e frygijski, 60 BPM, z pulsem serca. W walce z bossem muzyka dostaje bęben, gęstsze dzwonki i mocniejszy bas. Na pauzie cichnie, po śmierci drużyny milknie.

## Co-op: bez podwójnego hałasu

- **Bramka** (`systems/SoundGate.ts`): ten sam dźwięk w odstępie krótszym niż jego `minGapMs` (np. 60 ms dla ciosu) gra raz — dwa ciosy naraz albo dwóch bohaterów trafionych jednym wybuchem brzmią jak jeden. Ogólny limit: 14 efektów na 100 ms.
- **Stereo i odległość** (`systems/SoundSpace.ts`): słuch w środku kamery (w co-opie między bohaterami); zdarzenia z boku słychać z boku, dalekie — ciszej.

## Ustawienia gracza

- **Pauza:** „Muzyka − 50% +” i „Efekty − 70% +” — klik/stuknięcie w − i +, strzałki albo pad (↑ ↓ wybór, ← → głośność, A — wycisz). Zapis w `localStorage` (`tower-crawler.audio.v1`).
- **N** — wycisz / włącz dźwięk (w grze, w menu i na pauzie; nie na ekranie wpisywania imienia).
- Przeglądarka włącza dźwięk dopiero po pierwszym geście gracza (klawisz, kliknięcie, dotyk albo przycisk pada w menu).
