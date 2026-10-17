import Phaser from 'phaser';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { floorLabel } from '@/systems/TowerLoop';
import type { BeamHudData, BossHudData, HudItem, HudItemNotice, HudSceneData, HudSource, RangedHudData } from '@/core/types';
import { SceneKey } from '@/core/types';
import { ITEM_POOL } from '@/config/lootConfig';
import { LOOT_ATLAS } from '@/config/spriteConfig';
import { DeathScreen } from '@/effects/DeathScreen';

const BAR_X = 16;
const BAR_WIDTH = 200;
const HP_BAR_Y = 40;
const HP_BAR_HEIGHT = 14;
const DASH_BAR_Y = HP_BAR_Y + HP_BAR_HEIGHT + 4;
const DASH_BAR_HEIGHT = 4;
const CHARGES_Y = DASH_BAR_Y + DASH_BAR_HEIGHT + 3;
const CHARGE_HEIGHT = 5;
const CHARGE_GAP = 3;
/** Pierwsza linia tekstu pod paskami. */
/** Promień Czarodziejki: cienki pasek pod kulami. */
const BEAM_Y = CHARGES_Y + CHARGE_HEIGHT + 2;
const BEAM_HEIGHT = 3;
const TEXT_Y = BEAM_Y + BEAM_HEIGHT + 4;
const BOSS_BAR_WIDTH = 420;
const BOSS_BAR_HEIGHT = 12;
const BOSS_BAR_Y = 470;
/** Plansza bossa (wejście na arenę, wściekłość): czas, pojawianie się i wygasanie. */
const BANNER_MS = 3000;
const BANNER_FADE_IN_MS = 300;
const BANNER_FADE_OUT_MS = 900;
const BANNER_Y = 150;
/** Przedmioty jako ikony (krok 67, wariant A): rząd slotów pod złotem. */
const ITEM_SLOT_Y = TEXT_Y + 40;
const ITEM_SLOT_SIZE = 28;
const ITEM_SLOT_GAP = 4;
const ITEM_SLOT_BORDER = 2;
/** Ramka: kość = przedmiot bazowy, złoto = rzadszy z efektem broni. */
const ITEM_FRAME_COMMON = 0x9c8f74;
const ITEM_FRAME_RARE = 0xe7b140;
/** Nazwa i efekt zdobytego przedmiotu — mniejsza złota czcionka pod ikonami. */
const ITEM_NOTICE_Y = ITEM_SLOT_Y + ITEM_SLOT_SIZE + 6;
const ITEM_NOTICE_FADE_MS = 800;

/** Jeden slot przedmiotu w HUD: tło z ramką, ikona i licznik kopii. */
interface ItemSlot {
  readonly frame: Phaser.GameObjects.Rectangle;
  readonly icon: Phaser.GameObjects.Image;
  readonly count: Phaser.GameObjects.Text;
}

/** Podpowiedź sterowania: Czarodziejka ma kule i promień zamiast ciosu i strzału. */
function helpLine(sorceress: boolean): string {
  const attacks = sorceress ? 'LPM — kule energii · PPM — promień (przytrzymaj)' : 'LPM — atak · PPM — strzał';
  const devHelp = import.meta.env.DEV ? '   [DEV] B — pokonaj bossa' : '';
  return `WASD — ruch · ${attacks} · Spacja — dash · E — kapliczka, schody${devHelp}`;
}

/**
 * Osobna scena nakładki — nie podlega zoomowi ani przesuwaniu kamery gry.
 * Co klatkę odczytuje stan z HudSource (GameScene).
 */
export class HudScene extends Phaser.Scene {
  private source!: HudSource;
  private bars!: Phaser.GameObjects.Graphics;
  private floorText!: Phaser.GameObjects.Text;
  private modifierText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private deathScreen!: DeathScreen;
  private bossNameText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private itemSlots: ItemSlot[] = [];
  /** Podpis ostatnio narysowanych slotów — przerysowujemy tylko przy zmianie. */
  private itemsSignature = '';
  private itemNoticeText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private bannerTitle!: Phaser.GameObjects.Text;
  private bannerSubtitle!: Phaser.GameObjects.Text;
  private bannerStartedAt = -Infinity;
  /** Co już ogłoszono w tej walce (przebudzenie, wściekłość) — plansza pokazuje się raz. */
  private bannerBoss: BossHudData | null = null;

  constructor() {
    super(SceneKey.Hud);
  }

  create(data: HudSceneData): void {
    this.source = data.source;

    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#e8e8f0',
      stroke: '#000000',
      strokeThickness: 4,
    };

    this.floorText = this.add.text(BAR_X, 12, '', style);
    this.modifierText = this.add.text(BAR_X + BAR_WIDTH + 70, 16, '', { ...style, fontSize: '13px', color: '#ffb070' });
    this.bars = this.add.graphics();
    this.hpText = this.add.text(BAR_X + BAR_WIDTH + 8, HP_BAR_Y - 2, '', { ...style, fontSize: '13px' });
    this.hintText = this.add.text(BAR_X, TEXT_Y, '', { ...style, fontSize: '13px' });

    this.goldText = this.add.text(BAR_X, TEXT_Y + 18, '', { ...style, fontSize: '14px', color: '#f5c542' });
    this.itemSlots = this.buildItemSlots(style);
    this.itemNoticeText = this.add
      .text(BAR_X, ITEM_NOTICE_Y, '', { ...style, fontSize: '12px', color: '#f5c542', strokeThickness: 3 })
      .setAlpha(0);
    this.toastText = this.add
      .text(this.scale.width / 2, 70, '', { ...style, fontSize: '18px', color: '#ffe08a' })
      .setOrigin(0.5);

    this.bossNameText = this.add
      .text(this.scale.width / 2, BOSS_BAR_Y - 22, '', { ...style, fontSize: '15px', color: '#ffb0a0' })
      .setOrigin(0.5, 0)
      .setVisible(false);

    this.bannerTitle = this.add
      .text(this.scale.width / 2, BANNER_Y, '', { ...style, fontSize: '30px', color: '#f0d27a', strokeThickness: 6 })
      .setOrigin(0.5)
      .setAlpha(0);
    this.bannerSubtitle = this.add
      .text(this.scale.width / 2, BANNER_Y + 30, '', { ...style, fontSize: '16px', color: '#d8c0ff' })
      .setOrigin(0.5)
      .setAlpha(0);

    this.helpText = this.add.text(BAR_X, this.scale.height - 28, '', { ...style, fontSize: '12px', color: '#8080a0' });

    // Ekran śmierci na samej górze: jego przyciemnienie przykrywa też resztę HUD (krok 35).
    this.deathScreen = new DeathScreen(this);
  }

  override update(time: number): void {
    const hud = this.source.getHudData();

    this.floorText.setText(floorLabel(hud.floor, TOWER_CONFIG));
    const modifier = hud.floorModifier;
    this.modifierText.setText(modifier ? `${modifier.name}: ${modifier.description}` : '');
    this.hpText.setText(`${hud.hp}/${hud.maxHp}`);

    const hpRatio = hud.maxHp > 0 ? hud.hp / hud.maxHp : 0;
    this.bars.clear();
    this.bars.fillStyle(0x000000, 0.6).fillRect(BAR_X - 2, HP_BAR_Y - 2, BAR_WIDTH + 4, HP_BAR_HEIGHT + 4);
    this.bars.fillStyle(0x4a1c1c, 1).fillRect(BAR_X, HP_BAR_Y, BAR_WIDTH, HP_BAR_HEIGHT);
    this.bars.fillStyle(hpRatio > 0.3 ? 0x3ddc84 : 0xff6b6b, 1).fillRect(BAR_X, HP_BAR_Y, BAR_WIDTH * hpRatio, HP_BAR_HEIGHT);
    this.bars.fillStyle(0x202030, 1).fillRect(BAR_X, DASH_BAR_Y, BAR_WIDTH, DASH_BAR_HEIGHT);
    this.bars
      .fillStyle(hud.dashReadiness >= 1 ? 0x6ec6ff : 0x3a6080, 1)
      .fillRect(BAR_X, DASH_BAR_Y, BAR_WIDTH * hud.dashReadiness, DASH_BAR_HEIGHT);
    this.drawCharges(hud.ranged);
    this.drawBeam(hud.beam);
    this.helpText.setText(helpLine(hud.beam !== null));

    if (hud.stairsUnlocked) {
      this.hintText
        .setText(hud.onStairs ? 'Naciśnij E, aby wspiąć się wyżej' : 'Schody otwarte — stań na nich i naciśnij E, aby wspiąć się wyżej')
        .setColor('#e0b84a');
    } else if (hud.boss) {
      this.hintText.setText('Pokonaj bossa, aby otworzyć schody · unikaj czerwonych stref').setColor('#ffb0a0');
    } else {
      this.hintText.setText(`Wrogowie: ${hud.enemiesAlive} · znajdź komnatę bossa (zakratowane schody)`).setColor('#a0a0b0');
    }

    this.goldText.setText(hud.practice ? `Złoto: ${hud.gold} (run testowy — bez wyniku)` : `Złoto (wynik): ${hud.gold}`);
    this.updateItemSlots(hud.items);
    this.updateItemNotice(hud.itemNotice);

    // Komunikat wygasa w ostatniej sekundzie wyświetlania.
    this.toastText.setText(hud.toast?.text ?? '');
    this.toastText.setAlpha(hud.toast ? Math.min(1, hud.toast.remainingMs / 1000 + 0.2) : 0);

    this.deathScreen.update(hud.death, time);
    this.drawBossBar(hud.boss);
    this.updateBanner(hud.boss);
  }

  /** Sloty na wszystkie przedmioty z puli (każdy rodzaj zajmuje jeden slot, kopie liczy licznik). */
  private buildItemSlots(style: Phaser.Types.GameObjects.Text.TextStyle): ItemSlot[] {
    return ITEM_POOL.map((_, i) => {
      const x = BAR_X + i * (ITEM_SLOT_SIZE + ITEM_SLOT_GAP);
      const inner = ITEM_SLOT_SIZE - ITEM_SLOT_BORDER;
      const frame = this.add
        .rectangle(x + ITEM_SLOT_SIZE / 2, ITEM_SLOT_Y + ITEM_SLOT_SIZE / 2, inner, inner, 0x0f0e18, 0.75)
        .setStrokeStyle(ITEM_SLOT_BORDER, ITEM_FRAME_COMMON);
      const icon = this.add.image(x + ITEM_SLOT_SIZE / 2, ITEM_SLOT_Y + ITEM_SLOT_SIZE / 2, LOOT_ATLAS.key);
      const count = this.add
        .text(x + ITEM_SLOT_SIZE + 1, ITEM_SLOT_Y + ITEM_SLOT_SIZE + 2, '', {
          ...style,
          fontSize: '11px',
          fontStyle: 'bold',
          strokeThickness: 3,
        })
        .setOrigin(1, 1);
      for (const part of [frame, icon, count]) part.setVisible(false);
      return { frame, icon, count };
    });
  }

  private updateItemSlots(items: readonly HudItem[]): void {
    const signature = items.map((i) => `${i.frame}:${i.count}`).join('|');
    if (signature === this.itemsSignature) return;
    this.itemsSignature = signature;
    this.itemSlots.forEach((slot, i) => {
      const item = items[i];
      for (const part of [slot.frame, slot.icon, slot.count]) part.setVisible(item !== undefined);
      if (!item) return;
      slot.frame.setStrokeStyle(ITEM_SLOT_BORDER, item.rare ? ITEM_FRAME_RARE : ITEM_FRAME_COMMON);
      slot.icon.setFrame(item.frame);
      slot.count.setText(item.count > 1 ? `×${item.count}` : '');
    });
  }

  /** „Nazwa — efekt” pod ikonami; wygasa pod koniec wyświetlania. */
  private updateItemNotice(notice: HudItemNotice | null): void {
    this.itemNoticeText.setText(notice ? `${notice.name} — ${notice.effect}` : '');
    this.itemNoticeText.setAlpha(notice ? Math.min(1, notice.remainingMs / ITEM_NOTICE_FADE_MS) : 0);
  }

  /** Plansza: imię i tytuł bossa przy przebudzeniu, okrzyk przy wściekłości (tylko bossowie z tytułem). */
  private updateBanner(boss: BossHudData | null): void {
    const now = this.time.now;
    const previous = this.bannerBoss;
    this.bannerBoss = boss;
    if (boss?.title) {
      if (!previous) this.showBanner(boss.name, boss.title, now);
      else if (boss.enraged && !previous.enraged) this.showBanner(boss.enragedLabel, boss.name, now);
    }
    const age = now - this.bannerStartedAt;
    const alpha =
      age < 0 || age >= BANNER_MS
        ? 0
        : Math.min(1, age / BANNER_FADE_IN_MS, (BANNER_MS - age) / BANNER_FADE_OUT_MS);
    this.bannerTitle.setAlpha(alpha);
    this.bannerSubtitle.setAlpha(alpha);
  }

  private showBanner(title: string, subtitle: string, now: number): void {
    this.bannerTitle.setText(title);
    this.bannerSubtitle.setText(subtitle);
    this.bannerStartedAt = now;
  }

  /** Ładunki strzału: pełne segmenty + częściowo wypełniony segment, który się ładuje. */
  private drawCharges(ranged: RangedHudData): void {
    const count = Math.max(1, ranged.maxCharges);
    const width = (BAR_WIDTH - CHARGE_GAP * (count - 1)) / count;
    for (let i = 0; i < count; i++) {
      const x = BAR_X + i * (width + CHARGE_GAP);
      this.bars.fillStyle(0x202030, 1).fillRect(x, CHARGES_Y, width, CHARGE_HEIGHT);
      if (i < ranged.charges) {
        this.bars.fillStyle(0x5ee0c8, 1).fillRect(x, CHARGES_Y, width, CHARGE_HEIGHT);
      } else if (i === ranged.charges) {
        this.bars.fillStyle(0x2f7064, 1).fillRect(x, CHARGES_Y, width * ranged.rechargeProgress, CHARGE_HEIGHT);
      }
    }
  }

  /** Promień: w trakcie — pozostały czas (jasny), w blokadzie — odnowienie (ciemny), gotowy — pełny. */
  private drawBeam(beam: BeamHudData | null): void {
    if (!beam) return;
    this.bars.fillStyle(0x202030, 1).fillRect(BAR_X, BEAM_Y, BAR_WIDTH, BEAM_HEIGHT);
    const color = beam.active ? 0xe4fbfb : beam.readiness >= 1 ? 0x39c0d8 : 0x1d7f9c;
    this.bars.fillStyle(color, 1).fillRect(BAR_X, BEAM_Y, BAR_WIDTH * beam.readiness, BEAM_HEIGHT);
  }

  private drawBossBar(boss: BossHudData | null): void {
    this.bossNameText.setVisible(boss !== null);
    if (!boss) return;

    const x = (this.scale.width - BOSS_BAR_WIDTH) / 2;
    const ratio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
    this.bossNameText.setText(boss.enraged ? `${boss.name} — ${boss.enragedLabel}` : boss.name);
    this.bars.fillStyle(0x000000, 0.6).fillRect(x - 2, BOSS_BAR_Y - 2, BOSS_BAR_WIDTH + 4, BOSS_BAR_HEIGHT + 4);
    this.bars.fillStyle(0x3a1010, 1).fillRect(x, BOSS_BAR_Y, BOSS_BAR_WIDTH, BOSS_BAR_HEIGHT);
    this.bars.fillStyle(boss.enraged ? 0xff5a36 : 0xc0392b, 1).fillRect(x, BOSS_BAR_Y, BOSS_BAR_WIDTH * ratio, BOSS_BAR_HEIGHT);
  }
}
