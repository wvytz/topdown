import Phaser from 'phaser';
import type { HeroId } from '@/core/heroTypes';
import type { ItemId } from '@/core/lootTypes';
import type { FloorModifierEffects } from '@/core/floorModifierTypes';
import type { Vector2 } from '@/core/types';
import { HERO_DEFINITIONS } from '@/config/heroConfig';
import { ITEM_DEFINITIONS, ITEM_EFFECTS, STAT_LIMITS } from '@/config/lootConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { ARCHER_ARROW_VISUAL, SORCERESS_ORB_VISUAL, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import type { PlayerShotManager, ShotLook } from '@/combat/PlayerShotManager';
import { UltimateManager } from '@/combat/UltimateManager';
import { LoopCue, SoundCue, sound } from '@/audio/SoundBoard';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { Player, PlayerActions } from '@/entities/Player';
import { arrowSpec, volleyDirections } from '@/systems/Archery';
import type { DashSweep } from '@/systems/DashStrike';
import { facingDirection } from '@/systems/Facing';
import { applyFloorToLoadout } from '@/systems/FloorModifiers';
import { HealBudget } from '@/systems/HealBudget';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import type { PlayerLoadout } from '@/systems/PlayerLoadout';
import { computeHeroLoadout } from '@/systems/PlayerLoadout';
import type { BeamStrike, OrbSplash } from '@/systems/Sorcery';
import { beamReach, crystalPoint, splashDamage } from '@/systems/Sorcery';
import { Timer } from '@/systems/Timer';
import type { AimTarget } from '@/systems/touchAim';
import { applyRage } from '@/systems/Ultimate';

/**
 * Cele ataków bohatera w świecie (wrogowie, boss, kokony, purchawki, ukryta komnata, urny). Scena wie, co jest
 * na piętrze; `attacker` to bohater, który atakuje — boss jest nietykalny dla ataków spoza areny (krok 86).
 */
export interface HeroStrikeTargets {
  /** Cios wręcz; zwraca liczbę trafionych stworzeń (do Wampirzego kła). */
  melee(swing: MeleeSwing, attacker: Player): number;
  beam(beam: BeamStrike, attacker: Player): void;
  /** Rozprysk kuli, fala uderzeniowa i Supernowa — wrogowie i boss. */
  splash(strike: OrbSplash, attacker: Player): void;
  dash(sweep: DashSweep, alreadyHit: Set<object>, attacker: Player): void;
}

export interface HeroCombatDeps {
  readonly scene: Phaser.Scene;
  readonly player: Player;
  readonly hero: HeroId;
  /** Przedmioty tego bohatera (co-op: każdy zbiera dla siebie). */
  readonly items: () => readonly ItemId[];
  readonly floorEffects: FloorModifierEffects;
  readonly floorNumber: number;
  readonly effects: CombatEffects;
  readonly playerShots: PlayerShotManager;
  readonly walls: Phaser.Tilemaps.TilemapLayer;
  readonly strikes: HeroStrikeTargets;
  /** Cele totemu: żywi, widoczni wrogowie i boss z pomocnikami. */
  readonly aimTargets: () => Iterable<AimTarget>;
}

/** Barwa liczb obrażeń od trucizny nad bohaterem — zieleń jadu (krok 27). */
const POISON_TEXT_COLOR = '#8cff6a';

/**
 * Walka jednego bohatera (co-op, etap C2; wcześniej w `GameScene`): jego ataki (cios, strzał, kule, strzały,
 * promień, fala, Burzowy pęd), Wampirzy kieł i ultimate. Solo — jeden taki obiekt, co-op — po jednym na gracza.
 */
export class HeroCombat {
  readonly ultimates: UltimateManager;
  /** Cele trafione Burzowym pędem w dashu o numerze `dashHitsFor`. */
  private dashHits = new Set<object>();
  private dashHitsFor = -1;
  /** Wampirzy kieł: przerwa między leczeniami (krok 93). */
  private readonly healCooldown = new Timer();
  /** Wampirzy kieł: sufit leczenia na sekundę (krok 93). */
  private readonly healBudget = new HealBudget();
  private beamGfx: Phaser.GameObjects.Graphics | null = null;
  /** Ostatni dash, który już zabrzmiał (krok 116). */
  private dashSoundFor = -1;

  constructor(private readonly deps: HeroCombatDeps) {
    this.ultimates = new UltimateManager({
      scene: deps.scene,
      player: deps.player,
      effects: deps.effects,
      playerShots: deps.playerShots,
      blast: (strike) => deps.strikes.splash(strike, deps.player),
      targets: deps.aimTargets,
      onRageChanged: () => deps.player.applyLoadout(this.loadout()),
      floorNumber: deps.floorNumber,
    });
  }

  get player(): Player {
    return this.deps.player;
  }

  get hero() {
    return HERO_DEFINITIONS[this.deps.hero];
  }

  /** Statystyki bohatera z przedmiotów, modyfikatora piętra i szału. */
  loadout(): PlayerLoadout {
    return heroLoadout(this.deps.hero, this.deps.items(), this.deps.floorEffects, this.ultimates.isRaging(this.deps.scene.time.now));
  }

  /** Jedna klatka bohatera: ruch, ataki i ultimate z akcji gracza. */
  tick(actions: PlayerActions, time: number): void {
    const { player, effects, playerShots } = this.deps;
    const turn = player.tick(actions, time);
    if (turn.poisonDamage > 0) {
      effects.floatingText(player.x, player.y - player.radius, `-${turn.poisonDamage}`, POISON_TEXT_COLOR);
    }
    if (turn.struck) this.resolveStrike(time);
    if (turn.shot) {
      const { x, y, combatConfig } = player;
      playerShots.fire({ x, y }, turn.shot, combatConfig.ranged, player.effects, undefined, player);
      sound.play(SoundCue.ArrowShot, player);
    }
    if (turn.orb) this.fireOrb(turn.orb);
    if (turn.ultimate) this.ultimates.use(turn.ultimate, time);
    if (turn.nova) this.castNova(time);
    if (turn.arrow) this.fireArrow(turn.arrow.direction, turn.arrow.strong);
    if (turn.volley) this.fireVolley(turn.volley);
    this.updateBeam(turn.beam, turn.beamTicks, time);
    sound.hold(LoopCue.Beam, player, turn.beam && !player.isDead);
    if (player.dashId !== this.dashSoundFor && player.isDashing(time)) {
      this.dashSoundFor = player.dashId;
      sound.play(SoundCue.Dash, player);
    }
    this.ultimates.update(time);
    this.resolveDashStrike(time);
  }

  /** Trafienie pocisku tego bohatera: kieł leczy za stworzenie, kula i strzała mają rozprysk magii. */
  afterShotHit(shot: { readonly position: Vector2; readonly damage: number; readonly vampiric?: boolean; readonly magic?: boolean }, target: object, creature: boolean, now: number): void {
    if (creature && shot.vampiric) this.tryVampireHeal(now);
    if (shot.magic) this.orbSplash(shot.position, shot.damage, target, now);
  }

  /** Kula Czarodziejki wylatuje z kryształu; niesie wszystkie efekty broni z przedmiotów. */
  private fireOrb(direction: Vector2): void {
    const { player } = this.deps;
    const orbs = player.sorceryConfig?.orbs;
    if (!orbs) return;
    const { effects } = player;
    const origin = crystalPoint(player, Math.atan2(direction.y, direction.x), orbs.forwardOffset, orbs.sideOffset);
    sound.play(SoundCue.OrbThrow, player);
    this.deps.playerShots.fire(
      origin,
      direction,
      {
        damage: orbs.damage,
        knockback: orbs.knockback,
        projectileSpeed: orbs.speed,
        projectileLifetimeMs: orbs.lifetimeMs,
        projectileRadius: orbs.radius,
      },
      effects,
      {
        texture: SPRITE_SHEETS[SORCERESS_ORB_VISUAL.sheet].key,
        animation: animationKey(SORCERESS_ORB_VISUAL.sheet, SORCERESS_ORB_VISUAL.animation),
        status: { ...effects.shotStatus, ...effects.meleeStatus },
        vampiric: effects.meleeHeal > 0,
        magic: true,
      },
      player,
    );
  }

  /**
   * Strzała łucznika z łuku (krok 82; ciągły ostrzał od kroku 97): mocna strzała serii przebija.
   * Łuk to broń główna, więc strzała niesie wszystkie efekty broni (strzał + cios), jak kula Czarodziejki,
   * i trafia upiory zasadzki (domyślna decyzja z kroku 82, do oceny właściciela).
   */
  private fireArrow(direction: Vector2, strong: boolean): void {
    const { player } = this.deps;
    const archery = player.archeryConfig;
    if (!archery) return;
    const { bow } = archery;
    const spec = arrowSpec(bow, strong);
    sound.play(spec.strong ? SoundCue.ArrowStrong : SoundCue.ArrowShot, player);
    const origin = crystalPoint(player, Math.atan2(direction.y, direction.x), bow.forwardOffset, bow.sideOffset);
    this.deps.playerShots.fire(
      origin,
      direction,
      {
        damage: spec.damage,
        knockback: spec.knockback,
        projectileSpeed: spec.speed,
        projectileLifetimeMs: bow.lifetimeMs,
        projectileRadius: bow.radius,
      },
      player.effects,
      this.arrowLook(direction, spec.strong, spec.pierce),
      player,
    );
  }

  /** Salwa łucznika (PPM): wachlarz strzał z obrażeniami i lotem ładunków strzału (`combat.ranged`). */
  private fireVolley(aim: Vector2): void {
    const { player } = this.deps;
    const archery = player.archeryConfig;
    if (!archery) return;
    const { bow, volley } = archery;
    const angle = Math.atan2(aim.y, aim.x);
    const origin = crystalPoint(player, angle, bow.forwardOffset, bow.sideOffset);
    sound.play(SoundCue.Volley, player);
    for (const direction of volleyDirections(angle, volley.arrows, volley.spreadDeg)) {
      this.deps.playerShots.fire(origin, direction, player.combatConfig.ranged, player.effects, this.arrowLook(direction, false, 0), player);
    }
  }

  private arrowLook(direction: Vector2, strong: boolean, extraPierce: number): ShotLook {
    const { effects } = this.deps.player;
    const sheet = ARCHER_ARROW_VISUAL.sheet;
    return {
      texture: SPRITE_SHEETS[sheet].key,
      animation: animationKey(sheet, strong ? ARCHER_ARROW_VISUAL.fullAnimation : ARCHER_ARROW_VISUAL.animation, facingDirection(direction) ?? 0),
      status: { ...effects.shotStatus, ...effects.meleeStatus },
      vampiric: effects.meleeHeal > 0,
      magic: true,
      extraPierce,
    };
  }

  /** Rozprysk kuli (krok 50): sąsiedzi trafionego dostają ułamek obrażeń; wrogowie, pajączki z bossa i boss. */
  private orbSplash(at: Vector2, orbDamage: number, mainTarget: object, now: number): void {
    const { player } = this.deps;
    const splash = player.sorceryConfig?.orbs.splash;
    if (!splash) return;
    const strike: OrbSplash = {
      center: { x: at.x, y: at.y },
      radius: splash.radius,
      damage: splashDamage(orbDamage, splash.damageFraction),
      now,
      source: { x: player.x, y: player.y },
      exclude: mainTarget,
    };
    this.deps.strikes.splash(strike, player);
    this.deps.effects.splash(at.x, at.y, splash.radius);
    sound.play(SoundCue.OrbSplash, at);
  }

  /**
   * Fala uderzeniowa Czarodziejki (krok 97): przy rzucie ostatniej kuli serii rani i odpycha wrogów wokół niej.
   * Magia (trafia upiory), bez efektów przedmiotów — jak rozprysk kuli.
   */
  private castNova(now: number): void {
    const { player } = this.deps;
    const nova = player.sorceryConfig?.orbs.nova;
    if (!nova) return;
    const center = { x: player.x, y: player.y };
    const strike: OrbSplash = { center, radius: nova.radius, damage: nova.damage, knockback: nova.knockback, now, source: center, exclude: null };
    this.deps.strikes.splash(strike, player);
    this.deps.effects.nova(center.x, center.y, nova.radius);
    sound.play(SoundCue.Nova, center);
  }

  /** Promień Czarodziejki: rysunek co klatkę, obrażenia w klatkach z tickiem; zatrzymuje się na ścianie. */
  private updateBeam(active: boolean, ticks: number, now: number): void {
    const { player } = this.deps;
    const config = player.sorceryConfig?.beam;
    if (!active || !config) {
      this.beamGfx?.clear();
      return;
    }
    const angle = player.getAimAngle();
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const from = crystalPoint(player, angle, config.forwardOffset, config.sideOffset);
    const walls = this.deps.walls;
    const blocked = (p: Vector2): boolean => walls.getTileAtWorldXY(p.x, p.y)?.collides ?? false;
    const length = blocked(from) ? 0 : beamReach(from, angle, config.range, blocked);
    const to = { x: from.x + dir.x * length, y: from.y + dir.y * length };
    this.drawBeam(from, to);
    for (let i = 0; i < ticks; i++) {
      const beam: BeamStrike = {
        from,
        to,
        halfWidth: config.halfWidth,
        damage: config.damagePerTick,
        knockback: config.knockback,
        now,
        source: { x: player.x, y: player.y },
      };
      this.deps.strikes.beam(beam, player);
    }
  }

  /** Promień w kolorach kryształu (pełne kolory, bez przezroczystości); rdzeń migocze tylko wizualnie. */
  private drawBeam(from: Vector2, to: Vector2): void {
    const gfx = this.beamGfx ?? (this.beamGfx = this.deps.scene.add.graphics().setDepth(RENDER_DEPTH.slash));
    const core = Math.random() < 0.5 ? 1 : 2;
    gfx.clear();
    gfx.lineStyle(5, 0x1d7f9c, 1).lineBetween(from.x, from.y, to.x, to.y);
    gfx.lineStyle(3, 0x39c0d8, 1).lineBetween(from.x, from.y, to.x, to.y);
    gfx.lineStyle(core, 0xe4fbfb, 1).lineBetween(from.x, from.y, to.x, to.y);
    gfx.fillStyle(0x8ae6ef, 1).fillCircle(to.x, to.y, 3);
    gfx.fillStyle(0xe4fbfb, 1).fillCircle(from.x, from.y, 2);
  }

  /** Wampirzy kieł: leczenie za trafienie (raz na cios lub kulę), najwyżej raz na meleeHealCooldownMs. */
  private tryVampireHeal(now: number): void {
    const { player, effects } = this.deps;
    const { meleeHeal, meleeHealCooldownMs, meleeHealMaxHpPctPerSec } = player.effects;
    if (meleeHeal <= 0 || player.health.isFull || this.healCooldown.isActive(now)) return;
    this.healCooldown.start(now, meleeHealCooldownMs);
    const heal = this.healBudget.take(meleeHeal, now, player.health.max * meleeHealMaxHpPctPerSec);
    if (heal <= 0) return;
    player.heal(heal);
    effects.floatingText(player.x, player.y - 14, `+${heal}`, '#ff6b8a');
  }

  private resolveStrike(now: number): void {
    const { player, effects } = this.deps;
    const combat = player.combatConfig;
    const swing: MeleeSwing = {
      origin: { x: player.x, y: player.y },
      angle: player.getAimAngle(),
      combat,
      now,
      status: player.effects.meleeStatus,
    };
    const arc = Phaser.Math.DegToRad(combat.meleeArcDeg);
    effects.slash(swing.origin.x, swing.origin.y, swing.angle, combat.meleeRange, arc);
    sound.play(SoundCue.SwordSwing, swing.origin);
    // Wampirzy kieł: leczenie za cios, który trafił wroga lub bossa (raz na cios, niezależnie od liczby celów).
    // Krok 93: kokony, purchawki i urny już nie leczą.
    if (this.deps.strikes.melee(swing, player) > 0) this.tryVampireHeal(now);
  }

  /** Burzowy pęd: w trakcie dasha bohater rani dotkniętych wrogów (każdego raz na dash). */
  private resolveDashStrike(now: number): void {
    const { player } = this.deps;
    const damage = player.effects.dashDamage;
    if (damage <= 0 || !player.isDashing(now)) return;
    if (this.dashHitsFor !== player.dashId) {
      this.dashHitsFor = player.dashId;
      this.dashHits = new Set();
    }
    const sweep = { center: { x: player.x, y: player.y }, radius: player.radius, damage, now };
    this.deps.strikes.dash(sweep, this.dashHits, player);
  }
}

/** Loadout bohatera: przedmioty, limity statystyk, modyfikator piętra i (barbarzyńca) szał. */
export function heroLoadout(hero: HeroId, items: readonly ItemId[], floorEffects: FloorModifierEffects, raging: boolean): PlayerLoadout {
  const definition = HERO_DEFINITIONS[hero];
  const loadout = applyFloorToLoadout(computeHeroLoadout(definition, items, ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS), floorEffects);
  // Szał barbarzyńcy (krok 98) mnoży loadout na czas trwania.
  const { ultimate } = definition;
  return ultimate.kind === 'rage' && raging ? applyRage(loadout, ultimate) : loadout;
}
