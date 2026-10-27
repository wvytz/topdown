import { describe, expect, it } from 'vitest';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { ENEMY_DEFINITIONS, ENEMY_VARIANTS } from '@/config/combatConfig';
import { ENEMY_PROJECTILE_VISUALS, ENEMY_VISUALS, SPRITE_SHEETS } from '@/config/spriteConfig';
import { ITEM_EFFECTS } from '@/config/lootConfig';
import { EnemyAttackKind, EnemyType, EnemyVariant } from '@/core/combatTypes';
import { enemyDefinitionFor, isHitByWave } from '@/systems/EnemyVariants';

const def = (type: EnemyType, variant: EnemyVariant) => enemyDefinitionFor(ENEMY_DEFINITIONS[type], variant, ENEMY_VARIANTS);

describe('warianty wrogów (krok 23b)', () => {
  it('ruiny: Trashcan i mag; leże: pająk i nietoperz — te same archetypy', () => {
    expect(BIOMES[BiomeId.TowerRuins].enemyVariants).toEqual({
      [EnemyType.Rusher]: EnemyVariant.TrashcanMan,
      [EnemyType.Kiter]: EnemyVariant.DemonMage,
      [EnemyType.Nester]: EnemyVariant.BroodSac,
    });
    expect(BIOMES[BiomeId.SpiderLair].enemyVariants).toEqual({
      [EnemyType.Rusher]: EnemyVariant.CaveSpider,
      [EnemyType.Kiter]: EnemyVariant.Bat,
      [EnemyType.Nester]: EnemyVariant.BroodSac,
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

describe('wrogowie Grzybni (krok 28b)', () => {
  it('Grzybnia: zarażony pająk (Rusher) i grzybiec (Kiter)', () => {
    expect(BIOMES[BiomeId.FungalGrove].enemyVariants).toEqual({
      [EnemyType.Rusher]: EnemyVariant.InfectedSpider,
      [EnemyType.Kiter]: EnemyVariant.Fungoid,
      [EnemyType.Nester]: EnemyVariant.BroodSac,
    });
  });

  it('zarażony pająk: walka Rushera, ugryzienie lekko zatruwa (słabiej niż Ognista pięść)', () => {
    const spider = def(EnemyType.Rusher, EnemyVariant.InfectedSpider);
    const rusher = ENEMY_DEFINITIONS[EnemyType.Rusher];
    expect(spider.behaviour).toEqual(rusher.behaviour);
    expect({ ...spider.attack, status: undefined }).toEqual({ ...rusher.attack, status: undefined });
    const poison = spider.attack.status?.poison;
    expect(poison).toBeDefined();
    const total = (p: { tickDamage: number; tickMs: number; durationMs: number }) => p.tickDamage * Math.floor(p.durationMs / p.tickMs);
    expect(total(poison!)).toBeLessThan(total(ITEM_EFFECTS.fireFist));
    expect(ENEMY_VISUALS[EnemyVariant.InfectedSpider].sheet).toBe('infectedSpider');
  });

  it('grzybiec: rytm Kitera, kula zarodników słabsza i wolniejsza od kuli maga, zatruwa jak Ognista pięść', () => {
    const fungoid = def(EnemyType.Kiter, EnemyVariant.Fungoid);
    const mage = ENEMY_DEFINITIONS[EnemyType.Kiter];
    expect(fungoid.behaviour).toEqual(mage.behaviour);
    if (fungoid.attack.kind !== EnemyAttackKind.Projectile || mage.attack.kind !== EnemyAttackKind.Projectile) throw new Error('Kiter strzela');
    expect(fungoid.attack.damage).toBeLessThan(mage.attack.damage);
    expect(fungoid.attack.projectileSpeed).toBeLessThan(mage.attack.projectileSpeed);
    expect(fungoid.attack.wave).toBeUndefined();
    expect(fungoid.attack.status?.poison).toEqual({
      tickDamage: ITEM_EFFECTS.fireFist.tickDamage,
      tickMs: ITEM_EFFECTS.fireFist.tickMs,
      durationMs: ITEM_EFFECTS.fireFist.durationMs,
    });
    const spit = ENEMY_PROJECTILE_VISUALS[EnemyVariant.Fungoid]!;
    expect(spit.directional).toBe(false);
    expect(SPRITE_SHEETS[spit.sheet].animations).toHaveProperty(spit.animation);
  });
});

describe('wrogowie Cmentarzyska (krok 32b)', () => {
  it('Cmentarzysko: zarażony (Rusher) i siewca (Kiter)', () => {
    expect(BIOMES[BiomeId.Graveyard].enemyVariants).toEqual({
      [EnemyType.Rusher]: EnemyVariant.Zombie,
      [EnemyType.Kiter]: EnemyVariant.Sower,
      [EnemyType.Nester]: EnemyVariant.BroodSac,
    });
  });

  it('zarażony: cios mocniejszy niż pająka Grzybni, ale z dłuższym zamachem; zatruwa tak samo', () => {
    const zombie = def(EnemyType.Rusher, EnemyVariant.Zombie);
    const spider = def(EnemyType.Rusher, EnemyVariant.InfectedSpider);
    expect(zombie.attack.kind).toBe(EnemyAttackKind.Melee);
    expect(zombie.attack.damage).toBeGreaterThan(spider.attack.damage);
    expect(zombie.attack.windupMs).toBeGreaterThan(spider.attack.windupMs);
    expect(zombie.attack.status).toEqual(spider.attack.status);
    expect(ENEMY_VISUALS[EnemyVariant.Zombie].attack).toBe('claw');
  });

  it('siewca pluje jak grzybiec (kula zarodników), z własnym wyglądem', () => {
    const sower = def(EnemyType.Kiter, EnemyVariant.Sower);
    const fungoid = def(EnemyType.Kiter, EnemyVariant.Fungoid);
    expect(sower.attack).toEqual(fungoid.attack);
    expect(ENEMY_VISUALS[EnemyVariant.Sower].sheet).toBe('sower');
    expect(ENEMY_PROJECTILE_VISUALS[EnemyVariant.Sower]).toEqual(ENEMY_PROJECTILE_VISUALS[EnemyVariant.Fungoid]);
  });

  it('animacje zamachu istnieją w arkuszach i mają 4 klatki', () => {
    expect(SPRITE_SHEETS.zombie.animations.claw.frames).toHaveLength(4);
    expect(SPRITE_SHEETS.sower.animations.spit.frames).toHaveLength(4);
  });
});

