import Phaser from 'phaser';
import { MENU_LAYOUT, MENU_PALETTE as P } from '@/config/menuConfig';
import type { StartBoardLine, StartBoardTone } from '@/systems/startScoreboard';

const TONE_COLOR: Readonly<Record<StartBoardTone, string>> = {
  title: P.title,
  item: P.item,
  own: P.own,
  dim: P.textDim,
  warn: P.warn,
};

/**
 * Środek menu (krok 93): sekcje tablic wyników, każdy wiersz w kolorze swojego tonu.
 * Bez tła i ramki (krok 93a); czytelność na tle wieży daje cień tekstu.
 */
export class StartScoresPanel {
  private texts: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  /** Rysuje sekcje od góry panelu; poprzednie wiersze znikają. */
  show(sections: readonly (readonly StartBoardLine[])[]): void {
    for (const text of this.texts) text.destroy();
    this.texts = [];
    const L = MENU_LAYOUT.scores;
    let y = L.y + L.padY;
    for (const section of sections) {
      for (const line of section) {
        const text = this.scene.add.text(L.x + L.padX, y, line.text, {
          fontFamily: 'monospace',
          fontSize: `${L.fontSize}px`,
          color: TONE_COLOR[line.tone],
        });
        text.setShadow(1, 1, P.textShadow, L.shadowBlur, false, true);
        if (line.tone === 'title') text.setLetterSpacing(1);
        // Za długi wiersz (długie imię i wynik) zwężamy, zamiast wychodzić poza panel.
        const room = L.width - 2 * L.padX;
        if (text.width > room) text.setScale(room / text.width, 1);
        this.texts.push(text);
        y += L.lineStep;
      }
      y += L.sectionGap;
    }
  }
}
