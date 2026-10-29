import type { Vector2, BossHudData } from '@/core/types';
import { deriveSeed } from '@/core/random';
import { TILE_SIZE } from '@/config/gameConfig';
import type { BossFightDeps } from '@/combat/BossFight';
import { BossFight } from '@/combat/BossFight';
import { arenaCenter } from '@/dungeon/stairs';
import type { BossDuetDefinition } from '@/systems/BossDuet';
import { duetStatus, pushApart, shouldPartnerArrive } from '@/systems/BossDuet';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import type { BeamStrike, OrbSplash } from '@/systems/Sorcery';
import type { DashSweep } from '@/systems/DashStrike';
import type { PlayerShot } from '@/systems/ShotResolver';
import type { Spiderling } from '@/entities/Spiderling';

const DUET_SEED_SALT = 0xd0e7;

type Attacker = Vector2 & { readonly isDead: boolean; readonly radius: number };

/**
 * Walka na arenie: jeden boss albo duet (krok 114) — dwie niezależne walki na tej samej arenie.
 * Scena widzi jedną walkę: trwa, gdy walczy którykolwiek, wygrana — gdy padną obaj; łup i nagroda po ostatnim.
 */
export class BossEncounter {
  private readonly fights: BossFight[];
  private readonly duet: BossDuetDefinition | null;

  constructor(deps: BossFightDeps, duet: BossDuetDefinition | null) {
    this.duet = duet;
    if (!duet) {
      this.fights = [new BossFight(deps)];
      return;
    }
    let remaining = 2;
    // Łup, kraty i nagroda dopiero po drugim bossie — w miejscu jego śmierci.
    const onDefeated = (position: Vector2): void => {
      remaining -= 1;
      if (remaining === 0) deps.onDefeated(position);
    };
    const offset = duet.spawnOffsetTiles * TILE_SIZE;
    const hpMultiplier = (deps.bossHpMultiplier ?? 1) * duet.hpMultiplier;
    const { spawnHelper, ...partnerDeps } = deps;
    // Bezpieczny start (krok 131): gospodarz omija miejsce partnera, partner — miejsce, na którym stanął gospodarz.
    // Partner wchodzący windą startuje poza areną, więc gospodarz go nie omija.
    const center = arenaCenter(deps.floor.rooms[deps.floor.bossRoomId]!);
    const partnerSpot = { x: center.x * TILE_SIZE + offset, y: center.y * TILE_SIZE };
    const host = new BossFight({
      ...deps,
      onDefeated,
      bossHpMultiplier: hpMultiplier,
      spawnOffset: { x: -offset, y: 0 },
      ...(!duet.arrival && { spawnAvoid: partnerSpot }),
    });
    this.fights = [
      host,
      new BossFight({
        ...partnerDeps,
        ...(!duet.arrival && { spawnAvoid: host.spawnPoint }),
        ...(duet.partnerRetinue && spawnHelper ? { spawnHelper } : {}),
        onDefeated,
        bossHpMultiplier: hpMultiplier,
        bossId: duet.partner,
        spawnOffset: { x: offset, y: 0 },
        seed: deriveSeed(deps.floor.seed, DUET_SEED_SALT),
        ...(duet.arrival && { arrival: duet.arrival }),
      }),
    ];
  }

  /** Napis areny w HUD: imię bossa albo nazwa duetu (duet z wejściem partnera nie zdradza go zawczasu). */
  get name(): string {
    if (this.duet?.arrival) return this.fights[0]!.bossName;
    return this.duet?.name ?? this.fights[0]!.bossName;
  }

  get isFighting(): boolean {
    return this.fights.some((fight) => fight.isFighting);
  }

  get isDefeated(): boolean {
    return this.fights.every((fight) => fight.isDefeated);
  }

  /** Boss nie zginął, tylko uciekł windą (blond sprzątaczka, krok 125) — napis nad kartami nagrody. */
  get escaped(): boolean {
    return this.fights.some((fight) => fight.escaped);
  }

  getStatus(): BossHudData | null {
    const [first] = this.fights;
    if (!this.duet) return first!.getStatus();
    // Partner, który jeszcze nie wszedł (krok 126): pasek gospodarza, dopóki nie wyjdzie z windy.
    if (this.fights.some((fight) => fight.isDormant)) return first!.getStatus();
    const members = this.fights.map((fight) => {
      const status = fight.getStatus();
      return {
        hp: fight.hp,
        maxHp: fight.maxHp,
        fighting: status !== null,
        defeated: fight.isDefeated,
        enraged: status?.enraged ?? false,
        enragedLabel: status?.enragedLabel ?? '',
      };
    });
    return duetStatus(members, this.duet);
  }

  update(now: number): void {
    this.callPartner(now);
    for (const fight of this.fights) fight.update(now);
    this.separate();
  }

  /** Duet z wejściem (krok 126): przy progu HP gospodarza partner wychodzi z windy. */
  private callPartner(now: number): void {
    const arrival = this.duet?.arrival;
    const [host, partner] = this.fights;
    if (!arrival || !host || !partner?.isDormant) return;
    const hostState = { hp: host.hp, maxHp: host.maxHp, fighting: host.isFighting, defeated: host.isDefeated || host.hp <= 0 };
    if (shouldPartnerArrive(hostState, arrival)) partner.arrive(now);
  }

  /** Bossowie duetu nie stoją jeden w drugim (pajęczy skok przelatuje nad partnerem, rozpychają się po lądowaniu). */
  private separate(): void {
    const [first, second] = this.fights;
    const a = first?.grounded;
    const b = second?.grounded;
    if (!this.duet || !a || !b) return;
    const push = pushApart(a, b, a.radius + b.radius + this.duet.bodyGapPx);
    if (!push) return;
    first!.nudge(push.a);
    second!.nudge(push.b);
  }

  get minions(): readonly Spiderling[] {
    return this.fights.flatMap((fight) => fight.minions);
  }

  get aimTargets(): BossFight['aimTargets'] {
    return this.fights.flatMap((fight) => fight.aimTargets);
  }

  resolvePlayerMelee(swing: MeleeSwing, attacker?: Attacker): number {
    return this.fights.reduce((sum, fight) => sum + fight.resolvePlayerMelee(swing, attacker), 0);
  }

  resolvePlayerBeam(beam: BeamStrike, attacker?: Attacker): number {
    return this.fights.reduce((sum, fight) => sum + fight.resolvePlayerBeam(beam, attacker), 0);
  }

  resolveSplash(splash: OrbSplash, attacker?: Attacker): void {
    for (const fight of this.fights) fight.resolveSplash(splash, attacker);
  }

  resolveDashSweep(sweep: DashSweep, alreadyHit: Set<object>, attacker?: Attacker): void {
    for (const fight of this.fights) fight.resolveDashSweep(sweep, alreadyHit, attacker);
  }

  /** Pocisk trafia pierwszy cel — bliższego z bossów duetu (jego pajączki i świta liczą się razem z nim). */
  resolvePlayerShot(shot: PlayerShot, attacker?: Attacker): ReturnType<BossFight['resolvePlayerShot']> {
    for (const fight of this.fightsNearestTo(shot.position)) {
      const target = fight.resolvePlayerShot(shot, attacker);
      if (target) return target;
    }
    return null;
  }

  debugDefeat(): void {
    for (const fight of this.fights) fight.debugDefeat();
  }

  private fightsNearestTo(point: Vector2): BossFight[] {
    if (this.fights.length === 1) return this.fights;
    const distance = (fight: BossFight): number => {
      const at = fight.position;
      return at ? Math.hypot(at.x - point.x, at.y - point.y) : Infinity;
    };
    return [...this.fights].sort((a, b) => distance(a) - distance(b));
  }
}
