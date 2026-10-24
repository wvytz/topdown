import type Phaser from 'phaser';
import type { Vector2 } from '@/core/types';
import type { PlayerActions } from '@/entities/Player';
import {
  TOUCH_AIM_ASSIST,
  TOUCH_AIM_POINT_DISTANCE,
  TOUCH_AUTO_AIM_HOLD_MS,
  TOUCH_AUTO_AIM_RANGE,
} from '@/config/touchConfig';
import { InputController } from '@/input/InputController';
import type { PlayerInput, PlayerInputContext } from '@/input/playerInput';
import { assistAimDirection, autoAimDirection, touchAimDirection } from '@/systems/touchAim';
import { touchState } from '@/mobile/TouchState';

/**
 * Sterowanie wersji mobilnej (krok 96): dotyk (gałki i przyciski z TouchScene), a do tego klawiatura i pad
 * (np. tablet z padem) — bez myszy, bo przeglądarka telefonu udaje kliknięcia myszą po każdym dotyku.
 *
 * Celowanie jak w Brawl Stars: przeciągnięcie przycisku ataku (duże kółko) albo przycisku PPM celuje ręcznie
 * (z lekkim dociąganiem do wroga), stuknięcie i przytrzymanie bez przeciągania celują same w najbliższego wroga.
 */
export class TouchInput implements PlayerInput {
  private readonly base: InputController;
  /** Ostatni kierunek celowania z dotyku. */
  private aim: Vector2 = { x: 1, y: 0 };
  /** Po automatycznym celowaniu kierunek trzyma się chwilę (kula Czarodziejki wylatuje po zamachu). */
  private holdAimUntil = -Infinity;

  constructor(scene: Phaser.Scene) {
    this.base = new InputController(scene, { mouse: false });
  }

  getActions(context: PlayerInputContext): PlayerActions {
    const base = this.base.getActions(context);
    if (!touchState.engaged) return base;

    const taps = touchState.consumeTaps();
    const now = performance.now();
    const { origin } = context;
    const touchMove = touchState.move;
    const move = touchMove.x !== 0 || touchMove.y !== 0 ? touchMove : base.move;

    // Stuknięcie albo przytrzymanie przycisku ataku bez przeciągania: celuje sam.
    const autoAim =
      taps.attack || taps.shot || (touchState.attack && touchState.aim === null) || (touchState.shoot && touchState.shotAim === null);
    const auto = autoAim ? autoAimDirection(origin, context.targets(), TOUCH_AUTO_AIM_RANGE) : null;
    if (auto) {
      this.aim = auto;
      this.holdAimUntil = now + TOUCH_AUTO_AIM_HOLD_MS;
    } else {
      const holding = now < this.holdAimUntil;
      const manual = touchState.shotAim ?? touchState.aim;
      const direction = touchAimDirection(touchState.shotAim, touchState.aim, holding ? { x: 0, y: 0 } : move, this.aim);
      // Ręcznie prowadzony kciuk dostaje lekkie dociąganie do wroga w wąskim stożku.
      this.aim = manual ? assistAimDirection(origin, direction, context.targets(), TOUCH_AIM_ASSIST) : direction;
      if (manual) this.holdAimUntil = -Infinity;
    }

    return {
      move,
      aim: { x: origin.x + this.aim.x * TOUCH_AIM_POINT_DISTANCE, y: origin.y + this.aim.y * TOUCH_AIM_POINT_DISTANCE },
      attack: base.attack || touchState.attack || taps.attack,
      dash: base.dash || taps.dash,
      shoot: base.shoot || touchState.shoot || taps.shot,
      interact: base.interact || taps.interact,
    };
  }
}
