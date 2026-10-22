import Phaser from 'phaser';
import type { HeroId } from '@/core/heroTypes';
import type { FloorSceneData, HeroSelectData } from '@/core/types';
import { SceneKey } from '@/core/types';
import { HERO_DEFINITIONS, HERO_ORDER } from '@/config/heroConfig';
import { HERO_SELECT_LAYOUT as L, HERO_SELECT_PALETTE as P } from '@/config/heroSelectConfig';
import { HERO_VISUALS, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import { LastHero } from '@/persistence/LastHero';
import { cycleIndex, heroStatLine, initialIndex } from '@/systems/heroSelect';
import { newRun } from '@/systems/RunState';
import { RunMode } from '@/core/runMode';
import { BOSS_RUSH_TEXT } from '@/config/bossRushConfig';
import { nextRunMode } from '@/systems/BossRush';
import { openMainMenu } from '@/scenes/BootScene';
import { FLOOR_SELECT_TEXT } from '@/config/floorSelectConfig';
import { startFloorInfo } from '@/systems/FloorSelect';

interface HeroCard {
  readonly hero: HeroId;
  readonly frame: Phaser.GameObjects.Rectangle;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly texts: readonly Phaser.GameObjects.Text[];
  readonly name: Phaser.GameObjects.Text;
  readonly stats: Phaser.GameObjects.Text;
}

interface ModeTab {
  readonly mode: RunMode;
  readonly frame: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

const MODE_ORDER: readonly RunMode[] = [RunMode.Tower, RunMode.BossRush];

/**
 * Ekran wyboru bohatera (krok 38): karty z postacią, statystykami i opisem ataków.
 * Strzałki / A, D / 1, 2 lub najechanie myszą zmieniają wybór; Enter, Spacja lub kliknięcie zaczyna run.
 * Pod kartami wybór trybu (krok 90): wspinaczka albo areny bossów — ↑ ↓ / W, S / Tab albo kliknięcie zakładki.
 * Esc wraca do menu głównego (krok 91).
 */
export class HeroSelectScene extends Phaser.Scene {
  private selectData!: HeroSelectData;
  private cards: HeroCard[] = [];
  private selected = 0;
  private mode = RunMode.Tower;
  private modeTabs: ModeTab[] = [];
  private modeDescription!: Phaser.GameObjects.Text;
  private starting = false;
  private readonly lastHero = new LastHero(HighscoreStorage.browserStorage());

  constructor() {
    super(SceneKey.Select);
  }

  init(data: HeroSelectData): void {
    this.selectData = data;
    this.cards = [];
    this.modeTabs = [];
    this.mode = data.mode ?? RunMode.Tower;
    this.starting = false;
    this.selected = initialIndex(HERO_ORDER, data.preselect ?? this.lastHero.load());
  }

  create(): void {
    this.cameras.main.setBackgroundColor(P.background);
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'monospace', color: P.text };

    this.add
      .text(L.centerX, L.title.y, 'WYBIERZ BOHATERA', { ...style, fontSize: `${L.title.fontSize}px`, color: P.title })
      .setOrigin(0.5)
      .setLetterSpacing(L.title.letterSpacing);

    const { width, gap, top } = L.card;
    const totalWidth = HERO_ORDER.length * width + (HERO_ORDER.length - 1) * gap;
    HERO_ORDER.forEach((hero, i) => {
      const left = L.centerX - totalWidth / 2 + i * (width + gap);
      this.cards.push(this.buildCard(hero, left + width / 2, top, style));
    });

    // Wybór piętra (krok 91) przychodzi z menu z wybranym piętrem — bez zakładek, sam opis startu.
    if (this.mode !== RunMode.FloorSelect) this.buildModeTabs(style);
    else this.modeDescription = this.add.text(L.centerX, L.mode.y, '', { ...style, fontSize: `${L.mode.fontSize}px` }).setOrigin(0.5);

    this.add
      .text(L.centerX, L.hint.y, this.hintText(), { ...style, fontSize: `${L.hint.fontSize}px`, color: P.hint })
      .setOrigin(0.5)
      .setLetterSpacing(L.hint.letterSpacing);

    const keyboard = this.input.keyboard;
    keyboard?.on('keydown', (event: KeyboardEvent) => this.onKey(event));
    this.refresh();
    this.cameras.main.fadeIn(L.fadeMs, 0, 0, 0);
  }

  private buildCard(hero: HeroId, centerX: number, top: number, style: Phaser.Types.GameObjects.Text.TextStyle): HeroCard {
    const def = HERO_DEFINITIONS[hero];
    const { width, height, borderWidth } = L.card;
    const frame = this.add
      .rectangle(centerX, top + height / 2, width, height, P.card)
      .setStrokeStyle(borderWidth, P.border)
      .setInteractive({ useHandCursor: true });
    const index = HERO_ORDER.indexOf(hero);
    frame.on('pointerover', () => this.select(index));
    frame.on('pointerdown', () => {
      this.select(index);
      this.confirm();
    });

    const sheet = HERO_VISUALS[hero].sheet;
    const sprite = this.add
      .sprite(centerX, top + L.sprite.offsetY, SPRITE_SHEETS[sheet].key)
      .setScale(L.sprite.scale);

    const name = this.add
      .text(centerX, top + L.name.offsetY, def.name.toUpperCase(), { ...style, fontSize: `${L.name.fontSize}px` })
      .setOrigin(0.5, 0)
      .setLetterSpacing(L.name.letterSpacing);
    const tagline = this.add
      .text(centerX, top + L.tagline.offsetY, def.tagline, { ...style, fontSize: `${L.tagline.fontSize}px` })
      .setOrigin(0.5, 0);
    const stats = this.add
      .text(centerX, top + L.stats.offsetY, heroStatLine(def), { ...style, fontSize: `${L.stats.fontSize}px`, color: P.input })
      .setOrigin(0.5, 0);
    const attacks = def.attacks.map((attack, i) =>
      this.add
        .text(centerX, top + L.attacks.offsetY + i * L.attacks.step, `${attack.input} — ${attack.text}`, {
          ...style,
          fontSize: `${L.attacks.fontSize}px`,
        })
        .setOrigin(0.5, 0),
    );
    return { hero, frame, sprite, name, stats, texts: [tagline, ...attacks] };
  }

  /** Dwie zakładki trybu pod kartami i jednolinijkowy opis zaznaczonego trybu. */
  private buildModeTabs(style: Phaser.Types.GameObjects.Text.TextStyle): void {
    const { y, tabWidth, tabHeight, gap, fontSize, letterSpacing, borderWidth, descriptionY, descriptionFontSize } = L.mode;
    const total = MODE_ORDER.length * tabWidth + (MODE_ORDER.length - 1) * gap;
    MODE_ORDER.forEach((mode, i) => {
      const x = L.centerX - total / 2 + i * (tabWidth + gap) + tabWidth / 2;
      const frame = this.add
        .rectangle(x, y, tabWidth, tabHeight, P.card)
        .setStrokeStyle(borderWidth, P.border)
        .setInteractive({ useHandCursor: true });
      frame.on('pointerdown', () => this.setMode(mode));
      const text = mode === RunMode.BossRush ? `${BOSS_RUSH_TEXT.modeName} · ${BOSS_RUSH_TEXT.testBadge}` : BOSS_RUSH_TEXT.towerModeName;
      const label = this.add
        .text(x, y, text, { ...style, fontSize: `${fontSize}px` })
        .setOrigin(0.5)
        .setLetterSpacing(letterSpacing);
      this.modeTabs.push({ mode, frame, label });
    });
    this.modeDescription = this.add
      .text(L.centerX, descriptionY, '', { ...style, fontSize: `${descriptionFontSize}px` })
      .setOrigin(0.5);
  }

  private setMode(mode: RunMode): void {
    if (this.starting || mode === this.mode || this.mode === RunMode.FloorSelect) return;
    this.mode = mode;
    this.refresh();
  }

  private onKey(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'w':
      case 'W':
      case 's':
      case 'S':
      case 'Tab':
        event.preventDefault();
        this.setMode(nextRunMode(this.mode));
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.select(cycleIndex(this.selected, -1, this.cards.length));
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.select(cycleIndex(this.selected, 1, this.cards.length));
        break;
      case 'Enter':
      case ' ':
        this.confirm();
        break;
      case 'Escape':
        this.backToMenu();
        break;
      default: {
        // 1, 2 … — wybór i start jednym klawiszem.
        const digit = Number(event.key);
        if (Number.isInteger(digit) && digit >= 1 && digit <= this.cards.length) {
          this.select(digit - 1);
          this.confirm();
        }
      }
    }
  }

  private select(index: number): void {
    if (this.starting || index === this.selected) return;
    this.selected = index;
    this.refresh();
  }

  /** Zaznaczona karta: złota ramka, jaśniejsze tło, postać idzie; pozostałe przygaszone i stoją. */
  private refresh(): void {
    this.cards.forEach((card, i) => {
      const active = i === this.selected;
      const sheet = HERO_VISUALS[card.hero].sheet;
      card.frame.setFillStyle(active ? P.cardSelected : P.card).setStrokeStyle(L.card.borderWidth, active ? P.borderSelected : P.border);
      card.sprite.play(animationKey(sheet, active ? HERO_VISUALS[card.hero].move : HERO_VISUALS[card.hero].idle, L.facing));
      card.sprite.setAlpha(active ? 1 : 0.6);
      card.name.setColor(active ? P.name : P.nameDim);
      card.stats.setColor(active ? P.input : P.textDim);
      for (const text of card.texts) text.setColor(active ? P.text : P.textDim);
    });
    for (const tab of this.modeTabs) {
      const active = tab.mode === this.mode;
      const accent = tab.mode === RunMode.BossRush ? P.arenaMode : P.name;
      tab.frame.setFillStyle(active ? P.cardSelected : P.card).setStrokeStyle(L.mode.borderWidth, active ? P.borderSelected : P.border);
      tab.label.setColor(active ? accent : P.textDim);
    }
    if (this.mode === RunMode.FloorSelect) {
      this.modeDescription.setText(`${FLOOR_SELECT_TEXT.modeName} · ${FLOOR_SELECT_TEXT.selectHint(startFloorInfo(this.selectData.floor).label)}`).setColor(P.name);
      return;
    }
    this.modeDescription
      .setText(this.mode === RunMode.BossRush ? BOSS_RUSH_TEXT.modeHint : BOSS_RUSH_TEXT.towerModeHint)
      .setColor(this.mode === RunMode.BossRush ? P.arenaMode : P.hint);
  }

  /** Podpowiedź klawiszy; przy wyborze piętra trybu się nie zmienia. */
  private hintText(): string {
    const mode = this.mode === RunMode.FloorSelect ? '' : '   ·   ↑ ↓  TRYB';
    return `← →  BOHATER${mode}   ·   ENTER — START   ·   ESC — MENU`;
  }

  /** Esc — powrót do menu głównego (krok 91), z tym samym seedem i trybem. */
  private backToMenu(): void {
    if (this.starting) return;
    this.starting = true;
    const hero = this.cards[this.selected]!.hero;
    const start: FloorSceneData = {
      runSeed: this.selectData.runSeed,
      floor: this.selectData.floor,
      run: newRun(hero, this.selectData.practice ?? false, this.mode),
    };
    this.cameras.main.fadeOut(L.fadeMs, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => openMainMenu(this, start));
  }

  private confirm(): void {
    if (this.starting) return;
    this.starting = true;
    const hero = this.cards[this.selected]!.hero;
    this.lastHero.save(hero);
    const start: FloorSceneData = {
      runSeed: this.selectData.runSeed,
      floor: this.selectData.floor,
      run: newRun(hero, this.selectData.practice ?? false, this.mode, this.selectData.floor),
    };
    this.cameras.main.fadeOut(L.fadeMs, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SceneKey.Game, start));
  }
}
