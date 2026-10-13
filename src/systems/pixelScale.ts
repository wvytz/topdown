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
}

/**
 * Skala CSS płótna, przy której jeden piksel świata (sprite'y, kafle) to całkowita liczba pikseli
 * ekranu: cameraZoom × skala × devicePixelRatio = n, gdzie n jest największą liczbą całkowitą,
 * przy której płótno mieści się w oknie. Zwykłe dopasowanie (FIT) dawałoby piksele nierównej
 * szerokości (STYLEGUIDE §2: tylko całkowite krotności).
 */
export function pixelPerfectScale(input: PixelScaleInput): number {
  const fit = Math.min(input.viewportWidth / input.gameWidth, input.viewportHeight / input.gameHeight);
  const devicePixelsPerWorldPixel = Math.max(1, Math.floor(input.cameraZoom * input.devicePixelRatio * fit + 1e-9));
  return devicePixelsPerWorldPixel / (input.cameraZoom * input.devicePixelRatio);
}
