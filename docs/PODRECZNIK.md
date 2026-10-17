# Podręcznik właściciela: pojęcia i procesy w Tower Crawler

Notatnik do nauki dla właściciela projektu. Tłumaczy prostym językiem to, co robimy w grze, w gitcie i na hostingu. Claude dopisuje do niego nowe pojęcia przy każdym kroku (reguła w `CLAUDE.md`). Dziennik zmian to `docs/DEVLOG.md`, a ten plik mówi, **co te słowa znaczą**.

Jak czytać: najpierw rozdział 1 (proces pracy), potem słownik (rozdziały 2–6) według potrzeby. Rozdział 8 to dziennik pojęć krok po kroku.

---

## 1. Jak pracujemy (proces)

1. **Prosisz o zmianę** w Claude Code.
2. **Claude pisze kod i testy**, uruchamia testy i build, dopisuje „Krok N” do `docs/DEVLOG.md` i nowe pojęcia do tego podręcznika.
3. **Commit i push** na gałąź `claude/...` (Claude, w chmurze).
4. **Ty przeglądasz zmiany** (VS Code, GitHub, albo pytasz Claude'a, co się zmieniło).
5. **Pull Request (PR) do `main`**: scalenie gałęzi, gdy jesteś zadowolony.
6. **`git pull` u Ciebie**, żeby komputer miał to samo co GitHub.
7. **Wdrożenie** (gra na Pages, worker na Cloudflare) **tylko na Twoje polecenie**.

Zasada bezpieczeństwa: wszystko, co zmienia produkcję albo usuwa dane, dzieje się za Twoją zgodą.

Co robi kto:

| Ty | Claude |
|---|---|
| decydujesz, co robimy | pisze kod, testy, dokumentację |
| przeglądasz zmiany | commituje i pushuje na gałąź |
| `git pull` u siebie | scala PR na Twoje polecenie |
| zezwalasz na wdrożenie | wdraża, gdy pozwolisz |

---

## 2. Git i GitHub

| Pojęcie | Co znaczy |
|---|---|
| **Repozytorium (repo)** | Folder projektu z całą historią zmian. U nas: `github.com/wvytz/topdown`. |
| **Commit** | Zapisany krok w historii: zestaw zmian z opisem („Krok 59: …”). Ma numer, np. `4769503`. |
| **Gałąź (branch)** | Osobna linia pracy. `main` to wersja główna. Claude pracuje na `claude/...`, żeby nie zepsuć `main`. |
| **Push** | Wysłanie commitów z komputera (albo chmury) na GitHub. |
| **Fetch** | Pobranie z GitHuba informacji o nowościach, **bez** zmieniania plików. |
| **Pull** | Fetch plus dołożenie zmian do Twoich plików. |
| **Merge (scalenie)** | Połączenie dwóch gałęzi. |
| **Fast-forward** | Najprostsze scalenie: Twoja gałąź jest tylko „w tyle”, więc git po prostu przesuwa ją do przodu. Nie ma konfliktów. |
| **Pull Request (PR)** | Prośba „wciągnij moją gałąź do `main`”. Pokazuje zmiany do przejrzenia. Po scaleniu gałąź można usunąć. |
| **`origin`** | Nazwa zdalnego repozytorium (GitHuba). `origin/main` to `main` na GitHubie. |
| **Working tree clean** | W folderze nie ma niezapisanych zmian. Idealny stan przed pullem. |
| **Śledzony plik (tracked)** | Plik, który git pilnuje. Plik w `.gitignore` jest ignorowany, git go nie widzi. |
| **`.gitignore`** | Lista plików, których git ma nie śledzić (np. `node_modules`, `.env.production`). |
| **Adres `noreply`** | Adres GitHuba do commitów, który ukrywa prawdziwy e-mail. W projekcie wymagany: `10197578+wvytz@users.noreply.github.com`. |
| **Unverified** | Etykieta przy commicie bez podpisu GPG. Nieszkodliwa. |
| **`git gc`** | Automatyczne sprzątanie bazy gita. W OneDrive potrafi wywalać błędy (patrz rozdział 7). |

Trzy polecenia do zapamiętania: `git status` (co się dzieje), `git pull` (pobierz), `git log --oneline -5` (pięć ostatnich commitów).

Typowe komunikaty:
- `Your branch is behind 'origin/main' by N commits, and can be fast-forwarded` → na GitHubie jest nowsze, zrób `git pull`.
- `nothing to commit, working tree clean` → nic nie musisz robić.

---

## 3. Narzędzia i budowanie gry

| Pojęcie | Co znaczy |
|---|---|
| **Node.js / npm** | Środowisko i menedżer pakietów JavaScriptu. `npm ci` instaluje dokładnie te wersje bibliotek, które są w `package-lock.json`. |
| **TypeScript** | JavaScript z typami, który wyłapuje błędy przed uruchomieniem. W projekcie w trybie `strict`. |
| **Vite** | Narzędzie, które buduje grę i uruchamia ją lokalnie (`npm run dev`). |
| **Build (`npm run build`)** | Sprawdza typy, uruchamia testy i tworzy gotową grę w folderze `dist/`. |
| **Vitest** | Framework testów. Test to mały program sprawdzający, że kawałek kodu działa, jak powinien. |
| **`dist/`** | Wynik builda. To jest to, co trafia do graczy. |
| **gzip** | Kompresja przy wysyłaniu plików. Dlatego gra ważna ok. 2 MB „na dysku” pobiera się taniej. |
| **Phaser** | Silnik gry (rysowanie, fizyka, wejście). Pliki z Phaserem są największe w buildzie. |
| **`localStorage`** | Pamięć w przeglądarce gracza. Tu są zapisy i dziennik diagnostyczny. |

---

## 4. Architektura gry (jak jest zbudowany kod)

Zasady z `CLAUDE.md`, w skrócie:
- **Czyste reguły oddzielone od silnika.** Zasady gry (statystyki, obrażenia, AI, generowanie, łupy) są w zwykłym TypeScripcie, bez Phasera. Phaser tylko rysuje i wykonuje decyzje. Dzięki temu da się to testować bez uruchamiania gry. Pilnuje tego `tests/architecture.test.ts`.
- **Najpierw test, potem Phaser.** Reguły piszemy z testami, a potem dopiero podpinamy je pod ekran.
- **Liczby do balansu tylko w `src/config/`.** Chcesz zmienić trudność? Szukasz tam, nie w logice.
- **Deterministyczna losowość.** Każdy system ma własny strumień losowości liczony z seeda piętra. Ten sam seed daje to samo piętro. Dzięki temu da się powtórzyć błąd i testować generator.
- **Diagnostyka (F9).** Gra zapisuje błędy w `localStorage`, a gracz może wysłać raport autorowi.

---

## 5. Hosting: gdzie co stoi

| Element | Gdzie | Jak się wdraża |
|---|---|---|
| Gra | GitHub Pages (`wvytz.github.io/topdown`), gałąź `gh-pages` | `npm run deploy:pages` (build + nadpisanie `gh-pages`) |
| Worker (wyniki, zgłoszenia) | Cloudflare Workers, adres `tower-crawler-scores.wvytz.workers.dev` | `npx wrangler deploy` w folderze `worker/` |
| Baza | Cloudflare D1 (`tower-crawler-scores`) | schemat z `worker/schema.sql` |
| Cron | Cloudflare, codziennie 03:17 UTC | czyści zgłoszenia starsze niż 30 dni |

Pojęcia:
- **Wdrożenie (deploy)**: wypuszczenie nowej wersji do ludzi. Odróżniaj od scalenia do `main`: scalenie nie wdraża niczego samo.
- **Worker**: mały program na serwerach Cloudflare, który odpowiada na żądania (tu: zapis i odczyt wyników).
- **D1**: baza danych Cloudflare (SQLite).
- **Wrangler**: narzędzie do wdrażania workerów (`npx wrangler …`).
- **Cron**: zadanie uruchamiane o stałej porze.
- **Darmowy plan**: oba hostingi mają limity. Przy hobbystycznym ruchu się nie zbliżysz (szczegóły w rozdziale 6).

---

## 6. Bezpieczeństwo i koszty

| Pojęcie | Co znaczy i jak jest u nas |
|---|---|
| **Sekret** | Wartość, której nie wolno upubliczniać (hasło, token). Trzymamy poza repo. U nas: `REPORTS_TOKEN`, `IP_SALT`. |
| **Token (`REPORTS_TOKEN`)** | Hasło do odczytu zgłoszeń. Bez niego trasy `/reports` odpowiadają 404, czyli „nie istnieję”. |
| **Hash (skrót)** | Jednokierunkowe przekształcenie danych. Adres IP zapisujemy tylko jako skrót. |
| **Sól (`IP_SALT`)** | Sekretny dodatek do skrótu. Bez niej skrót z publicznego kodu dało się odwrócić dla każdego adresu IPv4. |
| **Rate limit** | Limit żądań. U nas: 10 wyników / 10 min z jednego IP. |
| **Dobowy bezpiecznik** | Globalny limit na dobę: 500 wyników, 1000 zgłoszeń. Chroni darmowy limit zapisów w bazie. Po przekroczeniu worker zwraca 503, a gra odkłada wynik do kolejki. |
| **`Origin` / CORS** | Nagłówek mówiący, z jakiej strony przyszło żądanie. Worker przyjmuje zapisy tylko z `ALLOWED_ORIGINS`. Chroni przed obcymi stronami w przeglądarce, ale skrypt może podać dowolny `Origin`. To nie jest ochrona absolutna. |
| **Kody odpowiedzi** | 200 ok, 201 utworzono, 400 zły format, 403 zabronione, 404 nie ma, 429 za często, 503 chwilowo niedostępne. |
| **Plik `.env.production`** | Ustawienia budowania, u nas adres workera. Zawiera tylko adres publiczny, ale nie jest w gicie, żeby nie wpadły tam kiedyś tajne rzeczy. Wzór: `.env.production.example`. |
| **`VITE_...`** | Zmienne zaczynające się od tego prefiksu Vite **wkleja do gry**, więc są publiczne. Nigdy nie wpisuj tam sekretów. |
| **Publiczne repo** | Każdy widzi kod i historię. Nie ma w nim haseł ani kluczy. Dlatego też nie piszemy w devlogu wartości sekretów. |
| **Fałszowanie wyników** | Wynik liczy przeglądarka, więc da się go sfałszować. Dla ligi testerów akceptowalne, dla rankingu z nagrodami już nie. |

Koszty (wartości z pamięci, sprawdź aktualne cenniki):
- GitHub Pages: miękki limit ok. 100 GB ruchu miesięcznie. Pierwsze wejście gracza to ok. 2 MB, więc to dziesiątki tysięcy nowych graczy miesięcznie.
- Cloudflare Workers Free: ok. 100 tys. żądań dziennie. Po przekroczeniu zwraca błędy zamiast naliczać opłaty. Płatny plan (ok. 5 USD miesięcznie) trzeba włączyć świadomie.
- Własna domena to ok. 10–15 USD rocznie i jest opcjonalna. Po jej dodaniu trzeba dopisać adres do `ALLOWED_ORIGINS` i wdrożyć workera.

---

## 7. Pułapki, na które już wpadliśmy

- **OneDrive i `.git`.** Folder projektu w OneDrive powodował błędy `Deletion of directory '.git/objects/00' failed`. Rozwiązanie: projekt w `C:\dev\tower-crawler`, poza OneDrive. Objaw w skrócie: git chce skasować plik, a OneDrive go trzyma.
- **Ctrl+C w środku `git pull`.** Pull to dwa kroki: pobranie i dołożenie zmian. Przerwanie w trakcie sprzątania zatrzymało drugi krok. Pomaga ponowne `git pull`.
- **Pull usuwa pliki usunięte w repo.** Dlatego `.env.production` zniknął z dysku po pullu. Trzeba go odtworzyć z `.env.production.example`: `Copy-Item .env.production.example .env.production`.
- **Brak `xxd` w środowisku chmurowym.** Pierwsza próba ustawienia soli mogła być pusta. Powtórzyliśmy ją generatorem z Pythona. Lekcja: po wdrożeniu sekretu sprawdzaj, że naprawdę się ustawił (`wrangler secret list`).
- **Polskie znaki w PowerShellu.** Zdarzają się krzaczki przy `type`. W pliku są poprawne.

---

## 8. Dziennik pojęć krok po kroku

Claude dopisuje tu nowe pojęcia po każdym kroku w `DEVLOG.md`. Format: numer kroku, temat, co nowego warto wiedzieć.

| Krok | Temat | Nowe pojęcia i dlaczego to ważne |
|---|---|---|
| 55–56 | Diagnostyka, nagrywanie wejść | `localStorage`, dziennik zdarzeń, nagranie wejść (`__replay`), wykrywacze zawieszeń |
| 57 | Endpoint zgłoszeń w workerze | endpoint, walidacja, deduplikacja, retencja (30 dni), token w nagłówku |
| 58 | Wdrożenie workera, automatyczna wysyłka przy awarii | wdrożenie, sekret, zgoda gracza, cron |
| 59 | Przegląd bezpieczeństwa | `.gitignore`, śledzony plik, sól do skrótu, dobowy bezpiecznik, 503 |
| 60 | Ten podręcznik | proces pracy, słownik, reguła dopisywania pojęć |

---

## 9. Jak pisać wpis do DEVLOG (ściąga)

Przy każdym kroku dopisujemy do `docs/DEVLOG.md` sekcję „Krok N — tytuł”.

Co w niej musi być:
1. **Co powstało** (konkretnie: pliki, zachowanie).
2. **Decyzje i dlaczego** (szczególnie te od Ciebie: znaczniki `#decyzja`, `#ocena`).
3. **Testy** (ile, jakie, co sprawdzają).
4. **Weryfikacja** (`npm run build`, sprawdzenie w przeglądarce, `npm run smoke` przed wdrożeniem).
5. **Backlog**: co zostało na później.

Porady:
- Pisz po polsku, krótko, z numerami i nazwami plików.
- **Nigdy nie wpisuj sekretów** (tokenów, soli, haseł). Pisz „ustawiony, wartość u właściciela”.
- Jeśli coś jest niepewne albo niesprawdzone, napisz to wprost („tylko testy, nie na żywo”).
- Zaraz po wpisie dopisz do rozdziału 8 tego podręcznika nowe pojęcia z kroku.

Szablon:
```
## Krok N — tytuł `#znacznik`
**Co powstało:** …
**Decyzje:** …
**Testy:** …
**Weryfikacja:** …
**Backlog:** …
```
