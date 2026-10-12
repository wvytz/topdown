/** Deterministyczny generator liczb losowych (mulberry32) — ten sam seed = to samo piętro. */
export interface Rng {
  /** Liczba z zakresu [0, 1). */
  next(): number;
  /** Liczba całkowita z zakresu [min, max] (obustronnie domknięty). */
  int(min: number, max: number): number;
  chance(probability: number): boolean;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
  };
}

/** Miesza seed runu z numerem piętra, żeby każde piętro było inne, ale powtarzalne. */
export function deriveSeed(baseSeed: number, salt: number): number {
  return (Math.imul(baseSeed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(salt, 0xc2b2ae35)) >>> 0;
}
