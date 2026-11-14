import Phaser from 'phaser';
import type { BossPortrait } from '@/core/types';
import { BOSS_INTRO_CARD } from '@/config/bossPresentationConfig';
import { introCardFrame } from '@/systems/BossPresentation';
import { display } from '@/input/DisplayControls';
import { UiText, uiText } from '@/ui/UiText';

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
  private readonly caption: UiText;
  private readonly name: UiText;
  private readonly title: UiText;
  private portraits: Phaser.GameObjects.Image[] = [];
  private startedAt = -Infinity;
  private revealed = false;
  private flashUntil = -Infinity;

  constructor(private readonly scene: Phaser.Scene) {
    const c = BOSS_INTRO_CARD;
    this.band = scene.add.graphics().setDepth(CARD_DEPTH);
    // Krok U7: pikselowy krój — podpis drobny, imię w skali 4, tytuł w skali 2.
    this.caption = uiText(scene, 0, 0, '', { color: c.colors.caption, letterSpacing: 2 });
    this.name = uiText(scene, 0, 0, '', { size: 4, color: c.colors.name });
    this.title = uiText(scene, 0, 0, '', { size: 2, color: c.colors.title });
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
    this.caption.setPosition(Math.round(textX), c.bandY - 28).setAlpha(frame.alpha);
    this.name.setPosition(Math.round(textX), c.bandY - 6).setAlpha(frame.alpha);
    this.title.setPosition(Math.round(textX), c.bandY + 22).setAlpha(frame.alpha);

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
