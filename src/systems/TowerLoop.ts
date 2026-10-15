/** Pętla wieży (krok 43): krąg i piętro w kręgu z numeru piętra; czysta arytmetyka. */

export interface TowerLoopConfig {
  readonly floorsPerLoop: number;
  readonly eliteAffixesFirstLoop: number;
  readonly eliteAffixesPerLoop: number;
  readonly eliteMaxAffixes: number;
}

/** Numer kręgu od 0 (piętra 1–6 → 0, 7–12 → 1 …). */
export function towerLoop(floor: number, config: Pick<TowerLoopConfig, 'floorsPerLoop'>): number {
  return Math.floor((Math.max(1, floor) - 1) / config.floorsPerLoop);
}

/** Piętro w kręgu (1..floorsPerLoop) — wybiera biom i bossa. */
export function floorInLoop(floor: number, config: Pick<TowerLoopConfig, 'floorsPerLoop'>): number {
  return ((Math.max(1, floor) - 1) % config.floorsPerLoop) + 1;
}

/** Liczba cech elity na piętrze: więcej w kolejnych kręgach, z limitem. */
export function eliteAffixCount(floor: number, config: TowerLoopConfig): number {
  const count = config.eliteAffixesFirstLoop + towerLoop(floor, config) * config.eliteAffixesPerLoop;
  return Math.min(config.eliteMaxAffixes, count);
}

const ROMAN: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** Liczba rzymska (krąg w HUD: „Krąg II”). */
export function toRoman(value: number): string {
  let rest = Math.max(0, Math.floor(value));
  let out = '';
  for (const [n, sym] of ROMAN) {
    while (rest >= n) {
      out += sym;
      rest -= n;
    }
  }
  return out;
}

/** Napis piętra w HUD: w pierwszym kręgu samo piętro, potem z kręgiem. */
export function floorLabel(floor: number, config: Pick<TowerLoopConfig, 'floorsPerLoop'>): string {
  const loop = towerLoop(floor, config);
  return loop === 0 ? `Piętro ${floor}` : `Piętro ${floor} · Krąg ${toRoman(loop + 1)}`;
}
