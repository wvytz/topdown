import { describe, expect, it } from 'vitest';
import type { TilePoint } from '@/core/dungeonTypes';
import { PlayerContainment } from '@/systems/PlayerContainment';

const TILE = 32;

/** Korytarz za kratą: kafle o y ≥ 5 są niedozwolone (krata na y = 5, dalej poza zamkniętą areną). */
const insideArena = (tile: TilePoint): boolean => tile.y < 5;

describe('PlayerContainment', () => {
  it('na dozwolonym kafelku nie cofa gracza', () => {
    const containment = new PlayerContainment(TILE, insideArena);
    expect(containment.update({ x: 100, y: 100 })).toBeNull();
  });

  it('gracz przepchnięty przez kratę wraca na ostatnie dozwolone miejsce', () => {
    const containment = new PlayerContainment(TILE, insideArena);
    containment.update({ x: 100, y: 100 });
    containment.update({ x: 104, y: 150 });
    // Dash + szarża bossa: w jednej klatce środek gracza ląduje w korytarzu za kratą.
    expect(containment.update({ x: 106, y: 200 })).toEqual({ x: 104, y: 150 });
    // Po cofnięciu fizyka trzyma gracza w środku, a punkt odniesienia się nie zmienia.
    expect(containment.update({ x: 106, y: 230 })).toEqual({ x: 104, y: 150 });
  });

  it('bez znanego dozwolonego miejsca niczego nie zgaduje', () => {
    const containment = new PlayerContainment(TILE, insideArena);
    expect(containment.update({ x: 100, y: 200 })).toBeNull();
  });

  it('reguła dozwolonych kafli może się zmienić w trakcie (kraty opadają)', () => {
    let sealed = false;
    const containment = new PlayerContainment(TILE, (tile) => !sealed || insideArena(tile));
    expect(containment.update({ x: 100, y: 200 })).toBeNull();
    containment.update({ x: 100, y: 120 });
    sealed = true;
    expect(containment.update({ x: 100, y: 170 })).toEqual({ x: 100, y: 120 });
  });
});
