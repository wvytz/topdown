/**
 * Flagi prób właściciela z adresu (krok 167: `?heavy=1`). Próbny `?zoom=1.6` z kroku 167 usunięty w kroku U1
 * (ustalenie 5 upgradu: zoom zostaje 2,0). Czysta logika.
 */

/** Flaga z adresu: `?nazwa=1` (albo `true`). */
export function flagFromSearch(search: string, param: string): boolean {
  const raw = new URLSearchParams(search).get(param);
  return raw === '1' || raw === 'true';
}
