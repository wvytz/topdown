import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';
import { hasLineOfSight } from '@/dungeon/lineOfSight';
import { roomContainsTile } from '@/dungeon/rooms';

export interface GateWaitConfig {
  /** Miejsce czekania: o tyle kafli od środka kraty na zewnątrz pokoju. */
  readonly postOffsetTiles: number;
  /** Odległość (px), przy której wróg uznaje, że stoi przy kracie. */
  readonly arrivalPx: number;
  /** Zryw po podniesieniu krat: czas i mnożnik prędkości chodu. */
  readonly surge: { readonly durationMs: number; readonly speedMultiplier: number };
}

/** Rozkaz dla wroga na tę klatkę: czekać przy kracie (`holdAt`) albo iść z mnożnikiem prędkości. */
export interface GateOrder {
  readonly holdAt: Vector2 | null;
  readonly speedMultiplier: number;
}

export interface GateWaitInput {
  readonly self: Vector2;
  readonly target: Vector2;
  /** Wróg już ściga (nie stoi bezczynnie). */
  readonly alert: boolean;
  readonly canSeeTarget: boolean;
  readonly aggroRange: number;
  readonly now: number;
}

const FREE: GateOrder = { holdAt: null, speedMultiplier: 1 };

/**
 * Miejsca czekania przed kratami pokoju: od środka każdej kraty krok na zewnątrz (kierunek od pokoju).
 * Kafel za kratą musi być podłogą — inaczej krata nie prowadzi nigdzie, skąd mógłby przyjść wróg.
 */
export function gatePosts(floor: DungeonFloor, room: Room, gates: readonly TilePoint[], tileSize: number, offsetTiles: number): Vector2[] {
  const posts: Vector2[] = [];
  for (const gate of gates) {
    const dx = gate.x < room.x ? -1 : gate.x >= room.x + room.width ? 1 : 0;
    const dy = gate.y < room.y ? -1 : gate.y >= room.y + room.height ? 1 : 0;
    const beyond = { x: gate.x + dx, y: gate.y + dy };
    if (beyond.x < 0 || beyond.y < 0 || beyond.x >= floor.width || beyond.y >= floor.height) continue;
    if (floor.tiles[beyond.y * floor.width + beyond.x] === TileType.Wall) continue;
    const len = Math.hypot(dx, dy) || 1;
    posts.push({
      x: (gate.x + 0.5 + (dx / len) * offsetTiles) * tileSize,
      y: (gate.y + 0.5 + (dy / len) * offsetTiles) * tileSize,
    });
  }
  return posts;
}

/**
 * Wrogowie za kratami (krok 132). Gdy pokój jest zamknięty kratami, a cel wroga stoi w środku, wróg spoza pokoju
 * (o ile już ściga albo widzi cel w zasięgu) idzie do najbliższego miejsca przy kracie i czeka — bez ataków.
 * Po podniesieniu krat każdy czekający dostaje krótki zryw szybkości.
 */
export class GateWait<T> {
  private readonly sealed = new Map<Room, readonly Vector2[]>();
  /** Czekający wróg → pokój, pod którego kratą stoi. */
  private readonly waiting = new Map<T, Room>();
  /** Wróg w zrywie → koniec zrywu (ms). */
  private readonly surges = new Map<T, number>();

  constructor(
    private readonly config: GateWaitConfig,
    private readonly floor: DungeonFloor,
    private readonly tileSize: number,
  ) {}

  get waitingCount(): number {
    return this.waiting.size;
  }

  /** Kraty pokoju opadły; `posts` — miejsca czekania (zob. `gatePosts`). */
  seal(room: Room, posts: readonly Vector2[]): void {
    if (posts.length > 0) this.sealed.set(room, posts);
  }

  /** Kraty pokoju się podniosły: czekający pod nimi ruszają zrywem. */
  release(room: Room, now: number): void {
    this.sealed.delete(room);
    for (const [enemy, at] of this.waiting) {
      if (at !== room) continue;
      this.waiting.delete(enemy);
      this.surges.set(enemy, now + this.config.surge.durationMs);
    }
  }

  /** Wróg zginął albo zniknął. */
  forget(enemy: T): void {
    this.waiting.delete(enemy);
    this.surges.delete(enemy);
  }

  order(enemy: T, input: GateWaitInput): GateOrder {
    const room = this.roomCutting(input.self, input.target);
    const engaged =
      this.waiting.has(enemy) || input.alert || (input.canSeeTarget && Math.hypot(input.target.x - input.self.x, input.target.y - input.self.y) <= input.aggroRange);
    if (room && engaged) {
      this.waiting.set(enemy, room);
      this.surges.delete(enemy);
      const post = this.postFor(this.sealed.get(room)!, input.self);
      const close = Math.hypot(post.x - input.self.x, post.y - input.self.y) <= this.config.arrivalPx;
      return { holdAt: close ? input.self : post, speedMultiplier: 1 };
    }
    // Cel wyszedł z pokoju (albo pokój otwarty) — wróg wraca do zwykłego pościgu.
    this.waiting.delete(enemy);
    const until = this.surges.get(enemy);
    if (until === undefined) return FREE;
    if (input.now >= until) {
      this.surges.delete(enemy);
      return FREE;
    }
    return { holdAt: null, speedMultiplier: this.config.surge.speedMultiplier };
  }

  /** Zamknięty pokój, w którym stoi cel, a wróg — poza nim. */
  private roomCutting(self: Vector2, target: Vector2): Room | null {
    const targetTile = this.tileOf(target);
    const selfTile = this.tileOf(self);
    for (const room of this.sealed.keys()) {
      if (roomContainsTile(room, targetTile) && !roomContainsTile(room, selfTile)) return room;
    }
    return null;
  }

  /** Najbliższe miejsce widoczne z pozycji wroga (wrogowie chodzą po prostej); bez takiego — najbliższe w ogóle. */
  private postFor(posts: readonly Vector2[], self: Vector2): Vector2 {
    const visible = posts.filter((post) => hasLineOfSight(this.floor, self, post, this.tileSize));
    return nearest(visible.length > 0 ? visible : posts, self);
  }

  private tileOf(at: Vector2): TilePoint {
    return { x: Math.floor(at.x / this.tileSize), y: Math.floor(at.y / this.tileSize) };
  }
}

function nearest(points: readonly Vector2[], from: Vector2): Vector2 {
  let best = points[0]!;
  let bestDist = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}
