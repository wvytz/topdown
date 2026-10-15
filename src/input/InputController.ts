import Phaser from 'phaser';
import type { MovementIntent, Vector2 } from '@/core/types';
import type { AimSource } from '@/config/inputConfig';
import { AIM_POINT_DISTANCE } from '@/config/inputConfig';
import type { PlayerActions } from '@/entities/Player';
import { keyboardAimDirection } from '@/systems/Aim';
import { directionTo } from '@/systems/CombatMath';
import { touchState } from '@/input/TouchState';

interface MovementKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

/** Przeglądarki po dotyku potrafią dorzucić udawane zdarzenia myszy — przez tę chwilę ich nie słuchamy. */
const MOUSE_AFTER_TOUCH_GRACE_MS = 1000;

/**
 * Tłumaczy surowe wejście na abstrakcyjne PlayerActions. Trzy sposoby gry (krok 49):
 * - mysz: WASD + celowanie kursorem, LPM/PPM;
 * - sama klawiatura: WASD/strzałki, J — atak, K — strzał/promień, L lub Shift — trzymaj kierunek;
 * - dotyk: gałki i przyciski z TouchScene (touchState).
 * Celuje to urządzenie, którego gracz użył ostatnio; encje nie znają klawiszy.
 */
export class InputController {
  private readonly wasd: MovementKeys;
  private readonly arrows: MovementKeys;
  private readonly dashKey: Phaser.Input.Keyboard.Key;
  private readonly interactKey: Phaser.Input.Keyboard.Key;
  private readonly attackKey: Phaser.Input.Keyboard.Key;
  private readonly shootKey: Phaser.Input.Keyboard.Key;
  private readonly lockKeys: readonly Phaser.Input.Keyboard.Key[];
  /** Kliknięcie PPM zapamiętane do najbliższej klatki — krótki klik nie może zginąć. */
  private shootClickQueued = false;
  private mouseUsedAt = -Infinity;
  private keyboardAimUsedAt = -Infinity;
  /** Ostatni kierunek celowania (klawiatura, dotyk); przy przejściu z myszy — kierunek do kursora. */
  private lastAim: Vector2 = { x: 1, y: 0 };

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
    this.attackKey = keyboard.addKey(K.J);
    this.shootKey = keyboard.addKey(K.K);
    this.lockKeys = [keyboard.addKey(K.L), keyboard.addKey(K.SHIFT)];
    for (const key of [this.attackKey, this.shootKey, ...this.lockKeys]) {
      key.on('down', () => (this.keyboardAimUsedAt = performance.now()));
    }

    // PPM = strzał; wyłączamy menu kontekstowe przeglądarki.
    scene.input.mouse?.disableContextMenu();
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (!this.isMouse(pointer)) return;
      this.mouseUsedAt = performance.now();
      if (pointer.rightButtonDown()) this.shootClickQueued = true;
    });
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (this.isMouse(pointer)) this.mouseUsedAt = performance.now();
    });
  }

  /**
   * Wywoływać raz na klatkę — „zjada” jednorazowe wciśnięcia (dash, klik PPM, przyciski dotykowe).
   * @param origin pozycja gracza: od niej liczymy punkt celowania klawiatury i dotyku
   */
  getActions(origin: Vector2): PlayerActions {
    const source = this.aimSource();
    const keyboardMove = this.getMovementIntent();
    const touchMove = touchState.move;
    const move = touchMove.x !== 0 || touchMove.y !== 0 ? touchMove : keyboardMove;
    const taps = touchState.consumeTaps();
    const mouse = this.scene.input.mousePointer;

    const keyboardShoot = this.shootKey.isDown;
    const mouseShoot = Boolean(mouse?.rightButtonDown()) || this.shootClickQueued;
    this.shootClickQueued = false;

    const attack = Boolean(mouse?.leftButtonDown()) || this.attackKey.isDown || touchState.aim !== null;
    const shoot = mouseShoot || keyboardShoot || touchState.shoot;

    return {
      move,
      aim: this.aimPoint(source, origin, move),
      aimSource: source,
      attack,
      dash: Phaser.Input.Keyboard.JustDown(this.dashKey) || taps.dash,
      shoot,
      interact: Phaser.Input.Keyboard.JustDown(this.interactKey) || taps.interact,
    };
  }

  /** Celuje urządzenie użyte ostatnio (na starcie — mysz). */
  private aimSource(): AimSource {
    const touchAt = touchState.lastUsedAt;
    if (touchAt >= this.mouseUsedAt && touchAt >= this.keyboardAimUsedAt && touchAt > -Infinity) return 'touch';
    return this.keyboardAimUsedAt > this.mouseUsedAt ? 'keyboard' : 'mouse';
  }

  private aimPoint(source: AimSource, origin: Vector2, move: MovementIntent): Vector2 {
    if (source === 'mouse') {
      const pointer = this.scene.input.mousePointer ?? this.scene.input.activePointer;
      // Przeliczamy co klatkę: kamera się przesuwa, nawet gdy mysz stoi w miejscu.
      const point = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const toCursor = directionTo(origin, point);
      if (toCursor.x !== 0 || toCursor.y !== 0) this.lastAim = toCursor;
      return { x: point.x, y: point.y };
    }
    if (source === 'touch' && touchState.aim) {
      this.lastAim = touchState.aim;
    } else {
      // Klawiatura (i dotyk bez gałki celowania): celujemy tam, dokąd idziemy; L/Shift trzyma kierunek.
      const locked = source === 'keyboard' && this.lockKeys.some((key) => key.isDown);
      this.lastAim = keyboardAimDirection(move, locked, this.lastAim);
    }
    return { x: origin.x + this.lastAim.x * AIM_POINT_DISTANCE, y: origin.y + this.lastAim.y * AIM_POINT_DISTANCE };
  }

  private isMouse(pointer: Phaser.Input.Pointer): boolean {
    return !pointer.wasTouch && performance.now() - touchState.lastUsedAt > MOUSE_AFTER_TOUCH_GRACE_MS;
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
