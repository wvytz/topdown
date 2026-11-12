# System wag — dokument projektowy `#wagi` `#decyzja`

Stan: 12.11.2026, propozycja do akceptacji właściciela. Bez kodu. Po akceptacji system wchodzi etapami U11a–U11d na gałęzi `upgrade-fable` (podgląd `/topdown/upgrade/`), każdy etap w osobnym wątku.

## 0. Skąd ten pomysł

Słowa właściciela (12.11.2026): każdy atak nas męczy — ten, który zadajemy, ten, który przyjmujemy, i ten, który blokujemy na pancerz albo tarczę, bo jesteśmy za blisko. Zmęczony bohater nie wyblokuje mocnego ataku, np. przeszywającego strzału łucznika z narożnika pokoju. Kiedy trafiamy i kręcimy combo bez obrażeń, zadajemy więcej. Kiedy dostaniemy, kolejne ciosy w nas też bolą bardziej. „Wrzućmy to na wysoki poziom.”

Kontekst tego samego dnia: krew usunięta całkowicie („gramy ARCADE, musimy wymyślić lepszy sposób na sygnalizację obrażeń”), odrzut wrogów o połowę mniejszy, bo moby nie stanowiły wyzwania (PR #106). System wag ma dać walce rytm i ryzyko, a jednocześnie zastąpić krew czytelnym językiem trafień.

## 1. Rdzeń w jednym akapicie

Każdy atak w grze, nasz i wroga, ma **wagę**: lekki, średni, ciężki albo przebijający. Bohater ma **Oddech** (wytrzymałość): ataki, trafienia i bloki go zjadają, krótka przerwa w walce go oddaje. Z oddechem bohater **sam blokuje** ciosy z przodu na pancerz, tarczę albo barierę. Bez oddechu wpada w **Zadyszkę**: garda pada, a wrogowie dostają okno na **atak kary**, którego nie da się zablokować (tylko uskoczyć dashem). Obok działa **Szala**: trafienia bez obrażeń przechylają ją na naszą stronę (Passa, więcej obrażeń, na szczycie nasze ciosy stają się ciężkie), a trafienia w nas przechylają ją na stronę wrogów (Odsłonięcie, kolejne ciosy w nas bolą bardziej).

Nazwa jest celowo dwuznaczna: waga ciosu i szala wagi, która przechyla się raz na naszą, raz na ich stronę.

## 2. Wagi ataków

| Waga | Znak w zamachu | Blok z przodu | Co robi | Przykłady |
|---|---|---|---|---|
| **Lekki** | brak | tak, 70% obrażeń zatrzymane | nie przerywa zamachu wroga z pancerzem | stworki nawały, czerwie, upiory; nasza strzała, tyknięcie promienia |
| **Średni** | krótki biały błysk | tak, 60% | zwykły cios, zwykły odrzut | Rusher, Kiter, Czyhacz; cios barbarzyńcy, kula Czarodziejki, salwa |
| **Ciężki** | pomarańczowy obrys i „!” | częściowo, 35% | wróg w zamachu ma **pancerz** (lekkie i średnie ciosy go nie przerywają); nasz ciężki cios przerywa zamach i ogłusza 0,5 s | ataki elit, główne ataki bossów, doskok Czyhacza; Szał, mocna strzała, fala Czarodziejki, Wyrwa, Passa III |
| **Przebijający** | czerwone „!!” i linia albo strefa | **nie** | tylko dash albo wyjście ze strefy | atak kary (§5), wybrane ataki specjalne bossów |

Zasady:
- Waga to pole ataku w `src/config/` (`weight` przy definicji ataku). Bez pola waga wynika z rodzaju ataku (domyślnie średni), więc stare definicje działają od razu.
- **Symetria:** ciężki atak męczy także wroga. Po każdym swoim ciężkim ataku wróg ma 0,6 s zadyszki (przygaszony, przyjmuje +25% obrażeń). Czyhacz już tak działa (krok 123), system to uogólnia.
- Pułapki, teren, trucizna i ogień nie mają wagi i nie są blokowane.

## 3. Oddech (wytrzymałość bohatera)

Pierścień pod stopami bohatera, 100 punktów. Widać go tylko, gdy nie jest pełny.

| Co | Koszt (wartości startowe) |
|---|---|
| Cios barbarzyńcy | 7 |
| Strzała łucznika / mocna strzała / salwa | 3 / 6 / 10 |
| Kula Czarodziejki / promień / Wyrwa | 8 / 14 na s / 22 na s |
| Zablokowany cios lekki / średni / ciężki | 4 / 12 / 30 |
| Przyjęty cios lekki / średni / ciężki | 3 / 8 / 15 |
| Dash, ultimate, Szał | 0 (ucieczka i ultimate zawsze dostępne) |

- **Odzysk:** po 0,5 s bez ataku i bez trafienia Oddech wraca 35 na s (pełny w ok. 3 s). Krótka przerwa, odskok, obejście wroga — to jest rytm walki.
- Ciągłe cięcie barbarzyńcy wyczerpuje Oddech po ok. 14 ciosach (6 s). Kto bije bez przerwy, w końcu się odsłoni.
- **Atakować można zawsze**, także bez oddechu. Gra nie zabiera graczowi przycisku, zabiera mu tylko gardę.
- **Zadyszka** (Oddech = 0): 1,5 s bez gardy, ruch −15%, obrażenia w nas +25%, nad głową pikselowy obłoczek, pierścień miga na czerwono. Po zadyszce Oddech rusza od zera.

**Garda bez nowego przycisku.** Bohater z oddechem sam przyjmuje na gardę ciosy i pociski z przodu (stożek wokół kierunku celowania). Dzięki temu działa tak samo na myszy, padzie i telefonie i nie łamie zasady „bez nowych przycisków”. Klasy różnią się gardą:

| Bohater | Garda | Stożek | Siła bloku |
|---|---|---|---|
| Barbarzyńca | pancerz i tarcza | ±60° | ×1,0 |
| Czarodziejka | fioletowa bariera | ±60° | ×0,8 |
| Łucznik | karwasz, unik | ±45° | ×0,6 |

Zablokowany cios nie daje nietykalności po trafieniu (ta zostaje tylko po ciosie, który przeszedł). W nawale 15 stworków z przodu nie zabije bohatera od razu, ale wyssie mu Oddech w kilka sekund. To ma być presja tłumu, nie odpoczynek za tarczą.

## 4. Szala: Passa i Odsłonięcie

Jedna skala na bohatera, od Odsłonięcia III do Passy III.

**Passa (trafiamy bez obrażeń)**
- +1 za każdy cios, strzał albo kulę, która trafi co najmniej jednego wroga. Jeden zamach w pięciu wrogów to nadal +1, żeby nawała nie pompowała licznika.
- Progi: **I** od 4 trafień (+10% obrażeń), **II** od 8 (+20%), **III** od 12 (+30%, a nasze ataki stają się **ciężkie**: przebijają pancerz zamachu i ogłuszają). To jest „mega mocny atak” po naszej stronie.
- 2,5 s bez trafienia → spadek o jeden próg (nie do zera).
- Zablokowany cios Passy nie przerywa. Przyjęty cios zeruje ją do zera.

**Odsłonięcie (dostajemy)**
- Każdy cios, który przeszedł (nie zablokowany), dodaje stopień Odsłonięcia: +12% obrażeń w nas za stopień, najwyżej III (+36%). Razem z Zadyszką cios może wejść za +61%.
- Stopień schodzi po 3 s bez kolejnego przyjętego ciosu albo po 4 naszych trafieniach („odgryzamy się”).
- Odsłonięcie i Passa się wykluczają: pierwsze trafienie w nas zeruje Passę, a pierwsze nasze trafienia zdejmują Odsłonięcie.

Pętla, którą gracz ma poczuć: bijesz celnie → rośnie Passa, ale spada Oddech → musisz złapać oddech, zanim garda pęknie → jeśli przeciągniesz, wrogowie karzą cię atakiem nie do zablokowania, Szala przechyla się na ich stronę i każdy kolejny cios boli bardziej.

## 5. Atak kary

Gdy bohater wpadnie w Zadyszkę, jeden wróg w pokoju dostaje okno na mocny atak. Najwyżej jeden atak kary na pokój co 6 s, żeby nie było serii nie do przeżycia.

| Kto | Atak kary | Telegraf | Unik |
|---|---|---|---|
| Kiter i każdy strzelec | **Przeszywający strzał**: staje (najlepiej w narożniku z linią wzroku), celuje 0,7 s, ostatnie 0,25 s celownik zamarza; strzał przebija innych wrogów, ×2 obrażeń | czerwona linia od strzelca do bohatera | dash w poprzek linii albo zasłona |
| Rusher, Czyhacz | **Taran**: rozbieg w linii prostej, ×1,8 obrażeń, mocny odrzut | czerwony pas na posadzce | dash w bok |
| Bossowie | jeden z istniejących ataków bossa dostaje wagę przebijającą tylko w Zadyszce bohatera (bez nowych animacji w pierwszym etapie) | czerwone „!!” | dash |

Atak kary wybiera wroga z własnego strumienia RNG systemu (sól + seed piętra), więc nagrania wejść odtwarzają się tak samo.

## 6. Sygnalizacja w stylu arcade (zamiast krwi)

Jeden język dla wszystkich bohaterów i wrogów. Wszystko w `config/`, „Mniej błysków” wyłącza ramkę i hitstop.

| Zdarzenie | Obraz | Dźwięk |
|---|---|---|
| Cios w nas przeszedł | sylwetka błyska czerwono-biało (jest), hitstop obrazu 40–80 ms wg wagi, czerwona ramka ekranu pulsuje wg wagi, liczba obrażeń nad bohaterem, ubytek paska HP schodzi z opóźnieniem („duch” paska), drżenie wg wagi | tępe uderzenie, mocniejsze wg wagi |
| Odsłonięcie I–III | 1–3 czerwone pęknięcia na obrysie bohatera, pulsują | niski puls przy III |
| Blok | łuk gardy w barwie klasy błyska przed bohaterem od strony ciosu, stalowe iskry (kolor `blockedColor` już jest), krótkie „BLOK” | metaliczny klang |
| Garda pęka, Zadyszka | łuk gardy rozsypuje się na piksele, napis „ZADYSZKA”, obłoczek nad głową, pierścień Oddechu miga czerwono | zgrzyt i dyszenie |
| Passa I–III | licznik „×8” przy bohaterze, rośnie i zmienia barwę na progach (biel → złoto → barwa klasy), na III broń świeci barwą klasy; utrata Passy rozsypuje licznik | rosnący ton na progach |
| Waga ataku wroga | §2: brak / biały błysk / pomarańczowy obrys i „!” / czerwone „!!” z linią albo strefą; pancerz zamachu = metaliczny połysk wroga | ostrzegawczy dźwięk dla ciężkich i przebijających |
| Zadyszka wroga | wróg przygaszony, para nad głową | — |

W co-opie każdy bohater ma własny pierścień, licznik i pęknięcia przy sobie, a ramka ekranu pulsuje w barwie trafionego bohatera, żeby było jasne, kogo trafiono. Na telefonie liczniki są przy postaci, nie w rogu ekranu.

## 7. Granice i zgodność z zasadami projektu

- **Trudność nie spada.** Garda łagodzi pojedyncze ciosy, ale Zadyszka, Odsłonięcie, pancerz ciężkich zamachów i atak kary dokładają ryzyka. Cel: bot przechodzi piętra z podobną albo mniejszą liczbą żyć niż dziś; jeśli wyjdzie łatwiej, przykręcamy gardę, nie wrogów.
- **Tempo walki zostaje** (krok 171): nikt nie atakuje wolniej, zmęczenie odbiera gardę, nie szybkość ciosu.
- **Bez nowych przycisków**, bez nowych rodzajów przedmiotów. Istniejące przedmioty mogą później dostać efekty dotyczące Oddechu (np. Buty → szybszy odzysk), ale to osobna decyzja.
- **Co-op:** każdy bohater ma własny Oddech i Szalę; powalony traci Passę; bot-partner zna Zadyszkę i odskakuje.
- **Determinizm:** cały stan jest liczony w czystej logice, bez `Math.random`.
- **Zapis:** Oddech i Szala zerują się z wejściem na piętro, format zapisu się nie zmienia.
- **Wyłącznik:** `COMBAT_WEIGHT_CONFIG.enabled` i `?wagi=0|1` do porównania przed i po.

## 8. Architektura

| Warstwa | Pliki (propozycja) |
|---|---|
| Typy | `core/combatTypes.ts`: `enum AttackWeight`, pole `weight` w atakach; `core/weightTypes.ts`: stany Oddechu i Szali |
| Liczby | `config/combatWeightConfig.ts` (koszty, progi, garda klas, atak kary, wyłącznik) |
| Czysta logika | `systems/Stamina.ts` (Oddech, Zadyszka), `systems/Momentum.ts` (Szala), `systems/GuardResolver.ts` (czy blok, ile przechodzi, koszt), `systems/AttackWeight.ts` (waga domyślna, pancerz zamachu, zadyszka wroga), `ai/PunishPlanner.ts` (kto i kiedy karze) |
| Phaser | `Player.takeHit` przez `GuardResolver`; `HeroCombat` płaci Oddechem i liczy Passę; `EnemyManager` i `BossFight` — pancerz i atak kary; `effects/WeightFx.ts` (pierścień, licznik, pęknięcia, łuk gardy, ramka); dźwięki w `audioConfig.ts` |
| Testy | `tests/systems/*` dla każdego czystego modułu; test właściwości „30 s ciągłego cięcia zawsze kończy się Zadyszką, 3 s przerwy zawsze ją kasuje”; nagranie wejść odtwarza się identycznie |

## 9. Etapy (każdy w osobnym wątku, PR do `upgrade-fable`)

| Krok | Zakres | Gotowe, gdy |
|---|---|---|
| **U11a. Rdzeń** | typy, config, Oddech, Szala, GuardResolver z testami; bohater płaci Oddechem, garda, Zadyszka, Passa i Odsłonięcie liczą obrażenia | build zielony, `?wagi=1` działa w grze, bez nowej grafiki poza prostym pierścieniem |
| **U11b. Sygnalizacja** | pełny język z §6: pierścień, licznik, pęknięcia, łuk gardy, ramka, liczby, dźwięki; „Mniej błysków” | właściciel ocenia czytelność na podglądzie |
| **U11c. Wrogowie i bossowie** | wagi wszystkich ataków, pancerz ciężkich zamachów, zadyszka wroga, znaki w zamachu, atak kary (Przeszywający strzał, Taran, bossowie) | każdy wróg i boss ma przypisaną wagę (test pilnuje, że żaden atak jej nie pomija) |
| **U11d. Platformy i balans** | co-op, telefon, pad, bot-partner i bot smoke; pomiar trudności botem i strojenie liczb | smoke solo, co-op i bot zielone, raport trudności przed i po |

Akt II (`akt-2`) dostanie system po scaleniu do `main`, razem z resztą upgradu.

## 10. Do decyzji właściciela

1. **„Mocny atak” po zmęczeniu** — czytam to jako karę od wrogów (atak nie do zablokowania, §5), a naszą nagrodą jest Passa III (ciężkie ciosy, §4). Rekomendacja: oba.
2. **Garda** — automatyczna z przodu, bez przycisku (rekomendacja: działa na telefonie i padzie, zgodna z zasadą „bez nowych przycisków”) czy osobny przycisk bloku.
3. **Liczby obrażeń** — rekomendacja: tylko obrażenia otrzymane nad bohaterem (i „BLOK”), żeby ekran w nawale nie zalał się cyframi.
4. **Wartości startowe** z §3–§5 są punktem wyjścia do strojenia botem w U11d, nie decyzją balansu.
