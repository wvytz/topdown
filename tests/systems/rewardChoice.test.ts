import { describe, expect, it } from 'vitest';
import { ItemId } from '@/core/lootTypes';
import { createRng } from '@/core/random';
import { BOSS_REWARD, ITEM_DEFINITIONS, ITEM_POOL } from '@/config/lootConfig';
import { rollItemChoices } from '@/systems/RewardChoice';

describe('rollItemChoices (karty nagrody za bossa)', () => {
  it('daje tyle kart, ile w konfiguracji, i wszystkie są różne', () => {
    for (let seed = 0; seed < 200; seed++) {
      const choices = rollItemChoices(ITEM_POOL, BOSS_REWARD.choices, createRng(seed));
      expect(choices).toHaveLength(BOSS_REWARD.choices);
      expect(new Set(choices).size).toBe(choices.length);
    }
  });

  it('jest deterministyczne dla tego samego seeda', () => {
    expect(rollItemChoices(ITEM_POOL, 3, createRng(42))).toEqual(rollItemChoices(ITEM_POOL, 3, createRng(42)));
  });

  it('mała pula: zwraca wszystkie dostępne, pusta pula: nic', () => {
    const small = [ITEM_DEFINITIONS[ItemId.Blade], ITEM_DEFINITIONS[ItemId.Heart]];
    expect(rollItemChoices(small, 3, createRng(1)).sort()).toEqual([ItemId.Blade, ItemId.Heart].sort());
    expect(rollItemChoices([], 3, createRng(1))).toEqual([]);
  });

  it('nie zmienia puli wejściowej', () => {
    const before = ITEM_POOL.map((i) => i.id);
    rollItemChoices(ITEM_POOL, 3, createRng(7));
    expect(ITEM_POOL.map((i) => i.id)).toEqual(before);
  });

  it('częstsze przedmioty pojawiają się na kartach częściej niż rzadkie', () => {
    const counts = new Map<ItemId, number>();
    for (let seed = 0; seed < 3000; seed++) {
      for (const id of rollItemChoices(ITEM_POOL, 3, createRng(seed))) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    // Ostrze (waga 10) wobec Szurikena (waga 3).
    expect(counts.get(ItemId.Blade) ?? 0).toBeGreaterThan(counts.get(ItemId.Shuriken) ?? 0);
    // Każdy przedmiot z puli czasem trafia na kartę.
    expect(counts.size).toBe(ITEM_POOL.length);
  });
});
