import { describe, expect, it } from 'vitest';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { ENEMY_DEFINITIONS, ENEMY_VARIANTS } from '@/config/combatConfig';
import { ENEMY_VISUALS, SPRITE_SHEETS } from '@/config/spriteConfig';
import { ENEMY_LOOT } from '@/config/lootConfig';
import type { BroodAttackDefinition } from '@/core/combatTypes';
import { EnemyAttackKind, EnemyType, EnemyVariant } from '@/core/combatTypes';
import { BroodLedger, broodCapacity, broodSpawnPoints } from '@/systems/Brood';
import { distance } from '@/systems/CombatMath';
import { enemyDefinitionFor } from '@/systems/EnemyVariants';

const nester = ENEMY_DEFINITIONS[EnemyType.Nester];
const attack = nester.attack as BroodAttackDefinition;

describe('Gniazdownik (krok 122)', () => {
  it('jest w każdym biomie, wylęga czerwie (Rusher), trzyma dystans i sam nie rani', () => {
    expect(BIOMES[BiomeId.TowerRuins].enemyVariants[EnemyType.Nester]).toBe(EnemyVariant.BroodSac);
    expect(attack.minion).toBe(EnemyVariant.Grub);
    expect(attack.kind).toBe(EnemyAttackKind.Brood);
    expect(attack.damage).toBe(0);
    expect(ENEMY_VARIANTS[attack.minion].type).toBe(EnemyType.Rusher);
    expect(nester.behaviour.kiting).toBeDefined();
    expect(ENEMY_LOOT[EnemyType.Nester].gold.max).toBeGreaterThan(0);
  });

  it('wersje biomów (krok 122a): każdy biom ma własne gniazdo i stworka, ten sam rytm wylęgu i te same statystyki', () => {
    const nests = Object.values(BIOMES).map((b) => b.enemyVariants[EnemyType.Nester]);
    expect(new Set(nests).size).toBe(nests.length);
    for (const nest of nests) {
      const def = enemyDefinitionFor(nester, nest, ENEMY_VARIANTS);
      const brood = def.attack as BroodAttackDefinition;
      expect(def.maxHp).toBe(nester.maxHp);
      expect({ ...brood, minion: attack.minion }).toEqual(attack);
      const minion = enemyDefinitionFor(ENEMY_DEFINITIONS[EnemyType.Rusher], brood.minion, ENEMY_VARIANTS);
      expect(minion.maxHp).toBe(8);
      expect(minion.attack.damage).toBe(4);
      for (const variant of [nest, brood.minion]) expect(SPRITE_SHEETS[ENEMY_VISUALS[variant].sheet].directions).toBe(8);
    }
    const minions = nests.map((n) => (enemyDefinitionFor(nester, n, ENEMY_VARIANTS).attack as BroodAttackDefinition).minion);
    expect(new Set(minions).size).toBe(minions.length);
  });

  it('czerw jest kruchy i słaby: cios barbarzyńcy (12) go zabija, gryzie słabiej niż Rusher', () => {
    const grub = enemyDefinitionFor(ENEMY_DEFINITIONS[EnemyType.Rusher], attack.minion, ENEMY_VARIANTS);
    expect(grub.maxHp).toBeLessThanOrEqual(12);
    expect(grub.attack.damage).toBeLessThan(ENEMY_DEFINITIONS[EnemyType.Rusher].attack.damage);
    expect(grub.moveSpeed).toBeGreaterThan(ENEMY_DEFINITIONS[EnemyType.Rusher].moveSpeed);
  });

  it('gniazdo ucieka wolniej, niż chodzi Rusher — da się je dopaść', () => {
    expect(nester.moveSpeed).toBeLessThan(ENEMY_DEFINITIONS[EnemyType.Rusher].moveSpeed / 2);
  });
});

describe('broodCapacity', () => {
  it('wylęg ograniczają: liczba na raz, limit żywych i zapas na całe życie', () => {
    const a = { ...attack, count: 2, maxAlive: 4, total: 10 };
    expect(broodCapacity(a, 0, 0)).toBe(2);
    expect(broodCapacity(a, 3, 3)).toBe(1);
    expect(broodCapacity(a, 4, 6)).toBe(0);
    expect(broodCapacity(a, 0, 9)).toBe(1);
    expect(broodCapacity(a, 0, 10)).toBe(0);
    expect(broodCapacity(a, 5, 12)).toBe(0);
  });
});

describe('broodSpawnPoints', () => {
  const origin = { x: 100, y: 100 };

  it('punkty leżą na łuku spawnDistance, wachlarzem w stronę celu', () => {
    const points = broodSpawnPoints(origin, { x: 300, y: 100 }, 3, { ...attack, spawnDistance: 20, spreadDeg: 90 });
    expect(points).toHaveLength(3);
    for (const p of points) {
      expect(distance(origin, p)).toBeCloseTo(20);
      expect(p.x).toBeGreaterThan(origin.x);
    }
    expect(points[1]!.y).toBeCloseTo(100);
    expect(points[0]!.y).toBeLessThan(100);
    expect(points[2]!.y).toBeGreaterThan(100);
  });

  it('jeden czerw — prosto w stronę celu; zero — pusto; cel w gnieździe — na południe', () => {
    expect(broodSpawnPoints(origin, { x: 100, y: 0 }, 1, { ...attack, spawnDistance: 10 })[0]).toEqual({ x: 100, y: 90 });
    expect(broodSpawnPoints(origin, { x: 0, y: 0 }, 0, attack)).toEqual([]);
    const south = broodSpawnPoints(origin, origin, 1, { ...attack, spawnDistance: 10 })[0]!;
    expect(south.x).toBeCloseTo(100);
    expect(south.y).toBeCloseTo(110);
  });
});

describe('BroodLedger', () => {
  it('liczy żywe i wyplute; śmierć czerwia zwalnia limit, ale nie zapas', () => {
    const ledger = new BroodLedger<object, object>();
    const nest = {};
    const [a, b] = [{}, {}];
    ledger.add(nest, a);
    ledger.add(nest, b);
    expect(ledger.aliveOf(nest)).toBe(2);
    expect(ledger.spawnedBy(nest)).toBe(2);
    ledger.remove(a);
    expect(ledger.aliveOf(nest)).toBe(1);
    expect(ledger.spawnedBy(nest)).toBe(2);
    expect(ledger.isMinion(a)).toBe(false);
    expect(ledger.isMinion(b)).toBe(true);
    expect(ledger.isMinion(nest)).toBe(false);
  });

  it('śmierć gniazda zwraca jego żywe czerwie; zostają czerwiami (bez łupu) do własnej śmierci', () => {
    const ledger = new BroodLedger<object, object>();
    const [nest, other] = [{}, {}];
    const [a, b, c] = [{}, {}, {}];
    ledger.add(nest, a);
    ledger.add(nest, b);
    ledger.add(other, c);
    ledger.remove(a);
    expect(ledger.release(nest)).toEqual([b]);
    expect(ledger.isMinion(b)).toBe(true);
    ledger.remove(b);
    expect(ledger.isMinion(b)).toBe(false);
    expect(ledger.aliveOf(nest)).toBe(0);
    expect(ledger.spawnedBy(nest)).toBe(0);
    expect(ledger.release(other)).toEqual([c]);
    expect(ledger.release({})).toEqual([]);
  });
});
