import type { InputDevice } from '@/systems/coopDevices';
import { devicesFor, sameDevice } from '@/systems/coopDevices';
import type { PlayerDevices } from '@/systems/coopDevices';

/**
 * Ekran co-opu (etap C5): gracze dołączają swoim urządzeniem, każdy wybiera bohatera i potwierdza gotowość.
 * Bohaterowie muszą być różni (decyzja właściciela) — wybór przeskakuje bohatera partnera. Czysta logika.
 */
export interface LobbySeat {
  readonly device: InputDevice;
  /** Indeks bohatera w kolejności ekranu wyboru. */
  readonly hero: number;
  readonly ready: boolean;
}

export class CoopLobby {
  private seats: LobbySeat[] = [];

  constructor(
    private readonly heroCount: number,
    private readonly maxPlayers: number,
  ) {}

  get all(): readonly LobbySeat[] {
    return this.seats;
  }

  slotOf(device: InputDevice): number {
    return this.seats.findIndex((seat) => sameDevice(seat.device, device));
  }

  /** Dołącza urządzenie; bohater — `preferred`, a gdy zajęty, następny wolny. Zwraca numer miejsca albo -1. */
  join(device: InputDevice, preferred = 0): number {
    if (this.seats.length >= this.maxPlayers || this.slotOf(device) >= 0) return -1;
    const hero = this.freeHero(preferred, 1, -1);
    if (hero < 0) return -1;
    this.seats = [...this.seats, { device, hero, ready: false }];
    return this.seats.length - 1;
  }

  /** Zmiana bohatera o `delta` (±1) z zawijaniem, z pominięciem bohatera partnera; gotowy gracz nie zmienia. */
  move(slot: number, delta: number): void {
    const seat = this.seats[slot];
    if (!seat || seat.ready) return;
    const hero = this.freeHero(seat.hero + delta, delta, slot);
    if (hero >= 0) this.update(slot, { hero });
  }

  /** Potwierdzenie: gracz jest gotowy. */
  confirm(slot: number): void {
    const seat = this.seats[slot];
    if (seat && !seat.ready) this.update(slot, { ready: true });
  }

  /**
   * Wstecz: gotowy wraca do wyboru, niegotowy wychodzi (P2 przesuwa się na P1).
   * Zwraca 'left', gdy miejsce się zwolniło, 'unready' albo null.
   */
  back(slot: number): 'left' | 'unready' | null {
    const seat = this.seats[slot];
    if (!seat) return null;
    if (seat.ready) {
      this.update(slot, { ready: false });
      return 'unready';
    }
    this.seats = this.seats.filter((_, i) => i !== slot);
    return 'left';
  }

  /** Start, gdy jest komplet i wszyscy gotowi. */
  get canStart(): boolean {
    return this.seats.length === this.maxPlayers && this.seats.every((seat) => seat.ready);
  }

  playerDevices(): PlayerDevices[] {
    return this.seats.map((seat) => devicesFor(seat.device));
  }

  private update(slot: number, change: Partial<LobbySeat>): void {
    this.seats = this.seats.map((seat, i) => (i === slot ? { ...seat, ...change } : seat));
  }

  /** Pierwszy bohater od `start` w kierunku `step`, którego nie ma inny gracz niż `self`; brak — -1. */
  private freeHero(start: number, step: number, self: number): number {
    const n = this.heroCount;
    const dir = step < 0 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const hero = (((start + i * dir) % n) + n) % n;
      if (!this.seats.some((seat, s) => s !== self && seat.hero === hero)) return hero;
    }
    return -1;
  }
}
