import Phaser from 'phaser';
import { screenFx } from '@/effects/ScreenFx';

/** Pola Phaser.Game, których typy nie wystawiają publicznie. */
interface GameInternals {
  readonly pendingDestroy?: boolean;
  readonly isPaused: boolean;
}

/**
 * Hitstop „tylko obraz” (krok U2, STYLEGUIDE §13.5): w czasie zatrzymania klatka robi wszystko oprócz rysowania —
 * wejście, sceny, fizyka i czas gry idą dalej, a na ekranie zostaje ostatni obraz (z błyskiem trafienia).
 * Dzięki temu nagranie wejść odtwarza się identycznie na każdym poziomie jakości. Zakładane jako pierwsza nakładka
 * na `game.step`, więc łapanie wyjątków z diagnostyki obejmuje też klatki bez rysowania.
 */
export function installFrameHold(game: Phaser.Game): void {
  const step = game.step.bind(game);
  const internals = game as unknown as GameInternals;
  game.step = (time: number, delta: number) => {
    if (!screenFx.holdFrame(time) || internals.pendingDestroy || internals.isPaused) {
      step(time, delta);
      return;
    }
    const events = game.events;
    events.emit(Phaser.Core.Events.PRE_STEP, time, delta);
    events.emit(Phaser.Core.Events.STEP, time, delta);
    game.scene.update(time, delta);
    events.emit(Phaser.Core.Events.POST_STEP, time, delta);
  };
}
