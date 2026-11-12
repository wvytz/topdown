import { SORCERY_COLORS } from '@/config/heroColorConfig';
import Phaser from 'phaser';
import { BOSS_RUSH_TEXT } from '@/config/bossRushConfig';
import type { BeamHudData, BossBarData, BossHudData, BossPointerData, UltimateHudData, HudData, HudItemNotice, HudPartnerData, HudSceneData, HudSource, MinimapHudData } from '@/core/types';
import { HERO_DEFINITIONS } from '@/config/heroConfig';
import { HUD_GAUGES } from '@/config/hudGaugeConfig';
import { gaugeThemeFor } from '@/systems/hudGauges';
import { drawBeamGauge, drawDashGauge } from '@/ui/ClassGauges';
import { SceneKey } from '@/core/types';
import { ALL_ITEMS } from '@/config/lootConfig';
import { LOOT_ATLAS } from '@/config/spriteConfig';
import { MINIMAP_CONFIG } from '@/config/minimapConfig';
import type { MinimapExplorer } from '@/systems/Minimap';
import { visibleRoute } from '@/systems/MinimapRoute';
import { DeathScreen } from '@/effects/DeathScreen';
import { BossIntroCard, introCardEnabled } from '@/effects/BossIntroCard';
import { display } from '@/input/DisplayControls';
import { currentPlatform } from '@/core/platform';
import { BOSS_POINTER_CONFIG } from '@/config/gameConfig';
import { DEATH_HERO_ICON } from '@/config/deathScreenConfig';
import { HUD_LAYOUT as L, UI_PALETTE as P, UI_TEXT_COLORS as C } from '@/config/uiConfig';
import { heroIconTexture } from '@/effects/heroIcon';
import { fadingAlpha, floorModifierNote, goldNote, objectiveHint, type ObjectiveTone } from '@/systems/hudText';
import { UiText, uiText } from '@/ui/UiText';
import { drawBar, drawFrame, rampOf } from '@/ui/UiFrame';
import { ItemSlotView } from '@/ui/ItemSlotView';

/**
 * Lewy górny panel (krok U7e, prośba właściciela): pasek zdrowia z ultimate obok, pod nim żywe wskaźniki klasy
 * (dash, promień, ładunki), dalej złoto i zdobyte przedmioty. Bez portretu i bez napisu piętra.
 */
const BAR_X = L.margin;
const ULT_X = BAR_X + L.hp.width + 7;
const GB = HUD_GAUGES.bar;

/**
 * Położenie elementów lewego panelu. `t` — skala drobnych napisów: 1 na PC, 2 na telefonie. `hasBeam` — pasek
 * promienia Czarodziejki pod dashem.
 */
function hudGeometry(t: 1 | 2, hasBeam: boolean) {
  const hpY = L.margin;
  const dashY = hpY + L.hp.height + 1 + GB.gap;
  const beamY = dashY + GB.height + GB.gap + 1;
  // Krok U7f: bez ikon ładunków (właściciel: „nie daje to żadnej informacji, a wprowadza dezinformację”).
  const goldY = (hasBeam ? beamY : dashY) + GB.height + GB.gap + 3;
  const itemY = goldY + 10 * t + 3;
  const objectiveY = itemY + L.itemSlot.size + 5;
  return { t, hasBeam, hpY, dashY, beamY, ultY: hpY - 1, goldY, itemY, objectiveY };
}
type HudGeometry = ReturnType<typeof hudGeometry>;
const ITEM_NOTICE_FADE_MS = 800;
/** Plansza bossa (wściekłość): czas, pojawianie się i wygasanie. */
const BANNER_MS = 3000;
const BANNER_FADE_IN_MS = 300;
const BANNER_FADE_OUT_MS = 900;
const BANNER_Y = 150;
const BOSS = L.bossBar;
const DUET_BAR_WIDTH = (BOSS.width - BOSS.duetGap) / 2;

/** Rampy pasków (światło, barwa, cień). */
const RAMPS = {
  hp: rampOf(0x3ddc84),
  hpLow: rampOf(0xe0484a),
  dash: rampOf(0x6ec6ff),
  dashCharging: rampOf(0x3a6080),
  charge: rampOf(0x5ee0c8),
  chargeLoading: rampOf(0x2f7064),
  boss: rampOf(0xc0392b),
  bossEnraged: rampOf(0xff5a36),
  revive: rampOf(0x8affa0),
  beam: { active: rampOf(SORCERY_COLORS.core), ready: rampOf(SORCERY_COLORS.base), loading: rampOf(SORCERY_COLORS.deep) },
} as const;

const TONE_COLORS: Readonly<Record<ObjectiveTone, string>> = { plain: C.dim, stairs: C.gold, boss: C.boss, arena: '#c8a8ff' };

/** Podpowiedź sterowania: Czarodziejka ma kule i promień zamiast ciosu i strzału. */
function helpLine(sorceress: boolean): string {
  // Wersja mobilna (krok 96): przyciski są podpisane na ekranie, a linia pomocy zasłaniałaby gałkę ruchu.
  if (currentPlatform() === 'mobile') return '';
  const attacks = sorceress ? 'LPM — kule energii · PPM — Wyrwa (przytrzymaj, rośnie)' : 'LPM — atak · PPM — strzał';
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
 * Krok U7: nowy HUD — pikselowy krój, ramki i paski z rampą, portret bohatera; długie podpowiedzi i linia
 * sterowania gasną po chwili, żeby nie zasłaniać walki.
 */
export class HudScene extends Phaser.Scene {
  private source!: HudSource;
  private geo!: HudGeometry;
  /** Ramki (portret, sloty, minimapa) — przerysowywane co klatkę razem z paskami. */
  private bars!: Phaser.GameObjects.Graphics;
  private coin!: Phaser.GameObjects.Image;
  /** Dash: od kiedy gotowy (drganie cięciwy łucznika po napięciu). */
  private dashReadyAt: number | null = null;
  private hpText!: UiText;
  private ultimateText!: UiText;
  private helpText!: UiText;
  private hintText!: UiText;
  private deathScreen!: DeathScreen;
  /** Minimapa: tło i odkryte kafle rysujemy tylko przy zmianie, znaczniki co klatkę. */
  private minimapMap!: Phaser.GameObjects.Graphics;
  private minimapMarks!: Phaser.GameObjects.Graphics;
  private minimapDrawn: { explorer: MinimapExplorer; version: number } | null = null;
  private bossNameText!: UiText;
  /** Imiona nad paskami duetu (krok 136). */
  private duetNameTexts: UiText[] = [];
  private pointers!: Phaser.GameObjects.Graphics;
  private goldText!: UiText;
  private goldNoteText!: UiText;
  private items!: ItemSlotView;
  private itemNoticeText!: UiText;
  /** Opis modyfikatora piętra pod przedmiotami (krok U7b), gaśnie po `modifierLongMs`. */
  private modifierText!: UiText;
  private toastText!: UiText;
  private bannerTitle!: UiText;
  private bannerSubtitle!: UiText;
  private bannerStartedAt = -Infinity;
  /** Co już ogłoszono w tej walce (przebudzenie, wściekłość) — plansza pokazuje się raz. */
  private bannerBoss: BossHudData | null = null;
  /** Krok U6: karta wejścia bossa (zamiast planszy przy przebudzeniu) i ostatnie fazy pasków. */
  private introCard!: BossIntroCard;
  /** Co-op (etap C5): napis P1 przy pasku i panel P2. */
  private playerLabelText!: UiText;
  private partnerLabel!: UiText;
  private partnerHpText!: UiText;
  private partnerPortrait!: Phaser.GameObjects.Image;
  private partnerItems!: ItemSlotView;
  /** Krok U7: kiedy zaczął się run (linia pomocy), piętro i cel (pełne podpowiedzi gasną po chwili). */
  private createdAt = 0;
  private floorShown = -1;
  private floorSince = 0;
  private objectiveKey = '';
  private objectiveSince = 0;

  constructor() {
    super(SceneKey.Hud);
  }

  create(data: HudSceneData): void {
    this.source = data.source;
    this.createdAt = this.time.now;
    this.floorShown = -1;
    this.objectiveKey = '';
    this.dashReadyAt = null;
    const geo = (this.geo = hudGeometry(currentPlatform() === 'mobile' ? L.textScale.mobile : L.textScale.pc, false));
    const t = geo.t;

    this.bars = this.add.graphics();
    this.hpText = uiText(this, BAR_X + L.hp.width - 3, geo.hpY - 1, '', { color: C.bright, align: 'right' }).setOrigin(1, 0);
    // Na telefonie ultimate ma własny przycisk — kwadrat bez litery klawisza.
    this.ultimateText = uiText(this, ULT_X + L.ultimate.size / 2, geo.ultY + L.ultimate.size / 2, currentPlatform() === 'mobile' ? '' : 'R', { color: C.bright }).setOrigin(0.5);
    this.playerLabelText = uiText(this, ULT_X + L.ultimate.size + 6, geo.hpY, '', { size: t, color: '#3ddc84' });

    this.coin = this.add.image(0, 0, LOOT_ATLAS.key, 'coin_0');
    this.goldText = uiText(this, 0, 0, '', { size: t, color: C.gold });
    this.goldNoteText = uiText(this, 0, 0, '', { size: t, color: C.dim });
    this.hintText = uiText(this, BAR_X, 0, '', { size: t, color: C.dim });

    this.minimapMap = this.add.graphics();
    this.minimapMarks = this.add.graphics();
    this.items = new ItemSlotView(this, { x: BAR_X, y: geo.itemY, size: L.itemSlot.size, gap: L.itemSlot.gap, iconScale: 1, capacity: ALL_ITEMS.length });
    this.modifierText = uiText(this, BAR_X, 0, '', { size: t, color: C.magic, wrap: L.noteWrap });
    this.itemNoticeText = uiText(this, BAR_X, 0, '', { size: t, color: C.gold, wrap: L.noteWrap }).setAlpha(0);
    this.layoutPanel();
    this.toastText = uiText(this, this.scale.width / 2, 70, '', { size: 2, color: '#ffe08a', align: 'center' }).setOrigin(0.5);

    this.bossNameText = uiText(this, this.scale.width / 2, BOSS.y - 24, '', { size: 2, color: C.boss }).setOrigin(0.5, 0).setVisible(false);
    this.duetNameTexts = [0, 1].map((i) => uiText(this, this.duetBarX(i) + DUET_BAR_WIDTH / 2, BOSS.y - 18, '', { color: C.boss }).setOrigin(0.5, 0).setVisible(false));
    this.pointers = this.add.graphics();

    this.bannerTitle = uiText(this, this.scale.width / 2, BANNER_Y, '', { size: 4, color: '#f0d27a', align: 'center' }).setOrigin(0.5).setAlpha(0);
    this.bannerSubtitle = uiText(this, this.scale.width / 2, BANNER_Y + 34, '', { size: 2, color: C.magic, align: 'center' }).setOrigin(0.5).setAlpha(0);

    this.introCard = new BossIntroCard(this);

    this.helpText = uiText(this, this.scale.width / 2, this.scale.height - 14, '', { color: C.dim, align: 'center' }).setOrigin(0.5, 0);

    const px = this.scale.width - L.partner.right - L.partner.width;
    const py = this.scale.height - L.partner.topFromBottom;
    this.partnerPortrait = this.add.image(px - 22, py + 6, '__DEFAULT').setVisible(false);
    this.partnerLabel = uiText(this, px, py - 13, '', { color: '#6ec6ff' });
    this.partnerHpText = uiText(this, px + L.partner.width, py - 13, '', { color: C.text }).setOrigin(1, 0);
    this.partnerItems = new ItemSlotView(this, { x: px, y: py + L.partner.hpHeight + 10, size: L.partner.itemSize, gap: L.partner.itemGap, iconScale: 0.75, capacity: ALL_ITEMS.length });

    // Ekran śmierci na samej górze: jego przyciemnienie przykrywa też resztę HUD (krok 35).
    this.deathScreen = new DeathScreen(this);
  }

  override update(time: number): void {
    const hud = this.source.getHudData();
    this.bars.clear();

    if (hud.floor !== this.floorShown) {
      this.floorShown = hud.floor;
      this.floorSince = time;
    }
    if ((hud.beam !== null) !== this.geo.hasBeam) {
      this.geo = hudGeometry(this.geo.t, hud.beam !== null);
      this.layoutPanel();
    }
    const sinceFloor = time - this.floorSince;
    const modifierLong = sinceFloor < L.modifierLongMs;
    this.modifierText.setText(floorModifierNote(hud.floorModifier, sinceFloor, L.modifierLongMs)).setColor(modifierLong ? C.magic : C.dim);
    this.hpText.setText(`${hud.hp}/${hud.maxHp}`);

    const hpRatio = hud.maxHp > 0 ? hud.hp / hud.maxHp : 0;
    drawBar(this.bars, BAR_X, this.geo.hpY, L.hp.width, L.hp.height, hpRatio, hpRatio > 0.3 ? RAMPS.hp : RAMPS.hpLow);
    this.drawClassGauges(hud.hero, hud.dashReadiness, hud.beam, time);
    this.drawUltimate(hud.ultimate, time);

    const help = helpLine(hud.beam !== null);
    const helpAlpha = fadingAlpha(time - this.createdAt, L.helpVisibleMs, L.helpFadeMs);
    this.helpText.setText(helpAlpha > 0 ? help : '').setAlpha(helpAlpha);

    const objective = objectiveHint({ ...hud, boss: hud.boss !== null }, pressE(), BOSS_RUSH_TEXT);
    if (objective.key !== this.objectiveKey) {
      this.objectiveKey = objective.key;
      this.objectiveSince = time;
    }
    this.hintText.setText(time - this.objectiveSince < L.objectiveLongMs ? objective.long : objective.short).setColor(TONE_COLORS[objective.tone]);
    // Pod przedmiotami: cel (gdy jest), modyfikator piętra, wiadomość o nowym przedmiocie — jedno pod drugim.
    const lineGap = 10 * this.geo.t + 3;
    this.modifierText.setY(this.geo.objectiveY + (this.hintText.text !== '' ? lineGap : 0));

    this.goldText.setText(String(hud.gold));
    this.goldNoteText.setText(goldNote(hud, BOSS_RUSH_TEXT.goldSuffix)).setX(this.goldText.x + this.goldText.width + 6);
    this.items.update(hud.items, this.bars);
    this.updateItemNotice(hud.itemNotice);

    // Komunikat wygasa w ostatniej sekundzie wyświetlania.
    this.toastText.setText(hud.toast?.text ?? '');
    this.toastText.setAlpha(hud.toast ? Math.min(1, hud.toast.remainingMs / 1000 + 0.2) : 0);

    this.drawMinimap(hud.minimap, time);
    this.drawBossBar(hud.boss);
    this.drawBossPointers(hud.bossPointers, time);
    this.updateBanner(hud.boss);
    this.playerLabelText.setText(hud.playerLabel);
    this.drawPartner(hud.partner, time);
    this.deathScreen.update(hud.death, time);
  }

  /** Złoto (moneta + liczba) i rząd przedmiotów pod wskaźnikami; po zmianie układu (promień Czarodziejki). */
  private layoutPanel(): void {
    const geo = this.geo;
    this.coin.setPosition(BAR_X + 4, geo.goldY + 5 * geo.t + 1);
    this.goldText.setPosition(BAR_X + 12, geo.goldY);
    this.goldNoteText.setY(geo.goldY);
    this.hintText.setY(geo.objectiveY);
    this.items.moveTo(BAR_X, geo.itemY);
  }

  /** Dash i promień w motywie klasy (krok U7e): krew, magia albo cięciwa; ładunków nie pokazujemy (U7f). */
  private drawClassGauges(hero: HudData['hero'], dashReadiness: number, beam: BeamHudData | null, time: number): void {
    const theme = gaugeThemeFor(HERO_DEFINITIONS[hero].kit.kind);
    if (dashReadiness >= 1) this.dashReadyAt ??= time;
    else this.dashReadyAt = null;
    const calm = display.settings.reduceFlashes;
    drawDashGauge(this.bars, theme, BAR_X, this.geo.dashY, L.hp.width, { readiness: dashReadiness, time, sinceReadyMs: this.dashReadyAt === null ? null : time - this.dashReadyAt, calm });
    if (beam) drawBeamGauge(this.bars, BAR_X, this.geo.beamY, L.hp.width, beam, time);
  }

  /** Panel P2: portret, imię, HP (albo „POWALONY” z paskiem wskrzeszania), dash, ultimate i przedmioty. */
  private drawPartner(partner: HudPartnerData | null, time: number): void {
    for (const part of [this.partnerLabel, this.partnerHpText, this.partnerPortrait]) part.setVisible(partner !== null);
    if (!partner) {
      this.partnerItems.update([], this.bars);
      return;
    }
    const W = L.partner;
    const x = this.scale.width - W.right - W.width;
    const y = this.scale.height - W.topFromBottom;
    const g = this.bars;
    drawFrame(g, x - 38, y - 6, 32, 32, { rivets: null });
    const spec = { facing: DEATH_HERO_ICON.facing, crop: DEATH_HERO_ICON.crop, sizePx: 26 };
    this.partnerPortrait.setTexture(heroIconTexture(this, partner.hero, spec)).setPosition(x - 22, y + 10);
    this.partnerLabel.setText(partner.downed ? `${partner.label} · POWALONY` : partner.label);
    if (partner.downed) {
      const pulse = 0.5 + 0.5 * Math.sin(time / 180);
      this.partnerHpText.setText('');
      this.partnerLabel.setColor(pulse > 0.5 ? C.red : '#ffb0b0');
      drawBar(g, x, y, W.width, W.hpHeight, partner.reviveProgress, RAMPS.revive, 0x2a1010);
    } else {
      const ratio = partner.maxHp > 0 ? partner.hp / partner.maxHp : 0;
      this.partnerHpText.setText(`${partner.hp}/${partner.maxHp}`);
      this.partnerLabel.setColor('#6ec6ff');
      drawBar(g, x, y, W.width, W.hpHeight, ratio, ratio > 0.3 ? RAMPS.hp : RAMPS.hpLow);
    }
    const dashY = y + W.hpHeight + 3;
    drawBar(g, x, dashY, W.width, 2, partner.dashReadiness, partner.dashReadiness >= 1 ? RAMPS.dash : RAMPS.dashCharging);
    const ult = partner.ultimate;
    if (ult) this.drawUltimateBox(x - 38 - W.ultSize - 4, y - 6, W.ultSize, ult, time);
    this.partnerItems.update(partner.items, g);
  }

  /** Minimapa w prawym górnym rogu w pikselowej ramce: odkryte kafle + znaczniki gracza, schodów i areny bossa. */
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
      // Krok U7: ramka jak reszta HUD-u, wnętrze dalej ledwie przyciemnione (krok 147: mapa nie zasłania gry).
      drawFrame(g, originX - 4, originY - 4, width * cfg.tilePx + 8, height * cfg.tilePx + 8, { fill: cfg.background.color, fillAlpha: cfg.background.alpha, bevel: null, rivets: P.gold });
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
    const dot = (p: { x: number; y: number }, color: number, size: number) => {
      const left = Math.round(originX + (p.x + 0.5) * cfg.tilePx - size / 2);
      const top = Math.round(originY + (p.y + 0.5) * cfg.tilePx - size / 2);
      marks.fillStyle(P.ink, 1).fillRect(left - 1, top - 1, size + 2, size + 2);
      marks.fillStyle(color, 1).fillRect(left, top, size, size);
    };
    // Ikonki pokojów (krok 163) — pod schodami, bossem i graczem.
    const M = cfg.markers;
    for (const marker of map.markers) {
      if (!explorer.isRevealed(marker.x, marker.y)) continue;
      const { color, pattern } = M[marker.kind];
      const size = pattern.length * M.pixelPx;
      const left = Math.round(originX + (marker.x + 0.5) * cfg.tilePx - size / 2);
      const top = Math.round(originY + (marker.y + 0.5) * cfg.tilePx - size / 2);
      marks.fillStyle(M.outline, M.outlineAlpha).fillRect(left - 1, top - 1, size + 2, size + 2);
      pattern.forEach((row, py) => {
        for (let px = 0; px < row.length; px++) {
          if (row[px] === '#') marks.fillStyle(color, 1).fillRect(left + px * M.pixelPx, top + py * M.pixelPx, M.pixelPx, M.pixelPx);
        }
      });
    }
    if (explorer.isRevealed(map.stairs.x, map.stairs.y)) dot(map.stairs, cfg.colors.stairs, cfg.playerPx);
    if (map.boss && explorer.isRevealed(map.boss.x, map.boss.y)) dot(map.boss, cfg.colors.boss, cfg.playerPx);
    if (Math.floor(time / 300) % 2 === 0) {
      dot(map.player, cfg.colors.player, cfg.playerPx);
      if (map.partner) dot(map.partner, cfg.colors.partner, cfg.playerPx);
    }
  }

  /** „Nazwa — efekt” pod ikonami; wygasa pod koniec wyświetlania. */
  private updateItemNotice(notice: HudItemNotice | null): void {
    this.itemNoticeText.setText(notice ? `${notice.name} — ${notice.effect}` : '');
    // Pod opisem modyfikatora, jeśli ten jeszcze widać.
    const below = this.modifierText.text !== '' ? this.modifierText.height + 4 : 0;
    this.itemNoticeText.setY(this.modifierText.y + below);
    this.itemNoticeText.setAlpha(notice ? Math.min(1, notice.remainingMs / ITEM_NOTICE_FADE_MS) : 0);
  }

  /** Plansza: imię i tytuł bossa przy przebudzeniu, okrzyk przy wściekłości (tylko bossowie z tytułem). */
  private updateBanner(boss: BossHudData | null): void {
    const now = this.time.now;
    const previous = this.bannerBoss;
    this.bannerBoss = boss;
    this.introCard.update(now);
    if (boss?.title) {
      // Krok U6: przebudzenie ogłasza karta z portretem; `?bossCard=0` — dawna plansza.
      if (!previous && introCardEnabled()) this.introCard.show({ name: boss.name, title: boss.title, portraits: boss.portraits ?? [] }, now);
      else if (!previous) this.showBanner(boss.name, boss.title, now);
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

  /** Ultimate: kwadrat za paskiem HP, wypełnia się od dołu; pełny — złoty i pulsuje obwódką. */
  private drawUltimate(ultimate: UltimateHudData | null, time: number): void {
    this.ultimateText.setVisible(ultimate !== null);
    if (!ultimate) return;
    this.drawUltimateBox(ULT_X, this.geo.ultY, L.ultimate.size, ultimate, time);
    this.ultimateText.setColor(ultimate.charge >= 1 ? C.bright : C.dim);
  }

  private drawUltimateBox(x: number, y: number, size: number, ultimate: { readonly charge: number; readonly active: boolean }, time: number): void {
    const g = this.bars;
    const ready = ultimate.charge >= 1;
    const fill = Math.round((size - 4) * Math.min(1, ultimate.charge));
    drawFrame(g, x, y, size, size, { edge: ready ? P.gold : P.edge, bevel: null, fillAlpha: 0.9 });
    const color = ultimate.active ? 0xfff2b0 : ready ? P.gold : 0x7a6230;
    g.fillStyle(color, 1).fillRect(x + 2, y + size - 2 - fill, size - 4, fill);
    if (fill > 1) g.fillStyle(ready ? P.goldLight : 0x9a8040, 1).fillRect(x + 2, y + size - 2 - fill, size - 4, 1);
    if (ready && !display.settings.reduceFlashes) {
      // Gotowe: obwódka miga skokowo (2 stopnie), nie płynnie.
      const on = Math.floor(time / 260) % 2 === 0;
      if (on) g.fillStyle(P.goldLight, 0.9).fillRect(x - 1, y - 1, size + 2, 1).fillRect(x - 1, y + size, size + 2, 1).fillRect(x - 1, y, 1, size).fillRect(x + size, y, 1, size);
    }
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

    const x = (this.scale.width - BOSS.width) / 2;
    const ratio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
    // Krok U7h (ocena właściciela): bez „faza x/y” i kresek progów — fazy nie są komunikowane.
    this.bossNameText.setText(boss.enraged ? `${boss.name} — ${boss.enragedLabel}` : boss.name);
    this.fillBossBar(x, BOSS.width, ratio, boss.enraged);
  }

  /**
   * Pasek jednego bossa duetu (krok 136): wściekły — pomarańczowe imię (okrzyk i tak ogłasza plansza),
   * pokonany — pusty pasek i wyszarzone imię.
   */
  private drawDuetBar(member: BossBarData, index: number): void {
    const text = this.duetNameTexts[index];
    if (!text) return;
    text.setText(member.name).setColor(member.defeated ? C.muted : member.enraged ? '#ff8a5a' : C.boss);
    const ratio = member.maxHp > 0 ? member.hp / member.maxHp : 0;
    this.fillBossBar(this.duetBarX(index), DUET_BAR_WIDTH, ratio, member.enraged);
  }

  /** Pasek bossa w ramce z czerwonymi nitami (barwy ekranu startowego). */
  private fillBossBar(x: number, width: number, ratio: number, enraged: boolean): void {
    drawFrame(this.bars, x - 4, BOSS.y - 4, width + 8, BOSS.height + 8, { rivets: P.redLight, bevel: null });
    drawBar(this.bars, x, BOSS.y, width, BOSS.height, ratio, enraged ? RAMPS.bossEnraged : RAMPS.boss, 0x2a0c10);
  }

  private duetBarX(index: number): number {
    return (this.scale.width - BOSS.width) / 2 + index * (DUET_BAR_WIDTH + BOSS.duetGap);
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
      g.fillStyle(P.ink, 0.85).fillTriangle(
        tip.x + cos * 2, tip.y + sin * 2,
        bx - sin * (half + 2) - cos * 2, by + cos * (half + 2) - sin * 2,
        bx + sin * (half + 2) - cos * 2, by - cos * (half + 2) - sin * 2,
      );
      g.fillStyle(color, alpha).fillTriangle(tip.x, tip.y, bx - sin * half, by + cos * half, bx + sin * half, by - cos * half);
    }
  }
}

