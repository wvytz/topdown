import { describe, expect, it } from 'vitest';
import { edgePointer } from '@/systems/OffscreenPointer';

describe('wskaźnik bossa poza kadrem (krok 136)', () => {
  it('cel w kadrze — bez wskaźnika', () => {
    expect(edgePointer({ x: 480, y: 270 }, 960, 540, 20, 10)).toBeNull();
    expect(edgePointer({ x: 15, y: 530 }, 960, 540, 20, 10)).toBeNull();
  });

  it('cel przy samym brzegu albo za nim — wskaźnik przy krawędzi, w stronę celu', () => {
    const right = edgePointer({ x: 1400, y: 270 }, 960, 540, 20, 10)!;
    expect(right).toMatchObject({ x: 940, y: 270, angle: 0 });
    const edge = edgePointer({ x: 955, y: 270 }, 960, 540, 20, 10);
    expect(edge?.x).toBe(940);
    const up = edgePointer({ x: 480, y: -100 }, 960, 540, 20, 10)!;
    expect(up.x).toBe(480);
    expect(up.y).toBe(20);
    expect(up.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('cel po skosie — punkt na tej krawędzi, którą promień przecina pierwszy', () => {
    const p = edgePointer({ x: 480 + 1000, y: 270 + 1000 }, 960, 540, 20, 10)!;
    expect(p.y).toBe(520);
    expect(p.x).toBe(730);
    expect(p.angle).toBeCloseTo(Math.PI / 4);
  });
});
