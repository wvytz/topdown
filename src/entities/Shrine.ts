import Phaser from 'phaser';
import { UiText, uiText } from '@/ui/UiText';
import { LOOT_ATLAS, LOOT_FRAMES, lootAnimationKey } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';

/** Widok kapliczki: postument + podpowiedź nad nim. Zasady ofiary są w systems/Shrine.ts. */
export class Shrine extends Phaser.GameObjects.Sprite {
  private readonly prompt: UiText;
  private used = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, LOOT_ATLAS.key, LOOT_FRAMES.shrineActive[0]);
    scene.add.existing(this);
    this.setDepth(RENDER_DEPTH.shrine);

    this.prompt = uiText(scene, x, y - 30, '', { color: '#ffe08a', align: 'center' })
      .setOrigin(0.5, 1)
      .setDepth(RENDER_DEPTH.worldText)
      .setVisible(false);

    // Puls kuli: 4 klatki w 6 kl./s zamiast przezroczystości (STYLEGUIDE: piksele pełne).
    this.play(lootAnimationKey('shrineActive'));
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
    this.stop();
    this.setFrame(LOOT_FRAMES.shrineUsed[0]!);
    this.hidePrompt();
  }
}
