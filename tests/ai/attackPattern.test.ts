import { describe, expect, it } from 'vitest';
import { AttackPattern } from '@/ai/attackPattern';
import { BossAttackKind, PatternOrder } from '@/core/bossTypes';
import { createRng } from '@/core/random';
import { BOSS_BY_FLOOR, FLOOR_GUARDIAN } from '@/config/bossConfig';

const PATTERN = [BossAttackKind.Bloom, BossAttackKind.Flurry, BossAttackKind.CocoonThrow];
const take = (p: AttackPattern, n: number) => Array.from({ length: n }, () => p.next()!);

describe('Strażnik Piętra — wzmocnienie bossów', () => {
  it('skok w wzorze, szybszy chód i sprint wolniejszy od gracza', () => {
    expect(FLOOR_GUARDIAN.pattern).toContain(BossAttackKind.Leap);
    expect(FLOOR_GUARDIAN.moveSpeed).toBeGreaterThan(55);
    expect(FLOOR_GUARDIAN.sprint.speed).toBeLessThan(200);
  });
});

describe('AttackPattern — kolejność ataków bossa (krok 31)', () => {
  it('po kolei: wzór w kółko', () => {
    const p = new AttackPattern(PATTERN, PatternOrder.Fixed, createRng(1));
    expect(take(p, 6)).toEqual([...PATTERN, ...PATTERN]);
  });

  it('worek: każda runda zawiera każdy atak dokładnie raz', () => {
    for (let seed = 0; seed < 50; seed++) {
      const kinds = take(new AttackPattern(PATTERN, PatternOrder.Shuffled, createRng(seed)), 30);
      for (let r = 0; r < 10; r++) expect([...kinds.slice(r * 3, r * 3 + 3)].sort()).toEqual([...PATTERN].sort());
    }
  });

  it('worek: pierwszy atak walki to pierwszy ze wzoru, nigdy ten sam atak dwa razy z rzędu', () => {
    for (let seed = 0; seed < 50; seed++) {
      const kinds = take(new AttackPattern(PATTERN, PatternOrder.Shuffled, createRng(seed)), 30);
      expect(kinds[0]).toBe(PATTERN[0]);
      for (let i = 1; i < kinds.length; i++) expect(kinds[i]).not.toBe(kinds[i - 1]);
    }
  });

  it('worek: kolejność naprawdę się zmienia — pojawiają się wszystkie możliwe rundy', () => {
    const rounds = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      const kinds = take(new AttackPattern(PATTERN, PatternOrder.Shuffled, createRng(seed)), 30);
      for (let r = 1; r < 10; r++) rounds.add(kinds.slice(r * 3, r * 3 + 3).join());
    }
    expect(rounds.size).toBe(6);
  });

  it('worek: ten sam seed = ta sama kolejność (determinizm)', () => {
    const a = take(new AttackPattern(PATTERN, PatternOrder.Shuffled, createRng(7)), 20);
    const b = take(new AttackPattern(PATTERN, PatternOrder.Shuffled, createRng(7)), 20);
    expect(a).toEqual(b);
  });

  it('pusty wzór: brak ataku; jeden atak: powtarza się', () => {
    expect(new AttackPattern([], PatternOrder.Shuffled, createRng(1)).next()).toBeNull();
    expect(take(new AttackPattern([BossAttackKind.Slam], PatternOrder.Shuffled, createRng(1)), 3)).toEqual([
      BossAttackKind.Slam, BossAttackKind.Slam, BossAttackKind.Slam,
    ]);
  });

  it('wszyscy bossowie mają lekko losową kolejność', () => {
    for (const boss of [FLOOR_GUARDIAN, ...Object.values(BOSS_BY_FLOOR)]) expect(boss.patternOrder).toBe(PatternOrder.Shuffled);
  });
});
