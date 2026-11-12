import Phaser from 'phaser';
import { toFontText } from '@/core/pixelFont';
import { UI_TEXT_COLORS, type UiTextSize } from '@/config/uiConfig';
import { pixelFontKey } from '@/ui/PixelFont';

export interface UiTextStyle {
  /** Całkowita skala pikseli fontu (1 = drobny, 2 = zwykły, 3 = tytuł…). */
  readonly size?: UiTextSize;
  /** Barwa CSS (`#rrggbb`) albo liczba. */
  readonly color?: string | number;
  readonly align?: 'left' | 'center' | 'right';
  /** Szerokość łamania linii w pikselach płótna (0 — bez łamania). */
  readonly wrap?: number;
  /** Dodatkowy odstęp między wierszami (piksele płótna). */
  readonly lineSpacing?: number;
  /** Dodatkowy odstęp między literami (piksele płótna). */
  readonly letterSpacing?: number;
}

const ALIGN = { left: 0, center: 1, right: 2 } as const;

/**
 * Napis interfejsu w pikselowym kroju (krok U7). To zwykły BitmapText Phasera z dwiema zmianami:
 * `setColor` przełącza teksturę fontu danej barwy, a `setText` zamienia znaki spoza fontu (é → e, inne → ?).
 */
export class UiText extends Phaser.GameObjects.BitmapText {
  constructor(scene: Phaser.Scene, x: number, y: number, text: string, style: UiTextStyle = {}) {
    super(scene, x, y, pixelFontKey(scene, style.color ?? UI_TEXT_COLORS.text), toFontText(text), style.size ?? 1, ALIGN[style.align ?? 'left']);
    if (style.wrap) this.setMaxWidth(style.wrap);
    if (style.lineSpacing) this.setLineSpacing(style.lineSpacing);
    if (style.letterSpacing) this.setLetterSpacing(style.letterSpacing);
  }

  /** Barwa napisu (CSS albo liczba). */
  setColor(color: string | number): this {
    const key = pixelFontKey(this.scene, color);
    if (key !== this.font) this.setFont(key);
    return this;
  }

  override setText(value: string | number | string[]): this {
    const text = Array.isArray(value) ? value.join('\n') : String(value);
    super.setText(toFontText(text));
    this.refreshHitArea();
    return this;
  }

  /** Pole kliknięcia większe od napisu o `x`, `y` z każdej strony (jak `setPadding` zwykłego tekstu); rośnie z napisem. */
  setHitPadding(x: number, y: number): this {
    this.hitPadding = { x, y };
    this.setInteractive({ hitArea: new Phaser.Geom.Rectangle(0, 0, 1, 1), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    this.refreshHitArea();
    return this;
  }

  private hitPadding: { x: number; y: number } | null = null;

  private refreshHitArea(): void {
    const pad = this.hitPadding;
    const area = this.input?.hitArea as Phaser.Geom.Rectangle | undefined;
    if (!pad || !area) return;
    const bounds = this.getTextBounds(true).local;
    area.setTo(bounds.x - pad.x, bounds.y - pad.y, bounds.width + pad.x * 2, bounds.height + pad.y * 2);
  }
}

/** Dodaje napis do sceny. */
export function uiText(scene: Phaser.Scene, x: number, y: number, text: string, style: UiTextStyle = {}): UiText {
  return scene.add.existing(new UiText(scene, Math.round(x), Math.round(y), text, style));
}

/** Rozmiar czcionki systemowej (px) → skala pikseli fontu; progi dobrane tak, by układ ekranów został podobny. */
export function sizeFromPx(px: number): UiTextSize {
  if (px <= 13) return 1;
  if (px <= 22) return 2;
  if (px <= 34) return 3;
  if (px <= 46) return 4;
  return 6;
}

/**
 * Przejście ze stylu tekstu Phasera (krok U7): rozmiar, barwa, wyrównanie, łamanie i odstęp wierszy przechodzą
 * na pikselowy krój; obrys i cień daje sam font.
 */
export function uiTextFromStyle(scene: Phaser.Scene, x: number, y: number, text: string | string[], style: Phaser.Types.GameObjects.Text.TextStyle = {}): UiText {
  const px = typeof style.fontSize === 'number' ? style.fontSize : Number.parseInt(String(style.fontSize ?? '13'), 10);
  const align = style.align === 'center' || style.align === 'right' ? style.align : 'left';
  const wrap = style.wordWrap?.width ?? 0;
  return uiText(scene, x, y, Array.isArray(text) ? text.join('\n') : text, {
    size: sizeFromPx(Number.isFinite(px) ? px : 13),
    color: typeof style.color === 'string' ? style.color : UI_TEXT_COLORS.text,
    align,
    wrap,
    ...(style.lineSpacing !== undefined && { lineSpacing: Number(style.lineSpacing) }),
  });
}
