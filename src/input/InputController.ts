import Phaser from 'phaser';
import type { MovementIntent } from '@/core/types';
import type { PlayerActions } from '@/entities/Player';

interface MovementKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

/**
 * Tłumaczy surowe wejście (klawiatura + mysz) na abstrakcyjne PlayerActions.
 * Encje nie znają klawiszy — dzięki temu łatwo dodać gamepada lub drugiego gracza (co-op).
 */
export class InputController {
  private readonly wasd: MovementKeys;
  private readonly arrows: MovementKeys;
  private readonly dashKey: Phaser.Input.Keyboard.Key;
  private readonly interactKey: Phaser.Input.Keyboard.Key;
  /** Kliknięcie PPM zapamiętane do najbliższej klatki — krótki klik nie może zginąć. */
  private shootClickQueued = false;

  constructor(private readonly scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('InputController: klawiatura niedostępna w tej scenie.');

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.wasd = {
      up: keyboard.addKey(K.W),
      down: keyboard.addKey(K.S),
      left: keyboard.addKey(K.A),
      right: keyboard.addKey(K.D),
    };
    this.arrows = {
      up: keyboard.addKey(K.UP),
      down: keyboard.addKey(K.DOWN),
      left: keyboard.addKey(K.LEFT),
      right: keyboard.addKey(K.RIGHT),
    };
    this.dashKey = keyboard.addKey(K.SPACE);
    this.interactKey = keyboard.addKey(K.E);

    // PPM = strzał; wyłączamy menu kontekstowe przeglądarki.
    scene.input.mouse?.disableContextMenu();
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) this.shootClickQueued = true;
    });
  }

  /** Wywoływać raz na klatkę — „zjada” jednorazowe wciśnięcia (dash, klik PPM). */
  getActions(): PlayerActions {
    const pointer = this.scene.input.activePointer;
    // Przeliczamy co klatkę: kamera się przesuwa, nawet gdy mysz stoi w miejscu.
    const aim = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);

    const shoot = pointer.rightButtonDown() || this.shootClickQueued;
    this.shootClickQueued = false;

    return {
      move: this.getMovementIntent(),
      aim: { x: aim.x, y: aim.y },
      attack: pointer.leftButtonDown(),
      dash: Phaser.Input.Keyboard.JustDown(this.dashKey),
      shoot,
      interact: Phaser.Input.Keyboard.JustDown(this.interactKey),
    };
  }

  private getMovementIntent(): MovementIntent {
    const pressed = (dir: keyof MovementKeys): boolean =>
      this.wasd[dir].isDown || this.arrows[dir].isDown;

    return {
      x: Number(pressed('right')) - Number(pressed('left')),
      y: Number(pressed('down')) - Number(pressed('up')),
    };
  }
}
