import { AttackPhase } from '@/core/combatTypes';

/** Co pokazuje sprite bohatera w danej klatce. */
export type PlayerAnimationState = 'attack' | 'move' | 'idle';

/**
 * Cios ma pierwszeństwo przed chodem: animacja ciosu trwa cały cykl ataku (zamach + odnowienie),
 * więc kolejne kliknięcie zaczyna ją od nowa dopiero wtedy, gdy logika pozwala na kolejny cios.
 */
export function playerAnimationState(attackPhase: AttackPhase, moving: boolean): PlayerAnimationState {
  if (attackPhase !== AttackPhase.Ready) return 'attack';
  return moving ? 'move' : 'idle';
}
