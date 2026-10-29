import type { GateWaitConfig } from '@/systems/GateWait';

/**
 * Wrogowie za kratami (krok 132, pomysł właściciela): gdy kraty zasadzki albo areny opadną, wróg spoza pokoju
 * podchodzi pod kratę i czeka — nie atakuje przez pręty. Po podniesieniu krat rusza na ułamek sekundy szybciej
 * („nabuzowany i wygłodniały”).
 */
export const GATE_WAIT_CONFIG: GateWaitConfig = {
  // Miejsce czekania: środek kafla kraty przesunięty o tyle kafli na zewnątrz — wróg staje tuż przy prętach.
  postOffsetTiles: 0.85,
  // Bliżej niż tyle px od miejsca czekania — stoi.
  arrivalPx: 3,
  surge: { durationMs: 450, speedMultiplier: 1.8 },
};
