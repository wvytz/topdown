import { SoundCue, sound } from '@/audio/SoundBoard';
import Phaser from 'phaser';
import type { ItemId } from '@/core/lootTypes';
import { ItemKind } from '@/core/lootTypes';
import { SceneKey } from '@/core/types';
import { BOSS_REWARD, ITEM_DEFINITIONS } from '@/config/lootConfig';
import { itemIconFrame } from '@/entities/Pickup';
import { LOOT_ATLAS } from '@/config/spriteConfig';
import { MenuCommand } from '@/systems/gamepadInput';
import { bindPadMenu } from '@/input/PadMenuInput';

export interface RewardSceneData {
  readonly choices: readonly ItemId[];
  /** Ile kopii każdego przedmiotu gracz już ma (do opisu karty). */
  readonly owned: Readonly<Partial<Record<ItemId, number>>>;
  readonly onPick: (itemId: ItemId) => void;
  /** Co-op (etap C4): kto teraz wybiera, np. „P2 — Łucznik wybiera”. */
  readonly picker?: string;
}

const CARD_WIDTH = 210;
const CARD_HEIGHT = 250;
const CARD_GAP = 28;
const KEY_NAMES = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'] as const;
const DIMMED_ALPHA = 0.35;

/**
 * Nakładka wyboru nagrody za bossa. GameScene jest w tym czasie wstrzymana.
 *
 * Ochrona przed przypadkowym wyborem (gracz zwykle trzyma LPM w walce, gdy boss pada):
 * - przez `armDelayMs` karty są przygaszone i nie reagują;
 * - potem karta wymaga pełnego kliknięcia: wciśnięcia I puszczenia przycisku na tej samej karcie;
 * - klawisz 1–3 musi zostać wciśnięty po uaktywnieniu kart (puszczenie starego wciśnięcia nie liczy się).
 * - pad (krok 95): ← → zaznacza kartę, A wybiera; liczy się tylko A wciśnięte po uaktywnieniu kart.
 */
export class RewardScene extends Phaser.Scene {
  private picked = false;
  private armed = false;
  /** Karta, na której wciśnięto przycisk po uaktywnieniu (wybór następuje przy puszczeniu na tej samej). */
  private pressedCard: number | null = null;
  /** Klawisze wciśnięte po uaktywnieniu kart. */
  private readonly armedKeys = new Set<number>();
  private cardObjects: Phaser.GameObjects.GameObject[] = [];
  private hintText!: Phaser.GameObjects.Text;
  /** Ramki kart i ich kolor obwódki — do podświetlenia (mysz, pad). */
  private cards: { readonly frame: Phaser.GameObjects.Rectangle; readonly accent: number }[] = [];
  /** Karta zaznaczona padem; null — pad jeszcze nie wybierał. */
  private padCard: number | null = null;

  constructor() {
    super(SceneKey.Reward);
  }

  create(data: RewardSceneData): void {
    this.picked = false;
    this.armed = false;
    this.pressedCard = null;
    this.armedKeys.clear();
    this.cardObjects = [];
    this.cards = [];
    this.padCard = null;

    const { width, height } = this.scale;
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      color: '#e8e8f0',
      stroke: '#000000',
      strokeThickness: 4,
    };

    this.add.rectangle(width / 2, height / 2, width, height, 0x05050a, 0.78);
    this.add.text(width / 2, 70, 'STRAŻNIK POKONANY', { ...style, fontSize: '28px', color: '#f5c542' }).setOrigin(0.5);
    this.hintText = this.add
      .text(width / 2, 108, '…', { ...style, fontSize: '14px', color: '#8080a0' })
      .setOrigin(0.5);
    if (data.picker) this.add.text(width / 2, 136, data.picker, { ...style, fontSize: '16px', color: '#8affa0' }).setOrigin(0.5);

    const total = data.choices.length * CARD_WIDTH + (data.choices.length - 1) * CARD_GAP;
    const left = (width - total) / 2 + CARD_WIDTH / 2;
    data.choices.forEach((itemId, index) => {
      this.createCard(left + index * (CARD_WIDTH + CARD_GAP), height / 2 + 40, itemId, index, data, style);
      const keyName = KEY_NAMES[index];
      if (!keyName) return;
      this.input.keyboard?.on(`keydown-${keyName}`, () => {
        if (this.armed) this.armedKeys.add(index);
      });
      this.input.keyboard?.on(`keyup-${keyName}`, () => {
        if (this.armedKeys.has(index)) this.pick(itemId, data);
      });
    });

    bindPadMenu(this, (command) => this.onPadCommand(command, data));

    // Przygaszone karty rozjaśniają się; aktywne stają się dokładnie wtedy, gdy są w pełni widoczne.
    this.tweens.add({
      targets: this.cardObjects,
      alpha: 1,
      duration: BOSS_REWARD.armDelayMs,
      ease: 'Quad.easeIn',
      onComplete: () => this.arm(),
    });
  }

  private arm(): void {
    this.armed = true;
    this.hintText.setText('Wybierz nagrodę — kliknij kartę albo naciśnij 1–3 (pad: ← → i A)').setColor('#c8c8d8');
  }

  private createCard(
    x: number,
    y: number,
    itemId: ItemId,
    index: number,
    data: RewardSceneData,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): void {
    const item = ITEM_DEFINITIONS[itemId];
    const isEffect = item.kind === ItemKind.Effect;
    const accent = isEffect ? 0xf5c542 : 0xa0a0b8;
    const owned = data.owned[itemId] ?? 0;
    const top = y - CARD_HEIGHT / 2;

    const card = this.add
      .rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, 0x1a1a24, 0.96)
      .setStrokeStyle(2, accent)
      .setInteractive({ useHandCursor: true });

    const parts = [
      card,
      this.add.text(x, top + 16, `[${index + 1}]`, { ...style, fontSize: '13px', color: '#8080a0' }).setOrigin(0.5, 0),
      this.add.image(x, top + 72, LOOT_ATLAS.key, itemIconFrame(itemId)).setScale(3),
      this.add.text(x, top + 122, item.name, { ...style, fontSize: '17px', color: '#ffffff' }).setOrigin(0.5, 0),
      this.add
        .text(x, top + 150, item.effect, {
          ...style,
          fontSize: '13px',
          color: '#e0e0ec',
          align: 'center',
          wordWrap: { width: CARD_WIDTH - 24 },
        })
        .setOrigin(0.5, 0),
      this.add
        .text(x, top + CARD_HEIGHT - 50, isEffect ? 'efekt broni' : 'przedmiot bazowy', {
          ...style,
          fontSize: '12px',
          color: isEffect ? '#f5c542' : '#a0a0b8',
        })
        .setOrigin(0.5, 0),
      this.add
        .text(x, top + CARD_HEIGHT - 30, owned > 0 ? `masz już: ×${owned} (wzmocni)` : 'nowy', {
          ...style,
          fontSize: '12px',
          color: owned > 0 ? '#9fe0a0' : '#8080a0',
        })
        .setOrigin(0.5, 0),
    ];
    for (const part of parts) part.setAlpha(DIMMED_ALPHA);
    this.cardObjects.push(...parts);

    this.cards.push({ frame: card, accent });
    card.on(Phaser.Input.Events.POINTER_OVER, () => {
      if (this.armed) this.highlight(index, true);
    });
    card.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.highlight(index, false);
      if (this.pressedCard === index) this.pressedCard = null;
    });
    card.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.armed) this.pressedCard = index;
    });
    card.on(Phaser.Input.Events.POINTER_UP, () => {
      if (this.pressedCard === index) this.pick(itemId, data);
    });
  }

  private highlight(index: number, on: boolean): void {
    const card = this.cards[index];
    if (!card) return;
    if (on) card.frame.setFillStyle(0x2a2a3a, 0.98).setStrokeStyle(3, 0xffffff);
    else card.frame.setFillStyle(0x1a1a24, 0.96).setStrokeStyle(2, card.accent);
  }

  /** Pad: zaznaczanie działa dopiero na aktywnych kartach, a A wybiera zaznaczoną. */
  private onPadCommand(command: MenuCommand, data: RewardSceneData): void {
    if (!this.armed || this.picked) return;
    const count = data.choices.length;
    if (command === MenuCommand.Left || command === MenuCommand.Right) {
      const step = command === MenuCommand.Left ? -1 : 1;
      const next = this.padCard === null ? (step > 0 ? 0 : count - 1) : (this.padCard + step + count) % count;
      if (this.padCard !== null) this.highlight(this.padCard, false);
      this.padCard = next;
      this.highlight(next, true);
      sound.play(SoundCue.UiMove);
      return;
    }
    if (command === MenuCommand.Confirm && this.padCard !== null) {
      const itemId = data.choices[this.padCard];
      if (itemId) this.pick(itemId, data);
    }
  }

  private pick(itemId: ItemId, data: RewardSceneData): void {
    if (this.picked || !this.armed) return;
    this.picked = true;
    sound.play(SoundCue.ItemPickup);
    this.scene.stop();
    data.onPick(itemId);
  }
}
