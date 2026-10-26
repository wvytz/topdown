import { PAD_BUTTON } from '@/config/gamepadConfig';
import type { ReviveConfig } from '@/systems/Revive';
import type { CoopBalanceConfig } from '@/systems/CoopBalance';

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
  /**
   * Balans co-opu (etap C6, decyzja właściciela: więcej HP wrogów i bossów oraz 1 wróg więcej na pokój).
   * Dwóch bohaterów zadaje mniej więcej dwa razy więcej obrażeń, a wrogów jest o połowę więcej — HP rośnie mniej
   * niż dwukrotnie, żeby walka trwała podobnie długo jak solo. Do strojenia po testach właściciela.
   */
  balance: { enemyHpMultiplier: 1.4, bossHpMultiplier: 1.7, extraEnemiesPerRoom: 1 } satisfies CoopBalanceConfig,
} as const;

/** Nagłówki tablicy co-op na ekranie śmierci (etap C7). */
export const COOP_BOARD_HEADERS = {
  local: 'NAJLEPSZE DRUŻYNY',
  pending: 'NAJLEPSZE DRUŻYNY · ŁĄCZENIE…',
  shared: 'NAJLEPSZE DRUŻYNY · WSZYSCY GRACZE',
} as const;

/** Napisy ekranu co-opu (etap C5). */
export const COOP_SELECT_TEXT = {
  title: 'CO-OP · DWÓCH GRACZY',
  join: 'Enter (klawiatura) albo A (pad) — dołącz',
  keyboard: 'klawiatura + mysz',
  pad: (n: number): string => `pad ${n}`,
  choosing: 'wybiera',
  ready: 'GOTOWY',
  hint: '← →  BOHATER   ·   ENTER / A — GOTOWY   ·   ESC / B — WSTECZ',
} as const;
