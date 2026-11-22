/**
 * Blokada celu łucznika (krok U12d, uwaga właściciela po teście na telefonie: „dużo strzał leci w zupełnie losowych
 * kierunkach; po trafieniu bossa albo elity każdy kolejny strzał powinien lecieć w niego”).
 * Trafienie bossa (ranga 2) albo elity (ranga 1) strzałą łucznika zakłada blokadę: kolejne strzały podstawowe lecą
 * w ten cel, aż zginie, oddali się poza `releaseRange` albo (rangą wyżej) trafiony zostanie boss.
 */
export const ARROW_LOCK = {
  /** Dalej niż tyle (px świata) od bohatera blokada się zwalnia — strzała i tak by nie doleciała (ok. 310 px). */
  releaseRange: 380,
  /**
   * Celowanie ręczne (mysz, pad, przeciągnięcie na dotyku): strzała leci w cel tylko wtedy, gdy celownik jest
   * w tym stożku (°, półkąt; do tego kąt, pod jakim widać promień celu). Celowanie dalej od celu przejmuje gracz,
   * a blokada czeka (nie jest zwalniana) — odwołanie ręczne bez dotykania przycisków.
   */
  manualConeDeg: 45,
  /** Pierścień znacznika blokady wokół celu: dodatek do promienia (px), grubość i barwa (jasny bursztyn jak strzały). */
  marker: { padding: 5, thickness: 2, color: 0xffe08a, alpha: 0.85 },
} as const;
