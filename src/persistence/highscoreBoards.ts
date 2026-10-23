import { HIGHSCORE_BOARDS, HIGHSCORE_CONFIG } from '@/config/lootConfig';
import type { HighscoreBoardId } from '@/config/lootConfig';
import type { ScoreComparator } from '@/systems/Highscores';
import { compareArenaScores, compareScores } from '@/systems/Highscores';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import { SharedHighscores } from '@/persistence/SharedHighscores';
import { createRemoteScoreSource } from '@/persistence/remoteScores';

/** Porządek każdej tablicy: wspinaczka — złoto, areny (krok 91a) — najpierw osiągnięta arena. */
export const BOARD_ORDER: Readonly<Record<HighscoreBoardId, ScoreComparator>> = {
  tower: compareScores,
  arenas: compareArenaScores,
};

/** Tablica wyników (lokalna + wspólna) w przeglądarce — ta sama dla ekranu śmierci i ekranu startowego. */
export function createBoardHighscores(board: HighscoreBoardId): SharedHighscores {
  const { storageKey, outboxKey, path } = HIGHSCORE_BOARDS[board];
  const compare = BOARD_ORDER[board];
  const storage = HighscoreStorage.browserStorage();
  return new SharedHighscores(
    new HighscoreStorage(storage, HIGHSCORE_CONFIG.maxEntries, HIGHSCORE_CONFIG.podiumSize, storageKey, compare),
    createRemoteScoreSource(path),
    storage,
    {
      maxEntries: HIGHSCORE_CONFIG.maxEntries,
      podiumSize: HIGHSCORE_CONFIG.podiumSize,
      timeoutMs: HIGHSCORE_CONFIG.remoteTimeoutMs,
      maxOutbox: HIGHSCORE_CONFIG.maxOutbox,
      outboxKey,
      compare,
    },
  );
}
