import { describe, expect, it } from 'vitest';
import { HeroId } from '@/core/heroTypes';
import { ItemId } from '@/core/lootTypes';
import { HERO_DEFINITIONS } from '@/config/heroConfig';
import { ITEM_DEFINITIONS, ITEM_EFFECTS, ITEM_POOL, STAT_LIMITS } from '@/config/lootConfig';
import { usefulItemPool } from '@/systems/ItemUsefulness';

const many = (id: ItemId, n: number): ItemId[] => Array.from({ length: n }, () => id);
const pool = (hero: HeroId, owned: ItemId[]) =>
  usefulItemPool(ITEM_POOL, HERO_DEFINITIONS[hero], owned, ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS).map((item) => item.id);

describe('usefulItemPool (krok 117)', () => {
  it('bez przedmiotów każdy przedmiot coś daje', () => {
    for (const hero of Object.values(HeroId)) expect(pool(hero, [])).toHaveLength(ITEM_POOL.length);
  });

  it('Buty, Klepsydra i Rękawice na limicie znikają z puli', () => {
    const owned = [...many(ItemId.Boots, 6), ...many(ItemId.Hourglass, 3), ...many(ItemId.Gloves, 5)];
    const ids = pool(HeroId.Barbarian, owned);
    expect(ids).not.toContain(ItemId.Boots);
    expect(ids).not.toContain(ItemId.Hourglass);
    expect(ids).not.toContain(ItemId.Gloves);
    expect(ids).toContain(ItemId.Blade);
    expect(ids).toContain(ItemId.Heart);
  });

  it('o jedną kopię przed limitem przedmiot jeszcze wypada (krok 150: Buty — limit 3 kopie)', () => {
    expect(pool(HeroId.Barbarian, many(ItemId.Boots, 2))).toContain(ItemId.Boots);
    expect(pool(HeroId.Barbarian, many(ItemId.Boots, 3))).not.toContain(ItemId.Boots);
  });

  it('krok 150: przedmioty bez limitu (Ostrze, Serce, Iskrownik) wypadają też po przemianie', () => {
    const evolved = pool(HeroId.Barbarian, [...many(ItemId.Blade, 3), ...many(ItemId.Heart, 3), ...many(ItemId.ElectricArrow, 3)]);
    expect(evolved).toEqual(expect.arrayContaining([ItemId.Blade, ItemId.Heart, ItemId.ElectricArrow]));
  });

  it('efekt bez dalszego przyrostu (kieł po 3 kopiach) też znika', () => {
    expect(pool(HeroId.Barbarian, many(ItemId.VampireFang, 2))).toContain(ItemId.VampireFang);
    expect(pool(HeroId.Barbarian, many(ItemId.VampireFang, 3))).not.toContain(ItemId.VampireFang);
  });
});
