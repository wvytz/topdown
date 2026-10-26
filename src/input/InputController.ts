import Phaser from 'phaser';
import type { MovementIntent, Vector2 } from '@/core/types';
import type { PlayerActions } from '@/entities/Player';
import { GAMEPAD_CONFIG } from '@/config/gamepadConfig';
import { PadAimTracker, PadGameplayReader, combineMovement } from '@/systems/gamepadInput';
import { readPadSnapshot, readPadSnapshotAt } from '@/input/padSnapshot';
import type { PlayerDevices } from '@/systems/coopDevices';
import { SOLO_DEVICES } from '@/systems/coopDevices';
import type { PlayerInput, PlayerInputContext } from '@/input/playerInput';

interface MovementKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

interface KeyBindings {
  readonly wasd: MovementKeys;
  readonly arrows: MovementKeys;
  readonly dash: Phaser.Input.Keyboard.Key;
  readonly interact: Phaser.Input.Keyboard.Key;
  readonly ultimate: Phaser.Input.Keyboard.Key;
}

/**
 * Tłumaczy surowe wejście (klawiatura + mysz, od kroku 95 także pad) na abstrakcyjne PlayerActions.
 * Encje nie znają klawiszy — kolejne źródło (dotyk, drugi gracz w co-op) to kolejny tłumacz na te same akcje.
 *
 * Przyciski i ruch z obu źródeł się sumują. Celowanie bierze ostatnio używane urządzenie: ruch lub klik myszy
 * oddaje cel myszy, użycie pada — padowi.
 */
export interface InputControllerOptions {
  /**
   * Mysz celuje i atakuje (domyślnie tak). Wersja mobilna ją wyłącza: przeglądarka telefonu udaje po dotyku
   * kliknięcia myszy, a dotyk obsługuje osobno (`src/mobile/`).
   */
  readonly mouse?: boolean;
  /**
   * Urządzenia tego bohatera (co-op, etap C1). Domyślnie solo: klawiatura, mysz i pierwszy pad naraz.
   * W co-opie gracz z padem nie czyta klawiatury ani myszy, a gracz z klawiaturą — żadnego pada.
   */
  readonly devices?: PlayerDevices;
}

export class InputController implements PlayerInput {
  /** Klawisze — null, gdy ten bohater nie gra na klawiaturze (pad w co-opie). */
  private readonly keys: KeyBindings | null;
  private readonly padIndex: number | 'any' | null;
  /** Kliknięcie PPM zapamiętane do najbliższej klatki — krótki klik nie może zginąć. */
  private shootClickQueued = false;
  private readonly pad = new PadGameplayReader();
  /** Celuje pad (do ruchu myszy). */
  private padAiming = false;
  /** Kierunek celowania z pada: gałka, samo celowanie przy ataku albo kierunek ruchu (krok 114). */
  private readonly padAim = new PadAimTracker();
  private lastPointer: Vector2 | null = null;
  private readonly mouse: boolean;

  constructor(
    private readonly scene: Phaser.Scene,
    options: InputControllerOptions = {},
  ) {
    const devices = options.devices ?? SOLO_DEVICES;
    this.mouse = (options.mouse ?? true) && devices.mouse;
    this.padIndex = devices.pad;
    this.keys = devices.keyboard ? InputController.bindKeys(scene) : null;

    // PPM = strzał; wyłączamy menu kontekstowe przeglądarki.
    scene.input.mouse?.disableContextMenu();
    if (!this.mouse) return;
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) this.shootClickQueued = true;
    });
  }

  private static bindKeys(scene: Phaser.Scene): KeyBindings {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('InputController: klawiatura niedostępna w tej scenie.');
    const K = Phaser.Input.Keyboard.KeyCodes;
    return {
      wasd: { up: keyboard.addKey(K.W), down: keyboard.addKey(K.S), left: keyboard.addKey(K.A), right: keyboard.addKey(K.D) },
      arrows: { up: keyboard.addKey(K.UP), down: keyboard.addKey(K.DOWN), left: keyboard.addKey(K.LEFT), right: keyboard.addKey(K.RIGHT) },
      dash: keyboard.addKey(K.SPACE),
      interact: keyboard.addKey(K.E),
      ultimate: keyboard.addKey(K.R),
    };
  }

  /** Pad tego bohatera: pierwszy podłączony (solo), wskazany (co-op) albo żaden. */
  private readPad(): ReturnType<typeof readPadSnapshot> {
    if (this.padIndex === null) return null;
    return this.padIndex === 'any' ? readPadSnapshot() : readPadSnapshotAt(this.padIndex);
  }

  /**
   * Wywoływać raz na klatkę — „zjada” jednorazowe wciśnięcia (dash, klik PPM).
   * `origin` to pozycja bohatera: pad podaje kierunek, a akcje — punkt celowania w świecie.
   */
  getActions({ origin, targets }: PlayerInputContext): PlayerActions {
    const pointer = this.scene.input.activePointer;
    // Przeliczamy co klatkę: kamera się przesuwa, nawet gdy mysz stoi w miejscu.
    const mouseAim = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const pointerMoved = this.mouse && this.lastPointer !== null && (this.lastPointer.x !== pointer.x || this.lastPointer.y !== pointer.y);
    this.lastPointer = { x: pointer.x, y: pointer.y };

    const mouseShoot = this.mouse && (pointer.rightButtonDown() || this.shootClickQueued);
    this.shootClickQueued = false;
    const mouseAttack = this.mouse && pointer.leftButtonDown();
    const keyboardMove = this.getMovementIntent();

    const pad = this.pad.read(this.readPad());
    if (pointerMoved || mouseAttack || mouseShoot) this.padAiming = false;
    // Każde użycie pada oddaje mu celowanie — także gra samą lewą gałką (cel idzie wtedy za ruchem).
    if (pad && (pad.aim || pad.move.x !== 0 || pad.move.y !== 0 || pad.attack || pad.shoot || pad.dash)) this.padAiming = true;
    let aim: Vector2 = { x: mouseAim.x, y: mouseAim.y };
    if (!this.mouse || (pad && this.padAiming)) {
      const direction = pad
        ? this.padAim.update({ stick: pad.aim, move: pad.move, attacking: pad.attack || pad.shoot, origin, targets: targets(), now: this.scene.time.now })
        : this.padAim.current;
      const distance = GAMEPAD_CONFIG.aimDistancePx;
      aim = { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance };
    }

    return {
      move: pad ? combineMovement(keyboardMove, pad.move) : keyboardMove,
      aim,
      attack: mouseAttack || (pad?.attack ?? false),
      dash: this.justDown('dash') || (pad?.dash ?? false),
      shoot: mouseShoot || (pad?.shoot ?? false),
      interact: this.justDown('interact') || (pad?.interact ?? false),
      ultimate: this.justDown('ultimate') || (pad?.ultimate ?? false),
    };
  }

  private justDown(key: 'dash' | 'interact' | 'ultimate'): boolean {
    return this.keys !== null && Phaser.Input.Keyboard.JustDown(this.keys[key]);
  }

  private getMovementIntent(): MovementIntent {
    const keys = this.keys;
    if (!keys) return { x: 0, y: 0 };
    const pressed = (dir: keyof MovementKeys): boolean => keys.wasd[dir].isDown || keys.arrows[dir].isDown;

    return {
      x: Number(pressed('right')) - Number(pressed('left')),
      y: Number(pressed('down')) - Number(pressed('up')),
    };
  }
}
