import Phaser from 'phaser';
import type { BiomeSoundscape as BiomeSoundscapeConfig } from '@/config/soundscapeConfig';
import { SOUNDSCAPE_CONFIG } from '@/config/soundscapeConfig';
import { sound } from '@/audio/SoundBoard';
import { pickSoundscape } from '@/systems/Soundscape';

/**
 * Odgłosy biomu (krok 158): co kilka sekund cichy odgłos tła spoza kadru (wiatr, kapanie, kruk, telefon…).
 * Wybór — `systems/Soundscape`, liczby — `config/soundscapeConfig`. Czas sceny (pauza wstrzymuje), Math.random,
 * bo to efekt czysto zmysłowy. `quiet` — np. walka z bossem: wtedy odgłos przepada, a odliczanie biegnie dalej.
 */
export class BiomeSoundscape {
  private nextAt: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly scape: BiomeSoundscapeConfig,
    private readonly quiet: () => boolean,
  ) {
    this.nextAt = scene.time.now + SOUNDSCAPE_CONFIG.firstDelayMs + Math.random() * scape.intervalMs.max * 0.5;
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this));
  }

  private update(time: number): void {
    if (time < this.nextAt) return;
    const pick = pickSoundscape(this.scape, SOUNDSCAPE_CONFIG, {
      pick: Math.random(),
      angle: Math.random(),
      distance: Math.random(),
      interval: Math.random(),
    });
    if (!pick) {
      this.nextAt = Number.POSITIVE_INFINITY;
      return;
    }
    this.nextAt = time + pick.nextInMs;
    if (this.quiet()) return;
    const mid = this.scene.cameras.main.midPoint;
    sound.play(pick.cue, { x: mid.x + pick.dx, y: mid.y + pick.dy });
  }
}
