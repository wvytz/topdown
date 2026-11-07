// Własny kursor myszy nad grą (krok 172; obrazki z generatora tools/cursor_sprites.py).
// Sam CSS: przeglądarka rysuje kursor jak systemowy, więc gra nic nie liczy ani nie rysuje co klatkę.
// Tylko wersja PC (main.ts) — telefon nie ma kursora. Okienka DOM (czat z autorem, ekran Safari) zostają przy kursorach systemu.

const CURSOR_FILES = { normal: 'assets/cursor/crosshair.png', hiDpi: 'assets/cursor/crosshair@2x.png' } as const;
/** Gorący punkt w pikselach CSS — środek celownika 32x32. */
const HOTSPOT = 16;
/** Gdy obrazek się nie wczyta, przeglądarka pokaże zwykły celownik. */
const FALLBACK = 'crosshair';

export const gameCursorCss = (base: string): string => {
  const normal = `url('${base}${CURSOR_FILES.normal}')`;
  const hiDpi = `url('${base}${CURSOR_FILES.hiDpi}')`;
  // Dwie deklaracje: przeglądarka bez image-set() odrzuci drugą i zostanie przy pierwszej.
  // !important wygrywa z „rączką” Phasera (useHandCursor), którą Phaser wpisuje w styl płótna nad przyciskami.
  return [
    '#game canvas {',
    `  cursor: ${normal} ${HOTSPOT} ${HOTSPOT}, ${FALLBACK} !important;`,
    `  cursor: image-set(${normal} 1x, ${hiDpi} 2x) ${HOTSPOT} ${HOTSPOT}, ${FALLBACK} !important;`,
    '}',
  ].join('\n');
};

export const installGameCursor = (doc: Document = document): void => {
  const style = doc.createElement('style');
  style.dataset.gameCursor = '';
  style.textContent = gameCursorCss(import.meta.env.BASE_URL);
  doc.head.appendChild(style);
};
