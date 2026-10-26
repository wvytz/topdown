import type Phaser from 'phaser';
import type { Vector2 } from '@/core/types';
import type { PlayerActions } from '@/entities/Player';
import type { AimTarget } from '@/systems/touchAim';
import { InputController } from '@/input/InputController';
import type { PlayerDevices } from '@/systems/coopDevices';

/** Co scena gry podaje źródłu sterowania w każdej klatce (krok 96). */
export interface PlayerInputContext {
  /** Pozycja bohatera — pad i dotyk podają kierunek, a akcje punkt celowania. */
  readonly origin: Vector2;
  /** Widoczni wrogowie i walczący boss — dla automatycznego celowania na dotyku i padzie (krok 114); mysz z nich nie korzysta. */
  readonly targets: () => Iterable<AimTarget>;
}

/**
 * Gniazdo sterowania (krok 96): scena gry pyta o akcje bohatera, nie wiedząc, skąd przychodzą.
 * PC: mysz, klawiatura i pad (`InputController`); wersja mobilna podstawia dotyk (`src/mobile/`).
 */
export interface PlayerInput {
  /** Wywoływać raz na klatkę — „zjada” jednorazowe wciśnięcia. */
  getActions(context: PlayerInputContext): PlayerActions;
}

/** `devices` — urządzenia bohatera w co-opie (etap C1); brak = solo (wszystkie urządzenia naraz). */
export type PlayerInputFactory = (scene: Phaser.Scene, devices?: PlayerDevices) => PlayerInput;

let factory: PlayerInputFactory = (scene, devices) => new InputController(scene, devices ? { devices } : {});

/** Wersja mobilna podmienia źródło sterowania przy starcie, zanim powstanie scena gry. */
export function setPlayerInputFactory(next: PlayerInputFactory): void {
  factory = next;
}

export function createPlayerInput(scene: Phaser.Scene, devices?: PlayerDevices): PlayerInput {
  return factory(scene, devices);
}
