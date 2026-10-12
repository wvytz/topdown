import Phaser from 'phaser';
import type { ItemId } from '@/core/lootTypes';
import { ItemKind } from '@/core/lootTypes';
import { SceneKey } from '@/core/types';
import { ITEM_DEFINITIONS } from '@/config/lootConfig';
import { itemTextureKey } from '@/entities/Pickup';

export interface RewardSceneData {
  readonly choices: readonly ItemId[];
  /** Ile kopii każdego przedmiotu gracz już ma (do opisu karty). */
  readonly owned: Readonly<Partial<Record<ItemId, number>>>;
  readonly onPick: (itemId: ItemId) => void;
}

const CARD_WIDTH = 210;
const CARD_HEIGHT = 250;
const CARD_GAP = 28;
const KEY_NAMES = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'] as const;

/**
 * Nakładka wyboru nagrody za bossa. GameScene jest w tym czasie wstrzymana.
 * Wybór: klik na kartę albo klawisz 1–3. Wybór na puszczenie przycisku, żeby klik nie stał się ciosem po wznowieniu gry.
 */
export class RewardScene extends Phaser.Scene {
  private picked = false;

  constructor() {
    super(SceneKey.Reward);
  }

  create(data: RewardSceneData): void {
    this.picked = false;
    const { width, height } = this.scale;
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      color: '#e8e8f0',
      stroke: '#000000',
      strokeThickness: 4,
    };

    this.add.rectangle(width / 2, height / 2, width, height, 0x05050a, 0.78);
    this.add.text(width / 2, 70, 'STRAŻNIK POKONANY', { ...style, fontSize: '28px', color: '#f5c542' }).setOrigin(0.5);
    this.add
      .text(width / 2, 108, 'Wybierz nagrodę — kliknij kartę albo naciśnij 1–3', { ...style, fontSize: '14px', color: '#c8c8d8' })
      .setOrigin(0.5);

    const total = data.choices.length * CARD_WIDTH + (data.choices.length - 1) * CARD_GAP;
    const left = (width - total) / 2 + CARD_WIDTH / 2;
    data.choices.forEach((itemId, index) => {
      this.createCard(left + index * (CARD_WIDTH + CARD_GAP), height / 2 + 40, itemId, index, data, style);
      const keyName = KEY_NAMES[index];
      if (keyName) this.input.keyboard?.once(`keyup-${keyName}`, () => this.pick(itemId, data));
    });
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

    const card = this.add
      .rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, 0x1a1a24, 0.96)
      .setStrokeStyle(2, accent)
      .setInteractive({ useHandCursor: true });
    const top = y - CARD_HEIGHT / 2;

    this.add.text(x, top + 16, `[${index + 1}]`, { ...style, fontSize: '13px', color: '#8080a0' }).setOrigin(0.5, 0);
    this.add.image(x, top + 72, itemTextureKey(itemId)).setScale(3);
    this.add.text(x, top + 122, item.name, { ...style, fontSize: '17px', color: '#ffffff' }).setOrigin(0.5, 0);
    this.add
      .text(x, top + 150, item.effect, {
        ...style,
        fontSize: '13px',
        color: '#e0e0ec',
        align: 'center',
        wordWrap: { width: CARD_WIDTH - 24 },
      })
      .setOrigin(0.5, 0);
    this.add
      .text(x, top + CARD_HEIGHT - 50, isEffect ? 'efekt broni' : 'przedmiot bazowy', {
        ...style,
        fontSize: '12px',
        color: isEffect ? '#f5c542' : '#a0a0b8',
      })
      .setOrigin(0.5, 0);
    this.add
      .text(x, top + CARD_HEIGHT - 30, owned > 0 ? `masz już: ×${owned} (wzmocni)` : 'nowy', {
        ...style,
        fontSize: '12px',
        color: owned > 0 ? '#9fe0a0' : '#8080a0',
      })
      .setOrigin(0.5, 0);

    card.on(Phaser.Input.Events.POINTER_OVER, () => card.setFillStyle(0x2a2a3a, 0.98).setStrokeStyle(3, 0xffffff));
    card.on(Phaser.Input.Events.POINTER_OUT, () => card.setFillStyle(0x1a1a24, 0.96).setStrokeStyle(2, accent));
    card.on(Phaser.Input.Events.POINTER_UP, () => this.pick(itemId, data));
  }

  private pick(itemId: ItemId, data: RewardSceneData): void {
    if (this.picked) return;
    this.picked = true;
    this.scene.stop();
    data.onPick(itemId);
  }
}
