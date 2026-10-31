import type { EvolvedEffects, StatusApplication, WeaponEffects } from '@/core/combatTypes';
import type { ItemEffectsConfig } from '@/core/lootTypes';
import { ItemId } from '@/core/lootTypes';

/** Krok 150: brak przemian i łańcucha pioruna. */
export const NO_EVOLVED_EFFECTS: EvolvedEffects = {
  chain: null,
  sparker: null,
  bladeWave: null,
  attackRamp: null,
  dashCharges: 1,
  ricochet: 0,
  ricochetExtraLifetimeMs: 0,
  twinShot: false,
  twinSpreadDeg: 0,
  bloodShieldMax: 0,
  stormTrail: null,
};

export const NO_WEAPON_EFFECTS: WeaponEffects = {
  shotPierce: 0,
  shotStatus: {},
  meleeStatus: {},
  meleeHeal: 0,
  meleeHealCooldownMs: 0,
  meleeHealMaxPerSec: 0,
  dashDamage: 0,
  evolved: NO_EVOLVED_EFFECTS,
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
  const evo = config.evolution;
  const evolved = (stacks: number): boolean => stacks >= evo.copies;
  /** Kopie ponad przemieniającą (0 dla przemieniającej). */
  const beyond = (stacks: number): number => Math.max(0, stacks - evo.copies);

  const shotStatus: StatusApplication = {
    ...(electric > 0 && {
      stun: { durationMs: stacked(electric, config.electricArrow.stunMs, config.electricArrow.stunMsPerStack) },
    }),
    ...(frost > 0 && {
      slow: {
        pct: Math.min(config.frostShard.maxSlowPct, stacked(frost, config.frostShard.slowPct, config.frostShard.slowPctPerStack)),
        durationMs: config.frostShard.durationMs,
        // Krok 150, Zamrożenie (×3): trafienie spowolnionego zamraża, zamrożony pęka przy śmierci.
        ...(evolved(frost) && { freeze: { durationMs: evo.frost.freezeMs, shatterRadius: evo.frost.shatterRadius, shatterSlow: evo.frost.shatterSlow } }),
      },
    }),
  };

  const meleeStatus: StatusApplication = {
    ...(fire > 0 && {
      burn: {
        tickDamage: diminished(fire, config.fireFist.tickDamage, config.fireFist.tickDamagePerStack, config.fireFist.stackDecay),
        tickMs: config.fireFist.tickMs,
        durationMs: config.fireFist.durationMs,
        // Krok 150, Pożoga (×3): płonący wróg wybucha przy śmierci.
        ...(evolved(fire) && { pyre: { radius: evo.pyre.radius, damage: evo.pyre.damage + beyond(fire) * evo.pyre.damagePerStack } }),
      },
    }),
  };

  const fangs = count(ItemId.VampireFang);
  const shuriken = count(ItemId.Shuriken);
  const storm = count(ItemId.StormDash);
  const dashDamage = stacked(storm, config.stormDash.damage, config.stormDash.damagePerStack);

  const evolvedEffects: EvolvedEffects = {
    chain:
      electric > 0
        ? {
            targets: Math.min(evo.chain.maxTargets, electric * evo.chain.targetsPerCopy),
            range: evo.chain.range,
            damageFraction: evo.chain.damageFraction,
          }
        : null,
    sparker: evolved(electric)
      ? {
          intervalMs: Math.max(evo.sparker.minIntervalMs, evo.sparker.intervalMs - beyond(electric) * evo.sparker.intervalStepMs),
          range: evo.sparker.range,
          damage: evo.sparker.damage,
          chains: evo.sparker.chains,
          chainRange: evo.sparker.chainRange,
        }
      : null,
    bladeWave: evolved(count(ItemId.Blade)) ? { ...evo.bladeWave } : null,
    attackRamp: evolved(count(ItemId.Gloves)) ? { ...evo.attackRamp } : null,
    dashCharges: evolved(count(ItemId.Hourglass)) ? evo.hourglass.dashCharges : 1,
    ricochet: evolved(shuriken) ? Math.min(evo.ricochet.max, evo.ricochet.bounces + beyond(shuriken) * evo.ricochet.perStack) : 0,
    ricochetExtraLifetimeMs: evolved(shuriken) ? evo.ricochet.extraLifetimeMs : 0,
    twinShot: evolved(count(ItemId.Quiver)),
    twinSpreadDeg: evolved(count(ItemId.Quiver)) ? evo.quiver.twinSpreadDeg : 0,
    bloodShieldMax: evolved(fangs) ? Math.round(evo.bloodShield.maxBaseHpPct * baseMaxHp) : 0,
    stormTrail: evolved(storm)
      ? {
          durationMs: evo.stormTrail.durationMs,
          tickMs: evo.stormTrail.tickMs,
          radius: evo.stormTrail.radius,
          damage: Math.max(1, Math.round(dashDamage * evo.stormTrail.damageFraction)),
          spacing: evo.stormTrail.spacing,
        }
      : null,
  };

  return {
    shotPierce: stacked(shuriken, config.shuriken.pierce, config.shuriken.piercePerStack),
    shotStatus,
    meleeStatus,
    meleeHeal: diminished(fangs, config.vampireFang.heal, config.vampireFang.healPerStack, config.vampireFang.stackDecay),
    meleeHealCooldownMs: fangs > 0 ? config.vampireFang.cooldownMs : 0,
    meleeHealMaxPerSec: fangs > 0 ? config.vampireFang.maxHpPctPerSec * baseMaxHp : 0,
    dashDamage,
    evolved: evolvedEffects,
  };
}
