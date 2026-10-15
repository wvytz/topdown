import type { PoisonEffect } from '@/core/combatTypes';
import type { IntRange } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';

/**
 * Purchawki w Grzybni (krok 28c). Liczby w biomeConfig. Zapalnik jak u kokonu (`CocoonState`):
 * podejście budzi purchawkę, po `fuseMs` pęka; trafienie rozrywa ją od razu.
 */
export interface PuffballConfig {
  /** Ile purchawek w zwykłym pokoju (losowane; 0 = pokój bez purchawek). */
  readonly perRoom: IntRange;
  /** Odstęp od ścian pokoju (kafle) — purchawka nie rośnie w przejściu. */
  readonly wallMarginTiles: number;
  /** Środek pokoju (promień w kaflach) zostaje wolny — tam może stać kapliczka. */
  readonly centerClearTiles: number;
  /** Najmniejszy odstęp między purchawkami (kafle, metryka Czebyszewa). */
  readonly minSpacingTiles: number;
  /** Promień purchawki (px): trafienia ciosem, strzałem i dashem. */
  readonly radius: number;
  /** Gracz bliżej niż tyle (px, od środka do środka) budzi purchawkę. */
  readonly triggerRadius: number;
  /** Czas od zbudzenia do pęknięcia (telegraf: purchawka nabrzmiewa, widać strefę). */
  readonly fuseMs: number;
  readonly cloud: PoisonCloudConfig;
}

/** Trująca chmura po pęknięciu purchawki: teren, nie atak — chroni przed nią tylko dash. */
export interface PoisonCloudConfig {
  /** Promień chmury w chwili pęknięcia (px) … */
  readonly startRadius: number;
  /** … rośnie do tego promienia (px) … */
  readonly maxRadius: number;
  /** … przez tyle ms. */
  readonly spreadMs: number;
  /** Ile chmura wisi od pęknięcia (ms). */
  readonly durationMs: number;
  /** Trucizna odnawiana co klatkę w chmurze; `durationMs` = jak długo truje po wyjściu. */
  readonly poison: PoisonEffect;
}

/** Promień chmury w chwili `now` (0 przed pęknięciem i po rozwianiu). */
export function poisonCloudRadius(config: PoisonCloudConfig, burstAt: number, now: number): number {
  const age = now - burstAt;
  if (age < 0 || age >= config.durationMs) return 0;
  const t = config.spreadMs > 0 ? Math.min(1, age / config.spreadMs) : 1;
  return config.startRadius + (config.maxRadius - config.startRadius) * t;
}

/** Czy gracz jest w chmurze — jak w pajęczynie liczy się jego środek (to teren, nie trafienie). */
export function isInPoisonCloud(config: PoisonCloudConfig, center: Vector2, burstAt: number, player: Vector2, now: number): boolean {
  const radius = poisonCloudRadius(config, burstAt, now);
  return radius > 0 && Math.hypot(player.x - center.x, player.y - center.y) <= radius;
}
