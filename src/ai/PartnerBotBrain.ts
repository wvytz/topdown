import type { HeroKit } from '@/core/heroTypes';
import type { MovementIntent, Vector2 } from '@/core/types';
import type { BotKitTactics, PartnerBotConfig } from '@/config/partnerBotConfig';

/**
 * Mózg bota-partnera (krok 146, ukryty tryb `?bot=1`) — czysta logika, bez Phasera.
 * Co klatkę dostaje obraz świata (bot, gracz, cele) i zwraca te same akcje, które daje gracz z pada,
 * więc bohater bota walczy według tych samych zasad co człowiek.
 *
 * Priorytety: 1) powalony gracz — idź do niego i stój przy nim (wskrzeszanie); 2) gracz za daleko — wracaj;
 * 3) wróg w zasięgu przy graczu — walcz taktyką broni; 4) spokój — trzymaj się blisko gracza.
 * Gdy bot utknie albo zostanie daleko w tyle, prosi scenę o teleport obok gracza.
 */

/** Cel bota: wróg albo boss (środek i promień ciała). */
export interface BotTarget {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface BotWorld {
  readonly now: number;
  readonly self: {
    readonly x: number;
    readonly y: number;
    readonly kit: HeroKit['kind'];
    /** Bot leży powalony — nic nie robi. */
    readonly downed: boolean;
    /** Ładunki ataku dodatkowego (PPM). */
    readonly charges: number;
    /** Pasek mocy pełny i ultimate nie trwa. */
    readonly ultimateReady: boolean;
  };
  readonly leader: { readonly x: number; readonly y: number; readonly downed: boolean };
  readonly targets: readonly BotTarget[];
  /** Czy bot widzi punkt po prostej (mury zasłaniają). */
  readonly canSee: (from: Vector2, to: Vector2) => boolean;
  /** Najbliższy punkt drogi do celu po kaflach; null — brak drogi. */
  readonly navigate: (from: Vector2, to: Vector2) => Vector2 | null;
}

/** Akcje bohatera — ten sam kształt co `PlayerActions` gracza. */
export interface BotActions {
  readonly move: MovementIntent;
  readonly aim: Vector2;
  readonly attack: boolean;
  readonly dash: boolean;
  readonly shoot: boolean;
  readonly interact: boolean;
  readonly ultimate: boolean;
}

/** Co bot akurat robi — do diagnostyki i testów. */
export type BotMode = 'downed' | 'revive' | 'regroup' | 'fight' | 'follow';

export interface BotDecision {
  readonly actions: BotActions;
  readonly mode: BotMode;
  /** Prośba o teleport obok gracza (utknięcie albo zostanie w tyle); null — bez teleportu. */
  readonly warp: Vector2 | null;
}

const ZERO: MovementIntent = { x: 0, y: 0 };
const dist = (a: Vector2, b: Vector2): number => Math.hypot(a.x - b.x, a.y - b.y);

function towards(from: Vector2, to: Vector2): MovementIntent {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length < 1 ? ZERO : { x: dx / length, y: dy / length };
}

export class PartnerBotBrain {
  private lastDashAt = Number.NEGATIVE_INFINITY;
  /** Od kiedy bot jest dalej od gracza niż `warpDistancePx`; null — jest blisko. */
  private farSince: number | null = null;
  /** Punkt kontrolny utknięcia: gdzie bot był, gdy zaczął chcieć iść. */
  private stuckProbe: { readonly at: Vector2; readonly since: number } | null = null;
  /** Droga liczona co `repathMs`, żeby BFS nie szedł co klatkę. */
  private route: { readonly goal: Vector2; readonly waypoint: Vector2 | null; readonly at: number } | null = null;
  private lastAim: Vector2 | null = null;

  constructor(private readonly config: PartnerBotConfig) {}

  decide(world: BotWorld): BotDecision {
    const { self, leader, now } = world;
    const here: Vector2 = { x: self.x, y: self.y };
    if (self.downed) {
      this.reset();
      return { actions: this.idle(here), mode: 'downed', warp: null };
    }

    const leaderAt: Vector2 = { x: leader.x, y: leader.y };
    const toLeader = dist(here, leaderAt);
    const tactics: BotKitTactics = this.config.tactics[self.kit];
    const target = this.pickTarget(world, here, leaderAt);

    let mode: BotMode;
    let move: MovementIntent = ZERO;
    let attack = false;
    let shoot = false;
    let dash = false;
    let aim: Vector2 = this.lastAim ?? leaderAt;

    if (leader.downed) {
      mode = 'revive';
      if (toLeader > this.config.reviveStandPx) move = this.walk(world, here, leaderAt);
    } else if (toLeader > this.config.followMaxPx) {
      mode = 'regroup';
      move = this.walk(world, here, leaderAt);
      dash = toLeader > this.config.catchUpDashPx && world.canSee(here, leaderAt) && this.dashReady(now);
    } else if (target) {
      mode = 'fight';
      const gap = dist(here, target) - target.radius;
      if (gap > tactics.preferredRangePx) move = this.walk(world, here, target);
      else if (gap < tactics.retreatBelowPx) move = towards(target, here);
      dash = tactics.panicDashPx > 0 && gap < tactics.panicDashPx && this.dashReady(now);
    } else {
      mode = 'follow';
      if (toLeader > this.config.followIdlePx) move = this.walk(world, here, leaderAt);
    }

    // Bot strzela i bije zawsze, gdy ma cel w zasięgu — także wracając do gracza i stojąc przy powalonym.
    if (target) {
      const gap = dist(here, target) - target.radius;
      aim = { x: target.x, y: target.y };
      attack = gap <= tactics.attackRangePx;
      shoot = tactics.shootRangePx > 0 && self.charges > 0 && gap <= tactics.shootRangePx && gap > tactics.attackRangePx * 0.5;
    } else if (move !== ZERO) {
      aim = { x: here.x + move.x * 64, y: here.y + move.y * 64 };
    }
    // Odskok: dash w kierunku ruchu (od celu), doganianie: do gracza.
    if (dash && move === ZERO) dash = false;
    if (dash) this.lastDashAt = now;
    this.lastAim = aim;

    const ultimate = self.ultimateReady && target !== null && this.ultimateWorthIt(world, here, tactics);
    const warp = this.warpCheck(now, here, leaderAt, toLeader, move !== ZERO);
    return { actions: { move, aim, attack, dash, shoot, interact: false, ultimate }, mode, warp };
  }

  /** Najbliższy widoczny cel w zasięgu bota i blisko gracza. */
  private pickTarget(world: BotWorld, here: Vector2, leaderAt: Vector2): BotTarget | null {
    let best: BotTarget | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const target of world.targets) {
      const d = dist(here, target) - target.radius;
      if (d > this.config.engageRangePx || d >= bestDistance) continue;
      if (dist(leaderAt, target) - target.radius > this.config.engageLeaderRangePx) continue;
      if (!world.canSee(here, target)) continue;
      best = target;
      bestDistance = d;
    }
    return best;
  }

  private ultimateWorthIt(world: BotWorld, here: Vector2, tactics: BotKitTactics): boolean {
    const crowd = world.targets.filter((t) => dist(here, t) <= this.config.ultimateCrowdPx).length;
    if (crowd >= this.config.ultimateCrowd) return true;
    return world.targets.some((t) => t.radius >= this.config.ultimateBossRadiusPx && dist(here, t) - t.radius <= tactics.attackRangePx);
  }

  /** Kierunek ruchu do punktu po drodze z kafli (przeliczanej co `repathMs` albo po zmianie celu). */
  private walk(world: BotWorld, here: Vector2, goal: Vector2): MovementIntent {
    const route = this.route;
    const fresh = route && world.now - route.at < this.config.repathMs && dist(route.goal, goal) < 16;
    let waypoint = fresh ? route.waypoint : world.navigate(here, goal);
    if (!fresh) this.route = { goal, waypoint, at: world.now };
    // Doszedł do punktu drogi przed przeliczeniem — bierzemy następny od razu.
    if (waypoint && dist(here, waypoint) < 4 && dist(waypoint, goal) > 4) {
      waypoint = world.navigate(here, goal);
      this.route = { goal, waypoint, at: world.now };
    }
    return towards(here, waypoint ?? goal);
  }

  private dashReady(now: number): boolean {
    return now - this.lastDashAt >= this.config.dashCooldownMs;
  }

  /** Teleport obok gracza, gdy bot długo jest daleko albo chce iść, a stoi w miejscu. */
  private warpCheck(now: number, here: Vector2, leaderAt: Vector2, toLeader: number, moving: boolean): Vector2 | null {
    this.farSince = toLeader > this.config.warpDistancePx ? (this.farSince ?? now) : null;
    if (!moving) this.stuckProbe = null;
    else if (!this.stuckProbe || dist(here, this.stuckProbe.at) > this.config.stuckMovePx) this.stuckProbe = { at: here, since: now };
    const lagging = this.farSince !== null && now - this.farSince >= this.config.warpAfterMs;
    const stuck = this.stuckProbe !== null && now - this.stuckProbe.since >= this.config.stuckMs && toLeader > this.config.followIdlePx;
    if (!lagging && !stuck) return null;
    this.reset();
    return leaderAt;
  }

  private idle(here: Vector2): BotActions {
    return { move: ZERO, aim: this.lastAim ?? here, attack: false, dash: false, shoot: false, interact: false, ultimate: false };
  }

  private reset(): void {
    this.farSince = null;
    this.stuckProbe = null;
    this.route = null;
  }
}
