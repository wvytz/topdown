import Phaser from 'phaser';

/** Krótkie, czysto wizualne efekty walki (bez wpływu na logikę). */
export class CombatEffects {
  constructor(private readonly scene: Phaser.Scene) {}

  slash(x: number, y: number, angle: number, range: number, arcRadians: number): void {
    const g = this.scene.add.graphics().setDepth(12);
    g.fillStyle(0xffffff, 0.35);
    g.slice(x, y, range, angle - arcRadians / 2, angle + arcRadians / 2, false);
    g.fillPath();
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 120, onComplete: () => g.destroy() });
  }

  deathBurst(x: number, y: number, color: number, radius: number): void {
    const circle = this.scene.add.circle(x, y, radius, color, 0.8).setDepth(8);
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
    const circle = this.scene.add.circle(x, y, radius, 0xffd0a0, 0.45).setDepth(6);
    this.scene.tweens.add({ targets: circle, alpha: 0, duration: 180, onComplete: () => circle.destroy() });
  }

  /** Unoszący się napis (np. „+3” złota) nad miejscem zdarzenia. */
  floatingText(x: number, y: number, text: string, color: string): void {
    const label = this.scene.add
      .text(x, y - 8, text, { fontFamily: 'monospace', fontSize: '11px', color, stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(20);
    this.scene.tweens.add({ targets: label, y: y - 30, alpha: 0, duration: 700, onComplete: () => label.destroy() });
  }

  playerHit(): void {
    this.scene.cameras.main.shake(100, 0.004);
  }
}
