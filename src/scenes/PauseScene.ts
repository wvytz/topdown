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

/** Kanał głośności na ekranie pauzy (krok 116). */
type AudioChannel = 'music' | 'sfx';
/** Wiersz wybrany padem lub strzałkami: slot zapisu albo suwak głośności. */
type PauseCursor = number | AudioChannel;

export interface PauseSceneData {
  readonly reason: PauseReason;
  /** Wołane po zamknięciu ekranu — scena gry wznawia się sama. */
  readonly onResume: () => void;
  /** Zapis w ręcznym slocie (krok 91); null = zapis niedostępny (odtwarzanie nagrania). Zwraca, czy magazyn przyjął zapis. */
  readonly onSave: ((slot: number) => boolean) | null;
  /** Wyjście do menu głównego — scena gry sama zamyka pauzę i HUD. */
  readonly onQuit: () => void;
}

/**
 * Nakładka pauzy (krok 70). GameScene jest w tym czasie wstrzymana, a jej czas zamrożony (PauseClock),
 * więc nakładka nie używa tweenów ani czasu sceny. Wznowienie: Esc, P albo kliknięcie (po puszczeniu przycisku,
 * żeby kliknięcie powracające do okna nie zamieniło się w atak).
 * Krok 91: 1 / 2 / 3 (albo kliknięcie wiersza) zapisuje grę w slocie, M wychodzi do menu głównego.
 * Krok 95 (pad): Start / B — wznów, ↑ ↓ — wybór slotu, A — zapis w wybranym slocie, Y — menu główne.
 */
export class PauseScene extends Phaser.Scene {
  private resumed = false;
  private readonly saves = new SaveStorage(SaveStorage.browserStorage());
  private slotRows: Phaser.GameObjects.Text[] = [];
  private status!: Phaser.GameObjects.Text;
  /** Wiersz wybrany padem albo strzałkami (krok 95, suwaki — krok 116); null — jeszcze nic. */
  private cursor: PauseCursor | null = null;
  private audioRows: { readonly channel: AudioChannel; readonly value: Phaser.GameObjects.Text }[] = [];
  private muteText!: Phaser.GameObjects.Text;
  private muteHint = '';

  constructor() {
    super(SceneKey.Pause);
  }

  create(data: PauseSceneData): void {
    this.resumed = false;
    this.slotRows = [];
    this.audioRows = [];
    this.cursor = null;
    const { width, height } = this.scale;
    const L = PAUSE_CONFIG.layout;
    const texts = currentPlatform() === 'mobile' ? PAUSE_CONFIG.mobile : PAUSE_CONFIG;
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      color: '#e8e8f0',
      stroke: '#000000',
      strokeThickness: 4,
    };

    this.add.rectangle(width / 2, height / 2, width, height, PAUSE_CONFIG.overlay.color, PAUSE_CONFIG.overlay.alpha);
    this.add.text(width / 2, L.titleY, PAUSE_CONFIG.title, { ...style, fontSize: '40px', color: '#f0d27a', strokeThickness: 6 }).setOrigin(0.5);
    this.add.text(width / 2, L.reasonY, PAUSE_CONFIG.reasonText[data.reason], { ...style, fontSize: '15px', color: '#d8c0ff' }).setOrigin(0.5);
    this.add
      .text(width / 2, L.controlsY, texts.controls.join('\n'), { ...style, fontSize: '14px', color: '#a0a0b8', align: 'center', lineSpacing: 6 })
      .setOrigin(0.5, 0);

    const onSave = data.onSave;
    this.add
      .text(width / 2, L.saveTitleY, onSave ? texts.saveTitle : PAUSE_CONFIG.saveUnavailable, { ...style, fontSize: '14px', color: '#f0d27a' })
      .setOrigin(0.5);
    if (onSave) {
      for (const slot of this.saves.slots) {
        const row = this.add
          .text(width / 2, L.slotsY + (slot - 1) * L.slotStep, '', { ...style, fontSize: '13px' })
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true });
        row.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.save(onSave, slot));
        this.slotRows.push(row);
        this.input.keyboard?.on(`keydown-${slotKeyName(slot)}`, (event: KeyboardEvent) => {
          if (!event.repeat) this.save(onSave, slot);
        });
      }
      this.refreshSlots();
    }
    this.createAudioRows(style, texts === PAUSE_CONFIG.mobile);
    this.status = this.add.text(width / 2, L.statusY, '', { ...style, fontSize: '14px', color: '#9be08a' }).setOrigin(0.5);
    // Napis „M — menu główne” da się też kliknąć albo stuknąć (krok 96, telefon bez klawiatury).
    this.add
      .text(width / 2, L.quitY, texts.quitHint, { ...style, fontSize: '14px', color: '#a0a0b8' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.quit(data));
    this.add.text(width / 2, L.resumeY, texts.resumeHint, { ...style, fontSize: '16px', color: '#f5c542' }).setOrigin(0.5);

    for (const key of PAUSE_CONFIG.keys) {
      this.input.keyboard?.on(`keydown-${key}`, (event: KeyboardEvent) => {
        if (!event.repeat) this.resume(data);
      });
    }
    this.input.keyboard?.on('keydown-M', (event: KeyboardEvent) => {
      if (!event.repeat) this.quit(data);
    });
    // Strzałki i Enter — jak pad: wybór wiersza, głośność, zapis (krok 116).
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (!event.key.startsWith('Arrow') && event.key !== 'Enter') return;
      const command = menuCommandFromKey(event.key);
      if (command) this.onPadCommand(command, data);
    });
    this.input.keyboard?.on(`keydown-${MUTE_KEY}`, (event: KeyboardEvent) => {
      if (!event.repeat) sound.toggleMute();
    });
    const unwatch = sound.watch(() => this.refreshAudio());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unwatch);
    bindPadMenu(this, (command) => this.onPadCommand(command, data));
    // Kliknięcie poza wierszem slotu wznawia grę.
    this.input.on(Phaser.Input.Events.POINTER_UP, (_pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.resume(data);
    });
  }

  private onPadCommand(command: MenuCommand, data: PauseSceneData): void {
    const slots = this.saves.slots;
    switch (command) {
      case MenuCommand.Pause:
      case MenuCommand.Back:
        this.resume(data);
        break;
      case MenuCommand.Alt:
        this.quit(data);
        break;
      case MenuCommand.Up:
      case MenuCommand.Down: {
        const rows: PauseCursor[] = [...(data.onSave ? slots : []), 'music', 'sfx'];
        const step = command === MenuCommand.Up ? -1 : 1;
        const index = this.cursor === null ? (step > 0 ? 0 : rows.length - 1) : (rows.indexOf(this.cursor) + step + rows.length) % rows.length;
        this.cursor = rows[index] ?? null;
        sound.play(SoundCue.UiMove);
        this.refreshSlots();
        this.refreshAudio();
        break;
      }
      case MenuCommand.Left:
      case MenuCommand.Right:
        if (this.cursor === 'music' || this.cursor === 'sfx') this.changeVolume(this.cursor, command === MenuCommand.Left ? -1 : 1);
        break;
      case MenuCommand.Confirm:
        if (this.cursor === 'music' || this.cursor === 'sfx') sound.toggleMute();
        else if (data.onSave && this.cursor !== null) this.save(data.onSave, this.cursor);
        break;
      default:
    }
  }

  private quit(data: PauseSceneData): void {
    if (this.resumed) return;
    this.resumed = true;
    data.onQuit();
  }

  private save(onSave: (slot: number) => boolean, slot: number): void {
    if (this.resumed) return;
    const ok = onSave(slot);
    this.status.setText(ok ? SAVE_TEXT.savedToast(slot) : SAVE_TEXT.saveFailed).setColor(ok ? '#9be08a' : '#ff7a6a');
    this.refreshSlots();
  }

  private refreshSlots(): void {
    this.slotRows.forEach((row, i) => {
      const slot = i + 1;
      const record = this.saves.load(slot);
      const summary = record ? saveSummary(record) : null;
      row
        .setText(`${slot === this.cursor ? '▶ ' : ''}${slot} — ${SAVE_TEXT.slotName(slot)}: ${summary ? `${summary.title} · ${summary.details}` : SAVE_TEXT.emptySlot}`)
        .setColor(summary ? '#e8e8f0' : '#80809a');
    });
  }

  /**
   * Głośność muzyki i efektów (krok 116): „Muzyka − 50% +”; − i + da się kliknąć i stuknąć,
   * strzałki i pad zmieniają wybrany wiersz, N (albo stuknięcie napisu) wycisza wszystko.
   */
  private createAudioRows(style: Phaser.Types.GameObjects.Text.TextStyle, mobile: boolean): void {
    const L = PAUSE_CONFIG.layout;
    const { width } = this.scale;
    const font = { ...style, fontSize: '14px' };
    (['music', 'sfx'] as const).forEach((channel, i) => {
      const x = width / 2 + (i === 0 ? -L.audioColumn : L.audioColumn);
      this.add.text(x - 70, L.audioY, AUDIO_TEXT[channel], font).setOrigin(1, 0.5);
      const button = (dx: number, label: string, steps: number) =>
        this.add
          .text(x + dx, L.audioY, label, { ...font, fontSize: '18px', color: '#f0d27a' })
          .setOrigin(0.5)
          .setPadding(8, 2, 8, 2)
          .setInteractive({ useHandCursor: true })
          .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.changeVolume(channel, steps));
      button(-50, '−', -1);
      button(50, '+', 1);
      this.audioRows.push({ channel, value: this.add.text(x, L.audioY, '', font).setOrigin(0.5) });
    });
    this.muteText = this.add
      .text(width / 2, L.audioY + L.audioHintStep, '', { ...style, fontSize: '12px', color: '#a0a0b8' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => sound.toggleMute());
    this.muteHint = mobile ? AUDIO_TEXT.touchHint : `${AUDIO_TEXT.muteHint(MUTE_KEY)} · ${AUDIO_TEXT.padHint}`;
    this.refreshAudio();
  }

  private changeVolume(channel: AudioChannel, steps: number): void {
    sound.stepVolume(channel, steps);
    // Próbka nowej głośności efektów (muzyka słychać od razu).
    if (channel === 'sfx') sound.play(SoundCue.UiMove);
  }

  private refreshAudio(): void {
    const settings = sound.settings;
    for (const row of this.audioRows) {
      const selected = this.cursor === row.channel;
      row.value
        .setText(`${selected ? '▶ ' : ''}${volumeLabel(settings[row.channel])}`)
        .setColor(settings.muted ? '#80809a' : selected ? '#f5c542' : '#e8e8f0');
    }
    this.muteText.setText(settings.muted ? `${AUDIO_TEXT.muted} — ${this.muteHint}` : this.muteHint).setColor(settings.muted ? '#ff7a6a' : '#a0a0b8');
  }

  private resume(data: PauseSceneData): void {
    if (this.resumed) return;
    this.resumed = true;
    this.scene.stop();
    data.onResume();
  }
}

/** Nazwa klawisza cyfry w zdarzeniach Phasera (`keydown-ONE` …). */
function slotKeyName(slot: number): string {
  return ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'][slot] ?? 'ZERO';
}
