import type { Vector2 } from '@/core/types';
import type { Player } from '@/entities/Player';
import { isPartyDown, livingMembers, nearestLivingMember, targetMember } from '@/systems/Party';

/**
 * Bohaterowie na piętrze (co-op, etap C0). Menedżerowie walki pytają drużynę, a nie jednego gracza:
 * zagrożenia ranią każdego żywego, wrogowie celują w najbliższego. Solo = drużyna z jednym bohaterem.
 */
export class Party {
  constructor(readonly members: readonly Player[]) {
    if (members.length === 0) throw new Error('Drużyna bez bohaterów');
  }

  /** Pierwszy gracz (P1): kamera, HUD i zdarzenia, które w co-opie dostaną własne zasady w kolejnych etapach. */
  get leader(): Player {
    return this.members[0] as Player;
  }

  get living(): Player[] {
    return livingMembers(this.members);
  }

  get isDown(): boolean {
    return isPartyDown(this.members);
  }

  /** Najbliższy żywy bohater albo null, gdy nikt nie żyje. */
  nearestLiving(from: Vector2): Player | null {
    return nearestLivingMember(this.members, from);
  }

  /** Cel wroga: najbliższy żywy, a gdy nikt nie żyje — pierwszy gracz. */
  targetFor(from: Vector2): Player {
    return targetMember(this.members, from);
  }

  /** Pozycja celu wroga (kopia, by wróg nie trzymał referencji do bohatera). */
  targetPointFor(from: Vector2): Vector2 {
    const target = this.targetFor(from);
    return { x: target.x, y: target.y };
  }
}
