import Phaser from 'phaser';
import { PAUSE_CONFIG } from '@/config/pauseConfig';
import type { PauseReason } from '@/config/pauseConfig';
import { SAVE_TEXT } from '@/config/saveConfig';
import { SceneKey } from '@/core/types';
import { SaveStorage } from '@/persistence/SaveStorage';
import { saveSummary } from '@/systems/SaveGame';
import { MenuCommand } from '@/systems/gamepadInput';
import { currentPlatform } from '@/core/platform';
import { bindPadMenu } from '@/input/PadMenuInput';
import { SoundCue, sound } from '@/audio/SoundBoard';
import { AUDIO_TEXT, MUTE_KEY } from '@/config/audioConfig';
import { menuCommandFromKey } from '@/systems/gamepadInput';
import { volumeLabel } from '@/systems/AudioSettings';
import { DISPLAY_CONFIG, DISPLAY_TEXT } from '@/config/displayConfig';
import { display } from '@/input/DisplayControls';
import { PauseItem, PausePage, movePauseCursor, pageOf, pauseBack, pauseItems, slotOf } from '@/systems/pauseMenu';
import type { PauseMenuOptions } from '@/systems/pauseMenu';

export interface PauseSceneData {
  readonly reason: PauseReason;
  /** Wołane po zamknięciu ekranu — scena gry wznawia się sama. */
  readonly onResume: () => void;
  /** Zapis w ręcznym slocie (krok 91); null = zapis niedostępny (odtwarzanie nagrania). Zwraca, czy magazyn przyjął zapis. */
  readonly onSave: ((slot: number) => boolean) | null;
  /** Wyjście do menu głównego — scena gry sama zamyka pauzę i HUD. */
  readonly onQuit: () => void;
}

/** Wiersz strony: napis pozycji (dla głośności także − i +). */
interface PauseRow {
  readonly item: PauseItem;
  readonly text: Phaser.GameObjects.Text;
}

const COLORS = { item: '#e8e8f0', selected: '#f5c542', dim: '#80809a', hint: '#a0a0b8', ok: '#9be08a', error: '#ff7a6a' } as const;

/**
 * Nakładka pauzy (krok 70). GameScene jest w tym czasie wstrzymana, a jej czas zamrożony (PauseClock),
 * więc nakładka nie używa tweenów ani czasu sceny.
 * Krok 120: krótkie menu (Wznów, Zapisz grę, Dźwięk i obraz, Sterowanie, Menu główne) z podstronami
 * (`systems/pauseMenu.ts`). Mysz: najechanie wybiera, kliknięcie potwierdza, kliknięcie obok listy na stronie
 * głównej wznawia (powrót do okna po utracie fokusu). Klawiatura: strzałki / WASD i Enter, Esc — wstecz (na głównej
 * wznów), P — wznów; skróty 1 / 2 / 3 (zapis), M (menu), N (dźwięk), O i F (obraz) działają na każdej stronie.
 * Pad: ↑ ↓ + A, ← → głośność, B — wstecz, Start — wznów, Y — menu główne.
 */
export class PauseScene extends Phaser.Scene {
  private resumed = false;
  private readonly saves = new SaveStorage(SaveStorage.browserStorage());
  private pauseData!: PauseSceneData;
  private options!: PauseMenuOptions;
  private mobile = false;
  private page = PausePage.Main;
  private cursor: PauseItem | null = null;
  /** Zmiana strony czeka do `update` — nie niszczymy napisu w trakcie obsługi jego kliknięcia. */
  private pendingPage: { readonly page: PausePage; readonly cursor: PauseItem | null } | null = null;
  private pageLayer!: Phaser.GameObjects.Container;
  private rows: PauseRow[] = [];
  private note: Phaser.GameObjects.Text | null = null;
  private status!: Phaser.GameObjects.Text;
  private style!: Phaser.Types.GameObjects.Text.TextStyle;

  constructor() {
    super(SceneKey.Pause);
  }

  create(data: PauseSceneData): void {
    this.pauseData = data;
    this.resumed = false;
    this.mobile = currentPlatform() === 'mobile';
    this.options = { canSave: data.onSave !== null, display: !this.mobile };
    this.pendingPage = null;
    const { width, height } = this.scale;
    const L = PAUSE_CONFIG.layout;
    this.style = { fontFamily: 'monospace', color: COLORS.item, stroke: '#000000', strokeThickness: 4 };

    this.add.rectangle(width / 2, height / 2, width, height, PAUSE_CONFIG.overlay.color, PAUSE_CONFIG.overlay.alpha);
    const P = L.panel;
    this.add
      .rectangle(width / 2, P.top, P.width, P.bottom - P.top, P.color, P.alpha)
      .setOrigin(0.5, 0)
      .setStrokeStyle(2, P.border);
    this.pageLayer = this.add.container(0, 0);
    this.status = this.add.text(width / 2, L.statusY, '', { ...this.style, fontSize: '14px', color: COLORS.ok }).setOrigin(0.5);
    this.showPage(PausePage.Main, this.mobile ? null : PauseItem.Resume);

    this.bindKeys(data);
    const unwatch = sound.watch(() => this.refresh());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unwatch);
    const unwatchDisplay = display.watch(() => this.refresh());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unwatchDisplay);
    bindPadMenu(this, (command) => this.onCommand(command));
    // Kliknięcie obok listy na stronie głównej wznawia grę (podstrony: nic — łatwo chybić przycisku głośności).
    this.input.on(Phaser.Input.Events.POINTER_UP, (_pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0 && this.page === PausePage.Main && !this.pendingPage) this.resume();
    });
  }

  override update(): void {
    if (!this.pendingPage) return;
    const { page, cursor } = this.pendingPage;
    this.pendingPage = null;
    this.showPage(page, cursor);
  }

  private bindKeys(data: PauseSceneData): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    const once = (name: string, action: () => void): void => {
      keyboard.on(`keydown-${name}`, (event: KeyboardEvent) => {
        if (!event.repeat) action();
      });
    };
    once('P', () => this.resume());
    once('M', () => this.quit());
    once(MUTE_KEY, () => sound.toggleMute());
    if (this.options.display) once(DISPLAY_CONFIG.fillKey, () => this.activate(PauseItem.Fill));
    const onSave = data.onSave;
    if (onSave) for (const slot of this.saves.slots) once(slotKeyName(slot), () => this.save(onSave, slot));
    // Strzałki, WASD, Enter i Esc — jak pad (Esc to „wstecz”, na stronie głównej wznawia).
    keyboard.on('keydown', (event: KeyboardEvent) => {
      if (event.repeat && (event.key === 'Escape' || event.key === 'Enter')) return;
      const command = menuCommandFromKey(event.key);
      if (command) this.onCommand(command);
    });
  }

  private onCommand(command: MenuCommand): void {
    if (this.pendingPage) return;
    switch (command) {
      case MenuCommand.Pause:
        this.resume();
        break;
      case MenuCommand.Back:
        this.back();
        break;
      case MenuCommand.Alt:
        this.quit();
        break;
      case MenuCommand.Up:
      case MenuCommand.Down:
        this.cursor = movePauseCursor(pauseItems(this.page, this.options), this.cursor, command === MenuCommand.Up ? -1 : 1);
        sound.play(SoundCue.UiMove);
        this.refresh();
        break;
      case MenuCommand.Left:
      case MenuCommand.Right:
        if (this.cursor === PauseItem.Music || this.cursor === PauseItem.Sfx) this.changeVolume(this.cursor, command === MenuCommand.Left ? -1 : 1);
        break;
      case MenuCommand.Confirm:
        if (this.cursor !== null) this.activate(this.cursor);
        break;
      default:
    }
  }

  private back(): void {
    const target = pauseBack(this.page);
    if (!target) {
      this.resume();
      return;
    }
    sound.play(SoundCue.UiMove);
    this.pendingPage = target;
  }

  private activate(item: PauseItem): void {
    if (this.resumed) return;
    const page = pageOf(item);
    if (page) {
      sound.play(SoundCue.UiMove);
      this.pendingPage = { page, cursor: this.mobile ? null : (pauseItems(page, this.options)[0] ?? null) };
      return;
    }
    const slot = slotOf(item);
    if (slot !== null) {
      if (this.pauseData.onSave) this.save(this.pauseData.onSave, slot);
      return;
    }
    switch (item) {
      case PauseItem.Resume:
        this.resume();
        break;
      case PauseItem.Quit:
        this.quit();
        break;
      case PauseItem.Back:
        this.back();
        break;
      // Enter na suwaku głośności wycisza, jak przed krokiem 120.
      case PauseItem.Music:
      case PauseItem.Sfx:
      case PauseItem.Mute:
        sound.toggleMute();
        break;
      case PauseItem.Fill:
      case PauseItem.Fullscreen:
        this.useDisplay(item);
        break;
      default:
    }
  }

  /** Buduje stronę od nowa: tytuł, pozycje (dla głośności z − i +), ewentualny opis sterowania i podpowiedź. */
  private showPage(page: PausePage, cursor: PauseItem | null): void {
    this.page = page;
    this.cursor = cursor;
    this.pageLayer.removeAll(true);
    this.rows = [];
    this.note = null;
    this.status.setText('');
    const { width } = this.scale;
    const L = PAUSE_CONFIG.layout;
    const cx = width / 2;
    const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      this.pageLayer.add(object);
      return object;
    };

    if (page === PausePage.Main) {
      add(this.add.text(cx, L.titleY, PAUSE_CONFIG.title, { ...this.style, fontSize: '40px', color: '#f0d27a', strokeThickness: 6 }).setOrigin(0.5));
      add(this.add.text(cx, L.subtitleY, PAUSE_CONFIG.reasonText[this.pauseData.reason], { ...this.style, fontSize: '14px', color: '#d8c0ff' }).setOrigin(0.5));
    } else {
      add(this.add.text(cx, L.titleY, PAUSE_CONFIG.pageTitles[page], { ...this.style, fontSize: '28px', color: '#f0d27a', strokeThickness: 5 }).setOrigin(0.5));
    }
    if (page === PausePage.Save) {
      const unavailable = !this.pauseData.onSave;
      const subtitle = unavailable ? PAUSE_CONFIG.saveUnavailable : PAUSE_CONFIG.notes.save;
      add(this.add.text(cx, L.subtitleY, subtitle, { ...this.style, fontSize: '14px', color: unavailable ? COLORS.error : '#d8c0ff' }).setOrigin(0.5));
    }
    if (page === PausePage.Controls) {
      const lines = this.mobile ? PAUSE_CONFIG.mobile.controls : PAUSE_CONFIG.controls;
      add(
        this.add
          .text(cx, L.controlsY, lines.join('\n'), { ...this.style, fontSize: '13px', color: '#c8c8d8', align: 'center', lineSpacing: 4 })
          .setOrigin(0.5, 0),
      );
    }

    const items = pauseItems(page, this.options);
    const firstY = page === PausePage.Controls ? L.controlsItemsY : L.itemsY;
    items.forEach((item, i) => {
      const y = firstY + i * L.itemStep;
      const text = add(
        this.add
          .text(cx, y, '', { ...this.style, fontSize: `${slotOf(item) === null ? L.itemFontSize : L.slotFontSize}px` })
          .setOrigin(0.5)
          .setPadding(16, 4, 16, 4)
          .setInteractive({ useHandCursor: true }),
      );
      text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.hover(item));
      text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.activate(item));
      if (item === PauseItem.Music || item === PauseItem.Sfx) {
        const button = (dx: number, label: string, steps: number): void => {
          add(
            this.add
              .text(cx + dx, y, label, { ...this.style, fontSize: '22px', color: '#f0d27a' })
              .setOrigin(0.5)
              .setPadding(10, 2, 10, 2)
              .setInteractive({ useHandCursor: true })
              .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.hover(item))
              .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.changeVolume(item, steps)),
          );
        };
        button(-L.volumeButtonDx, '−', -1);
        button(L.volumeButtonDx, '+', 1);
      }
      this.rows.push({ item, text });
    });
    if (page === PausePage.Main) {
      const noteY = firstY + items.length * L.itemStep + L.noteGap;
      this.note = add(this.add.text(cx, noteY, '', { ...this.style, fontSize: '13px', color: COLORS.hint }).setOrigin(0.5));
    }
    const hint = this.mobile ? PAUSE_CONFIG.mobile.hint : page === PausePage.Main ? PAUSE_CONFIG.hints.main : page === PausePage.Settings ? PAUSE_CONFIG.hints.settings : PAUSE_CONFIG.hints.sub;
    add(this.add.text(cx, L.hintY, hint, { ...this.style, fontSize: '13px', color: COLORS.hint }).setOrigin(0.5));
    this.refresh();
  }

  private hover(item: PauseItem): void {
    if (this.cursor === item || this.pendingPage) return;
    this.cursor = item;
    this.refresh();
  }

  /** Napisy pozycji i kolor wybranej; wołane po każdej zmianie kursora, dźwięku albo obrazu. */
  private refresh(): void {
    for (const row of this.rows) {
      const selected = row.item === this.cursor;
      const label = this.label(row.item);
      row.text.setText(selected && !this.mobile ? `▶ ${label} ◀` : label).setColor(this.color(row.item, selected));
    }
    if (this.note) {
      const note = this.cursor === PauseItem.Save ? PAUSE_CONFIG.notes.save : this.cursor === PauseItem.Quit ? PAUSE_CONFIG.notes.quit : '';
      this.note.setText(note);
    }
  }

  private label(item: PauseItem): string {
    const T = PAUSE_CONFIG.items;
    const slot = slotOf(item);
    if (slot !== null) {
      const record = this.saves.load(slot);
      const summary = record ? saveSummary(record) : null;
      return `${SAVE_TEXT.slotName(slot)}: ${summary ? `${summary.title} · ${summary.details}` : SAVE_TEXT.emptySlot}`;
    }
    const settings = sound.settings;
    switch (item) {
      case PauseItem.Music:
      case PauseItem.Sfx: {
        const channel = item === PauseItem.Music ? 'music' : 'sfx';
        return `${AUDIO_TEXT[channel]} ${volumeLabel(settings[channel])}`;
      }
      case PauseItem.Mute:
        return T.mute(settings.muted);
      case PauseItem.Fill:
        return DISPLAY_TEXT.fill(display.settings.fillWindow);
      case PauseItem.Fullscreen:
        return DISPLAY_TEXT.fullscreen(display.fullscreen);
      default:
        return T[item as keyof typeof T] as string;
    }
  }

  private color(item: PauseItem, selected: boolean): string {
    if (selected) return COLORS.selected;
    const slot = slotOf(item);
    if (slot !== null) return this.saves.load(slot) ? COLORS.item : COLORS.dim;
    if ((item === PauseItem.Music || item === PauseItem.Sfx) && sound.settings.muted) return COLORS.dim;
    if (item === PauseItem.Mute && sound.settings.muted) return COLORS.error;
    return COLORS.item;
  }

  private quit(): void {
    if (this.resumed) return;
    this.resumed = true;
    this.pauseData.onQuit();
  }

  private save(onSave: (slot: number) => boolean, slot: number): void {
    if (this.resumed) return;
    const ok = onSave(slot);
    this.status.setText(ok ? SAVE_TEXT.savedToast(slot) : SAVE_TEXT.saveFailed).setColor(ok ? COLORS.ok : COLORS.error);
    this.refresh();
  }

  private useDisplay(item: PauseItem.Fill | PauseItem.Fullscreen): void {
    sound.play(SoundCue.UiMove);
    if (item === PauseItem.Fill) {
      display.toggleFillWindow();
      return;
    }
    void display.toggleFullscreen().then((ok) => {
      if (!ok && this.scene.isActive()) this.status.setText(DISPLAY_TEXT.fullscreenFailed).setColor(COLORS.error);
    });
  }

  private changeVolume(item: PauseItem.Music | PauseItem.Sfx, steps: number): void {
    const channel = item === PauseItem.Music ? 'music' : 'sfx';
    sound.stepVolume(channel, steps);
    // Próbka nowej głośności efektów (muzyka słychać od razu).
    if (channel === 'sfx') sound.play(SoundCue.UiMove);
  }

  private resume(): void {
    if (this.resumed) return;
    this.resumed = true;
    this.scene.stop();
    this.pauseData.onResume();
  }
}

/** Nazwa klawisza cyfry w zdarzeniach Phasera (`keydown-ONE` …). */
function slotKeyName(slot: number): string {
  return ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'][slot] ?? 'ZERO';
}
