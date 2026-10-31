import Phaser from 'phaser';
import type { Vector2 } from '@/core/types';
import { EVOLUTION_VISUAL } from '@/config/itemEvolutionConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import type { StormTrailPoint } from '@/systems/StormTrail';

/**
 * Wygląd przemian przedmiotów (krok 150): pioruny, kula Iskrownika, lewitacja, Krwawa tarcza, ślad burzy.
 * Czysto wizualne (Math.random tylko do zygzaków) — zasady liczą systemy i `HeroCombat`.
 */

/** Zygzak pioruna od `from` do `to`, gaśnie sam. */
export function drawBolt(scene: Phaser.Scene, from: Vector2, to: Vector2): void {
  const { segments, jitter, fadeMs, outer, inner, outerWidth, innerWidth } = EVOLUTION_VISUAL.bolt;
  const points: Vector2[] = [from];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const off = (Math.random() * 2 - 1) * jitter;
    points.push({ x: from.x + dx * t + nx * off, y: from.y + dy * t + ny * off });
  }
  points.push(to);
  const gfx = scene.add.graphics().setDepth(RENDER_DEPTH.slash);
  for (const [width, color] of [
    [outerWidth, outer],
    [innerWidth, inner],
  ] as const) {
    gfx.lineStyle(width, color, 1).beginPath().moveTo(from.x, from.y);
    for (const p of points.slice(1)) gfx.lineTo(p.x, p.y);
    gfx.strokePath();
  }
  gfx.fillStyle(inner, 1).fillCircle(to.x, to.y, 2);
  scene.tweens.add({ targets: gfx, alpha: 0, duration: fadeMs, onComplete: () => gfx.destroy() });
}

/** Krótki pierścień wybuchu (Pożoga, pęknięcie lodu). */
export function drawBurstRing(scene: Phaser.Scene, at: Vector2, radius: number, color: number): void {
  const gfx = scene.add.graphics().setDepth(RENDER_DEPTH.slash);
  gfx.fillStyle(color, 0.35).fillCircle(at.x, at.y, radius);
  gfx.lineStyle(2, color, 0.9).strokeCircle(at.x, at.y, radius);
  scene.tweens.add({ targets: gfx, alpha: 0, duration: 260, onComplete: () => gfx.destroy() });
}

/** Tekstura półksiężyca fali ostrza (raz na grę). */
export function ensureCrescentTexture(scene: Phaser.Scene): string {
  const { key, size, color, edge } = EVOLUTION_VISUAL.crescent;
  if (scene.textures.exists(key)) return key;
  const gfx = scene.make.graphics({}, false);
  const c = size / 2;
  // Półksiężyc skierowany w prawo (+x): gruby łuk z jasnym rdzeniem.
  gfx.lineStyle(4, edge, 1).beginPath().arc(c - 5, c, c - 3, -1.25, 1.25, false).strokePath();
  gfx.lineStyle(2, color, 1).beginPath().arc(c - 5, c, c - 3, -1.1, 1.1, false).strokePath();
  gfx.generateTexture(key, size, size);
  gfx.destroy();
  return key;
}

/** Stałe dodatki bohatera z przemian: kula Iskrownika, lewitacja, Krwawa tarcza, ślad burzy. */
export class HeroEvolutionView {
  private readonly under: Phaser.GameObjects.Graphics;
  private readonly over: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.under = scene.add.graphics().setDepth(RENDER_DEPTH.player - 0.1);
    this.over = scene.add.graphics().setDepth(RENDER_DEPTH.player + 0.1);
  }

  /** Pozycja kuli Iskrownika w chwili `now` (z niej wylatuje piorun). */
  static sparkerPoint(hero: Vector2, now: number): Vector2 {
    const { offsetY, orbitX, orbitY, periodMs } = EVOLUTION_VISUAL.sparker;
    const phase = ((now % periodMs) / periodMs) * Math.PI * 2;
    return { x: hero.x + Math.cos(phase) * orbitX, y: hero.y + offsetY + Math.sin(phase) * orbitY };
  }

  draw(
    hero: Vector2,
    now: number,
    state: { readonly sparker: boolean; readonly levitating: boolean; readonly shield: number; readonly shieldMax: number; readonly trail: readonly StormTrailPoint[]; readonly dead: boolean },
  ): void {
    this.under.clear();
    this.over.clear();
    if (state.dead) return;
    if (state.levitating) {
      const { offsetY, width, height, color, alpha, pulseMs } = EVOLUTION_VISUAL.levitation;
      const pulse = 0.75 + 0.25 * Math.sin(((now % pulseMs) / pulseMs) * Math.PI * 2);
      this.under.fillStyle(color, alpha * pulse).fillEllipse(hero.x, hero.y + offsetY, width * pulse, height);
    }
    if (state.trail.length > 0) {
      const { color, core, width } = EVOLUTION_VISUAL.stormTrail;
      const flicker = Math.random() < 0.5 ? 1 : 0.6;
      for (let i = 1; i < state.trail.length; i++) {
        const a = state.trail[i - 1]?.at;
        const b = state.trail[i]?.at;
        if (!a || !b || Math.hypot(a.x - b.x, a.y - b.y) > 30) continue;
        this.under.lineStyle(width, color, 0.8 * flicker).lineBetween(a.x, a.y, b.x, b.y);
        this.under.lineStyle(1, core, flicker).lineBetween(a.x + (Math.random() - 0.5) * 3, a.y + (Math.random() - 0.5) * 3, b.x, b.y);
      }
    }
    if (state.shield > 0 && state.shieldMax > 0) {
      const { radius, color, alpha } = EVOLUTION_VISUAL.bloodShield;
      const fill = state.shield / state.shieldMax;
      this.over.lineStyle(1 + Math.round(fill * 2), color, alpha * (0.4 + 0.6 * fill)).strokeCircle(hero.x, hero.y, radius);
    }
    if (state.sparker) {
      const { radius, glowRadius, color, glow } = EVOLUTION_VISUAL.sparker;
      const p = HeroEvolutionView.sparkerPoint(hero, now);
      this.over.fillStyle(glow, 0.35).fillCircle(p.x, p.y, glowRadius);
      this.over.fillStyle(color, 1).fillCircle(p.x, p.y, radius);
    }
  }

  destroy(): void {
    this.under.destroy();
    this.over.destroy();
  }
}
