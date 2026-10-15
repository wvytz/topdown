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
  /** Przycisk strzału przytrzymany (barbarzyńca) albo promień włączony (Czarodziejka). */
  shoot = false;
  /** Ostatnie użycie dotyku (performance.now) — rozstrzyga, które urządzenie celuje. */
  lastUsedAt = -Infinity;
  private dashQueued = false;
  private interactQueued = false;

  queueDash(): void {
    this.dashQueued = true;
  }

  queueInteract(): void {
    this.interactQueued = true;
  }

  /** Zwraca i czyści jednorazowe wciśnięcia. */
  consumeTaps(): { readonly dash: boolean; readonly interact: boolean } {
    const taps = { dash: this.dashQueued, interact: this.interactQueued };
    this.dashQueued = false;
    this.interactQueued = false;
    return taps;
  }

  /** Puszczenie wszystkiego (np. pauza na wybór nagrody, śmierć) — postać nie idzie dalej sama. */
  release(): void {
    this.move = { x: 0, y: 0 };
    this.aim = null;
    this.shoot = false;
    this.dashQueued = false;
    this.interactQueued = false;
  }
}

/** Jeden stan na grę: gałki żyją w osobnej scenie nad grą i HUD-em. */
export const touchState = new TouchState();
