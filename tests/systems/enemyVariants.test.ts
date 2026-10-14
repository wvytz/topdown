import { describe, expect, it } from 'vitest';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { ENEMY_DEFINITIONS, ENEMY_VARIANTS } from '@/config/combatConfig';
import { ENEMY_PROJECTILE_VISUALS, ENEMY_VISUALS, SPRITE_SHEETS } from '@/config/spriteConfig';
import { EnemyAttackKind, EnemyType, EnemyVariant } from '@/core/combatTypes';
import { enemyDefinitionFor, isHitByWave } from '@/systems/EnemyVariants';

const def = (type: EnemyType, variant: EnemyVariant) => enemyDefinitionFor(ENEMY_DEFINITIONS[type], variant, ENEMY_VARIANTS);

describe('warianty wrogów (krok 23b)', () => {
  it('ruiny: Trashcan i mag; leże: pająk i nietoperz — te same archetypy', () => {
    expect(BIOMES[BiomeId.TowerRuins].enemyVariants).toEqual({
      [EnemyType.Rusher]: EnemyVariant.TrashcanMan,
      [EnemyType.Kiter]: EnemyVariant.DemonMage,
    });
    expect(BIOMES[BiomeId.SpiderLair].enemyVariants).toEqual({
      [EnemyType.Rusher]: EnemyVariant.CaveSpider,
      [EnemyType.Kiter]: EnemyVariant.Bat,
    });
    for (const biome of Object.values(BIOMES)) {
      for (const [type, variant] of Object.entries(biome.enemyVariants)) expect(ENEMY_VARIANTS[variant].type).toBe(type);
    }
  });

  it('wariant archetypu bez zmian w configu = statystyki archetypu', () => {
    expect(def(EnemyType.Rusher, EnemyVariant.TrashcanMan)).toEqual(ENEMY_DEFINITIONS[EnemyType.Rusher]);
    expect(def(EnemyType.Kiter, EnemyVariant.DemonMage)).toEqual(ENEMY_DEFINITIONS[EnemyType.Kiter]);
  });

  it('pająk to Rusher: ta sama walka, inny wygląd i kolor', () => {
    const spider = def(EnemyType.Rusher, EnemyVariant.CaveSpider);
    const rusher = ENEMY_DEFINITIONS[EnemyType.Rusher];
    expect({ ...spider, variant: rusher.variant, color: rusher.color }).toEqual(rusher);
    expect(ENEMY_VISUALS[EnemyVariant.CaveSpider].sheet).toBe('caveSpider');
  });

  it('nietoperz to Kiter z falą: ten sam rytm i obrażenia, wolniejszy pocisk w kształcie półksiężyca', () => {
    const bat = def(EnemyType.Kiter, EnemyVariant.Bat);
    const mage = ENEMY_DEFINITIONS[EnemyType.Kiter];
    expect(bat.behaviour).toEqual(mage.behaviour);
    expect(bat.maxHp).toBe(mage.maxHp);
    if (bat.attack.kind !== EnemyAttackKind.Projectile || mage.attack.kind !== EnemyAttackKind.Projectile) throw new Error('Kiter strzela');
    expect(bat.attack.damage).toBe(mage.attack.damage);
    expect(bat.attack.windupMs).toBe(mage.attack.windupMs);
    expect(bat.attack.cooldownMs).toBe(mage.attack.cooldownMs);
    expect(bat.attack.range).toBe(mage.attack.range);
    expect(bat.attack.projectileSpeed).toBeLessThan(mage.attack.projectileSpeed);
    expect(bat.attack.wave?.halfWidth).toBeGreaterThan(bat.attack.wave?.halfDepth ?? Infinity);
    expect(mage.attack.wave).toBeUndefined();
  });

  it('wariant innego archetypu to błąd konfiguracji', () => {
    expect(() => def(EnemyType.Rusher, EnemyVariant.Bat)).toThrow(/archetypu/);
  });

  it('strzelające warianty mają wygląd pocisku; fala ma 8 kierunków lotu', () => {
    expect(ENEMY_PROJECTILE_VISUALS[EnemyVariant.DemonMage]?.directional).toBe(false);
    const wave = ENEMY_PROJECTILE_VISUALS[EnemyVariant.Bat];
    expect(wave?.directional).toBe(true);
    expect(SPRITE_SHEETS[wave!.sheet].directions).toBe(8);
  });
});

describe('isHitByWave — fala-półksiężyc', () => {
  const shape = { halfWidth: 13, halfDepth: 4 };
  const north = { x: 0, y: -1 };

  it('trafia w całej szerokości w poprzek lotu', () => {
    expect(isHitByWave({ x: 0, y: 0 }, north, shape, { x: 0, y: 0 }, 0)).toBe(true);
    expect(isHitByWave({ x: 0, y: 0 }, north, shape, { x: 13, y: 0 }, 0)).toBe(true);
    expect(isHitByWave({ x: 0, y: 0 }, north, shape, { x: -18, y: 0 }, 6)).toBe(true);
    expect(isHitByWave({ x: 0, y: 0 }, north, shape, { x: 20, y: 0 }, 6)).toBe(false);
  });

  it('jest wąska wzdłuż lotu', () => {
    expect(isHitByWave({ x: 0, y: 0 }, north, shape, { x: 0, y: 9 }, 6)).toBe(true);
    expect(isHitByWave({ x: 0, y: 0 }, north, shape, { x: 0, y: 11 }, 6)).toBe(false);
  });

  it('obraca się z kierunkiem lotu (fala na wschód jest szeroka w pionie)', () => {
    const east = { x: 5, y: 0 }; // kierunek nie musi być znormalizowany
    expect(isHitByWave({ x: 0, y: 0 }, east, shape, { x: 0, y: 13 }, 0)).toBe(true);
    expect(isHitByWave({ x: 0, y: 0 }, east, shape, { x: 13, y: 0 }, 0)).toBe(false);
  });
});
