import type { RenderProfile } from '@/core/displayTypes';
import { HitstopKind } from '@/core/combatFeelTypes';
import type { CombatFeelLevel, ShatterPiece } from '@/core/combatFeelTypes';
import { COMBAT_FEEL_CONFIG, COMBAT_FEEL_LEVELS } from '@/config/combatFeelConfig';

/**
 * Feel walki (krok U2) — czysta warstwa: co wolno na danym poziomie, kiedy zatrzymać obraz i jak lecą kawałki rozpadu.
 * Wszystko dotyczy wyłącznie obrazu; nic tu nie zmienia logiki, czasu gry ani strumieni RNG systemów.
 */

/** Feel walki dla profilu obrazu. „Mniej błysków” wyłącza hitstop na każdym poziomie (§13.4). */
export function combatFeelLevel(profile: Pick<RenderProfile, 'quality' | 'screenFlash'>): CombatFeelLevel {
  const level = COMBAT_FEEL_LEVELS[profile.quality];
  return profile.screenFlash ? level : { ...level, hitstop: false };
}

/** Czy trafienie za `damage` to ciężki cios (hitstop). */
export function isHeavyHit(damage: number): boolean {
  return damage >= COMBAT_FEEL_CONFIG.hitstop.heavyHitDamage;
}

/**
 * Zegar hitstopu. Prośba z logiki gry (`request`) daje czas zatrzymania obrazu albo 0, gdy trwa przerwa między
 * hitstopami — w nawale obraz nie może się rwać. Zabicie bossa przerwę pomija. Czas to zegar klatek, nie gry.
 */
export class HitstopClock {
  private lastAt = -Infinity;
  private holdUntil = -Infinity;
  private pendingMs = 0;
  private lastFrame: number | null = null;
  private visible = 0;

  /**
   * Czas obrazu: zegar klatek bez czasu zatrzymań. Efekty feelu liczą klatki animacji od niego — inaczej iskry
   * i smuga „zgasłyby” w czasie hitstopu, zanim gracz je zobaczy.
   */
  get visualTime(): number {
    return this.visible;
  }

  /** Zgłoszenie zdarzenia w chwili `now`; zwraca przyznany czas zatrzymania (ms). */
  request(kind: HitstopKind, now: number, enabled: boolean): number {
    if (!enabled) return 0;
    const { ms, cooldownMs } = COMBAT_FEEL_CONFIG.hitstop;
    if (kind !== HitstopKind.BossKill && now - this.lastAt < cooldownMs) return 0;
    const duration = ms[kind];
    this.lastAt = now;
    this.pendingMs = Math.max(this.pendingMs, duration);
    return duration;
  }

  /**
   * Wołane na początku każdej klatki: czy pominąć rysowanie. Klatka ze zdarzeniem rysuje się normalnie
   * (z błyskiem trafienia), zatrzymanie zaczyna się od następnej i trwa przyznany czas.
   */
  shouldHold(frameTime: number): boolean {
    if (this.pendingMs > 0) {
      this.holdUntil = Math.max(this.holdUntil, frameTime + this.pendingMs);
      this.pendingMs = 0;
    }
    const hold = frameTime < this.holdUntil;
    if (!hold && this.lastFrame !== null) this.visible += Math.max(0, frameTime - this.lastFrame);
    this.lastFrame = frameTime;
    return hold;
  }

  /** Przerwij zatrzymanie (zmiana sceny, pauza). */
  reset(): void {
    this.pendingMs = 0;
    this.holdUntil = -Infinity;
  }
}

/**
 * Tor kawałków rozpadu: rozlot w losowych kierunkach, „podskok” (rzut z góry) i opadanie — po klatce na pozycję,
 * w pełnych pikselach (§13.5: skokowa animacja). `random` to Math.random efektu albo stały strumień w testach.
 */
export function shatterPieces(count: number, colors: number, random: () => number): ShatterPiece[] {
  const { frames, speed, gravity, lift } = COMBAT_FEEL_CONFIG.shatter;
  const pieces: ShatterPiece[] = [];
  for (let i = 0; i < count; i++) {
    // Kąty rozłożone równo z odrobiną losu — kawałki nie zbijają się w jedną stronę.
    const angle = ((i + random() * 0.8) / count) * Math.PI * 2;
    const v = speed[0] + random() * (speed[1] - speed[0]);
    const vx = Math.cos(angle) * v;
    let vy = Math.sin(angle) * v * 0.6 - lift;
    let x = 0;
    let y = 0;
    const track: { x: number; y: number }[] = [];
    for (let f = 0; f < frames; f++) {
      x += vx * (1 - f / (frames * 1.5));
      y += vy;
      vy += gravity;
      track.push({ x: Math.round(x), y: Math.round(y) });
    }
    pieces.push({ frames: track, colorIndex: colors > 0 ? i % colors : 0 });
  }
  return pieces;
}

/** Kąty odcinków smugi cięcia (skokowy łuk z `segments` odcinków) dla kąta ciosu i rozwarcia łuku. */
export function slashSegments(angle: number, arc: number, segments: number = COMBAT_FEEL_CONFIG.slash.segments): number[] {
  const n = Math.max(1, Math.round(segments));
  const start = angle - arc / 2;
  return Array.from({ length: n + 1 }, (_, i) => start + (arc * i) / n);
}

/** Niska nie może mieć żadnego efektu feelu (plan wycofania, §13.3). */
export function isFeelOff(level: CombatFeelLevel): boolean {
  return !level.hitSparks && !level.slashTrail && !level.shatter && !level.blastOverDark && !level.projectileHalo && !level.heroHurtFlash && !level.hitstop;
}

