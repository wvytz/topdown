import type { StatusApplication, WeaponEffects } from '@/core/combatTypes';
import type { ItemEffectsConfig } from '@/core/lootTypes';
import { ItemId } from '@/core/lootTypes';

export const NO_WEAPON_EFFECTS: WeaponEffects = {
  shotPierce: 0,
  shotStatus: {},
  meleeStatus: {},
  meleeHeal: 0,
  dashDamage: 0,
};

/** Wartość dla `stacks` kopii: pierwsza daje `base`, każda kolejna dodaje `perStack`. */
const stacked = (stacks: number, base: number, perStack: number): number =>
  stacks > 0 ? base + (stacks - 1) * perStack : 0;

/** Zlicza przedmioty z efektem i zamienia je na efekty broni. Kolejne kopie wzmacniają efekt. */
export function computeWeaponEffects(itemIds: readonly ItemId[], config: ItemEffectsConfig): WeaponEffects {
  const count = (id: ItemId): number => itemIds.filter((item) => item === id).length;

  const electric = count(ItemId.ElectricArrow);
  const frost = count(ItemId.FrostShard);
  const fire = count(ItemId.FireFist);

  const shotStatus: StatusApplication = {
    ...(electric > 0 && {
      stun: { durationMs: stacked(electric, config.electricArrow.stunMs, config.electricArrow.stunMsPerStack) },
    }),
    ...(frost > 0 && {
      slow: {
        pct: Math.min(config.frostShard.maxSlowPct, stacked(frost, config.frostShard.slowPct, config.frostShard.slowPctPerStack)),
        durationMs: config.frostShard.durationMs,
      },
    }),
  };

  const meleeStatus: StatusApplication = {
    ...(fire > 0 && {
      burn: {
        tickDamage: stacked(fire, config.fireFist.tickDamage, config.fireFist.tickDamagePerStack),
        tickMs: config.fireFist.tickMs,
        durationMs: config.fireFist.durationMs,
      },
    }),
  };

  return {
    shotPierce: stacked(count(ItemId.Shuriken), config.shuriken.pierce, config.shuriken.piercePerStack),
    shotStatus,
    meleeStatus,
    meleeHeal: stacked(count(ItemId.VampireFang), config.vampireFang.heal, config.vampireFang.healPerStack),
    dashDamage: stacked(count(ItemId.StormDash), config.stormDash.damage, config.stormDash.damagePerStack),
  };
}
