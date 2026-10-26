import Phaser from 'phaser';
import type { HeroId } from '@/core/heroTypes';
import type { CoopSelectData, FloorSceneData } from '@/core/types';
import { SceneKey } from '@/core/types';
import { RunMode } from '@/core/runMode';
import { HERO_DEFINITIONS, HERO_ORDER } from '@/config/heroConfig';
import { HERO_SELECT_LAYOUT as L, HERO_SELECT_PALETTE as P } from '@/config/heroSelectConfig';
import { COOP_CONFIG, COOP_SELECT_TEXT as T } from '@/config/coopConfig';
import { HERO_VISUALS, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import { LastHero } from '@/persistence/LastHero';
import { heroStatLine, initialIndex } from '@/systems/heroSelect';
import { newRun } from '@/systems/RunState';
import { KEYBOARD_MOUSE, padDevice } from '@/systems/coopDevices';
import type { InputDevice } from '@/systems/coopDevices';
import { CoopLobby } from '@/systems/coopLobby';
import { MenuCommand, PadMenuReader, menuCommandFromKey } from '@/systems/gamepadInput';
import { readAllPadSnapshots } from '@/input/padSnapshot';
import { openMainMenu } from '@/scenes/BootScene';
import { diag } from '@/diagnostics/DiagnosticsHub';

interface Card {
  readonly hero: HeroId;
  readonly frame: Phaser.GameObjects.Rectangle;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly name: Phaser.GameObjects.Text;
  readonly tag: Phaser.GameObjects.Text;
  readonly texts: readonly Phaser.GameObjects.Text[];
}

/** Kolory graczy jak w HUD: P1 zielony, P2 niebieski. */
const SEAT_COLORS = [0x3ddc84, 0x6ec6ff] as const;
const SEAT_CSS = ['#3ddc84', '#6ec6ff'] as const;

/**
 * Ekran co-opu (etap C5, decyzja właściciela: lokalny co-op dla dwóch): każdy gracz dołącza swoim urządzeniem
 * (Enter na klawiaturze albo A na padzie), wybiera innego bohatera (← →) i potwierdza gotowość. Gdy obaj są gotowi,
 * zaczyna się wspinaczka (tylko domyślny tryb). Esc / B — wstecz; bez graczy wraca do menu.
 */
export class CoopSelectScene extends Phaser.Scene {
  private selectData!: CoopSelectData;
  private lobby!: CoopLobby;
  private cards: Card[] = [];
  private seatTexts: Phaser.GameObjects.Text[] = [];
  private readonly padReaders = new Map<number, PadMenuReader>();
  private starting = false;
  private readonly lastHero = new LastHero(HighscoreStorage.browserStorage());

  constructor() {
    super(SceneKey.CoopSelect);
  }

  init(data: CoopSelectData): void {
    this.selectData = data;
    this.lobby = new CoopLobby(HERO_ORDER.length, COOP_CONFIG.maxPlayers);
    this.cards = [];
    this.seatTexts = [];
    this.padReaders.clear();
    this.starting = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(P.background);
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'monospace', color: P.text };
    this.add.text(L.centerX, L.title.y, T.title, { ...style, fontSize: `${L.title.fontSize}px`, color: P.title }).setOrigin(0.5).setLetterSpacing(L.title.letterSpacing);

    const { width, gap, top } = L.card;
    const totalWidth = HERO_ORDER.length * width + (HERO_ORDER.length - 1) * gap;
    HERO_ORDER.forEach((hero, i) => {
      const left = L.centerX - totalWidth / 2 + i * (width + gap);
      this.cards.push(this.buildCard(hero, left + width / 2, top, style));
    });
    for (let seat = 0; seat < COOP_CONFIG.maxPlayers; seat++) {
      const x = L.centerX + (seat === 0 ? -1 : 1) * 220;
      this.seatTexts.push(this.add.text(x, L.mode.y + 6, '', { ...style, fontSize: '13px', align: 'center' }).setOrigin(0.5));
    }
    this.add.text(L.centerX, L.hint.y, T.hint, { ...style, fontSize: `${L.hint.fontSize}px`, color: P.hint }).setOrigin(0.5).setLetterSpacing(L.hint.letterSpacing);

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.repeat) return;
      const command = menuCommandFromKey(event.key);
      if (command) this.onCommand(KEYBOARD_MOUSE, command);
    });
    this.events.on(Phaser.Scenes.Events.UPDATE, this.readPads, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.UPDATE, this.readPads, this));
    this.refresh();
    this.cameras.main.fadeIn(L.fadeMs, 0, 0, 0);
  }

  private buildCard(hero: HeroId, centerX: number, top: number, style: Phaser.Types.GameObjects.Text.TextStyle): Card {
    const def = HERO_DEFINITIONS[hero];
    const { width, height, borderWidth } = L.card;
    const frame = this.add.rectangle(centerX, top + height / 2, width, height, P.card).setStrokeStyle(borderWidth, P.border);
    const sprite = this.add.sprite(centerX, top + L.sprite.offsetY, SPRITE_SHEETS[HERO_VISUALS[hero].sheet].key).setScale(L.sprite.scale);
    const tag = this.add.text(centerX, top + 14, '', { ...style, fontSize: '16px', fontStyle: 'bold' }).setOrigin(0.5, 0);
    const name = this.add
      .text(centerX, top + L.name.offsetY, def.name.toUpperCase(), { ...style, fontSize: `${L.name.fontSize}px` })
      .setOrigin(0.5, 0)
      .setLetterSpacing(L.name.letterSpacing);
    const tagline = this.add.text(centerX, top + L.tagline.offsetY, def.tagline, { ...style, fontSize: `${L.tagline.fontSize}px` }).setOrigin(0.5, 0);
    const stats = this.add.text(centerX, top + L.stats.offsetY, heroStatLine(def), { ...style, fontSize: `${L.stats.fontSize}px` }).setOrigin(0.5, 0);
    return { hero, frame, sprite, name, tag, texts: [tagline, stats] };
  }

  /** Każdy pad osobno: komendy menu z jego zboczy (dołączenie, wybór, gotowość). */
  private readPads(time: number): void {
    const seen = new Set<number>();
    for (const { index, snapshot } of readAllPadSnapshots()) {
      seen.add(index);
      let reader = this.padReaders.get(index);
      if (!reader) this.padReaders.set(index, (reader = new PadMenuReader()));
      for (const command of reader.read(snapshot, time)) this.onCommand(padDevice(index), command);
    }
    for (const index of [...this.padReaders.keys()]) if (!seen.has(index)) this.padReaders.delete(index);
  }

  private onCommand(device: InputDevice, command: MenuCommand): void {
    if (this.starting) return;
    const slot = this.lobby.slotOf(device);
    if (slot < 0) {
      if (command === MenuCommand.Confirm) {
        const preferred = this.lobby.all.length === 0 ? initialIndex(HERO_ORDER, this.lastHero.load()) : 0;
        const seat = this.lobby.join(device, preferred);
        if (seat >= 0) diag.note('coop-join', { seat: seat + 1, device: device.kind });
      } else if (command === MenuCommand.Back && this.lobby.all.length === 0) {
        this.backToMenu();
        return;
      }
    } else if (command === MenuCommand.Left) this.lobby.move(slot, -1);
    else if (command === MenuCommand.Right) this.lobby.move(slot, 1);
    else if (command === MenuCommand.Confirm) this.lobby.confirm(slot);
    else if (command === MenuCommand.Back) this.lobby.back(slot);
    this.refresh();
    if (this.lobby.canStart) this.start();
  }

  private refresh(): void {
    const seats = this.lobby.all;
    this.cards.forEach((card, i) => {
      const owner = seats.findIndex((seat) => seat.hero === i);
      const seat = seats[owner];
      const color = owner >= 0 ? SEAT_COLORS[owner as 0 | 1] : P.border;
      card.frame.setFillStyle(seat ? P.cardSelected : P.card).setStrokeStyle(L.card.borderWidth, color);
      const visual = HERO_VISUALS[card.hero];
      card.sprite.play(animationKey(visual.sheet, seat ? visual.move : visual.idle, L.facing), true).setAlpha(seat ? 1 : 0.6);
      card.name.setColor(seat ? P.name : P.nameDim);
      card.tag.setText(seat ? `P${owner + 1}${seat.ready ? ` · ${T.ready}` : ''}` : '').setColor(SEAT_CSS[owner as 0 | 1] ?? P.text);
      for (const text of card.texts) text.setColor(seat ? P.text : P.textDim);
    });
    this.seatTexts.forEach((text, i) => {
      const seat = seats[i];
      if (!seat) {
        text.setText(`P${i + 1}\n${T.join}`).setColor(P.hint);
        return;
      }
      const device = seat.device.kind === 'keyboardMouse' ? T.keyboard : T.pad(seat.device.index + 1);
      const hero = HERO_DEFINITIONS[HERO_ORDER[seat.hero]!].name;
      text.setText(`P${i + 1} · ${device}\n${hero} — ${seat.ready ? T.ready : T.choosing}`).setColor(SEAT_CSS[i as 0 | 1] ?? P.text);
    });
  }

  private backToMenu(): void {
    this.starting = true;
    const hero = HERO_ORDER[0]!;
    const start: FloorSceneData = { runSeed: this.selectData.runSeed, floor: 1, run: newRun(hero, this.selectData.practice ?? false) };
    this.cameras.main.fadeOut(L.fadeMs, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => openMainMenu(this, start));
  }

  private start(): void {
    this.starting = true;
    const [p1, p2] = this.lobby.all;
    if (!p1 || !p2) return;
    const hero = HERO_ORDER[p1.hero]!;
    const partner = HERO_ORDER[p2.hero]!;
    this.lastHero.save(hero);
    diag.note('coop-start', { p1: hero, p2: partner });
    const start: FloorSceneData = {
      runSeed: this.selectData.runSeed,
      floor: 1,
      run: newRun(hero, this.selectData.practice ?? false, RunMode.Tower, 1),
      coop: { partner: { hero: partner, items: [], hp: null }, devices: this.lobby.playerDevices() },
    };
    this.time.delayedCall(400, () => {
      this.cameras.main.fadeOut(L.fadeMs, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SceneKey.Game, start));
    });
  }
}
