import type { FloorModifierEffects } from '@/core/floorModifierTypes';

/**
 * Zejście (Akt II, krok Z1; `docs/AKT2.md` §4): run z Popielnika w dół. Dopóki próby zaświatów nie mają własnych
 * biomów, piętra Zejścia to „odbicia” pięter wieży: ten sam biom i boss w czerwonym świetle, z regułą zaświatów.
 */
export interface DescentConfig {
  /** Pięter w jednym Zejściu (decyzja właściciela 11.11.2026: 6, „później doprecyzujemy”). */
  readonly floors: number;
  /** Odbicie, od którego Zejście zawsze się zaczyna, i to, na którym zawsze się kończy (piętra wieży). */
  readonly firstFloor: number;
  readonly lastFloor: number;
  /** Żar: za zwykłego wroga, elitę i bossa odbicia; premia za dojście na Dno. */
  readonly embers: { readonly enemy: number; readonly elite: number; readonly boss: number; readonly victory: number };
  /** Ile Żaru zebranego od ostatniego bossa zostaje po śmierci (decyzja właściciela: połowa). */
  readonly deathKeepRatio: number;
  /** Reguła zaświatów: mnożniki nakładane na każde piętro Zejścia (razem z modyfikatorem piętra). */
  readonly rule: Partial<FloorModifierEffects>;
  /** Barwa mroku w zaświatach (zamiast barwy biomu) — czerwone odbicie wieży z ikonki gry. */
  readonly darknessColor: number;
}

export const DESCENT_CONFIG: DescentConfig = {
  floors: 6,
  firstFloor: 1,
  lastFloor: 7,
  embers: { enemy: 1, elite: 4, boss: 25, victory: 40 },
  deathKeepRatio: 0.5,
  rule: { enemySpeedMultiplier: 1.1, enemyDamageMultiplier: 1.1 },
  darknessColor: 0x3a0508,
};

/** Sól strumienia RNG trasy Zejścia (własny strumień — zasada 4). */
export const DESCENT_ROUTE_SALT = 0xde5c;

export const DESCENT_TEXT = {
  modeName: 'ZEJŚCIE',
  /** Napis w HUD zamiast numeru piętra. */
  hudLabel: (depth: number, floors: number, biome: string) => `Zejście ${depth}/${floors} · odbicie: ${biome}`,
  rule: 'Zaświaty: wrogowie szybsi i mocniejsi o 10%',
  startToast: 'Zejście — Żar jest bezpieczny dopiero po bossie',
  stairsPrompt: '[E] Zejdź głębiej',
  stairsPromptFinal: '[E] Dotknij Dna',
  embersHud: (secured: number, loose: number) => (loose > 0 ? `Żar: ${secured} (+${loose})` : `Żar: ${secured}`),
  embersSecured: (amount: number) => `Żar bezpieczny: ${amount}`,
  deathResult: (score: number, depth: number, floors: number, embers: number) => `${score} ZŁOTA · GŁĘBIA ${depth}/${floors} · ŻAR +${embers}`,
  victoryResult: (score: number, embers: number) => `DNO ZDOBYTE · ${score} ZŁOTA · ŻAR +${embers}`,
  deathPrompt: 'R — ZEJDŹ ZNOWU · C — ZMIEŃ BOHATERA · M — POPIELNIK',
  boardHeaders: { local: 'ZEJŚCIE — NAJLEPSZE WYNIKI (LOKALNE)', pending: 'ZEJŚCIE — NAJLEPSZE WYNIKI (LOKALNE)', shared: 'ZEJŚCIE — NAJLEPSZE WYNIKI' },
  selectHint: 'Zejście przez odbicia wieży — od zera, z Popielnika',
} as const;
