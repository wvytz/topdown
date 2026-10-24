import type { Hit, StatusApplication } from '@/core/combatTypes';
import type { BeamConfig, SorceryConfig } from '@/core/heroTypes';
import type { StatLimits, StatModifiers } from '@/core/lootTypes';
import type { Vector2 } from '@/core/types';
import { knockbackFrom } from '@/systems/CombatMath';
import type { MeleeTarget, SwingResult } from '@/systems/MeleeResolver';

/**
 * Zestaw Czarodziejki (krok 37): przedmioty, orbita kul, promień.
 * Kule są jej bronią główną, więc biorą to, co u barbarzyńcy daje cios i strzał:
 * Ostrze (+obrażenia kul i fali), Rękawice (szybszy rzut i powrót kul), Kołczan (+1 kula). Promień to umiejętność bazowa.
 */
export function applySorceryModifiers(base: SorceryConfig, mods: StatModifiers, limits: StatLimits): SorceryConfig {
  const cooldown = Math.max(limits.minCooldownMultiplier, 1 + mods.attackCooldownPct);
  const { orbs } = base;
  return {
    ...base,
    orbs: {
      ...orbs,
      damage: Math.max(1, orbs.damage + mods.meleeDamage),
      castWindupMs: Math.round(orbs.castWindupMs * cooldown),
      castCooldownMs: Math.round(orbs.castCooldownMs * cooldown),
      reloadMs: Math.round(orbs.reloadMs * cooldown),
      nova: { ...orbs.nova, damage: Math.max(1, orbs.nova.damage + mods.meleeDamage) },
      maxOrbs: Math.min(Math.max(limits.maxRangedCharges, orbs.maxOrbs), orbs.maxOrbs + mods.rangedCharges),
    },
  };
}

/** Punkt przy krysztale kostura: `forward` px w kierunku patrzenia i `side` px w prawo od tej osi. */
export function crystalPoint(center: Vector2, angle: number, forward: number, side: number): Vector2 {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  return { x: center.x + dx * forward - dy * side, y: center.y + dy * forward + dx * side };
}

/** Pozycje kul na orbicie względem postaci: równo rozłożone, obracają się zgodnie z zegarem. */
export function orbitOffsets(count: number, now: number, radius: number, periodMs: number): Vector2[] {
  const phase = periodMs > 0 ? ((now % periodMs) / periodMs) * Math.PI * 2 : 0;
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const angle = phase + (i * Math.PI * 2) / count;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

/** Rzut kuli z serii: `last` = ostatnia kula — wyzwala falę uderzeniową. */
export interface OrbThrow {
  readonly last: boolean;
}

/**
 * Seria kul na orbicie (krok 97, po raporcie testera: kule wracały za wolno).
 * Rzut ostatniej kuli wyzwala falę i wszystkie kule wracają naraz po `reloadMs`, więc przytrzymanie LPM
 * daje ciągły rytm: kula, kula, kula + fala, krótki powrót. Seria przerwana w połowie odnawia się po jednej kuli
 * co `rechargeMs`. Stan liczony leniwie z jawnego `now` (ms), jak `ChargePool`.
 */
export class OrbSeries {
  private stored: number;
  private rechargeStartedAt = 0;
  /** Chwila powrotu wszystkich kul po wyczerpaniu serii; null = seria niewyczerpana. */
  private reloadAt: number | null = null;

  constructor(
    private max: number,
    private rechargeMs: number,
    private reloadMs: number,
  ) {
    this.stored = max;
  }

  get maxOrbs(): number {
    return this.max;
  }

  /** Nowe czasy (Rękawice, modyfikator piętra); bieżące odliczanie zostaje. */
  setTiming(rechargeMs: number, reloadMs: number): void {
    this.rechargeMs = rechargeMs;
    this.reloadMs = reloadMs;
  }

  /** Zmiana pojemności (Kołczan): nowe kule przychodzą od razu. */
  resize(maxOrbs: number, now: number): void {
    this.sync(now);
    const gained = Math.max(0, maxOrbs - this.max);
    this.max = maxOrbs;
    this.stored = Math.min(this.max, this.stored + gained);
    if (this.stored > 0) this.reloadAt = null;
  }

  available(now: number): number {
    this.sync(now);
    return this.stored;
  }

  /** Zużywa kulę; null, gdy orbita jest pusta. */
  tryThrow(now: number): OrbThrow | null {
    this.sync(now);
    if (this.stored <= 0) return null;
    if (this.stored === this.max) this.rechargeStartedAt = now;
    this.stored--;
    const last = this.stored === 0;
    if (last) this.reloadAt = now + this.reloadMs;
    return { last };
  }

  /** 0..1 do HUD: postęp powrotu serii albo kolejnej kuli; 1 = pełna orbita. */
  rechargeProgress(now: number): number {
    this.sync(now);
    if (this.reloadAt !== null) return this.reloadMs > 0 ? Math.min(1, Math.max(0, 1 - (this.reloadAt - now) / this.reloadMs)) : 1;
    if (this.stored >= this.max || this.rechargeMs <= 0) return 1;
    return Math.min(1, Math.max(0, (now - this.rechargeStartedAt) / this.rechargeMs));
  }

  private sync(now: number): void {
    if (this.reloadAt !== null) {
      if (now < this.reloadAt) return;
      this.stored = this.max;
      this.reloadAt = null;
      return;
    }
    if (this.stored >= this.max) return;
    if (this.rechargeMs <= 0) {
      this.stored = this.max;
      return;
    }
    const gained = Math.floor((now - this.rechargeStartedAt) / this.rechargeMs);
    if (gained <= 0) return;
    this.stored = Math.min(this.max, this.stored + gained);
    this.rechargeStartedAt += gained * this.rechargeMs;
  }
}

/** Stan promienia w danej klatce. */
export interface BeamTick {
  /** Promień świeci w tej klatce. */
  readonly active: boolean;
  /** Ile razy w tej klatce promień zadaje obrażenia (0 albo więcej przy długiej klatce). */
  readonly ticks: number;
}

/**
 * Promień PPM: świeci, póki przycisk jest wciśnięty (najdłużej maxChannelMs).
 * Zgaśnięcie — puszczenie, limit czasu albo przerwanie (dash, paraliż) — blokuje go na lockoutMs.
 * Obrażenia co tickMs, pierwsze od razu po zapaleniu.
 */
export class BeamChannel {
  private channeling = false;
  private startedAt = 0;
  private nextTickAt = 0;
  private lockedUntil = -Infinity;

  constructor(private config: BeamConfig) {}

  setConfig(config: BeamConfig): void {
    this.config = config;
  }

  update(held: boolean, now: number): BeamTick {
    if (this.channeling && (!held || now - this.startedAt >= this.config.maxChannelMs)) this.stop(now);
    if (!this.channeling && held && now >= this.lockedUntil) {
      this.channeling = true;
      this.startedAt = now;
      this.nextTickAt = now;
    }
    if (!this.channeling) return { active: false, ticks: 0 };
    let ticks = 0;
    while (this.nextTickAt <= now) {
      ticks++;
      this.nextTickAt += this.config.tickMs;
    }
    return { active: true, ticks };
  }

  /** Przerwanie z zewnątrz (dash, paraliż, śmierć): promień gaśnie i wchodzi blokada. */
  interrupt(now: number): void {
    if (this.channeling) this.stop(now);
  }

  isActive(): boolean {
    return this.channeling;
  }

  /** 0..1 do HUD: w trakcie promienia — ile zostało z limitu; w blokadzie — postęp odnowienia; 1 = gotowy. */
  readiness(now: number): number {
    if (this.channeling) return Math.max(0, 1 - (now - this.startedAt) / this.config.maxChannelMs);
    if (now >= this.lockedUntil) return 1;
    return Math.min(1, Math.max(0, 1 - (this.lockedUntil - now) / this.config.lockoutMs));
  }

  private stop(now: number): void {
    this.channeling = false;
    this.lockedUntil = now + this.config.lockoutMs;
  }
}

/**
 * Długość promienia: idzie od `origin` w kierunku `angle` krokami `step` px aż do `range`
 * albo do pierwszego zablokowanego punktu (ściana, krata).
 */
export function beamReach(
  origin: Vector2,
  angle: number,
  range: number,
  isBlocked: (point: Vector2) => boolean,
  step = 4,
): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let d = step; d <= range; d += step) {
    if (isBlocked({ x: origin.x + dx * d, y: origin.y + dy * d })) return d - step;
  }
  return range;
}

/** Odległość punktu od odcinka a–b. */
export function distanceToSegment(p: Vector2, a: Vector2, b: Vector2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq)) : 0;
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

export interface BeamStrike {
  readonly from: Vector2;
  readonly to: Vector2;
  readonly halfWidth: number;
  readonly damage: number;
  readonly knockback: number;
  readonly now: number;
  /** Skąd trafiony wróg „słyszy” atak (pozycja Czarodziejki). */
  readonly source: Vector2;
  readonly status?: StatusApplication;
}

/** Rozprysk kuli (krok 50): wokół miejsca trafienia, bez głównego celu; też fala uderzeniowa (krok 97). */
export interface OrbSplash {
  readonly center: Vector2;
  readonly radius: number;
  readonly damage: number;
  readonly now: number;
  /** Skąd trafieni „słyszą” atak (pozycja Czarodziejki). */
  readonly source: Vector2;
  /** Główny cel kuli — dostał już pełne obrażenia. */
  readonly exclude: object | null;
  /** Odrzut od środka (fala uderzeniowa); brak = bez odrzutu. */
  readonly knockback?: number;
}

/** Obrażenia rozprysku: ułamek obrażeń kuli, co najmniej 1. */
export function splashDamage(orbDamage: number, fraction: number): number {
  return Math.max(1, Math.round(orbDamage * fraction));
}

/** Rozprysk: rani cele, których krąg dotyka koła rozprysku (poza głównym celem); magia, bez statusów; odrzut tylko fali. */
export function resolveSplash<T extends MeleeTarget>(splash: OrbSplash, targets: readonly T[]): SwingResult<T> {
  const hit: T[] = [];
  const killed: T[] = [];
  for (const target of targets) {
    if (target === splash.exclude) continue;
    if (Math.hypot(target.x - splash.center.x, target.y - splash.center.y) > splash.radius + target.radius) continue;
    hit.push(target);
    const knockback = splash.knockback ? knockbackFrom(splash.center, target, splash.knockback) : { x: 0, y: 0 };
    if (target.takeHit({ damage: splash.damage, knockback, magic: true }, splash.now, splash.source).died) killed.push(target);
  }
  return { hit, killed };
}

/** Czy krąg celu dotyka promienia (bez zadawania obrażeń). */
export function beamReaches(beam: BeamStrike, target: MeleeTarget): boolean {
  return distanceToSegment(target, beam.from, beam.to) <= target.radius + beam.halfWidth;
}

/** Promień rani każdy cel, którego krąg dotyka odcinka; odrzut wzdłuż promienia. */
export function resolveBeam<T extends MeleeTarget>(beam: BeamStrike, targets: readonly T[]): SwingResult<T> {
  const hit: T[] = [];
  const killed: T[] = [];
  for (const target of targets) {
    if (!beamReaches(beam, target)) continue;
    const blow: Hit = {
      damage: beam.damage,
      knockback: knockbackFrom(beam.from, target, beam.knockback),
      ...(beam.status && { status: beam.status }),
      // Promień to magia — rani też bezcielesnych (krok 49b).
      magic: true,
    };
    hit.push(target);
    if (target.takeHit(blow, beam.now, beam.source).died) killed.push(target);
  }
  return { hit, killed };
}
