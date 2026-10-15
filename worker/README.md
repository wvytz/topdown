# Worker wspólnej listy wyników

Cloudflare Worker + baza D1. Gra wysyła wynik po śmierci i pobiera najlepsze wyniki wszystkich graczy.

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
  (ujemne, ponad 1 000 000 złota, piętro poza 1–100, data spoza ±1 doby).
- Zapis tylko z adresów w `ALLOWED_ORIGINS` (strona gry i `localhost:5173`).
- Do 10 wpisów na 10 minut z jednego adresu IP (IP trzymamy jako skrót SHA-256).
- Darmowy plan Cloudflare (Workers + D1) z zapasem wystarcza na grę testerów.
