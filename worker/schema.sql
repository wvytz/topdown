-- Wspólna lista wyników Tower Crawlera (Cloudflare D1).
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  score      INTEGER NOT NULL,
  floor      INTEGER NOT NULL,
  timestamp  INTEGER NOT NULL,
  -- Imię gracza: na razie puste, kolumna czeka na osobny krok.
  name       TEXT,
  -- Bohater runu (krok 89, `HeroId` z gry); NULL = wpis sprzed oznaczeń. Starą bazę uzupełnia migrations/0002_scores_hero.sql.
  hero       TEXT,
  ip_hash    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (score DESC, floor DESC, id ASC);
CREATE INDEX IF NOT EXISTS scores_ip ON scores (ip_hash, created_at);

-- Tablica aren bossów (krok 91a): te same kolumny, `floor` = osiągnięta arena; ranking: arena, potem złoto.
-- Starą bazę uzupełnia migrations/0003_arena_scores.sql.
CREATE TABLE IF NOT EXISTS arena_scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  score      INTEGER NOT NULL,
  floor      INTEGER NOT NULL,
  timestamp  INTEGER NOT NULL,
  name       TEXT,
  hero       TEXT,
  ip_hash    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS arena_scores_rank ON arena_scores (floor DESC, score DESC, id ASC);
CREATE INDEX IF NOT EXISTS arena_scores_ip ON arena_scores (ip_hash, created_at);

-- Tablica co-op (krok 108): wynik drużyny, `partner` = bohater P2. Starą bazę uzupełnia migrations/0004_coop_scores.sql.
CREATE TABLE IF NOT EXISTS coop_scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  score      INTEGER NOT NULL,
  floor      INTEGER NOT NULL,
  timestamp  INTEGER NOT NULL,
  name       TEXT,
  hero       TEXT,
  partner    TEXT,
  ip_hash    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS coop_scores_rank ON coop_scores (score DESC, floor DESC, id ASC);
CREATE INDEX IF NOT EXISTS coop_scores_ip ON coop_scores (ip_hash, created_at);

-- Zgłoszenia diagnostyczne z gry (krok 57). Koperta: patrz worker/src/reports.js.
CREATE TABLE IF NOT EXISTS reports (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at     INTEGER NOT NULL,
  -- Adres IP tylko jako skrót — do limitów, nie do identyfikacji.
  ip_hash        TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  kind           TEXT NOT NULL,
  build          TEXT,
  -- Anonimowy losowy identyfikator przeglądarki i sesji (nie dane osobowe).
  client_id      TEXT NOT NULL,
  session_id     TEXT,
  -- Pola do filtrowania (z `summary` koperty).
  errors         INTEGER,
  warnings       INTEGER,
  floor          INTEGER,
  hero           TEXT,
  seed           INTEGER,
  abnormal_prev  INTEGER,
  -- Skrót treści: deduplikacja ponowień wysyłki.
  text_hash      TEXT NOT NULL,
  size           INTEGER NOT NULL,
  text           TEXT NOT NULL,
  -- JSON: [{ name, type, data }] — np. nagranie wejść.
  attachments    TEXT
);
CREATE INDEX IF NOT EXISTS reports_created ON reports (created_at);
CREATE INDEX IF NOT EXISTS reports_ip ON reports (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS reports_dedupe ON reports (client_id, text_hash);
CREATE INDEX IF NOT EXISTS reports_kind ON reports (kind, created_at);
