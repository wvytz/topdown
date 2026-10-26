import { describe, expect, it } from 'vitest';
import { leashAxis, leashPair, leashSpan, partyFocus } from '@/systems/CoopCamera';

describe('CoopCamera (co-op, etap C2: wspólny ekran ze smyczą)', () => {
  it('kamera patrzy na środek między bohaterami; solo — na bohatera', () => {
    expect(partyFocus([{ x: 10, y: 20 }])).toEqual({ x: 10, y: 20 });
    expect(partyFocus([{ x: 0, y: 0 }, { x: 100, y: 50 }])).toEqual({ x: 50, y: 25 });
    expect(partyFocus([])).toBeNull();
  });

  it('w zasięgu smyczy ruch zostaje bez zmian', () => {
    expect(leashAxis([0, 100], [10, 150], 200)).toEqual([10, 150]);
  });

  it('nadmiar cofa ten, kto się oddala — partner stoi w miejscu', () => {
    // b idzie w prawo poza smycz (200); a stoi.
    expect(leashAxis([0, 200], [0, 210], 200)).toEqual([0, 200]);
    // a idzie w lewo poza smycz.
    expect(leashAxis([0, 200], [-15, 200], 200)).toEqual([0, 200]);
  });

  it('obaj się oddalają — każdy cofa swoją część', () => {
    const [a, b] = leashAxis([0, 200], [-10, 230], 200);
    expect(b - a).toBeCloseTo(200);
    expect(a).toBeCloseTo(-10 + 40 * (10 / 40));
    expect(b).toBeCloseTo(230 - 40 * (30 / 40));
  });

  it('bohater idący do partnera nie jest cofany, nawet gdy partner ucieka', () => {
    // a idzie w prawo (do b), b ucieka dalej w prawo szybciej.
    const [a, b] = leashAxis([0, 200], [5, 220], 200);
    expect(a).toBe(5);
    expect(b).toBe(205);
  });

  it('nikt się nie oddalał (odrzut) — odstęp wraca po równo', () => {
    const [a, b] = leashAxis([0, 220], [0, 220], 200);
    expect([a, b]).toEqual([10, 210]);
  });

  it('obie osie osobno', () => {
    const [p, q] = leashPair([{ x: 0, y: 0 }, { x: 100, y: 70 }], [{ x: 0, y: 0 }, { x: 130, y: 90 }], { x: 120, y: 80 });
    expect(p).toEqual({ x: 0, y: 0 });
    expect(q).toEqual({ x: 120, y: 80 });
  });

  it('zasięg smyczy to widok minus zapas z obu stron', () => {
    expect(leashSpan({ x: 480, y: 270 }, { x: 48, y: 40 })).toEqual({ x: 384, y: 190 });
    expect(leashSpan({ x: 50, y: 50 }, { x: 48, y: 40 })).toEqual({ x: 0, y: 0 });
  });
});
