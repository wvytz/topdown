import { PAD_BUTTON } from '@/config/gamepadConfig';

/**
 * Lokalny co-op (krok 101, decyzja właściciela): dwóch graczy na jednym ekranie. Liczby balansu co-opu
 * (HP wrogów, dodatkowy wróg na pokój) dojdą tu w etapie C6.
 */
export const COOP_CONFIG = {
  /** Ilu bohaterów naraz — co-op dla par i znajomych. */
  maxPlayers: 2,
  /** Dołączenie do drużyny na padzie (klawiatura: Enter albo Spacja). */
  joinButtons: [PAD_BUTTON.A, PAD_BUTTON.Start],
  /** Wyjście z drużyny przed startem na padzie (klawiatura: Esc). */
  leaveButtons: [PAD_BUTTON.B],
} as const;
