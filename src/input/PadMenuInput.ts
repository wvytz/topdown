import Phaser from 'phaser';
import { PadMenuReader, type MenuCommand } from '@/systems/gamepadInput';
import { readPadSnapshot } from '@/input/padSnapshot';
import { sound } from '@/audio/SoundBoard';

/**
 * Pad na ekranach poza walką (krok 95): co klatkę sceny czyta pad i przekazuje komendy menu.
 * Nasłuch kończy się razem ze sceną; wstrzymana scena (pauza) nie dostaje komend.
 */
export function bindPadMenu(scene: Phaser.Scene, onCommand: (command: MenuCommand) => void): void {
  const reader = new PadMenuReader();
  const tick = (time: number): void => {
    for (const command of reader.read(readPadSnapshot(), time)) {
      // Przycisk pada też może odblokować dźwięk (krok 116) — gracz z samym padem nie dotyka klawiatury.
      sound.unlock();
      onCommand(command);
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, tick));
}
