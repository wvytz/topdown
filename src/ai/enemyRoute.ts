import type { DungeonFloor } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';
import { clearPath, nextWaypoint } from '@/ai/botPath';

/** Jak często wróg przelicza drogę i o ile może przesunąć się cel, by stara droga jeszcze się nadawała. */
export interface EnemyRouteConfig {
  readonly refreshMs: number;
  readonly reuseGoalPx: number;
}

/**
 * Droga wroga wokół rogów (krok 152, zgłoszenie właściciela: „moby blokują się na narożnikach”). Wróg szedł do celu
 * po prostej: środek widział cel, ale bok ciała zahaczał o róg muru i wróg stał w miejscu. Teraz, gdy prosta dla
 * ciała o promieniu `halfWidth` jest zablokowana, idzie do najdalszego widocznego punktu drogi po kaflach
 * (ta sama droga co bot-partner, `ai/botPath.ts`). Gdy prosta jest wolna — po staremu prosto do celu.
 * Czysta logika; jedna instancja na wroga (pamięta ostatni punkt drogi).
 */
export class EnemyRoute {
  private waypoint: Vector2 | null = null;
  private goal: Vector2 | null = null;
  private plannedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly floor: DungeonFloor,
    private readonly tileSize: number,
    private readonly halfWidth: number,
    private readonly config: EnemyRouteConfig,
  ) {}

  /** Punkt, do którego wróg ma teraz iść, żeby dojść do `goal`. */
  next(from: Vector2, goal: Vector2, now: number): Vector2 {
    if (clearPath(this.floor, from, goal, this.tileSize, this.halfWidth)) {
      this.waypoint = null;
      return goal;
    }
    const reuse =
      this.waypoint !== null &&
      this.goal !== null &&
      now - this.plannedAt < this.config.refreshMs &&
      Math.hypot(this.goal.x - goal.x, this.goal.y - goal.y) <= this.config.reuseGoalPx &&
      Math.hypot(this.waypoint.x - from.x, this.waypoint.y - from.y) > 4;
    if (!reuse) {
      this.waypoint = nextWaypoint(this.floor, from, goal, this.tileSize, this.halfWidth) ?? goal;
      this.goal = goal;
      this.plannedAt = now;
    }
    return this.waypoint ?? goal;
  }
}
