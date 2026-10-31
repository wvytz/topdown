import Phaser from 'phaser';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { floorLabel } from '@/systems/TowerLoop';
import { BOSS_RUSH_TEXT } from '@/config/bossRushConfig';
import type { BeamHudData, BossBarData, BossHudData, BossPointerData, UltimateHudData, HudItem, HudItemNotice, HudPartnerData, HudSceneData, HudSource, MinimapHudData, RangedHudData } from '@/core/types';
import { SceneKey } from '@/core/types';
import { ITEM_POOL } from '@/config/lootConfig';
import { LOOT_ATLAS } from '@/config/spriteConfig';
import { MINIMAP_CONFIG } from '@/config/minimapConfig';
import type { MinimapExplorer } from '@/systems/Minimap';
import { visibleRoute } from '@/systems/MinimapRoute';
import { DeathScreen } from '@/effects/DeathScreen';
import { currentPlatform } from '@/core/platform';
import { BOSS_POINTER_CONFIG } from '@/config/gameConfig';

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
/** Ultimate (krok 98): kwadrat za liczbą HP, wypełnia się od dołu; pełny — złoty i pulsuje. */
const ULT_X = BAR_X + BAR_WIDTH + 64;
const ULT_Y = HP_BAR_Y - 5;
const ULT_SIZE = 24;
const BOSS_BAR_WIDTH = 420;
const BOSS_BAR_HEIGHT = 12;
const BOSS_BAR_Y = 470;
/** Duet (krok 136): dwa paski obok siebie w szerokości jednego, z przerwą. */
const DUET_BAR_GAP = 20;
const DUET_BAR_WIDTH = (BOSS_BAR_WIDTH - DUET_BAR_GAP) / 2;
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
/** Krok 150: ramka przemienionego przedmiotu. */
const ITEM_FRAME_EVOLVED = 0x9fe8ff;
const ITEM_FRAME_RARE = 0xe7b140;
/** Nazwa i efekt zdobytego przedmiotu — mniejsza złota czcionka pod ikonami. */
const ITEM_NOTICE_Y = ITEM_SLOT_Y + ITEM_SLOT_SIZE + 6;
const ITEM_NOTICE_FADE_MS = 800;

/** Panel P2 w co-opie (etap C5): prawy dolny róg, nad nim nic nie leży (minimapa u góry, pasek bossa na środku). */
const PARTNER_BAR_WIDTH = 160;
const PARTNER_RIGHT = 16;
const PARTNER_TOP_FROM_BOTTOM = 112;
const PARTNER_HP_HEIGHT = 10;
const PARTNER_ULT_SIZE = 16;
const PARTNER_ITEM_SIZE = 18;
const PARTNER_ITEM_GAP = 2;

/** Jeden slot przedmiotu w HUD: tło z ramką, ikona i licznik kopii. */
interface ItemSlot {
  readonly frame: Phaser.GameObjects.Rectangle;
  readonly icon: Phaser.GameObjects.Image;
  readonly count: Phaser.GameObjects.Text;
}

/** Podpowiedź sterowania: Czarodziejka ma kule i promień zamiast ciosu i strzału. */
function helpLine(sorceress: boolean): string {
  // Wersja mobilna (krok 96): przyciski są podpisane na ekranie, a linia pomocy zasłaniałaby gałkę ruchu.
  if (currentPlatform() === 'mobile') return '';
  const attacks = sorceress ? 'LPM — kule energii · PPM — promień (przytrzymaj)' : 'LPM — atak · PPM — strzał';
  // Krok 98: R — ultimate.
  const devHelp = import.meta.env.DEV ? '   [DEV] B — pokonaj bossa' : '';
  return `WASD — ruch · ${attacks} · R — ultimate · Spacja — dash · E — kapliczka, schody${devHelp}`;
}

/** „Naciśnij E” — na telefonie przycisk E pojawia się na ekranie dopiero na schodach. */
function pressE(): string {
  return currentPlatform() === 'mobile' ? 'Stuknij E' : 'Naciśnij E';
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
  private ultimateText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private deathScreen!: DeathScreen;
  /** Minimapa: tło i odkryte kafle rysujemy tylko przy zmianie, znaczniki co klatkę. */
  private minimapMap!: Phaser.GameObjects.Graphics;
  private minimapMarks!: Phaser.GameObjects.Graphics;
  private minimapDrawn: { explorer: MinimapExplorer; version: number } | null = null;
  private bossNameText!: Phaser.GameObjects.Text;
  /** Imiona nad paskami duetu (krok 136). */
  private duetNameTexts: Phaser.GameObjects.Text[] = [];
  private pointers!: Phaser.GameObjects.Graphics;
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
  /** Co-op (etap C5): napis P1 nad paskiem i panel P2. */
  private playerLabelText!: Phaser.GameObjects.Text;
  private partnerLabel!: Phaser.GameObjects.Text;
  private partnerHpText!: Phaser.GameObjects.Text;
  private partnerIcons: Phaser.GameObjects.Image[] = [];
  private partnerCounts: Phaser.GameObjects.Text[] = [];
  private partnerItemsSignature = '';

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
    // Na telefonie ultimate ma własny przycisk — kwadrat bez litery klawisza.
    this.ultimateText = this.add
      .text(ULT_X + ULT_SIZE / 2, ULT_Y + ULT_SIZE / 2, currentPlatform() === 'mobile' ? '' : 'R', { ...style, fontSize: '13px' })
      .setOrigin(0.5);
    this.hintText = this.add.text(BAR_X, TEXT_Y, '', { ...style, fontSize: '13px' });

    this.goldText = this.add.text(BAR_X, TEXT_Y + 18, '', { ...style, fontSize: '14px', color: '#f5c542' });
    this.minimapMap = this.add.graphics();
    this.minimapMarks = this.add.graphics();
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
    this.duetNameTexts = [0, 1].map((i) =>
      this.add
        .text(this.duetBarX(i) + DUET_BAR_WIDTH / 2, BOSS_BAR_Y - 20, '', { ...style, fontSize: '13px', color: '#ffb0a0' })
        .setOrigin(0.5, 0)
        .setVisible(false),
    );
    this.pointers = this.add.graphics();

    this.bannerTitle = this.add
      .text(this.scale.width / 2, BANNER_Y, '', { ...style, fontSize: '30px', color: '#f0d27a', strokeThickness: 6 })
      .setOrigin(0.5)
      .setAlpha(0);
    this.bannerSubtitle = this.add
      .text(this.scale.width / 2, BANNER_Y + 30, '', { ...style, fontSize: '16px', color: '#d8c0ff' })
      .setOrigin(0.5)
      .setAlpha(0);

    this.helpText = this.add.text(BAR_X, this.scale.height - 28, '', { ...style, fontSize: '12px', color: '#8080a0' });

    this.playerLabelText = this.add.text(ULT_X + ULT_SIZE + 8, HP_BAR_Y - 2, '', { ...style, fontSize: '13px', color: '#3ddc84' });
    const px = this.scale.width - PARTNER_RIGHT - PARTNER_BAR_WIDTH;
    const py = this.scale.height - PARTNER_TOP_FROM_BOTTOM;
    this.partnerLabel = this.add.text(px, py - 18, '', { ...style, fontSize: '13px', color: '#6ec6ff' });
    this.partnerHpText = this.add.text(px + PARTNER_BAR_WIDTH, py - 18, '', { ...style, fontSize: '12px' }).setOrigin(1, 0);

    // Ekran śmierci na samej górze: jego przyciemnienie przykrywa też resztę HUD (krok 35).
    this.deathScreen = new DeathScreen(this);
  }

  override update(time: number): void {
    const hud = this.source.getHudData();

    this.floorText.setText(hud.arenaLabel ?? floorLabel(hud.floor, TOWER_CONFIG));
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
    this.drawUltimate(hud.ultimate, time);
    this.helpText.setText(helpLine(hud.beam !== null));

    if (hud.bossRush) {
      this.hintText.setText(hud.boss ? BOSS_RUSH_TEXT.fightHint : `Wrogowie: ${hud.enemiesAlive} · ${BOSS_RUSH_TEXT.arenaHint}`).setColor('#c8a8ff');
    } else if (hud.stairsUnlocked) {
      this.hintText
        .setText(hud.onStairs ? `${pressE()}, aby wspiąć się wyżej` : `Schody otwarte — stań na nich i ${pressE().toLowerCase()}, aby wspiąć się wyżej`)
        .setColor('#e0b84a');
    } else if (hud.boss) {
      this.hintText.setText('Pokonaj bossa, aby otworzyć schody · unikaj czerwonych stref').setColor('#ffb0a0');
    } else {
      this.hintText.setText(`Wrogowie: ${hud.enemiesAlive} · znajdź komnatę bossa (zakratowane schody)`).setColor('#a0a0b0');
    }

    this.goldText.setText(
      hud.bossRush
        ? `Złoto: ${hud.gold} ${BOSS_RUSH_TEXT.goldSuffix}`
        : hud.practice
          ? `Złoto: ${hud.gold} (run testowy — bez wyniku)`
          : `Złoto (wynik): ${hud.gold}`,
    );
    this.updateItemSlots(hud.items);
    this.updateItemNotice(hud.itemNotice);

    // Komunikat wygasa w ostatniej sekundzie wyświetlania.
    this.toastText.setText(hud.toast?.text ?? '');
    this.toastText.setAlpha(hud.toast ? Math.min(1, hud.toast.remainingMs / 1000 + 0.2) : 0);

    this.drawMinimap(hud.minimap, time);
    this.deathScreen.update(hud.death, time);
    this.drawBossBar(hud.boss);
    this.drawBossPointers(hud.bossPointers, time);
    this.updateBanner(hud.boss);
    this.playerLabelText.setText(hud.playerLabel);
    this.drawPartner(hud.partner, time);
  }

  /** Panel P2: imię, HP (albo „POWALONY” z paskiem wskrzeszania), dash, ultimate i przedmioty. */
  private drawPartner(partner: HudPartnerData | null, time: number): void {
    this.partnerLabel.setVisible(partner !== null);
    this.partnerHpText.setVisible(partner !== null);
    if (!partner) return;
    const x = this.scale.width - PARTNER_RIGHT - PARTNER_BAR_WIDTH;
    const y = this.scale.height - PARTNER_TOP_FROM_BOTTOM;
    const g = this.bars;
    this.partnerLabel.setText(partner.downed ? `${partner.label} · POWALONY` : partner.label);
    g.fillStyle(0x000000, 0.6).fillRect(x - 2, y - 2, PARTNER_BAR_WIDTH + 4, PARTNER_HP_HEIGHT + 4);
    if (partner.downed) {
      const pulse = 0.5 + 0.5 * Math.sin(time / 180);
      this.partnerHpText.setText('');
      this.partnerLabel.setColor(pulse > 0.5 ? '#ff6b6b' : '#ffb0b0');
      g.fillStyle(0x2a1010, 1).fillRect(x, y, PARTNER_BAR_WIDTH, PARTNER_HP_HEIGHT);
      g.fillStyle(0x8affa0, 1).fillRect(x, y, PARTNER_BAR_WIDTH * partner.reviveProgress, PARTNER_HP_HEIGHT);
    } else {
      const ratio = partner.maxHp > 0 ? partner.hp / partner.maxHp : 0;
      this.partnerHpText.setText(`${partner.hp}/${partner.maxHp}`).setColor('#e8e8f0');
      this.partnerLabel.setColor('#6ec6ff');
      g.fillStyle(0x4a1c1c, 1).fillRect(x, y, PARTNER_BAR_WIDTH, PARTNER_HP_HEIGHT);
      g.fillStyle(ratio > 0.3 ? 0x3ddc84 : 0xff6b6b, 1).fillRect(x, y, PARTNER_BAR_WIDTH * ratio, PARTNER_HP_HEIGHT);
    }
    const dashY = y + PARTNER_HP_HEIGHT + 3;
    g.fillStyle(0x202030, 1).fillRect(x, dashY, PARTNER_BAR_WIDTH, 3);
    g.fillStyle(partner.dashReadiness >= 1 ? 0x6ec6ff : 0x3a6080, 1).fillRect(x, dashY, PARTNER_BAR_WIDTH * partner.dashReadiness, 3);
    const ult = partner.ultimate;
    if (ult) {
      const ux = x - PARTNER_ULT_SIZE - 8;
      const ready = ult.charge >= 1;
      const fill = Math.round(PARTNER_ULT_SIZE * ult.charge);
      g.fillStyle(0x000000, 0.6).fillRect(ux - 2, y - 2, PARTNER_ULT_SIZE + 4, PARTNER_ULT_SIZE + 4);
      g.fillStyle(0x2a2418, 1).fillRect(ux, y, PARTNER_ULT_SIZE, PARTNER_ULT_SIZE);
      g.fillStyle(ult.active ? 0xfff2b0 : ready ? 0xe7b140 : 0x7a6230, 1).fillRect(ux, y + PARTNER_ULT_SIZE - fill, PARTNER_ULT_SIZE, fill);
    }
    this.updatePartnerItems(partner.items, x, dashY + 8);
  }

  private updatePartnerItems(items: readonly HudItem[], x: number, y: number): void {
    const signature = items.map((i) => `${i.frame}:${i.count}`).join('|');
    if (signature === this.partnerItemsSignature) return;
    this.partnerItemsSignature = signature;
    for (const part of [...this.partnerIcons, ...this.partnerCounts]) part.destroy();
    this.partnerIcons = [];
    this.partnerCounts = [];
    items.forEach((item, i) => {
      const cx = x + i * (PARTNER_ITEM_SIZE + PARTNER_ITEM_GAP) + PARTNER_ITEM_SIZE / 2;
      this.partnerIcons.push(this.add.image(cx, y + PARTNER_ITEM_SIZE / 2, LOOT_ATLAS.key, item.frame).setScale(0.7));
      if (item.count > 1) {
        this.partnerCounts.push(
          this.add
            .text(cx + PARTNER_ITEM_SIZE / 2, y + PARTNER_ITEM_SIZE + 2, item.evolved ? '★' : `×${item.count}`, { fontFamily: 'monospace', fontSize: '10px', color: '#e8e8f0', stroke: '#000000', strokeThickness: 3 })
            .setOrigin(1, 1),
        );
      }
    });
  }

  /** Minimapa w prawym górnym rogu: odkryte kafle + znaczniki gracza, schodów i areny bossa. */
  private drawMinimap(map: MinimapHudData | null, time: number): void {
    const cfg = MINIMAP_CONFIG;
    this.minimapMarks.clear();
    if (!map) {
      this.minimapMap.clear();
      this.minimapDrawn = null;
      return;
    }
    const { explorer } = map;
    const { width, height } = explorer.floor;
    const originX = this.scale.width - cfg.marginPx - width * cfg.tilePx;
    const originY = cfg.marginPx;

    const drawn = this.minimapDrawn;
    if (!drawn || drawn.explorer !== explorer || drawn.version !== explorer.version) {
      this.minimapDrawn = { explorer, version: explorer.version };
      const g = this.minimapMap;
      g.clear();
      g.fillStyle(cfg.background.color, cfg.background.alpha).fillRect(originX - 2, originY - 2, width * cfg.tilePx + 4, height * cfg.tilePx + 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!explorer.isRevealed(x, y)) continue;
          const wall = explorer.floor.tiles[y * width + x] === 0;
          g.fillStyle(wall ? cfg.colors.wall : cfg.colors.floor, wall ? cfg.wallAlpha : cfg.floorAlpha).fillRect(originX + x * cfg.tilePx, originY + y * cfg.tilePx, cfg.tilePx, cfg.tilePx);
        }
      }
    }

    const marks = this.minimapMarks;
    // Podpowiedź drogi (krok 147): blada smużka i iskry płynące od gracza w stronę celu.
    const route = cfg.route;
    const sparkPhase = Math.floor(time / route.sparkStepMs) % route.sparkEvery;
    visibleRoute(map.route, (x, y) => explorer.isRevealed(x, y), route.fogLeadTiles).forEach(({ tile, fade }, i) => {
      const spark = (i + route.sparkEvery - sparkPhase) % route.sparkEvery === 0;
      marks
        .fillStyle(route.color, (spark ? route.sparkAlpha : route.trailAlpha) * fade)
        .fillRect(originX + tile.x * cfg.tilePx, originY + tile.y * cfg.tilePx, cfg.tilePx, cfg.tilePx);
    });
    const dot = (p: { x: number; y: number }, color: number, size: number) =>
      marks.fillStyle(color, 1).fillRect(originX + (p.x + 0.5) * cfg.tilePx - size / 2, originY + (p.y + 0.5) * cfg.tilePx - size / 2, size, size);
    if (explorer.isRevealed(map.stairs.x, map.stairs.y)) dot(map.stairs, cfg.colors.stairs, cfg.playerPx);
    if (map.boss && explorer.isRevealed(map.boss.x, map.boss.y)) dot(map.boss, cfg.colors.boss, cfg.playerPx);
    if (Math.floor(time / 300) % 2 === 0) {
      dot(map.player, cfg.colors.player, cfg.playerPx);
      if (map.partner) dot(map.partner, cfg.colors.partner, cfg.playerPx);
    }
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
      // Krok 150: przemieniony przedmiot ma jasną ramkę i gwiazdkę zamiast licznika 3.
      slot.frame.setStrokeStyle(ITEM_SLOT_BORDER, item.evolved ? ITEM_FRAME_EVOLVED : item.rare ? ITEM_FRAME_RARE : ITEM_FRAME_COMMON);
      slot.icon.setFrame(item.frame);
      slot.count.setText(item.evolved ? (item.count > 3 ? `★${item.count}` : '★') : item.count > 1 ? `×${item.count}` : '');
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
  private drawUltimate(ultimate: UltimateHudData | null, time: number): void {
    this.ultimateText.setVisible(ultimate !== null);
    if (!ultimate) return;
    const ready = ultimate.charge >= 1;
    const fill = Math.round(ULT_SIZE * ultimate.charge);
    const color = ultimate.active ? 0xfff2b0 : ready ? 0xe7b140 : 0x7a6230;
    this.bars.fillStyle(0x000000, 0.6).fillRect(ULT_X - 2, ULT_Y - 2, ULT_SIZE + 4, ULT_SIZE + 4);
    this.bars.fillStyle(0x2a2418, 1).fillRect(ULT_X, ULT_Y, ULT_SIZE, ULT_SIZE);
    this.bars.fillStyle(color, 1).fillRect(ULT_X, ULT_Y + ULT_SIZE - fill, ULT_SIZE, fill);
    if (ready) {
      const pulse = 0.5 + 0.5 * Math.sin(time / 150);
      this.bars.lineStyle(2, 0xfff2b0, 0.4 + 0.6 * pulse).strokeRect(ULT_X - 1, ULT_Y - 1, ULT_SIZE + 2, ULT_SIZE + 2);
    }
    this.ultimateText.setColor(ready ? '#2a1a00' : '#c8b890');
  }

  private drawBeam(beam: BeamHudData | null): void {
    if (!beam) return;
    this.bars.fillStyle(0x202030, 1).fillRect(BAR_X, BEAM_Y, BAR_WIDTH, BEAM_HEIGHT);
    const color = beam.active ? 0xe4fbfb : beam.readiness >= 1 ? 0x39c0d8 : 0x1d7f9c;
    this.bars.fillStyle(color, 1).fillRect(BAR_X, BEAM_Y, BAR_WIDTH * beam.readiness, BEAM_HEIGHT);
  }

  private drawBossBar(boss: BossHudData | null): void {
    const members = boss?.members && boss.members.length > 1 ? boss.members : null;
    this.bossNameText.setVisible(boss !== null && !members);
    this.duetNameTexts.forEach((text, i) => text.setVisible(members?.[i] !== undefined));
    if (!boss) return;
    if (members) {
      members.forEach((member, i) => this.drawDuetBar(member, i));
      return;
    }

    const x = (this.scale.width - BOSS_BAR_WIDTH) / 2;
    const ratio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
    this.bossNameText.setText(boss.enraged ? `${boss.name} — ${boss.enragedLabel}` : boss.name);
    this.fillBossBar(x, BOSS_BAR_WIDTH, ratio, boss.enraged);
  }

  /**
   * Pasek jednego bossa duetu (krok 136): wściekły — pomarańczowe imię (okrzyk i tak ogłasza plansza),
   * pokonany — pusty pasek i wyszarzone imię.
   */
  private drawDuetBar(member: BossBarData, index: number): void {
    const text = this.duetNameTexts[index];
    if (!text) return;
    text.setText(member.name).setColor(member.defeated ? '#706060' : member.enraged ? '#ff8a5a' : '#ffb0a0');
    const ratio = member.maxHp > 0 ? member.hp / member.maxHp : 0;
    this.fillBossBar(this.duetBarX(index), DUET_BAR_WIDTH, ratio, member.enraged);
  }

  private fillBossBar(x: number, width: number, ratio: number, enraged: boolean): void {
    this.bars.fillStyle(0x000000, 0.6).fillRect(x - 2, BOSS_BAR_Y - 2, width + 4, BOSS_BAR_HEIGHT + 4);
    this.bars.fillStyle(0x3a1010, 1).fillRect(x, BOSS_BAR_Y, width, BOSS_BAR_HEIGHT);
    this.bars.fillStyle(enraged ? 0xff5a36 : 0xc0392b, 1).fillRect(x, BOSS_BAR_Y, width * ratio, BOSS_BAR_HEIGHT);
  }

  private duetBarX(index: number): number {
    return (this.scale.width - BOSS_BAR_WIDTH) / 2 + index * (DUET_BAR_WIDTH + DUET_BAR_GAP);
  }

  /** Strzałki do bossów poza kadrem (krok 136): grot przy krawędzi ekranu, pulsuje. */
  private drawBossPointers(pointers: readonly BossPointerData[], time: number): void {
    const g = this.pointers.clear();
    if (pointers.length === 0) return;
    const { lengthPx, widthPx, color, pulseMs, minAlpha } = BOSS_POINTER_CONFIG;
    const pulse = 0.5 + 0.5 * Math.sin((time / pulseMs) * Math.PI * 2);
    const alpha = minAlpha + (1 - minAlpha) * pulse;
    for (const { x, y, angle } of pointers) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      // Grot w stronę bossa, podstawa cofnięta o długość grotu.
      const tip = { x: x + cos * lengthPx * 0.5, y: y + sin * lengthPx * 0.5 };
      const bx = x - cos * lengthPx * 0.5;
      const by = y - sin * lengthPx * 0.5;
      const half = widthPx / 2;
      g.fillStyle(0x000000, 0.7).fillTriangle(
        tip.x + cos * 2, tip.y + sin * 2,
        bx - sin * (half + 2) - cos * 2, by + cos * (half + 2) - sin * 2,
        bx + sin * (half + 2) - cos * 2, by - cos * (half + 2) - sin * 2,
      );
      g.fillStyle(color, alpha).fillTriangle(tip.x, tip.y, bx - sin * half, by + cos * half, bx + sin * half, by - cos * half);
    }
  }

}
