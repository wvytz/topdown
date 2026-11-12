-- Krok Z5 (Akt II): wspólna tablica Zejścia. Wynik = złoto, `floor` = osiągnięta głębia (1–6), `eclipse` = poziom
-- Zaćmienia (0–3), `partner` — bohater P2 przy Zejściu we dwoje. Nowa tabela: tablice wspinaczki, aren i co-op bez zmian.
-- Bezpieczna do ponownego uruchomienia.
CREATE TABLE IF NOT EXISTS descent_scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  score      INTEGER NOT NULL,
  floor      INTEGER NOT NULL,
  eclipse    INTEGER NOT NULL DEFAULT 0,
  timestamp  INTEGER NOT NULL,
  name       TEXT,
  hero       TEXT,
  partner    TEXT,
  ip_hash    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS descent_scores_rank ON descent_scores (score DESC, floor DESC, id ASC);
CREATE INDEX IF NOT EXISTS descent_scores_ip ON descent_scores (ip_hash, created_at);
