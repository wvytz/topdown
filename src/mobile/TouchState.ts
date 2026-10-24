import type { MovementIntent, Vector2 } from '@/core/types';

/** Jednorazowe wciśnięcia z dotyku, odczytywane raz na klatkę. */
export interface TouchTaps {
  readonly dash: boolean;
  readonly interact: boolean;
  /** Stuknięcie przycisku strzału — jeden strzał. */
  readonly shot: boolean;
  /** Stuknięcie strefy ataku — jeden cios (u Czarodziejki kula, u łucznika krótki strzał). */
  readonly attack: boolean;
}

const NO_TAPS: TouchTaps = { dash: false, interact: false, shot: false, attack: false };

/**
 * Stan sterowania dotykowego (krok 96): TouchScene go zapisuje, TouchInput czyta raz na klatkę.
 * Jednorazowe wciśnięcia (dash, interakcja, stuknięcia) czekają w kolejce do odczytu, żeby krótki dotyk nie zginął.
 */
export class TouchState {
  /** Gracz dotknął ekranu — od tej chwili widać gałki i przyciski. */
  engaged = false;
  move: MovementIntent = { x: 0, y: 0 };
  /** Kierunek gałki ataku (wektor jednostkowy); null, gdy kciuk nie celuje. */
  aim: Vector2 | null = null;
  /** Przycisk strzału przytrzymany — salwa, promień Czarodziejki albo salwa łucznika. */
  shoot = false;
  /** Kierunek przeciągnięcia przycisku strzału (gałka strzału); null — strzał celuje sam. */
  shotAim: Vector2 | null = null;
  private queued: TouchTaps = NO_TAPS;

  queueDash(): void {
    this.queued = { ...this.queued, dash: true };
  }

  queueInteract(): void {
    this.queued = { ...this.queued, interact: true };
  }

  /** Stuknięcie przycisku strzału: jeden strzał w najbliższego wroga. */
  queueShot(): void {
    this.queued = { ...this.queued, shot: true };
  }

  /** Stuknięcie strefy ataku: jeden cios w najbliższego wroga. */
  queueAttack(): void {
    this.queued = { ...this.queued, attack: true };
  }

  /** Zwraca i czyści jednorazowe wciśnięcia. */
  consumeTaps(): TouchTaps {
    const taps = this.queued;
    this.queued = NO_TAPS;
    return taps;
  }

  /** Puszczenie wszystkiego (pauza, nagroda, śmierć) — postać nie idzie dalej sama. */
  release(): void {
    this.move = { x: 0, y: 0 };
    this.aim = null;
    this.shoot = false;
    this.shotAim = null;
    this.queued = NO_TAPS;
  }
}

/** Jeden stan na grę: gałki żyją w osobnej scenie nad grą i HUD-em. */
export const touchState = new TouchState();
