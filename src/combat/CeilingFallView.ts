import type Phaser from 'phaser';
import type { Vector2 } from '@/core/types';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { SPRITE_SHEETS } from '@/config/spriteConfig';
import type { SpriteSheetId } from '@/config/spriteConfig';
import { sheetFrameIndex } from '@/systems/Facing';

/** Kolor cienia = obrys postaci (STYLEGUIDE §6), stała alfa cieni. */
const SHADOW_COLOR = 0x1b1a22;
const SHADOW_ALPHA = 0.4;
const TELEGRAPH_COLOR = 0xff4040;
/** Biała nić, na której spada pająk (paleta leża). */
const THREAD_COLOR = 0xe9e3f0;
/** Wysokość (px), z której zaczyna się widoczny spadek. */
const FALL_HEIGHT = 64;
/** Stopa sprite'a na środku cienia (pająk patrzy w dół — wiersz S). */
const FALLING_ROW = 4;

/**
 * Widok pająka spadającego z sufitu: rosnący cień (opcjonalnie z czerwonym obrysem strefy obrażeń),
 * a w końcówce pająk zjeżdżający na nici. Wspólny dla zrzutów leża (krok 23c) i wylęgu Matki Pająków (krok 26).
 */
export class CeilingFallView {
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly thread: Phaser.GameObjects.Graphics;
  private readonly faller: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    private readonly at: Vector2,
    sheetId: SpriteSheetId,
    /** Nić, na której zjeżdża (pająki); żuk wiedźmy (krok 137) spada bez nici. */
    private readonly withThread = true,
  ) {
    const sheet = SPRITE_SHEETS[sheetId];
    const frame = sheetFrameIndex(FALLING_ROW, 0, sheet.sheetWidth / sheet.frameWidth);
    this.shadow = scene.add.graphics().setDepth(RENDER_DEPTH.telegraph);
    this.thread = scene.add.graphics().setDepth(RENDER_DEPTH.projectile);
    this.faller = scene.add.image(at.x, at.y, sheet.key, frame).setDepth(RENDER_DEPTH.projectile).setVisible(false);
  }

  /**
   * `shadowRadius` — bieżący promień cienia; `zoneRadius` — obrys strefy obrażeń (null = bez obrysu);
   * `fall` — postęp widocznego spadku 0..1 (null = pająka jeszcze nie widać).
   */
  draw(shadowRadius: number, zoneRadius: number | null, fall: number | null): void {
    const { x, y } = this.at;
    this.shadow.clear();
    if (zoneRadius !== null) this.shadow.lineStyle(1, TELEGRAPH_COLOR, 0.6).strokeCircle(x, y, zoneRadius);
    // Cień w rzucie z góry: elipsa spłaszczona jak cienie postaci.
    this.shadow.fillStyle(SHADOW_COLOR, SHADOW_ALPHA).fillEllipse(x, y, shadowRadius * 2, shadowRadius * 1.3);

    this.thread.clear();
    if (fall === null) {
      this.faller.setVisible(false);
      return;
    }
    const height = Math.round(FALL_HEIGHT * (1 - Math.min(1, Math.max(0, fall))));
    this.faller.setVisible(true).setPosition(Math.round(x), Math.round(y - height));
    if (!this.withThread) return;
    this.thread
      .lineStyle(1, THREAD_COLOR, 0.8)
      .lineBetween(Math.round(x), Math.round(y - height - FALL_HEIGHT), Math.round(x), Math.round(y - height));
  }

  destroy(): void {
    this.shadow.destroy();
    this.thread.destroy();
    this.faller.destroy();
  }
}
