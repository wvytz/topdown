-- Krok 108: osobna tablica wyników co-op (wynik drużyny, bohater P2 w `partner`). Bezpieczna do ponownego uruchomienia.
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
