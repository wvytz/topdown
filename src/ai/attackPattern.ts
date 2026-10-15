import type { BossAttackKind } from '@/core/bossTypes';
import { PatternOrder } from '@/core/bossTypes';
import type { Rng } from '@/core/random';

/**
 * Kolejka ataków ze wzoru bossa (krok 31). Po kolei albo „worek”: każda runda to wzór przetasowany
 * losowo, bez powtórzenia ataku na styku rund; pierwszy atak walki = pierwszy ze wzoru.
 */
export class AttackPattern {
  private queue: BossAttackKind[] = [];
  private last: BossAttackKind | null = null;
  private index = 0;

  constructor(
    private readonly pattern: readonly BossAttackKind[],
    private readonly order: PatternOrder,
    private readonly rng: Rng,
  ) {}

  /** Następny atak; null przy pustym wzorze. */
  next(): BossAttackKind | null {
    if (this.pattern.length === 0) return null;
    if (this.order === PatternOrder.Fixed) {
      const kind = this.pattern[this.index % this.pattern.length]!;
      this.index++;
      return kind;
    }
    if (this.queue.length === 0) this.queue = this.round();
    const kind = this.queue.shift()!;
    this.last = kind;
    return kind;
  }

  private round(): BossAttackKind[] {
    const kinds = [...this.pattern];
    // Pierwsza runda zaczyna się od podpisu bossa (pierwszy atak wzoru); tasujemy resztę.
    const fixedHead = this.last === null ? 1 : 0;
    for (let i = kinds.length - 1; i > fixedHead; i--) {
      const j = this.rng.int(fixedHead, i);
      [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
    }
    // Bez tego samego ataku dwa razy z rzędu na styku rund: zamiana z losowym dalszym.
    if (kinds.length > 1 && kinds[0] === this.last) {
      const j = this.rng.int(1, kinds.length - 1);
      [kinds[0], kinds[j]] = [kinds[j]!, kinds[0]!];
    }
    return kinds;
  }
}
