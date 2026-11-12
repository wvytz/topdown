import Phaser from 'phaser';
import { SoundCue, sound } from '@/audio/SoundBoard';
import { heroLoadout } from '@/combat/HeroCombat';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { DESCENT_CONFIG } from '@/config/descentConfig';
import { CAMERA_CONFIG, GAME_HEIGHT, GAME_WIDTH, STAIRS_SIZE, TILE_SIZE } from '@/config/gameConfig';
import { DEFAULT_HERO } from '@/config/heroConfig';
import { HIDEOUT_CONFIG, HIDEOUT_TEXT, HIDEOUT_VISUAL as V, HideoutStation } from '@/config/hideoutConfig';
import type { HideoutStationSpot } from '@/config/hideoutConfig';
import { META_CONFIG } from '@/config/metaConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { MusicTheme } from '@/core/audioTypes';
import type { HeroId } from '@/core/heroTypes';
import { currentPlatform } from '@/core/platform';
import { deriveSeed } from '@/core/random';
import { RunMode } from '@/core/runMode';
import type { TilesetMeta } from '@/core/tilesetTypes';
import { SceneKey } from '@/core/types';
import type { CoopSelectData, FloorSceneData, HeroSelectData, HideoutSceneData } from '@/core/types';
import { diag } from '@/diagnostics/DiagnosticsHub';
import { DungeonView } from '@/dungeon/DungeonView';
import { dressFloor } from '@/dungeon/FloorDressing';
import { buildHideout, standTileFor, stationCenter, stationInReach } from '@/dungeon/HideoutLayout';
import type { HideoutLayout } from '@/dungeon/HideoutLayout';
import type { TorchSpot } from '@/dungeon/LightPlanner';
import { FloorLighting } from '@/effects/FloorLighting';
import type { PointLight } from '@/effects/LightingOverlay';
import { screenFx } from '@/effects/ScreenFx';
import { hexColor } from '@/effects/lightTextures';
import { StairsGlow } from '@/effects/StairsGlow';
import { Player } from '@/entities/Player';
import type { PlayerActions } from '@/entities/Player';
import { bindPadMenu } from '@/input/PadMenuInput';
import { createPlayerInput } from '@/input/playerInput';
import type { PlayerInput } from '@/input/playerInput';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import { LastHero } from '@/persistence/LastHero';
import { MetaStorage } from '@/persistence/MetaStorage';
import { createBoardHighscores } from '@/persistence/highscoreBoards';
import { hubParam, openMainMenu } from '@/scenes/BootScene';
import { NO_FLOOR_EFFECTS } from '@/systems/FloorModifiers';
import { MenuCommand } from '@/systems/gamepadInput';
import { burnVotive, cycleStartItem, markArrivalSeen, openHideoutForTest, metaRank } from '@/systems/MetaProgress';
import { ITEM_DEFINITIONS } from '@/config/lootConfig';
import { KILN_CONFIG, VOTIVE_ORDER } from '@/config/votiveConfig';
import type { MetaProfile } from '@/systems/MetaProgress';
import { newRun } from '@/systems/RunState';
import { installSmoothPhysics } from '@/world/SmoothPhysics';

const DRESSING_SEED_SALT = 0xd2e5;
const PARTICLE_TEXTURE = 'tex-hideout-mote';
const MESSAGE_MS = 5200;

const WORLD_TEXT: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace',
  fontSize: '10px',
  color: V.labelColor,
  stroke: '#000000',
  strokeThickness: 3,
  align: 'center',
};

const UI_TEXT: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace',
  color: V.labelColor,
  stroke: '#000000',
  strokeThickness: 4,
};

/**
 * Popielnik (Akt II, krok Z1; `docs/AKT2.md` §3): kryjówka pod piecami wieży i punkt startu po pierwszym pokonaniu
 * Wiedźmy. Bez wrogów: bohater chodzi po owalnej komorze i używa stanowisk (E / X na padzie; na telefonie —
 * stuknięcie stanowiska). Stąd rusza Zejście (solo i we dwoje), wspinaczka i areny; Piec wotów czeka na etap Z3.
 *
 * Komora to zwykłe dane piętra (`dungeon/HideoutLayout.ts`), więc rysuje ją `DungeonView` na kaflach kotłowni
 * (Piekło) — Popielnik leży pod piecem Palacza. Stanowiska to figury zastępcze do czasu arkusza z generatora.
 */
export class HideoutScene extends Phaser.Scene {
  private player!: Player;
  private inputController!: PlayerInput;
  private layout!: HideoutLayout;
  private hero: HeroId = DEFAULT_HERO;
  private readonly meta = MetaStorage.browser();
  private readonly lastHero = new LastHero(HighscoreStorage.browserStorage());
  private profile!: MetaProfile;
  private arrivalEmbers: number | undefined;
  /** Scena upadku albo przejście do innej sceny — sterowanie stoi. */
  private busy = false;
  private leaving = false;
  private prompt!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private messageUntil = 0;
  private status!: Phaser.GameObjects.Text;
  private uiObjects: Phaser.GameObjects.GameObject[] = [];
  private glowLights: PointLight[] = [];
  private stairsGlow!: StairsGlow;
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  private kilnFire: Phaser.GameObjects.Graphics | null = null;

  constructor() {
    super(SceneKey.Hideout);
  }

  init(data: HideoutSceneData): void {
    this.hero = data.hero ?? this.lastHero.load() ?? DEFAULT_HERO;
    this.arrivalEmbers = data.arrivalEmbers;
    this.busy = false;
    this.leaving = false;
    this.uiObjects = [];
    this.glowLights = [];
    this.messageUntil = 0;
  }

  create(): void {
    // `?hub=1`: tester dostaje Popielnik na stałe (pozycja w menu, trofea), bez pokonania Wiedźmy.
    this.profile = hubParam() ? this.meta.update(openHideoutForTest) : this.meta.load();
    this.layout = buildHideout(HIDEOUT_CONFIG);
    const { floor } = this.layout;
    const biome = BIOMES[BiomeId.Infernal];
    const tileset = this.cache.json.get(biome.tileset.jsonKey) as TilesetMeta;
    // Bez pochodni: komorę oświetlają palenisko, stanowiska i szyb.
    const torchSpots: TorchSpot[] = [];
    const dressed = dressFloor(floor, tileset, biome.dressing, deriveSeed(floor.seed, DRESSING_SEED_SALT), { torches: torchSpots });
    const view = new DungeonView(this, floor, dressed, tileset, biome.tileset);
    // Szyb w górę jest zawsze otwarty: światło z wieży i pyłki nad stopniami.
    view.openStairs();
    this.stairsGlow = new StairsGlow(this, floor.stairs, tileset.colors.ash.map(hexColor));
    this.stairsGlow.open();

    this.physics.world.setBounds(0, 0, view.widthPx, view.heightPx);
    installSmoothPhysics(this);

    const spawn = DungeonView.tileToWorldCenter(floor.playerSpawn);
    this.player = new Player(this, spawn.x, spawn.y, this.hero, heroLoadout(this.hero, [], NO_FLOOR_EFFECTS, false), null);
    this.physics.add.collider(this.player, view.collisionLayer);
    this.inputController = createPlayerInput(this);

    this.ensureParticleTexture();
    this.drawStations();
    this.addAsh(view.widthPx);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, view.widthPx, view.heightPx);
    cam.setZoom(CAMERA_CONFIG.zoom);
    cam.startFollow(this.player, true, CAMERA_CONFIG.lerp, CAMERA_CONFIG.lerp);
    cam.roundPixels = true;

    new FloorLighting(this, {
      asset: biome.tileset,
      tileset,
      torchSpots,
      visionRadius: null,
      // Półmrok kotłowni (ta sama mgła co w Piekle): z ciemności wyłaniają się palenisko i stanowiska.
      fog: biome.fog,
      bearers: () => [this.player],
      extraLights: () => [...this.glowLights, ...this.stairsGlow.lights],
      flares: () => [],
      hideable: () => [],
      ambientRevealsEnemies: false,
    });

    this.buildUi();
    // Napisy interfejsu rysuje druga, niepowiększona kamera; świat — tylko główna.
    const ui = new Set(this.uiObjects);
    this.uiCamera = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.uiCamera.ignore(this.children.list.filter((object) => !ui.has(object)));
    cam.ignore(this.uiObjects);

    this.input.keyboard?.on('keydown-ESC', () => this.toMenu());
    bindPadMenu(this, (command) => {
      if (command === MenuCommand.Back) this.toMenu();
    });
    sound.setMusic(MusicTheme.Underworld);
    sound.setMusicIntense(false);
    sound.setMusicDuck(1);
    diag.note('hideout-enter', { hero: this.hero, embers: this.profile.embers, unlocked: this.profile.hideoutUnlocked });

    const firstArrival = this.arrivalEmbers !== undefined || (this.profile.hideoutUnlocked && !this.profile.arrivalSeen);
    if (firstArrival) this.playArrival(spawn);
    else cam.fadeIn(250, 0, 0, 0);
  }

  override update(time: number): void {
    if (this.leaving) return;
    const actions = this.inputController.getActions({ origin: { x: this.player.x, y: this.player.y }, targets: () => [] });
    // W kryjówce nie ma z kim walczyć: zostaje chód, zryw i interakcja.
    const calm: PlayerActions = this.busy
      ? { ...actions, move: { x: 0, y: 0 }, attack: false, shoot: false, ultimate: false, dash: false, interact: false }
      : { ...actions, attack: false, shoot: false, ultimate: false };
    this.player.tick(calm, time);

    const station = this.busy ? null : this.stationNear();
    if (station) {
      const center = DungeonView.tileToWorldCenter(stationCenter(station));
      this.prompt.setText(`[E] ${this.promptFor(station)}`).setPosition(center.x, center.y - TILE_SIZE * 1.25).setVisible(true);
      if (calm.interact) this.use(station);
    } else {
      this.prompt.setVisible(false);
    }
    if (this.messageUntil > 0 && time > this.messageUntil) {
      this.messageUntil = 0;
      this.message.setVisible(false);
    }
  }

  private stationNear(): HideoutStationSpot | null {
    const hero = { x: this.player.x / TILE_SIZE - 0.5, y: this.player.y / TILE_SIZE - 0.5 };
    return stationInReach(this.layout.stations, hero, HIDEOUT_CONFIG.reachTiles);
  }

  private use(station: HideoutStationSpot): void {
    if (this.busy || this.leaving) return;
    diag.note('hideout-station', { station: station.id });
    const runSeed = Date.now() >>> 0;
    switch (station.id) {
      case HideoutStation.Gate:
        this.toHeroSelect({ runSeed, floor: DESCENT_CONFIG.firstFloor, mode: RunMode.Descent });
        break;
      case HideoutStation.GateCoop: {
        if (currentPlatform() === 'mobile') {
          this.say(HIDEOUT_TEXT.coopMobile);
          break;
        }
        const coop: CoopSelectData = { runSeed, mode: RunMode.Descent, fromHideout: true };
        this.leave(() => this.scene.start(SceneKey.CoopSelect, coop));
        break;
      }
      case HideoutStation.Shaft:
        this.toHeroSelect({ runSeed, floor: 1 });
        break;
      case HideoutStation.Mirror:
        this.toHeroSelect({ runSeed, floor: 1, mode: RunMode.BossRush });
        break;
      case HideoutStation.Kiln:
        this.useKiln();
        break;
      case HideoutStation.Hearth:
        this.useHearth();
        break;
      case HideoutStation.Wall:
        this.say(this.wallText());
        break;
      case HideoutStation.Shelf:
        this.say(HIDEOUT_TEXT.shelf(this.profile.trophies.length, TOWER_CONFIG.floorsPerLoop));
        break;
      default:
    }
  }

  /** Krok Z3: napis nad stanowiskiem zależny od profilu (Piec podaje Wotum i cenę). */
  private promptFor(station: HideoutStationSpot): string {
    const waiting = this.profile.foundVotives[0];
    if (station.id === HideoutStation.Kiln && waiting) return HIDEOUT_TEXT.kilnPromptBurn(ITEM_DEFINITIONS[waiting].name, KILN_CONFIG.burnCost);
    return station.prompt ?? '';
  }

  /** Piec wotów (krok Z3): wypala pierwsze czekające Wotum za Żar — przedmiot wchodzi do puli łupów. */
  private useKiln(): void {
    const votive = this.profile.foundVotives[0];
    if (!votive) {
      this.say(HIDEOUT_TEXT.kilnEmpty(this.profile.burnedVotives.length, VOTIVE_ORDER.length));
      return;
    }
    const item = ITEM_DEFINITIONS[votive];
    if (this.profile.embers < KILN_CONFIG.burnCost) {
      this.say(HIDEOUT_TEXT.kilnPoor(item.name, KILN_CONFIG.burnCost, this.profile.embers));
      return;
    }
    this.profile = this.meta.update((profile) => burnVotive(profile, votive, KILN_CONFIG.burnCost));
    diag.note('votive-burned', { votive, embers: this.profile.embers });
    sound.play(SoundCue.Shrine, this.player);
    this.refreshStatus();
    this.drawKilnFire();
    this.say(HIDEOUT_TEXT.kilnBurned(item.name, item.effect));
  }

  /** Palenisko (krok Z3): kolejny przedmiot startowy spośród wypalonych Wot (albo żaden). */
  private useHearth(): void {
    if (this.profile.burnedVotives.length === 0) {
      this.say(HIDEOUT_TEXT.hearthNone);
      return;
    }
    this.profile = this.meta.update(cycleStartItem);
    this.refreshStatus();
    const start = this.profile.startItem;
    this.say(HIDEOUT_TEXT.hearthPick(start ? ITEM_DEFINITIONS[start].name : null));
  }

  private toHeroSelect(start: Pick<HeroSelectData, 'runSeed' | 'floor' | 'mode'>): void {
    const select: HeroSelectData = { ...start, preselect: this.hero, fromHideout: true };
    this.leave(() => this.scene.start(SceneKey.Select, select));
  }

  /** Statystyki Zejść i podium lokalnej tablicy. */
  private wallText(): string {
    const { runs, wins, bestDepth } = this.profile;
    if (runs === 0) return HIDEOUT_TEXT.wallEmpty;
    const top = createBoardHighscores('descent')
      .localEntries()
      .slice(0, 3)
      .map((entry, i) => `${i + 1}. ${entry.name ?? 'bez imienia'} — ${entry.score} złota, głębia ${entry.floor}`);
    const stats = HIDEOUT_TEXT.wall(runs, wins, bestDepth, DESCENT_CONFIG.floors, metaRank(this.profile, META_CONFIG.ranks));
    return [stats, ...top].join('\n');
  }

  private say(text: string): void {
    sound.play(SoundCue.UiConfirm);
    this.message.setText(text).setVisible(true);
    this.messageUntil = this.time.now + MESSAGE_MS;
  }

  private leave(next: () => void): void {
    if (this.leaving) return;
    this.leaving = true;
    sound.play(SoundCue.UiConfirm);
    this.player.setVelocity(0, 0);
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, next);
  }

  private toMenu(): void {
    if (this.busy) return;
    const start: FloorSceneData = { runSeed: Date.now() >>> 0, floor: 1, run: newRun(this.hero) };
    this.leave(() => openMainMenu(this, start));
  }

  // ---------------- wygląd ----------------

  private ensureParticleTexture(): void {
    if (this.textures.exists(PARTICLE_TEXTURE)) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
    g.generateTexture(PARTICLE_TEXTURE, 2, 2);
    g.destroy();
  }

  /** Popiół sypie się z szybu na całą komorę. Math.random w emiterach: efekt czysto wizualny. */
  private addAsh(widthPx: number): void {
    const { ash } = V;
    this.add
      .particles(0, 0, PARTICLE_TEXTURE, {
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(TILE_SIZE * 2, TILE_SIZE * 2, widthPx - TILE_SIZE * 4, TILE_SIZE * 12), quantity: 1 },
        lifespan: { min: ash.lifespanMs.min, max: ash.lifespanMs.max },
        speedY: { min: ash.fallSpeed.min, max: ash.fallSpeed.max },
        speedX: { min: -6, max: 6 },
        alpha: { start: 0.7, end: 0 },
        tint: [...ash.colors],
        frequency: ash.frequencyMs,
        maxAliveParticles: screenFx.particles(ash.maxParticles),
      })
      .setDepth(RENDER_DEPTH.motes);
  }

  private drawStations(): void {
    const g = this.add.graphics().setDepth(RENDER_DEPTH.shrine);
    const interactive = currentPlatform() === 'mobile';
    for (const station of this.layout.stations) {
      const { x, y } = DungeonView.tileToWorldCenter(stationCenter(station));
      this.drawStation(g, station.id, x, y);
      const labelY = station.id === HideoutStation.Shaft ? y - (STAIRS_SIZE * TILE_SIZE) / 2 - 4 : y - TILE_SIZE * 0.75;
      this.add.text(x, labelY, station.name, WORLD_TEXT).setOrigin(0.5, 1).setDepth(RENDER_DEPTH.worldText).setAlpha(0.85);
      if (station.id !== HideoutStation.Shaft) this.glowLights.push({ x, y, radius: station.id === HideoutStation.Hearth ? V.hearthLightRadius : V.stationLightRadius });
      // Telefon (krok Z1): stuknięcie stanowiska stawia bohatera obok i od razu go używa.
      if (interactive && station.prompt !== null) {
        const size = TILE_SIZE * (station.id === HideoutStation.Shaft ? STAIRS_SIZE : 2);
        const zone = this.add.zone(x, y, size, size).setInteractive();
        zone.on('pointerdown', () => {
          if (this.busy || this.leaving) return;
          const stand = DungeonView.tileToWorldCenter(standTileFor(this.layout.floor, station));
          this.player.setPosition(stand.x, stand.y);
          (this.player.body as Phaser.Physics.Arcade.Body).reset(stand.x, stand.y);
          this.use(station);
        });
      }
    }
    this.prompt = this.add
      .text(0, 0, '', { ...WORLD_TEXT, color: V.promptColor })
      .setOrigin(0.5, 1)
      .setDepth(RENDER_DEPTH.worldText)
      .setVisible(false);
    this.addHearthSparks();
    this.drawDog(g);
    this.drawKilnFire();
  }

  /** Krok Z3: Piec wotów płonie, gdy wypalił choć jedno Wotum; liczba języków ognia = liczba wypalonych. */
  private drawKilnFire(): void {
    const kiln = this.layout.stations.find((station) => station.id === HideoutStation.Kiln);
    const burned = this.profile.burnedVotives.length;
    if (!kiln || burned === 0) return;
    const { x, y } = DungeonView.tileToWorldCenter(stationCenter(kiln));
    if (!this.kilnFire) {
      this.kilnFire = this.add.graphics().setDepth(RENDER_DEPTH.shrine + 1);
      this.uiCamera?.ignore(this.kilnFire);
    }
    const g = this.kilnFire.clear();
    const [deep, mid, core] = V.kilnFire;
    g.fillStyle(deep!, 0.9).fillRoundedRect(x - 10, y - 6, 20, 20, { tl: 9, tr: 9, bl: 0, br: 0 });
    const tongues = Math.min(burned, VOTIVE_ORDER.length);
    for (let i = 0; i < tongues; i++) {
      const tx = x - 6 + (12 / Math.max(1, tongues - 1)) * i - (tongues === 1 ? -6 : 0);
      g.fillStyle(mid!, 0.95).fillTriangle(tx - 3, y + 12, tx + 3, y + 12, tx, y + 1);
      g.fillStyle(core!, 0.95).fillTriangle(tx - 1.5, y + 12, tx + 1.5, y + 12, tx, y + 6);
    }
  }

  /** Figury zastępcze stanowisk (zasada prototypowania); docelowo arkusz z generatora w `tools/`. */
  private drawStation(g: Phaser.GameObjects.Graphics, id: HideoutStation, x: number, y: number): void {
    switch (id) {
      case HideoutStation.Hearth:
        g.fillStyle(0x1a1412, 1).fillCircle(x, y, 20);
        g.lineStyle(4, 0x5c574e, 1).strokeCircle(x, y, 20);
        g.fillStyle(0xc8201c, 0.9).fillCircle(x, y, 13);
        g.fillStyle(0xff7a2a, 0.9).fillCircle(x, y, 8);
        g.fillStyle(0xffe08a, 0.9).fillCircle(x, y, 3);
        break;
      case HideoutStation.Gate:
      case HideoutStation.GateCoop: {
        // Łuk bramy: czarny otwór z czerwoną łuną od dołu.
        g.fillStyle(0x3a332c, 1).fillRoundedRect(x - 20, y - 26, 40, 46, { tl: 18, tr: 18, bl: 2, br: 2 });
        g.fillStyle(0x050304, 1).fillRoundedRect(x - 14, y - 20, 28, 40, { tl: 13, tr: 13, bl: 0, br: 0 });
        g.fillStyle(V.gateColor, 0.55).fillRect(x - 14, y + 6, 28, 14);
        g.fillStyle(0xff7a2a, 0.5).fillRect(x - 14, y + 14, 28, 6);
        // Znak nad łukiem: jedna albo dwie sylwetki.
        const figures = id === HideoutStation.GateCoop ? [-5, 5] : [0];
        for (const dx of figures) {
          g.fillStyle(0xd8ccb0, 1).fillCircle(x + dx, y - 31, 2.5);
          g.fillRect(x + dx - 2, y - 28, 4, 5);
        }
        break;
      }
      case HideoutStation.Mirror:
        g.fillStyle(0x3a332c, 1).fillEllipse(x, y - 4, 30, 44);
        g.fillStyle(0x8a8478, 1).fillEllipse(x, y - 4, 22, 36);
        g.fillStyle(0xc8c2b4, 0.7).fillEllipse(x - 3, y - 10, 8, 16);
        break;
      case HideoutStation.Kiln:
        g.fillStyle(0x4a2a22, 1).fillRoundedRect(x - 18, y - 24, 36, 42, { tl: 14, tr: 14, bl: 2, br: 2 });
        g.lineStyle(2, 0x2a1612, 1).strokeRoundedRect(x - 18, y - 24, 36, 42, { tl: 14, tr: 14, bl: 2, br: 2 });
        g.fillStyle(0x0a0606, 1).fillRoundedRect(x - 10, y - 6, 20, 20, { tl: 9, tr: 9, bl: 0, br: 0 });
        g.fillStyle(0x5c574e, 1).fillRect(x - 4, y - 34, 8, 12);
        break;
      case HideoutStation.Wall: {
        g.fillStyle(0x5c574e, 1).fillRect(x - 22, y - 26, 44, 40);
        g.lineStyle(2, 0x2c2822, 1).strokeRect(x - 22, y - 26, 44, 40);
        g.lineStyle(1, 0x2c2822, 0.9);
        for (let row = 0; row < 5; row++) g.lineBetween(x - 16, y - 19 + row * 7, x + (row % 2 === 0 ? 14 : 6), y - 19 + row * 7);
        break;
      }
      case HideoutStation.Shelf: {
        g.fillStyle(0x3a2a1c, 1).fillRect(x - 24, y - 2, 48, 5);
        g.fillRect(x - 22, y + 3, 4, 12).fillRect(x + 18, y + 3, 4, 12);
        // Trofea: jedno miejsce na każdego bossa wieży; zdobyte świecą kością, puste to cień.
        const slots = TOWER_CONFIG.floorsPerLoop;
        for (let i = 0; i < slots; i++) {
          const owned = this.profile.trophies.includes(i + 1);
          g.fillStyle(owned ? 0xe8dcc0 : 0x1a1412, owned ? 1 : 0.6).fillRect(x - 21 + i * 6.4, y - 8, 4, 6);
        }
        break;
      }
      default:
    }
  }

  private addHearthSparks(): void {
    const hearth = this.layout.stations.find((station) => station.id === HideoutStation.Hearth);
    if (!hearth) return;
    const { x, y } = DungeonView.tileToWorldCenter(hearth.tile);
    const { sparks } = V;
    this.add
      .particles(x, y, PARTICLE_TEXTURE, {
        lifespan: { min: 600, max: 1400 },
        speedY: { min: -46, max: -18 },
        speedX: { min: -12, max: 12 },
        alpha: { start: 1, end: 0 },
        scale: { start: 1, end: 0.5 },
        tint: [...sparks.colors],
        frequency: sparks.frequencyMs,
        maxAliveParticles: screenFx.particles(sparks.maxParticles),
      })
      .setDepth(RENDER_DEPTH.motes);
  }

  /** Czarny dog — przewodnik dusz — siedzi między bramami Zejścia. */
  private drawDog(g: Phaser.GameObjects.Graphics): void {
    const gates = this.layout.stations.filter((station) => station.id === HideoutStation.Gate || station.id === HideoutStation.GateCoop);
    if (gates.length < 2) return;
    const a = DungeonView.tileToWorldCenter(gates[0]!.tile);
    const b = DungeonView.tileToWorldCenter(gates[1]!.tile);
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2 + 4;
    g.fillStyle(0x070506, 1).fillEllipse(x, y + 4, 22, 14);
    g.fillEllipse(x + 8, y - 6, 12, 11);
    g.fillTriangle(x + 4, y - 10, x + 6, y - 17, x + 9, y - 10);
    g.fillTriangle(x + 9, y - 10, x + 12, y - 17, x + 14, y - 10);
    g.fillStyle(0xc8201c, 1).fillRect(x + 6, y - 7, 2, 2).fillRect(x + 11, y - 7, 2, 2);
    this.add.text(x, y - 22, 'czarny dog', { ...WORLD_TEXT, fontSize: '8px' }).setOrigin(0.5, 1).setDepth(RENDER_DEPTH.worldText).setAlpha(0.6);
  }

  // ---------------- interfejs ----------------

  private buildUi(): void {
    const ui = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      this.uiObjects.push(object);
      return object;
    };
    ui(this.add.text(16, 12, HIDEOUT_TEXT.title, { ...UI_TEXT, fontSize: '20px' }).setLetterSpacing(4));
    this.status = ui(this.add.text(16, 40, '', { ...UI_TEXT, fontSize: '14px', color: V.emberColor }));
    ui(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT - 16, currentPlatform() === 'mobile' ? HIDEOUT_TEXT.hintMobile : HIDEOUT_TEXT.hint, { ...UI_TEXT, fontSize: '12px', color: '#9c8f74' })
        .setOrigin(0.5, 1)
        .setLetterSpacing(2),
    );
    this.message = ui(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT - 48, '', { ...UI_TEXT, fontSize: '14px', align: 'center', lineSpacing: 6, wordWrap: { width: GAME_WIDTH - 160 } })
        .setOrigin(0.5, 1)
        .setVisible(false),
    );
    this.refreshStatus();
  }

  private refreshStatus(): void {
    const start = this.profile.startItem ? ` · Na start: ${ITEM_DEFINITIONS[this.profile.startItem].name}` : '';
    this.status.setText(`${HIDEOUT_TEXT.hearth(this.profile.embers, metaRank(this.profile, META_CONFIG.ranks))}${start}`);
  }

  // ---------------- pierwsze lądowanie ----------------

  /**
   * Scena upadku (pierwsze wejście po Wiedźmie): trzy zdania na czarnym tle, potem bohater spada z szybu
   * w popiół. Dowolny klawisz albo kliknięcie przewija napisy.
   */
  private playArrival(spawn: { x: number; y: number }): void {
    this.busy = true;
    const { arrival } = V;
    const cover = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1).setOrigin(0);
    const line = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', { ...UI_TEXT, fontSize: '18px', align: 'center', wordWrap: { width: GAME_WIDTH - 200 } })
      .setOrigin(0.5);
    for (const object of [cover, line]) {
      this.uiObjects.push(object);
      this.cameras.main.ignore(object);
    }
    this.player.setVisible(false);

    const lines = HIDEOUT_TEXT.arrival;
    let index = -1;
    let timer: Phaser.Time.TimerEvent | null = null;
    const land = (): void => {
      this.input.keyboard?.off('keydown', next);
      this.input.off('pointerdown', next);
      line.destroy();
      this.tweens.add({ targets: cover, alpha: 0, duration: 400, onComplete: () => cover.destroy() });
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      body.enable = false;
      this.player.setVisible(true).setPosition(spawn.x, spawn.y - 200).setAlpha(0.2);
      this.tweens.add({
        targets: this.player,
        y: spawn.y,
        alpha: 1,
        duration: arrival.fallMs,
        ease: 'Quad.easeIn',
        onComplete: () => {
          body.reset(spawn.x, spawn.y);
          body.enable = true;
          screenFx.shake(this.cameras.main, arrival.shakeMs, 0.012);
          const burst = this.add
            .particles(spawn.x, spawn.y + 6, PARTICLE_TEXTURE, {
              lifespan: { min: 500, max: 1300 },
              speed: { min: 20, max: 90 },
              angle: { min: 200, max: 340 },
              gravityY: 60,
              alpha: { start: 0.9, end: 0 },
              tint: [...V.ash.colors],
              emitting: false,
            })
            .setDepth(RENDER_DEPTH.motes);
          this.uiCamera.ignore(burst);
          burst.explode(screenFx.particles(40));
          sound.play(SoundCue.Impact, this.player);
          this.meta.update(markArrivalSeen);
          this.profile = this.meta.load();
          this.refreshStatus();
          if (this.arrivalEmbers !== undefined && this.arrivalEmbers > 0) this.say(HIDEOUT_TEXT.arrivalEmbers(this.arrivalEmbers));
          this.busy = false;
        },
      });
    };
    const next = (): void => {
      timer?.remove();
      index++;
      const text = lines[index];
      if (text === undefined) {
        land();
        return;
      }
      line.setText(text).setAlpha(0);
      this.tweens.add({ targets: line, alpha: 1, duration: 350 });
      timer = this.time.delayedCall(arrival.textMs, next);
    };
    this.input.keyboard?.on('keydown', next);
    this.input.on('pointerdown', next);
    next();
  }
}
