import { AmbushVariant } from '@/systems/AmbushVariants';
import { RoomEventKind } from '@/systems/RoomEvents';

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
  /** `?event=torch|purse|dark` (krok U8a): każdy pokój z nawałą dostaje to wydarzenie. */
  readonly roomEvent?: RoomEventKind;
  /** `?chest=1` (krok U8b): przeklęta skrzynia na każdym piętrze. */
  readonly cursedChest?: boolean;
  /** true, gdy adres zmienił piętro, seed albo zasady (np. `?wagi=`) — wynik runu nie jest zapisywany. */
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
  const roomEvent = Object.values(RoomEventKind).find((v) => v === params.get('event'));
  const cursedChest = params.get('chest') === '1';
  // Krok 188: `?wagi=0|1` przełącza system wag (krok U11a) — taki run zmienia zasady walki, więc jest testowy.
  const weightsOverride = params.has('wagi');
  return {
    ...(atBoss ? { atBoss } : {}),
    ...(atVault ? { atVault } : {}),
    ...(runSeed !== undefined ? { runSeed } : {}),
    ...(startFloor !== undefined ? { floor: startFloor } : {}),
    ...(ambush ? { ambush } : {}),
    ...(roomEvent ? { roomEvent } : {}),
    ...(cursedChest ? { cursedChest } : {}),
    practice: atBoss || atVault || weightsOverride || ambush !== undefined || roomEvent !== undefined || cursedChest || runSeed !== undefined || (startFloor !== undefined && startFloor > 1),
  };
}
