import type { Vector2 } from '@/core/types';

export interface SoundSpaceConfig {
  /** Do tej odległości od środka widoku (px świata) dźwięk gra pełną głośnością. */
  readonly fullVolumeRadius: number;
  /** Od tej odległości dźwięk jest wyciszony do `minGain`. */
  readonly fadeRadius: number;
  readonly minGain: number;
  /** Odległość w poziomie (px), przy której dźwięk jest całkiem w jednym głośniku. */
  readonly panWidth: number;
  /** Najmocniejsze przesunięcie w stereo (0..1) — nigdy całkiem w jednym uchu. */
  readonly maxPan: number;
}

export interface SpatialMix {
  /** −1 lewo … 1 prawo. */
  readonly pan: number;
  readonly gain: number;
}

/**
 * Położenie dźwięku względem środka widoku (krok 116): to, co dzieje się z boku, słychać z boku,
 * a dalekie zdarzenia (poza kadrem) ciszej. Słuchacz to środek kamery — w co-opie punkt między bohaterami.
 */
export function spatialize(at: Vector2, listener: Vector2, config: SoundSpaceConfig): SpatialMix {
  const dx = at.x - listener.x;
  const distance = Math.hypot(dx, at.y - listener.y);
  const pan = Math.max(-config.maxPan, Math.min(config.maxPan, (dx / config.panWidth) * config.maxPan));
  if (distance <= config.fullVolumeRadius) return { pan, gain: 1 };
  const fade = Math.min(1, (distance - config.fullVolumeRadius) / Math.max(1, config.fadeRadius - config.fullVolumeRadius));
  return { pan, gain: 1 - fade * (1 - config.minGain) };
}
