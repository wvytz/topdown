import type { Vector2 } from '@/core/types';

export type { ShieldDefinition } from '@/core/bossTypes';

/**
 * Tarcza bossa (krok 41e — Strażnik Bram, potem Kat Otchłani): chroni stożek przed bossem.
 * Pociski z przodu odbija, promień z przodu nie rani, cios w tarczę zadaje część obrażeń.
 * Boss obraca tarczę do gracza z ograniczoną prędkością, a w trakcie ataku wcale — da się go obejść.
 */

/** Czy punkt `from` jest przed tarczą (w stożku `arcDeg` wokół kąta `facing`, radiany). */
export function isShielded(center: Vector2, facing: number, arcDeg: number, from: Vector2): boolean {
  const angle = Math.atan2(from.y - center.y, from.x - center.x);
  return Math.abs(angleDelta(facing, angle)) <= (arcDeg * Math.PI) / 360;
}

/** Różnica kątów w (−π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Obrót z `current` w stronę `target` najwyżej o `maxStep` radianów. */
export function turnToward(current: number, target: number, maxStep: number): number {
  const d = angleDelta(current, target);
  return Math.abs(d) <= maxStep ? target : current + Math.sign(d) * maxStep;
}

/**
 * Wytrzymałość tarczy (krok 74): trafienia ją zbijają, po wyzerowaniu tarcza jest pęknięta przez `breakMs`,
 * a potem wraca z pełną wytrzymałością.
 */
export class ShieldGuard {
  private hp: number;
  private brokenUntil = -Infinity;

  constructor(
    private readonly maxHp: number,
    private readonly breakMs: number,
  ) {
    this.hp = maxHp;
  }

  isBroken(now: number): boolean {
    return now < this.brokenUntil;
  }

  /** Pozostała wytrzymałość (0..1); pęknięta tarcza = 0. */
  fraction(now: number): number {
    return this.isBroken(now) ? 0 : this.hp / this.maxHp;
  }

  /** Cios w tarczę; zwraca true, jeśli właśnie ją rozbił. */
  absorb(damage: number, now: number): boolean {
    if (this.isBroken(now)) return false;
    this.hp -= damage;
    if (this.hp > 0) return false;
    this.hp = this.maxHp;
    this.brokenUntil = now + this.breakMs;
    return true;
  }
}

/**
 * Opuszczona tarcza bossa (krok 113): przez `loweredMs` od końca ostatniego ataku (`attackEndsAt`) boss stoi
 * bez tarczy — okno na pełne combo. Nowy atak zaczyna nowe okno (i kończy stare).
 */
export function isGuardLowered(attackEndsAt: number, loweredMs: number, now: number): boolean {
  return now >= attackEndsAt && now < attackEndsAt + loweredMs;
}

/** Odchylenie odbitego pocisku od kierunku „z powrotem” (stopnie, krok 113). */
export interface ReflectSpread {
  readonly minDeg: number;
  readonly maxDeg: number;
}

/**
 * Kierunek odbitego pocisku: z powrotem w stronę, z której przyleciał. Z `spread` (krok 113, ocena właściciela:
 * odbite strzały zawsze trafiały strzelca) odchylony losowo w lewo albo w prawo o kąt z [minDeg, maxDeg] —
 * nigdy prosto w strzelca. `roll` to liczby z [0, 1) (pierwsza: strona, druga: kąt).
 */
export function reflectDirection(velocity: Vector2, spread?: ReflectSpread, roll?: () => number): Vector2 {
  const back = { x: -velocity.x, y: -velocity.y };
  if (!spread || !roll) return back;
  const side = roll() < 0.5 ? -1 : 1;
  const deg = spread.minDeg + (spread.maxDeg - spread.minDeg) * roll();
  const a = side * ((deg * Math.PI) / 180);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: back.x * cos - back.y * sin, y: back.x * sin + back.y * cos };
}

/**
 * Pierścień ognia (Kat Otchłani, krok 41f): promień wolnego koła w środku areny `elapsedMs` od zapłonu —
 * kurczy się liniowo od `startRadius` do `minRadius` przez `shrinkMs`.
 */
export function fireRingRadius(startRadius: number, minRadius: number, shrinkMs: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return startRadius;
  const t = shrinkMs > 0 ? Math.min(1, elapsedMs / shrinkMs) : 1;
  return startRadius + (minRadius - startRadius) * t;
}
