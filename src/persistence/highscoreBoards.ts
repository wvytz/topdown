import { HIGHSCORE_BOARDS, HIGHSCORE_CONFIG } from '@/config/lootConfig';
import type { HighscoreBoardId } from '@/config/lootConfig';
import type { ScoreComparator } from '@/systems/Highscores';
import { compareArenaScores, compareScores } from '@/systems/Highscores';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import { SharedHighscores } from '@/persistence/SharedHighscores';
import { createRemoteScoreSource } from '@/persistence/remoteScores';
import { currentPlatform } from '@/core/platform';

/**
 * Wersja mobilna (krok 96) ma własne, tylko lokalne tablice: automatyczne celowanie na dotyku ułatwia grę,
 * więc wyniki z telefonu nie mieszają się z wynikami z myszy. Wspólna tablica telefonów — do decyzji właściciela.
 */
const MOBILE_KEY_SUFFIX = '.mobile';

/** Porządek każdej tablicy: wspinaczka — złoto, areny (krok 91a) — najpierw osiągnięta arena. */
export const BOARD_ORDER: Readonly<Record<HighscoreBoardId, ScoreComparator>> = {
  tower: compareScores,
  arenas: compareArenaScores,
};

/** Tablica wyników (lokalna + wspólna) w przeglądarce — ta sama dla ekranu śmierci i ekranu startowego. */
export function createBoardHighscores(board: HighscoreBoardId): SharedHighscores {
  const mobile = currentPlatform() === 'mobile';
  const suffix = mobile ? MOBILE_KEY_SUFFIX : '';
  const { path } = HIGHSCORE_BOARDS[board];
  const storageKey = HIGHSCORE_BOARDS[board].storageKey + suffix;
  const outboxKey = HIGHSCORE_BOARDS[board].outboxKey + suffix;
  const compare = BOARD_ORDER[board];
  const storage = HighscoreStorage.browserStorage();
  return new SharedHighscores(
    new HighscoreStorage(storage, HIGHSCORE_CONFIG.maxEntries, HIGHSCORE_CONFIG.podiumSize, storageKey, compare),
    mobile ? null : createRemoteScoreSource(path),
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
