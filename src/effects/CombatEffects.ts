import Phaser from 'phaser';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { NOVA_VISUAL, ORB_SPLASH_VISUAL } from '@/config/spriteConfig';

/** Krótkie, czysto wizualne efekty walki (bez wpływu na logikę). */
export class CombatEffects {
  constructor(private readonly scene: Phaser.Scene) {}

  slash(x: number, y: number, angle: number, range: number, arcRadians: number): void {
    const g = this.scene.add.graphics().setDepth(RENDER_DEPTH.slash);
    g.fillStyle(0xffffff, 0.35);
    g.slice(x, y, range, angle - arcRadians / 2, angle + arcRadians / 2, false);
    g.fillPath();
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 120, onComplete: () => g.destroy() });
  }

  deathBurst(x: number, y: number, color: number, radius: number): void {
    const circle = this.scene.add.circle(x, y, radius, color, 0.8).setDepth(RENDER_DEPTH.deathBurst);
    this.scene.tweens.add({
      targets: circle,
      scale: 2.2,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => circle.destroy(),
    });
  }

  /** Błysk uderzenia strefy obszarowej. */
  impact(x: number, y: number, radius: number): void {
    const circle = this.scene.add.circle(x, y, radius, 0xffd0a0, 0.45).setDepth(RENDER_DEPTH.groundFlash);
    this.scene.tweens.add({ targets: circle, alpha: 0, duration: 180, onComplete: () => circle.destroy() });
  }

  /** Rozprysk kuli Czarodziejki (krok 50): pierścień energii w promieniu rozprysku, szybko gaśnie. */
  splash(x: number, y: number, radius: number): void {
    const { color, alpha, fillAlpha, durationMs } = ORB_SPLASH_VISUAL;
    const ring = this.scene.add.circle(x, y, radius, color, fillAlpha).setStrokeStyle(2, color, alpha).setDepth(RENDER_DEPTH.groundFlash);
    this.scene.tweens.add({ targets: ring, alpha: 0, scale: 1.15, duration: durationMs, onComplete: () => ring.destroy() });
  }

  /** Fala uderzeniowa Czarodziejki (krok 97): pierścień rozchodzi się od niej do promienia fali. */
  nova(x: number, y: number, radius: number): void {
    const { color, core, alpha, fillAlpha, startScale, durationMs } = NOVA_VISUAL;
    const ring = this.scene.add.circle(x, y, radius, color, fillAlpha).setStrokeStyle(3, core, alpha).setDepth(RENDER_DEPTH.groundFlash);
    ring.setScale(startScale);
    this.scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: durationMs, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
  }

  /** Unoszący się napis (np. „+3” złota) nad miejscem zdarzenia. */
  floatingText(x: number, y: number, text: string, color: string): void {
    const label = this.scene.add
      .text(x, y - 8, text, { fontFamily: 'monospace', fontSize: '11px', color, stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(RENDER_DEPTH.worldText);
    this.scene.tweens.add({ targets: label, y: y - 30, alpha: 0, duration: 700, onComplete: () => label.destroy() });
  }

  playerHit(): void {
    this.scene.cameras.main.shake(100, 0.004);
  }
}
