import type Phaser from 'phaser';
import type { InputRecording } from '@/core/diagnosticsTypes';
import type { FloorSceneData } from '@/core/types';
import { newRun } from '@/systems/RunState';
import { canReplay } from '@/systems/InputRecorder';
import type { HeroId } from '@/core/heroTypes';
import type { ItemId } from '@/core/lootTypes';

/**
 * Narzędzia deweloperskie diagnostyki (krok 56, tylko tryb dev): `__replay(nagranie)` restartuje scenę na piętrze z nagrania
 * (ten sam seed i stan runu) i podaje do gry zapisane wejścia zamiast klawiatury. `nagranie` to obiekt albo tekst JSON
 * z przycisku „Kopiuj nagranie” (F9). Odtworzenie jest przybliżone (czas klatek może się różnić), ale seed i układ są te same.
 */
export function installDevTools(game: Phaser.Game): void {
  const api = {
    replay(input: InputRecording | string): string {
      const recording: InputRecording = typeof input === 'string' ? (JSON.parse(input) as InputRecording) : input;
      if (!canReplay(recording)) return 'Nagranie nie nadaje się do odtworzenia (przycięte, puste albo uszkodzone).';
      const scene = game.scene.getScenes(true).find((s) => s.scene.key === 'GameScene');
      if (!scene) return 'Brak aktywnej sceny gry.';
      const { meta } = recording;
      const run = { ...newRun(meta.hero as HeroId, true), gold: meta.gold, items: meta.items as ItemId[], hp: meta.hp };
      const data: FloorSceneData = { runSeed: meta.runSeed, floor: meta.floor, run, replay: recording };
      scene.scene.restart(data);
      return `Odtwarzam piętro ${meta.floor}, seed ${meta.runSeed} (${recording.count} zmian wejścia, ${Math.round(recording.durationMs / 1000)} s).`;
    },
  };
  (window as unknown as { __replay: typeof api.replay }).__replay = api.replay;
}
