import type { StatusApplication, WeaponEffects } from '@/core/combatTypes';
import type { ItemEffectsConfig } from '@/core/lootTypes';
import { ItemId } from '@/core/lootTypes';

export const NO_WEAPON_EFFECTS: WeaponEffects = {
  shotPierce: 0,
  shotStatus: {},
  meleeStatus: {},
  meleeHeal: 0,
  meleeHealCooldownMs: 0,
  meleeHealMaxPerSec: 0,
  dashDamage: 0,
};

/** Wartość dla `stacks` kopii: pierwsza daje `base`, każda kolejna dodaje `perStack`. */
const stacked = (stacks: number, base: number, perStack: number): number =>
  stacks > 0 ? base + (stacks - 1) * perStack : 0;

/**
 * Krok 93: jak `stacked`, ale przyrost każdej kolejnej kopii mnoży się przez `decay`
 * (0,5: +perStack, +perStack/2, +perStack/4…). Zaokrąglone, bo leczenie i tyknięcia są w całych HP.
 */
const diminished = (stacks: number, base: number, perStack: number, decay: number): number => {
  if (stacks <= 0) return 0;
  let value = base;
  for (let copy = 1, step = perStack; copy < stacks; copy++, step *= decay) value += step;
  return Math.round(value);
};

/**
 * Zlicza przedmioty z efektem i zamienia je na efekty broni. Kolejne kopie wzmacniają efekt.
 * `baseMaxHp` — bazowe HP bohatera (bez Serc): od niego liczymy sufit leczenia kła (krok 117).
 */
export function computeWeaponEffects(itemIds: readonly ItemId[], config: ItemEffectsConfig, baseMaxHp = 100): WeaponEffects {
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
        tickDamage: diminished(fire, config.fireFist.tickDamage, config.fireFist.tickDamagePerStack, config.fireFist.stackDecay),
        tickMs: config.fireFist.tickMs,
        durationMs: config.fireFist.durationMs,
      },
    }),
  };

  const fangs = count(ItemId.VampireFang);

  return {
    shotPierce: stacked(count(ItemId.Shuriken), config.shuriken.pierce, config.shuriken.piercePerStack),
    shotStatus,
    meleeStatus,
    meleeHeal: diminished(fangs, config.vampireFang.heal, config.vampireFang.healPerStack, config.vampireFang.stackDecay),
    meleeHealCooldownMs: fangs > 0 ? config.vampireFang.cooldownMs : 0,
    meleeHealMaxPerSec: fangs > 0 ? config.vampireFang.maxHpPctPerSec * baseMaxHp : 0,
    dashDamage: stacked(count(ItemId.StormDash), config.stormDash.damage, config.stormDash.damagePerStack),
  };
}
