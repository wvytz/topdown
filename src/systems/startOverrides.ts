/**
 * Start runu z adresu (krok 41g): `?floor=6` i `?seed=3` zaczynają run od danego piętra / seeda.
 * Działa też na Pages, ale taki run jest testowy — jego wynik nie trafia na żadną tablicę.
 */
export interface StartOverrides {
  readonly runSeed?: number;
  readonly floor?: number;
  /** true, gdy adres zmienił piętro albo seed — wynik runu nie jest zapisywany. */
  readonly practice: boolean;
}

export function parseStartOverrides(search: string): StartOverrides {
  const params = new URLSearchParams(search);
  const seed = Number(params.get('seed'));
  const floor = Number(params.get('floor'));
  const runSeed = params.has('seed') && params.get('seed') !== '' && Number.isInteger(seed) ? seed >>> 0 : undefined;
  const startFloor = params.has('floor') && Number.isInteger(floor) && floor >= 1 ? floor : undefined;
  return {
    ...(runSeed !== undefined ? { runSeed } : {}),
    ...(startFloor !== undefined ? { floor: startFloor } : {}),
    practice: runSeed !== undefined || (startFloor !== undefined && startFloor > 1),
  };
}
