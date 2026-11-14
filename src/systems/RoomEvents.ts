import type { Room } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import type { Vector2 } from '@/core/types';

/**
 * Wydarzenia w pokojach (krok U8a): co któryś pokój z nawałą dostaje jedną regułę zbudowaną z klocków,
 * które już są (nawała, mrok zasadzki, złoto). Liczby w `config/roomEventConfig.ts`.
 */
export enum RoomEventKind {
  /** „Zabij, zanim zgaśnie pochodnia”: wybity przed zgaśnięciem — złoto; zgasła — mrok do końca walki. */
  Torch = 'torch',
  /** „Złoto ucieka”: sakiewka na nóżkach umyka; złapana pęka złotem. */
  Purse = 'purse',
  /** „Ciemny pokój”: walka w mroku, za wybicie — złoto. */
  Dark = 'dark',
}

export interface GoldReward {
  readonly base: number;
  readonly perFloor: number;
}

export interface RoomEventConfig {
  readonly enabled: boolean;
  readonly kinds: readonly RoomEventKind[];
  readonly countByFloor: readonly number[];
  readonly chance: number;
  readonly torch: {
    readonly baseMs: number;
    readonly perWaveMs: number;
    readonly reward: GoldReward;
    readonly burnoutDread: number;
    readonly warnFraction: number;
    readonly lightRadius: { readonly full: number; readonly end: number };
  };
  readonly purse: {
    readonly lifetimeMs: number;
    readonly speed: number;
    readonly panicRadius: number;
    readonly wanderSpeed: number;
    readonly catchRadius: number;
    readonly wallMargin: number;
    readonly spawnDelayMs: number;
    readonly reward: GoldReward;
  };
  readonly dark: {
    readonly dread: number;
    readonly fadeMs: number;
    readonly reward: GoldReward;
  };
}

/** Wydarzenie jednego pokoju (pokój z nawałą). */
export interface RoomEventPlan {
  readonly roomId: number;
  readonly kind: RoomEventKind;
  /** Liczba fal nawały w tym pokoju — czas pochodni. */
  readonly waves: number;
}

function byFloor(table: readonly number[], floor: number): number {
  return table[Math.min(Math.max(0, floor - 1), table.length - 1)] ?? 0;
}

/** Złoto nagrody na piętrze. */
export function eventGold(reward: GoldReward, floor: number): number {
  return Math.max(1, Math.round(reward.base + reward.perFloor * Math.max(0, floor - 1)));
}

/** Tasowanie Fishera–Yatesa na kopii (deterministyczne z `rng`). */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Wydarzenia piętra: spośród pokojów z nawałą najwyżej `countByFloor` (co najmniej jeden pokój nawały zostaje
 * zwykły), każde z szansą `chance`; rodzaje bez powtórzeń, dopóki starczy puli. `forced` (`?event=`) — każdy
 * pokój nawały dostaje ten rodzaj. Własny strumień RNG — reszta planu piętra bez zmian.
 */
export function planRoomEvents(
  hordeRooms: readonly { readonly roomId: number; readonly waves: readonly number[] }[],
  floorNumber: number,
  config: RoomEventConfig,
  rng: Rng,
  forced: RoomEventKind | null = null,
): RoomEventPlan[] {
  if (forced) return hordeRooms.map((r) => ({ roomId: r.roomId, kind: forced, waves: r.waves.length }));
  if (!config.enabled || config.kinds.length === 0) return [];
  const limit = Math.min(byFloor(config.countByFloor, floorNumber), Math.max(0, hordeRooms.length - 1));
  const rooms = shuffled(hordeRooms, rng).slice(0, limit);
  const kinds = shuffled(config.kinds, rng);
  const plans: RoomEventPlan[] = [];
  rooms.forEach((room, i) => {
    if (!rng.chance(config.chance)) return;
    plans.push({ roomId: room.roomId, kind: kinds[i % kinds.length]!, waves: room.waves.length });
  });
  return plans.sort((a, b) => a.roomId - b.roomId);
}

// ——— Pochodnia ———

export enum TorchOutcome {
  Burning = 'burning',
  /** Pokój wybity przed zgaśnięciem. */
  Won = 'won',
  /** Pochodnia zgasła — mrok do wybicia pokoju. */
  BurntOut = 'burnt-out',
}

/** Pochodnia wyścigu: czas jawnie (`now`, ms); wynik zapada raz. */
export class TorchRace {
  private startedAt: number | null = null;
  private outcome = TorchOutcome.Burning;

  constructor(readonly durationMs: number) {}

  static forWaves(config: RoomEventConfig['torch'], waves: number): TorchRace {
    return new TorchRace(config.baseMs + config.perWaveMs * Math.max(1, waves));
  }

  get started(): boolean {
    return this.startedAt !== null;
  }

  get result(): TorchOutcome {
    return this.outcome;
  }

  start(now: number): void {
    if (this.startedAt === null) this.startedAt = now;
  }

  /** Ułamek pozostałego ognia 1..0 (przed startem 1; po wygranej zostaje, jaki był). */
  remaining(now: number): number {
    if (this.startedAt === null) return 1;
    return Math.max(0, 1 - (now - this.startedAt) / this.durationMs);
  }

  /** Klatka: `cleared` — pokój wybity. Zwraca wynik (zmienia się najwyżej raz z `Burning`). */
  update(now: number, cleared: boolean): TorchOutcome {
    if (this.startedAt === null || this.outcome !== TorchOutcome.Burning) return this.outcome;
    if (cleared) this.outcome = TorchOutcome.Won;
    else if (this.remaining(now) <= 0) this.outcome = TorchOutcome.BurntOut;
    return this.outcome;
  }
}

/** Promień światła pochodni: od pełnego do końcowego razem z ogniem. */
export function torchLightRadius(config: RoomEventConfig['torch'], remaining: number): number {
  const r = Math.min(1, Math.max(0, remaining));
  return config.lightRadius.end + (config.lightRadius.full - config.lightRadius.end) * r;
}

// ——— Sakiewka ———

export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Wnętrze pokoju w pikselach, z marginesem `inset` od murów. */
export function roomBounds(room: Room, tileSize: number, inset: number): Bounds {
  return {
    left: room.x * tileSize + inset,
    top: room.y * tileSize + inset,
    right: (room.x + room.width) * tileSize - inset,
    bottom: (room.y + room.height) * tileSize - inset,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Kierunek ucieczki sakiewki (wektor jednostkowy albo zero) i jej prędkość w tej klatce. Odpycha ją każdy bohater
 * w `panicRadius` (bliższy mocniej), mury w `wallMargin`; bez bohatera blisko — kręci się w stronę `wander`.
 * Odpychanie od murów działa także w panice, więc sakiewka ślizga się wzdłuż muru, ale da się ją zagnać w róg.
 */
export function purseHeading(
  at: Vector2,
  heroes: readonly Vector2[],
  bounds: Bounds,
  config: Pick<RoomEventConfig['purse'], 'panicRadius' | 'wallMargin' | 'speed' | 'wanderSpeed'>,
  wander: Vector2,
): { readonly x: number; readonly y: number; readonly speed: number } {
  let fx = 0;
  let fy = 0;
  let panic = false;
  for (const hero of heroes) {
    const dx = at.x - hero.x;
    const dy = at.y - hero.y;
    const d = Math.hypot(dx, dy);
    if (d >= config.panicRadius) continue;
    panic = true;
    const w = (config.panicRadius - d) / config.panicRadius;
    const len = d > 0.001 ? d : 1;
    fx += (dx / len) * w;
    fy += (dy / len) * w;
  }
  if (!panic) {
    fx = wander.x - at.x;
    fy = wander.y - at.y;
  }
  // Mury: siła rośnie liniowo w pasie `wallMargin` przy krawędzi.
  const m = config.wallMargin;
  const push = (gap: number): number => (gap < m ? (m - Math.max(0, gap)) / m : 0);
  const scale = panic ? 1.2 : 0.5;
  fx += (push(at.x - bounds.left) - push(bounds.right - at.x)) * scale;
  fy += (push(at.y - bounds.top) - push(bounds.bottom - at.y)) * scale;
  const len = Math.hypot(fx, fy);
  if (len < 0.001) return { x: 0, y: 0, speed: 0 };
  return { x: fx / len, y: fy / len, speed: panic ? config.speed : config.wanderSpeed };
}

/** Krok sakiewki o `dtMs`: nowy punkt w granicach pokoju. */
export function stepPurse(at: Vector2, heading: { readonly x: number; readonly y: number; readonly speed: number }, bounds: Bounds, dtMs: number): Vector2 {
  const s = (heading.speed * dtMs) / 1000;
  return { x: clamp(at.x + heading.x * s, bounds.left, bounds.right), y: clamp(at.y + heading.y * s, bounds.top, bounds.bottom) };
}

/** Czy któryś bohater dotknął sakiewki. */
export function purseCaughtBy<T extends Vector2>(at: Vector2, heroes: readonly T[], catchRadius: number): T | null {
  return heroes.find((hero) => Math.hypot(hero.x - at.x, hero.y - at.y) <= catchRadius) ?? null;
}

/** Punkt startu sakiewki: z dala od bohatera — róg pokoju (wnętrze `bounds`) najdalej od wejścia. */
export function purseSpawnPoint(bounds: Bounds, heroes: readonly Vector2[]): Vector2 {
  const corners: Vector2[] = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.left, y: bounds.bottom },
    { x: bounds.right, y: bounds.bottom },
  ];
  const cx = (bounds.left + bounds.right) / 2;
  const cy = (bounds.top + bounds.bottom) / 2;
  const nearest = (p: Vector2): number => Math.min(Infinity, ...heroes.map((h) => Math.hypot(h.x - p.x, h.y - p.y)));
  const best = corners.reduce((a, b) => (nearest(b) > nearest(a) ? b : a));
  // Pół drogi między środkiem a rogiem — nie w samym rogu (tam łatwo złapać).
  return { x: (best.x + cx) / 2, y: (best.y + cy) / 2 };
}

/** Nowy cel błądzenia: losowy punkt we wnętrzu pokoju (RNG wydarzeń — deterministycznie). */
export function purseWanderTarget(bounds: Bounds, rng: Rng): Vector2 {
  return { x: bounds.left + rng.next() * (bounds.right - bounds.left), y: bounds.top + rng.next() * (bounds.bottom - bounds.top) };
}
