export interface PixelScaleInput {
  /** Rozmiar obszaru strony na grę (px CSS). */
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** Rozdzielczość logiczna płótna gry. */
  readonly gameWidth: number;
  readonly gameHeight: number;
  /** window.devicePixelRatio (skalowanie systemu, np. 1,25 w Windows). */
  readonly devicePixelRatio: number;
  /** Zoom kamery: ile pikseli płótna zajmuje jeden piksel świata. */
  readonly cameraZoom: number;
  /**
   * Telefon (krok 49d): skala ułamkowa — płótno wypełnia ekran. Przy 2–3 pikselach urządzenia na piksel CSS
   * nierówność pikseli świata jest praktycznie niewidoczna, a zysk miejsca duży.
   */
  readonly fractional?: boolean;
}

/**
 * Skala CSS płótna, przy której jeden piksel świata (sprite'y, kafle) to całkowita liczba pikseli
 * ekranu: cameraZoom × skala × devicePixelRatio = n, gdzie n jest największą liczbą całkowitą,
 * przy której płótno mieści się w oknie. Zwykłe dopasowanie (FIT) dawałoby piksele nierównej
 * szerokości (STYLEGUIDE §2: tylko całkowite krotności). Wyjątek: telefony (`fractional`, krok 49d).
 */
export function pixelPerfectScale(input: PixelScaleInput): number {
  const fit = Math.min(input.viewportWidth / input.gameWidth, input.viewportHeight / input.gameHeight);
  if (input.fractional) return fit;
  const devicePixelsPerWorldPixel = Math.max(1, Math.floor(input.cameraZoom * input.devicePixelRatio * fit + 1e-9));
  return devicePixelsPerWorldPixel / (input.cameraZoom * input.devicePixelRatio);
}
