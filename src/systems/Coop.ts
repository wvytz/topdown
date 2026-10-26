import type { HeroId } from '@/core/heroTypes';
import type { CoopSceneData } from '@/core/types';
import { DEFAULT_COOP_DEVICES } from '@/systems/coopDevices';

/**
 * Bohater drugiego gracza (decyzja właściciela: bohaterowie muszą być różni). Gdy wybrał tego samego co P1,
 * dostaje następnego w kolejności ekranu wyboru.
 */
export function partnerHero(first: HeroId, wanted: HeroId, order: readonly HeroId[]): HeroId {
  if (wanted !== first) return wanted;
  const index = order.indexOf(first);
  const next = order[(index + 1) % order.length];
  if (next === undefined || next === first) throw new Error('Co-op potrzebuje co najmniej dwóch bohaterów');
  return next;
}

/** Nowy run co-op: partner bez przedmiotów i z pełnym HP. */
export function freshCoop(partner: HeroId, devices: CoopSceneData['devices'] = DEFAULT_COOP_DEVICES): CoopSceneData {
  return { partner: { hero: partner, items: [], hp: null }, devices };
}
