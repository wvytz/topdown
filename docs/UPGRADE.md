# Upgrade Aktu I — dokument projektowy

Stan: 10.11.2026, start z kroku 184a (`110691e`). Pełny audyt, ocena 69 odłożonych wątków i pytania do właściciela są w Claude Doc „Upgrade Aktu I — audyt i plan (Fable)” na koncie właściciela. Ten plik to wersja robocza dla kolejnych sesji: co robimy, w jakiej kolejności i czego nie wolno zepsuć.

## 1. Dwie wersje gry `#decyzja`

Decyzja właściciela z 10.11.2026: **„Wdrażaj jako osobny branch. Zostawiamy dwie wersje.”**

| Wersja | Gałąź | Adres | Tablice wyników |
|---|---|---|---|
| Gra dla testerów | `main` | `wvytz.github.io/topdown/` | wspólne (worker) |
| Upgrade Aktu I | `upgrade-fable` | `wvytz.github.io/topdown/upgrade/` | tylko lokalne |

- Etap upgradu = gałąź robocza → PR do `upgrade-fable`. **Nigdy do `main`.**
- Na `main` w czasie upgradu trafiają tylko drobne poprawki i oceny właściciela. Każdy etap zaczyna od scalenia `main` do `upgrade-fable`.
- Podgląd wdraża `npm run deploy:pages -- --subdir upgrade`, **bez** `.env.production` — build nie zna wtedy adresu workera, więc wyniki z podglądu nie trafiają na prawdziwe tablice.
- Zwykłe wdrożenie z `main` nadpisuje całe `gh-pages` i kasuje podkatalogi. Do czasu poprawki skryptu (etap U0) po każdym wdrożeniu `main` trzeba wdrożyć podgląd ponownie.
- Scalenie `upgrade-fable` do `main` dopiero na wyraźne „tak” właściciela, paczkami, z tagiem na `main` przed scaleniem.
- Kroki na gałęzi mają w DEVLOG-u nazwy **„Krok U<etap><litera>”** (np. „Krok U2a”). Numery 185 i wyższe zostają dla `main`.

## 2. Kierunek

**Pixel art zostaje, dochodzi bogatszy detal i nowoczesne światło** (wariant C z audytu). Skala postaci, obrys, zoom 2,0 i pole widzenia bez zmian. Zasady wizualne nowej oprawy: `docs/STYLEGUIDE.md` §13.

Hierarchia przy każdej decyzji: **czytelność walki > klimat > ozdoby**. Wzorcem estetyki jest ekran startowy (popiół, czerń, czerwień), a nie arcade'owy blask.

Poza zakresem: Akt II, finałowy boss wieży, nowe rodzaje przedmiotów, kolidujące rekwizyty, zmiana kluczy zapisu i workera, migracja silnika, rzeczy odrzucone wcześniej przez właściciela.

## 3. Przyjęte ustalenia

Właściciel nie odpowiedział na pytania pojedynczo, tylko polecił wdrażać. Zgodnie z jego stałą zasadą („wybieraj rekomendowane ścieżki”) obowiązują rekomendacje z audytu. Każdą z nich właściciel może odwrócić jednym zdaniem.

| # | Temat | Ustalenie |
|---|---|---|
| 1 | Kierunek graficzny | Wariant C: bogatszy pixel art + światło i efekty za przełącznikiem jakości |
| 2 | Pilot kafli | Ruiny (piętro 1), potem Grzybnia i Cmentarzysko |
| 3 | „Sok” w walce | Pełny, z ustawieniem „mniej błysków” |
| 4 | Kto widzi nową oprawę | Najpierw właściciel na podglądzie, testerzy po akceptacji paczki |
| 5 | Zoom | Zostaje 2,0; próba `?zoom=1.6` do usunięcia |
| 6 | Powtarzalność | Wydarzenia w pokojach i przeklęta skrzynia; kupiec z Aktem II |
| 7 | Przemiana Butów | „Rozdeptanie”: dash przez wrogów rani ich i odpycha. Wchodzi w U8 jako propozycja do oceny na podglądzie |
| 8 | Balans | Upgrade nie zmienia liczb; w U8 pomiar botem i lista propozycji |
| 9 | Barwy klas | Akcent na sprite'ach, bez przemalowania postaci |
| 10 | Wiedźma jako bohaterka, 3. faza | Po upgradzie |

Otwarte: nazwa biomu piętra 5, wspólna tablica telefonów (zmiana w workerze).

## 4. Etapy

Każdy etap to osobny wątek. U0–U3 po kolei, od U4 najwyżej dwa wątki naraz.

| Etap | Zakres | Gotowe, gdy | Wycofanie |
|---|---|---|---|
| **U0. Pomiar i podgląd** | Kadry bazowe z automatu, profil wydajności przy pełnej nawale (PC, telefon, co-op), podgląd `/upgrade/`, skrypt wdrożenia zachowuje podkatalogi, porządek w backlogu, strona „Do oceny” | Jest link do podglądu, arkusz „przed” i czas klatki na telefonie | — |
| **U1. Fundament renderu** | Jeden moduł efektów ekranowych, przełącznik jakości i „mniej błysków” w „Dźwięk i obraz”, automat na telefonie, wydzielenie efektów z `GameScene.ts` | „Niska” wygląda jak gra przed upgradem | Przełącznik na „Niska” |
| **U2. Feel walki** | Wybuchy i trafienia nad mrokiem, smuga cięcia, błysk i hitstop, rozpad wrogów, ślady walki, czytelne pociski w tłumie, wyraźne elity | Na kadrach z nawałą widać każdy wybuch i pocisk; nagrania wejść odtwarzają się identycznie | Przełącznik jakości |
| **U3. Światło 2.0** | Światło od pocisków, magii, ognia i wybuchów; światło Czarnego Słońca; świecące elementy biomów | Strzały w Zaduchu i Mroku czytelne, brak pasm, telefon trzyma 60 klatek | Przełącznik jakości |
| **U4. Kafle i biomy 2.0** | Pilot ruin: warianty płyt, przejścia materiałów, głębia murów, „wieża za oknem”, obwódka areny; potem pozostałe biomy | Właściciel akceptuje pilot; walidator czytelności przechodzi | Stare arkusze zostają w repo |
| **U5. Postacie 2.0** | Bezruch, trafienie, śmierć i dash bohaterów; akcent barwy klasy; Totem; rozróżnianie bohaterów w co-opie | Hitboxy bez zmian (test); akceptacja arkusza jednej postaci przed resztą | Stare arkusze zostają |
| **U6. Bossowie** | Wejście bossa z kartą, widoczne fazy, śmierć Pożeracza, smagnięcie Matki Pająków, rekwizyty aren 6–7 z generatora | Każdy z 7 bossów ma wejście, fazy i śmierć; liczby walk bez zmian | Wyłącznik karty w config |
| **U7. Interfejs** | Jeden pikselowy krój pisma, nowy HUD, karty z ikonami, pauza/menu/minimapa w jednym stylu, „Moje przedmioty” i podpis runu na ekranach końca | Ten sam wygląd na PC, padzie i telefonie; ekran startowy nietknięty | Stary HUD za flagą |
| **U8. Rozgrywka** | Wydarzenia w pokojach, przeklęta skrzynia, przemiana Butów, własni wrogowie luster i ogrodu, skok pajączka, pomiar bohaterów botem | Dwa runy tym samym bohaterem różnią się przebiegiem pokojów; raport balansu | Wyłącznik każdej nowości w config |
| **U9. Platformy** | Telefon, naprawa bota i „Graj z botem”, zmiana imienia i filtr, dźwięki nowych efektów | Smoke solo, co-op i bot zielone | Małe osobne PR-y |
| **U10. Scalenie** | Paczkami do `main`, pełny smoke, wdrożenie z `.env.production` | „Tak” właściciela dla każdej paczki | Tag na `main` |

## 5. Zabezpieczenia (dla każdego etapu)

- `npm run build` zielony; przy zmianach wizualnych `npm run smoke` (w co-opie także `-- --coop`).
- Efekty nie dotykają hitboxów, kolizji, czasu logiki, zapisu ani strumieni RNG systemów gry. Nagranie wejść sprzed etapu musi odtworzyć się tak samo po nim.
- Parametry efektów (czasy, alfy, promienie, progi jakości) w `src/config/`.
- Nowa warstwa efektów to osobne moduły, a nie kolejne linie w `GameScene.ts`, `BossFight.ts` i `spriteConfig.ts`.
- Grafika tylko z generatorów w `tools/`; stare arkusze zostają do akceptacji nowych.
- Każdy nowy ekran i akcja: mysz z klawiaturą, pad i dotyk. Co-op nie zmienia gry solo.
- Pomiar wydajności przed i po etapie. Cel: 60 klatek na średnim telefonie przy 22 wrogach. Zasoby graficzne do 6 MB.
- Klucze `tower-crawler.*`, format zapisu i worker bez zmian.
