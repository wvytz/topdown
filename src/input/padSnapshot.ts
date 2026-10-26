import type { PadSnapshot } from '@/systems/gamepadInput';

const snapshotOf = (pad: Gamepad): PadSnapshot => ({ buttons: pad.buttons.map((button) => button.value), axes: pad.axes });

function connectedPads(): Gamepad[] {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
  return navigator.getGamepads().filter((pad): pad is Gamepad => pad !== null && pad.connected);
}

/**
 * Migawka pierwszego podłączonego pada (krok 95) prosto z Gamepad API przeglądarki — bez wtyczki pada Phasera,
 * której stan żyje osobno w każdej scenie. Przeglądarka pokazuje pad dopiero po pierwszym wciśnięciu przycisku.
 */
export function readPadSnapshot(): PadSnapshot | null {
  const pad = connectedPads()[0];
  return pad ? snapshotOf(pad) : null;
}

/** Migawka pada o danym indeksie Gamepad API (co-op, etap C1: każdy gracz ma swój pad); odłączony — null. */
export function readPadSnapshotAt(index: number): PadSnapshot | null {
  const pad = connectedPads().find((p) => p.index === index);
  return pad ? snapshotOf(pad) : null;
}

/** Migawki wszystkich podłączonych padów z ich indeksami — do dołączania graczy. */
export function readAllPadSnapshots(): { readonly index: number; readonly snapshot: PadSnapshot }[] {
  return connectedPads().map((pad) => ({ index: pad.index, snapshot: snapshotOf(pad) }));
}
