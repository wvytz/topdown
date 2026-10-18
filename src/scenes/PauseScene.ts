import Phaser from 'phaser';
import { PAUSE_CONFIG } from '@/config/pauseConfig';
import type { PauseReason } from '@/config/pauseConfig';
import { SceneKey } from '@/core/types';

export interface PauseSceneData {
  readonly reason: PauseReason;
  /** Wołane po zamknięciu ekranu — scena gry wznawia się sama. */
  readonly onResume: () => void;
}

/**
 * Nakładka pauzy (krok 70). GameScene jest w tym czasie wstrzymana, a jej czas zamrożony (PauseClock),
 * więc nakładka nie używa tweenów ani czasu sceny. Wznowienie: Esc, P albo kliknięcie (po puszczeniu przycisku,
 * żeby kliknięcie powracające do okna nie zamieniło się w atak).
 */
export class PauseScene extends Phaser.Scene {
  private resumed = false;

  constructor() {
    super(SceneKey.Pause);
  }

  create(data: PauseSceneData): void {
    this.resumed = false;
    const { width, height } = this.scale;
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      color: '#e8e8f0',
      stroke: '#000000',
      strokeThickness: 4,
    };

    this.add.rectangle(width / 2, height / 2, width, height, PAUSE_CONFIG.overlay.color, PAUSE_CONFIG.overlay.alpha);
    this.add.text(width / 2, height / 2 - 110, PAUSE_CONFIG.title, { ...style, fontSize: '40px', color: '#f0d27a', strokeThickness: 6 }).setOrigin(0.5);
    this.add.text(width / 2, height / 2 - 66, PAUSE_CONFIG.reasonText[data.reason], { ...style, fontSize: '15px', color: '#d8c0ff' }).setOrigin(0.5);
    this.add
      .text(width / 2, height / 2 - 10, PAUSE_CONFIG.controls.join('\n'), { ...style, fontSize: '14px', color: '#a0a0b8', align: 'center', lineSpacing: 6 })
      .setOrigin(0.5, 0);
    this.add.text(width / 2, height / 2 + 150, PAUSE_CONFIG.resumeHint, { ...style, fontSize: '16px', color: '#f5c542' }).setOrigin(0.5);

    for (const key of PAUSE_CONFIG.keys) {
      this.input.keyboard?.on(`keydown-${key}`, (event: KeyboardEvent) => {
        if (!event.repeat) this.resume(data);
      });
    }
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.resume(data));
  }

  private resume(data: PauseSceneData): void {
    if (this.resumed) return;
    this.resumed = true;
    this.scene.stop();
    data.onResume();
  }
}
