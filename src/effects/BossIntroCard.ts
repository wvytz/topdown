import Phaser from 'phaser';
import type { BossPortrait } from '@/core/types';
import { BOSS_INTRO_CARD } from '@/config/bossPresentationConfig';
import { introCardFrame } from '@/systems/BossPresentation';
import { display } from '@/input/DisplayControls';

/** Karta leży nad resztą HUD-u (paski, napisy). */
const CARD_DEPTH = 20;

/** Co pokazuje karta: imię (albo nazwa duetu), tytuł i portrety. */
export interface IntroCardContent {
  readonly name: string;
  readonly title: string;
  readonly portraits: readonly BossPortrait[];
}

/** Wyłącznik z adresu: `?bossCard=0` — dawna plansza z napisem. */
export function introCardEnabled(): boolean {
  if (!BOSS_INTRO_CARD.enabled) return false;
  try {
    return new URLSearchParams(window.location.search).get('bossCard') !== '0';
  } catch {
    return true;
  }
}

/**
 * Karta wejścia bossa (krok U6) w scenie HUD: ciemny pas z czerwonymi krawędziami przez cały ekran, portret
 * bossa (najpierw sylwetka, potem odsłonięcie) i imię z tytułem. Gra w tym czasie trwa, karta tylko przelatuje.
 */
export class BossIntroCard {
  private readonly band: Phaser.GameObjects.Graphics;
  private readonly caption: Phaser.GameObjects.Text;
  private readonly name: Phaser.GameObjects.Text;
  private readonly title: Phaser.GameObjects.Text;
  private portraits: Phaser.GameObjects.Image[] = [];
  private startedAt = -Infinity;
  private revealed = false;
  private flashUntil = -Infinity;

  constructor(private readonly scene: Phaser.Scene, style: Phaser.Types.GameObjects.Text.TextStyle) {
    const c = BOSS_INTRO_CARD;
    this.band = scene.add.graphics().setDepth(CARD_DEPTH);
    this.caption = scene.add.text(0, 0, '', { ...style, fontSize: '11px', color: c.colors.caption, strokeThickness: 3 });
    this.name = scene.add.text(0, 0, '', { ...style, fontSize: '30px', color: c.colors.name, strokeThickness: 6 });
    this.title = scene.add.text(0, 0, '', { ...style, fontSize: '15px', color: c.colors.title, strokeThickness: 4 });
    for (const part of [this.caption, this.name, this.title]) part.setOrigin(0, 0.5).setAlpha(0).setDepth(CARD_DEPTH + 2);
  }

  show(content: IntroCardContent, now: number): void {
    const c = BOSS_INTRO_CARD;
    for (const image of this.portraits) image.destroy();
    this.portraits = content.portraits
      .filter((p) => this.scene.textures.exists(p.texture))
      .map((p) => this.scene.add.image(0, 0, p.texture, p.frame).setScale(c.portraitScale).setAlpha(0));
    this.caption.setText(content.portraits.length > 1 ? c.captionDuet : c.caption);
    this.name.setText(content.name);
    this.title.setText(content.title);
    this.startedAt = now;
    this.revealed = false;
  }

  update(now: number): void {
    const c = BOSS_INTRO_CARD;
    const frame = introCardFrame(now - this.startedAt, c);
    const g = this.band.clear();
    if (!frame.visible) {
      if (this.portraits.length > 0) {
        for (const image of this.portraits) image.destroy();
        this.portraits = [];
      }
      for (const part of [this.caption, this.name, this.title]) part.setAlpha(0);
      return;
    }
    const width = this.scene.scale.width;
    const cx = width / 2;
    const half = c.bandHeight / 2;
    const bandWidth = width * frame.band;
    const left = cx - bandWidth / 2;
    g.fillStyle(c.colors.band, c.colors.bandAlpha).fillRect(left, c.bandY - half, bandWidth, c.bandHeight);
    g.fillStyle(c.colors.edge, 1).fillRect(left, c.bandY - half - 2, bandWidth, 2).fillRect(left, c.bandY + half, bandWidth, 2);
    g.fillStyle(c.colors.edgeInner, 1).fillRect(left, c.bandY - half, bandWidth, 1).fillRect(left, c.bandY + half - 1, bandWidth, 1);

    const shift = frame.slide * c.slidePx;
    const textX = cx + c.textOffsetX + shift;
    this.caption.setPosition(textX, c.bandY - 26).setAlpha(frame.alpha);
    this.name.setPosition(textX, c.bandY - 4).setAlpha(frame.alpha);
    this.title.setPosition(textX, c.bandY + 24).setAlpha(frame.alpha);

    if (frame.revealed && !this.revealed) {
      this.revealed = true;
      // Odsłonięcie: jedna krótka klatka bieli (STYLEGUIDE §13.5), przy „mniej błysków” — bez niej.
      if (!display.settings.reduceFlashes) this.flashUntil = now + c.revealFlashMs;
    }
    const flashing = now < this.flashUntil;
    this.portraits.forEach((image, i) => {
      // Portrety duetu stoją jeden za drugim, pierwszy bliżej tekstu; stopami na dolnej krawędzi pasa.
      const x = cx + c.portraitOffsetX - i * c.portraitGapPx - shift * 0.5;
      image.setPosition(x, c.bandY + half - image.displayHeight / 2 + 10).setAlpha(frame.alpha).setDepth(CARD_DEPTH + 1 - i * 0.1);
          if (flashing) image.setTintFill(0xffffff);
      else if (this.revealed) image.clearTint();
      else image.setTintFill(c.colors.silhouette);
    });
  }
}
