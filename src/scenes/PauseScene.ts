import Phaser from 'phaser';
import { PAUSE_CONFIG } from '@/config/pauseConfig';
import type { PauseReason } from '@/config/pauseConfig';
import { SAVE_TEXT } from '@/config/saveConfig';
import { SceneKey } from '@/core/types';
import { SaveStorage } from '@/persistence/SaveStorage';
import { saveSummary } from '@/systems/SaveGame';

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
 */
export class PauseScene extends Phaser.Scene {
  private resumed = false;
  private readonly saves = new SaveStorage(SaveStorage.browserStorage());
  private slotRows: Phaser.GameObjects.Text[] = [];
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKey.Pause);
  }

  create(data: PauseSceneData): void {
    this.resumed = false;
    this.slotRows = [];
    const { width, height } = this.scale;
    const L = PAUSE_CONFIG.layout;
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
      .text(width / 2, L.controlsY, PAUSE_CONFIG.controls.join('\n'), { ...style, fontSize: '14px', color: '#a0a0b8', align: 'center', lineSpacing: 6 })
      .setOrigin(0.5, 0);

    const onSave = data.onSave;
    this.add
      .text(width / 2, L.saveTitleY, onSave ? PAUSE_CONFIG.saveTitle : PAUSE_CONFIG.saveUnavailable, { ...style, fontSize: '14px', color: '#f0d27a' })
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
    this.status = this.add.text(width / 2, L.statusY, '', { ...style, fontSize: '14px', color: '#9be08a' }).setOrigin(0.5);
    this.add.text(width / 2, L.quitY, PAUSE_CONFIG.quitHint, { ...style, fontSize: '14px', color: '#a0a0b8' }).setOrigin(0.5);
    this.add.text(width / 2, L.resumeY, PAUSE_CONFIG.resumeHint, { ...style, fontSize: '16px', color: '#f5c542' }).setOrigin(0.5);

    for (const key of PAUSE_CONFIG.keys) {
      this.input.keyboard?.on(`keydown-${key}`, (event: KeyboardEvent) => {
        if (!event.repeat) this.resume(data);
      });
    }
    this.input.keyboard?.on('keydown-M', (event: KeyboardEvent) => {
      if (event.repeat || this.resumed) return;
      this.resumed = true;
      data.onQuit();
    });
    // Kliknięcie poza wierszem slotu wznawia grę.
    this.input.on(Phaser.Input.Events.POINTER_UP, (_pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.resume(data);
    });
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
        .setText(`${slot} — ${SAVE_TEXT.slotName(slot)}: ${summary ? `${summary.title} · ${summary.details}` : SAVE_TEXT.emptySlot}`)
        .setColor(summary ? '#e8e8f0' : '#80809a');
    });
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
