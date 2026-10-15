import type Phaser from 'phaser';
import type { AmbientProfile } from '@/config/lightingConfig';
import type { PointLight } from '@/effects/LightingOverlay';
import { actorVisibility } from '@/systems/lighting';

/** Klucz danych sprite'a z jego widocznością w świetle — cień postaci (GroundShadow) bierze z niego alfę. */
export const LIGHT_VISIBILITY_KEY = 'lightVisibility';

export interface EnemyVisibilityDeps {
  readonly profile: AmbientProfile;
  readonly revealStrength: number;
  /** Światła odsłaniające wrogów poza bohaterem (latarnie w mgle); w „Mroku” pusto. */
  readonly lights: () => readonly PointLight[];
  readonly player: { readonly x: number; readonly y: number };
  /** Wrogowie do ukrywania w tej klatce. */
  readonly actors: () => Iterable<Phaser.GameObjects.Sprite>;
}

/**
 * Ograniczony widok („Mrok”, mgła Grzybni; krok 30): wrogowie pokazują się dopiero w świetle. Co klatkę
 * alfa każdego wroga = jego widoczność z czystej krzywej (`actorVisibility`). Pociski, czerwone strefy
 * ataków i boss zostają widoczne (decyzja właściciela).
 */
export class EnemyVisibility {
  constructor(private readonly deps: EnemyVisibilityDeps) {}

  update(): void {
    const { profile, revealStrength, player } = this.deps;
    const lights = this.deps.lights();
    for (const actor of this.deps.actors()) {
      const visibility = actorVisibility(actor, player, profile, lights, revealStrength);
      actor.setAlpha(visibility).setData(LIGHT_VISIBILITY_KEY, visibility);
    }
  }
}
