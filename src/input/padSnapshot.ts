import type { PadSnapshot } from '@/systems/gamepadInput';

/**
 * Migawka pierwszego podłączonego pada (krok 95) prosto z Gamepad API przeglądarki — bez wtyczki pada Phasera,
 * której stan żyje osobno w każdej scenie. Przeglądarka pokazuje pad dopiero po pierwszym wciśnięciu przycisku.
 */
export function readPadSnapshot(): PadSnapshot | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
  for (const pad of navigator.getGamepads()) {
    if (!pad || !pad.connected) continue;
    return { buttons: pad.buttons.map((button) => button.value), axes: pad.axes };
  }
  return null;
}
