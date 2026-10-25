import type { Vector2 } from '@/core/types';
import { angleDelta } from '@/systems/Shield';

/**
 * Szarża Tarczownika (krok 99, pomysł właściciela): zamiast doskakiwać i obracać się do gracza, elita z tarczą
 * zapowiada szarżę (stoi, linia toru), potem pędzi po prostej w zapamiętanym kierunku. Trafienie odrzuca gracza;
 * unik kończy się wbiciem w ścianę i ogłuszeniem (okno na cios w plecy) albo postojem po wybiegu.
 * Czysta logika czasu i dystansu — encja Phasera tylko wykonuje ruch i zgłasza ścianę.
 */

export enum ChargePhase {
  Ready = 'ready',
  Windup = 'windup',
  Charging = 'charging',
  /** Wbity w ścianę. */
  Stunned = 'stunned',
  /** Postój po trafieniu albo po wybiegu bez ściany. */
  Recovering = 'recovering',
}

export interface ShieldChargeConfig {
  /** Szarża rusza tylko z dystansu [minRange, maxRange] (środek–środek, px); bliżej zwykły cios. */
  readonly minRange: number;
  readonly maxRange: number;
  /** Telegraf: stoi i pokazuje tor. */
  readonly windupMs: number;
  /** Prędkość szarży (px/s) i najdłuższy wybieg (px). */
  readonly speed: number;
  readonly maxDistance: number;
  /** Trafia gracza, gdy środki są bliżej niż tyle + promień gracza (raz na szarżę). */
  readonly hitRadius: number;
  /** Obrażenia szarży względem zwykłego ciosu wroga. */
  readonly damageMultiplier: number;
  readonly knockback: number;
  /** Ogłuszenie po wbiciu w ścianę. */
  readonly wallStunMs: number;
  /** Postój po wybiegu bez ściany. */
  readonly missRecoveryMs: number;
  /** Postój po trafieniu gracza. */
  readonly hitRecoveryMs: number;
  /** Przerwa od końca szarży (z postojem) do następnej. */
  readonly cooldownMs: number;
  /** Rusza tylko na cel w stożku ±połowa tego kąta przed tarczą — gracz za plecami nie dostaje szarży od razu. */
  readonly aimConeDeg: number;
  /** Pierwsze ms szarży nie liczą ściany (ciało odkleja się od przeszkody, przy której stało). */
  readonly wallGraceMs: number;
}

/** Wynik kroku szarży. */
export enum ChargeOutcome {
  Continue = 'continue',
  Wall = 'wall',
  Spent = 'spent',
}

export class ShieldCharge {
  private current = ChargePhase.Ready;
  private phaseEndsAt = -Infinity;
  private readyAt = -Infinity;
  private origin: Vector2 = { x: 0, y: 0 };
  private dir: Vector2 = { x: 1, y: 0 };
  private chargeStartedAt = 0;
  private hit = false;

  constructor(private readonly config: ShieldChargeConfig) {}

  /** Faza w chwili `now`: zamach przechodzi w szarżę sam, postoje kończą się same. */
  phase(now: number): ChargePhase {
    if (this.current === ChargePhase.Windup && now >= this.phaseEndsAt) {
      this.current = ChargePhase.Charging;
      this.chargeStartedAt = this.phaseEndsAt;
    }
    if ((this.current === ChargePhase.Stunned || this.current === ChargePhase.Recovering) && now >= this.phaseEndsAt) {
      this.current = ChargePhase.Ready;
    }
    return this.current;
  }

  /** Czy szarża zajmuje wroga (zamach, bieg, ogłuszenie, postój) — wtedy bez zwykłego ataku i obrotu tarczy. */
  isBusy(now: number): boolean {
    return this.phase(now) !== ChargePhase.Ready;
  }

  /** Kierunek szarży (jednostkowy), zapamiętany na początku zamachu. */
  get direction(): Vector2 {
    return this.dir;
  }

  get hasHit(): boolean {
    return this.hit;
  }

  /**
   * Czy może zacząć szarżę: gotowa, po przerwie, cel widoczny, w zasięgu szarży i przed tarczą
   * (`facing` w radianach) — najpierw musi się do gracza powoli obrócić.
   */
  canStart(now: number, self: Vector2, target: Vector2, canSeeTarget: boolean, facing: number): boolean {
    if (!canSeeTarget || this.phase(now) !== ChargePhase.Ready || now < this.readyAt) return false;
    const dx = target.x - self.x;
    const dy = target.y - self.y;
    const d = Math.hypot(dx, dy);
    if (d < this.config.minRange || d > this.config.maxRange) return false;
    return Math.abs(angleDelta(facing, Math.atan2(dy, dx))) <= (this.config.aimConeDeg * Math.PI) / 360;
  }

  /** Zaczyna zamach: kierunek do celu z tej chwili — gracz widzi tor przez cały telegraf. */
  start(now: number, self: Vector2, target: Vector2): void {
    const dx = target.x - self.x;
    const dy = target.y - self.y;
    const d = Math.hypot(dx, dy) || 1;
    this.dir = { x: dx / d, y: dy / d };
    this.origin = { x: self.x, y: self.y };
    this.current = ChargePhase.Windup;
    this.phaseEndsAt = now + this.config.windupMs;
    this.hit = false;
  }

  /** Odcinek toru do rysowania telegrafu (od wroga na pełny wybieg). */
  lane(self: Vector2): { readonly from: Vector2; readonly to: Vector2 } {
    const { maxDistance } = this.config;
    return { from: self, to: { x: self.x + this.dir.x * maxDistance, y: self.y + this.dir.y * maxDistance } };
  }

  /** Krok biegu: ściana (po okresie łaski) → ogłuszenie; pełny wybieg albo czas → postój. */
  advance(now: number, position: Vector2, blockedByWall: boolean): ChargeOutcome {
    if (this.phase(now) !== ChargePhase.Charging) return ChargeOutcome.Continue;
    const elapsed = now - this.chargeStartedAt;
    if (blockedByWall && elapsed >= this.config.wallGraceMs) {
      this.finish(now, this.config.wallStunMs, ChargePhase.Stunned);
      return ChargeOutcome.Wall;
    }
    const travelled = Math.hypot(position.x - this.origin.x, position.y - this.origin.y);
    // Zapas czasu: ciało zablokowane przez innego wroga nie biegnie w nieskończoność.
    const maxMs = (this.config.maxDistance / this.config.speed) * 1000 * 1.5;
    if (travelled >= this.config.maxDistance || elapsed >= maxMs) {
      this.finish(now, this.config.missRecoveryMs, ChargePhase.Recovering);
      return ChargeOutcome.Spent;
    }
    return ChargeOutcome.Continue;
  }

  /** Trafił gracza: szarża kończy się krótkim postojem. */
  registerHit(now: number): void {
    if (this.phase(now) !== ChargePhase.Charging) return;
    this.hit = true;
    this.finish(now, this.config.hitRecoveryMs, ChargePhase.Recovering);
  }

  private finish(now: number, pauseMs: number, phase: ChargePhase): void {
    this.current = phase;
    this.phaseEndsAt = now + pauseMs;
    this.readyAt = this.phaseEndsAt + this.config.cooldownMs;
  }
}
