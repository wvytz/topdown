import type { DescentConfig } from '@/config/descentConfig';
import type { FloorModifierEffects } from '@/core/floorModifierTypes';
import { createRng, deriveSeed } from '@/core/random';

/**
 * Trasa Zejścia (krok Z1): które odbicia pięter wieży i w jakiej kolejności. Zawsze zaczyna `firstFloor`
 * i kończy `lastFloor`; ze środkowych odbić los (własny strumień RNG z seeda runu) pomija tyle, żeby wyszło
 * `floors` pięter. Trasa wynika z samego seeda — zapis gry nie musi jej pamiętać.
 */
export function descentRoute(runSeed: number, config: Pick<DescentConfig, 'floors' | 'firstFloor' | 'lastFloor'>, salt: number): number[] {
  const middle: number[] = [];
  for (let floor = config.firstFloor + 1; floor < config.lastFloor; floor++) middle.push(floor);
  const keep = Math.max(0, Math.min(middle.length, config.floors - 2));
  const rng = createRng(deriveSeed(runSeed, salt));
  while (middle.length > keep) middle.splice(rng.int(0, middle.length - 1), 1);
  return [config.firstFloor, ...middle, config.lastFloor];
}

/** Głębia (1..n) piętra na trasie; 0 — piętra nie ma na trasie. */
export function descentDepth(route: readonly number[], floor: number): number {
  return route.indexOf(floor) + 1;
}

/** Następne odbicie po `floor`; null — to było Dno (albo piętro spoza trasy). */
export function nextDescentFloor(route: readonly number[], floor: number): number | null {
  const index = route.indexOf(floor);
  return index >= 0 ? (route[index + 1] ?? null) : null;
}

/** Reguła zaświatów nałożona na efekty piętra: mnożniki się mnożą, promień widzenia zostaje z piętra. */
export function withUnderworldRule(effects: FloorModifierEffects, rule: Partial<FloorModifierEffects>): FloorModifierEffects {
  const times = (key: Exclude<keyof FloorModifierEffects, 'visionRadius'>): number => effects[key] * (rule[key] ?? 1);
  return {
    enemySpeedMultiplier: times('enemySpeedMultiplier'),
    enemyHpMultiplier: times('enemyHpMultiplier'),
    enemyDamageMultiplier: times('enemyDamageMultiplier'),
    enemyGoldMultiplier: times('enemyGoldMultiplier'),
    playerRechargeMultiplier: times('playerRechargeMultiplier'),
    shrineCostMultiplier: times('shrineCostMultiplier'),
    visionRadius: effects.visionRadius,
  };
}

/**
 * Sakiewka Żaru jednego Zejścia: `secured` jest bezpieczny (po bossie), `loose` — zebrany od ostatniego bossa.
 * Przy śmierci z `loose` zostaje `keepRatio` (zaokrąglone w dół); zwycięstwo zabezpiecza wszystko.
 */
export class EmberPurse {
  private securedAmount: number;
  private looseAmount = 0;

  constructor(secured = 0) {
    this.securedAmount = Math.max(0, Math.floor(secured));
  }

  get secured(): number {
    return this.securedAmount;
  }

  get loose(): number {
    return this.looseAmount;
  }

  add(amount: number): void {
    this.looseAmount += Math.max(0, Math.floor(amount));
  }

  /** Boss pokonany: cały luźny Żar staje się bezpieczny. Zwraca nową bezpieczną sumę. */
  secure(): number {
    this.securedAmount += this.looseAmount;
    this.looseAmount = 0;
    return this.securedAmount;
  }

  /** Ile Żaru run oddaje do Popielnika. */
  payout(victory: boolean, keepRatio: number): number {
    return this.securedAmount + (victory ? this.looseAmount : Math.floor(this.looseAmount * keepRatio));
  }
}
