import type { EnemyDefinition } from '@/core/combatTypes';
import type {
  FloorModifierConfig,
  FloorModifierDefinition,
  FloorModifierEffects,
} from '@/core/floorModifierTypes';
import type { LootTable } from '@/core/lootTypes';
import { createRng, deriveSeed } from '@/core/random';
import type { PlayerLoadout } from '@/systems/PlayerLoadout';
import type { ShrineConfig } from '@/systems/Shrine';

const MODIFIER_SEED_SALT = 0xf100;

export const NO_FLOOR_EFFECTS: FloorModifierEffects = {
  enemySpeedMultiplier: 1,
  enemyHpMultiplier: 1,
  enemyDamageMultiplier: 1,
  enemyGoldMultiplier: 1,
  playerRechargeMultiplier: 1,
  shrineCostMultiplier: 1,
  visionRadius: null,
};

/**
 * Modyfikator piętra: deterministyczny z seeda runu, nigdy ten sam dwa piętra z rzędu.
 * Liczony od pierwszego piętra z modyfikatorem w górę, więc nie wymaga pamiętania stanu między piętrami.
 * Zwraca null dla pięter przed `firstFloor` i dla pustej puli.
 * `allowed` wyklucza modyfikatory na konkretnym piętrze (krok 28a: piętro z mgłą bez „Mroku”);
 * piętra bez wykluczeń losują tak samo jak bez filtra.
 */
export function floorModifierFor(
  runSeed: number,
  floor: number,
  pool: readonly FloorModifierDefinition[],
  config: FloorModifierConfig,
  allowed: (floor: number, modifier: FloorModifierDefinition) => boolean = () => true,
): FloorModifierDefinition | null {
  let previous: FloorModifierDefinition | null = null;
  for (let current = config.firstFloor; current <= floor; current++) {
    const floorPool = pool.filter((modifier) => allowed(current, modifier));
    const candidates = floorPool.filter((modifier) => modifier !== previous);
    const options = candidates.length > 0 ? candidates : floorPool;
    if (options.length === 0) return null;
    const rng = createRng(deriveSeed(deriveSeed(runSeed, current), MODIFIER_SEED_SALT));
    previous = options[rng.int(0, options.length - 1)] ?? null;
  }
  return previous;
}

/** Czy modyfikator ogranicza widok (jak „Mrok”) — nie łączymy go z mgłą biomu. */
export function limitsVision(modifier: FloorModifierDefinition): boolean {
  return modifier.effects.visionRadius != null;
}

/** Pełny zestaw efektów (brakujące pola = bez zmian). */
export function floorEffectsOf(modifier: FloorModifierDefinition | null): FloorModifierEffects {
  return { ...NO_FLOOR_EFFECTS, ...modifier?.effects };
}

/** Zwykły wróg na piętrze z modyfikatorem: prędkość, HP, obrażenia. */
export function applyFloorToEnemy(definition: EnemyDefinition, effects: FloorModifierEffects): EnemyDefinition {
  return {
    ...definition,
    moveSpeed: Math.round(definition.moveSpeed * effects.enemySpeedMultiplier),
    maxHp: Math.max(1, Math.round(definition.maxHp * effects.enemyHpMultiplier)),
    attack: {
      ...definition.attack,
      damage: Math.max(1, Math.round(definition.attack.damage * effects.enemyDamageMultiplier)),
    },
  };
}

/** Tabela łupów zwykłego wroga ze zmienionym złotem. */
export function applyFloorToEnemyLoot(table: LootTable, effects: FloorModifierEffects): LootTable {
  const scale = (value: number): number => Math.round(value * effects.enemyGoldMultiplier);
  return { ...table, gold: { min: scale(table.gold.min), max: scale(table.gold.max) } };
}

/** Wyczerpanie: wolniejsze odnowienie dasha i ładunków strzału. */
export function applyFloorToLoadout(loadout: PlayerLoadout, effects: FloorModifierEffects): PlayerLoadout {
  const m = effects.playerRechargeMultiplier;
  if (m === 1) return loadout;
  const { combat, sorcery } = loadout;
  return {
    ...loadout,
    combat: {
      ...combat,
      dash: { ...combat.dash, cooldownMs: Math.round(combat.dash.cooldownMs * m) },
      ranged: { ...combat.ranged, rechargeMs: Math.round(combat.ranged.rechargeMs * m) },
    },
    // Czarodziejka: odnawianie kul i blokada promienia tak jak ładunki strzału.
    sorcery: sorcery && {
      orbs: { ...sorcery.orbs, rechargeMs: Math.round(sorcery.orbs.rechargeMs * m) },
      beam: { ...sorcery.beam, lockoutMs: Math.round(sorcery.beam.lockoutMs * m) },
    },
  };
}

/** Kapliczka łaski: tańsza ofiara. */
export function applyFloorToShrine(config: ShrineConfig, effects: FloorModifierEffects): ShrineConfig {
  return { ...config, baseCost: config.baseCost * effects.shrineCostMultiplier };
}
