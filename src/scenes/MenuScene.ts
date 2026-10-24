import Phaser from 'phaser';
import type { FloorSceneData, HeroSelectData } from '@/core/types';
import { SceneKey } from '@/core/types';
import { RunMode } from '@/core/runMode';
import { GAME_WIDTH, GAME_HEIGHT } from '@/config/gameConfig';
import { MENU_LABELS, MENU_LAYOUT as L, MENU_PALETTE as P, MENU_TEXT as T } from '@/config/menuConfig';
import { SAVE_CONFIG, SAVE_TEXT } from '@/config/saveConfig';
import { SaveStorage } from '@/persistence/SaveStorage';
import type { SaveSlot } from '@/persistence/SaveStorage';
import { diag } from '@/diagnostics/DiagnosticsHub';
import { MENU_ORDER, MenuEntry, initialEntry, isEntryEnabled, moveCursor } from '@/systems/mainMenu';
import type { MenuAvailability } from '@/systems/mainMenu';
import { loadFromRecord, saveSummary } from '@/systems/SaveGame';
import { BossProgress } from '@/persistence/BossProgress';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import { startFloorInfo, stepStartFloor } from '@/systems/FloorSelect';
import { MENU_SCORES } from '@/config/menuConfig';
import { HIGHSCORE_BOARDS } from '@/config/lootConfig';
import type { HighscoreBoardId } from '@/config/lootConfig';
import { BOARD_ORDER, createBoardHighscores } from '@/persistence/highscoreBoards';
import { SeenRankStorage } from '@/persistence/SeenRankStorage';
import { buildStartBoard, startBoardLines } from '@/systems/startScoreboard';
import type { StartBoardLine } from '@/systems/startScoreboard';
import type { ScoreEntry } from '@/systems/Highscores';
import { StartScoresPanel } from '@/effects/StartScoresPanel';

export interface MenuSceneData {
  /** Seed, flaga runu testowego i tryb z adresu (BootScene); seed nowej gry losujemy przy wyborze. */
  readonly start: FloorSceneData;
}

const SCORE_BOARDS: readonly HighscoreBoardId[] = ['tower', 'arenas'];

/** Widok menu: lista główna, sloty zapisu albo wybór piętra startowego. */
type View = 'main' | 'slots' | 'floors';

interface Row {
  readonly text: Phaser.GameObjects.Text;
  readonly zone: Phaser.GameObjects.Zone;
}

/**
 * Menu główne (krok 91) na tle ekranu startowego (SplashScene trzyma ostatnią klatkę wieży z popiołem).
 * Kontynuuj (autozapis), nowa wspinaczka, areny bossów, wybór piętra, wczytanie slotu i sterowanie.
 * ↑ ↓ / W S / mysz — wybór; Enter, Spacja, kliknięcie — OK; Esc — wróć.
 */
export class MenuScene extends Phaser.Scene {
  private startData!: FloorSceneData;
  private readonly saves = new SaveStorage(SaveStorage.browserStorage());
  private readonly bossProgress = new BossProgress(HighscoreStorage.browserStorage());
  /** Wybór piętra: zaznaczony wiersz (0 = piętro, 1 = wróć) i wybrane piętro. */
  private floorCursor = 0;
  private startFloor = 1;
  private view: View = 'main';
  private cursor = 0;
  private slotCursor = 0;
  private pendingDelete: number | null = null;
  private leaving = false;
  private rows: Row[] = [];
  private infoTitle!: Phaser.GameObjects.Text;
  private infoBody!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private fade!: Phaser.GameObjects.Rectangle;
  private scoresPanel!: StartScoresPanel;
  /** Numer wejścia do menu — odpowiedź sieci z poprzedniego wejścia nie rysuje się w nowym. */
  private scoresRequest = 0;

  constructor() {
    super(SceneKey.Menu);
  }

  init(data: MenuSceneData): void {
    this.startData = data.start;
    this.view = 'main';
    this.rows = [];
    this.pendingDelete = null;
    this.leaving = false;
    const preferred = data.start.run.mode === RunMode.BossRush ? MenuEntry.BossRush : null;
    this.cursor = initialEntry(MENU_ORDER, this.availability(), preferred);
  }

  create(): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'monospace', color: P.text };
    const { menu, info, borderWidth } = L;
    this.add.rectangle(menu.x, menu.y, menu.width, menu.height, P.panel, P.panelAlpha).setOrigin(0).setStrokeStyle(borderWidth, P.border);
    this.add.rectangle(info.x, info.y, info.width, info.height, P.panel, P.panelAlpha).setOrigin(0).setStrokeStyle(borderWidth, P.border);
    // Pozycje menu (stała liczba wierszy — widok slotów używa pierwszych slotCount + 1).
    const rowCount = Math.max(MENU_ORDER.length, SAVE_CONFIG.slotCount + 1);
    for (let i = 0; i < rowCount; i++) {
      const y = menu.y + menu.firstItemY + i * menu.step;
      const text = this.add
        .text(menu.x + menu.padX, y, '', { ...style, fontSize: `${menu.fontSize}px` })
        .setLetterSpacing(menu.letterSpacing);
      const zone = this.add.zone(menu.x, y - menu.step / 4, menu.width, menu.step).setOrigin(0).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.hover(i));
      zone.on('pointerdown', () => {
        this.hover(i);
        this.confirm();
      });
      this.rows.push({ text, zone });
    }
    this.infoTitle = this.add.text(info.x + info.padX, info.y + info.padY, '', { ...style, fontSize: `${info.titleFontSize}px`, color: P.title });
    this.infoBody = this.add.text(info.x + info.padX, info.y + info.padY + 30, '', {
      ...style,
      fontSize: `${info.fontSize}px`,
      lineSpacing: info.lineSpacing,
      wordWrap: { width: info.width - 2 * info.padX },
    });
    this.hint = this.add
      .text(GAME_WIDTH / 2, L.hint.y, '', { ...style, fontSize: `${L.hint.fontSize}px`, color: P.textDim })
      .setOrigin(0.5)
      .setLetterSpacing(L.hint.letterSpacing);
    this.scoresPanel = new StartScoresPanel(this);
    void this.showScores();
    // Wiersze tablicy dochodzą później (sieć) — wygaszenie musi zostać nad nimi.
    this.fade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, P.fade).setOrigin(0).setAlpha(1).setDepth(1);
    this.tweens.add({ targets: this.fade, alpha: 0, duration: L.fadeInMs });

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => this.onKey(event));
    this.refresh();
  }

  private availability(): MenuAvailability {
    return {
      hasAutosave: this.saves.load('auto') !== null,
      hasSlots: this.saves.slots.some((slot) => this.saves.load(slot) !== null),
      bestBossFloor: this.bossProgress.load(),
    };
  }

  /**
   * Tablice na środku (krok 94): od razu lista lokalna, potem wspólna z workera z oznaczeniem własnych wyników
   * i ostrzeżeniem, że ktoś pobił rekord od ostatniego wejścia do menu.
   */
  private async showScores(): Promise<void> {
    const request = ++this.scoresRequest;
    const boards = SCORE_BOARDS.map((id) => ({ id, scores: createBoardHighscores(id) }));
    const lines = (id: HighscoreBoardId, entries: readonly ScoreEntry[], own: readonly ScoreEntry[], title: string): StartBoardLine[] => {
      const seen = own.length > 0 ? new SeenRankStorage(HighscoreStorage.browserStorage(), HIGHSCORE_BOARDS[id].seenKey) : null;
      const view = buildStartBoard(entries, own, MENU_SCORES.topCount, BOARD_ORDER[id], seen?.load() ?? null);
      if (seen && view.seen) seen.save(view.seen);
      if (view.overtaken) diag.note('highscore-overtaken', { board: id, from: view.overtaken.from, to: view.overtaken.to });
      return startBoardLines(view, title, id === 'arenas', MENU_SCORES.text);
    };
    const titles = MENU_SCORES.titles;
    this.scoresPanel.show(
      boards.map(({ id, scores }) => lines(id, scores.localEntries(), [], scores.hasRemote ? titles[id].pending : titles[id].local)),
    );
    if (!boards.some(({ scores }) => scores.hasRemote)) return;
    const shared = await Promise.all(boards.map(({ scores }) => scores.fetchShared()));
    // Menu mogło już zniknąć (start gry) — wtedy nie rysujemy.
    if (request !== this.scoresRequest || !this.sys.isActive()) return;
    this.scoresPanel.show(
      boards.map(({ id, scores }, i) => {
        const remote = shared[i];
        const local = scores.localEntries();
        return remote ? lines(id, remote, local, titles[id].shared) : lines(id, local, [], titles[id].local);
      }),
    );
  }

  private onKey(event: KeyboardEvent): void {
    if (this.leaving) return;
    switch (event.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        this.move(-1);
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        this.move(1);
        break;
      case 'Enter':
      case ' ':
        this.confirm();
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        if (this.view === 'floors') this.stepFloor(-1);
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        if (this.view === 'floors') this.stepFloor(1);
        break;
      case 'Escape':
      case 'Backspace':
        if (this.view !== 'main') this.openMain();
        break;
      case 'x':
      case 'X':
      case 'Delete':
        if (this.view === 'slots') this.deleteSlot();
        break;
      default:
    }
  }

  private move(delta: number): void {
    this.pendingDelete = null;
    if (this.view === 'main') {
      const availability = this.availability();
      this.cursor = moveCursor(MENU_ORDER.map((entry) => isEntryEnabled(entry, availability)), this.cursor, delta);
    } else if (this.view === 'floors') {
      this.floorCursor = this.floorCursor === 0 ? 1 : 0;
    } else {
      const count = SAVE_CONFIG.slotCount + 1;
      this.slotCursor = (((this.slotCursor + delta) % count) + count) % count;
    }
    this.refresh();
  }

  private hover(row: number): void {
    if (this.leaving) return;
    if (this.view === 'main') {
      const entry = MENU_ORDER[row];
      if (entry === undefined || !isEntryEnabled(entry, this.availability()) || row === this.cursor) return;
      this.cursor = row;
    } else if (this.view === 'floors') {
      if (row > 1 || row === this.floorCursor) return;
      this.floorCursor = row;
    } else {
      if (row > SAVE_CONFIG.slotCount || row === this.slotCursor) return;
      this.slotCursor = row;
      this.pendingDelete = null;
    }
    this.refresh();
  }

  private confirm(): void {
    if (this.leaving) return;
    if (this.view === 'floors') {
      if (this.floorCursor === 1) this.openMain();
      else this.newRun(RunMode.FloorSelect, this.startFloor);
      return;
    }
    if (this.view === 'slots') {
      if (this.slotCursor === SAVE_CONFIG.slotCount) this.openMain();
      else this.loadSlot(this.slotCursor + 1);
      return;
    }
    const entry = MENU_ORDER[this.cursor];
    if (entry === undefined || !isEntryEnabled(entry, this.availability())) return;
    switch (entry) {
      case MenuEntry.Continue:
        this.loadSlot('auto');
        break;
      case MenuEntry.NewTower:
        this.newRun(RunMode.Tower);
        break;
      case MenuEntry.BossRush:
        this.newRun(RunMode.BossRush);
        break;
      case MenuEntry.Load:
        this.view = 'slots';
        this.slotCursor = Math.max(0, this.saves.slots.findIndex((slot) => this.saves.load(slot) !== null));
        this.refresh();
        break;
      case MenuEntry.FloorSelect:
        this.view = 'floors';
        this.floorCursor = 0;
        this.startFloor = Math.max(1, this.bossProgress.load());
        this.refresh();
        break;
      default:
      // Sterowanie nie ma akcji — opis widać w prawym panelu.
    }
  }

  private openMain(): void {
    this.view = 'main';
    this.pendingDelete = null;
    // Po usunięciu ostatniego slotu „Wczytaj” mogło zgasnąć — kursor wraca na aktywną pozycję.
    const availability = this.availability();
    if (!isEntryEnabled(MENU_ORDER[this.cursor]!, availability)) this.cursor = initialEntry(MENU_ORDER, availability, null);
    this.refresh();
  }

  private stepFloor(delta: number): void {
    this.startFloor = stepStartFloor(this.startFloor, delta, this.bossProgress.load());
    this.floorCursor = 0;
    this.refresh();
  }

  private newRun(mode: RunMode, floor = this.startData.floor): void {
    const select: HeroSelectData = {
      runSeed: this.startData.runSeed,
      floor,
      practice: this.startData.run.practice ?? false,
      ...(mode === RunMode.Tower ? {} : { mode }),
    };
    this.leave(() => this.scene.start(SceneKey.Select, select));
  }

  private loadSlot(slot: SaveSlot): void {
    const record = this.saves.load(slot);
    if (!record) return;
    const data = loadFromRecord(record, slot === 'auto' ? 'auto' : 'slot', SAVE_CONFIG.manualLoadRanked);
    diag.note('save-loaded', { slot, floor: data.floor, hero: data.run.hero, mode: data.run.mode ?? null, fromSave: data.run.fromSave ?? false });
    const start: FloorSceneData = { ...data };
    this.leave(() => this.scene.start(SceneKey.Game, start));
  }

  private deleteSlot(): void {
    const slot = this.slotCursor + 1;
    if (slot > SAVE_CONFIG.slotCount || !this.saves.load(slot)) return;
    if (this.pendingDelete !== slot) {
      this.pendingDelete = slot;
    } else {
      this.saves.remove(slot);
      this.pendingDelete = null;
      diag.note('save-deleted', { slot });
    }
    this.refresh();
  }

  /** Wygaszenie do czerni, potem koniec ekranu startowego i przejście dalej. */
  private leave(next: () => void): void {
    this.leaving = true;
    this.tweens.add({
      targets: this.fade,
      alpha: 1,
      duration: L.fadeOutMs,
      onComplete: () => {
        this.scene.stop(SceneKey.Splash);
        next();
      },
    });
  }

  private refresh(): void {
    if (this.view === 'main') this.refreshMain();
    else if (this.view === 'floors') this.refreshFloors();
    else this.refreshSlots();
  }

  private refreshMain(): void {
    const availability = this.availability();
    this.rows.forEach((row, i) => {
      const entry = MENU_ORDER[i];
      if (entry === undefined) {
        row.text.setText('');
        return;
      }
      const enabled = isEntryEnabled(entry, availability);
      const active = i === this.cursor;
      const accent = entry === MenuEntry.BossRush ? P.arenaMode : P.itemSelected;
      row.text.setText(`${active ? '▸ ' : '  '}${MENU_LABELS[entry]}`).setColor(!enabled ? P.itemDisabled : active ? accent : P.item);
    });
    this.hint.setText(T.mainHint);
    this.describe(MENU_ORDER[this.cursor] ?? MenuEntry.NewTower);
  }

  private describe(entry: MenuEntry): void {
    this.infoBody.setColor(P.text);
    switch (entry) {
      case MenuEntry.Continue: {
        const record = this.saves.load('auto');
        if (!record) {
          this.setInfo(T.continueTitle, T.continueEmpty);
          break;
        }
        const summary = saveSummary(record);
        this.setInfo(T.continueTitle, `${summary.title}\n${summary.details}\n\n${T.continueNote}`);
        break;
      }
      case MenuEntry.NewTower:
        this.setInfo(T.newTowerTitle, T.newTower);
        break;
      case MenuEntry.BossRush:
        this.setInfo(T.bossRushTitle, T.bossRush);
        break;
      case MenuEntry.FloorSelect: {
        const best = this.bossProgress.load();
        this.setInfo(T.floorSelectTitle, best >= 1 ? T.floorSelect(startFloorInfo(best).label) : T.floorSelectLocked);
        break;
      }
      case MenuEntry.Load:
        this.setInfo(T.loadTitle, this.availability().hasSlots ? T.load : T.loadEmpty);
        break;
      case MenuEntry.Controls:
        this.setInfo(T.controlsTitle, T.controls.join('\n'));
        break;
    }
  }

  private refreshSlots(): void {
    this.rows.forEach((row, i) => {
      const active = i === this.slotCursor;
      const marker = active ? '▸ ' : '  ';
      if (i < SAVE_CONFIG.slotCount) {
        const record = this.saves.load(i + 1);
        const label = `${SAVE_TEXT.slotName(i + 1)}${record ? '' : `  ${SAVE_TEXT.emptySlot}`}`;
        row.text.setText(`${marker}${label}`).setColor(active ? P.itemSelected : record ? P.item : P.itemDisabled);
      } else if (i === SAVE_CONFIG.slotCount) {
        row.text.setText(`${marker}${T.slotBack}`).setColor(active ? P.itemSelected : P.item);
      } else {
        row.text.setText('');
      }
    });
    this.hint.setText(T.subHint);
    if (this.slotCursor === SAVE_CONFIG.slotCount) {
      this.setInfo(T.loadTitle, T.load);
      return;
    }
    const slot = this.slotCursor + 1;
    const record = this.saves.load(slot);
    if (!record) {
      this.setInfo(SAVE_TEXT.slotName(slot), `${SAVE_TEXT.emptySlot}\n\n${T.loadEmpty}`);
      return;
    }
    const summary = saveSummary(record);
    const notes = [SAVE_TEXT.checkpointNote, ...(SAVE_CONFIG.manualLoadRanked ? [] : [SAVE_TEXT.unrankedNote])];
    const deleteLine = this.pendingDelete === slot ? T.slotDeleteConfirm : T.slotDeleteHint;
    this.setInfo(SAVE_TEXT.slotName(slot), `${summary.title}\n${summary.details}\n\n${notes.join('\n')}\n\n${deleteLine}`);
    if (this.pendingDelete === slot) this.infoBody.setColor(P.warn);
  }

  private refreshFloors(): void {
    const info = startFloorInfo(this.startFloor);
    const best = this.bossProgress.load();
    const left = this.startFloor > 1 ? '◂' : ' ';
    const right = this.startFloor < best ? '▸' : ' ';
    const labels = [`${left} ${info.label.toUpperCase()} ${right}`, T.floorBack];
    this.rows.forEach((row, i) => {
      const label = labels[i];
      const active = i === this.floorCursor;
      row.text.setText(label === undefined ? '' : `${active ? '▸ ' : '  '}${label}`).setColor(active ? P.itemSelected : P.item);
    });
    this.hint.setText(T.floorHint);
    this.setInfo(info.label, `${info.biome}\nBoss: ${info.boss}\n\n${T.floorSelectNote}`);
  }

  private setInfo(title: string, body: string): void {
    this.infoTitle.setText(title);
    this.infoBody.setText(body);
  }
}
