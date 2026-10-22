-- Krok 91a: osobna tablica wyników aren bossów. Bezpieczna do ponownego uruchomienia (IF NOT EXISTS).
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
