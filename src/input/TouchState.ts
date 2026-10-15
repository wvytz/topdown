import type { MovementIntent, Vector2 } from '@/core/types';

/**
 * Stan sterowania dotykowego (krok 49): TouchScene go zapisuje, InputController czyta raz na klatkę.
 * Jednorazowe wciśnięcia (dash, interakcja) czekają w kolejce do odczytu, żeby krótki dotyk nie zginął.
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
  private dashQueued = false;
  private interactQueued = false;
  private shotQueued = false;

  queueDash(): void {
    this.dashQueued = true;
  }

  /** Krótkie stuknięcie przycisku strzału — jeden strzał. */
  queueShot(): void {
    this.shotQueued = true;
  }

  queueInteract(): void {
    this.interactQueued = true;
  }

  /** Zwraca i czyści jednorazowe wciśnięcia. */
  consumeTaps(): { readonly dash: boolean; readonly interact: boolean; readonly shot: boolean } {
    const taps = { dash: this.dashQueued, interact: this.interactQueued, shot: this.shotQueued };
    this.dashQueued = false;
    this.interactQueued = false;
    this.shotQueued = false;
    return taps;
  }

  /** Puszczenie wszystkiego (np. pauza na wybór nagrody, śmierć) — postać nie idzie dalej sama. */
  release(): void {
    this.move = { x: 0, y: 0 };
    this.aim = null;
    this.shoot = false;
    this.shotAim = null;
    this.dashQueued = false;
    this.interactQueued = false;
    this.shotQueued = false;
  }
}

/** Jeden stan na grę: gałki żyją w osobnej scenie nad grą i HUD-em. */
export const touchState = new TouchState();
