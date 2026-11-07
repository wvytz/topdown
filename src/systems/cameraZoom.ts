/**
 * Próbny zoom kamery z adresu (krok 167, uwaga testera: „za blisko kamera, trochę klaustrofobiczne”; decyzja
 * właściciela: najpierw przełącznik testowy). `?zoom=1.6` oddala kamerę; poza zakresem albo bez parametru — zoom
 * domyślny 2,0 (krok 18). Czysta logika.
 */
export interface ZoomOverrideConfig {
  readonly param: string;
  readonly min: number;
  readonly max: number;
}

/** Flaga z adresu: `?nazwa=1` (albo `true`) — próby właściciela (krok 167: `?heavy=1`). */
export function flagFromSearch(search: string, param: string): boolean {
  const raw = new URLSearchParams(search).get(param);
  return raw === '1' || raw === 'true';
}

export function zoomFromSearch(search: string, fallback: number, config: ZoomOverrideConfig): number {
  const raw = new URLSearchParams(search).get(config.param);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) && value >= config.min && value <= config.max ? value : fallback;
}
