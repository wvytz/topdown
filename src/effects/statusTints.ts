import type { StatusEffects } from '@/systems/StatusEffects';

/** Kolory statusów (czysto wizualne): ogłuszenie, podpalenie, trucizna, spowolnienie. */
export const STATUS_TINTS = { stun: 0xfff27a, burn: 0xff7a30, poison: 0x8cff6a, slow: 0x8ad8ff } as const;

/** Barwa statusu o najwyższym priorytecie albo null. Podpalenie i trucizna migoczą. */
export function statusTint(status: StatusEffects, now: number): number | null {
  if (status.isStunned(now)) return STATUS_TINTS.stun;
  if (status.isBurning(now) && Math.floor(now / 120) % 2 === 0) return STATUS_TINTS.burn;
  if (status.isPoisoned(now) && Math.floor(now / 120) % 2 === 0) return STATUS_TINTS.poison;
  if (status.isSlowed(now)) return STATUS_TINTS.slow;
  return null;
}
