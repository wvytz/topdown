import type { EnemyAttackDefinition, EnemyVariant } from '@/core/combatTypes';
import { EnemyAttackKind, EnemyType } from '@/core/combatTypes';
import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { RoomKind } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import type { EnemyVariantDefinition } from '@/systems/EnemyVariants';

/** Nawała (krok 175): fale kruchych stworków budzone pierwszym wejściem do pokoju. Liczby w `config/hordeConfig.ts`. */
export interface HordeConfig {
  readonly roomChanceByFloor: readonly number[];
  readonly wavesByFloor: readonly number[];
  readonly perWave: { readonly base: number; readonly perFloor: number; readonly max: number };
  readonly coopExtraPerWave: number;
  readonly firstWaveDelayMs: number;
  readonly nextWhenAliveAtMost: number;
  readonly nextWaveAfterMs: number;
  readonly telegraphMs: number;
  readonly riseMs: number;
  readonly minPlayerDistanceTiles: number;
  readonly entryMarginTiles: number;
  readonly maxAliveEnemies: number;
}

/** Plan nawały jednego pokoju: liczebność kolejnych fal. */
export interface HordeRoomPlan {
  readonly roomId: number;
  readonly waves: readonly number[];
}

function byFloor(table: readonly number[], floor: number): number {
  return table[Math.min(Math.max(0, floor - 1), table.length - 1)] ?? 0;
}

/** Liczebność fali na piętrze (bez co-opu). */
export function hordeWaveSize(config: HordeConfig, floor: number): number {
  const { base, perFloor, max } = config.perWave;
  return Math.min(max, Math.round(base + perFloor * Math.max(0, floor - 1)));
}

/**
 * Pokoje z nawałą: tylko zwykłe (bez startu, areny, zasadzki i ukrytej komnaty), z szansą wg piętra.
 * Własny strumień RNG — reszta planowania piętra bez zmian.
 */
export function planHordeRooms(floor: Pick<DungeonFloor, 'rooms'>, floorNumber: number, config: HordeConfig, coop: boolean, rng: Rng): HordeRoomPlan[] {
  const chance = byFloor(config.roomChanceByFloor, floorNumber);
  const waveCount = byFloor(config.wavesByFloor, floorNumber);
  const size = hordeWaveSize(config, floorNumber) + (coop ? config.coopExtraPerWave : 0);
  const plans: HordeRoomPlan[] = [];
  for (const room of floor.rooms) {
    if (room.kind !== RoomKind.Normal) continue;
    if (!rng.chance(chance)) continue;
    plans.push({ roomId: room.id, waves: Array.from({ length: waveCount }, () => size) });
  }
  return plans;
}

/** Czy bohater stoi w głębi pokoju (co najmniej `margin` kafli od muru) — próg drzwi nie budzi nawały. */
export function isInsideRoom(room: Room, tile: TilePoint, margin: number): boolean {
  return tile.x >= room.x + margin && tile.x < room.x + room.width - margin && tile.y >= room.y + margin && tile.y < room.y + room.height - margin;
}

export enum HordePhase {
  Dormant = 'dormant',
  Active = 'active',
  Done = 'done',
}

/**
 * Stan nawały jednego pokoju. Śpi do wejścia bohatera; potem fala za falą: pierwsza po `firstWaveDelayMs`,
 * kolejna, gdy z poprzednich żyje najwyżej `nextWhenAliveAtMost` albo minęło `nextWaveAfterMs`. Czas jawnie (`now`, ms).
 */
export class HordeRoomState {
  private phase = HordePhase.Dormant;
  private nextWave = 0;
  private nextAt = Infinity;

  constructor(
    readonly plan: HordeRoomPlan,
    private readonly config: Pick<HordeConfig, 'firstWaveDelayMs' | 'nextWhenAliveAtMost' | 'nextWaveAfterMs'>,
  ) {}

  get currentPhase(): HordePhase {
    return this.phase;
  }

  /** Wszystkie fale wypuszczone (pokój może jeszcze mieć żywych). */
  get exhausted(): boolean {
    return this.nextWave >= this.plan.waves.length;
  }

  /** Bohater wszedł do pokoju — budzi nawałę (raz). */
  wake(now: number): void {
    if (this.phase !== HordePhase.Dormant) return;
    this.phase = HordePhase.Active;
    this.nextAt = now + this.config.firstWaveDelayMs;
  }

  /**
   * Klatka gry: zwraca liczebność fali do wypuszczenia teraz (0 = nic). `alive` — żywe stworki tego pokoju
   * (także te, które dopiero wychodzą). Po ostatniej fali i wybiciu wszystkich — `Done`.
   */
  update(now: number, alive: number): number {
    if (this.phase !== HordePhase.Active) return 0;
    if (this.exhausted) {
      if (alive === 0) this.phase = HordePhase.Done;
      return 0;
    }
    // Pierwsza fala po opóźnieniu; kolejne po czasie albo wcześniej, gdy poprzednie prawie wybite.
    const cleared = this.nextWave > 0 && alive <= this.config.nextWhenAliveAtMost;
    if (now < this.nextAt && !cleared) return 0;
    const size = this.plan.waves[this.nextWave] ?? 0;
    this.nextWave++;
    this.nextAt = now + this.config.nextWaveAfterMs;
    return size;
  }
}

/** Ile stworków wypuścić, by nie przekroczyć sufitu żywych wrogów piętra. */
export function hordeRoomForSpawn(wanted: number, aliveEnemies: number, maxAlive: number): number {
  return Math.max(0, Math.min(wanted, maxAlive - aliveEnemies));
}

/**
 * Stworek nawały w biomie: ten sam, którego wypluwa gniazdo biomu (atak wylęgu wariantu Gniazdownika).
 * Wariant gniazda bez wylęgu (błąd konfiguracji) — stworek domyślnego gniazda.
 */
export function hordeMinionVariant(
  biomeVariants: Readonly<Record<EnemyType, EnemyVariant>>,
  variants: Readonly<Record<EnemyVariant, EnemyVariantDefinition>>,
  fallback: EnemyAttackDefinition | undefined,
): EnemyVariant | null {
  const attack = variants[biomeVariants[EnemyType.Nester]]?.attack ?? fallback;
  return attack?.kind === EnemyAttackKind.Brood ? attack.minion : null;
}
