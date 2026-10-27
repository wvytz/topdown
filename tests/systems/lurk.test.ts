import { describe, expect, it } from 'vitest';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { ENEMY_DEFINITIONS, ENEMY_VARIANTS } from '@/config/combatConfig';
import { ENEMY_LOOT } from '@/config/lootConfig';
import { LURKER_CONFIG } from '@/config/lurkerConfig';
import { ENEMY_VISUALS, LURKER_HIDEOUT_VISUAL, SPRITE_SHEETS } from '@/config/spriteConfig';
import type { MeleeAttackDefinition } from '@/core/combatTypes';
import { AttackPhase, EnemyAttackKind, EnemyType } from '@/core/combatTypes';
import { AttackCycle } from '@/systems/AttackCycle';
import { enemyDefinitionFor } from '@/systems/EnemyVariants';
import { Lurk, LurkEvent, LurkPhase } from '@/systems/Lurk';

/** Lustrzana komnata (krok 124) ma na razie wrogów z ruin — własnych jeszcze nie ma (decyzja właściciela otwarta). */
const OWN_ENEMY_BIOMES = Object.values(BIOMES).filter((b) => b.id !== BiomeId.MirrorHall);

const den = { x: 100, y: 100 };
const near = { x: 100, y: 100 + LURKER_CONFIG.triggerRange - 1 };
const far = { x: 100, y: 100 + LURKER_CONFIG.triggerRange + 1 };

describe('Czyhacz (krok 123): kryjówka', () => {
  it('czeka, aż bohater podejdzie na zasięg i będzie go widział', () => {
    const lurk = new Lurk(LURKER_CONFIG, den, 0);
    expect(lurk.sense({ now: 0, hero: far, canSeeHero: true })).toBeNull();
    expect(lurk.sense({ now: 10, hero: near, canSeeHero: false })).toBeNull();
    expect(lurk.sense({ now: 20, hero: null, canSeeHero: false })).toBeNull();
    expect(lurk.phase).toBe(LurkPhase.Hidden);
    expect(lurk.isHiding).toBe(true);
    expect(lurk.sense({ now: 30, hero: near, canSeeHero: true })).toBe(LurkEvent.Woke);
    expect(lurk.phase).toBe(LurkPhase.Waking);
    expect(lurk.isHiding).toBe(true);
  });

  it('po ostrzeżeniu wyskakuje w miejsce bohatera z chwili przebudzenia (najwyżej maxDistance)', () => {
    const lurk = new Lurk(LURKER_CONFIG, den, 0);
    lurk.sense({ now: 1000, hero: near, canSeeHero: true });
    expect(lurk.landingAt).toEqual(near);
    expect(lurk.leapAt).toBe(1000 + LURKER_CONFIG.warnMs);
    // Bohater ucieka — strefa zostaje tam, gdzie była (można z niej zejść).
    expect(lurk.sense({ now: 1000 + LURKER_CONFIG.warnMs - 1, hero: far, canSeeHero: true })).toBeNull();
    expect(lurk.wakeProgress(1000 + LURKER_CONFIG.warnMs / 2)).toBeCloseTo(0.5);
    expect(lurk.sense({ now: 1000 + LURKER_CONFIG.warnMs, hero: far, canSeeHero: true })).toBe(LurkEvent.Leapt);
    expect(lurk.phase).toBe(LurkPhase.Out);
    expect(lurk.landingAt).toEqual(near);
    expect(lurk.provoked).toBe(false);

    const long = new Lurk({ ...LURKER_CONFIG, triggerRange: 1000 }, den, 0);
    long.sense({ now: 0, hero: { x: 100, y: 600 }, canSeeHero: true });
    expect(long.landingAt).toEqual({ x: 100, y: 100 + LURKER_CONFIG.leap.maxDistance });
  });

  it('trafienie kryjówki wywabia go od razu — bez doskoku (nagroda za uważność)', () => {
    const hidden = new Lurk(LURKER_CONFIG, den, 0);
    expect(hidden.provoke()).toBe(LurkEvent.Provoked);
    expect(hidden.phase).toBe(LurkPhase.Out);
    expect(hidden.provoked).toBe(true);
    expect(hidden.landingAt).toBeNull();
    expect(hidden.provoke()).toBeNull();

    const waking = new Lurk(LURKER_CONFIG, den, 0);
    waking.sense({ now: 0, hero: near, canSeeHero: true });
    expect(waking.provoke()).toBe(LurkEvent.Provoked);
    expect(waking.landingAt).toBeNull();
    expect(waking.sense({ now: 5000, hero: near, canSeeHero: true })).toBeNull();
  });

  it('subtelny znak: krótkie drgnięcie co kilka sekund, tylko w ukryciu; przesunięcie rytmu rozdziela kryjówki', () => {
    const { intervalMs, durationMs } = LURKER_CONFIG.tell;
    const lurk = new Lurk(LURKER_CONFIG, den, 0);
    let telling = 0;
    for (let t = 0; t < intervalMs * 10; t += 10) if (lurk.isTelling(t)) telling += 10;
    expect(telling / (intervalMs * 10)).toBeCloseTo(durationMs / intervalMs, 1);
    expect(durationMs).toBeLessThan(intervalMs / 4);
    const other = new Lurk(LURKER_CONFIG, den, intervalMs / 2);
    expect(lurk.isTelling(0) && other.isTelling(0)).toBe(false);
    lurk.provoke();
    expect(lurk.isTelling(0)).toBe(false);
  });

  it('ostrzeżenie trwa ok. 0,6 s, a strefa lądowania daje się ominąć', () => {
    expect(LURKER_CONFIG.warnMs).toBeGreaterThanOrEqual(500);
    expect(LURKER_CONFIG.leap.radius).toBeLessThan(LURKER_CONFIG.leap.maxDistance);
  });
});

describe('Czyhacz (krok 123): archetyp i biomy', () => {
  const lurker = ENEMY_DEFINITIONS[EnemyType.Lurker];
  const rusher = ENEMY_DEFINITIONS[EnemyType.Rusher];

  it('szybszy i twardszy od Rushera, tnie seriami po 2 ciosy z zadyszką', () => {
    const attack = lurker.attack as MeleeAttackDefinition;
    expect(attack.kind).toBe(EnemyAttackKind.Melee);
    expect(attack.series?.hits).toBe(2);
    expect(attack.series!.breatherMs).toBeGreaterThanOrEqual(600);
    expect(lurker.moveSpeed).toBeGreaterThan(rusher.moveSpeed);
    expect(lurker.maxHp).toBeGreaterThan(rusher.maxHp);
    expect(ENEMY_LOOT[EnemyType.Lurker].goldChance).toBe(1);
  });

  it('każdy biom ma własnego Czyhacza z własną kryjówką i arkuszem 8 kierunków', () => {
    const variants = OWN_ENEMY_BIOMES.map((b) => b.enemyVariants[EnemyType.Lurker]);
    expect(new Set(variants).size).toBe(variants.length);
    const rows = new Set<number>();
    for (const variant of variants) {
      const def = enemyDefinitionFor(lurker, variant, ENEMY_VARIANTS);
      expect(def.type).toBe(EnemyType.Lurker);
      expect(def.maxHp).toBe(lurker.maxHp);
      expect(SPRITE_SHEETS[ENEMY_VISUALS[variant].sheet].directions).toBe(8);
      const row = LURKER_HIDEOUT_VISUAL.rows[variant];
      expect(row).toBeDefined();
      rows.add(row!);
    }
    expect(rows.size).toBe(variants.length);
    const hideouts = SPRITE_SHEETS[LURKER_HIDEOUT_VISUAL.sheet];
    expect(hideouts.sheetWidth / hideouts.frameWidth).toBe(variants.length * LURKER_HIDEOUT_VISUAL.columns);
  });
});

describe('AttackCycle: seria ciosów (krok 123)', () => {
  const series = { hits: 2, gapMs: 200, breatherMs: 800 };

  it('drugi cios zaraz po pierwszym, potem zadyszka i pełny cooldown', () => {
    const cycle = new AttackCycle(300, 1600, series);
    expect(cycle.tryStart(0)).toBe(true);
    expect(cycle.consumeRelease(300)).toBe(true);
    expect(cycle.isBreathing(350)).toBe(false);
    expect(cycle.phase(499)).toBe(AttackPhase.Recovery);
    expect(cycle.tryStart(500)).toBe(true);
    expect(cycle.consumeRelease(800)).toBe(true);
    expect(cycle.isBreathing(800)).toBe(true);
    expect(cycle.isBreathing(1599)).toBe(true);
    expect(cycle.isBreathing(1600)).toBe(false);
    expect(cycle.tryStart(2099)).toBe(false);
    expect(cycle.tryStart(2100)).toBe(true);
    // nowa seria: znów szybki drugi cios
    expect(cycle.isBreathing(2450)).toBe(false);
    expect(cycle.tryStart(2600)).toBe(true);
  });

  it('bez serii — jak dotąd', () => {
    const cycle = new AttackCycle(300, 1000);
    expect(cycle.tryStart(0)).toBe(true);
    expect(cycle.tryStart(999)).toBe(false);
    expect(cycle.tryStart(1000)).toBe(true);
    expect(cycle.isBreathing(1400)).toBe(false);
  });
});
