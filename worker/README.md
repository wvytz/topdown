# Worker Tower Crawlera: wyniki i zgłoszenia diagnostyczne

Cloudflare Worker + baza D1. Gra wysyła wynik po śmierci i pobiera najlepsze wyniki wszystkich graczy (`/scores`), a tester może wysłać autorowi raport diagnostyczny z klawisza F9 (`/reports`, krok 57).

## Wdrożenie (raz)

1. `cd worker`
2. `npx wrangler login`
3. `npx wrangler d1 create tower-crawler-scores` — skopiuj `database_id` do `wrangler.toml`.
4. `npx wrangler d1 execute tower-crawler-scores --remote --file=schema.sql`
5. `npx wrangler deploy` — zapisz adres workera, np. `https://tower-crawler-scores.<konto>.workers.dev`.
6. W katalogu gry utwórz `.env.production` (i ewentualnie `.env.local` do `npm run dev`):
   `VITE_SCORES_URL=https://tower-crawler-scores.<konto>.workers.dev`
7. `npm run deploy:pages` — nowa wersja gry korzysta ze wspólnej listy.

Bez `VITE_SCORES_URL` gra działa jak dawniej: tylko lista lokalna.

## Ochrona

- Wynik liczy przeglądarka, więc da się go sfałszować. Worker odrzuca tylko oczywiste bzdury
  (ujemne, ponad 1 000 000 złota, piętro poza 1–100, data spoza ±1 doby, imię z niedozwolonymi znakami lub dłuższe niż 12).
- Zapis tylko z adresów w `ALLOWED_ORIGINS` (strona gry i `localhost:5173`).
- Do 10 wpisów na 10 minut z jednego adresu IP (IP trzymamy jako skrót SHA-256).
- Darmowy plan Cloudflare (Workers + D1) z zapasem wystarcza na grę testerów.

## Aktualizacja bazy utworzonej przed imionami

Schemat od początku ma kolumnę `name`, więc nic nie trzeba migrować — wystarczy `npx wrangler deploy`.

## Zgłoszenia diagnostyczne (`/reports`, krok 57)

| Metoda i ścieżka | Kto | Działanie |
|---|---|---|
| `POST /reports` | gra (tylko z `ALLOWED_ORIGINS`) | przyjęcie koperty zgłoszenia: `201 {ok,id}`, `200 {duplicate}`, `400 {reason}`, `403`, `413`, `429` + `Retry-After`, `503` |
| `GET /reports?limit&kind&since&floor` | autor (nagłówek `Authorization: Bearer <REPORTS_TOKEN>`) | lista metadanych, najnowsze pierwsze |
| `GET /reports/:id` | autor | pełne zgłoszenie (tekst + załączniki, bez skrótu IP) |
| `DELETE /reports/:id` | autor | usunięcie |
| cron 03:17 UTC | Cloudflare | usuwa zgłoszenia starsze niż 30 dni |

Bez ustawionego sekretu `REPORTS_TOKEN` (albo z błędnym tokenem) trasy autora zwracają 404 — nie wiadomo, że istnieją.

### Wdrożenie (po aktualizacji kodu)

1. `cd worker`
2. `npx wrangler d1 execute tower-crawler-scores --remote --file=schema.sql` — dopisuje tabelę `reports` (polecenie jest bezpieczne do powtórzenia).
3. `npx wrangler secret put REPORTS_TOKEN` — wpisz długi losowy token (to hasło do odczytu zgłoszeń).
4. `npx wrangler deploy` — publikuje też cron czyszczący.
5. W katalogu gry `.env.production` zostaje bez zmian (`VITE_SCORES_URL`); przycisk „Wyślij autorowi” w F9 pojawia się, gdy adres jest ustawiony. `npm run deploy:pages` publikuje grę.

### Odczyt zgłoszeń

```
curl -H "Authorization: Bearer $TOKEN" "https://<worker>/reports?limit=20"
curl -H "Authorization: Bearer $TOKEN" "https://<worker>/reports?kind=crash&since=1800000000000"
curl -H "Authorization: Bearer $TOKEN" "https://<worker>/reports/42"          # pełny wpis
curl -H "Authorization: Bearer $TOKEN" "https://<worker>/reports/42" | jq -r '.attachments[0].data' > nagranie.json   # nagranie wejść → __replay w trybie dev
```

### Limity (`worker/src/reports.js`, `REPORT_LIMITS`)

- Rozmiar: całość ≤ 262 144 znaków, tekst ≤ 80 000, do 2 załączników po ≤ 150 000 znaków; większe → 400/413 (odrzucane już po nagłówku `Content-Length`, zanim treść trafi do pamięci).
- Z jednego adresu IP (skrót): 5 zgłoszeń na godzinę, 20 na dobę. Globalny bezpiecznik: 1000 zgłoszeń na dobę (503).
- Deduplikacja: ta sama treść od tego samego klienta w ciągu 24 h nie jest zapisywana (200 `duplicate`) i nie zużywa limitu.
- Retencja: 30 dni (cron + sprzątanie co ok. 50. zgłoszenie).
- Gra dodatkowo ogranicza wysyłkę: co najmniej minuta odstępu i 3 zgłoszenia na sesję, wyłącznie ręcznie.
- Orientacyjnie (darmowy plan Cloudflare — sprawdź aktualne limity w ich dokumentacji): to kilka zapisów na zgłoszenie, a limity zostały dobrane tak, by nawet zalew nie zbliżył się do dobowych limitów żądań i zapisów D1.
