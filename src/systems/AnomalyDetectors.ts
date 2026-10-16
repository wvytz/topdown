import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import { DIAGNOSTICS } from '@/config/diagnosticsConfig';

interface StuckConfig {
  readonly windowMs: number;
  readonly minMovePx: number;
  readonly cooldownMs: number;
}

/**
 * Wykrywacze zawieszeń i niemożliwych sytuacji (krok 56): gracz utknął, walka z bossem stoi w miejscu, przekroczone limity
 * liczności, piętro rozspójnione (pokój albo schody nieosiągalne). Czyste: scena podaje próbki, dostaje opis anomalii.
 */
export interface Anomaly {
  readonly kind: string;
  readonly message: string;
  readonly data: Readonly<Record<string, string | number | boolean | null>>;
}

/** Gracz trzyma klawisze ruchu, a nie rusza się z miejsca (zakleszczenie w ścianie, błąd kolizji, kraty). */
export class StuckDetector {
  private heldSince = -1;
  private fromX = 0;
  private fromY = 0;
  private lastReportAt = -Infinity;

  constructor(private readonly config: StuckConfig = DIAGNOSTICS.anomalies.stuck) {}

  /** `exempt` = stan, w którym stanie w miejscu jest normalne (śmierć, paraliż, przejście między piętrami, pauza). */
  update(now: number, input: { readonly moveHeld: boolean; readonly exempt: boolean; readonly x: number; readonly y: number }): Anomaly | null {
    if (!input.moveHeld || input.exempt) {
      this.heldSince = -1;
      return null;
    }
    if (this.heldSince < 0) {
      this.heldSince = now;
      this.fromX = input.x;
      this.fromY = input.y;
      return null;
    }
    if (Math.hypot(input.x - this.fromX, input.y - this.fromY) >= this.config.minMovePx) {
      // Poruszył się — nowe okno od tej chwili.
      this.heldSince = now;
      this.fromX = input.x;
      this.fromY = input.y;
      return null;
    }
    const heldMs = now - this.heldSince;
    if (heldMs < this.config.windowMs || now - this.lastReportAt < this.config.cooldownMs) return null;
    this.lastReportAt = now;
    return {
      kind: 'player-stuck',
      message: 'Gracz trzyma ruch, ale stoi w miejscu',
      data: { heldMs: Math.round(heldMs), x: Math.round(input.x), y: Math.round(input.y) },
    };
  }
}

/** Walka z bossem trwa, a jego HP nie zmienia się przez dłuższy czas (boss nieosiągalny, zawieszony). */
export class BossStallDetector {
  private since = -1;
  private hp = NaN;
  private lastReportAt = -Infinity;

  constructor(private readonly stallMs: number = DIAGNOSTICS.anomalies.bossStallMs) {}

  update(now: number, bossHp: number | null): Anomaly | null {
    if (bossHp === null) {
      this.since = -1;
      return null;
    }
    if (this.since < 0 || bossHp !== this.hp) {
      this.since = now;
      this.hp = bossHp;
      return null;
    }
    if (now - this.since < this.stallMs || now - this.lastReportAt < this.stallMs) return null;
    this.lastReportAt = now;
    return { kind: 'boss-stalled', message: 'HP bossa nie zmienia się podczas walki', data: { hp: Math.round(bossHp), stalledMs: Math.round(now - this.since) } };
  }
}

/** Limit liczności (obiekty na scenie, wrogowie): zgłasza po przekroczeniu, nie częściej niż co `cooldownMs`. */
export class LimitWatch {
  private lastReportAt = -Infinity;

  constructor(
    private readonly name: string,
    private readonly limit: number,
    private readonly cooldownMs: number = DIAGNOSTICS.anomalies.limitCooldownMs,
  ) {}

  check(now: number, value: number): Anomaly | null {
    if (value <= this.limit || now - this.lastReportAt < this.cooldownMs) return null;
    this.lastReportAt = now;
    return { kind: `limit:${this.name}`, message: `Za dużo: ${this.name} = ${value} (limit ${this.limit})`, data: { value, limit: this.limit } };
  }
}

/** Czy z `from` da się dojść do `to` po kaflach nie-ścianach (4 kierunki; schody i kraty są przejezdne). */
export function reachable(floor: DungeonFloor, from: TilePoint, to: TilePoint): boolean {
  const { width, height, tiles } = floor;
  const inside = (p: TilePoint) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  if (!inside(from) || !inside(to)) return false;
  const goal = to.y * width + to.x;
  const seen = new Uint8Array(tiles.length);
  const queue = [from.y * width + from.x];
  seen[queue[0]!] = 1;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    if (cur === goal) return true;
    const x = cur % width;
    const y = Math.floor(cur / width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (seen[next] || tiles[next] === TileType.Wall) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return false;
}

/** Spójność piętra: lista opisów pokoi i schodów nieosiągalnych ze spawnu (pusta = wszystko dostępne). */
export function floorConnectivityIssues(floor: DungeonFloor): string[] {
  const issues: string[] = [];
  const from = { x: Math.floor(floor.playerSpawn.x), y: Math.floor(floor.playerSpawn.y) };
  for (const room of floor.rooms) {
    const center = { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) };
    if (!reachable(floor, from, center)) issues.push(`pokój ${room.id} (${room.kind}) nieosiągalny ze spawnu`);
  }
  if (!reachable(floor, from, floor.stairs)) issues.push('schody nieosiągalne ze spawnu');
  return issues;
}
