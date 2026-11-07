import type { RelicEffects, SlowEffect, StatusApplication } from '@/core/combatTypes';
import type { ItemId, RelicConfig } from '@/core/lootTypes';
import { ItemId as Items } from '@/core/lootTypes';

/** Krok 170: brak relikwii. */
export const NO_RELIC_EFFECTS: RelicEffects = { jelly: null, killHeal: 0, ultimatePassiveMultiplier: 1 };

/** Efekty relikwii spoza broni (Korona, Ząb, Fajka). Relikwia działa raz — kolejne kopie nic nie dają. */
export function computeRelicEffects(items: readonly ItemId[], config: RelicConfig): RelicEffects {
  const has = (id: ItemId): boolean => items.includes(id);
  return {
    jelly: has(Items.SlimeCrown) ? { ...config.slimeCrown } : null,
    killHeal: has(Items.DevourerTooth) ? config.devourerTooth.heal : 0,
    ultimatePassiveMultiplier: has(Items.BaronPipe) ? config.baronPipe.passiveMultiplier : 1,
  };
}

/**
 * Statusy trafień z relikwiami: Pajęczy jedwab dokłada spowolnienie (z Lodowym odłamkiem silniejsze i dłuższe
 * z obu, zamrożenie zostaje), Topór Kata — egzekucję.
 */
export function withRelicStatus(status: StatusApplication, items: readonly ItemId[], config: RelicConfig): StatusApplication {
  let result = status;
  if (items.includes(Items.SpiderSilk)) {
    const silk = config.spiderSilk;
    const slow: SlowEffect = status.slow
      ? { ...status.slow, pct: Math.max(status.slow.pct, silk.slowPct), durationMs: Math.max(status.slow.durationMs, silk.durationMs) }
      : { pct: silk.slowPct, durationMs: silk.durationMs };
    result = { ...result, slow };
  }
  if (items.includes(Items.HeadsmanAxe)) result = { ...result, execute: { belowPct: config.headsmanAxe.executeBelowPct } };
  return result;
}

/** Relikwia bossa piętra (w kręgu 1–7); null — piętro bez bossa albo bez relikwii. */
export function relicForFloor(floor: number, floorsPerLoop: number, config: RelicConfig): ItemId | null {
  const inLoop = ((Math.max(1, floor) - 1) % floorsPerLoop) + 1;
  return config.byFloorInLoop[inLoop] ?? null;
}

/**
 * Karty za bossa z relikwią: relikwia zajmuje miejsce ostatniej karty, która nie jest kartą rozwoju
 * (karta rozwoju zostaje). Bohater, który ma już relikwię, dostaje zwykłe karty.
 */
export function withRelicCard(choices: readonly ItemId[], relic: ItemId | null, owned: readonly ItemId[], development: ItemId | null): ItemId[] {
  if (!relic || owned.includes(relic) || choices.includes(relic)) return [...choices];
  if (choices.length === 0) return [relic];
  const result = [...choices];
  let slot = result.length - 1;
  while (slot > 0 && result[slot] === development) slot -= 1;
  if (result[slot] === development) return [...result, relic];
  result[slot] = relic;
  return result;
}

/** Topór Kata: obrażenia trafienia, które dobija wroga spadającego poniżej progu. */
export function executeDamage(current: number, max: number, damage: number, belowPct: number): number {
  if (damage <= 0 || belowPct <= 0 || current <= 0) return damage;
  return current - damage < max * belowPct ? Math.max(damage, current) : damage;
}

/** Korona Szlamu: co `cooldownMs` jedno trafienie zadaje ułamek obrażeń (stan z jawnego `now`). */
export class JellyGuard {
  private readyAt = -Infinity;

  /** Obrażenia po galarecie; `jelly` null — bez relikwii. */
  absorb(damage: number, now: number, jelly: RelicEffects['jelly']): { readonly damage: number; readonly absorbed: boolean } {
    if (!jelly || damage <= 0 || now < this.readyAt) return { damage, absorbed: false };
    this.readyAt = now + jelly.cooldownMs;
    return { damage: Math.max(1, Math.round(damage * jelly.damageMultiplier)), absorbed: true };
  }

  isReady(now: number): boolean {
    return now >= this.readyAt;
  }
}
