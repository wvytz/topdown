-- Krok 133: czat „Napisz do autora” i ukryta tablica współtwórców. Uruchom RAZ przed wdrożeniem workera
-- (ALTER TABLE nie jest bezpieczny do powtórzenia — drugi raz zgłosi „duplicate column”, co niczego nie psuje).
ALTER TABLE reports ADD COLUMN player_name TEXT;
ALTER TABLE reports ADD COLUMN stars INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS contributors (
  client_id      TEXT PRIMARY KEY,
  name           TEXT,
  feedback_count INTEGER NOT NULL DEFAULT 0,
  report_count   INTEGER NOT NULL DEFAULT 0,
  stars          INTEGER NOT NULL DEFAULT 0,
  first_at       INTEGER NOT NULL,
  last_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS contributors_rank ON contributors (stars DESC, feedback_count DESC);
