import type { DashConfig } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { normalize } from '@/systems/CombatMath';
import { Timer } from '@/systems/Timer';

/** Krótki zryw w wybranym kierunku; w trakcie trwania gracz jest nietykalny. */
export class DashController {
  private readonly active = new Timer();
  private readonly cooldown = new Timer();
  private direction: Vector2 = { x: 0, y: 0 };

  constructor(private readonly config: DashConfig) {}

  tryStart(now: number, direction: Vector2): boolean {
    const dir = normalize(direction);
    if (this.cooldown.isActive(now) || (dir.x === 0 && dir.y === 0)) return false;
    this.direction = dir;
    this.active.start(now, this.config.durationMs);
    this.cooldown.start(now, this.config.cooldownMs);
    return true;
  }

  isDashing(now: number): boolean {
    return this.active.isActive(now);
  }

  velocity(): Vector2 {
    return { x: this.direction.x * this.config.speed, y: this.direction.y * this.config.speed };
  }

  /** 0..1, 1 = dash gotowy. */
  readiness(now: number): number {
    return this.cooldown.progress(now);
  }
}
