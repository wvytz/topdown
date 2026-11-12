import { AmbushVariant } from '@/systems/AmbushVariants';

/**
 * Start runu z adresu (krok 41g): `?floor=6` i `?seed=3` zaczynają run od danego piętra / seeda, `?boss=1` — w arenie bossa.
 * Działa też na Pages, ale taki run jest testowy — jego wynik nie trafia na żadną tablicę.
 */
export interface StartOverrides {
  readonly runSeed?: number;
  readonly floor?: number;
  /** `?boss=1`: gracz startuje w arenie bossa piętra. */
  readonly atBoss?: boolean;
  /** `?vault=1` (krok U4f): na piętrach z ukrytą komnatą (Grzybnia) gracz startuje w skarbcu pająków. */
  readonly atVault?: boolean;
  /** `?ambush=storm|flight|haunt` (krok 183): zasadzka na każdym piętrze, w tej wersji. */
  readonly ambush?: AmbushVariant;
  /** true, gdy adres zmienił piętro albo seed — wynik runu nie jest zapisywany. */
  readonly practice: boolean;
}

export function parseStartOverrides(search: string): StartOverrides {
  const params = new URLSearchParams(search);
  const seed = Number(params.get('seed'));
  const floor = Number(params.get('floor'));
  const runSeed = params.has('seed') && params.get('seed') !== '' && Number.isInteger(seed) ? seed >>> 0 : undefined;
  const startFloor = params.has('floor') && Number.isInteger(floor) && floor >= 1 ? floor : undefined;
  const atBoss = params.get('boss') === '1';
  const atVault = params.get('vault') === '1';
  const ambush = Object.values(AmbushVariant).find((v) => v === params.get('ambush'));
  return {
    ...(atBoss ? { atBoss } : {}),
    ...(atVault ? { atVault } : {}),
    ...(runSeed !== undefined ? { runSeed } : {}),
    ...(startFloor !== undefined ? { floor: startFloor } : {}),
    ...(ambush ? { ambush } : {}),
    practice: atBoss || atVault || ambush !== undefined || runSeed !== undefined || (startFloor !== undefined && startFloor > 1),
  };
}
