import type { DashConfig } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { ChargePool } from '@/systems/ChargePool';
import { normalize } from '@/systems/CombatMath';
import { Timer } from '@/systems/Timer';

/**
 * Krótki zryw w wybranym kierunku; w trakcie trwania gracz jest nietykalny.
 * Krok 150: ładunki (Pętla czasu — 2): każdy wraca po `cooldownMs`, kolejny ładuje się po poprzednim.
 * Z jednym ładunkiem działa jak dawny cooldown.
 */
export class DashController {
  private readonly active = new Timer();
  private readonly charges: ChargePool;
  private direction: Vector2 = { x: 0, y: 0 };

  constructor(private readonly config: DashConfig) {
    this.charges = new ChargePool(Math.max(1, config.charges ?? 1), config.cooldownMs);
  }

  /**
   * Krok 150: nowa konfiguracja (przedmiot, szał, Rozpęd) bez zerowania trwającego dasha i odnowienia —
   * wcześniej każdy nowy loadout dawał świeży dash.
   */
  reconfigured(config: DashConfig, now: number): DashController {
    const next = new DashController(config);
    next.active.copyFrom(this.active);
    next.direction = this.direction;
    next.charges.copyStateFrom(this.charges, now);
    return next;
  }

  tryStart(now: number, direction: Vector2): boolean {
    const dir = normalize(direction);
    if (this.isDashing(now) || (dir.x === 0 && dir.y === 0) || !this.charges.tryConsume(now)) return false;
    this.direction = dir;
    this.active.start(now, this.config.durationMs);
    return true;
  }

  isDashing(now: number): boolean {
    return this.active.isActive(now);
  }

  velocity(): Vector2 {
    return { x: this.direction.x * this.config.speed, y: this.direction.y * this.config.speed };
  }

  /** 0..1, 1 = dash gotowy (choć jeden ładunek); inaczej postęp ładowania. */
  readiness(now: number): number {
    return this.charges.available(now) > 0 ? 1 : this.charges.rechargeProgress(now);
  }

  /** Ile dashy jest gotowych (Pętla czasu — do 2). */
  available(now: number): number {
    return this.charges.available(now);
  }

  get maxCharges(): number {
    return this.charges.maxCharges;
  }
}
