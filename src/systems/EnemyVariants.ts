import type { EnemyAttackDefinition, EnemyDefinition, EnemyType, EnemyVariant, WaveShape } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { normalize } from '@/systems/CombatMath';

/** Wariant archetypu: do jakiego należy i co zmienia (brak pola = jak archetyp). */
export interface EnemyVariantDefinition {
  readonly type: EnemyType;
  /** Kolor błysku i plamy po śmierci. */
  readonly color?: number;
  /** Inny atak (np. fala nietoperza zamiast kuli maga). */
  readonly attack?: EnemyAttackDefinition;
  /** Inna prędkość ruchu (px/s; np. szybszy ogar, krok 41d). */
  readonly moveSpeed?: number;
}

/**
 * Definicja wroga dla wariantu: statystyki i zachowanie archetypu z nadpisaniami wariantu.
 * Wariant innego archetypu to błąd konfiguracji biomu.
 */
export function enemyDefinitionFor(
  base: EnemyDefinition,
  variant: EnemyVariant,
  variants: Readonly<Record<EnemyVariant, EnemyVariantDefinition>>,
): EnemyDefinition {
  const def = variants[variant];
  if (def.type !== base.type) throw new Error(`Wariant ${variant} nie należy do archetypu ${base.type}.`);
  return {
    ...base,
    variant,
    ...(def.color !== undefined && { color: def.color }),
    ...(def.attack && { attack: def.attack }),
    ...(def.moveSpeed !== undefined && { moveSpeed: def.moveSpeed }),
  };
}

/**
 * Trafienie falą (półksiężyc) lecącą w kierunku `direction`: w układzie lotu fala to prostokąt
 * 2·halfWidth w poprzek × 2·halfDepth wzdłuż, powiększony o promień celu.
 */
export function isHitByWave(center: Vector2, direction: Vector2, shape: WaveShape, target: Vector2, targetRadius: number): boolean {
  const along = normalize(direction);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const forward = dx * along.x + dy * along.y;
  const side = -dx * along.y + dy * along.x;
  return Math.abs(forward) <= shape.halfDepth + targetRadius && Math.abs(side) <= shape.halfWidth + targetRadius;
}
