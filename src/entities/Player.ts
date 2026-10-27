import { SoundCue, sound } from '@/audio/SoundBoard';
import Phaser from 'phaser';
import type { Hit, PlayerCombatConfig, StatusApplication, WeaponEffects } from '@/core/combatTypes';
import type { ArcheryConfig, HeroId, HeroKit, SorceryConfig, UltimateConfig } from '@/core/heroTypes';
import { archeryOf, sorceryOf } from '@/core/heroTypes';
import { AttackPhase } from '@/core/combatTypes';
import type { BeamHudData, MovementIntent, PlayerStats, RangedHudData, Vector2 } from '@/core/types';
import { PLAYER_SIZE } from '@/config/gameConfig';
import { PLAYER_STATUS_RESISTANCE } from '@/config/combatConfig';
import type { PlayerLoadout } from '@/systems/PlayerLoadout';
import { AttackCycle } from '@/systems/AttackCycle';
import { angleTo } from '@/systems/CombatMath';
import { ChargePool } from '@/systems/ChargePool';
import type { HeroVisual } from '@/config/spriteConfig';
import { HERO_VISUALS, LOOT_ATLAS, LOOT_FRAMES, SORCERESS_ORB_VISUAL, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { facingDirection } from '@/systems/Facing';
import { playerAnimationState } from '@/systems/PlayerAnimation';
import { DirectionalAnimator } from '@/entities/DirectionalAnimator';
import { DashController } from '@/systems/DashController';
import { Health } from '@/systems/Health';
import { computeVelocity } from '@/systems/MovementSystem';
import { StatusEffects } from '@/systems/StatusEffects';
import { Timer } from '@/systems/Timer';
import { BeamChannel, OrbSeries, orbitOffsets } from '@/systems/Sorcery';
import { BowRepeater } from '@/systems/Archery';
import { UltimateGauge, gaugeConfigFor, ultimateActiveMs, ultimateGuardMs } from '@/systems/Ultimate';
import { ULTIMATE_GAUGE } from '@/config/ultimateConfig';
import { HERO_DEFINITIONS } from '@/config/heroConfig';
import { statusTint } from '@/effects/statusTints';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { attachGroundShadow } from '@/effects/GroundShadow';

/** Abstrakcyjne akcje gracza w danej klatce — produkuje je InputController. */
export interface PlayerActions {
  readonly move: MovementIntent;
  /** Punkt celowania w świecie (px). */
  readonly aim: Vector2;
  readonly attack: boolean;
  readonly dash: boolean;
  /** Strzał (PPM, przytrzymanie = seria w tempie shotIntervalMs, dopóki są ładunki). */
  readonly shoot: boolean;
  /** Interakcja z otoczeniem (np. kapliczka) — obsługuje scena, nie gracz. */
  readonly interact: boolean;
  /** Ultimate (R, krok 98) — jednorazowe wciśnięcie. */
  readonly ultimate: boolean;
}

/** Co gracz zrobił w tej klatce — do rozstrzygnięcia przez scenę. */
export interface PlayerTickResult {
  /** Uderzenie bronią wręcz. */
  readonly struck: boolean;
  /** Kierunek wystrzelonego pocisku; null, gdy gracz nie strzelił. */
  readonly shot: Vector2 | null;
  /** Obrażenia od trucizny w tej klatce (0 = brak) — scena pokazuje liczbę nad graczem. */
  readonly poisonDamage: number;
  /** Czarodziejka: kierunek wypuszczonej kuli energii; null, gdy żadna nie wyleciała. */
  readonly orb: Vector2 | null;
  /** Czarodziejka: fala uderzeniowa wokół niej (rzut ostatniej kuli serii, krok 97). */
  readonly nova: boolean;
  /** Czarodziejka: promień świeci w tej klatce. */
  readonly beam: boolean;
  /** Czarodziejka: ile razy promień zadaje obrażenia w tej klatce. */
  readonly beamTicks: number;
  /** Łucznik: strzała z łuku wypuszczona w tej klatce (kierunek, czy mocna); null = brak. */
  readonly arrow: { readonly direction: Vector2; readonly strong: boolean } | null;
  /** Łucznik: kierunek celowania salwy (wachlarz rozkłada scena); null = brak. */
  readonly volley: Vector2 | null;
  /** Ultimate użyte w tej klatce (krok 98) — skutki (szał, wybuch, totem) rozstrzyga scena. */
  readonly ultimate: UltimateConfig | null;
}

const IDLE: PlayerTickResult = {
  struck: false,
  shot: null,
  poisonDamage: 0,
  orb: null,
  nova: false,
  beam: false,
  beamTicks: 0,
  arrow: null,
  volley: null,
  ultimate: null,
};
/** Barwa bohatera w trakcie nietykalności z ultimate: szał (czerwień) i tarcza Supernowej (błękit). */
const ULTIMATE_GUARD_TINT: Readonly<Record<UltimateConfig['kind'], number>> = { rage: 0xff8a6a, supernova: 0x9ef2ff, totem: 0xffffff };
/** Kolor znacznika celowania, gdy następna strzała serii będzie mocna. */
const STRONG_ARROW_AIM_TINT = 0xffe08a;
const KNOCKBACK_STUN_MS = 120;
const AIM_MARKER_DISTANCE = 22;

/** Widok + ciało fizyczne gracza. Zasady (HP, cooldowny, dash) delegowane do czystych systemów. */
export class Player extends Phaser.Physics.Arcade.Sprite {
  readonly health: Health;
  readonly radius = PLAYER_SIZE / 2;

  private stats: PlayerStats;
  private combat: PlayerCombatConfig;
  private weaponEffects: WeaponEffects;
  /** Numer bieżącego dasha — Burzowy pęd rani każdego wroga raz na dash. */
  private dashCount = 0;
  private attackCycle: AttackCycle;
  private dash: DashController;
  private shotCharges: ChargePool;
  private shotCycle: AttackCycle;
  private readonly invulnerability = new Timer();
  private readonly knockbackStun = new Timer();
  /** Statusy na graczu: spowolnienie (kokony, pajęczyny, krok 23d), trucizna (Matka Pająków, krok 27); dash nie spowalnia. */
  private status = new StatusEffects(PLAYER_STATUS_RESISTANCE);
  private readonly aimMarker: Phaser.GameObjects.Image;
  private aimAngle = 0;
  private readonly animator: DirectionalAnimator;
  private readonly visual: HeroVisual;
  /** Broń bohatera: wręcz (barbarzyńca), magia (Czarodziejka, krok 37) albo łuk (łucznik, krok 82). */
  private kit: HeroKit;
  private orbPool: OrbSeries | null = null;
  private castCycle: AttackCycle | null = null;
  private beam: BeamChannel | null = null;
  private bow: BowRepeater | null = null;
  /** Chwila ostatniej strzały z łuku — animacja zwolnienia cięciwy trwa przez odstęp między strzałami. */
  private bowReleasedAt = -Infinity;
  /** Ultimate (R, krok 98): pasek mocy i nietykalność z szału albo tarczy. */
  private readonly ultimateConfig: UltimateConfig;
  private readonly ultimateGauge: UltimateGauge;
  private readonly ultimateGuard = new Timer();
  /** Kule krążące wokół Czarodziejki (tyle, ile jest gotowych do rzutu). */
  private readonly orbitSprites: Phaser.GameObjects.Sprite[] = [];

  /**
   * @param loadout statystyki po zastosowaniu przedmiotów (PlayerLoadout)
   * @param startHp HP przeniesione z poprzedniego piętra; null = pełne
   */
  constructor(scene: Phaser.Scene, x: number, y: number, hero: HeroId, loadout: PlayerLoadout, startHp: number | null) {
    super(scene, x, y, SPRITE_SHEETS[HERO_VISUALS[hero].sheet].key);
    this.visual = HERO_VISUALS[hero];
    this.ultimateConfig = HERO_DEFINITIONS[hero].ultimate;
    this.ultimateGauge = new UltimateGauge(gaugeConfigFor(HERO_DEFINITIONS[hero], ULTIMATE_GAUGE));
    this.stats = loadout.stats;
    this.combat = loadout.combat;
    this.weaponEffects = loadout.effects;
    this.health = new Health(loadout.stats.maxHp, startHp ?? loadout.stats.maxHp);
    this.attackCycle = new AttackCycle(0, loadout.combat.attackCooldownMs);
    this.dash = new DashController(loadout.combat.dash);
    this.shotCharges = new ChargePool(loadout.combat.ranged.maxCharges, loadout.combat.ranged.rechargeMs);
    this.shotCycle = new AttackCycle(0, loadout.combat.ranged.shotIntervalMs);
    this.kit = loadout.kit;
    const sorcery = sorceryOf(loadout.kit);
    if (sorcery) {
      const { orbs, beam } = sorcery;
      this.orbPool = new OrbSeries(orbs.maxOrbs, orbs.rechargeMs, orbs.reloadMs);
      this.castCycle = new AttackCycle(orbs.castWindupMs, orbs.castCooldownMs);
      this.beam = new BeamChannel(beam);
    }
    const archery = archeryOf(loadout.kit);
    if (archery) this.bow = new BowRepeater(archery.bow);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Sprite 48×48 (postać ok. 32 px) — ciało fizyczne zostaje 24×24 pośrodku klatki.
    this.setBodySize(PLAYER_SIZE, PLAYER_SIZE, true);
    this.setCollideWorldBounds(true);
    this.setDepth(RENDER_DEPTH.player);
    this.animator = new DirectionalAnimator(this, this.visual.sheet);
    attachGroundShadow(this, this.visual.groundShadow);
    this.animator.play(this.visual.idle);

    this.aimMarker = scene.add.image(x, y, LOOT_ATLAS.key, LOOT_FRAMES.aim[0]).setDepth(RENDER_DEPTH.aimMarker);
  }

  get isDead(): boolean {
    return this.health.isDead;
  }

  /** Aktualna konfiguracja walki (zmienia się wraz z przedmiotami). */
  /** Efekty broni z przedmiotów (przebicie, podpalenie, ogłuszenie…). */
  get effects(): WeaponEffects {
    return this.weaponEffects;
  }

  /** Numer bieżącego (lub ostatniego) dasha. */
  get dashId(): number {
    return this.dashCount;
  }

  isDashing(now: number): boolean {
    return this.dash.isDashing(now);
  }

  get combatConfig(): PlayerCombatConfig {
    return this.combat;
  }

  /** Podmiana statystyk po zdobyciu przedmiotu. Wzrost maks. HP leczy o tę samą wartość. */
  applyLoadout(loadout: PlayerLoadout): void {
    this.stats = loadout.stats;
    this.attackCycle = new AttackCycle(0, loadout.combat.attackCooldownMs);
    this.dash = new DashController(loadout.combat.dash);
    // Ładunki zachowujemy przy zdobyciu przedmiotu; Kołczan dokłada nowe, od razu naładowane.
    this.shotCharges.resize(loadout.combat.ranged.maxCharges, this.scene.time.now);
    this.combat = loadout.combat;
    this.weaponEffects = loadout.effects;
    this.health.setMax(loadout.stats.maxHp);
    this.kit = loadout.kit;
    const sorcery = sorceryOf(loadout.kit);
    if (sorcery) {
      const { orbs, beam } = sorcery;
      this.orbPool?.setTiming(orbs.rechargeMs, orbs.reloadMs);
      this.orbPool?.resize(orbs.maxOrbs, this.scene.time.now);
      this.castCycle = new AttackCycle(orbs.castWindupMs, orbs.castCooldownMs);
      this.beam?.setConfig(beam);
    }
    const archery = archeryOf(loadout.kit);
    if (archery) this.bow?.setConfig(archery.bow);
  }

  /** Zestaw Czarodziejki po przedmiotach; null = inny bohater. */
  get sorceryConfig(): SorceryConfig | null {
    return sorceryOf(this.kit);
  }

  /** Zestaw łucznika po przedmiotach; null = inny bohater. */
  get archeryConfig(): ArcheryConfig | null {
    return archeryOf(this.kit);
  }

  private get sorcery(): SorceryConfig | null {
    return sorceryOf(this.kit);
  }

  /** Promień do HUD; null u barbarzyńcy. */
  beamStatus(now: number): BeamHudData | null {
    return this.beam ? { active: this.beam.isActive(), readiness: this.beam.readiness(now) } : null;
  }

  rangedStatus(now: number): RangedHudData {
    // Czarodziejka: segmenty HUD to kule na orbicie.
    if (this.orbPool) {
      return {
        charges: this.orbPool.available(now),
        maxCharges: this.orbPool.maxOrbs,
        rechargeProgress: this.orbPool.rechargeProgress(now),
      };
    }
    return {
      charges: this.shotCharges.available(now),
      maxCharges: this.shotCharges.maxCharges,
      rechargeProgress: this.shotCharges.rechargeProgress(now),
    };
  }

  /** Spowolnienie z otoczenia (kokon). W trakcie dasha i nietykalności nie działa — jak obrażenia. */
  applySlow(slow: NonNullable<StatusApplication['slow']>, now: number): boolean {
    if (this.isDead || this.isInvulnerable(now)) return false;
    this.status.apply({ slow }, now);
    return true;
  }

  /**
   * Spowolnienie z terenu (lepka pajęczyna): działa także w nietykalności po trafieniu,
   * bo to podłoże, nie atak — chroni przed nim tylko dash.
   */
  applyTerrainSlow(slow: NonNullable<StatusApplication['slow']>, now: number): boolean {
    if (this.isDead || this.dash.isDashing(now)) return false;
    this.status.apply({ slow }, now);
    return true;
  }

  isSlowed(now: number): boolean {
    return this.status.isSlowed(now);
  }

  heal(amount: number): void {
    this.health.heal(amount);
  }

  /** Co-op (etap C4): powalony bohater wstaje z `hp` HP, bez statusów i z chwilą nietykalności. */
  revive(hp: number, invulnerableMs: number, now: number): void {
    if (!this.isDead) return;
    this.health.revive(hp);
    this.status = new StatusEffects(PLAYER_STATUS_RESISTANCE);
    this.invulnerability.start(now, invulnerableMs);
    this.setBodyCollision(true);
    this.clearTint();
    this.aimMarker.setVisible(true);
  }

  /**
   * Powalone ciało nie bierze udziału w kolizjach: partner, boss ani nikt inny go nie przepchnie (wcześniej dało się
   * je wypychać, np. w Szale), a wskrzeszający może stanąć tuż przy nim. Ruchu i tak nie ma — tick zeruje prędkość.
   */
  private setBodyCollision(enabled: boolean): void {
    (this.body as Phaser.Physics.Arcade.Body).checkCollision.none = !enabled;
  }

  getAimAngle(): number {
    return this.aimAngle;
  }

  dashReadiness(now: number): number {
    return this.dash.readiness(now);
  }

  isInvulnerable(now: number): boolean {
    return this.invulnerability.isActive(now) || this.dash.isDashing(now) || this.ultimateGuard.isActive(now);
  }

  /** Pasek mocy do HUD: 0..1 (1 = R gotowe) i czy ultimate właśnie działa. */
  ultimateStatus(now: number): { readonly charge: number; readonly active: boolean } {
    return { charge: this.ultimateGauge.value(now), active: this.ultimateGauge.isActive(now) };
  }

  /** Zabity wróg ładuje pasek mocy. */
  addUltimateKill(now: number): void {
    if (!this.isDead) this.ultimateGauge.addKill(now);
  }

  /** R przy pełnym pasku: zużywa go i włącza nietykalność (szał, tarcza); resztę robi scena. */
  private tryUltimate(wanted: boolean, now: number): UltimateConfig | null {
    if (!wanted || !this.ultimateGauge.tryUse(now, ultimateActiveMs(this.ultimateConfig))) return null;
    const guard = ultimateGuardMs(this.ultimateConfig);
    if (guard > 0) this.ultimateGuard.start(now, guard);
    return this.ultimateConfig;
  }

  /** Ruch, dash i ataki w tej klatce; trafienia rozstrzyga scena na podstawie wyniku. */
  tick(actions: PlayerActions, now: number): PlayerTickResult {
    this.aimAngle = angleTo(this, actions.aim);
    this.updateAimMarker();

    if (this.isDead) {
      this.setVelocity(0, 0);
      return IDLE;
    }

    // Trucizna tyka niezależnie od nietykalności (to status, nie nowe trafienie) i może zabić.
    const poisonDamage = this.status.takePoisonDamage(now);
    if (poisonDamage > 0) {
      this.health.takeDamage(poisonDamage);
      if (this.isDead) {
        this.die();
        return { ...IDLE, poisonDamage };
      }
    }

    // Paraliż (krok 29): bez ruchu, ataku, strzału i dasha; odrzut z trafienia nadal działa.
    if (this.status.isParalyzed(now)) {
      if (!this.knockbackStun.isActive(now)) this.setVelocity(0, 0);
      this.beam?.interrupt(now);
      this.bow?.interrupt();
      this.updateVisuals(now);
      this.updateOrbit(now);
      this.animator.play(this.visual.idle);
      return { ...IDLE, poisonDamage };
    }

    const ultimate = this.tryUltimate(actions.ultimate, now);

    if (actions.dash) {
      const moving = actions.move.x !== 0 || actions.move.y !== 0;
      const direction = moving ? actions.move : { x: Math.cos(this.aimAngle), y: Math.sin(this.aimAngle) };
      if (this.dash.tryStart(now, direction)) {
        this.dashCount++;
        // Dash przerywa promień — jak puszczenie przycisku — i zaczyna serię strzał od nowa.
        this.beam?.interrupt(now);
        this.bow?.interrupt();
      }
    }
    const beam = this.beam?.update(actions.shoot && !this.dash.isDashing(now), now) ?? { active: false, ticks: 0 };
    // Łucznik: salwa (PPM) przerywa serię; przytrzymany LPM strzela w kółko (krok 97).
    const aim = { x: Math.cos(this.aimAngle), y: Math.sin(this.aimAngle) };
    const volley = this.bow && actions.shoot && !this.dash.isDashing(now) && this.tryShoot(now) ? aim : null;
    if (volley) this.bow?.interrupt();
    const bow = this.bow?.update(actions.attack && !volley && !this.dash.isDashing(now), now) ?? null;

    if (this.dash.isDashing(now)) {
      const velocity = this.dash.velocity();
      this.setVelocity(velocity.x, velocity.y);
    } else if (!this.knockbackStun.isActive(now)) {
      const velocity = computeVelocity(actions.move, this.stats);
      // Promień spowalnia Czarodziejkę (decyzja właściciela).
      // Ostrzał z łuku spowalnia łucznika (krok 82, od kroku 97 przy przytrzymanym LPM).
      const archery = this.archeryConfig;
      const channel =
        beam.active && this.sorcery
          ? this.sorcery.beam.moveSpeedMultiplier
          : bow?.firing && archery
            ? archery.bow.moveSpeedMultiplier
            : 1;
      const slow = this.status.speedMultiplier(now) * channel;
      this.setVelocity(velocity.x * slow, velocity.y * slow);
    }

    if (this.castCycle && this.orbPool) {
      // Czarodziejka: LPM rzuca kulę (seria przy przytrzymaniu), w trakcie promienia nie rzuca.
      const castStarted =
        actions.attack && !beam.active && this.orbPool.available(now) > 0 && this.castCycle.tryStart(now);
      const thrown = this.castCycle.consumeRelease(now) ? this.orbPool.tryThrow(now) : null;
      const orb = thrown ? { x: Math.cos(this.aimAngle), y: Math.sin(this.aimAngle) } : null;
      this.updateVisuals(now);
      this.updateOrbit(now);
      this.updateSorceryAnimation(actions, now, castStarted, beam.active);
      return { ...IDLE, poisonDamage, ultimate, orb, nova: thrown?.last ?? false, beam: beam.active, beamTicks: beam.ticks };
    }

    if (bow) {
      const arrow = bow.fired ? { direction: aim, strong: bow.fired.strong } : null;
      if (arrow) this.bowReleasedAt = now;
      this.updateVisuals(now);
      if (bow.firing && bow.nextStrong) this.aimMarker.setTint(STRONG_ARROW_AIM_TINT);
      else this.aimMarker.clearTint();
      this.updateArcherAnimation(actions, now, arrow !== null);
      return { ...IDLE, poisonDamage, ultimate, arrow, volley };
    }

    const swingStarted = actions.attack && this.attackCycle.tryStart(now);
    const struck = this.attackCycle.consumeRelease(now);

    const shot = actions.shoot && this.tryShoot(now) ? { x: Math.cos(this.aimAngle), y: Math.sin(this.aimAngle) } : null;

    this.updateVisuals(now);
    this.updateAnimation(actions, now, swingStarted);
    return { ...IDLE, struck, shot, poisonDamage, ultimate };
  }

  /** Kule na orbicie: tyle, ile gotowych do rzutu, równo rozłożone i obracające się wokół postaci. */
  private updateOrbit(now: number): void {
    if (!this.sorcery || !this.orbPool) return;
    const { orbitRadius, orbitPeriodMs } = this.sorcery.orbs;
    const count = this.isDead ? 0 : this.orbPool.available(now);
    while (this.orbitSprites.length < count) {
      const sprite = this.scene.add.sprite(this.x, this.y, SPRITE_SHEETS[SORCERESS_ORB_VISUAL.sheet].key);
      sprite.setDepth(RENDER_DEPTH.projectile).play(animationKey(SORCERESS_ORB_VISUAL.sheet, SORCERESS_ORB_VISUAL.animation));
      this.orbitSprites.push(sprite);
    }
    while (this.orbitSprites.length > count) this.orbitSprites.pop()?.destroy();
    const offsets = orbitOffsets(count, now, orbitRadius, orbitPeriodMs);
    this.orbitSprites.forEach((sprite, i) => {
      const offset = offsets[i]!;
      // Całe piksele świata (STYLEGUIDE §10) — kule nie „pływają” między pikselami.
      sprite.setPosition(Math.round(this.x + offset.x), Math.round(this.y + offset.y));
    });
  }

  /** Czarodziejka: promień ma pierwszeństwo, potem rzut kuli (cały cykl rzutu), potem chód. */
  private updateSorceryAnimation(actions: PlayerActions, now: number, castStarted: boolean, channeling: boolean): void {
    this.animator.face({ x: Math.cos(this.aimAngle), y: Math.sin(this.aimAngle) });
    if (channeling && this.visual.channel) {
      this.animator.play(this.visual.channel);
      return;
    }
    const moving = actions.move.x !== 0 || actions.move.y !== 0;
    const state = playerAnimationState(this.castCycle!.phase(now), moving);
    if (state === 'attack') {
      const duration = Math.max(this.sorcery!.orbs.castCooldownMs, this.sorcery!.orbs.castWindupMs);
      if (castStarted) this.animator.restart(this.visual.attack, duration);
      else this.animator.play(this.visual.attack, duration);
      return;
    }
    this.animator.play(state === 'move' ? this.visual.move : this.visual.idle);
  }

  /** Łucznik: każda strzała odtwarza zwolnienie cięciwy na czas odstępu między strzałami, potem chód. */
  private updateArcherAnimation(actions: PlayerActions, now: number, released: boolean): void {
    this.animator.face({ x: Math.cos(this.aimAngle), y: Math.sin(this.aimAngle) });
    const interval = this.archeryConfig?.bow.intervalMs ?? 0;
    if (now - this.bowReleasedAt < interval) {
      if (released) this.animator.restart(this.visual.attack, interval);
      else this.animator.play(this.visual.attack, interval);
      return;
    }
    const moving = actions.move.x !== 0 || actions.move.y !== 0;
    this.animator.play(moving ? this.visual.move : this.visual.idle);
  }

  /** Strzał wymaga odstępu od poprzedniego i wolnego ładunku. */
  private tryShoot(now: number): boolean {
    if (this.shotCycle.phase(now) !== AttackPhase.Ready || this.shotCharges.available(now) <= 0) return false;
    this.shotCycle.tryStart(now);
    return this.shotCharges.tryConsume(now);
  }

  /** Zwraca true, jeśli trafienie zostało przyjęte (gracz nie był nietykalny). */
  takeHit(hit: Hit, now: number): boolean {
    if (this.isDead || this.isInvulnerable(now)) return false;

    this.health.takeDamage(hit.damage);
    this.invulnerability.start(now, this.combat.invulnerabilityMs);
    this.knockbackStun.start(now, KNOCKBACK_STUN_MS);
    this.setVelocity(hit.knockback.x, hit.knockback.y);
    // Status z trafienia (trucizna smagnięcia Matki Pająków).
    this.status.apply(hit.status, now);
    if (!this.isDead) sound.play(SoundCue.HeroHurt, this);

    if (this.isDead) this.die();
    return true;
  }

  isPoisoned(now: number): boolean {
    return this.status.isPoisoned(now);
  }

  isParalyzed(now: number): boolean {
    return this.status.isParalyzed(now);
  }

  /**
   * Status z terenu (grzybnia Króla, krok 29): działa także w nietykalności po trafieniu, chroni tylko dash
   * — jak lepkie pajęczyny.
   */
  applyTerrainStatus(status: StatusApplication, now: number): boolean {
    if (this.isDead || this.dash.isDashing(now)) return false;
    this.status.apply(status, now);
    return true;
  }

  private die(): void {
    sound.play(SoundCue.HeroDeath, this);
    this.setVelocity(0, 0);
    this.setBodyCollision(false);
    this.setTint(0x555555).setAlpha(1);
    this.animator.stop();
    this.aimMarker.setVisible(false);
    this.beam?.interrupt(this.scene.time.now);
    this.bow?.interrupt();
    for (const sprite of this.orbitSprites.splice(0)) sprite.destroy();
  }

  private updateAimMarker(): void {
    this.aimMarker.setPosition(
      this.x + Math.cos(this.aimAngle) * AIM_MARKER_DISTANCE,
      this.y + Math.sin(this.aimAngle) * AIM_MARKER_DISTANCE,
    );
    // 8 klatek kierunku (obrót co 45° w arkuszu) zamiast obrotu o dowolny kąt.
    const direction = facingDirection({ x: Math.cos(this.aimAngle), y: Math.sin(this.aimAngle) });
    if (direction !== null) this.aimMarker.setFrame(LOOT_FRAMES.aim[direction]!);
  }

  /** Barbarzyńca patrzy tam, gdzie celuje; idzie, gdy się porusza; cios trwa cały cykl ataku. */
  private updateAnimation(actions: PlayerActions, now: number, swingStarted: boolean): void {
    this.animator.face({ x: Math.cos(this.aimAngle), y: Math.sin(this.aimAngle) });
    const moving = actions.move.x !== 0 || actions.move.y !== 0;
    const state = playerAnimationState(this.attackCycle.phase(now), moving);
    if (state === 'attack') {
      const duration = this.combat.attackCooldownMs;
      if (swingStarted) this.animator.restart(this.visual.attack, duration);
      else this.animator.play(this.visual.attack, duration);
      return;
    }
    this.animator.play(state === 'move' ? this.visual.move : this.visual.idle);
  }

  private updateVisuals(now: number): void {
    // Trucizna migocze na zielono, spowolnienie barwi na niebiesko (statusTint).
    const tint = statusTint(this.status, now);
    if (tint !== null) this.setTint(tint);
    else if (this.ultimateGuard.isActive(now)) this.setTint(ULTIMATE_GUARD_TINT[this.ultimateConfig.kind]);
    else this.clearTint();
    if (this.dash.isDashing(now)) {
      this.setAlpha(0.5);
    } else if (this.invulnerability.isActive(now)) {
      // Miganie w trakcie nietykalności po trafieniu.
      this.setAlpha(Math.floor(now / 80) % 2 === 0 ? 0.35 : 1);
    } else {
      this.setAlpha(1);
    }
  }
}
