import Phaser from 'phaser';
import { TextureKey } from '@/core/types';

/** Widok kapliczki: postument + podpowiedź nad nim. Zasady ofiary są w systems/Shrine.ts. */
export class Shrine extends Phaser.GameObjects.Image {
  private readonly prompt: Phaser.GameObjects.Text;
  private readonly glow: Phaser.Tweens.Tween;
  private used = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TextureKey.Shrine);
    scene.add.existing(this);
    this.setDepth(6);

    this.prompt = scene.add
      .text(x, y - 30, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffe08a',
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setDepth(20)
      .setVisible(false);

    this.glow = scene.tweens.add({ targets: this, alpha: 0.75, duration: 900, yoyo: true, repeat: -1 });
  }

  get isUsed(): boolean {
    return this.used;
  }

  showPrompt(text: string, color: string): void {
    this.prompt.setText(text).setColor(color).setVisible(true);
  }

  hidePrompt(): void {
    this.prompt.setVisible(false);
  }

  markUsed(): void {
    this.used = true;
    this.glow.stop();
    this.setTexture(TextureKey.ShrineUsed).setAlpha(1);
    this.hidePrompt();
  }
}
