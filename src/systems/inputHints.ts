import type { DeviceText, HintDevice } from '@/config/inputHintConfig';
import type { PadSnapshot } from '@/systems/gamepadInput';

/**
 * Podpowiedzi zależne od urządzenia (krok U9c) — czysta logika: które urządzenie gracz właśnie trzyma
 * i jaki napis mu pokazać. Telefon zawsze gra dotykiem, PC — klawiaturą z myszą, dopóki nie ruszy pada.
 */

/** Czy pad coś w tej chwili robi (przycisk albo gałka powyżej progu). */
export function padActive(snapshot: PadSnapshot | null, threshold: number): boolean {
  if (!snapshot) return false;
  return snapshot.buttons.some((value) => value >= threshold) || snapshot.axes.some((value) => Math.abs(value) >= threshold);
}

/** Urządzenie podpowiedzi: telefon — dotyk, PC — ostatnio użyte (klawiatura z myszą albo pad). */
export function hintDevice(mobile: boolean, lastUsed: Exclude<HintDevice, 'touch'>): HintDevice {
  return mobile ? 'touch' : lastUsed;
}

export const hintFor = (text: DeviceText, device: HintDevice): string => text[device];
