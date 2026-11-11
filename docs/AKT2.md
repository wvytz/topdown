# Akt II — Popielnik i Zejście (propozycja)

Stan: 11.11.2026, **propozycja do oceny właściciela, bez kodu**. Odpowiada na prośbę: „po pierwszym pokonaniu czarownicy nowy biom-kryjówka i nowy rodzaj powtarzalnych runów ze zbieraniem przedmiotów”. Bierzemy mechaniki gatunku (baza wypadowa, runy, trwałe odblokowania), a nazwy, postacie i zasady są nasze.

Po akceptacji każdy etap z §9 to osobny wątek. Sekcja §10 zbiera decyzje, które należą do właściciela.

## 1. Pomysł w pięciu zdaniach

1. Brudna Wiedźma ginie, nad ogrodem wschodzi Czarne Słońce, taras się zapada i bohater spada szybem wieży — obok kotłowni Palacza i niżej, niż ktokolwiek schodził.
2. Ląduje w **Popielniku**: komorze pod piecami, do której od wieków spada popiół spalonych. To kryjówka i od tej chwili punkt startu każdej gry.
3. Z Popielnika rusza się w **Zejście** — krótki, za każdym razem inny run w dół przez zaświaty (próby na wzór Mictlanu).
4. Śmierć nie kończy zabawy: bohater „wraca z popiołem” do Popielnika, a z runu zostaje **Żar** (waluta trwała) i znalezione **Wota** (nowe przedmioty do odblokowania).
5. Im głębiej gracz dochodzi, tym więcej ma do wyboru na starcie kolejnego runu i tym trudniejsze **Zaćmienia** może sobie włączyć.

## 2. Jak to się spina z tym, co już jest

| Ustalenie z Aktu I | Co z nim robi Akt II |
|---|---|
| Piekło to kotłownia, w której Palacz pali zmarłych, żeby grzać żywych wyżej (krok 182) | Popiół i dusze nie znikają, tylko spadają pod fundamenty. Popielnik leży dokładnie pod piecem; zaświaty to „druga strona” kotłowni |
| „Złudna czystość → totalny mrok → portal i zejście” (Wiedźma, krok 137) | Śmierć Wiedźmy = zaćmienie (sygnał) + zawalenie tarasu z kroku 160 (droga w dół). Łączy oba warianty z wątku o fabule |
| Lore: na dole ruina, im wyżej, tym więcej cywilizacji | Odwrócenie: im niżej, tym więcej prawdy o tym, czym wieża płaci za swoje ciepło |
| Ikonka C2: pod ziemią czerwone odbicie wieży i czerwone słońce | Zaświaty są **odbiciem wieży**. Na dnie czeka Czerwone Słońce — odbicie Czarnego |
| Kręgi-bariery: Zahartowani → Godni → Posłańcy → Wybraniec | Stają się **rangami gracza** za ukończone Zaćmienia (§6), zamiast czterokrotnego powtarzania wieży |
| 9 prób Mictlanu z własnymi nazwami (dokument „Fabuła wieży”, 24.10) | Zostają jako biomy Zejścia, ale run nie przechodzi wszystkich po kolei (§4) |
| Czarny dog Barona Dymu jako przewodnik dusz | Mieszka w Popielniku i prowadzi do bramy Zejścia |
| Zaplanowane przedmioty ochronne (Jadeitowa maska, Obsydianowe zwierciadło, Skóra jaguara, Kamienna łuska, Kość psa-przewodnika, Pióro kecala, Pancerz z odwłoka, Rdzeń Tarczownika) | Pierwsze Wota do odblokowania — projekt już czeka |
| Wiedźma jako bohaterka „na później”; kupiec „z Aktem II”; ściana zasłużonych testerów | Wszystko dostaje miejsce w Popielniku |
| Wynik runu = złoto w chwili śmierci | Bez zmian, także w Zejściu. Żar to osobna waluta i nie jest wynikiem |

Zmiana względem planu z 24.10: nie ma czterech kręgów po 7 pięter ani piętra 29. Akt I to 7 pięter (krok 169), a Czarne Słońce nie jest bossem na szczycie — jego odbicie jest finałem na dnie.

## 3. Popielnik — kryjówka

**Wygląd.** Okrągła komora z cegły i żeliwa, wielkości 2–3 pokojów, bez wrogów. W stropie wylot szybu, z którego stale sypie się popiół i czasem spada żarzący się węgiel. Zaspy popiołu pod ścianami, ciepłe światło od paleniska, czerwona łuna z bramy w dół. Paleta ekranu startowego: popiół, czerń, czerwień. Technicznie to osobny biom z własnym arkuszem z generatora w `tools/`.

**Stanowiska.** Każde to obiekt, do którego się podchodzi i wciska interakcję (jak kapliczka), więc działa na myszy, padzie i dotyku. W co-opie chodzą po Popielniku oboje.

| Stanowisko | Co robi | Od którego etapu |
|---|---|---|
| **Palenisko** (środek) | Wybór bohatera i przedmiotu startowego, dołączenie partnera do co-opu | Z1 |
| **Brama Zejścia** z czarnym dogiem | Start runu w dół; tu też wybór Zaćmienia | Z2 |
| **Piec wotów** i Zgarniacz (dawny pomocnik Palacza, który zgarnia popiół) | Wypalenie znalezionego Wotum za Żar = przedmiot na stałe w puli | Z3 |
| **Szyb w górę** (łańcuchy i winda węglowa) | Zwykła wspinaczka Aktu I, dla tablicy wyników | Z1 |
| **Popielne lustro** | Areny bossów i zestaw ćwiczebny (istniejące tryby) | Z1 |
| **Ściana imion** | Tablice wyników, własne rekordy, zasłużeni testerzy | Z1 |
| **Półka trofeów** | Po każdym pierwszym zabiciu bossa pojawia się jego pamiątka; czysto ozdobne | Z2 |

Urządzanie kryjówki na własną rękę (przestawianie mebli) odkładam. Na start Popielnik zmienia się sam: trofea, kolejne zapalone lampy przy wyższych rangach, mniej popiołu na posadzce.

## 4. Zejście — nowy rodzaj runu

**Długość i kształt.** Run ma 6 pięter, czyli podobnie jak wspinaczka. Zasady piętra zostają (pokoje, nawała, elity, zasadzki, kapliczka, boss na końcu), zmienia się droga:

| Głębia | Próby (biomy) | W jednym runie |
|---|---|---|
| I | Czarna Przeprawa, Zgrzyt Gór, Obsydianowe Zbocze | Przeprawa zawsze pierwsza, potem wybór jednej z dwóch bram |
| II | Wiatr Noży, Pole Sztandarów, Deszcz Strzał | Jedna wylosowana, potem wybór jednej z dwóch pozostałych |
| III | Leże Jaguarów, Rzeka Krwi | Wybór jednej z dwóch bram |
| Dno | Dziewiąta Cisza | Finał: Czerwone Słońce / Pan Ciszy |

Po bossie zamiast schodów są **dwie bramy** z ikoną próby i podpowiedzią nagrody (np. „więcej Żaru”, „kupiec”, „Wotum”). To daje inne runy bez pisania nowych systemów: układ losuje własny strumień RNG z seeda runu, jak harmonogram zasadzek.

**Co jest w runie nowego.**
- **Żar** wypada z wrogów i bossów Zejścia. Po każdym pokonanym bossie zebrany Żar jest bezpieczny; przy śmierci przepada połowa tego, co zebrane od ostatniego bossa.
- **Wota** to rzadkie znaleziska (boss, elita z trzema cechami, ukryta komnata). Wotum trzeba donieść: jest bezpieczne po bossie, tak jak Żar.
- **Kupiec** siedzi w przejściu między głębiami i sprzedaje za złoto przedmiot, leczenie albo zwiększenie ładunków. Zakup obniża wynik, tak jak ofiara w kapliczce — świadomy wybór „siła czy ranking”.
- Przedmioty działają jak dziś: łupy z puli, 1 z 3 kart po bossie, relikwie, przemiana przy 3. kopii.

**Start runu.** Zawsze od zera, z jednym przedmiotem startowym wybranym przy Palenisku spośród odblokowanych. Build ze wspinaczki nie przechodzi do Zejścia.

**Koniec runu.** Śmierć albo zwycięstwo na Dnie kończy run ekranem podsumowania (wynik w złocie, miejsce na tablicy Zejścia, zdobyty Żar i Wota) i powrotem do Popielnika. Zejście dostaje osobną tablicę, jak areny i co-op.

**Co-op.** Zejście działa w co-opie od pierwszego etapu — to główny sposób grania. Żar i Wota są wspólne dla pary, przedmioty każdy zbiera dla siebie jak dziś. Bramę wybiera gracz, który pierwszy w nią wejdzie, po krótkim odliczaniu, żeby partner zdążył zaprotestować.

## 5. Co zostaje między runami

Trwały profil w `localStorage` (nowy klucz, np. `tower-crawler.meta.v1`, osobno od zapisów runu):

- Żar, odblokowane Wota i przedmioty startowe;
- najwyższe ukończone Zaćmienie i ranga;
- trofea i statystyki (runy, najgłębsza próba, zabici bossowie);
- odblokowani bohaterowie (Wiedźma).

**Zasada: odblokowania poszerzają wybór, nie podnoszą statystyk.** Gra ma zostać wymagająca, a tablica uczciwa: gracz po 50 runach ma więcej narzędzi i wie więcej, ale nie ma +30% obrażeń. Jedyny wyjątek, który proponuję: przedmiot startowy (1 sztuka).

**Na co idzie Żar:**

| Wydatek | Efekt |
|---|---|
| Wypalenie Wotum | Nowy przedmiot trafia do puli łupów Zejścia i wspinaczki |
| Przedmiot startowy | Odblokowany przedmiot można wybrać na start runu |
| Trzecia karta u kupca, druga brama z podpowiedzią | Wygoda i informacja, bez czystej siły |
| Wiedźma jako bohaterka | Duży cel na dłużej (po pierwszym zwycięstwie na Dnie albo za dużo Żaru) |

**Pierwsze Wota (8 sztuk, projekty z 25.10):** Pancerz z odwłoka, Rdzeń Tarczownika, Jadeitowa maska, Obsydianowe zwierciadło, Skóra jaguara, Kamienna łuska, Kość psa-przewodnika, Pióro kecala. To nowe rodzaje przedmiotów, więc wymagają zgody właściciela (§10, pytanie 4). Każda nowa próba dokłada 1–2 Wota w swoim klimacie.

**Powód, żeby wracać do wieży:** każdy boss Aktu I przy pierwszym zabiciu po odblokowaniu Popielnika zostawia jedno Wotum.

Ryzyko: profil w `localStorage` ginie przy czyszczeniu przeglądarki i nie przechodzi na telefon. Na start dodajemy „Kopiuj profil / Wklej profil” w pauzie; zapis po stronie workera to osobna decyzja na później.

## 6. Zaćmienia — trudność po zwycięstwie

Pierwsze dojście na Dno odblokowuje Zaćmienie I, kolejne zwycięstwa następne. Gracz wybiera poziom przy bramie. Każde Zaćmienie dokłada jedną regułę i mnoży Żar:

| Poziom | Reguła (szkic) | Ranga po ukończeniu |
|---|---|---|
| 0 | zwykłe Zejście | Zahartowany |
| I | elity mają cechę więcej, leczenia mniej | Godny |
| II | nawała ma falę więcej, kupiec drożeje | Posłaniec |
| III | bossowie dostają dodatkową fazę albo świtę | Wybraniec |

Ranga pokazuje się w Popielniku, na ekranie podsumowania i na tablicy. Liczby dopiero po pomiarze botem, w `src/config/`.

## 7. Pierwsze wejście i menu

- Pierwsze pokonanie Wiedźmy: wynik wspinaczki zapisuje się na tablicy jak dziś, potem krótka scena (zaćmienie, taras pęka, lot szybem obok rusztów kotłowni) i lądowanie w Popielniku. Przedmioty z tego runu spalają się na pierwszy Żar, żeby od razu było za co wypalić pierwsze Wotum.
- Od tej chwili menu ma pozycję **Popielnik** na górze, a „Nowa gra” zostaje jako wspinaczka od piętra 1. Kto nie pokonał Wiedźmy, nie widzi nic nowego.
- Kolejne zwycięstwa nad Wiedźmą kończą się ekranem ZWYCIĘSTWA z przyciskiem „Zejdź do Popielnika”.
- Tryb testowy: `?hub=1` otwiera Popielnik bez warunku.

## 8. Jak to zbudować, żeby pętla działała szybko

Dziewięć nowych biomów z bossami to miesiące. Pętla runów może działać dużo wcześniej:

**Odbicia.** Dopóki próba nie ma własnego biomu, jej miejsce w Zejściu zajmuje *odbicie* piętra wieży: istniejący biom i boss w czerwonym świetle, z jedną regułą zaświatów (np. mrok, szybsza nawała, mniej leczenia — moduł modyfikatorów pięter już istnieje). Pasuje to do lore („zaświaty są odbiciem wieży”) i do ikonki. Każda nowa próba zastępuje jedno odbicie, więc gra jest kompletna na każdym etapie.

**Szkic techniczny (zgodnie z zasadą „najpierw czysta warstwa z testami”):**
- czyste: `config/metaConfig.ts`, `systems/MetaProgress.ts` (Żar, Wota, rangi, co przepada przy śmierci), `systems/Descent.ts` (układ głębi i bram, własny strumień RNG), `config/descentConfig.ts`, `config/hideoutConfig.ts`, `dungeon/HideoutLayout.ts` (do `PURE_FILES`);
- zapis: `persistence/MetaStorage.ts` z wersją i walidacją jak `SaveGame.ts`;
- tryb: `RunMode.Descent` obok wspinaczki, aren i wyboru piętra; numery pięter Zejścia korzystają z istniejącego skalowania kolejnych kręgów;
- Phaser: Popielnik jako ręcznie ułożone „piętro” w `GameScene` (ruch, co-op, światło i sterowanie na trzech platformach dostajemy za darmo), stanowiska jako obiekty interakcji;
- worker: nowa tablica `/descent-scores` (migracja), na początku tylko lokalna;
- diagnostyka i dźwięk: `diag.note` przy wejściu/wyjściu z runu, nowe `SoundCue` dla Żaru, Wotum, bramy.

## 9. Etapy

Model jak przy upgradzie: gałąź `akt-2`, podgląd pod `/topdown/akt2/` bez workera, kroki „Krok Z<n>”, scalenie do `main` paczkami na „tak” właściciela.

| Etap | Zakres | Gotowe, gdy |
|---|---|---|
| **Z0. Szkielet** | Profil meta z testami, flaga „Wiedźma pokonana”, `RunMode.Descent` bez treści, `?hub=1` | Build przechodzi, gra testerów bez zmian |
| **Z1. Popielnik** | Kafle i światło biomu, układ, stanowiska do istniejących trybów, scena upadku, pozycja w menu; mysz, pad, dotyk, co-op | Da się wejść po Wiedźmie i z Popielnika uruchomić wszystko, co dziś z menu |
| **Z2. Zejście na odbiciach** | 6 pięter z odbić, Żar, powrót po śmierci z podsumowaniem, lokalna tablica, półka trofeów | Pętla „run → śmierć → Popielnik → run” działa solo i w co-opie; `npm run smoke` ma wariant Zejścia |
| **Z3. Wota i Piec** | Pierwsze 4 przedmioty ochronne, wypalanie, przedmiot startowy | Odblokowany przedmiot wypada w następnym runie |
| **Z4. Bramy i kupiec** | Wybór drogi, podpowiedzi nagród, kupiec między głębiami | Dwa runy z tego samego Popielnika idą różnymi drogami |
| **Z5. Zaćmienia i rangi** | Poziomy trudności, rangi, wspólna tablica w workerze, pomiar botem | Jest powód grać po pierwszym zwycięstwie |
| **Z6+. Próby** | Po jednej próbie na etap, zaczynając od Czarnej Przeprawy (biom, wrogowie, boss, 1–2 Wota) | Próba zastępuje odbicie |
| **Później** | Wiedźma-bohaterka, finał na Dnie, urządzanie Popielnika, profil w workerze | — |

Kolejność względem upgradu Aktu I: Z0–Z3 dotykają innych plików niż U3–U7 i mogą iść równolegle (najwyżej jeden wątek Aktu II naraz). Nowe biomy (Z6+) dopiero po U4, żeby od razu powstały w nowej oprawie.

## 10. Decyzje dla właściciela

Przy każdej jest rekomendacja; bez odpowiedzi obowiązuje rekomendacja.

1. **Nazwa kryjówki.** Popielnik (polecam) / Przedsionek / Ostatnie Palenisko.
2. **Start na odbiciach wieży** zamiast czekania na nowe biomy. Polecam: tak, pętla jest grywalna po Z2.
3. **Odblokowania bez czystej siły.** Polecam: tak. Alternatywa to trwałe ulepszenia statystyk za Żar — łatwiejszy postęp, ale psuje tablice i „gra ma być wymagająca”.
4. **Nowe rodzaje przedmiotów jako Wota** (na start 8 ochronnych z 25.10). Polecam: tak, po 4 na etap.
5. **Co przepada przy śmierci.** Polecam: połowa Żaru zebranego od ostatniego bossa. Alternatywy: nic nie przepada (łagodniej) albo wszystko niezabezpieczone (ostrzej).
6. **Długość runu.** Polecam 6 pięter z wyborem bram zamiast 9 prób po kolei.
7. **Czarne Słońce.** Polecam: nie jest bossem na szczycie; finałem jest jego czerwone odbicie na Dnie.
8. **Wspinaczka po odblokowaniu Popielnika.** Polecam: zostaje jako osobny tryb z tablicą i źródło 7 Wot, ale nie trzeba jej powtarzać przed każdym Zejściem.
9. **Model pracy.** Polecam: gałąź `akt-2` z podglądem, jak `upgrade-fable`.
