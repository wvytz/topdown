import { SoundCue, sound } from '@/audio/SoundBoard';
import Phaser from 'phaser';
import { SceneKey } from '@/core/types';
import { MenuCommand } from '@/systems/gamepadInput';
import { bindPadMenu } from '@/input/PadMenuInput';

/** Jedna karta wyboru (krok Z4): brama Zejścia albo towar kupca. */
export interface ChoiceCard {
  readonly title: string;
  readonly subtitle?: string;
  readonly body?: string;
  /** Dolny napis karty (cena, „nagroda”). */
  readonly footer?: string;
  readonly accent: number;
  /** Ikona z atlasu (przedmiot u kupca). */
  readonly icon?: { readonly atlas: string; readonly frame: string };
  /** Karta widoczna, ale nie do wybrania (za mało złota, sprzedane). */
  readonly disabled?: boolean;
}

export interface ChoiceSceneData {
  readonly headline: string;
  readonly hint: string;
  readonly cards: readonly ChoiceCard[];
  /** Kto wybiera (co-op). */
  readonly picker?: string;
  readonly onPick: (index: number) => void;
  /** Esc / pad B; brak — wybór obowiązkowy. */
  readonly onCancel?: () => void;
}

const CARD_WIDTH = 190;
const CARD_HEIGHT = 230;
const CARD_GAP = 24;
const KEY_NAMES = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'] as const;
/** Przygaszenie kart na starcie — chroni przed przypadkowym wyborem przytrzymanym klawiszem (jak karty za bossa). */
const ARM_DELAY_MS = 350;

/**
 * Nakładka wyboru z kart (krok Z4) — wspólna dla bram Zejścia i kupca. GameScene jest w tym czasie wstrzymana.
 * Mysz (pełne kliknięcie na karcie), klawisze 1–5, pad (← → i A, B — wyjście) i dotyk (stuknięcie karty).
 */
export class ChoiceScene extends Phaser.Scene {
  private picked = false;
  private armed = false;
  private pressedCard: number | null = null;
  private readonly armedKeys = new Set<number>();
  private frames: { readonly frame: Phaser.GameObjects.Rectangle; readonly accent: number; readonly enabled: boolean }[] = [];
  private padCard: number | null = null;

  constructor() {
    super(SceneKey.Choice);
  }

  create(data: ChoiceSceneData): void {
    this.picked = false;
    this.armed = false;
    this.pressedCard = null;
    this.armedKeys.clear();
    this.frames = [];
    this.padCard = null;

    const { width, height } = this.scale;
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'monospace', color: '#e8e8f0', stroke: '#000000', strokeThickness: 4, align: 'center' };
    this.add.rectangle(width / 2, height / 2, width, height, 0x05050a, 0.78);
    this.add.text(width / 2, 70, data.headline, { ...style, fontSize: '26px', color: '#f5c542' }).setOrigin(0.5);
    this.add.text(width / 2, 104, data.hint, { ...style, fontSize: '13px', color: '#c8c8d8', wordWrap: { width: width - 40 } }).setOrigin(0.5);
    if (data.picker) this.add.text(width / 2, 130, data.picker, { ...style, fontSize: '15px', color: '#8affa0' }).setOrigin(0.5);

    const count = data.cards.length;
    const cardWidth = Math.min(CARD_WIDTH, (width - 24 - (count - 1) * CARD_GAP) / count);
    const total = count * cardWidth + (count - 1) * CARD_GAP;
    const left = (width - total) / 2 + cardWidth / 2;
    const parts: Phaser.GameObjects.GameObject[] = [];
    data.cards.forEach((card, index) => {
      parts.push(...this.createCard(left + index * (cardWidth + CARD_GAP), height / 2 + 30, cardWidth, card, index, data, style));
      const keyName = KEY_NAMES[index];
      if (!keyName) return;
      this.input.keyboard?.on(`keydown-${keyName}`, () => {
        if (this.armed) this.armedKeys.add(index);
      });
      this.input.keyboard?.on(`keyup-${keyName}`, () => {
        if (this.armedKeys.has(index)) this.pick(index, data);
      });
    });
    if (data.onCancel) {
      this.input.keyboard?.on('keydown-ESC', () => this.cancel(data));
      this.add
        .text(width / 2, height - 28, 'Esc / B — wyjdź', { ...style, fontSize: '12px', color: '#8080a0' })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.POINTER_UP, () => this.cancel(data));
    }
    bindPadMenu(this, (command) => this.onPadCommand(command, data));

    for (const part of parts) (part as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0.35);
    this.tweens.add({ targets: parts, alpha: 1, duration: ARM_DELAY_MS, ease: 'Quad.easeIn', onComplete: () => (this.armed = true) });
  }

  private createCard(
    x: number,
    y: number,
    width: number,
    card: ChoiceCard,
    index: number,
    data: ChoiceSceneData,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.GameObject[] {
    const enabled = card.disabled !== true;
    const top = y - CARD_HEIGHT / 2;
    const text = (size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle => ({ ...style, fontSize: `${size}px`, color, wordWrap: { width: width - 18 } });
    const frame = this.add
      .rectangle(x, y, width, CARD_HEIGHT, 0x1a1a24, 0.96)
      .setStrokeStyle(2, enabled ? card.accent : 0x40404c)
      .setInteractive({ useHandCursor: enabled });
    const hex = `#${card.accent.toString(16).padStart(6, '0')}`;
    const parts: Phaser.GameObjects.GameObject[] = [
      frame,
      this.add.text(x - width / 2 + 8, top + 8, `[${index + 1}]`, text(12, '#8080a0')).setOrigin(0, 0),
      this.add.text(x, top + 30, card.title, text(16, enabled ? '#ffffff' : '#808090')).setOrigin(0.5, 0),
    ];
    let cursor = top + 58;
    if (card.icon) {
      parts.push(this.add.image(x, cursor + 22, card.icon.atlas, card.icon.frame).setScale(3));
      cursor += 52;
    }
    if (card.subtitle) {
      parts.push(this.add.text(x, cursor, card.subtitle, text(14, enabled ? hex : '#707080')).setOrigin(0.5, 0));
      cursor += 26;
    }
    if (card.body) parts.push(this.add.text(x, cursor, card.body, text(12, '#d0d0dc')).setOrigin(0.5, 0));
    if (card.footer) parts.push(this.add.text(x, top + CARD_HEIGHT - 26, card.footer, text(13, enabled ? '#f5c542' : '#ff8080')).setOrigin(0.5, 0));

    this.frames.push({ frame, accent: card.accent, enabled });
    frame.on(Phaser.Input.Events.POINTER_OVER, () => {
      if (this.armed && enabled) this.highlight(index, true);
    });
    frame.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.highlight(index, false);
      if (this.pressedCard === index) this.pressedCard = null;
    });
    frame.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.armed) this.pressedCard = index;
    });
    frame.on(Phaser.Input.Events.POINTER_UP, () => {
      if (this.pressedCard === index) this.pick(index, data);
    });
    return parts;
  }

  private highlight(index: number, on: boolean): void {
    const card = this.frames[index];
    if (!card) return;
    if (on && card.enabled) card.frame.setFillStyle(0x2a2a3a, 0.98).setStrokeStyle(3, 0xffffff);
    else card.frame.setFillStyle(0x1a1a24, 0.96).setStrokeStyle(2, card.enabled ? card.accent : 0x40404c);
  }

  private onPadCommand(command: MenuCommand, data: ChoiceSceneData): void {
    if (!this.armed || this.picked) return;
    if (command === MenuCommand.Back) {
      this.cancel(data);
      return;
    }
    const count = data.cards.length;
    if (command === MenuCommand.Left || command === MenuCommand.Right) {
      const step = command === MenuCommand.Left ? -1 : 1;
      const next = this.padCard === null ? (step > 0 ? 0 : count - 1) : (this.padCard + step + count) % count;
      if (this.padCard !== null) this.highlight(this.padCard, false);
      this.padCard = next;
      this.highlight(next, true);
      sound.play(SoundCue.UiMove);
      return;
    }
    if (command === MenuCommand.Confirm && this.padCard !== null) this.pick(this.padCard, data);
  }

  private pick(index: number, data: ChoiceSceneData): void {
    if (this.picked || !this.armed || !this.frames[index]?.enabled) return;
    this.picked = true;
    sound.play(SoundCue.UiConfirm);
    this.scene.stop();
    data.onPick(index);
  }

  private cancel(data: ChoiceSceneData): void {
    if (this.picked || !data.onCancel) return;
    this.picked = true;
    this.scene.stop();
    data.onCancel();
  }
}
