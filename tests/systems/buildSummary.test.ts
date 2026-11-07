import { describe, expect, it } from 'vitest';
import { ItemId } from '@/core/lootTypes';
import { ITEM_DEFINITIONS, ITEM_EFFECTS } from '@/config/lootConfig';
import { summarizeBuild } from '@/systems/BuildSummary';

const summary = (items: ItemId[]) => summarizeBuild(items, ITEM_DEFINITIONS, ITEM_EFFECTS.evolution);

describe('summarizeBuild (krok 162)', () => {
  it('pusto bez przedmiotów', () => {
    expect(summary([])).toEqual([]);
  });

  it('liczy kopie w kolejności pierwszego zdobycia', () => {
    const rows = summary([ItemId.Heart, ItemId.Blade, ItemId.Heart]);
    expect(rows.map((r) => r.id)).toEqual([ItemId.Heart, ItemId.Blade]);
    expect(rows[0]!.title).toContain('×2');
    expect(rows[1]!.title).toContain('×1');
  });

  it('przed przemianą mówi, ile brakuje i w co się zmieni', () => {
    const [row] = summary([ItemId.Blade]);
    expect(row!.evolved).toBe(false);
    expect(row!.detail).toContain('jeszcze 2 do przemiany');
    expect(row!.detail).toContain(ITEM_EFFECTS.evolution.items[ItemId.Blade]!.name);
  });

  it('po przemianie pokazuje nową mechanikę', () => {
    const [row] = summary([ItemId.Blade, ItemId.Blade, ItemId.Blade]);
    const evolution = ITEM_EFFECTS.evolution.items[ItemId.Blade]!;
    expect(row!.evolved).toBe(true);
    expect(row!.title).toContain(evolution.name);
    expect(row!.detail).toContain(evolution.effect);
  });

  it('przedmiot z limitem kopii mówi o limicie, efekt broni nie ma „za kopię”', () => {
    const [gloves] = summary([ItemId.Gloves, ItemId.Gloves, ItemId.Gloves]);
    expect(gloves!.detail).toContain('limit kopii');
    const [fist] = summary([ItemId.FireFist]);
    expect(fist!.detail).not.toContain('za kopię');
  });
});
