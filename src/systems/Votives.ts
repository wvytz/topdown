/**
 * Wota (Akt II, krok Z3): przedmioty ochronne odblokowywane w Popielniku. Czysta logika — siła ochrony z listy
 * przedmiotów, obrażenia po ochronie, ratunek Kości psa-przewodnika i pula łupów z wypalonymi Wotami.
 */
import type { DamageElement, WardEffects } from '@/core/combatTypes';
import type { ItemDefinition, RunSnapshot, VotiveConfig } from '@/core/lootTypes';
import { ItemId, ItemKind } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import { RunMode } from '@/core/runMode';

export const NO_WARD_EFFECTS: WardEffects = { poisonResist: 0, fireResist: 0, damageReduction: 0, rescue: null };

/** Ochrona z wot w ekwipunku bohatera. */
export function computeWardEffects(items: readonly ItemId[], config: VotiveConfig): WardEffects {
  const count = (id: ItemId): number => items.filter((item) => item === id).length;
  const resist = (copies: number, perCopy: number): number => Math.min(1, copies * perCopy);
  const scales = count(ItemId.StoneScale);
  const bones = Math.min(count(ItemId.GuideBone), config.guideBone.maxCopies);
  return {
    poisonResist: resist(count(ItemId.Carapace), config.carapace.resistPerCopy),
    fireResist: resist(count(ItemId.ShieldCore), config.shieldCore.resistPerCopy),
    damageReduction: Math.min(config.stoneScale.max, 1 - (1 - config.stoneScale.reductionPerCopy) ** scales),
    rescue: bones > 0 ? { invulnerableMs: config.guideBone.invulnerableMs, healPct: (bones - 1) * config.guideBone.healPctPerExtraCopy } : null,
  };
}

/** Obrażenia trafienia po ochronie: żywioł (odporność), potem łuska. Pełna odporność daje 0; inaczej najmniej 1. */
export function wardedHitDamage(damage: number, element: DamageElement | undefined, wards: WardEffects): number {
  if (damage <= 0) return damage;
  const resist = element === 'fire' ? wards.fireResist : 0;
  if (resist >= 1) return 0;
  const after = damage * (1 - resist) * (1 - wards.damageReduction);
  return Math.max(1, Math.round(after));
}

/**
 * Tyknięcie trucizny po Pancerzu z odwłoka. Ułamki nie giną: reszta przechodzi na kolejne tyknięcie
 * (2 obrażenia przy 50% to 1, a 1 obrażenie — co drugie tyknięcie).
 */
export class PoisonWard {
  private carry = 0;

  reduce(damage: number, resist: number): number {
    if (damage <= 0 || resist <= 0) return damage;
    if (resist >= 1) return 0;
    const exact = damage * (1 - resist) + this.carry;
    const whole = Math.floor(exact);
    this.carry = exact - whole;
    return whole;
  }
}

/** Kość psa-przewodnika: raz (na piętro — obiekt żyje z bohaterem piętra) cios śmiertelny zostawia 1 HP. */
export class GuideRescue {
  private used = false;

  /** HP po ratunku albo null, gdy ratunku nie ma (brak kości, już użyta albo cios nie zabija). */
  tryRescue(hp: number, damage: number, maxHp: number, rescue: WardEffects['rescue']): number | null {
    if (!rescue || this.used || damage < hp || hp <= 0) return null;
    this.used = true;
    return Math.max(1, Math.round(maxHp * rescue.healPct));
  }

  get spent(): boolean {
    return this.used;
  }
}

/** Pula łupów z wypalonymi Wotami (bez relikwii i niewypalonych wot). */
export function poolWithVotives(definitions: readonly ItemDefinition[], burned: readonly ItemId[]): readonly ItemDefinition[] {
  return definitions.filter((item) => item.kind !== ItemKind.Relic && (item.kind !== ItemKind.Votive || burned.includes(item.id)));
}

/** Wotum do znalezienia: losowe spośród jeszcze nieznalezionych i niewypalonych (null — wszystkie odkryte). */
export function votiveToFind(order: readonly ItemId[], known: readonly ItemId[], rng: Rng): ItemId | null {
  const left = order.filter((id) => !known.includes(id));
  if (left.length === 0) return null;
  return left[rng.int(0, left.length - 1)] ?? left[0]!;
}

/**
 * Przedmiot startowy Zejścia (wybrany przy Palenisku): dostaje go świeży run na pierwszym piętrze trasy —
 * nie wczytany z zapisu (punkt kontrolny ma go już w ekwipunku) ani run testowy.
 */
export function withStartItem(run: RunSnapshot, floor: number, firstFloor: number, startItem: ItemId | null): RunSnapshot {
  if (!startItem || run.mode !== RunMode.Descent || floor !== firstFloor || run.fromSave || run.practice || run.items.length > 0) return run;
  return { ...run, items: [startItem] };
}
