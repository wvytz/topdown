import Phaser from 'phaser';
import { UI_PALETTE } from '@/config/uiConfig';
import { drawFrame } from '@/ui/UiFrame';

/**
 * Prostokąt w pikselowej ramce (krok U7): zachowuje się jak zwykły prostokąt Phasera (kliknięcia, `setFillStyle`,
 * `setStrokeStyle`), ale sam jest niewidoczny, a rysuje go ramka z obrysem i nitami (`drawFrame`) pod spodem.
 * Dzięki temu karty i zakładki ekranów wyboru dostają nowy wygląd bez zmiany ich logiki.
 */
export class FrameRect extends Phaser.GameObjects.Rectangle {
  private art: Phaser.GameObjects.Graphics | null = null;
  private fill: number;
  private fillAlphaValue = 1;
  private edge: number = UI_PALETTE.edge;
  private highlighted = false;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, fill: number) {
    super(scene, x, y, width, height, 0x000000, 0);
    this.fill = fill;
    this.art = scene.add.graphics();
    this.redraw();
  }

  override setFillStyle(color?: number, alpha?: number): this {
    if (this.art) {
      if (color !== undefined) this.fill = color;
      if (alpha !== undefined) this.fillAlphaValue = alpha;
      this.redraw();
    }
    return super.setFillStyle(0x000000, 0);
  }

  /** Grubość jest pomijana — ramka ma zawsze 1 px obrysu i 1 px barwy. Jasna barwa = wyróżnienie (nity). */
  override setStrokeStyle(_lineWidth?: number, color?: number): this {
    if (this.art && color !== undefined) {
      this.highlighted = color !== this.edge && color !== UI_PALETTE.edge;
      this.edge = color;
      this.redraw();
    }
    return this;
  }

  override setAlpha(value?: number): this {
    this.art?.setAlpha(value ?? 1);
    return super.setAlpha(value);
  }

  override setVisible(value: boolean): this {
    this.art?.setVisible(value);
    return super.setVisible(value);
  }

  override destroy(fromScene?: boolean): void {
    this.art?.destroy();
    this.art = null;
    super.destroy(fromScene);
  }

  private redraw(): void {
    if (!this.art) return;
    const left = this.x - this.width * this.originX;
    const top = this.y - this.height * this.originY;
    this.art.clear();
    drawFrame(this.art, left, top, this.width, this.height, { fill: this.fill, fillAlpha: this.fillAlphaValue, edge: this.edge, rivets: this.highlighted ? this.edge : null });
  }
}

/** Dodaje do sceny prostokąt w pikselowej ramce. */
export function addFrameRect(scene: Phaser.Scene, x: number, y: number, width: number, height: number, fill: number): FrameRect {
  return scene.add.existing(new FrameRect(scene, x, y, width, height, fill));
}
