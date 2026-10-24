import Phaser from 'phaser';
import { MENU_LAYOUT, MENU_PALETTE as P } from '@/config/menuConfig';
import { heroIconTexture } from '@/effects/heroIcon';
import type { StartBoardLine, StartBoardTone } from '@/systems/startScoreboard';

const TONE_COLOR: Readonly<Record<StartBoardTone, string>> = {
  title: P.title,
  item: P.item,
  own: P.own,
  dim: P.textDim,
  warn: P.warn,
};

/**
 * Środek menu (krok 94): sekcje tablic wyników, każdy wiersz w kolorze swojego tonu.
 * Bez tła i ramki (krok 94a); czytelność na tle wieży daje cień tekstu.
 * Tytuł i wiersze bez wyniku stoją na środku; wiersze wyników to wyśrodkowany blok z miniaturkami bohaterów (krok 94b).
 */
export class StartScoresPanel {
  private objects: Phaser.GameObjects.GameObject[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  /** Rysuje sekcje od góry; poprzednie wiersze znikają. */
  show(sections: readonly (readonly StartBoardLine[])[]): void {
    for (const object of this.objects) object.destroy();
    this.objects = [];
    const L = MENU_LAYOUT.scores;
    const centerX = L.x + L.width / 2;
    const iconSpace = L.icon.sizePx + L.icon.gapPx;
    let y = L.y + L.padY;
    for (const section of sections) {
      const texts = section.map((line, i) => {
        const text = this.scene.add.text(0, y + i * L.lineStep, line.text, {
          fontFamily: 'monospace',
          fontSize: `${L.fontSize}px`,
          color: TONE_COLOR[line.tone],
        });
        text.setShadow(1, 1, P.textShadow, L.shadowBlur, false, true);
        if (line.tone === 'title') text.setLetterSpacing(1);
        // Za długi wiersz (długie imię i wynik) zwężamy, zamiast wychodzić poza środek menu.
        const room = L.width - 2 * L.padX - (line.hero === undefined ? 0 : iconSpace);
        if (text.width > room) text.setScale(room / text.width, 1);
        this.objects.push(text);
        return text;
      });
      // Blok wierszy wyników: miniaturki w jednej kolumnie przed najszerszym wierszem.
      const widest = Math.max(0, ...texts.filter((_, i) => section[i]?.hero !== undefined).map((t) => t.displayWidth));
      const blockLeft = centerX - (iconSpace + widest) / 2;
      section.forEach((line, i) => {
        const text = texts[i]!;
        if (line.hero === undefined) {
          text.setX(centerX - text.displayWidth / 2);
          return;
        }
        text.setX(blockLeft + iconSpace);
        if (line.hero === null) return;
        const icon = this.scene.add.image(blockLeft + L.icon.sizePx / 2, text.y + text.height / 2, heroIconTexture(this.scene, line.hero, L.icon));
        this.objects.push(icon);
      });
      y += section.length * L.lineStep + L.sectionGap;
    }
  }
}
