import Phaser from 'phaser';
import { COOP_CONFIG } from '@/config/coopConfig';
import { readAllPadSnapshots } from '@/input/padSnapshot';
import type { CoopRoster, JoinEvent } from '@/systems/coopDevices';
import { CoopJoinReader, applyJoinRequests } from '@/systems/coopDevices';

/**
 * Dołączanie graczy do co-opu (etap C1): co klatkę sceny czyta wszystkie pady i klawiaturę (Enter/Spacja — dołącz,
 * Esc — wyjdź) i zmienia drużynę. Ekran wyboru co-op (etap C5) pokazuje zdarzenia; nasłuch kończy się ze sceną.
 */
export function bindCoopJoin(scene: Phaser.Scene, roster: CoopRoster, onChange: (event: JoinEvent) => void): void {
  const reader = new CoopJoinReader({ join: COOP_CONFIG.joinButtons, leave: COOP_CONFIG.leaveButtons });
  let keyboardJoin = false;
  let keyboardLeave = false;
  const onKey = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (event.key === 'Enter' || event.key === ' ') keyboardJoin = true;
    else if (event.key === 'Escape') keyboardLeave = true;
  };
  const tick = (): void => {
    const requests = reader.read({ pads: readAllPadSnapshots(), keyboardJoin, keyboardLeave });
    keyboardJoin = false;
    keyboardLeave = false;
    for (const event of applyJoinRequests(roster, requests)) onChange(event);
  };
  scene.input.keyboard?.on('keydown', onKey);
  scene.events.on(Phaser.Scenes.Events.UPDATE, tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.input.keyboard?.off('keydown', onKey);
    scene.events.off(Phaser.Scenes.Events.UPDATE, tick);
  });
}
