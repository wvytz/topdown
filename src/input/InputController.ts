import Phaser from 'phaser';
import type { MovementIntent, Vector2 } from '@/core/types';
import type { PlayerActions } from '@/entities/Player';
import { GAMEPAD_CONFIG } from '@/config/gamepadConfig';
import { PadGameplayReader, combineMovement, padAimDirection } from '@/systems/gamepadInput';
import { readPadSnapshot } from '@/input/padSnapshot';

interface MovementKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

/**
 * Tłumaczy surowe wejście (klawiatura + mysz, od kroku 95 także pad) na abstrakcyjne PlayerActions.
 * Encje nie znają klawiszy — kolejne źródło (dotyk, drugi gracz w co-op) to kolejny tłumacz na te same akcje.
 *
 * Przyciski i ruch z obu źródeł się sumują. Celowanie bierze ostatnio używane urządzenie: ruch lub klik myszy
 * oddaje cel myszy, użycie pada — padowi.
 */
export class InputController {
  private readonly wasd: MovementKeys;
  private readonly arrows: MovementKeys;
  private readonly dashKey: Phaser.Input.Keyboard.Key;
  private readonly interactKey: Phaser.Input.Keyboard.Key;
  /** Kliknięcie PPM zapamiętane do najbliższej klatki — krótki klik nie może zginąć. */
  private shootClickQueued = false;
  private readonly pad = new PadGameplayReader();
  /** Celuje pad (do ruchu myszy). */
  private padAiming = false;
  /** Ostatni kierunek celowania z pada — zostaje, gdy bohater stoi, a prawa gałka jest puszczona. */
  private padAim: Vector2 = { x: 1, y: 0 };
  private lastPointer: Vector2 | null = null;

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

  /**
   * Wywoływać raz na klatkę — „zjada” jednorazowe wciśnięcia (dash, klik PPM).
   * `origin` to pozycja bohatera: pad podaje kierunek, a akcje — punkt celowania w świecie.
   */
  getActions(origin: Vector2): PlayerActions {
    const pointer = this.scene.input.activePointer;
    // Przeliczamy co klatkę: kamera się przesuwa, nawet gdy mysz stoi w miejscu.
    const mouseAim = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const pointerMoved = this.lastPointer !== null && (this.lastPointer.x !== pointer.x || this.lastPointer.y !== pointer.y);
    this.lastPointer = { x: pointer.x, y: pointer.y };

    const mouseShoot = pointer.rightButtonDown() || this.shootClickQueued;
    this.shootClickQueued = false;
    const mouseAttack = pointer.leftButtonDown();
    const keyboardMove = this.getMovementIntent();

    const pad = this.pad.read(readPadSnapshot());
    if (pointerMoved || mouseAttack || mouseShoot) this.padAiming = false;
    // Każde użycie pada oddaje mu celowanie — także gra samą lewą gałką (cel idzie wtedy za ruchem).
    if (pad && (pad.aim || pad.move.x !== 0 || pad.move.y !== 0 || pad.attack || pad.shoot || pad.dash)) this.padAiming = true;
    let aim: Vector2 = { x: mouseAim.x, y: mouseAim.y };
    if (pad && this.padAiming) {
      this.padAim = padAimDirection(pad.aim, pad.move, this.padAim);
      const distance = GAMEPAD_CONFIG.aimDistancePx;
      aim = { x: origin.x + this.padAim.x * distance, y: origin.y + this.padAim.y * distance };
    }

    return {
      move: pad ? combineMovement(keyboardMove, pad.move) : keyboardMove,
      aim,
      attack: mouseAttack || (pad?.attack ?? false),
      dash: Phaser.Input.Keyboard.JustDown(this.dashKey) || (pad?.dash ?? false),
      shoot: mouseShoot || (pad?.shoot ?? false),
      interact: Phaser.Input.Keyboard.JustDown(this.interactKey) || (pad?.interact ?? false),
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
