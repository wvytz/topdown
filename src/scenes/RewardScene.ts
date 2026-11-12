import { SoundCue, sound } from '@/audio/SoundBoard';
import { UiText, uiTextFromStyle } from '@/ui/UiText';
import Phaser from 'phaser';
import type { ItemId } from '@/core/lootTypes';
import { ItemKind } from '@/core/lootTypes';
import { SceneKey } from '@/core/types';
import { BOSS_REWARD, ITEM_DEFINITIONS, ITEM_EFFECTS } from '@/config/lootConfig';
import { describeRewardCard } from '@/systems/ItemEvolution';
import { itemIconFrame } from '@/entities/Pickup';
import { LOOT_ATLAS } from '@/config/spriteConfig';
import { MenuCommand } from '@/systems/gamepadInput';
import { bindPadMenu } from '@/input/PadMenuInput';
import { drawFrame } from '@/ui/UiFrame';
import { REWARD_CARD, UI_PALETTE } from '@/config/uiConfig';

/** Romb kropki postępu (7×7 pikseli). */
const PIP_PATTERN = ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'];

/** Kropki postępu do przemiany jako romby z pełnych pikseli: wypełnione = kopie po wzięciu tej karty. */
function drawPips(g: Phaser.GameObjects.Graphics, x: number, y: number, pips: { readonly filled: number; readonly total: number }, evolution: boolean): void {
  const unit = 2;
  const size = PIP_PATTERN.length * unit;
  const gap = size + 8;
  const left = Math.round(x - ((pips.total - 1) * gap) / 2 - size / 2);
  const top = Math.round(y - size / 2);
  for (let i = 0; i < pips.total; i++) {
    const on = i < pips.filled;
    const color = on ? (evolution ? 0xf5c542 : 0x9fe0a0) : 0x30303c;
    const ox = left + i * gap;
    const cells = PIP_PATTERN.flatMap((row, py) => [...row].flatMap((c, px) => (c === '#' ? [{ px, py }] : [])));
    g.fillStyle(UI_PALETTE.ink, 1);
    for (const { px, py } of cells) g.fillRect(ox + px * unit - 1, top + py * unit - 1, unit + 2, unit + 2);
    g.fillStyle(color, 1);
    for (const { px, py } of cells) g.fillRect(ox + px * unit, top + py * unit, unit, unit);
    // Blask na górnej ściance pełnego rombu.
    if (on) g.fillStyle(0xf8f0d0, 0.9).fillRect(ox + 3 * unit, top + unit, unit, unit * 2);
  }
}

export interface RewardSceneData {
  readonly choices: readonly ItemId[];
  /** Ile kopii każdego przedmiotu gracz już ma (do opisu karty). */
  readonly owned: Readonly<Partial<Record<ItemId, number>>>;
  readonly onPick: (itemId: ItemId) => void;
  /** Co-op (etap C4): kto teraz wybiera, np. „P2 — Łucznik wybiera”. */
  readonly picker?: string;
  /** Napis nad kartami zamiast „STRAŻNIK POKONANY” (np. sprzątaczka uciekła windą, krok 125). */
  readonly headline?: string;
  /** Krok 150: karta rozwoju — przedmiot, który bohater już zbiera (wstążka na karcie). */
  readonly development?: ItemId | null;
}

const CARD_WIDTH = REWARD_CARD.width;
const CARD_HEIGHT = REWARD_CARD.height;
/** Krok 150: złoto karty przemiany i zieleń karty rozwoju. */
const EVOLUTION_GOLD = 0xf5c542;
/** Krok 170: relikwia bossa. */
const RELIC_CRIMSON = 0xc8304a;
const DEVELOPMENT_GREEN = 0x8affa0;
const CARD_GAP = REWARD_CARD.gap;
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
  private hintText!: UiText;
  /** Ramki kart i ich kolor obwódki — do podświetlenia (mysz, pad). */
  private cards: { readonly draw: (hover: boolean) => void }[] = [];
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
    uiTextFromStyle(this, width / 2, 70, data.headline ?? 'STRAŻNIK POKONANY', { ...style, fontSize: '28px', color: '#f5c542' }).setOrigin(0.5);
    this.hintText = uiTextFromStyle(this, width / 2, 108, '…', { ...style, fontSize: '14px', color: '#8080a0' })
      .setOrigin(0.5);
    // Krok 150: zasada przemian wprost pod kartami.
    uiTextFromStyle(this, width / 2, height / 2 + 40 + CARD_HEIGHT / 2 + 22, `${ITEM_EFFECTS.evolution.copies} kopie przedmiotu = PRZEMIANA w nową mechanikę  ·  zielona wstążka = przedmiot, który już zbierasz\nkarmazynowa wstążka = relikwia pokonanego bossa`, {
        ...style,
        fontSize: '12px',
        color: '#b8b8c8',
        align: 'center',
      })
      .setOrigin(0.5);
    if (data.picker) uiTextFromStyle(this, width / 2, 136, data.picker, { ...style, fontSize: '16px', color: '#8affa0' }).setOrigin(0.5);

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
    const relic = item.kind === ItemKind.Relic;
    const owned = data.owned[itemId] ?? 0;
    // Krok 150 (prośba właściciela i testera: karta rozwoju niejasna): karta mówi poziom, co da ta kopia
    // i ile brakuje do przemiany; karta przemiany jest złota i opisuje nową mechanikę.
    const info = describeRewardCard(item, owned, ITEM_EFFECTS.evolution);
    const evolution = info.kind === 'evolution';
    const development = data.development === itemId;
    const accent = evolution ? EVOLUTION_GOLD : relic ? RELIC_CRIMSON : development ? DEVELOPMENT_GREEN : isEffect ? 0xd0a040 : 0xa0a0b8;
    const top = y - CARD_HEIGHT / 2;
    const textStyle = (size: number, color: string, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle => ({
      ...style,
      fontSize: `${size}px`,
      color,
      align: 'center',
      wordWrap: { width: CARD_WIDTH - 22 },
      ...extra,
    });

    // Krok U7: karta w pikselowej ramce (obrys, ramka w barwie rodzaju, nity), cokół pod ikoną, kropki postępu
    // jako romby z pełnych pikseli i wstążka jako mała ramka — jeden język z HUD-em i pauzą.
    const ribbon = evolution ? 'PRZEMIANA' : relic ? 'RELIKWIA' : development ? 'KARTA ROZWOJU' : null;
    const ribbonColor = evolution ? EVOLUTION_GOLD : relic ? RELIC_CRIMSON : DEVELOPMENT_GREEN;
    const fill = evolution ? 0x2a2414 : relic ? 0x2a1418 : 0x1a1a24;
    const left = x - CARD_WIDTH / 2;
    const g = this.add.graphics();
    const draw = (hover: boolean): void => {
      g.clear();
      drawFrame(g, left, top, CARD_WIDTH, CARD_HEIGHT, { fill: hover ? 0x2a2a3a : fill, fillAlpha: 0.97, edge: hover ? UI_PALETTE.goldLight : accent, rivets: evolution || relic || hover ? accent : UI_PALETTE.edge });
      drawFrame(g, x - 31, top + 27, 62, 62, { fill: UI_PALETTE.void, fillAlpha: 0.55, edge: hover ? accent : UI_PALETTE.edge, bevel: null });
      drawPips(g, x, top + 150, info.pips, evolution);
      if (ribbon) drawFrame(g, x - 68, top - 9, 136, 19, { fill: 0x101018, fillAlpha: 1, edge: ribbonColor, bevel: null, rivets: ribbonColor });
    };
    draw(false);
    const card = this.add.rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, 0x000000, 0).setInteractive({ useHandCursor: true });
    const kind = relic ? '◆ relikwia bossa' : isEffect ? '★ efekt broni' : 'przedmiot bazowy';

    const parts: Phaser.GameObjects.GameObject[] = [
      g,
      card,
      uiTextFromStyle(this, left + 10, top + 8, `[${index + 1}]`, textStyle(13, '#8f7f72')).setOrigin(0, 0),
      this.add.image(x, top + 58, LOOT_ATLAS.key, itemIconFrame(itemId)).setScale(REWARD_CARD.iconScale),
      uiTextFromStyle(this, x, top + 96, info.title, textStyle(17, evolution ? '#f5c542' : '#f1e2a9')).setOrigin(0.5, 0),
      uiTextFromStyle(this, x, top + 122, info.subtitle, textStyle(12, evolution ? '#f5c542' : relic ? '#ff8aa0' : owned > 0 ? '#9fe0a0' : '#9c8f74')).setOrigin(0.5, 0),
      uiTextFromStyle(this, x, top + 164, info.effect, textStyle(13, '#d8ccb0')).setOrigin(0.5, 0),
      uiTextFromStyle(this, x, top + CARD_HEIGHT - 62, info.progress, textStyle(11, evolution ? '#f5c542' : '#b8ab90')).setOrigin(0.5, 0),
      uiTextFromStyle(this, x, top + CARD_HEIGHT - 22, kind, textStyle(11, relic ? '#ff8aa0' : isEffect ? '#d0a040' : '#9c8f74')).setOrigin(0.5, 0),
    ];
    // Wstążka u góry karty: przemiana albo karta rozwoju (przedmiot, który już zbierasz).
    // Krok 170: relikwia bossa ma własną, karmazynową wstążkę.
    if (ribbon) parts.push(uiTextFromStyle(this, x, top + 1, ribbon, { ...style, fontSize: '12px', color: evolution ? '#f5c542' : relic ? '#ff8aa0' : '#8affa0' }).setOrigin(0.5));
    for (const part of parts) (part as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(DIMMED_ALPHA);
    this.cardObjects.push(...parts);

    this.cards.push({ draw });
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
    this.cards[index]?.draw(on);
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
