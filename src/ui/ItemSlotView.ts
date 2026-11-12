import Phaser from 'phaser';
import type { HudItem } from '@/core/types';
import { LOOT_ATLAS } from '@/config/spriteConfig';
import { UI_PALETTE, UI_TEXT_COLORS } from '@/config/uiConfig';
import { UiText, uiText } from '@/ui/UiText';
import { drawFrame } from '@/ui/UiFrame';

/** Ramka slotu: kość = przedmiot bazowy, złoto = z efektem broni, karmazyn = relikwia, błękit = przemiana (krok 150). */
export const ITEM_FRAME_COLORS = {
  common: 0x9c8f74,
  rare: 0xe7b140,
  relic: 0xc8304a,
  evolved: 0x9fe8ff,
} as const;

export function itemFrameColor(item: Pick<HudItem, 'evolved' | 'relic' | 'rare'>): number {
  return item.evolved ? ITEM_FRAME_COLORS.evolved : item.relic ? ITEM_FRAME_COLORS.relic : item.rare ? ITEM_FRAME_COLORS.rare : ITEM_FRAME_COLORS.common;
}

/** Licznik kopii pod slotem: ×2, ★ (przemiana), ★4. */
export function itemCountLabel(item: Pick<HudItem, 'evolved' | 'count'>): string {
  if (item.evolved) return item.count > 3 ? `★${item.count}` : '★';
  return item.count > 1 ? `×${item.count}` : '';
}

export interface ItemSlotLayout {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly gap: number;
  /** Skala ikony 16×16 z atlasu łupów (1 = piksel w piksel). */
  readonly iconScale: number;
  readonly capacity: number;
  /** Ile slotów w rzędzie (domyślnie wszystkie w jednym). */
  readonly perRow?: number;
}

/**
 * Rząd przedmiotów w ramkach (krok U7): HUD, panel partnera i ekran końca runu. Ramki rysuje wspólna grafika
 * sceny co klatkę, ikony i liczniki zmieniają się tylko przy zmianie przedmiotów.
 */
export class ItemSlotView {
  private readonly icons: Phaser.GameObjects.Image[];
  private readonly counts: UiText[];
  private items: readonly HudItem[] = [];
  private signature = '';

  constructor(scene: Phaser.Scene, private layout: ItemSlotLayout) {
    this.icons = Array.from({ length: layout.capacity }, () => scene.add.image(0, 0, LOOT_ATLAS.key).setScale(layout.iconScale).setVisible(false));
    this.counts = Array.from({ length: layout.capacity }, () => uiText(scene, 0, 0, '', { color: UI_TEXT_COLORS.bright }).setOrigin(1, 1).setVisible(false));
    this.place();
  }

  /** Lewy górny róg slotu `index`. */
  slotPosition(index: number): { x: number; y: number } {
    const { x, y, size, gap } = this.layout;
    const perRow = this.layout.perRow ?? this.layout.capacity;
    return { x: x + (index % perRow) * (size + gap), y: y + Math.floor(index / perRow) * (size + gap + 6) };
  }

  /** Nowe położenie całego rzędu (ekran końca centruje go pod napisem). */
  moveTo(x: number, y: number): void {
    this.layout = { ...this.layout, x, y };
    this.place();
  }

  /** Szerokość rzędu z `count` slotami. */
  widthOf(count: number): number {
    const perRow = Math.min(count, this.layout.perRow ?? this.layout.capacity);
    return perRow <= 0 ? 0 : perRow * this.layout.size + (perRow - 1) * this.layout.gap;
  }

  setAlpha(alpha: number): void {
    for (const part of [...this.icons, ...this.counts]) part.setAlpha(alpha);
  }

  setDepth(depth: number): void {
    for (const part of [...this.icons, ...this.counts]) part.setDepth(depth);
  }

  /** Ramki (na `g`, co klatkę) i — przy zmianie przedmiotów — ikony i liczniki. */
  update(items: readonly HudItem[], g: Phaser.GameObjects.Graphics | null): void {
    const signature = items.map((i) => `${i.frame}:${i.count}:${i.evolved ? 1 : 0}`).join('|');
    if (signature !== this.signature) {
      this.signature = signature;
      this.items = items.slice(0, this.layout.capacity);
      this.icons.forEach((icon, i) => {
        const item = this.items[i];
        icon.setVisible(item !== undefined);
        if (item) icon.setFrame(item.frame);
      });
      this.counts.forEach((count, i) => {
        const item = this.items[i];
        const label = item ? itemCountLabel(item) : '';
        count.setText(label).setVisible(label !== '').setColor(item?.evolved ? UI_TEXT_COLORS.gold : UI_TEXT_COLORS.bright);
      });
    }
    if (g) this.drawFrames(g);
  }

  /** Ramki slotów na grafice `g` (np. własnej grafice ekranu końca). */
  drawFrames(g: Phaser.GameObjects.Graphics): void {
    const { size } = this.layout;
    this.items.forEach((item, i) => {
      const { x, y } = this.slotPosition(i);
      drawFrame(g, x, y, size, size, { edge: itemFrameColor(item), fill: UI_PALETTE.panel, fillAlpha: 0.8, bevel: null });
    });
  }

  destroy(): void {
    for (const part of [...this.icons, ...this.counts]) part.destroy();
  }

  private place(): void {
    const { size } = this.layout;
    this.icons.forEach((icon, i) => {
      const { x, y } = this.slotPosition(i);
      icon.setPosition(x + size / 2, y + size / 2);
    });
    this.counts.forEach((count, i) => {
      const { x, y } = this.slotPosition(i);
      count.setPosition(x + size + 2, y + size + 4);
    });
  }
}
