import type Phaser from 'phaser';
import { BOSS_PHASE_MARKS } from '@/config/bossPresentationConfig';

/** Pasek HP bossa na ekranie (px HUD). */
export interface PhaseBarRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Widoczne fazy (krok U6): kreski progów na pasku HP bossa. Próg jeszcze przed graczem — jasna kreska
 * wystająca ponad pasek; przekroczony — przygaszona. `flash` (0–1) rozjaśnia ostatnio przekroczony próg.
 */
export function drawPhaseMarks(
  g: Phaser.GameObjects.Graphics,
  bar: PhaseBarRect,
  marks: readonly number[],
  hpRatio: number,
  flash: { readonly mark: number; readonly strength: number } | null,
): void {
  const c = BOSS_PHASE_MARKS;
  for (const mark of marks) {
    const x = Math.round(bar.x + bar.width * mark - c.tickWidth / 2);
    const passed = hpRatio <= mark;
    const over = passed ? 0 : c.tickOverhang;
    g.fillStyle(passed ? c.passedColor : c.tickColor, passed ? c.passedAlpha : 1).fillRect(x, bar.y - over, c.tickWidth, bar.height + over * 2);
    if (flash && flash.mark === mark && flash.strength > 0) {
      // Rozbłysk progu: biała kreska szersza o 2 px i poświata całego paska, gasną skokowo (4 stopnie).
      const step = Math.ceil(flash.strength * 4) / 4;
      g.fillStyle(c.flashColor, step).fillRect(x - 2, bar.y - c.tickOverhang - 2, c.tickWidth + 4, bar.height + c.tickOverhang * 2 + 4);
      g.fillStyle(c.flashColor, step * 0.35).fillRect(bar.x, bar.y, bar.width * hpRatio, bar.height);
    }
  }
}
