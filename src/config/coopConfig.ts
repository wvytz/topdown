import { PAD_BUTTON } from '@/config/gamepadConfig';
import type { ReviveConfig } from '@/systems/Revive';

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
  /**
   * Smycz (etap C2, decyzja właściciela: wspólny ekran): bohaterowie nie oddalą się od siebie bardziej, niż mieści
   * widok kamery minus ten zapas (px świata) — obaj zawsze są w kadrze, z marginesem na ich sylwetki.
   */
  leashMarginPx: { x: 48, y: 40 },
  /** Drugi bohater pojawia się obok pierwszego, tyle px w bok (gdy tam podłoga). */
  partnerSpawnOffsetPx: 24,
  /** Partner bliżej krawędzi pokoju niż tyle kafli przy opadnięciu krat zostaje ściągnięty do środka (etap C3). */
  gatherMarginTiles: 1,
  /**
   * Wskrzeszanie (etap C4, decyzja właściciela: powalenie zamiast śmierci): partner stoi przy powalonym 3 s,
   * ten wstaje z 40% HP i 1,5 s nietykalności. Run kończy się, gdy padną obaj.
   */
  revive: { radiusPx: 30, durationMs: 3000, decaySlowdown: 3, hpFraction: 0.4 } satisfies ReviveConfig,
  /** Nietykalność po wstaniu (ms). */
  reviveInvulnerabilityMs: 1500,
} as const;
