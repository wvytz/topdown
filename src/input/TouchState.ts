import type { MovementIntent, Vector2 } from '@/core/types';

/** Jednorazowe wciśnięcia z dotyku, odczytywane raz na klatkę. */
export interface TouchTaps {
  readonly dash: boolean;
  readonly interact: boolean;
  /** Stuknięcie przycisku strzału — jeden strzał. */
  readonly shot: boolean;
  /** Stuknięcie strefy ataku — jeden cios (u Czarodziejki kula). */
  readonly attack: boolean;
  /** Stuknięcie celuje samo w najbliższego wroga (jak w Brawl Stars, krok 49c). */
  readonly autoAim: boolean;
}

const NO_TAPS = { dash: false, interact: false, shot: false, attack: false };

/**
 * Stan sterowania dotykowego (krok 49): TouchScene go zapisuje, InputController czyta raz na klatkę.
 * Jednorazowe wciśnięcia (dash, interakcja, stuknięcia) czekają w kolejce do odczytu, żeby krótki dotyk nie zginął.
 */
export class TouchState {
  /** Gracz dotknął ekranu — od tej chwili widać gałki i przyciski. */
  engaged = false;
  move: MovementIntent = { x: 0, y: 0 };
  /** Kierunek gałki celowania (wektor jednostkowy); null, gdy kciuk nie celuje. */
  aim: Vector2 | null = null;
  /** Przycisk strzału/promienia przytrzymany — salwa barbarzyńcy albo promień Czarodziejki. */
  shoot = false;
  /** Kierunek przeciągnięcia przycisku strzału (gałka strzału); null — strzał w bieżącym kierunku. */
  shotAim: Vector2 | null = null;
  /** Ostatnie użycie dotyku (performance.now) — rozstrzyga, które urządzenie celuje. */
  lastUsedAt = -Infinity;
  private queued = { ...NO_TAPS };

  queueDash(): void {
    this.queued.dash = true;
  }

  queueInteract(): void {
    this.queued.interact = true;
  }

  /** Stuknięcie przycisku strzału: jeden strzał w najbliższego wroga. */
  queueShot(): void {
    this.queued.shot = true;
  }

  /** Stuknięcie strefy ataku: jeden cios w najbliższego wroga. */
  queueAttack(): void {
    this.queued.attack = true;
  }

  /** Zwraca i czyści jednorazowe wciśnięcia. */
  consumeTaps(): TouchTaps {
    const { dash, interact, shot, attack } = this.queued;
    this.queued = { ...NO_TAPS };
    return { dash, interact, shot, attack, autoAim: shot || attack };
  }

  /** Puszczenie wszystkiego (np. pauza na wybór nagrody, śmierć) — postać nie idzie dalej sama. */
  release(): void {
    this.move = { x: 0, y: 0 };
    this.aim = null;
    this.shoot = false;
    this.shotAim = null;
    this.queued = { ...NO_TAPS };
  }
}

/** Jeden stan na grę: gałki żyją w osobnej scenie nad grą i HUD-em. */
export const touchState = new TouchState();
