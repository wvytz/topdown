-- Wspólna lista wyników Tower Crawlera (Cloudflare D1).
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  score      INTEGER NOT NULL,
  floor      INTEGER NOT NULL,
  timestamp  INTEGER NOT NULL,
  -- Imię gracza: na razie puste, kolumna czeka na osobny krok.
  name       TEXT,
  ip_hash    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (score DESC, floor DESC, id ASC);
CREATE INDEX IF NOT EXISTS scores_ip ON scores (ip_hash, created_at);
