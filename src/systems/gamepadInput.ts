import type { Vector2 } from '@/core/types';
import { GAMEPAD_CONFIG, PAD_AXIS, PAD_BUTTON } from '@/config/gamepadConfig';
import { assistAimDirection, autoAimDirection, type AimTarget } from '@/systems/touchAim';

/**
 * Pad (krok 95) — czysta logika: martwe strefy, zbocza przycisków, kierunek celowania i komendy menu.
 * Warstwa Phasera (`input/`) podaje tylko migawkę stanu pada w danej klatce.
 */

/** Stan pada w jednej klatce: wartości przycisków (0..1) i osi (-1..1) w standardowym układzie. */
export interface PadSnapshot {
  readonly buttons: readonly number[];
  readonly axes: readonly number[];
}

/** Akcje pada w grze — scena składa je z myszą i klawiaturą w `PlayerActions`. */
export interface PadGameplayInput {
  /** Ruch z lewej gałki albo krzyżaka (długość 0..1). */
  readonly move: Vector2;
  /** Kierunek prawej gałki (jednostkowy); null — gałka w martwej strefie. */
  readonly aim: Vector2 | null;
  readonly attack: boolean;
  readonly shoot: boolean;
  /** Jednorazowe: przycisk wciśnięty w tej klatce. */
  readonly dash: boolean;
  readonly interact: boolean;
  /** Jednorazowe: ultimate (krok 98). */
  readonly ultimate: boolean;
}

/** Komendy ekranów poza walką (menu, wybór bohatera, pauza, nagroda, śmierć) — wspólne dla klawiatury i pada. */
export enum MenuCommand {
  Up = 'up',
  Down = 'down',
  Left = 'left',
  Right = 'right',
  Confirm = 'confirm',
  Back = 'back',
  /** Akcja dodatkowa ekranu (menu: usuń slot; śmierć: zmień bohatera). */
  Alt = 'alt',
  /** Tylko pad (Start) — klawiatura ma własne klawisze pauzy. */
  Pause = 'pause',
}

const ZERO: Vector2 = { x: 0, y: 0 };

/** Gałka z martwą strefą promieniową: wychylenie poza strefą przeskalowane do 0..1, żeby ruch zaczynał się płynnie. */
export function stickVector(x: number, y: number, deadzone: number): Vector2 {
  const length = Math.hypot(x, y);
  if (length <= deadzone) return ZERO;
  const scaled = Math.min(1, (length - deadzone) / (1 - deadzone));
  return { x: (x / length) * scaled, y: (y / length) * scaled };
}

/** Czy którykolwiek z przycisków jest wciśnięty (spusty są analogowe, stąd próg). */
export function anyPressed(snapshot: PadSnapshot, buttons: readonly number[], threshold = GAMEPAD_CONFIG.pressThreshold): boolean {
  return buttons.some((index) => (snapshot.buttons[index] ?? 0) >= threshold);
}

const axis = (snapshot: PadSnapshot, index: number): number => snapshot.axes[index] ?? 0;

/**
 * Zbocza przycisków: które zostały wciśnięte od poprzedniej klatki.
 * Pierwsze wywołanie tylko zapamiętuje stan — przycisk trzymany przy wejściu na ekran (np. A z wyboru bohatera,
 * spust z walki przy nagrodzie) liczy się dopiero po puszczeniu i ponownym wciśnięciu.
 */
export class ButtonEdges {
  private previous: readonly boolean[] | null = null;

  update(pressed: readonly boolean[]): ReadonlySet<number> {
    const before = this.previous;
    this.previous = pressed;
    const edges = new Set<number>();
    if (!before) return edges;
    pressed.forEach((down, index) => {
      if (down && !before[index]) edges.add(index);
    });
    return edges;
  }

  /** Pad odłączony — po powrocie znów zaczynamy od zapamiętania stanu. */
  reset(): void {
    this.previous = null;
  }
}

const pressedList = (snapshot: PadSnapshot): boolean[] => snapshot.buttons.map((value) => value >= GAMEPAD_CONFIG.pressThreshold);

/** Tłumaczy migawki pada na akcje w grze (ruch, cel, ataki, jednorazowy dash i interakcja). */
export class PadGameplayReader {
  private readonly edges = new ButtonEdges();

  read(snapshot: PadSnapshot | null): PadGameplayInput | null {
    if (!snapshot) {
      this.edges.reset();
      return null;
    }
    const fresh = this.edges.update(pressedList(snapshot));
    const { actions, moveDeadzone, aimDeadzone } = GAMEPAD_CONFIG;
    const stick = stickVector(axis(snapshot, PAD_AXIS.leftX), axis(snapshot, PAD_AXIS.leftY), moveDeadzone);
    const dpad = {
      x: Number(anyPressed(snapshot, [PAD_BUTTON.Right])) - Number(anyPressed(snapshot, [PAD_BUTTON.Left])),
      y: Number(anyPressed(snapshot, [PAD_BUTTON.Down])) - Number(anyPressed(snapshot, [PAD_BUTTON.Up])),
    };
    const right = stickVector(axis(snapshot, PAD_AXIS.rightX), axis(snapshot, PAD_AXIS.rightY), aimDeadzone);
    const rightLength = Math.hypot(right.x, right.y);
    return {
      move: dpad.x !== 0 || dpad.y !== 0 ? dpad : stick,
      aim: rightLength > 0 ? { x: right.x / rightLength, y: right.y / rightLength } : null,
      attack: anyPressed(snapshot, actions.attack),
      shoot: anyPressed(snapshot, actions.shoot),
      dash: actions.dash.some((index) => fresh.has(index)),
      interact: actions.interact.some((index) => fresh.has(index)),
      ultimate: actions.ultimate.some((index) => fresh.has(index)),
    };
  }
}

/** Co tracker celowania pada dostaje w każdej klatce. */
export interface PadAimInput {
  /** Kierunek prawej gałki (jednostkowy) albo null. */
  readonly stick: Vector2 | null;
  readonly move: Vector2;
  /** Trzymany atak (LPM lub PPM) — wtedy bez prawej gałki celowanie samo szuka wroga. */
  readonly attacking: boolean;
  readonly origin: Vector2;
  readonly targets: Iterable<AimTarget>;
  readonly now: number;
}

/**
 * Kierunek celowania z pada (krok 114):
 * - prawa gałka — ręcznie, z lekkim dociąganiem do wroga w wąskim stożku;
 * - chwilę po puszczeniu gałki — dalej jej kierunek (szybkie pstryknięcie nie ucieka w stronę ruchu);
 * - atak bez gałki — sam celuje: wróg w szerokim stożku przed bohaterem, a gdy tam pusto — najbliższy w zasięgu;
 * - poza tym — kierunek ruchu, a gdy bohater stoi — ostatni kierunek.
 */
export class PadAimTracker {
  private direction: Vector2 = { x: 1, y: 0 };
  private stickAt = Number.NEGATIVE_INFINITY;

  get current(): Vector2 {
    return this.direction;
  }

  update({ stick, move, attacking, origin, targets, now }: PadAimInput): Vector2 {
    const { stickAssist, autoAimCone, autoAimRange, stickHoldMs } = GAMEPAD_CONFIG.aim;
    if (stick) {
      this.stickAt = now;
      this.direction = assistAimDirection(origin, stick, targets, stickAssist);
      return this.direction;
    }
    if (now - this.stickAt < stickHoldMs) return this.direction;
    const length = Math.hypot(move.x, move.y);
    const facing = length > 0 ? { x: move.x / length, y: move.y / length } : this.direction;
    if (attacking) {
      const list = [...targets];
      const cone = assistAimDirection(origin, facing, list, autoAimCone);
      this.direction = cone !== facing ? cone : (autoAimDirection(origin, list, autoAimRange) ?? facing);
      return this.direction;
    }
    this.direction = facing;
    return this.direction;
  }
}

/** Wspólny ruch z klawiatury i pada: suma, każda oś ograniczona do -1..1. */
export function combineMovement(a: Vector2, b: Vector2): Vector2 {
  const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
  return { x: clamp(a.x + b.x), y: clamp(a.y + b.y) };
}

/**
 * Klawisz (`KeyboardEvent.key`) → komenda menu. Klawisze specyficzne dla ekranu (cyfry, Tab, R/C/M) obsługują sceny same.
 * Spacja nic nie zatwierdza (krok 129, uwaga testera): to dash, więc wciśnięta w biegu przy otwarciu pauzy czy menu
 * wybierała opcję — gracz stracił tak zapis gry.
 */
export function menuCommandFromKey(key: string): MenuCommand | null {
  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      return MenuCommand.Up;
    case 'ArrowDown':
    case 's':
    case 'S':
      return MenuCommand.Down;
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return MenuCommand.Left;
    case 'ArrowRight':
    case 'd':
    case 'D':
      return MenuCommand.Right;
    case 'Enter':
      return MenuCommand.Confirm;
    case 'Escape':
    case 'Backspace':
      return MenuCommand.Back;
    case 'x':
    case 'X':
    case 'Delete':
      return MenuCommand.Alt;
    default:
      return null;
  }
}

type Direction = MenuCommand.Up | MenuCommand.Down | MenuCommand.Left | MenuCommand.Right;

/** Kierunek z krzyżaka (pierwszeństwo) albo z lewej gałki wychylonej poza próg — przeważająca oś. */
function heldDirection(snapshot: PadSnapshot): Direction | null {
  if (anyPressed(snapshot, [PAD_BUTTON.Up])) return MenuCommand.Up;
  if (anyPressed(snapshot, [PAD_BUTTON.Down])) return MenuCommand.Down;
  if (anyPressed(snapshot, [PAD_BUTTON.Left])) return MenuCommand.Left;
  if (anyPressed(snapshot, [PAD_BUTTON.Right])) return MenuCommand.Right;
  const x = axis(snapshot, PAD_AXIS.leftX);
  const y = axis(snapshot, PAD_AXIS.leftY);
  if (Math.max(Math.abs(x), Math.abs(y)) < GAMEPAD_CONFIG.menu.stickThreshold) return null;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? MenuCommand.Right : MenuCommand.Left;
  return y > 0 ? MenuCommand.Down : MenuCommand.Up;
}

/**
 * Pad w menu: przyciski (A, B, Y, Start) jako zbocza, kierunek z krzyżaka lub gałki z powtarzaniem przy przytrzymaniu.
 * Kierunek trzymany przy wejściu na ekran nie działa, dopóki gracz go nie puści.
 */
export class PadMenuReader {
  private readonly edges = new ButtonEdges();
  private direction: Direction | null = null;
  private nextRepeatAt = Number.POSITIVE_INFINITY;
  private primed = false;

  read(snapshot: PadSnapshot | null, now: number): MenuCommand[] {
    if (!snapshot) {
      this.edges.reset();
      this.primed = false;
      return [];
    }
    const commands: MenuCommand[] = [];
    const held = heldDirection(snapshot);
    const { repeatDelayMs, repeatIntervalMs } = GAMEPAD_CONFIG.menu;
    if (!this.primed) {
      this.primed = true;
      this.direction = held;
      this.nextRepeatAt = Number.POSITIVE_INFINITY;
    } else if (held !== this.direction) {
      this.direction = held;
      if (held) {
        commands.push(held);
        this.nextRepeatAt = now + repeatDelayMs;
      }
    } else if (held && now >= this.nextRepeatAt) {
      commands.push(held);
      this.nextRepeatAt = now + repeatIntervalMs;
    }

    const fresh = this.edges.update(pressedList(snapshot));
    const { confirm, back, alt, pause } = GAMEPAD_CONFIG.menu;
    const buttons: readonly (readonly [readonly number[], MenuCommand])[] = [
      [confirm, MenuCommand.Confirm],
      [back, MenuCommand.Back],
      [alt, MenuCommand.Alt],
      [pause, MenuCommand.Pause],
    ];
    for (const [indices, command] of buttons) {
      if (indices.some((index) => fresh.has(index))) commands.push(command);
    }
    return commands;
  }
}
