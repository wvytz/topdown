import type { BossEscapeDefinition } from '@/core/bossTypes';

/**
 * Ucieczka windą (krok 125): obrażenia, które przyjmie boss z ucieczką. Dopóki nie uciekł, trafienie nie zbija go
 * poniżej 1 HP — ucieczka przy `hpRatio` zawsze nastąpi, nawet po potężnym ciosie z wysokiego HP.
 */
export function escapeCappedDamage(damage: number, hp: number, escape: BossEscapeDefinition | undefined): number {
  if (!escape) return damage;
  return Math.max(0, Math.min(damage, hp - 1));
}

/** Pora uciekać: HP spadło do progu (albo niżej). */
export function shouldEscape(hp: number, maxHp: number, escape: BossEscapeDefinition | undefined): boolean {
  return Boolean(escape) && hp / maxHp <= escape!.hpRatio;
}

/** Etap ucieczki: bieg do windy, wsiadanie (drzwi otwarte), zamykanie drzwi, odjazd (koniec — „pokonany”). */
export enum EscapeStage {
  Running = 'running',
  Boarding = 'boarding',
  Closing = 'closing',
  Gone = 'gone',
}

/**
 * Etap ucieczki w chwili `now`: biegnie, dopóki nie dotrze (`arrivedAt` = null); potem `boardMs` wsiadania
 * i `closeMs` zamykania drzwi.
 */
export function escapeStage(arrivedAt: number | null, now: number, escape: BossEscapeDefinition): EscapeStage {
  if (arrivedAt === null) return EscapeStage.Running;
  const t = now - arrivedAt;
  if (t < escape.boardMs) return EscapeStage.Boarding;
  if (t < escape.boardMs + escape.closeMs) return EscapeStage.Closing;
  return EscapeStage.Gone;
}
