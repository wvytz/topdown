import type { PadSnapshot } from '@/systems/gamepadInput';
import { ButtonEdges } from '@/systems/gamepadInput';
import { GAMEPAD_CONFIG } from '@/config/gamepadConfig';

/**
 * Urządzenia graczy w lokalnym co-opie (etap C1) — czysta logika, bez Phasera.
 *
 * Solo: jeden gracz steruje wszystkim naraz — klawiaturą, myszą i pierwszym padem (jak od kroku 95).
 * Co-op: każde urządzenie należy do jednego gracza. Klawiatura i mysz to jedno urządzenie (celowanie myszą),
 * każdy pad to osobne urządzenie. Gracze dołączają kolejno, wciskając przycisk na swoim urządzeniu.
 */

/** Urządzenie wejścia: klawiatura z myszą albo pad o danym indeksie z Gamepad API. */
export type InputDevice = { readonly kind: 'keyboardMouse' } | { readonly kind: 'pad'; readonly index: number };

export const KEYBOARD_MOUSE: InputDevice = { kind: 'keyboardMouse' };

export const padDevice = (index: number): InputDevice => ({ kind: 'pad', index });

/** Z czego czyta sterowanie jednego bohatera. `pad: 'any'` — pierwszy podłączony pad (tylko solo). */
export interface PlayerDevices {
  readonly keyboard: boolean;
  readonly mouse: boolean;
  readonly pad: number | 'any' | null;
}

/** Gra solo: klawiatura, mysz i pierwszy pad naraz — zachowanie sprzed co-opu. */
export const SOLO_DEVICES: PlayerDevices = { keyboard: true, mouse: true, pad: 'any' };

/** Co-op bez ekranu dołączania (tryb testowy `?coop=`): P1 — klawiatura z myszą, P2 — pierwszy pad. */
export const DEFAULT_COOP_DEVICES: readonly PlayerDevices[] = [
  { keyboard: true, mouse: true, pad: null },
  { keyboard: false, mouse: false, pad: 'any' },
];

export function sameDevice(a: InputDevice, b: InputDevice): boolean {
  if (a.kind === 'keyboardMouse' || b.kind === 'keyboardMouse') return a.kind === b.kind;
  return a.index === b.index;
}

/** Sterowanie bohatera z jednego urządzenia w co-opie. */
export function devicesFor(device: InputDevice): PlayerDevices {
  return device.kind === 'keyboardMouse'
    ? { keyboard: true, mouse: true, pad: null }
    : { keyboard: false, mouse: false, pad: device.index };
}

export type JoinEvent =
  | { readonly kind: 'joined'; readonly slot: number; readonly device: InputDevice }
  | { readonly kind: 'left'; readonly slot: number; readonly device: InputDevice };

/**
 * Dołączanie graczy przed startem co-opu: pierwsze wciśnięcie zajmuje miejsce P1, wciśnięcie na innym
 * urządzeniu — P2. Urządzenie zajęte drugi raz nic nie robi. Wyjście zwalnia miejsce; P2 przesuwa się
 * wtedy na P1, żeby drużyna nie miała dziury.
 */
export class CoopRoster {
  private seats: InputDevice[] = [];

  constructor(private readonly maxPlayers: number) {}

  get devices(): readonly InputDevice[] {
    return this.seats;
  }

  get count(): number {
    return this.seats.length;
  }

  get isFull(): boolean {
    return this.seats.length >= this.maxPlayers;
  }

  /** Numer miejsca (0 = P1) zajętego przez to urządzenie albo -1. */
  slotOf(device: InputDevice): number {
    return this.seats.findIndex((seat) => sameDevice(seat, device));
  }

  join(device: InputDevice): JoinEvent | null {
    if (this.isFull || this.slotOf(device) >= 0) return null;
    this.seats = [...this.seats, device];
    return { kind: 'joined', slot: this.seats.length - 1, device };
  }

  leave(device: InputDevice): JoinEvent | null {
    const slot = this.slotOf(device);
    if (slot < 0) return null;
    this.seats = this.seats.filter((_, i) => i !== slot);
    return { kind: 'left', slot, device };
  }

  /** Sterowanie każdego bohatera, w kolejności miejsc. */
  playerDevices(): PlayerDevices[] {
    return this.seats.map(devicesFor);
  }
}

/** Prośba o dołączenie albo wyjście z drużyny z danego urządzenia. */
export interface JoinRequest {
  readonly action: 'join' | 'leave';
  readonly device: InputDevice;
}

/** Wejście ekranu dołączania w jednej klatce: wszystkie pady i zbocza klawiszy. */
export interface JoinFrame {
  readonly pads: readonly { readonly index: number; readonly snapshot: PadSnapshot }[];
  readonly keyboardJoin: boolean;
  readonly keyboardLeave: boolean;
}

/**
 * Zbocza przycisków dołączania na każdym padzie osobno. Przycisk trzymany przy wejściu na ekran (albo przy
 * podłączeniu pada) liczy się dopiero po puszczeniu — jak w menu.
 */
export class CoopJoinReader {
  private readonly edges = new Map<number, ButtonEdges>();

  constructor(private readonly buttons: { readonly join: readonly number[]; readonly leave: readonly number[] }) {}

  read(frame: JoinFrame): JoinRequest[] {
    const requests: JoinRequest[] = [];
    if (frame.keyboardJoin) requests.push({ action: 'join', device: KEYBOARD_MOUSE });
    if (frame.keyboardLeave) requests.push({ action: 'leave', device: KEYBOARD_MOUSE });
    const seen = new Set<number>();
    for (const { index, snapshot } of frame.pads) {
      seen.add(index);
      const edges = this.edges.get(index) ?? new ButtonEdges();
      this.edges.set(index, edges);
      const fresh = edges.update(snapshot.buttons.map((value) => value >= GAMEPAD_CONFIG.pressThreshold));
      if (this.buttons.join.some((b) => fresh.has(b))) requests.push({ action: 'join', device: padDevice(index) });
      if (this.buttons.leave.some((b) => fresh.has(b))) requests.push({ action: 'leave', device: padDevice(index) });
    }
    // Odłączony pad zaczyna po powrocie od zapamiętania stanu.
    for (const index of [...this.edges.keys()]) if (!seen.has(index)) this.edges.delete(index);
    return requests;
  }
}

/** Stosuje prośby do drużyny; zwraca zdarzenia, które naprawdę coś zmieniły. */
export function applyJoinRequests(roster: CoopRoster, requests: readonly JoinRequest[]): JoinEvent[] {
  const events: JoinEvent[] = [];
  for (const request of requests) {
    const event = request.action === 'join' ? roster.join(request.device) : roster.leave(request.device);
    if (event) events.push(event);
  }
  return events;
}
