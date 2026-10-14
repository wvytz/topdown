import { describe, expect, it } from 'vitest';
import { AttackPhase } from '@/core/combatTypes';
import { PLAYER_COMBAT } from '@/config/combatConfig';
import { AttackCycle } from '@/systems/AttackCycle';
import { playerAnimationState } from '@/systems/PlayerAnimation';

describe('playerAnimationState — animacja bohatera', () => {
  it('bez ataku: chód w ruchu, stanie w miejscu', () => {
    expect(playerAnimationState(AttackPhase.Ready, true)).toBe('move');
    expect(playerAnimationState(AttackPhase.Ready, false)).toBe('idle');
  });

  it('cios ma pierwszeństwo przed chodem przez cały cykl ataku', () => {
    expect(playerAnimationState(AttackPhase.Windup, true)).toBe('attack');
    expect(playerAnimationState(AttackPhase.Recovery, true)).toBe('attack');
    expect(playerAnimationState(AttackPhase.Recovery, false)).toBe('attack');
  });

  it('animacja ciosu trwa dokładnie attackCooldownMs (cykl gracza bez zamachu)', () => {
    const cycle = new AttackCycle(0, PLAYER_COMBAT.attackCooldownMs);
    cycle.tryStart(1000);
    expect(cycle.consumeRelease(1000)).toBe(true); // trafienie w pierwszej klatce animacji
    expect(playerAnimationState(cycle.phase(1000 + PLAYER_COMBAT.attackCooldownMs - 1), false)).toBe('attack');
    expect(playerAnimationState(cycle.phase(1000 + PLAYER_COMBAT.attackCooldownMs), false)).toBe('idle');
  });
});
