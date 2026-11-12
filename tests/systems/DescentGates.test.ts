import { describe, expect, it } from 'vitest';
import { DESCENT_CONFIG, DESCENT_GATES, DESCENT_ROUTE_SALT, MERCHANT_CONFIG } from '@/config/descentConfig';
import { ITEM_POOL } from '@/config/lootConfig';
import { GateReward } from '@/core/lootTypes';
import { createRng } from '@/core/random';
import { descentRoute } from '@/systems/Descent';
import {
  EmberTally,
  descentPathFor,
  descentStep,
  gateCandidates,
  gateEmbersMultiplier,
  gateGoldMultiplier,
  merchantHere,
  rollMerchantStock,
} from '@/systems/DescentGates';

/** Przejście całego Zejścia: na każdych bramach bierze lewą albo prawą wg `choose`. */
function walk(seed: number, choose: (depth: number) => 0 | 1): number[] {
  const path = [DESCENT_CONFIG.firstFloor];
  for (;;) {
    const step = descentStep(seed, path, DESCENT_CONFIG, DESCENT_GATES);
    if (step.kind === 'end') return path;
    path.push(step.kind === 'final' ? step.floor : step.options[choose(path.length)].floor);
  }
}

describe('bramy Zejścia (krok Z4)', () => {
  it('każda droga ma pełną długość, rośnie i kończy się na Dnie', () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const choose of [() => 0 as const, () => 1 as const, (d: number) => (d % 2) as 0 | 1]) {
        const path = walk(seed, choose);
        expect(path).toHaveLength(DESCENT_CONFIG.floors);
        expect(path[0]).toBe(DESCENT_CONFIG.firstFloor);
        expect(path.at(-1)).toBe(DESCENT_CONFIG.lastFloor);
        expect(new Set(path).size).toBe(path.length);
        expect([...path].sort((a, b) => a - b)).toEqual(path);
      }
    }
  });

  it('dwa runy z tego samego seeda mogą pójść różnymi drogami', () => {
    const distinct = Array.from({ length: 50 }, (_, seed) => walk(seed, () => 0).join() !== walk(seed, () => 1).join());
    expect(distinct.some(Boolean)).toBe(true);
  });

  it('bramy mają dwie różne nagrody i nie dublują stałego kupca', () => {
    for (let seed = 0; seed < 200; seed++) {
      const step = descentStep(seed, [1], DESCENT_CONFIG, DESCENT_GATES);
      expect(step.kind).toBe('gates');
      if (step.kind !== 'gates') continue;
      expect(step.options[0].reward).not.toBe(step.options[1].reward);
      const toMerchantDepth = descentStep(seed, [1, 2], DESCENT_CONFIG, DESCENT_GATES);
      if (toMerchantDepth.kind === 'gates') for (const option of toMerchantDepth.options) expect(option.reward).not.toBe(GateReward.Merchant);
    }
  });

  it('bramy są deterministyczne, a ostatnie zejście nie ma wyboru', () => {
    expect(descentStep(5, [1, 2], DESCENT_CONFIG, DESCENT_GATES)).toEqual(descentStep(5, [1, 2], DESCENT_CONFIG, DESCENT_GATES));
    expect(descentStep(5, [1, 2, 3, 4, 5], DESCENT_CONFIG, DESCENT_GATES)).toEqual({ kind: 'final', floor: DESCENT_CONFIG.lastFloor });
    expect(descentStep(5, [1, 2, 3, 4, 5, 7], DESCENT_CONFIG, DESCENT_GATES)).toEqual({ kind: 'end' });
    expect(gateCandidates([1], DESCENT_CONFIG)).toEqual([2, 3]);
  });

  it('droga z zapisu albo — dla starego zapisu — z trasy seeda', () => {
    expect(descentPathFor([1, 3], 3, 9, DESCENT_CONFIG, DESCENT_ROUTE_SALT)).toEqual([1, 3]);
    const route = descentRoute(9, DESCENT_CONFIG, DESCENT_ROUTE_SALT);
    expect(descentPathFor(undefined, route[2]!, 9, DESCENT_CONFIG, DESCENT_ROUTE_SALT)).toEqual(route.slice(0, 3));
    expect(descentPathFor([1, 2], 4, 9, DESCENT_CONFIG, DESCENT_ROUTE_SALT).at(-1)).toBe(4);
  });

  it('nagrody: mnożniki Żaru i złota, kupiec na stałych głębiach i za bramą', () => {
    expect(gateEmbersMultiplier(GateReward.Embers, DESCENT_GATES)).toBe(DESCENT_GATES.embersMultiplier);
    expect(gateEmbersMultiplier(undefined, DESCENT_GATES)).toBe(1);
    expect(gateGoldMultiplier(GateReward.Gold, DESCENT_GATES)).toBe(DESCENT_GATES.goldMultiplier);
    expect(gateGoldMultiplier(GateReward.Embers, DESCENT_GATES)).toBe(1);
    expect(merchantHere(3, undefined, DESCENT_GATES)).toBe(true);
    expect(merchantHere(2, GateReward.Merchant, DESCENT_GATES)).toBe(true);
    expect(merchantHere(2, GateReward.Gold, DESCENT_GATES)).toBe(false);
  });

  it('Żar z ułamkowym mnożnikiem nie gubi reszty', () => {
    const tally = new EmberTally(1.5);
    expect([1, 1, 1, 1].map((amount) => tally.award(amount)).reduce((a, b) => a + b, 0)).toBe(6);
  });
});

describe('kupiec Zejścia (krok Z4)', () => {
  it('ma dwa różne przedmioty i leczenie, a ceny rosną z głębią', () => {
    const shallow = rollMerchantStock(ITEM_POOL, 1, createRng(3), MERCHANT_CONFIG);
    const deep = rollMerchantStock(ITEM_POOL, 5, createRng(3), MERCHANT_CONFIG);
    const items = shallow.filter((offer) => offer.kind === 'item');
    expect(items).toHaveLength(MERCHANT_CONFIG.items);
    expect(new Set(items.map((offer) => offer.kind === 'item' && offer.item)).size).toBe(items.length);
    expect(shallow.at(-1)?.kind).toBe('heal');
    expect(deep[0]!.price).toBeGreaterThan(shallow[0]!.price);
    expect(deep.at(-1)!.price).toBeGreaterThan(shallow.at(-1)!.price);
  });

  it('pusta pula — samo leczenie', () => {
    expect(rollMerchantStock([], 2, createRng(1), MERCHANT_CONFIG).map((offer) => offer.kind)).toEqual(['heal']);
  });
});
