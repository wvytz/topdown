/** Modyfikatory pięter (GDD §2.5) — czyste dane, bez zależności od Phasera. */

export enum FloorModifierId {
  Fever = 'fever',
  ToughSkin = 'tough-skin',
  GoldVein = 'gold-vein',
  Darkness = 'darkness',
  Exhaustion = 'exhaustion',
  ShrineGrace = 'shrine-grace',
}

/**
 * Wpływ modyfikatora na piętro. Mnożniki: 1 = bez zmian.
 * „Wrogowie” to zwykli przeciwnicy — boss ma własną krzywą trudności.
 */
export interface FloorModifierEffects {
  readonly enemySpeedMultiplier: number;
  readonly enemyHpMultiplier: number;
  readonly enemyDamageMultiplier: number;
  /** Złoto wypadające ze zwykłych wrogów. */
  readonly enemyGoldMultiplier: number;
  /** Odnowienie dasha i ładunków strzału (1.3 = o 30% wolniej). */
  readonly playerRechargeMultiplier: number;
  readonly shrineCostMultiplier: number;
  /** Promień widoczności wokół gracza w px; null = pełna widoczność. */
  readonly visionRadius: number | null;
}

export interface FloorModifierDefinition {
  readonly id: FloorModifierId;
  readonly name: string;
  /** Krótki opis do HUD. */
  readonly description: string;
  readonly effects: Partial<FloorModifierEffects>;
}

export interface FloorModifierConfig {
  /** Pierwsze piętro z modyfikatorem (wcześniejsze są „czyste”). */
  readonly firstFloor: number;
}
